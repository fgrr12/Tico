//! The top edges of your windows, as things he can catch hold of.
//!
//! **Bounds, not titles, and that distinction is the whole reason this is
//! allowed to exist.** `window_title.rs` deliberately goes through Accessibility
//! because `CGWindowListCopyWindowInfo` needs the Screen Recording permission to
//! hand over `kCGWindowName` — and since macOS 15 that posts periodic "tico has
//! been recording your screen" notices, which for a pet is poison. What is asked
//! for here is `kCGWindowBounds`: four numbers, no permission, and nothing that
//! could embarrass anybody. He learns that a rectangle is there, never what is
//! written in it.
//!
//! Called once when a fall starts, not polled. The whole feature needs the answer
//! at a single instant — see `fallTo` in `Companion.tsx`, which picks the ledge
//! up front and lets one CSS transition end on it rather than testing for a
//! collision every frame.

use serde::Serialize;

/// A ledge, already in the frontend's coordinates: `x` and `width` are strip
/// pixels from its left edge, and `lift` is how far the top of the window sits
/// above the strip floor — which is exactly what `moveTo(x, lift)` takes.
#[derive(Clone, Copy, Serialize)]
pub struct Ledge {
    pub x: f64,
    pub width: f64,
    pub lift: f64,
}

/// Narrower than this and it is a palette or a tooltip, not somewhere to hang.
#[cfg(target_os = "macos")]
const MIN_WIDTH: f64 = 140.0;
/// Lower than this and grabbing it is indistinguishable from landing.
#[cfg(target_os = "macos")]
const MIN_LIFT: f64 = 70.0;
/// Wider than this fraction of the screen and it is not a ledge.
///
/// Measured on a real working desktop rather than reasoned about: of thirteen
/// ordinary windows open at the time, eleven were maximised to exactly
/// 1512x852 at y=33. Their top edges are all the same line at the top of the
/// screen, so without this he catches that line on every single fall, instantly,
/// and "he grabbed something on the way down" becomes "he never falls". The two
/// that were not maximised are the two worth having.
///
/// The consequence is deliberate: on a desktop of maximised windows there is
/// nothing to catch and he simply falls. That is the honest answer — the ledges
/// are your actual windows, and some days there are none.
#[cfg(target_os = "macos")]
const MAX_SPAN: f64 = 0.9;

#[cfg(target_os = "macos")]
mod cg {
    use std::ffi::c_void;

    #[repr(C)]
    #[derive(Clone, Copy, Default)]
    pub struct CGPoint {
        pub x: f64,
        pub y: f64,
    }

    #[repr(C)]
    #[derive(Clone, Copy, Default)]
    pub struct CGSize {
        pub width: f64,
        pub height: f64,
    }

    #[repr(C)]
    #[derive(Clone, Copy, Default)]
    pub struct CGRect {
        pub origin: CGPoint,
        pub size: CGSize,
    }

    /// `kCGWindowListOptionOnScreenOnly | kCGWindowListExcludeDesktopElements`.
    /// The second half is what drops the wallpaper and the desktop icon layer,
    /// both of which are windows and neither of which is a ledge.
    pub const ON_SCREEN: u32 = 1 | (1 << 4);

    #[link(name = "CoreGraphics", kind = "framework")]
    extern "C" {
        pub fn CGWindowListCopyWindowInfo(option: u32, relative_to: u32) -> *const c_void;
        pub fn CGRectMakeWithDictionaryRepresentation(
            dict: *const c_void,
            rect: *mut CGRect,
        ) -> bool;
    }

    #[link(name = "CoreFoundation", kind = "framework")]
    extern "C" {
        pub fn CFRelease(cf: *const c_void);
        pub fn CFArrayGetCount(array: *const c_void) -> isize;
        pub fn CFArrayGetValueAtIndex(array: *const c_void, index: isize) -> *const c_void;
        pub fn CFDictionaryGetValue(dict: *const c_void, key: *const c_void) -> *const c_void;
        pub fn CFNumberGetValue(number: *const c_void, kind: i32, value: *mut c_void) -> bool;
        pub fn CFStringCreateWithBytes(
            allocator: *const c_void,
            bytes: *const u8,
            length: isize,
            encoding: u32,
            external: bool,
        ) -> *const c_void;
    }

    const UTF8: u32 = 0x0800_0100;
    /// `kCFNumberDoubleType`.
    const DOUBLE: i32 = 13;

    /// A CFString that releases itself. The keys are built rather than linked as
    /// extern statics: three lines here against linkage that has to be declared
    /// correctly for every symbol, for no gain.
    pub struct CfString(pub *const c_void);

    impl CfString {
        pub fn new(value: &str) -> Self {
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
    }

