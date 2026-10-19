import AppKit
import ServiceManagement
import SwiftUI

/// The preferences, drawn the way `Prefs.tsx` and `prefs.css` draw them: a
/// dark pane in the pet's mono type, two pill tabs, settings as rows of a name
/// and a hint beside chips, and a "Tico" tab where you press a bit of him and
/// the options come out of that bit in a ring of close-ups.
///
/// The words come from `src/prefs/copy.ts`, exported under `prefs` in
/// `art/copy.json`. Every change goes to the core, which saves `tico.json` and
/// redraws him on the next tick.
@MainActor
enum PrefsWindow {
	static func make(art: Art, model: PrefsModel) -> NSWindow {
		let window = NSWindow(contentViewController: NSHostingController(rootView: PrefsView(art: art, model: model)))
		window.title = "tico"
		window.styleMask = [.titled, .closable]
		window.isReleasedWhenClosed = false
		window.appearance = NSAppearance(named: .darkAqua)
		window.backgroundColor = Painter.nsColor(Tone.pane)
		// Its size now, not when SwiftUI gets round to it: otherwise it is
		// centred while still small and then grows off to one side.
		window.setContentSize(NSSize(width: 720 + 48, height: 640))
		window.center()
		return window
	}
}

/// companion.css's tokens, the ones the preferences use.
private enum Tone {
	static let pane = "#1a1c23"
	static let chrome = "#21242c"
	static let raise = "#262a34"
	static let line = "#2a2e3a"
	static let lineStrong = "#363b4a"
	static let fg = "#c8d0e0"
	static let muted = "#6b7489"
	static let purple = "#bb9af7"
	static let green = "#9ece6a"
	static let amber = "#e0af68"
}

private extension Color {
	init(tone: String, opacity: Double = 1) {
		self = Color(nsColor: Painter.nsColor(tone)).opacity(opacity)
	}
}

private let mono = Font.system(size: 13, design: .monospaced)

@MainActor @Observable
final class PrefsModel {
	private let brain: Brain
	private let copyJSON: String
	private let system: String
	/// What the window shows and edits. A change goes to the core as only the
	/// fields this window edits, laid over the core's current settings: the
	/// menu's Quiet and where he stands change behind its back, and writing
	/// the whole of a stale copy back would undo them.
	var settings: Settings {
		didSet {
			guard !syncing else { return }
			var live = brain.settings()
			live.chattiness = settings.chattiness
			live.size = settings.size
			live.inCall = settings.inCall
			live.readTitles = settings.readTitles
			live.language = settings.language
			live.house = settings.house
			live.parts = settings.parts
			live.pinnedProps = settings.pinnedProps
			live.menuBarIcon = settings.menuBarIcon
			brain.updateSettings(settings: live)
			onChange?()
			if settings.language != oldValue.language { copy = Self.copy(copyJSON, settings.language, system) }
		}
	}
	@ObservationIgnored private var syncing = false
	/// Told after every change, for what lives outside the window (the menu bar icon).
	@ObservationIgnored var onChange: (() -> Void)?
	/// The window's words, in the language it is set to, redrawn when that changes.
	private(set) var copy: PrefsCopy
	var launchAtLogin = SMAppService.mainApp.status == .enabled {
		didSet {
			guard launchAtLogin != (SMAppService.mainApp.status == .enabled) else { return }
			do {
				if launchAtLogin { try SMAppService.mainApp.register() } else { try SMAppService.mainApp.unregister() }
			} catch {
				launchAtLogin = SMAppService.mainApp.status == .enabled
			}
		}
	}

	init(brain: Brain, copyJSON: String, system: String) {
		self.brain = brain
		self.copyJSON = copyJSON
		self.system = system
		let settings = brain.settings()
		self.settings = settings
		copy = Self.copy(copyJSON, settings.language, system)
	}

	/// The core's settings as they are now, read each time the window opens.
	func refresh() {
		syncing = true
		settings = brain.settings()
		syncing = false
		copy = Self.copy(copyJSON, settings.language, system)
	}

