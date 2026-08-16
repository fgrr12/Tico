use std::sync::atomic::{AtomicBool, Ordering};
use std::time::Duration;

use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager};

#[derive(Clone, Serialize)]
struct InCall {
    active: bool,
}

static IN_CALL: AtomicBool = AtomicBool::new(false);

/// Is the microphone live?
///
/// Used as "you are in a call", which is a better question than the one it looks
/// like. Detecting *screen sharing* on macOS is genuinely hard and every approach
/// is a guess about somebody's window titles; detecting a hot microphone is a
/// documented CoreAudio property, needs no permission, and works the same for
/// Zoom, Meet, Teams, Discord and FaceTime. It also covers the case that actually
/// matters more: he should not be talking during a call whether or not your
/// screen is being shared.
///
/// Known limit: it asks the *default* input device only. A call routed through a
/// second interface reads as quiet. Worth widening if that ever bites.
#[cfg(target_os = "macos")]
mod core_audio {
    // Four-character codes, spelled out so they can be checked against the
    // headers rather than trusted: 'dIn ', 'gone', 'glob'.
    const SYSTEM_OBJECT: u32 = 1;
    const DEFAULT_INPUT_DEVICE: u32 = 0x6449_6E20;
    const IS_RUNNING_SOMEWHERE: u32 = 0x676F_6E65;
    const SCOPE_GLOBAL: u32 = 0x676C_6F62;
    const ELEMENT_MAIN: u32 = 0;

    #[repr(C)]
    struct PropertyAddress {
        selector: u32,
        scope: u32,
        element: u32,
    }

    #[link(name = "CoreAudio", kind = "framework")]
    extern "C" {
        fn AudioObjectGetPropertyData(
            object: u32,
            address: *const PropertyAddress,
            qualifier_size: u32,
            qualifier: *const std::ffi::c_void,
            data_size: *mut u32,
            data: *mut std::ffi::c_void,
        ) -> i32;
    }

    fn read_u32(object: u32, selector: u32) -> Option<u32> {
        let address = PropertyAddress {
            selector,
            scope: SCOPE_GLOBAL,
            element: ELEMENT_MAIN,
        };

        let mut value: u32 = 0;
        let mut size = std::mem::size_of::<u32>() as u32;

        // Safe: every pointer is to a live local, and the sizes match the types
        // CoreAudio is being asked for.
        let status = unsafe {
            AudioObjectGetPropertyData(
                object,
                &address,
                0,
                std::ptr::null(),
                &mut size,
                &mut value as *mut u32 as *mut std::ffi::c_void,
            )
        };

        (status == 0).then_some(value)
    }

    pub fn microphone_is_live() -> bool {
        let Some(device) = read_u32(SYSTEM_OBJECT, DEFAULT_INPUT_DEVICE) else {
            return false;
        };

        // 0 means no device at all, which is not the same as a quiet one.
        if device == 0 {
            return false;
        }

        read_u32(device, IS_RUNNING_SOMEWHERE).is_some_and(|running| running != 0)
    }
}

#[cfg(not(target_os = "macos"))]
mod core_audio {
    /// Windows would be `IAudioSessionManager2` and Linux PulseAudio's source
    /// state. Stubbed rather than guessed at, like the active-app watcher.
    pub fn microphone_is_live() -> bool {
        false
    }
}

/// Slower than the cursor watch on purpose: a call starting half a second late is
/// nothing, and this is a syscall rather than a memory read.
pub fn watch(app: AppHandle) {
    std::thread::spawn(move || loop {
        std::thread::sleep(Duration::from_secs(2));

        let live = core_audio::microphone_is_live();
        if live == IN_CALL.load(Ordering::Relaxed) {
            continue;
        }

        IN_CALL.store(live, Ordering::Relaxed);

        #[cfg(debug_assertions)]
        eprintln!("[tico] in call: {live}");

        if let Some(window) = app.get_webview_window("main") {
            let _ = window.emit("in-call", InCall { active: live });
        }
    });
}
