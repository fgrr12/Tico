import { companionCopy, type Feeling, type Language } from '../data/companion'

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

export interface BrainLine {
	text: string
	mood: (typeof MOODS)[number]
	effect: (typeof EFFECTS)[number]
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
				},
				required: ['text', 'mood', 'effect'],
				additionalProperties: false,
			},
		},
	},
	required: ['lines'],
	additionalProperties: false,
}

export function describe(m: Moment, withImage: boolean): string {
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
		withImage ? 'Screenshot of the main display attached.' : null,
		`Write ${LINES_PER_BATCH} lines.`,
	]
		.filter(Boolean)
		.join('\n')
}

