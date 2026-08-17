use std::process::Command;
use std::sync::Mutex;
use std::time::Duration;

/// Players worth asking about. Checked in-process before anything is spawned.
const PLAYERS: [&str; 2] = ["Spotify", "Music"];

use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager};

#[derive(Clone, Debug, Serialize, PartialEq)]
pub struct NowPlaying {
    artist: String,
    song: String,
}

static LAST: Mutex<Option<NowPlaying>> = Mutex::new(None);

/// Ask the players directly, the way Lyra does.
///
/// The first attempt at this read Spotify's *window title* instead, on the theory
/// that it holds "Artist — Song" while playing and therefore costs no permission
/// beyond the one window titles already needed. It does not: with a track loaded
/// and paused, the title is "Spotify Premium". The shortcut was an assumption,
/// and it was wrong.
///
/// AppleScript is better on its own merits anyway. It returns the track rather
/// than a string that has to be parsed back into one, it knows whether the player
/// is actually playing, and its permission is *narrower* than the alternative —
/// "tico wants to control Spotify" against "tico wants to control your computer".
/// Music and window titles are now two features behind two independent grants,
/// each the smallest that works.
///
/// `application "X" is running` is the guard that matters: `tell application "X"`
/// on its own **launches** it, and a pet that opens Spotify every three seconds
/// would be a memorable bug.
const SCRIPT: &str = r#"
set d to (character id 31)
set out to ""
if application "Spotify" is running then
	tell application "Spotify"
		if player state is playing then set out to (artist of current track) & d & (name of current track)
	end tell
end if
if out is "" and application "Music" is running then
	tell application "Music"
		if player state is playing then set out to (artist of current track) & d & (name of current track)
	end tell
end if
return out
"#;

/// Is either player even open?
///
/// This is the cheap half of the question and it is asked first. Reading the
/// running applications is an in-process lookup; asking AppleScript is a whole
/// spawned interpreter, and spawning one every few seconds to hear "no" was
/// costing more CPU than the entire rest of the pet put together.
#[cfg(target_os = "macos")]
fn a_player_is_open() -> bool {
    use objc2_app_kit::NSWorkspace;

    let workspace = NSWorkspace::sharedWorkspace();
    workspace.runningApplications().iter().any(|app| {
        app.localizedName()
            .map(|name| PLAYERS.iter().any(|player| name.to_string() == *player))
            .unwrap_or(false)
    })
}

#[cfg(not(target_os = "macos"))]
fn a_player_is_open() -> bool {
    false
}

fn now_playing() -> Option<NowPlaying> {
    let output = Command::new("osascript").arg("-e").arg(SCRIPT).output().ok()?;
    let raw = String::from_utf8_lossy(&output.stdout);

    // Unit separator, because "|" and " - " both show up in real track titles.
    let (artist, song) = raw.trim().split_once('\u{1f}')?;
    let (artist, song) = (artist.trim(), song.trim());

    if artist.is_empty() || song.is_empty() {
        return None;
    }

    Some(NowPlaying {
        artist: artist.to_string(),
        song: song.to_string(),
    })
}

/// Adaptive, because the cost is all in the asking.
///
/// A spawned `osascript` measured ~135ms, and at one every three seconds that is
/// several percent of a core burning all day to be told nothing is playing. So:
/// nothing spawns unless a player is actually open, and when nothing is playing
/// the question is asked every fifteen seconds instead of every four. A track
/// change noticed four seconds late is imperceptible; a laptop that runs warm
/// all afternoon is not.
pub fn watch(app: AppHandle) {
    std::thread::spawn(move || loop {
        let idle = LAST.lock().map(|last| last.is_none()).unwrap_or(true);
        std::thread::sleep(Duration::from_secs(if idle { 15 } else { 4 }));

        let playing = if a_player_is_open() { now_playing() } else { None };

        let Ok(mut last) = LAST.lock() else { continue };
        if *last == playing {
            continue;
        }
        *last = playing.clone();
        drop(last);

        #[cfg(debug_assertions)]
        eprintln!("[tico] now playing: {playing:?}");

        if let Some(window) = app.get_webview_window("main") {
            let _ = window.emit("now-playing", playing);
        }
    });
}
