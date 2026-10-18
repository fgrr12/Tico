import CoreGraphics
import Foundation

/// Path data (`d`) to a `CGPath`, for the commands the art uses: M L H V C Q A Z,
/// absolute and relative. S and T are not drawn anywhere yet; a path that uses
/// them stops there, and `ArtTests` fails if the export ever contains one.
enum SVGPath {
	static func parse(_ d: String) -> CGPath {
		let path = CGMutablePath()
		var scanner = Tokens(d)
		var current = CGPoint.zero
		var start = CGPoint.zero
		var command: Character = "M"

		while let next = scanner.command(continuing: command) {
			command = next
			let relative = command.isLowercase
			let base = relative ? current : .zero
			func point() -> CGPoint? {
				guard let x = scanner.number(), let y = scanner.number() else { return nil }
				return CGPoint(x: base.x + x, y: base.y + y)
			}

			switch command.uppercased() {
			case "M":
				guard let p = point() else { return path }
				path.move(to: p)
				current = p
				start = p
				// Pairs after the first one are line-tos, relative if the M was.
				command = relative ? "l" : "L"
			case "L":
				guard let p = point() else { return path }
				path.addLine(to: p)
				current = p
			case "H":
				guard let x = scanner.number() else { return path }
				current.x = (relative ? current.x : 0) + x
				path.addLine(to: current)
			case "V":
				guard let y = scanner.number() else { return path }
				current.y = (relative ? current.y : 0) + y
				path.addLine(to: current)
			case "C":
				guard let c1 = point(), let c2 = point(), let p = point() else { return path }
				path.addCurve(to: p, control1: c1, control2: c2)
				current = p
			case "Q":
				guard let c = point(), let p = point() else { return path }
				path.addQuadCurve(to: p, control: c)
				current = p
			case "A":
				guard let rx = scanner.number(), let ry = scanner.number(), let rotation = scanner.number(),
					let large = scanner.flag(), let sweep = scanner.flag(), let p = point()
				else { return path }
				arc(path, from: current, to: p, rx: rx, ry: ry, degrees: rotation, large: large, sweep: sweep)
				current = p
			case "Z":
				path.closeSubpath()
				current = start
			default:
				return path
			}
		}
		return path
	}

	/// SVG's endpoint arc, converted to a centre and two angles (SVG 1.1, F.6.5)
	/// and drawn as a unit circle stretched into place.
	private static func arc(
		_ path: CGMutablePath, from p0: CGPoint, to p1: CGPoint,
		rx: CGFloat, ry: CGFloat, degrees: CGFloat, large: Bool, sweep: Bool
	) {
		var rx = abs(rx), ry = abs(ry)
		guard rx > 0, ry > 0, p0 != p1 else {
			path.addLine(to: p1)
			return
		}
		let phi = degrees * .pi / 180
		let (cosPhi, sinPhi) = (cos(phi), sin(phi))
		let dx = (p0.x - p1.x) / 2, dy = (p0.y - p1.y) / 2
		let x1 = cosPhi * dx + sinPhi * dy
		let y1 = -sinPhi * dx + cosPhi * dy

		// Radii too small to reach are scaled up until they just do.
		let lambda = (x1 * x1) / (rx * rx) + (y1 * y1) / (ry * ry)
		if lambda > 1 {
			rx *= lambda.squareRoot()
			ry *= lambda.squareRoot()
		}
		let numerator = rx * rx * ry * ry - rx * rx * y1 * y1 - ry * ry * x1 * x1
		let denominator = rx * rx * y1 * y1 + ry * ry * x1 * x1
		let coefficient = (large == sweep ? -1 : 1) * max(0, numerator / denominator).squareRoot()
		let cx1 = coefficient * rx * y1 / ry
		let cy1 = coefficient * -ry * x1 / rx
		let center = CGPoint(
			x: cosPhi * cx1 - sinPhi * cy1 + (p0.x + p1.x) / 2,
			y: sinPhi * cx1 + cosPhi * cy1 + (p0.y + p1.y) / 2
		)

		func angle(_ ux: CGFloat, _ uy: CGFloat, _ vx: CGFloat, _ vy: CGFloat) -> CGFloat {
			atan2(ux * vy - uy * vx, ux * vx + uy * vy)
		}
		let ux = (x1 - cx1) / rx, uy = (y1 - cy1) / ry
		let vx = (-x1 - cx1) / rx, vy = (-y1 - cy1) / ry
		let theta = angle(1, 0, ux, uy)
		var delta = angle(ux, uy, vx, vy)
		if !sweep, delta > 0 { delta -= 2 * .pi }
		if sweep, delta < 0 { delta += 2 * .pi }

		let transform = CGAffineTransform(translationX: center.x, y: center.y).rotated(by: phi).scaledBy(x: rx, y: ry)
		// CGPath's "clockwise" is the direction of decreasing angle.
		path.addArc(center: .zero, radius: 1, startAngle: theta, endAngle: theta + delta, clockwise: delta < 0, transform: transform)
	}

	/// Numbers in path data run together: `-4.6-4.6`, `.5.5`, `1e-3`.
	private struct Tokens {
		private let chars: [Character]
		private var i = 0

		init(_ d: String) { chars = Array(d) }

		private mutating func skipSeparators() {
			while i < chars.count, chars[i] == " " || chars[i] == "," || chars[i] == "\n" || chars[i] == "\t" { i += 1 }
		}

		/// The next command letter, or `continuing` when more numbers follow
		/// without one (an implicit repeat).
		mutating func command(continuing: Character) -> Character? {
			skipSeparators()
			guard i < chars.count else { return nil }
			if chars[i].isLetter {
				defer { i += 1 }
				return chars[i]
			}
			return continuing.uppercased() == "Z" ? nil : continuing
		}

		mutating func number() -> CGFloat? {
			skipSeparators()
			let begin = i
			if i < chars.count, chars[i] == "-" || chars[i] == "+" { i += 1 }
			var seenDot = false, seenExponent = false
			while i < chars.count {
				let c = chars[i]
				if c.isNumber {
					i += 1
				} else if c == ".", !seenDot, !seenExponent {
					seenDot = true
					i += 1
				} else if c == "e" || c == "E", !seenExponent, i > begin {
					seenExponent = true
					i += 1
					if i < chars.count, chars[i] == "-" || chars[i] == "+" { i += 1 }
				} else {
					break
				}
			}
			return Double(String(chars[begin..<i])).map { CGFloat($0) }
		}

		/// Arc flags are a single digit and may touch what follows: `a5 5 0 015 5`.
		mutating func flag() -> Bool? {
			skipSeparators()
			guard i < chars.count, chars[i] == "0" || chars[i] == "1" else { return nil }
			defer { i += 1 }
			return chars[i] == "1"
		}
	}
}
