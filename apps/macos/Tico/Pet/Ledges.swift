import AppKit
import CoreGraphics

/// The top edges of your windows, for him to catch on the way down —
/// `ledges.rs`. Window bounds are not window contents: no permission. The same
/// filter: ordinary windows of other apps, visible, at least 140pt wide, not
/// nearly the whole screen (that is a maximised window, and its top is the menu
/// bar), and high enough to be worth falling to.
@MainActor
enum Ledges {
	static func around(panel: PetPanel) -> [Ledge] {
		guard let list = CGWindowListCopyWindowInfo([.optionOnScreenOnly, .excludeDesktopElements], kCGNullWindowID) as? [[String: Any]],
			let main = NSScreen.screens.first
		else { return [] }
		let me = Int(ProcessInfo.processInfo.processIdentifier)
		let floor = panel.floorY
		let reach = panel.reach
		var found: [Ledge] = []
		for w in list {
			guard (w[kCGWindowLayer as String] as? Int) == 0,
				(w[kCGWindowOwnerPID as String] as? Int) != me,
				(w[kCGWindowAlpha as String] as? Double ?? 1) > 0.01,
				let dict = w[kCGWindowBounds as String] as! CFDictionary?,
				let rect = CGRect(dictionaryRepresentation: dict)
			else { continue }
			// Window bounds are top-left based on the main display; the strip is y-up.
			let top = main.frame.height - rect.minY
			let lift = top - floor
			let span = rect.width / panel.frame.width
			guard rect.width >= 140, span <= 0.9, lift >= 70, lift <= reach else { continue }
			found.append(Ledge(x: rect.minX - panel.frame.minX, width: rect.width, lift: lift))
		}
		return found.sorted { $0.lift > $1.lift }
	}
}
