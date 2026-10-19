//! What outlives the process: `tico.json` (settings) and `memory.json` (his
//! history with you), the same files and fields as the Tauri build's
//! `state.rs` and `memory.rs`, so one can read what the other wrote.
//!
//! The memory keeps the line `memory.rs` drew: days known, streak, how often he
//! has been petted and picked up, which things he has worn. Never which apps,
//! which titles, which songs — a pet that remembers last Tuesday's app usage is
//! a tracker wearing a costume.

use std::collections::HashMap;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

/// Worn this many times before it counts as a preference.
const FAVOURITE_AFTER: u32 = 4;
/// The burrow's rail keeps the last few things left down there.
const KEEPS: usize = 6;

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, uniffi::Record)]
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

/// `tico.json`. Fields the native shell does not use yet (size, in-call mode,
/// window titles, the burrow) are kept so writing it back loses nothing.
#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, uniffi::Record)]
#[serde(default)]
pub struct Settings {
    /// Where he stood, as a fraction of the strip's width.
    pub x: f64,
    pub chattiness: String,
    pub size: String,
    /// Unix seconds until which he keeps unprompted remarks to himself.
    pub quiet_until: i64,
    pub in_call: String,
    pub read_titles: bool,
    pub language: String,
    pub house: bool,
    pub parts: Parts,
    /// What he wears permanently, by place ("head" → "cap").
    pub pinned_props: HashMap<String, String>,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            x: 0.86,
            chattiness: "normal".into(),
            size: "normal".into(),
            quiet_until: 0,
            in_call: "peek".into(),
            read_titles: false,
            language: "auto".into(),
            house: true,
            parts: Parts::default(),
            pinned_props: HashMap::new(),
        }
    }
}

impl Settings {
    /// How much every unprompted floor stretches: quiet is three times as long.
    pub fn rate(&self) -> f64 {
        match self.chattiness.as_str() {
            "quiet" => 3.0,
            "chatty" => 0.45,
            _ => 1.0,
        }
    }
}

/// `memory.json`.
#[derive(Clone, Debug, Default, Deserialize, Serialize, PartialEq)]
#[serde(default)]
pub struct Memory {
    pub first_seen: String,
    pub last_seen: String,
    pub days: u32,
    pub streak: u32,
    pub best_streak: u32,
    pub pets: u32,
    pub drags: u32,
    pub props: HashMap<String, u32>,
    pub furniture: HashMap<String, u32>,
    pub left: Vec<String>,
}

/// What he knows on waking, worked out once per launch (and again if the
/// day turns over while he runs).
#[derive(Clone, Debug, PartialEq)]
pub struct Opening {
    pub days: u32,
    pub streak: u32,
    /// Days since he last saw you, when more than one.
    pub away: u32,
    pub first_day: bool,
    pub favourite: Option<String>,
}

impl Memory {
    /// Counts today, once: a day known, the streak kept or broken. Returns the
    /// gap in days when it was more than one.
    pub fn roll(&mut self, today: &str) -> u32 {
        if self.last_seen == today {
            return 0;
        }
        let gap = match (days_from_civil(&self.last_seen), days_from_civil(today)) {
            (Some(last), Some(now)) => now - last,
            _ => 0,
        };
        if self.first_seen.is_empty() {
            self.first_seen = today.to_string();
        }
        // A clock set backwards is not a new day.
        if gap < 0 {
            return 0;
        }
        self.days += 1;
        self.streak = if gap == 1 { self.streak + 1 } else { 1 };
        self.best_streak = self.best_streak.max(self.streak);
        self.last_seen = today.to_string();
        if gap > 1 { gap as u32 } else { 0 }
    }

    /// The most worn, once it has been worn often enough to be a preference.
    pub fn favourite(&self) -> Option<String> {
        self.props
            .iter()
            .filter(|(_, used)| **used >= FAVOURITE_AFTER)
            .max_by_key(|(kind, used)| (**used, *kind))
            .map(|(kind, _)| kind.clone())
    }

    pub fn opening(&self, away: u32) -> Opening {
        Opening {
            days: self.days,
            streak: self.streak,
            away,
            first_day: self.days <= 1,
            favourite: self.favourite(),
        }
    }

    pub fn left_behind(&mut self, kind: &str) {
        if !self.left.iter().any(|k| k == kind) {
            self.left.push(kind.to_string());
            while self.left.len() > KEEPS {
                self.left.remove(0);
            }
        }
    }
}

