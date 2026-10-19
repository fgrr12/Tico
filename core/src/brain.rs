//! The poll at the centre of `Companion.tsx`, the part that decides on its own:
//! when he dozes off and wakes, how he feels, and what he does unprompted. The
//! shell calls `tick` often (every quarter second) with what it senses and
//! draws the `Frame` that comes back; the core keeps the afternoon's memory
//! (which apps, how many switches) and every timer, so the shell stays a pair
//! of eyes and a body.
//!
//! Timers are checked on every call, so a 900ms reaction ends on time; the
//! decisions — whether to do something, and what — are taken on the 3.5s poll,
//! as in the Tauri build. Walking, talking and being handled come next.

use std::collections::HashSet;
use std::sync::{Arc, Mutex};

use crate::data::{
    Colours, Feeling, Sensed, TERRORS, dance_style, energy_at, feeling_from, match_app, palette,
};
use crate::moments::{MOMENTS, Step, by_feeling, dances, moment};

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
/// The poll's period.
const POLL: u64 = 3_500;
/// The floor between unprompted moments at full energy; it stretches as
/// energy falls, up to four times at 2am.
const MOMENT_EVERY: u64 = 14_000;
/// A `then` follows this long after its moment.
const THEN_AFTER: u64 = 1_900;
/// An interrupted chain is worth resuming for this long.
const RESUME_WITHIN: u64 = 25_000;
/// How often he loses the thread of what he was doing.
const LOSES_INTEREST: f64 = 0.3;

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

/// What a player says is on. `genre` and `bpm` are Apple Music only.
#[derive(Debug, Clone, PartialEq, uniffi::Record)]
pub struct Track {
    pub artist: String,
    pub song: String,
    pub genre: String,
    pub bpm: u32,
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
    /// Something playing, if anything.
    pub music: Option<Track>,
}

/// An effect to play once; a new `serial` means play it again, even when the
/// name is the same as last time.
#[derive(Debug, Clone, PartialEq, uniffi::Record)]
pub struct Effect {
    pub name: String,
    pub serial: u32,
}

/// Where the eyes point, each −1…1.
#[derive(Debug, Clone, Copy, PartialEq, uniffi::Record)]
pub struct Look {
    pub x: f64,
    pub y: f64,
}

/// What to draw.
#[derive(Debug, Clone, PartialEq, uniffi::Record)]
pub struct Frame {
    pub mood: Mood,
    pub feeling: Feeling,
    pub colours: Colours,
    pub effect: Option<Effect>,
    pub sitting: bool,
    pub look: Option<Look>,
    pub singing: bool,
}

struct App {
    name: String,
    since: u64,
}

struct State {
    mood: Mood,
    asleep: bool,
    /// A reaction holds the mood until then, then he is idle again.
    react_until: Option<u64>,
    feeling: Feeling,
    app: Option<App>,
    seen: HashSet<String>,
    switches: Vec<u64>,
    last_idle: u64,
    next_poll: u64,
    moment_at: u64,
    /// Steps of the running moment still to come, by when.
    pending: Vec<(u64, Step)>,
    /// A `then` due at a time, to run if he is free by then.
    then: Option<(u64, &'static str)>,
    /// An interrupted `then`, resumed by the poll while it is still fresh.
    chain: Option<(&'static str, u64)>,
    effect: Option<Effect>,
    sit_until: Option<u64>,
    look: Option<(Look, u64)>,
    /// What is playing, for the dances.
    music: Option<Track>,
    rng: u64,
}

#[derive(uniffi::Object)]
pub struct Brain {
    state: Mutex<State>,
}

impl Brain {
    /// A brain whose dice are fixed, for tests.
    pub fn seeded(seed: u64) -> Self {
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
                next_poll: 0,
                moment_at: 0,
                pending: Vec::new(),
                then: None,
                chain: None,
                effect: None,
                sit_until: None,
                look: None,
                music: None,
                rng: seed.max(1),
            }),
        }
    }
}

#[cfg(test)]
impl Brain {
    /// One that never has a moment, for tests about everything else.
    fn still() -> Self {
        let brain = Self::seeded(7);
        brain.state.lock().unwrap().moment_at = u64::MAX;
        brain
    }
}

