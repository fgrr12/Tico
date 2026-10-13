import Anthropic from '@anthropic-ai/sdk'
import { invoke } from '@tauri-apps/api/core'

import {
	type Action,
	ACTIONS,
	ANSWER_SCHEMA,
	ANSWER_SYSTEM,
	type BrainLine,
	describe,
	describeQuestion,
	EFFECTS,
	type Goal,
	GOAL_STEPS,
	GOALS,
	type GoalKind,
	type Moment,
	keepsNoNames,
	MOODS,
	PRICES,
	SCHEMA,
	SYSTEM,
	type Thread,
} from './prompt'

export type { Action, BrainLine, Moment } from './prompt'

/**
 * Experiment: Claude writes his next few lines ahead of time.
 *
 * Every earlier attempt in PLAN.md failed on one of two things — the Spanish
 * register, or a line arriving late against one written by hand. The register
 * is a model problem and this is a much bigger model. Lateness is an
 * architecture problem: nothing here is asked for at the moment he speaks. A
 * pool is filled in the background and the chatter draws from it, so a slow or
 * failed call costs a stale line, never a frozen pet.
 *
 * No key, no budget left or any error: `think` returns null and he is the tico
 * on `main`, every line hand-written.
 */

/** A hard stop per calendar day. At Haiku prices it is ~400 refills. */
const DAILY_BUDGET_USD = 0.25

let client: Anthropic | null | undefined
let model = 'claude-haiku-5-5'

/** Resolved once: whether this run has a brain at all. */
export async function connect(): Promise<boolean> {
	if (client === undefined) {
		const config = await invoke<{ key: string | null; model: string | null }>(
			'brain_config'
		).catch(() => null)
		if (config?.model) model = config.model
		client = config?.key
			? new Anthropic({ apiKey: config.key, dangerouslyAllowBrowser: true, maxRetries: 0 })
			: null
		console.log(client ? `[brain] on · ${model}` : '[brain] off · no ANTHROPIC_API_KEY')
	}
	return client !== null
}

// Spend lives in localStorage: per-viewer, and losing it only resets the cap.
// The local date: toISOString is UTC, which turns the day over at 6pm in Costa Rica.
const today = () => new Date().toLocaleDateString('en-CA')
function spentToday(): number {
	try {
		const saved = JSON.parse(localStorage.getItem('brain-spend') ?? 'null')
		return saved?.day === today() ? Number(saved.usd) || 0 : 0
	} catch {
		return 0
	}
}
function spend(usd: number) {
	try {
		localStorage.setItem('brain-spend', JSON.stringify({ day: today(), usd: spentToday() + usd }))
	} catch {
		// A blocked store only means the cap forgets; the call already happened.
	}
}

/** What survives a restart. About him only — see `Thread` in prompt.ts. */
interface Kept {
	day: string
	diary: string
	yesterday: string | null
	opinions: string[]
	/** The day he last told you a dream, so a restart does not tell another. */
	dreamt: string
	/** Today's, and only today's: a new date clears it. */
	goal: Goal | null
	/** What you told him. Yours, so no names guard — and `forget` empties it. */
	told: string[]
}
const MAX_OPINIONS = 8
const MAX_TOLD = 12

/** Today in detail. Never written anywhere: it dies with the process. */
let notes = ''

function recall(): Kept {
	try {
		const kept = JSON.parse(localStorage.getItem('brain-memory') ?? 'null') as Kept | null
		if (kept && Array.isArray(kept.opinions)) {
			// A new date: the last diary becomes yesterday, and today starts blank.
			return kept.day === today()
				? kept
				: { ...kept, day: today(), diary: '', yesterday: kept.diary || kept.yesterday, goal: null }
		}
	} catch {
		// Unreadable is the same as never having met: he starts over.
	}
	return { day: today(), diary: '', yesterday: null, opinions: [], dreamt: '', goal: null, told: [] }
}

function keep(kept: Kept) {
	try {
		localStorage.setItem('brain-memory', JSON.stringify(kept))
	} catch {
		// Only costs him tomorrow's memory of today.
	}
}

/**
 * The screen as 160 grey values, for `screenChange`. Taken at 64px by Rust and
 * shrunk again here, so a minute of watching costs one tiny JPEG.
 */
