import type { Familiarity, Feeling, Language } from '../data/companion.ts'

/**
 * What is under the floor, and what he was doing down there.
 *
 * **The burrow is the inside of the machine.** He is a daemon who was born in a
 * terminal and lives along the bottom edge of a screen; under the floor of a
 * computer is the computer. It used to be a wooden hole with a candle in it —
 * charming, and belonging to a different application, drawn in thirty-five browns
 * that appear nowhere else. What it is now is a chassis: bays in a case, circuit
 * traces in the board behind them, an amber standby beacon for a lamp, a braided
 * cable mat for a rug, and a capacitor where the barrel was. One line of his own
 * already pointed at it — coming back from behind the screen he says *"Hay un
 * cable. Va para algún lado."* This is where it goes.
 *
 * **The house still has no clock, and that is the decision the whole thing rests
 * on.** He does not live in there while the panel is shut: nothing polls, nothing
 * animates, nothing is simulated. When you open it the scene is *derived* — and
 * derived deterministically, so opening it twice in a row shows you the same
 * thing rather than catching him doing something new every time you blink.
 *
 * Three things now feed that derivation, and every one of them is frozen before
 * you look:
 *
 * 1. **How long he has been in**, which only moves forward.
 * 2. **Why he went down**, taken at the moment he went and not at the moment you
 *    looked — a pet whose hiding place changed because your mood changed would
 *    be reading you, not remembering himself.
 * 3. **How well he knows you**, which is fixed for the session.
 */

/**
 * The three bays.
 *
 * The ids are `chair`, `lamp` and `rug` and they are staying that way: they are
 * the keys `memory.json` has been counting under since the burrow shipped, and a
 * rename would trade a real migration for a nicer word. What they *are* has
 * changed completely — a rest cradle, a warm bay under the standby beacon, and
 * the long bay where everything is stored.
 */
export type Furniture = 'chair' | 'lamp' | 'rug'

export const FURNITURE: Furniture[] = ['chair', 'lamp', 'rug']

/**
 * Where a feeling sends him.
 *
 * The room used to come out of a hash and nothing else, which meant going down
 * frightened and going down sleepy looked identical — the burrow was somewhere
 * he *was* rather than somewhere he *went*. Frightened he gets as far from the
 * hatch as the chassis allows, which is the long bay; tired he goes to the
 * cradle; bored he goes and pokes about in storage.
 *
 * Anything not in here has no opinion and falls through to the favourite and the
 * hash, which is most of them on purpose. A pet with a designated room per mood
 * is a filing system.
 */
const ROOM_FOR: Partial<Record<Feeling, Furniture>> = {
	scared: 'rug',
	rattled: 'rug',
	bored: 'rug',
	sleepy: 'chair',
	lonely: 'chair',
	worried: 'chair',
	festive: 'lamp',
	pleased: 'lamp',
}

/**
 * How long the reason he went down still explains where he is.
 *
 * After this the hash takes over. A pet who went down frightened and is still
 * behind the crates an hour later is not frightened, he is a bug — the fright
 * itself only lasts thirty seconds out on the strip, and this is already
 * generous by comparison.
 */
const REASON_HOLDS = 20

export interface Scene {
	/** Which bay he is in. Drives the drawing and the line. */
	at: Furniture
	/** Minutes he has been inside, rounded down. Shown as a mood, not a number. */
	minutes: number
	settled: boolean
}

/**
 * Deterministic from the things that actually vary, all of them frozen before
 * you look. `since` only moves forward, so the scene changes as he stays — but
 * it changes on its own clock, not on yours, and looking twice inside the same
 * minute shows the same room.
 */
export const sceneAt = (
	since: number,
	now: number,
	favourite: string | null,
	reason: Feeling | null = null
): Scene => {
	const minutes = Math.max(0, Math.floor((now - since) / 60_000))

	/*
	 * One multiplicative hash, read at two different offsets.
	 *
	 * The first version used `minutes * 7 + since` for the room and
	 * `minutes + since` for the coin, which looked independent and was not: 7 ≡ 1
	 * (mod 3), so with three bays the two expressions are the same expression.
	 * Every time the coin sent him off his favourite, the room it fell back to
	 * *was* his favourite, and he sat in the same one a hundred percent of the
	 * time. `pnpm check` found it; reading it did not.
	 */
	const seed = (minutes * 2_654_435_761 + since) >>> 0
	const index = seed % FURNITURE.length

	// The favourite bends the draw without winning it, exactly as it does for
	// hats. A pet that is always in the same bay has a routine, not a taste.
	const preferred = FURNITURE.includes(favourite as Furniture) ? (favourite as Furniture) : null
	const drawn = preferred && (seed >>> 8) % 3 !== 0 ? preferred : FURNITURE[index]

	// Why he went down beats both, while it still applies.
	const because = reason ? ROOM_FOR[reason] : undefined
	const at = because && minutes < REASON_HOLDS ? because : drawn

	// Under a couple of minutes he has only just got in and is still standing up.
	return { at, minutes, settled: minutes >= 2 }
}

