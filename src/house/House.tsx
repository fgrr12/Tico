import { CompanionFace, Prop } from '../companion/CompanionFace'
import type { CompanionParts } from '../companion/parts'
import { WEARS, type Where } from '../data/companion.ts'
import type { Familiarity, Language, WornProp } from '../data/companion.ts'
import { ACTIVITY, type Furniture, type Scene, houseCopy, lineFor, reached } from './house.ts'

/**
 * The burrow: a hatch in the floor of the strip, and the bays of the module it
 * opens onto.
 *
 * **Warm, and readable at a glance.** The first version was grey hardware on
 * grey walls under green traces — accurate to the inside of a machine and hard
 * to read at 340px: you could not find him, or tell a cradle from a crate. The
 * walls are warm now (earth, lit amber where he is) and the hardware is a cool
 * grey a step lighter than before, so every piece stands off the wall it sits
 * against. One trace per bay, not three: enough to say "board", not enough to
 * be wallpaper.
 *
 * **Colours are attributes, not classes.** Everything here is drawn with
 * explicit fills from `TONES`, so the drawing is the drawing — the native build
 * exports these same components (`scripts/export-art.mjs`) and gets exactly
 * this, with no stylesheet to keep in step. The classes left (`fan-blade`,
 * `leaf`, `glow`, …) only name what moves.
 *
 * Everything is drawn in a 200×132 box; the rooms, where he stands in each, and
 * which furniture needs how much familiarity live in `ROOMS`.
 */

/** The burrow's palette. Earth and wood warm, hardware cool, light amber. */
export const TONES = {
	earthTop: '#1d1713',
	earthBottom: '#130e0b',
	wall: '#2c241e',
	wallShade: '#1f1915',
	litCore: '#5c4430',
	litEdge: '#33281f',
	seam: '#120d0a',
	floor: '#5a4634',
	floorTop: '#735a43',
	trace: '#e0af68',
	chassis: '#646c82',
	chassisDark: '#474e60',
	metal: '#808aa0',
	pad: '#8c7495',
	contact: '#e0af68',
	ledGreen: '#9ece6a',
	ledAmber: '#e0af68',
	ledCyan: '#7dcfff',
	ledOff: '#2a2e3a',
	beacon: '#6b5a44',
	glow: '#ffcf8a',
	amber: '#e0af68',
	cable: '#4b5367',
	cableLit: '#5c657b',
	purple: '#bb9af7',
	module: '#5a627a',
	cyan: '#7dcfff',
	vent: '#1a1d24',
	cap: '#3f4659',
	capLit: '#565e75',
	stripe: '#c8d0e0',
	screen: '#22527a',
	screenInk: '#183d5c',
	tube: '#3c4252',
	fanHub: '#262a34',
	fanBlade: '#5c657b',
	leaf: '#82b468',
	leafEdge: '#587e45',
	pot: '#b56b4a',
	potRim: '#cb7f58',
	wood: '#7a6242',
	woodLight: '#8d7150',
	boards: '#2e2924',
	lid: '#332d27',
	lidEdge: '#2a241f',
} as const

type Tone = keyof typeof TONES

/** The shared gradients. Ids are prefixed so nothing collides with his own. */
export const BurrowDefs = () => (
	<defs>
		{/* The light on every box: a highlight top-left, shade bottom-right. */}
		<linearGradient id="tico-burrow-vol" x1="0" y1="0" x2="1" y2="0.35">
			<stop offset="0%" stopColor="#ffffff" stopOpacity="0.16" />
			<stop offset="52%" stopColor="#ffffff" stopOpacity="0" />
			<stop offset="100%" stopColor="#000000" stopOpacity="0.28" />
		</linearGradient>
		<linearGradient id="tico-burrow-earth" x1="0" y1="0" x2="0" y2="1">
			<stop offset="0%" stopColor={TONES.earthTop} />
			<stop offset="100%" stopColor={TONES.earthBottom} />
		</linearGradient>
		{/* A bay's own shadow from its ceiling: the room has a top. */}
		<linearGradient id="tico-burrow-ceiling" x1="0" y1="0" x2="0" y2="1">
			<stop offset="0%" stopColor="#000000" stopOpacity="0.42" />
			<stop offset="35%" stopColor="#000000" stopOpacity="0" />
		</linearGradient>
		{/* Where he is: the bay glows, brightest near its floor. */}
		<radialGradient id="tico-burrow-lit" cx="0.5" cy="0.85" r="0.75">
			<stop offset="0%" stopColor={TONES.litCore} />
			<stop offset="100%" stopColor={TONES.litEdge} />
		</radialGradient>
		<radialGradient id="tico-burrow-pool">
			<stop offset="0%" stopColor={TONES.glow} stopOpacity="0.32" />
			<stop offset="100%" stopColor={TONES.glow} stopOpacity="0" />
		</radialGradient>
	</defs>
)

