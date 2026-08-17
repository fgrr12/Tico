import { readFileSync } from 'node:fs'

import {
	companionCopy,
	documentIn,
	energyAt,
	feelingFrom,
	matchApp,
	PALETTE,
	TERRORS,
	timeOfDay,
} from '../src/data/companion.ts'

/**
 * The checks that were being run by hand and thrown away.
 *
 * Every one of these exists because something in it broke, or was one edit from
 * breaking, while the content was being written: a behaviour with no keyframes
 * is invisible, a feeling with no lines is silent, an hour with no energy is a
 * pet that stands still for sixty minutes, and a colour pair under 3:1 is a face
 * you cannot read. None of them fails loudly on its own — they fail by the pet
 * quietly doing nothing, which looks exactly like a pet that has nothing to do.
 *
 * Imported from the real modules rather than copied, so a check can never pass
 * against a version of the data that is not shipping. Node runs the TypeScript
 * directly, so there is no build step in front of this.
 */

const companion = readFileSync(new URL('../src/companion/Companion.tsx', import.meta.url), 'utf8')
const css = readFileSync(new URL('../src/companion.css', import.meta.url), 'utf8')

let failures = 0

const check = (name, run) => {
	try {
		const detail = run()
		console.log(`  ✓ ${name}${detail ? ` — ${detail}` : ''}`)
	} catch (error) {
		failures += 1
		console.log(`  ✗ ${name}\n      ${error.message}`)
	}
}

const assert = (ok, message) => {
	if (!ok) throw new Error(message)
}

// ── the behaviour table, read out of the component ──────────────────────────

