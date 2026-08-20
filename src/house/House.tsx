import { CompanionFace } from '../companion/CompanionFace'
import type { CompanionParts } from '../companion/parts'
import type { Language } from '../data/companion.ts'
import type { WornProp } from '../data/companion.ts'
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
				{/*
				  * The same light as the burrow's, and the same as his shell's: down
				  * one side and off the other. The lid used to carry a diagonal grain
				  * gradient of its own, which is a texture nothing else in the app
				  * has.
				  */}
				<linearGradient id="tico-hatch-vol" x1="0" y1="0" x2="0.9" y2="1">
					<stop offset="0%" stopColor="#ffffff" stopOpacity="0.1" />
					<stop offset="55%" stopColor="#ffffff" stopOpacity="0" />
					<stop offset="100%" stopColor="#000000" stopOpacity="0.26" />
				</linearGradient>
				{/* Boards that stop being boards at the edges, rather than ending. */}
				<linearGradient id="tico-floor" x1="0" y1="0" x2="1" y2="0">
					<stop offset="0%" stopColor="#6b563f" stopOpacity="0" />
					<stop offset="20%" stopColor="#6b563f" stopOpacity="0.95" />
					<stop offset="80%" stopColor="#6b563f" stopOpacity="0.95" />
					<stop offset="100%" stopColor="#6b563f" stopOpacity="0" />
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
			  *
			  * The two hairline grain lines that used to run across it are gone. He
			  * has no hairlines anywhere on him; what he has is a rim light, so the
			  * boards get one of those instead.
			  */}
			<path d="M2 22 Q2 21 3.5 21 L116.5 21 Q118 21 118 22 L110 49 Q109.6 50 108 50 L12 50 Q10.4 50 10 49 z" fill="url(#tico-floor)" />
			<path d="M6 23.4 L114 23.4" stroke="#ffffff" strokeOpacity="0.06" strokeWidth="1.2" strokeLinecap="round" fill="none" />

			{/* The hole, cut into those boards. Always drawn, simply covered. */}
			<path d="M26 26 Q26 25.2 27.2 25.2 L92.8 25.2 Q94 25.2 94 26 L86.6 43 Q86.2 44 85 44 L35 44 Q33.8 44 33.4 43 z" fill="var(--earth)" />
			<path d="M26 26 L94 26 L91 32 L29 32 z" fill="#000000" opacity="0.45" />

			{/*
			  * The lid, with his corners on it.
			  *
			  * It was a hard-edged trapezoid with two grain lines and a bolt. He is
			  * `rx="15"` on an 80-wide shell — proportionally, a 68-wide door is
			  * about 4 — and every seam on him is a rim light rather than a scored
			  * line. The pull is a rounded slot now, which is a thing you could put
			  * a finger in; the circle read as a screw head.
			  */}
			<g className="tico-hatch-lid">
				<path className="lid" d="M26 26 Q26 25.2 27.2 25.2 L92.8 25.2 Q94 25.2 94 26 L86.6 43 Q86.2 44 85 44 L35 44 Q33.8 44 33.4 43 z" />
				<path fill="url(#tico-hatch-vol)" d="M26 26 Q26 25.2 27.2 25.2 L92.8 25.2 Q94 25.2 94 26 L86.6 43 Q86.2 44 85 44 L35 44 Q33.8 44 33.4 43 z" />
				<g stroke="#ffffff" strokeOpacity="0.07" strokeWidth="1.2" strokeLinecap="round" fill="none">
					<path d="M48 26.6 L44.6 43" />
					<path d="M72 26.6 L74 43" />
				</g>
				{/* The lifting edge, which is what makes it a door and not a panel. */}
				<path className="lid-edge" d="M34.6 43.4 L85.4 43.4 Q86.4 43.4 86.2 44.4 L85.8 46.6 Q85.6 47.4 84.6 47.4 L35.4 47.4 Q34.4 47.4 34.2 46.6 z" />
				<rect className="lid-pull" x="55.5" y="37.4" width="9" height="2.6" rx="1.3" />
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
 * **Redrawn to be made of the same stuff he is.** They were hard-cornered
 * polygons in three flat browns — `.w-lit`, `.w-mid`, `.w-dark` — and next to a
 * pet whose body is a rounded rectangle with a gradient and a rim light they
 * read as a different illustration pasted underneath him. The concept was never
 * the problem: a machine who has made himself a warm wooden hole with a painting
 * of hills he has never seen is a good idea and it stays.
 *
 * Two changes, and they are the two the eye actually sees:
 *
 * 1. **Corners.** He is `rx="15"` on an 80-wide body and `rx="9"` on his screen.
 *    Nothing down here had a radius at all.
 * 2. **Volume is light over a shape, not two shapes in two colours.** One fill
 *    and one shared gradient, which is exactly what `tico-case` does to his
 *    shell — and it is *less* drawing than the lit-face/dark-face pair it
 *    replaces, not more, while being the thing that rounds correctly.
 *
 * Every object is still its own component with its base at the origin, rising
 * into negative `y`, so placing one is `translate(x, floorLine)`.
 */

