import { useCallback, useEffect, useState } from 'react'

import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'

import { type AskResult, Companion } from './companion/Companion'

import { type Language, detectLanguage } from './data/companion'
import { systemPrompt } from './data/persona'
import type { PetRect, Settings } from './types'

interface Boot extends Settings {
	x: number
	quiet_until: number
	in_call: 'peek' | 'hide' | 'ignore'
}

/**
 * The strip is one pet and nothing else. Everything the frontend cannot see for
 * itself — the cursor, the settings, where he stood last time — comes across from
 * Rust, and everything Rust cannot see — where he is standing now — goes back.
 */
export default function App() {
	const [language] = useState<Language>(detectLanguage)
	const [boot, setBoot] = useState<Boot | null>(null)
	const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null)
	const [activeApp, setActiveApp] = useState<{
		name: string
		title: string | null
		since: number
	} | null>(null)
	const [asking, setAsking] = useState(false)
	const [nowPlaying, setNowPlaying] = useState<{ artist: string; song: string } | null>(null)
	const [reminders, setReminders] = useState<{ id: string; text: string }[]>([])
	const [inCall, setInCall] = useState(false)

	useEffect(() => {
		invoke<Boot>('boot').then(setBoot)

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
		const asked = listen('ask', () => setAsking(true))
		const call = listen<{ active: boolean }>('in-call', (event) =>
			setInCall(event.payload.active)
		)
		const music = listen<{ artist: string; song: string } | null>('now-playing', (event) =>
			setNowPlaying(event.payload)
		)

		return () => {
			cursorMoved.then((off) => off())
			settingsChanged.then((off) => off())
			appChanged.then((off) => off())
			asked.then((off) => off())
			call.then((off) => off())
			music.then((off) => off())
			clearInterval(remindersTimer)
		}
	}, [])

	const handleRect = useCallback((rect: PetRect) => {
		invoke('set_pet_rect', { rect })
	}, [])

	const handleInteractive = useCallback((hold: boolean) => {
		invoke('set_interactive', { hold })
	}, [])

	const handleMoved = useCallback((x: number) => {
		invoke('set_pet_x', { x })
	}, [])

	/**
	 * The prompt is built here rather than in Rust because it is personality, and
	 * personality lives beside the rest of the copy. Rust only does the HTTP.
	 */
	const handleAsk = useCallback(
		async (question: string): Promise<AskResult> => {
			try {
				return await invoke<{ say: string; mood?: string }>('ask', {
					request: {
						system: systemPrompt(
							language,
							activeApp?.name ?? null,
							activeApp?.title ?? null,
							nowPlaying
						),
						question,
					},
				})
			} catch (error) {
				return String(error).includes('no-brain') ? 'no-brain' : 'error'
			}
		},
		[language, activeApp]
	)

	const handleReminderDone = useCallback((id: string) => {
		invoke('complete_reminder', { id }).then(() =>
			invoke<{ id: string; text: string }[]>('due_reminders').then(setReminders)
		)
	}, [])

	const handleAction = useCallback(
		(action: string, query: string) =>
			invoke<{ ok: boolean; label: string }>('run_action', { action, query }),
		[]
	)

	const handleAskDone = useCallback(() => {
		setAsking(false)
		invoke('set_interactive', { hold: false })
	}, [])

	// Nothing is drawn until Rust says where he was left, so he never appears in
	// one place and jumps to another a frame later.
	if (!boot) return null

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
			inCallMode={boot.in_call}
			asking={asking}
			onAsk={handleAsk}
			onAction={handleAction}
			onAskDone={handleAskDone}
			initialX={boot.x}
			onRectChange={handleRect}
			onInteractive={handleInteractive}
			onMoved={handleMoved}
		/>
	)
}
