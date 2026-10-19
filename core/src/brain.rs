//! The poll at the centre of `Companion.tsx`, the part that decides on its own:
//! when he dozes off, when he wakes, and how he feels. The shell calls `tick`
//! every few seconds with what it senses and draws what comes back; the core
//! keeps the memory of the afternoon (which apps, how many switches), so the
//! shell stays a pair of eyes.
//!
//! Only the first slice is here: sleep, waking, and the feeling ladder fed by
//! the applications in front. Moments, walking, talking and being handled come
//! next, into this same `tick`.

use std::collections::HashSet;
use std::sync::{Arc, Mutex};

use crate::data::{Colours, Feeling, Sensed, TERRORS, energy_at, feeling_from, match_app, palette};

/// Falls asleep after this long with no cursor movement anywhere on screen.
const SLEEP_AFTER: u64 = 90_000;
/// How long the happy stretch on waking lasts.
const WAKE_FOR: u64 = 1_800;
/// Switches counted for `restless`.
const SWITCH_WINDOW: u64 = 120_000;
/// An app is new to him for this long, then he has seen it.
const NEW_FOR: u64 = 30_000;
/// The LED while he sleeps, whatever he feels.
const SLEEPING_LED: &str = "#3b4256";

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, uniffi::Enum)]
pub enum Mood {
    Idle,
    Happy,
    Thinking,
    Error,
    Wow,
    Love,
    Dizzy,
    Sleep,
    Held,
    Watching,
    Muted,
    Yawn,
    Scared,
}

/// What the shell sensed since the last tick.
#[derive(Debug, Clone, uniffi::Record)]
pub struct Senses {
    /// Milliseconds since the cursor last moved.
    pub idle_ms: u64,
    /// Local hour, 0–23.
    pub hour: u8,
    /// The frontmost application's name, which needs no permission anywhere.
    pub front_app: Option<String>,
    pub music: bool,
}

/// What to draw.
#[derive(Debug, Clone, PartialEq, uniffi::Record)]
pub struct Frame {
    pub mood: Mood,
    pub feeling: Feeling,
    pub colours: Colours,
}

struct App {
    name: String,
    since: u64,
}

struct State {
    mood: Mood,
    asleep: bool,
    /// A reaction (waking up) holds the mood until then, then he is idle again.
    react_until: Option<u64>,
    feeling: Feeling,
    app: Option<App>,
    seen: HashSet<String>,
    switches: Vec<u64>,
    last_idle: u64,
}

#[derive(uniffi::Object)]
pub struct Brain {
    state: Mutex<State>,
}

impl Default for Brain {
    fn default() -> Self {
        Self {
            state: Mutex::new(State {
                mood: Mood::Idle,
                asleep: false,
                react_until: None,
                feeling: Feeling::Content,
                app: None,
                seen: HashSet::new(),
                switches: Vec::new(),
                last_idle: 0,
            }),
        }
    }
}

#[uniffi::export]
impl Brain {
    #[uniffi::constructor]
    pub fn new() -> Arc<Self> {
        Arc::new(Self::default())
    }

    /// One turn of the poll. `now_ms` is any monotonic clock; only differences
    /// are used.
    pub fn tick(&self, now_ms: u64, senses: Senses) -> Frame {
        let mut s = self.state.lock().unwrap();
        let now = now_ms;

        // The cursor moved since the last tick: he wakes, glad you are back.
        if s.asleep && senses.idle_ms < s.last_idle {
            s.asleep = false;
            s.mood = Mood::Happy;
            s.react_until = Some(now + WAKE_FOR);
        }
        s.last_idle = senses.idle_ms;
        if s.react_until.is_some_and(|until| now >= until) {
            s.react_until = None;
            s.mood = Mood::Idle;
        }

        track_app(&mut s, now, senses.front_app.as_deref());

        if senses.idle_ms > SLEEP_AFTER {
            if !s.asleep && s.mood == Mood::Idle {
                s.asleep = true;
                s.mood = Mood::Sleep;
            }
        } else if !s.asleep && s.mood == Mood::Idle {
            let app_key = s.app.as_ref().and_then(|a| match_app(&a.name));
            let fresh = s
                .app
                .as_ref()
                .is_some_and(|a| now.saturating_sub(a.since) < NEW_FOR);
            s.feeling = feeling_from(&Sensed {
                neglect: senses.idle_ms as f64 / 60_000.0,
                attention: 0.0,
                dwell: s
                    .app
                    .as_ref()
                    .map_or(0.0, |a| now.saturating_sub(a.since) as f64 / 3_600_000.0),
                switches: s.switches.len() as u32,
                drags: 0,
                new_app: fresh && s.app.as_ref().is_some_and(|a| !s.seen.contains(&a.name)),
                feared: fresh && app_key.as_deref().is_some_and(|k| TERRORS.contains(&k)),
                music: senses.music,
                app_key,
                energy: energy_at(senses.hour),
                hour: senses.hour,
            });
        }

        let mut colours = palette(s.feeling);
        if s.mood == Mood::Sleep {
            colours.led = SLEEPING_LED.into();
        }
        Frame {
            mood: s.mood,
            feeling: s.feeling,
            colours,
        }
    }
}

