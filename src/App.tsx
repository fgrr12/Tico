import { useCallback, useEffect, useState } from 'react'

import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'

import { Companion } from './companion/Companion'

import { type Language, detectLanguage } from './data/companion'
import type { Ledge, NowPlaying, Opening, PetRect, Settings } from './types'

interface Boot extends Settings {
	x: number
	quiet_until: number
	in_call: 'peek' | 'hide' | 'ignore'
	/** `auto` follows the system, which is all it could do before the tray. */
	language: 'auto' | Language
	house: boolean
}

/**
 * The strip is one pet and nothing else. Everything the frontend cannot see for
 * itself — the cursor, the settings, where he stood last time — comes across from
 * Rust, and everything Rust cannot see — where he is standing now — goes back.
 */
export default function App() {
	const [boot, setBoot] = useState<Boot | null>(null)
	const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null)
	const [activeApp, setActiveApp] = useState<{
		name: string
		title: string | null
		since: number
	} | null>(null)
	const [nowPlaying, setNowPlaying] = useState<NowPlaying | null>(null)
	const [reminders, setReminders] = useState<{ id: string; text: string }[]>([])
	const [inCall, setInCall] = useState(false)
	const [typing, setTyping] = useState(false)
	const [opening, setOpening] = useState<Opening | null>(null)

	useEffect(() => {
		invoke<Boot>('boot').then(setBoot)
		// Read once. It is what he knew when he woke up, and nothing during the
		// session changes what he already remembers.
		invoke<Opening>('memory').then(setOpening)

		// Re-read on a slow clock so anything that writes to reminders.json is
		// noticed without tico having to be restarted.
		const readReminders = () =>
			invoke<{ id: string; text: string }[]>('due_reminders').then(setReminders)
		readReminders()
		const remindersTimer = setInterval(readReminders, 300_000)

		const cursorMoved = listen<{ x: number; y: number }>('cursor', (event) =>
			setCursor(event.payload)
		)
		const settingsChanged = listen<Boot>('settings', (event) =>
			setBoot((current) => ({ ...(current ?? event.payload), ...event.payload }))
		)
		// Rust emits only on change, so the timestamp of the event is the moment the
		// app came forward — which is what the dwell is measured from.
		const appChanged = listen<{ name: string; title: string | null }>('active-app', (event) =>
			// A title change inside the same app is not a context switch, so the
			// dwell clock keeps running rather than restarting every time you
			// switch file.
			setActiveApp((current) => ({
				name: event.payload.name,
				title: event.payload.title,
				since: current?.name === event.payload.name ? current.since : Date.now(),
			}))
		)
		const call = listen<{ active: boolean }>('in-call', (event) =>
			setInCall(event.payload.active)
		)
		// Only "a key went down recently" ever crosses — never which key. See
		// `typing.rs`.
		const keys = listen<{ active: boolean }>('typing', (event) =>
			setTyping(event.payload.active)
		)
		const music = listen<NowPlaying | null>('now-playing', (event) =>
			setNowPlaying(event.payload)
		)

		return () => {
			cursorMoved.then((off) => off())
			settingsChanged.then((off) => off())
			appChanged.then((off) => off())
			call.then((off) => off())
			keys.then((off) => off())
			music.then((off) => off())
			clearInterval(remindersTimer)
		}
	}, [])

	const handleRect = useCallback((rects: PetRect[]) => {
		invoke('set_pet_rect', { rects })
	}, [])

	const handleInteractive = useCallback((hold: boolean) => {
		invoke('set_interactive', { hold })
	}, [])

	const handleMoved = useCallback((x: number) => {
		invoke('set_pet_x', { x })
	}, [])

	// Asked for at the start of a fall and never polled: he needs to know where
	// your windows are at one instant, not continuously.
	const handleLedges = useCallback(() => invoke<Ledge[]>('ledges'), [])

	const handleRemember = useCallback((what: string, key?: string) => {
		invoke('remember', { what, key: key ?? null })
	}, [])

	const handleReminderDone = useCallback((id: string) => {
		invoke('complete_reminder', { id }).then(() =>
			invoke<{ id: string; text: string }[]>('due_reminders').then(setReminders)
		)
	}, [])

	// Nothing is drawn until Rust says where he was left, so he never appears in
	// one place and jumps to another a frame later.
	if (!boot || !opening) return null

	// A saved choice wins; `auto` falls back to whatever the OS is set to.
	const language: Language = boot.language === 'auto' ? detectLanguage() : boot.language

	return (
		<Companion
			language={language}
			settings={{ chattiness: boot.chattiness, size: boot.size }}
			cursor={cursor}
			activeApp={activeApp}
			nowPlaying={nowPlaying}
			reminders={reminders}
			onReminderDone={handleReminderDone}
			quietUntil={boot.quiet_until}
			inCall={inCall}
			typing={typing}
			inCallMode={boot.in_call}
			houseOn={boot.house}
			initialX={boot.x}
			onRectChange={handleRect}
			onInteractive={handleInteractive}
			onMoved={handleMoved}
			onLedges={handleLedges}
			opening={opening}
			onRemember={handleRemember}
		/>
	)
}
