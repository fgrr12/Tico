import AppKit
import ServiceManagement
import SwiftUI

/// The preferences, as the Tauri build's `Prefs.tsx` lays them out: a "Tico"
/// tab where a body part or a thing to wear is chosen by pressing the place on
/// him and picking from drawings — a drawing needs no name and survives
/// translation — and a settings tab. Only what the native build already does is
/// offered: the burrow comes with its feature.
///
/// The words come from `src/prefs/copy.ts`, exported under `prefs` in
/// `art/copy.json`. Every change goes to the core, which saves `tico.json` and
/// redraws him on the next tick.
@MainActor
enum PrefsWindow {
	static func make(art: Art, brain: Brain, copy: PrefsCopy) -> NSWindow {
		let model = PrefsModel(brain: brain)
		let window = NSWindow(contentViewController: NSHostingController(rootView: PrefsView(art: art, model: model, copy: copy)))
		window.title = "tico"
		window.styleMask = [.titled, .closable]
		window.isReleasedWhenClosed = false
		window.center()
		return window
	}
}

@MainActor @Observable
final class PrefsModel {
	private let brain: Brain
	var settings: Settings {
		didSet { brain.updateSettings(settings: settings) }
	}
	var launchAtLogin = SMAppService.mainApp.status == .enabled {
		didSet {
			do {
				if launchAtLogin { try SMAppService.mainApp.register() } else { try SMAppService.mainApp.unregister() }
			} catch {
				launchAtLogin = SMAppService.mainApp.status == .enabled
			}
		}
	}

