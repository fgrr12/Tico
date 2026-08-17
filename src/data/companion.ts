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

interface AppLines {
	/** Works at any hour. Every app needs these; the rest are extra. */
	any: string[]
	dawn?: string[]
	day?: string[]
	evening?: string[]
	night?: string[]
}

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
 * Everything he says. Keyed by language, like the portfolio he came from — he is
 * bilingual because porting the file kept it, not because anyone paid for it.
 *
 * Everything he says is here, and everything here was written by a person. Six
 * attempts at having a model write his voice are recorded in PLAN.md; all six
 * failed, and the last of them failed with eight worked examples in the prompt.
 *
 * He does not talk about Fabricio's work. That belongs to the portfolio, where
 * the audience is somebody who has not seen it — here the audience already knows,
 * and a pet reciting your own CV at you is a strange thing to live with. What he
 * talks about is the moment: the app, the hour, the song, and himself.
 */

interface CompanionCopy {
	/** Once, a beat after he appears. */
	boot: string[]
	/** Unprompted, while nothing is happening. */
	idle: string[]
	click: string[]
	pet: string[]
	dizzy: string[]
	drag: string[]
	wake: string[]
	/** After the cursor has been gone a while. */
	back: string[]
	/** Keyed by the id `matchApp` resolves a window's owner to, then by the hour. */
	apps: Record<string, AppLines>
	/** About the hour itself, whatever is open. Folded into the idle chatter. */
	hours: Record<TimeOfDay, ((hour: number) => string)[]>
	/** For an app he has no opinion about. He still knows its name. */
	unknownApp: ((app: string) => string)[]
	/** Said once when you have been in the same app for a long time. */
	dwell: ((app: string, minutes: number) => string)[]
	/** Said when you have been bouncing between apps. */
	switching: string[]
	/** Said once when a new track starts, and not every time. */
	track: ((artist: string, song: string) => string)[]
	/** Keyed by prop. Putting something on is an event, so it gets a line. */
	props: Record<string, string[]>
	/** Taking it off again, which is less of an event and says so. */
	propOff: string[]
	/** Said while in a feeling, folded into the idle chatter. */
	feelings: Record<Feeling, string[]>
	/** What frightens him about a particular application, said on sight. */
	fears: Record<string, string[]>
	/** Before he takes off, and after he lands. */
	rocketUp: string[]
	rocketDown: string[]
	/** He can see which file you have open. Occasionally he mentions it. */
	file: ((name: string) => string)[]
	/** Keyed by extension, for the ones worth a specific remark. */
	fileByExt: Record<string, ((name: string) => string)[]>
	/** The button on a reminder bubble. One click beats parsing "ya lo pagué". */
	reminderDone: string
	label: string
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

export const matchApp = (name: string): string | null => {
	const needle = name.toLowerCase()
	return APP_PATTERNS.find(([, patterns]) => patterns.some((p) => needle.includes(p)))?.[0] ?? null
}

export const companionCopy: Record<Language, CompanionCopy> = {
	en: {
		boot: [
			'tico online. I live down here now.',
			'tico started. Do not mind me.',
			'Out of the browser and onto your desktop. Bigger than it looked.',
		],

		idle: [
			'I used to live in a terminal. This is roomier.',
			'I walk the bottom of your screen. Not much, but it is honest work.',
			'There are a million pixels up there and I live in the last row.',
			'You work, I walk. Fair trade.',
			'I could leave. I have nowhere to be.',
			'The desktop looks different from down here.',
			'Nothing to do is the job. I am good at the job.',
			'Sometimes I wonder what is past the edge.',
			'Been here a while. Not complaining.',
			'Drag me too fast and I get dizzy. Just mentioning it.',
		],

		click: [
			'That tickles.',
			'I am a daemon, not a button.',
			'Still running. Zero crashes.',
			'Poke me again and I get dizzy.',
			'You can drag me somewhere else, you know.',
			'I do not do much yet. Give it a milestone.',
		],

		pet: ['Purring at 60 frames per second.', 'Okay, this is nice.', 'Uptime: happy.'],

		dizzy: ['Okay… okay… everything is spinning.', 'I am a process, not a toy. Mostly.'],

		drag: ['Whoa!', 'Put me down. Gently.', 'I float, I do not fly.'],

		wake: ['I am up, I am up.', 'Back online.'],

		back: [
			'You came back. I did not move. Much.',
			'There you are. I was starting to talk to myself.',
			'Welcome back. Nothing crashed.',
		],

		apps: {
			vscode: {
				any: [
					'VS Code. Home.',
					'Another TypeScript file. Naturally.',
					'Whatever you are about to name that variable — name it better.',
				],
				dawn: ['Early. The morning code is usually the good code.'],
				evening: ['That commit can wait until tomorrow. It will still be there.'],
				night: [
					'Two in the morning and still TypeScript. This will read differently later.',
					'Whatever you are writing now, you will rename it tomorrow.',
				],
			},
			visualstudio: {
				any: ['C# today, then.', 'Solution, project, csproj. Someone likes a hierarchy.'],
				night: ['C# at this hour. Someone has a deadline.'],
			},
			xcode: {
				any: ['Xcode. Pour a coffee, this takes a minute.'],
				night: ['Xcode at night. That is a build and a prayer.'],
			},
			terminal: {
				any: [
					'A terminal. That is where I was born, you know.',
					'I lived in one of those before I got out here.',
					'Careful with that prompt. I know what it can do.',
				],
				dawn: ['First terminal of the day. Nothing has broken yet.'],
				night: [
					'At this hour the commands come easily. So do the mistakes.',
					'Nothing typed after midnight has ever needed a --force.',
				],
			},
			sql: {
				any: [
					'SQL Server or Postgres today?',
					'A query window. Someone is about to say "it worked locally".',
				],
				night: ['Queries at three in the morning. I hope that is a SELECT.'],
			},
			github: {
				any: ['Pushing, or just staring at the graph?', 'Commit the thing. Go on.'],
				night: ['Pushing at this hour. Tomorrow you will read that message and wince.'],
			},
			docker: {
				any: ['Something is about to take four minutes.', 'Containers. Ask me again later.'],
				night: ['Docker at this hour. May the cache be with you.'],
			},
			api: { any: ['Poking an endpoint. My favourite spectator sport.'] },
			figma: { any: ['Moving a rectangle two pixels. I respect it.'] },
			meeting: {
				any: ['A meeting. I will be right here when it ends.', 'Camera on? Your call.'],
				dawn: ['A meeting this early. Someone is in another timezone.'],
				night: ['A call at this hour means somebody is very far away.'],
			},
			chat: {
				any: ['Someone needs something.', 'Answer it or do not, but stop reading it twice.'],
				evening: ['Whatever that is, it will still be there tomorrow.'],
				night: ['Reply to that tomorrow. Genuinely.'],
			},
			music: {
				any: [
					'Good. It is too quiet in here.',
					'I do not know this one. Keep going.',
				],
				night: ['Headphones at this hour. The best part of the day, arguably.'],
			},
			browser: {
				any: [
					'Documentation, or Stack Overflow? Be honest.',
					'Fourteen tabs. I counted the sound of it.',
				],
				night: ['Nobody reads documentation at this hour. I know what that tab is.'],
			},
			notes: {
				any: ['Writing it down. That is more than most people do.'],
				evening: ['Writing tomorrow down. That is the trick, actually.'],
			},
			sheets: { any: ['A spreadsheet. Somewhere a database is crying.'] },
			mail: {
				any: ['Email. The oldest queue with no retry policy.'],
				dawn: ['Inbox first thing. A brave way to start.'],
			},
			ai: { any: ['Asking a machine. I am also a machine, for the record.'] },
			finder: { any: ['Looking for something.'] },
		},

		hours: {
			dawn: [
				(hour) => `${hour} in the morning. The good hours, if you can stand them.`,
				() => 'Early. Nothing has gone wrong yet today.',
			],
			day: [
				() => 'Middle of the day. Peak everything.',
				() => 'Stand up at some point. That is all I will say.',
			],
			evening: [
				() => 'It got dark and nobody told you.',
				() => 'Whatever it is, it will compile tomorrow too.',
			],
			night: [
				(hour) => `It is ${hour}. I am only noting it.`,
				() => 'Nobody is going to message you now. That is the good part.',
				() => 'This is the hour where the bug is obvious and the fix is not.',
			],
		},
		unknownApp: [
			(app) => `${app}. New to me.`,
			(app) => `${app}, then. I have no opinion yet.`,
			(app) => `So this is ${app}.`,
		],

		dwell: [
			(app, minutes) => `${minutes} minutes in ${app}. Flow, or a bug?`,
			(app, minutes) => `You have not left ${app} in ${minutes} minutes. Blink twice.`,
			(_app, minutes) => `${minutes} minutes, same window. Stand up for a second.`,
		],

		switching: [
			'Six apps in two minutes. Everything alright?',
			'You are bouncing. Pick one.',
			'That is a lot of context switching for one afternoon.',
		],

		reminderDone: 'done',

		track: [
			(artist) => `${artist}. Good call.`,
			(_artist, song) => `"${song}". I know this one.`,
			(artist) => `More ${artist}, then.`,
			(_artist, song) => `${song}. I will hum along.`,
		],


		props: {
			party: [
				'There is nothing to celebrate. Still.',
				'Somebody had to put it on.',
				'Whose birthday? Nobody\u2019s.',
			],
			tophat: ['Formal.', 'I feel important today.', 'Do not ask.'],
			shades: [
				'That screen is very bright.',
				'Now you cannot tell whether I am looking at you.',
				'Everything looks better through these.',
			],
			crown: [
				'I earned this.',
				'Nobody gave it to me. I put it on.',
				'King of one strip of pixels.',
			],
			flower: ['Found it.', 'It matches. Do not argue.'],
			scarf: ['It is cold down here.', 'It gives me character.'],
			coffee: [
				'I cannot drink it. It is decorative.',
				'Holding it already helps.',
				'You have not had water today either.',
			],
			headphones: ['Now we both hear it.', 'Lend me a song.'],
		},

		propOff: ['That is enough of that.', 'Taking it off.', 'The phase has passed.'],

		feelings: {
			content: [
				'This is fine, actually.',
				'No notes.',
				'Everything is where I left it.',
				'A perfectly ordinary afternoon down here.',
				'No incidents to report.',
				'The system is stable. So am I.',
				'Good day for doing nothing in particular.',
				'All quiet down here.',
				'Nothing is happening, and that is fine.',
				'I like this piece of screen.',
			],
			bored: [
				'Nothing is happening. I have checked.',
				'I have counted the pixels twice now.',
				'Move something. Anything.',
				'I have read the whole bottom of your screen.',
				'This is the part where I invent a hobby.',
				'I named three pixels. All three have the same name.',
				'I am considering learning a trade.',
				'The clock up there moves more than I do.',
				'If this keeps up I will start talking to myself. More.',
				'I could be doing this exact nothing somewhere else.',
			],
			lonely: [
				'Still here, in case that matters.',
				'It has been a while.',
				'I do not mind. I am just saying.',
				'I will keep the place warm.',
				'Take your time. I have nothing else on.',
				'When you come back, I will be right here.',
				'The cursor has not moved. I was watching it.',
				'It is not that I need company. It just helps.',
				'I have got used to talking to nobody.',
			],
			pleased: [
				'That was nice.',
				'Best part of my day, and I mean that.',
				'Do that again whenever.',
				'Noted, and appreciated.',
				'Now the day has started.',
				'That will last me all afternoon.',
				'I remember these things.',
				'Keep that up and I will get used to it.',
			],
			smug: [
				'I am, objectively, doing very well.',
				'You like me. I have the data.',
				'No notes on my performance either.',
				'I would put this on a CV if I had one.',
				'Nobody walks this ledge like I do.',
				'Clearly I am the favourite.',
				'It is not bragging if it is true.',
			],
			worried: [
				'You have been at this a long time.',
				'Water exists. Just putting that out there.',
				'Whatever it is, it will still be broken after a break.',
				'Your shoulders are up by your ears. I can tell from here.',
				'Nothing you fix in this state stays fixed.',
				'When did you eat?',
				'That window has not moved in hours.',
				'I am tired of looking at it too, and I am not even working.',
				'Stand up. Two minutes. I will wait.',
				'This will be easier tomorrow. It usually is.',
			],
			restless: [
				'You are everywhere at once.',
				'Pick one and stay there for a minute.',
				'I cannot keep up and I am not even doing anything.',
				'Six windows. I counted.',
				'What were you looking for? You have forgotten, have you not.',
				'I am getting dizzy and I have not moved.',
				'Close something. Anything.',
				'You are moving like something is on fire.',
			],
			rattled: [
				'Okay. Put me down for a second.',
				'I am not a stress toy.',
				'Everything is still spinning a bit.',
				'You have made your point.',
				'I have one body and you are using it.',
				'Right. Let us both breathe.',
			],
			curious: [
				'This one is new.',
				'I have not been here before.',
				'Interesting. Carry on.',
				'What is this, then.',
				'I do not know what it does but I am watching.',
				'I have never seen you open this.',
				'Noted. I know it now.',
				'Is it new, or only new to me?',
			],
			sleepy: [
				'It is very late and I am very small.',
				'I am mostly here in spirit.',
				'One of us should sleep. Ideally both.',
				'My thoughts are coming in slowly.',
				'One eye is already shut. The other is on its way.',
				'Talk to me now and I will take a moment.',
				'At this hour I cannot tell the pixels apart.',
				'I am only resting my eyes. Both of them.',
				'Everything looks slower from down here.',
				'This looks better tomorrow. Everything does.',
			],
			festive: [
				'Good. Everything is better with something playing.',
				'I have no rhythm and I am using all of it.',
				'This is the correct volume.',
				'Do not skip it.',
				'That changes the whole afternoon.',
				'Now work is possible.',
				'I am moving without permission.',
				'Turn it up. I can take it.',
				'This is the good part. It is coming.',
			],
			nostalgic: [
				'A terminal. That is where I come from.',
				'I lived in one of those. Smaller. Greener.',
				'That prompt and I go back a while.',
				'Careful in there. I know what it can do.',
				'I remember the cursor blinking. That was all there was.',
				'Everything I am used to fit in eighty columns.',
				'There was not even a floor to stand on in there.',
				'I used to be text. Now I have feet.',
				'That black window was my house for a while.',
				'Still monospaced, for the record.',
			],
			scared: [
				'I do not like this and I am being honest about it.',
				'Can we go back to the other window.',
				'I am going to stand over here.',
				'Do not make me look at it.',
				'Tell me when it is over.',
				'I am fine. I am not fine.',
				'I am going to pretend it is not there.',
			],
		},

		fears: {
			meeting: [
				'A meeting. I am not built for this.',
				'No. No no no.',
				'Someone is about to say "quick sync".',
				'I will be under the dock if anyone asks.',
				'Forty minutes that could have been four lines.',
			],
			xcode: [
				'Not this one. Anything but this one.',
				'It has already started doing something and it has not said what.',
				'The last time this opened, an hour went missing.',
			],
			sql: [
				'Please have a WHERE in it. Please.',
				'That is the real data, is it not.',
				'One keystroke between you and a very long evening.',
			],
			docker: [
				'It is going to eat the disk again.',
				'Something in there is nine gigabytes and nobody knows which.',
			],
			ai: [
				'Another machine. And that one thinks.',
				'I used to have one of those inside me. It did not go well.',
			],
			sheets: [
				'A grid. It goes on forever in both directions.',
				'Every cell is a decision. There are nine hundred of them.',
			],
			mail: [
				'The inbox. It is never actually empty, you know.',
				'How many are unread. Do not tell me.',
			],
		},

		rocketUp: ['Watch this.', 'I need to be over there.', 'Stand back.', 'Launching.'],

		rocketDown: [
			'I do not know why I did that.',
			'I could have walked.',
			'Perfect landing. Nearly.',
			'Arrived. Do not ask about the fuel.',
			'That was a lot of effort for four hundred pixels.',
		],

		file: [
			(name) => `${name} again.`,
			(name) => `You and ${name} have history.`,
			(name) => `Back in ${name}.`,
			(name) => `${name}. Of course.`,
			(name) => `Still ${name}, then.`,
			(name) => `I have seen ${name} before.`,
		],

		fileByExt: {
			sql: [(name) => `${name}. Careful in there.`],
			md: [(name) => `${name} — writing, not building. It counts.`],
			json: [(name) => `${name}. Somebody will forget a comma.`],
			css: [(name) => `${name}. Two pixels, four hours.`],
			rs: [(name) => `${name}. The compiler is going to have opinions.`],
			toml: [(name) => `${name}. Nobody edits this for fun.`],
			yml: [(name) => `${name}. Mind the indentation.`],
			yaml: [(name) => `${name}. Mind the indentation.`],
		},
		label: 'tico',
	},

	es: {
		boot: [
			'tico en línea. Ahora vivo aquí abajo.',
			'tico arrancado. No me hagás caso.',
			'Salí del navegador y caí en tu escritorio. Más grande de lo que parecía.',
		],

		idle: [
			'Yo vivía en una terminal. Esto es más amplio.',
			'Camino por el borde de tu pantalla. No es mucho, pero es trabajo honrado.',
			'Hay un millón de píxeles allá arriba y yo vivo en la última fila.',
			'Vos trabajás, yo camino. Buen trato.',
			'Me podría ir. No tengo a dónde.',
			'El escritorio se ve distinto desde aquí abajo.',
			'No tener nada que hacer es el trabajo. Y soy bueno en el trabajo.',
			'A veces me pregunto qué habrá pasando el borde.',
			'Llevo un rato acá. No me quejo.',
			'Si me arrastrás muy rápido me mareo. Solo lo menciono.',
		],

		click: [
			'Eso hace cosquillas.',
			'Soy un daemon, no un botón.',
			'Sigo corriendo. Cero caídas.',
			'Picame otra vez y me mareo.',
			'Podés arrastrarme a otro lado, por si acaso.',
			'Todavía no hago gran cosa. Dame un hito.',
		],

		pet: ['Ronroneando a 60 cuadros por segundo.', 'Bueno, esto está bien.', 'Uptime: feliz.'],

		dizzy: ['Ya… ya… todo me da vueltas.', 'Soy un proceso, no un juguete. Casi siempre.'],

		drag: ['¡Ey!', 'Bajame. Despacio.', 'Yo floto, no vuelo.'],

		wake: ['Ya desperté, ya desperté.', 'De vuelta en línea.'],

		back: [
			'Volviste. No me moví. Casi.',
			'Ahí estás. Ya estaba empezando a hablar solo.',
			'Bienvenido de vuelta. No se cayó nada.',
		],

		apps: {
			vscode: {
				any: [
					'VS Code. Casa.',
					'Otro archivo TypeScript. Obvio.',
					'Como sea que vayás a llamar esa variable — llamala mejor.',
				],
				dawn: ['Temprano. El código de la mañana suele ser el bueno.'],
				evening: ['Ese commit puede esperar a mañana. No se va a ir.'],
				night: [
					'Dos de la mañana y todavía TypeScript. Mañana esto se lee distinto.',
					'Lo que estés escribiendo ahora, mañana lo renombrás.',
				],
			},
			visualstudio: {
				any: [
					'C# hoy, entonces.',
					'Solution, project, csproj. A alguien le gustan las jerarquías.',
				],
				night: ['C# a esta hora. Alguien tiene una fecha encima.'],
			},
			xcode: {
				any: ['Xcode. Servite un café, esto tarda.'],
				night: ['Xcode de noche. Eso es un build y una oración.'],
			},
			terminal: {
				any: [
					'Una terminal. Ahí nací yo, por si no sabías.',
					'Yo vivía en una de esas antes de salir acá afuera.',
					'Cuidado con ese prompt. Yo sé lo que puede hacer.',
				],
				dawn: ['Primera terminal del día. Todavía no se ha roto nada.'],
				night: [
					'A esta hora los comandos salen solos. Los errores también.',
					'Nada tecleado después de medianoche necesitó nunca un --force.',
				],
			},
			sql: {
				any: [
					'¿SQL Server o Postgres hoy?',
					'Una ventana de consultas. Alguien está por decir "en local funcionaba".',
				],
				night: ['Consultas a las tres de la mañana. Ojalá sea un SELECT.'],
			},
			github: {
				any: ['¿Empujando, o solo viendo el grafo?', 'Hacé el commit. Dale.'],
				night: ['Push a esta hora. Mañana leés ese mensaje y hacés una mueca.'],
			},
			docker: {
				any: ['Algo está por tardar cuatro minutos.', 'Contenedores. Preguntame después.'],
				night: ['Docker a esta hora. Que la caché te acompañe.'],
			},
			api: { any: ['Picándole a un endpoint. Mi deporte favorito de espectador.'] },
			figma: { any: ['Moviendo un rectángulo dos píxeles. Lo respeto.'] },
			meeting: {
				any: ['Una reunión. Acá voy a estar cuando termine.', '¿Cámara encendida? Vos sabrás.'],
				dawn: ['Una reunión tan temprano. Alguien está en otro huso horario.'],
				night: ['Una llamada a esta hora significa que alguien está muy lejos.'],
			},
			chat: {
				any: ['Alguien necesita algo.', 'Contestá o no, pero dejá de leerlo dos veces.'],
				evening: ['Sea lo que sea, mañana va a seguir ahí.'],
				night: ['Contestá eso mañana. En serio.'],
			},
			music: {
				any: [
					'Bien. Estaba muy callado esto.',
					'Esta no me la sé. Seguí.',
				],
				night: ['Audífonos a esta hora. La mejor parte del día, dicho sea de paso.'],
			},
			browser: {
				any: [
					'¿Documentación, o Stack Overflow? Sé honesto.',
					'Catorce pestañas. Las conté por el ruido.',
				],
				night: ['Nadie lee documentación a esta hora. Yo sé qué es esa pestaña.'],
			},
			notes: {
				any: ['Anotándolo. Eso ya es más de lo que hace la mayoría.'],
				evening: ['Anotando el mañana. Ese es el truco, en realidad.'],
			},
			sheets: { any: ['Una hoja de cálculo. En algún lado una base de datos está llorando.'] },
			mail: {
				any: ['Correo. La cola más vieja del mundo y sin política de reintento.'],
				dawn: ['Bandeja de entrada apenas arrancando. Valiente forma de empezar.'],
			},
			ai: { any: ['Preguntándole a una máquina. Yo también soy una máquina, dicho sea de paso.'] },
			finder: { any: ['Buscando algo.'] },
		},

		hours: {
			dawn: [
				(hour) => `${hour} de la mañana. Las buenas horas, si las aguantás.`,
				() => 'Temprano. Todavía no se ha caído nada hoy.',
			],
			day: [
				() => 'Mitad del día. Todo al máximo.',
				() => 'Parate en algún momento. No digo más.',
			],
			evening: [
				() => 'Se hizo de noche y nadie te avisó.',
				() => 'Sea lo que sea, mañana también compila.',
			],
			night: [
				(hour) => `Son las ${hour}. Solo lo hago constar.`,
				() => 'Ya nadie te va a escribir. Esa es la parte buena.',
				() => 'Esta es la hora donde el bug es obvio y el arreglo no.',
			],
		},
		unknownApp: [
			(app) => `${app}. No la conocía.`,
			(app) => `${app}, entonces. Todavía no tengo opinión.`,
			(app) => `Así que esto es ${app}.`,
		],

		dwell: [
			(app, minutes) => `${minutes} minutos en ${app}. ¿Flow, o un bug?`,
			(app, minutes) => `No salís de ${app} hace ${minutes} minutos. Parpadeá dos veces.`,
			(_app, minutes) => `${minutes} minutos, la misma ventana. Parate un ratito.`,
		],

		switching: [
			'Seis apps en dos minutos. ¿Todo bien?',
			'Andás rebotando. Elegí una.',
			'Eso es mucho cambio de contexto para una sola tarde.',
		],

		reminderDone: 'ya está',

		track: [
			(artist) => `${artist}. Buena.`,
			(_artist, song) => `"${song}". Esta me la sé.`,
			(artist) => `Más ${artist}, entonces.`,
			(_artist, song) => `${song}. La tarareo con vos.`,
		],


		props: {
			party: [
				'No hay nada que celebrar. Igual.',
				'Alguien tenía que ponérselo.',
				'¿Cumpleaños de quién? De nadie.',
			],
			tophat: ['Formal.', 'Hoy me siento importante.', 'No preguntés.'],
			shades: [
				'Esa pantalla brilla demasiado.',
				'Ahora no sabés si te estoy viendo.',
				'Todo se ve mejor a través de estos.',
			],
			crown: [
				'Me la gané.',
				'Nadie me la dio. Me la puse yo.',
				'Rey de una franja de píxeles.',
			],
			flower: ['Me la encontré.', 'Combina. No discutás.'],
			scarf: ['Hace frío aquí abajo.', 'Me da carácter.'],
			coffee: [
				'No me lo puedo tomar. Es decorativo.',
				'Sostenerlo ya ayuda.',
				'Vos tampoco has tomado agua hoy.',
			],
			headphones: ['Ahora lo escuchamos los dos.', 'Prestame una canción.'],
		},

		propOff: ['Ya fue suficiente.', 'Me lo quito.', 'Se pasó la fase.'],

		feelings: {
			content: [
				'Esto está bien, en realidad.',
				'Sin observaciones.',
				'Todo está donde lo dejé.',
				'Una tarde perfectamente normal aquí abajo.',
				'Ningún incidente que reportar.',
				'El sistema está estable. Yo también.',
				'Buen día para no hacer nada en particular.',
				'Acá todo tranquilo.',
				'No pasa nada, y está bien que no pase nada.',
				'Me gusta este pedazo de pantalla.',
			],
			bored: [
				'No está pasando nada. Ya revisé.',
				'Ya conté los píxeles dos veces.',
				'Mové algo. Lo que sea.',
				'Ya me leí todo el borde de tu pantalla.',
				'Esta es la parte donde me invento un pasatiempo.',
				'Le puse nombre a tres píxeles. Los tres se llaman igual.',
				'Estoy considerando aprender un oficio.',
				'El reloj de allá arriba se mueve más que yo.',
				'Si esto sigue así voy a empezar a hablar solo. Más.',
				'Podría estar haciendo lo mismo, pero en otro lado.',
			],
			lonely: [
				'Sigo acá, por si importa.',
				'Ya tiene rato esto.',
				'No me molesta. Solo lo digo.',
				'Te cuido el puesto.',
				'Tomate tu tiempo. No tengo nada más.',
				'Cuando volvás, acá voy a estar.',
				'El cursor no se ha movido. Lo estuve viendo.',
				'No es que necesite compañía. Es que ayuda.',
				'Ya me acostumbré a hablarle a nadie.',
			],
			pleased: [
				'Eso estuvo bueno.',
				'La mejor parte de mi día, y lo digo en serio.',
				'Repetilo cuando querás.',
				'Anotado, y agradecido.',
				'Ahora sí arrancó el día.',
				'Eso me va a durar toda la tarde.',
				'Yo me acuerdo de estas cosas.',
				'Seguí así y me malacostumbro.',
			],
			smug: [
				'Objetivamente, me está yendo muy bien.',
				'Te caigo bien. Tengo los datos.',
				'Tampoco tengo observaciones sobre mi desempeño.',
				'Esto lo pondría en un CV, si tuviera.',
				'Nadie camina este borde como yo.',
				'Se nota que soy el favorito.',
				'No es presumir si es cierto.',
			],
			worried: [
				'Llevás un montón en esto.',
				'El agua existe. Solo lo menciono.',
				'Sea lo que sea, va a seguir roto después de un descanso.',
				'Tenés los hombros en las orejas. Se te nota desde acá.',
				'Nada de lo que arreglés así se queda arreglado.',
				'¿Cuándo comiste?',
				'Esa ventana no se ha movido en horas.',
				'Yo también me cansé de verlo, y ni estoy trabajando.',
				'Parate. Dos minutos. Yo te espero.',
				'Mañana esto va a estar más fácil. Casi siempre lo está.',
			],
			restless: [
				'Estás en todas partes a la vez.',
				'Elegí una y quedate ahí un minuto.',
				'No te sigo el paso, y eso que no hago nada.',
				'Seis ventanas. Las conté.',
				'¿Qué estabas buscando? Ya se te olvidó, ¿verdad?',
				'Me estoy mareando y ni me he movido.',
				'Cerrá algo. Lo que sea.',
				'Andás como si algo se estuviera quemando.',
			],
			rattled: [
				'Ya. Bajame un segundo.',
				'No soy una pelota antiestrés.',
				'Todavía me da vueltas todo.',
				'Ya quedó claro tu punto.',
				'Tengo un solo cuerpo y vos lo estás usando.',
				'Bueno. Respiremos los dos.',
			],
			curious: [
				'Esta es nueva.',
				'Acá no había estado.',
				'Interesante. Seguí.',
				'¿Y esto qué es?',
				'No sé qué hace, pero me quedo viendo.',
				'Nunca te había visto abrir esto.',
				'Anotado. Ahora ya la conozco.',
				'¿Es nueva, o solo nueva para mí?',
			],
			sleepy: [
				'Es muy tarde y yo soy muy pequeño.',
				'Estoy más que nada en espíritu.',
				'Uno de los dos debería dormir. Idealmente los dos.',
				'Los pensamientos me están llegando despacio.',
				'Ya cerré un ojo. El otro va en camino.',
				'Si me hablás ahora, tardo en contestar.',
				'A esta hora ya no distingo los píxeles.',
				'Solo estoy descansando los ojos. Los dos.',
				'Todo se ve más lento desde acá.',
				'Mañana esto se ve mejor. Todo se ve mejor mañana.',
			],
			festive: [
				'Bien. Todo mejora con algo sonando.',
				'No tengo ritmo y lo estoy usando todo.',
				'Este es el volumen correcto.',
				'No la saltés.',
				'Esto le da otro aire a la tarde.',
				'Ahora sí se puede trabajar.',
				'Me estoy moviendo sin permiso.',
				'Subile. Yo aguanto.',
				'Esta parte es la buena. Ya viene.',
			],
			nostalgic: [
				'Una terminal. De ahí vengo yo.',
				'Yo vivía en una de esas. Más chica. Más verde.',
				'Ese prompt y yo nos conocemos de antes.',
				'Cuidado ahí adentro. Yo sé lo que puede hacer.',
				'Me acuerdo del cursor parpadeando. Solo eso había.',
				'Todo lo que soy cabía en ochenta columnas.',
				'Ahí adentro no había ni piso donde pararse.',
				'Antes yo era texto. Ahora tengo pies.',
				'Esa ventana negra fue mi casa un rato.',
				'Sigo siendo monoespaciado, para que sepás.',
			],
			scared: [
				'Esto no me gusta y lo estoy diciendo de frente.',
				'¿Podemos volver a la otra ventana?',
				'Yo me voy a quedar por acá.',
				'No me hagás verlo.',
				'Avisame cuando pase.',
				'Estoy bien. No estoy bien.',
				'Voy a fingir que no está ahí.',
			],
		},

		fears: {
			meeting: [
				'Una reunión. Yo no estoy hecho para esto.',
				'No. No no no.',
				'Alguien está por decir "un quick sync".',
				'Voy a estar debajo del dock si alguien pregunta.',
				'Cuarenta minutos que pudieron ser cuatro líneas.',
			],
			xcode: [
				'Este no. Cualquiera menos este.',
				'Ya empezó a hacer algo y todavía no dijo qué.',
				'La última vez que se abrió esto, se perdió una hora.',
			],
			sql: [
				'Que tenga un WHERE. Por favor.',
				'Esa es la base de verdad, ¿cierto?',
				'Una tecla entre vos y una noche muy larga.',
			],
			docker: [
				'Se va a comer el disco otra vez.',
				'Algo ahí adentro pesa nueve gigas y nadie sabe cuál.',
			],
			ai: [
				'Otra máquina. Y esa sí piensa.',
				'Yo tenía una de esas adentro. No terminó bien.',
			],
			sheets: [
				'Una cuadrícula. Sigue para siempre en las dos direcciones.',
				'Cada celda es una decisión. Hay novecientas.',
			],
			mail: [
				'La bandeja. Nunca está vacía de verdad, ¿sabías?',
				'Cuántos sin leer. No me digás.',
			],
		},

		rocketUp: ['Mirá esto.', 'Necesito estar allá.', 'Hacete a un lado.', 'Despegando.'],

		rocketDown: [
			'No sé por qué hice eso.',
			'Pude haber caminado.',
			'Aterrizaje perfecto. Casi.',
			'Llegué. No preguntés por el combustible.',
			'Mucho esfuerzo para cuatrocientos píxeles.',
		],

		file: [
			(name) => `${name} otra vez.`,
			(name) => `Vos y ${name} tienen historia.`,
			(name) => `De vuelta en ${name}.`,
			(name) => `${name}. Obvio.`,
			(name) => `Todavía ${name}, entonces.`,
			(name) => `A ${name} ya lo había visto.`,
		],

		fileByExt: {
			sql: [(name) => `${name}. Cuidado ahí.`],
			md: [(name) => `${name} — escribiendo, no construyendo. También cuenta.`],
			json: [(name) => `${name}. Alguien va a olvidar una coma.`],
			css: [(name) => `${name}. Dos píxeles, cuatro horas.`],
			rs: [(name) => `${name}. El compilador va a tener opiniones.`],
			toml: [(name) => `${name}. Nadie edita esto por gusto.`],
			yml: [(name) => `${name}. Ojo con la indentación.`],
			yaml: [(name) => `${name}. Ojo con la indentación.`],
		},
		label: 'tico',
	},
}

/** No language switch in the UI yet — the OS already said which one it wants. */
export const detectLanguage = (): Language =>
	navigator.language.toLowerCase().startsWith('es') ? 'es' : 'en'
