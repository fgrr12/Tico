import { CompanionFace, Prop } from '../companion/CompanionFace'
import type { CompanionParts } from '../companion/parts'
import { WEARS, type Where } from '../data/companion.ts'
import type { Familiarity, Language, WornProp } from '../data/companion.ts'
import { type Furniture, type Scene, houseCopy, lineFor, reached } from './house.ts'

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
					<stop offset="0%" stopColor="#262a34" stopOpacity="0" />
					<stop offset="20%" stopColor="#262a34" stopOpacity="0.95" />
					<stop offset="80%" stopColor="#262a34" stopOpacity="0.95" />
					<stop offset="100%" stopColor="#262a34" stopOpacity="0" />
				</linearGradient>
			</defs>

			{/*
			  * A patch of boards for it to be cut into.
			  *
			  * Without this the hatch was a panel lying over a black box, and it
			  * read as exactly that. The strip is transparent — there is no floor
			  * here to put a hole in — so the deck has to be drawn, and only just
			  * enough of it that the opening has an edge to belong to. It fades out
			  * at both ends rather than stopping, because a rectangle of plate on the
			  * desktop is a rectangle of plate.
			  *
			  * The two hairline grain lines that used to run across it are gone. He
			  * has no hairlines anywhere on him; what he has is a rim light, so the
			  * boards get one of those instead.
			  */}
			<path d="M2 22 Q2 21 3.5 21 L116.5 21 Q118 21 118 22 L110 49 Q109.6 50 108 50 L12 50 Q10.4 50 10 49 z" fill="url(#tico-floor)" />
			<path d="M6 23.4 L114 23.4" stroke="#ffffff" strokeOpacity="0.06" strokeWidth="1.2" strokeLinecap="round" fill="none" />

			{/* The hole, cut into those boards. Always drawn, simply covered. */}
			<path d="M26 26 Q26 25.2 27.2 25.2 L92.8 25.2 Q94 25.2 94 26 L86.6 43 Q86.2 44 85 44 L35 44 Q33.8 44 33.4 43 z" fill="var(--board)" />
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
 * **Everything down here is now made of what he is made of.** The wooden nook
 * is gone: a chair is a docking cradle, a lamp is an amber standby beacon, a rug
 * is a mat of braided cable, a barrel is a capacitor and a crate is a drive
 * caddy. The painting stays a painting, because "he has never been outside and
 * this is aspirational" was the best idea in the room — it is a dead monitor
 * showing hills now, which is the same joke with the machine's own hardware
 * telling it.
 *
 * Two rules carried over from his own drawing and they are why this reads as one
 * app instead of two:
 *
 * 1. **Corners.** He is `rx="15"` on an 80-wide body. Nothing in here is square.
 * 2. **Volume is light over a shape**, one shared gradient, exactly what
 *    `tico-case` does to his shell — never a lit polygon beside a dark one.
 *
 * Every object is its own component with its base at the origin, rising into
 * negative `y`, so placing one is `translate(x, floorLine)`.
 */

