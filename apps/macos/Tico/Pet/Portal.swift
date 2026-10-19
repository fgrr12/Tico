import AppKit
import QuartzCore

/// The way home: a ring of energy that opens in the corner of the strip only
/// while there is a reason for it — he is heading in, he is in, or he has just
/// stepped out — and is otherwise not there at all, so there is nothing to
/// paint, hit-test or animate. The same thing, smaller, stands at the far end
/// of the long bay in the cutaway: the other side of it.
///
/// No frame, all light: an upright oval of swirling strands (dashed strokes
/// whose dashes run round at different speeds and directions — `lineDashPhase`
/// moves them along the oval without turning the oval itself), a misty dark
/// middle with clouds drifting in it, sparks lifting off the rim, a haze, and
/// a pool of light on the floor. Cyan while it waits for him, violet while he
/// is inside. Everything moving is a layer property run by the render server
/// at `Motion.idleRate`; `pulse` flashes it as he goes through.
@MainActor
final class PortalLayer {
	private struct Tones {
		let deep, tint, core: String
	}

	private static let waiting = Tones(deep: "#04161f", tint: "#3fd0ff", core: "#e6fbff")
	private static let inside = Tones(deep: "#14061f", tint: "#b77bff", core: "#f6eaff")

	let layer = CALayer()
	/// The oval's own width; everything else is measured from it.
	let width: CGFloat
	private let pool = CAGradientLayer()
	private let haze = CAGradientLayer()
	private let middle = CAGradientLayer()
	private let clouds = CALayer()
	private let puffs = [CAGradientLayer(), CAGradientLayer()]
	private let energy = CALayer()
	private let soft = CAShapeLayer()
	private let strands = CAShapeLayer()
	/// A second set just inside, its gaps where the first has strands.
	private let weave = CAShapeLayer()
	private let core = CAShapeLayer()
	private let wisps = CAShapeLayer()
	private let sparks: [CAShapeLayer]
	private let oval: CGRect
	private(set) var shown = false
	private var tones: String?

