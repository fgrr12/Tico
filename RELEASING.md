# Releasing tico

## Cutting one

```sh
# tauri.conf.json's version and the tag have to match — CI refuses otherwise
git tag v0.1.0 && git push origin v0.1.0
```

`.github/workflows/release.yml` then builds on all four targets — macOS on both
architectures, Windows, Linux — and hangs every bundle off a **draft** release.
It stops there on purpose: the last step is a person reading the page and
pressing Publish, because the alternative is a mistyped tag becoming an
announcement. The draft already carries the unsigned-install instructions below.

Building by hand is still what the rest of this file is about, and it is what CI
is doing on your behalf.

---

`pnpm t:b` produces both bundles on macOS:

```
src-tauri/target/release/bundle/macos/tico.app      13 MB
src-tauri/target/release/bundle/dmg/tico_x.y.z_aarch64.dmg   4.2 MB
```

That build runs perfectly **on the machine that made it** and will be refused by
almost every other one. This file is about the gap between those two facts.

## The path this project actually takes

tico is for its author and about three other people, so **it is not signed and
will not be**. Notarization is $99/year to remove one right-click, and at four
users that is not a trade worth making.

Handing it to someone therefore means handing them one command as well:

```sh
# After copying tico.app to /Applications
xattr -d com.apple.quarantine /Applications/tico.app
```

Without it macOS says *"tico is damaged and can't be opened"*, which is its
unhelpful phrasing for "unsigned" and alarms people who have done nothing wrong.
Right-click → Open works too, but only on some macOS versions and it is harder to
explain over a message.

Everything below stays for the day this is handed to a fifth person who will not
run a command.

## Where an unsigned build stands right now

```
$ codesign -dv target/release/bundle/macos/tico.app
Signature=adhoc
TeamIdentifier=not set

$ spctl -a -vvv target/release/bundle/macos/tico.app
code has no resources but signature indicates they must be present
```

`adhoc, linker-signed` is what the Rust linker puts there so the binary can run
at all on Apple silicon. It is not an identity. Anyone you send this to gets
*"tico is damaged and can't be opened"* — which is Gatekeeper's unhelpful way of
saying "unsigned", and which no amount of README text talks people through.

Right-click → Open, or `xattr -d com.apple.quarantine`, gets you past it on your
own machine. Neither is something to ask a stranger to do.

## macOS: what actually has to happen

1. **Apple Developer Program — $99/year.** There is no free path to notarization.
2. **A Developer ID Application certificate** from the developer portal, installed
   in the login keychain. Not the "Mac App Store" one — that is a different
   certificate for a distribution channel this app cannot use anyway, because
   `macos-private-api` (the thing that makes the window transparent) is grounds
   for App Store rejection.
3. **An App Store Connect API key** (Issuer ID, Key ID, `.p8` file) for
   notarytool. Preferred over an app-specific password: it does not expire when
   the Apple ID password changes.
4. Set these before `pnpm t:b`:

   ```
   APPLE_SIGNING_IDENTITY="Developer ID Application: Your Name (TEAMID)"
   APPLE_API_ISSUER=...
   APPLE_API_KEY=...
   APPLE_API_KEY_PATH=/absolute/path/AuthKey_XXXXXXXX.p8
   ```

   Tauri signs and submits for notarization on its own when they are present.
   **Never commit them.** Locally they belong in a shell profile or a `.env` that
   is git-ignored; in CI, in the repository's secrets.

5. Verify what came out, rather than assuming:

   ```
   codesign -dv --verbose=2 tico.app       # expect Developer ID, a TeamIdentifier
   spctl -a -vvv tico.app                  # expect "accepted, source=Notarized Developer ID"
   xcrun stapler validate tico.app
   ```

Notarization takes minutes, not seconds, and it can fail for reasons the build
never mentions — an unsigned nested binary, a missing hardened runtime. Read the
log it gives you rather than retrying.

## Windows

Needs a code-signing certificate (OV is roughly $200–400/year; EV is more and
clears SmartScreen faster). Without one, SmartScreen shows a full-screen
"Windows protected your PC" the first time anyone runs the installer, and a new
OV certificate still earns that warning until it has built up reputation.

It also needs an actual Windows machine or runner to build on — and note that
`active_app.rs` and `call.rs` are stubbed there, so the pet ships without his
opinions until those are written.

## Linux

`.deb` and `.AppImage` come out of the same `pnpm t:b`, unsigned, which is normal
and expected on Linux. The real constraint is not signing but AD-6: GNOME Wayland
cannot position a window, so the strip has nowhere to be.

## Before tagging a release

- [ ] Version bumped in `package.json`, `src-tauri/Cargo.toml` and
      `src-tauri/tauri.conf.json` — three places, and they must match.
- [ ] Launch the built `.app`, not the dev build. `debug_assertions` is off, so
      the `[tico]` logs are gone and any behaviour that leaned on them is on its
      own.
- [ ] Two instances cannot run at once (single-instance plugin).
- [ ] Tray icon renders as a template — check it on a **light** menu bar.
- [ ] With Ollama stopped, the ask hotkey still answers with the no-brain line
      rather than hanging.
- [ ] Start at login toggles, and survives a reboot.
