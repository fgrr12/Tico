import type { CompanionFaceProps, CompanionMood } from '../types'

/**
 * The pet drawn as what the site claims to be: a terminal window, ninety pixels
 * tall, with a face on its screen. Same window chrome as `TitleBar` — three
 * traffic lights, a dark pane, the faint scanline texture — so it reads as a
 * child process of this app rather than as a sticker dropped on top of it.
 *
 * The antenna LED is the one piece that carries information: it follows the same
 * rule as the rest of the palette — green is ready, amber is running, pink is a
 * failure. Everything else here is expression.
 */

type Eyes = 'open' | 'closed' | 'smile' | 'cross' | 'heart' | 'wide' | 'spiral'

const EYES: Record<CompanionMood, Eyes> = {
	idle: 'open',
	happy: 'smile',
	thinking: 'closed',
	error: 'cross',
	wow: 'wide',
	love: 'heart',
	dizzy: 'spiral',
	sleep: 'closed',
	held: 'wide',
	watching: 'open',
	muted: 'open',
	yawn: 'closed',
	scared: 'wide',
}

/** Drawn around (0,0) and translated into place, so both eyes share one path. */
const HEART =
	'M0 4.6 C-6 0.6 -5.6-4.6 -2.6-4.6 C-1-4.6 0-3.4 0-2.4 C0-3.4 1-4.6 2.6-4.6 C5.6-4.6 6 0.6 0 4.6Z'

const MOUTHS: Record<CompanionMood, string> = {
	idle: 'M42 62 q6 4.5 12 0',
	happy: 'M39.5 60 q8.5 9 17 0',
	thinking: 'M45 63 q3 3 6 0',
	error: 'M40 65.5 l4-4 l4 4 l4-4',
	wow: 'M43 62 q5 7 10 0 q-5 -3 -10 0',
	love: 'M39.5 60 q8.5 9 17 0',
	dizzy: 'M40 64 q3-3 6 0 q3 3 6 0',
	sleep: 'M43 63 q3-2.5 5 0 q2 2.5 5 0',
	held: 'M43.5 62 q4.5 6 9 0',
	watching: 'M43 62 q5 3.5 10 0',
	muted: 'M42 63 h12',
	yawn: 'M40 58.5 q8 15 16 0 q-8-7-16 0',
	// A wobble, not a frown. Fear is unsteady rather than sad.
	scared: 'M39 62 q3.5-4 7 0 q3.5 4 7 0 q3.5-4 3 0',
}

/** Moods whose mouth is a hole rather than a line. */
const OPEN_MOUTHS: CompanionMood[] = ['wow', 'held', 'yawn']

const EYE_Y = 50
const LEFT = 37
const RIGHT = 59

