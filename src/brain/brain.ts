import Anthropic from '@anthropic-ai/sdk'
import { invoke } from '@tauri-apps/api/core'

import {
	ACTIONS,
	type BrainLine,
	describe,
	EFFECTS,
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
}
const MAX_OPINIONS = 8

/** Today in detail. Never written anywhere: it dies with the process. */
let notes = ''

function recall(): Kept {
	try {
		const kept = JSON.parse(localStorage.getItem('brain-memory') ?? 'null') as Kept | null
		if (kept && Array.isArray(kept.opinions)) {
			// A new date: the last diary becomes yesterday, and today starts blank.
			return kept.day === today()
				? kept
				: { ...kept, day: today(), diary: '', yesterday: kept.diary || kept.yesterday }
		}
	} catch {
		// Unreadable is the same as never having met: he starts over.
	}
	return { day: today(), diary: '', yesterday: null, opinions: [], dreamt: '' }
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

function base64(bytes: Uint8Array): string {
	let out = ''
	for (let i = 0; i < bytes.length; i += 0x8000) {
		out += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
	}
	return btoa(out)
}

const valid = (l: unknown): l is BrainLine => {
	const line = l as BrainLine
	return (
		typeof line?.text === 'string' &&
		line.text.trim().length > 0 &&
		// The prompt asks for 90; past 110 the bubble wraps into a paragraph.
		line.text.length <= 110 &&
		(MOODS as readonly string[]).includes(line.mood) &&
		(EFFECTS as readonly string[]).includes(line.effect) &&
		(line.then === 'none' || line.then in ACTIONS)
	)
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
		const started = performance.now()
		const kept = recall()
		const thread: Thread = {
			notes,
			opinions: kept.opinions,
			yesterday: kept.yesterday,
			firstOfDay: kept.dreamt !== today(),
		}

		const response = await client.messages.create({
			model,
			max_tokens: 2048,
			// The persona and the examples are the same every call: read from cache.
			system: [{ type: 'text', text: SYSTEM(moment.language), cache_control: { type: 'ephemeral' } }],
			output_config: { effort: 'low', format: { type: 'json_schema', schema: SCHEMA } },
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
						{ type: 'text' as const, text: describe(moment, thread, image !== null) },
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

		const text = response.content.find((b) => b.type === 'text')
		if (response.stop_reason !== 'end_turn' || !text || text.type !== 'text') return null
		const answer = JSON.parse(text.text)
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
		keep({
			...kept,
			diary,
			opinions: [...kept.opinions, ...fresh].slice(-MAX_OPINIONS),
			dreamt: lines.length > 0 ? today() : kept.dreamt,
		})

		console.log(
			`[brain] ${lines.length} lines · ${Math.round(performance.now() - started)} ms · $${usd.toFixed(5)} · today $${spentToday().toFixed(4)}${image ? ' · looked' : ''}`,
			lines.map((l) => l.text),
			{ notes, diary, newOpinions: fresh }
		)
		return lines.length > 0 ? lines : null
	} catch (error) {
		console.warn('[brain] failed, staying hand-written', error)
		return null
	}
}
