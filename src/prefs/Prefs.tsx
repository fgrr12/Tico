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
					 * Him, in the middle, wearing everything that is pinned — a preview
					 * that quietly leaves the pins off is a preview of somebody else.
					 *
					 * The handles sit *on* the bit of him they open, rather than in a
					 * list beside him. Six of them and none of them labelled, which is
					 * fine while they are pinned to the thing they refer to: the hand
					 * one is on his hand.
					 */}
					<div className="prefs-stage">
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
						</div>
					</div>

					{open && region ? (
						<div className="prefs-wardrobe">
							<h2 className="prefs-open">{copy.places[region.place]}</h2>

							{/* The second level. One tab where there is only one list,
							    rather than a second tab that is empty — his face and his
							    neck are not made of anything swappable. */}
							<div className="prefs-kinds">
								{region.slot && (
									<button
										type="button"
										aria-pressed={kind === 'part'}
										onClick={() => setShowing('part')}
									>
										{copy.kinds.part}
									</button>
								)}
								<button
									type="button"
									aria-pressed={kind === 'worn'}
									onClick={() => setShowing('worn')}
								>
									{copy.kinds.worn}
								</button>
							</div>

							<div className="prefs-options">
								{slot ? (
									Object.keys(PARTS[slot]).map((variant) => {
										// The registry is keyed by slot and the slot is a
										// variable, which is as far as the types follow it;
										// the keys themselves came out of `PARTS`.
										const next = { ...body, [slot]: variant } as CompanionParts
										return (
											<button
												key={variant}
												type="button"
												className="prefs-pick"
												aria-pressed={body[slot] === variant}
												aria-label={variant}
												onClick={() => patch({ parts: next })}
											>
												<Portrait
													crop={CROPS[`${region.place}:part`]}
													parts={next}
													worn={worn}
												/>
											</button>
										)
									})
								) : (
									<>
										<p className="prefs-note">{copy.pin.hint}</p>
										{/* Drawn rather than named, and drawn on him wearing
										    everything else — a hat is only ever a choice about
										    what the whole of him looks like. */}
										{[null, ...PROPS.filter((one) => WEARS[one] === region.place)].map(
											(kindOf) => (
												<button
													key={kindOf ?? 'none'}
													type="button"
													className="prefs-pick"
													aria-pressed={(pins[region.place] ?? null) === kindOf}
													aria-label={kindOf ?? copy.pin.none}
													onClick={() => pin(region.place, kindOf)}
												>
													<Portrait
														crop={CROPS[`${region.place}:worn`]}
														parts={body}
														worn={wornFrom(withPin(region.place, kindOf), null)}
													/>
												</button>
											)
										)}
									</>
								)}
							</div>
						</div>
					) : null}
				</div>
			)}
		</div>
	)
}
