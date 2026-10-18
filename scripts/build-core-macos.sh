#!/usr/bin/env bash
# Builds tico-core for macOS and generates the Swift bindings. Flint's script,
# minus its autorelease patch: that one wraps the core's callbacks into Swift,
# and this core has none yet — bring it over with the first host trait.
#   scripts/build-core-macos.sh [debug|release]
# debug   → host arch only (fast iteration)
# release → universal (arm64 + x86_64), LTO
# Outputs:
#   apps/macos/build/TicoCore.xcframework   (static lib + C headers + modulemap)
#   apps/macos/Tico/Bridge/tico.swift        (generated Swift API)
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PROFILE="${1:-release}"
export PATH="$HOME/.cargo/bin:$PATH"
export MACOSX_DEPLOYMENT_TARGET=14.0
cd "$ROOT"

case "$PROFILE" in
  release) TARGETS=(aarch64-apple-darwin x86_64-apple-darwin); CARGO_FLAG=--release; DIR=release ;;
  debug)   TARGETS=("$(uname -m | sed 's/arm64/aarch64/')-apple-darwin"); CARGO_FLAG=; DIR=debug ;;
  *) echo "usage: $0 [debug|release]" >&2; exit 1 ;;
esac

for t in "${TARGETS[@]}"; do
  cargo build -p tico-ffi --lib $CARGO_FLAG --target "$t"
done

WORK="$ROOT/target/xcframework"
rm -rf "$WORK" && mkdir -p "$WORK/headers" "$WORK/bindings"

LIBS=()
for t in "${TARGETS[@]}"; do LIBS+=("target/$t/$DIR/libtico_ffi.a"); done
lipo -create "${LIBS[@]}" -output "$WORK/libtico_ffi.a"

cargo run -q -p tico-ffi --bin uniffi-bindgen -- generate \
  --library "target/${TARGETS[0]}/$DIR/libtico_ffi.dylib" \
  --language swift --out-dir "$WORK/bindings"

cp "$WORK/bindings/ticoFFI.h" "$WORK/headers/"
cp "$WORK/bindings/ticoFFI.modulemap" "$WORK/headers/module.modulemap"

OUT="$ROOT/apps/macos/build/TicoCore.xcframework"
rm -rf "$OUT"
xcodebuild -create-xcframework -library "$WORK/libtico_ffi.a" -headers "$WORK/headers" -output "$OUT" >/dev/null

mkdir -p "$ROOT/apps/macos/Tico/Bridge"
cp "$WORK/bindings/tico.swift" "$ROOT/apps/macos/Tico/Bridge/tico.swift"
echo "✓ tico-core ($PROFILE) → $OUT"
