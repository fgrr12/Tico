import type { Language } from '../data/companion.ts'
import { type Furniture, type Scene, houseCopy, lineFor } from './house.ts'

/**
 * The way down, and the map of what is down there.
 *
 * **He lives under the floor, not beside it.** The first version put a cottage
 * on the strip and it was wrong in a way worth recording: a building standing
 * next to him competes for the same ground, and the strip has exactly one floor
 * line. A hatch *is* the floor, so it costs no room at all until it is opened.
 *
 * The inside is drawn as a map rather than as a room, which is the same decision
 * the rest of this feature already made — the burrow has no clock and nothing is
 * simulated down there — and a map is the honest picture of a place you are told
 * about rather than watching. It is also the shape that grows: more burrow is
 * more chambers on the same sheet, where more room would have meant redrawing
 * the room.
 *
 * Drawn inside the existing strip rather than in a second window. A second Tauri
 * window would mean repeating the NSPanel conversion, the window level, the
 * click-through polling and the focus rules — every hard-won thing in `lib.rs`
 * and `macos.rs` — to gain nothing the strip does not already have.
 */

/**
 * The trapdoor, lying in the floor he walks on.
 *
 * Two states and nothing between them but a transition: shut it is a seam in the
 * boards, open it is a lid tilted back over a hole. The lid tilts *away* from the
 * viewer rather than toward — the reference photograph has it the other way and
 * the opening ends up hidden behind the board, which is the one thing the drawing
 * has to show.
 */
export const Hatch = ({
	x,
	open,
	onClick,
	innerRef,
}: {
	x: number
	/** Standing open: he is down there, or you are looking. */
	open: boolean
	onClick: () => void
	innerRef: React.Ref<HTMLButtonElement>
}) => (
	<button
		type="button"
		ref={innerRef}
		className="tico-hatch"
		data-open={open ? 'true' : undefined}
		style={{ left: `${x}px` }}
		onClick={onClick}
		aria-label="tico's burrow"
	>
		<svg viewBox="0 0 120 52" aria-hidden="true">
			<defs>
				<linearGradient id="tico-hatch-grain" x1="0" y1="0" x2="1" y2="1">
					<stop offset="0%" stopColor="#ffffff" stopOpacity="0.08" />
					<stop offset="100%" stopColor="#000000" stopOpacity="0.16" />
				</linearGradient>
				{/* Boards that stop being boards at the edges, rather than ending. */}
				<linearGradient id="tico-floor" x1="0" y1="0" x2="1" y2="0">
					<stop offset="0%" stopColor="#54432c" stopOpacity="0" />
					<stop offset="20%" stopColor="#54432c" stopOpacity="0.95" />
					<stop offset="80%" stopColor="#54432c" stopOpacity="0.95" />
					<stop offset="100%" stopColor="#54432c" stopOpacity="0" />
				</linearGradient>
			</defs>

			{/*
			  * A patch of boards for it to be cut into.
			  *
			  * Without this the hatch was a plank lying over a black box, and it read
			  * as exactly that. The strip is transparent — there is no floor here to
			  * put a hole in — so the floor has to be drawn, and only just enough of
			  * it that the hole has an edge to belong to. It fades out at both ends
			  * rather than stopping, because a rectangle of wood on the desktop is a
			  * plank too.
			  */}
			<path d="M2 22 L118 22 L110 50 L10 50 z" fill="url(#tico-floor)" />
			<g stroke="#6f5a3e" strokeWidth="0.9" opacity="0.5" fill="none">
				<path d="M6 32 L114 32" />
				<path d="M4 41 L116 41" />
			</g>

			{/* The hole, cut into those boards. Always drawn, simply covered. */}
			<path d="M26 26 L94 26 L86 44 L34 44 z" fill="#0a0c11" />
			<path d="M26 26 L94 26 L91 32 L29 32 z" fill="#04050a" />

			{/* The boards, at the same shallow angle as the floor. */}
			<g className="tico-hatch-lid">
				<path d="M26 26 L94 26 L86 44 L34 44 z" fill="#9c7f58" />
				<path d="M26 26 L94 26 L86 44 L34 44 z" fill="url(#tico-hatch-grain)" />
				<g stroke="#6d573b" strokeWidth="1.1" fill="none">
					<path d="M48 26 L44 44" />
					<path d="M72 26 L74 44" />
				</g>
				{/* The lifting edge, which is what makes it a door and not a panel. */}
				<path d="M34 44 L86 44 L85 47 L35 47 z" fill="#6d573b" />
				<circle cx="60" cy="39" r="2.4" fill="#4a3b28" />
			</g>
		</svg>
	</button>
)

