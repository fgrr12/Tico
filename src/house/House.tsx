import type { Language } from '../data/companion.ts'
import { type Furniture, type Scene, houseCopy, lineFor } from './house.ts'

/**
 * The house on the strip, and the room behind its door.
 *
 * Two things in one file because they are two views of one object: shut, it is a
 * building he walks into; open, it is the same building with the front wall
 * taken off. Splitting them would mean keeping one set of coordinates in step
 * across two files for no gain.
 *
 * Drawn inside the existing strip rather than in a second window. A second Tauri
 * window would mean repeating the NSPanel conversion, the window level, the
 * click-through polling and the focus rules — every hard-won thing in `lib.rs`
 * and `macos.rs` — to gain nothing the strip does not already have, now that it
 * is the full height of the screen.
 */

const WALL = '#3a4054'
const WOOD = '#7a6242'

/** The building. Small, and the door is the whole interface. */
export const House = ({
	x,
	home,
	onClick,
	innerRef,
}: {
	x: number
	/** He is inside. The window glows, which is the only state it shows. */
	home: boolean
	onClick: () => void
	innerRef: React.Ref<HTMLButtonElement>
}) => (
	<button
		type="button"
		ref={innerRef}
		className="tico-house"
		data-home={home ? 'true' : undefined}
		style={{ left: `${x}px` }}
		onClick={onClick}
		aria-label="tico's house"
	>
		<svg viewBox="0 0 84 76" aria-hidden="true">
			<path d="M6 30 L42 4 L78 30 z" fill="#8d5a4a" />
			<rect x="12" y="30" width="60" height="42" rx="3" fill={WALL} />
			{/* The door he actually walks through. */}
			<rect x="34" y="44" width="17" height="28" rx="2" fill={WOOD} />
			<circle cx="47" cy="59" r="1.6" fill="#d9c9a8" />
			{/* The window is the only thing that changes: lit when he is in. */}
			<rect className="tico-house-pane" x="18" y="38" width="12" height="12" rx="2" />
			<rect x="6" y="70" width="72" height="5" rx="2" fill="#2b3040" />
		</svg>
	</button>
)

const Chair = () => (
	<g>
		<rect x="14" y="46" width="30" height="8" rx="3" fill={WOOD} />
		<rect x="14" y="24" width="7" height="24" rx="3" fill={WOOD} />
		<rect x="16" y="54" width="5" height="12" rx="2" fill="#5d4a33" />
		<rect x="37" y="54" width="5" height="12" rx="2" fill="#5d4a33" />
	</g>
)

const Lamp = () => (
	<g>
		<path d="M96 18 L120 18 L126 34 L90 34 z" fill="#d9a441" />
		<rect x="106" y="34" width="4" height="30" fill="#6b6f7d" />
		<rect x="99" y="64" width="18" height="4" rx="2" fill="#6b6f7d" />
		{/*
		  * The pool of light. A flat ellipse at low opacity was the first attempt
		  * and it photographed as a *shadow* — a hard-edged smudge slightly lighter
		  * than the floor reads as dirt, not as light. Light has no edge, so this
		  * is a radial gradient that reaches zero.
		  */}
		<ellipse cx="108" cy="46" rx="34" ry="24" fill="url(#tico-lamplight)" />
	</g>
)

const Rug = () => (
	<ellipse cx="70" cy="66" rx="42" ry="8" fill="#7d4a5c" />
)

/**
 * The room, and the only thing you ever see of the inside.
 *
 * A still. Nothing in here animates, which is not a limitation but the point —
 * see the note on `sceneAt`. It is also why opening the door costs nothing: the
 * measured price is per composited frame, and a picture asks for no frames.
 */
export const Room = ({
	scene,
	language,
	present,
	onPetClick,
	innerRef,
}: {
	scene: Scene
	language: Language
	/**
	 * He is actually in there. You can open the door while he is outside — the
	 * first version drew him in the room regardless, which made the house a
	 * picture of him rather than a place he might be.
	 */
	present: boolean
	/** Clicking him in there calls him back out. */
	onPetClick: () => void
	innerRef: React.Ref<HTMLDivElement>
}) => {
	const near: Record<Furniture, { x: number; y: number }> = {
		chair: { x: 22, y: 30 },
		lamp: { x: 94, y: 36 },
		rug: { x: 56, y: 44 },
	}
	const spot = near[scene.at]

	return (
		<div className="tico-room" ref={innerRef}>
			<svg viewBox="0 0 160 80" aria-hidden="true">
				<defs>
					<radialGradient id="tico-lamplight">
						<stop offset="0%" stopColor="#f0c980" stopOpacity="0.34" />
						<stop offset="60%" stopColor="#e8b75a" stopOpacity="0.12" />
						<stop offset="100%" stopColor="#e8b75a" stopOpacity="0" />
					</radialGradient>
				</defs>
				<rect width="160" height="80" rx="6" fill="#20242e" />
				<rect y="68" width="160" height="12" fill="#2b3040" />
				<Rug />
				<Chair />
				<Lamp />
				{/* Him, small and simplified. The real face is 96 units of detail and
				    none of it survives at this size — a silhouette with two eyes is
				    more legible and reads as the same creature. */}
				{present && (
					<g transform={`translate(${spot.x} ${spot.y})`}>
						<rect
							width="22"
							height="20"
							rx="5"
							fill="#2c313d"
							stroke="#414859"
							strokeWidth="1.5"
						/>
						<rect x="5" y="7" width="4" height="5" rx="2" fill="#c8d0e0" />
						<rect x="13" y="7" width="4" height="5" rx="2" fill="#c8d0e0" />
					</g>
				)}
			</svg>

			<p className="tico-room-line">
				{present ? lineFor(scene, language) : houseCopy(language).empty[scene.minutes % 2]}
			</p>

			{/* Only offered when there is somebody to call. */}
			{present && (
				<button type="button" className="tico-room-call" onClick={onPetClick}>
					{language === 'es' ? 'Salí' : 'Come out'}
				</button>
			)}
		</div>
	)
}
