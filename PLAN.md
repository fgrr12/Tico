# tico — v1 plan

## What v1 is

**He walks along the bottom of your screen, notices which app you are in, and
answers when you press the hotkey.** That is the whole product. Everything below
either serves those three sentences or is explicitly cut.

The bar for shipping: **M1 must be a finished thing on its own, with no AI in it
at all.** If the model work never happens, a good desktop pet still shipped. Every
milestone after that adds, none of them is load-bearing for the one before.

## Architecture decisions

These are locked before any code, because each one is expensive to reverse.

### AD-1 — He lives in a strip, not a fullscreen overlay

One always-on-top, transparent, click-through window, **full screen width by
~320px tall, pinned to the bottom of the primary monitor**. The pet is a `div`
inside it.

The obvious alternatives and why not:

- _A small window that is the pet, moved by the OS._ Position moves at 60Hz are
  janky on some compositors, transparent window shadows fight you, and every bit
  of motion has to be re-written in Rust.
- _A fullscreen transparent overlay._ Works, but it is a screen-sized compositing
  layer alive all day — a real battery cost on a 4K display — and on macOS a
  fullscreen always-on-top window has to be fought into the right window level so
  it does not sit over the menu bar.

The strip gets the best of both: the entire animation system from the portfolio
(CSS keyframes, transition-driven walking, speech bubbles) applies unchanged,
while the composited area stays small and nothing overlaps the menu bar. When he
learns to climb windows (post-v1), the strip grows into the full screen and only
the window geometry changes.

**Consequence — cursor hit-testing.** A transparent window still swallows clicks,
so the window keeps `set_ignore_cursor_events(true)` at all times, and Rust polls
the global cursor position at ~30Hz (`device_query`, or the platform call
directly) and flips it to `false` only while the pointer is inside the pet's
bounding box. The frontend publishes that box whenever he moves — on walk start
and end, not per frame.

### AD-2 — The model writes lines. It never drives animation.

The liveliness is the state machine already written and tested in the portfolio:
moods, moments, walking, blinking, sleeping. The model is asked for **text and an
intent**, never for what the body should do next frame, and its latency can never
block a frame.

It answers into a constrained JSON schema — the same technique as the farm app's
Whisper pipeline, here as a GBNF grammar / `json_schema` response format in
llama.cpp:

```json
{ "say": "still in VS Code, eh", "mood": "happy", "action": "walk_to_cursor" }
```

`action` is drawn from a closed list the frontend already knows how to execute. An
unparseable answer is dropped and he says nothing — a pet that stays quiet is
better than one that prints JSON at you.

### AD-3 — The model is a sidecar, downloaded on first run

`llama-server` bundled as a Tauri `externalBin`, spoken to over `127.0.0.1`.
Linking GGML into the Rust binary across three platforms is a fight with nothing
at the end of it.

Model resolution order, first hit wins:

1. **Ollama**, if it is already installed and running — power users get whatever
   they already have, and we ship nothing.
2. A model previously downloaded by tico.
3. First-run download, with a size choice and a progress bar.

| Tier    | Model                        | Q4_K_M  | Feel                                    |
| ------- | ---------------------------- | ------- | --------------------------------------- |
| Small   | Qwen3 1.7B                   | ~1.1 GB | ~20 tok/s on CPU. Default.              |
| Normal  | Llama 3.2 3B / Qwen3 4B      | ~2–2.5 GB | 30–60 tok/s with Metal.               |

**The model is never in the installer.** A 2.5 GB download before the app has
proven itself is how a pet gets uninstalled before it is opened. The installer
stays ~15 MB and he introduces himself before asking for disk.

For a pet, latency beats quality: a 20-token quip in one second from a 1.7B is
better than a good sentence in six from a 4B. Small is the default on purpose.

### AD-4 — He is grounded in the portfolio's own data

The system prompt is built from a condensed `projects.ts` + `cv.ts`, exactly the
data the portfolio and the CV generator already read. Two reasons: a 1.7B model
left ungrounded will invent a career, and grounded he becomes something worth
handing to someone — a portfolio that walks around your desktop and answers
questions about the work.

### AD-5 — The character ports over, it is not rewritten