	/// An upright oval `width` wide, standing on the bottom of the layer, with
	/// room round it for the glow.
	init(width w: CGFloat) {
		width = w
		let h = w * 1.25
		let size = CGSize(width: w * 1.8, height: h * 1.45)
		layer.bounds = CGRect(origin: .zero, size: size)
		// Opens and closes from the floor, about its foot.
		layer.anchorPoint = CGPoint(x: 0.5, y: 0)
		layer.isHidden = true
		let oval = CGRect(x: (size.width - w) / 2, y: h * 0.1, width: w, height: h)
		self.oval = oval
		let centre = CGPoint(x: oval.midX, y: oval.midY)
		func ellipse(_ grow: CGFloat) -> CGPath {
			CGPath(ellipseIn: oval.insetBy(dx: -grow, dy: -grow), transform: nil)
		}

		// The light it throws on the floor, and the haze round it.
		pool.type = .radial
		pool.frame = CGRect(x: centre.x - w * 0.95, y: oval.minY - h * 0.12, width: w * 1.9, height: h * 0.24)
		haze.type = .radial
		haze.frame = CGRect(x: centre.x - w * 0.9, y: centre.y - h * 0.72, width: w * 1.8, height: h * 1.44)
		for g in [pool, haze] {
			g.startPoint = CGPoint(x: 0.5, y: 0.5)
			g.endPoint = CGPoint(x: 1, y: 1)
		}

		// The middle: dark and deep, with two clouds turning slowly in it.
		middle.type = .radial
		middle.frame = oval
		middle.startPoint = CGPoint(x: 0.5, y: 0.5)
		middle.endPoint = CGPoint(x: 1, y: 1)
		middle.locations = [0, 0.7, 1]
		clouds.frame = CGRect(origin: .zero, size: oval.size)
		for (i, puff) in puffs.enumerated() {
			puff.type = .radial
			puff.startPoint = CGPoint(x: 0.5, y: 0.5)
			puff.endPoint = CGPoint(x: 1, y: 1)
			puff.frame = CGRect(x: i == 0 ? w * 0.05 : w * 0.4, y: i == 0 ? h * 0.15 : h * 0.45, width: w * 0.6, height: h * 0.45)
			clouds.addSublayer(puff)
		}
		middle.addSublayer(clouds)
		let mask = CAShapeLayer()
		mask.path = CGPath(ellipseIn: CGRect(origin: .zero, size: oval.size), transform: nil)
		middle.mask = mask

		// The ring: a broad soft band, strands round it, a bright core line,
		// and loose wisps just outside.
		energy.frame = layer.bounds
		// Swells about the oval's middle, not the layer's.
		energy.anchorPoint = CGPoint(x: 0.5, y: centre.y / size.height)
		energy.position = centre
		soft.path = ellipse(0)
		soft.lineWidth = w * 0.16
		strands.path = ellipse(w * 0.01)
		strands.lineWidth = w * 0.07
		strands.lineDashPattern = [w * 0.34, w * 0.1, w * 0.18, w * 0.08].map { NSNumber(value: Double($0)) }
		strands.shadowRadius = w * 0.1
		strands.shadowOpacity = 1
		strands.shadowOffset = .zero
		strands.shadowPath = ellipse(w * 0.01).copy(strokingWithWidth: w * 0.09, lineCap: .round, lineJoin: .round, miterLimit: 1)
		weave.path = ellipse(-w * 0.025)
		weave.lineWidth = w * 0.05
		weave.lineDashPattern = [w * 0.2, w * 0.05, w * 0.45, w * 0.07].map { NSNumber(value: Double($0)) }
		core.path = ellipse(-w * 0.01)
		core.lineWidth = max(1, w * 0.025)
		core.lineDashPattern = [w * 0.7, w * 0.07, w * 0.2, w * 0.06].map { NSNumber(value: Double($0)) }
		wisps.path = ellipse(w * 0.06)
		wisps.lineWidth = max(0.6, w * 0.018)
		wisps.lineDashPattern = [w * 0.12, w * 0.3, w * 0.05, w * 0.22].map { NSNumber(value: Double($0)) }
		for ring in [soft, weave, strands, core, wisps] {
			ring.fillColor = nil
			ring.lineCap = .round
			energy.addSublayer(ring)
		}

		// Sparks: spread round the rim, each lifting off and fading on its own beat.
		sparks = (0..<8).map { i in
			let spark = CAShapeLayer()
			let r = max(0.8, w * 0.022)
			spark.path = CGPath(ellipseIn: CGRect(x: -r, y: -r, width: r * 2, height: r * 2), transform: nil)
			let angle = CGFloat(i) / 8 * .pi * 2 + 0.4
			spark.position = CGPoint(x: centre.x + cos(angle) * w / 2, y: centre.y + sin(angle) * h / 2)
			spark.opacity = 0
			return spark
		}

		for sub in [pool, haze, middle, energy] { layer.addSublayer(sub) }
		for spark in sparks { layer.addSublayer(spark) }
	}

	/// Stands it with its middle at `x`, its foot at `floor`.
	func place(x: CGFloat, floor: CGFloat) {
		CATransaction.begin()
		CATransaction.setDisableActions(true)
		layer.position = CGPoint(x: x, y: floor)
		CATransaction.commit()
	}

	/// The oval itself, in the coordinates of the layer it was placed in.
	var opening: CGRect { oval.offsetBy(dx: layer.frame.minX, dy: layer.frame.minY) }

	/// Open (in either colour) or gone.
	func show(_ portal: Portal?) {
		if let portal {
			tint(portal.inside ? Self.inside : Self.waiting)
			if !shown { open() }
		} else if shown {
			close()
		}
	}

	/// A flash as he goes through: the ring swells and the haze brightens.
	func pulse() {
		let swell = CAKeyframeAnimation(keyPath: "transform.scale")
		swell.values = [1, 1.14, 0.96, 1]
		swell.keyTimes = [0, 0.3, 0.7, 1]
		swell.duration = 0.6
		swell.preferredFrameRateRange = Motion.liveRate
		energy.add(swell, forKey: "pulse")
		let flare = CAKeyframeAnimation(keyPath: "transform.scale")
		flare.values = [1, 1.35, 1]
		flare.duration = 0.6
		flare.preferredFrameRateRange = Motion.liveRate
		haze.add(flare, forKey: "pulse")
	}

