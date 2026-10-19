import AppKit
import QuartzCore

/// The window he lives in: just big enough for him and whatever he is wearing,
/// borderless, transparent, above the Dock, on every Space, and never active.
///
/// The Tauri build is a transparent window the width of the screen, because a
/// WebView cannot move cheaply; here the window *is* the pet's position, and
/// walking will move it.
final class PetPanel: NSPanel {
	/// `--pet-width` in companion.css: the 96-unit drawing shown 92 points wide.
	static let petWidth: CGFloat = 92
	/// Props reach ~30 units above the head and the shadow sits below the feet,
	/// so the window leaves room around the drawing.
	private static let margin = NSEdgeInsets(top: 40, left: 24, bottom: 4, right: 24)

	/// Bobs. Unscaled, so the 5px of `companion-bob` are screen points, as in CSS.
	private let body = CALayer()
	/// The 96-unit drawing, scaled to `petWidth`.
	private let host = CALayer()
	private var blinker: Blinker?

	init() {
		let scale = Self.petWidth / Painter.size
		let size = NSSize(
			width: Self.petWidth + Self.margin.left + Self.margin.right,
			height: Self.petWidth + Self.margin.top + Self.margin.bottom
		)
		super.init(
			contentRect: NSRect(origin: .zero, size: size),
			styleMask: [.borderless, .nonactivatingPanel],
			backing: .buffered,
			defer: false
		)
		isOpaque = false
		backgroundColor = .clear
		hasShadow = false
		// 25, like the Tauri build: above the Dock (20), so he can walk over it,
		// and over the menu bar's level (24) only where he actually is.
		level = NSWindow.Level(rawValue: 25)
		collectionBehavior = [.canJoinAllSpaces, .stationary, .ignoresCycle]
		hidesOnDeactivate = false
		isReleasedWhenClosed = false
		// Nothing takes the mouse yet; petting and dragging come with behaviour.
		ignoresMouseEvents = true

		let view = NSView(frame: NSRect(origin: .zero, size: size))
		view.wantsLayer = true
		contentView = view
		body.frame = CGRect(origin: .zero, size: size)
		host.anchorPoint = .zero
		host.bounds = CGRect(x: 0, y: 0, width: Painter.size, height: Painter.size)
		host.position = CGPoint(x: Self.margin.left, y: Self.margin.bottom)
		host.setAffineTransform(CGAffineTransform(scaleX: scale, y: scale))
		body.addSublayer(host)
		view.layer?.addSublayer(body)
		Motion.bob(body)
	}

	override var canBecomeKey: Bool { false }
	override var canBecomeMain: Bool { false }

	/// Replaces the drawing and starts its animations. Layers are built once per
	/// change of mood, body or colour — never per frame.
	func show(art: Art, mood: String = "idle", parts: [String: String] = Pet.defaultParts, colours: [String: String] = Pet.content) {
		blinker?.stop()
		blinker = nil
		host.sublayers = Pet.layers(art: art, mood: mood, parts: parts, colours: colours)
		Motion.pulse(host)
		// Only moods whose eyes are open have a blink drawing.
		if art.faces[mood]?.blink != nil,
			let open = Motion.find("companion-eyes", in: host).first,
			let closed = Pet.layers(art: art, mood: mood, parts: parts, colours: colours, blink: true)
				.lazy.compactMap({ Motion.find("companion-eyes", in: $0).first }).first
		{
			blinker = Blinker(open: open, closed: closed)
		}
	}

	/// Stands him on the bottom edge of the screen, the way the Tauri build does:
	/// over the Dock rather than above it.
	func stand(atX x: CGFloat, on screen: NSScreen) {
		let shadowBelowFeet = (Painter.size - 90 - 4.5) * Self.petWidth / Painter.size
		setFrameOrigin(NSPoint(x: screen.frame.minX + x, y: screen.frame.minY - Self.margin.bottom + shadowBelowFeet))
	}
}

/// One whole pet, back to front: the mood's drawing with the four body slots
/// filled in. Colours are `PALETTE.content` in companion.ts until the core
/// decides how he feels.
@MainActor
enum Pet {
	nonisolated static let defaultParts = ["shell": "terminal", "hands": "mitts", "feet": "pills", "antenna": "led"]
	nonisolated static let content = ["{face}": "#bb9af7", "{screen}": "#1a1c23", "{led}": "#9ece6a"]

	static func layers(
		art: Art, mood: String = "idle", parts: [String: String] = defaultParts,
		colours: [String: String] = content, singing: Bool = false, blink: Bool = false, worn: [String] = []
	) -> [CALayer] {
		guard let face = art.faces[mood] else { return [] }
		let nodes = singing ? face.singing : blink ? (face.blink ?? face.normal) : face.normal
		let resolved = nodes.compactMap { node -> ArtNode? in
			guard node.tag == "slot" else { return node }
			return node.name.flatMap { parts[$0] }.flatMap { variant in node.name.flatMap { art.slots[$0]?[variant] } }
		}
		// Worn things go over the face, as in CompanionFace; the singing notes and
		// the thinking and sleeping marks above them are not drawn with a prop on yet.
		return Painter(art: art, colours: colours).layers(resolved + worn.compactMap { art.props[$0] })
	}
}
