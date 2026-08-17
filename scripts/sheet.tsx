import { createRoot } from 'react-dom/client'

import { CompanionFace } from '../src/companion/CompanionFace'

import '../src/companion.css'

import type { CompanionFaceProps, CompanionMood } from '../src/types'

/**
 * Every way he can be drawn, on one page, at the sizes he is actually shown at.
 * `pnpm dev` and open `/scripts/sheet.html`.
 *
 * This exists because two rounds of defects were invisible to reasoning and to
 * every check in `check.mjs`, and obvious within a second of looking: a top hat
 * filled with the same colour as the desktop behind it, a headphone band drawn
 * inside the head, a crown that came out black because `--amber` was never
 * defined and SVG falls back to black without complaining. Nothing in a type,
 * a lint or an assertion catches a drawing that is wrong. Looking at it does.
 *
 * It imports the real component, so it cannot drift from what ships.
 */

const MOODS: CompanionMood[] = [
	'idle',
	'happy',
	'thinking',
	'error',
	'wow',
	'love',
	'dizzy',
	'sleep',
	'held',
	'watching',
	'muted',
	'yawn',
	'scared',
]

/** Kept in step with `PROPS` in `Companion.tsx`, plus the music-only one. */
const PROPS = [
	'party',
	'tophat',
	'shades',
	'crown',
	'flower',
	'scarf',
	'coffee',
	'afro',
	'mohawk',
	'longhair',
	'beanie',
	'cap',
	'hood',
	'catears',
	'glasses',
	'moustache',
	'tie',
	'bowtie',
	'cape',
	'duck',
	'umbrella',
	'headphones',
]

const SIZES = [66, 92, 124, 240]

const face = (extra: Partial<CompanionFaceProps> = {}): CompanionFaceProps => ({
	mood: 'idle',
	blink: false,
	glyph: null,
	singing: false,
	prop: null,
	faceColor: '#c8d0e0',
	screenColor: '#1a1c23',
	ledColor: '#9ece6a',
	...extra,
})

const Cell = ({ width, label, ...rest }: CompanionFaceProps & { width: number; label: string }) => (
	<div className="cell">
		{/* The real classes, so he is laid out the way he is on the desktop —
		    minus the bob, which a screenshot only catches mid-way through. */}
		<div className="companion" style={{ position: 'static', width }}>
			<div className="companion-body" style={{ animation: 'none' }}>
				<CompanionFace {...rest} />
			</div>
		</div>
		<div className="lab">{label}</div>
	</div>
)

createRoot(document.getElementById('root') as HTMLElement).render(
	<>
		<div className="row">
			{SIZES.map((width) => (
				<Cell key={width} width={width} label={`${width}px`} {...face()} />
			))}
		</div>
		<div className="row">
			{MOODS.map((mood) => (
				<Cell key={mood} width={92} label={mood} {...face({ mood })} />
			))}
		</div>
		<div className="row">
			{PROPS.map((prop) => (
				<Cell key={prop} width={140} label={prop} {...face({ prop })} />
			))}
		</div>
		<div className="row">
			<Cell width={140} label="singing" {...face({ singing: true, prop: 'headphones' })} />
			<Cell width={140} label="scared" {...face({ mood: 'scared', screenColor: '#3c3f4a' })} />
			<Cell width={140} label="blink" {...face({ blink: true })} />
		</div>
	</>
)
