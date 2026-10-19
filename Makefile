# The native macOS build. `make` = debug build + install + launch.
# The Tauri app keeps its pnpm scripts (`pnpm t:d`, `pnpm t:b`).
CONFIG ?= Debug
APP_DIR := apps/macos
DERIVED := $(APP_DIR)/build/DerivedData
PROFILE := $(if $(filter Release,$(CONFIG)),release,debug)

.PHONY: all art core project app run test test-core test-app clean

all: run

# The drawing, as data, from the React components (see scripts/export-art.mjs).
art:
	node scripts/export-art.mjs

core:
	scripts/build-core-macos.sh $(PROFILE)

project: core
	scripts/setup-signing.sh
	cd $(APP_DIR) && xcodegen generate -q

app: project
	xcodebuild -project $(APP_DIR)/Tico.xcodeproj -scheme Tico -configuration $(CONFIG) \
		-derivedDataPath $(DERIVED) build -quiet

# Installs to ~/Applications, like Flint and Lyra, quitting whichever tico is
# running first — the Tauri one too, should it still be about: they share an id.
run: app
	-pkill -x tico
	rm -rf ~/Applications/tico.app
	cp -R $(DERIVED)/Build/Products/$(CONFIG)/tico.app ~/Applications/
	open ~/Applications/tico.app

test: test-core test-app

test-core:
	PATH="$$HOME/.cargo/bin:$$PATH" cargo test --workspace

test-app: project
	xcodebuild -project $(APP_DIR)/Tico.xcodeproj -scheme Tico -derivedDataPath $(DERIVED) test -quiet

clean:
	rm -rf target $(APP_DIR)/build $(APP_DIR)/Tico.xcodeproj $(APP_DIR)/Tico/Bridge
