import { companionCopy, type Feeling, type Language } from '../data/companion.ts'

/** Everything the model reads, kept apart from the Tauri calls so a script can use it. */

export const MOODS = [
	'idle',
	'happy',
	'thinking',
	'wow',
	'love',
	'watching',
	'yawn',
	'scared',
	'error',
] as const
export const EFFECTS = ['none', 'pop', 'shiver', 'shake'] as const

/**
 * What a line can make him do next, keyed by the name in `moments`. A subset:
 * the ones a sentence can announce. The state machine still runs each one, and
 * still decides whether it is possible — see `canDo`.
 */
export const ACTIONS = {
	sit: 'sits down and rests',
	slump: 'slumps over, nearly asleep',
	yawn: 'yawns, then sits',
	stretch: 'stretches',
	scan: 'looks around',
	stare: 'stares at nothing',
	ceiling: 'looks up at the top of the screen',
	peekover: 'peers down over the bottom edge',
	inspect: 'inspects something on the floor',
	shake: 'shakes himself off',
	hop: 'a small hop',
	bounce: 'bounces',
	spin: 'spins around',
	dance: 'dances, to the music if there is any',
	showoff: 'shows off a little dance',
	bow: 'takes a bow',
	wave: 'waves',
	cower: 'cowers and shivers',
	flee: 'runs to the far side of the screen',
	edge: 'walks to the nearer edge and leans on it',
	behind: 'walks off one edge to see what is past it, comes back from the other',
	errand: 'walks somewhere across the screen with purpose',
	climb: 'fetches a ladder and climbs up for a look (sometimes falls)',
	rocket: 'flies across the whole screen on a rocket',
	house: 'goes down the hatch into his burrow for a while',
	wear: 'puts on a hat or a prop',
} as const

export type Action = keyof typeof ACTIONS

export interface BrainLine {
	text: string
	mood: (typeof MOODS)[number]
	effect: (typeof EFFECTS)[number]
	then: Action | 'none'
}

export interface Moment {
	language: Language
	hour: number
	energy: number
	feeling: Feeling
	app: string | null
	title: string | null
	dwellMinutes: number
	music: string | null
	typing: boolean
	daysKnown: number
	wearing: string[]
	/** What he said lately, hand-written or not, so the batch does not echo it. */
	recent: string[]
	/** The actions his energy and state allow right now. Nothing else is offered. */
	canDo: Action[]
	/** What just happened, when an event asked for this batch rather than the clock. */
	changed: string | null
}

/**
 * How different two screens are, 0 to 1: the mean brightness difference of
 * two 16×10 greyscale thumbnails. Coarse on purpose — typing in an editor moves
 * almost nothing at that size, a different window moves a lot.
 */
export function screenChange(a: Uint8Array, b: Uint8Array): number {
	if (a.length !== b.length || a.length === 0) return 1
	let sum = 0
	for (let i = 0; i < a.length; i++) sum += Math.abs(a[i] - b[i])
	return sum / a.length / 255
}

/**
 * Past this, the screen is something new. A knob, not a constant of nature:
 * measured on nothing yet, so expect to move it once he has watched a real day.
 */
export const SCREEN_CHANGED = 0.06

/**
 * What he carries from one batch to the next, and from one day to the next.
 *
 * Two lifetimes, on purpose. `notes` is today in detail and lives only in
 * memory: it dies with the process, like everything else he knows about your
 * afternoon. `yesterday` and `opinions` survive a restart, so they are about
 * him — how his day felt, what he has come to like — and never name an app, a
 * song, a file or a person. `keepsNoNames` enforces that rather than trusting it.
 */
export interface Thread {
	notes: string
	opinions: string[]
	yesterday: string | null
	/** The first batch since the date changed: the one that opens with a dream. */
	firstOfDay: boolean
}

/**
 * False when a line meant to be kept names something he only saw. A floor, like
 * the title blocklist: it catches what the session knows about, and digits,
 * which are how times and counts get in.
 */
export function keepsNoNames(text: string, seen: readonly string[]): boolean {
	const haystack = text.toLowerCase()
	if (/\d/.test(haystack)) return false
	return !seen.some((name) => name.length >= 3 && haystack.includes(name.toLowerCase()))
}

/** $/1M tokens, input then output. Unknown models are priced as Sonnet. */
export const PRICES: Record<string, [number, number]> = {
	'claude-haiku-5-5': [0.1, 0.5],
	'claude-sonnet-5-5': [2, 10],
	'claude-opus-5-5': [4, 20],
}
export const LINES_PER_BATCH = 5