/** A box with the shared light on it. */
const Box = ({ x, y, w, h, r = 2, tone = 'chassis' }: { x: number; y: number; w: number; h: number; r?: number; tone?: Tone }) => (
	<>
		<rect fill={TONES[tone]} x={x} y={y} width={w} height={h} rx={r} />
		<rect fill="url(#tico-burrow-vol)" x={x} y={y} width={w} height={h} rx={r} />
	</>
)

const Leds = ({ x, y, on = 'ledGreen' }: { x: number; y: number; on?: Tone }) => (
	<g>
		<circle className="led-on" fill={TONES[on]} cx={x} cy={y} r="0.9" />
		<circle fill={TONES.ledOff} cx={x + 3} cy={y} r="0.9" />
		<circle fill={TONES.ledAmber} cx={x + 6} cy={y} r="0.9" />
	</g>
)

/* ── The things in it ───────────────────────────────────────────────────── */

/** The cradle he docks in: a chassis with a cushioned bay and a charge strip. */
const Chair = () => (
	<g>
		<Box x={0} y={-8} w={28} h={8} r={2.6} />
		<Box x={0} y={-19} w={28} h={11} r={3} tone="chassisDark" />
		<Box x={2.5} y={-17} w={23} h={9} r={2.2} tone="pad" />
		<rect fill={TONES.contact} opacity="0.5" x={5} y={-16} width={18} height={1.8} rx={0.9} />
		<Leds x={10} y={-3.6} />
	</g>
)

/** The lamp: the light comes first, so the post stands in it. */
const Lamp = () => (
	<g>
		<ellipse fill="url(#tico-burrow-pool)" cx="0" cy="-2" rx="26" ry="6" />
		<path className="glow-spill" fill={TONES.glow} opacity="0.16" d="M-6.4 -27.4 L6.4 -27.4 L14 -3 L-14 -3 z" />
		<Box x={-9} y={-4} w={18} h={4} r={1.8} tone="chassisDark" />
		<Box x={-2} y={-22} w={4} h={18} r={1.8} tone="metal" />
		<path fill={TONES.beacon} d="M-8 -34 q0 -3 3 -3 L5 -37 q3 0 3 3 L8 -29 L-8 -29 z" />
		<path fill="url(#tico-burrow-vol)" d="M-8 -34 q0 -3 3 -3 L5 -37 q3 0 3 3 L8 -29 L-8 -29 z" />
		<rect className="glow" fill={TONES.glow} x={-7} y={-29.6} width={14} height={2.6} rx={1.3} />
	</g>
)

/** The cable mat in the long bay. */
const Rug = () => (
	<g>
		<ellipse fill={TONES.cable} cx="0" cy="-2" rx="38" ry="4" />
		<ellipse fill={TONES.cableLit} cx="0" cy="-2.5" rx="26" ry="2.2" />
		<g fill="none" stroke={TONES.purple} strokeOpacity="0.65" strokeWidth="1.2" strokeLinecap="round">
			<path d="M-30 -2 q8 -1.4 16 0 q8 1.4 16 0" />
			<path d="M-38 -2 q-4 -2 -8 -1 M38 -2 q4 -2 8 -1" />
		</g>
	</g>
)

const Shelf = () => (
	<g>
		<Box x={0} y={-2.5} w={28} h={2.5} r={1.1} tone="metal" />
		<Box x={2.5} y={-11} w={4} h={8.5} r={1.2} tone="module" />
		<rect fill={TONES.cyan} opacity="0.7" x={7.5} y={-9.5} width={4} height={7} rx={1.2} />
		<Box x={12.5} y={-11} w={4} h={8.5} r={1.2} tone="module" />
		{/* The mug. The one thing down here that is not hardware. */}
		<Box x={21} y={-7.5} w={4.5} h={5} r={1.4} tone="pad" />
		<path fill="none" stroke={TONES.pad} strokeWidth="1.2" d="M25.5 -6.4 q2.2 1.1 0 3.2" />
	</g>
)

const Crate = () => (
	<g>
		<Box x={0} y={-18} w={18} h={18} r={2} />
		<Box x={2} y={-15.5} w={14} h={5} r={1.2} tone="chassisDark" />
		<path fill="none" stroke={TONES.vent} strokeWidth="1" strokeLinecap="round" d="M3.4 -13.6 L14.6 -13.6 M3.4 -12 L14.6 -12" />
		<Leds x={4} y={-4.4} on="ledCyan" />
		<Box x={13} y={-7.5} w={3.4} h={1.4} r={0.7} tone="metal" />
	</g>
)

