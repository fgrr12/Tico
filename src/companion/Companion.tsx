import { useCallback, useEffect, useRef, useState } from 'react'

import { CompanionFace } from './CompanionFace'

import {
	DAY_MILESTONES,
	STREAK_MILESTONES,
	companionCopy,
	documentIn,
	type Familiarity,
	familiarityFrom,
	PALETTE,
	TERRORS,
	energyAt,
	type Feeling,
	feelingFrom,
	type Language,
	linesFor,
	matchApp,
	timeOfDay,
} from '../data/companion'
import type { CompanionMood, Opening, PetRect, Settings } from '../types'

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
/**
 * Floor between crossings to the other edge during a call. Long, because the
 * whole effect is that you catch it happening rather than watch it happen — a
 * pet that shuttles between corners every minute is pacing, not being shy.
 */
const CROSS_EVERY = 95_000
/**
 * How long a prop stays mounted after it is taken off, so its exit can play.
 * Longer than the slowest exit in `companion.css`, which is the 0.36s one.
 */
const PROP_LEAVE = 400
/** Walking and falling pace, in CSS pixels per second. */
const WALK_SPEED = 74
const FALL_SPEED = 1_100
/** Per-character delay while a line is typed into the bubble. */
const SAY_REVEAL = 16

/**
 * How fast he talks, by feeling. Not decoration: a line blurted out in nine
 * milliseconds a character and the same line dragged out at thirty are two
 * different deliveries of the same words, and delivery is most of what tone is.
 */
const REVEAL_BY_FEELING: Partial<Record<Feeling, number>> = {
	sleepy: 30,
	lonely: 24,
	bored: 22,
	worried: 19,
	scared: 9,
	rattled: 9,
	festive: 11,
	pleased: 12,
	smug: 14,
}

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
/** Between two remarks about which file is open. Rarer than app remarks: you
 *  change file far more often than you change application. */
const FILE_LINE_EVERY = 420_000
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


