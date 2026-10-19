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

	func applicationDidFinishLaunching(_ notification: Notification) {
		if let art = try? Art.load(), let screen = NSScreen.main {
			let panel = PetPanel()
			panel.show(art: art)
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
		menu.addItem(.separator())
		menu.addItem(withTitle: "Quit tico", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")
		item.menu = menu
		statusItem = item
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
