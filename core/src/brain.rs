//! The poll at the centre of `Companion.tsx`, the part that decides on its own:
//! when he dozes off and wakes, how he feels, and what he does unprompted. The
//! shell calls `tick` often (every quarter second) with what it senses and
//! draws the `Frame` that comes back; the core keeps the afternoon's memory
//! (which apps, how many switches) and every timer, so the shell stays a pair
//! of eyes and a body.
//!
//! Timers are checked on every call, so a 900ms reaction ends on time; the
//! decisions — whether to do something, and what — are taken on the 3.5s poll,
//! as in the Tauri build.

use std::collections::{HashMap, HashSet};
use std::sync::{Arc, Mutex};

use crate::copy::Copy;
use crate::data::{
    Colours, Familiarity, Feeling, PROPS, SOUVENIRS, Sensed, TERRORS, TimeOfDay, WornProp,
    dance_style, document_in, energy_at, familiarity_from, feeling_from, match_app, palette,
    time_of_day, worn_from,
};
use crate::house::{FURNITURE, brought_up, line_index, scene_at};
use crate::moments::{MOMENTS, Step, Travel, by_feeling, dances, moment};
use crate::store::{Memory, Opening, Parts, Reminder, Settings, Store};

/// How near the portal's middle a drop has to land to go in. The portal
/// itself is as big as he is and stands right in the corner (`portal_x`).
const PORTAL_REACH: f64 = 40.0;
/// After he steps out it stays open this long, then closes behind him.
const PORTAL_LINGERS: u64 = 1_800;
const REMINDERS_REREAD: u64 = 300_000;
/// Lyra's lines bring a beat (a bounce, a look up) at most this often.
const LYRIC_BEAT: u64 = 6_000;
/// Home is rare, behind its own floor: it takes him off the screen.
const HOME_EVERY: u64 = 420_000;
/// "As long as he likes": a pet always back in ninety seconds has a lunch break.
const HOME_FOR: (u64, u64) = (45_000, 300_000);

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

/// `--pet-width` for each size the preferences offer.
fn pet_width(size: &str) -> f64 {
    match size {
        "small" => 66.0,
        "large" => 124.0,
        _ => PET_WIDTH,
    }
}
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
/// A file he can see is remarked on at most this often.
const FILE_LINE_EVERY: u64 = 420_000;
/// Titles never read, at any permission: a blocklist, so a floor rather than a
/// guarantee — the first real title the Tauri build ever read was `.env-prod`.
const SENSITIVE: [&str; 14] = [
    ".env",
    "secret",
    "password",
    "passwd",
    "token",
    "credential",
    "apikey",
    "api key",
    "private key",
    ".pem",
    "keychain",
    "1password",
    "bitwarden",
    "lastpass",
];
const APP_REPEAT_AFTER: u64 = 900_000;
const SWITCH_LIMIT: usize = 6;
const SWITCH_COOLDOWN: u64 = 900_000;
/// The first thing he says, this long after launch.
const BOOT_AFTER: u64 = 1_600;
/// Days and streaks worth remarking on at launch.
const DAY_MILESTONES: [u32; 4] = [7, 30, 100, 365];
const STREAK_MILESTONES: [u32; 3] = [5, 15, 50];
/// How often, at most, he crosses to the other edge while peeking.
const CROSS_EVERY: u64 = 95_000;
/// Climbing: how fast, how high a ladder goes, how often it slips.
const CLIMB_SPEED: f64 = 46.0;
const LADDER_MIN: f64 = 240.0;
const LADDER_MAX: f64 = 620.0;
const LADDER_SLIPS: f64 = 0.4;
/// A ledge has to be at least this far below where he fell from to catch him.
const LEDGE_GAP: f64 = 40.0;
/// How long the taking-off of a prop takes before it is gone.
const PROP_LEAVE: u64 = 400;
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

/// The top edge of one of your windows he could catch on the way down, in
/// strip points: `x` and `width` along it, `lift` above his floor.
#[derive(Debug, Clone, Copy, PartialEq, uniffi::Record)]
pub struct Ledge {
    pub x: f64,
    pub width: f64,
    pub lift: f64,
}

/// A ladder standing at `x`, `height` tall; `falling` is going out from under him.
#[derive(Debug, Clone, Copy, PartialEq, uniffi::Record)]
pub struct Ladder {
    pub x: f64,
    pub height: f64,
    pub falling: bool,
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
    /// Its focused window's title, only when you turned that on and granted
    /// Accessibility. Never kept, never written anywhere.
    pub front_title: Option<String>,
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
    /// The local date, `YYYY-MM-DD`: a new one is a day known.
    pub today: String,
    /// A microphone is live somewhere: treated as "you are in a call".
    pub in_call: bool,
    /// Your windows' top edges, highest first, refreshed now and then.
    pub ledges: Vec<Ledge>,
    /// What Lyra says about the song, when it is running: it reads the same
    /// players, and knows the lyrics.
    pub lyra: Option<Lyra>,
}

/// Lyra's half of the song, from its suite events.
#[derive(Debug, Clone, Copy, PartialEq, uniffi::Record)]
pub struct Lyra {
    /// In a sung line (true), between lines or before the first (false), or
    /// no synced lyrics to tell (None).
    pub sung: Option<bool>,
    /// Bumps on every new line.
    pub line: u32,
    /// The song has no lyrics anywhere.
    pub missing: bool,
    /// The middle of its overlay on his strip, while it shows.
    pub overlay_x: Option<f64>,
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
    /// A reminder carries a button: its id, and the button's label.
    pub reminder: Option<String>,
    pub button: Option<String>,
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
    /// What he has on, back to front; `leaving` is on its way off.
    pub worn: Vec<WornProp>,
    /// The body he was given.
    pub parts: Parts,
    /// Out of the way for a call, when the settings say "hide".
    pub hidden: bool,
    /// How wide he is drawn, in points (`--pet-width`).
    pub width: f64,
    pub ladder: Option<Ladder>,
    /// On the way down (`heat`, 0–1, is how far), or hanging off a ledge.
    pub falling: bool,
    pub heat: f64,
    pub hanging: bool,
    /// Down the burrow: off the strip.
    pub home: bool,
    /// A new value is a wave of the hands.
    pub wave: u32,
    /// The way in, only while there is one: when he is heading home, inside,
    /// or just stepped out. Clickable, to look in.
    pub portal: Option<Portal>,
}

/// The portal in the corner: where its middle is, and whether he is in.
#[derive(Debug, Clone, Copy, PartialEq, uniffi::Record)]
pub struct Portal {
    pub x: f64,
    pub inside: bool,
}

