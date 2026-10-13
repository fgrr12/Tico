import { useEffect, useRef, useState } from 'react'

import { invoke } from '@tauri-apps/api/core'
import { getCurrentWindow } from '@tauri-apps/api/window'

import { detectLanguage } from '../data/companion'
import type { Stored } from '../types'

const PLACEHOLDER = { en: 'Say something to tico…', es: 'Decile algo a tico…' }

/**
 * Experiment: the box you type to him in. One question, then it closes.
 *
 * Enter sends, Escape or clicking away cancels. Either way Rust destroys the
 * window and hands focus back to the app you were in, so asking him something
 * never costs you your place.
 */
export function Ask() {
	const [text, setText] = useState('')
	const [language, setLanguage] = useState(detectLanguage())
	const sent = useRef(false)

	const send = (value: string | null) => {
		if (sent.current) return
		sent.current = true
		invoke('asked', { text: value })
	}

	useEffect(() => {
		invoke<Stored>('boot').then((s) => {
			if (s.language !== 'auto') setLanguage(s.language)
		})
		// Clicking anywhere else is a cancel: the box must not linger behind you.
		const blur = getCurrentWindow().onFocusChanged(({ payload: focused }) => {
			if (!focused) send(null)
		})
		return () => {
			blur.then((off) => off())
		}
	}, [])

	return (
		<input
			className="ask"
			autoFocus
			value={text}
			placeholder={PLACEHOLDER[language]}
			maxLength={500}
			onChange={(e) => setText(e.target.value)}
			onKeyDown={(e) => {
				if (e.key === 'Enter' && text.trim()) send(text)
				if (e.key === 'Escape') send(null)
			}}
		/>
	)
}
