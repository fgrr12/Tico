import AppKit

@main
@MainActor
enum Main {
	static func main() {
		let delegate = AppDelegate()
		NSApplication.shared.delegate = delegate
		withExtendedLifetime(delegate) { NSApplication.shared.run() }
	}
}

/// For now: the pet, standing still in his idle pose, and a menu bar item that
/// says which core and which art he was built from. Behaviour comes next.
@MainActor
final class AppDelegate: NSObject, NSApplicationDelegate {
	private let core = TicoCore()
	private var statusItem: NSStatusItem?
	private var panel: PetPanel?
	private var sheet: NSWindow?
	private var prefs: NSWindow?
	private var art: Art?
	private var copyJSON = ""
	private let brain = Brain()
	private var frame: Frame?
	private let musicSense = MusicSense()
	private var music: Track?
	/// Read once a second rather than on every tick: two CoreAudio calls.
	private var inCall = false
	private var micCheckedAt: UInt64 = 0
	private var screen: NSScreen?
	/// `TICO_DEMO=1`: every effect in turn instead of the core, to look at.
	private let demo = ProcessInfo.processInfo.environment["TICO_DEMO"] != nil ? Demo() : nil
	private var poll: Timer?
	private let stateItem = NSMenuItem(title: "", action: nil, keyEquivalent: "")

	func applicationDidFinishLaunching(_ notification: Notification) {
		if let art = try? Art.load(), let screen = NSScreen.main {
			// What he remembers and how he is set up: tico.json and memory.json in
			// this app's own folder, started from the Tauri build's the first time
			// — never written back there, so the two can run side by side.
			let support = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
			// `TICO_DATA=<folder>` uses another folder, for trying things without
			// touching your real tico.
			let own = ProcessInfo.processInfo.environment["TICO_DATA"].map { URL(fileURLWithPath: $0) }
				?? support.appendingPathComponent(Bundle.main.bundleIdentifier ?? "com.fgrr6.tico")
			let tauri = support.appendingPathComponent("com.fgrr6.tico")
			let seed = own == tauri || ProcessInfo.processInfo.environment["TICO_DATA"] != nil ? nil : tauri.path
			brain.open(dir: own.path, seed: seed, today: Sensing.today)
			// What he says, in the language macOS is set to: Spanish or English.
			if let url = Bundle.main.url(forResource: "copy", withExtension: "json"), let json = try? String(contentsOf: url, encoding: .utf8) {
				copyJSON = json
				brain.setCopy(json: json, language: systemLanguage)
			}
			self.art = art
			let panel = PetPanel(screen: screen)
			self.screen = screen
			think(art: art, panel: panel)
			// Four times a second: the core checks its timers on every tick, so a
			// 0.9s reaction ends on time, and takes decisions on its own 3.5s poll.
			poll = Timer.scheduledTimer(withTimeInterval: 0.25, repeats: true) { [weak self, weak panel] _ in
				MainActor.assumeIsolated {
					guard let self, let panel else { return }
					self.think(art: art, panel: panel)
				}
			}
			musicSense.watch { [weak self] track in self?.music = track }
			// Handling him: the core decides what a press, a drag and a drop mean;
			// each is followed by a tick so he answers at once, not on the next one.
			panel.onPress = { [weak self, weak panel] p in
				guard let self, let panel else { return }
				let at = panel.standing
				self.brain.press(nowMs: Sensing.clock, px: p.x, py: p.y, x: at.x, lift: at.y)
				self.think(art: art, panel: panel)
			}
			panel.onDrag = { [weak self, weak panel] p in
				guard let self, let panel else { return }
				self.brain.drag(nowMs: Sensing.clock, px: p.x, py: p.y)
				self.think(art: art, panel: panel)
			}
			panel.onDone = { [weak self, weak panel] id in
				guard let self, let panel else { return }
				self.brain.completeReminder(id: id)
				self.think(art: art, panel: panel)
			}
			panel.onRelease = { [weak self, weak panel] in
				guard let self, let panel else { return }
				self.brain.release(nowMs: Sensing.clock)
				self.think(art: art, panel: panel)
			}
			panel.place(on: screen)
			panel.orderFrontRegardless()
			self.panel = panel
			if ProcessInfo.processInfo.environment["TICO_SHEET"] != nil { sheet = Sheet.open(art: art) }
			if ProcessInfo.processInfo.environment["TICO_SELFTEST"] != nil { selfTest(panel) }
		}

		let item = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)
		item.button?.title = "tico"

