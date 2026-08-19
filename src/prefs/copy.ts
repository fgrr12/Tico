import type { Language } from '../data/companion'

/**
 * The window's own words, in both languages, exactly like his lines.
 *
 * Kept here rather than in `data/copy` on purpose: that file is his voice, and
 * this is furniture. Nothing in here is ever said out loud. The rule it does
 * follow is the one that matters — every string is data, keyed by language, and
 * neither language is allowed to be the incomplete one.
 *
 * The two pickers have no copy at all. A body and a hat are shown by drawing
 * them, which needs no name, survives translation, and is the only honest label
 * for a drawing anyway.
 */
interface PrefsCopy {
	tabs: { settings: string; body: string }
	chattiness: { label: string; hint: string; quiet: string; normal: string; chatty: string }
	size: { label: string; small: string; normal: string; large: string }
	inCall: { label: string; hint: string; peek: string; hide: string; ignore: string }
	language: { label: string; auto: string; en: string; es: string }
	house: { label: string; hint: string }
	titles: { label: string; hint: string }
	autostart: { label: string; hint: string }
	slots: { shell: string; hands: string; feet: string; antenna: string }
	pin: { label: string; hint: string; none: string }
}

export const prefsCopy: Record<Language, PrefsCopy> = {
	en: {
		tabs: { settings: 'Settings', body: 'Tico' },
		chattiness: {
			label: 'Chattiness',
			hint: 'How often he says something nobody asked for.',
			quiet: 'Quiet',
			normal: 'Normal',
			chatty: 'Chatty',
		},
		size: { label: 'Size', small: 'Small', normal: 'Normal', large: 'Large' },
		inCall: {
			label: 'In a call',
			hint: 'What he does while a microphone is live.',
			peek: 'Peek from the corner',
			hide: 'Get out of the way',
			ignore: 'Carry on',
		},
		language: { label: 'Language', auto: 'Follow the system', en: 'English', es: 'Español' },
		house: { label: 'Burrow', hint: 'The hatch in the floor, and somewhere to go down to.' },
		titles: {
			label: 'Read window titles',
			hint: 'Needs Accessibility, and is the only thing here that does. He reads the name of a document and never keeps it.',
		},
		autostart: { label: 'Start at login', hint: '' },
		slots: { shell: 'Body', hands: 'Hands', feet: 'Feet', antenna: 'Antenna' },
		pin: {
			label: 'Always wearing',
			hint: 'He still tries other things on. This is what he goes back to.',
			none: 'Nothing',
		},
	},
	es: {
		tabs: { settings: 'Ajustes', body: 'Tico' },
		chattiness: {
			label: 'Charla',
			hint: 'Cada cuánto dice algo que nadie le pidió.',
			quiet: 'Callado',
			normal: 'Normal',
			chatty: 'Hablador',
		},
		size: { label: 'Tamaño', small: 'Pequeño', normal: 'Normal', large: 'Grande' },
		inCall: {
			label: 'En una llamada',
			hint: 'Qué hace mientras hay un micrófono abierto.',
			peek: 'Asomarse desde la esquina',
			hide: 'Quitarse de en medio',
			ignore: 'Seguir a lo suyo',
		},
		language: { label: 'Idioma', auto: 'Seguir al sistema', en: 'English', es: 'Español' },
		house: { label: 'Madriguera', hint: 'La trampilla en el suelo, y un sitio al que bajar.' },
		titles: {
			label: 'Leer títulos de ventana',
			hint: 'Necesita Accesibilidad, y es lo único aquí que la necesita. Lee el nombre de un documento y nunca se lo queda.',
		},
		autostart: { label: 'Arrancar al iniciar sesión', hint: '' },
		slots: { shell: 'Cuerpo', hands: 'Manos', feet: 'Pies', antenna: 'Antena' },
		pin: {
			label: 'Siempre puesto',
			hint: 'Igual se prueba otras cosas. Esto es a lo que vuelve.',
			none: 'Nada',
		},
	},
}
