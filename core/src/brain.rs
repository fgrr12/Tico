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
use crate::moments::{MOMENTS, Step, Travel, by_feeling, dances, moment};

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
/// Walking pace, in points a second, before energy slows it.
const WALK_SPEED: f64 = 74.0;
const FALL_SPEED: f64 = 1_100.0;
/// Floors for wandering off and for errands, stretched by low energy.
const WANDER_EVERY: u64 = 30_000;
const ERRAND_EVERY: u64 = 190_000;
/// `--pet-width`: how much of the strip he takes up.
pub const PET_WIDTH: f64 = 92.0;

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
    /// Width of the strip he walks, in points.
    pub strip_width: f64,
    /// The cursor's x on the strip, if it is over that screen.
    pub cursor_x: Option<f64>,
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
    /// Where he is going: the left edge of his box on the strip, and height off
    /// the floor, in points. The shell moves him there over `move_ms`, and only
    /// starts a move when `move_serial` changes; 0ms is a jump.
    pub x: f64,
    pub lift: f64,
    pub move_ms: u64,
    pub move_serial: u32,
    pub walking: bool,
    pub flying: bool,
    /// Which way he last travelled; flying leans into it.
    pub facing_right: bool,
}

/// What happens when he gets where he was going.
#[derive(Debug, Clone, Copy, PartialEq)]
enum After {
    Nothing,
    /// Back to `x`, after a short pause (pacing).
    Back {
        x: f64,
        speed: f64,
    },
    /// Gone off an edge; reappear from the other one.
    Reappear {
        went_right: bool,
    },
    /// Up in the air at `x`: come down.
    Land {
        x: f64,
    },
    Landed,
    /// The end of an errand: there was nothing there.
    Arrive,
}

#[derive(Debug, Clone, Copy)]
struct Move {
    until: u64,
    after: After,
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
    /// Left edge on the strip; `None` until the first tick says how wide it is.
    x: Option<f64>,
    lift: f64,
    width: f64,
    cursor_x: Option<f64>,
    energy: f64,
    moving: Option<Move>,
    move_ms: u64,
    move_serial: u32,
    flying: bool,
    facing_right: bool,
    /// Briefly allowed all the way off the strip, going round the back.
    crossing: bool,
    wander_at: u64,
    errand_at: u64,
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
                x: None,
                lift: 0.0,
                width: 0.0,
                cursor_x: None,
                energy: 1.0,
                moving: None,
                move_ms: 0,
                move_serial: 0,
                flying: false,
                facing_right: true,
                crossing: false,
                wander_at: 0,
                errand_at: 0,
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
        s.width = senses.strip_width;
        s.cursor_x = senses.cursor_x;
        s.energy = energy_at(senses.hour);
        if s.x.is_none() {
            // A little way in from the left, where the Tauri build starts him the
            // first time too.
            s.x = Some((s.max_x() * 0.15).max(0.0));
        }
        if let Some(m) = s.moving
            && now >= m.until
        {
            s.moving = None;
            s.arrived(now, m.after);
        }
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
                s.poll(now, senses.hour, senses.idle_ms);
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
            x: s.x.unwrap_or(0.0),
            lift: s.lift,
            move_ms: s.move_ms,
            move_serial: s.move_serial,
            walking: s.moving.is_some() && !s.flying,
            flying: s.flying,
            facing_right: s.facing_right,
        }
    }
}