impl Default for Brain {
    fn default() -> Self {
        let seed = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map_or(1, |d| d.as_nanos() as u64);
        Self::seeded(seed)
    }
}

#[uniffi::export]
impl Brain {
    #[uniffi::constructor]
    pub fn new() -> Arc<Self> {
        Arc::new(Self::default())
    }

    /// `now_ms` is any monotonic clock; only differences are used.
    pub fn tick(&self, now_ms: u64, senses: Senses) -> Frame {
        let mut s = self.state.lock().unwrap();
        let now = now_ms;

        // The cursor moved since the last tick: he wakes, glad you are back.
        if s.asleep && senses.idle_ms < s.last_idle {
            s.asleep = false;
            s.pending.clear();
            s.then = None;
            s.sit_until = None;
            s.mood = Mood::Happy;
            s.react_until = Some(now + WAKE_FOR);
            s.play("stretch");
        }
        s.last_idle = senses.idle_ms;

        s.music = senses.music.clone();
        s.expire(now);
        s.run_due(now);
        track_app(&mut s, now, senses.front_app.as_deref());

        if senses.idle_ms > SLEEP_AFTER {
            if !s.asleep && s.free() {
                s.asleep = true;
                s.mood = Mood::Sleep;
                s.sit_until = None;
                s.look = None;
            }
        } else if !s.asleep && s.mood == Mood::Idle {
            s.feel(now, &senses);
        }

        if now >= s.next_poll {
            s.next_poll = now + POLL;
            if !s.asleep && senses.idle_ms <= SLEEP_AFTER && s.free() {
                s.poll(now, senses.hour);
            }
        }

        let mut colours = palette(s.feeling);
        if s.mood == Mood::Sleep {
            colours.led = SLEEPING_LED.into();
        }
        Frame {
            mood: s.mood,
            feeling: s.feeling,
            colours,
            effect: s.effect.clone(),
            sitting: s.sit_until.is_some(),
            look: s.look.map(|(look, _)| look),
            singing: senses.music.is_some() && s.mood != Mood::Sleep,
        }
    }
}

impl State {
    /// Nothing running and nothing about to: the only time he picks a moment.
    fn free(&self) -> bool {
        self.mood == Mood::Idle && self.pending.is_empty() && self.then.is_none()
    }

    fn expire(&mut self, now: u64) {
        if self.react_until.is_some_and(|until| now >= until) {
            self.react_until = None;
            self.mood = Mood::Idle;
        }
        if self.sit_until.is_some_and(|until| now >= until) {
            self.sit_until = None;
        }
        if self.look.is_some_and(|(_, until)| now >= until) {
            self.look = None;
        }
    }

    /// Steps whose time has come, and a due `then`: run it if he is free, keep
    /// it as an intention if something got in the way.
    fn run_due(&mut self, now: u64) {
        let (due, later): (Vec<_>, Vec<_>) = self.pending.drain(..).partition(|(at, _)| *at <= now);
        self.pending = later;
        for (_, step) in due {
            self.apply(now, step);
        }
        if let Some((at, next)) = self.then
            && now >= at
        {
            self.then = None;
            if self.free() {
                // Sometimes he just does not finish it.
                let next = if self.chance(LOSES_INTEREST * 0.5) {
                    "shake"
                } else {
                    next
                };
                self.start(now, next);
            } else {
                self.chain = Some((next, now + RESUME_WITHIN));
            }
        }
    }

    fn feel(&mut self, now: u64, senses: &Senses) {
        let app_key = self.app.as_ref().and_then(|a| match_app(&a.name));
        let fresh = self
            .app
            .as_ref()
            .is_some_and(|a| now.saturating_sub(a.since) < NEW_FOR);
        self.feeling = feeling_from(&Sensed {
            neglect: senses.idle_ms as f64 / 60_000.0,
            attention: 0.0,
            dwell: self
                .app
                .as_ref()
                .map_or(0.0, |a| now.saturating_sub(a.since) as f64 / 3_600_000.0),
            switches: self.switches.len() as u32,
            drags: 0,
            new_app: fresh
                && self
                    .app
                    .as_ref()
                    .is_some_and(|a| !self.seen.contains(&a.name)),
            feared: fresh && app_key.as_deref().is_some_and(|k| TERRORS.contains(&k)),
            music: senses.music.is_some(),
            app_key,
            energy: energy_at(senses.hour),
            hour: senses.hour,
        });
    }

