import XCTest
@testable import tico

/// The path parser is the one piece of drawing logic with arithmetic in it;
/// everything else is checked by looking at the sheet (`TICO_SHEET=1`).
final class DrawingTests: XCTestCase {
	private func box(_ d: String) -> CGRect { SVGPath.parse(d).boundingBoxOfPath }

	func testNumbersThatRunTogether() {
		// The heart eye: signs and dots separate numbers without spaces.
		XCTAssertEqual(box("M0 0 L-4.6-4.6 L.5.5Z"), CGRect(x: -4.6, y: -4.6, width: 5.1, height: 5.1))
	}

	func testRelativeCommandsAndImplicitLineTos() {
		XCTAssertEqual(box("m10 10 5 0 0 5 h-5z"), CGRect(x: 10, y: 10, width: 5, height: 5))
	}

	func testArcIsAHalfCircle() {
		// From (0,0) to (20,0) with radius 10, sweeping through y = -10.
		let b = box("M0 0 A10 10 0 0 1 20 0")
		XCTAssertEqual(b.minX, 0, accuracy: 0.01)
		XCTAssertEqual(b.maxX, 20, accuracy: 0.01)
		XCTAssertEqual(b.minY, -10, accuracy: 0.01)
		XCTAssertEqual(b.maxY, 0, accuracy: 0.01)
	}

	func testArcRadiusTooSmallIsScaledUp() {
		// Radius 1 cannot span 20 units; SVG scales it to 10.
		XCTAssertEqual(box("M0 0 A1 1 0 0 0 20 0").height, 10, accuracy: 0.01)
	}

	func testArcFlagsMayTouchTheNextNumber() {
		XCTAssertEqual(box("M0 0 a10 10 0 0120 0").width, 20, accuracy: 0.01)
	}

	/// `SVGPath` draws M L H V C Q A Z. If the art ever uses anything else, the
	/// path would silently stop there; this is where that is caught.
	func testTheArtUsesOnlyCommandsTheParserDraws() throws {
		let art = try Art.load(from: Bundle(for: AppDelegate.self))
		var commands = Set<Character>()
		func collect(_ node: ArtNode) {
			if case .string(let d) = node.attrs?["d"] { commands.formUnion(d.filter(\.isLetter).filter { $0 != "e" && $0 != "E" }) }
			node.children?.forEach(collect)
		}
		art.slots.values.flatMap(\.values).forEach(collect)
		art.props.values.forEach(collect)
		art.faces.values.flatMap { $0.normal + $0.singing + ($0.blink ?? []) }.forEach(collect)
		XCTAssertTrue(commands.isSubset(of: Set("MmLlHhVvCcQqAaZz")), "unsupported: \(commands.subtracting("MmLlHhVvCcQqAaZz"))")
	}
}

/// The CSS-to-Core-Animation conversion, where the arithmetic is.
@MainActor
final class MotionTests: XCTestCase {
	func testTimingCurves() {
		XCTAssertEqual(CSSMotion.ease(0.5, CSSMotion.bezier("linear")), 0.5, accuracy: 0.001)
		XCTAssertEqual(CSSMotion.ease(0, CSSMotion.bezier("ease")), 0, accuracy: 0.001)
		XCTAssertEqual(CSSMotion.ease(1, CSSMotion.bezier("ease")), 1, accuracy: 0.001)
		// The springy curves overshoot, which is the point of them.
		let spring = CSSMotion.bezier("cubic-bezier(0.34, 1.56, 0.64, 1)")
		XCTAssertGreaterThan((0..<100).map { CSSMotion.ease(Double($0) / 100, spring) }.max()!, 1)
	}

	func testASpinTurnsThroughHalfWay() {
		// A matrix blend sees the same matrix at 0° and 360° and never moves.
		let half = CSSMotion.blend([.init(fn: "rotate", args: [0])], [.init(fn: "rotate", args: [360])], 0.5)
		XCTAssertEqual(half.m11, -1, accuracy: 0.001)
	}

	func testAxesFlipOnceHere() {
		// CSS y is down; a layer's is up. CSS turns clockwise; a layer, the other way.
		XCTAssertEqual(CSSMotion.transform([.init(fn: "translateY", args: [-18])]).m42, 18)
		XCTAssertLessThan(CSSMotion.transform([.init(fn: "rotate", args: [16])]).m12, 0)
	}

	func testAShorterListIsPaddedNotSwapped() {
		// `translateY(0) scaleY(1)` → `translateY(-18) scaleY(1.08) scaleX(0.95)`.
		let mid = CSSMotion.blend(
			[.init(fn: "translateY", args: [0]), .init(fn: "scaleY", args: [1])],
			[.init(fn: "translateY", args: [-18]), .init(fn: "scaleY", args: [1.08]), .init(fn: "scaleX", args: [0.95])],
			0.5
		)
		XCTAssertEqual(mid.m42, 9, accuracy: 0.01)
		XCTAssertEqual(mid.m11, 0.975, accuracy: 0.01)
	}
}
