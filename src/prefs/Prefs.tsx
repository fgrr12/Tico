import { useEffect, useState } from 'react'

import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'

import { CompanionFace } from '../companion/CompanionFace'
import { type CompanionParts, PARTS, bodyFrom } from '../companion/parts'
import {
	type Language,
	PALETTE,
	PROPS,
	WEARS,
	type Where,
	type WornProp,
	detectLanguage,
	wornFrom,
} from '../data/companion'
import type { Stored } from '../types'

import { prefsCopy } from './copy'

/**
 * The window, and the only place he can be changed on purpose.
 *
 * It exists at all because the tray ran out of room: a menu can hold a handful of
 * radio groups, and it cannot hold a wardrobe. What is left in the tray is what
 * you reach for while something is happening — quiet, hide, quit — and everything
 * that is a decision rather than a reflex is in here.
 *
 * Nothing in this window is the source of truth. Every change goes to Rust, Rust
 * saves it and tells *both* windows what it now is, and the strip redraws from
 * the same event. The local `setStored` is only so a click looks like it landed
 * before the round trip comes back.
 */

/** Him, standing still. The same classes as the strip, minus everything moving. */
const Pet = ({
	parts,
	worn,
	width,
}: {
	parts: CompanionParts
	worn: WornProp[]
	width: number | string
}) => (
	<div className="companion" style={{ position: 'static', width }}>
		<div className="companion-body" style={{ animation: 'none' }}>
			<CompanionFace
				mood="idle"
				blink={false}
				glyph={null}
				singing={false}
				worn={worn}
				faceColor={PALETTE.content.face}
				screenColor={PALETTE.content.screen}
				ledColor={PALETTE.content.led}
				parts={parts}
			/>
		</div>
	</div>
)

/**
 * The six of him you can press, top to bottom.
 *
 * A region *is* a place — the six places a thing can be worn turned out to be
 * the six bits of him worth pointing at — and four of them also hold a part he
 * can be swapped for. That is the whole hierarchy: press a bit of him, choose
 * whether you are changing what it is or what is on it, then choose the thing.
 *
 * `at` is where its handle sits, in his own 96-unit coordinates, so a marker
 * lands on the hand it opens rather than on a guess about where the hand is.
 */
const REGIONS: {
	place: Where
	slot?: keyof CompanionParts
	at: [number, number]
}[] = [
	{ place: 'head', slot: 'antenna', at: [48, -2] },
	{ place: 'face', at: [78, 42] },
	{ place: 'body', slot: 'shell', at: [16, 28] },
	{ place: 'hand', slot: 'hands', at: [1, 60] },
	{ place: 'neck', at: [48, 80] },
	{ place: 'feet', slot: 'feet', at: [28, 92] },
]

/**
 * What each list is a close-up of, as `[x, y, size]` in his own 96-unit
 * coordinates — the ones the landmark contract in `parts.tsx` is written in.
 *
 * Close-ups rather than whole pets, for the same reason the game this is copied
 * from uses them: at thumbnail size a whole pet is a dark blob with a coloured
 * speck on it, and the speck is the entire thing you are choosing between. A
 * monocle across a 64px pet is four pixels. Across a 64px face it is a monocle.
 *
 * Negative `y` is deliberate and load-bearing: everything worn on his head is
 * drawn *above* the viewBox — a party hat reaches y=-14 — so a head crop that
 * starts at 0 crops off the hat you are trying to look at.
 */
const CROPS: Record<string, [number, number, number]> = {
	'head:part': [30, -14, 40],
	'head:worn': [14, -12, 68],
	'face:worn': [26, 28, 44],
	'body:part': [-2, -2, 100],
	'body:worn': [2, 12, 50],
	'hand:part': [74, 44, 32],
	'hand:worn': [-22, 4, 72],
	'neck:worn': [26, 54, 44],
	'feet:part': [52, 62, 34],
	'feet:worn': [14, 58, 46],
}

