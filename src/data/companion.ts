export type Language = 'en' | 'es'

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
	/** Keyed by the id `matchApp` resolves a window's owner to. */
	apps: Record<string, string[]>
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
			vscode: [
				'VS Code. Home.',
				'Another TypeScript file. Naturally.',
				'Whatever you are about to name that variable — name it better.',
			],
			visualstudio: [
				'The other half of the CV.',
				'C# today. The stack nobody expects him to also know.',
			],
			xcode: ['Xcode. Pour a coffee, this takes a minute.'],
			terminal: [
				'A terminal. That is where I was born, you know.',
				'I lived in one of those before I got out here.',
				'Careful with that prompt. I know what it can do.',
			],
			sql: [
				'SQL Server or Postgres today?',
				'A query window. Someone is about to say "it worked locally".',
			],
			github: ['Pushing, or just staring at the graph?', 'Commit the thing. Go on.'],
			docker: ['Something is about to take four minutes.', 'Containers. Ask me again later.'],
			api: ['Poking an endpoint. My favourite spectator sport.'],
			figma: ['Design. He does that too, and he knows he is not a designer.'],
			meeting: ['A meeting. I will be right here when it ends.', 'Camera on? Your call.'],
			chat: ['Someone needs something.', 'Answer it or do not, but stop reading it twice.'],
			music: [
				'Music. He built Lyra for exactly this moment — the lyrics float on top.',
				'Whatever this is, Lyra would be showing you the words right now.',
			],
			browser: [
				'Documentation, or Stack Overflow? Be honest.',
				'Fourteen tabs. I counted the sound of it.',
			],
			notes: ['Writing it down. That is more than most people do.'],
			sheets: ['A spreadsheet. Somewhere a database is crying.'],
			mail: ['Email. The oldest queue with no retry policy.'],
			ai: ['Talking to a model. I am getting one of those in M3.'],
			finder: ['Looking for something.'],
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
			vscode: [
				'VS Code. Casa.',
				'Otro archivo TypeScript. Obvio.',
				'Como sea que vayás a llamar esa variable — llamala mejor.',
			],
			visualstudio: [
				'La otra mitad del CV.',
				'C# hoy. El stack que nadie espera que también maneje.',
			],
			xcode: ['Xcode. Servite un café, esto tarda.'],
			terminal: [
				'Una terminal. Ahí nací yo, por si no sabías.',
				'Yo vivía en una de esas antes de salir acá afuera.',
				'Cuidado con ese prompt. Yo sé lo que puede hacer.',
			],
			sql: [
				'¿SQL Server o Postgres hoy?',
				'Una ventana de consultas. Alguien está por decir "en local funcionaba".',
			],
			github: ['¿Empujando, o solo viendo el grafo?', 'Hacé el commit. Dale.'],
			docker: ['Algo está por tardar cuatro minutos.', 'Contenedores. Preguntame después.'],
			api: ['Picándole a un endpoint. Mi deporte favorito de espectador.'],
			figma: ['Diseño. También lo hace, y sabe que no es diseñador.'],
			meeting: ['Una reunión. Acá voy a estar cuando termine.', '¿Cámara encendida? Vos sabrás.'],
			chat: ['Alguien necesita algo.', 'Contestá o no, pero dejá de leerlo dos veces.'],
			music: [
				'Música. Para este momento exacto construyó Lyra — la letra flota encima.',
				'Sea lo que sea esto, Lyra te estaría mostrando la letra ahora mismo.',
			],
			browser: [
				'¿Documentación, o Stack Overflow? Sé honesto.',
				'Catorce pestañas. Las conté por el ruido.',
			],
			notes: ['Anotándolo. Eso ya es más de lo que hace la mayoría.'],
			sheets: ['Una hoja de cálculo. En algún lado una base de datos está llorando.'],
			mail: ['Correo. La cola más vieja del mundo y sin política de reintento.'],
			ai: ['Hablando con un modelo. A mí me ponen uno en M3.'],
			finder: ['Buscando algo.'],
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

		label: 'tico',
	},
}

/** No language switch in the UI yet — the OS already said which one it wants. */
export const detectLanguage = (): Language =>
	navigator.language.toLowerCase().startsWith('es') ? 'es' : 'en'