	private func tint(_ t: Tones) {
		guard t.tint != tones else { return }
		let first = tones == nil
		tones = t.tint
		CATransaction.begin()
		CATransaction.setDisableActions(first)
		CATransaction.setAnimationDuration(0.6)
		pool.colors = [Painter.color(t.tint, alpha: 0.55), Painter.color(t.tint, alpha: 0)]
		haze.colors = [Painter.color(t.tint, alpha: 0.42), Painter.color(t.tint, alpha: 0)]
		middle.colors = [Painter.color(t.deep, alpha: 0.92), Painter.color(t.deep, alpha: 0.75), Painter.color(t.tint, alpha: 0.55)]
		for puff in puffs { puff.colors = [Painter.color(t.tint, alpha: 0.3), Painter.color(t.tint, alpha: 0)] }
		soft.strokeColor = Painter.color(t.tint, alpha: 0.5)
		weave.strokeColor = Painter.color(t.tint, alpha: 0.7)
		strands.strokeColor = Painter.color(t.tint, alpha: 0.95)
		strands.shadowColor = Painter.color(t.tint)
		core.strokeColor = Painter.color(t.core)
		wisps.strokeColor = Painter.color(t.core, alpha: 0.7)
		for spark in sparks { spark.fillColor = Painter.color(t.core) }
		CATransaction.commit()
	}

	private func open() {
		shown = true
		layer.isHidden = false
		let grow = CASpringAnimation(keyPath: "transform.scale")
		grow.fromValue = 0.05
		grow.toValue = 1
		grow.damping = 11
		grow.duration = grow.settlingDuration
		grow.preferredFrameRateRange = Motion.liveRate
		layer.add(grow, forKey: "open")

		func loop(_ target: CALayer, _ key: String, from: Any, to: Any, _ duration: Double, reverses: Bool = false) {
			let a = CABasicAnimation(keyPath: key)
			a.fromValue = from
			a.toValue = to
			a.duration = duration
			a.autoreverses = reverses
			a.repeatCount = .infinity
			a.timingFunction = CAMediaTimingFunction(name: reverses ? .easeInEaseOut : .linear)
			a.preferredFrameRateRange = Motion.idleRate
			target.add(a, forKey: key)
		}
		// The strands run round one way, the core and wisps the other, at
		// different speeds: a swirl, without the oval itself turning.
		let lap = Double(width) * 1.2
		loop(strands, "lineDashPhase", from: 0, to: lap, 2.6)
		loop(core, "lineDashPhase", from: 0, to: -lap, 1.9)
		loop(wisps, "lineDashPhase", from: 0, to: lap * 0.8, 1.4)
		loop(weave, "lineDashPhase", from: 0, to: -lap * 0.7, 3.3)
		loop(soft, "lineWidth", from: width * 0.16, to: width * 0.11, 1.8, reverses: true)
		loop(strands, "shadowRadius", from: width * 0.1, to: width * 0.05, 1.5, reverses: true)
		loop(clouds, "transform.rotation.z", from: 0, to: Double.pi * 2, 14)
		loop(haze, "opacity", from: 1, to: 0.6, 2.3, reverses: true)
		for (i, spark) in sparks.enumerated() {
			let rise = CAKeyframeAnimation(keyPath: "position")
			let start = spark.position
			let drift = CGFloat(i % 3 - 1) * width * 0.08
			rise.values = [start, CGPoint(x: start.x + drift, y: start.y + width * 0.35)].map { NSValue(point: $0) }
			let fade = CAKeyframeAnimation(keyPath: "opacity")
			fade.values = [0, 1, 0]
			fade.keyTimes = [0, 0.25, 1]
			let both = CAAnimationGroup()
			both.animations = [rise, fade]
			both.duration = 1.6 + Double(i % 4) * 0.3
			both.beginTime = CACurrentMediaTime() + Double(i) * 0.27
			both.repeatCount = .infinity
			both.preferredFrameRateRange = Motion.idleRate
			spark.add(both, forKey: "spark")
		}
	}

	private func close() {
		shown = false
		CATransaction.begin()
		CATransaction.setCompletionBlock { [weak self] in
			MainActor.assumeIsolated {
				guard let self, !self.shown else { return }
				// Gone, animations and all: a closed portal costs nothing.
				self.layer.isHidden = true
				for sub in [self.layer, self.soft, self.weave, self.strands, self.core, self.wisps, self.clouds, self.haze, self.energy] + self.sparks {
					sub.removeAllAnimations()
				}
			}
		}
		let shrink = CABasicAnimation(keyPath: "transform.scale")
		shrink.fromValue = 1
		shrink.toValue = 0.05
		shrink.duration = 0.32
		shrink.timingFunction = CAMediaTimingFunction(name: .easeIn)
		shrink.fillMode = .forwards
		shrink.isRemovedOnCompletion = false
		shrink.preferredFrameRateRange = Motion.liveRate
		layer.add(shrink, forKey: "open")
		CATransaction.commit()
	}
}
