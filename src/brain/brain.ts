import Anthropic from '@anthropic-ai/sdk'
import { invoke } from '@tauri-apps/api/core'

import {
	type BrainLine,
	describe,
	EFFECTS,
	type Moment,
	MOODS,
	PRICES,
	SCHEMA,
	SYSTEM,
} from './prompt'

export type { BrainLine, Moment } from './prompt'

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
const today = () => new Date().toISOString().slice(0, 10)
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
		(EFFECTS as readonly string[]).includes(line.effect)
	)
}

/** A fresh batch of lines for this moment, or null and he stays hand-written. */
export async function think(moment: Moment, look: boolean): Promise<BrainLine[] | null> {
	if (!(await connect()) || !client) return null
	if (spentToday() >= DAILY_BUDGET_USD) {
		console.log(`[brain] budget for ${today()} used up`)
		return null
	}

	try {
		const shot = look ? new Uint8Array(await invoke<ArrayBuffer>('glance')) : null
		const image = shot && shot.length > 0 ? base64(shot) : null
		const started = performance.now()

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
						{ type: 'text' as const, text: describe(moment, image !== null) },
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
		const lines = (JSON.parse(text.text).lines as unknown[]).filter(valid)

		console.log(
			`[brain] ${lines.length} lines · ${Math.round(performance.now() - started)} ms · $${usd.toFixed(5)} · today $${spentToday().toFixed(4)}${image ? ' · looked' : ''}`,
			lines.map((l) => l.text)
		)
		return lines.length > 0 ? lines : null
	} catch (error) {
		console.warn('[brain] failed, staying hand-written', error)
		return null
	}
}
