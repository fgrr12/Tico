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
completely or not bother. What is animated matters as much as whether: a `transform` on an HTML element
(`.companion-body`) is composited and costs ~4–5% awake, but anything animated
*inside* the SVG — the LED's opacity, the singing hands, feet, mouth and notes —
repaints the whole drawing per frame. Measured on a 120Hz panel: silent with a
smooth LED pulse 16%, LED stepped 8%, LED still 5%, singing ~19%. Step or avoid
animations on SVG children. Also why a rule that overrides the body's animation
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

## Native builds (in progress)

The Tauri app is being replaced platform by platform with native shells over a
shared Rust core, Flint's layout: `core/` (`tico-core`, all logic, no UI, no OS
calls, UniFFI proc-macros), `ffi/` (links it, no logic), `apps/macos/` (Swift,
AppKit, Core Animation). The reason is measured: the WebView costs ~240 MB and
8–19% of a core awake, where a native shell's layers are composited for free.
`src-tauri` stays out of the Cargo workspace and keeps shipping until each
native shell replaces it.

```bash
make            # core + xcodegen + Debug build, installed to ~/Applications and launched
make test       # cargo test --workspace + XCTest
make art        # or `pnpm art`: re-export art/tico.json
```

Prerequisites: Rust, Xcode, `brew install xcodegen`. Generated and gitignored:
`target/`, `apps/macos/build/`, `Tico.xcodeproj`, `Tico/Bridge/`,
`Signing.xcconfig`. The native app is `com.fgrr6.tico.native` until it replaces
the Tauri one, so both can run side by side.

**The art is data, exported, never redrawn.** `scripts/export-art.mjs` walks what
`parts.tsx` and `CompanionFace.tsx` return and writes `art/tico.json`: shared
`defs`, every slot variant, every prop, and per mood the whole drawing in layer
order with the body slots left open. Each run rebuilds every mood on every shell
from the JSON and compares it with React's own render, and refuses to write on
any difference. **Run `pnpm art` in the same edit that changes a drawing**, and
commit the JSON: the native shells bundle it and never run Node.

**Drawing on macOS** is `Tico/Drawing/`: `Painter` turns art nodes into Core
Animation layers, one per element and named after its `class`, so a hand or the
LED can be animated by the render server without repainting anything — the
whole point of going native. `SVGPath` parses path data (M L H V C Q A Z;
`DrawingTests` fails if the art ever uses another command). Static transforms
and the y-flip are baked into the paths; layer transforms are left free for
animation. Verify a drawing by looking at it: `TICO_SHEET=1
~/Applications/tico.app/Contents/MacOS/tico` opens the native sheet (every
mood, body part and prop) next to the pet — compare it with `scripts/sheet.html`.
It is a window rather than a PNG because `CALayer.render(in:)` skips masks.
Measured standing still (Debug): 13 MB, 0% CPU.

**Animations are Core Animation, capped at a frame rate** (`Pet/Motion.swift`):
the bob, the LED pulse and the blink run in the render server, so tico itself
spends 0%. The cost moves to WindowServer, and it is set by frame rate, not by
how much moves: uncapped, any animation drives the ProMotion panel at 120Hz and
cost WindowServer +20% of a core — exactly what the WebView build paid. At
15fps (`Motion.idleRate`) it measured the same as no tico; 30fps was +5–10%.
Every new animation sets `preferredFrameRateRange`, as low as it still looks
smooth. Measure WindowServer with `top -pid`, alternating with and without tico,
because your own use of the Mac is the noise.

**The core so far** (`core/src/`): `data.rs` is the pure half of
`src/data/companion.ts` — time of day, energy, the feeling ladder, the palette,
`matchApp`, `documentIn`, `danceStyle` (its FNV hash walks UTF-16 units so it
matches JavaScript, emoji included), familiarity and `wornFrom` — with
`scripts/check.mjs`'s cases as Rust tests. **Change one, change both** until the
Tauri build retires. `brain.rs` is the poll: the shell calls `Brain::tick` every
3.5s with `Senses` (cursor idle time, hour, front app name, music) and draws the
`Frame` it returns (mood, feeling, colours); the core keeps the afternoon's
memory (apps seen, switches). So far it sleeps after 90s still, wakes happy,
feels, and has moments (`moments.rs`: the table, `BY_FEELING`, energy floors,
`then` chains, losing interest, dances by `danceStyle`). The moments that cover
ground are in too (`Travel` in `moments.rs`: pace, chase, edge, behind,
errand, rocket, flee, skip), plus the poll's wander; `house` and `climb` wait
for the burrow. Handling is in the core too: the shell
reports `press`/`drag`/`release` and the cursor as a sense (`cursor_x/y`), and
the core decides — a click pleases him, four make him dizzy, a drag picks him
up (`held`), a drop in mid-air falls and lands, 1.6s hovering on him is petting
(declined, sometimes, when prickly), and a cursor within 220pt is watched with
his eyes. Attention and recent drags feed the feeling ladder.

