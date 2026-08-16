mod strip;

use tauri::{
    menu::{Menu, MenuItem},
    tray::TrayIconBuilder,
    Manager, Position, Size,
};
use tauri_plugin_autostart::MacosLauncher;

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

    // The pet is the only thing in here that should ever take a click, and there
    // is no pet yet — so for now the whole strip lets everything through. M1
    // flips this to false only while the cursor is inside his box.
    let _ = window.set_ignore_cursor_events(true);

    let _ = window.show();
    let _ = window.set_position(Position::Physical(position));
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_autostart::init(MacosLauncher::LaunchAgent, None))
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .setup(|app| {
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
            let menu = Menu::with_items(app, &[&show, &hide, &quit])?;

            let icon = app.default_window_icon().cloned().expect("no default icon");

            TrayIconBuilder::new()
                .tooltip("tico")
                .icon(icon)
                .menu(&menu)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "show" => anchor_strip(app),
                    "hide" => {
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.hide();
                        }
                    }
                    "quit" => app.exit(0),
                    _ => {}
                })
                .build(app)?;

            anchor_strip(app.handle());

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
