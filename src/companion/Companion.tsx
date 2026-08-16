import { useCallback, useEffect, useRef, useState } from 'react'

import { CompanionFace } from './CompanionFace'

import { type Language, companionCopy } from '../data/companion'
import type { CompanionMood, PetRect, Settings } from '../types'

/**
 * `tico`, on a real desktop.
 *
 * Ported from the portfolio, where he lives inside a terminal pane. The face, the
 * moods, the moments and the walking are the same code. Two things are not:
 *
 * 1. **He cannot feel the mouse.** The strip ignores cursor events so the desktop
 *    underneath stays usable, which means the webview never receives a
 *    `pointermove`. Everything the pointer drives — where he looks, whether he is
 *    being hovered — comes from the `cursor` prop, which Rust polls globally and
 *    hands down. Real pointer events still arrive for clicks and drags, but only
 *    in the moments Rust has decided to let them through.
 * 2. **The floor is real.** He stands on the bottom of the strip at a left offset
 *    rather than floating at an inset from a corner, and `lift` is how far off the
 *    ground he is — only ever non-zero because someone picked him up.
 */

/** Falls asleep after this long with no cursor movement anywhere on screen. */
const SLEEP_AFTER = 90_000
/** Greets you rather than just waking if the cursor was gone longer than this. */
const AWAY_AFTER = 120_000
/** Floors between unprompted things, before the chattiness multiplier. */
const CHATTER_EVERY = 50_000
const MOMENT_EVERY = 14_000
const WANDER_EVERY = 30_000
/** Cursor distance at which he starts paying attention to it. */
const NOTICE_WITHIN = 220
/** Hover this long without leaving and it counts as petting. */
const PET_AFTER = 1_600
/** Pointer travel that turns a click into a drag. */
const DRAG_THRESHOLD = 5
/** Walking and falling pace, in CSS pixels per second. */
const WALK_SPEED = 74
const FALL_SPEED = 1_100
/** Per-character delay while a line is typed into the bubble. */
const SAY_REVEAL = 16

const CHATTINESS: Record<Settings['chattiness'], number> = {
	quiet: 3,
	normal: 1,
	chatty: 0.45,
}

const pick = <T,>(items: readonly T[]): T => items[Math.floor(Math.random() * items.length)]

const clamp = (value: number) => Math.max(-1, Math.min(1, value))

type Motion = { ms: number; facing: 'left' | 'right' }

interface CompanionProps {
	language: Language
	settings: Settings
	/** Global cursor, in CSS pixels relative to the strip. `y` is negative above it. */
	cursor: { x: number; y: number } | null
	/** Where he was standing last time, as a fraction of the strip width. */
	initialX: number
	onRectChange: (rect: PetRect) => void
	/** Pins the window interactive for a drag, so a fast one cannot drop him. */
	onInteractive: (hold: boolean) => void
	onMoved: (fraction: number) => void
}

