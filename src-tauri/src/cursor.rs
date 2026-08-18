use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use std::time::Duration;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager};

/// A region of the strip that should take clicks, in CSS pixels. Published by
/// the frontend, which is the only side that knows where anything is.
#[derive(Clone, Copy, Deserialize)]
pub struct PetRect {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
}

#[derive(Clone, Serialize)]
struct CursorMoved {
    x: f64,
    y: f64,
}

/// Every clickable region, not just the pet.
///
/// This was a single rect for as long as he was the only thing on the strip. The
/// house broke that: a door you cannot click is a picture of a door, and the
/// interior needs the whole panel live while it is open. A list rather than a
/// union rectangle, because the union of a pet on one side and a house on the
/// other is most of the screen, and the desktop underneath has to stay usable.
static RECTS: Mutex<Vec<PetRect>> = Mutex::new(Vec::new());
/// Held true for the length of a drag. See the comment in `watch`.
static PINNED: AtomicBool = AtomicBool::new(false);

#[tauri::command]
pub fn set_pet_rect(rects: Vec<PetRect>) {
    #[cfg(debug_assertions)]
    eprintln!(
        "[tico] hit rects: {}",
        rects
            .iter()
            .map(|r| format!("{:.0},{:.0} {:.0}x{:.0}", r.x, r.y, r.width, r.height))
            .collect::<Vec<_>>()
            .join(" | ")
    );

    if let Ok(mut current) = RECTS.lock() {
        *current = rects;
    }
}

#[tauri::command]
pub fn set_interactive(hold: bool) {
    PINNED.store(hold, Ordering::Relaxed);
}

/// The pet's only sense, and the reason the desktop underneath stays usable.
///
/// The strip ignores cursor events, so the webview receives no pointer events at
/// all — it cannot know where the mouse is, and it cannot be clicked. This thread
/// closes both gaps from outside: it polls the global cursor, hands the position
/// down so he can look at it, and lets events through only while the cursor is
/// actually on him.
///
/// Polling rather than hooking is deliberate: a global mouse hook needs
/// Accessibility permission on macOS, and asking for that on first launch — to
/// run a desktop pet — is how an app gets deleted.
pub fn watch(app: AppHandle) {
    std::thread::spawn(move || {
        let mut interactive = false;
        let mut last = (f64::MIN, f64::MIN);

        loop {
            std::thread::sleep(Duration::from_millis(50));

            let Some(window) = app.get_webview_window("main") else {
                continue;
            };

            let (Ok(cursor), Ok(origin), Ok(scale)) = (
                app.cursor_position(),
                window.outer_position(),
                window.scale_factor(),
            ) else {
                continue;
            };

            // Strip-local CSS pixels. A negative `y` means the cursor is above the
            // strip, which is most of the screen — he can still look up at it.
            let x = (cursor.x - origin.x as f64) / scale;
            let y = (cursor.y - origin.y as f64) / scale;

            // 20Hz and 3px. The hit test is imperceptible either way at this rate,
            // and the eyes travel six pixels in total — there is nothing on the
            // other side of this to see.
            if (x - last.0).abs() > 3.0 || (y - last.1).abs() > 3.0 {
                last = (x, y);
                let _ = window.emit("cursor", CursorMoved { x, y });
            }

            // PINNED is what keeps a drag alive: a fast one outruns this 30Hz poll,
            // and if the window turned click-through halfway through the gesture the
            // pointer capture would break and he would be dropped mid-air.
            let on_pet = PINNED.load(Ordering::Relaxed)
                || RECTS.lock().ok().is_some_and(|rects| {
                    rects.iter().any(|rect| {
                        x >= rect.x
                            && x <= rect.x + rect.width
                            && y >= rect.y
                            && y <= rect.y + rect.height
                    })
                });

            if on_pet != interactive {
                interactive = on_pet;

                #[cfg(debug_assertions)]
                eprintln!("[tico] interactive: {on_pet} (cursor {x:.0},{y:.0})");

                let _ = window.set_ignore_cursor_events(!on_pet);
            }
        }
    });
}
