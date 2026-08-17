use std::sync::Mutex;
use std::time::Duration;

use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager};

/// The players whose window title is the track. Spotify and Music both write
/// "Artist — Song" there while playing and their own name while idle, which is
/// the entire detection.
const PLAYERS: [&str; 2] = ["Spotify", "Music"];

/// The separators these players actually use, longest first so an en dash is not
/// matched by the hyphen rule.
const SEPARATORS: [&str; 3] = [" — ", " – ", " - "];

#[derive(Clone, Serialize, PartialEq)]
pub struct NowPlaying {
    artist: String,
    song: String,
}

static LAST: Mutex<Option<NowPlaying>> = Mutex::new(None);

/// A title is a track only if it splits. "Spotify Premium", "Spotify" and
/// "Music" are what those apps show with nothing playing, and none of them
/// contain a separator — so the check for one is also the check for playing.
fn parse(title: &str) -> Option<NowPlaying> {
    let separator = SEPARATORS.iter().find(|sep| title.contains(**sep))?;
    let (artist, song) = title.split_once(*separator)?;

    let artist = artist.trim();
    let song = song.trim();

    if artist.is_empty() || song.is_empty() {
        return None;
    }

    Some(NowPlaying {
        artist: artist.to_string(),
        song: song.to_string(),
    })
}

/// Slower than everything else here. Reading another app's window costs an
/// Accessibility round trip, nobody needs to know about a track change inside
/// three seconds, and this runs all day.
pub fn watch(app: AppHandle) {
    std::thread::spawn(move || loop {
        std::thread::sleep(Duration::from_secs(3));

        let handle = app.clone();
        let _ = app.run_on_main_thread(move || {
            let playing = crate::window_title::title_of(&PLAYERS).as_deref().and_then(parse);

            let Ok(mut last) = LAST.lock() else { return };
            if *last == playing {
                return;
            }
            *last = playing.clone();
            drop(last);

            if let Some(window) = handle.get_webview_window("main") {
                let _ = window.emit("now-playing", playing);
            }
        });
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn an_idle_player_is_not_a_track() {
        assert!(parse("Spotify Premium").is_none());
        assert!(parse("Spotify").is_none());
        assert!(parse("Music").is_none());
    }

    #[test]
    fn a_track_splits_on_any_of_the_dashes() {
        let track = parse("Radiohead — Weird Fishes").unwrap();
        assert_eq!(track.artist, "Radiohead");
        assert_eq!(track.song, "Weird Fishes");

        // A hyphen inside the song survives, because the first separator wins.
        let track = parse("Godspeed You! Black Emperor - Storm - Part 1").unwrap();
        assert_eq!(track.artist, "Godspeed You! Black Emperor");
        assert_eq!(track.song, "Storm - Part 1");
    }
}