    /// The unprompted half of the poll: a resumed intention first, else maybe
    /// a moment — less often, and calmer, as the day runs down.
    fn poll(&mut self, now: u64, hour: u8) {
        if let Some((next, until)) = self.chain.take() {
            self.moment_at = now;
            let next = if now < until && !self.chance(LOSES_INTEREST) {
                next
            } else {
                "shake"
            };
            self.start(now, next);
            return;
        }

        let energy = energy_at(hour);
        let floor = (MOMENT_EVERY as f64 / energy.max(0.25)) as u64;
        if now.saturating_sub(self.moment_at) <= floor || !self.chance(0.4 + energy * 0.4) {
            return;
        }
        self.moment_at = now;

        let possible: Vec<_> = MOMENTS
            .iter()
            .filter(|m| m.min <= energy)
            .map(|m| m.key)
            .collect();
        let willing: Vec<_> = match by_feeling(self.feeling) {
            Some(keys) => possible
                .iter()
                .copied()
                .filter(|k| keys.contains(k))
                .collect(),
            None => possible.clone(),
        };
        // A feeling that leaves nothing possible falls back to everything.
        let pool = if willing.is_empty() {
            possible
        } else {
            willing
        };
        let key = pool[self.below(pool.len())];
        self.start(now, key);
    }

    fn start(&mut self, now: u64, key: &str) {
        let Some(m) = moment(key) else { return };
        for (at, step) in m.steps {
            if *at == 0 {
                self.apply(now, step.clone());
            } else {
                self.pending.push((now + at, step.clone()));
            }
        }
        if let Some(next) = m.then {
            self.then = Some((now + THEN_AFTER, next));
        }
    }

    fn apply(&mut self, now: u64, step: Step) {
        match step {
            Step::React { mood, effect, ms } => self.react(now, mood, effect, ms),
            Step::Sit { ms } => {
                let ms = ms.unwrap_or_else(|| 6_000 + self.below(9_000) as u64);
                self.sit_until = Some(now + ms);
            }
            Step::Look { x, y, ms } => self.look = Some((Look { x, y }, now + ms)),
            Step::Dance { scale } => {
                let style = self
                    .music
                    .as_ref()
                    .map(|t| dance_style(&t.artist, &t.song, &t.genre, t.bpm as f64));
                let options = dances(style);
                let (name, ms) = options[self.below(options.len())];
                self.react(now, Mood::Happy, Some(name), (ms as f64 * scale) as u64);
            }
        }
    }

    fn react(&mut self, now: u64, mood: Mood, effect: Option<&str>, ms: u64) {
        self.mood = mood;
        self.react_until = (ms > 0).then_some(now + ms);
        if let Some(name) = effect {
            self.play(name);
        }
    }

    fn play(&mut self, name: &str) {
        let serial = self.effect.as_ref().map_or(1, |e| e.serial.wrapping_add(1));
        self.effect = Some(Effect {
            name: name.to_string(),
            serial,
        });
    }

    /// xorshift64: dice for a pet, not for anything that matters.
    fn roll(&mut self) -> u64 {
        self.rng ^= self.rng << 13;
        self.rng ^= self.rng >> 7;
        self.rng ^= self.rng << 17;
        self.rng
    }

    fn chance(&mut self, p: f64) -> bool {
        (self.roll() % 1_000_000) as f64 / 1_000_000.0 < p
    }

