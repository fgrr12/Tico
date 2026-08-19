import type { ReactNode } from 'react'

/**
 * His body, in four swappable slots. The face is not one of them — it is drawn
 * on the shell by `CompanionFace`, and it is the same face whatever he is.
 *
 * **The landmark contract, which is the whole reason this is cheap.**
 *
 * Every variant of every slot draws inside the same boxes as the one below it:
 *
 * | Landmark        | Where it has to stay              |
 * | --------------- | --------------------------------- |
 * | case            | x 8–88, y 16–82                   |
 * | title bar ends  | y 31                              |
 * | screen          | x 15–81, y 32–74                  |
 * | eyes            | (37,50) and (59,50)               |
 * | mouth           | around y 62                       |
 * | hands           | x 1–9.6 and 86.4–95, y 53–67      |
 * | feet            | y 77–87, gap between at x 40.5–55.5 |
 *
 * Thirty-odd props are placed against those numbers by hand — see `Prop` in
 * `CompanionFace.tsx` — so a shell that moves the head by four pixels does not
 * cost one drawing, it costs thirty. A new variant varies silhouette, thickness,
 * corners, texture and colour; it never varies where the face and the limbs are.
 * The `tico-glass` clip in the parent's `defs` is the screen rectangle written
 * down twice on purpose: the contract enforces itself there.
 *
 * The CSS animates `.companion-hand` and `.companion-foot` by class and moves
 * them with `translate` — so limbs keep those class names and their `data-side`,
 * or walking, waving, sitting and covering his ears all quietly stop.
 *
 * Gradients (`tico-case`, `tico-limb`), the scanline pattern and the clip live in
 * the parent's `defs` rather than here: they are shared by every variant, and a
 * part that carried its own would define the same id four times.
 */
export interface PartProps {
	/** The little screen behind the face. Blanches when he is frightened. */
	screenColor: string
	ledColor: string
}

/** Uniform signature across the slots, so the registries stay one shape. */
type Part = (props: PartProps) => ReactNode

/**
 * Checks the variants against `Part` while keeping their names, so `keyof` on a
 * registry is the list of things that actually exist and a typo in a saved
 * setting is a compile error rather than a pet with no feet.
 *
 * `satisfies` was the obvious way to write this and it does not work: it leaves
 * each variant its own inferred signature, so the two that ignore their argument
 * come out as `() => ReactNode` and refuse to be called with one.
 */
const slot = <K extends string>(variants: Record<K, Part>) => variants

const SHELLS = slot({
	/* The window itself — what the site claims he is. Same chrome as `TitleBar`:
	   three traffic lights, a dark pane, the faint scanline texture, so he reads
	   as a child process of this app rather than a sticker dropped on top. */
	terminal: ({ screenColor }: PartProps) => (
		<>
			{/* The gradient is the volume: lit along the top edge, falling off to
			    the floor. */}
			<rect
				x="8"
				y="16"
				width="80"
				height="66"
				rx="15"
				fill="url(#tico-case)"
				stroke="var(--line-strong)"
				strokeWidth="2"
			/>

			{/* A title bar, so the three lights sit on a surface instead of floating
			    on the bezel, and a rim light along the top so the light has a source. */}
			<path d="M9 31 A14 14 0 0 1 23 17 H73 A14 14 0 0 1 87 31 Z" fill="#ffffff" opacity="0.035" />
			<path d="M9 31 H87" stroke="#000000" strokeOpacity="0.25" strokeWidth="1" />
			<path
				d="M10 30 A13 13 0 0 1 23 17.6 H73 A13 13 0 0 1 86 30"
				fill="none"
				stroke="#ffffff"
				strokeOpacity="0.09"
				strokeWidth="1.6"
			/>

			<circle cx="20" cy="25" r="2.4" fill="#f7768e" />
			<circle cx="28" cy="25" r="2.4" fill="#e0af68" />
			<circle cx="36" cy="25" r="2.4" fill="#9ece6a" />

			<rect
				className="companion-screen"
				x="15"
				y="32"
				width="66"
				height="42"
				rx="9"
				fill={screenColor}
				stroke="var(--line)"
			/>
			<rect x="15" y="32" width="66" height="42" rx="9" fill="url(#tico-scanlines)" />

			{/* Recessed under the bezel, and one soft reflection off the corner. Both
			    stop short of the eyes on purpose — this is glass, not weather. */}
			<g clipPath="url(#tico-glass)">
				<rect x="15" y="32" width="66" height="14" fill="url(#tico-inset)" />
				<path d="M15 51 L34 32 H45 L15 62 Z" fill="url(#tico-glare)" />
			</g>
		</>
	),
})