/**
 * Him, cropped to one part of him, in a box.
 *
 * No transforms: the pet is simply rendered larger than the box and pushed up
 * and left until the interesting part is inside it. A `scale()` would have been
 * the same arithmetic with a `transform-origin` bug waiting in it.
 *
 * All percentages, so one component fills a thumbnail that is whatever width the
 * grid column came out as. It was pixels first, and a fixed-size portrait in a
 * stretched grid cell is dead space down two sides of every swatch.
 */
const Portrait = ({
	crop,
	parts,
	worn,
}: {
	crop: [number, number, number]
	parts: CompanionParts
	worn: WornProp[]
}) => {
	const [x, y, span] = crop

	return (
		<span className="prefs-portrait">
			<span
				style={{
					width: `${(96 / span) * 100}%`,
					left: `${(-x / span) * 100}%`,
					top: `${(-y / span) * 100}%`,
				}}
			>
				<Pet parts={parts} worn={worn} width="100%" />
			</span>
		</span>
	)
}

const Row = ({
	label,
	hint,
	children,
}: {
	label: string
	hint?: string
	children: React.ReactNode
}) => (
	<div className="prefs-row">
		<div className="prefs-name">
			<span>{label}</span>
			{hint ? <small>{hint}</small> : null}
		</div>
		<div className="prefs-control">{children}</div>
	</div>
)

/** A radio group without the radios. `aria-pressed` is what says which is on. */
const Choice = <T extends string>({
	value,
	options,
	onPick,
}: {
	value: T
	options: [T, string][]
	onPick: (next: T) => void
}) => (
	<div className="prefs-chips">
		{options.map(([id, name]) => (
			<button
				key={id}
				type="button"
				className="prefs-chip"
				aria-pressed={id === value}
				onClick={() => onPick(id)}
			>
				{name}
			</button>
		))}
	</div>
)

