import type { CompanionParts } from './companion/parts'
import type { Language, WornProp } from './data/companion'

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
	/**
	 * Everything he has on, back to front. One per place, so a cap and a coffee
	 * are not the same decision — see `wornFrom`, which is what builds this.
	 */
	worn: WornProp[]
	faceColor: string
	/** The little screen behind the face. Blanches when he is frightened. */
	screenColor: string
	ledColor: string
	/** Which body he is wearing. Left out, he is the one he has always been. */
	parts?: CompanionParts
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
	/** Apple Music only — Spotify's scripting dictionary has no genre. */
	genre: string
	/** Apple Music only, and `0` unless the track was actually tagged. */
	bpm: number
}

export type Chattiness = 'quiet' | 'normal' | 'chatty'
export type PetSize = 'small' | 'normal' | 'large'

export interface Settings {
	chattiness: Chattiness
	size: PetSize
}

/**
 * Everything that outlives a restart, exactly as `state.rs` writes it — snake
 * case included, because it crosses unchanged and renaming it on the way in
 * would only mean renaming it again on the way back out.
 *
 * Two windows read this now: the strip, to be him, and the preferences window,
 * to show what he is. Both are told about a change the same way, by the
 * `settings` event, so neither can be the one holding the stale copy.
 */
export interface Stored extends Settings {
	x: number
	quiet_until: number
	in_call: 'peek' | 'hide' | 'ignore'
	/** `auto` follows the system, which is all it could do before the tray. */
	language: 'auto' | Language
	house: boolean
	read_titles: boolean
	parts: CompanionParts
	/** Place to prop: what he goes back to wearing. `{}` is nothing pinned. */
	pinned_props: Record<string, string>
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
	/** The same idea indoors: what he sits on most, once it is a habit. */
	chair: string | null
}
