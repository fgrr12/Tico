# CLAUDE.md

Guidance for Claude Code working in this repository.

Read [PLAN.md](PLAN.md) first. The architecture decisions in it are locked, and
each one records the alternatives that were rejected and why — reversing one is a
conversation, not a refactor.

## Where the code comes from

Two sibling repositories are the source of most of this, and copying from them
beats writing it again:

- **`../Lyrics-app` (Lyra)** — the shell. A shipped Tauri v2 transparent,
  always-on-top overlay with tray, autostart, global shortcut, multi-monitor
  position validation and `window_state` persistence. `src-tauri/src/lib.rs` and
  `window_state.rs` are the files to lift. Its comment about `tao` overriding
  `LSUIElement` in the plist is load-bearing knowledge, not decoration — keep it.
- **`../my-portfolio`** — the character. `src/components/companion/` and
  `src/data/companion.ts`. The face is portable as-is; the state machine changes
  only where it converts pane coordinates to screen coordinates.

## Rules that must hold

**The pet's liveliness is a state machine, and the model is not in it.** Moods,
moments, walking, blinking and sleeping are deterministic and run without a model
loaded. The model produces a line and an intent from a closed list; it is never
asked what the body should do, and nothing waits on it. A pet that freezes while a
token streams is worse than a pet that says less.

**Everything unprompted runs on one poll.** Dozing off, chatter, strolls and idle
behaviours share a single interval, each behind its own floor constant, so they
never land at once. New idle behaviour goes in the `moments` array — not in a new
timer.

**Travel is a CSS transition, not an animation loop.** `moveTo` sets a target and
derives the duration from the distance; dragging sets that duration to `0ms` so the
same property follows the pointer. There is no `requestAnimationFrame` in the pet,
and adding one means AD-1 was misread.

**An animation anywhere costs a frame everywhere.** He is a 1280x320 transparent
overlay, and one running animation keeps the compositor redrawing the whole
surface at 60fps — so cost is per frame, not per element, and halving the number
of animated things buys exactly nothing. Measured: 3.1% of a core awake, 0.6%
with everything stopped, and leaving *two* `z` text nodes running while he slept
cost the full 3.1%. Anything that runs while nobody is looking has to stop
completely or not bother. Also why a rule that overrides the body's animation
uses `animation-name` and `animation-duration`: the `animation` shorthand resets
`animation-play-state` and quietly wakes him up.

**He remembers his history with you, never a record of your activity.** That is
the line, and `memory.json` is built to stay on the right side of it: days known,
streak, times he has been picked up, which hat he has worn most. No app names, no
window titles, no track names, no timestamp finer than a date. The rule it comes
from is still in `Companion.tsx` — *a pet that remembers last Tuesday's app usage
is a tracker wearing a costume* — and everything about your work still dies with
the process. Familiarity is the one axis that only moves one way; everything else
about him is a distribution, and a distribution is varied, not alive.

**Copy is data, keyed by language.** Every line lives in the copy file with an `en`
and an `es` entry. This is inherited from the portfolio and is free to keep — do
not scatter strings through components, and do not drop Spanish.

**Anything platform-specific is behind `#[cfg(target_os = ...)]` with a fallback
that does nothing.** Lyra's `screen_sample.rs` is the pattern: a real Windows
implementation and a stub elsewhere that returns a neutral value, so the app
builds and runs everywhere from day one.

**Anything drawn is verified by rendering it, not by reading it.** `pnpm dev` and
open `/scripts/sheet.html`: every mood, every prop, on a dark backdrop, at the
sizes he is actually shown at. Add `?shell=capsule&feet=wheels` to draw every row
on a different body — which is the pass a new body part has to survive, since the
way one fails is never that it looks bad alone, it is that the thirty props stop
landing on it. The preferences window has the same problem and the same answer:
`/scripts/prefs.html` renders it with the IPC faked, because the alternative is
building the Rust side and clicking through a tray menu, and a layout that slow to
look at is a layout nobody fixes. `/scripts/burrow.html` is the third of these and
was added the day he stopped being a grey rectangle down there: the cutaway is a
200×132 stage and he is a 96×96 drawing positioned over it in percentages, and no
assertion has an opinion about whether that lands him on the floor. It did not —
he hovered, because the bottom nine units of his box are empty below his feet, and
he was half again too big for the room. Both were obvious on sight and invisible
to `pnpm check`, `tsc` and a careful read. Three rounds of defects had already survived types,
lint and `pnpm check` and were obvious within a second of looking — a top hat
filled with the colour of the desktop behind it, a headphone band drawn inside the
head, a crown that came out black because `--amber` was undefined and SVG falls
back to black without complaining. Add the new prop or mood to the sheet in the
same edit that adds it to the component.

**Permissions are asked for late and never speculatively.** The active
application's *name* needs no permission on any platform; window *titles* need
Screen Recording on macOS. v1 reads names only. Do not add an API that triggers a
permission prompt without it being in the plan.

## Conventions

- Match the sibling repos: tabs, single quotes, no semicolons on the TypeScript
  side; Biome for lint and format.
- Comments explain *why*, especially where a simpler-looking approach was tried
  and failed. Both sibling repos are written this way and it is why they are still
  editable.
- `pnpm t:d` / `pnpm t:b` for Tauri dev and build, matching Lyra's scripts.
