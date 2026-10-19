import AppKit
import QuartzCore

/// The way home: a portal that opens in the corner of the strip only while
/// there is a reason for it — he is heading in, he is in, or he has just
/// stepped out — and is otherwise not there at all, so there is nothing to
/// paint, hit-test or animate.
///
/// A stone ring on a low step, an energy disc inside it with lightning running
/// through, and mist at its foot. Blue and violet while it waits for him; the
/// burrow's amber while he is inside. Everything that moves — the bolts turning
/// and flickering, the rim breathing, the mist drifting — is a layer property
/// run by the render server at `Motion.idleRate`.
@MainActor
final class PortalLayer {
	/// The ring's diameter, and the whole thing with its step.
	private static let ring: CGFloat = 46
	static let size = CGSize(width: 60, height: 56)

	private struct Tones {
		let deep, mid, rim, bolt: String
	}

	private static let waiting = Tones(deep: "#160f38", mid: "#6b3fd4", rim: "#7dcfff", bolt: "#d6ecff")
	private static let inside = Tones(deep: "#2a1407", mid: "#c25f1c", rim: "#ffcf8a", bolt: "#fff1d6")

	let layer = CALayer()
	private let glow = CAGradientLayer()
	private let disc = CAGradientLayer()
	private let bolts = CALayer()
	private let boltsA = CAShapeLayer()
	private let boltsB = CAShapeLayer()
	private let rim = CAShapeLayer()
	private let mist = [CAGradientLayer(), CAGradientLayer()]
	private(set) var shown = false
	private var tones: String?

	init() {
		let size = Self.size
		layer.bounds = CGRect(origin: .zero, size: size)
		// Opens and closes from the floor, about its foot.
		layer.anchorPoint = CGPoint(x: 0.5, y: 0)
		layer.isHidden = true

		let r = Self.ring / 2
		let centre = CGPoint(x: size.width / 2, y: 6 + r)
		let circle = { (radius: CGFloat) in
			CGPath(ellipseIn: CGRect(x: centre.x - radius, y: centre.y - radius, width: radius * 2, height: radius * 2), transform: nil)
		}

		// The light it throws on the wall behind.
		glow.type = .radial
		glow.frame = CGRect(x: centre.x - r * 1.9, y: centre.y - r * 1.9, width: r * 3.8, height: r * 3.8)
		glow.startPoint = CGPoint(x: 0.5, y: 0.5)
		glow.endPoint = CGPoint(x: 1, y: 1)

		// The step it stands on, and the stone ring: dark, cut into segments.
		let step = CAShapeLayer()
		step.path = CGPath(roundedRect: CGRect(x: centre.x - r * 0.9, y: 1, width: r * 1.8, height: 5), cornerWidth: 1.5, cornerHeight: 1.5, transform: nil)
		step.fillColor = Painter.color("#2b2f3b")
		let stone = CAShapeLayer()
		let ring = CGMutablePath()
		ring.addPath(circle(r))
		ring.addPath(circle(r - 4.5))
		stone.path = ring
		stone.fillRule = .evenOdd
		stone.fillColor = Painter.color("#353a48")
		stone.strokeColor = Painter.color("#1c1f27")
		stone.lineWidth = 0.8
		let joints = CAShapeLayer()
		let cuts = CGMutablePath()
		for i in 0..<12 {
			let a = CGFloat(i) * .pi / 6 + .pi / 12
			cuts.move(to: CGPoint(x: centre.x + cos(a) * (r - 4.5), y: centre.y + sin(a) * (r - 4.5)))
			cuts.addLine(to: CGPoint(x: centre.x + cos(a) * r, y: centre.y + sin(a) * r))
		}
		joints.path = cuts
		joints.strokeColor = Painter.color("#1c1f27")
		joints.lineWidth = 0.8

		// The disc: dark in the middle, bright where it meets the stone.
		let inner = r - 4.5
		disc.type = .radial
		disc.frame = CGRect(x: centre.x - inner, y: centre.y - inner, width: inner * 2, height: inner * 2)
		disc.startPoint = CGPoint(x: 0.5, y: 0.5)
		disc.endPoint = CGPoint(x: 1, y: 1)
		disc.locations = [0, 0.55, 0.88, 1]
		let discMask = CAShapeLayer()
		discMask.path = CGPath(ellipseIn: CGRect(x: 0, y: 0, width: inner * 2, height: inner * 2), transform: nil)
		disc.mask = discMask

		// Lightning: two sets of bolts from the rim inwards, turning opposite
		// ways inside the disc.
		bolts.frame = disc.frame
		let boltsMask = CAShapeLayer()
		boltsMask.path = discMask.path
		bolts.mask = boltsMask
		var dice = UInt64(0x9e37_79b9_7f4a_7c15)
		for (shape, count) in [(boltsA, 5), (boltsB, 4)] {
			shape.frame = bolts.bounds
			shape.path = Self.lightning(count: count, radius: inner, dice: &dice)
			shape.fillColor = nil
			shape.lineWidth = 0.85
			shape.lineJoin = .round
			shape.lineCap = .round
			bolts.addSublayer(shape)
		}

		// The bright inner edge, glowing.
		rim.path = circle(inner)
		rim.fillColor = nil
		rim.lineWidth = 1.6
		rim.shadowRadius = 3
		rim.shadowOpacity = 1
		rim.shadowOffset = .zero
		rim.shadowPath = rim.path?.copy(strokingWithWidth: 1.6, lineCap: .round, lineJoin: .round, miterLimit: 1)

		// Mist at its foot, either side.
		for (i, puff) in mist.enumerated() {
			puff.type = .radial
			puff.startPoint = CGPoint(x: 0.5, y: 0.5)
			puff.endPoint = CGPoint(x: 1, y: 1)
			puff.frame = CGRect(x: i == 0 ? -2 : size.width - 26, y: -2, width: 28, height: 12)
		}

		for sub in [glow, disc, bolts, rim, stone, joints, step] + mist { layer.addSublayer(sub) }
	}

