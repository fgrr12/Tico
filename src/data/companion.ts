import { en } from './copy/en.ts'
import { es } from './copy/es.ts'
import type { CompanionCopy } from './copy/types.ts'

export type { AppLines, CompanionCopy } from './copy/types.ts'

import type { AppLines } from './copy/types.ts'

export type Language = 'en' | 'es'

/**
 * Four buckets, not twenty-four. What is different about a person at 02:00 is
 * not subtly different from 01:00 — it is a different kind of evening — and
 * lines written per hour would be twenty-four sets of nearly the same joke.
 */
export type TimeOfDay = 'dawn' | 'day' | 'evening' | 'night'

export const timeOfDay = (hour: number = new Date().getHours()): TimeOfDay =>
	hour >= 23 || hour < 5 ? 'night' : hour < 9 ? 'dawn' : hour < 18 ? 'day' : 'evening'

/**
 * How lively he is, 0 to 1, by the clock.
 *
 * The point of it is that a pet with one energy level is a pet with one speed,
 * and after a week you stop seeing it. This is what makes 9am tico and 1am tico
 * different *creatures* rather than the same one with different lines: it scales
 * how often he does anything, how fast he walks, and which behaviours he is even
 * willing to consider.
 *
 * The dip after lunch is not a joke. It is the shape of a day.
 */
const ENERGY_BY_HOUR: Record<number, number> = {
	0: 0.2, 1: 0.2, 2: 0.15, 3: 0.15, 4: 0.2,
	5: 0.45, 6: 0.6, 7: 0.75, 8: 0.9,
	9: 1, 10: 1, 11: 1, 12: 0.9,
	13: 0.7, 14: 0.65, 15: 0.8, 16: 0.85, 17: 0.8,
	18: 0.75, 19: 0.7, 20: 0.65, 21: 0.55, 22: 0.4, 23: 0.3,
}

export const energyAt = (hour: number = new Date().getHours()): number =>
	ENERGY_BY_HOUR[hour] ?? 0.6

/**
 * The second axis.
 *
 * Energy is how *much* he does. This is what *kind*. Together they are the two
 * axes emotion is usually modelled on — arousal and valence — and two axes is a
 * far larger space than one, which is the whole reason for adding it.
 *
 * The rule that keeps it honest: a feeling that cannot be seen is bookkeeping,
 * not life. Each of these changes his posture, which behaviours he will pick,
 * and what he says. If it only changed a variable it would not be here.
 */
export type Feeling =
	| 'content'
	| 'bored'
	| 'lonely'
	| 'pleased'
	| 'worried'
	| 'restless'
	| 'rattled'
	| 'smug'
	| 'curious'
	| 'sleepy'
	| 'festive'
	| 'nostalgic'
	| 'scared'

export interface Sensed {
	/** Minutes since the cursor moved anywhere on screen. */
	neglect: number
	/** 0–1, raised by being clicked or petted, decaying over minutes. */
	attention: number
	/** Hours in the same application. */
	dwell: number
	/** Application switches in the last two minutes. */
	switches: number
	/** Times he has been picked up in the last two minutes. */
	drags: number
	/** This application is one he has not seen yet today. */
	newApp: boolean
	/** Something he is frightened of just came to the front. */
	feared: boolean
	music: boolean
	/** The id `matchApp` resolved, so a feeling can be about a kind of app. */
	appKey: string | null
	energy: number
	hour: number
}

/**
 * A ladder, not a score, ordered by which fact about the moment is the most
 * interesting one. Being thrown around beats being ignored, being ignored beats
 * being petted an hour ago, and what application is open is near the bottom
 * because it is true all day and therefore says the least.
 *
 * Everything above `content` has to be *earned* by a signal. There is no
 * randomness in here: if he looks smug, you petted him a lot.
 */
/**
 * Colour as a third channel, after posture and behaviour.
 *
 * `face` is the eyes and mouth, `screen` is the little display they sit on. The
 * pairs are chosen for contrast first: fright blanches the screen and darkens
 * the face, which is the only inversion here and reads as blood leaving
 * something.
 *
 * Nostalgic is phosphor green on near-black, because that is where he came from
 * and one of his own lines says so — "más chica, más verde".
 */
