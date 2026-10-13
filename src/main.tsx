import React from 'react'
import ReactDOM from 'react-dom/client'

import App from './App'
import { Ask } from './ask/Ask'
import { Prefs } from './prefs/Prefs'
import './companion.css'
import './prefs/prefs.css'
import './ask/ask.css'

/**
 * Two windows, one bundle, and the hash is the whole router.
 *
 * A second entry point would mean a second `index.html`, a second Vite input and
 * two builds to keep in step, for a page that imports the same components as the
 * first one. The strip never has a hash; Rust opens the other window with one.
 *
 * The attribute is what lets `prefs.css` undo the strip's transparency. The pet's
 * stylesheet paints nothing anywhere, which is the only way a transparent overlay
 * works — and is also exactly how you get an invisible settings window.
 */
const prefs = window.location.hash === '#prefs'
// Experiment: the box Ctrl+Shift+T opens.
const ask = window.location.hash === '#ask'

if (prefs) document.documentElement.dataset.window = 'prefs'
if (ask) document.documentElement.dataset.window = 'ask'

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
	<React.StrictMode>{ask ? <Ask /> : prefs ? <Prefs /> : <App />}</React.StrictMode>
)