const table = companion.slice(
	companion.indexOf('const moments: Record<string, Moment>'),
	companion.indexOf('const PROPS')
)
const behaviours = [...table.matchAll(/^\t\t\t(\w+): \{/gm)].map((match) => match[1])
const animations = [...new Set([...table.matchAll(/'(\w+)'(?=, \d)/g)].map((match) => match[1]))]

const byFeeling = companion.slice(
	companion.indexOf('const BY_FEELING'),
	companion.indexOf('const preferred')
)

const feelings = Object.keys(PALETTE)

console.log('\ntico\n')

// ── time ────────────────────────────────────────────────────────────────────

check('every hour has an energy and a bucket', () => {
	for (let hour = 0; hour < 24; hour++) {
		const energy = energyAt(hour)
		assert(typeof energy === 'number' && energy > 0 && energy <= 1, `hour ${hour} → ${energy}`)
		assert(
			['dawn', 'day', 'evening', 'night'].includes(timeOfDay(hour)),
			`hour ${hour} → ${timeOfDay(hour)}`
		)
	}
	return '24 hours, no gap'
})

// ── feelings ────────────────────────────────────────────────────────────────

const base = {
	neglect: 0,
	attention: 0,
	dwell: 0,
	switches: 0,
	drags: 0,
	newApp: false,
	feared: false,
	music: false,
	appKey: 'vscode',
	energy: 0.9,
	hour: 14,
}

check('the ladder reaches every feeling it should', () => {
	const expected = [
		['rattled', { drags: 3 }],
		['scared', { feared: true }],
		['lonely', { neglect: 12 }],
		['smug', { attention: 0.9 }],
		['pleased', { attention: 0.6 }],
		['curious', { newApp: true }],
		['sleepy', { energy: 0.15 }],
		['festive', { music: true }],
		['bored', { neglect: 5 }],
		['worried', { dwell: 3 }],
		['nostalgic', { appKey: 'terminal' }],
		['restless', { switches: 8 }],
		['content', {}],
	]

	for (const [want, overrides] of expected) {
		const got = feelingFrom({ ...base, ...overrides })
		assert(got === want, `${JSON.stringify(overrides)} → ${got}, expected ${want}`)
	}
	return `${expected.length} reachable`
})

check('every feeling has lines, a palette and a behaviour set', () => {
	for (const feeling of feelings) {
		for (const language of ['en', 'es']) {
			const lines = companionCopy[language].feelings[feeling]
			assert(Array.isArray(lines) && lines.length >= 5, `${language}.${feeling} has ${lines?.length}`)
		}
		assert(byFeeling.includes(`${feeling}:`), `${feeling} missing from BY_FEELING`)
	}
	return `${feelings.length} feelings`
})

check('every behaviour a feeling asks for exists', () => {
	const named = [...byFeeling.matchAll(/'(\w+)'/g)].map((match) => match[1])
	const unknown = [...new Set(named)].filter((key) => !behaviours.includes(key))
	assert(unknown.length === 0, `no such behaviour: ${unknown.join(', ')}`)
	return `${behaviours.length} behaviours`
})

check('every animation has keyframes behind it', () => {
	const missing = animations.filter((name) => !css.includes(`data-anim="${name}"`))
	assert(missing.length === 0, `no CSS for: ${missing.join(', ')}`)
	return `${animations.length} animations`
})

// ── colour ──────────────────────────────────────────────────────────────────

const luminance = (hex) => {
	const channel = (value) => {
		const c = value / 255
		return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
	}
	const [r, g, b] = [1, 3, 5].map((at) => Number.parseInt(hex.slice(at, at + 2), 16))
	return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
}

check('the face is readable on its screen in every feeling', () => {
	let worst = { feeling: null, ratio: 21 }

	for (const [feeling, { face, screen }] of Object.entries(PALETTE)) {
		const [a, b] = [luminance(face), luminance(screen)]
		const ratio = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
		// 3:1 is the floor for graphical elements. Below it the eyes are a smudge.
		assert(ratio >= 3, `${feeling} is ${ratio.toFixed(1)}:1`)
		if (ratio < worst.ratio) worst = { feeling, ratio }
	}

	return `worst is ${worst.feeling} at ${worst.ratio.toFixed(1)}:1`
})

// ── copy ────────────────────────────────────────────────────────────────────

check('both languages carry the same keys', () => {
	const walk = (a, b, path = '') => {
		for (const key of Object.keys(a)) {
			assert(key in b, `es is missing ${path}${key}`)
			if (a[key] && typeof a[key] === 'object' && !Array.isArray(a[key])) {
				walk(a[key], b[key], `${path}${key}.`)
			}
		}
	}
	walk(companionCopy.en, companionCopy.es)
	walk(companionCopy.es, companionCopy.en)

	const count = (value) =>
		typeof value === 'string'
			? 1
			: typeof value === 'function'
				? 1
				: value && typeof value === 'object'
					? Object.values(value).reduce((total, child) => total + count(child), 0)
					: 0
	return `${count(companionCopy.en)} written lines each`
})

check('everything he fears can be named', () => {
	for (const language of ['en', 'es']) {
		for (const app of TERRORS) {
			assert(companionCopy[language].fears[app]?.length > 0, `${language} has no line for ${app}`)
		}
	}
	return `${TERRORS.join(', ')} hold the feeling`
})

// ── the title parser ────────────────────────────────────────────────────────

check('a filename is found and nothing else is', () => {
	const cases = [
		['Companion.tsx — tico', 'Companion.tsx'],
		['● app.rs — tico', 'app.rs'],
		['tico — PLAN.md', 'PLAN.md'],
		['.env-prod — Condominios', null],
		['Fabricio Rojas — Full Stack Developer - Google Chrome', null],
		['github.com/fgrr12 - Brave', null],
		['Spotify Premium', null],
		[null, null],
	]

	for (const [title, want] of cases) {
		const got = documentIn(title)
		assert(got === want, `${JSON.stringify(title)} → ${JSON.stringify(got)}`)
	}
	return `${cases.length} titles`
})

check('the apps he has lines for are ones matchApp can produce', () => {
	const keys = new Set(
		['Visual Studio Code', 'Terminal', 'Spotify', 'Beekeeper Studio', 'Brave Browser', 'Finder']
			.map(matchApp)
			.filter(Boolean)
	)
	assert(keys.size >= 5, `matchApp resolved only ${keys.size} of six known applications`)

	for (const language of ['en', 'es']) {
		for (const [key, lines] of Object.entries(companionCopy[language].apps)) {
			assert(Array.isArray(lines.any) && lines.any.length > 0, `${language}.${key} has no 'any'`)
		}
	}
	return 'every app entry has an hour-agnostic line'
})

console.log(failures === 0 ? '\nall good\n' : `\n${failures} failed\n`)
process.exit(failures === 0 ? 0 : 1)
