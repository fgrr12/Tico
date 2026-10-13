//! Experiment: what Claude needs from the machine, and nothing more.
//!
//! The key comes from the environment of whoever ran `pnpm t:d`, so it is never
//! written into his settings, and a build without it is the tico from `main`.

use serde::Serialize;

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

/// The main display as a JPEG no wider than 1280px, or nothing.
///
/// Shells out to the two tools macOS already ships rather than linking
/// ScreenCaptureKit: this is an experiment, and both fail closed. Needs Screen
/// Recording; without it `screencapture` returns the wallpaper alone, which
/// costs a few tokens of nothing rather than an error.
#[tauri::command]
pub fn glance() -> tauri::ipc::Response {
    tauri::ipc::Response::new(capture().unwrap_or_default())
}

#[cfg(target_os = "macos")]
fn capture() -> Option<Vec<u8>> {
    use std::process::Command;

    let path = std::env::temp_dir().join("tico-glance.jpg");

    // -x silent, -m main display only, -t jpg so it is small before resizing.
    let shot = Command::new("/usr/sbin/screencapture")
        .args(["-x", "-m", "-t", "jpg"])
        .arg(&path)
        .status()
        .ok()?;
    let resized = Command::new("/usr/bin/sips")
        .args(["-Z", "1280", "-s", "formatOptions", "60"])
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
fn capture() -> Option<Vec<u8>> {
    None
}
