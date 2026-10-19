import AppKit
import CoreGraphics

/// What the shell tells the core: how long the cursor has been still, the hour,
/// and the name of the app in front — none of which needs a permission (a name,
/// never a window title: titles need Screen Recording) — plus what is playing,
/// which `MusicSense` asks the players for.
@MainActor
enum Sensing {
	static func now(music: Track?, panel: PetPanel, screen: NSScreen) -> Senses {
		let idle = CGEventSource.secondsSinceLastEventType(.combinedSessionState, eventType: .mouseMoved)
		// The cursor on his strip, when it is on his screen at all.
		let cursor = NSEvent.mouseLocation
		let onStrip = screen.frame.contains(cursor) ? panel.strip(cursor) : nil
		return Senses(
			idleMs: UInt64(max(0, idle) * 1000),
			hour: UInt8(Calendar.current.component(.hour, from: Date())),
			frontApp: NSWorkspace.shared.frontmostApplication?.localizedName,
			music: music,
			stripWidth: Double(panel.frame.width),
			stripHeight: Double(panel.reach),
			cursorX: onStrip.map { Double($0.x) },
			cursorY: onStrip.map { Double($0.y) },
			today: today
		)
	}

	/// The local date, `YYYY-MM-DD`: how the memory counts days.
	static var today: String {
		let c = Calendar.current.dateComponents([.year, .month, .day], from: Date())
		return String(format: "%04d-%02d-%02d", c.year ?? 0, c.month ?? 0, c.day ?? 0)
	}

	/// Monotonic milliseconds for the core, which only uses differences.
	static var clock: UInt64 { UInt64(ProcessInfo.processInfo.systemUptime * 1000) }
}
