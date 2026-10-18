import XCTest
@testable import tico

/// The skeleton's two promises: the core is linked, and the exported art is
/// whole — every name a face or a part refers to exists in the file.
final class SkeletonTests: XCTestCase {
	func testTheCoreIsLinked() {
		XCTAssertFalse(TicoCore().version().isEmpty)
	}

	func testEveryFaceSlotHasVariants() throws {
		let art = try Art.load(from: Bundle(for: AppDelegate.self))
		XCTAssertEqual(art.faces.count, 13)
		for (mood, face) in art.faces {
			let slots = (face.normal + face.singing + (face.blink ?? [])).filter { $0.tag == "slot" }.compactMap(\.name)
			XCTAssertEqual(Set(slots), ["shell", "hands", "feet", "antenna"], mood)
			for slot in slots { XCTAssertFalse(art.slots[slot, default: [:]].isEmpty, "\(mood): \(slot)") }
		}
	}

	func testEveryReferencedDefExists() throws {
		let art = try Art.load(from: Bundle(for: AppDelegate.self))
		let ids = Set(art.defs.compactMap { node -> String? in
			if case .string(let id) = node.attrs?["id"] { id } else { nil }
		})
		var refs: [String] = []
		func collect(_ node: ArtNode) {
			for value in node.attrs?.values ?? [:].values {
				let strings: [String] = switch value {
				case .string(let s): [s]
				case .style(let map): Array(map.values)
				}
				for s in strings { refs += s.matches(of: /url\(#([\w-]+)\)/).map { String($0.1) } }
			}
			node.children?.forEach(collect)
		}
		art.slots.values.flatMap(\.values).forEach(collect)
		art.props.values.forEach(collect)
		art.faces.values.flatMap { $0.normal + $0.singing }.forEach(collect)
		art.classStyles.values.flatMap(\.values).forEach { s in refs += s.matches(of: /url\(#([\w-]+)\)/).map { String($0.1) } }
		XCTAssertFalse(refs.isEmpty)
		for ref in Set(refs) { XCTAssertTrue(ids.contains(ref), "url(#\(ref)) is not in defs") }
	}
}