export async function fingerprint(): Promise<Uint8Array | null> {
	try {
		const bytes = await invoke<ArrayBuffer>('glance', { width: 64 })
		if (bytes.byteLength === 0) return null
		const bitmap = await createImageBitmap(new Blob([bytes], { type: 'image/jpeg' }))
		const canvas = new OffscreenCanvas(16, 10)
		const context = canvas.getContext('2d')
		if (!context) return null
		context.drawImage(bitmap, 0, 0, 16, 10)
		const { data } = context.getImageData(0, 0, 16, 10)
		const grey = new Uint8Array(160)
		for (let i = 0; i < 160; i++) grey[i] = (data[i * 4] + data[i * 4 + 1] + data[i * 4 + 2]) / 3
		return grey
	} catch {
		return null
	}
}

/** The behaviours that would move today's goal on, or null when there is nothing to pursue. */
export function goalActions(): readonly Action[] | null {
	const goal = recall().goal
	return goal && goal.progress < GOAL_STEPS ? GOALS[goal.kind].actions : null
}

/** Counted by the code that ran the behaviour, so the model cannot claim progress. */
export function advanceGoal(action: Action) {
	const kept = recall()
	const goal = kept.goal
	if (!goal || goal.progress >= GOAL_STEPS) return
	if (!(GOALS[goal.kind].actions as readonly Action[]).includes(action)) return
	const progress = goal.progress + 1
	keep({ ...kept, goal: { ...goal, progress } })
	console.log(`[brain] goal ${goal.kind}: ${progress} of ${GOAL_STEPS}${progress >= GOAL_STEPS ? ' · done' : ''}`)
}

function base64(bytes: Uint8Array): string {
	let out = ''
	for (let i = 0; i < bytes.length; i += 0x8000) {
		out += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
	}
	return btoa(out)
}

const fits = (l: unknown, max: number): l is BrainLine => {
	const line = l as BrainLine
	return (
		typeof line?.text === 'string' &&
		line.text.trim().length > 0 &&
		line.text.length <= max &&
		(MOODS as readonly string[]).includes(line.mood) &&
		(EFFECTS as readonly string[]).includes(line.effect) &&
		(line.then === 'none' || line.then in ACTIONS)
	)
}
// The prompt asks for 90; past 110 the bubble wraps into a paragraph. A reply
// asks for 160 and gets the same slack: it was asked for, so it may run longer.
const valid = (l: unknown): l is BrainLine => fits(l, 110)
const validReply = (l: unknown): l is BrainLine => fits(l, 200)

/** One structured call, billed against the day. Null on a refusal or a cut-off answer. */
async function call(
	system: string,
	schema: Record<string, unknown>,
	text: string,
	image: string | null
): Promise<{ answer: Record<string, unknown>; usd: number; ms: number } | null> {
	if (!client) return null
	const started = performance.now()
	const response = await client.messages.create({
		model,
		max_tokens: 2048,
		// The persona and the examples are the same every call: read from cache.
		system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
		output_config: { effort: 'low', format: { type: 'json_schema', schema } },
		messages: [
			{
				role: 'user',
				content: [
					...(image
						? [
								{
									type: 'image' as const,
									source: { type: 'base64' as const, media_type: 'image/jpeg' as const, data: image },
								},
							]
						: []),
					{ type: 'text' as const, text },
				],
			},
		],
	})

	const [inPrice, outPrice] = PRICES[model] ?? [2, 10]
	const u = response.usage
	const usd =
		(u.input_tokens * inPrice +
			(u.cache_creation_input_tokens ?? 0) * inPrice * 1.25 +
			(u.cache_read_input_tokens ?? 0) * inPrice * 0.1 +
			u.output_tokens * outPrice) /
		1_000_000
	spend(usd)

	const block = response.content.find((b) => b.type === 'text')
	if (response.stop_reason !== 'end_turn' || !block || block.type !== 'text') return null
	return { answer: JSON.parse(block.text), usd, ms: Math.round(performance.now() - started) }
}

/**
 * A fresh batch of lines for this moment, or null and he stays hand-written.
 * `seen` is every app name this session has met: none of them may be kept.
 */
