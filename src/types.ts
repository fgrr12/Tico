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
	/** Cursor direction, -1…1 on each axis. The eyes lean this way. */
	look: { x: number; y: number }
	/** Shown instead of the face. Unused until he has something to show. */
	glyph: string | null
	/** Music is playing somewhere. Overrides the mouth and adds notes. */
	singing: boolean
	/** Something he is wearing or holding, for no reason he would explain. */
	prop: string | null
	faceColor: string
	ledColor: string
}

/** Where the pet is standing, in CSS pixels inside the strip. */
export interface PetRect {
	x: number
	y: number
	width: number
	height: number
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
