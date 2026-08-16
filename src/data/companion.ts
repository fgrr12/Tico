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
	label: string
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

		label: 'tico',
	},
}

/** No language switch in the UI yet — the OS already said which one it wants. */
export const detectLanguage = (): Language =>
	navigator.language.toLowerCase().startsWith('es') ? 'es' : 'en'
