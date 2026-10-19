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
	private var prefsModel: PrefsModel?
	/// The cutaway, while it is open, and the click-outside watch that shuts it.
	private let burrow = BurrowPanel()
	private var burrowOpen = false
	private var outside: Any?
	private var art: Art?
	private var copyJSON = ""
	private let brain = Brain()
	private var frame: Frame?
	private let musicSense = MusicSense()
	private let lyra = LyraLink()
	private var music: Track?
	/// Read once a second rather than on every tick: two CoreAudio calls.
	private var inCall = false
	private var title: String?
	private var ledges: [Ledge] = []
	private var micCheckedAt: UInt64 = 0
	private var screen: NSScreen?
	/// `TICO_DEMO=1`: every effect in turn instead of the core, to look at.
	private let demo = ProcessInfo.processInfo.environment["TICO_DEMO"] != nil ? Demo() : nil
	private var poll: Timer?
	private var hover: Timer?
	private let stateItem = NSMenuItem(title: "", action: nil, keyEquivalent: "")
	/// "Go home", or "Come out" while he is in.
	private let homeItem = NSMenuItem(title: "Go home", action: #selector(goHome), keyEquivalent: "")

	/// Clicking the Dock icon (only there while the preferences are open)
	/// brings them forward.
	func applicationShouldHandleReopen(_ sender: NSApplication, hasVisibleWindows flag: Bool) -> Bool {
		prefs?.makeKeyAndOrderFront(nil)
		return true
	}

	func applicationDidFinishLaunching(_ notification: Notification) {
		// The primary display (the one with the menu bar), as the Tauri build anchors to.
		if let art = try? Art.load(), let screen = NSScreen.screens.first {
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
			// Displays plugged in, unplugged or rearranged: back along the bottom
			// of the primary one.
			NotificationCenter.default.addObserver(forName: NSApplication.didChangeScreenParametersNotification, object: nil, queue: .main) { [weak self] _ in
				MainActor.assumeIsolated { self?.reanchor() }
			}
			musicSense.watch { [weak self] track in
				guard let self, !self.lyra.active else { return }
				self.music = track
			}
			// Lyra running: its word on the music, and no polling of our own.
			lyra.onChange = { [weak self] in
				guard let self else { return }
				self.musicSense.standDown(self.lyra.active)
				if self.lyra.active { self.music = self.lyra.track }
			}
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
			panel.onPortal = { [weak self, weak panel] in
				guard let self, let panel else { return }
				if self.burrowOpen { self.closeBurrow(panel) } else { self.openBurrow(art: art, panel: panel) }
			}
			burrow.onCall = { [weak self, weak panel] in
				guard let self, let panel else { return }
				self.brain.comeUp()
				self.closeBurrow(panel)
				self.think(art: art, panel: panel)
			}
			panel.place(on: screen)
			panel.orderFrontRegardless()
			self.panel = panel
			if ProcessInfo.processInfo.environment["TICO_SHEET"] != nil { sheet = Sheet.open(art: art) }
			if ProcessInfo.processInfo.environment["TICO_SELFTEST"] != nil { selfTest(panel) }
			if ProcessInfo.processInfo.environment["TICO_PREFS"] != nil {
				DispatchQueue.main.async { [weak self] in self?.openPrefs() }
			}
			// `TICO_BURROW=<seconds>`: lifts the hatch that far in, to look.
			if let wait = ProcessInfo.processInfo.environment["TICO_BURROW"].flatMap(Double.init) {
				DispatchQueue.main.asyncAfter(deadline: .now() + wait) { [weak self, weak panel] in
					guard let self, let panel else { return }
					self.openBurrow(art: art, panel: panel)
				}
			}
			// `TICO_DO=climb` (any moment's key): does it 2s in, to look at.
			if let key = ProcessInfo.processInfo.environment["TICO_DO"] {
				DispatchQueue.main.asyncAfter(deadline: .now() + 2) { [weak self] in
					self?.brain.perform(key: key)
					print("do \(key) \(Date().timeIntervalSince1970)")
					fflush(stdout)
				}
			}
		}

		let item = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)
		// The Tauri tray's icon: a template, so macOS colours it for the menu bar.
		if let icon = NSImage(named: "MenuBarIcon") {
			icon.isTemplate = true
			item.button?.image = icon
		} else {
			item.button?.title = "tico"
		}

		// The Tauri build's tray, item for item.
		let menu = NSMenu()
		menu.addItem(withTitle: "Show", action: #selector(show), keyEquivalent: "").target = self
		menu.addItem(withTitle: "Hide", action: #selector(hide), keyEquivalent: "").target = self
		homeItem.target = self
		menu.addItem(homeItem)
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
		menu.delegate = self
		item.menu = menu
		statusItem = item
	}

	/// Asks the core what he is like now and hands it to the panel, which only
	/// does work for what changed.
	private func think(art: Art, panel: PetPanel) {
		let next = demo.map { $0.frame(at: Sensing.clock, art: art) } ?? brain.tick(nowMs: Sensing.clock, senses: senses(panel))
		panel.hitTest(cursor: NSEvent.mouseLocation)
		watchCloser(panel)
		// A key in the last second and a half, anywhere — never which key.
		let typing = CGEventSource.secondsSinceLastEventType(.hidSystemState, eventType: .keyDown) < 1.5
		panel.veil(cursor: NSEvent.mouseLocation, typing: typing)
		// Most ticks change nothing; those cost one comparison.
		guard next != frame else { return }
		// `TICO_LOG=1`: every change of mood, effect or speech, for debugging.
		if ProcessInfo.processInfo.environment["TICO_LOG"] != nil {
			print("tico \(Sensing.clock) \(next.mood) \(next.feeling) x=\(Int(next.x)) sing=\(next.singing) effect=\(next.effect?.name ?? "-") speech=\(next.speech.map { "\($0.reminder ?? "")|\($0.text)" } ?? "-")")
			fflush(stdout)
		}
		if next.mood != frame?.mood || next.feeling != frame?.feeling || next.singing != frame?.singing {
			stateItem.title = "\(next.mood) · \(next.feeling)\(next.singing ? " · singing" : "")"
		}
		if let effect = next.effect, effect.serial != frame?.effect?.serial { stateItem.title = "effect: \(effect.name)" }
		// He went in or came out while you were looking: the scene again, in
		// place — and when the portal closes, so does the view through it.
		if burrowOpen, next.portal == nil {
			closeBurrow(panel)
		} else if burrowOpen, next.home != frame?.home {
			openBurrow(art: art, panel: panel, rising: false)
		}
		frame = next
		let p = next.parts
		panel.apply(next, art: art, parts: ["shell": p.shell, "hands": p.hands, "feet": p.feet, "antenna": p.antenna])
	}

	/// Lifts the hatch: the scene is worked out now, from how long he has been
	/// down there — nothing ran below to produce it.
	private func openBurrow(art: Art, panel: PetPanel, rising: Bool = true) {
		guard let frame else { return }
		let language = brain.settings().language
		burrow.show(
			brain.burrow(), art: art, frame: frame, language: language == "auto" ? systemLanguage : language,
			from: panel.portalOnScreen, rising: rising
		)
		burrowOpen = true
		// A click anywhere else shuts it; clicks on our own windows never get here.
		if outside == nil {
			outside = NSEvent.addGlobalMonitorForEvents(matching: [.leftMouseDown, .rightMouseDown]) { [weak self, weak panel] _ in
				MainActor.assumeIsolated {
					guard let self, let panel else { return }
					self.closeBurrow(panel)
				}
			}
		}
	}

	private func closeBurrow(_ panel: PetPanel) {
		burrow.hide()
		burrowOpen = false
		if let outside { NSEvent.removeMonitor(outside) }
		outside = nil
	}

	/// With the pointer near him (or the portal, or a bubble), whether it is over
	/// him is checked twenty times a second: at the four ticks a second alone, a
	/// quick click on him while he walks went through to the desktop, and
	/// `cursor.rs` polls at 20Hz for the same reason. Only near: waking 20 times
	/// a second all the time doubled what he costs standing still.
	private func watchCloser(_ panel: PetPanel) {
		let near = panel.near(cursor: NSEvent.mouseLocation, within: 220)
		if near, hover == nil {
			hover = Timer.scheduledTimer(withTimeInterval: 0.05, repeats: true) { [weak panel] _ in
				MainActor.assumeIsolated { panel?.hitTest(cursor: NSEvent.mouseLocation) }
			}
		} else if !near, let timer = hover {
			timer.invalidate()
			hover = nil
		}
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
			// Another app's main thread answers every Accessibility request, so
			// once a second, and only when asked for.
			title = brain.settings().readTitles ? WindowTitle.front() : nil
			// Your windows' tops, for catching him; fresh before any fall he takes.
			ledges = Ledges.around(panel: panel)
		}
		return Sensing.now(music: music, inCall: inCall, title: title, ledges: ledges, lyra: lyra.sense(panel: panel), panel: panel, screen: screen ?? NSScreen.main!)
	}

	private var systemLanguage: String {
		Locale.preferredLanguages.first?.lowercased().hasPrefix("es") == true ? "es" : "en"
	}

	@objc private func goHome() {
		if frame?.home == true { brain.comeUp() } else { brain.goHome() }
		if let art, let panel { think(art: art, panel: panel) }
	}

	/// Along the bottom of the primary display again, whichever it now is —
	/// on a display change, and on Show, which is how you get him back if he
	/// was left somewhere strange.
	private func reanchor() {
		guard let panel, let primary = NSScreen.screens.first else { return }
		screen = primary
		panel.place(on: primary)
		if burrowOpen { closeBurrow(panel) }
	}

	@objc private func show() {
		reanchor()
		panel?.orderFrontRegardless()
	}
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
		if let prefsModel {
			prefsModel.refresh()
		} else {
			let model = PrefsModel(brain: brain, copyJSON: copyJSON, system: systemLanguage)
			prefsModel = model
			prefs = PrefsWindow.make(art: art, model: model)
			NotificationCenter.default.addObserver(forName: NSWindow.willCloseNotification, object: prefs, queue: .main) { _ in
				MainActor.assumeIsolated { _ = NSApp.setActivationPolicy(.accessory) }
			}
		}
		// In the Dock while the preferences are open, like any app with a window
		// up; back to a menu bar app when it closes.
		NSApp.setActivationPolicy(.regular)
		// An accessory app has to bring itself forward, or the window opens behind.
		NSApp.activate()
		prefs?.center()
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
			x: 240, lift: 0, moveMs: 0, moveSerial: 0, walking: false, flying: false, facingRight: true, speech: nil, worn: [], parts: Parts(shell: "terminal", hands: "mitts", feet: "pills", antenna: "led"), hidden: false, width: 92, ladder: nil, falling: false, heat: 0, hanging: false, home: false, wave: 0, portal: nil
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

extension AppDelegate: NSMenuDelegate {
	/// The home item says what it will do, and is only there with the burrow on.
	func menuWillOpen(_ menu: NSMenu) {
		homeItem.title = frame?.home == true ? "Come out" : "Go home"
		homeItem.isHidden = !brain.settings().house
	}
}
