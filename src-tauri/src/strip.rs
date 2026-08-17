use tauri::{Monitor, PhysicalPosition, PhysicalSize};

/// Where the pet lives: the full width of a monitor, from just under the menu
/// bar down to the very bottom.
///
/// **It used to be a 320px strip, and the reason it is not any more is measured.**
/// AD-1 chose the strip so the always-on-top compositing layer stayed small, and
/// said the strip grows into the full screen when he learns to climb. The worry
/// was that the growth costs proportionally: three times the area, three times
/// the battery. It does not. Measured over eight samples, 1512x320 against
/// 1512x982, on the same debug build: 14.5% of a core against 11.1% — the same
/// number twice, inside a noise floor of ±3. The compositor's price is for
/// *ticking at all* plus drawing the pet, and the pet is the same size either
/// way; the extra area is transparent pixels, and blending nothing costs nothing.
///
/// So there is no on-demand resize and no second geometry to keep in step. He
/// simply has the height, all the time.
///
/// **The top is the one edge that has to be respected.** He sits at window level
/// 25 and the menu bar is at 24, so a window of the full screen height covers it
/// — and the moment his hit rect lands up there, the strip starts swallowing
/// clicks meant for the menu bar. `work_area` is the cross-platform name for
/// "what is left after the system furniture", and its top inset is exactly the
/// menu bar. Its *bottom* inset is the Dock, which is deliberately not honoured:
/// he walks over the Dock on purpose, which is what level 25 is for.
///
/// Everything here is physical pixels, because that is what Tauri's monitor
/// geometry is given in and what `set_position` takes — mixing the two is the
/// classic overlay bug where the window lands in the right place on the built-in
/// display and halfway off the external one.
pub fn bounds(monitor: &Monitor) -> (PhysicalPosition<i32>, PhysicalSize<u32>) {
    let position = monitor.position();
    let size = monitor.size();
    let work = monitor.work_area();

    // Both are in the same global coordinate space, so the difference is the
    // inset rather than an absolute — which is what makes this correct on a
    // second monitor, where neither value starts at zero.
    let top_inset = (work.position.y - position.y).max(0);
    let height = (size.height as i32 - top_inset).max(1) as u32;

    (
        PhysicalPosition::new(position.x, position.y + top_inset),
        PhysicalSize::new(size.width, height),
    )
}