/**
 * A rounded box with the light already on it. Nearly everything down here is
 * one of these, which is the point — the burrow is now built out of the same
 * primitive he is.
 */
const Box = ({
	x,
	y,
	w,
	h,
	r = 2,
	tone = 'wood',
}: {
	x: number
	y: number
	w: number
	h: number
	r?: number
	tone?: string
}) => (
	<>
		<rect className={tone} x={x} y={y} width={w} height={h} rx={r} />
		<rect className="vol" x={x} y={y} width={w} height={h} rx={r} />
	</>
)

const Chair = () => (
	<g>
		<Box x={2} y={-7} w={3} h={7} r={1.2} />
		<Box x={19} y={-7} w={3} h={7} r={1.2} />
		<Box x={0} y={-11} w={24} h={4} r={1.6} />
		{/* The cushion is what stops it reading as a bench. */}
		<Box x={2} y={-14} w={20} h={3} r={1.4} tone="cloth" />
		<Box x={0} y={-30} w={4} h={19} r={1.8} />
	</g>
)

const Lamp = () => (
	<g>
		<Box x={-9} y={-3} w={18} h={3} r={1.4} tone="wood-dark" />
		<Box x={-2} y={-30} w={4} h={27} r={1.6} tone="metal" />
		{/*
		  * The shade stays a trapezoid — a shade is one — but it is his amber now
		  * rather than a yellow of its own. The same colour pulses on his antenna
		  * two feet away, which is the whole argument for a palette: the thing
		  * lighting his house is a colour he is already made of.
		  */}
		{/* A shade is a trapezoid and stays one. An attempt at rounding its top
		    corners by hand put a spike through the ceiling, which is the second
		    thing `burrow.html` caught in an afternoon. */}
		<path className="lamp" d="M-14 -30 L14 -30 L8 -46 L-8 -46 z" />
		<path className="vol" d="M-14 -30 L14 -30 L8 -46 L-8 -46 z" />
		<rect className="glow" x={-13} y={-30.5} width={26} height={2.5} rx={1.2} />
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
		<Box x={0} y={-2.5} w={26} h={2.5} r={1.1} />
		{/* A book, a jar and a mug — three silhouettes, not three boxes. And the
		    mug is the one he comes back up holding. */}
		<Box x={3} y={-10} w={4} h={7.5} r={1} tone="book" />
		<path className="glass" d="M11 -2.5 L16 -2.5 L16 -8 q-2.5 -2 -5 0 z" />
		<Box x={10} y={-9} w={7} h={1.2} r={0.6} tone="wood-dark" />
		<Box x={20} y={-7} w={4} h={4.5} r={1.2} tone="cloth" />
		<path className="cloth" d="M24 -6 q2 1 0 3" />
	</g>
)

const Crate = () => (
	<g>
		<Box x={0} y={-18} w={18} h={18} r={1.8} />
		{/* Bracing, corner to corner. Two diagonals are the whole difference
		    between a crate and a brown square — pulled in off the corners while
		    the radius was being tuned, they stopped reading as bracing and the
		    crate turned into a barrel with a cross on it. */}
		<g className="brace">
			<path d="M1.4 -1.4 L16.6 -16.6 M1.4 -16.6 L16.6 -1.4 M0.4 -9 L17.6 -9" />
		</g>
	</g>
)

const Barrel = () => (
	<g>
		<path className="wood" d="M-8 0 q-3 -9 0 -18 L8 -18 q3 9 0 18 z" />
		<path className="vol" d="M-8 0 q-3 -9 0 -18 L8 -18 q3 9 0 18 z" />
		<ellipse className="wood-lit" cx="0" cy="-18" rx="8" ry="2.2" />
		<g className="hoop">
			<path d="M-9.2 -5 L9.2 -5 M-9.2 -13 L9.2 -13" />
		</g>
	</g>
)

const Picture = () => (
	<g>
		<Box x={0} y={-14} w={18} h={14} r={1.6} tone="wood-dark" />
		<Box x={2} y={-12} w={14} h={10} r={1} tone="canvas" />
		{/* Hills and a small sun. He has never been outside; this is aspirational. */}
		<path className="canvas-ink" d="M2 -5 q4 -4 7 0 q3 -3 7 0 L16 -2.6 L2 -2.6 z" />
		<circle className="canvas-sun" cx="12" cy="-9" r="1.8" />
	</g>
)

