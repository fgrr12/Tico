use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use std::time::Duration;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager};

/// Where the pet is standing, in CSS pixels inside the strip. Published by the
/// frontend, which is the only side that knows where he actually is.
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

static RECT: Mutex<Option<PetRect>> = Mutex::new(None);
/// Held true for the length of a drag. See the comment in `watch`.
static PINNED: AtomicBool = AtomicBool::new(false);

#[tauri::command]
pub fn set_pet_rect(rect: PetRect) {
    if let Ok(mut current) = RECT.lock() {
        *current = Some(rect);
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
            std::thread::sleep(Duration::from_millis(33));

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

            if (x - last.0).abs() > 1.0 || (y - last.1).abs() > 1.0 {
                last = (x, y);
                let _ = window.emit("cursor", CursorMoved { x, y });
            }

            // PINNED is what keeps a drag alive: a fast one outruns this 30Hz poll,
            // and if the window turned click-through halfway through the gesture the
            // pointer capture would break and he would be dropped mid-air.
            let on_pet = PINNED.load(Ordering::Relaxed)
                || RECT.lock().ok().and_then(|rect| *rect).is_some_and(|rect| {
                    x >= rect.x && x <= rect.x + rect.width && y >= rect.y && y <= rect.y + rect.height
                });

            if on_pet != interactive {
                interactive = on_pet;
                let _ = window.set_ignore_cursor_events(!on_pet);
            }
        }
    });
}