export const PALETTE: Record<Feeling, { face: string; screen: string; led: string }> = {
	content: { face: '#bb9af7', screen: '#1a1c23', led: '#9ece6a' },
	bored: { face: '#6b7489', screen: '#1a1c23', led: '#6b7489' },
	lonely: { face: '#7aa2f7', screen: '#171a21', led: '#565f78' },
	pleased: { face: '#9ece6a', screen: '#1a1f21', led: '#9ece6a' },
	smug: { face: '#e0af68', screen: '#1c1b1e', led: '#e0af68' },
	worried: { face: '#e0af68', screen: '#1c1a1e', led: '#e0af68' },
	restless: { face: '#7dcfff', screen: '#1a1d23', led: '#7dcfff' },
	rattled: { face: '#f7768e', screen: '#1e1a1e', led: '#f7768e' },
	curious: { face: '#7dcfff', screen: '#181c24', led: '#7dcfff' },
	// Lifted off #565f78/#15171d, which measured 2.8:1 — under the 3:1 floor for
	// graphical elements, and a face you have to squint at is not a sleepy face,
	// it is an unreadable one.
	sleepy: { face: '#6a7490', screen: '#13151b', led: '#3b4256' },
	festive: { face: '#f7768e', screen: '#1d1a24', led: '#e0af68' },
	// The terminal he was born in.
	nostalgic: { face: '#9ece6a', screen: '#0d140f', led: '#9ece6a' },
	// The only inversion: pale screen, dark face.
	scared: { face: '#2a2e3a', screen: '#d9dde8', led: '#f7768e' },
}

export const feelingFrom = (seen: Sensed): Feeling => {
	if (seen.drags >= 3) return 'rattled'
	// Above almost everything: fear is the most interesting thing about any
	// moment it happens in, and it passes on its own in half a minute.
	if (seen.feared) return 'scared'
	if (seen.neglect > 8) return 'lonely'
	if (seen.attention > 0.85) return 'smug'
	if (seen.attention > 0.5) return 'pleased'
	if (seen.newApp) return 'curious'
	if (seen.energy < 0.25) return 'sleepy'
	if (seen.music && seen.energy > 0.5) return 'festive'
	if (seen.neglect > 3) return 'bored'
	if (seen.dwell >= 2 || (seen.dwell >= 1 && (seen.hour >= 23 || seen.hour < 5))) return 'worried'
	if (seen.appKey === 'terminal') return 'nostalgic'
	if (seen.switches > 6) return 'restless'
	return 'content'
}


/**
 * Window owner → an id the copy is keyed by.
 *
 * Substring matching on a lowercased name, which is crude and right: the same
 * editor is "Code", "Visual Studio Code" and "Code - Insiders" depending on the
 * build, and a table of exact names would be wrong on someone else's machine by
 * the end of the week. First match wins, so the specific entries come first.
 */
const APP_PATTERNS: [string, string[]][] = [
	['sql', ['beekeeper', 'tableplus', 'dbeaver', 'pgadmin', 'azure data studio', 'sequel']],
	['vscode', ['visual studio code', 'code - insiders', 'cursor', 'windsurf', 'vscodium']],
	['visualstudio', ['visual studio', 'rider', 'jetbrains', 'intellij', 'webstorm']],
	['xcode', ['xcode', 'android studio']],
	['terminal', ['terminal', 'iterm', 'warp', 'ghostty', 'alacritty', 'kitty', 'wezterm']],
	['github', ['github desktop', 'sourcetree', 'fork', 'gitkraken']],
	['docker', ['docker', 'orbstack', 'podman']],
	['api', ['postman', 'insomnia', 'bruno', 'hoppscotch']],
	['figma', ['figma', 'sketch', 'penpot']],
	['meeting', ['zoom', 'microsoft teams', 'google meet', 'webex']],
	['chat', ['slack', 'discord', 'whatsapp', 'telegram', 'messages', 'signal']],
	['music', ['spotify', 'music', 'tidal', 'deezer']],
	['browser', ['chrome', 'brave', 'safari', 'firefox', 'arc', 'edge', 'zen']],
	['notes', ['notion', 'obsidian', 'notes', 'bear', 'craft', 'linear', 'clickup']],
	['sheets', ['excel', 'numbers', 'sheets', 'calc']],
	['mail', ['mail', 'outlook', 'spark', 'superhuman']],
	['ai', ['claude', 'chatgpt', 'copilot', 'perplexity', 'ollama']],
	['finder', ['finder', 'explorer', 'files', 'nautilus']],
]

