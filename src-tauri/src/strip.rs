use tauri::{Monitor, PhysicalPosition, PhysicalSize};

/// How tall the strip is, in **logical** pixels. Tall enough for the pet plus a
/// speech bubble above him, short enough that the always-on-top layer the
/// compositor keeps alive all day stays cheap. See AD-1 in PLAN.md.
pub const STRIP_HEIGHT: f64 = 320.0;

/// Where the pet lives: the full width of a monitor, along its bottom edge.
///
/// Everything here is physical pixels, because that is what Tauri's monitor
/// geometry is given in and what `set_position` takes — mixing the two is the
/// classic overlay bug where the window lands in the right place on the built-in
/// display and halfway off the external one.
pub fn bounds(monitor: &Monitor) -> (PhysicalPosition<i32>, PhysicalSize<u32>) {
    let position = monitor.position();
    let size = monitor.size();

    let height = ((STRIP_HEIGHT * monitor.scale_factor()).round() as u32).min(size.height);

    (
        PhysicalPosition::new(position.x, position.y + size.height as i32 - height as i32),
        PhysicalSize::new(size.width, height),
    )
}
