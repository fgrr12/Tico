# tico

A desktop pet that walks along the bottom of your screen and notices what you are
doing. He knows which application is in front, whether the microphone is live,
what is playing, what time it is and how long you have been ignoring him, and he
has opinions about all of it.

He started as a character in [my-portfolio](../my-portfolio), where he is a
miniature terminal window with a face on its screen. This is the same character
with a real desktop under his feet.

## Status

Built, and in daily use by its author. Not signed and never will be — see
[RELEASING.md](RELEASING.md) for the one command it takes to install.

What he is made of: 39 behaviours, 13 feelings on two axes, 21 things he wears
for no reason, and around 320 written lines in each of English and Spanish. All
of it hand-written. A local language model was built into him and then removed —
six attempts at getting one to write his voice, all recorded in
[PLAN.md](PLAN.md) — which turned out to be both the cheaper and the better
answer.

He costs **3.2% of a core awake and 0.6% asleep**, 229 MB across his four
processes, and 10 MB on disk.

## Platforms

He runs everywhere. He *notices* things only on macOS — the four watchers
(frontmost application, microphone, music, window title) are behind
`#[cfg(target_os = "macos")]` with fallbacks that return nothing, so elsewhere
he walks, talks, sleeps, wears hats and reacts to you, but not to your desk.

| Platform              | Runs | Aware | Notes                                              |
| --------------------- | ---- | ----- | -------------------------------------------------- |
| macOS                 | ✅   | ✅    | Tray-only, no Dock icon. The only one in daily use  |
| Windows 10/11         | ✅   | ❌    | Needs `IAudioSessionManager2` and the Win32 watchers|
| Linux / X11           | ✅   | ❌    | Needs the PulseAudio and X11 equivalents            |
| Linux / KDE Wayland   | ⚠️   | ❌    | Needs `wlr-layer-shell` to sit on the desktop       |
| Linux / GNOME Wayland | ❌   | ❌    | Mutter has no layer-shell. XWayland or nothing      |

## Living with him

Everything is in the tray: **Show / Hide**, **Quiet** silences what he says
unprompted (a direct poke still gets a reply), **In a call** decides what he does
while the microphone is live, **Chattiness**, **Size**, **Language**, **Start at
login**, and **Read window titles** — the one setting that costs a permission,
and the only thing it buys is that he can name the file you have open rather than
only the app.

Click him and he reacts on the first click, and it does not take focus off
whatever you were typing in. That took a window flag and turning him into an
`NSPanel`; both are explained in [PLAN.md](PLAN.md), because getting it wrong is
the difference between a pet and an interruption.

He falls asleep after 90 seconds with no cursor movement anywhere on screen, and
asleep he is completely still — that is what takes him from 3.2% of a core to
0.6%, and it is why stillness is not negotiable there.

### What he remembers

He keeps a little history between sessions, in `memory.json` next to his
settings: how many distinct days he has been around, his current and best run of
consecutive days, how many times he has been petted or picked up, and how often
he has worn each hat. That last one gives him a favourite, which then tilts what
he reaches for — nothing chose it, it emerged from a random draw and then bent
the draw.

What it changes: the first thing he says on launch is different if he has never
run before, if you were away for a week, or if today is a round number; and how
long he has known you colours the idle chatter, in four steps that take two
months to climb.

**What it does not contain is the point.** No application names, no window
titles, no track names, no timestamp finer than a date. Everything about what
*you* do stays in memory and dies with the process, exactly as it did before this
existed — a pet that remembers last Tuesday's app usage is a tracker wearing a
costume. Delete the file and he simply meets you again.

### Reminders

A plain JSON file, and anything at all can write to it:

```
~/Library/Application Support/com.fgrr6.tico/reminders.json
```

```json
[
  {
    "id": "iva",
    "text": "El IVA del mes pasado vence el 15.",
    "due": "2026-09-15",
    "remind_from": "2026-09-01",
    "repeat": "monthly",
    "done": false
  },
  {
    "id": "dentist",
    "text": "Llamar al dentista.",
    "due": "2026-09-22",
    "done": false
  }
]
```

- `id` — anything unique. It is how "done" is remembered.
- `due` — `YYYY-MM-DD`.
- `remind_from` — optional; defaults to a week before `due`.
- `repeat` — `monthly`, or leave it out for a one-off. Marking a monthly one done
  rolls it to next month rather than retiring it, because paying August's IVA
  does not mean September's is handled.
- `done` — set by the **button on his bubble**, not by you. One click cannot be
  misread; parsing "ya lo pagué" can.

He re-reads the file every five minutes, so a new reminder does not need a
restart. He mentions each one at most once a day, only when he is not already
saying something, and never while quiet or in a call.

## Stack

Tauri v2 · Rust · React 19 · TypeScript. No model, no network, no runtime
dependency — 10 MB that runs on its own.

The shell is lifted from [Lyra](../Lyrics-app): the same transparent
always-on-top overlay, tray, autostart and multi-monitor handling, already solved
and shipped there.

## Working on him

```sh
pnpm t:d      # him, on your desktop, with hot reload
pnpm t:b      # the .app and the .dmg
pnpm check    # the checks that used to be run by hand and thrown away
```

`pnpm check` is not a test suite. It is the set of things that break silently:
a feeling with no lines, a behaviour with no keyframes, an hour with no energy,
a colour pair below 3:1, a prop that is worn but never drawn, a CSS variable
used but never defined. None of them fails loudly on its own — they fail by him
quietly doing nothing, which looks exactly like a pet that has nothing to do.

`pnpm t:d` then `/scripts/sheet.html` draws every mood and every prop at the
sizes he is actually shown at, on a dark backdrop. **Look at that page before
believing a drawing is right.** Three rounds of defects got past types, lint and
`pnpm check` and were obvious within a second of looking: a top hat filled with
the colour of the desktop behind it, a headphone band drawn inside the head, a
crown that came out black because a variable was undefined and SVG falls back to
black without complaining.

[CLAUDE.md](CLAUDE.md) has the rules worth knowing before changing anything; the
short version is that liveliness is a state machine, everything unprompted rides
one poll, travel is a CSS transition and never a rAF loop, copy is data in both
languages, and one animation anywhere costs a frame everywhere.

## Permissions

Two, both optional, neither asked for at launch.

- **Automation → Spotify**, so he knows the track and can sing along. Requested
  the first time something is playing.
- **Accessibility**, only if you switch on *Read window titles*. It is what lets
  him say "Companion.tsx otra vez" instead of "estás en VS Code". Titles that
  look sensitive are never read at all, and no title is ever spoken out loud —
  it is context, never content.

Nothing here reads a pixel, and nothing leaves the machine.
