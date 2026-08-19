import type { CompanionFaceProps, CompanionMood } from '../types'

import { DEFAULT_PARTS, PARTS } from './parts'

/**
 * The pet: a face, the things he is wearing, and a body assembled out of `parts`.
 *
 * The face is drawn here and is the same face whatever body he has — the
 * expression is the character and the body is a costume for it. Everything under
 * it comes from `parts.tsx`, which also carries the landmark contract each
 * variant is drawn against. The `defs` stay here because every variant shares
 * them.
 *
 * By default he is what the site claims to be: a terminal window, ninety pixels
 * tall, with a face on its screen.
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
	propLeaving,
	faceColor,
	screenColor,
	ledColor,
	parts = DEFAULT_PARTS,
}: CompanionFaceProps) => {
	const { shell, hands, feet, antenna } = parts
	// The two colours a body part can be told about. Everything else it draws is
	// literal, because a body that shifted with his mood would be a mood.
	const colours = { screenColor, ledColor }
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

			{PARTS.antenna[antenna](colours)}

			{PARTS.hands[hands](colours)}

			{PARTS.feet[feet](colours)}

			{PARTS.shell[shell](colours)}

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

			{/*
			 * Keyed by kind, so swapping one prop for another remounts and replays
			 * the entrance. React would otherwise keep the same node and reuse the
			 * finished animation, and the new thing would appear already worn.
			 */}
			{prop && (
				<g
					key={prop}
					className="companion-worn"
					data-prop={prop}
					data-leaving={propLeaving || undefined}
				>
					<Prop kind={prop} />
				</g>
			)}

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
 *
 * Landmarks, since every one of these is placed against them: the case is
 * x 8–88, y 16–82; the title bar and its three lights end at y=31; the screen
 * is x 15–81, y 32–74; the eyes sit at (37,50) and (59,50) and the mouth around
 * y=62; the hands are x 1–9.6 and 86.4–95 at y 53–67; the feet are y 77–87 with
 * a gap between them at x 40.5–55.5. Anything hanging off his chin goes down
 * that gap; anything held goes on a hand, not beside it.
 *
 * Colours are literal here rather than tokens. A costume that shifted with his
 * mood would be a mood, and these are supposed to mean nothing. Never fill one
 * with a colour near `--bg-chrome` — that is the top hat that came out
 * invisible, twice.
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

		/* ── Wigs. They sit on the case, so they stop above y=22 and leave the
		      three lights showing — a wig covering them turns him back into a
		      featureless box for the minute he is wearing it. ─────────────── */

		case 'afro':
			return (
				<g className="companion-prop">
					<g fill="#6d4c37">
						<circle cx="27" cy="12" r="10.5" />
						<circle cx="69" cy="12" r="10.5" />
						<circle cx="36" cy="3" r="12" />
						<circle cx="60" cy="3" r="12" />
						<circle cx="48" cy="-1" r="13" />
					</g>
					{/* One highlight, or it is a brown cloud. */}
					<circle cx="40" cy="-4" r="4.5" fill="#8a6349" opacity="0.7" />
				</g>
			)
		case 'mohawk':
			return (
				<g className="companion-prop">
					<path d="M32 21 L36 0 L41 15 L48 -7 L55 15 L60 0 L64 21 Z" fill="#e5427a" />
					{/* Roots, so the spikes look grown rather than glued on. */}
					<path d="M32 15 q16 5 32 0 v6 q-16 4 -32 0 z" fill="#8d2a4d" />
				</g>
			)
		case 'longhair':
			return (
				<g className="companion-prop" fill="#c98b3f">
					{/* Two panels down the bezel, stopping short of the screen at
					    x=15 so they frame the face instead of covering it. */}
					<path d="M7 28 q-3 20 0 34 q6 4 11 0 q-3-18 0-34 z" />
					<path d="M89 28 q3 20 0 34 q-6 4 -11 0 q3-18 0-34 z" />
					{/* A crown and a centre-parted fringe. */}
					<path d="M6 30 q0-27 42-27 q42 0 42 27 q-5-16-15-19 q-11 8-27 8 q-16 0-27-8 q-10 3-15 19 z" />
				</g>
			)

		/* ── Hats ──────────────────────────────────────────────────────────── */

		case 'beanie':
			return (
				<g className="companion-prop">
					<path d="M26 15 q2-19 22-19 q20 0 22 19 z" fill="#5a83c4" />
					<rect x="24" y="13" width="48" height="8" rx="4" fill="#4a6ea8" />
					{/* The ribbing is what makes it knitted instead of a blue dome. */}
					<g stroke="#3d5c8d" strokeWidth="1.4" strokeLinecap="round">
						<line x1="33" y1="15" x2="33" y2="19" />
						<line x1="41" y1="15" x2="41" y2="19" />
						<line x1="49" y1="15" x2="49" y2="19" />
						<line x1="57" y1="15" x2="57" y2="19" />
						<line x1="65" y1="15" x2="65" y2="19" />
					</g>
					<circle cx="48" cy="-8" r="5.5" fill="#cfd8e8" />
				</g>
			)
		case 'cap':
			// Worn backwards, which is the only way a brim reads at this size —
			// pointing forward it is a flat bar across his own face.
			return (
				<g className="companion-prop">
					<path d="M26 16 q0-17 22-17 q22 0 22 17 z" fill="#2f7d5c" />
					<path d="M26 12 q-15 1 -17 6 q11 4 17 1 z" fill="#276b4e" />
					<rect x="25" y="12" width="46" height="5" rx="2.5" fill="#276b4e" />
					<circle cx="48" cy="-1" r="2.4" fill="#8fd6b4" />
				</g>
			)
		case 'hood':
			return (
				<g className="companion-prop">
					<path
						d="M4 50 q-4-42 44-42 q48 0 44 42 q-6 3-10-3 q4-31-34-31 q-38 0-34 31 q-4 6-10 3 z"
						fill="#4a5568"
					/>
					{/* Drawstrings. Two dots and two lines, and it is a hoodie. */}
					<g stroke="#cfd4e0" strokeWidth="2" strokeLinecap="round">
						<line x1="10" y1="50" x2="12" y2="60" />
						<line x1="86" y1="50" x2="84" y2="60" />
					</g>
					<circle cx="12.4" cy="61.5" r="2" fill="#cfd4e0" />
					<circle cx="83.6" cy="61.5" r="2" fill="#cfd4e0" />
				</g>
			)
		case 'catears':
			return (
				<g className="companion-prop">
					<path d="M23 20 L28 -3 L45 12 Z" fill="#4a5468" />
					<path d="M73 20 L68 -3 L51 12 Z" fill="#4a5468" />
					<path d="M28.5 15 L31 2 L40 12 Z" fill="var(--pink)" opacity="0.5" />
					<path d="M67.5 15 L65 2 L56 12 Z" fill="var(--pink)" opacity="0.5" />
				</g>
			)

		/* ── Worn on the face ──────────────────────────────────────────────── */

		case 'glasses':
			// Open lenses, unlike the shades — the whole joke of glasses is that
			// you can still see the eyes behind them.
			return (
				<g className="companion-prop" fill="none" stroke="#c0a06a" strokeWidth="2.2">
					<circle cx="37" cy="50" r="9.5" />
					<circle cx="59" cy="50" r="9.5" />
					<path d="M46.5 49 q1.5-2 3 0" />
					<path d="M27.5 47 l-9-2" strokeLinecap="round" />
					<path d="M68.5 47 l9-2" strokeLinecap="round" />
				</g>
			)
		case 'moustache':
			return (
				<g className="companion-prop">
					<path
						d="M48 56 q-4-2.5-8.5-1.5 q-5.5 1-5.5 4 q0 3 4 2 q6-1.5 10-4 q4 2.5 10 4 q4 1 4-2 q0-3-5.5-4 q-4.5-1-8.5 1.5 z"
						fill="#9a7d5e"
					/>
				</g>
			)

		/* ── Clothes. All of it hangs off the bottom edge of the case, which is
		      the only part of his front that is not screen. ────────────────── */

		case 'tie':
			return (
				<g className="companion-prop">
					<path d="M43.5 70 l4.5-3 l4.5 3 l-1.5 5 h-6 z" fill="#a63c4b" />
					<path d="M45 76 l-2 11 l5 7 l5-7 l-2-11 z" fill="#c74a5b" />
				</g>
			)
		case 'bowtie':
			return (
				<g className="companion-prop">
					<path d="M48 76 l-12-6 v12 z" fill="#d0405a" />
					<path d="M48 76 l12-6 v12 z" fill="#d0405a" />
					<rect x="44.5" y="72.5" width="7" height="7" rx="2" fill="#a83349" />
				</g>
			)
		case 'cape':
			return (
				<g className="companion-prop">
					{/* Flared outside the case rather than over it. Drawn on top of
					    everything, a cape across his front is a bib. */}
					<path d="M22 27 q-15 10 -13 25 q9-6 16-8 z" fill="#8f2c3e" />
					<path d="M74 27 q15 10 13 25 q-9-6-16-8 z" fill="#8f2c3e" />
					<path d="M22 20 q26 9 52 0 v6 q-26 9 -52 0 z" fill="#b03a4e" />
				</g>
			)

		/* ── Held ──────────────────────────────────────────────────────────── */

		case 'duck':
			// The rubber duck. He is very clear that it is there to be explained
			// to, and equally clear that this is not weird.
			return (
				<g className="companion-prop">
					<ellipse cx="46" cy="13" rx="11" ry="8" fill="#f2c14e" />
					<path d="M36 10 l-7-5 l2 9 z" fill="#f2c14e" />
					<circle cx="55" cy="5" r="6.5" fill="#f2c14e" />
					<path d="M60 3 l8 2.5 l-8 3.5 z" fill="#e8813a" />
					<circle cx="56.5" cy="3" r="1.3" fill="#2a2118" />
				</g>
			)
		case 'umbrella':
			// Over the left hand, where the coffee goes, and open — a closed one
			// at this size is a stick.
			return (
				<g className="companion-prop">
					<path d="M-19 27 a18 18 0 0 1 36 0 q-9-4 -18-4 q-9 0-18 4 z" fill="#d0405a" />
					<path d="M-19 27 q4.5 4 9 0 q4.5 4 9 0 q4.5 4 9 0 q4.5 4 9 0 v-1 h-36 z" fill="#d0405a" />
					<path d="M-1 27 L5 55" stroke="#8a6f52" strokeWidth="2.4" strokeLinecap="round" />
					<path d="M5 55 q1 5 6 4" fill="none" stroke="#8a6f52" strokeWidth="2.4" strokeLinecap="round" />
				</g>
			)

		/* ── Souvenirs ─────────────────────────────────────────────────────────
		      Not chosen. These only ever arrive on the way back from behind the
		      screen, which is the whole reason they are separated from the list
		      above — a cobweb that turns up on a Tuesday for no reason is just
		      another hat, and the joke here is entirely the causation. ────── */

		case 'cobweb':
			// Slung across his top-left corner the way one is across a corner of a
			// room, and drawn over the case rather than above it: it has to read as
			// being *on* him. Thin strokes, so the eye underneath still reads.
			return (
				<g
					className="companion-prop"
					fill="none"
					stroke="#e2e6f0"
					strokeWidth="1.3"
					opacity="0.8"
				>
					{/* Anchors out of the corner, then the spiral as three arcs. */}
					<path d="M8 16 L46 16 M8 16 L8 54 M8 16 L38 46" />
					<path d="M20 16 A12 12 0 0 1 8 28" />
					<path d="M31 16 A23 23 0 0 1 8 39" />
					<path d="M42 16 A34 34 0 0 1 8 50" />
				</g>
			)
		case 'bolt':
			// A nut, held up in the right hand for inspection. Deliberately small:
			// found objects are funnier at the size they would really be, and
			// anything bigger stops being debris and becomes a trophy.
			return (
				<g className="companion-prop">
					<path d="M90 47 l9 5 v10 l-9 5 l-9-5 v-10 z" fill="#7d8496" />
					{/* The lit top face, which is what stops it reading as a flat blob. */}
					<path d="M90 47 l9 5 l-9 5 l-9-5 z" fill="#99a1b3" />
					<circle cx="90" cy="57" r="4" fill="#2b303c" />
				</g>
			)
		case 'dust':
			// A dust bunny, built exactly like the afro — which is the point. It is
			// what the afro would be if nobody had picked it out.
			return (
				<g className="companion-prop">
					{/* Five circles at five sizes. Three of the same size came out a
					    smooth grey cloud, which is weather, not something under a desk. */}
					<g fill="#6f7482">
						<circle cx="34" cy="12" r="6.5" />
						<circle cx="43" cy="6" r="9" />
						<circle cx="54" cy="8" r="7.5" />
						<circle cx="62" cy="13" r="5.5" />
						<circle cx="48" cy="13" r="8" />
					</g>
					<circle cx="44" cy="4" r="3" fill="#878d9d" opacity="0.6" />
					{/*
					 * Wisps that curl away along the silhouette. These were straight
					 * radial lines and the whole thing read as an insect sitting on his
					 * head — three legs and a body is a bug however grey you make it.
					 */}
					<g fill="none" stroke="#7c8291" strokeWidth="1.1" strokeLinecap="round">
						<path d="M35 5 q-4-3 -8-1" />
						<path d="M49 -3 q1-4 5-4" />
						<path d="M64 8 q4-3 8-1" />
					</g>
				</g>
			)

		default:
			return null
	}
}
