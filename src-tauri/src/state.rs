use std::sync::Mutex;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};

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
        }
    }
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
