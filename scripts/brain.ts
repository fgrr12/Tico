/**
 * Experiment apparatus: the same moments through each model, with cost.
 *
 *   ANTHROPIC_API_KEY=… npx -y tsx scripts/brain.ts          # five fixed moments
 *   ANTHROPIC_API_KEY=… npx -y tsx scripts/brain.ts --look   # plus your screen now
 *
 * Uses the real prompt from src/brain/prompt.ts, so what is judged here is what
 * he would say. `--look` needs Screen Recording for the terminal running it.
 */
import { execFileSync } from 'node:child_process'
import { readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import Anthropic from '@anthropic-ai/sdk'

import { companionCopy } from '../src/data/companion'
import { describe, type Moment, PRICES, SCHEMA, SYSTEM } from '../src/brain/prompt'

const MODELS = ['claude-haiku-5-5', 'claude-sonnet-5-5']

const base: Omit<Moment, 'hour' | 'energy' | 'feeling' | 'app' | 'dwellMinutes'> = {
	language: 'es',
	title: null,
	music: null,
	typing: false,
	daysKnown: 34,
	wearing: [],
	recent: [],
}

const MOMENTS: [string, Moment][] = [
	[
		'VS Code, 47 min, tecleando, 15h',
		{
			...base,
			hour: 15,
			energy: 0.55,
			feeling: 'bored',
			app: 'Code',
			title: 'Companion.tsx — tico',
			dwellMinutes: 47,
			typing: true,
		},
	],
	[
		'Spotify sonando a las 23h',
		{
			...base,
			hour: 23,
			energy: 0.2,
			feeling: 'sleepy',
			app: 'Spotify',
			dwellMinutes: 3,
			music: 'Bad Bunny — DtMF',
		},
	],
	[
		'Teams a las 10am',
		{ ...base, hour: 10, energy: 0.85, feeling: 'scared', app: 'Microsoft Teams', dwellMinutes: 0 },
	],
	[
		'Numbers 2 h seguidas, 16h, con sombrero',
		{
			...base,
			hour: 16,
			energy: 0.5,
			feeling: 'worried',
			app: 'Numbers',
			title: 'presupuesto-octubre.numbers',
			dwellMinutes: 124,
			wearing: ['party-hat'],
		},
	],
	[
		'English, Safari, 9am, recién llegó',
		{
			...base,
			language: 'en',
			hour: 9,
			energy: 0.7,
			feeling: 'curious',
			app: 'Safari',
			dwellMinutes: 0,
			daysKnown: 2,
		},
	],
]

function screenshot(): string | null {
	const path = join(tmpdir(), 'tico-brain-check.jpg')
	try {
		execFileSync('/usr/sbin/screencapture', ['-x', '-m', '-t', 'jpg', path])
		execFileSync('/usr/bin/sips', ['-Z', '1280', '-s', 'formatOptions', '60', path], {
			stdio: 'ignore',
		})
		return readFileSync(path).toString('base64')
	} catch {
		return null
	} finally {
		rmSync(path, { force: true })
	}
}

// Tuteo where he speaks voseo, and lines copied straight from the examples.
const TUTEO = /\b(tienes|puedes|debes|quieres|sabes|eres|estás seguro|mira|oye)\b/i
const written = new Set(Object.values(companionCopy.es).flat().filter((l) => typeof l === 'string'))

const client = new Anthropic()
const totals: Record<string, { usd: number; ms: number; n: number }> = {}

const runs: [string, Moment, string | null][] = MOMENTS.map(([name, m]) => [name, m, null])
if (process.argv.includes('--look')) {
	const image = screenshot()
	if (image) runs.push(['Tu pantalla ahora (VS Code asumido)', { ...MOMENTS[0][1], typing: false }, image])
	else console.log('(no screenshot: give the terminal Screen Recording)')
}

for (const [name, moment, image] of runs) {
	console.log(`\n=============== ${name}`)
	for (const model of MODELS) {
		const started = Date.now()
		const r = await client.messages.create({
			model,
			max_tokens: 2048,
			system: [{ type: 'text', text: SYSTEM(moment.language), cache_control: { type: 'ephemeral' } }],
			output_config: { effort: 'low', format: { type: 'json_schema', schema: SCHEMA } },
			messages: [
				{
					role: 'user',
					content: [
						...(image
							? [{ type: 'image' as const, source: { type: 'base64' as const, media_type: 'image/jpeg' as const, data: image } }]
							: []),
						{ type: 'text' as const, text: describe(moment, image !== null) },
					],
				},
			],
		})
		const ms = Date.now() - started
		const [i, o] = PRICES[model]
		const u = r.usage
		const usd =
			(u.input_tokens * i +
				(u.cache_creation_input_tokens ?? 0) * i * 1.25 +
				(u.cache_read_input_tokens ?? 0) * i * 0.1 +
				u.output_tokens * o) /
			1_000_000
		const t = (totals[model] ??= { usd: 0, ms: 0, n: 0 })
		t.usd += usd
		t.ms += ms
		t.n += 1

		const block = r.content.find((b) => b.type === 'text')
		const lines: { text: string; mood: string }[] =
			block?.type === 'text' ? JSON.parse(block.text).lines : []
		console.log(
			`\n--- ${model}  ${(ms / 1000).toFixed(1)} s  $${usd.toFixed(5)}  cache read ${u.cache_read_input_tokens ?? 0}`
		)
		for (const l of lines) {
			const flags = [
				l.text.length > 90 && `largo ${l.text.length}`,
				TUTEO.test(l.text) && 'TUTEO',
				written.has(l.text) && 'COPIADA',
			].filter(Boolean)
			console.log(`  [${l.mood}] ${l.text}${flags.length ? `   ⚠ ${flags.join(', ')}` : ''}`)
		}
	}
}

console.log('\n=============== por lote')
for (const [model, t] of Object.entries(totals)) {
	// ~10 batches an hour, 8 hours a day.
	console.log(
		`${model.padEnd(18)} ${(t.ms / t.n / 1000).toFixed(1)} s   $${(t.usd / t.n).toFixed(5)}   ~$${((t.usd / t.n) * 80 * 30).toFixed(2)}/mes`
	)
}
