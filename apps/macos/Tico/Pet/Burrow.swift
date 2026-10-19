import AppKit
import QuartzCore

/// The burrow, seen through the portal: `BurrowMap` in House.tsx, drawn from the same
/// pieces (`art.house`), rising out of the portal when you click it.
///
/// Its own small panel rather than part of the strip, because the strip is
/// click-through except over him and this takes clicks all over. It exists only
/// while open — the ambient motion (the fan, the plant, the beacon breathing)
/// runs in the render server at `Motion.idleRate`, and closing removes all of
/// it, so the burrow costs nothing while nobody is looking. Same rule as the
/// house has always had: no clock down there, the scene is derived on opening
/// (`Brain::burrow`).
@MainActor
final class BurrowPanel: NSPanel {
	/// `.tico-map`: 340 wide, 7 of padding, the stage at the cutaway's aspect.
	private static let width: CGFloat = 340
	private static let pad: CGFloat = 7
	private static var stageWidth: CGFloat { width - pad * 2 }
	private static let labelFont = NSFont.monospacedSystemFont(ofSize: 10, weight: .regular)
	private static let lineFont = NSFont.monospacedSystemFont(ofSize: 11.5, weight: .regular)
	private static let buttonFont = NSFont.monospacedSystemFont(ofSize: 11, weight: .regular)

	/// Clicking him, or the button: he comes up.
	var onCall: (() -> Void)?
	private var him: CGRect = .zero
	private var button: CGRect = .zero

	init() {
		super.init(contentRect: .zero, styleMask: [.borderless, .nonactivatingPanel], backing: .buffered, defer: false)
		isOpaque = false
		backgroundColor = .clear
		hasShadow = true
		level = NSWindow.Level(rawValue: 25)
		collectionBehavior = [.canJoinAllSpaces, .stationary, .ignoresCycle]
		hidesOnDeactivate = false
		isReleasedWhenClosed = false
		let view = ClickView()
		view.wantsLayer = true
		view.onDown = { [weak self] p in
			guard let self else { return }
			if self.him.contains(p) || self.button.contains(p) { self.onCall?() }
		}
		contentView = view
	}

	override var canBecomeKey: Bool { false }

