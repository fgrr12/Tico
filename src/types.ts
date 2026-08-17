/** Every state the pet can be in. Drives both eyes and mouth. */
export type CompanionMood =
	| 'idle'
	| 'happy'
	| 'thinking'
	| 'error'
	| 'wow'
	| 'love'
	| 'dizzy'
	| 'sleep'
	| 'held'
	/** The cursor is close enough that he is paying attention to it. */
	| 'watching'
	| 'muted'
	| 'yawn'
	/** Something on screen is genuinely alarming. Usually a meeting. */
	| 'scared'

export interface CompanionFaceProps {
	mood: CompanionMood
	blink: boolean
	/** Shown instead of the face. Unused until he has something to show. */
	glyph: string | null
	/** Music is playing somewhere. Overrides the mouth and adds notes. */
	singing: boolean
	/** Something he is wearing or holding, for no reason he would explain. */
	prop: string | null
	/** Still the same prop — playing its exit for a beat before it unmounts. */
	propLeaving: boolean
	faceColor: string
	/** The little screen behind the face. Blanches when he is frightened. */
	screenColor: string
	ledColor: string
}

/** Where the pet is standing, in CSS pixels inside the strip. */
export interface PetRect {
	x: number
	y: number
	width: number
	height: number
}

/**
 * The top edge of one of your windows, as somewhere to catch hold of. Already in
 * his coordinates — `x` from the left of the strip, `lift` above its floor — so
 * a ledge is a `moveTo` target and nothing has to be converted on this side.
 */
export interface Ledge {
	x: number
	width: number
	lift: number
}

export interface NowPlaying {
	artist: string
	song: string
}

export type Chattiness = 'quiet' | 'normal' | 'chatty'
export type PetSize = 'small' | 'normal' | 'large'

export interface Settings {
	chattiness: Chattiness
	size: PetSize
}

/**
 * What he remembers of you from before this launch. Mirrors `Opening` in
 * `memory.rs`, which does the date arithmetic — the frontend never works out
 * what day it is, it is only told what changed.
 */
export interface Opening {
	/** Distinct days he has been around, not days since installation. */
	days: number
	streak: number
	best_streak: number
	/** Days of real absence. `0` for the same day or the next morning. */
	away: number
	first_day: boolean
	pets: number
	drags: number
	/** What he has worn most, once he has worn it enough to mean it. */
	favourite: string | null
}
