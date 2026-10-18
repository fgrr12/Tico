import AppKit
import QuartzCore

/// Turns art nodes into Core Animation layers.
///
/// Every element becomes its own layer, so anything the CSS animates — a hand,
/// a foot, the LED, the singing mouth — can later be moved by the render server
/// on the GPU, which is the reason for the native build: in the WebView those
/// same animations repainted the whole drawing every frame.
///
/// Coordinates: every layer spans the 96×96 viewBox, unflipped (AppKit's y-up),
/// and the paths carry the flip. Static `transform` attributes are baked into
/// the paths too. Layer transforms are left free for animation.
@MainActor
struct Painter {
	private let defs: [String: ArtNode]
	private let classStyles: [String: [String: String]]
	private let colours: [String: String]
	nonisolated static let size: CGFloat = 96
	nonisolated private static let frame = CGRect(x: 0, y: 0, width: size, height: size)

	/// `colours` fills the runtime tokens: `["{screen}": "#1a1c23", …]`.
	init(art: Art, colours: [String: String]) {
		var defs: [String: ArtNode] = [:]
		for node in art.defs {
			if case .string(let id) = node.attrs?["id"] { defs[id] = node }
		}
		self.defs = defs
		classStyles = art.classStyles
		self.colours = colours
	}

	/// What SVG inherits from a parent to its children.
	struct Style {
		var fill: String? = "#000000"
		var stroke: String?
		var strokeWidth: CGFloat = 1
		var lineCap: CAShapeLayerLineCap = .butt
		var lineJoin: CAShapeLayerLineJoin = .miter
		var fillOpacity: CGFloat = 1
		var strokeOpacity: CGFloat = 1
		var fontSize: CGFloat = 16
		var textAnchor = "start"
		/// SVG user space → layer space: the static transforms, then the flip.
		var transform = CGAffineTransform(a: 1, b: 0, c: 0, d: -1, tx: 0, ty: Painter.size)
	}

	func layers(_ nodes: [ArtNode], style: Style = Style()) -> [CALayer] {
		nodes.compactMap { layer($0, inherited: style) }
	}

	func layer(_ node: ArtNode, inherited: Style) -> CALayer? {
		guard let tag = node.tag else { return nil }
		// Presentation attributes, then the stylesheet's class rules, then
		// inline style: the CSS cascade, in the order it applies.
		var values: [String: String] = [:]
		var inline: [String: String] = [:]
		for (key, value) in node.attrs ?? [:] {
			switch value {
			case .string(let s): values[key] = fill(s)
			case .style(let map): inline = map.mapValues(fill)
			}
		}
		for name in (values["class"] ?? "").split(separator: " ") {
			for (key, value) in classStyles[String(name)] ?? [:] { values[key] = fill(value) }
		}
		values.merge(inline) { $1 }

		var style = inherited
		if let v = values["fill"] { style.fill = v == "none" ? nil : v }
		if let v = values["stroke"] { style.stroke = v == "none" ? nil : v }
		if let v = number(values["stroke-width"]) { style.strokeWidth = v }
		if let v = values["stroke-linecap"] { style.lineCap = v == "round" ? .round : v == "square" ? .square : .butt }
		if let v = values["stroke-linejoin"] { style.lineJoin = v == "round" ? .round : v == "bevel" ? .bevel : .miter }
		if let v = number(values["fill-opacity"]) { style.fillOpacity = v }
		if let v = number(values["stroke-opacity"]) { style.strokeOpacity = v }
		if let v = number(values["font-size"]) { style.fontSize = v }
		if let v = values["text-anchor"] { style.textAnchor = v }
		if let v = values["transform"] { style.transform = Self.transform(v).concatenating(style.transform) }

		let layer: CALayer
		switch tag {
		case "g":
			layer = CALayer()
			layer.frame = Self.frame
			for child in node.children ?? [] {
				if let sub = self.layer(child, inherited: style) { layer.addSublayer(sub) }
			}
		case "text":
			layer = text(node.children?.compactMap(\.text).joined() ?? "", values, style)
		default:
			guard let path = shape(tag, values) else { return nil }
			var transform = style.transform
			guard let placed = path.copy(using: &transform) else { return nil }
			layer = paint(placed, style)
		}

		if let opacity = number(values["opacity"]) { layer.opacity = Float(opacity) }
		if let clip = values["clip-path"], let id = Self.reference(clip), let node = defs[id] {
			let mask = CAShapeLayer()
			mask.frame = Self.frame
			let union = CGMutablePath()
			for child in node.children ?? [] {
				guard let tag = child.tag, let path = shape(tag, attributes(child)) else { continue }
				union.addPath(path, transform: style.transform)
			}
			mask.path = union
			layer.mask = mask
		}
		layer.name = values["class"]
		return layer
	}

	// MARK: Geometry

