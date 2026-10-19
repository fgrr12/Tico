import QuartzCore

/// companion.css's motion, as Core Animation. The one place CSS's axes become
/// ours: CSS has y down and turns clockwise, an unflipped layer has y up and
/// turns counter-clockwise, so y translations, rotations and skews flip sign
/// here and nowhere else. Translations are in CSS px, which are points for the
/// pet's own layers and viewBox units inside the drawing — the same numbers,
/// because in the SVG a px *is* a user unit.
@MainActor
enum CSSMotion {
	/// `transform: a b c` applies c to the point first, then b, then a.
	static func transform(_ ops: [ArtMotion.Op]) -> CATransform3D {
		ops.reduce(CATransform3DIdentity) { result, op in CATransform3DConcat(matrix(op), result) }
	}

	private static func matrix(_ op: ArtMotion.Op) -> CATransform3D {
		let a = op.args.map { CGFloat($0) }
		func arg(_ i: Int, _ fallback: CGFloat) -> CGFloat { i < a.count ? a[i] : fallback }
		switch op.fn {
		case "translate": return CATransform3DMakeTranslation(arg(0, 0), -arg(1, 0), 0)
		case "translateX": return CATransform3DMakeTranslation(arg(0, 0), 0, 0)
		case "translateY": return CATransform3DMakeTranslation(0, -arg(0, 0), 0)
		case "scale": return CATransform3DMakeScale(arg(0, 1), arg(1, arg(0, 1)), 1)
		case "scaleX": return CATransform3DMakeScale(arg(0, 1), 1, 1)
		case "scaleY": return CATransform3DMakeScale(1, arg(0, 1), 1)
		case "rotate": return CATransform3DMakeRotation(-arg(0, 0) * .pi / 180, 0, 0, 1)
		case "skewX":
			var m = CATransform3DIdentity
			m.m21 = -tan(arg(0, 0) * .pi / 180)
			return m
		default: return CATransform3DIdentity
		}
	}