/** A rounded box with the light already on it. Nearly everything is one. */
const Box = ({
	x,
	y,
	w,
	h,
	r = 2,
	tone = 'chassis',
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

/** A row of indicator LEDs. The one thing the machine does constantly. */
const Leds = ({ x, y, on = 'led-green' }: { x: number; y: number; on?: string }) => (
	<g>
		<circle className={on} cx={x} cy={y} r="0.9" />
		<circle className="led-off" cx={x + 3} cy={y} r="0.9" />
		<circle className="led-amber" cx={x + 6} cy={y} r="0.9" />
	</g>
)

/** The cradle he docks in. A chair, if a chair were a charging bay. */
const Chair = () => (
	<g>
		{/*
		  * A cradle he backs into, not a chair with a tall post beside it.
		  *
		  * The first version had a 5×21 upright for a back, which at this size is
		  * a rod standing next to a box — and the amber contact plate on it read
		  * as a second object again. It is one shape now: a low bath with a
		  * raised rear wall and the contacts as a strip *inside* it, which is
		  * what makes it read as somewhere he fits rather than somewhere he sits.
		  */}
		<Box x={0} y={-8} w={28} h={8} r={2.6} />
		<Box x={0} y={-19} w={28} h={11} r={3} tone="chassis-dark" />
		<Box x={2.5} y={-17} w={23} h={9} r={2.2} tone="pad" />
		<Box x={5} y={-16} w={18} h={1.8} r={0.9} tone="contact" />
		<Leds x={10} y={-3.6} />
	</g>
)

/** The standby beacon. It is `--amber`, which is the colour on his antenna. */
const Lamp = () => (
	<g>
		{/* The spill first, so the post stands *in* the light rather than being
		    painted by it. Drawn over the post it turned the stem white. */}
		<path className="glow-spill" d="M-6.4 -36.4 L6.4 -36.4 L13 -3 L-13 -3 z" />
		<Box x={-9} y={-4} w={18} h={4} r={1.8} tone="chassis-dark" />
		<Box x={-2} y={-30} w={4} h={26} r={1.8} tone="metal" />
		{/*
		  * A beacon housing, not a lampshade — but the first version was a wide
		  * rounded box with a lit circle in the middle of it, which is a monitor
		  * on a stand and read as exactly that. A light is a *narrow* thing that
		  * throws downward, so: a small hood, a bright lens under it, and the
		  * spill on the deck doing most of the work.
		  */}
		<path className="beacon" d="M-8 -44 q0 -3 3 -3 L5 -47 q3 0 3 3 L8 -38 L-8 -38 z" />
		<path className="vol" d="M-8 -44 q0 -3 3 -3 L5 -47 q3 0 3 3 L8 -38 L-8 -38 z" />
		<rect className="glow" x={-7} y={-38.6} width={14} height={2.6} rx={1.3} />
	</g>
)

/** Braided cable, coiled into something to lie on. */
const Rug = () => (
	<g>
		<ellipse className="cable" cx="0" cy="-2" rx="38" ry="4" />
		<ellipse className="cable-lit" cx="0" cy="-2.5" rx="26" ry="2.2" />
		<g className="cable-line">
			<path d="M-30 -2 q8 -1.4 16 0 q8 1.4 16 0" />
			<path d="M-38 -2 q-4 -2 -8 -1 M38 -2 q4 -2 8 -1" />
		</g>
	</g>
)

/** A shelf of modules, and the mug — which is the thing he brings back up. */
const Shelf = () => (
	<g>
		<Box x={0} y={-2.5} w={28} h={2.5} r={1.1} tone="metal" />
		{/* Three cartridges standing on end, one pulled half out. */}
		<Box x={2.5} y={-11} w={4} h={8.5} r={1.2} tone="module" />
		<Box x={7.5} y={-9.5} w={4} h={7} r={1.2} tone="module-alt" />
		<Box x={12.5} y={-11} w={4} h={8.5} r={1.2} tone="module" />
		{/* The mug. The one thing down here that is not hardware. */}
		<Box x={21} y={-7.5} w={4.5} h={5} r={1.4} tone="pad" />
		<path className="pad" d="M25.5 -6.4 q2.2 1.1 0 3.2" />
	</g>
)

/** A drive caddy, which is what a crate is in here. */
const Crate = () => (
	<g>
		<Box x={0} y={-18} w={18} h={18} r={2} />
		<Box x={2} y={-15.5} w={14} h={5} r={1.2} tone="chassis-dark" />
		<g className="vent">
			<path d="M3.4 -13.6 L14.6 -13.6 M3.4 -12 L14.6 -12" />
		</g>
		<Leds x={4} y={-4.4} on="led-cyan" />
		<Box x={13} y={-7.5} w={3.4} h={1.4} r={0.7} tone="metal" />
	</g>
)

/** A capacitor. It was a barrel and the silhouette barely had to move. */
const Barrel = () => (
	<g>
		<path className="cap" d="M-8 0 q-1.6 -9 0 -18 q8 -2.4 16 0 q1.6 9 0 18 q-8 2.4 -16 0 z" />
		<path className="vol" d="M-8 0 q-1.6 -9 0 -18 q8 -2.4 16 0 q1.6 9 0 18 q-8 2.4 -16 0 z" />
		<ellipse className="cap-lit" cx="0" cy="-18" rx="8" ry="2.4" />
		{/* The stripe down the negative side, which is the only marking every
		    electrolytic capacitor in the world has. */}
		<path className="cap-stripe" d="M4.4 -17 q1.4 8 0 16" />
	</g>
)

/** A dead monitor, still showing hills. */
const Picture = () => (
	<g>
		<Box x={0} y={-15} w={20} h={15} r={2.2} tone="chassis-dark" />
		<Box x={2} y={-13} w={16} h={11} r={1.4} tone="screen" />
		{/* Hills and a small sun. He has never been outside; this is aspirational,
		    and it is better on a screen than in a frame — the only window in the
		    machine is one somebody left an image on. */}
		<path className="screen-ink" d="M2 -6 q4.5 -4.5 8 0 q3.5 -3.5 8 0 L18 -2.6 L2 -2.6 z" />
		<circle className="screen-sun" cx="13.5" cy="-10" r="1.9" />
		<rect className="screen-scan" x={2} y={-13} width={16} height={11} rx={1.4} />
	</g>
)

/** A real plant. The only living thing in the machine, which is the joke. */
const Plant = () => (
	<g>
		<Box x={-5} y={-7} w={10} h={7} r={1.6} tone="pot" />
		<Box x={-5.5} y={-9} w={11} h={2.2} r={1} tone="pot-rim" />
		<g className="leaf">
			<path d="M0 -9 q-6 -3 -5 -8 q5 1 5 8 z" />
			<path d="M0 -9 q6 -4 6 -9 q-6 2 -6 9 z" />
			<path d="M0 -9 L0 -16" />
		</g>
	</g>
)

/**
 * A vacuum tube in a wall socket, glowing.
 *
 * It replaces the candle and it is the same object: the small warm light on the
 * wall that is older than everything around it. He was born in a terminal and
 * says so constantly; this is the one piece of hardware down here that would
 * have been obsolete before he existed.
 */
const Candle = () => (
	<g>
		<Box x={-1} y={-2.4} w={8} h={2.4} r={1} tone="metal" />
		<path className="tube" d="M0.4 -2.4 L5.6 -2.4 L5.6 -10 q-2.6 -2.6 -5.2 0 z" />
		<path className="tube-glow" d="M1.6 -3.6 L4.4 -3.6 L4.4 -8.4 q-1.4 -1.2 -2.8 0 z" />
		<circle className="tube-halo" cx="3" cy="-7" r="7" />
	</g>
)

/** A cooling fan, sunk into the back wall. */
const Fan = () => (
	<g>
		<Box x={-9} y={-18} w={18} h={18} r={4} tone="chassis-dark" />
		<circle className="fan-hub" cx="0" cy="-9" r="6.4" />
		<g className="fan-blade">
			<path d="M0 -9 q5 -3.4 6 1 q-4.4 2.2 -6 -1 z" />
			<path d="M0 -9 q-3.4 -5 -5.6 -0.6 q3.6 3 5.6 0.6 z" />
			<path d="M0 -9 q-1.6 5.6 3.4 5 q0.8 -4 -3.4 -5 z" />
		</g>
		<circle className="fan-pin" cx="0" cy="-9" r="1.4" />
	</g>
)

/** A cable run, going somewhere. He has already told you about this one. */
const Cable = () => (
	<g className="cable-run">
		{/* Kept flat on purpose. The first version swept up thirty units and out
		    through the ceiling of its own bay — a drawing placed against a deck
		    line has to stay inside the box it was placed in, and nothing in the
		    room table clips it. */}
		<path d="M0 0 q9 -7 18 -3 q9 4 18 -4" />
		<path d="M2 -5 q10 -6 20 -2" />
	</g>
)

const PIECES = { Chair, Lamp, Rug, Shelf, Crate, Barrel, Picture, Plant, Candle, Fan, Cable } as const

/* ── The rooms ─────────────────────────────────────────────────────────── */

const ROOM = { w: 78, h: 46 }
/** The deck at the bottom of each bay. Everything stands on its top. */
const FLOOR = 7

interface Item {
	piece: keyof typeof PIECES
	/** From the bay's left edge, and from its deck line — up is negative. */
	at: [number, number]
	/**
	 * How well he has to know you before this is down there.
	 *
	 * Undefined means day one. Everything else arrives over two months, and this
	 * is the only place in the app where the day count is *seen* rather than
	 * heard — everywhere else it colours a line he says. A burrow fully furnished
	 * the moment you install it has nothing left to show you on day sixty.
	 */
	since?: Familiarity
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
			{ piece: 'Chair', at: [10, 0] },
			{ piece: 'Shelf', at: [44, -22], since: 'knowing' },
			{ piece: 'Candle', at: [6, -28], since: 'old' },
		],
		// Chosen around the hardware, not at the middle of the bay: standing in
		// the centre put him on top of the cradle, hiding the one object the bay
		// exists to show.
		stand: 54,
		label: { en: 'the cradle', es: 'el módulo' },
	},
	lamp: {
		x: 100,
		y: 26,
		w: ROOM.w,
		items: [
			{ piece: 'Lamp', at: [40, 0] },
			{ piece: 'Picture', at: [4, -25], since: 'familiar' },
			{ piece: 'Plant', at: [68, 0], since: 'familiar' },
		],
		stand: 13,
		label: { en: 'the warm bay', es: 'la bahía tibia' },
	},
	rug: {
		x: 16,
		y: 78,
		w: ROOM.w * 2 + 6,
		items: [
			{ piece: 'Rug', at: [104, 0] },
			{ piece: 'Fan', at: [150, -16] },
			{ piece: 'Crate', at: [8, 0], since: 'knowing' },
			{ piece: 'Cable', at: [26, -21], since: 'knowing' },
			{ piece: 'Crate', at: [28, 0], since: 'familiar' },
			{ piece: 'Barrel', at: [56, 0], since: 'old' },
		],
		// On the cable mat, which is the one place standing on the furniture is
		// the point.
		stand: 96,
		label: { en: 'the long bay', es: 'la bahía larga' },
	},
}

