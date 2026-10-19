import AppKit
import QuartzCore

/// The always-on animations from companion.css, as Core Animation.
///
/// Each one is handed to the render server once and runs there: no timer in
/// this process, no redraw, no CPU in tico. That is the difference from the
/// WebView, whose own processes spent 8–16% of a core on the same animations,
/// and why the LED pulse is smooth again here — the WebView's twelve steps were
/// only ever a way to repaint less often. What is left to pay is WindowServer's
/// compositing, which `idleRate` keeps near zero.
@MainActor
enum Motion {
	/// The idle animations run at 15fps, and this is the number that matters
	/// most here. Uncapped, Core Animation drives a ProMotion panel at 120Hz for
	/// as long as anything moves, and WindowServer then composites every frame:
	/// measured, +20% of a core in WindowServer for a 5px bob — the same price
	/// the WebView paid. At 15fps it was indistinguishable from no tico at all
	/// (30fps: +5–10%). The bob moves 2.5px a second and the pulse is slow, so
	/// 15 frames is smooth; walking will need its own, higher, rate.
	static let idleRate = CAFrameRateRange(minimum: 10, maximum: 15, preferred: 15)
	/// `companion-bob`: 5px up and back over 4s, the whole drawing.
	static func bob(_ layer: CALayer) {
		let bob = CABasicAnimation(keyPath: "transform.translation.y")
		bob.fromValue = 0
		bob.toValue = 5
		bob.duration = 2
		bob.autoreverses = true
		bob.repeatCount = .infinity
		bob.timingFunction = CAMediaTimingFunction(name: .easeInEaseOut)
		bob.preferredFrameRateRange = idleRate
		layer.add(bob, forKey: "bob")
	}

	/// `companion-pulse`: the LED dims to 35% and back every 2.4s.
	static func pulse(_ root: CALayer) {
		for led in find("companion-led", in: root) {
			let pulse = CABasicAnimation(keyPath: "opacity")
			pulse.fromValue = 1
			pulse.toValue = 0.35
			pulse.duration = 1.2
			pulse.autoreverses = true
			pulse.repeatCount = .infinity
			pulse.timingFunction = CAMediaTimingFunction(name: .easeInEaseOut)
			pulse.preferredFrameRateRange = idleRate
			led.add(pulse, forKey: "pulse")
		}
	}

	/// Every layer whose class list contains `name`.
	static func find(_ name: String, in layer: CALayer) -> [CALayer] {
		let here = (layer.name ?? "").split(separator: " ").contains(Substring(name)) ? [layer] : []
		return here + (layer.sublayers ?? []).flatMap { find(name, in: $0) }
	}
}

/// Blinks: the eyes swap to their closed drawing for 130ms, every 2.4–7.6s —
/// the same timing as `Companion.tsx`. Both drawings are built up front and the
/// swap is a visibility flip, so a blink costs two property changes.
@MainActor
final class Blinker {
	private let open: CALayer
	private let closed: CALayer
	private var task: Task<Void, Never>?

	/// `open` is the drawn eyes; `closed` replaces them during a blink and is
	/// inserted beside them, hidden.
	init(open: CALayer, closed: CALayer) {
		self.open = open
		self.closed = closed
		closed.isHidden = true
		open.superlayer?.insertSublayer(closed, above: open)
		task = Task { [weak self] in
			try? await Task.sleep(for: .seconds(3))
			while !Task.isCancelled, let self {
				self.set(closed: true)
				try? await Task.sleep(for: .milliseconds(130))
				self.set(closed: false)
				try? await Task.sleep(for: .seconds(2.4 + Double.random(in: 0..<5.2)))
			}
		}
	}

	func stop() {
		task?.cancel()
		closed.removeFromSuperlayer()
		open.isHidden = false
	}

	private func set(closed shut: Bool) {
		// Without this, Core Animation fades the swap over a quarter second.
		CATransaction.begin()
		CATransaction.setDisableActions(true)
		open.isHidden = shut
		closed.isHidden = !shut
		CATransaction.commit()
	}
}