	/// A CSS timing function's control points.
	static func bezier(_ css: String) -> (Double, Double, Double, Double) {
		if css.hasPrefix("cubic-bezier"), let inner = css.firstMatch(of: /\(([^)]*)\)/)?.1 {
			let p = inner.split(separator: ",").compactMap { Double($0.trimmingCharacters(in: .whitespaces)) }
			if p.count == 4 { return (p[0], p[1], p[2], p[3]) }
		}
		switch css {
		case "linear": return (0, 0, 1, 1)
		case "ease-in": return (0.42, 0, 1, 1)
		case "ease-out": return (0, 0, 0.58, 1)
		// `steps()` only ever meant "repaint less" in the WebView; here smooth is free.
		case let s where s == "ease-in-out" || s.hasPrefix("steps"): return (0.42, 0, 0.58, 1)
		default: return (0.25, 0.1, 0.25, 1)  // ease
		}
	}

	static func timing(_ css: String) -> CAMediaTimingFunction {
		let (x1, y1, x2, y2) = bezier(css)
		return CAMediaTimingFunction(controlPoints: Float(x1), Float(y1), Float(x2), Float(y2))
	}

	/// The eased progress at `x` (0…1) along a cubic bézier from (0,0) to (1,1).
	/// y may overshoot past 1, which is what the springy curves are for.
	static func ease(_ x: Double, _ c: (Double, Double, Double, Double)) -> Double {
		func at(_ t: Double, _ a: Double, _ b: Double) -> Double {
			3 * a * t * (1 - t) * (1 - t) + 3 * b * t * t * (1 - t) + t * t * t
		}
		// x(t) is monotonic for any valid CSS curve: bisect for the t that gives x.
		var lo = 0.0, hi = 1.0
		for _ in 0..<30 {
			let mid = (lo + hi) / 2
			if at(mid, c.0, c.2) < x { lo = mid } else { hi = mid }
		}
		return at((lo + hi) / 2, c.1, c.3)
	}

	/// One CSS animation, sampled. CSS eases each keyframe interval and
	/// interpolates each transform function by itself — which is what lets
	/// `rotate(0)` reach `rotate(360deg)`, where a matrix blend sees the same
	/// matrix at both ends and does not move. Core Animation does neither, so
	/// the curve is computed here at 60 samples a second and handed over as a
	/// linear path through them. Transform and opacity each use only the
	/// keyframes that set them, which is how CSS treats a keyframe that leaves a
	/// property out.
	static func animation(
		_ spec: ArtMotion.Spec, motion: ArtMotion, rate: CAFrameRateRange,
		name: String? = nil, duration: Double? = nil, base: CATransform3D = CATransform3DIdentity
	) -> CAAnimation? {
		guard let frames = motion.keyframes[name ?? spec.name], !frames.isEmpty else { return nil }
		let curve = bezier(spec.timing)
		let seconds = duration ?? spec.duration
		let samples = max(2, Int(seconds * 60))
		let times = (0...samples).map { Double($0) / Double(samples) }

		func track<V, R>(_ stops: [(Double, V)], neutral: V, _ mix: (V, V, Double) -> R) -> [R] {
			var stops = stops
			// A missing 0% or 100% is the element's own value.
			if stops[0].0 > 0 { stops.insert((0, neutral), at: 0) }
			if stops[stops.count - 1].0 < 1 { stops.append((1, neutral)) }
			return times.map { u in
				let i = min(stops.lastIndex { $0.0 <= u } ?? 0, stops.count - 2)
				let (a, b) = (stops[i], stops[i + 1])
				let local = b.0 > a.0 ? (u - a.0) / (b.0 - a.0) : 1
				return mix(a.1, b.1, ease(min(1, max(0, local)), curve))
			}
		}

		var parts: [CAKeyframeAnimation] = []
		let transforms = frames.compactMap { f in f.transform.map { (f.at, $0) } }
		if !transforms.isEmpty {
			let a = CAKeyframeAnimation(keyPath: "transform")
			a.values = track(transforms, neutral: []) { blend($0, $1, $2) }
				.map { NSValue(caTransform3D: CATransform3DConcat($0, base)) }
			parts.append(a)
		}
		let opacities = frames.compactMap { f in f.opacity.map { (f.at, $0) } }
		if !opacities.isEmpty {
			let a = CAKeyframeAnimation(keyPath: "opacity")
			a.values = track(opacities, neutral: 1.0) { $0 + ($1 - $0) * $2 }
			parts.append(a)
		}
		for a in parts {
			a.keyTimes = times.map { NSNumber(value: $0) }
			a.calculationMode = .linear
			a.duration = seconds
		}

		let group = CAAnimationGroup()
		group.animations = parts
		group.duration = seconds
		group.repeatCount = spec.iterations < 0 ? .infinity : Float(spec.iterations)
		group.autoreverses = spec.alternate
		group.preferredFrameRateRange = rate
		if spec.delay > 0 {
			group.beginTime = CACurrentMediaTime() + spec.delay
			group.fillMode = .backwards
		}
		return group
	}

	/// The neutral value of a transform function, for padding a shorter list.
	private static func neutral(_ op: ArtMotion.Op) -> [Double] {
		switch op.fn {
		case "scale": [1, 1]
		case "scaleX", "scaleY": [1]
		default: op.args.map { _ in 0 }
		}
	}

	/// Function by function where the two lists line up (a shorter one padded
	/// with neutral functions, as CSS does); where they do not, CSS blends the
	/// matrices, which this approximates by switching halfway.
	static func blend(_ a: [ArtMotion.Op], _ b: [ArtMotion.Op], _ t: Double) -> CATransform3D {
		let shared = min(a.count, b.count)
		guard (0..<shared).allSatisfy({ a[$0].fn == b[$0].fn }) else {
			return transform(t < 0.5 ? a : b)
		}
		let ops = (0..<max(a.count, b.count)).map { i -> ArtMotion.Op in
			let model = i < a.count ? a[i] : b[i]
			var from = i < a.count ? a[i].args : neutral(model)
			var to = i < b.count ? b[i].args : neutral(model)
			// `scale(s)` is `scale(s, s)`.
			if model.fn == "scale" {
				if from.count == 1 { from.append(from[0]) }
				if to.count == 1 { to.append(to[0]) }
			}
			let args = zip(from, to).map { x, y in x + (y - x) * t }
			return ArtMotion.Op(fn: model.fn, args: args)
		}
		return transform(ops)
	}

	/// Moves a layer's anchor without moving what it draws. Every drawing layer
	/// spans the 96-unit viewBox, so `point` is in viewBox units, y up.
	static func anchor(_ layer: CALayer, at point: CGPoint) {
		let size = layer.bounds.size
		guard size.width > 0, size.height > 0 else { return }
		layer.anchorPoint = CGPoint(x: point.x / size.width, y: point.y / size.height)
		layer.position = point
	}

	/// The box of the shapes a layer draws. Every drawing layer spans the same
	/// viewBox, so the sublayers' boxes need no conversion to be combined.
	static func box(_ layer: CALayer) -> CGRect {
		(layer.sublayers ?? []).reduce((layer as? CAShapeLayer)?.path?.boundingBoxOfPath ?? .null) { $0.union(box($1)) }
	}
}
