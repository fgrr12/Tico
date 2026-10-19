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

use std::collections::{HashMap, HashSet};
use std::sync::{Arc, Mutex};

use crate::copy::Copy;
use crate::data::{
    Colours, Feeling, Sensed, TERRORS, TimeOfDay, dance_style, energy_at, feeling_from, match_app,
    palette, time_of_day,
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
/// Cursor this close to his middle and he watches it.
const NOTICE_WITHIN: f64 = 220.0;
/// Hover on him this long and it counts as petting.
const PET_AFTER: u64 = 1_600;
/// Movement before a press becomes a drag rather than a click.
const DRAG_THRESHOLD: f64 = 5.0;
/// Milliseconds a character takes to appear, before the feeling changes it:
/// delivery is most of what tone is.
const SAY_REVEAL: u64 = 16;
/// The floor between unprompted remarks.
const CHATTER_EVERY: u64 = 50_000;
/// Gone longer than this and waking up is "you're back", not "I'm awake".
const AWAY_AFTER: u64 = 120_000;
/// Minutes in one app worth remarking on, once each.
const DWELL_AT: [u64; 2] = [45, 120];
/// How long after an app comes to the front he says something about it.
const NOTICE_AFTER: u64 = 1_800;
const APP_LINE_EVERY: u64 = 180_000;
const APP_REPEAT_AFTER: u64 = 900_000;
const SWITCH_LIMIT: usize = 6;
const SWITCH_COOLDOWN: u64 = 900_000;
/// The first thing he says, this long after launch.
const BOOT_AFTER: u64 = 1_600;
/// Feelings he is not always in the mood to be petted in.
const PRICKLY: [Feeling; 5] =
    [Feeling::Rattled, Feeling::Scared, Feeling::Worried, Feeling::Restless, Feeling::Sleepy];

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
    /// How high above the floor the strip reaches, in points.
    pub strip_height: f64,
    /// The cursor on the strip, if it is over that screen: x from the left,
    /// y up from his floor.
    pub cursor_x: Option<f64>,
    pub cursor_y: Option<f64>,
}

/// An effect to play once; a new `serial` means play it again, even when the
/// name is the same as last time.
#[derive(Debug, Clone, PartialEq, uniffi::Record)]
pub struct Effect {
    pub name: String,
    pub serial: u32,
}

/// Something said: a new `serial` is a new bubble. `reveal_ms` is how long
/// each character takes to appear.
#[derive(Debug, Clone, PartialEq, uniffi::Record)]
pub struct Speech {
    pub text: String,
    pub serial: u32,
    pub reveal_ms: u64,
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
    /// What he is saying, while the bubble is up.
    pub speech: Option<Speech>,
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
    /// Back from behind the screen, with something to say about it.
    Behind,
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
    height: f64,
    cursor_y: Option<f64>,
    /// Raised by being handled, decaying on its own.
    attention: f64,
    attention_at: u64,
    drags: Vec<u64>,
    hover_since: Option<u64>,
    petted: bool,
    watching: bool,
    hold: Option<Hold>,
    clicks: (u32, u64),
    copy: Option<Copy>,
    speech: Option<(String, u64)>,
    speech_serial: u32,
    started: Option<u64>,
    booted: bool,
    hour: u8,
    chatter_at: u64,
    app_line_at: u64,
    switch_line_at: u64,
    said_about: HashMap<String, u64>,
    dwell_done: HashSet<u64>,
    /// The app in front has not been remarked on yet.
    unnoticed: bool,
    rng: u64,
}

/// A press on him: where it started, where he was, and whether it moved.
#[derive(Debug, Clone, Copy)]
struct Hold {
    px: f64,
    py: f64,
    x: f64,
    lift: f64,
    moved: bool,
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
                height: 0.0,
                cursor_y: None,
                attention: 0.0,
                attention_at: 0,
                drags: Vec::new(),
                hover_since: None,
                petted: false,
                watching: false,
                hold: None,
                clicks: (0, 0),
                copy: None,
                speech: None,
                speech_serial: 0,
                started: None,
                booted: false,
                hour: 12,
                chatter_at: 0,
                app_line_at: 0,
                switch_line_at: 0,
                said_about: HashMap::new(),
                dwell_done: HashSet::new(),
                unnoticed: false,
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

