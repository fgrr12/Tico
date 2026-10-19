import AppKit
import QuartzCore

/// The way home: a portal that opens in the corner of the strip only while
/// there is a reason for it — he is heading in, he is in, or he has just
/// stepped out — and is otherwise not there at all, so there is nothing to
/// paint, hit-test or animate. His purple while it waits for him, the burrow's
/// amber while he is inside.
///
/// Drawn as layers rather than art: an oval standing on the floor, a dark core
/// lit from the middle, a dashed rim that turns (`lineDashPhase`, run by the
/// render server at `Motion.idleRate`) and a glow behind.
@MainActor
final class PortalLayer {
	static let size = CGSize(width: 70, height: 104)
	private static let waiting = "#bb9af7"
	private static let inside = "#e0af68"

	let layer = CALayer()
	private let glow = CAGradientLayer()
	private let core = CAGradientLayer()
	private let rim = CAShapeLayer()
	private let edge = CAShapeLayer()
	private(set) var shown = false
	private var colour: String?

	init() {
		let size = Self.size
		layer.bounds = CGRect(origin: .zero, size: size)
		// Opens and closes from the floor, about its foot.
		layer.anchorPoint = CGPoint(x: 0.5, y: 0)
		layer.isHidden = true

		glow.type = .radial
		glow.frame = CGRect(x: -size.width * 0.6, y: -size.height * 0.25, width: size.width * 2.2, height: size.height * 1.5)
		glow.startPoint = CGPoint(x: 0.5, y: 0.5)
		glow.endPoint = CGPoint(x: 1, y: 1)

		let oval = CGPath(ellipseIn: CGRect(origin: .zero, size: size).insetBy(dx: 2, dy: 2), transform: nil)
		core.type = .radial
		core.frame = layer.bounds
		core.startPoint = CGPoint(x: 0.5, y: 0.45)
		core.endPoint = CGPoint(x: 1.05, y: 1)
		let mask = CAShapeLayer()
		mask.path = oval
		core.mask = mask

		edge.path = oval
		edge.fillColor = nil
		edge.lineWidth = 1
		rim.path = oval
		rim.fillColor = nil
		rim.lineWidth = 3
		rim.lineCap = .round
		rim.lineDashPattern = [9, 7]

		for sub in [glow, core, edge, rim] { layer.addSublayer(sub) }
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

	private func tint(_ hex: String) {
		guard hex != colour else { return }
		let first = colour == nil
		colour = hex
		CATransaction.begin()
		CATransaction.setDisableActions(first)
		CATransaction.setAnimationDuration(0.6)
		glow.colors = [Painter.color(hex, alpha: 0.38), Painter.color(hex, alpha: 0)]
		core.colors = [Painter.color(hex, alpha: 0.75), Painter.color("#1a1c23", alpha: 0.96)]
		core.locations = [0, 0.85]
		rim.strokeColor = Painter.color(hex)
		edge.strokeColor = Painter.color(hex, alpha: 0.5)
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

		let swirl = CABasicAnimation(keyPath: "lineDashPhase")
		swirl.fromValue = 0
		swirl.toValue = -32
		swirl.duration = 1.4
		swirl.repeatCount = .infinity
		swirl.preferredFrameRateRange = Motion.idleRate
		rim.add(swirl, forKey: "swirl")

		let breathe = CABasicAnimation(keyPath: "opacity")
		breathe.fromValue = 1
		breathe.toValue = 0.55
		breathe.duration = 2.2
		breathe.autoreverses = true
		breathe.repeatCount = .infinity
		breathe.timingFunction = CAMediaTimingFunction(name: .easeInEaseOut)
		breathe.preferredFrameRateRange = Motion.idleRate
		glow.add(breathe, forKey: "breathe")
	}

	private func close() {
		shown = false
		CATransaction.begin()
		CATransaction.setCompletionBlock { [weak self] in
			MainActor.assumeIsolated {
				guard let self, !self.shown else { return }
				// Gone, animations and all: a closed portal costs nothing.
				self.layer.isHidden = true
				self.rim.removeAllAnimations()
				self.glow.removeAllAnimations()
				self.layer.removeAllAnimations()
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
