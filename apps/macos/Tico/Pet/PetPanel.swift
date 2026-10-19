import AppKit
import QuartzCore

/// The strip he lives on: a transparent window the width of the screen along
/// its bottom edge, borderless, above the Dock, on every Space, never active.
///
/// The width is so that walking is a layer animation — run by the render
/// server, free for tico — rather than a window moved frame by frame from this
/// process. The Tauri build measured that the strip's size costs nothing to
/// composite; the transparent part is blended as nothing.
///
/// Inside, the layers nest the way the DOM does, because each CSS rule targets
/// one of them: `body` breathes (`.companion-body`), `anim` plays effects and
/// holds postures (`.companion-anim`, turning about 50% 90%), `svg` bounces
/// while he sings (`.companion-svg`), and `host` scales the 96-unit drawing.
final class PetPanel: NSPanel {
	/// `--pet-width` in companion.css: the 96-unit drawing shown 92 points wide.
	static let petWidth: CGFloat = 92
	/// Below his floor the strip hangs 90pt off the bottom of the screen, for
	/// `spin`, which turns him about a point by his feet. Above, it reaches the
	/// menu bar: you can pick him up and carry him anywhere, as in Tauri.
	private static let below: CGFloat = 90

	/// Gestures on him, in strip points (y up from his floor).
	var onPress: ((CGPoint) -> Void)?
	var onDrag: ((CGPoint) -> Void)?
	var onRelease: (() -> Void)?
	private var pressed = false

	/// Travels: what moves along the strip, carrying him and what he says.
	private let walker = CALayer()
	private let bubble = Bubble()
	private let body = CALayer()
	private let anim = CALayer()
	private let svg = CALayer()
	private let host = CALayer()
	private var blinker: Blinker?

	private var art: Art?
	private var drawn: String?
	private var breathing: String?
	private var posture: String?
	private var effectSerial: UInt32 = 0
	private var moveSerial: UInt32?
	private var walking = false
	private var flying = false

	init(screen: NSScreen) {
		let size = NSSize(width: screen.frame.width, height: screen.frame.height)
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
		// Click-through everywhere but on him; `hitTest(cursor:)` flips it.
		ignoresMouseEvents = true

		let view = StripView(frame: NSRect(origin: .zero, size: size))
		view.onDown = { [weak self] p in
			guard let self else { return }
			self.pressed = true
			self.onPress?(CGPoint(x: p.x, y: p.y - Self.below))
		}
		view.onDrag = { [weak self] p in self?.onDrag?(CGPoint(x: p.x, y: p.y - Self.below)) }
		view.onUp = { [weak self] in
			self?.pressed = false
			self?.onRelease?()
		}
		view.wantsLayer = true
		contentView = view

		let box = CGRect(x: 0, y: Self.below, width: Self.petWidth, height: Self.petWidth)
		walker.frame = box
		body.frame = CGRect(origin: .zero, size: box.size)
		anim.frame = CGRect(origin: .zero, size: box.size)
		// `transform-origin: 50% 90%`, measured from the top.
		anim.anchorPoint = CGPoint(x: 0.5, y: 0.1)
		anim.position = CGPoint(x: box.width / 2, y: box.height * 0.1)
		svg.frame = anim.bounds
		host.anchorPoint = .zero
		host.bounds = CGRect(x: 0, y: 0, width: Painter.size, height: Painter.size)
		host.position = .zero
		host.setAffineTransform(CGAffineTransform(scaleX: Self.petWidth / Painter.size, y: Self.petWidth / Painter.size))
		svg.addSublayer(host)
		anim.addSublayer(svg)
		body.addSublayer(anim)
		walker.addSublayer(body)
		walker.addSublayer(bubble.layer)
		view.layer?.addSublayer(walker)
	}

	override var canBecomeKey: Bool { false }
	override var canBecomeMain: Bool { false }

	/// Lays the strip along the bottom edge of the screen, the way the Tauri
	/// build does: he stands over the Dock rather than above it.
	func place(on screen: NSScreen) {
		let shadowBelowFeet = (Painter.size - 90 - 4.5) * Self.petWidth / Painter.size
		let bottom = screen.frame.minY - Self.below + shadowBelowFeet
		// Up to the menu bar and no further: over it, he would swallow its clicks.
		let top = screen.visibleFrame.maxY
		setFrame(NSRect(x: screen.frame.minX, y: bottom, width: screen.frame.width, height: top - bottom), display: false)
	}

	/// How high above his floor the strip reaches.
	var reach: CGFloat { frame.height - Self.below }