export const Prefs = () => {
	const [stored, setStored] = useState<Stored | null>(null)
	// Not in `tico.json`: the launch agent is the answer to this, and a second
	// copy of it would be the one that is wrong after somebody clears it.
	const [startsAtLogin, setStartsAtLogin] = useState(false)
	const [tab, setTab] = useState<'settings' | 'body'>('settings')
	/** Which bit of him is open, and which of its two lists. Closed to begin
	 *  with: the first thing to see is him, not a wall of choices. */
	const [open, setOpen] = useState<Where | null>(null)
	const [showing, setShowing] = useState<'part' | 'worn'>('part')

	useEffect(() => {
		invoke<Stored>('boot').then(setStored)
		invoke<boolean>('autostart').then(setStartsAtLogin)

		// The tray still starts quiet hours, so the window is told about them the
		// same way the strip is rather than assuming it is the only writer.
		const changed = listen<Stored>('settings', (event) => setStored(event.payload))
		return () => {
			changed.then((off) => off())
		}
	}, [])

	// One frame of nothing beats a frame of defaults that are not his.
	if (!stored) return null

	const language: Language = stored.language === 'auto' ? detectLanguage() : stored.language
	const copy = prefsCopy[language]
	const body = bodyFrom(stored.parts)
	const pins = stored.pinned_props ?? {}
	const worn = wornFrom(pins, null)

	const region = REGIONS.find((one) => one.place === open)
	// A region with no part of its own has only the one list, and opening it on
	// a tab that cannot exist would show an empty panel.
	const kind = region?.slot ? showing : 'worn'
	const slot = kind === 'part' ? region?.slot : undefined
	/** What the open region offers. A region with nothing swappable in it — his
	 *  face, his neck — has one list, not one list and an empty one. */
	const lists: ('part' | 'worn')[] = region?.slot ? ['part', 'worn'] : ['worn']


	/** Press a bit of him: it opens on its part, which is the thing you came for
	 *  more often than the hat, and falls back to the hat when there is no part. */
	const press = (place: Where) => {
		setOpen(place === open ? null : place)
		setShowing('part')
	}

	/** The pins with one place set, or cleared. Both the preview and the click
	 *  need exactly this, and they must not disagree about it. */
	const withPin = (where: Where, kind: string | null) => {
		const next = { ...pins }
		if (kind) next[where] = kind
		else delete next[where]
		return next
	}

	const patch = (change: Partial<Stored>) => {
		setStored({ ...stored, ...change })
		invoke('set_settings', { patch: change })
	}

	/**
	 * Him with this region's accessory taken off, for choosing the part under it.
	 *
	 * Without this the four antennas were four pictures of the same cap: the hat
	 * is drawn over the thing you are choosing between, so every option in the
	 * list came out identical. Same for a coffee over the hands and a shoe over
	 * the feet — the accessory hides its own part by design, which is exactly why
	 * it has to come off while you are looking underneath.
	 */
	const bare = region ? wornFrom(withPin(region.place, null), null) : worn

	// Its own command, because `null` here means "take it off" and `undefined`
	// everywhere in `patch` means "not mentioned".
	const pin = (where: Where, prop: string | null) => {
		setStored({ ...stored, pinned_props: withPin(where, prop) })
		invoke('set_pinned_prop', { place: where, prop })
	}

	return (
		<div className="prefs">
			<nav className="prefs-tabs">
				<button
					type="button"
					aria-pressed={tab === 'settings'}
					onClick={() => setTab('settings')}
				>
					{copy.tabs.settings}
				</button>
				<button type="button" aria-pressed={tab === 'body'} onClick={() => setTab('body')}>
					{copy.tabs.body}
				</button>

				{/* Up here rather than in a corner of the scene: down there it was a
				    card sitting on top of whichever option the ring put behind it. */}
				{tab === 'body' && region && (
					<span className="prefs-open">
						{copy.places[region.place]}
						<small>{copy.kinds[kind]}</small>
					</span>
				)}
			</nav>

			{tab === 'settings' ? (
				<section className="prefs-panel">
					<Row label={copy.chattiness.label} hint={copy.chattiness.hint}>
						<Choice
							value={stored.chattiness}
							options={[
								['quiet', copy.chattiness.quiet],
								['normal', copy.chattiness.normal],
								['chatty', copy.chattiness.chatty],
							]}
							onPick={(chattiness) => patch({ chattiness })}
						/>
					</Row>

					<Row label={copy.size.label}>
						<Choice
							value={stored.size}
							options={[
								['small', copy.size.small],
								['normal', copy.size.normal],
								['large', copy.size.large],
							]}
							onPick={(size) => patch({ size })}
						/>
					</Row>

					<Row label={copy.inCall.label} hint={copy.inCall.hint}>
						<Choice
							value={stored.in_call}
							options={[
								['peek', copy.inCall.peek],
								['hide', copy.inCall.hide],
								['ignore', copy.inCall.ignore],
							]}
							onPick={(in_call) => patch({ in_call })}
						/>
					</Row>

					<Row label={copy.language.label}>
						<Choice
							value={stored.language}
							options={[
								['auto', copy.language.auto],
								['en', copy.language.en],
								['es', copy.language.es],
							]}
							onPick={(next) => patch({ language: next })}
						/>
					</Row>

					<Row label={copy.house.label} hint={copy.house.hint}>
						<input
							type="checkbox"
							checked={stored.house}
							onChange={(event) => patch({ house: event.target.checked })}
						/>
					</Row>

					{/* Ticked from the store, not from the click. Turning this on
					    without the Accessibility grant does not turn it on — Rust
					    opens the pane where it is given and changes nothing, and the
					    settings event puts the box back where it was. */}
					<Row label={copy.titles.label} hint={copy.titles.hint}>
						<input
							type="checkbox"
							checked={stored.read_titles}
							onChange={(event) => patch({ read_titles: event.target.checked })}
						/>
					</Row>

					<Row label={copy.autostart.label}>
						<input
							type="checkbox"
							checked={startsAtLogin}
							onChange={(event) =>
								invoke<boolean>('set_autostart', { on: event.target.checked }).then(
									setStartsAtLogin
								)
							}
						/>
					</Row>
				</section>
			) : (
				<div className="prefs-cas">
					{/*
					 * One scene, and everything floats in it. Him in the middle, the
					 * handles on the parts of him they open, and the options laid out on
					 * a ring around him.
					 *
					 * The ring is a square box centred on him, so a percentage means the
					 * same across as it does down and the circle stays a circle. Both the
					 * figure and the orbs hang off its centre.
					 */}
					<div className="prefs-ring">
						<div className="prefs-figure">
							<Pet parts={body} worn={worn} width="100%" />
							{REGIONS.map(({ place, at }) => (
								<button
									key={place}
									type="button"
									className="prefs-mark"
									style={{ left: `${(at[0] / 96) * 100}%`, top: `${(at[1] / 96) * 100}%` }}
									aria-pressed={open === place}
									aria-label={copy.places[place]}
									title={copy.places[place]}
									onClick={() => press(place)}
								/>
							))}

							{/*
							 * The second level, floating out of the part it belongs to —
							 * the subcategories of the thing you just pressed, hanging off
							 * it rather than filed in a menu somewhere else.
							 *
							 * Close to the marker on purpose. Further out they collided with
							 * the ring — these hang off a part of him and the ring is the list,
							 * and the two reading as one soup of circles is what happens when
							 * they meet in the middle.
							 */}
							{region &&
								lists.map((one, index) => {
									const away = region.at[0] >= 48 ? 1 : -1
									const x = region.at[0] + away * (14 + index * 4)
									const y = region.at[1] + (lists.length === 1 ? 0 : index * 26 - 13)

									return (
										<button
											key={one}
											type="button"
											className="prefs-kind"
											style={{ left: `${(x / 96) * 100}%`, top: `${(y / 96) * 100}%` }}
											aria-pressed={kind === one}
											aria-label={copy.kinds[one]}
											title={copy.kinds[one]}
											onClick={() => setShowing(one)}
										>
											<Portrait
												crop={CROPS[`${region.place}:${one}`]}
												parts={body}
												worn={one === 'part' ? bare : worn}
											/>
										</button>
									)
								})}
						</div>

						{open &&
							region &&
							(slot
								? Object.keys(PARTS[slot]).map((variant) => ({
										id: variant,
										label: variant,
										// The registry is keyed by slot and the slot is a
										// variable, which is as far as the types follow it; the
										// keys came out of `PARTS`.
										parts: { ...body, [slot]: variant } as CompanionParts,
										// Whatever is worn here comes off while you choose what
										// goes under it — see `bare`.
										worn: bare,
										on: body[slot] === variant,
										choose: () =>
											patch({ parts: { ...body, [slot]: variant } as CompanionParts }),
									}))
								: [null, ...PROPS.filter((one) => WEARS[one] === region.place)].map((one) => ({
										id: one ?? 'none',
										label: one ?? copy.pin.none,
										parts: body,
										worn: wornFrom(withPin(region.place, one), null),
										on: (pins[region.place] ?? null) === one,
										choose: () => pin(region.place, one),
									}))
							).map((option, index, all) => {
								/*
								 * Spread around him from the part they belong to: the fan is
								 * centred on the direction of the marker you pressed, so the
								 * hats come out of his head and the shoes out of his feet.
								 *
								 * A fixed step rather than "divide the circle by however many
								 * there are" — three options should be three neighbours, not
								 * three dots at the far corners of a triangle. Thirteen of
								 * them at this step is a whole circle, which is where the
								 * shape ends up on its own.
								 */
								const from = Math.atan2(region.at[1] - 48, region.at[0] - 48)
								const step = Math.min((2 * Math.PI) / all.length, 0.48)
								const angle = from + index * step

								return (
									<button
										key={option.id}
										type="button"
										className={option.id === 'none' ? 'prefs-orb prefs-orb-none' : 'prefs-orb'}
										style={{
											// The radius is the ring's own half, less an orb's, so it
											// is exact at every window size: a fixed percentage put
											// half of each orb outside the scene on a short window
											// and needed a magic number subtracted from the ring to
											// paper over it.
											left: `calc(50% + ${Math.cos(angle).toFixed(4)} * (50% - 34px))`,
											top: `calc(50% + ${Math.sin(angle).toFixed(4)} * (50% - 34px))`,
										}}
										aria-pressed={option.on}
										aria-label={option.label}
										title={option.label}
										onClick={option.choose}
									>
										<Portrait
											crop={CROPS[`${region.place}:${kind}`]}
											parts={option.parts}
											worn={option.worn}
										/>
									</button>
								)
							})}
					</div>

				</div>
			)}
		</div>
	)
}