	private static func copy(_ json: String, _ language: String, _ system: String) -> PrefsCopy {
		PrefsCopy(json: json, language: language == "auto" ? system : language)
	}

	var parts: [String: String] {
		let p = settings.parts
		return ["shell": p.shell, "hands": p.hands, "feet": p.feet, "antenna": p.antenna]
	}

	func setPart(_ slot: String, _ variant: String) {
		switch slot {
		case "shell": settings.parts.shell = variant
		case "hands": settings.parts.hands = variant
		case "feet": settings.parts.feet = variant
		default: settings.parts.antenna = variant
		}
	}
}

/// `prefs` from `art/copy.json`, in one language.
struct PrefsCopy {
	let raw: [String: Any]

	init(json: String, language: String) {
		let all = (try? JSONSerialization.jsonObject(with: Data(json.utf8))) as? [String: Any] ?? [:]
		let lines = (all[language] as? [String: Any]) ?? (all["en"] as? [String: Any]) ?? [:]
		raw = lines["prefs"] as? [String: Any] ?? [:]
	}

	subscript(_ section: String, _ key: String) -> String {
		(raw[section] as? [String: Any])?[key] as? String ?? key
	}
}

/// The six of him you can press, top to bottom: the place, the part it also
/// holds, and where its handle sits in his own 96-unit drawing.
private let regions: [(place: String, slot: String?, at: CGPoint)] = [
	("head", "antenna", CGPoint(x: 48, y: -2)),
	("face", nil, CGPoint(x: 78, y: 42)),
	("body", "shell", CGPoint(x: 16, y: 28)),
	("hand", "hands", CGPoint(x: 1, y: 60)),
	("neck", nil, CGPoint(x: 48, y: 80)),
	("feet", "feet", CGPoint(x: 28, y: 92)),
]

/// What each list is a close-up of, `[x, y, size]` in his drawing (y down):
/// at thumbnail size a whole pet is a blob with a speck on it, and the speck
/// is the thing being chosen. Negative y because hats go above the viewBox.
private let crops: [String: (CGFloat, CGFloat, CGFloat)] = [
	"head:part": (30, -14, 40), "head:worn": (14, -12, 68), "face:worn": (26, 28, 44),
	"body:part": (-2, -2, 100), "body:worn": (2, 12, 50), "hand:part": (74, 44, 32),
	"hand:worn": (-22, 4, 72), "neck:worn": (26, 54, 44), "feet:part": (52, 62, 34),
	"feet:worn": (14, 58, 46),
]

private struct PrefsView: View {
	let art: Art
	@Bindable var model: PrefsModel
	var copy: PrefsCopy { model.copy }
	// `TICO_PREFS=body:neck` opens on a tab and a place, for looking at it.
	@State private var tab = Self.start.first ?? "settings"
	@State private var open: String? = Self.start.count > 1 ? Self.start[1] : nil
	@State private var showing = Self.start.count > 2 ? Self.start[2] : "part"
	private static let start = (ProcessInfo.processInfo.environment["TICO_PREFS"] ?? "").split(separator: ":").map(String.init)

	var body: some View {
		VStack(spacing: 0) {
			HStack(spacing: 6) {
				ForEach(["settings", "body"], id: \.self) { id in
					Button(copy["tabs", id]) { tab = id }
						.buttonStyle(TabStyle(on: tab == id))
				}
				Spacer()
				if tab == "body", let open {
					let region = regions.first { $0.place == open }
					VStack(alignment: .trailing, spacing: 2) {
						Text(copy["places", open].uppercased()).font(.system(size: 11, design: .monospaced)).kerning(1)
							.foregroundStyle(Color(tone: Tone.fg))
						Text(copy["kinds", region?.slot == nil ? "worn" : showing].uppercased())
							.font(.system(size: 9.5, design: .monospaced)).kerning(0.8).foregroundStyle(Color(tone: Tone.muted))
					}
				}
			}
			.padding(.top, 18)
			.padding(.bottom, 12)
			.overlay(alignment: .bottom) { Rectangle().fill(Color(tone: Tone.line)).frame(height: 1) }

			if tab == "settings" {
				SettingsPanel(model: model)
			} else {
				Cas(art: art, model: model, open: $open, showing: $showing)
					.padding(.top, 12)
			}
		}
		.font(mono)
		.foregroundStyle(Color(tone: Tone.fg))
		.padding(.horizontal, 24)
		.padding(.bottom, 24)
		.frame(width: 720 + 48, height: 640)
		.background(Color(tone: Tone.pane))
	}
}