    /// What he says, from `art/copy.json`, in `language` ("en" or "es";
    /// anything else is English). Without it he is silent.
    pub fn set_copy(&self, json: String, language: String) {
        self.state.lock().unwrap().copy = Copy::parse(&json, &language);
    }

    /// A press on him at (`px`, `py`) on the strip — y up from his floor —
    /// while he is visibly at (`x`, `lift`): whatever he was doing stops.
    pub fn press(&self, now_ms: u64, px: f64, py: f64, x: f64, lift: f64) {
        let mut s = self.state.lock().unwrap();
        if s.asleep {
            s.wake(now_ms);
            s.say_from(now_ms, "wake", 3_000, &[]);
        }
        s.moving = None;
        s.pending.clear();
        s.sit_until = None;
        s.x = Some(x);
        s.lift = lift;
        s.hold = Some(Hold { px, py, x, lift, moved: false });
    }

    /// The press moved to (`px`, `py`). Past a few points it is a drag: he is
    /// picked up, and follows the pointer.
    pub fn drag(&self, now_ms: u64, px: f64, py: f64) {
        let mut s = self.state.lock().unwrap();
        let Some(mut hold) = s.hold else { return };
        let (dx, dy) = (px - hold.px, py - hold.py);
        if !hold.moved {
            if (dx * dx + dy * dy).sqrt() < DRAG_THRESHOLD {
                return;
            }
            hold.moved = true;
            s.drags.push(now_ms);
            s.hover_since = None;
            s.react(now_ms, Mood::Held, None, 0);
            s.say_from(now_ms, "drag", 2_600, &[]);
        }
        s.hold = Some(hold);
        let (x, lift) = (s.clamp(hold.x + dx), (hold.lift + dy).clamp(0.0, s.max_lift()));
        s.lift = lift;
        s.jump(x);
    }

    /// The press ended: a click if it never moved, otherwise he is put down —
    /// and falls the rest of the way if that was in mid-air.
    pub fn release(&self, now_ms: u64) {
        let mut s = self.state.lock().unwrap();
        let Some(hold) = s.hold.take() else { return };
        if !hold.moved {
            s.click(now_ms);
        } else if s.lift > 4.0 {
            let x = s.here();
            s.react(now_ms, Mood::Held, None, 0);
            s.walk(now_ms, x, 0.0, FALL_SPEED, After::Landed);
        } else {
            s.react(now_ms, Mood::Wow, Some("land"), 900);
        }
    }

