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

## Stack

Tauri v2 · Rust · React 19 · TypeScript · llama.cpp sidecar

The shell is lifted from [Lyra](../Lyrics-app): the same transparent always-on-top
overlay, tray, autostart, global shortcut and multi-monitor handling, which is
already solved and shipped there.
