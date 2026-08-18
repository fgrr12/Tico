import { readFileSync } from 'node:fs'

import {
	companionCopy,
	danceStyle,
	DAY_MILESTONES,
	documentIn,
	energyAt,
	familiarityFrom,
	feelingFrom,
	matchApp,
	PALETTE,
	STREAK_MILESTONES,
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

/**
 * Each behaviour with the two fields the peek pool filters on. Sliced between
 * one entry and the next rather than matched against a closing brace, because
 * half of them are written on one line and half over ten.
 */
const entries = [...table.matchAll(/^\t\t\t(\w+): \{/gm)]
const moments = entries.map((match, index) => {
	const body = table.slice(match.index, entries[index + 1]?.index ?? table.length)
	return {
		name: match[1],
		min: Number((body.match(/min: ([\d.]+)/) ?? [])[1] ?? 0),
		travels: body.includes('travels: true'),
	}
})
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

check('he still has something to do from the corner of a call', () => {
	// The peek pool is what is left after two filters, and both have grown: the
	// energy floor, and now `travels`. Empty it and he stands in the corner
	// perfectly still for the length of a meeting, which no type or lint notices
	// because an empty pool is a valid array — `pick` just hands back undefined.
	const pool = moments.filter((moment) => moment.min <= 0.35 && !moment.travels)
	assert(pool.length >= 6, `only ${pool.length} things to do while peeking`)

	// And the crossing has to stay possible at either end of it.
	assert(
		companion.includes('minX: -overshoot'),
		'the overshoot is no longer symmetric, so he cannot peek from the left edge'
	)
	return `${pool.length} calm, stationary moments`
})

check('every dance has choreography, and every style has a dance', () => {
	// `DANCES` sits outside the behaviour table, so the animation check below has
	// never seen it — and a dance whose name has no CSS is a pet that "dances"
	// while standing perfectly still, which no type, lint or log would mention.
	const dances = companion.slice(
		companion.indexOf('const DANCES'),
		companion.indexOf('const pick')
	)
	const moves = [...new Set([...dances.matchAll(/\['(\w+)',/g)].map((m) => m[1]))]

	for (const move of moves) {
		assert(css.includes(`data-anim="${move}"`), `no CSS for the ${move} dance`)
	}

	/*
	 * And the other direction. Rather than parsing the style list out of the
	 * source, exercise the function: every style `danceStyle` can actually return
	 * has to be a key of `DANCES`, or `pick` is handed undefined and he throws
	 * mid-song. All three tiers are covered — tempo, genre, and the hash that
	 * every Spotify listener lands on.
	 */
	const produced = new Set()
	for (const bpm of [50, 95, 130, 200]) produced.add(danceStyle('a', 'b', '', bpm))
	for (const genre of ['Metal', 'Punk', 'Hip-Hop/Rap', 'Classical', 'Pop', 'Rock', 'Jazz']) {
		produced.add(danceStyle('a', 'b', genre, 0))
	}
	for (let i = 0; i < 300; i++) produced.add(danceStyle(`artist ${i}`, `song ${i}`))

	for (const style of produced) {
		assert(new RegExp(`\\b${style}: \\[`).test(dances), `DANCES has nothing for ${style}`)
	}

	// The hash has to actually spread. One that returned the same bucket for
	// every track would pass everything above and be a fixed dance in disguise.
	const spread = new Set()
	for (let i = 0; i < 300; i++) spread.add(danceStyle(`artist ${i}`, `song ${i}`))
	assert(spread.size >= 4, `the hash only ever produces ${spread.size} styles`)

	// And it has to be stable, which is the entire claim it makes.
	assert(
		danceStyle('Boards of Canada', 'Roygbiv') === danceStyle('Boards of Canada', 'Roygbiv'),
		'the same track got two different dances'
	)

	return `${moves.length} moves, ${produced.size} styles reachable`
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

check('every custom property used is defined somewhere', () => {
	const sources = [css, companion, readFileSync(new URL('../src/companion/CompanionFace.tsx', import.meta.url), 'utf8')]

	// `var(--x, fallback)` is fine undefined — the fallback is the point.
	const used = new Set(
		sources.flatMap((source) => [...source.matchAll(/var\(\s*(--[\w-]+)\s*\)/g)].map((m) => m[1]))
	)
	const defined = new Set([...css.matchAll(/^\s*(--[\w-]+)\s*:/gm)].map((m) => m[1]))

	const missing = [...used].filter((name) => !defined.has(name))
	// An undefined paint variable is not an error anywhere — SVG quietly falls
	// back to black, which is how the crown shipped black.
	assert(missing.length === 0, `used but never defined: ${missing.join(', ')}`)

	return `${used.size} used, all defined`
})

// ── things he wears ─────────────────────────────────────────────────────────

check('every prop is drawn, written and on the sheet', () => {
	const face = readFileSync(new URL('../src/companion/CompanionFace.tsx', import.meta.url), 'utf8')
	const sheet = readFileSync(new URL('./sheet.tsx', import.meta.url), 'utf8')

	const list = (source, after) => {
		const start = source.indexOf(after)
		const open = source.indexOf('[', start)
		return [...source.slice(open, source.indexOf(']', open)).matchAll(/'(\w+)'/g)].map((m) => m[1])
	}

	// `headphones` is picked by hand in `wearSomething` rather than from the
	// list, because it is the one prop with a reason. The souvenirs are their own
	// list for the same kind of reason — they only arrive back from a crossing,
	// and putting them in `PROPS` would have them turning up unearned. All of
	// them still have to be drawn, and still have to have lines.
	const worn = [
		...list(companion, 'const PROPS'),
		...list(companion, 'const SOUVENIRS'),
		'headphones',
	]
	const drawn = [...face.matchAll(/^\t\tcase '(\w+)':/gm)].map((m) => m[1])
	const onSheet = list(sheet, 'const PROPS')

	for (const kind of worn) {
		// A prop with no `case` renders nothing at all: he "puts on" an invisible
		// thing, says a line about it, and takes it off. Silent in every log.
		assert(drawn.includes(kind), `${kind} is worn but never drawn`)
		assert(onSheet.includes(kind), `${kind} is missing from the sheet, so nobody has looked at it`)
		for (const language of ['en', 'es']) {
			assert(companionCopy[language].props[kind]?.length > 0, `${language} has no line for ${kind}`)
			// `adjust` is offered whenever anything is on, so a prop with no fuss
			// line makes him straighten it in silence — the animation without the
			// half that carries it.
			assert(
				companionCopy[language].propFuss[kind]?.length > 0,
				`${language} has no fuss line for ${kind}`
			)
		}
	}

	const unworn = drawn.filter((kind) => !worn.includes(kind))
	assert(unworn.length === 0, `drawn but never worn: ${unworn.join(', ')}`)

	return `${worn.length} props`
})

check('every familiarity tier is reachable and has lines', () => {
	// A tier with no lines is a pet that goes quiet for a month once it knows you
	// well enough, which is the exact opposite of the point.
	const tiers = ['new', 'knowing', 'familiar', 'old']
	const reached = new Set([0, 1, 3, 4, 13, 14, 59, 60, 400].map(familiarityFrom))

	for (const tier of tiers) {
		assert(reached.has(tier), `no number of days produces '${tier}'`)
		for (const language of ['en', 'es']) {
			const lines = companionCopy[language].memory.tier[tier]
			assert(Array.isArray(lines) && lines.length >= 3, `${language}.${tier} has ${lines?.length}`)
		}
	}

	// The greeting ladder falls through to `copy.boot` only when none of these
	// apply, so an empty one is a launch that silently says nothing new.
	for (const language of ['en', 'es']) {
		for (const kind of ['hello', 'back', 'milestone', 'streak', 'favourite']) {
			const lines = companionCopy[language].memory[kind]
			assert(Array.isArray(lines) && lines.length > 0, `${language}.memory.${kind} is empty`)
		}
	}

	return `${tiers.length} tiers, ${DAY_MILESTONES.length + STREAK_MILESTONES.length} milestones`
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