`CompanionFace.tsx` moves across untouched. `Companion.tsx` moves across with one
change: `moveTo`/`clampOffset` retarget from pane coordinates to strip
coordinates. The copy file (`data/companion.ts`) ports as-is, which means **he is
bilingual on day one for free**, so v1 keeps `en`/`es` rather than dropping to
English and paying to add it back.

### AD-6 — Platform matrix, and the Wayland stance

macOS, Windows and Linux/X11 are v1. Wayland has no protocol for a client to
place itself at absolute screen coordinates; the way around it is
`wlr-layer-shell`, which KDE and the wlroots compositors implement and **GNOME
deliberately does not**. GNOME Wayland is therefore out of scope, documented in
the README rather than half-supported, and revisited only if someone asks.

## Milestones

### M0 — Bootstrap · ✅ done

Verified on a 14" MacBook Pro: `3024×640 physical · 2x · 320 logical tall`, full
screen width, clicks passing through, tray quitting cleanly, no Dock icon.

`window_state.rs` was **not** lifted, against the bullet below: the strip is
derived from the monitor rather than remembered, and it is the pet's position
inside it that will need persisting. It moves to M1, where there is something to
persist.


- `pnpm create tauri-app` → React + TS + Vite, matching Lyra's layout.
- Lift from Lyra, near-verbatim: `window_state.rs`, the tray builder, the
  autostart plugin, the global-shortcut plugin, and `ActivationPolicy::Accessory`
  with the comment about tao overriding `LSUIElement` — that gotcha cost time once
  already and the comment is why it will not cost it again.
- The strip window: transparent, undecorated, always-on-top, `skipTaskbar`,
  positioned along the bottom of the primary monitor, `ignore_cursor_events(true)`.
- **Done when:** an empty transparent strip is on screen, invisible to the mouse,
  and the tray can quit it.

### M1 — The pet lives · ~2–3 days · _shippable_

- Port the face, the moods, the moments, the walking, the speech bubble.
- Walking retargeted to real screen coordinates within the strip.
- Cursor hit-testing (AD-1) so he is clickable and draggable but the desktop is
  not blocked.
- Tray menu: show/hide, settings, quit. Settings: autostart, size, chattiness.
- Position persisted across restarts via Lyra's `window_state` pattern.
- **Done when:** it can be handed to someone with no explanation and no AI.

### M2 — Situational awareness · ⚠️ done on macOS only

Verified: `[tico] active app: Finder`, from `NSWorkspace.frontmostApplication`, on
the main thread, with no permission prompt.

**Windows and Linux are stubbed, not written.** Both are straightforward FFI that
needs no permission — `GetForegroundWindow` → `QueryFullProcessImageNameW`, and
`_NET_ACTIVE_WINDOW` → `/proc/<pid>/comm` — but neither can be compiled on this
machine, and FFI that has never been through a compiler is worse than an empty
function because it looks finished. `frontmost()` returns `None` there, which
costs the pet his opinions and nothing else.

Also cut: the JSON/SQLite memory this milestone budgeted for. Everything he needs
to remember — which app, since when, what he has already said about it — is
session-scoped, and the session is the right lifetime for it. Persisting a
per-app time log would be the first half of a tracker nobody asked for.


- Active application polling, ~2Hz, per platform:
  - macOS `NSWorkspace.frontmostApplication` — **no permission needed for the app
    name.** Window _titles_ need Screen Recording; do not read titles in v1.
  - Windows `GetForegroundWindow` + process name — no permission.
  - X11 `_NET_ACTIVE_WINDOW` — no permission.
- Reactions keyed by app, in the copy file like everything else.
- A small JSON/SQLite memory: what he has already said, how long you have been in
  one app, when he last spoke.
- **Done when:** he notices you have been in the same editor for two hours and
  says something about it, with no model running.

### M3 — The brain · ⚠️ loop built, unproven against a real model

Everything is wired: hotkey → input → grounded prompt → constrained JSON → he
says it in his own voice, with the mood the model picked. What has never run is
the middle: there is no model on this machine, so the only path exercised end to
end is the honest `no-brain` one.

