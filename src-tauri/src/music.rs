use std::process::Command;
use std::sync::Mutex;
use std::time::Duration;

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

/// Every three seconds, measured at ~135ms a call. Slow enough not to matter,
/// often enough that he is singing the song you are actually hearing.
pub fn watch(app: AppHandle) {
    std::thread::spawn(move || loop {
        std::thread::sleep(Duration::from_secs(3));

        let playing = now_playing();

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