**He talks from the same copy files.** `export-art.mjs` also writes
`art/copy.json` from `src/data/copy/{en,es}.ts`. Strings go as they are; a
function cannot be JSON, so it is *run*: hour lines for all 24 hours
(`{"hours": […]}` — `spoken(hour)` has real logic), anything else twice with
two sentinels per parameter (`{"t": "{1} minutes in {0}"}`), and the export
throws if the two runs disagree, i.e. if a line branches on its argument.
`core/src/copy.rs` picks and fills lines; the brain decides when — the boot
line, clicks, petting (or the feeling's own line when prickly), pick-ups,
dizziness, waking or "you're back", dwell, chatter every 50s (idle + the
hour's + twice the feeling's), app remarks (switching, fears, the app's lines
by time of day, unknown apps), the rocket and coming back from behind — with
`can_speak` and the bubble's own time as the Tauri build has them. Idle time
counts from launch at most, as Tauri's `activityAt` does. The shell's
`Pet/Bubble.swift` draws `.companion-bubble` and types the line in at the
feeling's `reveal_ms`. Language follows macOS (Spanish or English).

Props: one moment in nine he puts something on (headphones, often, while
music plays), says something about it 1.2s later most of the time, and takes it
off 25–95s on (`propOff` sometimes); `adjust` and `admire` are only offered
while he wears something; coming back from behind brings a souvenir 40% of the
time. The core sends `worn` back to front (`wornFrom`); the shell wraps each in
a `companion-worn` layer and plays `companion-wear`/`companion-unwear` from the
CSS. A new song gets a `track` line 40% of the time.

**Settings and memory** (`core/src/store.rs`) are the Tauri build's `tico.json`
and `memory.json`, same fields: the body (`parts`, drawn by the shell from
`Frame.parts`), pinned props, chattiness (stretches every unprompted floor),
language ("auto" follows macOS), `quiet_until`, and where he stood (`x`, saved
after each walk). Memory counts days and streaks (`count_day` on launch and when
the date in `Senses.today` turns over), pets, pick-ups and props worn, picks the
favourite (4+ wearings), and the boot line ladders like Tauri's: first day,
back after days, day milestones, streaks, else `boot`; chatter mixes in
`memory.tier` by familiarity. The native app keeps its files in its own folder
(Application Support/<bundle id>) and seeds them once from the Tauri build's,
never writing there, so both can run at once; on taking the Tauri id it simply
uses the original folder.

The menu is the Tauri tray, item for item (Show, Hide, Quiet ▸, Preferences…,
Quit). `Prefs/PrefsWindow.swift` is `Prefs.tsx` and `prefs.css`, drawn the same:
the pane, the mono type, pill tabs, rows of name + hint beside chips, purple
checkboxes; the "Tico" tab with him on a radial glow, a handle on each of the
six places, the part/worn pills, and the options fanned round the ring as
close-ups (`CROPS`, `PetPreview` with a crop) — green when chosen, dashed amber
for "nothing". `TICO_PREFS=body:neck[:part]` opens it on a tab and place.
Size, the burrow and window titles are left out until the native build does
them; offering a switch that does nothing would be worse.

Calls: `Pet/Microphone.swift` is `call.rs` (the default input device running
somewhere — a property of the device, no permission), read once a second into
`Senses.in_call`. Peek (the default) walks him to the right edge half showing,
mutes him, and runs `peek_poll` — calm gestures only, never a travelling moment,
a wave every 14s, round the back to the other edge now and then — and walks
him home when the call ends; hide sets `Frame.hidden`; ignore carries on.
Typing (`keyDown` in the last 1.5s, never which key) or the cursor within 24pt
veils the bubble to 12%, as `[data-veiled]` does.

Reminders: `reminders.json` (same file, seeded with the Tauri build's IVA
reminder) in `store.rs`, due from `remind_from` (or a week before) to a month
past due; the brain says one, once a day, in a gap (`can_speak`), and the
bubble shows `.companion-done` under it — the one bubble the strip takes clicks
on; `Brain::complete_reminder` moves a monthly one on a month. The shell's
clock is uptime, never zero: anything the Tauri build starts at `Date.now()`
(talk, moments, strolls, the first reminder check) is set on the first tick,
or all of it would be due at once — `a_clock_that_does_not_start_at_zero…`
guards it. `TICO_DATA=<folder>` runs on another data folder;
`TICO_LOG=1` prints every change of mood, effect and speech.

Size follows `tico.json` (66/92/124pt, `--pet-width`): the core uses it for
edges and the hit box and sends `Frame.width`; the shell re-lays him and the
strip's floor. Window titles (`Pet/WindowTitle.swift`, `window_title.rs`) are
read once a second only with "Read window titles" on and Accessibility granted
— turning it on without the grant opens that settings pane instead of ticking
a box that does nothing; the core drops anything on the `SENSITIVE` blocklist
or over 200 characters (`readable`), and a file it finds (`document_in`) gets a
`fileByExt`/`file` line at most every 7 minutes; a new title re-arms the app
remark, as the Tauri effect re-ran on `activeApp`.

Climbing: `Travel::Climb` stands a ladder (`Frame.ladder`, 240–620pt), climbs
it, looks, and 40% of the time it slips; every fall — off a ladder or dropped
in mid-air — goes through `fall`, which picks the first window ledge under him
before it starts (`Senses.ledges`, from `Pet/Ledges.swift`: window *bounds*,
no permission, `ledges.rs`'s filter, refreshed once a second), hangs there
(`Frame.hanging`, swinging from 50% 12%) and drops again. `TICO_DO=<moment>`
performs a moment 2s after launch (`Brain::perform`), for looking at one. Not
drawn yet: the fall's heat trail and glow (CSS pseudo-elements with a blur). Its words are
`src/prefs/copy.ts`, exported under `prefs` in `art/copy.json`. Changes go
through `Brain::update_settings`, which saves `tico.json`. The shell ticks
every 250ms — timers are checked every call, decisions on the core's own 3.5s
poll — and skips the panel entirely when the `Frame` did not change.

**Motion is data too.** `export-art.mjs` also writes `motion` from
companion.css: every `@keyframes`, which effect plays which, each feeling's
posture and breathing pace, sitting, the singing rules and the mood limb poses —
and it throws if `Companion.tsx` plays an effect the CSS does not define.
`Pet/CSSMotion.swift` is the only place CSS becomes Core Animation (y and
rotation flip sign there), and it *samples* each animation at 60/s with CSS's
own per-function interpolation and per-interval easing: Core Animation blends
matrices, and a matrix blend from `rotate(0)` to `rotate(360deg)` does not move.
`TICO_DEMO=1` plays every effect, posture, sitting and singing in turn and
prints when each starts, for timing screenshots.

**He walks a strip, like the Tauri build**: the panel is a transparent window
the width of the screen, and the core's `Frame.x`/`lift`/`move_ms` are eased
into the `body` layer's position by the render server (`.companion`'s travel
curve), so walking costs tico nothing — moving a pet-sized window instead
would be AppKit setting a frame every frame from this process. The strip runs
from 90pt below his floor (for `spin`) up to the menu bar, so he can be
carried anywhere; it is click-through except over him, re-checked every tick
and held for the length of a press (`hitTest(cursor:)`, `cursor.rs` in Tauri).
`TICO_SELFTEST=1` drives a click, a pick-up and a drop through the same path
the mouse takes and prints when each happens, for screenshots. Walking steps the
feet and takes them over from singing; flying leans into `facing_right`,
thrusts and recolours the feet as flames, and landing redraws.
Measured with moments and walking (Debug): 26 MB, 0.2–0.3% CPU.

`Pet/MusicSense.swift` is `music.rs` in-process: one compiled `NSAppleScript`
per player, only for players already open, every 4s while playing and 15s
otherwise. It needs the Apple Events grant, under the native app's own id.
