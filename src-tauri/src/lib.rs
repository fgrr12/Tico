mod active_app;
mod cursor;
#[cfg(target_os = "macos")]
mod macos;
mod state;
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
    autostart: CheckMenuItem<Wry>,
}

const CHATTINESS: [&str; 3] = ["quiet", "normal", "chatty"];
const SIZES: [&str; 3] = ["small", "normal", "large"];

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

    // After show(), because the level is set on a real NSWindow and showing is
    // what guarantees there is one.
    #[cfg(target_os = "macos")]
    macos::place_above_dock(&window);
}

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
        .plugin(tauri_plugin_autostart::init(MacosLauncher::LaunchAgent, None))
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .invoke_handler(tauri::generate_handler![
            state::boot,
            state::set_pet_x,
            cursor::set_pet_rect,
            cursor::set_interactive,
        ])
        .setup(|app| {
            let handle = app.handle().clone();
            let saved = state::load(&handle);
            app.manage(Store(Mutex::new(saved.clone())));

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

            let autostart = CheckMenuItem::with_id(
                app,
                "autostart",
                "Start at login",
                true,
                app.autolaunch().is_enabled().unwrap_or(false),
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

            let menu = Menu::with_items(
                app,
                &[
                    &show,
                    &hide,
                    &PredefinedMenuItem::separator(app)?,
                    &chattiness_menu,
                    &size_menu,
                    &autostart,
                    &PredefinedMenuItem::separator(app)?,
                    &quit,
                ],
            )?;

            app.manage(Settings {
                chattiness,
                size,
                autostart,
            });

            let icon = app.default_window_icon().cloned().expect("no default icon");

            TrayIconBuilder::new()
                .tooltip("tico")
                .icon(icon)
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

                    if let Some(value) = id.strip_prefix("size:") {
                        let value = value.to_string();
                        state::update(app, |current| current.size = value.clone());
                        mark(&settings.size, &value);
                        publish(app);
                        return;
                    }

                    match id {
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
            active_app::watch(handle);

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
