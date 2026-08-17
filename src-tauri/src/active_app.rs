use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use std::time::Duration;

use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager};

#[derive(Clone, Serialize)]
struct ActiveApp {
    name: String,
    /// The focused window's title, when titles are switched on and permitted and
    /// the title is not one of the ones we refuse to look at.
    title: Option<String>,
}

static LAST: Mutex<Option<(String, Option<String>)>> = Mutex::new(None);
/// Set from the tray. Off until asked for — the permission is not taken quietly.
static TITLES: AtomicBool = AtomicBool::new(false);

pub fn set_titles(on: bool) {
    TITLES.store(on, Ordering::Relaxed);
}

/// The name of the frontmost application, and its pid.
///
/// The name is free on all three platforms and needs no permission at all, which
/// is why it is the thing he always knows. The pid is only here so
/// `window_title` can ask Accessibility for the focused window's title — a much
/// more revealing string, behind a grant, off by default.
#[cfg(target_os = "macos")]
fn frontmost() -> Option<(String, i32)> {
    use objc2_app_kit::NSWorkspace;

    // No unsafe block: objc2 marks these three as safe, because none of them has
    // a safety requirement beyond being on the main thread — which is where the
    // caller already puts us.
    let workspace = NSWorkspace::sharedWorkspace();
    let app = workspace.frontmostApplication()?;
    let name = app.localizedName()?;

    Some((name.to_string(), app.processIdentifier()))
}

/// Not implemented yet, and honestly stubbed rather than guessed at.
///
/// Windows is `GetForegroundWindow` → `GetWindowThreadProcessId` →
/// `QueryFullProcessImageNameW`, and X11 is `_NET_ACTIVE_WINDOW` →
/// `_NET_WM_PID` → `/proc/<pid>/comm`. Neither needs a permission. Both are FFI,
/// and FFI that has never been compiled is worse than an empty function: it looks
/// finished. They land when there is a machine to build them on.
#[cfg(not(target_os = "macos"))]
fn frontmost() -> Option<(String, i32)> {
    None
}

/// Polls twice a second and emits only when the answer changes, so the frontend
/// gets switches rather than a heartbeat, and can time the dwell itself.
///
/// The sample runs on the main thread: `NSWorkspace` is an AppKit object and
/// makes no thread-safety promise worth relying on. Twice a second is nothing to
/// hand the main thread.
pub fn watch(app: AppHandle) {
    std::thread::spawn(move || loop {
        std::thread::sleep(Duration::from_millis(500));

        let handle = app.clone();
        let _ = app.run_on_main_thread(move || {
            let Some((name, pid)) = frontmost() else { return };

            // Taking focus for the ask hotkey makes him the frontmost app, and a
            // pet that notices itself and has no opinion about itself is a bad
            // joke told twice. His own window is not a context switch.
            if name.eq_ignore_ascii_case("tico") {
                return;
            }

            let title = if TITLES.load(Ordering::Relaxed) {
                crate::window_title::read(pid)
            } else {
                None
            };

            let Ok(mut last) = LAST.lock() else { return };
            if last.as_ref() == Some(&(name.clone(), title.clone())) {
                return;
            }
            *last = Some((name.clone(), title.clone()));
            drop(last);

            // Kept, in the same spirit as Lyra's geometry logging: a frontmost()
            // that quietly returns None looks exactly like a pet that has not
            // spoken yet, and this is the difference between the two.
            #[cfg(debug_assertions)]
            eprintln!("[tico] active app: {name} · {title:?}");

            if let Some(window) = handle.get_webview_window("main") {
                let _ = window.emit("active-app", ActiveApp { name, title });
            }
        });
    });
}
