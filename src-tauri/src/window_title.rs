use std::ffi::c_void;

/// The title of the frontmost window, when he has been allowed to read it.
///
/// **Accessibility, not Screen Recording.** `CGWindowListCopyWindowInfo` returns
/// the same string and needs the Screen Recording permission — which since macOS
/// 15 makes the system post periodic "tico has been recording your screen"
/// reminders. For a pet that is poison, and it is a lie besides: nothing here
/// looks at a single pixel.
///
/// **What this exposes is not what the app name exposed.** Observed while
/// building it, on the author's own screen: an open `.env-prod`, a client project
/// name, and a search query. Titles carry secrets, so two rules hold everywhere
/// downstream — sensitive-looking titles are never read at all (below), and no
/// title is ever spoken out loud. It is context for a prompt and nothing else.
#[cfg(target_os = "macos")]
mod ax {
    use super::c_void;

    #[link(name = "ApplicationServices", kind = "framework")]
    extern "C" {
        fn AXIsProcessTrusted() -> bool;
        fn AXUIElementCreateApplication(pid: i32) -> *mut c_void;
        fn AXUIElementCopyAttributeValue(
            element: *mut c_void,
            attribute: *const c_void,
            value: *mut *const c_void,
        ) -> i32;
    }

    #[link(name = "CoreFoundation", kind = "framework")]
    extern "C" {
        fn CFRelease(cf: *const c_void);
        fn CFStringCreateWithBytes(
            allocator: *const c_void,
            bytes: *const u8,
            length: isize,
            encoding: u32,
            external: bool,
        ) -> *const c_void;
        fn CFStringGetCString(
            string: *const c_void,
            buffer: *mut u8,
            size: isize,
            encoding: u32,
        ) -> bool;
    }

    const UTF8: u32 = 0x0800_0100;

    struct CfString(*const c_void);

    impl CfString {
        fn new(value: &str) -> Self {
            Self(unsafe {
                CFStringCreateWithBytes(
                    std::ptr::null(),
                    value.as_ptr(),
                    value.len() as isize,
                    UTF8,
                    false,
                )
            })
        }

        fn read(pointer: *const c_void) -> Option<String> {
            let mut buffer = vec![0u8; 1024];
            let ok = unsafe {
                CFStringGetCString(pointer, buffer.as_mut_ptr(), buffer.len() as isize, UTF8)
            };
            if !ok {
                return None;
            }
            let end = buffer.iter().position(|byte| *byte == 0).unwrap_or(0);
            Some(String::from_utf8_lossy(&buffer[..end]).to_string())
        }
    }

    /// Every CF value here comes back +1 from a Copy/Create call, and this runs
    /// twice a second forever — so each one is released on every path out.
    impl Drop for CfString {
        fn drop(&mut self) {
            if !self.0.is_null() {
                unsafe { CFRelease(self.0) }
            }
        }
    }

    pub fn trusted() -> bool {
        unsafe { AXIsProcessTrusted() }
    }

    pub fn focused_title(pid: i32) -> Option<String> {
        if pid <= 0 || !trusted() {
            return None;
        }

        let focused_attr = CfString::new("AXFocusedWindow");
        let title_attr = CfString::new("AXTitle");

        unsafe {
            let app = AXUIElementCreateApplication(pid);
            if app.is_null() {
                return None;
            }

            let mut window: *const c_void = std::ptr::null();
            // -25212 is kAXErrorNoValue, which only means the app has no focused
            // window — Finder with everything closed, for instance. Not an error
            // worth reporting, and not a permission problem (that is -25211).
            let status = AXUIElementCopyAttributeValue(app, focused_attr.0, &mut window);
            if status != 0 || window.is_null() {
                CFRelease(app);
                return None;
            }

            let mut title: *const c_void = std::ptr::null();
            let status =
                AXUIElementCopyAttributeValue(window as *mut c_void, title_attr.0, &mut title);

            let out = if status == 0 && !title.is_null() {
                let value = CfString::read(title);
                CFRelease(title);
                value
            } else {
                None
            };

            CFRelease(window);
            CFRelease(app);
            out
        }
    }
}

#[cfg(not(target_os = "macos"))]
mod ax {
    /// Windows is `GetWindowTextW` and needs no permission at all; X11 is
    /// `_NET_WM_NAME`. Stubbed rather than guessed at, like the rest.
    pub fn trusted() -> bool {
        false
    }
    pub fn focused_title(_pid: i32) -> Option<String> {
        None
    }
}

/// Titles that are never read, at any permission level.
///
/// This is a blocklist, so it is porous by construction — it is a floor, not a
/// guarantee. It exists because the very first real title this feature returned
/// during development was an open `.env-prod`, and a pet does not need to know
/// about that one.
const SENSITIVE: [&str; 14] = [
    ".env",
    "secret",
    "password",
    "passwd",
    "token",
    "credential",
    "apikey",
    "api key",
    "private key",
    ".pem",
    "keychain",
    "1password",
    "bitwarden",
    "lastpass",
];

pub fn trusted() -> bool {
    ax::trusted()
}

pub fn read(pid: i32) -> Option<String> {
    let title = ax::focused_title(pid)?;
    let haystack = title.to_lowercase();

    if SENSITIVE.iter().any(|needle| haystack.contains(needle)) {
        return None;
    }

    let trimmed = title.trim();
    // A title long enough to be a document's whole first line is not a title.
    if trimmed.is_empty() || trimmed.len() > 200 {
        return None;
    }

    Some(trimmed.to_string())
}
