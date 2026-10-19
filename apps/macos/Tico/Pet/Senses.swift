import AppKit
import CoreGraphics

/// What the shell can tell the core without asking for a single permission:
/// how long the cursor has been still, the hour, and the name of the app in
/// front (a name, never a window title — titles need Screen Recording).
@MainActor
enum Sensing {
	static func now() -> Senses {
		let idle = CGEventSource.secondsSinceLastEventType(.combinedSessionState, eventType: .mouseMoved)
		return Senses(
			idleMs: UInt64(max(0, idle) * 1000),
			hour: UInt8(Calendar.current.component(.hour, from: Date())),
			frontApp: NSWorkspace.shared.frontmostApplication?.localizedName,
			// The music sense comes over from src-tauri/music.rs next.
			music: false
		)
	}

	/// Monotonic milliseconds for the core, which only uses differences.
	static var clock: UInt64 { UInt64(ProcessInfo.processInfo.systemUptime * 1000) }
}
