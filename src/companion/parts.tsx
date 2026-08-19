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
 * cost one drawing, it costs thirty.
 *
 * What is *not* in the table, and cost one anyway: the corner. The cobweb was
 * struck from (8,16), the case's actual top-left, and `astro` and `capsule` round
 * that corner away — the web ended up hanging in mid-air beside him. It is
 * anchored at (14,24) now, which is inside every shell, and that is the point to
 * re-check when the next round one is drawn. A new variant varies silhouette, thickness,
 * corners, texture and colour; it never varies where the face and the limbs are.
 * The `tico-glass` clip in the parent's `defs` is the screen rectangle written
 * down twice on purpose: the contract enforces itself there.
 *
 * The CSS animates `.companion-hand` and `.companion-foot` by class and moves
 * them with `translate` — so limbs keep those class names and their `data-side`,
 * or walking, waving, sitting and covering his ears all quietly stop.
 *
 * That same rule *paints* them, which is the trap: `companion.css` sets `fill`
 * and `stroke` on those classes, and a CSS declaration beats a presentation
 * attribute however specific the attribute looks. A limb with a colour of its own
 * sets it with `style`, not with `fill="…"` — written as an attribute it comes
 * out the same dark grey as the default and looks like the colour was ignored.
 * Anything with more than one shape in it wraps them in a `<g>` that carries the
 * class, so the whole thing steps together.
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
	/*
	 * The one the PlayStation robot lent his face to: white, round, glossy, and
	 * mostly visor. The volume is spelled out instead of gradient-filled — a lit
	 * dome and a shaded skirt is what `tico-case` does in two stops, and doing it
	 * with shapes keeps the whole variant inside this file.
	 */
	astro: ({ screenColor }: PartProps) => (
		<>
			<rect
				x="8"
				y="16"
				width="80"
				height="66"
				rx="26"
				fill="#dde4f0"
				stroke="#b3bed4"
				strokeWidth="2"
			/>
			<ellipse cx="48" cy="26" rx="27" ry="7.5" fill="#ffffff" opacity="0.5" />
			<ellipse cx="48" cy="77.5" rx="21" ry="3" fill="#8f9db5" opacity="0.5" />

			{/* Wider than the screen on every side, or the eyes read as painted
			    onto a white box rather than lit behind glass. */}
			<rect
				x="12"
				y="28"
				width="72"
				height="48"
				rx="18"
				fill="#252a37"
				stroke="#5fa8e0"
				strokeWidth="1.4"
			/>

			{/* Two lights on the forehead. Below y=22, so a wig still leaves them. */}
			<circle cx="29" cy="23" r="2.6" fill="#7dcfff" />
			<circle cx="67" cy="23" r="2.6" fill="#7dcfff" />

			<rect
				className="companion-screen"
				x="15"
				y="32"
				width="66"
				height="42"
				rx="9"
				fill={screenColor}
				stroke="#161a23"
			/>
			<g clipPath="url(#tico-glass)">
				<path d="M15 51 L34 32 H45 L15 62 Z" fill="url(#tico-glare)" />
			</g>

			{/* A speaker slit, down the gap his feet leave him. */}
			<rect x="42" y="78" width="12" height="2.4" rx="1.2" fill="#a3b0c7" />
		</>
	),

	/*
	 * The tube. Lighter than the terminal on purpose — two dark boxes at 92px are
	 * the same box — and the difference you actually read is the depth of the
	 * bezel, so it gets a real one: a raised frame, a recess inside it, and the
	 * glass sitting at the bottom of the hole.
	 */
	crt: ({ screenColor }: PartProps) => (
		<>
			<rect
				x="8"
				y="16"
				width="80"
				height="66"
				rx="10"
				fill="#a29a89"
				stroke="#6f6857"
				strokeWidth="2"
			/>
			<rect x="12" y="19" width="72" height="7" rx="3.5" fill="#c0b8a4" opacity="0.6" />

			<rect x="12" y="28" width="72" height="50" rx="8" fill="#7b7462" />
			<rect x="13.2" y="29.2" width="69.6" height="47.6" rx="7" fill="#22262f" />

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
			<g clipPath="url(#tico-glass)">
				<rect x="15" y="32" width="66" height="14" fill="url(#tico-inset)" />
				<path d="M15 51 L34 32 H45 L15 62 Z" fill="url(#tico-glare)" />
			</g>

			{/* Vents, in the only part of his front that is neither glass nor foot. */}
			<g fill="#6f6857">
				<rect x="41" y="77" width="14" height="1.7" rx="0.85" />
				<rect x="41" y="79.8" width="14" height="1.7" rx="0.85" />
			</g>
		</>
	),

	/*
	 * No chrome at all: no lights, no title bar, no bezel to speak of. A soft
	 * warm shell with a seam, for when the joke about him being a window is not
	 * the joke you want that week.
	 */
	capsule: ({ screenColor }: PartProps) => (
		<>
			<rect
				x="8"
				y="16"
				width="80"
				height="66"
				rx="31"
				fill="#463c63"
				stroke="#6a5b96"
				strokeWidth="2"
			/>
			<ellipse cx="48" cy="27" rx="25" ry="7" fill="#ffffff" opacity="0.07" />

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
			<g clipPath="url(#tico-glass)">
				<rect x="15" y="32" width="66" height="14" fill="url(#tico-inset)" />
			</g>

			<path
				d="M25 78 q23 4 46 0"
				fill="none"
				stroke="#6a5b96"
				strokeWidth="1.6"
				strokeLinecap="round"
			/>
		</>
	),
	/*
	 * A cabinet. The band above the screen is the terminal's title bar in a
	 * different job — it is the only strip of him that is neither glass nor
	 * bezel, and a marquee is what it wants to be when it is not three lights.
	 */
	arcade: ({ screenColor }: PartProps) => (
		<>
			<rect
				x="8"
				y="16"
				width="80"
				height="66"
				rx="9"
				fill="#2e3550"
				stroke="#1b2036"
				strokeWidth="2"
			/>

			<rect x="13" y="19" width="70" height="9" rx="2.5" fill="#e0af68" />
			<rect x="13" y="19" width="70" height="4" rx="2" fill="#f2cd95" />

			{/* Side art, in the margin the screen leaves. Two colours, because one
			    down both sides is a racing stripe and two is a cabinet. */}
			<rect x="9.5" y="34" width="3.5" height="34" rx="1.75" fill="#f7768e" opacity="0.8" />
			<rect x="83" y="34" width="3.5" height="34" rx="1.75" fill="#7dcfff" opacity="0.8" />

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
			<g clipPath="url(#tico-glass)">
				<rect x="15" y="32" width="66" height="14" fill="url(#tico-inset)" />
				<path d="M15 51 L34 32 H45 L15 62 Z" fill="url(#tico-glare)" />
			</g>

			{/* The coin slot, down the gap between his feet. */}
			<rect x="43" y="77" width="10" height="2.6" rx="1.3" fill="#161a2a" />
		</>
	),
	/*
	 * A handheld console. The controls go in the seven units of margin the screen
	 * leaves down each side — which is where a real one puts them, and the only
	 * place on his front that is neither glass nor foot.
	 */
	handheld: ({ screenColor }: PartProps) => (
		<>
			<rect
				x="8"
				y="16"
				width="80"
				height="66"
				rx="13"
				fill="#4b4f75"
				stroke="#33365a"
				strokeWidth="2"
			/>
			<rect x="12" y="19" width="72" height="7" rx="3.5" fill="#7c82b4" opacity="0.45" />

			{/* The recess the glass sits in, so the controls read as being on a
			    surface rather than floating on the same plane as the screen. */}
			<rect x="12.5" y="29" width="71" height="50" rx="7" fill="#3a3d61" />

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
			<g clipPath="url(#tico-glass)">
				<rect x="15" y="32" width="66" height="14" fill="url(#tico-inset)" />
			</g>

			{/* A cross and two buttons. Six units across is small, and it is the
			    arrangement rather than the detail that says what this is. */}
			<g fill="#9aa1d8">
				<path d="M9.2 50.6 h2.4 v-2.4 h2.4 v2.4 h2.4 v2.4 h-2.4 v2.4 h-2.4 v-2.4 h-2.4 z" />
				<circle cx="83.2" cy="49.6" r="2.4" />
				<circle cx="83.2" cy="56" r="2.4" />
			</g>
			<g fill="#7c82b4">
				<rect x="60" y="77" width="12" height="1.6" rx="0.8" />
				<rect x="60" y="79.6" width="12" height="1.6" rx="0.8" />
			</g>
		</>
	),

	/*
	 * A picture frame, which makes the face a portrait of itself. The gold is the
	 * whole point — every other shell is some grey or other, and this one has to
	 * be found in a list of thumbnails at fifty pixels.
	 */
	frame: ({ screenColor }: PartProps) => (
		<>
			<rect
				x="8"
				y="16"
				width="80"
				height="66"
				rx="5"
				fill="#c0a06a"
				stroke="#8a7444"
				strokeWidth="2"
			/>
			{/* The moulding: a lit bevel inside the outer edge, and a dark mount
			    inside that. Three steps is what makes it read as carved. */}
			<rect x="11.5" y="19.5" width="73" height="59" rx="3" fill="#dcc190" />
			<rect x="13" y="21" width="70" height="56" rx="2.5" fill="#a98a58" />
			<rect x="14" y="30" width="68" height="46" rx="2" fill="#241f1a" />

			<rect
				className="companion-screen"
				x="15"
				y="32"
				width="66"
				height="42"
				rx="9"
				fill={screenColor}
				stroke="#151217"
			/>
			<g clipPath="url(#tico-glass)">
				<path d="M15 51 L34 32 H45 L15 62 Z" fill="url(#tico-glare)" />
			</g>

			<g fill="#e6cd9f">
				<circle cx="12.5" cy="20.5" r="2.2" />
				<circle cx="83.5" cy="20.5" r="2.2" />
				<circle cx="12.5" cy="77.5" r="2.2" />
				<circle cx="83.5" cy="77.5" r="2.2" />
			</g>
		</>
	),

	/*
	 * A wooden set with an arched top — the only shell whose silhouette is not a
	 * rounded rectangle, which is worth more at thumbnail size than any amount of
	 * detail inside one. The arch clears the screen: at y=32 its edge is at x=10,
	 * and the glass starts at 15.
	 */
	radio: ({ screenColor }: PartProps) => (
		<>
			<path
				d="M8 82 V44 Q8 16 48 16 Q88 16 88 44 V82 Z"
				fill="#6b4f35"
				stroke="#493422"
				strokeWidth="2"
			/>
			{/* Two arcs of grain, following the arch. Straight lines across a curved
			    front read as shelves. */}
			<g fill="none" stroke="#8a6a45" strokeWidth="1.6">
				<path d="M12 46 q4-24 36-24 q32 0 36 24" />
				<path d="M17 50 q4-22 31-22 q27 0 31 22" />
			</g>

			{/* The inner panel follows the arch too. As a rectangle it covered the
			    curve that is the whole reason this shell exists, and left a thin
			    wooden rind that read as a flat-topped box at ninety-two pixels. */}
			<path d="M12.5 77 V44 Q12.5 22 48 22 Q83.5 22 83.5 44 V77 Z" fill="#8a6a45" />
			<rect
				className="companion-screen"
				x="15"
				y="32"
				width="66"
				height="42"
				rx="9"
				fill={screenColor}
				stroke="#3d2c1c"
			/>
			<g clipPath="url(#tico-glass)">
				<rect x="15" y="32" width="66" height="14" fill="url(#tico-inset)" />
			</g>

			{/* Two knobs, down the gap his feet leave him. */}
			<g fill="#c9a86f">
				<circle cx="44" cy="79" r="2.4" />
				<circle cx="52" cy="79" r="2.4" />
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
	/* Round white gloves, and the reason they are `style` and not `fill`: the
	   stylesheet paints every limb by class and would have won. */
	gloves: () => (
		<>
			<g
				className="companion-hand"
				data-side="left"
				style={{ fill: '#e9eef8', stroke: '#b6c1d6' }}
			>
				<rect x="1.6" y="52.4" width="7.8" height="5.2" rx="2.6" />
				<circle cx="5.4" cy="60.2" r="5.9" />
			</g>
			<g
				className="companion-hand"
				data-side="right"
				style={{ fill: '#e9eef8', stroke: '#b6c1d6' }}
			>
				<rect x="86.6" y="52.4" width="7.8" height="5.2" rx="2.6" />
				<circle cx="90.6" cy="60.2" r="5.9" />
			</g>
		</>
	),

	/* Two prongs opening away from him. One shape with a notch cut in it read as
	   a mitten with a bite taken out; two that do not touch read as a pincer. */
	claws: () => (
		<>
			<g className="companion-hand" data-side="left">
				<path d="M9.4 53.6 q-4-2.4-7.4 0.6 l4.8 4.4 l2.8-1 z" />
				<path d="M9.4 66.4 q-4 2.4-7.4-0.6 l4.8-4.4 l2.8 1 z" />
			</g>
			<g className="companion-hand" data-side="right">
				<path d="M86.6 53.6 q4-2.4 7.4 0.6 l-4.8 4.4 l-2.8-1 z" />
				<path d="M86.6 66.4 q4 2.4 7.4-0.6 l-4.8-4.4 l-2.8 1 z" />
			</g>
		</>
	),
	/* Toes along the outer edge. Three bumps and a rounded palm is a paw at any
	   size; anything finer than that is gone by ninety-two pixels. */
	paws: () => (
		<>
			<g className="companion-hand" data-side="left">
				<path d="M2.8 54 q3.4-2.4 6.6 0 v8.6 q0 4.6-3.4 4.6 q-3.2 0-3.2-4.6 z" />
				<circle cx="2.2" cy="56.4" r="1.9" />
				<circle cx="1.7" cy="60.4" r="1.9" />
				<circle cx="2.2" cy="64.2" r="1.9" />
			</g>
			<g className="companion-hand" data-side="right">
				<path d="M93.2 54 q-3.4-2.4-6.6 0 v8.6 q0 4.6 3.4 4.6 q3.2 0 3.2-4.6 z" />
				<circle cx="93.8" cy="56.4" r="1.9" />
				<circle cx="94.3" cy="60.4" r="1.9" />
				<circle cx="93.8" cy="64.2" r="1.9" />
			</g>
		</>
	),

	/*
	 * Drawn as a stroke rather than a filled outline, which is the only way a
	 * shape this thin survives: as a filled C it came out at eight pixels wide
	 * and read as a curl of hair. `fill` and `stroke-width` are in `style`
	 * because the stylesheet paints limbs by class and would have won.
	 *
	 * He holds nothing any differently — the coffee and the umbrella are drawn
	 * where the hand is, not where its fingers are.
	 */
	hooks: () => (
		<>
			<g
				className="companion-hand"
				data-side="left"
				style={{ fill: 'none', strokeWidth: 3.4 }}
				strokeLinecap="round"
			>
				<path d="M8.2 53.6 v6.2 a3.9 4.4 0 1 1-5.8 3.4" />
			</g>
			<g
				className="companion-hand"
				data-side="right"
				style={{ fill: 'none', strokeWidth: 3.4 }}
				strokeLinecap="round"
			>
				<path d="M87.8 53.6 v6.2 a3.9 4.4 0 1 0 5.8 3.4" />
			</g>
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
	/* Chunky, with a sole. The sole is the whole trick — without a second colour
	   along the floor they are just larger pills. */
	boots: () => (
		<>
			<g className="companion-foot" data-side="left">
				<path d="M21.5 76 h19 v6.5 q0 6-6.5 6 h-6 q-6.5 0-6.5-6 z" />
				<rect x="20.4" y="85.4" width="21.2" height="3.4" rx="1.7" style={{ fill: '#151920' }} />
			</g>
			<g className="companion-foot" data-side="right">
				<path d="M55.5 76 h19 v6.5 q0 6-6.5 6 h-6 q-6.5 0-6.5-6 z" />
				<rect x="54.4" y="85.4" width="21.2" height="3.4" rx="1.7" style={{ fill: '#151920' }} />
			</g>
		</>
	),

	/* Tracks. They still alternate when he walks, which is wrong for a tank and
	   right for him — the step is the gait he already has. */
	treads: () => (
		<>
			<g className="companion-foot" data-side="left">
				<rect x="21" y="76" width="21" height="12.4" rx="6.2" />
				<circle cx="27" cy="82.2" r="2.7" style={{ fill: '#151920' }} />
				<circle cx="36" cy="82.2" r="2.7" style={{ fill: '#151920' }} />
			</g>
			<g className="companion-foot" data-side="right">
				<rect x="54" y="76" width="21" height="12.4" rx="6.2" />
				<circle cx="60" cy="82.2" r="2.7" style={{ fill: '#151920' }} />
				<circle cx="69" cy="82.2" r="2.7" style={{ fill: '#151920' }} />
			</g>
		</>
	),

	/*
	 * Wheels, and the reason the coils they replaced were cut: only about seven
	 * of the ninety-six units are below the case, so a foot is read almost
	 * entirely from its silhouette in that strip. Two turns of a spring in seven
	 * units was a smudge that looked exactly like the default pills. A circle at
	 * that size is still obviously a circle.
	 */
	wheels: () => (
		<>
			<g className="companion-foot" data-side="left">
				<circle cx="31" cy="84" r="4.8" />
				<circle cx="31" cy="84" r="1.8" style={{ fill: '#151920' }} />
			</g>
			<g className="companion-foot" data-side="right">
				<circle cx="65" cy="84" r="4.8" />
				<circle cx="65" cy="84" r="1.8" style={{ fill: '#151920' }} />
			</g>
		</>
	),
	/* The same toes as the paws, on the ground. */
	pads: () => (
		<>
			<g className="companion-foot" data-side="left">
				<path d="M22.5 77 h18 v5.4 q0 5.4-5.4 5.4 h-7.2 q-5.4 0-5.4-5.4 z" />
				<g style={{ fill: '#151920' }}>
					<circle cx="26.4" cy="86.6" r="1.9" />
					<circle cx="31.5" cy="87.2" r="1.9" />
					<circle cx="36.6" cy="86.6" r="1.9" />
				</g>
			</g>
			<g className="companion-foot" data-side="right">
				<path d="M55.5 77 h18 v5.4 q0 5.4-5.4 5.4 h-7.2 q-5.4 0-5.4-5.4 z" />
				<g style={{ fill: '#151920' }}>
					<circle cx="59.4" cy="86.6" r="1.9" />
					<circle cx="64.5" cy="87.2" r="1.9" />
					<circle cx="69.6" cy="86.6" r="1.9" />
				</g>
			</g>
		</>
	),

	/*
	 * No feet at all: two emitters and the light they throw on the floor. They
	 * still alternate when he walks, which on something that hovers reads as a
	 * wobble rather than as a step, and is funnier for it.
	 */
	hover: () => (
		<>
			<g className="companion-foot" data-side="left">
				<path d="M24 77 h16 v3.6 q0 3-3.2 3 h-9.6 q-3.2 0-3.2-3 z" />
				<ellipse cx="32" cy="86.4" rx="9.6" ry="3.2" style={{ fill: '#7dcfff', opacity: 0.4 }} />
				<ellipse cx="32" cy="85" rx="5.4" ry="1.8" style={{ fill: '#bfe8ff', opacity: 0.5 }} />
			</g>
			<g className="companion-foot" data-side="right">
				<path d="M56 77 h16 v3.6 q0 3-3.2 3 h-9.6 q-3.2 0-3.2-3 z" />
				<ellipse cx="64" cy="86.4" rx="9.6" ry="3.2" style={{ fill: '#7dcfff', opacity: 0.4 }} />
				<ellipse cx="64" cy="85" rx="5.4" ry="1.8" style={{ fill: '#bfe8ff', opacity: 0.5 }} />
			</g>
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
				className="companion-led"
			/>
		</>
	),
	/* Two of them, and the light on one. Both lit would be a pair of eyes above
	   his eyes; one lit is a creature with a lopsided ear, which is the same
	   trick the leaning aerial is playing. */
	ears: ({ ledColor }: PartProps) => (
		<>
			<path d="M23 19 q-4-16 7.5-17 q11.5 1 7.5 17 z" fill="#454d61" />
			<path d="M73 19 q4-16-7.5-17 q-11.5 1-7.5 17 z" fill="#454d61" />
			<path d="M27 18 q-2-11 3.5-12 q5.5 1 3.5 12 z" fill="var(--pink)" opacity="0.3" />
			<path d="M69 18 q2-11-3.5-12 q-5.5 1-3.5 12 z" fill="var(--pink)" opacity="0.3" />
			<circle className="companion-led" cx="30.5" cy="2.4" r="2.9" fill={ledColor} />
		</>
	),

	/* Pointed at something. The status light is the feed at its focus, which is
	   where the one part of him that means anything ought to sit. */
	dish: ({ ledColor }: PartProps) => (
		<>
			<path
				d="M48 17 L50.5 10"
				stroke="var(--line-strong)"
				strokeWidth="2.5"
				strokeLinecap="round"
				fill="none"
			/>
			<ellipse cx="51" cy="7.5" rx="11" ry="4.6" transform="rotate(-22 51 7.5)" fill="#2f3542" />
			{/* The lit face, offset rather than concentric. Two ellipses on the same
			    centre are a hoop, whatever you fill them with — this was one. */}
			<ellipse cx="51.7" cy="6.5" rx="9.4" ry="3.5" transform="rotate(-22 51 7.5)" fill="#6d7688" />
			<path d="M51 7.5 L53.4 2" stroke="#5b6478" strokeWidth="1.6" strokeLinecap="round" />
			<circle className="companion-led" cx="53.6" cy="1" r="2.5" fill={ledColor} />
		</>
	),

	/* The same light, made big enough to be the joke. It pulses like every other
	   one, which on something bulb-shaped reads as thinking rather than as status. */
	bulb: ({ ledColor }: PartProps) => (
		<>
			<path
				d="M48 17 q0-8 4-10"
				stroke="var(--line-strong)"
				strokeWidth="2.5"
				strokeLinecap="round"
				fill="none"
			/>
			<rect x="49.4" y="3.2" width="5.8" height="4" rx="1.3" fill="#5a6274" />
			<circle className="companion-led" cx="52.3" cy="-0.8" r="5.2" fill={ledColor} />
			<circle cx="50.2" cy="-2.6" r="1.7" fill="#ffffff" opacity="0.45" />
		</>
	),
	/* A beanie propeller. The hub is the light, which is the only way to keep the
	   one part of him that means something while covering the top of his head. */
	propeller: ({ ledColor }: PartProps) => (
		<>
			<path
				d="M48 17 L48 9"
				stroke="var(--line-strong)"
				strokeWidth="2.5"
				strokeLinecap="round"
				fill="none"
			/>
			<path d="M45 5.6 q-13-4.4-15.6 0.8 q2.4 5.2 15.6 1.6 z" fill="#5b6478" />
			<path d="M51 5.6 q13-4.4 15.6 0.8 q-2.4 5.2-15.6 1.6 z" fill="#5b6478" />
			<circle className="companion-led" cx="48" cy="6.4" r="3.2" fill={ledColor} />
		</>
	),

	/* Spikes off a ball. Same idea as the plain aerial and read from further away,
	   which is the whole difference between a bead and a satellite. */
	sputnik: ({ ledColor }: PartProps) => (
		<>
			<path
				d="M48 17 L50 11"
				stroke="var(--line-strong)"
				strokeWidth="2.5"
				strokeLinecap="round"
				fill="none"
			/>
			<g stroke="#5b6478" strokeWidth="1.8" strokeLinecap="round">
				<path d="M50 7.5 L42 0.5" />
				<path d="M50 7.5 L58.5 1.5" />
				<path d="M50 7.5 L43.5 13" />
				<path d="M50 7.5 L57 12.5" />
			</g>
			<circle className="companion-led" cx="50" cy="7.5" r="4" fill={ledColor} />
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
