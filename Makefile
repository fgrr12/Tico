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

# Installs to ~/Applications, like Flint and Lyra. Does not touch the Tauri tico
# in /Applications: this build draws nothing yet, and quitting the real pet on
# every build would be a poor trade. Start doing it once this one replaces it.
run: app
	-pkill -f '$(HOME)/Applications/tico.app'
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
