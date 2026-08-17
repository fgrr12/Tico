# tico

A desktop pet that lives on the bottom of your screen, notices what you are doing,
and can be asked things — answered by a language model running on your own machine.

He started as a character in [my-portfolio](../my-portfolio), where he is a
miniature terminal window with a face on its screen. This is the same character
with a real desktop under his feet.

## Status

Planning. Nothing is built yet — see [PLAN.md](PLAN.md) for the v1 scope, the
architecture decisions that are already locked, and what is deliberately cut.

## Platforms

| Platform             | v1      | Notes                                                     |
| -------------------- | ------- | --------------------------------------------------------- |
| macOS                | ✅      | Tray-only app, no Dock icon                                |
| Windows 10/11        | ✅      | Layered click-through window                               |
| Linux / X11          | ✅      | Absolute positioning works                                 |
| Linux / KDE Wayland  | ⚠️      | Needs `wlr-layer-shell`; deferred past v1                  |
| Linux / GNOME Wayland| ❌      | Mutter does not implement layer-shell. XWayland or nothing |

## Living with him

Everything is in the tray: **Quiet** silences what he says unprompted (a direct
poke still gets a reply), **In a call** decides what he does while the microphone
is live, **Chattiness**, **Size**, **Language**, and **Read window titles** — the
one setting that costs a permission, and the only thing it buys is that he can
name the file you have open rather than only the app.

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

A local model was built and then removed — six attempts at having it write his
voice in Spanish, all recorded in [PLAN.md](PLAN.md). Everything he says is
written by hand, which turned out to be both the cheaper and the better answer.

## Permissions

Two, both optional, neither asked for at launch.

- **Automation → Spotify**, so he knows the track and can sing along. Requested
  the first time something is playing.
- **Accessibility**, only if you switch on *Read window titles*. It is what lets
  him say "Companion.tsx otra vez" instead of "estás en VS Code". Titles that
  look sensitive are never read at all, and no title is ever spoken out loud —
  it is context, never content.

Nothing here reads a pixel, and nothing leaves the machine.