	/// A screen point in strip points, y up from his floor.
	func strip(_ point: NSPoint) -> CGPoint {
		CGPoint(x: point.x - frame.minX, y: point.y - frame.minY - Self.below)
	}

	/// Where he visibly is right now, mid-walk included: (x, lift).
	var standing: CGPoint {
		let p = walker.presentation()?.position ?? walker.position
		return CGPoint(x: p.x - Self.petWidth / 2, y: p.y - Self.below - Self.petWidth / 2)
	}

	/// The strip takes the mouse only where he is, so the desktop under the
	/// rest of it stays usable — `cursor.rs` in the Tauri build. Held for the
	/// whole of a press, or a fast drag would outrun it and drop him.
	func hitTest(cursor: NSPoint) {
		guard !pressed else { return }
		let box = (walker.presentation() ?? walker).frame.offsetBy(dx: frame.minX, dy: frame.minY)
		let over = box.contains(cursor)
		if ignoresMouseEvents == over { ignoresMouseEvents = !over }
	}

	/// Draws what the core decided. Called on every tick; each part only does
	/// work when its own piece of the frame changed, so a quiet tick is free.
	func apply(_ frame: Frame, art: Art, parts: [String: String] = Pet.defaultParts) {
		self.art = art
		let motion = art.motion
		let mood = "\(frame.mood)"
		let feeling = "\(frame.feeling)"
		let asleep = frame.mood == .sleep
		let c = frame.colours
		let colours = ["{face}": c.face, "{screen}": c.screen, "{led}": c.led]

		// Travel: a new serial is a new move, eased over the walk's duration;
		// 0ms is a jump (the far side of a crossing).
		if frame.moveSerial != moveSerial {
			let first = moveSerial == nil
			moveSerial = frame.moveSerial
			let to = CGPoint(x: frame.x + Self.petWidth / 2, y: Self.below + frame.lift + Self.petWidth / 2)
			let from = walker.presentation()?.position ?? walker.position
			CATransaction.begin()
			CATransaction.setDisableActions(true)
			walker.position = to
			CATransaction.commit()
			if frame.moveMs > 0, !first {
				let a = CABasicAnimation(keyPath: "position")
				a.fromValue = NSValue(point: from)
				a.toValue = NSValue(point: to)
				a.duration = Double(frame.moveMs) / 1000
				a.timingFunction = CSSMotion.timing(motion.base.travel)
				a.preferredFrameRateRange = Motion.liveRate
				walker.add(a, forKey: "travel")
			}
		}

		// What he is saying, on whichever side of him keeps it on screen.
		bubble.show(frame.speech, width: Self.petWidth, onLeft: frame.x + Self.petWidth / 2 < self.frame.width / 2)

		// The drawing: rebuilt when the face, the colours or the singing change.
		// Landing, or stopping a walk while singing, redraws to restore what
		// flying recoloured and walking took over.
		if (flying && !frame.flying) || (walking && !frame.walking && frame.singing) { drawn = nil }
		let key = "\(mood)|\(frame.singing)|\(c.face)\(c.screen)\(c.led)|\(parts)"
		if key != drawn {
			drawn = key
			draw(art: art, mood: mood, parts: parts, colours: colours, singing: frame.singing, asleep: asleep)
			posture = nil
		}

		// Breathing: the bob, at the feeling's pace; sitting breathes instead;
		// singing sways; asleep, nothing moves at all.
		let breath = asleep ? "" : frame.flying ? "fly" : frame.singing ? "sing" : "\(feeling)|\(frame.sitting)"
		if breath != breathing {
			breathing = breath
			body.removeAnimation(forKey: "breathe")
			if !asleep {
				let sway = motion.singing.first { $0.target == "companion-body" }
				let pace = motion.pace[feeling]
				let thrust = motion.flying.first { $0.target == "companion-body" }?.spec
				let animation = frame.flying
					? thrust.flatMap { CSSMotion.animation($0, motion: motion, rate: Motion.liveRate) }
					: frame.singing
					? sway.flatMap { CSSMotion.animation($0, motion: motion, rate: Motion.liveRate) }
					: CSSMotion.animation(
						motion.base.bob, motion: motion, rate: Motion.idleRate,
						name: frame.sitting ? motion.sit.breathe : pace?.name, duration: pace?.duration
					)
				if let animation { body.add(animation, forKey: "breathe") }
			}
		}

		// Posture: the feeling's, else sitting's, eased in over the CSS transition.
		// (In companion.css the feeling's rule comes later and wins over sitting.)
		let stance = "\(feeling)|\(frame.sitting)|\(frame.flying)|\(frame.facingRight)"
		if stance != posture {
			posture = stance
			let lean = motion.flying.last { $0.target == "companion-anim" && ($0.facing == nil || frame.facingRight) }
			if frame.flying, let lean, let tilt = lean.transform {
				ease(anim, to: CSSMotion.transform(tilt), over: 0.25, timing: "ease")
			} else if let p = motion.postures[feeling] {
				ease(anim, to: CSSMotion.transform(p.transform), over: p.duration, timing: p.timing)
			} else if frame.sitting {
				ease(anim, to: CSSMotion.transform(motion.sit.transform), over: motion.sit.duration, timing: motion.sit.timing)
			} else {
				ease(anim, to: CATransform3DIdentity, over: 0.6, timing: "ease")
			}
			let feet = frame.sitting ? CSSMotion.transform(motion.sit.feet) : CATransform3DIdentity
			for foot in Motion.find("companion-foot", in: host) {
				ease(foot, to: CATransform3DConcat(feet, limb(foot, mood: mood)), over: motion.sit.duration, timing: motion.sit.timing)
			}
		}

		// Feet: stepping while he walks (which owns them over singing's tap),
		// lit and flickering while he flies.
		if frame.walking != walking {
			walking = frame.walking
			for foot in Motion.find("companion-foot", in: host) {
				foot.removeAnimation(forKey: "walk")
				if walking { foot.removeAnimation(forKey: "sing") }
			}
			if walking {
				for spec in motion.walking {
					guard let a = CSSMotion.animation(spec, motion: motion, rate: Motion.liveRate) else { continue }
					for foot in Motion.find("companion-foot", in: host)
					where spec.side.map({ (foot.name ?? "").contains("side-\($0)") }) ?? !(foot.name ?? "").contains("side-right") {
						foot.add(a, forKey: "walk")
					}
				}
			}
		}
		if frame.flying != flying {
			flying = frame.flying
			if flying, let flame = motion.flying.first(where: { $0.target == "companion-foot" }) {
				for foot in Motion.find("companion-foot", in: host) {
					recolour(foot, fill: flame.fill, stroke: flame.stroke)
					if let a = flame.spec.flatMap({ CSSMotion.animation($0, motion: motion, rate: Motion.liveRate) }) {
						foot.add(a, forKey: "flame")
					}
				}
			}
		}

		// An effect, once per serial.
		if let effect = frame.effect, effect.serial != effectSerial {
			effectSerial = effect.serial
			if let spec = motion.effects[effect.name] {
				if let animation = CSSMotion.animation(spec, motion: motion, rate: Motion.liveRate, base: anim.transform) {
					anim.add(animation, forKey: "effect")
				}
				for also in spec.also ?? [] {
					for layer in Motion.find(also.target ?? "", in: host) {
						if let a = CSSMotion.animation(also, motion: motion, rate: Motion.liveRate) { layer.add(a, forKey: "effect") }
					}
				}
			}
		}

		// Where he looks: `translate(x * 3px, y * 2.4px)` on the eyes, 0.12s.
		let look = frame.look ?? Look(x: 0, y: 0)
		let reach = motion.base.look.first?.args ?? [3, 2.4]
		let target = CATransform3DMakeTranslation(CGFloat(look.x * reach[0]), CGFloat(-look.y * (reach.count > 1 ? reach[1] : reach[0])), 0)
		for eyes in Motion.find("companion-eyes", in: host) where !CATransform3DEqualToTransform(eyes.transform, target) {
			ease(eyes, to: target, over: 0.12, timing: "ease-out")
		}
	}