	init(brain: Brain) {
		self.brain = brain
		settings = brain.settings()
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

/// The six places on him you can press, and the body slot each one holds.
private let places: [(place: String, slot: String?)] = [
	("head", "antenna"), ("face", nil), ("neck", nil), ("body", "shell"), ("hand", "hands"), ("feet", "feet"),
]

private struct PrefsView: View {
	let art: Art
	@Bindable var model: PrefsModel
	let copy: PrefsCopy

	var body: some View {
		TabView {
			TicoTab(art: art, model: model, copy: copy)
				.tabItem { Text(copy["tabs", "body"]) }
			SettingsTab(model: model, copy: copy)
				.tabItem { Text(copy["tabs", "settings"]) }
		}
		.padding(16)
		.frame(width: 620, height: 470)
	}
}

private struct TicoTab: View {
	let art: Art
	@Bindable var model: PrefsModel
	let copy: PrefsCopy
	@State private var place = "body"
	@State private var showingParts = true

	var body: some View {
		let region = places.first { $0.place == place }
		let slot = showingParts ? region?.slot : nil
		HStack(alignment: .top, spacing: 18) {
			VStack(spacing: 12) {
				PetPreview(art: art, parts: model.parts, worn: pinned(), size: 150)
					.frame(width: 190, height: 200)
				ForEach(places, id: \.place) { p in
					if place == p.place {
						Button(copy["places", p.place]) { place = p.place }.buttonStyle(.borderedProminent)
					} else {
						Button(copy["places", p.place]) { place = p.place }.buttonStyle(.bordered)
					}
				}
			}
			.frame(width: 190)

			VStack(alignment: .leading, spacing: 10) {
				if region?.slot != nil {
					Picker("", selection: $showingParts) {
						Text(copy["kinds", "part"]).tag(true)
						Text(copy["kinds", "worn"]).tag(false)
					}
					.pickerStyle(.segmented)
					.labelsHidden()
				}
				ScrollView {
					LazyVGrid(columns: Array(repeating: GridItem(.fixed(78), spacing: 8), count: 4), spacing: 8) {
						if let slot {
							ForEach(art.slots[slot, default: [:]].keys.sorted(), id: \.self) { variant in
								var parts = model.parts
								let _ = parts[slot] = variant
								Tile(on: model.parts[slot] == variant) { model.setPart(slot, variant) } content: {
									PetPreview(art: art, parts: parts, worn: pinned(), size: 62)
								}
							}
						} else {
							Tile(on: model.settings.pinnedProps[place] == nil) { model.settings.pinnedProps[place] = nil } content: {
								Text(copy["pin", "none"]).font(.caption).foregroundStyle(.secondary)
							}
							ForEach(props(for: place), id: \.self) { kind in
								Tile(on: model.settings.pinnedProps[place] == kind) { model.settings.pinnedProps[place] = kind } content: {
									PetPreview(art: art, parts: model.parts, worn: pinned(with: kind, at: place), size: 62)
								}
							}
						}
					}
				}
			}
		}
		.onChange(of: place) { _, _ in showingParts = places.first { $0.place == place }?.slot != nil }
	}

	/// What is pinned, back to front, optionally trying `kind` on at `place`.
	private func pinned(with kind: String? = nil, at place: String? = nil) -> [String] {
		var pins = model.settings.pinnedProps
		if let kind, let place { pins[place] = kind }
		return wornFrom(pinned: pins, own: nil, leaving: false).map(\.kind)
	}

	/// Everything worn at `place`, souvenirs included: they can be pinned too.
	private func props(for place: String) -> [String] {
		art.props.keys.sorted().filter { kind in wears(kind: kind).map { "\($0)" } == place }
	}
}

private struct Tile<Content: View>: View {
	let on: Bool
	let action: () -> Void
	@ViewBuilder let content: Content

	var body: some View {
		Button(action: action) {
			content
				.frame(width: 74, height: 74)
				.background(Color(nsColor: Painter.nsColor("#2b2f3a")), in: RoundedRectangle(cornerRadius: 10))
				.overlay(RoundedRectangle(cornerRadius: 10).strokeBorder(on ? Color.accentColor : .clear, lineWidth: 2))
		}
		.buttonStyle(.plain)
	}
}

private struct SettingsTab: View {
	@Bindable var model: PrefsModel
	let copy: PrefsCopy

	var body: some View {
		Form {
			Section {
				Picker(copy["chattiness", "label"], selection: $model.settings.chattiness) {
					ForEach(["quiet", "normal", "chatty"], id: \.self) { Text(copy["chattiness", $0]).tag($0) }
				}
				.pickerStyle(.segmented)
			} footer: {
				Text(copy["chattiness", "hint"])
			}
			Section {
				Picker(copy["size", "label"], selection: $model.settings.size) {
					ForEach(["small", "normal", "large"], id: \.self) { Text(copy["size", $0]).tag($0) }
				}
				.pickerStyle(.segmented)
			}
			Section {
				Picker(copy["inCall", "label"], selection: $model.settings.inCall) {
					ForEach(["peek", "hide", "ignore"], id: \.self) { Text(copy["inCall", $0]).tag($0) }
				}
			} footer: {
				Text(copy["inCall", "hint"])
			}
			Section {
				Picker(copy["language", "label"], selection: $model.settings.language) {
					ForEach(["auto", "en", "es"], id: \.self) { Text(copy["language", $0]).tag($0) }
				}
				Toggle(copy["autostart", "label"], isOn: $model.launchAtLogin)
			}
			Section {
				Toggle(copy["titles", "label"], isOn: Binding(
					get: { model.settings.readTitles },
					set: { on in
						// A checkbox that ticks itself and then does nothing is worse than
						// none: without the grant, the request goes to where it is given.
						if on, !WindowTitle.trusted {
							WindowTitle.openAccessibilitySettings()
						} else {
							model.settings.readTitles = on
						}
					}
				))
			} footer: {
				Text(copy["titles", "hint"])
			}
		}
		.formStyle(.grouped)
	}
}

/// Him, drawn by the pet's own `Painter`, for the pickers.
struct PetPreview: NSViewRepresentable {
	let art: Art
	let parts: [String: String]
	let worn: [String]
	let size: CGFloat

	func makeNSView(context: Context) -> PreviewView { PreviewView() }

	func updateNSView(_ view: PreviewView, context: Context) {
		view.size = size
		view.host.sublayers = Pet.layers(art: art, parts: parts, worn: worn)
		view.needsLayout = true
	}
}

/// Places the drawing once the view knows its size, which SwiftUI only
/// settles after the first update.
final class PreviewView: NSView {
	let host = CALayer()
	var size: CGFloat = 60

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
		// Centred, nudged down a little: what he wears on his head reaches above him.
		host.position = CGPoint(x: (bounds.width - size) / 2, y: (bounds.height - size) / 2 - size * 0.12)
		host.setAffineTransform(CGAffineTransform(scaleX: size / Painter.size, y: size / Painter.size))
		CATransaction.commit()
	}
}
