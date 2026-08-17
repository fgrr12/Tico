import { useCallback, useEffect, useRef, useState } from 'react'

import { CompanionFace } from './CompanionFace'

import { type Language, companionCopy, matchApp } from '../data/companion'
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

/**
 * How often he is allowed to have an opinion about what you are doing.
 *
 * These are the numbers that decide whether he is company or an interruption, and
 * they are deliberately mean. Commenting on every app switch is the single
 * fastest way to make someone quit a desktop pet, so: he waits before noticing,
 * he will not mention the same app twice in a quarter of an hour, and he cannot
 * say anything about your apps more than once every three minutes no matter what
 * you do. Chattiness stretches all of it.
 */
const NOTICE_AFTER = 1_800
const APP_LINE_EVERY = 180_000
const APP_REPEAT_AFTER = 900_000
/** More switches than this inside the window and he says something about it. */
const SWITCH_WINDOW = 120_000
const SWITCH_LIMIT = 6
const SWITCH_COOLDOWN = 900_000
/** Minutes in one app before he mentions it. Each fires once per stay. */
const DWELL_AT = [45, 120]

const CHATTINESS: Record<Settings['chattiness'], number> = {
	quiet: 3,
	normal: 1,
	chatty: 0.45,
}

const pick = <T,>(items: readonly T[]): T => items[Math.floor(Math.random() * items.length)]

const clamp = (value: number) => Math.max(-1, Math.min(1, value))

type Motion = { ms: number; facing: 'left' | 'right' }

export type AskResult =
	| { say: string; mood?: string; action?: string; query?: string }
	| 'no-brain'
	| 'error'

/** Moods the model is allowed to pick. Rust constrains it too; this is the belt. */
const ANSWER_MOODS: CompanionMood[] = ['idle', 'happy', 'wow', 'love', 'dizzy', 'watching']

