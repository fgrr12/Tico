//! Experiment: what Claude needs from the machine, and nothing more.
//!
//! The key comes from the environment of whoever ran `pnpm t:d`, so it is never
//! written into his settings, and a build without it is the tico from `main`.

use std::sync::atomic::{AtomicI32, Ordering};

use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager};

#[derive(Serialize)]
pub struct BrainConfig {
    key: Option<String>,
    /// `TICO_MODEL` swaps the model without a rebuild, for comparing them.
    model: Option<String>,
}

#[tauri::command]
pub fn brain_config() -> BrainConfig {
    let read = |name: &str| std::env::var(name).ok().filter(|v| !v.trim().is_empty());
    BrainConfig {
        key: read("ANTHROPIC_API_KEY"),
        model: read("TICO_MODEL"),
    }
}

/// The main display as a JPEG no wider than `width` (1280 by default), or nothing.
///
/// The 64px version is for noticing change, not for reading: two of those a
/// minute apart are what decides whether anything is worth a call.
///
/// Shells out to the two tools macOS already ships rather than linking
/// ScreenCaptureKit: this is an experiment, and both fail closed. Needs Screen
/// Recording; without it `screencapture` returns the wallpaper alone, which
/// costs a few tokens of nothing rather than an error.
// `async` moves it off the main thread: two subprocesses there would stall him.
#[tauri::command(async)]
pub fn glance(width: Option<u32>) -> tauri::ipc::Response {
    tauri::ipc::Response::new(capture(width.unwrap_or(1280).clamp(16, 1920)).unwrap_or_default())
}

#[cfg(target_os = "macos")]
fn capture(width: u32) -> Option<Vec<u8>> {
    use std::process::Command;

    // Per width, so the small watcher and a full look never share a file.
    let path = std::env::temp_dir().join(format!("tico-glance-{width}.jpg"));

    // -x silent, -m main display only, -t jpg so it is small before resizing.
    let shot = Command::new("/usr/sbin/screencapture")
        .args(["-x", "-m", "-t", "jpg"])
        .arg(&path)
        .status()
        .ok()?;
    let resized = Command::new("/usr/bin/sips")
        .args(["-Z", &width.to_string(), "-s", "formatOptions", "60"])
        .arg(&path)
        .stdout(std::process::Stdio::null())
        .status()
        .ok()?;
    let bytes = (shot.success() && resized.success())
        .then(|| std::fs::read(&path).ok())
        .flatten();
    // The screen is not kept, not even in /tmp, whichever step failed.
    let _ = std::fs::remove_file(&path);
    bytes
}

#[cfg(not(target_os = "macos"))]
fn capture(_width: u32) -> Option<Vec<u8>> {
    None
}

/// Whoever had the keyboard before the ask window took it. 0 is nobody.
static HAND_BACK_TO: AtomicI32 = AtomicI32::new(0);

#[derive(Clone, Serialize)]
struct Asked {
    text: Option<String>,
}

/// Ctrl+Shift+T: a small window to type to him in.
///
/// Its own window, because the strip is a non-activating panel that can never
/// hold a keystroke (`macos.rs`) and must stay that way. This one takes focus,
/// and `asked` gives it back to the app you were in — without that the caret
/// is left nowhere and the next thing you type goes into the void.
pub fn open_ask(app: &AppHandle) {
    let handle = app.clone();
    let _ = app.run_on_main_thread(move || {
        if let Some(window) = handle.get_webview_window("ask") {
            let _ = window.set_focus();
            return;
        }
        let pid = crate::active_app::frontmost()
            .filter(|(name, _)| !name.eq_ignore_ascii_case("tico"))
            .map_or(0, |(_, pid)| pid);
        HAND_BACK_TO.store(pid, Ordering::Relaxed);

        let built = tauri::WebviewWindowBuilder::new(
            &handle,
            "ask",
            tauri::WebviewUrl::App("index.html#ask".into()),
        )
        .title("tico")
        .inner_size(460.0, 64.0)
        .decorations(false)
        .transparent(true)
        .resizable(false)
        .always_on_top(true)
        .skip_taskbar(true)
        .center()
        .focused(true)
        .build();

        match built {
            Ok(_) => {
                if let Some(main) = handle.get_webview_window("main") {
                    let _ = main.emit("listening", ());
                }
            }
            Err(error) => eprintln!("[tico] could not open the ask window: {error}"),
        }
    });
}

/// The question, or `None` for a cancel. Either way the window goes and focus
/// goes back to where it was.
#[tauri::command]
pub fn asked(app: AppHandle, text: Option<String>) {
    let text = text.map(|t| t.trim().chars().take(500).collect::<String>()).filter(|t| !t.is_empty());
    if let Some(main) = app.get_webview_window("main") {
        let _ = main.emit("asked", Asked { text });
    }
    if let Some(window) = app.get_webview_window("ask") {
        let _ = window.destroy();
    }
    hand_back();
}

#[cfg(target_os = "macos")]
fn hand_back() {
    use objc2_app_kit::{NSApplicationActivationOptions, NSRunningApplication};

    let pid = HAND_BACK_TO.swap(0, Ordering::Relaxed);
    if pid != 0 {
        if let Some(app) = NSRunningApplication::runningApplicationWithProcessIdentifier(pid) {
            app.activateWithOptions(NSApplicationActivationOptions(0));
        }
    }
}

#[cfg(not(target_os = "macos"))]
fn hand_back() {}

/// Whether to register the shortcut at all: no key, no question box.
pub fn has_key() -> bool {
    std::env::var("ANTHROPIC_API_KEY").is_ok_and(|key| !key.trim().is_empty())
}