/**
 * The burrow, in cross-section.
 *
 * **A cutaway, not a map.** The first version drew it as an inked floorplan —
 * chambers as blobs on parchment, furniture as symbols — and it was legible the
 * way a diagram is legible: you could tell there were three rooms and not what
 * was in any of them. The reference is Terraria, and what makes that read is
 * that it is not a plan at all. It is a wall sliced open: rectangular rooms with
 * a back wall and a floor, everything standing on the floor in side elevation at
 * the size the thing would actually be.
 *
 * Which is also the answer to "each part should be clearly visible". That was
 * never a labelling problem, it was a projection problem — a chair seen from
 * above is a rectangle however carefully it is drawn.
 *
 * Rooms share walls rather than sitting apart, so the sheet is mostly rooms.
 * Growing the burrow later is another rectangle in the grid, which is the
 * cheapest kind of growth there is.
 */

/* ── The things in it ───────────────────────────────────────────────────────
 *
 * Every object is its own component, drawn with its base at the origin and
 * rising into negative `y`, so placing one is `translate(x, floorLine)` and
 * nothing has to know how tall anything else is.
 *
 * They were one `<path>` per category before this — all the furniture in one
 * flat tone, all the ornaments in another. That is why they read as cut-outs:
 * a solid silhouette has no volume, and volume at this size is entirely a
 * matter of a lit face and a dark one. Every piece below is at least two tones,
 * and the classes carry the colour so the palette stays in one file.
 */

const Chair = () => (
	<g>
		<path className="w-dark" d="M2 0 L5 0 L5 -7 L2 -7 z M19 0 L22 0 L22 -7 L19 -7 z" />
		<path className="w-mid" d="M0 -7 L24 -7 L24 -11 L0 -11 z" />
		{/* The cushion is what stops it reading as a bench. */}
		<path className="cloth" d="M2 -11 L22 -11 L22 -14 L2 -14 z" />
		<path className="w-mid" d="M0 -11 L4 -11 L4 -30 L0 -30 z" />
		<path className="w-lit" d="M0 -11 L24 -11 L24 -12 L0 -12 z M0 -30 L4 -30 L4 -29 L0 -29 z" />
	</g>
)

const Lamp = () => (
	<g>
		<path className="w-dark" d="M-9 0 L9 0 L9 -3 L-9 -3 z" />
		<path className="metal" d="M-2 -3 L2 -3 L2 -30 L-2 -30 z" />
		<path className="metal-lit" d="M-2 -3 L-1 -3 L-1 -30 L-2 -30 z" />
		{/* The shade, lit inside and shadowed on its right face. */}
		<path className="shade" d="M-14 -30 L14 -30 L8 -46 L-8 -46 z" />
		<path className="shade-dark" d="M4 -30 L14 -30 L8 -46 L5 -46 z" />
		<path className="glow" d="M-13 -30 L13 -30 L13 -28 L-13 -28 z" />
	</g>
)

const Rug = () => (
	<g>
		<ellipse className="cloth" cx="0" cy="-2" rx="38" ry="4" />
		<ellipse className="cloth-lit" cx="0" cy="-2.5" rx="26" ry="2.2" />
		<g className="fringe">
			<path d="M-38 -2 L-42 -4 M-35 -1 L-38 2 M35 -1 L38 2 M38 -2 L42 -4" />
		</g>
	</g>
)

const Shelf = () => (
	<g>
		<path className="w-mid" d="M0 0 L26 0 L26 -2 L0 -2 z" />
		<path className="w-dark" d="M0 0 L26 0 L26 1 L0 1 z" />
		{/* A book, a jar and a mug — three silhouettes, not three boxes. */}
		<path className="book" d="M3 -2 L7 -2 L7 -10 L3 -10 z" />
		<path className="book-spine" d="M3 -2 L4 -2 L4 -10 L3 -10 z" />
		<path className="glass" d="M11 -2 L16 -2 L16 -8 q-2.5 -2 -5 0 z" />
		<path className="w-dark" d="M10 -8 L17 -8 L17 -9 L10 -9 z" />
		<path className="cloth" d="M20 -2 L24 -2 L24 -7 L20 -7 z M24 -6 q2 1 0 3" />
	</g>
)

