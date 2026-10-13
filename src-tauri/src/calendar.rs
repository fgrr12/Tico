//! Experiment: the next thing on your calendar, as a shape and never a title.
//!
//! What crosses to the frontend is three numbers — when it starts, when it ends,
//! how many people are on it — so he can dread a meeting before it starts and
//! sag with relief after. The title, notes, location and attendee names are
//! never read past this file: a meeting called "despido de X" is exactly the
//! kind of thing a speech bubble must never be able to say.

use std::time::Duration;

use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager};

#[derive(Clone, PartialEq, Serialize)]
pub struct Agenda {
    /// Minutes until it starts; negative once it has.
    starts_in: i64,
    /// Minutes until it ends.
    ends_in: i64,
    /// Everyone invited, organiser included. Under two is an appointment.
    people: usize,
}

/// How far ahead is worth knowing about. Further than this is not dread, it is planning.
const LOOK_AHEAD_MIN: f64 = 30.0;

#[cfg(target_os = "macos")]
mod kit {
    use super::{Agenda, LOOK_AHEAD_MIN};
    use block2::RcBlock;
    use objc2::rc::Retained;
    use objc2::runtime::Bool;
    use objc2_event_kit::{EKAuthorizationStatus, EKEntityType, EKEventStore};
    use objc2_foundation::{NSDate, NSError};

    fn status() -> EKAuthorizationStatus {
        unsafe { EKEventStore::authorizationStatusForEntityType(EKEntityType::Event) }
    }

    /// Asks once, the first time ever; after that macOS remembers the answer.
    pub fn open() -> Retained<EKEventStore> {
        let store = unsafe { EKEventStore::new() };
        if status() == EKAuthorizationStatus::NotDetermined {
            let done = RcBlock::new(|granted: Bool, _error: *mut NSError| {
                eprintln!("[tico] calendar access: {}", granted.as_bool());
            });
            unsafe { store.requestFullAccessToEventsWithCompletion(&*done as *const _ as *mut _) };
        }
        store
    }

    /// The meeting in progress, or else the next one inside the window.
    pub fn next(store: &EKEventStore) -> Option<Agenda> {
        if status() != EKAuthorizationStatus::FullAccess {
            return None;
        }
        let from = NSDate::dateWithTimeIntervalSinceNow(0.0);
        let to = NSDate::dateWithTimeIntervalSinceNow(LOOK_AHEAD_MIN * 60.0);

        let events = unsafe {
            let predicate = store.predicateForEventsWithStartDate_endDate_calendars(&from, &to, None);
            store.eventsMatchingPredicate(&predicate)
        };

        events
            .iter()
            // An all-day event is a date, not a moment to dread.
            .filter(|event| unsafe { !event.isAllDay() })
            .map(|event| unsafe {
                (
                    event.startDate().timeIntervalSinceNow() / 60.0,
                    event.endDate().timeIntervalSinceNow() / 60.0,
                    event.attendees().map_or(0, |people| people.count()),
                )
            })
            .filter(|(_, ends, _)| *ends > 0.0)
            // Earliest start first: one already running beats the next one.
            .min_by(|a, b| a.0.total_cmp(&b.0))
            .map(|(starts, ends, people)| Agenda {
                starts_in: starts.round() as i64,
                ends_in: ends.round() as i64,
                people,
            })
    }
}

pub fn watch(app: AppHandle) {
    #[cfg(target_os = "macos")]
    std::thread::spawn(move || {
        let store = kit::open();
        let mut last: Option<Option<Agenda>> = None;
        loop {
            let now = kit::next(&store);
            if last.as_ref() != Some(&now) {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.emit("agenda", now.clone());
                }
                last = Some(now);
            }
            std::thread::sleep(Duration::from_secs(60));
        }
    });

    // Windows and Linux have no calendar here: he simply never dreads anything.
    #[cfg(not(target_os = "macos"))]
    let _ = app;
}
