import { createRoot } from 'react-dom/client'

import { bodyFrom } from '../src/companion/parts'
import { PALETTE, PROPS, type Familiarity, wornFrom } from '../src/data/companion'
import { BurrowMap, Hatch } from '../src/house/House.tsx'
import { FURNITURE, sceneAt } from '../src/house/house.ts'

import '../src/companion.css'

/**
 * The burrow, rendered, because `check.mjs` cannot see a drawing.
 *
 * The same reason `sheet.html` exists and the same reason `prefs.html` does.
 * `pnpm dev` and open `/scripts/burrow.html`.
 *
 * Three axes on one page, because all three change what is drawn and none of
 * them is visible in a type: which bay he is in, **how well he knows you** —
 * which is how furnished the place is — and what you have left on the rail.
 */

const at = 1_700_000_000_000

/** Walk the clock until the hash lands him in the bay this row wants. */
const minutesInto = (room: (typeof FURNITURE)[number]) => {
	let minutes = 0
	while (minutes < 400 && sceneAt(at, at + minutes * 60_000, room).at !== room) minutes++
	return minutes
}

const Cell = ({
	label,
	room,
	familiarity,
	left = [],
	parts = null,
	pinned = {},
	own = null,
	feeling = 'content' as keyof typeof PALETTE,
	present = true,
}: {
	label: string
	room: (typeof FURNITURE)[number]
	familiarity: Familiarity
	left?: string[]
	parts?: Parameters<typeof bodyFrom>[0]
	pinned?: Record<string, string>
	own?: string | null
	feeling?: keyof typeof PALETTE
	present?: boolean
}) => {
	const scene = sceneAt(at, at + minutesInto(room) * 60_000, room)
	const palette = PALETTE[feeling]
	return (
		<div className="cell">
			<p className="lab">{label}</p>
			<BurrowMap
				scene={scene}
				language="es"
				present={present}
				parts={bodyFrom(parts)}
				worn={wornFrom(pinned, own)}
				faceColor={palette.face}
				screenColor={palette.screen}
				ledColor={palette.led}
				familiarity={familiarity}
				left={left}
				onPetClick={() => {}}
				innerRef={null}
			/>
		</div>
	)
}

const TIERS: Familiarity[] = ['new', 'knowing', 'familiar', 'old']

const App = () => (
	<>
		<div className="row" style={{ alignItems: 'flex-end', gap: 70 }}>
			{[
				['shut', false],
				['open', true],
			].map(([label, open]) => (
				<div key={label as string} style={{ position: 'relative', width: 170, height: 90 }}>
					<p className="lab">{`service panel · ${label}`}</p>
					<Hatch x={0} open={open as boolean} onClick={() => {}} innerRef={null} />
				</div>
			))}
		</div>

		{/* How the burrow fills up. Day one to day sixty, same bay, same pet. */}
		<div className="row">
			{TIERS.map((tier) => (
				<Cell key={tier} label={`grows · ${tier}`} room="chair" familiarity={tier} />
			))}
		</div>

		{/* Every bay, furnished, with a different body and a different thing worn. */}
		<div className="row">
			<Cell label="cradle · top hat" room="chair" familiarity="old" own="tophat" feeling="sleepy" />
			<Cell
				label="warm bay · capsule + wheels"
				room="lamp"
				familiarity="old"
				parts={{ shell: 'capsule', feet: 'wheels' }}
				own="coffee"
				feeling="pleased"
			/>
			<Cell label="long bay · dust" room="rug" familiarity="old" own="dust" feeling="scared" />
		</div>

		{/* The rail: what you have posted down the hatch, at every place it can
		    be worn, so a prop that hangs wrong is visible rather than reasoned
		    about. */}
		<div className="row">
			<Cell
				label="rail · six things left"
				room="rug"
				familiarity="old"
				left={['tophat', 'shades', 'scarf', 'cape', 'coffee', 'wellies']}
			/>
			<Cell
				label="rail · everything, one of each place"
				room="chair"
				familiarity="familiar"
				left={PROPS.slice(0, 6)}
			/>
			<Cell label="nobody home, day one" room="lamp" familiarity="new" present={false} />
		</div>
	</>
)

createRoot(document.getElementById('root') as HTMLElement).render(<App />)