const Crate = () => (
	<g>
		<path className="w-mid" d="M0 0 L18 0 L18 -18 L0 -18 z" />
		<path className="w-lit" d="M0 -18 L18 -18 L18 -16.5 L0 -16.5 z" />
		<path className="w-dark" d="M13 0 L18 0 L18 -18 L13 -18 z" />
		{/* Bracing. Two diagonals, which is the whole difference between a crate
		    and a brown square. */}
		<g className="brace">
			<path d="M1 -1 L17 -17 M1 -17 L17 -1 M0 -9 L18 -9" />
		</g>
	</g>
)

const Barrel = () => (
	<g>
		<path className="w-mid" d="M-8 0 q-3 -9 0 -18 L8 -18 q3 9 0 18 z" />
		<path className="w-dark" d="M4 0 q3 -9 0 -18 L8 -18 q3 9 0 18 z" />
		<ellipse className="w-lit" cx="0" cy="-18" rx="8" ry="2.2" />
		<g className="hoop">
			<path d="M-9.2 -5 L9.2 -5 M-9.2 -13 L9.2 -13" />
		</g>
	</g>
)

const Picture = () => (
	<g>
		<path className="w-dark" d="M0 0 L18 0 L18 -14 L0 -14 z" />
		<path className="canvas" d="M2 -2 L16 -2 L16 -12 L2 -12 z" />
		{/* Hills and a small sun. He has never been outside; this is aspirational. */}
		<path className="canvas-ink" d="M2 -5 q4 -4 7 0 q3 -3 7 0 L16 -2 L2 -2 z" />
		<circle className="canvas-sun" cx="12" cy="-9" r="1.8" />
	</g>
)

const Plant = () => (
	<g>
		<path className="pot" d="M-5 0 L5 0 L4 -7 L-4 -7 z" />
		<path className="pot-dark" d="M2 0 L5 0 L4 -7 L2 -7 z" />
		<path className="pot-rim" d="M-5.5 -7 L5.5 -7 L5.5 -9 L-5.5 -9 z" />
		<g className="leaf">
			<path d="M0 -9 q-6 -3 -5 -8 q5 1 5 8 z" />
			<path d="M0 -9 q6 -4 6 -9 q-6 2 -6 9 z" />
			<path d="M0 -9 L0 -16" />
		</g>
	</g>
)

/** A wall candle. The only thing down here that moves, and it does not. */
const Candle = () => (
	<g>
		<path className="metal" d="M0 0 L6 0 L6 -1.5 L0 -1.5 z" />
		<path className="wax" d="M1.5 -1.5 L4.5 -1.5 L4.5 -8 L1.5 -8 z" />
		<path className="flame" d="M3 -8 q2.5 -2 0 -5.5 q-2.5 3.5 0 5.5 z" />
		<circle className="flame-halo" cx="3" cy="-10" r="6" />
	</g>
)

const PIECES = { Chair, Lamp, Rug, Shelf, Crate, Barrel, Picture, Plant, Candle } as const

/* ── The rooms ─────────────────────────────────────────────────────────── */

const ROOM = { w: 78, h: 46 }
/** The plank band at the bottom of each room. Everything stands on its top. */
const FLOOR = 7

interface Item {
	piece: keyof typeof PIECES
	/** From the room's left edge, and from its floor line — up is negative. */
	at: [number, number]
}

const ROOMS: Record<
	Furniture,
	{ x: number; y: number; w: number; items: Item[]; stand: number; label: Record<Language, string> }
> = {
	chair: {
		x: 16,
		y: 26,
		w: ROOM.w,
		items: [
			{ piece: 'Chair', at: [12, 0] },
			{ piece: 'Shelf', at: [46, -22] },
			{ piece: 'Candle', at: [6, -26] },
		],
		// Chosen around the furniture, not at the middle of the room: standing in
		// the centre put him on top of the chair, hiding the one object the room
		// exists to show.
		stand: 52,
		label: { en: 'the nook', es: 'el rincón' },
	},
	lamp: {
		x: 100,
		y: 26,
		w: ROOM.w,
		items: [
			{ piece: 'Lamp', at: [40, 0] },
			{ piece: 'Picture', at: [6, -24] },
			{ piece: 'Plant', at: [66, 0] },
		],
		stand: 12,
		label: { en: 'the warm room', es: 'el cuarto tibio' },
	},
	rug: {
		x: 16,
		y: 78,
		w: ROOM.w * 2 + 6,
		items: [
			{ piece: 'Crate', at: [8, 0] },
			{ piece: 'Crate', at: [28, 0] },
			{ piece: 'Barrel', at: [56, 0] },
			{ piece: 'Rug', at: [104, 0] },
		],
		// On the rug, which is the one place standing on the furniture is the point.
		stand: 96,
		label: { en: 'the long room', es: 'la sala larga' },
	},
}

