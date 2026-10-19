//! The burrow's pure half, from `src/house/house.ts`: which bay he is in, and
//! what he brings up from it.
//!
//! The house has no clock. Nothing runs while he is down there; the scene is
//! *derived* when you look, deterministically, from how long he has been in,
//! why he went down (frozen when he went) and the bay he favours — so looking
//! twice in the same minute shows the same thing.

use crate::data::Feeling;

/// The three bays. The ids are the keys `memory.json` counts under.
pub const FURNITURE: [&str; 3] = ["chair", "lamp", "rug"];

/// After this many minutes the reason he went down no longer explains where
/// he is, and the hash takes over.
const REASON_HOLDS: u64 = 20;

/// Where a feeling sends him; anything else has no opinion.
fn room_for(feeling: Feeling) -> Option<&'static str> {
    use Feeling::*;
    match feeling {
        Scared | Rattled | Bored => Some("rug"),
        Sleepy | Lonely | Worried => Some("chair"),
        Festive | Pleased => Some("lamp"),
        _ => None,
    }
}

/// What he comes back up holding, by the bay he was last in.
pub fn brought_up(at: &str) -> &'static str {
    match at {
        "chair" => "coffee",
        "lamp" => "flower",
        _ => "dust",
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Scene {
    pub at: &'static str,
    pub minutes: u64,
    /// Under two minutes he has only just got in and is still standing up.
    pub settled: bool,
}

/// `sceneAt`. One multiplicative hash read at two offsets: the room, and the
/// coin that decides whether the favourite wins (it bends the draw, never
/// owns it). Two expressions that only *looked* independent once sent him to
/// his favourite every time — see the note in `house.ts`.
pub fn scene_at(since: u64, now: u64, favourite: Option<&str>, reason: Option<Feeling>) -> Scene {
    let minutes = now.saturating_sub(since) / 60_000;
    let seed = minutes.wrapping_mul(2_654_435_761).wrapping_add(since) as u32;
    let preferred = favourite.and_then(|f| FURNITURE.iter().copied().find(|k| *k == f));
    let drawn = match preferred {
        Some(f) if !(seed >> 8).is_multiple_of(3) => f,
        _ => FURNITURE[seed as usize % FURNITURE.len()],
    };
    let at = match reason.and_then(room_for) {
        Some(because) if minutes < REASON_HOLDS => because,
        _ => drawn,
    };
    Scene { at, minutes, settled: minutes >= 2 }
}

/// Which of a bay's lines a scene shows, chosen the way the scene was.
pub fn line_index(scene: &Scene, lines: usize) -> usize {
    (scene.minutes as usize + scene.at.len()) % lines.max(1)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_reason_holds_for_twenty_minutes_then_the_draw_takes_over() {
        let since = 1_000_000;
        let early = scene_at(since, since + 5 * 60_000, None, Some(Feeling::Scared));
        assert_eq!(early.at, "rug");
        assert!(early.settled);
        assert!(!scene_at(since, since + 60_000, None, None).settled);
        // Past the hold, the reason stops mattering.
        let late = since + 30 * 60_000;
        assert_eq!(
            scene_at(since, late, None, Some(Feeling::Scared)),
            scene_at(since, late, None, None)
        );
    }

    #[test]
    fn the_favourite_bends_the_draw_without_owning_it() {
        let found: Vec<_> =
            (0..300).map(|m| scene_at(7_777, 7_777 + m * 60_000, Some("lamp"), None).at).collect();
        let lamp = found.iter().filter(|a| **a == "lamp").count();
        assert!(lamp > 150 && lamp < 300, "lamp {lamp} of 300");
        assert!(found.contains(&"chair") && found.contains(&"rug"));
    }

    #[test]
    fn looking_twice_in_a_minute_shows_the_same_thing() {
        assert_eq!(scene_at(5, 125_000, None, None), scene_at(5, 170_000, None, None));
    }
}