	/// Draws `burrow` and rises out of the portal, whose top-left is `from` on
	/// screen.
	func show(_ burrow: Burrow, art: Art, frame: Frame, language: String, from: CGPoint, rising: Bool = true) {
		let house = art.house
		let stageHeight = Self.stageWidth * house.viewBox[3] / house.viewBox[2]
		let present = burrow.present
		let room = house.rooms[burrow.at]

		// The footer first: its height is the line's.
		let label = present ? (room?.label[language] ?? "").uppercased() : ""
		let call = language == "es" ? "Subí" : "Come up"
		let buttonSize = present ? (call as NSString).size(withAttributes: [.font: Self.buttonFont]) : .zero
		let buttonWidth = present ? buttonSize.width + 18 : 0
		let lineWidth = Self.stageWidth - 6 - (present ? buttonWidth + 10 : 0)
		let lineHeight = ceil((burrow.line as NSString).boundingRect(
			with: CGSize(width: lineWidth, height: 200), options: [.usesLineFragmentOrigin],
			attributes: [.font: Self.lineFont]
		).height * 1.2)
		let labelHeight: CGFloat = present ? 15 : 0
		let foot = 7 + labelHeight + lineHeight + 9
		let size = CGSize(width: Self.width, height: Self.pad + stageHeight + foot)

		setFrame(NSRect(x: from.x, y: from.y + 8, width: size.width, height: size.height), display: false)
		guard let root = contentView?.layer else { return }
		root.sublayers = nil

		let card = CALayer()
		card.frame = CGRect(origin: .zero, size: size)
		card.backgroundColor = Painter.color("#241a14")
		card.borderColor = Painter.color("#4d3820")
		card.borderWidth = 1
		card.cornerRadius = 5
		card.masksToBounds = true
		root.addSublayer(card)

		// The stage: earth, the bays (his lit), the shaft, what he knows you
		// well enough to have, and what you posted down to him.
		let box = CGSize(width: house.viewBox[2], height: house.viewBox[3])
		let painter = Painter(defs: house.defs, size: box)
		let stage = CALayer()
		stage.anchorPoint = .zero
		stage.bounds = CGRect(origin: .zero, size: box)
		stage.position = CGPoint(x: Self.pad, y: foot)
		let scale = Self.stageWidth / box.width
		stage.setAffineTransform(CGAffineTransform(scaleX: scale, y: scale))
		stage.masksToBounds = true
		let tier = house.tiers.firstIndex(of: burrow.familiarity) ?? 0
		var nodes = [house.earth]
		for kind in house.rooms.keys.sorted() {
			if let r = house.rooms[kind] { nodes.append(present && kind == burrow.at ? r.lit : r.normal) }
		}
		nodes.append(house.shaft)
		for kind in house.rooms.keys.sorted() {
			for item in house.rooms[kind]?.items ?? [] where (house.tiers.firstIndex(of: item.since) ?? 0) <= tier {
				nodes.append(item.node)
			}
		}
		stage.sublayers = painter.layers(nodes)
		if let rug = house.rooms["rug"] { rail(burrow.left, art: art, x: rug.x + 10, y: rug.floor - 30, box: box, on: stage) }
		ambient(in: stage)

		// Him, at his spot in the bay: 10% of the stage, on the floor (the bottom
		// 9 units of his 96 are empty below his feet), doing what the bay is for.
		him = .zero
		if present, let room {
			let doing = house.activity[burrow.at]
			let mood = burrow.settled ? (doing?.mood ?? "idle") : "watching"
			let c = frame.colours
			let p = frame.parts
			// Scaled on the holder, breathing on the drawing: the bob animates
			// `transform` and would otherwise replace the scale.
			let holder = CALayer()
			holder.anchorPoint = .zero
			holder.bounds = CGRect(x: 0, y: 0, width: Painter.size, height: Painter.size)
			let w = box.width * 0.1
			holder.position = CGPoint(x: room.x + room.stand - w / 2, y: box.height - room.floor - w * 0.094)
			holder.setAffineTransform(CGAffineTransform(scaleX: w / Painter.size, y: w / Painter.size))
			let drawn = CALayer()
			drawn.frame = holder.bounds
			holder.addSublayer(drawn)
			drawn.sublayers = Pet.layers(
				art: art, mood: mood, parts: ["shell": p.shell, "hands": p.hands, "feet": p.feet, "antenna": p.antenna],
				colours: ["{face}": c.face, "{screen}": c.screen, "{led}": c.led], worn: frame.worn.map(\.kind)
			)
			// Breathing, unless asleep — then nothing moves, as on the strip.
			if mood != "sleep", let bob = CSSMotion.animation(art.motion.base.bob, motion: art.motion, rate: Motion.idleRate) {
				drawn.add(bob, forKey: "breathe")
			}
			stage.addSublayer(holder)
			let at = CGRect(x: holder.position.x, y: holder.position.y, width: w, height: w)
			him = CGRect(x: Self.pad + at.minX * scale, y: foot + at.minY * scale, width: w * scale, height: w * scale).insetBy(dx: -6, dy: -6)
		}
		card.addSublayer(stage)

		// The footer: where he is above what he says about it, and the button.
		let scaleFactor = NSScreen.main?.backingScaleFactor ?? 2
		func text(_ string: String, font: NSFont, colour: String, frame: CGRect, wraps: Bool = false) {
			let t = CATextLayer()
			t.string = NSAttributedString(string: string, attributes: [.font: font, .foregroundColor: Painter.nsColor(colour), .kern: font == Self.labelFont ? 0.8 : 0])
			t.isWrapped = wraps
			t.contentsScale = scaleFactor
			t.frame = frame
			card.addSublayer(t)
		}
		let lineY: CGFloat = 9
		text(burrow.line, font: Self.lineFont, colour: "#c8d0e0", frame: CGRect(x: Self.pad + 3, y: lineY, width: lineWidth, height: lineHeight), wraps: true)
		if present {
			text(label, font: Self.labelFont, colour: "#6b7489", frame: CGRect(x: Self.pad + 3, y: lineY + lineHeight, width: lineWidth, height: labelHeight))
			let pill = CGRect(x: size.width - Self.pad - 3 - buttonWidth, y: (foot - 20) / 2, width: buttonWidth, height: 20)
			let back = CALayer()
			back.frame = pill
			back.backgroundColor = Painter.color("#bb9af7")
			back.cornerRadius = 10
			card.addSublayer(back)
			text(call, font: Self.buttonFont, colour: "#1a1c23", frame: CGRect(x: pill.minX, y: pill.minY + (20 - buttonSize.height) / 2, width: pill.width, height: buttonSize.height))
			(card.sublayers?.last as? CATextLayer)?.alignmentMode = .center
			button = pill
		} else {
			button = .zero
		}

		// Out of the portal, not over it: the corner nearest it stays
		// put (`tico-map-open`).
		card.anchorPoint = CGPoint(x: 0.12, y: 0)
		card.position = CGPoint(x: size.width * 0.12, y: 0)
		let open = CAAnimationGroup()
		let grow = CABasicAnimation(keyPath: "transform")
		grow.fromValue = CATransform3DConcat(CATransform3DMakeScale(0.15, 0.15, 1), CATransform3DMakeTranslation(0, -14, 0))
		grow.toValue = CATransform3DIdentity
		let fade = CABasicAnimation(keyPath: "opacity")
		fade.fromValue = 0
		fade.toValue = 1
		open.animations = [grow, fade]
		open.duration = 0.26
		open.timingFunction = CAMediaTimingFunction(controlPoints: 0.34, 1.3, 0.64, 1)
		open.preferredFrameRateRange = Motion.liveRate
		if rising { card.add(open, forKey: "open") }
		orderFrontRegardless()
	}

