import { useEffect, useState } from 'react'

import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'

import { CompanionFace } from '../companion/CompanionFace'
import { type CompanionParts, PARTS, bodyFrom } from '../companion/parts'
import { type Language, PALETTE, PROPS, detectLanguage } from '../data/companion'
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
	prop,
	width,
}: {
	parts: CompanionParts
	prop: string | null
	width: number
}) => (
	<div className="companion" style={{ position: 'static', width }}>
		<div className="companion-body" style={{ animation: 'none' }}>
			<CompanionFace
				mood="idle"
				blink={false}
				glyph={null}
				singing={false}
				prop={prop}
				propLeaving={false}
				faceColor={PALETTE.content.face}
				screenColor={PALETTE.content.screen}
				ledColor={PALETTE.content.led}
				parts={parts}
			/>
		</div>
	</div>
)

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

	const patch = (change: Partial<Stored>) => {
		setStored({ ...stored, ...change })
		invoke('set_settings', { patch: change })
	}

	// Its own command, because `null` here means "take it off" and `undefined`
	// everywhere in `patch` means "not mentioned".
	const pin = (prop: string | null) => {
		setStored({ ...stored, pinned_prop: prop })
		invoke('set_pinned_prop', { prop })
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
				<section className="prefs-panel">
					{/* Wearing the pin, because that is what he will actually look
					    like — a preview that quietly leaves it off is a preview of
					    somebody else. */}
					<div className="prefs-stage">
						<Pet parts={body} prop={stored.pinned_prop} width={200} />
					</div>

					{(Object.keys(PARTS) as (keyof CompanionParts)[]).map((slot) => (
						<Row key={slot} label={copy.slots[slot]}>
							<div className="prefs-picks">
								{Object.keys(PARTS[slot]).map((variant) => {
									// The registry is keyed by slot and the slot is a
									// variable, which is as far as the types can follow
									// it; the keys themselves came from `PARTS`.
									const next = { ...body, [slot]: variant } as CompanionParts
									return (
										<button
											key={variant}
											type="button"
											className="prefs-pick"
											aria-pressed={body[slot] === variant}
											onClick={() => patch({ parts: next })}
										>
											<Pet parts={next} prop={null} width={72} />
										</button>
									)
								})}
							</div>
						</Row>
					))}

					{/* Drawn rather than named. A hat has no good label in either
					    language, and a grid of him wearing each one needs none. */}
					<Row label={copy.pin.label} hint={copy.pin.hint}>
						<div className="prefs-picks">
							<button
								type="button"
								className="prefs-pick"
								aria-pressed={stored.pinned_prop === null}
								aria-label={copy.pin.none}
								onClick={() => pin(null)}
							>
								<Pet parts={body} prop={null} width={72} />
							</button>
							{PROPS.map((kind) => (
								<button
									key={kind}
									type="button"
									className="prefs-pick"
									aria-pressed={stored.pinned_prop === kind}
									aria-label={kind}
									onClick={() => pin(kind)}
								>
									<Pet parts={body} prop={kind} width={72} />
								</button>
							))}
						</div>
					</Row>
				</section>
			)}
		</div>
	)
}
