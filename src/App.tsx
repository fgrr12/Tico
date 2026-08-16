import { useEffect, useState } from 'react'

import { getCurrentWindow } from '@tauri-apps/api/window'

/**
 * M0 has no pet in it. What it has is proof that the strip exists, is the size it
 * should be, and is where Rust said it would be — which is the only thing that
 * can be wrong at this stage, and is invisible by definition on a transparent
 * window.
 *
 * The outline is dev-only. In a build this renders nothing at all, and the strip
 * is exactly as empty as it looks.
 */
export default function App() {
	const [readout, setReadout] = useState('')

	useEffect(() => {
		if (!import.meta.env.DEV) return

		const window = getCurrentWindow()

		Promise.all([window.innerSize(), window.scaleFactor()]).then(([size, scale]) => {
			setReadout(
				`${size.width}×${size.height} physical · ${scale}x · ${Math.round(size.height / scale)} logical tall`
			)
		})
	}, [])

	if (!import.meta.env.DEV) return null

	return <div className="debug-strip">tico · m0 · {readout}</div>
}