/** A capacitor, on its end: the one marking every one in the world has. */
const Barrel = () => (
	<g>
		<path fill={TONES.cap} d="M-8 0 q-1.6 -9 0 -18 q8 -2.4 16 0 q1.6 9 0 18 q-8 2.4 -16 0 z" />
		<path fill="url(#tico-burrow-vol)" d="M-8 0 q-1.6 -9 0 -18 q8 -2.4 16 0 q1.6 9 0 18 q-8 2.4 -16 0 z" />
		<ellipse fill={TONES.capLit} cx="0" cy="-18" rx="8" ry="2.4" />
		<path fill="none" stroke={TONES.stripe} strokeOpacity="0.55" strokeWidth="2.4" strokeLinecap="round" d="M4.4 -17 q1.4 8 0 16" />
	</g>
)

/** Hills and a small sun on a screen: he has never been outside. */
const Picture = () => (
	<g>
		<Box x={0} y={-15} w={20} h={15} r={2.2} tone="chassisDark" />
		<rect fill={TONES.screen} x={2} y={-13} width={16} height={11} rx={1.4} />
		<path fill={TONES.screenInk} d="M2 -6 q4.5 -4.5 8 0 q3.5 -3.5 8 0 L18 -2.6 L2 -2.6 z" />
		<circle className="screen-sun" fill={TONES.amber} cx="13.5" cy="-10" r="1.9" />
	</g>
)

const Plant = () => (
	<g>
		<Box x={-5} y={-7} w={10} h={7} r={1.6} tone="pot" />
		<Box x={-5.5} y={-9} w={11} h={2.2} r={1} tone="potRim" />
		<g className="leaf" fill={TONES.leaf} stroke={TONES.leafEdge} strokeWidth="1" strokeLinejoin="round">
			<path d="M0 -9 q-6 -3 -5 -8 q5 1 5 8 z" />
			<path d="M0 -9 q6 -4 6 -9 q-6 2 -6 9 z" />
			<path d="M0 -9 L0 -16" />
		</g>
	</g>
)

const Candle = () => (
	<g>
		<circle className="tube-halo" fill={TONES.glow} opacity="0.2" cx="3" cy="-7" r="8" />
		<Box x={-1} y={-2.4} w={8} h={2.4} r={1} tone="metal" />
		<path fill={TONES.tube} d="M0.4 -2.4 L5.6 -2.4 L5.6 -10 q-2.6 -2.6 -5.2 0 z" />
		<path className="tube-glow" fill={TONES.glow} opacity="0.85" d="M1.6 -3.6 L4.4 -3.6 L4.4 -8.4 q-1.4 -1.2 -2.8 0 z" />
	</g>
)

const Fan = () => (
	<g>
		<Box x={-9} y={-18} w={18} h={18} r={4} tone="chassisDark" />
		<circle fill={TONES.fanHub} cx="0" cy="-9" r="6.4" />
		<g className="fan-blade" fill={TONES.fanBlade}>
			<path d="M0 -9 q5 -3.4 6 1 q-4.4 2.2 -6 -1 z" />
			<path d="M0 -9 q-3.4 -5 -5.6 -0.6 q3.6 3 5.6 0.6 z" />
			<path d="M0 -9 q-1.6 5.6 3.4 5 q0.8 -4 -3.4 -5 z" />
		</g>
		<circle fill={TONES.metal} cx="0" cy="-9" r="1.4" />
	</g>
)

const Cable = () => (
	<g fill="none" stroke={TONES.purple} strokeOpacity="0.65" strokeWidth="1.2" strokeLinecap="round">
		<path d="M0 0 q9 -7 18 -3 q9 4 18 -4" />
		<path d="M2 -5 q10 -6 20 -2" />
	</g>
)

export const PIECES = { Chair, Lamp, Rug, Shelf, Crate, Barrel, Picture, Plant, Candle, Fan, Cable } as const

/* ── The rooms ─────────────────────────────────────────────────────────── */

export const ROOM = { w: 78, h: 46 }
export const FLOOR = 7

interface Item {
	piece: keyof typeof PIECES
	at: [number, number]
	since?: Familiarity
}

export const ROOMS: Record<
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
		// Beside the cradle, not on it: on it hid the one object the bay shows.
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
		// On the cable mat, the one place standing on the furniture is the point.
		stand: 96,
		label: { en: 'the long bay', es: 'la bahía larga' },
	},
}

