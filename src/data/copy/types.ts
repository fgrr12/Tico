/**
 * The shape every line in the app has to fit.
 *
 * Split out of `companion.ts` when the copy passed a thousand lines and started
 * burying the logic sitting next to it. Nothing here is behaviour — it is the
 * contract between the two language files and everything that reads them, and
 * it is what lets `pnpm check` assert that both carry exactly the same keys.
 */

/*
 * Type-only, and therefore erased before anything runs — so the cycle back to
 * `companion.ts` costs nothing at runtime and cannot deadlock an import. The
 * alternative was a third file holding three aliases, which separates each of
 * these from the single function that produces it for no gain.
 */
import type { Familiarity, Feeling, TimeOfDay } from '../companion.ts'

export interface AppLines {
	/** Works at any hour. Every app needs these; the rest are extra. */
	any: string[]
	dawn?: string[]
	day?: string[]
	evening?: string[]
	night?: string[]
}

/**
 * Everything he says. Keyed by language, like the portfolio he came from — he is
 * bilingual because porting the file kept it, not because anyone paid for it.
 *
 * Everything he says is here, and everything here was written by a person. Six
 * attempts at having a model write his voice are recorded in PLAN.md; all six
 * failed, and the last of them failed with eight worked examples in the prompt.
 *
 * He does not talk about Fabricio's work. That belongs to the portfolio, where
 * the audience is somebody who has not seen it — here the audience already knows,
 * and a pet reciting your own CV at you is a strange thing to live with. What he
 * talks about is the moment: the app, the hour, the song, and himself.
 */

export interface CompanionCopy {
	/** Once, a beat after he appears. */
	boot: string[]
	/** Unprompted, while nothing is happening. */
	idle: string[]
	click: string[]
	pet: string[]
	dizzy: string[]
	drag: string[]
	wake: string[]
	/** After the cursor has been gone a while. */
	back: string[]
	/** Keyed by the id `matchApp` resolves a window's owner to, then by the hour. */
	apps: Record<string, AppLines>
	/** About the hour itself, whatever is open. Folded into the idle chatter. */
	hours: Record<TimeOfDay, ((hour: number) => string)[]>
	/** For an app he has no opinion about. He still knows its name. */
	unknownApp: ((app: string) => string)[]
	/** Said once when you have been in the same app for a long time. */
	dwell: ((app: string, minutes: number) => string)[]
	/** Said when you have been bouncing between apps. */
	switching: string[]
	/** Said once when a new track starts, and not every time. */
	track: ((artist: string, song: string) => string)[]
	/** Keyed by prop. Putting something on is an event, so it gets a line. */
	props: Record<string, string[]>
	/**
	 * Keyed by prop, and said while straightening it rather than while putting it
	 * on. A second, later opinion about the same object: the novelty has worn off
	 * and what is left is the experience of wearing the thing. Most of them are
	 * complaints about a body he does not have, which is the joke — he is a
	 * rectangle reporting that his ears hurt.
	 */
	propFuss: Record<string, string[]>
	/** Taking it off again, which is less of an event and says so. */
	propOff: string[]
	/**
	 * The one thing he says during a call, and only if you click him three times
	 * to ask for it. He is introducing himself to whoever can see your screen and
	 * then getting out of the way, so every one of these has to survive being read
	 * aloud by a stranger in a meeting — short, and about him, never about you.
	 */
	peekHello: string[]
	/**
	 * Back from behind the screen with nothing to show for it. The trip itself is
	 * the answer to `idle`'s "I wonder what is past the edge" — these are for the
	 * times he comes back empty, which is most of them.
	 */
	behind: string[]
	/** From the top of a ladder, looking at the desktop from an unusual height. */
	climb: string[]
	/** The moment the ladder goes, before he does. */
	ladderSlips: string[]
	/**
	 * Hanging off the top edge of one of your windows. He never says *which*
	 * window — he can see that a rectangle is there and nothing else about it,
	 * and the lines have to stay true to that.
	 */
	grab: string[]
	/** After a drop long enough to have been on fire for part of it. */
	hardLanding: string[]
	/** Said while in a feeling, folded into the idle chatter. */
	feelings: Record<Feeling, string[]>
	/** What frightens him about a particular application, said on sight. */
	fears: Record<string, string[]>
	/** Before he takes off, and after he lands. */
	rocketUp: string[]
	rocketDown: string[]
	/** He can see which file you have open. Occasionally he mentions it. */
	file: ((name: string) => string)[]
	/** Keyed by extension, for the ones worth a specific remark. */
	fileByExt: Record<string, ((name: string) => string)[]>
	/** The button on a reminder bubble. One click beats parsing "ya lo pagué". */
	reminderDone: string
	label: string
	/**
	 * The only lines that depend on anything older than this session.
	 *
	 * All of it is about *him and you* — how long he has been around, whether you
	 * came back, what he likes wearing. None of it is about your work, and there
	 * is nothing here for a line about which application you use, because that is
	 * the line between a pet and a tracker wearing a costume.
	 */
	memory: {
		/** The first time he is ever run, and only then. */
		hello: string[]
		/** Coming back after a real absence, in days. */
		back: ((days: number) => string)[]
		/** A round number of days known. */
		milestone: ((days: number) => string)[]
		/** A run of consecutive days. */
		streak: ((days: number) => string)[]
		/** Folded into the idle chatter, coloured by how long he has known you. */
		tier: Record<Familiarity, string[]>
		/** When he reaches for the thing he has worn most. */
		favourite: string[]
	}
}
