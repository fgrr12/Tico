use std::path::PathBuf;

use chrono::{Datelike, Local, Months, NaiveDate};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};

/// A drop box, not an integration.
///
/// The finance app keeps its data in Supabase, so the obvious version of this —
/// tico reading it — means credentials, network, and coupling two apps that have
/// no reason to know about each other. Instead anything at all can append to a
/// JSON file next to his own settings, and he reads it. My-Finances can start
/// writing to it whenever it likes; until then the seeded IVA entry already
/// carries the case that was asked for.
///
/// Nothing here talks to a network and nothing here needs a permission.
#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct Reminder {
    pub id: String,
    pub text: String,
    /// ISO `YYYY-MM-DD`. Compared as a string where possible, which is exact for
    /// this format and needs no parsing.
    pub due: String,
    /// Not mentioned before this date. Defaults to a week before `due`.
    #[serde(default)]
    pub remind_from: String,
    /// `monthly`, or absent for a one-off.
    #[serde(default)]
    pub repeat: String,
    #[serde(default)]
    pub done: bool,
}

fn file(app: &AppHandle) -> Option<PathBuf> {
    let dir = app.path().app_config_dir().ok()?;
    let _ = std::fs::create_dir_all(&dir);
    Some(dir.join("reminders.json"))
}

fn parse(date: &str) -> Option<NaiveDate> {
    NaiveDate::parse_from_str(date, "%Y-%m-%d").ok()
}

fn shift(date: &str, months: u32) -> String {
    parse(date)
        .and_then(|day| day.checked_add_months(Months::new(months)))
        .map(|day| day.format("%Y-%m-%d").to_string())
        .unwrap_or_else(|| date.to_string())
}

fn default_remind_from(due: &str) -> String {
    parse(due)
        .and_then(|day| day.checked_sub_days(chrono::Days::new(7)))
        .map(|day| day.format("%Y-%m-%d").to_string())
        .unwrap_or_else(|| due.to_string())
}

/// Costa Rican IVA is filed monthly and due by the 15th of the following month.
/// Seeded on first run so the feature is useful before anything else writes to
/// the file — and written to disk, so editing or deleting it sticks.
fn seed() -> Vec<Reminder> {
    let today = Local::now().date_naive();
    let due = NaiveDate::from_ymd_opt(today.year(), today.month(), 15)
        .unwrap_or(today)
        .format("%Y-%m-%d")
        .to_string();

    vec![Reminder {
        id: "iva".into(),
        text: "El IVA del mes pasado vence el 15.".into(),
        remind_from: format!("{}-01", &due[..7]),
        due,
        repeat: "monthly".into(),
        done: false,
    }]
}

pub fn load(app: &AppHandle) -> Vec<Reminder> {
    let Some(path) = file(app) else { return Vec::new() };

    let existing = std::fs::read_to_string(&path)
        .ok()
        .and_then(|raw| serde_json::from_str::<Vec<Reminder>>(&raw).ok());

    match existing {
        Some(list) => list,
        None => {
            let seeded = seed();
            save(app, &seeded);
            seeded
        }
    }
}

fn save(app: &AppHandle, list: &[Reminder]) {
    let Some(path) = file(app) else { return };
    if let Ok(json) = serde_json::to_string_pretty(list) {
        let _ = std::fs::write(path, json);
    }
}

/// The reminders that are live today: not done, past their start date, and not
/// so far past due that mentioning them is nagging rather than reminding.
#[tauri::command]
pub fn due_reminders(app: AppHandle) -> Vec<Reminder> {
    let today = Local::now().date_naive().format("%Y-%m-%d").to_string();

    load(&app)
        .into_iter()
        .filter(|item| !item.done)
        .filter(|item| {
            let from = if item.remind_from.is_empty() {
                default_remind_from(&item.due)
            } else {
                item.remind_from.clone()
            };
            // ISO dates sort lexicographically, so this is a real date comparison.
            today >= from && today <= shift(&item.due, 1)
        })
        .collect()
}

/// Marking a recurring reminder done rolls it to the next month rather than
/// retiring it — paying August's IVA does not mean September's is handled.
#[tauri::command]
pub fn complete_reminder(app: AppHandle, id: String) {
    let mut list = load(&app);

    for item in list.iter_mut().filter(|item| item.id == id) {
        if item.repeat == "monthly" {
            item.due = shift(&item.due, 1);
            item.remind_from = if item.remind_from.is_empty() {
                default_remind_from(&item.due)
            } else {
                shift(&item.remind_from, 1)
            };
        } else {
            item.done = true;
        }
    }

    save(&app, &list);
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_month_rolls_over_a_year_boundary() {
        assert_eq!(shift("2026-12-15", 1), "2027-01-15");
        assert_eq!(shift("2026-01-31", 1), "2026-02-28");
    }

    #[test]
    fn the_default_window_opens_a_week_early() {
        assert_eq!(default_remind_from("2026-08-15"), "2026-08-08");
        assert_eq!(default_remind_from("2026-03-05"), "2026-02-26");
    }
}
