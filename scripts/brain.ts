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
import {
	type Action,
	ACTIONS,
	describe,
	keepsNoNames,
	type Moment,
	PRICES,
	SCHEMA,
	SYSTEM,
	type Thread,
} from '../src/brain/prompt'

// Haiku is the choice; Sonnet stays as the bar it is measured against.
const MODELS = ['claude-haiku-5-5', 'claude-sonnet-5-5']

// The low-energy set is what is left at 11pm; the rest need a day behind them.
const ALL = Object.keys(ACTIONS) as Action[]
const TIRED: Action[] = ['sit', 'slump', 'yawn', 'stare', 'cower', 'shake', 'house', 'wear']

const base: Omit<Moment, 'hour' | 'energy' | 'feeling' | 'app' | 'dwellMinutes'> = {
	canDo: ALL,
	changed: null,
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
			canDo: TIRED,
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
// A line that announces a move and then does not make it: the thing `then` fixes.
const ANNOUNCES = /\b(voy a|me voy|ya vuelvo|me escondo|me pongo|me meto|I'm going to|I'll go|be right back)\b/i
const TUTEO = /\b(tienes|puedes|debes|quieres|sabes|eres|estás seguro|mira|oye)\b/i
const written = new Set(Object.values(companionCopy.es).flat().filter((l) => typeof l === 'string'))

const client = new Anthropic()
const totals: Record<string, { usd: number; ms: number; n: number }> = {}

const blank: Thread = { notes: '', opinions: [], yesterday: null, firstOfDay: false, goal: null }
const runs: [string, Moment, Thread, string | null][] = MOMENTS.map(([name, m]) => [name, m, blank, null])

// The thread: a morning that has to open with a dream, and an afternoon that
// can call back to the morning.
const opinions = ['las hojas de cálculo me ponen nervioso', 'me gusta cuando la música tiene mucho bajo']
runs.push(
	[
		'Primer lote del día, 8am, con un ayer',
		{ ...MOMENTS[0][1], hour: 8, energy: 0.6, feeling: 'content', dwellMinutes: 2, typing: false },
		{
			notes: '',
			opinions,
			yesterday: 'Un día largo de mucho mirar; me asusté en la mañana y bailé en la noche.',
			firstOfDay: true,
			goal: null,
		},
		null,
	],
	[
		'Tarde con notas de la mañana, Numbers',
		MOMENTS[3][1],
		{
			notes:
				'En la mañana apareció Teams y me escondí en la madriguera. Después mucho Code, Companion.tsx toda la mañana. Almorzamos con Bad Bunny.',
			opinions,
			yesterday: null,
			firstOfDay: false,
			goal: { kind: 'explore', text: 'Hoy quiero ver qué hay pasando el borde.', progress: 2 },
		},
		null,
	],
	[
		'Objetivo cumplido, 17h',
		{ ...MOMENTS[0][1], hour: 17, energy: 0.45, feeling: 'pleased', typing: false },
		{
			...blank,
			notes: 'Hoy me puse cuatro sombreros distintos. El de pirata fue el mejor.',
			goal: { kind: 'wardrobe', text: 'Hoy encuentro un sombrero nuevo. Lo siento en las antenas.', progress: 4 },
		},
		null,
	]
)

// Events: the batch should open with the reaction to what changed.
runs.push(
	[
		'Volvió después de 25 min, 11am',
		{ ...MOMENTS[0][1], hour: 11, energy: 0.8, feeling: 'lonely', typing: false, changed: 'the user just came back after 25 minutes away' },
		blank,
		null,
	],
	[
		'Canción nueva mientras programa',
		{ ...MOMENTS[0][1], music: 'Soda Stereo — De música ligera', changed: 'a new song started: Soda Stereo — De música ligera' },
		blank,
		null,
	]
)

if (process.argv.includes('--look')) {
	const image = screenshot()
	if (image) runs.push(['Tu pantalla ahora (VS Code asumido)', { ...MOMENTS[0][1], typing: false }, blank, image])
	else console.log('(no screenshot: give the terminal Screen Recording)')
}

for (const [name, moment, thread, image] of runs) {
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
						{ type: 'text' as const, text: describe(moment, thread, image !== null) },
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
		const answer = block?.type === 'text' ? JSON.parse(block.text) : { lines: [] }
		const lines: { text: string; mood: string; then: string }[] = answer.lines
		console.log(
			`\n--- ${model}  ${(ms / 1000).toFixed(1)} s  $${usd.toFixed(5)}  cache read ${u.cache_read_input_tokens ?? 0}`
		)
		for (const l of lines) {
			const flags = [
				l.text.length > 90 && `largo ${l.text.length}`,
				TUTEO.test(l.text) && 'TUTEO',
				written.has(l.text) && 'COPIADA',
				ANNOUNCES.test(l.text) && l.then === 'none' && 'ANUNCIA SIN HACER',
				l.then !== 'none' && !moment.canDo.includes(l.then as Action) && 'ACCIÓN NO PERMITIDA',
			].filter(Boolean)
			const then = l.then === 'none' ? '' : `  → ${l.then}`
			console.log(`  [${l.mood}] ${l.text}${then}${flags.length ? `   ⚠ ${flags.join(', ')}` : ''}`)
		}

		// What would be kept, and whether the guard would have let it through.
		const seen = [
			moment.app ?? '',
			...(moment.title?.split(/\s[—–-]\s/) ?? []),
			...(moment.music?.split(' — ') ?? []),
			'Teams',
			'Code',
			'Bad Bunny',
		]
		const guard = (text: string) => (keepsNoNames(text, seen) ? '' : '   ⚠ NOMBRE, NO SE GUARDA')
		console.log(`  notas: ${answer.notes}`)
		console.log(`  diario: ${answer.diary}${guard(answer.diary ?? '')}`)
		for (const o of answer.opinions ?? []) console.log(`  opinión nueva: ${o}${guard(o)}`)
		if (answer.goal?.kind && answer.goal.kind !== 'none') {
			const late = thread.goal ? '   ⚠ YA TENÍA UNO, SE IGNORA' : ''
			console.log(`  objetivo: [${answer.goal.kind}] ${answer.goal.text}${guard(answer.goal.text)}${late}`)
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