private struct TabStyle: ButtonStyle {
	let on: Bool
	func makeBody(configuration: Configuration) -> some View {
		configuration.label
			.padding(.vertical, 7).padding(.horizontal, 16)
			.foregroundStyle(Color(tone: on ? Tone.fg : Tone.muted))
			.background(RoundedRectangle(cornerRadius: 8).fill(on ? Color(tone: Tone.raise) : .clear))
			.overlay(RoundedRectangle(cornerRadius: 8).strokeBorder(on ? Color(tone: Tone.lineStrong) : .clear))
			.contentShape(Rectangle())
	}
}

private struct ChipStyle: ButtonStyle {
	let on: Bool
	func makeBody(configuration: Configuration) -> some View {
		configuration.label
			.padding(.vertical, 7).padding(.horizontal, 13)
			.foregroundStyle(Color(tone: on ? Tone.fg : Tone.muted))
			.background(RoundedRectangle(cornerRadius: 8).fill(Color(tone: on ? Tone.raise : Tone.chrome)))
			.overlay(RoundedRectangle(cornerRadius: 8).strokeBorder(Color(tone: on ? Tone.purple : Tone.lineStrong)))
			.contentShape(Rectangle())
	}
}

/// `input[type=checkbox]` with `accent-color: var(--purple)`.
private struct Check: View {
	let on: Bool
	let toggle: () -> Void
	var body: some View {
		Button(action: toggle) {
			RoundedRectangle(cornerRadius: 3)
				.fill(on ? Color(tone: Tone.purple) : Color.white)
				.frame(width: 16, height: 16)
				.overlay {
					if on {
						Image(systemName: "checkmark").font(.system(size: 10, weight: .bold)).foregroundStyle(Color(tone: Tone.pane))
					}
				}
		}
		.buttonStyle(.plain)
	}
}

private struct SettingsPanel: View {
	@Bindable var model: PrefsModel
	var copy: PrefsCopy { model.copy }

	var body: some View {
		ScrollView {
			VStack(spacing: 0) {
				row("chattiness", hint: true) { chips(["quiet", "normal", "chatty"], section: "chattiness", value: $model.settings.chattiness) }
				row("size") { chips(["small", "normal", "large"], section: "size", value: $model.settings.size) }
				row("inCall", hint: true) { chips(["peek", "hide", "ignore"], section: "inCall", value: $model.settings.inCall) }
				row("language") { chips(["auto", "en", "es"], section: "language", value: $model.settings.language) }
				row("house", hint: true) { Check(on: model.settings.house) { model.settings.house.toggle() } }
				// Only with Flint installed: without it the icon is the way in.
				if AppDelegate.flintInstalled {
					row("menuBar", hint: true) { Check(on: model.settings.menuBarIcon) { model.settings.menuBarIcon.toggle() } }
				}
				row("titles", hint: true) {
					Check(on: model.settings.readTitles) {
						// Ticked from the settings, not from the click: without the
						// grant the request goes to where it is given and nothing changes.
						if !model.settings.readTitles, !WindowTitle.trusted {
							WindowTitle.openAccessibilitySettings()
						} else {
							model.settings.readTitles.toggle()
						}
					}
				}
				row("autostart", last: true) { Check(on: model.launchAtLogin) { model.launchAtLogin.toggle() } }
			}
		}
		.scrollIndicators(.never)
	}