	func hide() {
		contentView?.layer?.sublayers = nil
		orderOut(nil)
	}

	/// The rail on the long bay's wall, with yours hung from it.
	private func rail(_ left: [String], art: Art, x: Double, y: Double, box: CGSize, on stage: CALayer) {
		guard !left.isEmpty else { return }
		let painter = Painter(art: art, colours: Pet.content)
		let flip = box.height
		let bar = CAShapeLayer()
		bar.path = CGPath(roundedRect: CGRect(x: x - 2, y: flip - y, width: Double(left.count) * 12 + 4, height: 1.4), cornerWidth: 0.7, cornerHeight: 0.7, transform: nil)
		bar.fillColor = Painter.color("#808aa0")
		stage.addSublayer(bar)
		for (i, kind) in left.enumerated() {
			guard let node = art.props[kind], let drawn = painter.layer(node, inherited: painter.root) else { continue }
			let hx = x + Double(i) * 12 + 4
			let hook = CAShapeLayer()
			hook.path = CGPath(rect: CGRect(x: hx - 0.5, y: flip - y - 2.6, width: 1, height: 2.6), transform: nil)
			hook.fillColor = Painter.color("#808aa0")
			stage.addSublayer(hook)
			// The prop's own 40×40 neighbourhood in his drawing, shrunk to 11.
			let hang = art.house.hangs[art.house.wears[kind] ?? "head"] ?? 24
			let holder = CALayer()
			holder.anchorPoint = .zero
			holder.bounds = CGRect(x: 0, y: 0, width: Painter.size, height: Painter.size)
			let s = 11.0 / 40
			// viewBox (28, hang-20, 40, 40) placed at (hx-5.5, y+2), y-up.
			holder.position = CGPoint(x: hx - 5.5 - 28 * s, y: flip - (y + 2) - (Painter.size - (hang - 20)) * s)
			holder.setAffineTransform(CGAffineTransform(scaleX: s, y: s))
			holder.addSublayer(drawn)
			stage.addSublayer(holder)
		}
	}

	/// What moves while it is open: the fan turns, the plant stirs, the beacon
	/// and the tube breathe. Turned about their own boxes (`transform-box:
	/// fill-box`), so each spins on its hub rather than the stage's corner.
	private func ambient(in stage: CALayer) {
		func pivot(_ layer: CALayer, _ anchor: CGPoint) {
			let box = (layer.sublayers ?? []).compactMap { ($0 as? CAShapeLayer)?.path?.boundingBoxOfPath }.reduce(CGRect.null) { $0.union($1) }
			guard !box.isNull else { return }
			let point = CGPoint(x: box.minX + box.width * anchor.x, y: box.minY + box.height * anchor.y)
			layer.anchorPoint = CGPoint(x: point.x / layer.bounds.width, y: point.y / layer.bounds.height)
			layer.position = point
		}
		func run(_ layer: CALayer, _ key: String, from: Any, to: Any, duration: Double, reverses: Bool) {
			let a = CABasicAnimation(keyPath: key)
			a.fromValue = from
			a.toValue = to
			a.duration = duration
			a.autoreverses = reverses
			a.repeatCount = .infinity
			a.timingFunction = CAMediaTimingFunction(name: reverses ? .easeInEaseOut : .linear)
			a.preferredFrameRateRange = Motion.idleRate
			layer.add(a, forKey: key)
		}
		for fan in Motion.find("fan-blade", in: stage) {
			pivot(fan, CGPoint(x: 0.5, y: 0.5))
			// Clockwise on screen is negative in a y-up layer.
			run(fan, "transform.rotation.z", from: 0, to: -Double.pi * 2, duration: 1.6, reverses: false)
		}
		for leaf in Motion.find("leaf", in: stage) {
			pivot(leaf, CGPoint(x: 0.5, y: 0))
			run(leaf, "transform.rotation.z", from: 0.07, to: -0.07, duration: 3.2, reverses: true)
		}
		for glow in Motion.find("glow", in: stage) + Motion.find("tube-glow", in: stage) {
			run(glow, "opacity", from: glow.opacity, to: glow.opacity * 0.62, duration: 2.8, reverses: true)
		}
	}
}

private final class ClickView: NSView {
	var onDown: ((CGPoint) -> Void)?
	override func acceptsFirstMouse(for event: NSEvent?) -> Bool { true }
	override func mouseDown(with event: NSEvent) { onDown?(event.locationInWindow) }
}