/// Which app is in front and since when, the recent switches, and the apps he
/// has had half a minute to get used to. All of it dies with the process.
fn track_app(s: &mut State, now: u64, front: Option<&str>) {
    let changed = match (&s.app, front) {
        (Some(app), Some(name)) => app.name != name,
        (None, Some(_)) => true,
        _ => false,
    };
    if changed {
        if s.app.is_some() {
            s.switches.push(now);
        }
        s.app = front.map(|name| App {
            name: name.to_string(),
            since: now,
        });
    }
    s.switches.retain(|at| now - at < SWITCH_WINDOW);
    if let Some(app) = &s.app
        && now.saturating_sub(app.since) >= NEW_FOR
    {
        s.seen.insert(app.name.clone());
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn senses(idle_ms: u64, app: &str) -> Senses {
        Senses {
            idle_ms,
            hour: 14,
            front_app: Some(app.into()),
            music: false,
        }
    }

    #[test]
    fn falls_asleep_after_ninety_seconds_and_wakes_happy() {
        let brain = Brain::default();
        assert_eq!(brain.tick(0, senses(0, "Finder")).mood, Mood::Idle);
        assert_eq!(
            brain.tick(89_000, senses(89_000, "Finder")).mood,
            Mood::Idle
        );
        let asleep = brain.tick(91_000, senses(91_000, "Finder"));
        assert_eq!(asleep.mood, Mood::Sleep);
        assert_eq!(asleep.colours.led, SLEEPING_LED);
        assert_eq!(
            brain.tick(200_000, senses(200_000, "Finder")).mood,
            Mood::Sleep
        );
        // The cursor moves.
        assert_eq!(brain.tick(203_500, senses(500, "Finder")).mood, Mood::Happy);
        assert_eq!(
            brain.tick(207_000, senses(4_000, "Finder")).mood,
            Mood::Idle
        );
    }

    #[test]
    fn a_new_app_is_curious_for_half_a_minute() {
        let brain = Brain::default();
        brain.tick(0, senses(0, "Finder"));
        brain.tick(31_000, senses(0, "Finder"));
        assert_eq!(
            brain.tick(40_000, senses(0, "Obsidian")).feeling,
            Feeling::Curious
        );
        assert_eq!(
            brain.tick(75_000, senses(0, "Obsidian")).feeling,
            Feeling::Content
        );
        // Seen now: coming back to it is not new.
        brain.tick(80_000, senses(0, "Finder"));
        assert_ne!(
            brain.tick(85_000, senses(0, "Obsidian")).feeling,
            Feeling::Curious
        );
    }

    #[test]
    fn teams_frightens_him_and_the_terminal_takes_him_home() {
        let brain = Brain::default();
        assert_eq!(
            brain.tick(0, senses(0, "Microsoft Teams")).feeling,
            Feeling::Scared
        );
        assert_eq!(
            brain.tick(40_000, senses(0, "Microsoft Teams")).feeling,
            Feeling::Content
        );
        brain.tick(41_000, senses(0, "Terminal"));
        assert_eq!(
            brain.tick(80_000, senses(0, "Terminal")).feeling,
            Feeling::Nostalgic
        );
    }

    #[test]
    fn switching_a_lot_makes_him_restless() {
        let brain = Brain::default();
        // Two apps he has had time to get used to, so neither is new.
        brain.tick(0, senses(0, "Finder"));
        brain.tick(31_000, senses(0, "Finder"));
        brain.tick(32_000, senses(0, "Notes"));
        brain.tick(63_000, senses(0, "Notes"));
        for i in 0..7u64 {
            brain.tick(
                64_000 + i * 1_000,
                senses(0, if i % 2 == 0 { "Finder" } else { "Notes" }),
            );
        }
        assert_eq!(
            brain.tick(71_000, senses(0, "Finder")).feeling,
            Feeling::Restless
        );
        // Two minutes later the switches have aged out.
        assert_eq!(
            brain.tick(200_000, senses(0, "Finder")).feeling,
            Feeling::Content
        );
    }
}
