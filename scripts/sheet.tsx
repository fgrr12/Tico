import { useState } from 'react'
import { createRoot } from 'react-dom/client'

import { CompanionFace } from '../src/companion/CompanionFace'
import { type CompanionParts, DEFAULT_PARTS, PARTS, bodyFrom } from '../src/companion/parts'

import '../src/companion.css'

import { PROPS, SOUVENIRS } from '../src/data/companion'

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

/**
 * Everything drawable, in one list, read from the data rather than kept in step
 * with it by hand. `headphones` is not in `PROPS` because it is only ever worn
 * for a reason, and it still has to be looked at.
 */
const WORN = [...PROPS, ...SOUVENIRS, 'headphones']

const SIZES = [66, 92, 124, 240]

/**
 * Every variant of every slot, on an otherwise default body — a foot on its own
 * says nothing, and the question is always what it looks like attached.
 *
 * The cast is the harness admitting it is iterating a registry it has just been
 * handed; the types that matter are the ones on `PARTS` itself.
 */
const BODIES = Object.entries(PARTS).flatMap(([slot, variants]) =>
	Object.keys(variants).map((variant) => ({
		label: `${slot}: ${variant}`,
		parts: { ...DEFAULT_PARTS, [slot]: variant } as CompanionParts,
	}))
)

/**
 * Which body every row is drawn on, from the query string:
 * `sheet.html?shell=capsule&feet=wheels`.
 *
 * This is the row that matters when a shell is added. The props are placed
 * against fixed landmarks by hand, and the way a new shell fails is never that
 * it looks bad on its own — it is that a cobweb pinned to a square corner is
 * floating beside a round one, and a scarf drawn across his waist hangs off a
 * body that is narrower there. Thirty props, one shell, one look.
 */
const BODY = bodyFrom(Object.fromEntries(new URLSearchParams(location.search)))

const face = (extra: Partial<CompanionFaceProps> = {}): CompanionFaceProps => ({
	parts: BODY,
	mood: 'idle',
	blink: false,
	glyph: null,
	singing: false,
	worn: [],
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

/**
 * The one row that cannot be a screenshot.
 *
 * Putting something on and taking it off are animations, and an animation is
 * exactly the kind of thing that survives types and lint and is wrong the
 * moment you look at it — hair that grows out of the middle of his screen
 * instead of his scalp, an exit that flickers back to full opacity before the
 * node goes. So: press the buttons and watch. `key` on the cell is what forces
 * the remount, since that is also how the real component replays an entrance.
 */
const Replay = ({ kind }: { kind: string }) => {
	const [run, setRun] = useState(0)
	const [leaving, setLeaving] = useState(false)

	return (
		<div className="cell">
			<Cell
				key={`${kind}-${run}`}
				width={140}
				label={kind}
				{...face({ worn: [{ kind, leaving }] })}
			/>
			<div>
				<button
					type="button"
					onClick={() => {
						setLeaving(false)
						setRun((n) => n + 1)
					}}
				>
					on
				</button>
				<button type="button" onClick={() => setLeaving(true)}>
					off
				</button>
			</div>
		</div>
	)
}

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
			{WORN.map((kind) => (
				<Cell key={kind} width={140} label={kind} {...face({ worn: [{ kind }] })} />
			))}
		</div>
		{/* Growing and cutting, plus one ordinary prop for the contrast. */}
		<div className="row">
			{['afro', 'mohawk', 'longhair', 'tophat'].map((kind) => (
				<Replay key={kind} kind={kind} />
			))}
		</div>
		{/*
		 * Bodies, and then the same bodies wearing something.
		 *
		 * The second row is the one that matters. Props are placed by hand against
		 * fixed landmarks — see the contract in `parts.tsx` — so the way a new
		 * variant fails is not that it looks bad on its own, it is that the
		 * headphones now float beside its head. Headphones because they are the
		 * prop that touches the most of him at once: over the top of the case and
		 * down onto both hands.
		 */}
		<div className="row">
			{BODIES.map(({ label, parts }) => (
				<Cell key={label} width={140} label={label} {...face({ parts })} />
			))}
		</div>
		<div className="row">
			{BODIES.map(({ label, parts }) => (
				<Cell key={label} width={140} label={label} {...face({ parts, worn: [{ kind: 'headphones' }] })} />
			))}
		</div>
		{/* Several at once, which is the entire point of giving each of them a
		    place. If two of these overlap, they are in the same place and one of
		    them is filed wrong. */}
		<div className="row">
			<Cell
				width={140}
				label="cap + coffee"
				{...face({ worn: [{ kind: 'cap' }, { kind: 'coffee' }] })}
			/>
			<Cell
				width={140}
				label="dressed"
				{...face({
					worn: [
						{ kind: 'cape' },
						{ kind: 'bowtie' },
						{ kind: 'sneakers' },
						{ kind: 'tophat' },
						{ kind: 'monocle' },
						{ kind: 'umbrella' },
					],
				})}
			/>
			<Cell
				width={140}
				label="rain"
				{...face({ worn: [{ kind: 'wellies' }, { kind: 'hood' }, { kind: 'umbrella' }] })}
			/>
		</div>
		<div className="row">
			<Cell width={140} label="singing" {...face({ singing: true, worn: [{ kind: 'headphones' }] })} />
			<Cell width={140} label="scared" {...face({ mood: 'scared', screenColor: '#3c3f4a' })} />
			<Cell width={140} label="blink" {...face({ blink: true })} />
		</div>
	</>
)
