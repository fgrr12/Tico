//! The unprompted things he does, from the `moments` table in `Companion.tsx`.
//!
//! A moment is a short script of steps — take a mood, play an effect, sit, look
//! somewhere — with an energy floor and maybe a `then` that follows a beat
//! later. The brain decides when one happens and which; the steps are what the
//! shell gets to see, as state in the `Frame`.
//!
//! Two of the Tauri build's moments are not here yet: `house` (the burrow) and
//! `climb` (a ladder and the ledges of your windows). Both draw things the
//! native shell does not have; a feeling that lists them picks from the rest.

use crate::brain::Mood;
use crate::data::{DanceStyle, Feeling};

/// The moments that cover ground. Each is a little itinerary the brain runs,
/// because where he ends up depends on where he is.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Travel {
    /// A step aside and back.
    Pace,
    /// Towards the cursor, then a stare.
    Chase,
    /// To the nearer edge, then a lean.
    Edge,
    /// Off one edge and back from the other, having gone to look.
    Behind,
    /// Somewhere far, for a reason he would not give.
    Errand,
    /// All the way across, off the ground.
    Rocket,
    /// Away, fast.
    Flee,
    /// A hop-step aside.
    Skip,
}

/// One thing a moment does, `at` milliseconds after it starts.
#[derive(Debug, Clone, PartialEq)]
pub enum Step {
    /// Take `mood` for `ms` (0 holds it), playing `effect` if there is one.
    React {
        mood: Mood,
        effect: Option<&'static str>,
        ms: u64,
    },
    /// Sit down for `ms`, or a random 6–15s when `None`.
    Sit {
        ms: Option<u64>,
    },
    /// Look at (x, y), each −1…1, for `ms`.
    Look {
        x: f64,
        y: f64,
        ms: u64,
    },
    /// A dance chosen by what is playing, its length scaled by `scale`.
    Dance {
        scale: f64,
    },
    Go(Travel),
    /// Walk to `x` (the second leg of a pace, the way back from behind).
    WalkTo {
        x: f64,
        speed: f64,
    },
}

pub struct Moment {
    pub key: &'static str,
    /// The least energy he needs to consider it.
    pub min: f64,
    pub steps: &'static [(u64, Step)],
    pub then: Option<&'static str>,
}

use Mood::*;
use Step::*;

const fn react(mood: Mood, effect: &'static str, ms: u64) -> Step {
    React {
        mood,
        effect: Some(effect),
        ms,
    }
}

const fn hold(mood: Mood, ms: u64) -> Step {
    React {
        mood,
        effect: None,
        ms,
    }
}

macro_rules! moment {
    ($key:literal, $min:expr, [$($at:expr => $step:expr),* $(,)?] $(, then $then:literal)?) => {
        Moment { key: $key, min: $min, steps: &[$(($at, $step)),*], then: moment!(@then $($then)?) }
    };
    (@then) => { None };
    (@then $then:literal) => { Some($then) };
}

pub const MOMENTS: &[Moment] = &[
    moment!("yawn", 0.0, [0 => react(Yawn, "yawn", 1_500)], then "sit"),
    moment!("sit", 0.0, [0 => Sit { ms: None }]),
    moment!("slump", 0.0, [0 => Sit { ms: Some(12_000) }, 0 => hold(Sleep, 4_000)]),
    moment!("nod", 0.0, [0 => react(Sleep, "nod", 1_800)]),
    moment!("stare", 0.0, [0 => hold(Idle, 3_000), 0 => Look { x: 0.0, y: 0.2, ms: 3_000 }]),
    moment!("stretch", 0.3, [0 => react(Happy, "stretch", 1_200)]),
    moment!("scan", 0.3, [0 => Look { x: -1.0, y: -0.2, ms: 700 }, 720 => Look { x: 1.0, y: -0.2, ms: 700 }]),
    moment!("blinkfast", 0.3, [0 => react(Idle, "blinkfast", 900)]),
    moment!("lean", 0.3, [0 => react(Idle, "lean", 2_200)]),
    moment!("hiccup", 0.35, [0 => react(Wow, "hiccup", 800)]),
    moment!("shake", 0.35, [0 => react(Idle, "shake", 900)], then "blinkfast"),
    moment!("ceiling", 0.35, [0 => hold(Watching, 1_800), 0 => Look { x: 0.0, y: -1.0, ms: 1_800 }]),
    // Looks straight out: the cursor is not one of his senses yet.
    moment!("watchyou", 0.4, [0 => hold(Watching, 2_600), 0 => Look { x: 0.0, y: 0.0, ms: 2_600 }]),
    moment!("sneeze", 0.45, [0 => react(Wow, "sneeze", 900)], then "shake"),
    moment!("spin", 0.5, [0 => react(Happy, "spin", 1_000)]),
    moment!("bounce", 0.55, [0 => react(Happy, "bounce", 1_300)]),
    moment!("hop", 0.55, [0 => react(Happy, "hop", 900)]),
    moment!("dance", 0.7, [0 => Dance { scale: 1.0 }]),
    moment!("jig", 0.75, [0 => Dance { scale: 0.85 }], then "bounce"),
    moment!("showoff", 0.8, [0 => Dance { scale: 0.8 }, 0 => hold(Love, 1_400)], then "hop"),
    moment!("dream", 0.0, [0 => react(Sleep, "twitch", 1_400)]),
    moment!("settle", 0.0, [0 => react(Idle, "settle", 1_100)]),
    moment!("groom", 0.2, [0 => react(Idle, "groom", 1_600)]),
    moment!("peekover", 0.35, [0 => react(Watching, "peek", 1_800), 0 => Look { x: 0.0, y: 1.0, ms: 1_800 }]),
    moment!("inspect", 0.35, [0 => react(Watching, "inspect", 1_600), 0 => Look { x: 0.0, y: 0.8, ms: 1_600 }]),
    moment!(
        "doubletake",
        0.4,
        [0 => Look { x: -1.0, y: 0.0, ms: 500 }, 520 => Look { x: 0.9, y: -0.3, ms: 900 }, 520 => react(Wow, "jolt", 900)]
    ),
    moment!("startle", 0.45, [0 => react(Wow, "startle", 900)], then "blinkfast"),
    moment!("trip", 0.55, [0 => react(Wow, "trip", 1_100)], then "shake"),
    moment!("bow", 0.6, [0 => react(Happy, "bow", 1_400)]),
    // The hand gesture is not drawn natively yet; the happy face is.
    moment!("wave", 0.6, [0 => hold(Happy, 1_600)]),
    moment!("cower", 0.0, [0 => react(Scared, "shiver", 2_200), 0 => Sit { ms: Some(5_000) }]),
    moment!("pace", 0.6, [0 => Go(Travel::Pace)]),
    moment!("chase", 0.6, [0 => Go(Travel::Chase)], then "stare"),
    moment!("edge", 0.3, [0 => Go(Travel::Edge)], then "lean"),
    moment!("behind", 0.5, [0 => Go(Travel::Behind)]),
    moment!("errand", 0.35, [0 => Go(Travel::Errand)]),
    moment!("rocket", 0.75, [0 => Go(Travel::Rocket)]),
    moment!("flee", 0.3, [0 => Go(Travel::Flee)]),
    moment!("skip", 0.7, [0 => Go(Travel::Skip), 0 => react(Happy, "bounce", 1_300)]),
];

