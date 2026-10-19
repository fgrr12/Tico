import AppKit
import QuartzCore

/// The way home: a ring of energy that opens in the corner of the strip only
/// while there is a reason for it — he is heading in, he is in, or he has just
/// stepped out — and is otherwise not there at all, so there is nothing to
/// paint, hit-test or animate. The same thing, smaller, stands at the far end
/// of the long bay in the cutaway: the other side of it.
///
/// No frame, all light, burning: an upright oval whose rim is never quite the
/// same shape twice (each band's path flickers between a few jagged versions of
/// the oval), tongues of flame licking outward all round it, each on its own
/// beat, a misty dark middle with clouds drifting in it, sparks lifting off, a
/// haze, and a pool of light on the floor. Cyan while it waits for him, violet while he
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
	/// The tongues of flame round the rim: each a container turned to face
	/// outward, holding a flame that stretches and shrinks from its base.
	private let tongues: [(flame: CAShapeLayer, heart: CAShapeLayer)]
	/// Jagged versions of each band's oval, flickered between.
	private let ragged: [CAShapeLayer: [CGPath]]
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

		// The ring: a broad soft band, two burning bands over it, a bright line
		// at the heart. Each band flickers between jagged versions of its oval.
		var dice = UInt64(0x2545_f491_4f6c_dd1d)
		func roll() -> CGFloat {
			dice ^= dice << 13
			dice ^= dice >> 7
			dice ^= dice << 17
			return CGFloat(dice % 10_000) / 10_000
		}
		/// The oval grown by `grow`, its edge pushed out and in by up to `rough`
		/// at 40 points round, joined smoothly.
		func jagged(_ grow: CGFloat, _ rough: CGFloat) -> CGPath {
			let (a, b) = (w / 2 + grow, h / 2 + grow)
			let points = (0..<40).map { i -> CGPoint in
				let t = CGFloat(i) / 40 * .pi * 2
				let k = 1 + (roll() - 0.35) * rough / a
				return CGPoint(x: centre.x + cos(t) * a * k, y: centre.y + sin(t) * b * k)
			}
			let path = CGMutablePath()
			let mid = { (p: CGPoint, q: CGPoint) in CGPoint(x: (p.x + q.x) / 2, y: (p.y + q.y) / 2) }
			path.move(to: mid(points[39], points[0]))
			for i in 0..<40 { path.addQuadCurve(to: mid(points[i], points[(i + 1) % 40]), control: points[i]) }
			path.closeSubpath()
			return path
		}
		energy.frame = layer.bounds
		// Swells about the oval's middle, not the layer's.
		energy.anchorPoint = CGPoint(x: 0.5, y: centre.y / size.height)
		energy.position = centre
		soft.lineWidth = w * 0.16
		strands.lineWidth = w * 0.07
		strands.shadowRadius = w * 0.1
		strands.shadowOpacity = 1
		strands.shadowOffset = .zero
		strands.shadowPath = ellipse(w * 0.01).copy(strokingWithWidth: w * 0.09, lineCap: .round, lineJoin: .round, miterLimit: 1)
		weave.lineWidth = w * 0.05
		core.lineWidth = max(1, w * 0.025)
		var ragged: [CAShapeLayer: [CGPath]] = [:]
		for (ring, grow, rough) in [(soft, 0.0, w * 0.05), (strands, w * 0.01, w * 0.07), (weave, -w * 0.025, w * 0.05), (core, -w * 0.01, w * 0.03)] {
			let shapes = (0..<4).map { _ in jagged(grow, rough) }
			ring.path = shapes[0]
			ragged[ring] = shapes
			ring.fillColor = nil
			ring.lineCap = .round
			ring.lineJoin = .round
			energy.addSublayer(ring)
		}
		self.ragged = ragged

		// Tongues of flame, facing outward from the rim all the way round:
		// longer at the top, as fire is.
		var tongues: [(flame: CAShapeLayer, heart: CAShapeLayer)] = []
		for i in 0..<30 {
			let t = (CGFloat(i) + roll() * 0.6) / 30 * .pi * 2
			let (a, b) = (w / 2, h / 2)
			let foot = CGPoint(x: centre.x + cos(t) * a, y: centre.y + sin(t) * b)
			let normal = atan2(sin(t) * a, cos(t) * b)
			let reach = w * (0.12 + roll() * 0.1) * (1 + max(0, sin(t)) * 0.6)
			let base = w * (0.1 + roll() * 0.05)
			let lean: CGFloat = roll() < 0.5 ? -1 : 1
			/// A flame: a full belly that narrows into a tip curling off to one side.
			func tongue(_ width: CGFloat, _ length: CGFloat) -> CGPath {
				let path = CGMutablePath()
				path.move(to: CGPoint(x: -width / 2, y: 0))
				path.addCurve(
					to: CGPoint(x: lean * width * 0.25, y: length),
					control1: CGPoint(x: -width * 0.65, y: length * 0.35), control2: CGPoint(x: -width * 0.05 * lean, y: length * 0.75)
				)
				path.addCurve(
					to: CGPoint(x: width / 2, y: 0),
					control1: CGPoint(x: width * 0.35 * lean, y: length * 0.6), control2: CGPoint(x: width * 0.6, y: length * 0.25)
				)
				path.closeSubpath()
				return path
			}
			let holder = CALayer()
			holder.position = foot
			holder.setAffineTransform(CGAffineTransform(rotationAngle: normal - .pi / 2))
			let flame = CAShapeLayer()
			flame.path = tongue(base, reach)
			let heart = CAShapeLayer()
			heart.path = tongue(base * 0.45, reach * 0.55)
			flame.addSublayer(heart)
			holder.addSublayer(flame)
			energy.addSublayer(holder)
			tongues.append((flame, heart))
		}
		self.tongues = tongues

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
		weave.strokeColor = Painter.color(t.core, alpha: 0.55)
		strands.strokeColor = Painter.color(t.tint, alpha: 0.95)
		strands.shadowColor = Painter.color(t.tint)
		core.strokeColor = Painter.color(t.core)
		for (flame, heart) in tongues {
			flame.fillColor = Painter.color(t.tint, alpha: 0.6)
			heart.fillColor = Painter.color(t.core, alpha: 0.8)
		}
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
		// The rim burns: each band flickers through its jagged shapes, out of
		// step with the others.
		for (i, ring) in [soft, strands, weave, core].enumerated() {
			guard let shapes = ragged[ring] else { continue }
			let burn = CAKeyframeAnimation(keyPath: "path")
			burn.values = shapes + [shapes[0]]
			burn.duration = 0.7 + Double(i) * 0.17
			burn.repeatCount = .infinity
			burn.preferredFrameRateRange = Motion.idleRate
			ring.add(burn, forKey: "burn")
		}
		// And the tongues lick: each stretches and shrinks from its base on
		// its own uneven beat.
		for (i, (flame, _)) in tongues.enumerated() {
			let lick = CAKeyframeAnimation(keyPath: "transform.scale.y")
			let steps: [[Double]] = [[0.5, 1.15, 0.7, 1.3, 0.55], [0.9, 0.45, 1.2, 0.6, 0.9], [0.7, 1.25, 0.5, 1, 0.7]]
			lick.values = steps[i % 3]
			let flicker = CAKeyframeAnimation(keyPath: "opacity")
			flicker.values = [0.7, 1, 0.55, 1, 0.7]
			let both = CAAnimationGroup()
			both.animations = [lick, flicker]
			both.duration = 0.55 + Double((i * 7) % 5) * 0.09
			both.beginTime = CACurrentMediaTime() + Double((i * 3) % 7) * 0.06
			both.repeatCount = .infinity
			both.preferredFrameRateRange = Motion.idleRate
			flame.add(both, forKey: "lick")
			// And sways on its base, on top of the way it faces.
			let sway = CAKeyframeAnimation(keyPath: "transform.rotation.z")
			sway.values = [-0.16, 0.14, -0.08, 0.18, -0.16]
			sway.isAdditive = true
			sway.duration = 1.1 + Double(i % 4) * 0.2
			sway.repeatCount = .infinity
			sway.preferredFrameRateRange = Motion.idleRate
			flame.superlayer?.add(sway, forKey: "sway")
		}
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
				for sub in [self.layer, self.soft, self.weave, self.strands, self.core, self.clouds, self.haze, self.energy] + self.sparks + self.tongues.map(\.flame) + self.tongues.compactMap(\.flame.superlayer) {
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
