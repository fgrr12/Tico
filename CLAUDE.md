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

**Copy is data, keyed by language.** Every line lives in the copy file with an `en`
and an `es` entry. This is inherited from the portfolio and is free to keep — do
not scatter strings through components, and do not drop Spanish.

**Anything platform-specific is behind `#[cfg(target_os = ...)]` with a fallback
that does nothing.** Lyra's `screen_sample.rs` is the pattern: a real Windows
implementation and a stub elsewhere that returns a neutral value, so the app
builds and runs everywhere from day one.

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
