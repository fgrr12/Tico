import AppKit
import CoreText
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
	/// A reminder's "done", a pill under the text (`.companion-done`).
	private let button = CALayer()
	private let label = CATextLayer()
	private static let buttonFont = NSFont.monospacedSystemFont(ofSize: 11, weight: .regular)
	private var typing: Timer?
	private var serial: UInt32?
	/// How the feeling says it, for the line being shown.
	private var voice = Voice(feeling: "content")

	/// The bubble carries the feeling too (`.companion[data-feeling] .companion-bubble`):
	/// weight, spacing and opacity only, subtle on purpose — read first, noticed
	/// second. Scared and rattled lines come out bold and still shaking.
	struct Voice {
		var weight = NSFont.Weight.regular
		/// `letter-spacing`, in em.
		var spacing: CGFloat = 0
		var opacity: Float = 1
		var colour = "#c8d0e0"
		var size: CGFloat = 12
		var shakes = false

		init(feeling: String) {
			switch feeling {
			case "sleepy", "lonely": (weight, spacing, opacity) = (.light, 0.06, 0.82)
			case "bored": (spacing, opacity) = (0.05, 0.88)
			case "smug": (weight, spacing) = (.bold, -0.01)
			case "festive", "pleased": (weight, colour) = (.semibold, "#ffffff")
			case "worried": (size, spacing) = (11.5, -0.005)
			case "scared", "rattled": (weight, shakes) = (.bold, true)
			default: break
			}
		}

		var font: NSFont { NSFont.monospacedSystemFont(ofSize: size, weight: weight) }
	}

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
		button.backgroundColor = Painter.color("#bb9af7")
		label.contentsScale = text.contentsScale
		label.alignmentMode = .center
		button.addSublayer(label)
		box.addSublayer(button)
		layer.isHidden = true
	}

	/// Shows `speech` over a pet `width` wide; `onLeft` anchors it to his left
	/// edge (he is on the left half of the screen), otherwise his right.
	func show(_ speech: Speech?, width: CGFloat, onLeft: Bool, feeling: String) {
		guard let speech else {
			hide()
			return
		}
		guard speech.serial != serial else { return }
		serial = speech.serial
		voice = Voice(feeling: feeling)

		// Measured by CoreText, which is what CATextLayer draws with: AppKit's
		// own measurement disagrees with it by a line once the text wraps.
		let full = attributed(speech.text)
		let setter = CTFramesetterCreateWithAttributedString(full)
		let inner = CTFramesetterSuggestFrameSizeWithConstraints(
			setter, CFRange(location: 0, length: 0), nil,
			CGSize(width: Self.maxWidth - Self.padding.width * 2, height: 10_000), nil
		)
		// Room for the button from the start, so nothing reflows when it appears.
		let pill = speech.button.map { title -> CGSize in
			let w = (title as NSString).size(withAttributes: [.font: Self.buttonFont]).width
			return CGSize(width: ceil(w) + 0.55 * 16 * 2, height: ceil(Self.buttonFont.ascender - Self.buttonFont.descender) + 0.2 * 16 * 2)
		}
		let extra = pill.map { $0.height + 0.5 * 16 } ?? 0
		let size = CGSize(
			width: max(ceil(inner.width), pill?.width ?? 0) + Self.padding.width * 2,
			height: ceil(inner.height) + Self.padding.height * 2 + extra
		)

		CATransaction.begin()
		CATransaction.setDisableActions(true)
		let x = onLeft ? 0 : width - size.width
		layer.frame = CGRect(x: x, y: width + Self.gap, width: size.width, height: size.height)
		box.frame = layer.bounds
		box.shadowPath = CGPath(roundedRect: box.bounds, cornerWidth: 12, cornerHeight: 12, transform: nil)
		text.frame = CGRect(
			x: Self.padding.width, y: Self.padding.height + extra,
			width: size.width - Self.padding.width * 2, height: size.height - Self.padding.height * 2 - extra
		)
		if let pill, let title = speech.button {
			button.frame = CGRect(x: Self.padding.width, y: Self.padding.height, width: pill.width, height: pill.height)
			button.cornerRadius = pill.height / 2
			label.string = NSAttributedString(string: title, attributes: [
				.font: Self.buttonFont, .foregroundColor: NSColor(cgColor: Painter.color("#1a1c23")) ?? .black,
			])
			label.frame = button.bounds.insetBy(dx: 0, dy: 0.2 * 16 - 1)
		}
		button.isHidden = true
		reminder = speech.reminder
		// 26px in from the side he is anchored to, half below the box.
		tail.position = CGPoint(x: onLeft ? 26 + 4.5 : size.width - 26 - 4.5, y: 0)
		text.string = attributed("")
		layer.isHidden = false
		layer.opacity = voice.opacity
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
		// `companion-textshake`: said too fast and too loud, still shaking as it is read.
		if voice.shakes {
			let shake = CAKeyframeAnimation(keyPath: "transform.translation.x")
			shake.values = [0, -1.5, 1.5, -1, 0]
			shake.keyTimes = [0, 0.2, 0.45, 0.7, 1]
			shake.duration = 0.9
			shake.timingFunction = CAMediaTimingFunction(name: .easeInEaseOut)
			shake.preferredFrameRateRange = Motion.liveRate
			layer.add(shake, forKey: "shake")
		}

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
				// A caret while it types (`.caret`), gone once the line is all there.
				let typed = String(characters.prefix(shown))
				self.text.string = self.attributed(shown < characters.count ? typed + "▌" : typed)
				CATransaction.commit()
				if shown >= characters.count {
					self.typing?.invalidate()
					// The button once the line is all there, as in the web build.
					if self.reminder != nil { self.button.isHidden = false }
				}
			}
		}
	}

	/// Reading and writing are the two moments a line in front of your work is
	/// in the way: while you type, or reach for it with the cursor, it fades to
	/// 12% (`.companion-bubble[data-veiled]`) and comes back when you stop.
	func veil(_ on: Bool) {
		// A button at 12% is a button you cannot find.
		let target: Float = on && reminder == nil ? 0.12 : 1
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

	/// The reminder being shown, if the bubble is one.
	private(set) var reminder: String?

	/// The button's box in the bubble's superlayer, when it can be pressed.
	var buttonFrame: CGRect? {
		guard !layer.isHidden, !button.isHidden, reminder != nil else { return nil }
		return button.frame.offsetBy(dx: layer.frame.minX, dy: layer.frame.minY)
	}

	private func hide() {
		guard serial != nil else { return }
		serial = nil
		reminder = nil
		typing?.invalidate()
		layer.isHidden = true
	}

	private func attributed(_ string: String) -> NSAttributedString {
		let paragraph = NSMutableParagraphStyle()
		paragraph.lineSpacing = Self.leading
		return NSAttributedString(string: string, attributes: [
			.font: voice.font,
			.kern: voice.spacing * voice.size,
			.foregroundColor: Painter.nsColor(voice.colour),
			.paragraphStyle: paragraph,
		])
	}
}