    /// `now_ms` is any monotonic clock; only differences are used.
    pub fn tick(&self, now_ms: u64, senses: Senses) -> Frame {
        let mut s = self.state.lock().unwrap();
        let now = now_ms;
        let started = *s.started.get_or_insert(now);
        // Idle time counts from launch at most: a pet that opens asleep because
        // you were away before it started has not been ignored by anyone.
        let mut senses = senses;
        senses.idle_ms = senses.idle_ms.min(now - started);

        // The cursor moved since the last tick: he wakes, glad you are back.
        if s.asleep && senses.idle_ms < s.last_idle {
            let away = s.last_idle;
            s.wake(now);
            s.say_from(now, if away > AWAY_AFTER { "back" } else { "wake" }, 3_000, &[]);
        }
        s.last_idle = senses.idle_ms;

        s.music = senses.music.clone();
        s.width = senses.strip_width;
        s.cursor_x = senses.cursor_x;
        s.cursor_y = senses.cursor_y;
        s.height = senses.strip_height;
        // About a tenth a minute: being petted colours the next five minutes.
        s.attention =
            (s.attention - 0.02 * now.saturating_sub(s.attention_at) as f64 / 12_000.0).max(0.0);
        s.attention_at = now;
        s.drags.retain(|at| now.saturating_sub(*at) < 120_000);
        s.energy = energy_at(senses.hour);
        s.hour = senses.hour;
        let started = s.started.unwrap_or(now);
        if !s.booted && now.saturating_sub(started) >= BOOT_AFTER {
            s.booted = true;
            s.say_from(now, "boot", 6_000, &[]);
        }
        if s.speech.as_ref().is_some_and(|(_, until)| now >= *until) {
            s.speech = None;
        }
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
        if !s.asleep && s.hold.is_none() {
            s.notice(now);
        }
        s.remark_on_app(now);

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
            look: s
                .look
                .map(|(look, _)| look)
                .or_else(|| (!s.asleep).then(|| s.following()).flatten()),
            singing: senses.music.is_some() && s.mood != Mood::Sleep,
            x: s.x.unwrap_or(0.0),
            lift: s.lift,
            move_ms: s.move_ms,
            move_serial: s.move_serial,
            walking: s.moving.is_some() && !s.flying,
            flying: s.flying,
            facing_right: s.facing_right,
            speech: s.speech.as_ref().map(|(text, _)| Speech {
                text: text.clone(),
                serial: s.speech_serial,
                reveal_ms: s.reveal(),
            }),
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
                let next = if self.chance(LOSES_INTEREST * 0.5) { "shake" } else { next };
                self.start(now, next);
            } else {
                self.chain = Some((next, now + RESUME_WITHIN));
            }
        }
    }

    fn feel(&mut self, now: u64, senses: &Senses) {
        let app_key = self.app.as_ref().and_then(|a| match_app(&a.name));
        let fresh = self.app.as_ref().is_some_and(|a| now.saturating_sub(a.since) < NEW_FOR);
        self.feeling = feeling_from(&Sensed {
            neglect: senses.idle_ms as f64 / 60_000.0,
            attention: self.attention,
            dwell: self
                .app
                .as_ref()
                .map_or(0.0, |a| now.saturating_sub(a.since) as f64 / 3_600_000.0),
            switches: self.switches.len() as u32,
            drags: self.drags.len() as u32,
            new_app: fresh && self.app.as_ref().is_some_and(|a| !self.seen.contains(&a.name)),
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
            let next = if now < until && !self.chance(LOSES_INTEREST) { next } else { "shake" };
            self.start(now, next);
            return;
        }

        let energy = energy_at(hour);

        // Having been somewhere a long time is worth more than a stock line.
        if !self.busy(now)
            && let Some(app) = &self.app
        {
            let minutes = now.saturating_sub(app.since) / 60_000;
            let name = app.name.clone();
            let reached: Vec<u64> = DWELL_AT
                .into_iter()
                .filter(|m| minutes >= *m && !self.dwell_done.contains(m))
                .collect();
            if !reached.is_empty() {
                self.dwell_done.extend(reached);
                self.app_line_at = now;
                self.react(now, Mood::Watching, None, 1_800);
                self.say_from(now, "dwell", 7_000, &[&name, &minutes.to_string()]);
                return;
            }
        }

        // Talk: the idle lines, the hour's, and twice the feeling's — what he
        // feels is the more interesting subject.
        if !self.busy(now) && now.saturating_sub(self.chatter_at) > CHATTER_EVERY {
            self.chatter_at = now;
            let feeling = format!("feelings.{}", feeling_key(self.feeling));
            let hours = format!("hours.{}", tod_key(time_of_day(hour)));
            self.say_pool(now, &["idle", &hours, &feeling, &feeling], 8_000, &[]);
            return;
        }

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

        let possible: Vec<_> = MOMENTS.iter().filter(|m| m.min <= energy).map(|m| m.key).collect();
        let willing: Vec<_> = match by_feeling(self.feeling) {
            Some(keys) => possible.iter().copied().filter(|k| keys.contains(k)).collect(),
            None => possible.clone(),
        };
        // A feeling that leaves nothing possible falls back to everything.
        let pool = if willing.is_empty() { possible } else { willing };
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
            Step::ComeBack { x } => {
                self.crossing = false;
                self.walk(now, x, 0.0, WALK_SPEED * 1.6, After::Behind);
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
        self.effect = Some(Effect { name: name.to_string(), serial });
    }

    fn wake(&mut self, now: u64) {
        self.asleep = false;
        self.pending.clear();
        self.then = None;
        self.sit_until = None;
        self.mood = Mood::Happy;
        self.react_until = Some(now + WAKE_FOR);
        self.play("stretch");
    }

    fn busy(&self, now: u64) -> bool {
        self.speech.as_ref().is_some_and(|(_, until)| now < *until)
    }

    /// Unprompted talk waits for him to be standing about with nothing to do.
    fn can_speak(&self, now: u64) -> bool {
        !self.asleep
            && !self.busy(now)
            && self.hold.is_none()
            && self.moving.is_none()
            && self.mood == Mood::Idle
    }

    /// The feeling's delivery, in milliseconds a character.
    fn reveal(&self) -> u64 {
        use Feeling::*;
        match self.feeling {
            Sleepy => 30,
            Lonely => 24,
            Bored => 22,
            Worried => 19,
            Scared | Rattled => 9,
            Festive => 11,
            Pleased => 12,
            Smug => 14,
            _ => SAY_REVEAL,
        }
    }

    fn say(&mut self, now: u64, text: String, ms: u64) {
        let until = now + ms + text.chars().count() as u64 * self.reveal();
        self.speech = Some((text, until));
        self.speech_serial = self.speech_serial.wrapping_add(1);
    }

    fn say_from(&mut self, now: u64, path: &str, ms: u64, args: &[&str]) {
        self.say_pool(now, &[path], ms, args);
    }

    /// One line from all of `paths` together; a path listed twice weighs double.
    fn say_pool(&mut self, now: u64, paths: &[&str], ms: u64, args: &[&str]) {
        let Some(copy) = &self.copy else { return };
        let lines: Vec<serde_json::Value> =
            paths.iter().flat_map(|p| copy.pool(p)).cloned().collect();
        if lines.is_empty() {
            return;
        }
        let line = lines[self.below(lines.len())].clone();
        if let Some(text) = Copy::render(&line, self.hour, args) {
            self.say(now, text, ms);
        }
    }

    /// A beat after an app comes to the front: bouncing between apps is the
    /// more interesting thing to say; otherwise the app itself — frightened,
    /// if it is one he fears — at most every three minutes, and never the same
    /// one twice in a quarter of an hour.
    fn remark_on_app(&mut self, now: u64) {
        let Some(app) = &self.app else { return };
        if !self.unnoticed || now.saturating_sub(app.since) < NOTICE_AFTER {
            return;
        }
        self.unnoticed = false;
        let name = app.name.clone();
        if !self.can_speak(now) {
            return;
        }
        if self.switches.len() > SWITCH_LIMIT
            && now.saturating_sub(self.switch_line_at) > SWITCH_COOLDOWN
        {
            self.switch_line_at = now;
            self.app_line_at = now;
            self.react(now, Mood::Wow, Some("pop"), 1_600);
            self.say_from(now, "switching", 5_000, &[]);
            return;
        }
        if self.app_line_at != 0 && now.saturating_sub(self.app_line_at) < APP_LINE_EVERY {
            return;
        }
        let key = match_app(&name).unwrap_or_else(|| format!("?{name}"));
        if self.said_about.get(&key).is_some_and(|at| now.saturating_sub(*at) < APP_REPEAT_AFTER) {
            return;
        }
        let Some(copy) = &self.copy else { return };
        let fear = format!("fears.{key}");
        let timed = format!("apps.{key}.{}", tod_key(time_of_day(self.hour)));
        let any = format!("apps.{key}.any");
        let (fears, has_timed, has_any) = (
            !copy.pool(&fear).is_empty(),
            !copy.pool(&timed).is_empty(),
            !copy.pool(&any).is_empty(),
        );
        self.said_about.insert(key, now);
        self.app_line_at = now;
        if fears {
            self.react(now, Mood::Scared, Some("shiver"), 3_000);
            self.say_from(now, &fear, 6_000, &[]);
            return;
        }
        self.react(now, Mood::Watching, None, 1_800);
        self.look = Some((Look { x: 0.0, y: -1.0 }, now + 1_600));
        // The hour's lines, usually but not always: a joke heard nightly is wallpaper.
        if has_timed && self.chance(0.7) {
            self.say_from(now, &timed, 6_000, &[]);
        } else if has_any {
            self.say_from(now, &any, 6_000, &[]);
        } else {
            self.say_from(now, "unknownApp", 6_000, &[&name]);
        }
    }

    fn max_lift(&self) -> f64 {
        (self.height - PET_WIDTH).max(0.0)
    }

    /// His middle, in strip points (y up from the floor).
    fn middle(&self) -> (f64, f64) {
        (self.here() + PET_WIDTH / 2.0, self.lift + PET_WIDTH / 2.0)
    }

    /// Eyes on the cursor, when nothing else is holding his gaze.
    fn following(&self) -> Option<Look> {
        let (cx, cy) = self.middle();
        let (x, y) = (self.cursor_x?, self.cursor_y?);
        Some(Look {
            x: ((x - cx) / 280.0).clamp(-1.0, 1.0),
            y: (-(y - cy) / 220.0).clamp(-1.0, 1.0),
        })
    }

    /// The cursor as a sense: hovering on him long enough is petting, and
    /// coming near while he is idle makes him watch it.
    fn notice(&mut self, now: u64) {
        let (Some(x), Some(y)) = (self.cursor_x, self.cursor_y) else {
            return;
        };
        let here = self.here();
        let inside =
            x >= here && x <= here + PET_WIDTH && y >= self.lift && y <= self.lift + PET_WIDTH;
        if inside {
            let since = *self.hover_since.get_or_insert(now);
            if !self.petted && now.saturating_sub(since) >= PET_AFTER {
                self.petted = true;
                self.watching = false;
                // Not always in the mood, and never at random.
                if PRICKLY.contains(&self.feeling) && self.chance(0.6) {
                    self.react(now, Mood::Idle, Some("shake"), 1_100);
                    self.look = Some((Look { x: 0.0, y: 0.5 }, now + 1_400));
                    // His own lines for the feeling are the right words for being touched in it.
                    let path = format!("feelings.{}", feeling_key(self.feeling));
                    self.say_from(now, &path, 3_600, &[]);
                } else {
                    self.attention = (self.attention + 0.35).min(1.0);
                    self.react(now, Mood::Love, Some("pop"), 3_200);
                    self.say_from(now, "pet", 3_600, &[]);
                }
            }
        } else {
            self.hover_since = None;
            self.petted = false;
        }

        let (cx, cy) = self.middle();
        let near = ((x - cx).powi(2) + (y - cy).powi(2)).sqrt() < NOTICE_WITHIN;
        if !inside && near && self.mood == Mood::Idle && self.free() {
            self.mood = Mood::Watching;
            self.watching = true;
        } else if self.watching && (!near || inside) && self.mood == Mood::Watching {
            self.mood = Mood::Idle;
            self.watching = false;
        }
    }

    fn click(&mut self, now: u64) {
        let (count, at) = self.clicks;
        let count = if now.saturating_sub(at) < 900 { count + 1 } else { 1 };
        if count >= 4 {
            self.clicks = (0, now);
            self.react(now, Mood::Dizzy, Some("spin"), 2_600);
            self.say_from(now, "dizzy", 3_400, &[]);
            return;
        }
        self.clicks = (count, now);
        self.attention = (self.attention + 0.35).min(1.0);
        self.react(now, Mood::Happy, Some("pop"), 2_000);
        self.say_from(now, "click", 4_200, &[]);
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
        self.moving = Some(Move { until: now + ms, after });
        self.sit_until = None;
        self.look = Some((Look { x: if to < from { -0.9 } else { 0.9 }, y: 0.0 }, now + ms));
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
                let landing = if went_right { inset } else { self.max_x() - inset };
                let wait = 700 + self.below(1_400) as u64;
                self.pending.push((now + wait, Step::ComeBack { x: landing }));
            }
            After::Land { x } => self.walk(now, x, 0.0, FALL_SPEED, After::Landed),
            After::Landed => {
                let was_flying = self.flying;
                self.flying = false;
                self.react(now, Mood::Wow, Some("land"), 900);
                // The landing is the funnier half, so it talks more often.
                if was_flying && self.chance(0.7) {
                    self.say_from(now, "rocketDown", 5_000, &[]);
                }
            }
            After::Behind => {
                if self.chance(0.55) {
                    self.say_from(now, "behind", 5_000, &[]);
                }
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
        let far = if here < self.max_x() / 2.0 { self.max_x() } else { 0.0 };
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
                let edge = if here < self.max_x() / 2.0 { 0.0 } else { self.max_x() };
                self.walk(now, edge, 0.0, WALK_SPEED * 1.15, After::Nothing);
            }
            Travel::Behind => {
                let went_right = here >= self.width / 2.0;
                self.crossing = true;
                let off = if went_right { self.width } else { -PET_WIDTH };
                self.walk(now, off, 0.0, WALK_SPEED * 1.6, After::Reappear { went_right });
            }
            Travel::Errand => {
                if now.saturating_sub(self.errand_at) < ERRAND_EVERY && self.errand_at != 0 {
                    return;
                }
                self.errand_at = now;
                let wanted = self.below(self.max_x().max(1.0) as usize) as f64;
                // Far enough to be a journey; a step is not an errand.
                let target = if (wanted - here).abs() < 200.0 { far } else { wanted };
                self.walk(now, target, 0.0, WALK_SPEED, After::Arrive);
            }
            Travel::Rocket => {
                // Announced about half the time: always is a countdown, never a glitch.
                if self.chance(0.5) {
                    self.say_from(now, "rocketUp", 2_200, &[]);
                }
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
        s.dwell_done.clear();
        s.unnoticed = true;
        s.app = front.map(|name| App { name: name.to_string(), since: now });
    }
    s.switches.retain(|at| now - at < SWITCH_WINDOW);
    if let Some(app) = &s.app
        && now.saturating_sub(app.since) >= NEW_FOR
    {
        s.seen.insert(app.name.clone());
    }
}

/// The copy's key for a feeling, as written in `companion.ts`.
fn feeling_key(feeling: Feeling) -> &'static str {
    use Feeling::*;
    match feeling {
        Content => "content",
        Bored => "bored",
        Lonely => "lonely",
        Pleased => "pleased",
        Worried => "worried",
        Restless => "restless",
        Rattled => "rattled",
        Smug => "smug",
        Curious => "curious",
        Sleepy => "sleepy",
        Festive => "festive",
        Nostalgic => "nostalgic",
        Scared => "scared",
    }
}