	private func draw(art: Art, mood: String, parts: [String: String], colours: [String: String], singing: Bool, asleep: Bool) {
		let motion = art.motion
		blinker?.stop()
		blinker = nil
		svg.removeAllAnimations()
		host.sublayers = Pet.layers(art: art, mood: mood, parts: parts, colours: colours, singing: singing)

		// Pivots. Limbs and notes have none in the CSS, which for an SVG element
		// means the drawing's own top-left corner; the singing mouth turns about
		// its centre (`transform-box: fill-box`).
		for name in ["companion-hand", "companion-foot", "companion-notes"] {
			for layer in Motion.find(name, in: host) { CSSMotion.anchor(layer, at: CGPoint(x: 0, y: Painter.size)) }
		}
		for mouth in Motion.find("companion-sing", in: host) {
			let box = CSSMotion.box(mouth)
			if !box.isNull { CSSMotion.anchor(mouth, at: CGPoint(x: box.midX, y: box.midY)) }
		}

		// Hands and feet that a mood moves: up when happy, over the ears muted.
		for name in ["companion-hand", "companion-foot"] {
			for layer in Motion.find(name, in: host) { layer.transform = limb(layer, mood: mood) }
		}

		if asleep { return }
		for led in Motion.find("companion-led", in: host) {
			if let a = CSSMotion.animation(motion.base.pulse, motion: motion, rate: Motion.idleRate) { led.add(a, forKey: "pulse") }
		}
		if singing {
			for spec in motion.singing where spec.target != "companion-body" {
				guard let a = CSSMotion.animation(spec, motion: motion, rate: Motion.liveRate) else { continue }
				if spec.target == "companion-svg" {
					svg.add(a, forKey: "sing")
					continue
				}
				var layers = Motion.find(spec.target ?? "", in: host)
				if let side = spec.side {
					layers = layers.filter { ($0.name ?? "").contains("side-\(side)") }
				} else if spec.target == "companion-hand" || spec.target == "companion-foot" {
					// The rule without a side matches both in CSS, and the right-hand
					// rule then overrides it with a delay.
					layers = layers.filter { !($0.name ?? "").contains("side-right") }
				}
				if let child = spec.child {
					layers = layers.compactMap { ($0.sublayers ?? []).indices.contains(child) ? $0.sublayers?[child] : nil }
				}
				for layer in layers { layer.add(a, forKey: "sing") }
			}
		}

		// Only moods whose eyes are open have a blink drawing.
		if art.faces[mood]?.blink != nil,
			let open = Motion.find("companion-eyes", in: host).first,
			let closed = Pet.layers(art: art, mood: mood, parts: parts, colours: colours, singing: singing, blink: true)
				.lazy.compactMap({ Motion.find("companion-eyes", in: $0).first }).first
		{
			blinker = Blinker(open: open, closed: closed)
		}
	}

