use std::sync::Mutex;
use std::time::Duration;

use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager};

#[derive(Clone, Serialize)]
struct ActiveApp {
    name: String,
}

static LAST: Mutex<Option<String>> = Mutex::new(None);

/// The **name** of the frontmost application, and deliberately nothing else.
///
/// Window titles would say much more — but reading them costs a Screen Recording
/// permission prompt on macOS, and a pet is not worth that. The app name is free
/// on all three platforms, and knowing you are in an editor is most of what he
/// needs in order to have an opinion about it.
#[cfg(target_os = "macos")]
fn frontmost() -> Option<String> {
    use objc2_app_kit::NSWorkspace;

    let workspace = unsafe { NSWorkspace::sharedWorkspace() };
    let app = unsafe { workspace.frontmostApplication() }?;
    let name = unsafe { app.localizedName() }?;

    Some(name.to_string())
}

/// Not implemented yet, and honestly stubbed rather than guessed at.
///
/// Windows is `GetForegroundWindow` → `GetWindowThreadProcessId` →
/// `QueryFullProcessImageNameW`, and X11 is `_NET_ACTIVE_WINDOW` →
/// `_NET_WM_PID` → `/proc/<pid>/comm`. Neither needs a permission. Both are FFI,
/// and FFI that has never been compiled is worse than an empty function: it looks
/// finished. They land when there is a machine to build them on.
#[cfg(not(target_os = "macos"))]
fn frontmost() -> Option<String> {
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
            let Some(name) = frontmost() else { return };

            let Ok(mut last) = LAST.lock() else { return };
            if last.as_deref() == Some(name.as_str()) {
                return;
            }
            *last = Some(name.clone());
            drop(last);

            // Kept, in the same spirit as Lyra's geometry logging: a frontmost()
            // that quietly returns None looks exactly like a pet that has not
            // spoken yet, and this is the difference between the two.
            #[cfg(debug_assertions)]
            eprintln!("[tico] active app: {name}");

            if let Some(window) = handle.get_webview_window("main") {
                let _ = window.emit("active-app", ActiveApp { name });
            }
        });
    });
}