	private func shape(_ tag: String, _ a: [String: String]) -> CGPath? {
		func n(_ key: String) -> CGFloat { number(a[key]) ?? 0 }
		switch tag {
		case "rect":
			let rect = CGRect(x: n("x"), y: n("y"), width: n("width"), height: n("height"))
			// A missing radius takes the other one; both are capped at half a side.
			let rx = number(a["rx"]) ?? number(a["ry"]) ?? 0
			let ry = number(a["ry"]) ?? rx
			return CGPath(
				roundedRect: rect,
				cornerWidth: min(rx, rect.width / 2), cornerHeight: min(ry, rect.height / 2), transform: nil
			)
		case "circle":
			let r = n("r")
			return CGPath(ellipseIn: CGRect(x: n("cx") - r, y: n("cy") - r, width: 2 * r, height: 2 * r), transform: nil)
		case "ellipse":
			let rx = n("rx"), ry = n("ry")
			return CGPath(ellipseIn: CGRect(x: n("cx") - rx, y: n("cy") - ry, width: 2 * rx, height: 2 * ry), transform: nil)
		case "line":
			let path = CGMutablePath()
			path.move(to: CGPoint(x: n("x1"), y: n("y1")))
			path.addLine(to: CGPoint(x: n("x2"), y: n("y2")))
			return path
		case "path":
			return a["d"].map(SVGPath.parse)
		default:
			return nil
		}
	}

	private func attributes(_ node: ArtNode) -> [String: String] {
		(node.attrs ?? [:]).compactMapValues { if case .string(let s) = $0 { fill(s) } else { nil } }
	}