interface CompanionProps {
	language: Language
	settings: Settings
	/** Global cursor, in CSS pixels relative to the strip. `y` is negative above it. */
	cursor: { x: number; y: number } | null
	/** Anything due today that has not been marked done. */
	reminders: { id: string; text: string }[]
	onReminderDone: (id: string) => void
	/** The frontmost application, its focused window's title, and since when. */
	activeApp: { name: string; title: string | null; since: number } | null
	/** Whatever a music player is showing in its window title, if anything. */
	nowPlaying: { artist: string; song: string } | null
	/** Unix seconds until which he keeps unprompted remarks to himself. */
	quietUntil: number
	/** The microphone is live somewhere — treated as "you are in a call". */
	inCall: boolean
	inCallMode: 'peek' | 'hide' | 'ignore'
	/** Where he was standing last time, as a fraction of the strip width. */
	initialX: number
	/** What he remembers from before this launch. Read once, at boot. */
	opening: Opening
	/** Counters that outlive the session. Fire and forget — nothing reads them
	 *  back until the next launch, so a dropped one costs nothing. */
	onRemember: (what: string, key?: string) => void
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
	initialX,
	opening,
	onRemember,
	onRectChange,
	onInteractive,
	onMoved,
}: CompanionProps) => {
	const copy = companionCopy[language]
	/**
	 * Fixed for the session, which is right: how well he knows you is a fact about
	 * this morning, not something that should shift while you watch.
	 */
	const familiarity: Familiarity = familiarityFrom(opening.days)

	const rootRef = useRef<HTMLDivElement>(null)
	const bubbleRef = useRef<HTMLDivElement>(null)

	const [mood, setMood] = useState<CompanionMood>('idle')
	const [blink, setBlink] = useState(false)
	// Neither of these is state any more. Where he is looking changes with the
	// pointer, which is far too often to re-render for, and it reaches the drawing
	// as two CSS variables written straight onto the element.
	const look = useRef({ x: 0, y: 0 })
	const aim = useRef<{ x: number; y: number } | null>(null)
	const [pos, setPos] = useState({ x: 0, lift: 0 })
	const [motion, setMotion] = useState<Motion | null>(null)
	const [bubble, setBubble] = useState<string | null>(null)
	// Set only for a reminder: the bubble grows a button and waits to be dismissed.
	const [pending, setPending] = useState<string | null>(null)
	const [typed, setTyped] = useState('')
	const [fx, setFx] = useState<{ name: string; n: number } | null>(null)
	const [gesture, setGesture] = useState<string | null>(null)
	/** A held pose, unlike `fx` which is a one-shot. Sitting lasts. */
	const [pose, setPose] = useState<string | null>(null)
	const [prop, setProp] = useState<string | null>(null)
	/** Taking it off is an animation, so the prop outlives the decision to drop it. */
	const [propLeaving, setPropLeaving] = useState(false)
	const [feeling, setFeeling] = useState<Feeling>('content')
	const [flying, setFlying] = useState(false)
	const poseTimer = useRef(0)
	const propTimer = useRef(0)


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
	const appNow = useRef<{ name: string; title: string | null; since: number } | null>(null)
	const lastDocument = useRef<string | null>(null)
	const fileLineAt = useRef(0)
	const motionNow = useRef<Motion | null>(null)
	const remindedToday = useRef(new Set<string>())
	const lastCursorX = useRef<number | null>(null)
	/** Raised by being handled, decaying on its own. The only input he gets. */
	const attention = useRef(0)
	const dragTimes = useRef<number[]>([])
	const seenApps = useRef(new Set<string>())
	const feelingNow = useRef<Feeling>('content')
	const peekingNow = useRef(false)
	/** Which edge he is peeking from. He does not stay on the one he started on. */
	const peekEdge = useRef<'left' | 'right'>('right')
	/** Mid-crossing: briefly allowed all the way off the strip, and left alone. */
	const crossingNow = useRef(false)
	/** Out in the open during a call, because you asked him to be. */
	const steppingOut = useRef(false)
	const crossAt = useRef(0)
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

	useEffect(() => {
		feelingNow.current = feeling
	}, [feeling])

	/**
	 * Attention decays about a tenth a minute, so being petted colours the next
	 * five minutes and not the next hour. Anything permanent would mean he is
	 * pleased forever after one good afternoon.
	 */
	useEffect(() => {
		const id = window.setInterval(() => {
			attention.current = Math.max(0, attention.current - 0.02)
		}, 12_000)
		return () => clearInterval(id)
	}, [])

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
			// `forced` means you asked for this out loud, and it beats both silences.
			// Every one of them is about him *volunteering* things: the call mute
			// exists so he does not talk over a demo, not so he can be clicked on
			// and pretend he did not notice. Nothing unprompted passes `true`.
			if (!forced && silent.current.presenting) return
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
		}, REVEAL_BY_FEELING[feelingNow.current] ?? SAY_REVEAL)

		return () => clearInterval(id)
	}, [bubble])

	/** `ms = 0` holds the mood until something else changes it. */
	const react = useCallback((next: CompanionMood, effect?: string, ms = 2_800) => {
		setMood(next)
		if (effect) setFx((prev) => ({ name: effect, n: (prev?.n ?? 0) + 1 }))
		clearTimeout(moodTimer.current)
		if (ms > 0) moodTimer.current = window.setTimeout(() => setMood('idle'), ms)
	}, [])

	/** The one place the eyes move, whoever asked. */
	const applyLook = useCallback(() => {
		const element = rootRef.current
		if (!element) return
		const { x, y } = aim.current ?? look.current
		element.style.setProperty('--look-x', String(x))
		element.style.setProperty('--look-y', String(y))
	}, [])

	const lookAt = useCallback(
		(x: number, y: number, ms = 1_400) => {
			aim.current = { x, y }
			applyLook()
			clearTimeout(aimTimer.current)
			aimTimer.current = window.setTimeout(() => {
				aim.current = null
				applyLook()
			}, ms)
		},
		[applyLook]
	)

	// ── Moving ───────────────────────────────────────────────────────────────

	/**
	 * How far past an edge he is allowed, which is the whole difference between
	 * standing on the strip and leaning in from beside it.
	 *
	 * Three settings, and the overshoot is symmetric because he now peeks from
	 * either edge: normally none, half of him while peeking, and all of him while
	 * crossing — `#root` is `overflow: hidden`, so "all of him" is genuinely gone
	 * rather than hanging over the edge of the window.
	 */
	const limits = useCallback(() => {
		const element = rootRef.current
		const width = element?.offsetWidth ?? 92
		const height = element?.offsetHeight ?? 96

		const overshoot = crossingNow.current ? width : peekingNow.current ? width * 0.5 : 0

		return {
			minX: -overshoot,
			maxX: Math.max(1, window.innerWidth - width + overshoot),
			maxLift: Math.max(0, window.innerHeight - height),
		}
	}, [])

	const clampPos = useCallback(
		(x: number, lift: number) => {
			const { minX, maxX, maxLift } = limits()
			return {
				x: Math.min(maxX, Math.max(minX, x)),
				lift: Math.min(maxLift, Math.max(0, lift)),
			}
		},
		[limits]
	)

	/** Where half of him shows, on whichever edge he is currently haunting. */
	const peekRestX = useCallback(
		() => (peekEdge.current === 'left' ? limits().minX : limits().maxX),
		[limits]
	)

	/**
	 * Travel is a CSS transition whose duration comes from the distance, so one
	 * pace covers a stroll, a step aside and a drop to the floor. Dragging sets
	 * that duration to zero, which makes the same property follow the pointer.
	 */
	const moveTo = useCallback(
		(x: number, lift: number, speed = WALK_SPEED, after?: () => void) => {
			// A tired walk is a slower walk, and it is the cheapest tell there is.
			speed = speed * (0.65 + energyAt() * 0.35)
			const from = posNow.current
			const to = clampPos(x, lift)
			const distance = Math.hypot(to.x - from.x, to.lift - from.lift)
			// Nowhere to go, but the callback still runs. Callers use it to end a
			// state that only they can end — flying, crossing, being out in the open
			// during a call — and swallowing it here strands them on forever. The
			// rocket has always had this bug: launch from a pixel off the far wall
			// and `setFlying(false)` never runs.
			if (distance < 3) {
				after?.()
				return
			}

			const ms = Math.min(6_000, Math.max(260, (distance / speed) * 1_000))
			const facing = to.x < from.x ? 'left' : 'right'

			setPose(null)
			setMotion({ ms, facing })
			setPos(to)
			lookAt(facing === 'left' ? -0.9 : 0.9, 0, ms)

			clearTimeout(walkTimer.current)
			walkTimer.current = window.setTimeout(() => {
				setMotion(null)
				// Not while crossing. Where he is halfway through walking off the edge
				// of the world is not somewhere to put him back on the next launch.
				if (!crossingNow.current) onMoved(to.x / limits().maxX)
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

		// While he is moving the box moves; while a button is waiting the bubble
		// *grows*, because the line types in one character at a time. Publishing
		// once when the bubble appears measured an empty one — which is exactly the
		// area the button was not yet in.
		if (!motion && !pending) return

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

		lastCursorX.current = cursor.x

		const box = element.getBoundingClientRect()
		const cx = box.x + box.width / 2
		const cy = box.y + box.height / 2

		const x = clamp((cursor.x - cx) / 280)
		const y = clamp((cursor.y - cy) / 220)

		// Six pixels of eye travel does not need fifty steps. Coarser here means
		// fewer style writes and no visible difference.
		if (Math.abs(look.current.x - x) > 0.05 || Math.abs(look.current.y - y) > 0.05) {
			look.current = { x, y }
			if (!aim.current) applyLook()
		}

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
				onRemember('pet')
			}, PET_AFTER)
		} else if (!inside && hovering.current) {
			hovering.current = false
			clearTimeout(petTimer.current)
		}

		const near = Math.hypot(cursor.x - cx, cursor.y - cy) < NOTICE_WITHIN

		if (!inside && near && moodNow.current === 'idle') setMood('watching')
		else if (!near && moodNow.current === 'watching') setMood('idle')
	}, [cursor, copy, react, say, applyLook])

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

		const switchedApp = appNow.current?.name !== activeApp.name
		appNow.current = activeApp

		// Only a real app change resets these. Changing file inside the same editor
		// used to clear the dwell marks, which is the same bug as the one that used
		// to restart the dwell *clock* — fixed there, missed here.
		if (switchedApp) {
			dwellDone.current.clear()
			switches.current = [...switches.current, Date.now()]
		}

		// Marked as seen a beat after arriving, which is what gives `curious` a
		// window to exist in.
		const seen = window.setTimeout(() => seenApps.current.add(activeApp.name), 30_000)

		const timer = window.setTimeout(() => {
			const now = Date.now()

			switches.current = switches.current.filter((at) => now - at < SWITCH_WINDOW)
			if (!canSpeak()) return

			/**
			 * The file, when he can see one. More observant than the app by a long
			 * way — "estás en VS Code" is true all day, and "Companion.tsx otra vez"
			 * is about this minute.
			 */
			const document = documentIn(activeApp.title)
			if (
				document &&
				document !== lastDocument.current &&
				now - fileLineAt.current > FILE_LINE_EVERY * rate.current
			) {
				lastDocument.current = document
				fileLineAt.current = now
				appLineAt.current = now

				const ext = document.slice(document.lastIndexOf('.') + 1).toLowerCase()
				const specific = copy.fileByExt[ext]
				react('watching', undefined, 1_600)
				lookAt(0, -0.8, 1_400)
				say(pick(specific ?? copy.file)(document), 5_500)
				return
			}

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

			// A feared application is the more interesting thing to say about the
			// moment than anything in the ordinary pool.
			const fear = copy.fears[key]
			if (fear) {
				react('scared', 'shiver', 3_000)
				saidAbout.current.set(key, now)
				appLineAt.current = now
				say(pick(fear), 6_000)
				return
			}

			const lines = copy.apps[key]
			const line = lines
				? pick(linesFor(lines, timeOfDay()))
				: pick(copy.unknownApp)(activeApp.name)

			saidAbout.current.set(key, now)
			appLineAt.current = now

			react('watching', undefined, 1_800)
			lookAt(0, -1, 1_600)
			say(line, 6_000)
		}, NOTICE_AFTER)

		return () => {
			clearTimeout(timer)
			clearTimeout(seen)
		}
	}, [activeApp, copy, canSpeak, react, say, lookAt])

	/**
	 * Going to the corner for a call, and coming back afterwards.
	 *
	 * He does not vanish — he moves to an edge, leaves half of himself showing,
	 * and keeps his gestures. What he loses is his voice, which is the part that
	 * would have made you regret installing him during a demo.
	 */
	useEffect(() => {
		if (peeking) {
			if (homeX.current === null) homeX.current = posNow.current.x
			setBubble(null)
			// He always leaves to the right. Which edge he is on later is up to him.
			peekEdge.current = 'right'
			// Briskly: he is getting out of the way, not going for a walk.
			moveTo(limits().maxX, 0, WALK_SPEED * 2)
			return
		}

		crossingNow.current = false
		steppingOut.current = false

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
		/**
		 * What he does with himself.
		 *
		 * `min` is the energy floor: dancing needs most of a day behind it and
		 * simply never happens at 2am, while sitting is what is left when nothing
		 * else qualifies. That one number is what makes late tico a different
		 * creature rather than the same one on a longer timer.
		 *
		 * `then` chains a second behaviour a beat later. A yawn that becomes a sit
		 * that becomes a nod reads as one creature getting tired; the same three
		 * drawn separately read as a shuffle. Chains are most of what stops the
		 * fifteenth minute looking like the first.
		 */
		type Moment = {
			min: number
			run: () => void
			then?: string
			/** Only offered when this holds — `adjust` is meaningless bare-headed. */
			needs?: () => boolean
			/**
			 * Covers ground. Withheld while peeking, where the whole point is that
			 * he stays put: anything that moves him ends the call with him standing
			 * in the middle of the screen, which is the thing peeking exists to
			 * prevent. The energy floor was doing this job badly — `flee` costs 0.3
			 * and crosses the entire strip at three times walking pace.
			 */
			travels?: boolean
		}

		const sit = (ms = 6_000 + Math.random() * 9_000) => {
			setPose('sit')
			clearTimeout(poseTimer.current)
			poseTimer.current = window.setTimeout(() => setPose(null), ms)
		}

		const moments: Record<string, Moment> = {
			yawn: { min: 0, run: () => react('yawn', 'yawn', 1_500), then: 'sit' },
			sit: { min: 0, run: () => sit() },
			slump: { min: 0, run: () => { sit(12_000); react('sleep', undefined, 4_000) } },
			nod: { min: 0, run: () => react('sleep', 'nod', 1_800) },
			stare: { min: 0, run: () => { react('idle', undefined, 3_000); lookAt(0, 0.2, 3_000) } },

			stretch: { min: 0.3, run: () => react('happy', 'stretch', 1_200) },
			scan: {
				min: 0.3,
				run: () => {
					lookAt(-1, -0.2, 700)
					window.setTimeout(() => lookAt(1, -0.2, 700), 720)
				},
			},
			blinkfast: { min: 0.3, run: () => react('idle', 'blinkfast', 900) },
			lean: { min: 0.3, run: () => react('idle', 'lean', 2_200) },
			hiccup: { min: 0.35, run: () => react('wow', 'hiccup', 800) },
			shake: { min: 0.35, run: () => react('idle', 'shake', 900), then: 'blinkfast' },
			ceiling: { min: 0.35, run: () => { react('watching', undefined, 1_800); lookAt(0, -1, 1_800) } },

			watchyou: {
				min: 0.4,
				run: () => {
					react('watching', undefined, 2_600)
					aim.current = null
					applyLook()
				},
			},
			sneeze: { min: 0.45, run: () => react('wow', 'sneeze', 900), then: 'shake' },
			spin: { min: 0.5, run: () => react('happy', 'spin', 1_000) },
			bounce: { min: 0.55, run: () => react('happy', 'bounce', 1_300) },
			hop: { min: 0.55, run: () => react('happy', 'hop', 900) },
			pace: {
				min: 0.6,
				travels: true,
				run: () => {
					const from = posNow.current.x
					const step = Math.random() < 0.5 ? -110 : 110
					moveTo(from + step, 0, WALK_SPEED * 1.3, () =>
						window.setTimeout(() => moveTo(from, 0, WALK_SPEED * 1.3), 400)
					)
				},
			},
			chase: {
				min: 0.6,
				travels: true,
				run: () => {
					const target = lastCursorX.current
					if (target === null) return
					const from = posNow.current.x
					const step = Math.max(-140, Math.min(140, target - from))
					moveTo(from + step, 0, WALK_SPEED * 1.4)
				},
				then: 'stare',
			},
			dance: { min: 0.7, run: () => react('happy', 'dance', 1_700) },
			jig: { min: 0.75, run: () => react('happy', 'jig', 1_600), then: 'bounce' },
			showoff: { min: 0.8, run: () => react('love', 'spin', 1_200), then: 'hop' },

			// ── the quiet end ────────────────────────────────────────────────
			dream: { min: 0, run: () => react('sleep', 'twitch', 1_400) },
			settle: { min: 0, run: () => react('idle', 'settle', 1_100) },
			groom: { min: 0.2, run: () => react('idle', 'groom', 1_600) },

			// ── he lives on a ledge, so let him use it ───────────────────────
			edge: {
				min: 0.3,
				travels: true,
				// Whichever edge is nearer. Walking the length of the screen to lean
				// on the far one is not a whim, it is a commute.
				run: () => {
					const here = posNow.current.x
					const far = limits().maxX
					moveTo(here < far / 2 ? 0 : far, 0, WALK_SPEED * 1.15)
				},
				then: 'lean',
			},
			peekover: { min: 0.35, run: () => { react('watching', 'peek', 1_800); lookAt(0, 1, 1_800) } },

			/**
			 * Off one edge and back from the other, having gone to look.
			 *
			 * This started as the shy behaviour during a call and turned out to be a
			 * better idle than a corner trick: `copy.idle` already has him wondering
			 * aloud what is past the edge, so this is the same pet going to find out.
			 * Expensive on purpose — 0.5 means he does not go exploring at two in the
			 * morning, which is exactly when a pet vanishing off the screen would read
			 * as a crash rather than as curiosity.
			 */
			behind: {
				min: 0.5,
				travels: true,
				run: () => cross(backFromBehind),
			},

			// ── noticing himself ─────────────────────────────────────────────
			inspect: { min: 0.35, run: () => { react('watching', 'inspect', 1_600); lookAt(0, 0.8, 1_600) } },
			doubletake: {
				min: 0.4,
				run: () => {
					lookAt(-1, 0, 500)
					window.setTimeout(() => {
						lookAt(0.9, -0.3, 900)
						react('wow', 'jolt', 900)
					}, 520)
				},
			},
			startle: { min: 0.45, run: () => react('wow', 'startle', 900), then: 'blinkfast' },

			// ── only with something on ───────────────────────────────────────
			/**
			 * Straightening the thing he is wearing, and complaining about it.
			 *
			 * The line is the point. The wiggle on its own is a tic; the wiggle plus
			 * "my ears hurt — I do not have ears" is a creature that has noticed it
			 * is wearing something and has an opinion about the experience, which is
			 * a different opinion from the one it had when it put the thing on.
			 * Hence a second keyed list rather than reusing `copy.props`.
			 */
			adjust: {
				min: 0.3,
				needs: () => prop !== null,
				run: () => {
					react('idle', 'adjust', 1_300)
					const lines = prop === null ? undefined : copy.propFuss[prop]
					// After the wiggle, not with it — he fidgets and then decides why.
					if (lines && Math.random() < 0.6) {
						window.setTimeout(() => say(pick(lines), 4_500), 900)
					}
				},
			},
			admire: {
				min: 0.35,
				needs: () => prop !== null,
				run: () => { react('love', undefined, 2_000); lookAt(0, -0.9, 2_000) },
			},

			// ── the loud end ─────────────────────────────────────────────────
			trip: { min: 0.55, run: () => react('wow', 'trip', 1_100), then: 'shake' },
			bow: { min: 0.6, run: () => react('happy', 'bow', 1_400) },
			wave: { min: 0.6, run: () => { react('happy', undefined, 1_600); setGesture('wave'); window.setTimeout(() => setGesture(null), 1_400) } },
			/**
			 * All the way across, fast, off the ground. The one behaviour that is
			 * pure spectacle — everything else here is something a small creature
			 * would plausibly do, and this is not, which is why it is rare and why
			 * it needs a whole day's energy behind it.
			 */
			rocket: {
				min: 0.75,
				travels: true,
				run: () => {
					const far = posNow.current.x < limits().maxX / 2 ? limits().maxX : 0

					// Announced about half the time. Always announcing it makes it a
					// routine with a countdown; never announcing it makes it a glitch.
					if (Math.random() < 0.5) say(pick(copy.rocketUp), 2_200)

					setFlying(true)
					react('wow', undefined, 2_400)
					moveTo(far, 60, 900, () => {
						moveTo(far, 0, FALL_SPEED, () => {
							setFlying(false)
							react('wow', 'land', 900)
							// The landing is the funnier half, so it talks more often.
							if (Math.random() < 0.7) {
								window.setTimeout(() => say(pick(copy.rocketDown), 5_000), 500)
							}
						})
					})
				},
			},

			/** The rocket with a reason. Away from whatever just appeared. */
			flee: {
				min: 0.3,
				travels: true,
				run: () => {
					const far = posNow.current.x < limits().maxX / 2 ? limits().maxX : 0
					react('scared', undefined, 2_600)
					moveTo(far, 0, WALK_SPEED * 3)
				},
			},

			cower: { min: 0, run: () => { react('scared', 'shiver', 2_200); sit(5_000) } },

			skip: {
				min: 0.7,
				travels: true,
				run: () => {
					const from = posNow.current.x
					moveTo(from + (Math.random() < 0.5 ? -90 : 90), 0, WALK_SPEED * 1.6)
					react('happy', 'bounce', 1_300)
				},
			},
		}

		/**
		 * Something to wear, occasionally, for no reason he would explain. A pet
		 * that puts on a party hat because it is your birthday is a feature; one
		 * that does it on a Tuesday and takes it off a minute later is a character.
		 */
		const PROPS = [
			'party',
			'tophat',
			'shades',
			'crown',
			'flower',
			'scarf',
			'coffee',
			'afro',
			'mohawk',
			'longhair',
			'beanie',
			'cap',
			'hood',
			'catears',
			'glasses',
			'moustache',
			'tie',
			'bowtie',
			'cape',
			'duck',
			'umbrella',
		]

		/**
		 * Putting something on, and the one timer that takes it off again.
		 *
		 * Shared by the two things that can dress him — picking a hat for no
		 * reason, and coming back from behind the screen wearing what he found —
		 * because both need the identical two-step exit. A souvenir that never
		 * came off would stop being a souvenir and become a permanent feature.
		 * `lines` is already decided by the caller: whether he comments on the
		 * thing is a different question for a hat than it is for a cobweb.
		 */
		const wear = (kind: string, lines?: string[]) => {
			setProp(kind)
			// In case the last one was still on its way out. Whatever is arriving
			// wins, and it should arrive putting itself on rather than taking itself
			// off.
			setPropLeaving(false)

			// A beat after it appears, not with it. He puts the thing on and *then*
			// has an opinion about it, which is the order those two happen in.
			if (lines) window.setTimeout(() => say(pick(lines), 5_000), 1_200)

			clearTimeout(propTimer.current)
			propTimer.current = window.setTimeout(() => {
				// Two steps: the exit plays, and only then does the node go. The
				// second timer reuses the same ref, so the unmount cleanup already
				// covers both halves and there is nothing new to tear down.
				setPropLeaving(true)
				// Taking it off is the smaller event and gets commented on less.
				if (Math.random() < 0.3) say(pick(copy.propOff), 4_000)

				propTimer.current = window.setTimeout(() => {
					setProp(null)
					setPropLeaving(false)
				}, PROP_LEAVE)
			}, 25_000 + Math.random() * 70_000)
		}

		const wearSomething = () => {
			// Headphones only while something is playing — the one prop with a
			// reason, which is what makes the rest read as having none.
			// The favourite is whatever he has worn most across every session, and
			// it only tilts the odds — a pet that always wears the same hat has a
			// uniform, not a preference. Nothing chose it: it emerged from a random
			// draw and then bent the draw, which is roughly how taste works.
			const favourite = opening.favourite
			const wantsFavourite = favourite !== null && Math.random() < 0.35

			const kind = nowPlaying && Math.random() < 0.6
				? 'headphones'
				: wantsFavourite && favourite !== null
					? favourite
					: pick(PROPS)

			// Only what he chose counts towards the favourite. A souvenir does not:
			// the favourite bends the next random draw, so letting a cobweb win it
			// would have him spawning cobwebs on a Tuesday with nothing behind them,
			// which is the one thing the souvenirs exist not to do.
			onRemember('prop', kind)

			const lines =
				kind === favourite && Math.random() < 0.5 ? copy.memory.favourite : copy.props[kind]
			wear(kind, lines && Math.random() < 0.65 ? lines : undefined)
		}

		/**
		 * Crossing to the other edge, out of sight.
		 *
		 * He cannot actually pass behind anything — the strip is one always-on-top
		 * transparent window over the full width of the monitor, so everything he
		 * draws is in front of the Dock by construction and there is no z-order to
		 * borrow. What there is instead is `overflow: hidden` on `#root`: walk far
		 * enough past an edge and he is genuinely gone, and the jump across happens
		 * with nothing on screen to see it. Coming back in from the far side is
		 * what sells "he went round the back" — the shortcut is invisible because
		 * the only two frames you get are him leaving and him arriving.
		 *
		 * The pause in the middle is doing the acting. Without it the walk out and
		 * the walk in join into one movement and read as a rendering seam; with it,
		 * he was somewhere else for a moment.
		 */
		const cross = (arrived?: () => void) => {
			const width = rootRef.current?.offsetWidth ?? 92
			const wasPeeking = peekingNow.current

			// Peeking he leaves by the edge he is already on. Otherwise whichever is
			// nearer, because walking the length of the screen to go round the back
			// is not a whim, it is a commute — the same reasoning as `edge`.
			const leaving = wasPeeking
				? peekEdge.current
				: posNow.current.x < window.innerWidth / 2
					? 'left'
					: 'right'

			crossingNow.current = true
			setGesture(null)

			// Out past the clip, unhurried — he is slipping away, not fleeing.
			moveTo(leaving === 'right' ? window.innerWidth : -width, 0, WALK_SPEED * 1.6, () => {
				// A call can end at any point in here, and when it does the peek
				// effect is already walking him home — so every step checks it is
				// still wanted. The pause below is a bare `setTimeout` that nothing
				// clears, which makes this the one that matters.
				if (wasPeeking && !peekingNow.current) {
					crossingNow.current = false
					return
				}

				// Motion is already null by the time this runs, so setting the
				// position now is the same duration-0 jump a drag uses.
				peekEdge.current = leaving === 'right' ? 'left' : 'right'
				const across = { x: leaving === 'right' ? -width : window.innerWidth, lift: 0 }
				setPos(across)
				posNow.current = across

				window.setTimeout(() => {
					crossingNow.current = false
					if (wasPeeking && !peekingNow.current) return

					// Where he reappears. Pinned to the edge during a call, because
					// that is the whole contract; otherwise a little way in, so he
					// arrives walking rather than materialising in the corner.
					const landing = peekingNow.current
						? peekRestX()
						: peekEdge.current === 'left'
							? 50 + Math.random() * 150
							: limits().maxX - (50 + Math.random() * 150)

					moveTo(landing, 0, WALK_SPEED * 1.6, arrived)

					// A wave on arrival, often but not always. Every time is a routine.
					// Only from the corner: out in the open the souvenir is the payoff,
					// and both at once is him doing a bit.
					if (peekingNow.current && Math.random() < 0.6) {
						waveAt.current = Date.now()
						window.setTimeout(() => {
							setGesture('wave')
							window.setTimeout(() => setGesture(null), 1_400)
						}, 900)
					}
				}, 700 + Math.random() * 1_400)
			})
		}

		/**
		 * What he brings back, which is the answer to a question he already asks.
		 *
		 * `copy.idle` has him wondering aloud what is past the edge. Going to look
		 * is the crossing; a cobweb on his head when he reappears is the punchline,
		 * and it only lands because the two are the same behaviour. Most trips
		 * bring back nothing at all — if he returned holding something every time,
		 * behind the screen would be a vending machine rather than somewhere dusty.
		 */
		const SOUVENIRS = ['cobweb', 'bolt', 'dust']

		const backFromBehind = () => {
			if (Math.random() < 0.4) {
				const kind = pick(SOUVENIRS)
				react('wow', 'pop', 1_800)
				// Always says its line, unlike a hat. He did not choose this and has
				// only just noticed it, which is worth a remark every time.
				wear(kind, copy.props[kind])
				return
			}

			if (Math.random() < 0.55) say(pick(copy.behind), 5_000)
		}

		const perform = (key: string) => {
			const moment = moments[key]
			if (!moment) return
			moment.run()
			if (moment.then) {
				window.setTimeout(() => moments[moment.then as string]?.run(), 1_900)
			}
		}

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
				// Both of these own him completely while they run.
				if (crossingNow.current || steppingOut.current) return

				if (now - crossAt.current > CROSS_EVERY && Math.random() < 0.35) {
					crossAt.current = now
					cross()
					return
				}

				if (now - waveAt.current > 14_000) {
					waveAt.current = now
					setGesture('wave')
					window.setTimeout(() => setGesture(null), 1_400)
					return
				}

				// Calm ones only, and nothing that travels. He is half off-screen at
				// the edge of a call — a dance is not a gesture there, it is an
				// entrance, and `flee` is an entrance with a running start.
				if (now - momentAt.current > MOMENT_EVERY && Math.random() < 0.5) {
					momentAt.current = now
					perform(
						pick(
							Object.keys(moments).filter(
								(key) =>
									moments[key].min <= 0.35 &&
									!moments[key].travels &&
									(moments[key].needs?.() ?? true)
							)
						)
					)
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

				// The hour is its own subject, and at 2am it is the more interesting
				// one — so it joins the pool rather than replacing it.
				const hour = new Date().getHours()
				const timed = copy.hours[timeOfDay(hour)].map((line) => line(hour))
				// Weighted: whatever he is feeling is the more interesting subject,
				// and 'content' has little to say by definition.
				const felt_lines = copy.feelings[feelingNow.current]
				// One copy of the memory lines, not two: how long he has known you is
				// a colour on the conversation, never the subject of it.
				const known = copy.memory.tier[familiarity]
				say(pick([...copy.idle, ...timed, ...known, ...felt_lines, ...felt_lines]), 8_000)
				return
			}

			if (
				quiet > 8_000 &&
				now - wanderAt.current > (WANDER_EVERY * rate.current) / Math.max(0.25, energyAt())
			) {
				wanderAt.current = now
				wander()
				return
			}

			// Everything unprompted slows down as the day does. At 2am the floors
			// are four times what they are at 10am, and half the behaviours are not
			// on the table at all.
			const energy = energyAt()

			dragTimes.current = dragTimes.current.filter((at) => now - at < 120_000)

			const inFront = appNow.current
			const appKey = inFront ? matchApp(inFront.name) : null

			const felt = feelingFrom({
				neglect: quiet / 60_000,
				attention: attention.current,
				dwell: inFront ? (now - inFront.since) / 3_600_000 : 0,
				switches: switches.current.length,
				drags: dragTimes.current.length,
				// New only for the first half minute, or every glance at a fresh app
				// would leave him permanently curious about it.
				newApp: Boolean(
					inFront && !seenApps.current.has(inFront.name) && now - inFront.since < 30_000
				),
				// Half a minute of fright, then he gets over it. A permanent terror
				// of Teams would be a bug rather than a personality.
				// Only the two that hold it. Everything in copy.fears still gets a
				// fright on sight; this is what decides whether it lingers.
				feared: Boolean(appKey && TERRORS.includes(appKey) && now - inFront!.since < 30_000),
				music: nowPlaying !== null,
				appKey,
				energy,
				hour: new Date().getHours(),
			})
			if (felt !== feelingNow.current) setFeeling(felt)

			if (
				now - momentAt.current > (MOMENT_EVERY * rate.current) / Math.max(0.25, energy) &&
				Math.random() < 0.4 + energy * 0.4
			) {
				momentAt.current = now

				// One in nine, so it is a surprise rather than a wardrobe.
				if (!prop && Math.random() < 0.11) {
					wearSomething()
					return
				}

				/**
				 * The feeling narrows the list before energy does. This is what
				 * makes it visible: a bored pet paces and stares, a pleased one hops
				 * and shows off, and you can tell which is which without being told.
				 */
				const BY_FEELING: Record<Feeling, string[] | null> = {
					content: null,
					bored: ['pace', 'stare', 'ceiling', 'scan', 'lean', 'sit', 'hiccup', 'edge', 'peekover', 'inspect', 'groom', 'behind'],
					lonely: ['stare', 'watchyou', 'sit', 'slump', 'ceiling', 'edge', 'settle', 'wave'],
					pleased: ['hop', 'bounce', 'dance', 'jig', 'showoff', 'spin', 'stretch', 'bow', 'skip', 'wave', 'rocket'],
					worried: ['watchyou', 'stare', 'lean', 'sit', 'scan', 'settle', 'groom'],
					restless: ['pace', 'shake', 'hiccup', 'bounce', 'spin', 'scan', 'startle', 'doubletake', 'trip', 'skip'],
					rattled: ['shake', 'stare', 'sit', 'blinkfast', 'lean', 'settle', 'startle'],
					smug: ['showoff', 'spin', 'stretch', 'dance', 'watchyou', 'bow', 'admire', 'adjust'],
						curious: ['ceiling', 'scan', 'watchyou', 'lean', 'chase', 'peekover', 'inspect', 'doubletake', 'behind'],
					sleepy: ['yawn', 'nod', 'slump', 'sit', 'stare', 'dream', 'settle'],
					festive: ['dance', 'jig', 'bounce', 'hop', 'spin', 'skip', 'bow', 'wave', 'rocket'],
					nostalgic: ['stare', 'ceiling', 'sit', 'scan', 'lean', 'settle', 'inspect'],
					scared: ['flee', 'cower', 'startle', 'shake', 'stare', 'blinkfast'],
				}

				const possible = Object.keys(moments).filter(
					(key) => moments[key].min <= energy && (moments[key].needs?.() ?? true)
				)

				const preferred = BY_FEELING[feelingNow.current]
				const willing = possible.filter((key) => !preferred || preferred.includes(key))

				// A feeling that leaves nothing possible at this energy falls back to
				// everything, rather than to standing still.
				const pool = willing.length > 0 ? willing : possible

				perform(pick(pool))
			}
		}, 3_500)

		return () => clearInterval(id)
		// `opening`, `familiarity` and `onRemember` are fixed for the session — App
		// renders nothing until the memory has been read — so listing them costs no
		// extra runs of this and keeps it honest about what it closes over.
	}, [
		copy,
		say,
		react,
		lookAt,
		wander,
		motion,
		nowPlaying,
		prop,
		moveTo,
		limits,
		peekRestX,
		opening,
		familiarity,
		onRemember,
	])

	/**
	 * The first thing he says on a launch, and the one place the memory is loud.
	 *
	 * A ladder, like `feelingFrom`, and ordered the same way — by which fact is
	 * the most interesting one. Coming back after a week beats a round number of
	 * days, which beats a streak, which beats the generic boot line. Only one of
	 * them is ever said.
	 *
	 * Everything below the first rung is deliberately rare. If he announced the
	 * count every morning it would be a progress bar with a face, and the reason
	 * this is worth having at all is that it is the only thing about him you
	 * cannot see coming.
	 */
	// biome-ignore lint: greets once, in whatever language the OS asked for.
	useEffect(() => {
		const line = () => {
			if (opening.first_day) return pick(copy.memory.hello)
			if (opening.away > 1) return pick(copy.memory.back)(opening.away)
			if (DAY_MILESTONES.includes(opening.days)) return pick(copy.memory.milestone)(opening.days)
			if (STREAK_MILESTONES.includes(opening.streak)) {
				return pick(copy.memory.streak)(opening.streak)
			}
			return pick(copy.boot)
		}

		const timer = window.setTimeout(() => say(line(), 6_000), 1_600)
		return () => clearTimeout(timer)
	}, [])

	useEffect(
		() => () => {
			clearTimeout(moodTimer.current)
			clearTimeout(bubbleTimer.current)
			clearTimeout(aimTimer.current)
			clearTimeout(walkTimer.current)
			clearTimeout(petTimer.current)
			clearTimeout(poseTimer.current)
			clearTimeout(propTimer.current)
		},
		[]
	)

	// ── Being handled ────────────────────────────────────────────────────────

	/**
	 * Stepping out of the corner, mid-call, because you kept clicking him.
	 *
	 * The deliberate exception to losing his voice during a call. That rule is
	 * about him volunteering things over a demo — it was never meant to make him
	 * unresponsive to being poked, and a pet you can click four times with no
	 * acknowledgement reads as broken rather than as discreet. So he comes out,
	 * says one line, waves, and puts himself back. One line: he is introducing
	 * himself to the room, not joining the call.
	 */
	const introduce = useCallback(() => {
		steppingOut.current = true
		setGesture(null)

		// Out where he can be seen, but still his end of the strip. Walking to the
		// middle of the screen during someone's meeting is the whole nightmare.
		const width = rootRef.current?.offsetWidth ?? 92
		const out = peekEdge.current === 'left' ? width * 0.5 : window.innerWidth - width * 1.5

		moveTo(out, 0, WALK_SPEED * 1.5, () => {
			react('happy', 'pop', 3_600)
			setGesture('wave')
			window.setTimeout(() => setGesture(null), 1_400)
			say(pick(copy.peekHello), 4_600, true)

			window.setTimeout(() => {
				steppingOut.current = false
				// Only if the call is still on. If it ended while he was out there,
				// the peek effect has already sent him home and this would undo it.
				if (peekingNow.current) moveTo(peekRestX(), 0, WALK_SPEED * 1.6)
			}, 5_400)
		})
	}, [copy, moveTo, react, say, peekRestX])

	const handleClick = () => {
		if (dragged.current) return
		activityAt.current = Date.now()

		const now = Date.now()
		clicks.current = {
			count: now - clicks.current.at < 900 ? clicks.current.count + 1 : 1,
			at: now,
		}

		if (peekingNow.current) {
			// Whatever he is already doing out there wins.
			if (steppingOut.current || crossingNow.current) return

			// Three, and not one. During a call a single click on him is at least as
			// likely to be you missing the window he is standing in front of, and
			// answering that by walking into shot is the wrong guess to make.
			if (clicks.current.count < 3) {
				react('happy', 'pop', 1_200)
				return
			}

			clicks.current = { count: 0, at: now }
			introduce()
			return
		}

		if (clicks.current.count >= 4) {
			clicks.current = { count: 0, at: now }
			react('dizzy', 'spin', 2_600)
			say(pick(copy.dizzy), 3_400)
			return
		}

		attention.current = Math.min(1, attention.current + 0.35)
		react('happy', 'pop', 2_000)
		say(pick(copy.click), 4_200)
	}

	const handlePointerDown = (event: React.PointerEvent<HTMLButtonElement>) => {
		dragged.current = false
		setPose(null)
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
			dragTimes.current = [...dragTimes.current, Date.now()]
			clearTimeout(petTimer.current)
			aim.current = null
			applyLook()
			react('held', undefined, 0)
			say(pick(copy.drag), 2_600)
			onRemember('drag')
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

	// Music does not keep him up. `data-singing` was derived from the track alone,
	// so leaving something playing and walking away got a pet asleep with his eyes
	// shut, dancing — four animations that the sleep pause could not stop, because
	// they are written at a higher specificity than it is. Visibly wrong, and it
	// cost the whole idle saving.
	const singing = nowPlaying !== null && !hidden && mood !== 'sleep'

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
			data-singing={singing ? 'true' : undefined}
			data-gesture={gesture ?? undefined}
			data-pose={pose ?? undefined}
			data-feeling={feeling}
			data-flying={flying ? 'true' : undefined}
			data-hidden={hidden ? 'true' : undefined}
			style={{
				transform: `translate(${pos.x}px, ${-pos.lift}px)`,
				transitionDuration: motion ? `${motion.ms}ms` : '0ms',
			}}
		>
			{bubble && (
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
						glyph={null}
						singing={singing}
						prop={prop}
						propLeaving={propLeaving}
						faceColor={PALETTE[feeling].face}
						screenColor={PALETTE[feeling].screen}
						ledColor={mood === 'sleep' ? '#3b4256' : PALETTE[feeling].led}
					/>
				</span>
			</button>
		</div>
	)
}
