import AppKit
import QuartzCore

/// The native `scripts/sheet.html`: every mood, every body part, every prop, on a
/// dark backdrop, drawn by the same `Painter` the pet uses. Open it with
/// `TICO_SHEET=1 open ~/Applications/tico.app` (or run the binary with it set)
/// and compare it with the web sheet — a drawing is verified by looking at it.
///
/// A window rather than an image file: `CALayer.render(in:)` skips masks, which
/// would hide exactly the gradients and clips worth checking. A window goes
/// through the real compositor, and `screencapture -l` can grab it.
@MainActor
enum Sheet {
	private static let cell: CGFloat = 76
	private static let pet: CGFloat = 56
	private static let perRow = 15

	static func open(art: Art) -> NSWindow {
		var rows: [(String, [(String, [CALayer])])] = []
		let moods = ["idle", "happy", "thinking", "error", "wow", "love", "dizzy", "sleep", "held", "watching", "muted", "yawn", "scared"]
		rows.append(("moods", moods.map { ($0, Pet.layers(art: art, mood: $0)) } + [("singing", Pet.layers(art: art, singing: true))]))
		for slot in ["shell", "hands", "feet", "antenna"] {
			let variants = art.slots[slot, default: [:]].keys.sorted()
			rows.append((slot, variants.map { variant in
				var parts = Pet.defaultParts
				parts[slot] = variant
				return (variant, Pet.layers(art: art, parts: parts))
			}))
		}
		let props = art.props.keys.sorted()
		for start in stride(from: 0, to: props.count, by: perRow) {
			rows.append((start == 0 ? "props" : "", props[start..<min(start + perRow, props.count)].map { ($0, Pet.layers(art: art, worn: [$0])) }))
		}

		let width = CGFloat(perRow) * cell + 80
		let height = CGFloat(rows.count) * (cell + 18) + 20
		let window = NSWindow(
			contentRect: NSRect(x: 0, y: 0, width: width, height: height),
			styleMask: [.titled, .closable], backing: .buffered, defer: false
		)
		window.title = "tico — sheet"
		window.isReleasedWhenClosed = false
		let view = NSView(frame: NSRect(x: 0, y: 0, width: width, height: height))
		view.wantsLayer = true
		view.layer?.backgroundColor = Painter.color("#2b2f3a")
		window.contentView = view

		for (r, (title, items)) in rows.enumerated() {
			let top = height - 10 - CGFloat(r) * (cell + 18)
			let heading = label(title, size: 10, bold: true)
			heading.frame.origin = CGPoint(x: 8, y: top - cell / 2)
			view.layer?.addSublayer(heading)
			for (c, (name, layers)) in items.enumerated() {
				let x = 80 + CGFloat(c) * cell
				let host = CALayer()
				host.anchorPoint = .zero
				host.bounds = CGRect(x: 0, y: 0, width: Painter.size, height: Painter.size)
				host.position = CGPoint(x: x + (cell - pet) / 2, y: top - cell + 6)
				host.setAffineTransform(CGAffineTransform(scaleX: pet / Painter.size, y: pet / Painter.size))
				host.sublayers = layers
				view.layer?.addSublayer(host)
				let caption = label(name, size: 9, bold: false)
				caption.frame.origin = CGPoint(x: x, y: top - cell - 10)
				caption.frame.size.width = cell
				caption.alignmentMode = .center
				view.layer?.addSublayer(caption)
			}
		}
		window.center()
		window.makeKeyAndOrderFront(nil)
		NSApp.activate()
		return window
	}

	private static func label(_ string: String, size: CGFloat, bold: Bool) -> CATextLayer {
		let layer = CATextLayer()
		layer.string = string
		layer.font = NSFont.systemFont(ofSize: size, weight: bold ? .semibold : .regular)
		layer.fontSize = size
		layer.foregroundColor = Painter.color("#9aa3b8")
		layer.contentsScale = NSScreen.main?.backingScaleFactor ?? 2
		layer.frame.size = CGSize(width: 72, height: size + 4)
		return layer
	}
}
