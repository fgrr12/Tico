import CoreAudio

/// Is a microphone live anywhere — the Tauri build's `call.rs`, and the same
/// stand-in for "you are in a call". It asks whether the default input device
/// is running for some process; that is a property of the device, not of
/// anyone's audio, so it needs no permission and hears nothing.
enum Microphone {
	static var live: Bool {
		var device = AudioObjectID(0)
		var size = UInt32(MemoryLayout<AudioObjectID>.size)
		var address = AudioObjectPropertyAddress(
			mSelector: kAudioHardwarePropertyDefaultInputDevice,
			mScope: kAudioObjectPropertyScopeGlobal,
			mElement: kAudioObjectPropertyElementMain
		)
		guard AudioObjectGetPropertyData(AudioObjectID(kAudioObjectSystemObject), &address, 0, nil, &size, &device) == noErr,
			device != 0
		else { return false }
		var running = UInt32(0)
		size = UInt32(MemoryLayout<UInt32>.size)
		address.mSelector = kAudioDevicePropertyDeviceIsRunningSomewhere
		guard AudioObjectGetPropertyData(device, &address, 0, nil, &size, &running) == noErr else { return false }
		return running != 0
	}
}