export const floorOf = (kind: Furniture) => ROOMS[kind].y + ROOM.h - FLOOR

/** The earth everything is cut out of. */
export const Earth = () => <rect fill="url(#tico-burrow-earth)" width="200" height="132" />

/** One bay: its wall (warm, and lit when he is in it), one trace, its floor. */
export const Room = ({ kind, lit }: { kind: Furniture; lit: boolean }) => {
	const room = ROOMS[kind]
	const x = room.x + room.w * 0.68
	const bend = room.y + ROOM.h * 0.42
	return (
		<g>
			<rect fill={lit ? 'url(#tico-burrow-lit)' : TONES.wall} stroke={TONES.seam} strokeWidth="1.2" x={room.x} y={room.y} width={room.w} height={ROOM.h} rx="6" />
			<rect fill="url(#tico-burrow-ceiling)" x={room.x} y={room.y} width={room.w} height={ROOM.h} rx="6" />
			<path fill="none" stroke={TONES.trace} strokeOpacity={lit ? 0.3 : 0.18} strokeWidth="0.7" d={`M${x} ${room.y} L${x} ${bend} L${x + 8} ${bend + 8} L${x + 8} ${floorOf(kind)}`} />
			<circle fill={TONES.trace} opacity={lit ? 0.45 : 0.25} cx={x} cy={bend} r="1.1" />
			<rect fill={TONES.floor} stroke={TONES.seam} strokeWidth="1" x={room.x} y={floorOf(kind)} width={room.w} height={FLOOR} rx="2.4" />
			<rect fill={TONES.floorTop} x={room.x + 2} y={floorOf(kind)} width={room.w - 4} height={1.2} rx="0.6" />
		</g>
	)
}

/** The shaft down from the hatch, with the ladder he uses. */
export const Shaft = () => (
	<g>
		<rect fill={TONES.wall} stroke={TONES.seam} strokeWidth="1.2" x="40" y="-4" width="16" height="30" rx="4" />
		<path fill="none" stroke={TONES.wood} strokeWidth="1.4" strokeLinecap="round" d="M44 0 L44 26 M52 0 L52 26" />
		<path fill="none" stroke={TONES.woodLight} strokeWidth="1.2" strokeLinecap="round" d="M44 6 L52 6 M44 13 L52 13 M44 20 L52 20" />
	</g>
)

/** One room's furniture, placed against its floor, as far as he knows you. */
export const Furnishings = ({ kind, familiarity }: { kind: Furniture; familiarity: Familiarity }) => (
	<g>
		{ROOMS[kind].items
			.filter((item) => reached(familiarity, item.since))
			.map((item, index) => {
				const Piece = PIECES[item.piece]
				return (
					<g key={`${item.piece}-${index}`} transform={`translate(${ROOMS[kind].x + item.at[0]} ${floorOf(kind) + item.at[1]})`}>
						<Piece />
					</g>
				)
			})}
	</g>
)