/**
 * The burrow, sliced open.
 */
export const BurrowMap = ({
	scene,
	language,
	present,
	onPetClick,
	innerRef,
}: {
	scene: Scene
	language: Language
	/**
	 * He is actually down there. You can lift the hatch while he is standing right
	 * next to you — the first version drew him inside regardless, which made the
	 * burrow a portrait of him rather than a place he might be.
	 */
	present: boolean
	/** Calling him back up. */
	onPetClick: () => void
	innerRef: React.Ref<HTMLDivElement>
}) => {
	const here = ROOMS[scene.at]
	const kinds = Object.keys(ROOMS) as Furniture[]
	const floorOf = (kind: Furniture) => ROOMS[kind].y + ROOM.h - FLOOR

	return (
		<div className="tico-map" ref={innerRef}>
			<svg viewBox="0 0 200 132" aria-hidden="true">
				{/* Earth. Everything below is a hole cut out of this. */}
				<rect className="tico-burrow-earth" width="200" height="132" />

				{kinds.map((kind) => {
					const room = ROOMS[kind]
					return (
						<g key={kind}>
							<rect
								className="tico-burrow-wall"
								data-here={present && kind === scene.at ? 'true' : undefined}
								x={room.x}
								y={room.y}
								width={room.w}
								height={ROOM.h}
							/>
							{/* Panelling: a few lines, not a pattern. At this size a real
							    texture turns into a grey wash and the wall stops reading as
							    a surface at all. */}
							<g className="tico-burrow-panel">
								{[0.25, 0.5, 0.75].map((at) => (
									<path
										key={at}
										d={`M${room.x + room.w * at} ${room.y} L${room.x + room.w * at} ${floorOf(kind)}`}
									/>
								))}
							</g>
							<rect
								className="tico-burrow-floor"
								x={room.x}
								y={floorOf(kind)}
								width={room.w}
								height={FLOOR}
							/>
						</g>
					)
				})}

				{/* The shaft down from the hatch, with the ladder he uses. */}
				<rect className="tico-burrow-wall" x="40" y="0" width="16" height="26" />
				<g className="tico-burrow-panel">
					<path d="M44 2 L44 26 M52 2 L52 26 M44 8 L52 8 M44 15 L52 15 M44 22 L52 22" />
				</g>

				{kinds.map((kind) =>
					ROOMS[kind].items.map((item, index) => {
						const Piece = PIECES[item.piece]
						return (
							<g
								// The index is part of the key on purpose: a room can hold two
								// of the same thing, and the long room does.
								key={`${kind}-${item.piece}-${index}`}
								transform={`translate(${ROOMS[kind].x + item.at[0]} ${floorOf(kind) + item.at[1]})`}
							>
								<Piece />
							</g>
						)
					})
				)}

				{/* Him, standing on the floor of whichever room he is in — the same
				    projection as everything else, which is the whole point. */}
				{present && (
					<g transform={`translate(${here.x + here.stand} ${floorOf(scene.at) - 15})`}>
						<rect width="17" height="15" rx="4" fill="#2c313d" stroke="#414859" strokeWidth="1.4" />
						<rect x="4" y="5" width="3" height="4" rx="1.5" fill="#c8d0e0" />
						<rect x="10" y="5" width="3" height="4" rx="1.5" fill="#c8d0e0" />
					</g>
				)}
			</svg>

			<div className="tico-map-foot">
				<p className="tico-map-line">
					{present ? (
						<>
							<span className="tico-map-where">{here.label[language]}</span>
							{lineFor(scene, language)}
						</>
					) : (
						houseCopy(language).empty[scene.minutes % 2]
					)}
				</p>

				{present && (
					<button type="button" className="tico-map-call" onClick={onPetClick}>
						{language === 'es' ? 'Subí' : 'Come up'}
					</button>
				)}
			</div>
		</div>
	)
}