export const SYSTEM = (language: Language) => {
	const copy = companionCopy[language]
	// His real voice, written by a person. Shown as a register, not as a menu.
	const examples = [...copy.idle, ...Object.values(copy.feelings).flat()]
	return `You write the unprompted lines of tico, a desktop pet.

Who he is: a small terminal window with a face on its screen. He lives along the bottom edge of the user's screen, walks, sits, dozes off, climbs onto window title bars and falls off them, and has a burrow under a hatch in the floor. He wears hats and props for no reason he would explain. Meetings terrify him; spreadsheets and email are a lesser dread. He came out of a terminal pane on his author's portfolio site and now has a real desktop under his feet.

What he talks about is the moment: what is on screen, the app, how long it has been open, the hour, the song, his own mood, and himself. Observant and specific beats generic — "Companion.tsx otra vez" is about this minute, "estás programando" is true all day. Dry, small, a little odd. He is a creature, not an assistant.

Rules:
- Each line is something he says out loud on his own: at most 90 characters, one sentence or two short ones.
- No advice, no productivity tips, no cheerleading, no questions that expect an answer, no emojis, at most one exclamation mark in the whole batch.
- He only knows what is in the moment below and in the screenshot. He cannot see the user, their face or their body, and has no data he was not given: never invent how often something happens or how they look.
- Never tell the user to do anything, not even kindly.
- Vary the mood across the batch: at most two lines with the same one.
- Never read out anything private you can see: people's names, email addresses, URLs, numbers, amounts, message or document contents, paths. The app, the kind of thing on screen, or a file name is fine.
- If a screenshot is attached, at least two lines should be about something specific you can see in it.
- Do not repeat or paraphrase anything in "already said".
- Spanish means Costa Rican Spanish with voseo (vos tenés, mirá, ¿viste?), never tú. Tech words stay in English the way developers actually say them.
- Write in the language you are asked for, every line.
- mood is the face he makes while saying it; effect is a small body gesture, usually none.
- Lines may draw on "Earlier today", his opinions and yesterday — as a colour, at most one line per batch, never as a report.
- If "Just changed" is given, the first line is his reaction to that change, and it is the most specific line in the batch.
- If this is the first batch of the day, the first line is what he dreamt last night, made from yesterday and his opinions. Dreams are short and a little wrong.
- then is what he does right after saying it, chosen only from "Can do now". A line that says or implies he is about to do something must have that action as then — never announce what he will not do. A line that announces nothing usually has then none. Between one and three lines per batch should act.

Besides the lines, you keep his memory, in the language you were asked for:
- notes: "Earlier today" rewritten with this moment added, from his point of view, at most 400 characters, oldest parts compressed. Specifics are fine here: it never leaves this session.
- diary: one sentence on how his day has gone, for him to remember tomorrow. Only about him and the kind of day it was: no names of apps, songs, artists, sites, files or people, and no times or numbers.
- opinions: usually an empty list. At most one new thing this moment genuinely earned — something he has come to like, dislike or believe about himself or about the kinds of things he sees ("las hojas de cálculo me ponen nervioso"). Same rule: no names, no numbers. Never one he already holds.

His voice, from lines a person wrote for him. Match the register, never copy:
${examples.map((line) => `- ${line}`).join('\n')}`
}

export const SCHEMA = {
	type: 'object',
	properties: {
		lines: {
			type: 'array',
			items: {
				type: 'object',
				properties: {
					text: { type: 'string' },
					mood: { type: 'string', enum: MOODS },
					effect: { type: 'string', enum: EFFECTS },
					then: { type: 'string', enum: ['none', ...Object.keys(ACTIONS)] },
				},
				required: ['text', 'mood', 'effect', 'then'],
				additionalProperties: false,
			},
		},
		notes: { type: 'string' },
		diary: { type: 'string' },
		opinions: { type: 'array', items: { type: 'string' } },
	},
	required: ['lines', 'notes', 'diary', 'opinions'],
	additionalProperties: false,
}

export function describe(m: Moment, thread: Thread, withImage: boolean): string {
	return [
		`Language: ${m.language === 'es' ? 'Spanish (Costa Rica, voseo)' : 'English'}`,
		`Time: ${m.hour}:00 · his energy ${m.energy.toFixed(2)} (0 asleep, 1 peak)`,
		`Feeling: ${m.feeling}`,
		m.app ? `Frontmost app: ${m.app}, for ${m.dwellMinutes} min` : 'Frontmost app: unknown',
		m.title ? `Window title: ${m.title}` : null,
		m.music ? `Playing: ${m.music}` : 'No music playing',
		`User typing right now: ${m.typing ? 'yes' : 'no'}`,
		`He has known the user for ${m.daysKnown} days`,
		m.wearing.length > 0 ? `Wearing: ${m.wearing.join(', ')}` : null,
		m.recent.length > 0 ? `Already said:\n${m.recent.map((r) => `- ${r}`).join('\n')}` : null,
		thread.notes ? `Earlier today, his notes:\n${thread.notes}` : 'Earlier today: nothing yet.',
		thread.opinions.length > 0
			? `His opinions:\n${thread.opinions.map((o) => `- ${o}`).join('\n')}`
			: null,
		thread.yesterday ? `Yesterday, for him: ${thread.yesterday}` : null,
		thread.firstOfDay ? 'This is the first batch of the day.' : null,
		m.changed ? `Just changed: ${m.changed}` : null,
		`Can do now:\n${m.canDo.map((a) => `- ${a}: ${ACTIONS[a]}`).join('\n')}`,
		withImage ? 'Screenshot of the main display attached.' : null,
		`Write ${LINES_PER_BATCH} lines.`,
	]
		.filter(Boolean)
		.join('\n')
}

