import AppKit
import QuartzCore

/// The window he lives in: just big enough for him and whatever he is wearing,
/// borderless, transparent, above the Dock, on every Space, and never active.
///
/// The Tauri build is a transparent window the width of the screen, because a
/// WebView cannot move cheaply; here the window *is* the pet's position, and
/// walking will move it.
///
/// Inside, the layers nest the way the DOM does, because each CSS rule targets
/// one of them: `body` breathes (`.companion-body`), `anim` plays effects and
/// holds postures (`.companion-anim`, turning about 50% 90%), `svg` bounces
/// while he sings (`.companion-svg`), and `host` scales the 96-unit drawing.
final class PetPanel: NSPanel {
	/// `--pet-width` in companion.css: the 96-unit drawing shown 92 points wide.
	static let petWidth: CGFloat = 92
	/// Room around the drawing for everything that leaves it: props reach ~30
	/// units above the head, a hop rises 18px, and `spin` turns the whole body
	/// about a point by his feet, sweeping a circle ~85pt across. The Tauri
	/// build never needed this — its window is the screen. The margin is
	/// transparent, which costs nothing to composite, and below the floor it
	/// simply hangs off the bottom of the screen.
	private static let margin = NSEdgeInsets(top: 90, left: 90, bottom: 90, right: 90)

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

	init() {
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

		let box = CGRect(x: Self.margin.left, y: Self.margin.bottom, width: Self.petWidth, height: Self.petWidth)
		body.frame = box
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
		view.layer?.addSublayer(body)
	}

	override var canBecomeKey: Bool { false }
	override var canBecomeMain: Bool { false }

	/// Stands him on the bottom edge of the screen, the way the Tauri build does:
	/// over the Dock rather than above it.
	func stand(atX x: CGFloat, on screen: NSScreen) {
		let shadowBelowFeet = (Painter.size - 90 - 4.5) * Self.petWidth / Painter.size
		setFrameOrigin(NSPoint(x: screen.frame.minX + x, y: screen.frame.minY - Self.margin.bottom + shadowBelowFeet))
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

		// The drawing: rebuilt when the face, the colours or the singing change.
		let key = "\(mood)|\(frame.singing)|\(c.face)\(c.screen)\(c.led)|\(parts)"
		if key != drawn {
			drawn = key
			draw(art: art, mood: mood, parts: parts, colours: colours, singing: frame.singing, asleep: asleep)
			posture = nil
		}

		// Breathing: the bob, at the feeling's pace; sitting breathes instead;
		// singing sways; asleep, nothing moves at all.
		let breath = asleep ? "" : frame.singing ? "sing" : "\(feeling)|\(frame.sitting)"
		if breath != breathing {
			breathing = breath
			body.removeAnimation(forKey: "breathe")
			if !asleep {
				let sway = motion.singing.first { $0.target == "companion-body" }
				let pace = motion.pace[feeling]
				let animation = frame.singing
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
		let stance = "\(feeling)|\(frame.sitting)"
		if stance != posture {
			posture = stance
			if let p = motion.postures[feeling] {
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