fn tod_key(tod: TimeOfDay) -> &'static str {
    match tod {
        TimeOfDay::Dawn => "dawn",
        TimeOfDay::Day => "day",
        TimeOfDay::Evening => "evening",
        TimeOfDay::Night => "night",
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
            strip_height: 900.0,
            cursor_x: None,
            cursor_y: None,
        }
    }

    #[test]
    fn falls_asleep_after_ninety_seconds_and_wakes_happy() {
        let brain = Brain::still();
        assert_eq!(brain.tick(0, senses(0, "Finder")).mood, Mood::Idle);
        assert_eq!(brain.tick(89_000, senses(89_000, "Finder")).mood, Mood::Idle);
        let asleep = brain.tick(91_000, senses(91_000, "Finder"));
        assert_eq!(asleep.mood, Mood::Sleep);
        assert_eq!(asleep.colours.led, SLEEPING_LED);
        assert_eq!(brain.tick(200_000, senses(200_000, "Finder")).mood, Mood::Sleep);
        // The cursor moves.
        assert_eq!(brain.tick(203_500, senses(500, "Finder")).mood, Mood::Happy);
        assert_eq!(brain.tick(207_000, senses(4_000, "Finder")).mood, Mood::Idle);
    }

    #[test]
    fn a_new_app_is_curious_for_half_a_minute() {
        let brain = Brain::still();
        brain.tick(0, senses(0, "Finder"));
        brain.tick(31_000, senses(0, "Finder"));
        assert_eq!(brain.tick(40_000, senses(0, "Obsidian")).feeling, Feeling::Curious);
        assert_eq!(brain.tick(75_000, senses(0, "Obsidian")).feeling, Feeling::Content);
        // Seen now: coming back to it is not new.
        brain.tick(80_000, senses(0, "Finder"));
        assert_ne!(brain.tick(85_000, senses(0, "Obsidian")).feeling, Feeling::Curious);
    }

    #[test]
    fn teams_frightens_him_and_the_terminal_takes_him_home() {
        let brain = Brain::still();
        assert_eq!(brain.tick(0, senses(0, "Microsoft Teams")).feeling, Feeling::Scared);
        assert_eq!(brain.tick(40_000, senses(0, "Microsoft Teams")).feeling, Feeling::Content);
        brain.tick(41_000, senses(0, "Terminal"));
        assert_eq!(brain.tick(80_000, senses(0, "Terminal")).feeling, Feeling::Nostalgic);
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
            brain.tick(64_000 + i * 1_000, senses(0, if i % 2 == 0 { "Finder" } else { "Notes" }));
        }
        assert_eq!(brain.tick(71_000, senses(0, "Finder")).feeling, Feeling::Restless);
        // Two minutes later the switches have aged out.
        assert_eq!(brain.tick(200_000, senses(0, "Finder")).feeling, Feeling::Content);
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
                    strip_height: 900.0,
                    cursor_x: None,
                    cursor_y: None,
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
            assert!(sleepy.contains(&effect.as_str()), "a sleepy pet played {effect}");
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
        let dances = ["land", "pogo", "jig", "bounce", "hop", "spin", "bow", "shake", "blinkfast"];
        assert!(effects.iter().any(|e| e == "pogo" || e == "jig"), "{effects:?}");
        for effect in &effects {
            assert!(dances.contains(&effect.as_str()), "festive pet played {effect}");
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
            strip_height: 900.0,
            cursor_x: None,
            cursor_y: None,
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
        let track =
            Some(Track { artist: "a".into(), song: "b".into(), genre: String::new(), bpm: 0 });
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
                        strip_height: 900.0,
                        cursor_x: None,
                        cursor_y: None
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
                        strip_height: 900.0,
                        cursor_x: None,
                        cursor_y: None
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
                strip_height: 900.0,
                cursor_x: Some(700.0),
                cursor_y: None,
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
                assert!(frame.x >= -PET_WIDTH && frame.x <= 1512.0, "x = {}", frame.x);
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

    fn with_cursor(brain: &Brain, now: u64, cursor: Option<(f64, f64)>) -> Frame {
        brain.tick(
            now,
            Senses {
                idle_ms: 0,
                hour: 14,
                front_app: None,
                music: None,
                strip_width: 1512.0,
                strip_height: 900.0,
                cursor_x: cursor.map(|c| c.0),
                cursor_y: cursor.map(|c| c.1),
            },
        )
    }

    #[test]
    fn a_click_pleases_him_and_four_make_him_dizzy() {
        let brain = Brain::still();
        let f = with_cursor(&brain, 0, None);
        brain.press(10, f.x + 40.0, 40.0, f.x, 0.0);
        brain.release(20);
        let clicked = with_cursor(&brain, 30, None);
        assert_eq!(clicked.mood, Mood::Happy);
        assert_eq!(clicked.effect.unwrap().name, "pop");
        for t in [100, 200, 300] {
            brain.press(t, f.x + 40.0, 40.0, f.x, 0.0);
            brain.release(t + 10);
        }
        assert_eq!(with_cursor(&brain, 400, None).mood, Mood::Dizzy);
    }

    #[test]
    fn picked_up_he_follows_and_dropped_in_the_air_he_falls_and_lands() {
        let brain = Brain::still();
        let f = with_cursor(&brain, 0, None);
        brain.press(10, f.x + 40.0, 40.0, f.x, 0.0);
        brain.drag(20, f.x + 42.0, 41.0);
        assert_eq!(with_cursor(&brain, 25, None).mood, Mood::Idle, "a 2pt wobble is still a click");
        brain.drag(30, f.x + 140.0, 340.0);
        let held = with_cursor(&brain, 40, None);
        assert_eq!(held.mood, Mood::Held);
        assert_eq!((held.x - f.x, held.lift, held.move_ms), (100.0, 300.0, 0));
        brain.release(50);
        let falling = with_cursor(&brain, 60, None);
        assert_eq!(falling.lift, 0.0);
        assert!(falling.move_ms > 0);
        let mut t = 60;
        loop {
            t += 100;
            let f = with_cursor(&brain, t, None);
            if f.mood == Mood::Wow {
                assert_eq!(f.effect.unwrap().name, "land");
                return;
            }
            assert!(t < 3_000, "never landed");
        }
    }

    #[test]
    fn thrown_around_three_times_he_is_rattled() {
        let brain = Brain::still();
        let f = with_cursor(&brain, 0, None);
        for i in 0..3u64 {
            let t = 10 + i * 5_000;
            brain.press(t, f.x + 40.0, 40.0, f.x, 0.0);
            brain.drag(t + 10, f.x + 80.0, 40.0);
            brain.release(t + 20);
        }
        assert_eq!(with_cursor(&brain, 20_000, None).feeling, Feeling::Rattled);
    }

    #[test]
    fn hovering_on_him_is_petting_and_the_cursor_nearby_is_watched() {
        let brain = Brain::still();
        let f = with_cursor(&brain, 0, None);
        let (cx, cy) = (f.x + 46.0, 46.0);
        // Near but not on him: he watches, eyes on the cursor.
        let near = with_cursor(&brain, 100, Some((cx + 150.0, cy)));
        assert_eq!(near.mood, Mood::Watching);
        assert!(near.look.unwrap().x > 0.4);
        // On him for 1.6s: petted, and pleased about it.
        with_cursor(&brain, 200, Some((cx, cy)));
        assert_ne!(with_cursor(&brain, 1_000, Some((cx, cy))).mood, Mood::Love);
        let petted = with_cursor(&brain, 1_900, Some((cx, cy)));
        assert_eq!(petted.mood, Mood::Love);
        assert_eq!(petted.effect.unwrap().name, "pop");
        // Far away: back to idle.
        assert_eq!(with_cursor(&brain, 6_000, Some((cx + 900.0, cy))).mood, Mood::Idle);
    }

    const COPY: &str = include_str!("../../art/copy.json");

    fn talker(language: &str) -> Brain {
        let brain = Brain::still();
        brain.set_copy(COPY.into(), language.into());
        brain
    }

    fn lines(language: &str, path: &str) -> Vec<String> {
        let copy = Copy::parse(COPY, language).unwrap();
        copy.pool(path).iter().filter_map(|l| Copy::render(l, 14, &[])).collect()
    }

    fn quiet_senses(app: Option<&str>) -> Senses {
        Senses {
            idle_ms: 0,
            hour: 14,
            front_app: app.map(String::from),
            music: None,
            strip_width: 1512.0,
            strip_height: 900.0,
            cursor_x: None,
            cursor_y: None,
        }
    }

    #[test]
    fn he_greets_once_after_launch() {
        let brain = talker("en");
        assert!(brain.tick(0, quiet_senses(None)).speech.is_none());
        let hello = brain.tick(1_700, quiet_senses(None)).speech.expect("a boot line");
        assert!(lines("en", "boot").contains(&hello.text), "{}", hello.text);
        // The bubble stays up for its time, then goes.
        assert_eq!(brain.tick(3_000, quiet_senses(None)).speech.unwrap().serial, hello.serial);
        assert!(brain.tick(30_000, quiet_senses(None)).speech.is_none());
    }

    #[test]
    fn a_click_gets_a_click_line_in_spanish_too() {
        let brain = talker("es");
        let f = brain.tick(0, quiet_senses(None));
        brain.press(10, f.x + 40.0, 40.0, f.x, 0.0);
        brain.release(20);
        let said = brain.tick(30, quiet_senses(None)).speech.unwrap();
        assert!(lines("es", "click").contains(&said.text), "{}", said.text);
    }

    #[test]
    fn teams_in_front_frightens_him_out_loud() {
        let brain = talker("en");
        brain.tick(0, quiet_senses(None));
        // The greeting first, and its bubble gone: he does not talk over himself.
        brain.tick(1_700, quiet_senses(None));
        brain.tick(20_000, quiet_senses(Some("Microsoft Teams")));
        let f = brain.tick(22_000, quiet_senses(Some("Microsoft Teams")));
        assert_eq!(f.mood, Mood::Scared);
        assert!(lines("en", "fears.meeting").contains(&f.speech.unwrap().text));
    }

    #[test]
    fn left_alone_he_talks_now_and_then() {
        let brain = talker("en");
        let mut said = 0;
        let mut last = 0;
        for i in 0..(10 * 240) {
            if let Some(s) = brain.tick(i * 250, quiet_senses(Some("Finder"))).speech
                && s.serial != last
            {
                last = s.serial;
                said += 1;
            }
        }
        // Boot, the app, and chatter at most every 50s: a handful in ten minutes.
        assert!((4..=14).contains(&said), "{said} lines in ten minutes");
    }
}
