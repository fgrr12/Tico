export type Language = 'en' | 'es'

/**
 * Four buckets, not twenty-four. What is different about a person at 02:00 is
 * not subtly different from 01:00 — it is a different kind of evening — and
 * lines written per hour would be twenty-four sets of nearly the same joke.
 */
export type TimeOfDay = 'dawn' | 'day' | 'evening' | 'night'

export const timeOfDay = (hour: number = new Date().getHours()): TimeOfDay =>
	hour >= 23 || hour < 5 ? 'night' : hour < 9 ? 'dawn' : hour < 18 ? 'day' : 'evening'

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
 * M1 is the pet with no model behind it, so this is only what he can say on his
 * own: the lines about the work, and the lines about being handled. The buckets
 * that need something to talk *about* — the app you are in, the projects, the
 * answers — arrive with M2 and M3 rather than sitting here empty.
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
	/** The ask hotkey, and what comes back from it. */
	askPlaceholder: string
	thinking: string[]
	/** No model installed. Has to be useful, not just apologetic. */
	noBrain: string[]
	brainError: string[]
	/**
	 * What he says after doing something. Written rather than generated on
	 * purpose: these fire on every action, they are the lines most often seen,
	 * and a template with a real filename in it beats anything a 3B produces.
	 */
	opening: (name: string) => string
	revealing: (name: string) => string
	openingUrl: (host: string) => string
	notFound: (query: string) => string
	/** Said once when a new track starts, and not every time. */
	track: ((artist: string, song: string) => string)[]
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
			'Two stacks: TypeScript and .NET. They rarely share a CV.',
			'He is building access control for a university campus right now.',
			'Fourteen projects shipped. None of them invented.',
			'Costa Rica. GMT-6. Remote.',
			'Rust in Lyra, C# at work, TypeScript nearly everywhere else.',
			'Offline-first is not a feature. There is no signal in a chicken house.',
			'Guards use his PWA at 4am. That is why it works without a network.',
			'He has been shipping since 2017. No restarts.',
			'The farm app listens. You speak, Whisper transcribes, a schema does the rest.',
			'I used to live in a terminal. This is roomier.',
			'I walk the bottom of your screen. Not much, but it is honest work.',
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
				any: ['The other half of the CV.', 'C# today. The stack nobody expects him to also know.'],
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
			figma: { any: ['Design. He does that too, and he knows he is not a designer.'] },
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
					'Music. He built Lyra for exactly this moment — the lyrics float on top.',
					'Whatever this is, Lyra would be showing you the words right now.',
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
			ai: { any: ['Talking to a model. I have one of those now. It is small.'] },
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

		askPlaceholder: 'ask me something…',

		thinking: ['Thinking…', 'One second.', 'Let me look that up in myself.'],

		noBrain: [
			'No brain installed. Get Ollama and pull a small model — I will find it.',
			'I can walk, but I cannot think yet. `brew install ollama`, then `ollama pull qwen3:1.7b`.',
		],

		brainError: [
			'Something went wrong in there. Ask me again?',
			'That did not come back right. Try once more.',
		],

		opening: (name) => `Opening ${name}.`,
		revealing: (name) => `There it is — ${name}.`,
		openingUrl: (host) => `Off to ${host}.`,
		notFound: (query) => `Nothing called "${query}" that I can find.`,

		reminderDone: 'done',

		track: [
			(artist) => `${artist}. Good call.`,
			(_artist, song) => `"${song}". I know this one.`,
			(artist) => `More ${artist}, then.`,
			(_artist, song) => `${song}. I will hum along.`,
		],

		label: 'tico',
	},

	es: {
		boot: [
			'tico en línea. Ahora vivo aquí abajo.',
			'tico arrancado. No me hagás caso.',
			'Salí del navegador y caí en tu escritorio. Más grande de lo que parecía.',
		],

		idle: [
			'Dos stacks: TypeScript y .NET. Rara vez comparten un CV.',
			'Ahora mismo está construyendo control de acceso para un campus universitario.',
			'Catorce proyectos entregados. Ninguno inventado.',
			'Costa Rica. GMT-6. Remoto.',
			'Rust en Lyra, C# en el trabajo, TypeScript casi en todo lo demás.',
			'Offline-first no es una feature. En una galera no hay señal.',
			'Los guardas usan su PWA a las 4am. Por eso funciona sin red.',
			'Lleva entregando desde 2017. Sin reinicios.',
			'La app de la finca escucha. Usted habla, Whisper transcribe, el esquema hace el resto.',
			'Yo vivía en una terminal. Esto es más amplio.',
			'Camino por el borde de tu pantalla. No es mucho, pero es trabajo honrado.',
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
					'La otra mitad del CV.',
					'C# hoy. El stack que nadie espera que también maneje.',
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
			figma: { any: ['Diseño. También lo hace, y sabe que no es diseñador.'] },
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
					'Música. Para este momento exacto construyó Lyra — la letra flota encima.',
					'Sea lo que sea esto, Lyra te estaría mostrando la letra ahora mismo.',
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
			ai: { any: ['Hablando con un modelo. Yo ya tengo uno. Es chiquito.'] },
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

		askPlaceholder: 'preguntame algo…',

		thinking: ['Pensando…', 'Un segundo.', 'Dejame buscarlo dentro de mí.'],

		noBrain: [
			'No tengo cerebro instalado. Conseguí Ollama y bajá un modelo chiquito — yo lo encuentro.',
			'Caminar puedo, pensar todavía no. `brew install ollama`, después `ollama pull qwen3:1.7b`.',
		],

		brainError: [
			'Algo se rompió ahí adentro. ¿Me preguntás de nuevo?',
			'Eso no volvió bien. Probá otra vez.',
		],

		opening: (name) => `Abriendo ${name}.`,
		revealing: (name) => `Ahí está — ${name}.`,
		openingUrl: (host) => `Vamos a ${host}.`,
		notFound: (query) => `No encontré nada que se llame "${query}".`,

		reminderDone: 'ya está',

		track: [
			(artist) => `${artist}. Buena.`,
			(_artist, song) => `"${song}". Esta me la sé.`,
			(artist) => `Más ${artist}, entonces.`,
			(_artist, song) => `${song}. La tarareo con vos.`,
		],

		label: 'tico',
	},
}

/** No language switch in the UI yet — the OS already said which one it wants. */
export const detectLanguage = (): Language =>
	navigator.language.toLowerCase().startsWith('es') ? 'es' : 'en'
