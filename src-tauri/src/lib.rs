mod active_app;
mod call;
mod cursor;
mod ledges;
mod music;
mod reminders;
#[cfg(target_os = "macos")]
mod macos;
mod memory;
mod state;
mod window_title;
mod strip;
mod typing;

use std::sync::Mutex;

use tauri::{
    menu::{Menu, MenuItem, PredefinedMenuItem, Submenu},
    tray::TrayIconBuilder,
    Manager, Position, Size, Wry,
};
use tauri_plugin_autostart::{ManagerExt, MacosLauncher};

use state::Store;

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

/// Opens the preferences window, or brings back the one that is already open.
///
/// Built here rather than declared in `tauri.conf.json` so that it does not exist
/// until it is asked for: it is a second WebView, and a second WebView is tens of
/// megabytes for as long as it is alive. Closing it destroys it and gives them
/// back, which is why nothing here hides it instead.
///
/// It is an ordinary window on purpose — decorated, focusable, activating. The
/// strip is none of those things, but every one of those tricks is set on the
/// strip's own `NSWindow` in `macos.rs`, so this one is unaffected by them.
fn preferences(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("prefs") {
        let _ = window.show();
        let _ = window.set_focus();
        return;
    }

    // The hash is the whole router. One bundle, one `index.html`, and `main.tsx`
    // draws the pet or the window depending on what it finds — which is smaller
    // than a second entry point and cannot drift out of step with the first.
    let built = tauri::WebviewWindowBuilder::new(
        app,
        "prefs",
        tauri::WebviewUrl::App("index.html#prefs".into()),
    )
    .title("tico")
    .inner_size(820.0, 700.0)
    .min_inner_size(660.0, 520.0)
    .build();

    match built {
        // An accessory app has no Dock tile to click, so a window that opens
        // behind whatever you were doing is a window you cannot find.
        Ok(window) => {
            let _ = window.set_focus();
        }
        Err(error) => eprintln!("[tico] could not open preferences: {error}"),
    }
}

/// Whether he starts with the machine. The plugin owns this, not `tico.json` —
/// a stored copy would be a second answer to a question the OS already answers.
#[tauri::command]
fn autostart(app: tauri::AppHandle) -> bool {
    app.autolaunch().is_enabled().unwrap_or(false)
}

#[tauri::command]
fn set_autostart(app: tauri::AppHandle, on: bool) -> bool {
    let launcher = app.autolaunch();
    let _ = if on { launcher.enable() } else { launcher.disable() };
    launcher.is_enabled().unwrap_or(false)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]#[cfg_attr(mobile, tauri::mobile_entry_point)]
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
            ledges::ledges,
            reminders::due_reminders,
            reminders::complete_reminder,
            memory::memory,
            memory::remember,
            state::set_settings,
            state::set_pinned_prop,
            autostart,
            set_autostart,
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
            // Everything that is not a decision you make mid-thought now lives in
            // the window. What is left in the tray is what you reach for *while*
            // something is happening: he is in the way, or he is talking during a
            // call, or you are done.
            let prefs_item =
                MenuItem::with_id(app, "preferences", "Preferences…", true, None::<&str>)?;

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

            // Only on if it was chosen *and* the grant is still there — revoking
            // it in System Settings has to switch the feature off too, or he goes
            // on being asked for titles that never arrive.
            active_app::set_titles(saved.read_titles && window_title::trusted());

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
                    &prefs_item,
                    &PredefinedMenuItem::separator(app)?,
                    &quit,
                ],
            )?;

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
                        state::publish(app);
                        return;
                    }

                    match id {
                        "preferences" => preferences(app),
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
            typing::watch(handle.clone());
            music::watch(handle.clone());

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