	private func row(_ section: String, hint: Bool = false, last: Bool = false, @ViewBuilder control: () -> some View) -> some View {
		HStack(alignment: .top, spacing: 20) {
			VStack(alignment: .leading, spacing: 5) {
				Text(copy[section, "label"])
				if hint {
					Text(copy[section, "hint"]).font(.system(size: 11, design: .monospaced)).lineSpacing(3)
						.foregroundStyle(Color(tone: Tone.muted)).fixedSize(horizontal: false, vertical: true)
				}
			}
			.frame(width: 210, alignment: .leading)
			control().frame(maxWidth: .infinity, alignment: .leading)
		}
		.padding(.vertical, 18)
		.overlay(alignment: .bottom) {
			if !last { Rectangle().fill(Color(tone: Tone.line)).frame(height: 1) }
		}
	}

	private func chips(_ ids: [String], section: String, value: Binding<String>) -> some View {
		Flow(spacing: 6) {
			ForEach(ids, id: \.self) { id in
				Button { value.wrappedValue = id } label: { Text(copy[section, id]).lineLimit(1).fixedSize() }
					.buttonStyle(ChipStyle(on: value.wrappedValue == id))
			}
		}
	}
}

/// Chips in a row that wraps when it runs out of room, as `flex-wrap` does in
/// prefs.css — an `HStack` of fixed-size chips instead grows past the window
/// and the whole pane is clipped on both sides.
private struct Flow: Layout {
	var spacing: CGFloat

	func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
		let rows = arrange(subviews, width: proposal.width ?? .infinity)
		return CGSize(width: rows.map(\.width).max() ?? 0, height: rows.last.map { $0.y + $0.height } ?? 0)
	}

	func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
		for row in arrange(subviews, width: bounds.width) {
			var x = bounds.minX
			for index in row.items {
				let size = subviews[index].sizeThatFits(.unspecified)
				subviews[index].place(at: CGPoint(x: x, y: bounds.minY + row.y), proposal: ProposedViewSize(size))
				x += size.width + spacing
			}
		}
	}

	private func arrange(_ subviews: Subviews, width: CGFloat) -> [(items: [Int], width: CGFloat, height: CGFloat, y: CGFloat)] {
		var rows: [(items: [Int], width: CGFloat, height: CGFloat, y: CGFloat)] = []
		for (index, view) in subviews.enumerated() {
			let size = view.sizeThatFits(.unspecified)
			if var row = rows.last, row.width + spacing + size.width <= width {
				row.items.append(index)
				row.width += spacing + size.width
				row.height = max(row.height, size.height)
				rows[rows.count - 1] = row
			} else {
				let y = rows.last.map { $0.y + $0.height + spacing } ?? 0
				rows.append(([index], size.width, size.height, y))
			}
		}
		return rows
	}
}

/// The "Tico" tab: him on a soft glow, a handle on each bit of him, and the
/// options for the pressed bit fanned round the ring.
private struct Cas: View {
	let art: Art
	@Bindable var model: PrefsModel
	var copy: PrefsCopy { model.copy }
	@Binding var open: String?
	@Binding var showing: String

