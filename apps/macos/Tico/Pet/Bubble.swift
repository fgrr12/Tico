import AppKit
import QuartzCore

/// What he says, drawn the way `.companion-bubble` is: chrome background, a
/// strong line, 12px mono at 1.55, never wider than 15.5rem, a soft shadow and
/// a tail, anchored to whichever side of him keeps it on the screen. The text
/// types itself in at the speed the core asks for.
///
/// It reads, it is never touched: it lives in a layer, not a view, so it can
/// never swallow a click meant for what is behind it.
@MainActor
final class Bubble {
	let layer = CALayer()
	private let box = CALayer()
	private let tail = CALayer()
	private let text = CATextLayer()
	private var typing: Timer?
	private var serial: UInt32?

	private static let font = NSFont.monospacedSystemFont(ofSize: 12, weight: .regular)
	private static let maxWidth: CGFloat = 15.5 * 16
	/// CSS splits `line-height: 1.55` evenly above and below each line, so the
	/// first line's half of the extra goes into the padding and the rest is
	/// spacing between lines.
	private static let leading = font.pointSize * 0.55
	private static let padding = CGSize(width: 0.7 * 16, height: 0.55 * 16 + leading / 2)
	/// `margin-bottom: 0.55rem` above his box.
	private static let gap: CGFloat = 0.55 * 16

	init() {
		box.backgroundColor = Painter.color("#21242c")
		box.borderColor = Painter.color("#363b4a")
		box.borderWidth = 1
		box.cornerRadius = 12
		box.shadowColor = .black
		box.shadowOpacity = 0.55
		box.shadowRadius = 17
		box.shadowOffset = CGSize(width: 0, height: -14)
		tail.backgroundColor = box.backgroundColor
		tail.borderColor = box.borderColor
		tail.borderWidth = 1
		tail.bounds = CGRect(x: 0, y: 0, width: 9, height: 9)
		tail.setAffineTransform(CGAffineTransform(rotationAngle: .pi / 4))
		text.isWrapped = true
		text.contentsScale = NSScreen.main?.backingScaleFactor ?? 2
		// The tail goes under the box so only its lower half shows, like the
		// CSS's bordered square with the box drawn over its top.
		layer.addSublayer(tail)
		layer.addSublayer(box)
		box.addSublayer(text)
		layer.isHidden = true
	}

	/// Shows `speech` over a pet `width` wide; `onLeft` anchors it to his left
	/// edge (he is on the left half of the screen), otherwise his right.
	func show(_ speech: Speech?, width: CGFloat, onLeft: Bool) {
		guard let speech else {
			hide()
			return
		}
		guard speech.serial != serial else { return }
		serial = speech.serial

		let full = attributed(speech.text)
		let inner = full.boundingRect(
			with: CGSize(width: Self.maxWidth - Self.padding.width * 2, height: 10_000),
			options: [.usesLineFragmentOrigin, .usesFontLeading]
		)
		let size = CGSize(width: ceil(inner.width) + Self.padding.width * 2, height: ceil(inner.height) + Self.padding.height * 2)

		CATransaction.begin()
		CATransaction.setDisableActions(true)
		let x = onLeft ? 0 : width - size.width
		layer.frame = CGRect(x: x, y: width + Self.gap, width: size.width, height: size.height)
		box.frame = layer.bounds
		box.shadowPath = CGPath(roundedRect: box.bounds, cornerWidth: 12, cornerHeight: 12, transform: nil)
		text.frame = box.bounds.insetBy(dx: Self.padding.width, dy: Self.padding.height)
		// 26px in from the side he is anchored to, half below the box.
		tail.position = CGPoint(x: onLeft ? 26 + 4.5 : size.width - 26 - 4.5, y: 0)
		text.string = attributed("")
		layer.isHidden = false
		CATransaction.commit()

		// `companion-say`: a quick rise and fade in.
		let rise = CABasicAnimation(keyPath: "transform.translation.y")
		rise.fromValue = -4
		rise.toValue = 0
		let fade = CABasicAnimation(keyPath: "opacity")
		fade.fromValue = 0
		fade.toValue = 1
		let enter = CAAnimationGroup()
		enter.animations = [rise, fade]
		enter.duration = 0.26
		enter.timingFunction = CAMediaTimingFunction(name: .easeOut)
		layer.add(enter, forKey: "enter")

		// Typed in a character at a time; the box is already its final size,
		// so nothing reflows while it types.
		typing?.invalidate()
		let characters = Array(speech.text)
		var shown = 0
		typing = Timer.scheduledTimer(withTimeInterval: Double(max(speech.revealMs, 1)) / 1000, repeats: true) { [weak self] _ in
			MainActor.assumeIsolated {
				guard let self else { return }
				shown += 1
				CATransaction.begin()
				CATransaction.setDisableActions(true)
				self.text.string = self.attributed(String(characters.prefix(shown)))
				CATransaction.commit()
				if shown >= characters.count { self.typing?.invalidate() }
			}
		}
	}

	/// Reading and writing are the two moments a line in front of your work is
	/// in the way: while you type, or reach for it with the cursor, it fades to
	/// 12% (`.companion-bubble[data-veiled]`) and comes back when you stop.
	func veil(_ on: Bool) {
		let target: Float = on ? 0.12 : 1
		guard box.opacity != target else { return }
		let fade = CABasicAnimation(keyPath: "opacity")
		fade.fromValue = box.presentation()?.opacity ?? box.opacity
		fade.toValue = target
		fade.duration = 0.16
		fade.timingFunction = CAMediaTimingFunction(name: .easeOut)
		box.opacity = target
		tail.opacity = target
		box.add(fade, forKey: "veil")
		tail.add(fade, forKey: "veil")
	}

	/// The bubble's box in its superlayer's coordinates, when it is showing.
	var frame: CGRect? { layer.isHidden ? nil : layer.frame }

	private func hide() {
		guard serial != nil else { return }
		serial = nil
		typing?.invalidate()
		layer.isHidden = true
	}

	private func attributed(_ string: String) -> NSAttributedString {
		let paragraph = NSMutableParagraphStyle()
		paragraph.lineSpacing = Self.leading
		return NSAttributedString(string: string, attributes: [
			.font: Self.font,
			.foregroundColor: NSColor(cgColor: Painter.color("#c8d0e0")) ?? .white,
			.paragraphStyle: paragraph,
		])
	}
}
