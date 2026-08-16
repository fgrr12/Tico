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
}

/** Moods whose mouth is a hole rather than a line. */
const OPEN_MOUTHS: CompanionMood[] = ['wow', 'held', 'yawn']

const EYE_Y = 50
const LEFT = 37
const RIGHT = 59

export const CompanionFace = ({
	mood,
	blink,
	look,
	glyph,
	faceColor,
	ledColor,
}: CompanionFaceProps) => {
	const expression: Eyes = blink && EYES[mood] === 'open' ? 'closed' : EYES[mood]
	const cheeks = mood === 'happy' || mood === 'love'

	const eye = (base: number) => {
		const x = base + look.x * 3
		const y = EYE_Y + look.y * 2.4

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
			</defs>

			{/* Antenna — the status light, and the only part that means something. */}
			<line x1="48" y1="17" x2="48" y2="8" stroke="var(--line-strong)" strokeWidth="2.5" />
			<circle cx="48" cy="5" r="3.4" fill={ledColor} className="companion-led" />

			{/* Hands, so a hop, a wave and covering its ears have something to move. */}
			<rect
				className="companion-hand"
				data-side="left"
				x="1.5"
				y="50"
				width="8"
				height="14"
				rx="4"
			/>
			<rect
				className="companion-hand"
				data-side="right"
				x="86.5"
				y="50"
				width="8"
				height="14"
				rx="4"
			/>

			{/* Feet stick out below the body, which is what makes it a creature —
			    and they are what alternate when it walks somewhere. */}
			<rect
				className="companion-foot"
				data-side="left"
				x="24"
				y="79"
				width="16"
				height="8"
				rx="4"
			/>
			<rect
				className="companion-foot"
				data-side="right"
				x="56"
				y="79"
				width="16"
				height="8"
				rx="4"
			/>

			{/* The window itself. */}
			<rect
				x="8"
				y="16"
				width="80"
				height="66"
				rx="15"
				fill="var(--bg-chrome)"
				stroke="var(--line-strong)"
				strokeWidth="2"
			/>

			<circle cx="20" cy="25" r="2.4" fill="#f7768e" />
			<circle cx="28" cy="25" r="2.4" fill="#e0af68" />
			<circle cx="36" cy="25" r="2.4" fill="#9ece6a" />

			<rect
				x="15"
				y="32"
				width="66"
				height="42"
				rx="9"
				fill="var(--bg-pane)"
				stroke="var(--line)"
			/>
			<rect x="15" y="32" width="66" height="42" rx="9" fill="url(#tico-scanlines)" />

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

					{eye(LEFT)}
					{eye(RIGHT)}

					<path
						d={MOUTHS[mood]}
						fill={OPEN_MOUTHS.includes(mood) ? faceColor : 'none'}
						stroke={faceColor}
						strokeWidth={2.6}
						strokeLinecap="round"
						strokeLinejoin="round"
					/>
				</>
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
