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
		label: 'tico',
	},
}

/** No language switch in the UI yet — the OS already said which one it wants. */
export const detectLanguage = (): Language =>
	navigator.language.toLowerCase().startsWith('es') ? 'es' : 'en'
