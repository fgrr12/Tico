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
	const [activeApp, setActiveApp] = useState<{ name: string; since: number } | null>(null)
	const [asking, setAsking] = useState(false)
	const [inCall, setInCall] = useState(false)

	useEffect(() => {
		invoke<Boot>('boot').then(setBoot)

		const cursorMoved = listen<{ x: number; y: number }>('cursor', (event) =>
			setCursor(event.payload)
		)
		const settingsChanged = listen<Boot>('settings', (event) =>
			setBoot((current) => ({ ...(current ?? event.payload), ...event.payload }))
		)
		// Rust emits only on change, so the timestamp of the event is the moment the
		// app came forward — which is what the dwell is measured from.
		const appChanged = listen<{ name: string }>('active-app', (event) =>
			setActiveApp({ name: event.payload.name, since: Date.now() })
		)
		const asked = listen('ask', () => setAsking(true))
		const call = listen<{ active: boolean }>('in-call', (event) =>
			setInCall(event.payload.active)
		)

		return () => {
			cursorMoved.then((off) => off())
			settingsChanged.then((off) => off())
			appChanged.then((off) => off())
			asked.then((off) => off())
			call.then((off) => off())
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
						system: systemPrompt(language, activeApp?.name ?? null),
						question,
					},
				})
			} catch (error) {
				return String(error).includes('no-brain') ? 'no-brain' : 'error'
			}
		},
		[language, activeApp]
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
			quietUntil={boot.quiet_until}
			inCall={inCall}
			inCallMode={boot.in_call}
			asking={asking}
			onAsk={handleAsk}
			onAskDone={handleAskDone}
			initialX={boot.x}
			onRectChange={handleRect}
			onInteractive={handleInteractive}
			onMoved={handleMoved}
		/>
	)
}