**AD-3 changed, and this is the deviation to argue with.** The provider is
Ollama, and the bundled `llama-server` sidecar is not built. Ollama handles
Metal, CUDA and model management, updates itself, and most developers already
have it — against shipping platform binaries, a download manager and three
acceleration variants. The cost is real: the app is no longer self-contained,
which was part of the original ask. The seam is one base URL and one request
shape, so the sidecar is a later swap rather than a rewrite. Decide before M4,
because it changes what the installer has to do.


- Sidecar plumbing, health check, graceful "no model" state.
- Ollama detection; first-run download with progress and a size choice.
- Constrained JSON output (AD-2) and the grounded system prompt (AD-4).
- Global hotkey → input bubble → he answers where he stands.
- **Done when:** the hotkey works offline on a plane.

### Before M4 — being liveable · ✅ done

Not a milestone in the original plan, and it should have been. Everything up to
M3 gave him more reasons to speak; nothing gave him a reason to stop.

- **Quiet** in the tray: 30 minutes, an hour, or until told otherwise. Suppresses
  what he says unprompted and nothing else — ask him a direct question and he
  still answers, because you started it.
- **In a call**: detected by the microphone being live, not by trying to detect
  screen sharing. Screen-share detection on macOS is a guess about window titles;
  a hot mic is a documented CoreAudio property, needs no permission, and works
  for Zoom, Meet, Teams, Discord and FaceTime alike. It also answers the better
  question — he should not be talking during a call whether or not you are
  sharing.
- While in a call he **peeks** from the right edge, half off-screen, keeps his
  gestures and waves now and then, and says nothing. `hide` and `ignore` are the
  other two settings. The default is peek, because hiding is right for a client
  demo and sad for a standup, and the app cannot tell which meeting you are in.

The design rule underneath: **the speech bubble is the unprofessional part, not
the pet.** A small creature moving at the edge of a shared screen is peripheral;
words oblige everyone on the call to read them.

### M4 — Packaging · ⚠️ built and installable, not signed

`pnpm t:b` produces a 13 MB `.app` and a 4.2 MB `.dmg`. It is installed in
`/Applications`, launches, and behaves like the dev build. What it is not is
signed by anybody: the linker's `adhoc` signature is enough to run here and
Gatekeeper refuses it everywhere else. **That wall is $99/year and an Apple
Developer account, and it is yours to walk through** — see `RELEASING.md`, which
has the exact variables, the verification commands, and the Windows and Linux
situations.

Done in this pass:

- His own icon, drawn from the same geometry as `CompanionFace.tsx`, minus
  everything that vanishes below 64px.
- A separate **monochrome template** icon for the menu bar, so it inverts on a
  light menu bar instead of sitting there as a dark smudge.
- **Single instance.** Found by accident: two copies were running at once, and
  since he is an accessory app with no Dock tile, nothing on screen tells you the
  first one was already there. Two pets, two tray icons.
- Bundle metadata: category, copyright, descriptions.

The milestone's "an uninstall that takes the downloaded model with it" is moot
now that AD-3 went to Ollama — the model belongs to Ollama, and deleting another
application's data on our way out would be rude.


- Apple notarization, Windows signing — the boring part that decides whether
  anyone ever runs it. Budget the certificate before starting, not after.
- Installers for the three platforms, icon set, first-run flow, an uninstall that
  takes the downloaded model with it.

Roughly two to three weekends of real work, front-loaded on M1 because that is the
part that has to be good.

## After M4 — he can act, and he can read the window title

Two additions, driven by what the pet was actually wanted for: less reciting the
portfolio, more noticing and doing.

**Actions.** The ask hotkey executes as well as answers: open a file, reveal it
in Finder, open a site. The division is the point — *the model extracts intent,
Spotlight finds the file, the app opens it.* The model never sees a path and
never produces one, only search terms, so a hallucinated filename finds nothing
where a hallucinated path would be opened on trust.

**Window titles**, behind an Accessibility grant that is off by default.
Deliberately **not** Screen Recording, which returns the same string and makes
macOS 15 post recurring "tico has been recording your screen" reminders — poison
for a pet, and a lie, since nothing here reads a pixel.

Two rules hold around titles, and they are not optional:

1. **Sensitive-looking titles are never read.** A blocklist in `window_title.rs`,
   porous by construction and a floor rather than a guarantee. It exists because
   the first real title this feature ever returned, on the author's own screen,
   was an open `.env-prod`.