/**
 * The applications that frighten him enough to *stay* frightened — the ones that
 * hold the `scared` feeling for half a minute rather than producing one startled
 * line and moving on.
 *
 * Deliberately short. Everything in `copy.fears` gets a fright on sight, but if
 * a database client held him in terror he would spend a working day scared, and
 * a pet that is always afraid is not afraid of anything.
 */
export const TERRORS = ['meeting', 'xcode']

/**
 * The document inside a window title, when there is one.
 *
 * Editors all format the title differently — "Companion.tsx — tico", "● app.rs",
 * "Project — File.swift" — but every one of them puts the filename in there
 * somewhere, so finding the filename is more reliable than parsing the format.
 *
 * Restricted to extensions people actually edit, which is what keeps "Brave
 * Search - Brave" and a title containing github.com out of it. Anything the
 * sensitive-title blocklist rejects never reaches here at all.
 */
const DOCUMENT_EXTENSIONS = new Set([
	'ts', 'tsx', 'js', 'jsx', 'mjs', 'cjs', 'vue', 'svelte', 'astro',
	'rs', 'go', 'py', 'rb', 'php', 'java', 'kt', 'swift', 'dart', 'lua', 'ex', 'exs',
	'c', 'h', 'cpp', 'hpp', 'cs', 'm', 'mm',
	'html', 'css', 'scss', 'sass', 'json', 'toml', 'yaml', 'yml', 'xml', 'sql', 'sh',
	'md', 'mdx', 'txt', 'csv', 'pdf', 'docx', 'xlsx',
	'png', 'jpg', 'jpeg', 'svg', 'webp',
])

export const documentIn = (title: string | null): string | null => {
	if (!title) return null

	for (const raw of title.split(/[\s—–|:]+/)) {
		// The leading dot some editors use for "unsaved" is not part of the name.
		const token = raw.replace(/^[●•*]+/, '').trim()
		const dot = token.lastIndexOf('.')
		if (dot <= 0 || dot === token.length - 1) continue
		if (DOCUMENT_EXTENSIONS.has(token.slice(dot + 1).toLowerCase())) return token
	}

	return null
}

/**
 * How he dances, from whatever the player was willing to say about the track.
 *
 * **Checked against both scripting dictionaries rather than assumed.** Apple
 * Music's `current track` exposes `genre` and `bpm`; Spotify's exposes neither —
 * artist, album, duration, popularity, played count and some numbers, and that
 * is the whole list. So this degrades in three steps, and most people land on
 * the third.
 *
 * Nothing here listens to the audio. Real tempo detection means capturing the
 * output stream, which on macOS costs the Screen Recording permission that
 * `window_title.rs` refuses on principle, plus an FFT on a clock — two things
 * this pet is built not to have.
 */
export type DanceStyle = 'heavy' | 'fast' | 'smooth' | 'slow' | 'bright'

/** Substring against Apple Music's genre string, first match wins. */
const GENRE_STYLES: [DanceStyle, string[]][] = [
	['heavy', ['metal', 'hard rock', 'grunge', 'industrial']],
	['fast', ['punk', 'electronic', 'techno', 'house', 'drum', 'dance', 'ska', 'trance']],
	['smooth', ['hip', 'rap', 'r&b', 'soul', 'funk', 'jazz', 'reggae', 'latin', 'salsa', 'bossa']],
	['slow', ['classical', 'ambient', 'acoustic', 'folk', 'blues', 'soundtrack', 'piano']],
	['bright', ['pop', 'indie', 'alternative', 'country', 'rock']],
]