    impl Drop for CfString {
        fn drop(&mut self) {
            if !self.0.is_null() {
                unsafe { CFRelease(self.0) };
            }
        }
    }

    /// Every number in this dictionary comes back as a double, including the ones
    /// that are conceptually integers — asking for an int type on a float-backed
    /// CFNumber silently truncates, and the layer is what decides whether he can
    /// stand on a thing.
    pub fn number(dict: *const c_void, key: &CfString) -> Option<f64> {
        let value = unsafe { CFDictionaryGetValue(dict, key.0) };
        if value.is_null() {
            return None;
        }

        let mut out: f64 = 0.0;
        let ok = unsafe { CFNumberGetValue(value, DOUBLE, &mut out as *mut f64 as *mut c_void) };
        ok.then_some(out)
    }
}

/// The ledges above him, nearest the top of the screen first.
///
/// On anything that is not macOS this is empty, which is a working answer rather
/// than a missing one: with no ledges, a fall is simply a fall, and the pet
/// behaves the way he did before any of this existed.
#[tauri::command]
pub fn ledges(app: tauri::AppHandle) -> Vec<Ledge> {
    #[cfg(target_os = "macos")]
    {
        let found = collect(&app).unwrap_or_default();

        #[cfg(debug_assertions)]
        eprintln!(
            "[tico] {} ledges: {}",
            found.len(),
            found
                .iter()
                .take(5)
                .map(|l| format!("x={:.0}..{:.0} lift={:.0}", l.x, l.x + l.width, l.lift))
                .collect::<Vec<_>>()
                .join(", ")
        );

        found
    }

    #[cfg(not(target_os = "macos"))]
    {
        let _ = app;
        Vec::new()
    }
}

#[cfg(target_os = "macos")]
fn collect(app: &tauri::AppHandle) -> Option<Vec<Ledge>> {
    use tauri::Manager;

    let window = app.get_webview_window("main")?;
    let origin = window.outer_position().ok()?;
    let size = window.outer_size().ok()?;
    let scale = window.scale_factor().ok()?;

    // The strip's own geometry, in the logical points `CGWindowListCopyWindowInfo`
    // reports — its y is measured from the top of the main display, which is
    // above the strip by exactly the menu bar.
    let strip_x = origin.x as f64 / scale;
    let strip_top = origin.y as f64 / scale;
    let strip_height = size.height as f64 / scale;

    let list = unsafe { cg::CGWindowListCopyWindowInfo(cg::ON_SCREEN, 0) };
    if list.is_null() {
        return None;
    }

    let bounds_key = cg::CfString::new("kCGWindowBounds");
    let layer_key = cg::CfString::new("kCGWindowLayer");
    let alpha_key = cg::CfString::new("kCGWindowAlpha");
    let pid_key = cg::CfString::new("kCGWindowOwnerPID");

    let mine = std::process::id() as f64;
    let mut found = Vec::new();

    for index in 0..unsafe { cg::CFArrayGetCount(list) } {
        let entry = unsafe { cg::CFArrayGetValueAtIndex(list, index) };
        if entry.is_null() {
            continue;
        }

        // Layer 0 is an ordinary application window. The Dock is 20 and the menu
        // bar is 24, and he is at 25 — hanging off the Dock would put him behind
        // the one piece of furniture he was raised above on purpose.
        if cg::number(entry, &layer_key) != Some(0.0) {
            continue;
        }

        // His own window is in this list, and a pet that catches hold of himself
        // hangs in mid-air forever.
        if cg::number(entry, &pid_key) == Some(mine) {
            continue;
        }

        // Fully transparent windows are real windows you cannot see. Catching one
        // looks exactly like a bug.
        if cg::number(entry, &alpha_key).unwrap_or(1.0) <= 0.01 {
            continue;
        }

        let dict = unsafe { cg::CFDictionaryGetValue(entry, bounds_key.0) };
        if dict.is_null() {
            continue;
        }

        let mut rect = cg::CGRect::default();
        if !unsafe { cg::CGRectMakeWithDictionaryRepresentation(dict, &mut rect) } {
            continue;
        }

        let lift = strip_height - (rect.origin.y - strip_top);
        let x = rect.origin.x - strip_x;
        let span = rect.size.width / (size.width as f64 / scale);

        if rect.size.width < MIN_WIDTH
            || span > MAX_SPAN
            || lift < MIN_LIFT
            || lift > strip_height
        {
            continue;
        }

        found.push(Ledge {
            x,
            width: rect.size.width,
            lift,
        });
    }

    unsafe { cg::CFRelease(list) };

    // Highest first, so the frontend can take the first one that is under him and
    // stop looking. `CGWindowListCopyWindowInfo` returns front-to-back, which is
    // the stacking order and has nothing to do with height.
    found.sort_by(|a, b| b.lift.total_cmp(&a.lift));
    Some(found)
}
