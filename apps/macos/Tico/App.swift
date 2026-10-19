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
	private let brain = Brain()
	private var frame: Frame?
	private var poll: Timer?
	private let stateItem = NSMenuItem(title: "", action: nil, keyEquivalent: "")

	func applicationDidFinishLaunching(_ notification: Notification) {
		if let art = try? Art.load(), let screen = NSScreen.main {
			let panel = PetPanel()
			think(art: art, panel: panel)
			// Every 3.5s, the period of the poll in Companion.tsx.
			poll = Timer.scheduledTimer(withTimeInterval: 3.5, repeats: true) { [weak self, weak panel] _ in
				MainActor.assumeIsolated {
					guard let self, let panel else { return }
					self.think(art: art, panel: panel)
				}
			}
			panel.stand(atX: 240, on: screen)
			panel.orderFrontRegardless()
			self.panel = panel
			if ProcessInfo.processInfo.environment["TICO_SHEET"] != nil { sheet = Sheet.open(art: art) }
		}

		let item = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)
		item.button?.title = "tico"

		let menu = NSMenu()
		menu.addItem(withTitle: "core \(core.version())", action: nil, keyEquivalent: "")
		menu.addItem(withTitle: artSummary(), action: nil, keyEquivalent: "")
		menu.addItem(stateItem)
		menu.addItem(.separator())
		menu.addItem(withTitle: "Quit tico", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")
		item.menu = menu
		statusItem = item
	}

	/// Asks the core what he is like now, and redraws only when that changed.
	private func think(art: Art, panel: PetPanel) {
		let next = brain.tick(nowMs: Sensing.clock, senses: Sensing.now())
		guard next != frame else { return }
		frame = next
		stateItem.title = "\(next.mood) · \(next.feeling)"
		let c = next.colours
		panel.show(art: art, mood: "\(next.mood)", colours: ["{face}": c.face, "{screen}": c.screen, "{led}": c.led])
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
