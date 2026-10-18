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

/// The skeleton: a menu bar item that proves the core links and the art loads.
/// The pet himself — the panel, the layers, the behaviours — comes next.
@MainActor
final class AppDelegate: NSObject, NSApplicationDelegate {
	private let core = TicoCore()
	private var statusItem: NSStatusItem?

	func applicationDidFinishLaunching(_ notification: Notification) {
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
