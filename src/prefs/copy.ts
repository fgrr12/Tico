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
	groups: { body: string; worn: string }
	slots: { shell: string; hands: string; feet: string; antenna: string }
	places: { head: string; face: string; neck: string; body: string; hand: string; feet: string }
	pin: { hint: string; none: string }
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
		groups: { body: 'What he is', worn: 'What he wears' },
		slots: { shell: 'Body', hands: 'Hands', feet: 'Feet', antenna: 'Antenna' },
		places: {
			head: 'Head',
			face: 'Face',
			neck: 'Neck',
			body: 'Back',
			hand: 'Hand',
			feet: 'Shoes',
		},
		pin: {
			hint: 'One per place, so a cap and a coffee are not the same decision. He still tries other things on — this is what he goes back to.',
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
		groups: { body: 'Lo que es', worn: 'Lo que lleva' },
		slots: { shell: 'Cuerpo', hands: 'Manos', feet: 'Pies', antenna: 'Antena' },
		places: {
			head: 'Cabeza',
			face: 'Cara',
			neck: 'Cuello',
			body: 'Espalda',
			hand: 'Mano',
			feet: 'Zapatos',
		},
		pin: {
			hint: 'Uno por sitio, así que una gorra y un café no son la misma decisión. Igual se prueba otras cosas — esto es a lo que vuelve.',
			none: 'Nada',
		},
	},
}