export const CompanionFace = ({
	mood,
	blink,
	glyph,
	singing,
	prop,
	faceColor,
	screenColor,
	ledColor,
}: CompanionFaceProps) => {
	const expression: Eyes = blink && EYES[mood] === 'open' ? 'closed' : EYES[mood]
	const cheeks = mood === 'happy' || mood === 'love'

	const eye = (base: number) => {
		const x = base
		const y = EYE_Y

		switch (expression) {
			case 'closed':
				return <rect x={x - 5} y={y - 1.4} width={10} height={2.8} rx={1.4} fill={faceColor} />
			case 'smile':
				return (
					<path
						d={`M${x - 6} ${y + 2.5} q6 -8.5 12 0`}
						fill="none"
						stroke={faceColor}
						strokeWidth={3}
						strokeLinecap="round"
					/>
				)
			case 'cross':
				return (
					<path
						d={`M${x - 4.5} ${y - 4.5} l9 9 M${x + 4.5} ${y - 4.5} l-9 9`}
						stroke={faceColor}
						strokeWidth={2.8}
						strokeLinecap="round"
					/>
				)
			case 'heart':
				return <path d={HEART} fill="var(--pink)" transform={`translate(${x} ${y})`} />
			case 'wide':
				return <rect x={x - 5.5} y={y - 7} width={11} height={14} rx={5.5} fill={faceColor} />
			case 'spiral':
				return (
					<g stroke={faceColor} fill="none" strokeWidth={2}>
						<circle cx={x} cy={y} r={5.4} />
						<circle cx={x} cy={y} r={2} />
					</g>
				)
			default:
				return <rect x={x - 4.5} y={y - 5.5} width={9} height={11} rx={3.5} fill={faceColor} />
		}
	}

	return (
		<svg viewBox="0 0 96 96" className="companion-svg" aria-hidden="true">
			<defs>
				<pattern id="tico-scanlines" width="4" height="4" patternUnits="userSpaceOnUse">
					<rect width="4" height="1" fill="#ffffff" opacity="0.035" />
				</pattern>
				<radialGradient id="tico-shadow">
					<stop offset="0%" stopColor="#000000" stopOpacity="0.55" />
					<stop offset="70%" stopColor="#000000" stopOpacity="0.2" />
					<stop offset="100%" stopColor="#000000" stopOpacity="0" />
				</radialGradient>

				{/*
				 * Four gradients and a clip, all static — the GPU rasterises them once.
				 * They are what turns a flat rounded rectangle into an object with a
				 * near side and a far side, which is the whole difference between a
				 * sticker on the desktop and something standing on it.
				 */}
				<linearGradient id="tico-case" x1="0" y1="0" x2="0" y2="1">
					<stop offset="0%" stopColor="#2c313d" />
					<stop offset="55%" stopColor="#21242c" />
					<stop offset="100%" stopColor="#1a1d24" />
				</linearGradient>
				<linearGradient id="tico-limb" x1="0" y1="0" x2="0" y2="1">
					<stop offset="0%" stopColor="#363c4b" />
					<stop offset="100%" stopColor="#262a34" />
				</linearGradient>
				<linearGradient id="tico-inset" x1="0" y1="0" x2="0" y2="1">
					<stop offset="0%" stopColor="#000000" stopOpacity="0.45" />
					<stop offset="35%" stopColor="#000000" stopOpacity="0" />
				</linearGradient>
				<linearGradient id="tico-glare" x1="0" y1="0" x2="1" y2="1">
					<stop offset="0%" stopColor="#ffffff" stopOpacity="0.07" />
					<stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
				</linearGradient>
				<clipPath id="tico-glass">
					<rect x="15" y="32" width="66" height="42" rx="9" />
				</clipPath>
			</defs>

			{/*
			 * A drawn shadow rather than a CSS drop-shadow.
			 *
			 * The filter was a blur pass recomputed on every frame of an animation
			 * that never stops — it ran for as long as he was on screen. This is two
			 * ellipses and a gradient, which the GPU draws once and forgets. It is
			 * also more correct: something standing on a ledge casts a shadow on the
			 * ledge, it does not glow.
			 */}
			{/* Tucked under the feet rather than spread across them — it used to sit
			    high enough to wash them out, which is why they read as part of it. */}
			<ellipse cx="48" cy="90" rx="27" ry="4.5" fill="url(#tico-shadow)" />

			{/*
			 * Antenna — the status light, and the only part that means something.
			 *
			 * It leans. Everything else about him is mirror-symmetric, and perfect
			 * symmetry is what makes a drawing read as an object instead of a
			 * creature; one part off-axis is the cheapest character there is.
			 */}
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

			{/* Hands, so a hop, a wave and covering its ears have something to move.
			    They hang low and taper toward the wrist — as vertical pills at mid
			    height they read as knobs on the side of a device, not as arms. */}
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

			{/* Feet stick out below the body, which is what makes it a creature —
			    and they are what alternate when it walks somewhere. Square where the
			    case meets them, round where the floor does. */}
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

			{/* The window itself. The gradient is the volume: lit along the top edge,
			    falling off to the floor. */}
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

			{glyph ? (
				<text x="48" y="61" textAnchor="middle" fontSize="26" className="companion-glyph">
					{glyph}
				</text>
			) : (
				<>
					{cheeks && (
						<g fill="var(--pink)" opacity="0.35">
							<ellipse cx="27" cy="60" rx="4" ry="2.6" />
							<ellipse cx="69" cy="60" rx="4" ry="2.6" />
						</g>
					)}

					{/*
					 * Wrapped so the pointer can move them through a CSS variable
					 * instead of through React. This used to be two numbers in state,
					 * updated up to thirty times a second, re-rendering the whole
					 * drawing each time — for an effect that is six pixels of travel.
					 */}
					<g className="companion-eyes">
						{eye(LEFT)}
						{eye(RIGHT)}
					</g>

					{/* Singing replaces the mouth rather than adding to it: an open
					    mouth that scales reads as a note being held, and the shape it
					    would otherwise have is irrelevant while he is doing it. */}
					{singing ? (
						<ellipse
							className="companion-sing"
							cx="48"
							cy="63"
							rx="5"
							ry="6"
							fill={faceColor}
						/>
					) : (
						<path
							d={MOUTHS[mood]}
							fill={OPEN_MOUTHS.includes(mood) ? faceColor : 'none'}
							stroke={faceColor}
							strokeWidth={2.6}
							strokeLinecap="round"
							strokeLinejoin="round"
						/>
					)}
				</>
			)}

			{prop && <Prop kind={prop} />}

			{singing && (
				<g fill={faceColor} className="companion-notes" aria-hidden="true">
					<text x="76" y="26" fontSize="13">
						♪
					</text>
					<text x="86" y="18" fontSize="11">
						♫
					</text>
				</g>
			)}

			{/* Two things that only exist in one state each. */}
			{mood === 'thinking' && (
				<g fill={faceColor} className="companion-think">
					<circle cx="30" cy="10" r="2.6" />
					<circle cx="40" cy="7" r="2.6" />
					<circle cx="50" cy="5" r="2.6" />
				</g>
			)}

			{mood === 'sleep' && (
				<g fill="var(--fg-muted)" fontSize="11" className="companion-zzz">
					<text x="70" y="24">
						z
					</text>
					<text x="78" y="14">
						z
					</text>
				</g>
			)}
		</svg>
	)
}