	private static func transform(_ value: String) -> CGAffineTransform {
		var result = CGAffineTransform.identity
		for match in value.matches(of: /(translate|rotate|scale)\(([^)]*)\)/) {
			let args = match.2.split(whereSeparator: { $0 == " " || $0 == "," }).compactMap { Double($0) }.map { CGFloat($0) }
			let step: CGAffineTransform
			switch match.1 {
			case "translate":
				step = CGAffineTransform(translationX: args.first ?? 0, y: args.count > 1 ? args[1] : 0)
			case "scale":
				step = CGAffineTransform(scaleX: args.first ?? 1, y: args.count > 1 ? args[1] : args.first ?? 1)
			default:
				let angle = (args.first ?? 0) * .pi / 180
				let (cx, cy) = args.count > 2 ? (args[1], args[2]) : (0, 0)
				step = CGAffineTransform(translationX: -cx, y: -cy)
					.concatenating(CGAffineTransform(rotationAngle: angle))
					.concatenating(CGAffineTransform(translationX: cx, y: cy))
			}
			// SVG applies a list left to right to the coordinate system, so the
			// last one listed touches the points first.
			result = step.concatenating(result)
		}
		return result
	}

	// MARK: Paint

	private func paint(_ path: CGPath, _ style: Style) -> CALayer {
		let fillLayer: CALayer?
		var plainFill: CGColor?
		if let fill = style.fill {
			if let id = Self.reference(fill), let def = defs[id] {
				fillLayer = server(def, path, opacity: style.fillOpacity)
			} else {
				plainFill = Self.color(fill, alpha: style.fillOpacity)
				fillLayer = nil
			}
		} else {
			fillLayer = nil
		}

		let shape = CAShapeLayer()
		shape.frame = Self.frame
		shape.path = path
		shape.fillColor = plainFill
		if let stroke = style.stroke {
			// A gradient stroke is not in the art; its first stop stands in.
			let colour = Self.reference(stroke).flatMap { defs[$0] }.flatMap(firstStop) ?? stroke
			shape.strokeColor = Self.color(colour, alpha: style.strokeOpacity)
			shape.lineWidth = style.strokeWidth * scale(style.transform)
			shape.lineCap = style.lineCap
			shape.lineJoin = style.lineJoin
		}
		guard let fillLayer else { return shape }

		let group = CALayer()
		group.frame = Self.frame
		group.addSublayer(fillLayer)
		group.addSublayer(shape)
		return group
	}

	/// A gradient or pattern fill: its own layer, masked to the shape.
	private func server(_ def: ArtNode, _ path: CGPath, opacity: CGFloat) -> CALayer? {
		let box = path.boundingBoxOfPath
		let layer: CALayer
		switch def.tag {
		case "linearGradient", "radialGradient":
			let gradient = CAGradientLayer()
			gradient.frame = box
			let stops = (def.children ?? []).map(attributes)
			gradient.colors = stops.map { Self.color($0["stop-color"] ?? "#000000", alpha: (number($0["stop-opacity"]) ?? 1) * opacity) }
			gradient.locations = stops.map { NSNumber(value: Double(percent($0["offset"]) ?? 0)) }
			let a = attributes(def)
			if def.tag == "radialGradient" {
				// SVG's defaults: centred, radius half the box.
				gradient.type = .radial
				gradient.startPoint = CGPoint(x: 0.5, y: 0.5)
				gradient.endPoint = CGPoint(x: 1, y: 1)
			} else {
				// objectBoundingBox fractions, y measured down; the unit space is y-up.
				gradient.startPoint = CGPoint(x: percent(a["x1"]) ?? 0, y: 1 - (percent(a["y1"]) ?? 0))
				gradient.endPoint = CGPoint(x: percent(a["x2"]) ?? 1, y: 1 - (percent(a["y2"]) ?? 0))
			}
			layer = gradient
		case "pattern":
			// The one pattern is a single-colour tile, so it is drawn as one shape:
			// the tile's contents repeated over the box, in user space.
			let a = attributes(def)
			guard let w = number(a["width"]), let h = number(a["height"]), w > 0, h > 0,
				let tile = def.children?.first, let tag = tile.tag
			else { return nil }
			let tileValues = attributes(tile)
			guard let tilePath = shape(tag, tileValues) else { return nil }
			// Back to user space to lay the tiles on the pattern's own grid.
			let toUser = flip.inverted()
			let userBox = box.applying(toUser)
			let union = CGMutablePath()
			var y = (userBox.minY / h).rounded(.down) * h
			while y < userBox.maxY {
				var x = (userBox.minX / w).rounded(.down) * w
				while x < userBox.maxX {
					union.addPath(tilePath, transform: CGAffineTransform(translationX: x, y: y).concatenating(flip))
					x += w
				}
				y += h
			}
			let stripes = CAShapeLayer()
			stripes.frame = Self.frame
			stripes.path = union
			stripes.fillColor = Self.color(tileValues["fill"] ?? "#000000", alpha: opacity)
			stripes.opacity = Float(number(tileValues["opacity"]) ?? 1)
			let mask = CAShapeLayer()
			mask.frame = Self.frame
			mask.path = path
			stripes.mask = mask
			return stripes
		default:
			return nil
		}
		let mask = CAShapeLayer()
		mask.frame = CGRect(origin: .zero, size: box.size)
		var offset = CGAffineTransform(translationX: -box.minX, y: -box.minY)
		mask.path = path.copy(using: &offset)
		layer.mask = mask
		return layer
	}

	private var flip: CGAffineTransform { Style().transform }

	private func text(_ string: String, _ values: [String: String], _ style: Style) -> CALayer {
		let font = NSFont.monospacedSystemFont(ofSize: style.fontSize, weight: .regular)
		let layer = CATextLayer()
		layer.string = string
		layer.font = font
		layer.fontSize = style.fontSize
		layer.foregroundColor = style.fill.map { Self.color($0, alpha: style.fillOpacity) }
		layer.contentsScale = NSScreen.main?.backingScaleFactor ?? 2
		let width = (string as NSString).size(withAttributes: [.font: font]).width
		let anchorShift: CGFloat = style.textAnchor == "middle" ? width / 2 : style.textAnchor == "end" ? width : 0
		// x/y is the start of the baseline; the layer is placed by its box.
		let baseline = CGPoint(x: number(values["x"]) ?? 0, y: number(values["y"]) ?? 0).applying(style.transform)
		layer.frame = CGRect(
			x: baseline.x - anchorShift, y: baseline.y + font.descender,
			width: width, height: font.ascender - font.descender
		)
		return layer
	}

	// MARK: Values

	private func fill(_ value: String) -> String {
		guard value.contains("{") else { return value }
		return colours.reduce(value) { $0.replacingOccurrences(of: $1.key, with: $1.value) }
	}

	private func number(_ value: String?) -> CGFloat? {
		value.flatMap { Double($0.trimmingCharacters(in: .whitespaces)) }.map { CGFloat($0) }
	}

	private func percent(_ value: String?) -> CGFloat? {
		guard let value else { return nil }
		if value.hasSuffix("%") { return number(String(value.dropLast())).map { $0 / 100 } }
		return number(value)
	}

	private func firstStop(_ def: ArtNode) -> String? {
		def.children?.first.map(attributes)?["stop-color"]
	}

	private func scale(_ t: CGAffineTransform) -> CGFloat {
		(abs(t.a * t.d - t.b * t.c)).squareRoot()
	}

	private static func reference(_ value: String) -> String? {
		value.firstMatch(of: /url\(#([\w-]+)\)/).map { String($0.1) }
	}

	static func color(_ hex: String, alpha: CGFloat = 1) -> CGColor {
		var s = hex.trimmingCharacters(in: .whitespaces)
		guard s.hasPrefix("#") else { return CGColor(gray: 0, alpha: alpha) }
		s.removeFirst()
		if s.count == 3 { s = s.map { "\($0)\($0)" }.joined() }
		guard let v = UInt32(s.prefix(6), radix: 16) else { return CGColor(gray: 0, alpha: alpha) }
		return CGColor(
			srgbRed: CGFloat((v >> 16) & 0xFF) / 255, green: CGFloat((v >> 8) & 0xFF) / 255,
			blue: CGFloat(v & 0xFF) / 255, alpha: alpha
		)
	}
}
