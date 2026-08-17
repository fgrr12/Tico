mod active_app;
mod call;
mod cursor;
mod music;
mod reminders;
#[cfg(target_os = "macos")]
mod macos;
mod memory;
mod state;
mod window_title;
mod strip;

use std::sync::Mutex;

use tauri::{
    menu::{CheckMenuItem, Menu, MenuItem, PredefinedMenuItem, Submenu},
    tray::TrayIconBuilder,
    Emitter, Manager, Position, Size, Wry,
};
use tauri_plugin_autostart::{ManagerExt, MacosLauncher};

use state::{State, Store};

/// The tray's radio groups. Kept so the handler can tick the chosen one and untick
/// its siblings — a menu that lies about the current setting is worse than one
/// that does not show it at all.
struct Settings {
    chattiness: Vec<(&'static str, CheckMenuItem<Wry>)>,
    size: Vec<(&'static str, CheckMenuItem<Wry>)>,
    in_call: Vec<(&'static str, CheckMenuItem<Wry>)>,
    language: Vec<(&'static str, CheckMenuItem<Wry>)>,
    autostart: CheckMenuItem<Wry>,
    read_titles: CheckMenuItem<Wry>,
}

const CHATTINESS: [&str; 3] = ["quiet", "normal", "chatty"];
const SIZES: [&str; 3] = ["small", "normal", "large"];
const IN_CALL: [&str; 3] = ["peek", "hide", "ignore"];
const LANGUAGES: [&str; 3] = ["auto", "en", "es"];
/// Minutes of silence the tray offers. `0` cancels it.
const QUIET_FOR: [(&str, i64); 4] = [
    ("30 minutes", 30),
    ("1 hour", 60),
    ("Until I say otherwise", -1),
    ("Off", 0),
];

/// Puts the window where the pet lives and makes it invisible to the mouse.
///
/// The order matters, and it is the one Lyra arrived at the hard way: size and
/// position while still hidden, show, then set the position *again* — on Windows
/// the first `ShowWindow` can move the window back to where it was before.
fn anchor_strip(app: &tauri::AppHandle) {
    let Some(window) = app.get_webview_window("main") else {
        return;
    };

    let monitor = app
        .primary_monitor()
        .ok()
        .flatten()
        .or_else(|| app.available_monitors().ok()?.into_iter().next());

    let Some(monitor) = monitor else {
        // Nothing to anchor to. Showing the window anyway would drop an
        // undecorated transparent rectangle somewhere arbitrary.
        eprintln!("[tico] no monitor found; leaving the strip hidden");
        return;
    };

    let (position, size) = strip::bounds(&monitor);

    let _ = window.set_size(Size::Physical(size));
    let _ = window.set_position(Position::Physical(position));
    // The cursor watch owns this from here: it lets clicks through to the pet and
    // to nothing else.
    let _ = window.set_ignore_cursor_events(true);

    let _ = window.show();
    let _ = window.set_position(Position::Physical(position));

    // Both after show(), because they act on a real NSWindow and showing is what
    // guarantees there is one. The panel conversion goes first: changing a style
    // mask is the kind of thing AppKit resets a window level over.
    #[cfg(target_os = "macos")]
    {
        macos::make_nonactivating(&window);
        macos::place_above_dock(&window);
    }
}

// Two flags in `tauri.conf.json` decide how a click on him behaves, and JSON has
// nowhere to say why, so it is said here.
//
// `acceptFirstMouse` — without it, clicking an inactive window on macOS spends
// that click on making the window active and delivers nothing. For a normal app
// that is correct: you meant to focus the document, not to press the button you
// happened to land on. For a pet it means every interaction costs two clicks,
// the first of which does nothing visible. It is also, almost certainly, why the
// button on a reminder bubble felt broken long after its hit rect was fixed.
//
// `focusable` — false, so the window never asks to hold focus. Nothing here
// reads a keystroke: no text field, no shortcut, no ask box since the model was
// removed, so the ability is pure cost. On macOS this alone was *not* enough and
// the reason is worth keeping: it makes `canBecomeKeyWindow` return NO, which
// stops the window taking key status, while clicking any window of a background
// app still activates the application — and that is what pulls the insertion
// point out of the editor you were typing in. Two different things. The one that
// actually stops it is `macos::make_nonactivating`, and this flag stays for the
// other platforms and for the case where that conversion refuses to run.

/// Ticks the chosen item and unticks its siblings.
fn mark(group: &[(&'static str, CheckMenuItem<Wry>)], chosen: &str) {
    for (value, item) in group {
        let _ = item.set_checked(*value == chosen);
    }
}

fn publish(app: &tauri::AppHandle) {
    let current: State = state::boot(app.clone());
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.emit("settings", current);
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        // Must be registered first, per the plugin's own contract. Without it,
        // launching tico twice gives you two pets and two tray icons — and since
        // he is an accessory app with no Dock tile, there is nothing on screen to
        // tell you the first one was already running.
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            anchor_strip(app);
        }))
        .plugin(tauri_plugin_autostart::init(MacosLauncher::LaunchAgent, None))
        .invoke_handler(tauri::generate_handler![
            state::boot,
            state::set_pet_x,
            cursor::set_pet_rect,
            cursor::set_interactive,
            reminders::due_reminders,
            reminders::complete_reminder,
            memory::memory,
            memory::remember,
        ])
        .setup(|app| {
            let handle = app.handle().clone();
            let saved = state::load(&handle);
            app.manage(Store(Mutex::new(saved.clone())));
            app.manage(memory::Vault(Mutex::new(memory::load(&handle))));

            // Tray-only: no Dock icon, no Cmd-Tab entry.
            //
            // LSUIElement in Info.plist is not enough on its own — tao sets the
            // activation policy to Regular when it builds the event loop, which
            // overrides the plist. This runs after that and wins. The plist is
            // still worth keeping: it governs the app between process start and
            // this call, so the icon never flashes in the Dock.
            #[cfg(target_os = "macos")]
            app.set_activation_policy(tauri::ActivationPolicy::Accessory);

            let show = MenuItem::with_id(app, "show", "Show", true, None::<&str>)?;
            let hide = MenuItem::with_id(app, "hide", "Hide", true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;

            let mut chattiness = Vec::new();
            for value in CHATTINESS {
                chattiness.push((
                    value,
                    CheckMenuItem::with_id(
                        app,
                        format!("chattiness:{value}"),
                        value,
                        true,
                        saved.chattiness == value,
                        None::<&str>,
                    )?,
                ));
            }

            let mut size = Vec::new();
            for value in SIZES {
                size.push((
                    value,
                    CheckMenuItem::with_id(
                        app,
                        format!("size:{value}"),
                        value,
                        true,
                        saved.size == value,
                        None::<&str>,
                    )?,
                ));
            }

            let mut in_call = Vec::new();
            for value in IN_CALL {
                in_call.push((
                    value,
                    CheckMenuItem::with_id(
                        app,
                        format!("incall:{value}"),
                        value,
                        true,
                        saved.in_call == value,
                        None::<&str>,
                    )?,
                ));
            }

            let mut language = Vec::new();
            for value in LANGUAGES {
                language.push((
                    value,
                    CheckMenuItem::with_id(
                        app,
                        format!("language:{value}"),
                        match value {
                            "en" => "English",
                            "es" => "Español",
                            _ => "Follow the system",
                        },
                        true,
                        saved.language == value,
                        None::<&str>,
                    )?,
                ));
            }

            let mut quiet = Vec::new();
            for (label, minutes) in QUIET_FOR {
                quiet.push(MenuItem::with_id(
                    app,
                    format!("quiet:{minutes}"),
                    label,
                    true,
                    None::<&str>,
                )?);
            }

            let autostart = CheckMenuItem::with_id(
                app,
                "autostart",
                "Start at login",
                true,
                app.autolaunch().is_enabled().unwrap_or(false),
                None::<&str>,
            )?;

            // Only on if it was chosen *and* the grant is still there — revoking
            // it in System Settings has to uncheck the box, or the menu lies.
            let titles_on = saved.read_titles && window_title::trusted();
            active_app::set_titles(titles_on);

            let read_titles = CheckMenuItem::with_id(
                app,
                "titles",
                "Read window titles",
                true,
                titles_on,
                None::<&str>,
            )?;

            let chattiness_menu = Submenu::with_items(
                app,
                "Chattiness",
                true,
                &chattiness
                    .iter()
                    .map(|(_, item)| item as &dyn tauri::menu::IsMenuItem<Wry>)
                    .collect::<Vec<_>>(),
            )?;

            let size_menu = Submenu::with_items(
                app,
                "Size",
                true,
                &size
                    .iter()
                    .map(|(_, item)| item as &dyn tauri::menu::IsMenuItem<Wry>)
                    .collect::<Vec<_>>(),
            )?;

            let in_call_menu = Submenu::with_items(
                app,
                "In a call",
                true,
                &in_call
                    .iter()
                    .map(|(_, item)| item as &dyn tauri::menu::IsMenuItem<Wry>)
                    .collect::<Vec<_>>(),
            )?;

            let language_menu = Submenu::with_items(
                app,
                "Language",
                true,
                &language
                    .iter()
                    .map(|(_, item)| item as &dyn tauri::menu::IsMenuItem<Wry>)
                    .collect::<Vec<_>>(),
            )?;

            let quiet_menu = Submenu::with_items(
                app,
                "Quiet",
                true,
                &quiet
                    .iter()
                    .map(|item| item as &dyn tauri::menu::IsMenuItem<Wry>)
                    .collect::<Vec<_>>(),
            )?;

            let menu = Menu::with_items(
                app,
                &[
                    &show,
                    &hide,
                    &PredefinedMenuItem::separator(app)?,
                    &quiet_menu,
                    &in_call_menu,
                    &chattiness_menu,
                    &size_menu,
                    &language_menu,
                    &read_titles,
                    &autostart,
                    &PredefinedMenuItem::separator(app)?,
                    &quit,
                ],
            )?;

            app.manage(Settings {
                chattiness,
                size,
                in_call,
                language,
                autostart,
                read_titles,
            });

            // A separate monochrome icon for the menu bar, not the app icon.
            // macOS template images are re-coloured from their alpha channel, so
            // this one inverts correctly on a light menu bar instead of sitting
            // there as a dark smudge. Elsewhere the flag is ignored and the same
            // silhouette is simply drawn as-is.
            let tray_icon = tauri::image::Image::from_bytes(include_bytes!("../icons/tray.png"))?;

            TrayIconBuilder::new()
                .tooltip("tico")
                .icon(tray_icon)
                .icon_as_template(true)
                .menu(&menu)
                .on_menu_event(|app, event| {
                    let id = event.id.as_ref();
                    let settings = app.state::<Settings>();

                    if let Some(value) = id.strip_prefix("chattiness:") {
                        let value = value.to_string();
                        state::update(app, |current| current.chattiness = value.clone());
                        mark(&settings.chattiness, &value);
                        publish(app);
                        return;
                    }

                    if let Some(value) = id.strip_prefix("language:") {
                        let value = value.to_string();
                        state::update(app, |current| current.language = value.clone());
                        mark(&settings.language, &value);
                        publish(app);
                        return;
                    }

                    if let Some(value) = id.strip_prefix("incall:") {
                        let value = value.to_string();
                        state::update(app, |current| current.in_call = value.clone());
                        mark(&settings.in_call, &value);
                        publish(app);
                        return;
                    }

                    if let Some(minutes) = id.strip_prefix("quiet:") {
                        let minutes: i64 = minutes.parse().unwrap_or(0);
                        // -1 is indefinite, which is stored as a date far enough
                        // out that nobody outlives it.
                        let until = match minutes {
                            0 => 0,
                            -1 => state::now() + 60 * 60 * 24 * 365 * 100,
                            _ => state::now() + minutes * 60,
                        };
                        state::update(app, |current| current.quiet_until = until);
                        publish(app);
                        return;
                    }

                    if let Some(value) = id.strip_prefix("size:") {
                        let value = value.to_string();
                        state::update(app, |current| current.size = value.clone());
                        mark(&settings.size, &value);
                        publish(app);
                        return;
                    }

                    match id {
                        "titles" => {
                            let on = !settings.read_titles.is_checked().unwrap_or(false);

                            // Turning it on without the grant would silently do
                            // nothing, so send them where it is granted instead of
                            // firing a prompt that is easy to dismiss and hard to
                            // find again.
                            if on && !window_title::trusted() {
                                let _ = settings.read_titles.set_checked(false);
                                let _ = std::process::Command::new("open")
                                    .arg("x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility")
                                    .status();
                                return;
                            }

                            state::update(app, |current| current.read_titles = on);
                            active_app::set_titles(on);
                            let _ = settings.read_titles.set_checked(on);
                            publish(app);
                        }
                        "autostart" => {
                            let launcher = app.autolaunch();
                            let on = launcher.is_enabled().unwrap_or(false);
                            let _ = if on { launcher.disable() } else { launcher.enable() };
                            let _ = settings.autostart.set_checked(!on);
                        }
                        "show" => anchor_strip(app),
                        "hide" => {
                            if let Some(window) = app.get_webview_window("main") {
                                let _ = window.hide();
                            }
                        }
                        "quit" => app.exit(0),
                        _ => {}
                    }
                })
                .build(app)?;

            anchor_strip(&handle);
            cursor::watch(handle.clone());
            active_app::watch(handle.clone());
            call::watch(handle.clone());
            music::watch(handle.clone());

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