		// The Tauri build's tray, item for item.
		let menu = NSMenu()
		menu.addItem(withTitle: "Show", action: #selector(show), keyEquivalent: "").target = self
		menu.addItem(withTitle: "Hide", action: #selector(hide), keyEquivalent: "").target = self
		menu.addItem(.separator())
		let quiet = NSMenu()
		for (title, minutes) in [("30 minutes", 30), ("1 hour", 60), ("Until I say otherwise", -1), ("Off", 0)] {
			let entry = quiet.addItem(withTitle: title, action: #selector(beQuiet(_:)), keyEquivalent: "")
			entry.target = self
			entry.tag = minutes
		}
		menu.addItem(withTitle: "Quiet", action: nil, keyEquivalent: "").submenu = quiet
		menu.addItem(.separator())
		menu.addItem(withTitle: "Preferences…", action: #selector(openPrefs), keyEquivalent: ",").target = self
		menu.addItem(.separator())
		menu.addItem(withTitle: "core \(core.version())", action: nil, keyEquivalent: "")
		menu.addItem(withTitle: artSummary(), action: nil, keyEquivalent: "")
		menu.addItem(stateItem)
		menu.addItem(.separator())
		menu.addItem(withTitle: "Quit", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")
		item.menu = menu
		statusItem = item
	}

	/// Asks the core what he is like now and hands it to the panel, which only
	/// does work for what changed.
	private func think(art: Art, panel: PetPanel) {
		let next = demo.map { $0.frame(at: Sensing.clock, art: art) } ?? brain.tick(nowMs: Sensing.clock, senses: senses(panel))
		panel.hitTest(cursor: NSEvent.mouseLocation)
		// A key in the last second and a half, anywhere — never which key.
		let typing = CGEventSource.secondsSinceLastEventType(.hidSystemState, eventType: .keyDown) < 1.5
		panel.veil(cursor: NSEvent.mouseLocation, typing: typing)
		// Most ticks change nothing; those cost one comparison.
		guard next != frame else { return }
		// `TICO_LOG=1`: every change of mood, effect or speech, for debugging.
		if ProcessInfo.processInfo.environment["TICO_LOG"] != nil {
			print("tico \(Sensing.clock) \(next.mood) \(next.feeling) x=\(Int(next.x)) effect=\(next.effect?.name ?? "-") speech=\(next.speech.map { "\($0.reminder ?? "")|\($0.text)" } ?? "-")")
			fflush(stdout)
		}
		if next.mood != frame?.mood || next.feeling != frame?.feeling || next.singing != frame?.singing {
			stateItem.title = "\(next.mood) · \(next.feeling)\(next.singing ? " · singing" : "")"
		}
		if let effect = next.effect, effect.serial != frame?.effect?.serial { stateItem.title = "effect: \(effect.name)" }
		frame = next
		let p = next.parts
		panel.apply(next, art: art, parts: ["shell": p.shell, "hands": p.hands, "feet": p.feet, "antenna": p.antenna])
	}

	/// `TICO_SELFTEST=1`: handles him the way the mouse would — the same
	/// callbacks, through the core and back — on a schedule a script can time
	/// screenshots against (each step prints when it happens). A click at 2s,
	/// a pick-up and carry to 300pt at 5s, the drop at 7s.
	private func selfTest(_ panel: PetPanel) {
		func step(_ at: Double, _ name: String, _ action: @escaping @MainActor () -> Void) {
			DispatchQueue.main.asyncAfter(deadline: .now() + at) {
				print("selftest \(name) \(Date().timeIntervalSince1970)")
				fflush(stdout)
				action()
			}
		}
		let grab = { CGPoint(x: panel.standing.x + 46, y: panel.standing.y + 46) }
		step(2, "click") { panel.onPress?(grab()); panel.onRelease?() }
		step(5, "pickup") { panel.onPress?(grab()) }
		for (i, dy) in stride(from: 10.0, through: 300, by: 20).enumerated() {
			step(5.2 + Double(i) * 0.05, "drag") { panel.onDrag?(CGPoint(x: grab().x, y: 46 + dy)) }
		}
		step(7, "drop") { panel.onRelease?() }
	}

	private func senses(_ panel: PetPanel) -> Senses {
		if Sensing.clock - micCheckedAt >= 1_000 {
			micCheckedAt = Sensing.clock
			inCall = Microphone.live
		}
		return Sensing.now(music: music, inCall: inCall, panel: panel, screen: screen ?? NSScreen.main!)
	}

	private var systemLanguage: String {
		Locale.preferredLanguages.first?.lowercased().hasPrefix("es") == true ? "es" : "en"
	}

	@objc private func show() { panel?.orderFrontRegardless() }
	@objc private func hide() { panel?.orderOut(nil) }

	/// Minutes of silence; -1 is until said otherwise, 0 lifts it.
	@objc private func beQuiet(_ sender: NSMenuItem) {
		var settings = brain.settings()
		let now = Int64(Date().timeIntervalSince1970)
		settings.quietUntil = sender.tag == 0 ? 0 : sender.tag < 0 ? Int64.max : now + Int64(sender.tag) * 60
		brain.updateSettings(settings: settings)
	}

	@objc private func openPrefs() {
		guard let art else { return }
		if prefs == nil {
			let language = brain.settings().language
			let copy = PrefsCopy(json: copyJSON, language: language == "auto" ? systemLanguage : language)
			prefs = PrefsWindow.make(art: art, brain: brain, copy: copy)
		}
		// An accessory app has to bring itself forward, or the window opens behind.
		NSApp.activate()
		prefs?.makeKeyAndOrderFront(nil)
	}

	private func artSummary() -> String {
		do {
			let art = try Art.load()
			let parts = art.slots.values.reduce(0) { $0 + $1.count }
			return "art v\(art.version): \(parts) parts, \(art.props.count) props, \(art.faces.count) moods"
		} catch {
			return "art failed to load: \(error.localizedDescription)"
		}
	}
}

/// Plays every effect, one every 2.5s, then each feeling's posture, sitting
/// and singing — the moving counterpart of the sheet. The menu shows which.
@MainActor
final class Demo {
	private var start: UInt64?
	private var shown = -1

	func frame(at now: UInt64, art: Art) -> Frame {
		let effects = art.motion.effects.keys.sorted()
		let feelings: [Feeling] = [.bored, .lonely, .pleased, .worried, .sleepy, .smug, .curious, .scared]
		start = start ?? now
		let step = Int((now - start!) / 2_500) % (effects.count + feelings.count + 2)
		var frame = Frame(
			mood: .idle, feeling: .content, colours: palette(feeling: .content),
			effect: nil, sitting: false, look: nil, singing: false,
			x: 240, lift: 0, moveMs: 0, moveSerial: 0, walking: false, flying: false, facingRight: true, speech: nil, worn: [], parts: Parts(shell: "terminal", hands: "mitts", feet: "pills", antenna: "led"), hidden: false
		)
		if step != shown {
			shown = step
			// For a script timing screenshots: what started, and when (Unix seconds).
			print("demo \(step) \(Date().timeIntervalSince1970)")
			fflush(stdout)
		}
		if step < effects.count {
			frame.effect = Effect(name: effects[step], serial: UInt32(step + 1))
		} else if step < effects.count + feelings.count {
			frame.feeling = feelings[step - effects.count]
			frame.colours = palette(feeling: frame.feeling)
		} else if step == effects.count + feelings.count {
			frame.sitting = true
		} else {
			frame.singing = true
		}
		return frame
	}
}