2. **No title is ever spoken.** It is prompt context so that "what is this file"
   is answerable, and it never reaches a speech bubble — which matters most
   during a screen share, where a bubble is read by everybody in the call.

This is the piece to revisit first if a cloud model is ever allowed: today
titles never leave 127.0.0.1, and that is a property of the current setup rather
than of the design.

## Talking to his own apps

**Music.** Spotify and Music are asked directly over AppleScript, the way Lyra
does it. The first attempt read Spotify's *window title* instead, on the theory
that it holds the track while playing and would therefore need no new
permission — it does not, and with a track loaded and paused the title is
"Spotify Premium". AppleScript is the better tool anyway: it returns the track
instead of a string to be parsed back into one, it knows whether the player is
actually playing, and "tico wants to control Spotify" is a narrower thing to ask
than "tico wants to control your computer". Singing is layered over whatever he
is already doing — he keeps walking and blinking, because stopping for a song
would make the music an interruption.

**Reminders are a drop box, not an integration.** My-Finances keeps its data in
Supabase, so the obvious version — tico reading it — means credentials, network,
and coupling two apps that have no reason to know about each other. Instead:
`reminders.json`, beside his own settings, which anything at all can write.
My-Finances can start writing to it whenever it likes; until then the seeded
monthly IVA entry already covers the case that prompted this.

A reminder waits for a gap rather than taking one — it fires from the same idle
poll as everything else, so quiet, in-call and "he is already talking" all apply
without a second set of rules. Once a day per reminder, and it is dismissed with
a **button** rather than by saying "ya lo pagué": one click cannot be
misclassified, and the classifier has already opened one padlock.

Marking a monthly reminder done rolls it to next month rather than retiring it.
Paying August's IVA does not mean September's is handled.

## The AI is gone

Removed entirely: `brain.rs`, `actions.rs`, `persona.ts`, the ask hotkey,
reqwest, the global-shortcut plugin. tico is a self-contained 10 MB app with no
runtime dependency on anything.

The reasoning, in the order it actually arrived:

1. The model was wanted **for life and autonomy**, not for utility. That was said
   last, and it is the only thing that mattered.
2. Six experiments say it cannot write his voice in Spanish — which is exactly
   what "more life" would have required.
3. The two things it *could* do well were then both declined: file finding is
   already Raycast and Spotlight's job on both platforms, and being told about
   your own projects by a pet on your own screen is a strange thing to live with.

So the model had no job left. Not narrowly — entirely.

**Life was never coming from the model.** It came from the state machine: the
walking, the yawning, the sleeping, the singing, the peeking during calls. That
was true from M1 and stayed true through every experiment. The mistake was
looking for it in the language layer, where it was never going to be.

The complexity went into behaviour instead — see below.

## Behaviour is where the life is

**Energy**, 0 to 1, by the clock, with the real shape of a day including the dip
after lunch. It scales three things at once: how often anything unprompted
happens, how fast he walks, and *which behaviours he will even consider*.

That last one is what matters. Each behaviour carries a minimum energy, so
dancing needs most of a day behind it and simply never happens at 2am, while
sitting down is what is left when nothing else qualifies. 9am tico and 1am tico
are different creatures rather than the same one on a longer timer.

**Poses**, which are held rather than one-shot. Sitting is the point of having
them: a pet that only ever twitches is never resting, and resting is most of
what anything alive does.

Nine behaviours now, against five: yawn, sit, stretch, look around, shake off,
glance up, hop, dance, and going a few steps after the cursor before giving up —
which is more of a personality than arriving would have been.

## Which model, measured rather than assumed

Four families compared on the two jobs tico actually gives a model, plus the one
it keeps being asked for:

| | intent | latency | answers |
| --- | --- | --- | --- |
| **qwen2.5:3b** | 9/10 | **0.66s** | dry and accurate |
| mistral:7b | 10/10 | 1.50s | one outright failure, wrong tense |
| llama3.2:3b | 9/10 | 1.43s | too terse to be useful |
| gemma3:4b | 8/10 | 1.19s | "¡es genial!" — wrong register entirely |