	var body: some View {
		GeometryReader { geo in
			let side = min(geo.size.width, geo.size.height)
			let figure = side * 0.58
			let center = CGPoint(x: geo.size.width / 2, y: geo.size.height / 2)
			let origin = CGPoint(x: center.x - figure / 2, y: center.y - figure / 2)
			let unit = figure / 96
			let point = { (p: CGPoint) in CGPoint(x: origin.x + p.x * unit, y: origin.y + p.y * unit) }
			let region = regions.first { $0.place == open }
			let kind = region?.slot == nil ? "worn" : showing

			ZStack(alignment: .topLeading) {
				RoundedRectangle(cornerRadius: 20).fill(
					RadialGradient(
						colors: [Color(tone: "#2b3143"), Color(tone: "#1d2029"), .clear],
						center: UnitPoint(x: 0.5, y: 0.46), startRadius: 0, endRadius: side * 0.58
					)
				)
				PetPreview(art: art, parts: model.parts, worn: pinned(), size: figure, crop: nil)
					.frame(width: figure, height: figure)
					.position(center)

				ForEach(regions, id: \.place) { r in
					Button { press(r.place) } label: {
						Circle()
							.fill(open == r.place ? Color(tone: Tone.green, opacity: 0.35) : Color(red: 20 / 255, green: 22 / 255, blue: 28 / 255, opacity: 0.5))
							.overlay(Circle().strokeBorder(open == r.place ? Color(tone: Tone.green) : Color(tone: Tone.fg, opacity: 0.55), lineWidth: 2))
							.frame(width: 20, height: 20)
					}
					.buttonStyle(.plain)
					.help(copy["places", r.place])
					.position(point(r.at))
				}

				if let region {
					let lists = region.slot == nil ? ["worn"] : ["part", "worn"]
					let a = atan2(region.at.y - 48, region.at.x - 48)
					ForEach(Array(lists.enumerated()), id: \.element) { index, one in
						let spread: CGFloat = lists.count == 1 ? 0 : CGFloat(index) * 30 - 15
						let x = region.at.x + cos(a) * 6 - sin(a) * spread
						let y = region.at.y + sin(a) * 6 + cos(a) * spread
						Orb(size: 30, on: kind == one, dashed: false) { showing = one } content: {
							PetPreview(
								art: art, parts: model.parts, worn: one == "part" ? bare(region.place) : pinned(),
								size: 30, crop: crops["\(region.place):\(one)"]
							)
						}
						.help(copy["kinds", one])
						.position(point(CGPoint(x: x, y: y)))
					}

					let options = choices(region: region, kind: kind)
					let from = atan2(region.at.y - 48, region.at.x - 48)
					let step = min(2 * .pi / CGFloat(max(options.count, 1)), 0.48)
					let radius = side / 2 - 34
					ForEach(Array(options.enumerated()), id: \.element.id) { index, option in
						let angle = from + CGFloat(index) * step
						Orb(size: 58, on: option.on, dashed: option.id == "none", action: option.choose) {
							PetPreview(art: art, parts: option.parts, worn: option.worn, size: 58, crop: crops["\(region.place):\(kind)"])
						}
						.help(option.label)
						.position(x: center.x + cos(angle) * radius, y: center.y + sin(angle) * radius)
					}
				}
			}
		}
	}

	private struct Choice {
		let id: String
		let label: String
		let parts: [String: String]
		let worn: [String]
		let on: Bool
		let choose: () -> Void
	}

	private func choices(region: (place: String, slot: String?, at: CGPoint), kind: String) -> [Choice] {
		if kind == "part", let slot = region.slot {
			return art.slots[slot, default: [:]].keys.sorted().map { variant in
				var parts = model.parts
				parts[slot] = variant
				return Choice(id: variant, label: variant, parts: parts, worn: bare(region.place), on: model.parts[slot] == variant) {
					model.setPart(slot, variant)
				}
			}
		}
		let none = Choice(
			id: "none", label: copy["pin", "none"], parts: model.parts, worn: pinned(clearing: region.place),
			on: model.settings.pinnedProps[region.place] == nil
		) { model.settings.pinnedProps[region.place] = nil }
		return [none] + props(for: region.place).map { kind in
			Choice(
				id: kind, label: kind, parts: model.parts, worn: pinned(trying: kind, at: region.place),
				on: model.settings.pinnedProps[region.place] == kind
			) { model.settings.pinnedProps[region.place] = kind }
		}
	}

	private func press(_ place: String) {
		open = open == place ? nil : place
		showing = "part"
	}

	/// What is pinned, back to front.
	private func pinned() -> [String] {
		wornFrom(pinned: model.settings.pinnedProps, own: nil, leaving: false).map(\.kind)
	}

	private func pinned(trying kind: String, at place: String) -> [String] {
		var pins = model.settings.pinnedProps
		pins[place] = kind
		return wornFrom(pinned: pins, own: nil, leaving: false).map(\.kind)
	}

	private func pinned(clearing place: String) -> [String] {
		var pins = model.settings.pinnedProps
		pins[place] = nil
		return wornFrom(pinned: pins, own: nil, leaving: false).map(\.kind)
	}

