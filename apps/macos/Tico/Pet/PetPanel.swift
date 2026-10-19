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
	/// `--pet-width` in companion.css: the 96-unit drawing shown 92 points wide,
	/// or 66 or 124 by the size setting (`Frame.width`).
	private(set) var petWidth: CGFloat = 92
	private var home: NSScreen?
	/// Below his floor the strip hangs 90pt off the bottom of the screen, for
	/// `spin`, which turns him about a point by his feet. Above, it reaches the
	/// menu bar: you can pick him up and carry him anywhere, as in Tauri.
	private static let below: CGFloat = 90

	/// Gestures on him, in strip points (y up from his floor).
	var onPress: ((CGPoint) -> Void)?
	var onDrag: ((CGPoint) -> Void)?
	var onRelease: (() -> Void)?
	/// The reminder whose button was pressed.
	var onDone: ((String) -> Void)?
	/// The portal was clicked.
	var onPortal: (() -> Void)?
	private var pressed = false

	/// The way home, behind him in the corner, while there is one: as big as
	/// he is, so rebuilt with him.
	private var portal = PortalLayer(width: 92 * 0.8)
	private var indoors = false

	/// The ladder, behind him: on the near side of the rungs, not in the ladder.
	private let ladder = CALayer()
	private var ladderShown: Ladder?
	private var climbing = false
	private var hanging = false
	/// Travels: what moves along the strip, carrying him and what he says.
	private let walker = CALayer()
	private let bubble = Bubble()
	private let body = CALayer()
	/// The fall's flame behind him, the glow around him, the ring where he lands.
	private let trail = CAGradientLayer()
	private let glow = CAGradientLayer()
	private let impact = CAShapeLayer()
	private var burning = false
	private let anim = CALayer()
	private let svg = CALayer()
	private let host = CALayer()
	private var blinker: Blinker?

	private var art: Art?
	private var drawn: String?
	private var breathing: String?
	private var posture: String?
	private var effectSerial: UInt32 = 0
	private var waveSerial: UInt32?
	private var moveSerial: UInt32?
	private var walking = false
	private var flying = false
	private var worn: [String] = []
	private var leaving: Set<String> = []

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
			// The reminder's button takes the click; anywhere else is him.
			if let button = self.buttonOnScreen, let id = self.bubble.reminder,
				button.contains(NSPoint(x: p.x + self.frame.minX, y: p.y + self.frame.minY))
			{
				self.onDone?(id)
				return
			}
			// The portal, where he is not standing in front of it.
			if self.portal.shown, self.portal.opening.contains(p),
				self.indoors || !(self.walker.presentation() ?? self.walker).frame.contains(p)
			{
				self.onPortal?()
				return
			}
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

		walker.frame = CGRect(x: 0, y: Self.below, width: petWidth, height: petWidth)
		host.anchorPoint = .zero
		host.bounds = CGRect(x: 0, y: 0, width: Painter.size, height: Painter.size)
		host.position = .zero
		lay(width: petWidth)
		svg.addSublayer(host)
		anim.addSublayer(svg)
		body.addSublayer(glow)
		body.addSublayer(trail)
		body.addSublayer(anim)
		walker.addSublayer(impact)
		setUpHeat()
		walker.addSublayer(body)
		walker.addSublayer(bubble.layer)
		view.layer?.addSublayer(portal.layer)
		view.layer?.addSublayer(ladder)
		view.layer?.addSublayer(walker)
	}

	override var canBecomeKey: Bool { false }
	override var canBecomeMain: Bool { false }

	/// Both hands, 1.4s, turning about the drawing's bottom middle
	/// (`transform-origin: 50% 100%`): the hands' layers pivot on the drawing's
	/// top-left corner, so each frame is moved to that point and back.
	private func wave(_ motion: ArtMotion) {
		let spec = ArtMotion.Spec(
			name: "companion-wave", duration: 1.4, timing: "ease-in-out", delay: 0, iterations: 1,
			alternate: false, target: nil, side: nil, child: nil, also: nil
		)
		guard let group = CSSMotion.animation(spec, motion: motion, rate: Motion.liveRate) as? CAAnimationGroup else { return }
		let (to, back) = (CATransform3DMakeTranslation(-Painter.size / 2, Painter.size, 0), CATransform3DMakeTranslation(Painter.size / 2, -Painter.size, 0))
		for case let part as CAKeyframeAnimation in group.animations ?? [] where part.keyPath == "transform" {
			part.values = part.values?.compactMap { ($0 as? NSValue)?.caTransform3DValue }
				.map { NSValue(caTransform3D: CATransform3DConcat(CATransform3DConcat(to, $0), back)) }
		}
		for hand in Motion.find("companion-hand", in: host) { hand.add(group, forKey: "wave") }
	}

	/// The portal's top-left corner on screen, where the cutaway rises from.
	var portalOnScreen: CGPoint {
		CGPoint(x: frame.minX + portal.opening.minX, y: frame.minY + portal.opening.maxY)
	}

	/// Sizes everything inside him for a pet `width` points wide.
	private func lay(width: CGFloat) {
		CATransaction.begin()
		CATransaction.setDisableActions(true)
		let p = walker.position
		walker.bounds = CGRect(x: 0, y: 0, width: width, height: width)
		walker.position = p
		body.frame = walker.bounds
		anim.bounds = walker.bounds
		// `transform-origin: 50% 90%`, measured from the top.
		anim.anchorPoint = CGPoint(x: 0.5, y: 0.1)
		anim.position = CGPoint(x: width / 2, y: width * 0.1)
		svg.frame = anim.bounds
		host.setAffineTransform(CGAffineTransform(scaleX: width / Painter.size, y: width / Painter.size))
		CATransaction.commit()
	}

	/// Lays the strip along the bottom edge of the screen, the way the Tauri
	/// build does: he stands over the Dock rather than above it.
	func place(on screen: NSScreen) {
		home = screen
		let shadowBelowFeet = (Painter.size - 90 - 4.5) * petWidth / Painter.size
		let bottom = screen.frame.minY - Self.below + shadowBelowFeet
		// Up to the menu bar and no further: over it, he would swallow its clicks.
		let top = screen.visibleFrame.maxY
		setFrame(NSRect(x: screen.frame.minX, y: bottom, width: screen.frame.width, height: top - bottom), display: false)
	}

	/// How high above his floor the strip reaches.
	var reach: CGFloat { frame.height - Self.below }

	/// His floor, as a screen y.
	var floorY: CGFloat { frame.minY + Self.below }

	/// A screen point in strip points, y up from his floor.
	func strip(_ point: NSPoint) -> CGPoint {
		CGPoint(x: point.x - frame.minX, y: point.y - frame.minY - Self.below)
	}

	/// Where he visibly is right now, mid-walk included: (x, lift).
	var standing: CGPoint {
		let p = walker.presentation()?.position ?? walker.position
		return CGPoint(x: p.x - petWidth / 2, y: p.y - Self.below - petWidth / 2)
	}

	/// The strip takes the mouse only where he is, so the desktop under the
	/// rest of it stays usable — `cursor.rs` in the Tauri build. Held for the
	/// whole of a press, or a fast drag would outrun it and drop him.
	/// Fades the bubble while you type or reach for it (within 24pt, `VEIL_WITHIN`).
	func veil(cursor: NSPoint, typing: Bool) {
		var near = false
		if let box = bubble.frame {
			let walkerFrame = (walker.presentation() ?? walker).frame
			let onScreen = box.offsetBy(dx: walkerFrame.minX + frame.minX, dy: walkerFrame.minY + frame.minY)
			near = onScreen.insetBy(dx: -24, dy: -24).contains(cursor)
		}
		bubble.veil(typing || near)
	}

	/// The reminder button in screen coordinates, when there is one to press.
	private var buttonOnScreen: CGRect? {
		guard let button = bubble.buttonFrame else { return nil }
		let w = (walker.presentation() ?? walker).frame
		return button.offsetBy(dx: w.minX + frame.minX, dy: w.minY + frame.minY)
	}

	/// Whether the pointer is within `distance` of him, the portal or the bubble.
	func near(cursor: NSPoint, within distance: CGFloat) -> Bool {
		let him = (walker.presentation() ?? walker).frame.offsetBy(dx: frame.minX, dy: frame.minY)
		let door = portal.shown ? portal.opening.offsetBy(dx: frame.minX, dy: frame.minY) : CGRect.null
		return him.union(door).insetBy(dx: -distance, dy: -distance).contains(cursor) || buttonOnScreen?.contains(cursor) == true
	}

	func hitTest(cursor: NSPoint) {
		guard !pressed else { return }
		let box = (walker.presentation() ?? walker).frame.offsetBy(dx: frame.minX, dy: frame.minY)
		let door = portal.shown ? portal.opening.offsetBy(dx: frame.minX, dy: frame.minY) : CGRect.null
		let over = (!indoors && box.contains(cursor)) || buttonOnScreen?.contains(cursor) == true || door.contains(cursor)
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

		// A new size: everything inside him, and the floor under his feet.
		if CGFloat(frame.width) != petWidth, frame.width > 0 {
			petWidth = CGFloat(frame.width)
			lay(width: petWidth)
			if let home { place(on: home) }
			let resized = PortalLayer(width: petWidth * 0.8)
			contentView?.layer?.replaceSublayer(portal.layer, with: resized.layer)
			portal = resized
			moveSerial = nil
		}

		// Travel: a new serial is a new move, eased over the walk's duration;
		// 0ms is a jump (the far side of a crossing).
		if frame.moveSerial != moveSerial {
			let first = moveSerial == nil
			moveSerial = frame.moveSerial
			let to = CGPoint(x: frame.x + petWidth / 2, y: Self.below + frame.lift + petWidth / 2)
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

		// Out of the way for a call, when that is what he was asked to do — or
		// through the portal: he shrinks into it, and comes back out of it.
		if let p = frame.portal { portal.place(x: CGFloat(p.x), floor: Self.below + 2 - portal.width * 0.125) }
		portal.show(frame.portal)
		if indoors != frame.home {
			indoors = frame.home
			// Through it: in, he spins down into the middle and is gone; out, he
			// spins up out of it. The portal flashes either way.
			portal.pulse()
			let turn = CABasicAnimation(keyPath: "transform.rotation.z")
			turn.fromValue = indoors ? 0 : Double.pi * 2
			turn.toValue = indoors ? -Double.pi * 3 : 0
			let size = CABasicAnimation(keyPath: "transform.scale")
			size.fromValue = indoors ? 1 : 0.05
			size.toValue = indoors ? 0.05 : 1
			let fade = CABasicAnimation(keyPath: "opacity")
			fade.fromValue = indoors ? 1 : 0
			fade.toValue = indoors ? 0 : 1
			let through = CAAnimationGroup()
			through.animations = [turn, size, fade]
			through.duration = indoors ? 0.6 : 0.55
			through.timingFunction = CAMediaTimingFunction(name: indoors ? .easeIn : .easeOut)
			through.preferredFrameRateRange = Motion.liveRate
			if indoors {
				through.fillMode = .forwards
				through.isRemovedOnCompletion = false
				CATransaction.begin()
				CATransaction.setCompletionBlock { [weak self] in
					MainActor.assumeIsolated {
						guard let self, self.indoors else { return }
						self.walker.isHidden = true
						self.svg.removeAnimation(forKey: "portal")
					}
				}
				svg.add(through, forKey: "portal")
				CATransaction.commit()
			} else {
				svg.removeAnimation(forKey: "portal")
				svg.add(through, forKey: "portal")
			}
		}
		let away = frame.hidden || (frame.home && svg.animation(forKey: "portal") == nil)
		if walker.isHidden != away { walker.isHidden = away }

		// What he is saying, on whichever side of him keeps it on screen.
		bubble.show(frame.speech, width: petWidth, onLeft: frame.x + petWidth / 2 < self.frame.width / 2)

		// The drawing: rebuilt when the face, the colours or the singing change.
		// Landing, or stopping a walk while singing, redraws to restore what
		// flying recoloured and walking took over.
		if (flying && !frame.flying) || (walking && !frame.walking && frame.singing) { drawn = nil }
		let kinds = frame.worn.map(\.kind)
		let key = "\(mood)|\(frame.singing)|\(c.face)\(c.screen)\(c.led)|\(parts)|\(kinds)"
		if key != drawn {
			drawn = key
			draw(art: art, mood: mood, parts: parts, colours: colours, singing: frame.singing, asleep: asleep, worn: kinds)
			posture = nil
			// Something new on: it puts itself on (`companion-wear`).
			for kind in kinds where !worn.contains(kind) {
				for layer in Motion.find("prop-\(kind)", in: host) {
					if let a = CSSMotion.animation(motion.base.wear, motion: motion, rate: Motion.liveRate) { layer.add(a, forKey: "wear") }
				}
			}
			worn = kinds
			leaving = []
		}
		// On its way off: `companion-unwear`, held at its end until it is gone.
		for prop in frame.worn where prop.leaving && !leaving.contains(prop.kind) {
			leaving.insert(prop.kind)
			for layer in Motion.find("prop-\(prop.kind)", in: host) {
				guard let a = CSSMotion.animation(motion.base.unwear, motion: motion, rate: Motion.liveRate) else { continue }
				a.fillMode = .forwards
				a.isRemovedOnCompletion = false
				layer.add(a, forKey: "wear")
			}
		}

		// A wave of the hands: `companion-wave` on both, as `[data-gesture="wave"]`
		// plays it. After the redraw above,
		// which would otherwise throw the animated hands away. The first frame only remembers where the count is.
		if frame.wave != waveSerial {
			if waveSerial != nil { wave(motion) }
			waveSerial = frame.wave
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

		// The ladder: up from his feet when he sets it, toppling when it slips.
		if frame.ladder != ladderShown {
			let before = ladderShown
			ladderShown = frame.ladder
			if let l = frame.ladder, before == nil || before?.x != l.x || before?.height != l.height {
				drawLadder(x: CGFloat(l.x), height: CGFloat(l.height))
				if let a = CSSMotion.animation(motion.ladder.up, motion: motion, rate: Motion.liveRate) { ladder.add(a, forKey: "ladder") }
			}
			if let l = frame.ladder, l.falling, before?.falling != true,
				let a = CSSMotion.animation(motion.ladder.down, motion: motion, rate: Motion.liveRate)
			{
				a.fillMode = .forwards
				a.isRemovedOnCompletion = false
				ladder.add(a, forKey: "ladder")
			}
			if frame.ladder == nil { ladder.isHidden = true }
		}

		// Climbing: the body rocks and the hands take turns.
		let up = frame.ladder.map { !$0.falling } ?? false
		if up != climbing {
			climbing = up
			for rule in motion.climbing {
				let layers = rule.target == "companion-body" ? [body] : Motion.find(rule.target, in: host)
					.filter { layer in rule.side.map { (layer.name ?? "").contains("side-\($0)") } ?? true }
				for layer in layers {
					layer.removeAnimation(forKey: "climb")
					if up, let a = rule.spec.flatMap({ CSSMotion.animation($0, motion: motion, rate: Motion.liveRate) }) {
						layer.add(a, forKey: "climb")
					}
				}
			}
		}

		// Hanging off a ledge: swinging from near his top (`transform-origin:
		// 50% 12%`), hands up on the edge.
		if frame.hanging != hanging {
			hanging = frame.hanging
			let w = petWidth
			CATransaction.begin()
			CATransaction.setDisableActions(true)
			anim.anchorPoint = CGPoint(x: 0.5, y: hanging ? 0.88 : 0.1)
			anim.position = CGPoint(x: w / 2, y: w * (hanging ? 0.88 : 0.1))
			CATransaction.commit()
			anim.removeAnimation(forKey: "hang")
			if hanging, let swing = motion.hanging.first(where: { $0.name != nil })?.spec,
				let a = CSSMotion.animation(swing, motion: motion, rate: Motion.liveRate)
			{
				anim.add(a, forKey: "hang")
			}
			let reach = motion.hanging.first { $0.target == "companion-hand" && $0.transform != nil }?.transform ?? []
			for hand in Motion.find("companion-hand", in: host) {
				ease(hand, to: hanging ? CSSMotion.transform(reach) : limb(hand, mood: mood), over: motion.base.limbTransition, timing: "ease")
			}
		}

		// Falling hot: a flame trailing up from him and a glow around him, both
		// sized by how far he is falling (`--heat`); flying glows amber.
		let heat = CGFloat(frame.heat)
		let hot = frame.falling && heat > 0.02
		if hot != burning || hot {
			burning = hot
			showHeat(hot ? heat : 0, flying: frame.flying)
		} else if frame.flying != (glow.opacity > 0 && !hot) {
			showHeat(0, flying: frame.flying)
		}

		// An effect, once per serial.
		if let effect = frame.effect, effect.serial != effectSerial {
			effectSerial = effect.serial
			// Landing after a hot fall leaves a ring on the floor (`land::after`).
			if effect.name == "land", heat > 0.05 { ring(heat: heat) }
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
			// Over a whole tick (the core looks four times a second), so following
			// the cursor glides instead of stepping.
			ease(eyes, to: target, over: 0.25, timing: "linear")
		}
	}

	private func draw(
		art: Art, mood: String, parts: [String: String], colours: [String: String], singing: Bool, asleep: Bool,
		worn: [String]
	) {
		let motion = art.motion
		blinker?.stop()
		blinker = nil
		svg.removeAllAnimations()
		host.sublayers = Pet.layers(art: art, mood: mood, parts: parts, colours: colours, singing: singing, worn: worn)

		// Pivots. Limbs and notes have none in the CSS, which for an SVG element
		// means the drawing's own top-left corner; the singing mouth turns about
		// its centre (`transform-box: fill-box`).
		for name in ["companion-hand", "companion-foot", "companion-notes"] {
			for layer in Motion.find(name, in: host) { CSSMotion.anchor(layer, at: CGPoint(x: 0, y: Painter.size)) }
		}
		// What he wears grows from the bottom middle (`transform-origin: 50% 100%`).
		for layer in Motion.find("companion-worn", in: host) { CSSMotion.anchor(layer, at: CGPoint(x: Painter.size / 2, y: 0)) }
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

	private func setUpHeat() {
		// `clip-path: polygon(50% 0, 88% 38%, 100% 100%, 0 100%, 12% 38%)` and the
		// flame's gradient, bright at his end and gone at the tip.
		trail.colors = [
			Painter.color("#ffcd78"), Painter.color("#ff8a28", alpha: 0.95),
			Painter.color("#e44216", alpha: 0.62), Painter.color("#be280f", alpha: 0),
		]
		trail.locations = [0, 0.28, 0.62, 1]
		trail.startPoint = CGPoint(x: 0.5, y: 0)
		trail.endPoint = CGPoint(x: 0.5, y: 1)
		trail.anchorPoint = CGPoint(x: 0.5, y: 0)
		trail.opacity = 0
		glow.type = .radial
		glow.startPoint = CGPoint(x: 0.5, y: 0.5)
		glow.endPoint = CGPoint(x: 1, y: 1)
		glow.opacity = 0
		impact.fillColor = nil
		impact.lineWidth = 2
		impact.opacity = 0
	}

	/// The flame and glow at `heat` (0 hides them), or the rocket's amber glow.
	private func showHeat(_ heat: CGFloat, flying: Bool) {
		CATransaction.begin()
		CATransaction.setDisableActions(true)
		let w = petWidth
		if heat > 0 {
			trail.bounds = CGRect(x: 0, y: 0, width: 52 * heat, height: 190 * heat)
			trail.position = CGPoint(x: w / 2, y: w * 0.4)
			let mask = CAShapeLayer()
			let (tw, th) = (trail.bounds.width, trail.bounds.height)
			let flame = CGMutablePath()
			// y-up: the wide end at his body, the point at the top.
			flame.move(to: CGPoint(x: tw * 0.5, y: th))
			flame.addLine(to: CGPoint(x: tw * 0.88, y: th * 0.62))
			flame.addLine(to: CGPoint(x: tw, y: 0))
			flame.addLine(to: CGPoint(x: 0, y: 0))
			flame.addLine(to: CGPoint(x: tw * 0.12, y: th * 0.62))
			flame.closeSubpath()
			mask.path = flame
			trail.mask = mask
			trail.opacity = Float(heat)
			if trail.animation(forKey: "flicker") == nil {
				// `companion-trail`: a 0.22s flicker, alternating.
				let flicker = CABasicAnimation(keyPath: "transform")
				flicker.fromValue = NSValue(caTransform3D: CATransform3DMakeScale(1.05, 0.86, 1))
				flicker.toValue = NSValue(caTransform3D: CATransform3DMakeScale(0.9, 1.12, 1))
				flicker.duration = 0.22
				flicker.autoreverses = true
				flicker.repeatCount = .infinity
				flicker.timingFunction = CAMediaTimingFunction(name: .easeInEaseOut)
				flicker.preferredFrameRateRange = Motion.liveRate
				trail.add(flicker, forKey: "flicker")
			}
		} else {
			trail.opacity = 0
			trail.removeAnimation(forKey: "flicker")
		}
		// The drop-shadow glow, as a radial gradient behind him rather than a
		// blur recomputed every frame of the fall.
		let reach = heat > 0 ? 40 * heat : flying ? 16 : 0
		let colour = heat > 0 ? Painter.color("#ff9640", alpha: 0.75 * heat) : Painter.color("#e0af68", alpha: 0.55)
		glow.bounds = CGRect(x: 0, y: 0, width: w + reach * 2, height: w + reach * 2)
		glow.position = CGPoint(x: w / 2, y: w / 2)
		glow.colors = [colour, colour.copy(alpha: 0) ?? colour]
		glow.locations = [0.45, 1]
		glow.opacity = reach > 0 ? 1 : 0
		CATransaction.commit()
	}

	/// `land::after`: a ring that spreads out on the floor and fades.
	private func ring(heat: CGFloat) {
		let size = CGSize(width: 150 * heat, height: 34 * heat)
		CATransaction.begin()
		CATransaction.setDisableActions(true)
		impact.bounds = CGRect(origin: .zero, size: size)
		impact.position = CGPoint(x: petWidth / 2, y: 0)
		impact.path = CGPath(ellipseIn: impact.bounds.insetBy(dx: 1, dy: 1), transform: nil)
		impact.strokeColor = Painter.color("#ffaa50", alpha: 0.8 * heat)
		CATransaction.commit()
		let grow = CABasicAnimation(keyPath: "transform.scale")
		grow.fromValue = 0.25
		grow.toValue = 1.6
		let fade = CABasicAnimation(keyPath: "opacity")
		fade.fromValue = 0.95
		fade.toValue = 0
		let group = CAAnimationGroup()
		group.animations = [grow, fade]
		group.duration = 0.45
		group.timingFunction = CAMediaTimingFunction(name: .easeOut)
		group.preferredFrameRateRange = Motion.liveRate
		impact.add(group, forKey: "impact")
	}

	/// `.companion-ladder`: 34pt wide, 4pt rails, a 3pt rung every 16pt, from
	/// his floor to 46pt past where he will stand, at his left edge.
	private func drawLadder(x: CGFloat, height: CGFloat) {
		let tall = height + 46
		CATransaction.begin()
		CATransaction.setDisableActions(true)
		ladder.removeAllAnimations()
		ladder.isHidden = false
		ladder.anchorPoint = CGPoint(x: 0.5, y: 0)
		ladder.bounds = CGRect(x: 0, y: 0, width: 34, height: tall)
		ladder.position = CGPoint(x: x + 17, y: Self.below)
		let rails = CAShapeLayer()
		let railPath = CGMutablePath()
		railPath.addRect(CGRect(x: 0, y: 0, width: 4, height: tall))
		railPath.addRect(CGRect(x: 30, y: 0, width: 4, height: tall))
		rails.path = railPath
		rails.fillColor = Painter.color("#7a6242")
		let rungs = CAShapeLayer()
		let rungPath = CGMutablePath()
		var y = tall - 3
		while y > 0 {
			rungPath.addRect(CGRect(x: 4, y: y, width: 26, height: 3))
			y -= 16
		}
		rungs.path = rungPath
		rungs.fillColor = Painter.color("#8d7150")
		ladder.sublayers = [rungs, rails]
		CATransaction.commit()
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
		// Worn things go over the face, each in a `.companion-worn` group the
		// way CompanionFace wraps them, so putting it on and off can animate it.
		// (The singing notes and the thinking and sleeping marks go above them
		// there; here they are under — a small difference, not yet worth a pass.)
		let painter = Painter(art: art, colours: colours)
		let props = worn.compactMap { kind -> CALayer? in
			guard let node = art.props[kind], let drawn = painter.layer(node, inherited: Painter.Style()) else { return nil }
			let group = CALayer()
			group.frame = CGRect(x: 0, y: 0, width: Painter.size, height: Painter.size)
			group.name = "companion-worn prop-\(kind)"
			group.addSublayer(drawn)
			return group
		}
		return painter.layers(resolved) + props
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