export async function think(
	moment: Moment,
	look: boolean,
	seen: readonly string[]
): Promise<BrainLine[] | null> {
	if (!(await connect()) || !client) return null
	if (spentToday() >= DAILY_BUDGET_USD) {
		console.log(`[brain] budget for ${today()} used up`)
		return null
	}

	try {
		const shot = look ? new Uint8Array(await invoke<ArrayBuffer>('glance', { width: 1280 })) : null
		const image = shot && shot.length > 0 ? base64(shot) : null
		const kept = recall()
		const thread: Thread = {
			notes,
			opinions: kept.opinions,
			yesterday: kept.yesterday,
			firstOfDay: kept.dreamt !== today(),
			goal: kept.goal ?? null,
			told: kept.told ?? [],
		}

		const result = await call(SYSTEM(moment.language), SCHEMA, describe(moment, thread, image !== null), image)
		if (!result) return null
		const { answer, usd } = result
		const lines = (answer.lines as unknown[]).filter(valid)

		// What may be kept is checked against everything he could have named.
		const forbidden = [
			...seen,
			moment.app ?? '',
			...(moment.title?.split(/\s[—–-]\s/) ?? []),
			...(moment.music?.split(' — ') ?? []),
		]
		if (typeof answer.notes === 'string') notes = answer.notes.slice(0, 600)
		const diary =
			typeof answer.diary === 'string' && keepsNoNames(answer.diary, forbidden)
				? answer.diary.slice(0, 200)
				: kept.diary
		const fresh = (Array.isArray(answer.opinions) ? answer.opinions : []).filter(
			(o: unknown): o is string =>
				typeof o === 'string' &&
				o.length <= 120 &&
				keepsNoNames(o, forbidden) &&
				!kept.opinions.includes(o)
		)
		// Only the first goal of the day sticks; later batches cannot swap it.
		const proposed = answer.goal as { kind: string; text: string } | undefined
		const goal =
			kept.goal ??
			(proposed &&
			proposed.kind in GOALS &&
			typeof proposed.text === 'string' &&
			proposed.text.length > 0 &&
			proposed.text.length <= 120 &&
			keepsNoNames(proposed.text, forbidden)
				? { kind: proposed.kind as GoalKind, text: proposed.text, progress: 0 }
				: null)

		keep({
			...kept,
			goal,
			diary,
			opinions: [...kept.opinions, ...fresh].slice(-MAX_OPINIONS),
			dreamt: lines.length > 0 ? today() : kept.dreamt,
		})

		console.log(
			`[brain] ${lines.length} lines · ${result.ms} ms · $${usd.toFixed(5)} · today $${spentToday().toFixed(4)}${image ? ' · looked' : ''}`,
			lines.map((l) => l.text),
			{ notes, diary, newOpinions: fresh, goal }
		)
		return lines.length > 0 ? lines : null
	} catch (error) {
		console.warn('[brain] failed, staying hand-written', error)
		return null
	}
}

export interface Answer {
	text: string
	mood: BrainLine['mood']
	effect: BrainLine['effect']
	then: BrainLine['then']
}

/**
 * Experiment: what he says back when you type to him, or null.
 *
 * Unlike a batch this one is waited for — you asked, so a second or two is
 * expected — but only by the bubble that says it, never by his body.
 */
export async function answer(question: string, moment: Moment, look: boolean): Promise<Answer | null> {
	if (!(await connect()) || spentToday() >= DAILY_BUDGET_USD) return null
	try {
		const shot = look ? new Uint8Array(await invoke<ArrayBuffer>('glance', { width: 1280 })) : null
		const image = shot && shot.length > 0 ? base64(shot) : null
		const kept = recall()
		const thread: Thread = {
			notes,
			opinions: kept.opinions,
			yesterday: kept.yesterday,
			firstOfDay: false,
			goal: kept.goal ?? null,
			told: kept.told ?? [],
		}

		const result = await call(
			ANSWER_SYSTEM(moment.language),
			ANSWER_SCHEMA,
			describeQuestion(moment, thread, question, image !== null),
			image
		)
		if (!result) return null
		const reply = result.answer as unknown as Answer & { remember: unknown; forget: unknown }
		const line = { ...reply, text: typeof reply.text === 'string' ? reply.text.trim() : '' }
		if (!validReply(line)) return null

		const remembered = (Array.isArray(reply.remember) ? reply.remember : []).filter(
			(r: unknown): r is string => typeof r === 'string' && r.length > 0 && r.length <= 160
		)
		const told = reply.forget === true ? [] : [...(kept.told ?? []), ...remembered].slice(-MAX_TOLD)
		keep({ ...kept, told })
		// Today's notes carry the exchange, so later batches can follow it up.
		notes = `${notes} Me preguntó: "${question.slice(0, 80)}". Le dije: "${line.text.slice(0, 80)}".`.slice(-600)

		console.log(
			`[brain] answer · ${result.ms} ms · $${result.usd.toFixed(5)} · today $${spentToday().toFixed(4)}${image ? ' · looked' : ''}`,
			line.text,
			{ remembered, forgot: reply.forget === true }
		)
		return { text: line.text, mood: line.mood, effect: line.effect, then: line.then }
	} catch (error) {
		console.warn('[brain] could not answer', error)
		return null
	}
}