/**
 * Things he is wearing, for no reason and with no explanation.
 *
 * The whole point is that they are unmotivated. A pet that puts on a party hat
 * because it is your birthday is a feature; one that puts on a party hat on a
 * Tuesday afternoon and takes it off forty seconds later is a character.
 *
 * Drawn above y=16, which is the top of his head, so they overflow the viewBox —
 * `.companion-svg` is `overflow: visible` for exactly this.
 */
const Prop = ({ kind }: { kind: string }) => {
	switch (kind) {
		case 'party':
			return (
				<g className="companion-prop">
					<path d="M48 -12 L62 20 L34 20 Z" fill="var(--pink)" />
					<path d="M40 12 L56 12 L58 17 L38 17 Z" fill="var(--amber)" />
					<circle cx="48" cy="-14" r="4" fill="var(--cyan)" />
				</g>
			)
		case 'tophat':
			// Not black. A black hat on a dark desktop is a purple stripe floating
			// over nothing, which is what this was.
			return (
				<g className="companion-prop">
					<rect x="28" y="13" width="40" height="6" rx="3" fill="#3a4054" />
					<rect x="36" y="-13" width="24" height="28" rx="3" fill="#2e3444" />
					<rect x="36" y="1" width="24" height="6" fill="var(--purple)" />
					<rect x="36" y="-13" width="6" height="28" fill="#3a4054" opacity="0.5" />
				</g>
			)
		case 'shades':
			return (
				<g className="companion-prop">
					<rect x="26" y="42" width="20" height="15" rx="5" fill="#0d0f14" />
					<rect x="50" y="42" width="20" height="15" rx="5" fill="#0d0f14" />
					<rect x="44" y="47" width="8" height="3" fill="#0d0f14" />
					<rect x="29" y="45" width="7" height="4" rx="2" fill="#ffffff" opacity="0.25" />
				</g>
			)
		case 'headphones':
			// The band has to clear the top of his head, not run through it, and at
			// #2a2e3a it was the same colour as the body it was hiding inside.
			return (
				<g className="companion-prop">
					<path
						d="M10 46 A38 38 0 0 1 86 46"
						fill="none"
						stroke="#4a5164"
						strokeWidth="7"
						strokeLinecap="round"
					/>
					<rect x="2" y="42" width="15" height="24" rx="7" fill="#4a5164" />
					<rect x="79" y="42" width="15" height="24" rx="7" fill="#4a5164" />
					<rect x="5" y="47" width="9" height="14" rx="4" fill="#20242e" />
					<rect x="82" y="47" width="9" height="14" rx="4" fill="#20242e" />
				</g>
			)
		case 'crown':
			return (
				<g className="companion-prop">
					<path d="M32 16 L32 -2 L40 8 L48 -6 L56 8 L64 -2 L64 16 Z" fill="var(--amber)" />
					<circle cx="48" cy="-8" r="3" fill="var(--pink)" />
				</g>
			)
		case 'flower':
			// Tucked against the corner of his head. Out at x=74 it read as a
			// separate object hovering beside him rather than something worn.
			return (
				<g className="companion-prop">
					<g fill="var(--pink)">
						<circle cx="62" cy="14" r="5" />
						<circle cx="71" cy="14" r="5" />
						<circle cx="66.5" cy="7" r="5" />
						<circle cx="66.5" cy="21" r="5" />
					</g>
					<circle cx="66.5" cy="14" r="3.5" fill="var(--amber)" />
				</g>
			)
		case 'scarf':
			// A band with a hanging end, rather than the plank across his middle
			// this used to be. The fringe lines are what make it read as cloth.
			return (
				<g className="companion-prop">
					<path
						d="M14 72 q34 9 68 0 v10 q-34 9 -68 0 z"
						fill="var(--pink)"
					/>
					<path d="M62 80 q7 3 11 1 l3 20 q-6 3 -12 0 z" fill="#e0637c" />
					<g stroke="#c9536a" strokeWidth="1.5" strokeLinecap="round">
						<line x1="65" y1="99" x2="65" y2="103" />
						<line x1="70" y1="100" x2="70" y2="104" />
						<line x1="74" y1="99" x2="74" y2="103" />
					</g>
				</g>
			)
		case 'coffee':
			// Sitting in the hand rather than floating beside it, and with steam,
			// which is the only part that says it is hot rather than a white box.
			// Its y is tied to the hand's — the two moved together when the hands
			// were lowered, and a cup that misses the hand by five pixels floats.
			return (
				<g className="companion-prop">
					<rect x="-0.5" y="46" width="13" height="15" rx="3" fill="#e8e8ea" />
					<path d="M12.5 50 a4.5 4.5 0 0 1 0 8" fill="none" stroke="#e8e8ea" strokeWidth="2.5" />
					<rect x="-0.5" y="46" width="13" height="3.5" rx="1.8" fill="#6b4a2f" />
					<g stroke="#e8e8ea" strokeWidth="1.5" strokeLinecap="round" opacity="0.45">
						<path d="M3 42 q2-4 0-8" fill="none" />
						<path d="M8.5 42 q2-4 0-8" fill="none" />
					</g>
				</g>
			)
		default:
			return null
	}
}
