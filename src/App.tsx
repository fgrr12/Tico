import { useCallback, useEffect, useState } from 'react'

import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'

import { Companion } from './companion/Companion'

import { type Language, detectLanguage } from './data/companion'
import type { PetRect, Settings } from './types'

interface Boot extends Settings {
	x: number
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

	useEffect(() => {
		invoke<Boot>('boot').then(setBoot)

		const cursorMoved = listen<{ x: number; y: number }>('cursor', (event) =>
			setCursor(event.payload)
		)
		const settingsChanged = listen<Boot>('settings', (event) =>
			setBoot((current) => ({ ...(current ?? event.payload), ...event.payload }))
		)

		return () => {
			cursorMoved.then((off) => off())
			settingsChanged.then((off) => off())
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

	// Nothing is drawn until Rust says where he was left, so he never appears in
	// one place and jumps to another a frame later.
	if (!boot) return null

	return (
		<Companion
			language={language}
			settings={{ chattiness: boot.chattiness, size: boot.size }}
			cursor={cursor}
			initialX={boot.x}
			onRectChange={handleRect}
			onInteractive={handleInteractive}
			onMoved={handleMoved}
		/>
	)
}