    fn below(&mut self, n: usize) -> usize {
        (self.roll() % n as u64) as usize
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
            music: None,
        }
    }

    #[test]
    fn falls_asleep_after_ninety_seconds_and_wakes_happy() {
        let brain = Brain::still();
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
        let brain = Brain::still();
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
        let brain = Brain::still();
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
        let brain = Brain::still();
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

    /// Ticks every 250ms for `minutes`, the way the shell does, with the cursor
    /// moving often enough that he never sleeps; returns every effect played
    /// once the first half minute — when the app in front is new and he is
    /// curious about it — is over.
    fn live(brain: &Brain, hour: u8, music: Option<Track>, minutes: u64) -> Vec<String> {
        let mut seen = Vec::new();
        let mut last = 0;
        for i in 0..minutes * 240 {
            let now = i * 250;
            let frame = brain.tick(
                now,
                Senses {
                    idle_ms: now % 20_000,
                    hour,
                    front_app: Some("Finder".into()),
                    music: music.clone(),
                },
            );
            if let Some(effect) = frame.effect
                && effect.serial != last
            {
                last = effect.serial;
                if now > NEW_FOR {
                    seen.push(effect.name);
                }
            }
        }
        seen
    }

    #[test]
    fn he_does_things_on_his_own_more_at_ten_than_at_two() {
        let morning = live(&Brain::seeded(1), 10, None, 30);
        let night = live(&Brain::seeded(1), 2, None, 30);
        assert!(morning.len() >= 20, "only {} at 10am", morning.len());
        assert!(
            night.len() < morning.len() / 2,
            "{} at 2am against {} at 10am",
            night.len(),
            morning.len()
        );
    }

    #[test]
    fn a_sleepy_pet_only_does_sleepy_things() {
        // At 2am he is sleepy, and every effect comes from the sleepy list —
        // or is the shake of losing the thread halfway through a chain.
        let sleepy = ["yawn", "nod", "twitch", "settle", "shake", "blinkfast"];
        for effect in live(&Brain::seeded(3), 2, None, 60) {
            assert!(
                sleepy.contains(&effect.as_str()),
                "a sleepy pet played {effect}"
            );
        }
    }

    #[test]
    fn with_music_on_in_the_morning_he_dances_to_it() {
        let track = Track {
            artist: "Daft Punk".into(),
            song: "One More Time".into(),
            genre: String::new(),
            bpm: 0,
        };
        let effects = live(&Brain::seeded(5), 10, Some(track), 30);
        // Festive, and `dance_style` makes this one a fast song: pogo and jig.
        let dances = [
            "pogo",
            "jig",
            "bounce",
            "hop",
            "spin",
            "bow",
            "shake",
            "blinkfast",
        ];
        assert!(
            effects.iter().any(|e| e == "pogo" || e == "jig"),
            "{effects:?}"
        );
        for effect in &effects {
            assert!(
                dances.contains(&effect.as_str()),
                "festive pet played {effect}"
            );
        }
    }

    #[test]
    fn a_yawn_becomes_a_sit() {
        let brain = Brain::still();
        let s = || Senses {
            idle_ms: 0,
            hour: 14,
            front_app: None,
            music: None,
        };
        brain.tick(0, s());
        brain.state.lock().unwrap().start(0, "yawn");
        let yawning = brain.tick(100, s());
        assert_eq!(yawning.mood, Mood::Yawn);
        assert_eq!(yawning.effect.unwrap().name, "yawn");
        // The yawn's mood ends at 1.5s; the sit follows at 1.9s, unless he
        // lost interest and shook it off instead.
        let after = brain.tick(2_000, s());
        assert!(after.sitting || after.effect.unwrap().name == "shake");
    }

    #[test]
    fn music_makes_him_sing_but_not_in_his_sleep() {
        let brain = Brain::still();
        let track = Some(Track {
            artist: "a".into(),
            song: "b".into(),
            genre: String::new(),
            bpm: 0,
        });
        assert!(
            brain
                .tick(
                    0,
                    Senses {
                        idle_ms: 0,
                        hour: 14,
                        front_app: None,
                        music: track.clone()
                    }
                )
                .singing
        );
        assert!(
            !brain
                .tick(
                    100_000,
                    Senses {
                        idle_ms: 100_000,
                        hour: 14,
                        front_app: None,
                        music: track
                    }
                )
                .singing
        );
    }
}