export const Companion = ({
	language,
	settings,
	cursor,
	initialX,
	onRectChange,
	onInteractive,
	onMoved,
}: CompanionProps) => {
	const copy = companionCopy[language]

	const rootRef = useRef<HTMLDivElement>(null)

	const [mood, setMood] = useState<CompanionMood>('idle')
	const [blink, setBlink] = useState(false)
	const [look, setLook] = useState({ x: 0, y: 0 })
	const [aim, setAim] = useState<{ x: number; y: number } | null>(null)
	const [pos, setPos] = useState({ x: 0, lift: 0 })
	const [motion, setMotion] = useState<Motion | null>(null)
	const [bubble, setBubble] = useState<string | null>(null)
	const [typed, setTyped] = useState('')
	const [fx, setFx] = useState<{ name: string; n: number } | null>(null)

	const moodTimer = useRef(0)
	const bubbleTimer = useRef(0)
	const aimTimer = useRef(0)
	const walkTimer = useRef(0)
	const petTimer = useRef(0)
	const activityAt = useRef(Date.now())
	const chatterAt = useRef(Date.now())
	const momentAt = useRef(Date.now())
	const wanderAt = useRef(Date.now())
	const clicks = useRef({ count: 0, at: 0 })
	const asleep = useRef(false)
	const hovering = useRef(false)
	const dragged = useRef(false)
	const drag = useRef<{ id: number; x: number; y: number; ox: number; oy: number } | null>(null)
	const moodNow = useRef<CompanionMood>('idle')
	const posNow = useRef({ x: 0, lift: 0 })
	const busy = useRef(false)
	const rate = useRef(1)

	useEffect(() => {
		moodNow.current = mood
	}, [mood])

	useEffect(() => {
		posNow.current = pos
	}, [pos])

	useEffect(() => {
		busy.current = bubble !== null
	}, [bubble])

	useEffect(() => {
		rate.current = CHATTINESS[settings.chattiness]
	}, [settings.chattiness])

	// ── Speaking ─────────────────────────────────────────────────────────────

	const say = useCallback((text: string, ms = 5_200) => {
		setBubble(text)
		clearTimeout(bubbleTimer.current)
		bubbleTimer.current = window.setTimeout(() => setBubble(null), ms + text.length * SAY_REVEAL)
	}, [])

	useEffect(() => {
		if (!bubble) {
			setTyped('')
			return
		}

		setTyped('')
		let count = 0
		const id = window.setInterval(() => {
			count += 1
			setTyped(bubble.slice(0, count))
			if (count >= bubble.length) clearInterval(id)
		}, SAY_REVEAL)

		return () => clearInterval(id)
	}, [bubble])

	/** `ms = 0` holds the mood until something else changes it. */
	const react = useCallback((next: CompanionMood, effect?: string, ms = 2_800) => {
		setMood(next)
		if (effect) setFx((prev) => ({ name: effect, n: (prev?.n ?? 0) + 1 }))
		clearTimeout(moodTimer.current)
		if (ms > 0) moodTimer.current = window.setTimeout(() => setMood('idle'), ms)
	}, [])

	const lookAt = useCallback((x: number, y: number, ms = 1_400) => {
		setAim({ x, y })
		clearTimeout(aimTimer.current)
		aimTimer.current = window.setTimeout(() => setAim(null), ms)
	}, [])

	// ── Moving ───────────────────────────────────────────────────────────────

	const limits = useCallback(() => {
		const element = rootRef.current
		const width = element?.offsetWidth ?? 92
		const height = element?.offsetHeight ?? 96

		return {
			maxX: Math.max(1, window.innerWidth - width),
			maxLift: Math.max(0, window.innerHeight - height),
		}
	}, [])

	const clampPos = useCallback(
		(x: number, lift: number) => {
			const { maxX, maxLift } = limits()
			return {
				x: Math.min(maxX, Math.max(0, x)),
				lift: Math.min(maxLift, Math.max(0, lift)),
			}
		},
		[limits]
	)

	/**
	 * Travel is a CSS transition whose duration comes from the distance, so one
	 * pace covers a stroll, a step aside and a drop to the floor. Dragging sets
	 * that duration to zero, which makes the same property follow the pointer.
	 */
	const moveTo = useCallback(
		(x: number, lift: number, speed = WALK_SPEED, after?: () => void) => {
			const from = posNow.current
			const to = clampPos(x, lift)
			const distance = Math.hypot(to.x - from.x, to.lift - from.lift)
			if (distance < 3) return

			const ms = Math.min(6_000, Math.max(260, (distance / speed) * 1_000))
			const facing = to.x < from.x ? 'left' : 'right'

			setMotion({ ms, facing })
			setPos(to)
			lookAt(facing === 'left' ? -0.9 : 0.9, 0, ms)

			clearTimeout(walkTimer.current)
			walkTimer.current = window.setTimeout(() => {
				setMotion(null)
				onMoved(to.x / limits().maxX)
				after?.()
			}, ms)
		},
		[clampPos, lookAt, limits, onMoved]
	)

	const wander = useCallback(() => {
		const from = posNow.current.x
		const stride = 90 + Math.random() * 220

		const reachable = [from - stride, from + stride]
			.map((x) => clampPos(x, 0).x)
			.filter((x) => Math.abs(x - from) > 20)

		if (reachable.length === 0) return
		moveTo(pick(reachable), 0)
	}, [clampPos, moveTo])

	/** Stand where he stood last time, once the strip has a width to measure. */
	// biome-ignore lint: runs once, on the remembered position.
	useEffect(() => {
		const start = clampPos(initialX * limits().maxX, 0)
		setPos(start)
		posNow.current = start
	}, [initialX])

	useEffect(() => {
		const onResize = () => setPos((current) => clampPos(current.x, current.lift))
		window.addEventListener('resize', onResize)
		return () => window.removeEventListener('resize', onResize)
	}, [clampPos])

	/**
	 * Rust hit-tests against this box to decide whether the window should accept a
	 * click, so it has to be where he *is*, not where he is headed. `pos` jumps to
	 * the target the moment a walk starts and the transition catches up over the
	 * next few seconds, so while he is moving the box is measured from the DOM
	 * instead. Sixteen measurements a second during a stroll, and no animation loop.
	 */
	useEffect(() => {
		const publish = () => {
			const element = rootRef.current
			if (!element) return
			const box = element.getBoundingClientRect()
			onRectChange({ x: box.x, y: box.y, width: box.width, height: box.height })
		}

		publish()
		if (!motion) return

		const id = window.setInterval(publish, 60)
		return () => clearInterval(id)
	}, [motion, pos, onRectChange])

	// ── Senses ───────────────────────────────────────────────────────────────

	/** The cursor is the only sense he has, and it arrives from Rust. */
	useEffect(() => {
		if (!cursor) return

		const now = Date.now()
		const away = now - activityAt.current
		activityAt.current = now

		if (asleep.current) {
			asleep.current = false
			react('happy', 'stretch', 1_800)
			say(pick(away > AWAY_AFTER ? copy.back : copy.wake), 3_000)
		}

		const element = rootRef.current
		if (!element) return

		const box = element.getBoundingClientRect()
		const cx = box.x + box.width / 2
		const cy = box.y + box.height / 2

		setLook((prev) => {
			const x = clamp((cursor.x - cx) / 280)
			const y = clamp((cursor.y - cy) / 220)
			return Math.abs(prev.x - x) < 0.02 && Math.abs(prev.y - y) < 0.02 ? prev : { x, y }
		})

		// Hovering is derived from the cursor rather than from `pointerenter`: the
		// window only starts accepting pointer events once Rust has already decided
		// the cursor is on him, so the enter event is exactly the one that never
		// arrives.
		const inside =
			cursor.x >= box.x &&
			cursor.x <= box.x + box.width &&
			cursor.y >= box.y &&
			cursor.y <= box.y + box.height

		if (inside && !hovering.current) {
			hovering.current = true
			clearTimeout(petTimer.current)
			petTimer.current = window.setTimeout(() => {
				if (dragged.current) return
				react('love', 'pop', 3_200)
				say(pick(copy.pet), 3_600)
			}, PET_AFTER)
		} else if (!inside && hovering.current) {
			hovering.current = false
			clearTimeout(petTimer.current)
		}

		const near = Math.hypot(cursor.x - cx, cursor.y - cy) < NOTICE_WITHIN

		if (!inside && near && moodNow.current === 'idle') setMood('watching')
		else if (!near && moodNow.current === 'watching') setMood('idle')
	}, [cursor, copy, react, say])

	useEffect(() => {
		let open = 0
		let close = 0

		const loop = () => {
			setBlink(true)
			close = window.setTimeout(() => setBlink(false), 130)
			open = window.setTimeout(loop, 2_400 + Math.random() * 5_200)
		}

		open = window.setTimeout(loop, 3_000)

		return () => {
			clearTimeout(open)
			clearTimeout(close)
		}
	}, [])

	/** Everything unprompted, on one poll. Chattiness stretches every floor. */
	useEffect(() => {
		const moments = [
			() => react('yawn', 'yawn', 1_500),
			() => react('happy', 'stretch', 1_200),
			() => {
				lookAt(-1, -0.2, 700)
				window.setTimeout(() => lookAt(1, -0.2, 700), 720)
			},
			() => react('happy', 'dance', 1_700),
			() => {
				react('watching', undefined, 1_200)
				lookAt(0, -1, 1_200)
			},
		]

		const id = window.setInterval(() => {
			const now = Date.now()
			const quiet = now - activityAt.current

			if (quiet > SLEEP_AFTER) {
				if (!asleep.current && moodNow.current === 'idle') {
					asleep.current = true
					setMood('sleep')
					setBubble(null)
				}
				return
			}

			if (asleep.current || moodNow.current !== 'idle' || motion || dragged.current) return

			if (!busy.current && now - chatterAt.current > CHATTER_EVERY * rate.current) {
				chatterAt.current = now
				say(pick(copy.idle), 8_000)
				return
			}

			if (quiet > 8_000 && now - wanderAt.current > WANDER_EVERY * rate.current) {
				wanderAt.current = now
				wander()
				return
			}

			if (now - momentAt.current > MOMENT_EVERY * rate.current && Math.random() < 0.65) {
				momentAt.current = now
				pick(moments)()
			}
		}, 3_500)

		return () => clearInterval(id)
	}, [copy, say, react, lookAt, wander, motion])

	// biome-ignore lint: greets once, in whatever language the OS asked for.
	useEffect(() => {
		const timer = window.setTimeout(() => say(pick(copy.boot), 6_000), 1_600)
		return () => clearTimeout(timer)
	}, [])

	useEffect(
		() => () => {
			clearTimeout(moodTimer.current)
			clearTimeout(bubbleTimer.current)
			clearTimeout(aimTimer.current)
			clearTimeout(walkTimer.current)
			clearTimeout(petTimer.current)
		},
		[]
	)

	// ── Being handled ────────────────────────────────────────────────────────

	const handleClick = () => {
		if (dragged.current) return
		activityAt.current = Date.now()

		const now = Date.now()
		clicks.current = {
			count: now - clicks.current.at < 900 ? clicks.current.count + 1 : 1,
			at: now,
		}

		if (clicks.current.count >= 4) {
			clicks.current = { count: 0, at: now }
			react('dizzy', 'spin', 2_600)
			say(pick(copy.dizzy), 3_400)
			return
		}

		react('happy', 'pop', 2_000)
		say(pick(copy.click), 4_200)
	}

	const handlePointerDown = (event: React.PointerEvent<HTMLButtonElement>) => {
		dragged.current = false
		clearTimeout(walkTimer.current)
		setMotion(null)
		drag.current = {
			id: event.pointerId,
			x: event.clientX,
			y: event.clientY,
			ox: pos.x,
			oy: pos.lift,
		}
		event.currentTarget.setPointerCapture(event.pointerId)
		// Pinned for the whole gesture: a fast drag outruns the 30Hz hit test, and
		// a window that turns click-through mid-drag drops him on the spot.
		onInteractive(true)
	}

	const handlePointerMove = (event: React.PointerEvent<HTMLButtonElement>) => {
		const start = drag.current
		if (!start || start.id !== event.pointerId) return

		const dx = event.clientX - start.x
		const dy = event.clientY - start.y

		if (!dragged.current) {
			if (Math.hypot(dx, dy) < DRAG_THRESHOLD) return
			dragged.current = true
			clearTimeout(petTimer.current)
			setAim(null)
			react('held', undefined, 0)
			say(pick(copy.drag), 2_600)
		}

		// `lift` grows upward while the pointer moves down the screen.
		setPos(clampPos(start.ox + dx, start.oy - dy))
	}

	const handlePointerUp = (event: React.PointerEvent<HTMLButtonElement>) => {
		if (!drag.current) return
		drag.current = null
		event.currentTarget.releasePointerCapture?.(event.pointerId)
		onInteractive(false)

		if (!dragged.current) return

		if (posNow.current.lift > 4) {
			moveTo(posNow.current.x, 0, FALL_SPEED, () => react('wow', 'land', 900))
		} else {
			react('wow', 'land', 900)
			onMoved(posNow.current.x / limits().maxX)
		}

		window.setTimeout(() => {
			dragged.current = false
		}, 0)
	}

	// `data-side` is which edge of him the bubble hangs off. Anchored to whichever
	// edge he is nearest, a wide bubble can never reach past the screen edge.
	return (
		<div
			ref={rootRef}
			className="companion"
			data-mood={mood}
			data-size={settings.size}
			data-walking={motion ? 'true' : undefined}
			data-side={pos.x > window.innerWidth / 2 ? 'right' : 'left'}
			style={{
				transform: `translate(${pos.x}px, ${-pos.lift}px)`,
				transitionDuration: motion ? `${motion.ms}ms` : '0ms',
			}}
		>
			{bubble && (
				<div className="companion-bubble">
					{typed}
					{typed.length < bubble.length && <span className="caret">▌</span>}
				</div>
			)}

			<button
				type="button"
				className="companion-body"
				aria-label={copy.label}
				onClick={handleClick}
				onPointerDown={handlePointerDown}
				onPointerMove={handlePointerMove}
				onPointerUp={handlePointerUp}
				onPointerCancel={handlePointerUp}
			>
				<span key={fx?.n} className="companion-anim" data-anim={fx?.name}>
					<CompanionFace
						mood={mood}
						blink={blink}
						look={aim ?? look}
						glyph={null}
						faceColor="var(--purple)"
						ledColor={mood === 'sleep' ? 'var(--fg-muted)' : 'var(--green)'}
					/>
				</span>
			</button>
		</div>
	)
}
