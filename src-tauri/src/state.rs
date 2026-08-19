use std::sync::Mutex;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager};

/// The fixed sets. Here rather than in `lib.rs` because the tray is no longer the
/// only thing that writes them — the preferences window does too, and a value
/// arriving from a window is checked against these before it is stored.
pub const CHATTINESS: [&str; 3] = ["quiet", "normal", "chatty"];
pub const SIZES: [&str; 3] = ["small", "normal", "large"];
pub const IN_CALL: [&str; 3] = ["peek", "hide", "ignore"];
pub const LANGUAGES: [&str; 3] = ["auto", "en", "es"];

/// Which variant fills each slot of his body. Mirrors `CompanionParts` in
/// `parts.tsx`, and the strings are that file's registry keys.
///
/// Deliberately not validated against a list here. The list is a list of
/// *drawings*, it lives with them, and a second copy in Rust would be a copy that
/// goes stale the first time one is renamed — so an unknown slot value is the
/// frontend's to fall back from, which `bodyFrom` does.
#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(default)]
pub struct Parts {
    pub shell: String,
    pub hands: String,
    pub feet: String,
    pub antenna: String,
}

impl Default for Parts {
    fn default() -> Self {
        Self {
            shell: "terminal".into(),
            hands: "mitts".into(),
            feet: "pills".into(),
            antenna: "led".into(),
        }
    }
}

/// Everything that has to survive a restart. Small enough that it is written on
/// every change rather than debounced — the file is a few dozen bytes and the
/// alternative is losing it on a crash.
#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(default)]
pub struct State {
    /// Where he stands, as a fraction of the strip width rather than a pixel
    /// offset, so plugging in a different monitor puts him somewhere sensible
    /// instead of off the edge.
    pub x: f64,
    pub chattiness: String,
    pub size: String,
    /// Unix seconds until which he says nothing unprompted. `0` is "not quiet".
    /// Stored as an instant rather than a duration so quitting the app does not
    /// silently hand back the silence you asked for.
    pub quiet_until: i64,
    /// What he does while the microphone is live: `peek`, `hide` or `ignore`.
    pub in_call: String,
    /// Whether he may read the focused window's title. Off until switched on:
    /// this one costs an Accessibility grant and exposes far more than the app
    /// name does, so it is never the default.
    pub read_titles: bool,
    /// `auto`, `en` or `es`. `auto` follows the system, which is what it did
    /// before there was a way to say otherwise.
    pub language: String,
    /// Whether the burrow exists at all. Off, the hatch is not drawn, its click
    /// region is never published, and he never goes down — so it costs nothing
    /// rather than costing a little. On by default: it is his home, and a pet
    /// that has to be switched on is a feature list.
    #[serde(default = "yes")]
    pub house: bool,
    /// The body he was last given. Default is the one he has always had.
    #[serde(default)]
    pub parts: Parts,
    /// Something he wears permanently, chosen rather than drawn from the hat.
    ///
    /// It does not stop him putting other things on: the pin is what he goes back
    /// to when a hat comes off, not a lock on the wardrobe. A pet whose owner
    /// picked a scarf and thereby switched off every other costume has been made
    /// more configurable and less alive.
    #[serde(default)]
    pub pinned_prop: Option<String>,
}

impl Default for State {
    fn default() -> Self {
        Self {
            // Bottom right, out of the way, where a first-time pet should start.
            x: 0.86,
            chattiness: "normal".into(),
            size: "normal".into(),
            quiet_until: 0,
            // Peeking by default. Hiding entirely is the safe choice for a client
            // demo and the sad one for a standup, and the app cannot tell which
            // meeting you are in — so it picks the charming one and lets you say
            // otherwise.
            in_call: "peek".into(),
            read_titles: false,
            language: "auto".into(),
            house: true,
            parts: Parts::default(),
            pinned_prop: None,
        }
    }
}

/// `serde` needs a function, and `true` is not one.
fn yes() -> bool {
    true
}

pub struct Store(pub Mutex<State>);

fn file(app: &AppHandle) -> Option<std::path::PathBuf> {
    let dir = app.path().app_config_dir().ok()?;
    let _ = std::fs::create_dir_all(&dir);
    Some(dir.join("tico.json"))
}

/// A missing or unreadable file is not an error worth surfacing — it is a first
/// run, or a file someone edited badly, and the defaults are correct for both.
pub fn load(app: &AppHandle) -> State {
    file(app)
        .and_then(|path| std::fs::read_to_string(path).ok())
        .and_then(|raw| serde_json::from_str(&raw).ok())
        .unwrap_or_default()
}

