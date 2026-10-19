import AppKit
import QuartzCore

/// Frame rates, and finding layers by class. The animations themselves come
/// from companion.css through `CSSMotion`; each is handed to the render server
/// once and runs there — no timer in this process, no redraw, no CPU in tico.
/// That is the difference from the WebView, whose own processes spent 8–16% of
/// a core on the same animations. What is left to pay is WindowServer's
/// compositing, which the frame rates here keep near zero.
@MainActor
enum Motion {
	/// The idle animations run at 15fps, and this is the number that matters
	/// most here. Uncapped, Core Animation drives a ProMotion panel at 120Hz for
	/// as long as anything moves, and WindowServer then composites every frame:
	/// measured, +20% of a core in WindowServer for a 5px bob — the same price
	/// the WebView paid. At 15fps it was indistinguishable from no tico at all
	/// (30fps: +5–10%). The bob moves 2.5px a second and the pulse is slow, so
	/// 15 frames is smooth; walking will need its own, higher, rate.
	/// "Reduce motion" in Accessibility: what is left is a pet that blinks,
	/// talks and teleports rather than walks, which is how the Tauri build read
	/// it (`prefers-reduced-motion` zeroed every animation and transition).
	/// Read each time, so changing it applies at once.
	static var reduced: Bool { NSWorkspace.shared.accessibilityDisplayShouldReduceMotion }

	static let idleRate = CAFrameRateRange(minimum: 10, maximum: 15, preferred: 15)
	/// Effects and singing move fast — a hop is 18px in 0.6s — and at 15fps
	/// they stutter. They are short, or only run while music plays, so they get
	/// 30: the rate that measured +5–10% in WindowServer, paid only while they run.
	static let liveRate = CAFrameRateRange(minimum: 20, maximum: 30, preferred: 30)

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
	/// The closed eyes, beside the open ones in his drawing (recoloured with it).
	let closed: CALayer
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