/// `YYYY-MM-DD` to a day number, for gaps between dates without a calendar
/// library (Howard Hinnant's days-from-civil).
fn days_from_civil(date: &str) -> Option<i64> {
    let mut parts = date.split('-').map(|p| p.parse::<i64>().ok());
    let (y, m, d) = (parts.next()??, parts.next()??, parts.next()??);
    let y = if m <= 2 { y - 1 } else { y };
    let era = y.div_euclid(400);
    let yoe = y - era * 400;
    let doy = (153 * (if m > 2 { m - 3 } else { m + 9 }) + 2) / 5 + d - 1;
    let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
    Some(era * 146_097 + doe - 719_468)
}

/// The two files in one folder. Writes are best effort, like the Tauri build:
/// a pet that fails to remember a pat should not fail at anything else.
pub struct Store {
    dir: PathBuf,
}

impl Store {
    /// Opens `dir`, first copying the files from `seed` when `dir` has none —
    /// the native build starting from what the Tauri one already knew.
    pub fn open(dir: &Path, seed: Option<&Path>) -> Self {
        let _ = std::fs::create_dir_all(dir);
        if let Some(seed) = seed {
            for name in ["tico.json", "memory.json"] {
                let (from, to) = (seed.join(name), dir.join(name));
                if !to.exists() && from.exists() {
                    let _ = std::fs::copy(from, to);
                }
            }
        }
        Self { dir: dir.to_path_buf() }
    }

    pub fn settings(&self) -> Settings {
        self.read("tico.json")
    }

    pub fn memory(&self) -> Memory {
        self.read("memory.json")
    }

    pub fn save_settings(&self, settings: &Settings) {
        self.write("tico.json", settings);
    }

    pub fn save_memory(&self, memory: &Memory) {
        self.write("memory.json", memory);
    }

    fn read<T: for<'de> Deserialize<'de> + Default>(&self, name: &str) -> T {
        std::fs::read_to_string(self.dir.join(name))
            .ok()
            .and_then(|raw| serde_json::from_str(&raw).ok())
            .unwrap_or_default()
    }

    fn write<T: Serialize>(&self, name: &str, value: &T) {
        if let Ok(json) = serde_json::to_string_pretty(value) {
            let _ = std::fs::write(self.dir.join(name), json);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn days_streaks_and_gaps_roll_like_the_tauri_build() {
        let mut m = Memory::default();
        assert_eq!(m.roll("2026-10-18"), 0);
        assert_eq!((m.days, m.streak), (1, 1));
        assert_eq!(m.roll("2026-10-18"), 0, "the same day counts once");
        assert_eq!(m.roll("2026-10-19"), 0);
        assert_eq!((m.days, m.streak), (2, 2));
        assert_eq!(m.roll("2026-11-02"), 14, "two weeks away");
        assert_eq!((m.days, m.streak, m.best_streak), (3, 1, 2));
        assert_eq!(m.roll("2026-10-01"), 0, "a clock set backwards is not a new day");
        assert_eq!(m.days, 3);
        // Across a year end and a leap day.
        let mut leap =
            Memory { last_seen: "2028-02-28".into(), days: 1, streak: 1, ..Default::default() };
        assert_eq!(leap.roll("2028-03-01"), 2);
    }

    #[test]
    fn a_favourite_takes_four_wearings() {
        let mut m = Memory::default();
        m.props.insert("cap".into(), 3);
        assert_eq!(m.favourite(), None);
        m.props.insert("cap".into(), 4);
        m.props.insert("crown".into(), 2);
        assert_eq!(m.favourite().as_deref(), Some("cap"));
    }

    #[test]
    fn the_tauri_files_read_and_seed() {
        let base = std::env::temp_dir().join(format!("tico-store-{}", std::process::id()));
        let (seed, dir) = (base.join("tauri"), base.join("native"));
        std::fs::create_dir_all(&seed).unwrap();
        std::fs::write(
            seed.join("tico.json"),
            r#"{"x":0.3,"chattiness":"quiet","parts":{"shell":"astro"},"pinnedProps":{}}"#,
        )
        .unwrap();
        std::fs::write(seed.join("memory.json"), r#"{"days":12,"streak":3,"props":{"cap":5}}"#)
            .unwrap();
        let store = Store::open(&dir, Some(&seed));
        let settings = store.settings();
        assert_eq!(
            (settings.x, settings.chattiness.as_str(), settings.parts.shell.as_str()),
            (0.3, "quiet", "astro")
        );
        assert_eq!(settings.parts.hands, "mitts", "missing fields keep their defaults");
        assert_eq!(store.memory().days, 12);
        // Written to the native folder, never to the seed.
        store.save_memory(&Memory { days: 13, ..store.memory() });
        assert_eq!(Store::open(&dir, None).memory().days, 13);
        assert!(std::fs::read_to_string(seed.join("memory.json")).unwrap().contains("\"days\":12"));
        let _ = std::fs::remove_dir_all(base);
    }
}
