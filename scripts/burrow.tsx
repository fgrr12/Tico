import { createRoot } from 'react-dom/client'

import { PALETTE, wornFrom } from '../src/data/companion'
import { BurrowMap, Hatch } from '../src/house/House.tsx'
import { FURNITURE, sceneAt } from '../src/house/house.ts'
import { bodyFrom } from '../src/companion/parts'

import '../src/companion.css'

/**
 * The burrow, rendered, because `check.mjs` cannot see a drawing.
 *
 * The same reason `sheet.html` exists and the same reason `prefs.html` does: the
 * room he stands in is a 200×132 cutaway and he is a 96×96 SVG positioned over
 * it in percentages, and no type or assertion has an opinion about whether that
 * lands him on the floor or halfway through it. `pnpm dev` and open
 * `/scripts/burrow.html`.
 *
 * Every row is a different body and a different thing worn, because that is the
 * change this page was added for — the wardrobe and the preferences window used
 * to stop at the trapdoor.
 */

const CASES: { label: string; parts: Parameters<typeof bodyFrom>[0]; pinned: Record<string, string>; own: string | null; feeling: keyof typeof PALETTE }[] = [
	{ label: 'default · nothing on', parts: null, pinned: {}, own: null, feeling: 'content' },
	{ label: 'default · top hat', parts: null, pinned: {}, own: 'tophat', feeling: 'sleepy' },
	{ label: 'capsule + wheels · coffee', parts: { shell: 'capsule', feet: 'wheels' }, pinned: {}, own: 'coffee', feeling: 'pleased' },
	{ label: 'default · dust, up from the long room', parts: null, pinned: {}, own: 'dust', feeling: 'bored' },
	{ label: 'default · flower + scarf pinned', parts: null, pinned: { neck: 'scarf' }, own: 'flower', feeling: 'lonely' },
	{ label: 'default · afro, just got in', parts: null, pinned: {}, own: 'afro', feeling: 'curious' },
]

const at = 1_700_000_000_000

/** The trapdoor at three sizes, shut and open, since it is drawn on the floor
 *  of the strip and never inside the map. */
const Hatches = () => (
	<div className="row" style={{ alignItems: 'flex-end', gap: 70 }}>
		{[
			['shut', false],
			['open', true],
		].map(([label, open]) => (
			<div key={label as string} style={{ position: 'relative', width: 160, height: 90 }}>
				<p className="lab">{`hatch · ${label}`}</p>
				<Hatch x={0} open={open as boolean} onClick={() => {}} innerRef={null} />
			</div>
		))}
	</div>
)

const App = () => (
	<>
		<Hatches />
		{FURNITURE.map((room, index) => {
			// Walk `sceneAt` forward until it lands in the room this row wants, so
			// every room is on the page rather than whichever the hash picked.
			let minutes = 0
			while (minutes < 400 && sceneAt(at, at + minutes * 60_000, room).at !== room) minutes++

			return (
				<div className="row" key={room}>
					{CASES.slice(index * 2, index * 2 + 2).map((one) => {
						const scene = sceneAt(at, at + minutes * 60_000, room)
						const palette = PALETTE[one.feeling]
						return (
							<div className="cell" key={one.label}>
								<p className="lab">{`${room} · ${one.label}`}</p>
								<BurrowMap
									scene={scene}
									language="es"
									present
									parts={bodyFrom(one.parts)}
									worn={wornFrom(one.pinned, one.own)}
									faceColor={palette.face}
									screenColor={palette.screen}
									ledColor={palette.led}
									onPetClick={() => {}}
									innerRef={null}
								/>
							</div>
						)
					})}
					{/* And the one state where he is not down there at all. */}
					<div className="cell">
						<p className="lab">{`${room} · empty, he is outside`}</p>
						<BurrowMap
							scene={sceneAt(at, at + minutes * 60_000, room)}
							language="es"
							present={false}
							parts={bodyFrom(null)}
							worn={[]}
							faceColor={PALETTE.content.face}
							screenColor={PALETTE.content.screen}
							ledColor={PALETTE.content.led}
							onPetClick={() => {}}
							innerRef={null}
						/>
					</div>
				</div>
			)
		})}
	</>
)

createRoot(document.getElementById('root') as HTMLElement).render(<App />)
