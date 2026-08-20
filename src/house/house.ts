import type { Language } from '../data/companion.ts'

/**
 * What he was doing in there, worked out the moment you look.
 *
 * **The house has no clock, and that is the decision the whole thing rests on.**
 * He does not live in there while the door is shut: nothing polls, nothing
 * animates, nothing is simulated. When you open the door the scene is *derived*
 * — from how long he has been inside, what time it is, and which chair he
 * favours — and it is derived deterministically, so opening the door twice in a
 * row shows you the same thing rather than catching him doing something new
 * every time you blink.
 *
 * The alternative was a second state machine running behind a closed door. It
 * would have cost the same as the pet whether or not anyone was looking (the
 * price is per composited frame), it would have needed its own poll against the
 * rule that everything unprompted shares one, and its state could drift from
 * what is on disk. This buys all of that for a hash.
 */

export type Furniture = 'chair' | 'lamp' | 'rug'

/** Everything in the house today. Growing it is deliberately not in v1. */
export const FURNITURE: Furniture[] = ['chair', 'lamp', 'rug']

export interface Scene {
	/** What he is on or near. Drives the drawing and the line. */
	at: Furniture
	/** Minutes he has been inside, rounded down. Shown as a mood, not a number. */
	minutes: number
	settled: boolean
}

/**
 * Deterministic from the two things that actually vary. `since` only moves
 * forward, so the scene changes as he stays — but it changes on its own clock,
 * not on yours, and looking twice inside the same minute shows the same room.
 */
export const sceneAt = (since: number, now: number, favourite: string | null): Scene => {
	const minutes = Math.max(0, Math.floor((now - since) / 60_000))

	// The favourite bends the draw without winning it, exactly as it does for
	// hats. A pet that is always in the same chair has a routine, not a taste.
	const preferred = FURNITURE.includes(favourite as Furniture) ? (favourite as Furniture) : null

	/*
	 * One multiplicative hash, read at two different offsets.
	 *
	 * The first version used `minutes * 7 + since` for the room and
	 * `minutes + since` for the coin, which looked independent and was not: 7 ≡ 1
	 * (mod 3), so with three pieces of furniture the two expressions are the same
	 * expression. Every time the coin sent him off his favourite, the room it
	 * fell back to *was* his favourite, and he sat in the chair a hundred percent
	 * of the time. `pnpm check` found it; reading it did not.
	 */
	const seed = (minutes * 2_654_435_761 + since) >>> 0
	const index = seed % FURNITURE.length
	const at = preferred && (seed >>> 8) % 3 !== 0 ? preferred : FURNITURE[index]

	// Under a couple of minutes he has only just got in and is still standing up.
	return { at, minutes, settled: minutes >= 2 }
}

/**
 * What he comes back up holding, by the room he was last in.
 *
 * **The house was the only absence in the app that returned nothing.** He went
 * down, he came up, and nothing about him had changed — while `behind`, which is
 * the same shape exactly (he leaves, you cannot see, he returns), pays off on his
 * body with a cobweb. The payoff belongs where you are already looking, and a map
 * you have to open is not that place.
 *
 * Every one of these is drawn *inside the room it comes from*: the mug is on the
 * nook's shelf, the plant is in the warm room, and the long room is crates and
 * barrels, which is where dust lives. That is the whole rule — the evidence has
 * to already be in the picture, or it is a random hat with a story attached.
 *
 * Not recorded towards the favourite, for the same reason a cobweb is not: the
 * favourite bends the next random draw, and something he only picked up because
 * he happened to be standing next to it did not tell you anything about taste.
 */
export const BROUGHT_UP: Record<Furniture, string> = {
	chair: 'coffee',
	lamp: 'flower',
	rug: 'dust',
}

type Lines = Record<Furniture, string[]>

/**
 * One line per piece of furniture, per language. Kept here rather than in the
 * shared copy file because it is the house's own vocabulary — and because the
 * check that both languages carry the same keys reads that file, so anything
 * added there has to exist in both before it will build.
 */
const SAID: Record<
	Language,
	{ at: Lines; arriving: string[]; leaving: string[]; empty: string[] }
> = {
	en: {
		at: {
			chair: [
				'I was in the chair. I am always in the chair.',
				'Do not tell anyone how long I have been sitting here.',
				'The chair and I have an understanding.',
			],
			lamp: [
				'I left the lamp on. It is company.',
				'It is warmer over here.',
				'I was just looking at the light.',
			],
			rug: [
				'I was on the rug. That is the whole report.',
				'The rug is underrated.',
				'I lay down for a second and it became a project.',
			],
		},
		arriving: ['Back in a bit.', 'I am going in for a while.', 'Do not wait up.'],
		leaving: ['I am back.', 'That is enough indoors.', 'Right. Out here again.'],
		empty: ['Nobody is in. I am outside, look.', 'Empty. I am right there.'],
	},
	es: {
		at: {
			chair: [
				'Estaba en la silla. Siempre estoy en la silla.',
				'No le contés a nadie cuánto llevo aquí sentado.',
				'La silla y yo nos entendemos.',
			],
			lamp: [
				'Dejé la lámpara encendida. Hace compañía.',
				'Aquí se está más calientito.',
				'Solo estaba viendo la luz.',
			],
			rug: [
				'Estaba en la alfombra. Ese es el reporte completo.',
				'La alfombra está subestimada.',
				'Me acosté un segundo y se volvió un proyecto.',
			],
		},
		arriving: ['Ya vuelvo.', 'Voy a entrar un rato.', 'No me esperés despierto.'],
		leaving: ['Ya volví.', 'Ya fue suficiente adentro.', 'Listo. Otra vez acá afuera.'],
		empty: ['No hay nadie. Estoy afuera, mirá.', 'Vacío. Estoy ahí mismo.'],
	},
}

export const houseCopy = (language: Language) => SAID[language]

/** The line for a scene, chosen the same way the scene was: from the minute. */
export const lineFor = (scene: Scene, language: Language): string => {
	const lines = SAID[language].at[scene.at]
	return lines[(scene.minutes + scene.at.length) % lines.length]
}