/**
 * Where a left-behind thing hangs, by the place it is worn.
 *
 * `Prop` draws against *his* landmarks in a 96×96 box — a hat up by his head at
 * y≈20, wellies down at his feet at y≈85 — so hanging one on a rail means moving
 * it, and the offset has to be keyed to something that already exists and is
 * already maintained. `WEARS` is that: six places, not thirty props. The
 * alternative is the one PLAN.md already rejected once for shells — a per-prop
 * table nobody keeps correct, whose first stale entry is a hat floating beside
 * its hook.
 */
const HANGS: Record<Where, number> = {
	head: 24,
	face: 50,
	neck: 62,
	body: 58,
	hand: 56,
	feet: 82,
}

/**
 * The rail, and whatever you have left on it.
 *
 * Always in the long bay, whichever bay he is in: these are not his, they are
 * yours. Drawn at a tenth scale out of the real `Prop`, so anything added to the
 * wardrobe hangs here on the same commit that draws it and can never go missing
 * — a nested `<svg>` with its own viewBox is the whole of the trick, and it is
 * why there is no second set of drawings to keep in step.
 */
const Rail = ({ left, x, y }: { left: string[]; x: number; y: number }) => (
	<g transform={`translate(${x} ${y})`}>
		<Box x={-2} y={-1.4} w={left.length * 12 + 4} h={1.4} r={0.7} tone="metal" />
		{left.map((kind, index) => (
			<g key={kind} transform={`translate(${index * 12 + 4} 0)`}>
				<path className="hook" d="M0 0 L0 2.6" />
				{/*
				  * 40 of his units into 11 of the map's, which is the whole of it.
				  *
				  * The first version asked for an 11-unit viewBox in an 11-pixel box
				  * — a scale of exactly 1 — and with `overflow: visible` on top of
				  * that, a crown came out full size and lay across three bays. The
				  * viewBox has to be *bigger* than the box it is drawn into or
				  * nothing shrinks, and it has to clip or the ones that overhang
				  * spill into the room.
				  */}
				<svg
					x={-5.5}
					y={2}
					width={11}
					height={11}
					viewBox={`28 ${HANGS[WEARS[kind]] - 20} 40 40`}
				>
					<Prop kind={kind} />
				</svg>
			</g>
		))}
	</g>
)

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
	familiarity,
	left,
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
	/** How well he knows you — which is how furnished the burrow is. */
	familiarity: Familiarity
	/** What you have left down there, oldest first. */
	left: string[]
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
					{/* The dead monitor on the wall wears his scanlines, because it is
					    the same object he has for a face. */}
					<pattern id="tico-burrow-scan" width="2" height="2" patternUnits="userSpaceOnUse">
						<rect width="2" height="0.6" fill="#ffffff" opacity="0.06" />
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
							{/* Circuit traces in the board behind the bay, instead of
							    panelling. Right angles into a via, which is how a trace is
							    actually routed and the only way three lines read as a board
							    rather than as three scratches. */}
							<g className="tico-burrow-panel">
								{[0.22, 0.5, 0.78].map((at, step) => {
									const x = room.x + room.w * at
									const bend = room.y + ROOM.h * (0.3 + step * 0.18)
									const to = x + (step % 2 === 0 ? 9 : -9)
									return (
										<path
											key={at}
											d={`M${x} ${room.y} L${x} ${bend} L${to} ${bend + 9} L${to} ${floorOf(kind)}`}
										/>
									)
								})}
							</g>
							<g className="tico-burrow-via">
								{[0.22, 0.5, 0.78].map((at, step) => (
									<circle
										key={at}
										cx={room.x + room.w * at}
										cy={room.y + ROOM.h * (0.3 + step * 0.18)}
										r="1.1"
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
					ROOMS[kind].items
						// Only what he has been around long enough to have. On day one
						// the chassis is mostly bare board, which is the point.
						.filter((item) => reached(familiarity, item.since))
						.map((item, index) => {
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

				{/* Yours, on the wall of the long bay, wherever he happens to be. */}
				{left.length > 0 && (
					<Rail left={left} x={ROOMS.rug.x + 10} y={floorOf('rug') - 30} />
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
