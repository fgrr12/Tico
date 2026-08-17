//! The three things a pet that lives on the desktop needs from AppKit, and that
//! Tauri does not expose on its own.

use objc2::runtime::{AnyClass, AnyObject};
use objc2_app_kit::{NSWindow, NSWindowCollectionBehavior, NSWindowLevel, NSWindowStyleMask};
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
    let Some(ns_window) = ns_window(window) else {
        return;
    };

    ns_window.setLevel(ABOVE_DOCK);
    ns_window.setCollectionBehavior(
        NSWindowCollectionBehavior::CanJoinAllSpaces | NSWindowCollectionBehavior::Stationary,
    );
}

/// Stop a click on him from stealing focus.
///
/// `focusable: false` was not enough, and the reason is worth writing down: it
/// makes `canBecomeKeyWindow` return NO, which stops the *window* taking key
/// status — but clicking any window of a background app still activates the
/// *application*, and that is what pulls the insertion point out of the editor
/// you were typing in. Two different things, and only one of them was fixed.
///
/// The only mechanism on macOS that prevents the activation is
/// `NSWindowStyleMaskNonactivatingPanel`, which AppKit honours on `NSPanel` and
/// ignores everywhere else. Tauri builds an `NSWindow`, so the window has to
/// become a panel after the fact — the same swap `tauri-nspanel` exists to do,
/// which is thirty lines against a dependency that has to track tao's internals
/// to stay correct.
///
/// What is lost with tao's subclass: its `canBecomeKeyWindow` override, which a
/// borderless window gets for free anyway, and a `sendEvent:` override that only
/// matters for `movableByWindowBackground`. He is dragged from inside the
/// webview, so nothing here uses it.
pub fn make_nonactivating(window: &WebviewWindow) {
    let Ok(pointer) = window.ns_window() else {
        return;
    };

    if pointer.is_null() {
        return;
    }

    let Some(panel) = AnyClass::get(c"NSPanel") else {
        return;
    };

    let object: &AnyObject = unsafe { &*(pointer as *const AnyObject) };
    let current = object.class();

    // Repointing an object at a class with a *larger* instance size leaves its
    // extra ivars reading past the allocation. tao's window subclass is NSWindow
    // plus one flag, so this swap is into a smaller object and is safe — but
    // that is a fact about somebody else's crate, and it is one version bump
    // from stopping being true. Checked, not assumed: a pet whose click behaves
    // slightly wrong is a nuisance, and one that corrupts memory is a crash
    // report with no cause in it.
    if panel.instance_size() > current.instance_size() {
        eprintln!(
            "[tico] not converting to NSPanel: {} is {} bytes, NSPanel is {}",
            current.name().to_string_lossy(),
            current.instance_size(),
            panel.instance_size()
        );
        return;
    }

    unsafe { objc2::ffi::object_setClass(pointer as *mut AnyObject, panel) };

    let ns_window: &NSWindow = unsafe { &*(pointer as *const NSWindow) };
    ns_window.setStyleMask(ns_window.styleMask() | NSWindowStyleMask::NonactivatingPanel);

    // Panels hide themselves when their application is deactivated, and this one
    // spends its whole life deactivated. The flag was set at init, when it was
    // still an NSWindow, so it is almost certainly already off — but "almost
    // certainly" here means the pet vanishes the moment you click anything else.
    ns_window.setHidesOnDeactivate(false);

    #[cfg(debug_assertions)]
    eprintln!(
        "[tico] window is now {} with style mask {:?}",
        object.class().name().to_string_lossy(),
        ns_window.styleMask()
    );
}

fn ns_window(window: &WebviewWindow) -> Option<&NSWindow> {
    let pointer = window.ns_window().ok()?;

    if pointer.is_null() {
        return None;
    }

    // Safe as long as this runs on the main thread, which is where Tauri's setup
    // hook and tray menu events both already are.
    Some(unsafe { &*(pointer as *const NSWindow) })
}
