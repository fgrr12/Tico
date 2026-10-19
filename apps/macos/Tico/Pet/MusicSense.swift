import AppKit

/// What Spotify or Apple Music is playing, the way `src-tauri/music.rs` asks:
/// over Apple Events, and only to a player that is already open — `tell
/// application` on its own would launch it.
///
/// The Tauri build spawned `osascript` for this and measured ~135ms a time.
/// Here each player's script is compiled once and run in-process on a private
/// queue (`NSAppleScript` is not thread-safe, and never belongs on the main
/// thread), and the cadence is the same adaptive one: every 4s while
/// something plays, every 15s while nothing does.
final class MusicSense: @unchecked Sendable {
	private struct Player {
		let name: String
		let script: String
		var compiled: NSAppleScript?
	}

	private let queue = DispatchQueue(label: "com.fgrr6.tico.music")
	/// While Lyra is running it asks the players already, and tico listens to
	/// it instead (`LyraLink`): no Apple Events from here at all.
	private let lock = NSLock()
	private var deferring = false

	func standDown(_ other: Bool) {
		lock.withLock { deferring = other }
	}
	private var players = [
		Player(
			name: "Spotify",
			script: """
				set d to (character id 31)
				tell application "Spotify"
					if player state is playing then return (artist of current track) & d & (name of current track) & d & "" & d & "0"
				end tell
				return ""
				"""
		),
		// Apple Music also knows the genre and, when the library was tagged, the tempo.
		Player(
			name: "Music",
			script: """
				set d to (character id 31)
				tell application "Music"
					if player state is playing then
						set t to current track
						return (artist of t) & d & (name of t) & d & (genre of t) & d & ((bpm of t) as text)
					end if
				end tell
				return ""
				"""
		),
	]

	/// Calls `onChange` on the main thread whenever what is playing changes.
	func watch(_ onChange: @escaping @MainActor @Sendable (Track?) -> Void) {
		queue.async { self.loop(last: nil, onChange) }
	}

	private func loop(last: Track?, _ onChange: @escaping @MainActor @Sendable (Track?) -> Void) {
		if lock.withLock({ deferring }) {
			// Forget what was on, so the first poll after Lyra quits reports it.
			queue.asyncAfter(deadline: .now() + 4) { self.loop(last: nil, onChange) }
			return
		}
		let now = poll()
		if now != last { DispatchQueue.main.async { onChange(now) } }
		queue.asyncAfter(deadline: .now() + (now == nil ? 15 : 4)) { self.loop(last: now, onChange) }
	}

	private func poll() -> Track? {
		let open = Set(NSWorkspace.shared.runningApplications.compactMap(\.localizedName))
		for i in players.indices where open.contains(players[i].name) {
			if let track = run(&players[i]) { return track }
		}
		return nil
	}

	private func run(_ player: inout Player) -> Track? {
		if player.compiled == nil {
			let script = NSAppleScript(source: player.script)
			var error: NSDictionary?
			guard script?.compileAndReturnError(&error) == true else { return nil }
			player.compiled = script
		}
		var error: NSDictionary?
		guard let line = player.compiled?.executeAndReturnError(&error).stringValue else { return nil }
		// Unit separator: "|" and " - " both occur in real track titles.
		let parts = line.components(separatedBy: "\u{1F}").map { $0.trimmingCharacters(in: .whitespaces) }
		guard parts.count >= 2, !parts[0].isEmpty, !parts[1].isEmpty else { return nil }
		return Track(
			artist: parts[0], song: parts[1],
			genre: parts.count > 2 ? parts[2] : "",
			bpm: UInt32(parts.count > 3 ? parts[3] : "0") ?? 0
		)
	}
}