/**
 * Tempo wins when there is one, because it is the thing actually being asked
 * about — a slow metal track is a slow dance whatever the genre column says.
 * `bpm` is `0` far more often than not: it is a tag, and most libraries were
 * never tagged, which is why it is a refinement and not the whole answer.
 */
const styleFromBpm = (bpm: number): DanceStyle | null => {
	if (bpm <= 0) return null
	if (bpm < 85) return 'slow'
	if (bpm < 110) return 'smooth'
	if (bpm < 145) return 'bright'
	return 'fast'
}

const STYLES: DanceStyle[] = ['heavy', 'fast', 'smooth', 'slow', 'bright']

/**
 * The fallback, and the one nearly every Spotify listener gets.
 *
 * A hash of the track rather than a random draw, so the same song always gets
 * the same dance. That is not rhythm detection and is not pretending to be —
 * but "he does this one to this song" is the thing you actually notice, and it
 * is indistinguishable from taste until you own two songs he treats alike.
 *
 * An artist-to-genre table was written here and deleted. It would have been a
 * few dozen names guessed at by somebody who has never seen your library, wrong
 * for almost every track, and needing a commit every time you found a new band.
 * The hash is right about the only thing it claims.
 */
export const danceStyle = (
	artist: string,
	song: string,
	genre = '',
	bpm = 0
): DanceStyle => {
	const fromBpm = styleFromBpm(bpm)
	if (fromBpm) return fromBpm

	const needle = genre.toLowerCase()
	if (needle) {
		const found = GENRE_STYLES.find(([, words]) => words.some((w) => needle.includes(w)))
		if (found) return found[0]
	}

	// FNV-1a, because it is eight lines and this is not cryptography.
	let hash = 0x811c9dc5
	for (const char of `${artist}\u0000${song}`.toLowerCase()) {
		hash ^= char.charCodeAt(0)
		hash = Math.imul(hash, 0x01000193) >>> 0
	}
	return STYLES[hash % STYLES.length]
}

export const matchApp = (name: string): string | null => {
	const needle = name.toLowerCase()
	return APP_PATTERNS.find(([, patterns]) => patterns.some((p) => needle.includes(p)))?.[0] ?? null
}

/**
 * How well he knows you, from the number of distinct days he has been around.
 *
 * This is the only thing about him that survives a restart *and* changes what he
 * is like. Everything else is a distribution — 39 behaviours, 13 feelings, 21
 * hats — and a distribution is varied, not alive: on day sixty he was drawing
 * from exactly the same bag as on day one. This axis only moves one way, and it
 * moves slowly on purpose. A pet that is your oldest friend by Tuesday has not
 * earned anything.
 */
export type Familiarity = 'new' | 'knowing' | 'familiar' | 'old'

export const familiarityFrom = (days: number): Familiarity => {
	if (days >= 60) return 'old'
	if (days >= 14) return 'familiar'
	if (days >= 4) return 'knowing'
	return 'new'
}

/**
 * Days worth remarking on. Sparse, and thinning as it goes: the distance between
 * day one and day seven is most of what you learn about him, and the distance
 * between two hundred and a year is nothing at all.
 */
export const DAY_MILESTONES = [7, 30, 100, 365]
/** Consecutive days, and rarer — a streak is much easier to lose than a total. */
export const STREAK_MILESTONES = [5, 15, 50]


/**
 * The two language files behind one name. Everything downstream indexes this by
 * language and never imports either file directly, which is what stops "add a
 * line" from also meaning "find every place that reads lines".
 */
/**
 * Prefers the lines written for this hour without always taking them. Always
 * would make the same two night lines the only thing he says after eleven, and
 * a good joke heard nightly is wallpaper.
 */
export const linesFor = (lines: AppLines, when: TimeOfDay): string[] => {
	const timed = lines[when]
	return timed && timed.length > 0 && Math.random() < 0.7 ? timed : lines.any
}