	/// A part is shown bare: everything pinned except at its own place.
	private func bare(_ place: String) -> [String] { pinned(clearing: place) }

	/// What can be pinned at `place`: the props he picks from, not the souvenirs.
	private func props(for place: String) -> [String] {
		[
			"party", "tophat", "shades", "crown", "flower", "scarf", "coffee", "afro", "mohawk", "longhair", "beanie",
			"cap", "hood", "catears", "glasses", "moustache", "tie", "bowtie", "cape", "duck", "umbrella", "sneakers",
			"wellies", "monocle", "ninjamask",
		]
		.filter { kind in wears(kind: kind).map { "\($0)" } == place }
	}
}

/// `.prefs-orb` / `.prefs-kind`: a round close-up with a soft shadow; green
/// when chosen, dashed amber for "nothing".
private struct Orb<Content: View>: View {
	let size: CGFloat
	let on: Bool
	let dashed: Bool
	let action: () -> Void
	@ViewBuilder let content: Content
	@State private var hover = false

	var body: some View {
		Button(action: action) {
			content
				.frame(width: size, height: size)
				.background(LinearGradient(colors: [Color(tone: "#333a4c"), Color(tone: "#262b38")], startPoint: .top, endPoint: .bottom))
				.clipShape(Circle())
				.overlay(
					Circle().strokeBorder(
						on ? Color(tone: Tone.green) : dashed ? Color(tone: Tone.amber, opacity: 0.7) : Color(tone: Tone.fg, opacity: hover ? 0.65 : 0.3),
						style: StrokeStyle(lineWidth: 2, dash: dashed && !on ? [4, 3] : [])
					)
				)
				.background(Circle().stroke(on ? Color(tone: Tone.green, opacity: 0.22) : .clear, lineWidth: 6).padding(-1))
				.shadow(color: .black.opacity(0.45), radius: 6, y: 4)
		}
		.buttonStyle(.plain)
		.scaleEffect(hover ? 1.12 : 1)
		.animation(.easeOut(duration: 0.14), value: hover)
		.onHover { hover = $0 }
	}
}

/// Him, drawn by the pet's own `Painter` — whole, or cropped to `[x, y, size]`
/// of his drawing (y down) so the part being chosen fills the circle.
struct PetPreview: NSViewRepresentable {
	let art: Art
	let parts: [String: String]
	let worn: [String]
	let size: CGFloat
	var crop: (CGFloat, CGFloat, CGFloat)?

	func makeNSView(context: Context) -> PreviewView { PreviewView() }

	func updateNSView(_ view: PreviewView, context: Context) {
		view.size = size
		view.crop = crop
		view.host.sublayers = Pet.layers(art: art, parts: parts, worn: worn)
		view.needsLayout = true
	}
}

/// Places the drawing once the view knows its size, which SwiftUI only
/// settles after the first update.
final class PreviewView: NSView {
	let host = CALayer()
	var size: CGFloat = 60
	var crop: (CGFloat, CGFloat, CGFloat)?

	init() {
		super.init(frame: .zero)
		wantsLayer = true
		host.anchorPoint = .zero
		host.bounds = CGRect(x: 0, y: 0, width: Painter.size, height: Painter.size)
		layer?.addSublayer(host)
	}

	@available(*, unavailable)
	required init?(coder: NSCoder) { fatalError() }

	override func layout() {
		super.layout()
		CATransaction.begin()
		CATransaction.setDisableActions(true)
		if let (x, y, span) = crop {
			// The span of his drawing fills the view; the drawing is y-up.
			let scale = bounds.width / span
			host.setAffineTransform(CGAffineTransform(scaleX: scale, y: scale))
			host.position = CGPoint(x: -x * scale, y: -(Painter.size - y - span) * scale)
		} else {
			host.setAffineTransform(CGAffineTransform(scaleX: size / Painter.size, y: size / Painter.size))
			host.position = CGPoint(x: (bounds.width - size) / 2, y: (bounds.height - size) / 2)
		}
		CATransaction.commit()
	}
}
