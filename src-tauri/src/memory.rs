use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Mutex;

use chrono::{Local, NaiveDate};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};

/// What he remembers between sessions, and — more importantly — what he does not.
///
/// There is already a rule about this in `Companion.tsx`, written when everything
/// he knew died with the process: *a pet that remembers last Tuesday's app usage
/// is a tracker wearing a costume*. That rule stands, and this file is built to
/// stay on the right side of it.
///
/// The line it draws is between **his history with you** and **a record of your
/// activity**. How many days he has been around, whether he saw you yesterday,
/// how often he has been picked up, which hat he has worn most — all of that is
/// about him, and it is what makes him different in week four than in week one.
/// Which applications you use, when, and for how long is about *you*, and none of
/// it is written here. It stays in memory and dies with the process, exactly as
/// before.
///
/// So: no app names, no window titles, no track names, no timestamps finer than a
/// date. The whole file is a few hundred bytes and there is nothing in it worth
/// reading if you found it.
#[derive(Clone, Debug, Default, Deserialize, Serialize)]
#[serde(default)]
pub struct Memory {
    /// `YYYY-MM-DD`, both. Empty on a first run.
    pub first_seen: String,
    pub last_seen: String,
    /// Distinct days he has been around for, not days since installation.
    pub days: u32,
    pub streak: u32,
    pub best_streak: u32,
    /// Lifetime, and the only two numbers here that come from you: they count
    /// what you did to *him*.
    pub pets: u32,
    pub drags: u32,
    /// His wardrobe history — how many times he has worn each thing. A pet with a
    /// favourite hat is a pet with a preference, and this is where it comes from.
    pub props: HashMap<String, u32>,
    /// The same shape, for what he does at home. Deliberately the same mechanism:
    /// a favourite armchair and a favourite hat are the same idea, and inventing
    /// a second way to have a preference would have been the tell that it was not.
    #[serde(default)]
    pub furniture: HashMap<String, u32>,
    /// Things he was wearing when he was posted down the hatch, and left there.
    ///
    /// A set, not a tally: the burrow is showing you *which* hats ended up down
    /// there, and leaving the same one twice is not twice as much hat. Capped,
    /// because the walls are finite and an unbounded list in a file that lives
    /// forever is a leak with a face on it.
    #[serde(default)]
    pub left: Vec<String>,
}

/// How many things can be left in the burrow before the oldest one goes.
const KEEPS: usize = 6;

/// What the frontend gets at boot: the stored counters plus the few things only
/// the date arithmetic knows.
#[derive(Clone, Debug, Serialize)]
pub struct Opening {
    pub days: u32,
    pub streak: u32,
    pub best_streak: u32,
    /// Days since he last saw you. `0` on the same day or the next one, so only a
    /// real absence shows up.
    pub away: u32,
    pub first_day: bool,
    pub pets: u32,
    pub drags: u32,
    /// The thing he has worn most, once he has worn anything enough to have an
    /// opinion. `None` until then, rather than a favourite invented from one wear.
    pub favourite: Option<String>,
    /// The same idea indoors: what he sits on most, once he has sat anywhere
    /// enough for it to be a habit rather than a coincidence.
    pub chair: Option<String>,
    /// What has been left down there, oldest first.
    pub left: Vec<String>,
}

/// Worn this many times before it counts as a preference rather than an accident.
const FAVOURITE_AFTER: u32 = 4;

pub struct Vault(pub Mutex<Memory>);

fn file(app: &AppHandle) -> Option<PathBuf> {
    let dir = app.path().app_config_dir().ok()?;
    let _ = std::fs::create_dir_all(&dir);
    Some(dir.join("memory.json"))
}

pub fn load(app: &AppHandle) -> Memory {
    file(app)
        .and_then(|path| std::fs::read_to_string(path).ok())
        .and_then(|raw| serde_json::from_str(&raw).ok())
        .unwrap_or_default()
}

fn save(app: &AppHandle, memory: &Memory) {
    let Some(path) = file(app) else { return };
    if let Ok(json) = serde_json::to_string_pretty(memory) {
        let _ = std::fs::write(path, json);
    }
}

fn today() -> String {
    Local::now().date_naive().to_string()
}

fn parse(date: &str) -> Option<NaiveDate> {
    NaiveDate::parse_from_str(date, "%Y-%m-%d").ok()
}

/// Move the day on, if it has moved. Returns how many days he was away for.
///
/// Pure and separated from the file so it can be tested, because this is the part
/// with the bugs in it: a restart five times in one afternoon must not count as
/// five days, a clock that goes backwards must not produce a negative streak, and
/// a gap of one day is a night's sleep rather than an absence.
fn roll(memory: &mut Memory, today: &str) -> u32 {
    if memory.last_seen == today {
        return 0;
    }

    let gap = match (parse(&memory.last_seen), parse(today)) {
        (Some(last), Some(now)) => (now - last).num_days(),
        // No usable last date: either a first run or a file someone edited. Both
        // are "today is day one of the current run" rather than an error.
        _ => 0,
    };

    if memory.first_seen.is_empty() {
        memory.first_seen = today.to_string();
    }

    // A clock that went backwards leaves the counters alone. Bumping them would
    // be wrong in a way that never heals, and the alternative costs nothing.
    if gap < 0 {
        return 0;
    }

    memory.days += 1;
    memory.streak = if gap == 1 { memory.streak + 1 } else { 1 };
    memory.best_streak = memory.best_streak.max(memory.streak);
    memory.last_seen = today.to_string();

    // One day apart is last night, not an absence.
    if gap > 1 {
        gap as u32
    } else {
        0
    }
}

