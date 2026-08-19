import { createRoot } from 'react-dom/client'

import { Prefs } from '../src/prefs/Prefs'
import type { Stored } from '../src/types'

import '../src/companion.css'
import '../src/prefs/prefs.css'

/**
 * The preferences window, in a browser, with the IPC faked.
 *
 * The same argument as `sheet.html`: this window is *drawn*, it has ten
 * categories and a grid of previews in each, and the only other way to look at
 * it is to build the Rust side and click through a tray menu. That is a slow
 * enough loop that it does not get done, and a layout nobody looks at is a
 * layout nobody fixes.
 *
 * Writes are logged rather than performed, so the state here only moves as far
 * as the optimistic update in the component — which is also the half worth
 * watching, since it is the half you see when you click.
 */
const STORED: Stored = {
	x: 0.86,
	chattiness: 'normal',
	size: 'normal',
	quiet_until: 0,
	in_call: 'peek',
	read_titles: false,
	language: 'es',
	house: true,
	parts: { shell: 'terminal', hands: 'mitts', feet: 'pills', antenna: 'led' },
	pinned_props: { head: 'cap', hand: 'coffee' },
}

const ANSWERS: Record<string, unknown> = { boot: STORED, autostart: false }

declare global {
	interface Window {
		__TAURI_INTERNALS__?: { transformCallback: () => number; invoke: (cmd: string) => unknown }
	}
}

window.__TAURI_INTERNALS__ = {
	transformCallback: () => 0,
	invoke: (cmd: string) => Promise.resolve(ANSWERS[cmd] ?? null),
}

// What `main.tsx` does before it renders: `companion.css` paints no background
// anywhere, and without this the window is drawn on top of nothing.
document.documentElement.dataset.window = 'prefs'

createRoot(document.getElementById('root') as HTMLElement).render(<Prefs />)