	/// Flying paints his feet as flames: flat colours over the limb gradient.
	private func recolour(_ layer: CALayer, fill: String?, stroke: String?) {
		if let shape = layer as? CAShapeLayer {
			if let fill { shape.fillColor = Painter.color(fill) }
			if let stroke, shape.strokeColor != nil { shape.strokeColor = Painter.color(stroke) }
		}
		if layer is CAGradientLayer { layer.isHidden = true }
		layer.sublayers?.forEach { recolour($0, fill: fill, stroke: stroke) }
	}

	/// The mood's pose for this hand or foot, or none.
	private func limb(_ layer: CALayer, mood: String) -> CATransform3D {
		guard let motion = art?.motion else { return CATransform3DIdentity }
		let name = layer.name ?? ""
		let rule = motion.limbs.first { limb in
			limb.mood == mood && name.contains(limb.target) && (limb.side.map { name.contains("side-\($0)") } ?? true)
		}
		return rule.map { CSSMotion.transform($0.transform) } ?? CATransform3DIdentity
	}

	/// A CSS `transition: transform`: from wherever it is now to `to`.
	private func ease(_ layer: CALayer, to target: CATransform3D, over seconds: Double, timing: String) {
		let from = layer.presentation()?.transform ?? layer.transform
		layer.transform = target
		let a = CABasicAnimation(keyPath: "transform")
		a.fromValue = NSValue(caTransform3D: from)
		a.toValue = NSValue(caTransform3D: target)
		a.duration = seconds
		a.timingFunction = CSSMotion.timing(timing)
		a.preferredFrameRateRange = Motion.liveRate
		layer.add(a, forKey: "transition")
	}
}

/// One whole pet, back to front: the mood's drawing with the four body slots
/// filled in.
@MainActor
enum Pet {
	nonisolated static let defaultParts = ["shell": "terminal", "hands": "mitts", "feet": "pills", "antenna": "led"]
	/// `PALETTE.content` in companion.ts, for the sheet.
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

/// The strip's content: forwards a press, its drag and its release.
final class StripView: NSView {
	var onDown: ((CGPoint) -> Void)?
	var onDrag: ((CGPoint) -> Void)?
	var onUp: (() -> Void)?

	// The panel is never key, so without this the first click would only
	// bring it forward.
	override func acceptsFirstMouse(for event: NSEvent?) -> Bool { true }
	override func mouseDown(with event: NSEvent) { onDown?(event.locationInWindow) }
	override func mouseDragged(with event: NSEvent) { onDrag?(event.locationInWindow) }
	override func mouseUp(with event: NSEvent) { onUp?() }
}
