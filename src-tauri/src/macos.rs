//! The two things a pet that lives on the desktop needs from AppKit, and that
//! Tauri does not expose on its own.

use objc2_app_kit::{NSWindow, NSWindowCollectionBehavior, NSWindowLevel};
use tauri::WebviewWindow;

/// `NSStatusWindowLevel`.
///
/// `alwaysOnTop` gets you `NSFloatingWindowLevel`, which is 3. The Dock sits at
/// 20 — so a pet that walks along the bottom of the screen walks *behind* it, and
/// because the Dock is also taking the clicks in that strip of screen, he stops
/// being clickable exactly where he spends most of his time. 25 clears the Dock
/// without climbing over screen savers and system alerts, which is the point
/// where an overlay stops being polite.
const ABOVE_DOCK: NSWindowLevel = 25;

/// Raise the strip over the Dock, and keep it on whichever Space you are looking
/// at. Without `CanJoinAllSpaces` he belongs to the desktop he was launched on
/// and vanishes when you switch — which, for something whose whole job is being
/// around, reads as the app having crashed.
pub fn place_above_dock(window: &WebviewWindow) {
    let Ok(pointer) = window.ns_window() else {
        return;
    };

    if pointer.is_null() {
        return;
    }

    // Safe as long as this runs on the main thread, which is where Tauri's setup
    // hook and tray menu events both already are.
    let ns_window: &NSWindow = unsafe { &*(pointer as *const NSWindow) };

    ns_window.setLevel(ABOVE_DOCK);
    ns_window.setCollectionBehavior(
        NSWindowCollectionBehavior::CanJoinAllSpaces | NSWindowCollectionBehavior::Stationary,
    );
}
