import AppKit
import CoreGraphics

/// What the shell tells the core: how long the cursor has been still, the hour,
/// and the name of the app in front — none of which needs a permission (a name,
/// never a window title: titles need Screen Recording) — plus what is playing,
/// which `MusicSense` asks the players for.
@MainActor
enum Sensing {
	static func now(music: Track?) -> Senses {
		let idle = CGEventSource.secondsSinceLastEventType(.combinedSessionState, eventType: .mouseMoved)
		return Senses(
			idleMs: UInt64(max(0, idle) * 1000),
			hour: UInt8(Calendar.current.component(.hour, from: Date())),
			frontApp: NSWorkspace.shared.frontmostApplication?.localizedName,
			music: music
		)
	}

	/// Monotonic milliseconds for the core, which only uses differences.
	static var clock: UInt64 { UInt64(ProcessInfo.processInfo.systemUptime * 1000) }
}