**qwen2.5:3b stays**, and `smallest_model()` picking it was right for a third
reason now. Mistral wins the tenth intent case at 2.3× the latency, and that
tenth is already caught by `is_searchable` — opening a file feeling instant is
worth more than a case the guard handles anyway.

The Spanish voice failed in **all four families**, which retires the last theory
about it being a qwen problem:

- gemma3 — `"Vos hablás, vos tenés… Whisper transcriba"`, echoing the voseo
  instruction back into the answer
- llama3.2 — `"La aplicación del cerdo"`
- mistral — `"En tus proyectos, Fabricio alterna dos pilares"`, mixing person
- qwen — one answer entirely in English

Also tested and **not** shipped: a prompt rule forbidding verbatim copying from
the English FACTS. It fixed one leak and caused another, so there is no evidence
it helps and some that it hurts.

## Tried and rejected: the spontaneous brain

Letting the model write his *unprompted* lines, not just his answers. Built,
tested against real models, reverted. Recording it so nobody — including a later
version of me — spends the weekend again.

Three designs, three different failures:

| Approach | What happened |
| --- | --- |
| Let it observe what you are doing | Invented that the INTACO portal is for Spotify |
| Let it retrieve a fact and phrase it | 1 in 6 answered in English, 1 in 6 was false (put him at Qubo in 2017) |
| Hand it one true fact to rephrase | Facts safe, Spanish broken |

Then the same tests against qwen2.5:**7b**, to find out whether it was capacity:

| | 3B | 7B |
| --- | --- | --- |
| "broiler farm" | "app de hornos" (ovens) | "rancho parrillero" (barbecue ranch) |
| "guards" | left in English | "guardaespaldas" (bodyguards) |
| "stacks" | "pilares" (pillars) | "pilas" (batteries) |
| wrong language | 1 in 6 | 2 in 9 |
| latency | 1.0s | 1.8–2.3s, 10.7s cold |

**It is not a size problem.** The 7B is more accurate on facts and no better at
Spanish register, at twice the latency. Turning domain jargon into idiomatic
Costa Rican Spanish is the hard part, and it is the part a human already did
correctly in `companion.ts` — "galera", and "stacks" deliberately left in
English, because that is how the words are actually used.

The asymmetry that explains all of it: **an answer was asked for, so a machine
voice is accepted and a second of latency is expected. An unprompted line
competes with one somebody wrote by hand, and loses.** The model stays where it
demonstrably works, which is answering questions.

Side effect worth keeping: `smallest_model()` picking the smallest installed
model was a bet on latency. The 7B comparison makes it the quality bet too, for
this workload.

## Cut from v1 — on purpose

| Cut                          | Why, and when it comes back                                       |
| ---------------------------- | ------------------------------------------------------------------ |
| Walking on window title bars | The Shimeji magic, and the single biggest per-platform cost. v1.5. |
| Multi-monitor                | The strip is on the primary monitor. Structurally easy later.      |
| Vision (screenshots)         | Needs a second 2–3 GB model. v2, if ever.                          |
| Clipboard watching           | Cheap to add, but it is a privacy promise. Wants its own thought.  |
| Drag a file onto him         | Belongs with vision or a doc parser. Post-v1.                      |
| KDE/wlroots Wayland          | Real, but only after the three main platforms are solid.           |

## Risks

| Risk                          | Mitigation                                                       |
| ----------------------------- | ---------------------------------------------------------------- |
| GNOME Wayland                 | Out of scope, stated up front. Not half-solved.                   |
| SmartScreen / Gatekeeper      | Sign and notarize from M0, not at the end. Already faced in Lyra. |
| 2.5 GB download surprises     | Small tier default; Ollama first; download after introduction.    |
| Always-on-top battery cost    | The strip (AD-1) instead of a fullscreen layer.                   |
| Pet becomes annoying          | Chattiness setting, and every idle behaviour behind its own floor. |

## Open questions

1. **Product or free?** Lyra has an offline licence bound to the machine. Same
   here, or open source? Changes distribution and signing, not the engineering —
   so it can be answered by M4, not before.
2. **Identifier** — `com.fgrr6.tico`, matching Lyra's `com.fgrr6.lyra`?
3. **Does he keep the portfolio's memory across machines?** Local-only is the
   honest default and the whole point of a local model.
