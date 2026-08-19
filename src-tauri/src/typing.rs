use std::sync::atomic::{AtomicBool, Ordering};
use std::time::Duration;

use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager};

#[derive(Clone, Serialize)]
struct Typing {
    active: bool,
}

static TYPING: AtomicBool = AtomicBool::new(false);

/// How long after the last key he keeps assuming you are still writing. Longer
/// than the gap between two keystrokes and shorter than the pause between two
/// sentences: at half a second the bubble strobed back into view between words.
const STILL_TYPING_FOR: f64 = 1.5;

/// Are you typing right now?
///
/// Not a key logger and not a global hook — both of which need Accessibility on
/// macOS, which the cursor watch already refuses to ask for. This asks the event
/// system a single number, *how long since the last key went down*, and gets
/// back no key, no modifier and no window. There is nothing here to log.
#[cfg(target_os = "macos")]
mod keyboard {
    /// `kCGEventSourceStateHIDSystemState` and `kCGEventKeyDown`. HID rather than
    /// the combined session state on purpose: the combined one also counts keys
    /// *posted* by other applications, and a text expander firing is not you
    /// typing.
    const HID_SYSTEM_STATE: u32 = 1;
    const KEY_DOWN: u32 = 10;

    #[link(name = "CoreGraphics", kind = "framework")]
    extern "C" {
        fn CGEventSourceSecondsSinceLastEventType(state: u32, event: u32) -> f64;
    }

    pub fn since_last_key() -> f64 {
        // Safe: no pointers, two constants in and a number out.
        unsafe { CGEventSourceSecondsSinceLastEventType(HID_SYSTEM_STATE, KEY_DOWN) }
    }
}

#[cfg(not(target_os = "macos"))]
mod keyboard {
    /// Windows has `GetLastInputInfo`, but it counts the mouse as input too — so
    /// it would read "typing" every time you moved the cursor, which is the one
    /// case the veil already handles. Stubbed rather than guessed at, like the
    /// microphone watcher.
    pub fn since_last_key() -> f64 {
        f64::MAX
    }
}

/// Slower than the cursor watch, faster than the call watch. The bubble has to
/// be out of the way by the second word, not the second sentence.
pub fn watch(app: AppHandle) {
    std::thread::spawn(move || loop {
        std::thread::sleep(Duration::from_millis(200));

        let typing = keyboard::since_last_key() < STILL_TYPING_FOR;
        if typing == TYPING.load(Ordering::Relaxed) {
            continue;
        }

        TYPING.store(typing, Ordering::Relaxed);

        if let Some(window) = app.get_webview_window("main") {
            let _ = window.emit("typing", Typing { active: typing });
        }
    });
}