impl State {
    /// Nothing running and nothing about to: the only time he picks a moment.
    fn free(&self) -> bool {
        self.mood == Mood::Idle
            && self.pending.is_empty()
            && self.then.is_none()
            && self.moving.is_none()
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
    fn poll(&mut self, now: u64, hour: u8, idle_ms: u64) {
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

        // A stroll, when you have left him be for a few seconds.
        if idle_ms > 8_000
            && now.saturating_sub(self.wander_at) > (WANDER_EVERY as f64 / energy.max(0.25)) as u64
        {
            self.wander_at = now;
            self.wander(now);
            return;
        }

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
            Step::Go(travel) => self.travel(now, travel),
            Step::WalkTo { x, speed } => {
                self.crossing = false;
                self.walk(now, x, 0.0, speed, After::Nothing);
            }
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

    fn max_x(&self) -> f64 {
        (self.width - PET_WIDTH).max(1.0)
    }

    fn here(&self) -> f64 {
        self.x.unwrap_or(0.0)
    }

    /// Off the strip is allowed only while crossing, and then all the way.
    fn clamp(&self, x: f64) -> f64 {
        let over = if self.crossing { PET_WIDTH } else { 0.0 };
        x.clamp(-over, self.max_x() + over)
    }

    /// Travel at `speed` points a second — slower when tired — with the
    /// duration from the distance, the way the Tauri build's transition did.
    fn walk(&mut self, now: u64, x: f64, lift: f64, speed: f64, after: After) {
        let speed = speed * (0.65 + self.energy * 0.35);
        let (from, to) = (self.here(), self.clamp(x));
        let distance = ((to - from).powi(2) + (lift - self.lift).powi(2)).sqrt();
        // Nowhere to go, but what comes after still happens: it is what ends
        // flying and crossing, and swallowing it strands them on forever.
        if distance < 3.0 {
            self.arrived(now, after);
            return;
        }
        let ms = ((distance / speed) * 1_000.0).clamp(260.0, 6_000.0) as u64;
        self.x = Some(to);
        self.lift = lift;
        if to != from {
            self.facing_right = to > from;
        }
        self.move_ms = ms;
        self.move_serial = self.move_serial.wrapping_add(1);
        self.moving = Some(Move {
            until: now + ms,
            after,
        });
        self.sit_until = None;
        self.look = Some((
            Look {
                x: if to < from { -0.9 } else { 0.9 },
                y: 0.0,
            },
            now + ms,
        ));
    }

    /// Straight there, no walk: the far side of a crossing.
    fn jump(&mut self, x: f64) {
        self.x = Some(x);
        self.move_ms = 0;
        self.move_serial = self.move_serial.wrapping_add(1);
    }

    fn arrived(&mut self, now: u64, after: After) {
        match after {
            After::Nothing => {}
            After::Back { x, speed } => self.pending.push((now + 400, Step::WalkTo { x, speed })),
            After::Reappear { went_right } => {
                self.jump(if went_right { -PET_WIDTH } else { self.width });
                let inset = 50.0 + self.below(150) as f64;
                let landing = if went_right {
                    inset
                } else {
                    self.max_x() - inset
                };
                let wait = 700 + self.below(1_400) as u64;
                self.pending.push((
                    now + wait,
                    Step::WalkTo {
                        x: landing,
                        speed: WALK_SPEED * 1.6,
                    },
                ));
            }
            After::Land { x } => self.walk(now, x, 0.0, FALL_SPEED, After::Landed),
            After::Landed => {
                self.flying = false;
                self.react(now, Mood::Wow, Some("land"), 900);
            }
            After::Arrive => {
                self.react(now, Mood::Watching, None, 2_000);
                self.look = Some((Look { x: 0.0, y: 0.4 }, now + 1_600));
            }
        }
    }

    fn wander(&mut self, now: u64) {
        let from = self.here();
        let stride = 90.0 + self.below(220) as f64;
        let reachable: Vec<f64> = [from - stride, from + stride]
            .into_iter()
            .map(|x| self.clamp(x))
            .filter(|x| (x - from).abs() > 20.0)
            .collect();
        if !reachable.is_empty() {
            let x = reachable[self.below(reachable.len())];
            self.walk(now, x, 0.0, WALK_SPEED, After::Nothing);
        }
    }

    fn travel(&mut self, now: u64, travel: Travel) {
        let here = self.here();
        let far = if here < self.max_x() / 2.0 {
            self.max_x()
        } else {
            0.0
        };
        match travel {
            Travel::Pace => {
                let step = if self.chance(0.5) { -110.0 } else { 110.0 };
                let speed = WALK_SPEED * 1.3;
                self.walk(now, here + step, 0.0, speed, After::Back { x: here, speed });
            }
            Travel::Chase => {
                if let Some(cursor) = self.cursor_x {
                    let step = (cursor - PET_WIDTH / 2.0 - here).clamp(-140.0, 140.0);
                    self.walk(now, here + step, 0.0, WALK_SPEED * 1.4, After::Nothing);
                }
            }
            Travel::Edge => {
                let edge = if here < self.max_x() / 2.0 {
                    0.0
                } else {
                    self.max_x()
                };
                self.walk(now, edge, 0.0, WALK_SPEED * 1.15, After::Nothing);
            }
            Travel::Behind => {
                let went_right = here >= self.width / 2.0;
                self.crossing = true;
                let off = if went_right { self.width } else { -PET_WIDTH };
                self.walk(
                    now,
                    off,
                    0.0,
                    WALK_SPEED * 1.6,
                    After::Reappear { went_right },
                );
            }
            Travel::Errand => {
                if now.saturating_sub(self.errand_at) < ERRAND_EVERY && self.errand_at != 0 {
                    return;
                }
                self.errand_at = now;
                let wanted = self.below(self.max_x().max(1.0) as usize) as f64;
                // Far enough to be a journey; a step is not an errand.
                let target = if (wanted - here).abs() < 200.0 {
                    far
                } else {
                    wanted
                };
                self.walk(now, target, 0.0, WALK_SPEED, After::Arrive);
            }
            Travel::Rocket => {
                self.flying = true;
                self.react(now, Mood::Wow, None, 2_400);
                self.walk(now, far, 60.0, 900.0, After::Land { x: far });
            }
            Travel::Flee => {
                self.react(now, Mood::Scared, None, 2_600);
                self.walk(now, far, 0.0, WALK_SPEED * 3.0, After::Nothing);
            }
            Travel::Skip => {
                let step = if self.chance(0.5) { -90.0 } else { 90.0 };
                self.walk(now, here + step, 0.0, WALK_SPEED * 1.6, After::Nothing);
            }
        }
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
            strip_width: 1512.0,
            cursor_x: None,
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
                    strip_width: 1512.0,
                    cursor_x: None,
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
            "land",
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
            strip_width: 1512.0,
            cursor_x: None,
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
                        music: track.clone(),
                        strip_width: 1512.0,
                        cursor_x: None
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
                        music: track,
                        strip_width: 1512.0,
                        cursor_x: None
                    }
                )
                .singing
        );
    }

    fn walker(seed: u64) -> Brain {
        Brain::seeded(seed)
    }

    fn at(brain: &Brain, now: u64) -> Frame {
        brain.tick(
            now,
            Senses {
                idle_ms: 10_000,
                hour: 10,
                front_app: None,
                music: None,
                strip_width: 1512.0,
                cursor_x: Some(700.0),
            },
        )
    }

    #[test]
    fn he_walks_on_his_own_and_stays_on_the_strip() {
        let brain = walker(11);
        let mut moves = 0;
        let mut last = 0;
        for i in 0..(20 * 240) {
            let frame = at(&brain, i * 250);
            if frame.move_serial != last {
                last = frame.move_serial;
                moves += 1;
                // Off the strip only while going round the back, and then fully.
                assert!(
                    frame.x >= -PET_WIDTH && frame.x <= 1512.0,
                    "x = {}",
                    frame.x
                );
            }
        }
        assert!(moves >= 10, "only {moves} moves in 20 minutes");
    }

    #[test]
    fn going_behind_comes_back_from_the_other_side() {
        let brain = walker(1);
        at(&brain, 0);
        brain.state.lock().unwrap().x = Some(1300.0);
        brain.state.lock().unwrap().travel(0, Travel::Behind);
        let gone = at(&brain, 1);
        assert_eq!(gone.x, 1512.0, "walked off the right edge");
        // Arrives, jumps to the far side, and walks back in from the left.
        let mut t = 1;
        let mut seen_jump = false;
        while t < 30_000 {
            t += 250;
            let f = at(&brain, t);
            if f.move_ms == 0 && f.x == -PET_WIDTH {
                seen_jump = true;
            }
            if seen_jump && f.x > 0.0 && !f.walking {
                assert!(f.x < 300.0, "came back in at {}", f.x);
                return;
            }
        }
        panic!("never came back (jumped: {seen_jump})");
    }

    #[test]
    fn a_rocket_flies_and_lands() {
        let brain = Brain::still();
        at(&brain, 0);
        brain.state.lock().unwrap().travel(0, Travel::Rocket);
        let up = at(&brain, 1);
        assert!(up.flying && up.lift == 60.0);
        let mut t = 1;
        loop {
            t += 250;
            let f = at(&brain, t);
            if !f.flying {
                assert_eq!(f.lift, 0.0);
                assert_eq!(f.effect.unwrap().name, "land");
                return;
            }
            assert!(t < 10_000, "still flying");
        }
    }

    #[test]
    fn pacing_comes_back_to_where_it_started() {
        let brain = Brain::still();
        at(&brain, 0);
        let start = at(&brain, 1).x;
        brain.state.lock().unwrap().travel(1, Travel::Pace);
        assert!((at(&brain, 2).x - start).abs() > 100.0);
        let mut last = at(&brain, 2);
        for t in (250..8_000).step_by(250) {
            last = at(&brain, t);
        }
        assert!((last.x - start).abs() < 1.0);
    }
}