/// The thing used most, once it has been used enough to mean anything.
///
/// Takes the map rather than the whole `Memory` so the wardrobe and the house
/// share it. The tie-break on the key is what keeps it stable: two things worn
/// the same number of times would otherwise swap places on every read, and a
/// favourite that changes when nothing happened is not a favourite.
fn most_used(counts: &HashMap<String, u32>) -> Option<String> {
    counts
        .iter()
        .filter(|(_, used)| **used >= FAVOURITE_AFTER)
        .max_by_key(|(kind, used)| (**used, *kind))
        .map(|(kind, _)| kind.clone())
}

/// Called once at startup, and again from `remember` — so an app left running for
/// a week still notices the days going by the first time you touch him.
fn open(app: &AppHandle) -> Opening {
    let vault = app.state::<Vault>();
    let Ok(mut memory) = vault.0.lock() else {
        return Opening {
            days: 0,
            streak: 0,
            best_streak: 0,
            away: 0,
            first_day: true,
            pets: 0,
            drags: 0,
            favourite: None,
            chair: None,
            left: Vec::new(),
        };
    };

    let was = memory.days;
    let away = roll(&mut memory, &today());

    if memory.days != was {
        save(app, &memory);
    }

    Opening {
        days: memory.days,
        streak: memory.streak,
        best_streak: memory.best_streak,
        away,
        first_day: memory.days <= 1,
        pets: memory.pets,
        drags: memory.drags,
        favourite: most_used(&memory.props),
        chair: most_used(&memory.furniture),
        left: memory.left.clone(),
    }
}

#[tauri::command]
pub fn memory(app: AppHandle) -> Opening {
    open(&app)
}

/// One command for every kind of thing worth keeping, because there are three of
/// them and three commands would be three times the wiring for the same match.
#[tauri::command]
pub fn remember(app: AppHandle, what: String, key: Option<String>) {
    let _ = open(&app);

    let vault = app.state::<Vault>();
    let Ok(mut memory) = vault.0.lock() else { return };

    match what.as_str() {
        "pet" => memory.pets += 1,
        "drag" => memory.drags += 1,
        "prop" => {
            if let Some(kind) = key {
                *memory.props.entry(kind).or_insert(0) += 1;
            }
        }
        "furniture" => {
            if let Some(kind) = key {
                *memory.furniture.entry(kind).or_insert(0) += 1;
            }
        }
        "left" => {
            let Some(kind) = key else { return };
            // Already down there: nothing to record, and re-recording it would
            // shuffle it to the newest end and evict something that is still
            // hanging on the wall.
            if memory.left.contains(&kind) {
                return;
            }
            memory.left.push(kind);
            while memory.left.len() > KEEPS {
                memory.left.remove(0);
            }
        }
        // An unknown event is a frontend that has moved on without this file.
        // Dropping it silently is right: it is a counter, not a transaction.
        _ => return,
    }

    save(&app, &memory);
}

#[cfg(test)]
mod tests {
    use super::*;

    fn after(days: &[&str]) -> Memory {
        let mut memory = Memory::default();
        for day in days {
            roll(&mut memory, day);
        }
        memory
    }

    #[test]
    fn restarting_all_afternoon_is_still_one_day() {
        let mut memory = Memory::default();
        for _ in 0..5 {
            roll(&mut memory, "2026-08-16");
        }
        assert_eq!(memory.days, 1);
        assert_eq!(memory.streak, 1);
        assert_eq!(memory.first_seen, "2026-08-16");
    }

    #[test]
    fn consecutive_days_build_a_streak_and_a_gap_breaks_it() {
        let memory = after(&["2026-08-16", "2026-08-17", "2026-08-18"]);
        assert_eq!(memory.days, 3);
        assert_eq!(memory.streak, 3);

        let memory = after(&["2026-08-16", "2026-08-17", "2026-08-25"]);
        assert_eq!(memory.days, 3);
        assert_eq!(memory.streak, 1);
        assert_eq!(memory.best_streak, 2);
    }

    #[test]
    fn only_a_real_absence_counts_as_being_away() {
        let mut memory = after(&["2026-08-16"]);
        // The next morning is not an absence.
        assert_eq!(roll(&mut memory, "2026-08-17"), 0);
        assert_eq!(roll(&mut memory, "2026-08-24"), 7);
    }

    #[test]
    fn a_clock_that_went_backwards_changes_nothing() {
        let mut memory = after(&["2026-08-16", "2026-08-17"]);
        assert_eq!(roll(&mut memory, "2026-08-10"), 0);
        assert_eq!(memory.days, 2);
        assert_eq!(memory.streak, 2);
        assert_eq!(memory.last_seen, "2026-08-17");
    }

    #[test]
    fn a_favourite_needs_more_than_one_wear() {
        let mut memory = Memory::default();
        memory.props.insert("crown".into(), 1);
        assert_eq!(most_used(&memory.props), None);

        memory.props.insert("crown".into(), FAVOURITE_AFTER);
        memory.props.insert("scarf".into(), 2);
        assert_eq!(most_used(&memory.props), Some("crown".into()));
    }
}