pub fn save(app: &AppHandle, state: &State) {
    let Some(path) = file(app) else { return };
    if let Ok(json) = serde_json::to_string_pretty(state) {
        let _ = std::fs::write(path, json);
    }
}

/// Mutate the stored state and write it out in one step, so the two can never
/// drift apart.
pub fn update(app: &AppHandle, edit: impl FnOnce(&mut State)) {
    let store = app.state::<Store>();
    let Ok(mut current) = store.0.lock() else { return };
    edit(&mut current);
    save(app, &current);
}

#[tauri::command]
pub fn boot(app: AppHandle) -> State {
    app.state::<Store>()
        .0
        .lock()
        .map(|state| state.clone())
        .unwrap_or_default()
}

/// Tells every window what the settings now are.
///
/// Broadcast rather than aimed at the strip. There are two things that write
/// settings now — the tray and the preferences window — and each has to see what
/// the other did, or the window shows a stale tick for a quiet hour the tray just
/// started.
pub fn publish(app: &AppHandle) {
    let _ = app.emit("settings", boot(app.clone()));
}

/// A settings change from the preferences window. Absent means "leave it".
///
/// One command rather than one per setting: they are all the same operation —
/// write it, save it, tell everyone — and the difference between them is a field
/// name. The pin is not in here; see `set_pinned_prop` for why.
#[derive(Debug, Deserialize)]
pub struct Patch {
    pub chattiness: Option<String>,
    pub size: Option<String>,
    pub in_call: Option<String>,
    pub language: Option<String>,
    pub house: Option<bool>,
    pub read_titles: Option<bool>,
    pub parts: Option<Parts>,
    pub quiet_until: Option<i64>,
}

/// One of a fixed set, or what it already was.
///
/// The window only ever sends members of these lists, which is exactly why the
/// check is here rather than there: the store is also a file somebody can edit,
/// and a `chattiness` of `"loud"` leaves `CHATTINESS[value]` undefined on the
/// other side — he does not fail loudly, he simply stops talking.
fn one_of(allowed: &[&str], value: String, current: &mut String) {
    if allowed.contains(&value.as_str()) {
        *current = value;
    }
}

#[tauri::command]
pub fn set_settings(app: AppHandle, patch: Patch) {
    // Reading window titles costs an Accessibility grant, and a checkbox that
    // ticks itself and then silently does nothing is worse than no checkbox. So
    // the request is dropped and the grant is where they are sent instead — a
    // prompt is easy to dismiss and hard to find again.
    let titles = match patch.read_titles {
        Some(true) if !crate::window_title::trusted() => {
            #[cfg(target_os = "macos")]
            let _ = std::process::Command::new("open")
                .arg("x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility")
                .status();
            None
        }
        other => other,
    };

    update(&app, |current| {
        if let Some(value) = patch.chattiness {
            one_of(&CHATTINESS, value, &mut current.chattiness);
        }
        if let Some(value) = patch.size {
            one_of(&SIZES, value, &mut current.size);
        }
        if let Some(value) = patch.in_call {
            one_of(&IN_CALL, value, &mut current.in_call);
        }
        if let Some(value) = patch.language {
            one_of(&LANGUAGES, value, &mut current.language);
        }
        if let Some(on) = patch.house {
            current.house = on;
        }
        if let Some(on) = titles {
            current.read_titles = on;
        }
        if let Some(parts) = patch.parts {
            current.parts = parts;
        }
        if let Some(until) = patch.quiet_until {
            current.quiet_until = until;
        }
    });

    // The watcher keeps its own copy so the poll never has to take the lock.
    if let Some(on) = titles {
        crate::active_app::set_titles(on);
    }

    publish(&app);
}

/// The pin, on its own, because `null` has to mean "take it off" here and mean
/// "not mentioned" everywhere else in `Patch`. Encoding both in one optional
/// field needs a serde dance that nobody reading this later would enjoy.
#[tauri::command]
pub fn set_pinned_prop(app: AppHandle, prop: Option<String>) {
    update(&app, |current| current.pinned_prop = prop);
    publish(&app);
}

#[tauri::command]
pub fn set_pet_x(app: AppHandle, x: f64) {
    update(&app, |state| state.x = x.clamp(0.0, 1.0));
}

pub fn now() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|elapsed| elapsed.as_secs() as i64)
        .unwrap_or(0)
}