pub fn moment(key: &str) -> Option<&'static Moment> {
    MOMENTS.iter().find(|m| m.key == key)
}

/// The feeling narrows the list before energy does; `None` is anything.
/// Keys that are not in `MOMENTS` (the travelling ones) are simply never found.
pub fn by_feeling(feeling: Feeling) -> Option<&'static [&'static str]> {
    use Feeling::*;
    Some(match feeling {
        Content => return None,
        Bored => &[
            "pace", "stare", "ceiling", "scan", "lean", "sit", "hiccup", "edge", "peekover",
            "inspect", "groom", "behind", "house", "climb", "sneeze",
        ],
        Lonely => &[
            "stare", "watchyou", "sit", "slump", "ceiling", "edge", "settle", "wave", "house",
        ],
        Pleased => &[
            "hop", "bounce", "dance", "jig", "showoff", "spin", "stretch", "bow", "skip", "wave",
            "rocket",
        ],
        Worried => &[
            "watchyou", "stare", "lean", "sit", "scan", "settle", "groom",
        ],
        Restless => &[
            "pace",
            "shake",
            "hiccup",
            "bounce",
            "spin",
            "scan",
            "startle",
            "doubletake",
            "trip",
            "skip",
            "errand",
        ],
        Rattled => &[
            "shake",
            "stare",
            "sit",
            "blinkfast",
            "lean",
            "settle",
            "startle",
        ],
        Smug => &[
            "showoff", "spin", "stretch", "dance", "watchyou", "bow", "admire", "adjust",
        ],
        Curious => &[
            "ceiling",
            "scan",
            "watchyou",
            "lean",
            "chase",
            "peekover",
            "inspect",
            "doubletake",
            "behind",
            "climb",
            "errand",
        ],
        Sleepy => &[
            "yawn", "nod", "slump", "sit", "stare", "dream", "settle", "house",
        ],
        Festive => &[
            "dance", "jig", "bounce", "hop", "spin", "skip", "bow", "wave", "rocket",
        ],
        Nostalgic => &[
            "stare", "ceiling", "sit", "scan", "lean", "settle", "inspect", "sneeze",
        ],
        Scared => &[
            "flee",
            "cower",
            "startle",
            "shake",
            "stare",
            "blinkfast",
            "house",
        ],
    })
}

/// Effect and length per dance style; `None` is dancing to nothing.
pub fn dances(style: Option<DanceStyle>) -> &'static [(&'static str, u64)] {
    use DanceStyle::*;
    match style {
        None => &[("dance", 1_700), ("jig", 1_600), ("bounce", 1_300)],
        Some(Heavy) => &[("stomp", 1_500), ("bounce", 1_300)],
        Some(Fast) => &[("pogo", 1_000), ("jig", 1_500)],
        Some(Smooth) => &[("groove", 2_000), ("sway", 2_300)],
        Some(Slow) => &[("sway", 2_600), ("groove", 2_400)],
        Some(Bright) => &[("dance", 1_700), ("hop", 900), ("spin", 1_000)],
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn every_chain_leads_somewhere_that_exists() {
        for m in MOMENTS {
            if let Some(next) = m.then {
                assert!(moment(next).is_some(), "{} → {next}", m.key);
            }
        }
    }

    #[test]
    fn every_feeling_has_something_to_do_that_stays_put() {
        use Feeling::*;
        for feeling in [
            Bored, Lonely, Pleased, Worried, Restless, Rattled, Smug, Curious, Sleepy, Festive,
            Nostalgic, Scared,
        ] {
            let here = by_feeling(feeling)
                .unwrap()
                .iter()
                .filter(|k| moment(k).is_some())
                .count();
            assert!(here >= 3, "{feeling:?} has only {here}");
        }
    }
}
