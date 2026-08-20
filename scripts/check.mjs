import { readFileSync } from 'node:fs'

import { BROUGHT_UP, FURNITURE, houseCopy, sceneAt, TIERS } from '../src/house/house.ts'
import { prefsCopy } from '../src/prefs/copy.ts'
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
	PROPS,
	SOUVENIRS,
	WEARS,
	WORN_ORDER,
	wornFrom,
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

/**
 * Sliced between two anchors in the source, and both are asserted rather than
 * trusted.
 *
 * `indexOf` returns -1 when an anchor moves, and `slice(start, -1)` is not an
 * error — it is the whole rest of the file, so every check below quietly starts
 * scanning code that is not the behaviour table. That happened the moment `wear`
 * was hoisted out of the poll, and the only symptom was the animation count
 * going up by one.
 */
const between = (from, to) => {
	const start = companion.indexOf(from)
	const end = companion.indexOf(to)
	if (start === -1 || end === -1 || end < start) {
		throw new Error(`Companion.tsx no longer has the anchor: ${start === -1 ? from : to}`)
	}
	return companion.slice(start, end)
}

const table = between('const moments: Record<string, Moment>', 'const wearSomething =')
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

const byFeeling = between('const BY_FEELING', 'const preferred')

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

check('every behaviour a feeling asks for exists, and every feeling wants one', () => {
	const named = new Set([...byFeeling.matchAll(/'(\w+)'/g)].map((match) => match[1]))

	const unknown = [...named].filter((key) => !behaviours.includes(key))
	assert(unknown.length === 0, `no such behaviour: ${unknown.join(', ')}`)

	/*
	 * And the other direction, which is the one that was quietly wrong.
	 *
	 * `content` is `null`, meaning anything — so a behaviour no feeling names is
	 * still reachable and nothing errors. It is reachable from *one* of thirteen
	 * feelings, which for `house` meant a lonely pet could never go home and a
	 * sleepy one could never go to bed: the two states the burrow exists for were
	 * the two it was unreachable from. `errand` shipped with the same hole.
	 *
	 * Not a style rule. Naming a behaviour in a list is how a feeling becomes
	 * visible, and one that appears in no list is one nobody decided about.
	 */
	const orphans = behaviours.filter((key) => !named.has(key))
	assert(orphans.length === 0, `no feeling ever asks for: ${orphans.join(', ')}`)

	return `${behaviours.length} behaviours, all spoken for`
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

check('anything that walks him somewhere is marked as travelling', () => {
	// `travels` is what withholds a behaviour while he is peeking from the corner
	// of a call, and forgetting it is invisible in every other situation: the
	// moment works perfectly, and then one day he marches into the middle of a
	// screen share. The energy floor does not cover it — `flee` costs 0.3 and
	// crosses the whole strip.
	const walkers = entries
		.map((match, index) => {
			const body = table.slice(match.index, entries[index + 1]?.index ?? table.length)
			return { name: match[1], moves: body.includes('moveTo('), travels: body.includes('travels: true') }
		})
		.filter((one) => one.moves && !one.travels)

	assert(walkers.length === 0, `moves him but is not travelling: ${walkers.map((o) => o.name).join(', ')}`)
	return `${moments.filter((one) => one.travels).length} travelling`
})

check('an interrupted behaviour is still picked back up', () => {
	// Two halves in two different places: `perform` parks the intention when
	// something gets in the way, and the poll decides later whether he still
	// cares. Delete either one and nothing errors — chains simply stop resuming,
	// which looks exactly like a pet that was never going to do the second half.
	assert(companion.includes('chain.current = { next'), 'nothing parks an interrupted behaviour')
	assert(companion.includes('if (chain.current)'), 'nothing ever picks one back up')

	// And the errand, whose interruption is the *absence* of its arrival rather
	// than an event: the target has to be re-clamped, or limits that moved while
	// he was walking leave him walking at somewhere he cannot stand, forever.
	assert(companion.includes('errand.current = target'), 'he no longer has anywhere to be')
	assert(
		companion.includes('clampPos(errand.current, 0).x'),
		'the errand target is trusted as stored, which is the forever-walk'
	)
	return 'parked, resumed, and re-clamped'
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

check('the house is deterministic and reaches every room', () => {
	// The whole design rests on the house having no clock: what he "did" is
	// derived when you look, not simulated behind the door. That is only honest
	// if looking twice shows the same thing — otherwise it is a random number
	// generator wearing a house.
	const at = 1_700_000_000_000
	const a = sceneAt(at, at + 300_000, null)
	const b = sceneAt(at, at + 300_000, null)
	assert(a.at === b.at && a.minutes === b.minutes, 'two looks at one moment disagreed')

	// And it has to move as he stays, or the room is a photograph.
	const later = new Set()
	for (let m = 0; m < 40; m++) later.add(sceneAt(at, at + m * 60_000, null).at)
	assert(later.size === FURNITURE.length, `only ${later.size} of ${FURNITURE.length} rooms reachable`)

	// The favourite bends the draw without winning it — the same rule as the
	// favourite hat. Always winning would be a routine, not a preference.
	let onFavourite = 0
	for (let m = 0; m < 90; m++) {
		if (sceneAt(at, at + m * 60_000, 'chair').at === 'chair') onFavourite++
	}
	assert(onFavourite > 45, `the favourite only won ${onFavourite}/90 — it is not bending anything`)
	assert(onFavourite < 90, 'the favourite won every single time, which is a uniform')

	/*
	 * Why he went down decides where he is, and it has to do so *deterministically
	 * and temporarily*. Frightened he gets as far from the hatch as the chassis
	 * allows; twenty minutes later the reason has stopped explaining anything and
	 * the hash takes back over. A reason that never expired would be a pet still
	 * hiding behind the crates an hour after a fright that lasts thirty seconds
	 * out on the strip.
	 */
	assert(
		sceneAt(at, at + 60_000, null, 'scared').at === sceneAt(at, at + 60_000, null, 'scared').at,
		'two looks at one frightened moment disagreed'
	)
	assert(sceneAt(at, at + 60_000, null, 'scared').at === 'rug', 'frightened, he is not in the long bay')
	assert(sceneAt(at, at + 60_000, null, 'sleepy').at === 'chair', 'sleepy, he is not in the cradle')
	assert(
		sceneAt(at, at + 60_000, null, 'scared').at !== sceneAt(at, at + 60_000, null, 'sleepy').at,
		'the reason he went down changes nothing'
	)

	const forgets = [...Array(120).keys()].some(
		(m) => sceneAt(at, at + m * 60_000, null, 'scared').at !== 'rug'
	)
	assert(forgets, 'he is still hiding, and it has been two hours')

	// Both languages, same shape. The shared copy check cannot see this file.
	const [en, es] = [houseCopy('en'), houseCopy('es')]
	assert(
		JSON.stringify(Object.keys(en.at).sort()) === JSON.stringify(Object.keys(es.at).sort()),
		'the two languages furnish different houses'
	)
	for (const kind of FURNITURE) {
		for (const [name, copy] of [['en', en], ['es', es]]) {
			assert(copy.at[kind]?.length > 0, `${name} has nothing to say about the ${kind}`)
		}
	}

	return `${FURNITURE.length} rooms, ${onFavourite}/90 on the favourite`
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
	// The burrow is in here too, now that its lamp, its candle and its painted
	// sun are all `var(--amber)`. An undefined paint variable is not an error
	// anywhere — SVG falls back to black without complaining, which is exactly
	// how the crown once shipped black, and a black lamp in a lit room is the
	// same bug wearing a different hat.
	const sources = [
		css,
		companion,
		readFileSync(new URL('../src/companion/CompanionFace.tsx', import.meta.url), 'utf8'),
		readFileSync(new URL('../src/house/house.css', import.meta.url), 'utf8'),
		readFileSync(new URL('../src/house/House.tsx', import.meta.url), 'utf8'),
	]

	// `var(--x, fallback)` is fine undefined — the fallback is the point.
	const used = new Set(
		sources.flatMap((source) => [...source.matchAll(/var\(\s*(--[\w-]+)\s*\)/g)].map((m) => m[1]))
	)
	const defined = new Set(
		sources.flatMap((source) => [...source.matchAll(/^\s*(--[\w-]+)\s*:/gm)].map((m) => m[1]))
	)

	const missing = [...used].filter((name) => !defined.has(name))
	// An undefined paint variable is not an error anywhere — SVG quietly falls
	// back to black, which is how the crown shipped black.
	assert(missing.length === 0, `used but never defined: ${missing.join(', ')}`)

	return `${used.size} used, all defined`
})

// ── things he wears ─────────────────────────────────────────────────────────

check('every prop is drawn, written and on the sheet', () => {
	const face = readFileSync(new URL('../src/companion/CompanionFace.tsx', import.meta.url), 'utf8')

	// `headphones` is picked by hand in `wearSomething` rather than from the
	// list, because it is the one prop with a reason. The souvenirs are their own
	// list for the same kind of reason — they only arrive back from a crossing,
	// and putting them in `PROPS` would have them turning up unearned. All of
	// them still have to be drawn, still have to have lines, and now all of them
	// have to be worn *somewhere*.
	const worn = [...PROPS, ...SOUVENIRS, 'headphones']
	const drawn = [...face.matchAll(/^\t\tcase '(\w+)':/gm)].map((m) => m[1])

	// The wardrobe lives in the data and nowhere else. It was in the component
	// once, and moving it left a copy behind: for a while the list this check
	// validated and the list he actually drew from were two different lists, so a
	// souvenir added to his could have had no place, no lines, and no way to know.
	for (const list of ['PROPS', 'SOUVENIRS']) {
		assert(!companion.includes(`const ${list} =`), `Companion.tsx has its own ${list} again`)
	}

	for (const kind of worn) {
		// A prop with no place is dropped by `wornFrom` on its way to being drawn:
		// he puts it on, says a line about it, and nothing appears. Silent, and
		// indistinguishable from a prop that is drawn wrong.
		assert(WEARS[kind], `${kind} is worn but has no place`)
		assert(
			WORN_ORDER.includes(WEARS[kind]),
			`${kind} is worn on ${WEARS[kind]}, which is not in the draw order`
		)
		// A prop with no `case` renders nothing at all: he "puts on" an invisible
		// thing, says a line about it, and takes it off. Silent in every log.
		assert(drawn.includes(kind), `${kind} is worn but never drawn`)
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

check('the burrow is furnished at every tier, and nothing hangs nowhere', () => {
	const house = readFileSync(new URL('../src/house/House.tsx', import.meta.url), 'utf8')

	// Day one has to have something in it. Every item carrying a `since` is a
	// burrow that is an empty box until you have known him a week, which reads
	// as the feature being broken rather than as a burrow he has not filled yet.
	const rooms = house.slice(house.indexOf('const ROOMS: Record<'), house.indexOf('const HANGS'))
	for (const kind of FURNITURE) {
		// Between `items: [` and `stand:`, not up to the first `]` — every entry
		// carries an `at: [x, y]`, so the first bracket that closes belongs to the
		// first item's coordinates and the count came out as one every time.
		const body = rooms.slice(rooms.indexOf(`\t${kind}: {`))
		const list = body.slice(body.indexOf('items: ['), body.indexOf('stand:'))
		const items = list.match(/\{ piece:/g) ?? []
		const gated = list.match(/since:/g) ?? []
		assert(items.length > gated.length, `the ${kind} bay is empty on day one`)
	}

	// And every tier a `since` names has to be one the day count can reach, or
	// the thing behind it is drawn and never appears.
	for (const [, tier] of rooms.matchAll(/since: '(\w+)'/g)) {
		assert(TIERS.includes(tier), `nothing is ever '${tier}'`)
	}

	// The rail hangs a prop by the place it is worn, so every place needs an
	// offset — a missing one is `undefined` in a viewBox and a prop that
	// vanishes, silently, only for the props filed under that place.
	const hangs = house.slice(house.indexOf('const HANGS'), house.indexOf('const Rail'))
	for (const place of WORN_ORDER) {
		assert(new RegExp(`\\b${place}: \\d`).test(hangs), `nothing hangs on the ${place} rail`)
	}

	// The nested viewBox has to be *bigger* than the box it draws into or nothing
	// shrinks. It shipped at exactly 1:1 once and a crown lay across three bays.
	const rail = house.slice(house.indexOf('const Rail'), house.indexOf('export const BurrowMap'))
	const box = Number((rail.match(/width=\{(\d+)\}/) ?? [])[1])
	const view = Number((rail.match(/ (\d+) \d+\`\}/) ?? [])[1])
	assert(view > box * 2, `the rail draws ${view} units into ${box}px, which is barely a shrink`)

	return `${TIERS.length} tiers, ${WORN_ORDER.length} places, ${view}→${box}`
})

check('what he brings up from the burrow is a thing that exists', () => {
	// A typo here is a pet who comes up out of the floor wearing nothing and
	// remarking on it — `wornFrom` drops a prop with no place, and a missing key
	// in `copy.props` is `undefined`, which `wear` treats as "say nothing". Both
	// are silent, and both look like the feature simply not having fired.
	for (const [room, kind] of Object.entries(BROUGHT_UP)) {
		assert(FURNITURE.includes(room), `${room} is not a room he can be in`)
		assert(WEARS[kind], `he brings up ${kind} from the ${room}, and it has no place`)
		for (const language of ['en', 'es']) {
			assert(
				companionCopy[language].props[kind]?.length > 0,
				`${language} has nothing for the ${kind} he brings up`
			)
		}
	}

	// Every room has to give something, or one of the three burrows is the one
	// where nothing ever happens and the payoff reads as random.
	for (const room of FURNITURE) {
		assert(BROUGHT_UP[room], `nothing ever comes up from the ${room}`)
	}

	return `${Object.values(BROUGHT_UP).join(', ')}`
})

check('every body part carries the hooks the rest of him drives it by', () => {
	const parts = readFileSync(new URL('../src/companion/parts.tsx', import.meta.url), 'utf8')

	// A part is a drawing, and none of what depends on it is visible in the
	// drawing: the CSS animates limbs by class name and by side, the mood system
	// blanches the screen by class, and the LED is the only status he has. Miss
	// one and nothing errors — he simply stops walking, or stops going pale when
	// he is frightened, and it looks like a bug in the behaviour instead.
	// Counted, not just present: a foot that lost its class while its twin kept
	// one does not stop him walking, it gives him a limp, and that reads as a
	// behaviour bug rather than as a missing attribute.
	const hooks = {
		SHELLS: { 'companion-screen': 1 },
		HANDS: { 'companion-hand': 2, 'data-side="left"': 1, 'data-side="right"': 1 },
		FEET: { 'companion-foot': 2, 'data-side="left"': 1, 'data-side="right"': 1 },
		ANTENNAS: { 'companion-led': 1 },
	}

	let total = 0

	for (const [name, needles] of Object.entries(hooks)) {
		const open = parts.indexOf(`const ${name} = slot({`)
		assert(open !== -1, `${name} is not a registry any more`)
		const body = parts.slice(open, parts.indexOf('\n})', open))

		const variants = body.split(/^\t(?=\w+: \()/m).slice(1)
		assert(variants.length > 0, `${name} has nothing in it`)

		for (const variant of variants) {
			const which = variant.slice(0, variant.indexOf(':'))
			for (const [needle, times] of Object.entries(needles)) {
				const found = variant.split(needle).length - 1
				assert(found === times, `${name}.${which}: expected ${times}× ${needle}, found ${found}`)
			}
		}

		total += variants.length
	}

	// The default has to name something that exists, or the fallback in
	// `bodyFrom` falls back onto nothing — rename a variant and forget this line
	// and every pet, including one with a perfectly good config, draws no feet.
	const from = parts.indexOf('DEFAULT_PARTS: CompanionParts = {')
	const defaults = parts.slice(from, parts.indexOf('}', from))
	for (const [, slot, variant] of defaults.matchAll(/(\w+): '(\w+)'/g)) {
		const registry = { shell: 'SHELLS', hands: 'HANDS', feet: 'FEET', antenna: 'ANTENNAS' }[slot]
		assert(registry, `DEFAULT_PARTS names a slot that is not one: ${slot}`)
		const open = parts.indexOf(`const ${registry} = slot({`)
		const body = parts.slice(open, parts.indexOf('\n})', open))
		assert(body.includes(`\n\t${variant}: (`), `the default ${slot} is ${variant}, which is not drawn`)
	}

	return `${total} parts`
})

check('what he has on is his own choice over the pins, one per place', () => {
	const kinds = (list) => list.map((one) => one.kind)

	// The pins are the floor and what he picked up covers *its own place only*.
	// The bug this is here to catch is the one the single-prop version had by
	// construction: putting a hat on took the coffee out of his hand.
	const pins = { head: 'cap', hand: 'coffee', feet: 'wellies' }
	assert(kinds(wornFrom(pins, null)).includes('coffee'), 'a pinned coffee is not held')
	assert(kinds(wornFrom(pins, 'tophat')).includes('coffee'), 'a hat emptied his hand')
	assert(!kinds(wornFrom(pins, 'tophat')).includes('cap'), 'two things on one head')

	// Leaving belongs to what he chose, never to a pin — a pin that played its
	// exit would take itself off and never come back.
	const going = wornFrom(pins, 'tophat', true)
	assert(going.find((one) => one.kind === 'tophat').leaving === true, 'his own is not leaving')
	assert(!going.find((one) => one.kind === 'coffee').leaving, 'a pin is leaving')

	// Back to front, and a pin filed under the wrong place is dropped rather
	// than drawn somewhere it makes no sense. `tico.json` is editable by hand.
	const order = kinds(wornFrom({ hand: 'coffee', body: 'cape', head: 'cap' }, null))
	assert(order[0] === 'cape' && order[2] === 'coffee', `wrong order: ${order.join(', ')}`)
	assert(wornFrom({ head: 'coffee' }, null).length === 0, 'a coffee was worn as a hat')

	return `${Object.keys(WEARS).length} things across ${WORN_ORDER.length} places`
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

check('the window and the store agree on what a setting is called', () => {
	const prefs = readFileSync(new URL('../src/prefs/Prefs.tsx', import.meta.url), 'utf8')
	const rust = readFileSync(new URL('../src-tauri/src/state.rs', import.meta.url), 'utf8')

	// The one boundary neither compiler can see across. `Patch` is serde, and
	// serde ignores a field it does not recognise — so `readTitles` instead of
	// `read_titles` is not an error on either side, it is a checkbox that ticks,
	// saves nothing, and unticks itself when the settings event comes back.
	const patch = rust.slice(rust.indexOf('pub struct Patch'), rust.indexOf('}', rust.indexOf('pub struct Patch')))
	const fields = [...patch.matchAll(/pub (\w+): Option</g)].map((match) => match[1])
	const sent = [...prefs.matchAll(/patch\(\{ (\w+)/g)].map((match) => match[1])

	assert(sent.length > 0, 'nothing in the window writes a setting any more')
	for (const key of new Set(sent)) {
		assert(fields.includes(key), `the window sends ${key}, which Patch would drop`)
	}

	// Same boundary, different shape: a command's arguments are named, and a
	// name the command does not take is an error thrown into a promise nobody
	// is holding. The pin is the one that is not part of `Patch`.
	const signature = rust.slice(rust.indexOf('pub fn set_pinned_prop('))
	const takes = [...signature.slice(0, signature.indexOf(')')).matchAll(/(\w+): /g)]
		.map((match) => match[1])
		.filter((name) => name !== 'app')
	const given = [...prefs.matchAll(/invoke\('set_pinned_prop', \{ ([^}]+)\}/g)]
		.flatMap((match) => match[1].split(','))
		.map((piece) => piece.split(':')[0].trim())
		.filter(Boolean)
	assert(given.length > 0, 'nothing pins anything any more')
	for (const name of new Set(given)) {
		assert(takes.includes(name), `set_pinned_prop is given ${name}, which it does not take`)
	}

	return `${new Set(sent).size} of ${fields.length} settings written`
})

check('the window speaks both languages too', () => {
	const walk = (a, b, path = '') => {
		for (const key of Object.keys(a)) {
			assert(key in b, `${path}${key} is missing`)
			if (a[key] && typeof a[key] === 'object') walk(a[key], b[key], `${path}${key}.`)
		}
	}
	walk(prefsCopy.en, prefsCopy.es)
	walk(prefsCopy.es, prefsCopy.en)

	// Every label is written twice and it is the second one that gets forgotten,
	// so an empty string counts as forgotten rather than as brevity.
	for (const [language, copy] of Object.entries(prefsCopy)) {
		const empty = JSON.stringify(copy).match(/"[a-z]+":""/g) ?? []
		// `autostart.hint` is the deliberate one: the label is the whole sentence.
		assert(empty.length <= 2, `${language} has ${empty.length} empty strings`)
	}

	return `${Object.keys(prefsCopy.en).length} sections`
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
