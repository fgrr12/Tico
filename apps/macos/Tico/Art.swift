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