/// What the cutaway shows, worked out once when it is opened.
#[derive(Debug, Clone, PartialEq, uniffi::Record)]
pub struct Burrow {
    pub present: bool,
    /// The bay ("chair", "lamp", "rug").
    pub at: String,
    pub settled: bool,
    pub line: String,
    /// How well he knows you, as furniture: "new" … "old".
    pub familiarity: String,
    /// What you posted down the hatch, on the rail.
    pub left: Vec<String>,
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
    /// At the top of the ladder.
    Top,
    /// Down the ladder again.
    Climbed,
    /// The end of a fall: caught on a ledge at that lift, or on the floor.
    Fell {
        ledge: Option<f64>,
    },
    /// At the hatch: in he goes.
    Home,
    /// Out of the call's corner, where he can be seen: hello, then back.
    Introduce {
        left: bool,
    },
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
    /// Where the errand he is on goes, until he gets there.
    errand: Option<f64>,
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
    /// The reminder the bubble is showing, if it is one.
    speech_reminder: Option<String>,
    reminders: Vec<Reminder>,
    reminded_today: HashSet<String>,
    reminder_at: u64,
    /// When `reminders.json` was last read: again every five minutes, so one
    /// added by hand turns up without a relaunch.
    reminders_read: u64,
    today: String,
    /// The clock at the last tick, for things the shell reports between ticks.
    last_tick: u64,
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
    title: Option<String>,
    last_document: Option<String>,
    file_line_at: u64,
    /// What he put on himself, until when, and whether it is coming off.
    prop: Option<String>,
    prop_until: u64,
    prop_leaving: bool,
    /// The song last seen, to notice a new one.
    track: Option<(String, String)>,
    store: Option<Store>,
    settings: Settings,
    memory: Memory,
    opening: Option<Opening>,
    /// The language macOS asked for, used when the settings say "auto".
    copy_json: Option<(String, String)>,
    in_call: bool,
    /// Where he stood before going to the corner for a call.
    home_x: Option<f64>,
    cross_at: u64,
    wave_at: u64,
    ledges: Vec<Ledge>,
    ladder: Option<Ladder>,
    falling: bool,
    heat: f64,
    hanging: bool,
    /// The last line Lyra reported, when he last moved to one, and whether the
    /// song had no lyrics last time he looked.
    lyric_line: u32,
    wave: u32,
    /// Out of a call's corner to say hello, and on his way back.
    stepping_out: bool,
    /// Lets one line through a call's silence: the hello he was asked for.
    force_voice: bool,
    beat_at: u64,
    no_lyrics: bool,
    /// When he got in, why (frozen then), until when, and the last trip.
    home: Option<u64>,
    home_reason: Option<Feeling>,
    home_until: u64,
    /// On his way to the portal (it is open, waiting for him).
    going_home: bool,
    portal_closes: u64,
    home_at: u64,
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
                errand: None,
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
                speech_reminder: None,
                reminders: Vec::new(),
                reminded_today: HashSet::new(),
                reminder_at: 0,
                reminders_read: 0,
                today: String::new(),
                last_tick: 0,
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
                title: None,
                last_document: None,
                file_line_at: 0,
                prop: None,
                prop_until: 0,
                prop_leaving: false,
                track: None,
                store: None,
                settings: Settings::default(),
                memory: Memory::default(),
                opening: None,
                copy_json: None,
                in_call: false,
                home_x: None,
                cross_at: 0,
                wave_at: 0,
                ledges: Vec::new(),
                ladder: None,
                falling: false,
                heat: 0.0,
                hanging: false,
                lyric_line: 0,
                wave: 0,
                stepping_out: false,
                force_voice: false,
                beat_at: 0,
                no_lyrics: false,
                home: None,
                home_reason: None,
                home_until: 0,
                going_home: false,
                portal_closes: 0,
                home_at: 0,
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
        let mut s = self.state.lock().unwrap();
        s.copy_json = Some((json, language));
        s.load_copy();
    }

    /// Reads `tico.json` and `memory.json` from `dir`, seeding them from
    /// `seed` (the Tauri build's folder) the first time, and counts `today`.
    pub fn open(&self, dir: String, seed: Option<String>, today: String) {
        let mut s = self.state.lock().unwrap();
        let store =
            Store::open(std::path::Path::new(&dir), seed.as_deref().map(std::path::Path::new));
        s.settings = store.settings();
        s.memory = store.memory();
        s.reminders = store.reminders(&today);
        s.store = Some(store);
        s.count_day(&today);
        s.load_copy();
    }

    /// Starts the moment `key` now, whatever he was doing — for trying one out
    /// (`TICO_DO` in the shell) rather than waiting for the dice.
    pub fn perform(&self, key: String) {
        let mut s = self.state.lock().unwrap();
        let now = s.last_tick;
        s.start(now, &key);
    }

    /// The reminder `id` is done: a monthly one moves on a month, any other is
    /// finished. The bubble goes.
    pub fn complete_reminder(&self, id: String) {
        let mut s = self.state.lock().unwrap();
        for r in s.reminders.iter_mut().filter(|r| r.id == id) {
            r.complete();
        }
        if let Some(store) = &s.store {
            store.save_reminders(&s.reminders);
        }
        if s.speech_reminder.as_deref() == Some(id.as_str()) {
            s.speech = None;
            s.speech_reminder = None;
        }
        let now = s.last_tick;
        s.react(now, Mood::Happy, Some("hop"), 2_000);
    }

    /// Out of the burrow now: clicking him in the cutaway calls him up.
    pub fn come_up(&self) {
        let mut s = self.state.lock().unwrap();
        let now = s.last_tick;
        if s.home.is_some() {
            s.come_out(now);
        }
    }

    /// "Go home" from the menu: now, whatever he was doing, and whenever he
    /// was last down there.
    pub fn go_home(&self) {
        let mut s = self.state.lock().unwrap();
        let now = s.last_tick;
        if s.home.is_some() || s.going_home || !s.settings.house || s.hold.is_some() {
            return;
        }
        if s.asleep {
            s.wake(now);
        }
        s.moving = None;
        s.pending.clear();
        s.then = None;
        s.ladder = None;
        s.hanging = false;
        s.falling = false;
        s.lift = 0.0;
        s.head_home(now);
    }

    /// The scene for the cutaway, derived at the moment of looking.
    pub fn burrow(&self) -> Burrow {
        let s = self.state.lock().unwrap();
        let now = s.last_tick;
        let chair = s.opening.as_ref().and_then(|o| o.chair.clone());
        let scene = scene_at(s.home.unwrap_or(now), now, chair.as_deref(), s.home_reason);
        let (path, index) = match s.home {
            Some(_) => {
                let path = format!("house.at.{}", scene.at);
                let n = s.copy.as_ref().map_or(0, |c| c.pool(&path).len());
                (path, line_index(&scene, n))
            }
            None => ("house.empty".to_string(), scene.minutes as usize % 2),
        };
        let line = s
            .copy
            .as_ref()
            .and_then(|c| c.pool(&path).get(index).and_then(|l| Copy::render(l, s.hour, &[])))
            .unwrap_or_default();
        Burrow {
            present: s.home.is_some(),
            at: scene.at.to_string(),
            settled: scene.settled,
            line,
            familiarity: familiarity_key(familiarity_from(s.memory.days)).to_string(),
            left: s.memory.left.clone(),
        }
    }

    /// The settings as they stand, for the shell (the body, the size).
    pub fn settings(&self) -> Settings {
        self.state.lock().unwrap().settings.clone()
    }

    /// Settings changed from the preferences or the menu: kept, saved, and in
    /// effect from the next tick (a new language reloads what he says).
    pub fn update_settings(&self, settings: Settings) {
        let mut s = self.state.lock().unwrap();
        let language = s.settings.language != settings.language;
        s.settings = settings;
        s.save_settings();
        // Turning the burrow off with him inside would leave him nowhere.
        if !s.settings.house && s.home.is_some() {
            let now = s.last_tick;
            s.come_out(now);
        }
        if language {
            s.load_copy();
        }
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
        // Whatever he was doing up there is over: you have him in your hand.
        s.ladder = None;
        s.hanging = false;
        s.falling = false;
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
            s.memory.drags += 1;
            s.save_memory();
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
        let middle = s.here() + s.pet() / 2.0;
        // Picked up on the way to the portal and put down elsewhere: he has
        // changed his mind, and it closes.
        let into_portal = s.going_home && (middle - s.portal_x()).abs() < PORTAL_REACH;
        if hold.moved && !into_portal {
            s.going_home = false;
        }
        if !hold.moved {
            s.click(now_ms);
            // A click on the way stops the walk; it carries on.
            if s.going_home {
                s.pending.push((now_ms + 600, Step::GoHome));
            }
        } else if into_portal {
            // Dropped into the open portal, he goes through — and whatever he
            // had on comes off on the way and ends up on the rail: the one way
            // anything of yours gets into the burrow.
            if let Some(prop) = s.prop.take().filter(|_| !s.prop_leaving) {
                s.memory.left_behind(&prop);
                s.save_memory();
            }
            s.prop = None;
            s.prop_leaving = false;
            s.home_at = now_ms;
            let x = s.portal_x() - s.pet() / 2.0;
            s.walk(now_ms, x, 0.0, FALL_SPEED, After::Home);
        } else if s.lift > 4.0 {
            // Through the same fall as coming off a ladder, ledges and all.
            s.react(now_ms, Mood::Held, None, 0);
            let lift = s.lift;
            s.fall(now_ms, lift);
        } else {
            s.react(now_ms, Mood::Wow, Some("land"), 900);
            // Where you put him is where he stands next launch.
            if s.store.is_some() {
                s.settings.x = (s.here() / s.max_x()).clamp(0.0, 1.0);
                s.save_settings();
            }
        }
    }

    /// `now_ms` is any monotonic clock; only differences are used.
    pub fn tick(&self, now_ms: u64, senses: Senses) -> Frame {
        let mut s = self.state.lock().unwrap();
        let now = now_ms;
        s.last_tick = now;
        if s.started.is_none() {
            // The floors that count from launch, as the Tauri build's refs start at
            // `Date.now()`: talk, moments, strolls, and the first reminder check 9s
            // in. With a monotonic clock that does not start at zero, leaving them
            // at zero made all of them due on the very first tick.
            s.chatter_at = now;
            s.wander_at = now;
            s.reminder_at = now;
            if s.moment_at != u64::MAX {
                s.moment_at = now;
            }
        }
        let started = *s.started.get_or_insert(now);
        // Idle time counts from launch at most: a pet that opens asleep because
        // you were away before it started has not been ignored by anyone.
        let mut senses = senses;
        senses.idle_ms = senses.idle_ms.min(now - started);
        if !senses.today.is_empty() && senses.today != s.memory.last_seen && s.store.is_some() {
            s.count_day(&senses.today);
        }

        // The cursor moved since the last tick: he wakes, glad you are back.
        if s.asleep && senses.idle_ms < s.last_idle {
            let away = s.last_idle;
            s.wake(now);
            s.say_from(now, if away > AWAY_AFTER { "back" } else { "wake" }, 3_000, &[]);
        }
        s.last_idle = senses.idle_ms;

        // A new song: sometimes worth a word, a beat after it starts.
        let playing = senses.music.as_ref().map(|t| (t.artist.clone(), t.song.clone()));
        if playing.is_some() && playing != s.track && s.chance(0.4) {
            s.pending.push((now + 2_500, Step::Track));
        }
        s.track = playing;
        s.follow_lyra(now, &senses);
        s.music = senses.music.clone();
        s.width = senses.strip_width;
        // The strip shrank (a smaller display, a rearranged one): back on it.
        if let Some(x) = s.x
            && s.width > 0.0
            && !s.crossing
            && s.moving.is_none()
            && s.hold.is_none()
            && x > s.max_x() + s.pet() * 0.5
        {
            let edge = s.max_x();
            s.jump(edge);
        }
        s.cursor_x = senses.cursor_x;
        s.cursor_y = senses.cursor_y;
        s.height = senses.strip_height;
        if !senses.ledges.is_empty() || s.ledges.is_empty() {
            s.ledges = senses.ledges.clone();
        }
        if senses.in_call != s.in_call {
            s.in_call = senses.in_call;
            s.call_changed(now);
        }
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
            s.greet(now);
        }
        if s.speech.as_ref().is_some_and(|(_, until)| now >= *until) {
            s.speech = None;
            s.speech_reminder = None;
        }
        if s.x.is_none() {
            // A little way in from the left, where the Tauri build starts him the
            // first time too.
            // Where he stood last time, as a fraction of the strip.
            s.x = Some((s.max_x() * s.settings.x.clamp(0.0, 1.0)).max(0.0));
        }
        if let Some(m) = s.moving
            && now >= m.until
        {
            s.moving = None;
            // Remembered for the next launch — but not halfway round the back.
            if !s.crossing && s.store.is_some() {
                s.settings.x = (s.here() / s.max_x()).clamp(0.0, 1.0);
                s.save_settings();
            }
            s.arrived(now, m.after);
        }
        if s.home.is_some() && now >= s.home_until {
            s.come_out(now);
        }
        s.expire(now);
        s.run_due(now);
        track_app(&mut s, now, senses.front_app.as_deref());
        // A new title (another file in the same editor) is worth a look too.
        let title = senses.front_title.as_deref().and_then(readable);
        if title != s.title {
            s.title = title;
            s.unnoticed = true;
        }
        if !s.asleep && s.hold.is_none() {
            s.notice(now);
        }
        s.remark_on_app(now);
        s.remind(now);

        if senses.idle_ms > SLEEP_AFTER {
            if !s.asleep && s.free() {
                s.asleep = true;
                s.mood = Mood::Sleep;
                s.speech = None;
                s.speech_reminder = None;
                s.sit_until = None;
                s.look = None;
            }
        } else if !s.asleep && s.mood == Mood::Idle {
            s.feel(now, &senses);
        }

        if now >= s.next_poll {
            s.next_poll = now + POLL;
            let hidden = s.in_call && s.settings.in_call == "hide";
            if !s.asleep && !hidden && senses.idle_ms <= SLEEP_AFTER && s.free() {
                if s.peeking() {
                    s.peek_poll(now);
                } else {
                    s.poll(now, senses.hour, senses.idle_ms);
                }
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
            // Not in Lyra's gaps between lines: an instrumental is not his to sing.
            singing: senses.music.is_some()
                && s.mood != Mood::Sleep
                && senses.lyra.and_then(|l| l.sung) != Some(false),
            x: s.x.unwrap_or(0.0),
            lift: s.lift,
            move_ms: s.move_ms,
            move_serial: s.move_serial,
            walking: s.moving.is_some() && !s.flying,
            flying: s.flying,
            facing_right: s.facing_right,
            worn: worn_from(s.settings.pinned_props.clone(), s.prop.clone(), s.prop_leaving),
            parts: s.settings.parts.clone(),
            hidden: s.in_call && s.settings.in_call == "hide",
            width: s.pet(),
            ladder: s.ladder,
            falling: s.falling,
            heat: s.heat,
            hanging: s.hanging,
            home: s.home.is_some(),
            wave: s.wave,
            portal: (s.home.is_some() || s.going_home || now < s.portal_closes)
                .then(|| Portal { x: s.portal_x(), inside: s.home.is_some() }),
            speech: s.speech.as_ref().map(|(text, _)| Speech {
                text: text.clone(),
                serial: s.speech_serial,
                reveal_ms: s.reveal(),
                reminder: s.speech_reminder.clone(),
                button: s
                    .speech_reminder
                    .as_ref()
                    .and_then(|_| s.copy.as_ref()?.text("reminderDone")),
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
            && self.home.is_none()
    }

    fn expire(&mut self, now: u64) {
        if self.prop.is_some() && now >= self.prop_until {
            if !self.prop_leaving {
                // Taking it off is the smaller event, and gets remarked on less.
                self.prop_leaving = true;
                self.prop_until = now + PROP_LEAVE;
                if self.chance(0.3) {
                    self.say_from(now, "propOff", 4_000, &[]);
                }
            } else {
                self.prop = None;
                self.prop_leaving = false;
            }
        }
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

        // Put down somewhere else halfway to somewhere: he goes back to going
        // there, annoyed about it. Re-clamped every time, since the strip's
        // limits move (a call changes how far past the edge he may go).
        if let Some(target) = self.errand {
            let target = self.clamp(target);
            if (self.here() - target).abs() <= 40.0 {
                self.errand = None;
            } else {
                self.moment_at = now;
                self.react(now, Mood::Idle, Some("shake"), 700);
                self.walk(now, target, 0.0, WALK_SPEED, After::Arrive);
                return;
            }
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
        if !self.busy(now) && now.saturating_sub(self.chatter_at) > self.rated(CHATTER_EVERY) {
            self.chatter_at = now;
            let feeling = format!("feelings.{}", feeling_key(self.feeling));
            let hours = format!("hours.{}", tod_key(time_of_day(hour)));
            // One copy of the memory lines: how long he has known you colours the
            // conversation, it is never the subject of it.
            let known =
                format!("memory.tier.{}", familiarity_key(familiarity_from(self.memory.days)));
            self.say_pool(now, &["idle", &hours, &known, &feeling, &feeling], 8_000, &[]);
            return;
        }

        // A stroll, when you have left him be for a few seconds.
        if idle_ms > 8_000
            && now.saturating_sub(self.wander_at)
                > (self.rated(WANDER_EVERY) as f64 / energy.max(0.25)) as u64
        {
            self.wander_at = now;
            self.wander(now);
            return;
        }

        let floor = (self.rated(MOMENT_EVERY) as f64 / energy.max(0.25)) as u64;
        if now.saturating_sub(self.moment_at) <= floor || !self.chance(0.4 + energy * 0.4) {
            return;
        }
        self.moment_at = now;

        // One in nine, so it is a surprise rather than a wardrobe. Headphones
        // only while something plays — the one prop with a reason.
        if self.prop.is_none() && self.chance(0.11) {
            // The favourite only tilts the odds: always the same hat is a uniform.
            let favourite = self.opening.as_ref().and_then(|o| o.favourite.clone());
            let kind = if self.music.is_some() && self.chance(0.6) {
                "headphones".to_string()
            } else if let Some(f) = favourite.clone().filter(|_| self.chance(0.35)) {
                f
            } else {
                PROPS[self.below(PROPS.len())].to_string()
            };
            // Only what he chose counts towards the favourite, never a souvenir.
            *self.memory.props.entry(kind.clone()).or_insert(0) += 1;
            self.save_memory();
            let speak = self.chance(0.65);
            if speak && favourite.as_deref() == Some(kind.as_str()) && self.chance(0.5) {
                self.wear(now, &kind, false);
                self.pending
                    .push((now + 1_200, Step::Say { path: "memory.favourite".into(), ms: 5_000 }));
            } else {
                self.wear(now, &kind, speak);
            }
            return;
        }

        let wearing = self.prop.is_some() && !self.prop_leaving;
        let possible: Vec<_> = MOMENTS
            .iter()
            .filter(|m| m.min <= energy && (wearing || !m.needs_prop))
            .map(|m| m.key)
            .collect();
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
            Step::Say { path, ms } => self.say_from(now, &path, ms, &[]),
            Step::Wave => self.wave(),
            Step::BackToPeek { left } => {
                self.stepping_out = false;
                // Only if the call is still on: if it ended meanwhile, he has
                // already been sent home.
                if self.peeking() {
                    let edge =
                        if left { -self.pet() * 0.5 } else { self.max_x() + self.pet() * 0.5 };
                    self.walk(now, edge, 0.0, WALK_SPEED * 1.6, After::Nothing);
                }
            }
            Step::GoHome => {
                if self.going_home {
                    let x = self.portal_x() - self.pet() / 2.0;
                    self.walk(now, x, 0.0, WALK_SPEED * 1.1, After::Home);
                }
            }
            Step::Fuss => {
                if let Some(prop) = self.prop.clone()
                    && self.chance(0.6)
                {
                    self.say_from(now, &format!("propFuss.{prop}"), 4_500, &[]);
                }
            }
            Step::Track => {
                // Not behind the chatter floors: a new song is him reacting to the
                // room. `say` still holds quiet and calls.
                if let Some(t) = self.music.clone()
                    && !self.asleep
                    && self.hold.is_none()
                    && self.home.is_none()
                {
                    self.react(now, Mood::Happy, Some("pop"), 2_000);
                    self.say_from(now, "track", 6_000, &[&t.artist, &t.song]);
                }
            }
            Step::ClimbUp => {
                if let Some(ladder) = self.ladder {
                    self.walk(now, ladder.x, ladder.height, CLIMB_SPEED, After::Top);
                }
            }
            Step::ClimbDone => {
                let Some(ladder) = self.ladder else { return };
                if self.chance(LADDER_SLIPS) {
                    self.ladder = Some(Ladder { falling: true, ..ladder });
                    self.react(now, Mood::Scared, Some("startle"), 900);
                    if self.chance(0.6) {
                        self.say_from(now, "ladderSlips", 3_600, &[]);
                    }
                    self.pending.push((now + 420, Step::Drop { lift: ladder.height }));
                } else {
                    self.walk(now, ladder.x, 0.0, CLIMB_SPEED, After::Climbed);
                }
            }
            Step::Drop { lift } => {
                self.ladder = None;
                self.hanging = false;
                self.fall(now, lift);
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

    /// Lyra's lines: now and then a bounce as a new one starts, or a look up
    /// at the overlay showing it; and a word when a song turns out to have no
    /// lyrics anywhere. At most one beat every few seconds.
    fn follow_lyra(&mut self, now: u64, senses: &Senses) {
        let Some(lyra) = senses.lyra else { return };
        let missing = lyra.missing && senses.music.is_some();
        if missing && !self.no_lyrics && self.can_speak(now) && self.chance(0.35) {
            self.say_from(now, "lyricsNone", 4_500, &[]);
        }
        self.no_lyrics = missing;
        if lyra.line == self.lyric_line {
            return;
        }
        self.lyric_line = lyra.line;
        if lyra.sung != Some(true) || senses.music.is_none() || self.asleep || !self.free() {
            return;
        }
        if now.saturating_sub(self.beat_at) < LYRIC_BEAT {
            return;
        }
        self.beat_at = now;
        if self.chance(0.3) {
            self.react(now, Mood::Happy, Some("bounce"), 900);
        } else if let Some(x) = lyra.overlay_x.filter(|_| self.chance(0.2)) {
            let dx = x - (self.here() + self.pet() / 2.0);
            self.look = Some((Look { x: (dx / 400.0).clamp(-1.0, 1.0), y: -0.85 }, now + 1_600));
        }
    }

    /// Puts `kind` on for 25–95s; with `speak`, says something about it a
    /// beat later — he puts the thing on and *then* has an opinion.
    fn wear(&mut self, now: u64, kind: &str, speak: bool) {
        self.prop = Some(kind.to_string());
        self.prop_leaving = false;
        self.prop_until = now + 25_000 + self.below(70_000) as u64;
        if speak {
            self.pending
                .push((now + 1_200, Step::Say { path: format!("props.{kind}"), ms: 5_000 }));
        }
    }

    /// A floor stretched by how chatty he has been asked to be.
    fn rated(&self, floor: u64) -> u64 {
        (floor as f64 * self.settings.rate()) as u64
    }

    fn count_day(&mut self, today: &str) {
        if self.today != today {
            self.today = today.to_string();
            self.reminded_today.clear();
        }
        let away = self.memory.roll(today);
        self.save_memory();
        self.opening = Some(self.memory.opening(away));
    }

    fn save_memory(&self) {
        if let Some(store) = &self.store {
            store.save_memory(&self.memory);
        }
    }

    fn save_settings(&self) {
        if let Some(store) = &self.store {
            store.save_settings(&self.settings);
        }
    }

    /// The copy in the settings' language, or macOS's when that is "auto".
    fn load_copy(&mut self) {
        let Some((json, system)) = &self.copy_json else { return };
        let language = match self.settings.language.as_str() {
            "en" | "es" => self.settings.language.clone(),
            _ => system.clone(),
        };
        self.copy = Copy::parse(json, &language);
    }

    /// The first thing he says: the one place the memory is loud, and only
    /// the most interesting fact about it — coming back after days beats a
    /// round number, which beats a streak, which beats the generic line.
    fn greet(&mut self, now: u64) {
        let Some(o) = self.opening.clone() else {
            self.say_from(now, "boot", 6_000, &[]);
            return;
        };
        if o.first_day {
            self.say_from(now, "memory.hello", 6_000, &[]);
        } else if o.away > 1 {
            self.say_from(now, "memory.back", 6_000, &[&o.away.to_string()]);
        } else if DAY_MILESTONES.contains(&o.days) {
            self.say_from(now, "memory.milestone", 6_000, &[&o.days.to_string()]);
        } else if STREAK_MILESTONES.contains(&o.streak) {
            self.say_from(now, "memory.streak", 6_000, &[&o.streak.to_string()]);
        } else {
            self.say_from(now, "boot", 6_000, &[]);
        }
    }

    /// Coming down from `from`, catching the first ledge he overlaps on the
    /// way — chosen before the fall starts, never tested frame by frame. Each
    /// ledge must be `LEDGE_GAP` below the last, so the lift only goes down and
    /// the floor is the floor.
    fn fall(&mut self, now: u64, from: f64) {
        let (x, width) = (self.here(), self.pet());
        let caught = self
            .ledges
            .iter()
            .find(|l| {
                l.lift < from - LEDGE_GAP
                    && x + width * 0.65 > l.x
                    && x + width * 0.35 < l.x + l.width
            })
            .copied();
        let target = caught.map_or(0.0, |l| (l.lift - width * 0.8).max(0.0));
        // Short of the real ceiling (HEAT_FULL 0.7): needing the whole screen
        // to look hot would mean it never does.
        self.heat = ((from - target) / (self.max_lift() * 0.7).max(1.0)).min(1.0);
        self.falling = true;
        self.walk(now, x, target, FALL_SPEED, After::Fell { ledge: caught.map(|l| l.lift) });
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
            && self.home.is_none()
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

    /// Once a day per reminder, in a gap rather than taking one: the same
    /// `can_speak` as everything unprompted, so quiet and calls hold.
    fn remind(&mut self, now: u64) {
        if now.saturating_sub(self.reminder_at) < 9_000 || !self.can_speak(now) {
            return;
        }
        if now.saturating_sub(self.reminders_read) >= REMINDERS_REREAD
            && let Some(store) = &self.store
        {
            self.reminders_read = now;
            self.reminders = store.reminders(&self.today);
        }
        self.reminder_at = now;
        let today = self.today.clone();
        let Some(next) = self
            .reminders
            .iter()
            .find(|r| r.due_on(&today) && !self.reminded_today.contains(&r.id))
            .cloned()
        else {
            return;
        };
        self.reminded_today.insert(next.id.clone());
        self.react(now, Mood::Watching, Some("pop"), 3_000);
        self.say(now, next.text, 20_000);
        if self.speech.is_some() {
            self.speech_reminder = Some(next.id);
        }
    }

    fn say(&mut self, now: u64, text: String, ms: u64) {
        // "Quiet for an hour" from the menu holds everything he would volunteer.
        // In a call he keeps his gestures and loses his voice: talking over a
        // demo is what would make you regret installing him.
        if self.settings.quiet_until > unix_now()
            || (self.in_call && self.settings.in_call != "ignore" && !self.force_voice)
        {
            return;
        }
        let until = now + ms + text.chars().count() as u64 * self.reveal();
        self.speech = Some((text, until));
        self.speech_reminder = None;
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
        // The file, when he can see one: "Companion.tsx again" is about this
        // minute; "you are in VS Code" is true all day.
        if let Some(document) = document_in(self.title.clone())
            && Some(&document) != self.last_document.as_ref()
            && (self.file_line_at == 0
                || now.saturating_sub(self.file_line_at) > self.rated(FILE_LINE_EVERY))
        {
            self.last_document = Some(document.clone());
            self.file_line_at = now;
            self.app_line_at = now;
            let ext = document.rsplit('.').next().unwrap_or("").to_lowercase();
            let specific = format!("fileByExt.{ext}");
            let has_specific = self.copy.as_ref().is_some_and(|c| !c.pool(&specific).is_empty());
            self.react(now, Mood::Watching, None, 1_600);
            self.look = Some((Look { x: 0.0, y: -0.8 }, now + 1_400));
            self.say_from(now, if has_specific { &specific } else { "file" }, 5_500, &[&document]);
            return;
        }
        if self.switches.len() > SWITCH_LIMIT
            && now.saturating_sub(self.switch_line_at) > self.rated(SWITCH_COOLDOWN)
        {
            self.switch_line_at = now;
            self.app_line_at = now;
            self.react(now, Mood::Wow, Some("pop"), 1_600);
            self.say_from(now, "switching", 5_000, &[]);
            return;
        }
        if self.app_line_at != 0
            && now.saturating_sub(self.app_line_at) < self.rated(APP_LINE_EVERY)
        {
            return;
        }
        let key = match_app(&name).unwrap_or_else(|| format!("?{name}"));
        if self
            .said_about
            .get(&key)
            .is_some_and(|at| now.saturating_sub(*at) < self.rated(APP_REPEAT_AFTER))
        {
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
        (self.height - self.pet()).max(0.0)
    }

    /// His middle, in strip points (y up from the floor).
    fn middle(&self) -> (f64, f64) {
        (self.here() + self.pet() / 2.0, self.lift + self.pet() / 2.0)
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
            x >= here && x <= here + self.pet() && y >= self.lift && y <= self.lift + self.pet();
        if inside {
            let since = *self.hover_since.get_or_insert(now);
            if !self.petted && now.saturating_sub(since) >= PET_AFTER {
                self.petted = true;
                self.watching = false;
                // Counted either way: whether he was in the mood is his business,
                // that you did it is the fact the memory keeps.
                self.memory.pets += 1;
                self.save_memory();
                // Not always in the mood, and never at random.
                if PRICKLY.contains(&self.feeling) && self.chance(0.6) {
                    self.react(now, Mood::Idle, Some("shake"), 1_100);
                    self.look = Some((Look { x: 0.0, y: 0.5 }, now + 1_400));
                    // His own lines for the feeling are the right words for being touched in it.
                    let path = format!("feelings.{}", feeling_key(self.feeling));
                    self.say_from(now, &path, 3_600, &[]);
                } else {
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
        // From the corner of a call a click is as likely to be you missing the
        // window he stands in front of: a small reply, and nothing more.
        if self.peeking() {
            // Whatever he is already doing out there wins.
            if self.stepping_out || self.crossing {
                return;
            }
            // Three, and not one: then he steps out, says hello and goes back.
            if count < 3 {
                self.clicks = (count, now);
                self.react(now, Mood::Happy, Some("pop"), 1_200);
                return;
            }
            self.clicks = (0, now);
            self.introduce(now);
            return;
        }
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

    /// Out where he can be seen, but still his end of the strip: walking into
    /// the middle of someone's meeting is the whole nightmare.
    fn introduce(&mut self, now: u64) {
        self.stepping_out = true;
        let left = self.here() < self.width / 2.0;
        let out = if left { self.pet() * 0.5 } else { self.max_x() - self.pet() * 0.5 };
        self.walk(now, out, 0.0, WALK_SPEED * 1.5, After::Introduce { left });
    }

    fn wave(&mut self) {
        self.wave = self.wave.wrapping_add(1);
    }

    fn peeking(&self) -> bool {
        self.in_call && self.settings.in_call == "peek"
    }

    /// Off to the right edge, half showing, for a call — and back to where he
    /// was when it ends.
    fn call_changed(&mut self, now: u64) {
        if self.peeking() {
            self.home_x.get_or_insert(self.here());
            self.going_home = false;
            self.speech = None;
            self.pending.clear();
            self.then = None;
            self.walk(now, self.max_x() + self.pet() * 0.5, 0.0, WALK_SPEED * 2.0, After::Nothing);
        } else if !self.in_call {
            self.crossing = false;
            if let Some(back) = self.home_x.take() {
                self.walk(now, back, 0.0, WALK_SPEED, After::Nothing);
            }
        }
    }

    /// The peek's own poll: gestures, never anything that walks him into the
    /// middle of the screen; now and then round the back to the other edge,
    /// and a wave.
    fn peek_poll(&mut self, now: u64) {
        if now.saturating_sub(self.cross_at) > CROSS_EVERY && self.chance(0.35) {
            self.cross_at = now;
            self.travel(now, Travel::Behind);
            return;
        }
        if now.saturating_sub(self.wave_at) > 14_000 {
            self.wave_at = now;
            self.react(now, Mood::Happy, None, 1_400);
            self.wave();
            return;
        }
        if now.saturating_sub(self.moment_at) > self.rated(MOMENT_EVERY) && self.chance(0.5) {
            self.moment_at = now;
            let calm: Vec<&str> = MOMENTS
                .iter()
                .filter(|m| {
                    m.min <= 0.35
                        && !m.needs_prop
                        && !m.steps.iter().any(|(_, s)| matches!(s, Step::Go(_)))
                })
                .map(|m| m.key)
                .collect();
            let key = calm[self.below(calm.len())];
            self.start(now, key);
        }
    }

    /// The portal's middle: in the corner, just far enough in that he fits.
    fn portal_x(&self) -> f64 {
        self.pet() / 2.0 + 2.0
    }

    /// How wide he is, by the settings' size.
    fn pet(&self) -> f64 {
        pet_width(&self.settings.size)
    }

    fn max_x(&self) -> f64 {
        (self.width - self.pet()).max(1.0)
    }

    fn here(&self) -> f64 {
        self.x.unwrap_or(0.0)
    }

    /// Off the strip is allowed only while crossing, and then all the way.
    fn clamp(&self, x: f64) -> f64 {
        // All of him while crossing, half while peeking from an edge, else none.
        let over = if self.crossing {
            self.pet()
        } else if self.peeking() {
            self.pet() * 0.5
        } else {
            0.0
        };
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
                self.jump(if went_right { -self.pet() } else { self.width });
                let inset = 50.0 + self.below(150) as f64;
                // Pinned to the edge during a call, that being the whole contract;
                // otherwise a little way in, so he arrives walking.
                let landing = match (self.peeking(), went_right) {
                    (true, true) => -self.pet() * 0.5,
                    (true, false) => self.max_x() + self.pet() * 0.5,
                    (false, true) => inset,
                    (false, false) => self.max_x() - inset,
                };
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
            After::Introduce { left } => {
                self.react(now, Mood::Happy, Some("pop"), 3_600);
                self.wave();
                self.force_voice = true;
                self.say_from(now, "peekHello", 4_600, &[]);
                self.force_voice = false;
                self.pending.push((now + 5_400, Step::BackToPeek { left }));
            }
            After::Behind if self.peeking() => {
                // Back in the corner of a call: a wave, often but not always, and
                // never a souvenir — both at once is him doing a bit.
                if self.chance(0.6) {
                    self.wave_at = now;
                    self.pending.push((now + 900, Step::Wave));
                }
            }
            After::Behind => {
                // Most trips bring back nothing; behind the screen is somewhere
                // dusty, not a vending machine.
                if self.chance(0.4) {
                    let kind = SOUVENIRS[self.below(SOUVENIRS.len())];
                    self.react(now, Mood::Wow, Some("pop"), 1_800);
                    // He did not choose this and has only just noticed it: always a line.
                    self.wear(now, kind, true);
                } else if self.chance(0.55) {
                    self.say_from(now, "behind", 5_000, &[]);
                }
            }
            After::Top => {
                self.react(now, Mood::Watching, None, 2_200);
                self.look = Some((Look { x: 0.0, y: -0.8 }, now + 2_000));
                if self.chance(0.5) {
                    self.say_from(now, "climb", 4_000, &[]);
                }
                self.pending.push((now + 2_400, Step::ClimbDone));
            }
            After::Climbed => self.ladder = None,
            After::Fell { ledge } => {
                self.falling = false;
                match ledge {
                    None => {
                        self.react(now, Mood::Wow, Some("land"), 900);
                        if self.heat > 0.55 && self.chance(0.7) {
                            self.say_from(now, "hardLanding", 4_000, &[]);
                        }
                    }
                    Some(lift) => {
                        self.hanging = true;
                        self.react(now, Mood::Wow, None, 1_600);
                        if self.chance(0.7) {
                            self.say_from(now, "grab", 3_800, &[]);
                        }
                        let hold = 1_800 + self.below(2_200) as u64;
                        self.pending.push((now + hold, Step::Drop { lift }));
                    }
                }
            }
            After::Home => self.settle_in(now),
            After::Arrive => {
                self.errand = None;
                self.react(now, Mood::Watching, None, 2_000);
                self.look = Some((Look { x: 0.0, y: 0.4 }, now + 1_600));
            }
        }
    }

    /// The portal opens in the corner, he says so (sometimes), and a beat
    /// later sets off for it.
    fn head_home(&mut self, now: u64) {
        self.home_at = now;
        self.going_home = true;
        if self.chance(0.55) {
            self.say_from(now, "house.arriving", 3_000, &[]);
        }
        self.pending.push((now + 1_200, Step::GoHome));
    }

    /// In: off the strip until a time he picks, the bay counted on the way in
    /// (so a session that ends down there still counted the visit).
    fn settle_in(&mut self, now: u64) {
        self.home = Some(now);
        self.going_home = false;
        self.home_reason = Some(self.feeling);
        self.home_until = now + HOME_FOR.0 + self.below((HOME_FOR.1 - HOME_FOR.0) as usize) as u64;
        self.speech = None;
        self.speech_reminder = None;
        self.pending.clear();
        self.then = None;
        self.look = None;
        self.sit_until = None;
        self.mood = Mood::Idle;
        self.react_until = None;
        let bay = FURNITURE[self.below(FURNITURE.len())];
        *self.memory.furniture.entry(bay.to_string()).or_insert(0) += 1;
        self.save_memory();
    }

    /// Out again: pleased, and half the time holding something from the bay
    /// he was last in — which is then the arrival line, rather than "I am
    /// back" cut off by a remark about a mug.
    fn come_out(&mut self, now: u64) {
        let Some(since) = self.home.take() else { return };
        self.home_at = now;
        self.portal_closes = now + PORTAL_LINGERS;
        self.react(now, Mood::Happy, Some("pop"), 1_600);
        if self.chance(0.5) {
            let chair = self.opening.as_ref().and_then(|o| o.chair.clone());
            let at = scene_at(since, now, chair.as_deref(), self.home_reason).at;
            let speak = self.chance(0.75);
            self.wear(now, brought_up(at), speak);
        } else if self.chance(0.6) {
            self.say_from(now, "house.leaving", 3_600, &[]);
        }
        // A few steps out of the doorway, so he does not stand in his own porch.
        let x = self.portal_x() + self.pet() * 0.6 + self.below(160) as f64;
        self.walk(now, x, 0.0, WALK_SPEED, After::Nothing);
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
                    let step = (cursor - self.pet() / 2.0 - here).clamp(-140.0, 140.0);
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
                let off = if went_right { self.width } else { -self.pet() };
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
                self.errand = Some(target);
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
            Travel::House => {
                let recent = self.home_at != 0 && now.saturating_sub(self.home_at) < HOME_EVERY;
                if !self.settings.house || self.ladder.is_some() || recent {
                    return;
                }
                self.head_home(now);
            }
            Travel::Climb => {
                if self.ladder.is_some() || self.falling || self.hanging {
                    return;
                }
                let top = (self.max_lift() - 20.0)
                    .min(LADDER_MIN + self.below((LADDER_MAX - LADDER_MIN) as usize) as f64);
                if top < LADDER_MIN * 0.6 {
                    return;
                }
                self.ladder = Some(Ladder { x: here, height: top, falling: false });
                self.react(now, Mood::Happy, Some("pop"), 1_200);
                self.pending.push((now + 700, Step::ClimbUp));
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

/// A title he may look at: nothing on the blocklist, nothing absurdly long.
fn readable(title: &str) -> Option<String> {
    let lower = title.to_lowercase();
    let trimmed = title.trim();
    (!SENSITIVE.iter().any(|needle| lower.contains(needle))
        && !trimmed.is_empty()
        && trimmed.len() <= 200)
        .then(|| trimmed.to_string())
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

fn familiarity_key(f: Familiarity) -> &'static str {
    match f {
        Familiarity::New => "new",
        Familiarity::Knowing => "knowing",
        Familiarity::Familiar => "familiar",
        Familiarity::Old => "old",
    }
}

fn unix_now() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_or(0, |d| d.as_secs() as i64)
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
            front_title: None,
            music: None,
            strip_width: 1512.0,
            strip_height: 900.0,
            cursor_x: None,
            cursor_y: None,
            today: String::new(),
            in_call: false,
            ledges: Vec::new(),
            lyra: None,
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
                    front_title: None,
                    music: music.clone(),
                    strip_width: 1512.0,
                    strip_height: 900.0,
                    cursor_x: None,
                    cursor_y: None,
                    today: String::new(),
                    in_call: false,
                    ledges: Vec::new(),
                    lyra: None,
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
            front_title: None,
            music: None,
            strip_width: 1512.0,
            strip_height: 900.0,
            cursor_x: None,
            cursor_y: None,
            today: String::new(),
            in_call: false,
            ledges: Vec::new(),
            lyra: None,
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
                        front_title: None,
                        music: track.clone(),
                        strip_width: 1512.0,
                        strip_height: 900.0,
                        cursor_x: None,
                        cursor_y: None,
                        today: String::new(),
                        in_call: false,
                        ledges: Vec::new(),
                        lyra: None
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
                        front_title: None,
                        music: track,
                        strip_width: 1512.0,
                        strip_height: 900.0,
                        cursor_x: None,
                        cursor_y: None,
                        today: String::new(),
                        in_call: false,
                        ledges: Vec::new(),
                        lyra: None
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
                front_title: None,
                music: None,
                strip_width: 1512.0,
                strip_height: 900.0,
                cursor_x: Some(700.0),
                cursor_y: None,
                today: String::new(),
                in_call: false,
                ledges: Vec::new(),
                lyra: None,
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
                front_title: None,
                music: None,
                strip_width: 1512.0,
                strip_height: 900.0,
                cursor_x: cursor.map(|c| c.0),
                cursor_y: cursor.map(|c| c.1),
                today: String::new(),
                in_call: false,
                ledges: Vec::new(),
                lyra: None,
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
            front_title: None,
            music: None,
            strip_width: 1512.0,
            strip_height: 900.0,
            cursor_x: None,
            cursor_y: None,
            today: String::new(),
            in_call: false,
            ledges: Vec::new(),
            lyra: None,
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

    #[test]
    fn he_puts_things_on_and_takes_them_off() {
        let brain = Brain::seeded(21);
        let mut worn = std::collections::HashSet::new();
        let mut saw_leaving = false;
        for i in 0..(30 * 240) {
            let f = brain.tick(i * 250, quiet_senses(Some("Finder")));
            for p in f.worn {
                saw_leaving |= p.leaving;
                worn.insert(p.kind);
            }
        }
        assert!(!worn.is_empty(), "nothing worn in 30 minutes");
        assert!(saw_leaving, "never took anything off");
    }

    #[test]
    fn adjusting_needs_something_to_adjust_and_a_prop_gets_its_line() {
        let brain = talker("en");
        brain.tick(0, quiet_senses(None));
        {
            let mut s = brain.state.lock().unwrap();
            s.booted = true;
            s.wear(0, "tophat", true);
        }
        assert_eq!(brain.tick(100, quiet_senses(None)).worn[0].kind, "tophat");
        let said = brain.tick(1_300, quiet_senses(None)).speech.expect("a tophat line");
        assert!(lines("en", "props.tophat").contains(&said.text), "{}", said.text);
        // Without a prop, the poll never picks adjust or admire.
        let bare = Brain::seeded(4);
        let mut picked = Vec::new();
        for i in 0..(30 * 240) {
            if let Some(e) = bare.tick(i * 250, quiet_senses(Some("Finder"))).effect {
                picked.push(e.name);
            }
            bare.state.lock().unwrap().prop = None;
        }
        assert!(!picked.iter().any(|e| e == "adjust"), "adjusted nothing");
    }

    fn folder(name: &str, tico: &str, memory: &str) -> std::path::PathBuf {
        let dir = std::env::temp_dir().join(format!("tico-brain-{name}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::write(dir.join("tico.json"), tico).unwrap();
        std::fs::write(dir.join("memory.json"), memory).unwrap();
        dir
    }

    fn dated(today: &str) -> Senses {
        Senses { today: today.into(), ..quiet_senses(None) }
    }

    #[test]
    fn two_weeks_away_he_says_so_and_stands_where_he_stood() {
        let dir = folder(
            "away",
            r#"{"x":0.5,"pinned_props":{"head":"cap"},"parts":{"shell":"radio"}}"#,
            r#"{"first_seen":"2026-09-01","last_seen":"2026-10-04","days":20,"streak":4}"#,
        );
        let brain = Brain::still();
        brain.open(dir.to_string_lossy().into(), None, "2026-10-18".into());
        brain.set_copy(COPY.into(), "en".into());
        let first = brain.tick(0, dated("2026-10-18"));
        assert_eq!(first.x, (1512.0 - PET_WIDTH) * 0.5);
        assert_eq!(first.worn[0].kind, "cap");
        assert_eq!(first.parts.shell, "radio");
        let hello = brain.tick(1_700, dated("2026-10-18")).speech.unwrap().text;
        assert!(hello.contains("14"), "{hello}");
        let saved: Memory =
            serde_json::from_str(&std::fs::read_to_string(dir.join("memory.json")).unwrap())
                .unwrap();
        assert_eq!((saved.days, saved.streak, saved.last_seen.as_str()), (21, 1, "2026-10-18"));
        let _ = std::fs::remove_dir_all(dir);
    }

    #[test]
    fn quiet_means_less_talk_and_pets_are_remembered() {
        let count = |chattiness: &str| {
            let dir = folder(chattiness, &format!(r#"{{"chattiness":"{chattiness}"}}"#), "{}");
            let brain = Brain::still();
            brain.open(dir.to_string_lossy().into(), None, "2026-10-18".into());
            brain.set_copy(COPY.into(), "en".into());
            let (mut said, mut last) = (0, 0);
            for i in 0..(20 * 240) {
                if let Some(s) = brain
                    .tick(
                        i * 250,
                        Senses {
                            front_app: Some("Finder".into()),
                            front_title: None,
                            ..dated("2026-10-18")
                        },
                    )
                    .speech
                    && s.serial != last
                {
                    last = s.serial;
                    said += 1;
                }
            }
            let _ = std::fs::remove_dir_all(dir);
            said
        };
        let (quiet, chatty) = (count("quiet"), count("chatty"));
        assert!(quiet * 2 < chatty, "quiet {quiet} against chatty {chatty}");

        let dir = folder("pets", "{}", "{}");
        let brain = Brain::still();
        brain.open(dir.to_string_lossy().into(), None, "2026-10-18".into());
        let f = brain.tick(0, dated("2026-10-18"));
        let (cx, cy) = (f.x + 46.0, 46.0);
        for t in [100, 2_000] {
            brain.tick(t, Senses { cursor_x: Some(cx), cursor_y: Some(cy), ..dated("2026-10-18") });
        }
        let saved: Memory =
            serde_json::from_str(&std::fs::read_to_string(dir.join("memory.json")).unwrap())
                .unwrap();
        assert_eq!(saved.pets, 1);
        let _ = std::fs::remove_dir_all(dir);
    }

    fn calling(in_call: bool) -> Senses {
        Senses {
            in_call,
            front_app: Some("Finder".into()),
            front_title: None,
            ..quiet_senses(None)
        }
    }

    #[test]
    fn in_a_call_he_peeks_from_the_edge_in_silence_and_comes_back() {
        let brain = talker("en");
        let home = brain.tick(0, calling(false)).x;
        brain.tick(1_700, calling(false));
        let mut t = 20_000;
        brain.tick(t, calling(true));
        let edge = 1512.0 - PET_WIDTH + PET_WIDTH * 0.5;
        let mut last_effect = 0;
        let mut effects = Vec::new();
        let mut waves = 0;
        let mut last_wave = 0;
        while t < 20 * 60_000 {
            t += 250;
            let f = brain.tick(t, calling(true));
            if f.wave != last_wave {
                last_wave = f.wave;
                waves += 1;
            }
            assert!(f.speech.is_none(), "he spoke during a call: {:?}", f.speech);
            if let Some(e) = f.effect
                && e.serial != last_effect
            {
                last_effect = e.serial;
                effects.push(e.name);
            }
            assert!(
                f.x <= 1512.0 + 1.0 && (f.x >= edge - 1.0 || f.x <= 0.0 || f.walking),
                "x = {} in a call",
                f.x
            );
        }
        assert!(!effects.is_empty() || waves > 0, "no gestures in twenty minutes of a call");
        assert!(waves > 10, "only {waves} waves in twenty minutes of a call");
        for name in ["hop", "spin", "bounce", "pogo", "land"] {
            assert!(!effects.iter().any(|e| e == name), "{name} is not a corner gesture");
        }
        brain.tick(t + 250, calling(false));
        let mut back = brain.tick(t + 500, calling(false));
        for i in 0..40 {
            back = brain.tick(t + 750 + i * 250, calling(false));
        }
        assert!((back.x - home).abs() < 1.0, "came back to {} not {home}", back.x);
    }

    #[test]
    fn hide_means_hidden() {
        let dir = folder("hide", r#"{"in_call":"hide"}"#, "{}");
        let brain = Brain::still();
        brain.open(dir.to_string_lossy().into(), None, "2026-10-18".into());
        assert!(!brain.tick(0, calling(false)).hidden);
        assert!(brain.tick(1_000, calling(true)).hidden);
        assert!(!brain.tick(2_000, calling(false)).hidden);
        let _ = std::fs::remove_dir_all(dir);
    }

    #[test]
    fn a_due_reminder_is_said_once_a_day_with_a_button_and_done_moves_it_on() {
        let dir = folder("remind", "{}", "{}");
        std::fs::write(
            dir.join("reminders.json"),
            r#"[{"id":"iva","text":"El IVA vence el 15.","due":"2026-10-15","remind_from":"2026-10-01","repeat":"monthly"}]"#,
        )
        .unwrap();
        let brain = Brain::still();
        brain.open(dir.to_string_lossy().into(), None, "2026-10-18".into());
        brain.set_copy(COPY.into(), "es".into());
        let mut shown = Vec::new();
        let mut last = 0;
        for i in 0..(5 * 240) {
            let f = brain.tick(
                i * 250,
                Senses {
                    front_app: Some("Finder".into()),
                    front_title: None,
                    ..dated("2026-10-18")
                },
            );
            if let Some(s) = f.speech
                && s.serial != last
            {
                last = s.serial;
                if s.reminder.is_some() {
                    shown.push((s.text, s.button));
                }
            }
        }
        assert_eq!(shown.len(), 1, "once a day: {shown:?}");
        assert_eq!(shown[0].0, "El IVA vence el 15.");
        assert!(shown[0].1.is_some(), "no button label");
        brain.complete_reminder("iva".into());
        let saved: Vec<Reminder> =
            serde_json::from_str(&std::fs::read_to_string(dir.join("reminders.json")).unwrap())
                .unwrap();
        assert_eq!(saved[0].due, "2026-11-15");
        let _ = std::fs::remove_dir_all(dir);
    }

    #[test]
    fn a_clock_that_does_not_start_at_zero_does_not_make_everything_due_at_once() {
        // The shell's clock is uptime: hours in, never zero.
        let brain = talker("en");
        let t0 = 5 * 3_600_000;
        let first = brain.tick(t0, quiet_senses(Some("Finder")));
        assert!(first.speech.is_none(), "spoke on the first tick: {:?}", first.speech);
        assert_eq!(first.move_serial, 0, "walked on the first tick");
        let hello = brain.tick(t0 + 1_700, quiet_senses(Some("Finder"))).speech.unwrap().text;
        assert!(lines("en", "boot").contains(&hello), "{hello}");
    }

    #[test]
    fn a_file_in_the_title_gets_a_remark_and_secrets_are_never_read() {
        assert_eq!(readable(".env-prod — Condominios"), None);
        assert_eq!(readable("My 1Password vault"), None);
        assert_eq!(readable("Companion.tsx — tico").as_deref(), Some("Companion.tsx — tico"));
        let brain = talker("en");
        brain.tick(0, quiet_senses(None));
        brain.tick(1_700, quiet_senses(None));
        let editing =
            |t| Senses { front_title: Some("brain.rs — tico".into()), ..quiet_senses(Some(t)) };
        brain.tick(20_000, editing("Code"));
        let said = brain.tick(22_000, editing("Code")).speech.expect("a line about the file");
        assert!(said.text.contains("brain.rs"), "{}", said.text);
    }

    fn with_ledges(ledges: Vec<Ledge>) -> Senses {
        Senses { ledges, ..quiet_senses(None) }
    }

    #[test]
    fn a_ladder_goes_up_and_comes_down_or_slips() {
        let (mut slipped, mut climbed_down) = (0, 0);
        for seed in 1..30 {
            let brain = Brain::seeded(seed);
            brain.state.lock().unwrap().moment_at = u64::MAX;
            brain.tick(0, with_ledges(vec![]));
            brain.state.lock().unwrap().travel(0, Travel::Climb);
            let ladder = brain.tick(1, with_ledges(vec![])).ladder.expect("a ladder");
            assert!((LADDER_MIN..=LADDER_MAX).contains(&ladder.height));
            let (mut top, mut saw_fall) = (0.0f64, false);
            for i in 1..200u64 {
                let f = brain.tick(i * 250, with_ledges(vec![]));
                top = top.max(f.lift);
                saw_fall |= f.ladder.is_some_and(|l| l.falling);
                if f.ladder.is_none() && f.lift == 0.0 && !f.falling && !f.walking && i > 4 {
                    break;
                }
            }
            assert!((top - ladder.height).abs() < 1.0, "climbed to {top} of {}", ladder.height);
            if saw_fall { slipped += 1 } else { climbed_down += 1 }
        }
        assert!(slipped > 0 && climbed_down > 0, "slipped {slipped}, climbed down {climbed_down}");
    }

    #[test]
    fn dropped_over_a_window_he_catches_its_edge_hangs_and_drops_again() {
        let brain = Brain::still();
        let f = brain.tick(0, with_ledges(vec![]));
        let window = Ledge { x: f.x - 50.0, width: 400.0, lift: 300.0 };
        // The shell refreshes the ledges ahead of any fall.
        brain.tick(5, with_ledges(vec![window]));
        brain.press(10, f.x + 40.0, 40.0, f.x, 0.0);
        brain.drag(20, f.x + 40.0, 540.0);
        brain.release(30);
        let falling = brain.tick(40, with_ledges(vec![window]));
        assert!(falling.falling);
        assert!(
            (falling.lift - (300.0 - PET_WIDTH * 0.8)).abs() < 1.0,
            "falls to the ledge, not the floor: {}",
            falling.lift
        );
        let mut hung = false;
        let mut t = 40;
        while t < 10_000 {
            t += 100;
            let f = brain.tick(t, with_ledges(vec![window]));
            hung |= f.hanging;
            if hung && f.lift == 0.0 && !f.falling {
                return;
            }
        }
        panic!("hung: {hung}, never reached the floor");
    }

    #[test]
    fn dropped_into_the_open_portal_he_goes_through_and_leaves_his_hat_on_the_rail() {
        let brain = talker("en");
        brain.tick(0, quiet_senses(None));
        // No portal, no way in: a drop in the corner is just a drop.
        brain.press(100, 500.0, 0.0, 500.0, 0.0);
        brain.drag(150, 50.0, 0.0);
        brain.release(200);
        assert!(brain.tick(2_000, quiet_senses(None)).portal.is_none());
        assert!(!brain.tick(4_000, quiet_senses(None)).home);
        brain.go_home();
        assert_eq!(brain.tick(4_250, quiet_senses(None)).portal.map(|p| p.inside), Some(false));
        brain.state.lock().unwrap().wear(4_250, "cap", false);
        let x = brain.tick(4_255, quiet_senses(None)).x;
        brain.press(4_260, x + 40.0, 0.0, x, 0.0);
        brain.drag(4_280, 60.0, 40.0);
        brain.release(4_300);
        let mut frame = brain.tick(4_350, quiet_senses(None));
        for t in 1..20 {
            frame = brain.tick(4_350 + t * 250, quiet_senses(None));
        }
        assert!(frame.home);
        assert_eq!(frame.portal.map(|p| p.inside), Some(true));
        assert!(frame.worn.iter().all(|w| w.kind != "cap"));
        assert_eq!(brain.burrow().left, vec!["cap".to_string()]);
        let burrow = brain.burrow();
        assert!(burrow.present);
        assert!(lines("en", &format!("house.at.{}", burrow.at)).contains(&burrow.line));
        // Clicked in the cutaway, he comes up and walks out of the doorway.
        brain.come_up();
        let frame = brain.tick(10_000, quiet_senses(None));
        assert!(!frame.home);
        // Open behind him a moment, then gone.
        assert_eq!(frame.portal.map(|p| p.inside), Some(false));
        assert!(brain.tick(12_000, quiet_senses(None)).portal.is_none());
        assert!(frame.x > 60.0);
        assert_eq!(brain.burrow().line, lines("en", "house.empty")[0]);
    }

    #[test]
    fn he_goes_home_on_his_own_and_comes_out_when_he_likes() {
        let brain = walker(3);
        at(&brain, 0);
        brain.perform("house".into());
        let mut went = None;
        let mut back = None;
        for i in 1..(8 * 240) {
            let now = i * 250;
            let frame = at(&brain, now);
            if frame.home && went.is_none() {
                went = Some(now);
            }
            if went.is_some() && !frame.home && back.is_none() {
                back = Some(now);
            }
        }
        let (went, back) = (went.expect("never went in"), back.expect("never came out"));
        let stayed = back - went;
        assert!((HOME_FOR.0..=HOME_FOR.1 + 1_000).contains(&stayed), "stayed {stayed}");
        // And not again straight away.
        brain.perform("house".into());
        assert!(!at(&brain, back + 10_000).home);
    }

    #[test]
    fn turning_the_burrow_off_evicts_him() {
        let brain = Brain::still();
        brain.tick(0, quiet_senses(None));
        brain.state.lock().unwrap().settle_in(0);
        let mut settings = brain.settings();
        settings.house = false;
        brain.update_settings(settings);
        assert!(!brain.tick(250, quiet_senses(None)).home);
    }

    #[test]
    fn with_lyra_he_sings_the_lines_and_not_the_gaps() {
        let brain = talker("en");
        let song = Track { artist: "a".into(), song: "s".into(), genre: String::new(), bpm: 0 };
        let mut senses = quiet_senses(None);
        senses.music = Some(song);
        senses.lyra = Some(Lyra { sung: Some(true), line: 1, missing: false, overlay_x: None });
        assert!(brain.tick(0, senses.clone()).singing);
        senses.lyra = Some(Lyra { sung: Some(false), line: 1, missing: false, overlay_x: None });
        assert!(!brain.tick(250, senses.clone()).singing);
        // No synced lyrics to go by: he sings along as he always did.
        senses.lyra = Some(Lyra { sung: None, line: 1, missing: false, overlay_x: None });
        assert!(brain.tick(500, senses.clone()).singing);
        // A song with no lyrics anywhere is sometimes worth a word.
        let said = (0..40).any(|i| {
            let b = talker("en");
            b.state.lock().unwrap().rng = i + 1;
            let mut s = senses.clone();
            s.lyra = Some(Lyra { sung: None, line: 0, missing: true, overlay_x: None });
            b.tick(20_000, s).speech.is_some_and(|sp| lines("en", "lyricsNone").contains(&sp.text))
        });
        assert!(said);
    }

    #[test]
    fn three_clicks_in_a_call_and_he_steps_out_to_say_hello() {
        let brain = talker("en");
        let mut senses = quiet_senses(None);
        brain.tick(0, senses.clone());
        senses.in_call = true;
        // Into the corner first.
        for t in 1..40 {
            brain.tick(t * 250, senses.clone());
        }
        let corner = brain.tick(10_000, senses.clone()).x;
        assert!(corner > 1_400.0);
        let wave = brain.tick(10_250, senses.clone()).wave;
        for t in 0..3 {
            brain.press(10_300 + t * 100, corner + 40.0, 30.0, corner, 0.0);
            brain.release(10_350 + t * 100);
        }
        let mut frame = brain.tick(10_700, senses.clone());
        // Out in about a second, hello for five, then back.
        for t in 1..16 {
            frame = brain.tick(10_700 + t * 250, senses.clone());
        }
        assert!(frame.x < corner - 40.0, "stepped out to {}", frame.x);
        assert_ne!(frame.wave, wave);
        assert!(frame.speech.is_some_and(|s| lines("en", "peekHello").contains(&s.text)));
        // And back to the corner afterwards.
        for t in 1..60 {
            frame = brain.tick(21_000 + t * 250, senses.clone());
        }
        assert!(frame.x > 1_400.0, "back at {}", frame.x);
    }

    #[test]
    fn a_narrower_display_puts_him_back_on_the_strip() {
        let brain = Brain::still();
        brain.tick(0, quiet_senses(None));
        brain.state.lock().unwrap().x = Some(1_400.0);
        let mut senses = quiet_senses(None);
        senses.strip_width = 1_024.0;
        let x = brain.tick(250, senses).x;
        assert!(x <= 1_024.0 - PET_WIDTH, "x = {x}");
    }

    #[test]
    fn put_down_halfway_through_an_errand_he_carries_on_to_it() {
        let brain = walker(5);
        at(&brain, 0);
        brain.state.lock().unwrap().travel(0, Travel::Errand);
        let target = brain.state.lock().unwrap().errand.expect("an errand");
        let x = at(&brain, 500).x;
        brain.press(600, x + 40.0, 30.0, x, 0.0);
        brain.drag(650, x + 40.0 + (if target > 700.0 { -300.0 } else { 300.0 }), 30.0);
        brain.release(700);
        let mut frame = at(&brain, 750);
        for i in 1..120 {
            frame = at(&brain, 750 + i * 250);
        }
        assert!(
            (frame.x - brain.state.lock().unwrap().clamp(target)).abs() <= 40.0,
            "at {} for {target}",
            frame.x
        );
        assert!(brain.state.lock().unwrap().errand.is_none());
    }

    #[test]
    fn a_declined_pet_still_counts() {
        let brain = Brain::still();
        brain.tick(0, quiet_senses(None));
        {
            let mut st = brain.state.lock().unwrap();
            st.feeling = Feeling::Rattled;
            st.rng = 3;
        }
        let x = brain.state.lock().unwrap().here();
        let mut senses = quiet_senses(None);
        senses.cursor_x = Some(x + 40.0);
        senses.cursor_y = Some(40.0);
        for t in 1..12 {
            brain.tick(t * 250, senses.clone());
        }
        assert_eq!(brain.state.lock().unwrap().memory.pets, 1);
    }
}