/**
 * Where a thing is worn. One of each at a time, and that is the whole reason the
 * places exist — a cap and a coffee are not competing for the same bit of him,
 * and before this they were, so putting the cap on took the coffee out of his
 * hand.
 *
 * `head` covers hair as well as hats on purpose. They are the two things that
 * would look worst together — a top hat sitting inside an afro — and letting
 * them share a place makes that impossible instead of making it a rule someone
 * has to remember. Everything else is separated by where it physically is.
 */
export type Where = 'body' | 'neck' | 'feet' | 'head' | 'face' | 'hand'

/**
 * Back to front. A cape is behind him, a cup is in front of everything, and the
 * two used to be drawn in whatever order the wardrobe happened to be in because
 * there was only ever one of them.
 */
export const WORN_ORDER: Where[] = ['body', 'neck', 'feet', 'head', 'face', 'hand']

/** Every drawn thing and the place it takes up, souvenirs included. */
export const WEARS: Record<string, Where> = {
	party: 'head',
	tophat: 'head',
	crown: 'head',
	flower: 'head',
	beanie: 'head',
	cap: 'head',
	hood: 'head',
	catears: 'head',
	headphones: 'head',
	duck: 'head',
	afro: 'head',
	mohawk: 'head',
	longhair: 'head',
	dust: 'head',
	shades: 'face',
	glasses: 'face',
	monocle: 'face',
	moustache: 'face',
	scarf: 'neck',
	tie: 'neck',
	bowtie: 'neck',
	cape: 'body',
	cobweb: 'body',
	coffee: 'hand',
	umbrella: 'hand',
	bolt: 'hand',
	sneakers: 'feet',
	wellies: 'feet',
}

/**
 * Something to wear, occasionally, for no reason he would explain. A pet
 * that puts on a party hat because it is your birthday is a feature; one
 * that does it on a Tuesday and takes it off a minute later is a character.
 *
 * Out here rather than inside the component because it is also the list the
 * preferences window offers when you pin one on him permanently. The souvenirs
 * are deliberately not in it, there or here: they are only ever found.
 */
export const PROPS = [
	'party',
	'tophat',
	'shades',
	'crown',
	'flower',
	'scarf',
	'coffee',
	'afro',
	'mohawk',
	'longhair',
	'beanie',
	'cap',
	'hood',
	'catears',
	'glasses',
	'moustache',
	'tie',
	'bowtie',
	'cape',
	'duck',
	'umbrella',
	'sneakers',
	'wellies',
	'monocle',
]

/**
 * Not chosen, ever. These only arrive on the way back from behind the screen —
 * a cobweb that turns up on a Tuesday for no reason is just another hat, and the
 * joke here is entirely the causation.
 */
export const SOUVENIRS = ['cobweb', 'bolt', 'dust']

/** One thing worn, and whether it is on its way off. */
export interface WornProp {
	kind: string
	leaving?: boolean
}

/**
 * Everything he has on right now, back to front.
 *
 * Two sources, and they are not equals: the pinned ones are the floor, and
 * whatever he picked up himself covers whatever was pinned *in that same place*.
 * When his own choice leaves, the place falls back to the pin and it is simply
 * there again — which is the same one-line trick the single pinned prop used,
 * once each thing knows where it sits.
 *
 * A pin whose place does not match what it is is dropped rather than drawn.
 * `tico.json` is editable by hand, and `{"head": "coffee"}` should cost you a
 * coffee, not a cup floating where his hat goes.
 */
export const wornFrom = (
	pinned: Record<string, string> | null | undefined,
	own: string | null,
	leaving = false
): WornProp[] => {
	const by = {} as Record<Where, WornProp>

	for (const [place, kind] of Object.entries(pinned ?? {})) {
		if (WEARS[kind] === place) by[place as Where] = { kind }
	}

	if (own && WEARS[own]) by[WEARS[own]] = { kind: own, leaving }

	return WORN_ORDER.filter((place) => by[place]).map((place) => by[place])
}

export const companionCopy: Record<Language, CompanionCopy> = { en, es }

/** What `auto` means. A saved choice is read in `App`, and wins over this. */
export const detectLanguage = (): Language =>
	navigator.language.toLowerCase().startsWith('es') ? 'es' : 'en'