	/// Jagged strokes from the rim towards the middle, a few forks each.
	private static func lightning(count: Int, radius: CGFloat, dice: inout UInt64) -> CGPath {
		func roll() -> CGFloat {
			dice ^= dice << 13
			dice ^= dice >> 7
			dice ^= dice << 17
			return CGFloat(dice % 10_000) / 10_000
		}
		let path = CGMutablePath()
		let centre = CGPoint(x: radius, y: radius)
		for i in 0..<count {
			var angle = CGFloat(i) / CGFloat(count) * .pi * 2 + roll() * 0.8
			var distance = radius
			path.move(to: CGPoint(x: centre.x + cos(angle) * distance, y: centre.y + sin(angle) * distance))
			let stop = radius * (0.15 + roll() * 0.3)
			while distance > stop {
				distance -= radius * (0.12 + roll() * 0.1)
				angle += (roll() - 0.5) * 0.7
				let point = CGPoint(x: centre.x + cos(angle) * distance, y: centre.y + sin(angle) * distance)
				path.addLine(to: point)
				if roll() < 0.3 {
					let fork = angle + (roll() - 0.5) * 1.2
					let reach = distance - radius * 0.18
					path.addLine(to: CGPoint(x: centre.x + cos(fork) * reach, y: centre.y + sin(fork) * reach))
					path.move(to: point)
				}
			}
		}
		return path
	}

	/// Stands it on the strip with its middle at `x`, its foot at `floor`.
	func place(x: CGFloat, floor: CGFloat) {
		CATransaction.begin()
		CATransaction.setDisableActions(true)
		layer.position = CGPoint(x: x, y: floor)
		CATransaction.commit()
	}

	/// Open (in either colour) or gone.
	func show(_ portal: Portal?) {
		if let portal {
			tint(portal.inside ? Self.inside : Self.waiting)
			if !shown { open() }
		} else if shown {
			close()
		}
	}

	private func tint(_ t: Tones) {
		guard t.rim != tones else { return }
		let first = tones == nil
		tones = t.rim
		CATransaction.begin()
		CATransaction.setDisableActions(first)
		CATransaction.setAnimationDuration(0.6)
		glow.colors = [Painter.color(t.mid, alpha: 0.62), Painter.color(t.mid, alpha: 0)]
		disc.colors = [Painter.color(t.deep), Painter.color(t.mid, alpha: 0.85), Painter.color(t.rim, alpha: 0.9), Painter.color(t.bolt)]
		boltsA.strokeColor = Painter.color(t.bolt, alpha: 0.9)
		boltsB.strokeColor = Painter.color(t.rim, alpha: 0.75)
		rim.strokeColor = Painter.color(t.bolt)
		rim.shadowColor = Painter.color(t.rim)
		for puff in mist { puff.colors = [Painter.color(t.rim, alpha: 0.28), Painter.color(t.mid, alpha: 0)] }
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
		loop(boltsA, "transform.rotation.z", from: 0, to: -Double.pi * 2, 9)
		loop(boltsB, "transform.rotation.z", from: 0, to: Double.pi * 2, 13)
		// The bolts flicker: a few uneven steps of brightness, not a fade.
		let flicker = CAKeyframeAnimation(keyPath: "opacity")
		flicker.values = [1, 0.35, 0.9, 0.5, 1, 0.7, 0.25, 1]
		flicker.calculationMode = .discrete
		flicker.duration = 1.3
		flicker.repeatCount = .infinity
		flicker.preferredFrameRateRange = Motion.idleRate
		bolts.add(flicker, forKey: "flicker")
		loop(glow, "opacity", from: 1, to: 0.55, 2.2, reverses: true)
		loop(rim, "shadowRadius", from: 3, to: 1.2, 1.7, reverses: true)
		for (i, puff) in mist.enumerated() {
			loop(puff, "position.x", from: puff.position.x, to: puff.position.x + (i == 0 ? -3 : 3), 3.4 + Double(i), reverses: true)
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
				for sub in [self.layer, self.boltsA, self.boltsB, self.bolts, self.glow, self.rim] + self.mist {
					sub.removeAllAnimations()
				}
			}
		}
		let shrink = CABasicAnimation(keyPath: "transform.scale")
		shrink.fromValue = 1
		shrink.toValue = 0.05
		shrink.duration = 0.28
		shrink.timingFunction = CAMediaTimingFunction(name: .easeIn)
		shrink.fillMode = .forwards
		shrink.isRemovedOnCompletion = false
		shrink.preferredFrameRateRange = Motion.liveRate
		layer.add(shrink, forKey: "open")
		CATransaction.commit()
	}
}
