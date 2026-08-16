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

### M2 — Situational awareness · ~2 days

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

### M3 — The brain · ~3–4 days

- Sidecar plumbing, health check, graceful "no model" state.
- Ollama detection; first-run download with progress and a size choice.
- Constrained JSON output (AD-2) and the grounded system prompt (AD-4).
- Global hotkey → input bubble → he answers where he stands.
- **Done when:** the hotkey works offline on a plane.

### M4 — Packaging · ~2–3 days

- Apple notarization, Windows signing — the boring part that decides whether
  anyone ever runs it. Budget the certificate before starting, not after.
- Installers for the three platforms, icon set, first-run flow, an uninstall that
  takes the downloaded model with it.

Roughly two to three weekends of real work, front-loaded on M1 because that is the
part that has to be good.

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