const Plant = () => (
	<g>
		<path className="pot" d="M-5 0 L5 0 L4 -7 L-4 -7 z" />
		<path className="vol" d="M-5 0 L5 0 L4 -7 L-4 -7 z" />
		<Box x={-5.5} y={-9} w={11} h={2} r={0.9} tone="pot-rim" />
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
		<Box x={0} y={-1.5} w={6} h={1.5} r={0.7} tone="metal" />
		<Box x={1.5} y={-8} w={3} h={6.5} r={1.2} tone="wax" />
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
	parts,
	worn,
	faceColor,
	screenColor,
	ledColor,
	onPetClick,
	innerRef,
}: {
	scene: Scene
	language: Language
	/**
	 * The body he was given and whatever he has on, so the thing standing in the
	 * burrow is *him*.
	 *
	 * It was a rounded rectangle with two dots — drawn here, in this file, in
	 * hex. Which meant the twenty-six drawings in `parts.tsx`, the nine shells,
	 * the thirty props and the entire preferences window stopped at the trapdoor:
	 * you could give him a top hat and a different body, send him down the hatch,
	 * and find a grey box. Of everything that made the burrow feel bolted on,
	 * this was the whole of it — the one place in the app where he is not himself.
	 */
	parts: CompanionParts
	worn: WornProp[]
	/** His feeling's palette, the same three the strip draws him with. */
	faceColor: string
	screenColor: string
	ledColor: string
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
			<div className="tico-map-stage">
			<svg viewBox="0 0 200 132" aria-hidden="true">
				<defs>
					{/*
					  * The one light in the burrow, as a gradient rather than as a
					  * second polygon per object.
					  *
					  * This is `tico-case` doing the same job on his shell: lit down
					  * one side, falling off across the shape, shadowed on the other.
					  * Every piece of furniture wears it, which is why they now all
					  * agree about where the light is — three hand-picked browns per
					  * object never could, and did not.
					  */}
					<linearGradient id="tico-burrow-vol" x1="0" y1="0" x2="1" y2="0.35">
						<stop offset="0%" stopColor="#ffffff" stopOpacity="0.11" />
						<stop offset="52%" stopColor="#ffffff" stopOpacity="0" />
						<stop offset="100%" stopColor="#000000" stopOpacity="0.3" />
					</linearGradient>
					{/* The same faint scanline his own screen wears, over the earth.
					    It is the one texture in the app and it belongs to him. */}
					<pattern id="tico-burrow-grain" width="4" height="4" patternUnits="userSpaceOnUse">
						<rect width="4" height="1" fill="#ffffff" opacity="0.02" />
					</pattern>
				</defs>

				{/* Earth. Everything below is a hole cut out of this. */}
				<rect className="tico-burrow-earth" width="200" height="132" />
				<rect width="200" height="132" fill="url(#tico-burrow-grain)" />

				{kinds.map((kind) => {
					const room = ROOMS[kind]
					return (
						<g key={kind}>
							{/* Rounded, like everything he is made of. A room with square
							    corners under a pet with `rx="15"` was the loudest half of
							    why this looked like a different application.
							
							    `data-here` needs `present`, and that turns out to be worth
							    more than it was written for: with nobody home, not one of
							    the three rooms is lit. The burrow says he is out before
							    the line underneath it does. */}
							<rect
								className="tico-burrow-wall"
								data-here={present && kind === scene.at ? 'true' : undefined}
								x={room.x}
								y={room.y}
								width={room.w}
								height={ROOM.h}
								rx="5"
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
								rx="2.4"
							/>
						</g>
					)
				})}

				{/* The shaft down from the hatch, with the ladder he uses. */}
				<rect className="tico-burrow-wall" x="40" y="-4" width="16" height="30" rx="4" />
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

			</svg>

			{/*
			  * Him, standing on the floor of whichever room he is in.
			  *
			  * Positioned over the drawing rather than inside it: `CompanionFace` is
			  * its own `<svg viewBox="0 0 96 96">`, and percentages off the stage put
			  * it on the room's floor line without either drawing having to know the
			  * other's units. The numbers are the map's own viewBox, so moving a room
			  * moves him with it.
			  *
			  * He has none of the wrapper classes the strip puts on him, so none of
			  * the walking, hopping or dancing keyframes can reach him — he is a
			  * still portrait, which is what the burrow having no clock means. The
			  * one thing that does still run is the pulse on his LED, and that is
			  * deliberate: it is the only sign that the thing down there is switched
			  * on. Do not "fix" it.
			  */}
			{present && (
				<div
					className="tico-map-him"
					style={{
						left: `${((here.x + here.stand) / 200) * 100}%`,
						bottom: `${((132 - floorOf(scene.at)) / 132) * 100}%`,
					}}
				>
					<CompanionFace
						mood={scene.settled ? 'idle' : 'watching'}
						blink={false}
						glyph={null}
						singing={false}
						worn={worn}
						faceColor={faceColor}
						screenColor={screenColor}
						ledColor={ledColor}
						parts={parts}
					/>
				</div>
			)}

			</div>

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