/** The hatch in the strip's floor: boards, the hole, and the lid over it. */
export const Hatch = ({
	x,
	open,
	onClick,
	innerRef,
}: {
	x: number
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
			<HatchArt />
		</svg>
	</button>
)

export const HatchArt = () => (
	<>
		<defs>
			<linearGradient id="tico-hatch-vol" x1="0" y1="0" x2="0.9" y2="1">
				<stop offset="0%" stopColor="#ffffff" stopOpacity="0.12" />
				<stop offset="55%" stopColor="#ffffff" stopOpacity="0" />
				<stop offset="100%" stopColor="#000000" stopOpacity="0.26" />
			</linearGradient>
			<radialGradient id="tico-hatch-light">
				<stop offset="0%" stopColor={TONES.glow} stopOpacity="0.55" />
				<stop offset="100%" stopColor={TONES.glow} stopOpacity="0" />
			</radialGradient>
			{/* Boards that stop being boards at the edges, rather than ending. */}
			<linearGradient id="tico-floor" x1="0" y1="0" x2="1" y2="0">
				<stop offset="0%" stopColor={TONES.boards} stopOpacity="0" />
				<stop offset="20%" stopColor={TONES.boards} stopOpacity="0.95" />
				<stop offset="80%" stopColor={TONES.boards} stopOpacity="0.95" />
				<stop offset="100%" stopColor={TONES.boards} stopOpacity="0" />
			</linearGradient>
		</defs>
		<g className="tico-hatch-floor">
			<path d="M2 22 Q2 21 3.5 21 L116.5 21 Q118 21 118 22 L110 49 Q109.6 50 108 50 L12 50 Q10.4 50 10 49 z" fill="url(#tico-floor)" />
			<path d="M6 23.4 L114 23.4" stroke="#ffffff" strokeOpacity="0.06" strokeWidth="1.2" strokeLinecap="round" fill="none" />
			{/* The hole, always there, simply covered. */}
			<path d="M26 26 Q26 25.2 27.2 25.2 L92.8 25.2 Q94 25.2 94 26 L86.6 43 Q86.2 44 85 44 L35 44 Q33.8 44 33.4 43 z" fill={TONES.earthBottom} />
			{/* The burrow's own light, coming up through the hole whenever the lid is. */}
			<ellipse className="tico-hatch-light" fill="url(#tico-hatch-light)" cx="60" cy="40" rx="30" ry="9" />
			<path d="M26 26 L94 26 L91 32 L29 32 z" fill="#000000" opacity="0.45" />
		</g>
		<g className="tico-hatch-lid">
			<path fill={TONES.lid} d="M26 26 Q26 25.2 27.2 25.2 L92.8 25.2 Q94 25.2 94 26 L86.6 43 Q86.2 44 85 44 L35 44 Q33.8 44 33.4 43 z" />
			<path fill="url(#tico-hatch-vol)" d="M26 26 Q26 25.2 27.2 25.2 L92.8 25.2 Q94 25.2 94 26 L86.6 43 Q86.2 44 85 44 L35 44 Q33.8 44 33.4 43 z" />
			<g stroke="#ffffff" strokeOpacity="0.07" strokeWidth="1.2" strokeLinecap="round" fill="none">
				<path d="M48 26.6 L44.6 43" />
				<path d="M72 26.6 L74 43" />
			</g>
			<path fill={TONES.lidEdge} d="M34.6 43.4 L85.4 43.4 Q86.4 43.4 86.2 44.4 L85.8 46.6 Q85.6 47.4 84.6 47.4 L35.4 47.4 Q34.4 47.4 34.2 46.6 z" />
			<rect fill="#000000" opacity="0.34" x="55.5" y="37.4" width="9" height="2.6" rx="1.3" />
		</g>
	</>
)

/** Where each place's worn things hang from, in his drawing, for the rail. */
export const HANGS: Record<Where, number> = {
	head: 24,
	face: 50,
	neck: 62,
	body: 58,
	hand: 56,
	feet: 82,
}

/** Yours, on the wall of the long bay: what you posted down the hatch. */
const Rail = ({ left, x, y }: { left: string[]; x: number; y: number }) => (
	<g transform={`translate(${x} ${y})`}>
		<Box x={-2} y={-1.4} w={left.length * 12 + 4} h={1.4} r={0.7} tone="metal" />
		{left.map((kind, index) => (
			<g key={kind} transform={`translate(${index * 12 + 4} 0)`}>
				<path fill="none" stroke={TONES.metal} strokeWidth="1" strokeLinecap="round" d="M0 0 L0 2.6" />
				<svg x={-5.5} y={2} width={11} height={11} viewBox={`28 ${HANGS[WEARS[kind]] - 20} 40 40`}>
					<Prop kind={kind} />
				</svg>
			</g>
		))}
	</g>
)

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
	parts: CompanionParts
	worn: WornProp[]
	faceColor: string
	screenColor: string
	ledColor: string
	familiarity: Familiarity
	left: string[]
	present: boolean
	onPetClick: () => void
	innerRef: React.Ref<HTMLDivElement>
}) => {
	const here = ROOMS[scene.at]
	const kinds = Object.keys(ROOMS) as Furniture[]
	const doing = ACTIVITY[scene.at]

	return (
		<div className="tico-map" ref={innerRef}>
			<div className="tico-map-stage">
				<svg viewBox="0 0 200 132" aria-hidden="true">
					<BurrowDefs />
					<Earth />
					{kinds.map((kind) => (
						<Room key={kind} kind={kind} lit={present && kind === scene.at} />
					))}
					<Shaft />
					{kinds.map((kind) => (
						<Furnishings key={kind} kind={kind} familiarity={familiarity} />
					))}
					{left.length > 0 && <Rail left={left} x={ROOMS.rug.x + 10} y={floorOf('rug') - 30} />}
				</svg>

				{present && (
					<div
						className="tico-map-him"
						style={{
							left: `${((here.x + here.stand) / 200) * 100}%`,
							bottom: `${((132 - floorOf(scene.at)) / 132) * 100}%`,
						}}
					>
						<CompanionFace
							mood={scene.settled ? doing.mood : 'watching'}
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
