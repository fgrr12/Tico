import Foundation

/// `art/tico.json`, written by `scripts/export-art.mjs` from the React drawing.
/// Every node is an SVG element as React would have put it in the DOM; the
/// shell's job is to turn them into layers. Nothing here draws yet.
struct Art: Decodable, Sendable {
	let version: Int
	let viewBox: [Double]
	/// The colours that change at runtime, written into the art as `{screen}`,
	/// `{led}` and `{face}`.
	let tokens: [String]
	let palette: [String: String]
	/// Gradients, the scanline pattern and the screen clip, shared by every part.
	let defs: [ArtNode]
	/// Fill and stroke `companion.css` gives limbs by class.
	let classStyles: [String: [String: String]]
	/// slot ("shell", "hands", "feet", "antenna") → variant name → drawing.
	let slots: [String: [String: ArtNode]]
	let props: [String: ArtNode]
	let faces: [String: Face]
	/// How he moves, from companion.css.
	let motion: ArtMotion

	/// One mood, back to front, with each body part left as a `slot` node.
	struct Face: Decodable, Sendable {
		let normal: [ArtNode]
		/// Only present where blinking changes the drawing.
		let blink: [ArtNode]?
		let singing: [ArtNode]
	}

	static func load(from bundle: Bundle = .main) throws -> Art {
		guard let url = bundle.url(forResource: "tico", withExtension: "json") else {
			throw CocoaError(.fileNoSuchFile)
		}
		return try JSONDecoder().decode(Art.self, from: Data(contentsOf: url))
	}
}

/// An element (`tag` + `attrs` + `children`), a run of text, or — inside a
/// face — a placeholder for one of the four body slots.
struct ArtNode: Decodable, Sendable {
	let tag: String?
	let attrs: [String: Value]?
	let children: [ArtNode]?
	let text: String?
	/// The slot this placeholder stands for, when `tag` is "slot".
	let name: String?

	/// Attribute values are strings, except `style`, which is a map.
	enum Value: Decodable, Sendable {
		case string(String)
		case style([String: String])

		init(from decoder: Decoder) throws {
			let container = try decoder.singleValueContainer()
			if let string = try? container.decode(String.self) {
				self = .string(string)
			} else {
				self = .style(try container.decode([String: String].self))
			}
		}
	}
}

/// `motion` in the art file: companion.css's keyframes and the rules that play
/// them, in CSS's own terms (px, degrees, y down, clockwise). `CSSMotion`
/// turns them into Core Animation.
struct ArtMotion: Decodable, Sendable {
	/// One `animation:` shorthand. `target`, `side` and `child` say which layer
	/// it runs on, where that is not implied.
	struct Spec: Decodable, Sendable {
		let name: String
		let duration: Double
		let timing: String
		let delay: Double
		/// -1 is `infinite`.
		let iterations: Double
		let alternate: Bool
		/// `animation-direction: reverse`.
		var reverse: Bool? = nil
		let target: String?
		let side: String?
		let child: Int?
		let also: [Spec]?
	}

	struct Keyframe: Decodable, Sendable {
		let at: Double
		let transform: [Op]?
		let opacity: Double?

		init(at: Double, transform: [Op]?, opacity: Double?) {
			self.at = at
			self.transform = transform
			self.opacity = opacity
		}
	}

	/// `["translateY", -5]`, `["scale", 1.06, 0.9]`.
	struct Op: Decodable, Sendable {
		let fn: String
		let args: [Double]

		init(fn: String, args: [Double]) {
			self.fn = fn
			self.args = args
		}

		init(from decoder: Decoder) throws {
			var container = try decoder.unkeyedContainer()
			fn = try container.decode(String.self)
			var args: [Double] = []
			while !container.isAtEnd { args.append(try container.decode(Double.self)) }
			self.args = args
		}
	}

	struct Posture: Decodable, Sendable {
		let transform: [Op]
		let duration: Double
		let timing: String
	}

	struct Pace: Decodable, Sendable {
		let name: String?
		let duration: Double
	}

	struct Sit: Decodable, Sendable {
		let transform: [Op]
		let duration: Double
		let timing: String
		let feet: [Op]
		let breathe: String
	}

	struct Limb: Decodable, Sendable {
		let mood: String
		let target: String
		let side: String?
		let transform: [Op]
	}

	/// A rule that holds while flying: an animation, a transform, or a recolour.
	struct StateRule: Decodable, Sendable {
		let target: String
		/// "right" when it only applies facing right.
		let facing: String?
		let name: String?
		let duration: Double?
		let timing: String?
		let iterations: Double?
		let alternate: Bool?
		let transform: [Op]?
		let fill: String?
		let stroke: String?
		let side: String?
		let reverse: Bool?
		/// `transform-origin`, while the rule holds.
		let origin: String?

		var spec: Spec? {
			guard let name, let duration else { return nil }
			return Spec(
				name: name, duration: duration, timing: timing ?? "ease", delay: 0, iterations: iterations ?? 1,
				alternate: alternate ?? false, reverse: reverse, target: target, side: side, child: nil, also: nil
			)
		}
	}

	struct Base: Decodable, Sendable {
		/// Putting a prop on and taking it off (`.companion-worn`).
		let wear: Spec
		let unwear: Spec
		/// The timing of a walk, `.companion`'s transition.
		let travel: String
		let limbTransition: Double
		let origin: String
		let bob: Spec
		let pulse: Spec
		let look: [Op]
	}

	let base: Base
	let keyframes: [String: [Keyframe]]
	/// By the effect name the core plays.
	let effects: [String: Spec]
	/// By feeling.
	let postures: [String: Posture]
	/// The breathing's speed (and for `rattled`, its shape) by feeling.
	let pace: [String: Pace]
	let sit: Sit
	let singing: [Spec]
	let limbs: [Limb]
	/// Feet stepping, the right one half a step behind.
	let walking: [Spec]
	let flying: [StateRule]
	/// Up a ladder: the body rocks, the hands take turns.
	let climbing: [StateRule]
	/// Off a ledge: swinging from the top, hands up.
	let hanging: [StateRule]
	let ladder: Ladder

	struct Ladder: Decodable, Sendable {
		let up: Spec
		let down: Spec
	}
}
