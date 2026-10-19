import AppKit

/// Lyra, when it is running: it already asks the players what is on, and
/// knows the lyrics and where each line falls. So while it talks, tico stops
/// asking the players himself (`MusicSense` stands down — one detector instead
/// of two) and gets the song, the lines and the overlay from Lyra's suite
/// events, documented in Lyra's `Suite.swift`.
///
/// Distributed notifications: no server, no polling, no permission; nothing
/// happens between events. Lyra launching or quitting is noticed through
/// `NSWorkspace`, and a `dev.fgrr.suite.hello` makes it say where things stand.
/// Nothing that arrives here is kept.
@MainActor
final class LyraLink {
	nonisolated private static let id = "com.fgrr6.lyra"
	/// A sung line counts as sung for its length, but no longer than this: LRC
	/// drops empty lines, so a gap shows up as the line before it running long.
	private static let longestLine: UInt64 = 7_000

	/// Lyra is running and has spoken: its word on the music is the one used.
	private(set) var active = false
	private(set) var track: Track?
	/// Called when `active` or `track` change.
	var onChange: (() -> Void)?

	private var lyrics = ""
	private var line: UInt32 = 0
	private var lineIndex = -1
	private var lineAt: UInt64 = 0
	private var lineMs: UInt64 = 0
	private var overlay: CGRect?

	init() {
		let center = DistributedNotificationCenter.default()
		for kind in ["track", "line", "overlay"] {
			center.addObserver(forName: Notification.Name("dev.fgrr.lyra.\(kind)"), object: nil, queue: .main) { [weak self] note in
				// As strings, which cross to the main actor; booleans arrive as 0 and 1.
				let info = (note.userInfo ?? [:]).reduce(into: [String: String]()) { $0["\($1.key)"] = "\($1.value)" }
				MainActor.assumeIsolated { self?.heard(kind, info) }
			}
		}
		let workspace = NSWorkspace.shared.notificationCenter
		workspace.addObserver(forName: NSWorkspace.didLaunchApplicationNotification, object: nil, queue: .main) { note in
			let id = (note.userInfo?[NSWorkspace.applicationUserInfoKey] as? NSRunningApplication)?.bundleIdentifier
			// It says hello itself as it starts publishing; asking as well is free.
			if id == Self.id { MainActor.assumeIsolated { Self.hello() } }
		}
		workspace.addObserver(forName: NSWorkspace.didTerminateApplicationNotification, object: nil, queue: .main) { [weak self] note in
			let id = (note.userInfo?[NSWorkspace.applicationUserInfoKey] as? NSRunningApplication)?.bundleIdentifier
			if id == Self.id { MainActor.assumeIsolated { self?.gone() } }
		}
		if !NSRunningApplication.runningApplications(withBundleIdentifier: Self.id).isEmpty { Self.hello() }
	}

	private static func hello() {
		DistributedNotificationCenter.default().postNotificationName(
			Notification.Name("dev.fgrr.suite.hello"), object: nil, userInfo: nil, deliverImmediately: true
		)
	}

	private func heard(_ kind: String, _ info: [String: String]) {
		func yes(_ key: String) -> Bool { info[key] == "1" || info[key] == "true" }
		func number(_ key: String) -> Double { Double(info[key] ?? "") ?? 0 }
		let wasActive = active
		active = true
		switch kind {
		case "track":
			let playing = yes("playing")
			let next = playing ? Track(artist: info["artist"] ?? "", song: info["title"] ?? "", genre: "", bpm: 0) : nil
			lyrics = playing ? info["lyrics"] ?? "" : ""
			if next != track || !wasActive {
				track = next
				onChange?()
			}
		case "line":
			line &+= 1
			lineIndex = Int(info["index"] ?? "") ?? -1
			lineMs = UInt64(max(0, number("ms")))
			lineAt = Sensing.clock
		default:
			overlay = yes("visible") ? CGRect(x: number("x"), y: number("y"), width: number("w"), height: number("h")) : nil
		}
		if !wasActive { onChange?() }
	}

	private func gone() {
		active = false
		track = nil
		overlay = nil
		lyrics = ""
		onChange?()
	}

	/// What the core gets: whether a sung line is on (only while the overlay
	/// shows synced lyrics — hidden, Lyra stops timing lines), and where the
	/// overlay is on his strip.
	func sense(panel: PetPanel) -> Lyra? {
		guard active else { return nil }
		let timing = lyrics == "synced" && overlay != nil
		let length = min(lineMs == 0 ? Self.longestLine : lineMs, Self.longestLine)
		// A little past its end, so back-to-back lines do not blink off between
		// one event and the next.
		let sung = lineIndex >= 0 && Sensing.clock < lineAt + length + 400
		return Lyra(
			sung: timing ? sung : nil,
			line: line,
			missing: lyrics == "missing",
			overlayX: overlay.map { Double(panel.strip(NSPoint(x: $0.midX, y: $0.midY)).x) }
		)
	}
}
