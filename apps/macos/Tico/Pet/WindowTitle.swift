import AppKit
import ApplicationServices

/// The focused window's title of the app in front — `window_title.rs`. It
/// needs Accessibility, the only permission any of tico's senses needs, so it
/// is read only when you turned "Read window titles" on and granted it. The
/// core filters it (`readable`) and never keeps or writes it.
enum WindowTitle {
	static var trusted: Bool { AXIsProcessTrusted() }

	static func front() -> String? {
		guard trusted, let pid = NSWorkspace.shared.frontmostApplication?.processIdentifier else { return nil }
		let app = AXUIElementCreateApplication(pid)
		var window: CFTypeRef?
		guard AXUIElementCopyAttributeValue(app, kAXFocusedWindowAttribute as CFString, &window) == .success,
			let window, CFGetTypeID(window) == AXUIElementGetTypeID()
		else { return nil }
		var title: CFTypeRef?
		guard AXUIElementCopyAttributeValue(window as! AXUIElement, kAXTitleAttribute as CFString, &title) == .success else {
			return nil
		}
		return title as? String
	}

	/// Where the grant is given: a prompt is easy to dismiss and hard to find again.
	static func openAccessibilitySettings() {
		if let url = URL(string: "x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility") {
			NSWorkspace.shared.open(url)
		}
	}
}
