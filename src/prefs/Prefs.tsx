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
	WORN_ORDER,
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
	width: number
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

const BODY_SLOTS = Object.keys(PARTS) as (keyof CompanionParts)[]

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
	/** `part:shell` or `worn:head` — the two lists are namespaced because `feet`
	 *  is both a leg and a shoe, and `hands` and `hand` are one letter apart. */
	const [picked, setPicked] = useState('part:shell')

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

	const slot = picked.startsWith('part:')
		? (picked.slice(5) as keyof CompanionParts)
		: null
	const place = slot ? null : picked.slice(5)

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
				<div className="prefs-dresser">
					{/* Wearing everything that is pinned, because that is what he will
					    actually look like — a preview that quietly leaves the pins off
					    is a preview of somebody else. */}
					<div className="prefs-stage">
						<Pet parts={body} worn={worn} width={190} />
					</div>

					{/*
					 * Pick the part, then pick the thing — rather than one long page
					 * with every category open at once. Which is how a wardrobe works
					 * and, more to the point, is the only layout that survives the
					 * head having fourteen options and the back having two.
					 */}
					<nav className="prefs-rail">
						<span className="prefs-rail-head">{copy.groups.body}</span>
						{BODY_SLOTS.map((slot) => (
							<button
								key={slot}
								type="button"
								aria-pressed={picked === `part:${slot}`}
								onClick={() => setPicked(`part:${slot}`)}
							>
								{copy.slots[slot]}
							</button>
						))}
						<span className="prefs-rail-head">{copy.groups.worn}</span>
						{WORN_ORDER.map((place) => (
							<button
								key={place}
								type="button"
								aria-pressed={picked === `worn:${place}`}
								onClick={() => setPicked(`worn:${place}`)}
							>
								{copy.places[place]}
							</button>
						))}
					</nav>

					<div className="prefs-options">
						{slot ? (
							Object.keys(PARTS[slot]).map((variant) => {
								// The registry is keyed by slot and the slot is a
								// variable, which is as far as the types follow it; the
								// keys themselves came out of `PARTS`.
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
										<Pet parts={next} worn={worn} width={64} />
									</button>
								)
							})
						) : (
							<>
								<p className="prefs-note">{copy.pin.hint}</p>
								{/* Drawn rather than named, and drawn on him wearing
								    everything else — a hat is only ever a choice about
								    what the whole of him looks like. */}
								{[null, ...PROPS.filter((kind) => WEARS[kind] === place)].map((kind) => (
									<button
										key={kind ?? 'none'}
										type="button"
										className="prefs-pick"
										aria-pressed={(pins[place as Where] ?? null) === kind}
										aria-label={kind ?? copy.pin.none}
										onClick={() => pin(place as Where, kind)}
									>
										<Pet parts={body} worn={wornFrom(withPin(place as Where, kind), null)} width={64} />
										{kind ? null : <small>{copy.pin.none}</small>}
									</button>
								))}
							</>
						)}
					</div>
				</div>
			)}
		</div>
	)
}