interface CompanionProps {
	language: Language
	settings: Settings
	/** Global cursor, in CSS pixels relative to the strip. `y` is negative above it. */
	cursor: { x: number; y: number } | null
	/** Anything due today that has not been marked done. */
	reminders: { id: string; text: string }[]
	onReminderDone: (id: string) => void
	/** The frontmost application, and when it became frontmost. */
	activeApp: { name: string; since: number } | null
	/** Whatever a music player is showing in its window title, if anything. */
	nowPlaying: { artist: string; song: string } | null
	/** Unix seconds until which he keeps unprompted remarks to himself. */
	quietUntil: number
	/** The microphone is live somewhere — treated as "you are in a call". */
	inCall: boolean
	inCallMode: 'peek' | 'hide' | 'ignore'
	/** The ask hotkey was pressed. The window is already focused when this flips. */
	asking: boolean
	onAsk: (question: string) => Promise<AskResult>
	/** Executes an intent and reports back what actually happened. */
	onAction: (action: string, query: string) => Promise<{ ok: boolean; label: string }>
	/** Hands the window back: click-through again, focus returned to whatever had it. */
	onAskDone: () => void
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
	activeApp,
	reminders,
	onReminderDone,
	nowPlaying,
	quietUntil,
	inCall,
	inCallMode,
	asking,
	onAsk,
	onAction,
	onAskDone,
	initialX,
	onRectChange,
	onInteractive,
	onMoved,
}: CompanionProps) => {
	const copy = companionCopy[language]

	const rootRef = useRef<HTMLDivElement>(null)
	const bubbleRef = useRef<HTMLDivElement>(null)

	const [mood, setMood] = useState<CompanionMood>('idle')
	const [blink, setBlink] = useState(false)
	const [look, setLook] = useState({ x: 0, y: 0 })
	const [aim, setAim] = useState<{ x: number; y: number } | null>(null)
	const [pos, setPos] = useState({ x: 0, lift: 0 })
	const [motion, setMotion] = useState<Motion | null>(null)
	const [bubble, setBubble] = useState<string | null>(null)
	// Set only for a reminder: the bubble grows a button and waits to be dismissed.
	const [pending, setPending] = useState<string | null>(null)
	const [typed, setTyped] = useState('')
	const [fx, setFx] = useState<{ name: string; n: number } | null>(null)
	const [question, setQuestion] = useState('')
	const [gesture, setGesture] = useState<string | null>(null)

	const inputRef = useRef<HTMLInputElement>(null)

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
	// What he already knows about your afternoon. All of it dies with the process,
	// which is correct: none of it is worth writing to disk, and a pet that
	// remembers last Tuesday's app usage is a tracker wearing a costume.
	const saidAbout = useRef(new Map<string, number>())
	const appLineAt = useRef(0)
	const switches = useRef<number[]>([])
	const switchLineAt = useRef(0)
	const dwellDone = useRef(new Set<number>())
	const appNow = useRef<{ name: string; since: number } | null>(null)
	const motionNow = useRef<Motion | null>(null)
	const remindedToday = useRef(new Set<string>())
	const peekingNow = useRef(false)
	const homeX = useRef<number | null>(null)
	const waveAt = useRef(0)
	const silent = useRef({ quietUntil: 0, presenting: false })

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

	useEffect(() => {
		motionNow.current = motion
	}, [motion])

	const peeking = inCall && inCallMode === 'peek'
	const hidden = inCall && inCallMode === 'hide'

	useEffect(() => {
		silent.current = { quietUntil, presenting: inCall && inCallMode !== 'ignore' }
	}, [quietUntil, inCall, inCallMode])

	useEffect(() => {
		peekingNow.current = peeking
	}, [peeking])

	// ── Speaking ─────────────────────────────────────────────────────────────

	/**
	 * The one place a line can be suppressed, which is why every line goes through
	 * it.
	 *
	 * Two different silences. **Presenting** is absolute: the microphone is live,
	 * something may be on a shared screen, and a bubble full of words is the part
	 * that makes a pet unprofessional — it obliges everyone on the call to read it.
	 * He keeps moving and gesturing; he just says nothing. **Quiet** is the one you
	 * asked for, and it only stops him interrupting: answer him directly and he
	 * still answers back, because you started it.
	 */
	const say = useCallback(
		(text: string, ms = 5_200, forced = false, pendingId: string | null = null) => {
			if (silent.current.presenting) return
			if (!forced && silent.current.quietUntil > Date.now() / 1_000) return

			// Taken as an argument rather than set by the caller beforehand: `say`
			// has to clear a stale button, so a caller setting one first was always
			// going to lose the race with it. It did.
			setPending(pendingId)
			setBubble(text)
			clearTimeout(bubbleTimer.current)
			bubbleTimer.current = window.setTimeout(
				() => setBubble(null),
				ms + text.length * SAY_REVEAL
			)
		},
		[]
	)

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

		// While peeking he is allowed past the right edge, so that half of him is
		// off-screen and the half that is left reads as someone leaning in.
		const overshoot = peekingNow.current ? width * 0.5 : 0

		return {
			maxX: Math.max(1, window.innerWidth - width + overshoot),
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
			let { x, y, width, height } = box

			// The bubble is absolutely positioned, so it contributes nothing to the
			// container's box — which means Rust never learned it was there and kept
			// the window click-through over it. Fine for a bubble that is only read;
			// not fine for the one that grows a button, whose clicks were going
			// straight through to the desktop.
			const bubble = pending ? bubbleRef.current?.getBoundingClientRect() : null

			if (bubble) {
				const left = Math.min(box.left, bubble.left)
				const top = Math.min(box.top, bubble.top)
				x = left
				y = top
				width = Math.max(box.right, bubble.right) - left
				height = Math.max(box.bottom, bubble.bottom) - top
			}

			onRectChange({ x, y, width, height })
		}

		publish()
		if (!motion) return

		const id = window.setInterval(publish, 60)
		return () => clearInterval(id)
	}, [motion, pos, pending, bubble, onRectChange])

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

	/**
	 * Nothing he says unprompted may talk over something else, or wake him up.
	 *
	 * Reads `motion` through a ref rather than closing over the state, so this
	 * keeps a stable identity. As a dependency it would re-run the effect below
	 * every time he started or stopped walking — which would re-clear the dwell
	 * marks mid-stay and let the same "you have been here 45 minutes" line fire
	 * again after every stroll.
	 */
	const canSpeak = useCallback(
		() =>
			!asleep.current &&
			!busy.current &&
			!dragged.current &&
			!motionNow.current &&
			moodNow.current === 'idle',
		[]
	)

	/**
	 * Noticing which app you are in.
	 *
	 * He waits a beat before looking, because reacting the instant a window comes
	 * forward reads as surveillance rather than company — and because you might
	 * just be passing through on the way somewhere else.
	 */
	useEffect(() => {
		if (!activeApp) return

		appNow.current = activeApp
		dwellDone.current.clear()

		const timer = window.setTimeout(() => {
			const now = Date.now()

			switches.current = [...switches.current, now].filter((at) => now - at < SWITCH_WINDOW)
			if (!canSpeak()) return

			// Bouncing between windows outranks any one of them: it is the more
			// interesting thing to have noticed.
			if (
				switches.current.length > SWITCH_LIMIT &&
				now - switchLineAt.current > SWITCH_COOLDOWN * rate.current
			) {
				switchLineAt.current = now
				appLineAt.current = now
				react('wow', 'pop', 1_600)
				say(pick(copy.switching), 5_000)
				return
			}

			if (now - appLineAt.current < APP_LINE_EVERY * rate.current) return

			const key = matchApp(activeApp.name) ?? `?${activeApp.name}`
			const said = saidAbout.current.get(key) ?? 0
			if (now - said < APP_REPEAT_AFTER * rate.current) return

			const lines = copy.apps[key]
			const line = lines ? pick(lines) : pick(copy.unknownApp)(activeApp.name)

			saidAbout.current.set(key, now)
			appLineAt.current = now

			react('watching', undefined, 1_800)
			lookAt(0, -1, 1_600)
			say(line, 6_000)
		}, NOTICE_AFTER)

		return () => clearTimeout(timer)
	}, [activeApp, copy, canSpeak, react, say, lookAt])

	/**
	 * Going to the corner for a call, and coming back afterwards.
	 *
	 * He does not vanish — he moves to the right edge, leaves half of himself
	 * showing, and keeps his gestures. What he loses is his voice, which is the
	 * part that would have made you regret installing him during a demo.
	 */
	useEffect(() => {
		if (peeking) {
			if (homeX.current === null) homeX.current = posNow.current.x
			setBubble(null)
			// Briskly: he is getting out of the way, not going for a walk.
			moveTo(limits().maxX, 0, WALK_SPEED * 2)
			return
		}

		if (homeX.current !== null) {
			const back = homeX.current
			homeX.current = null
			moveTo(back, 0)
		}
	}, [peeking, moveTo, limits])

	/**
	 * A reminder waits for a gap rather than taking one: it fires from the same
	 * poll as everything else unprompted, so quiet, in-call and "he is already
	 * saying something" all apply without a second set of rules. Once a day per
	 * reminder — more than that is nagging, and nagging is how a reminder gets
	 * ignored on the day it matters.
	 */
	useEffect(() => {
		if (reminders.length === 0) return

		const timer = window.setInterval(() => {
			if (!canSpeak()) return

			const next = reminders.find((item) => !remindedToday.current.has(item.id))
			if (!next) return

			remindedToday.current.add(next.id)
			react('watching', 'pop', 3_000)
			say(next.text, 20_000, false, next.id)
		}, 9_000)

		return () => clearInterval(timer)
	}, [reminders, canSpeak, react, say])

	/**
	 * A new track. The singing itself is not gated by any of the chatter floors —
	 * it is not speech, it is him reacting to the room — but the *line* about it
	 * goes through `say` like everything else, so quiet and in-call still hold.
	 */
	// biome-ignore lint: reacts to the track changing, not to the copy changing.
	useEffect(() => {
		if (!nowPlaying) return
		if (Math.random() > 0.4) return

		const timer = window.setTimeout(() => {
			react('happy', 'pop', 2_000)
			say(pick(copy.track)(nowPlaying.artist, nowPlaying.song), 6_000)
		}, 2_500)

		return () => clearTimeout(timer)
	}, [nowPlaying])

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

			// Peeking: he keeps the gestures and loses the itinerary. Wandering off
			// mid-call is the opposite of getting out of the way.
			if (peekingNow.current) {
				if (now - waveAt.current > 14_000) {
					waveAt.current = now
					setGesture('wave')
					window.setTimeout(() => setGesture(null), 1_400)
					return
				}

				if (now - momentAt.current > MOMENT_EVERY && Math.random() < 0.5) {
					momentAt.current = now
					pick(moments)()
				}
				return
			}

			// Having been somewhere a long time is worth more than a stock line
			// about the work, so it gets asked first.
			const app = appNow.current
			if (app && !busy.current) {
				const minutes = Math.floor((now - app.since) / 60_000)
				const reached = DWELL_AT.filter(
					(mark) => minutes >= mark && !dwellDone.current.has(mark)
				)

				if (reached.length > 0) {
					for (const mark of reached) dwellDone.current.add(mark)
					appLineAt.current = now
					react('watching', undefined, 1_800)
					say(pick(copy.dwell)(app.name, minutes), 7_000)
					return
				}
			}

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

	// ── Being asked ──────────────────────────────────────────────────────────

	/** The hotkey already focused the window; this is only about the caret. */
	useEffect(() => {
		if (!asking) return
		activityAt.current = Date.now()
		asleep.current = false
		setQuestion('')
		react('watching', 'pop', 0)
		lookAt(0, -1, 4_000)
		// One frame, so the input exists before it is asked to take focus.
		const timer = window.setTimeout(() => inputRef.current?.focus(), 30)
		return () => clearTimeout(timer)
	}, [asking, react, lookAt])

	/**
	 * Only ever cancels the *asking*. Submitting closes the input too, and whether
	 * the browser fires a blur at an element being unmounted is not something to
	 * bet a state machine on — so this refuses to touch any mood but the one the
	 * question itself put him in. Without the guard, sending a question drops him
	 * out of `thinking` a frame after he enters it.
	 */
	const closeAsk = useCallback(() => {
		setQuestion('')
		setMood((current) => (current === 'watching' ? 'idle' : current))
		onAskDone()
	}, [onAskDone])

	const submitAsk = useCallback(async () => {
		const asked = question.trim()
		if (!asked) {
			closeAsk()
			return
		}

		// The window goes back to click-through before the answer arrives: he can
		// think with his hands free, and you can keep working while he does.
		setQuestion('')
		onAskDone()

		react('thinking', undefined, 0)
		say(pick(copy.thinking), 120_000, true)

		const answer = await onAsk(asked)

		if (answer === 'no-brain') {
			react('wow', 'pop', 2_400)
			say(pick(copy.noBrain), 12_000, true)
			return
		}

		if (answer === 'error') {
			react('error', 'shake', 2_400)
			say(pick(copy.brainError), 6_000, true)
			return
		}

		// Something to do rather than something to say. The line describing it is
		// written, not generated: it fires on every action, so it is the line seen
		// most often, and a template holding a real filename beats anything a 3B
		// writes about a file it never saw.
		if (answer.action && answer.action !== 'answer' && answer.query) {
			const done = await onAction(answer.action, answer.query)

			if (!done.ok) {
				react('error', 'shake', 2_400)
				say(copy.notFound(done.label), 6_000, true)
				return
			}

			react('happy', 'hop', 2_400)
			say(
				answer.action === 'reveal_file'
					? copy.revealing(done.label)
					: answer.action === 'open_url'
						? copy.openingUrl(done.label)
						: copy.opening(done.label),
				5_000,
				true
			)
			return
		}

		const mood = ANSWER_MOODS.find((allowed) => allowed === answer.mood) ?? 'happy'
		react(mood, 'pop', 3_000)
		say(answer.say, 9_000, true)
	}, [question, closeAsk, onAsk, onAction, onAskDone, react, say, copy])

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
			data-singing={nowPlaying && !hidden ? 'true' : undefined}
			data-gesture={gesture ?? undefined}
			data-hidden={hidden ? 'true' : undefined}
			style={{
				transform: `translate(${pos.x}px, ${-pos.lift}px)`,
				transitionDuration: motion ? `${motion.ms}ms` : '0ms',
			}}
		>
			{asking ? (
				<div className="companion-bubble companion-ask">
					<input
						ref={inputRef}
						value={question}
						onChange={(event) => setQuestion(event.target.value)}
						onKeyDown={(event) => {
							if (event.key === 'Enter') submitAsk()
							if (event.key === 'Escape') closeAsk()
						}}
						onBlur={closeAsk}
						placeholder={copy.askPlaceholder}
						spellCheck={false}
						autoComplete="off"
						aria-label={copy.askPlaceholder}
					/>
				</div>
			) : (
				bubble && (
					<div ref={bubbleRef} className="companion-bubble" data-pending={pending ?? undefined}>
						{typed}
						{typed.length < bubble.length && <span className="caret">▌</span>}

						{pending && typed.length === bubble.length && (
							<button
								type="button"
								className="companion-done"
								onClick={() => {
									onReminderDone(pending)
									setPending(null)
									setBubble(null)
									react('happy', 'hop', 2_000)
								}}
							>
								{copy.reminderDone}
							</button>
						)}
					</div>
				)
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
						singing={nowPlaying !== null && !hidden}
						faceColor="var(--purple)"
						ledColor={mood === 'sleep' ? 'var(--fg-muted)' : 'var(--green)'}
					/>
				</span>
			</button>
		</div>
	)
}