/**
 * How far along a burrow is, from how well he knows you.
 *
 * **This is the one place `memory.json` is visible rather than merely audible.**
 * Everywhere else the day count colours a line he says; here it furnishes a room.
 * On day one the chassis is nearly empty — a cradle, a beacon, a cable mat, and
 * a lot of bare board. By the time he is `old` there is a monitor on the wall
 * showing hills he has never seen, a plant, a capacitor, and the tube.
 *
 * Nothing here is earned by doing anything. It is earned by time, which is the
 * only axis in this pet that moves one way.
 */
export const TIERS: Familiarity[] = ['new', 'knowing', 'familiar', 'old']

export const reached = (tier: Familiarity, needs: Familiarity | undefined): boolean =>
	needs === undefined || TIERS.indexOf(tier) >= TIERS.indexOf(needs)

/**
 * What he comes back up holding, by the bay he was last in.
 *
 * **The burrow was the only absence in the app that returned nothing.** He went
 * down, he came up, and nothing about him had changed — while `behind`, which is
 * the same shape exactly, pays off on his body with a cobweb. The payoff belongs
 * where you are already looking, and a panel you have to open is not that place.
 *
 * Every one of these is drawn *inside the bay it comes from*: the mug is on the
 * cradle bay's module shelf, the plant is in the warm bay, and the long bay is
 * crates and cable, which is where dust lives.
 *
 * Not recorded towards the favourite, for the same reason a cobweb is not: the
 * favourite bends the next random draw, and something he only picked up because
 * he happened to be standing next to it says nothing about taste.
 */
export const BROUGHT_UP: Record<Furniture, string> = {
	chair: 'coffee',
	lamp: 'flower',
	rug: 'dust',
}

type Lines = Record<Furniture, string[]>

/**
 * One line per bay, per language. Kept here rather than in the shared copy file
 * because it is the burrow's own vocabulary — and because the check that both
 * languages carry the same keys reads that file, so anything added there has to
 * exist in both before it will build.
 */
const SAID: Record<
	Language,
	{ at: Lines; arriving: string[]; leaving: string[]; empty: string[] }
> = {
	en: {
		at: {
			chair: [
				'I was in the cradle. I am always in the cradle.',
				'Do not tell anyone how long I have been docked.',
				'It holds me. That is the whole of what it does.',
			],
			lamp: [
				'I left the beacon on. It is company.',
				'It is warmer over here.',
				'I was just watching the light.',
			],
			rug: [
				'I was on the cable mat. That is the whole report.',
				'The long bay is underrated.',
				'I lay down for a second and it became a project.',
			],
		},
		arriving: ['Back in a bit.', 'I am going down for a while.', 'Do not wait up.'],
		leaving: ['I am back.', 'That is enough of down there.', 'Right. Out here again.'],
		empty: ['Nobody is in. I am outside, look.', 'Empty. I am right there.'],
	},
	es: {
		at: {
			chair: [
				'Estaba en el módulo. Siempre estoy en el módulo.',
				'No le contés a nadie cuánto llevo acoplado.',
				'Me sostiene. Eso es todo lo que hace.',
			],
			lamp: [
				'Dejé la baliza encendida. Hace compañía.',
				'Aquí se está más calientito.',
				'Solo estaba viendo la luz.',
			],
			rug: [
				'Estaba en la estera de cables. Ese es el reporte completo.',
				'La bahía larga está subestimada.',
				'Me acosté un segundo y se volvió un proyecto.',
			],
		},
		arriving: ['Ya vuelvo.', 'Voy a bajar un rato.', 'No me esperés despierto.'],
		leaving: ['Ya volví.', 'Ya fue suficiente allá abajo.', 'Listo. Otra vez acá afuera.'],
		empty: ['No hay nadie. Estoy afuera, mirá.', 'Vacío. Estoy ahí mismo.'],
	},
}

export const houseCopy = (language: Language) => SAID[language]

/** The line for a scene, chosen the same way the scene was: from the minute. */
export const lineFor = (scene: Scene, language: Language): string => {
	const lines = SAID[language].at[scene.at]
	return lines[(scene.minutes + scene.at.length) % lines.length]
}