const HANDS = slot({
	/* Hands, so a hop, a wave and covering its ears have something to move. They
	   hang low and taper toward the wrist — as vertical pills at mid height they
	   read as knobs on the side of a device, not as arms. */
	mitts: () => (
		<>
			<path
				className="companion-hand"
				data-side="left"
				d="M2.6 53.2 q3.4-2.6 6.6 0 l0.4 8.4 q0.2 5-3.8 5.2 q-4 0.2-4.4-4.8 z"
			/>
			<path
				className="companion-hand"
				data-side="right"
				d="M93.4 53.2 q-3.4-2.6-6.6 0 l-0.4 8.4 q-0.2 5 3.8 5.2 q4 0.2 4.4-4.8 z"
			/>
		</>
	),
})

const FEET = slot({
	/* Feet stick out below the body, which is what makes it a creature — and they
	   are what alternate when it walks somewhere. Square where the case meets
	   them, round where the floor does. */
	pills: () => (
		<>
			<path
				className="companion-foot"
				data-side="left"
				d="M23.5 77 h17 v5.5 q0 4.5-4.5 4.5 h-8 q-4.5 0-4.5-4.5 z"
			/>
			<path
				className="companion-foot"
				data-side="right"
				d="M55.5 77 h17 v5.5 q0 4.5-4.5 4.5 h-8 q-4.5 0-4.5-4.5 z"
			/>
		</>
	),
})

const ANTENNAS = slot({
	/*
	 * The status light, and the only part of him that means something: it follows
	 * the same rule as the rest of the palette — green is ready, amber is running,
	 * pink is a failure. Everything else about him is expression.
	 *
	 * It leans. Everything else is mirror-symmetric, and perfect symmetry is what
	 * makes a drawing read as an object instead of a creature; one part off-axis
	 * is the cheapest character there is.
	 *
	 * A variant that drops the LED drops the only status he can show, so whatever
	 * replaces it carries a `.companion-led` node or he loses the ability.
	 */
	led: ({ ledColor }: PartProps) => (
		<>
			<path
				d="M48 17 L50.6 8.4"
				stroke="var(--line-strong)"
				strokeWidth="2.5"
				strokeLinecap="round"
				fill="none"
			/>
			<circle
				cx="51.2"
				cy="5.4"
				r="3.4"
				fill={ledColor}
				className="companion-led companion-tint"
			/>
		</>
	),
})

/** Every slot and everything that can fill it. The customiser reads this. */
export const PARTS = {
	shell: SHELLS,
	hands: HANDS,
	feet: FEET,
	antenna: ANTENNAS,
}

/** Which variant fills each slot. Mirrors `parts` in `state.rs`. */
export interface CompanionParts {
	shell: keyof typeof SHELLS
	hands: keyof typeof HANDS
	feet: keyof typeof FEET
	antenna: keyof typeof ANTENNAS
}

/** What he is if nobody has said otherwise, and what he has always been. */
export const DEFAULT_PARTS: CompanionParts = {
	shell: 'terminal',
	hands: 'mitts',
	feet: 'pills',
	antenna: 'led',
}

/**
 * One slot's saved value, if it still names something that exists.
 *
 * `tico.json` is a file, and a file outlives the drawings it names — rename a
 * variant, or open a config a newer build wrote, and a slot points at nothing.
 * Unresolved that is `undefined(...)` at the top of the render, which is not a
 * missing foot, it is a pet who does not appear at all.
 */
const known = <K extends string>(
	variants: Record<K, Part>,
	saved: string | undefined,
	fallback: K
): K => (saved !== undefined && saved in variants ? (saved as K) : fallback)

/** A body out of whatever was on disk, with every slot guaranteed to draw. */
export const bodyFrom = (
	saved: Partial<Record<keyof CompanionParts, string>> | null | undefined
): CompanionParts => ({
	shell: known(PARTS.shell, saved?.shell, DEFAULT_PARTS.shell),
	hands: known(PARTS.hands, saved?.hands, DEFAULT_PARTS.hands),
	feet: known(PARTS.feet, saved?.feet, DEFAULT_PARTS.feet),
	antenna: known(PARTS.antenna, saved?.antenna, DEFAULT_PARTS.antenna),
})
