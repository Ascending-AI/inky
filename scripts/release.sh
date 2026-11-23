#!/usr/bin/env bash
# make release: Inky.app, a DMG and the update files for other Macs. Run it through `make release`.
#
# - DOWNLOAD_BASE=https://downloads.example.com[/path]: the download host. The app reads its
#   updates from <base>/app/latest.json (a --config merge over tauri.conf.json). The default is
#   https://inky-downloads.ascending.ai.
# - The update key: TAURI_SIGNING_PRIVATE_KEY (the key's text), or else the key file KEY
#   (default ~/.tauri/inky.key; its password goes in TAURI_SIGNING_PRIVATE_KEY_PASSWORD). The
#   build signs the update with it. It must be the key whose public half is in tauri.conf.json
#   (plugins.updater.pubkey): the script fails on another key. This key is not the Apple
#   certificate.
# - APP_VERSION=1.2.3: the version of this build (a --config merge; tauri.conf.json stays as it
#   is). The release workflow sets it from the tag v1.2.3. Without it the version is the one in
#   tauri.conf.json.
# - Signing: APPLE_SIGNING_IDENTITY (a "Developer ID Application: …" identity in the Keychain)
#   signs; without it the app is signed ad hoc. With a Developer ID, APPLE_ID + APPLE_PASSWORD +
#   APPLE_TEAM_ID (or APPLE_API_KEY + APPLE_API_ISSUER + APPLE_API_KEY_PATH) make Tauri notarize
#   and staple the app. The script then notarizes and staples the DMG with the same account.
# - src-tauri/target/release/upload/ gets app/latest.json, app/<version>/Inky.app.tar.gz and
#   Inky.dmg, a mirror of DOWNLOAD_BASE.
set -euo pipefail
cd "$(dirname "$0")/.."

download_base=${DOWNLOAD_BASE:-https://inky-downloads.ascending.ai}
# One rule for the shell and the update files: scripts/release-updates.mjs decides.
node scripts/release-updates.mjs check-base "$download_base"

conf=src-tauri/tauri.conf.json
bundle=src-tauri/target/release/bundle
app="$bundle/macos/Inky.app"
bin="$app/Contents/MacOS/Inky"

tauri_args=(--bundles app,dmg)
version=${APP_VERSION:-}
if [ -n "$version" ]; then
  if ! [[ "$version" =~ ^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$ ]]; then
    echo "[release] APP_VERSION must be three numbers, e.g. 1.2.3 (got \"$version\")" >&2
    exit 1
  fi
  tauri_args+=(--config "{\"version\":\"$version\"}")
else
  version=$(node -p "require('./$conf').version")
fi
echo "[release] version: $version"

if [ -z "${TAURI_SIGNING_PRIVATE_KEY:-}" ]; then
  key=${KEY:-$HOME/.tauri/inky.key}
  if [ ! -f "$key" ]; then
    echo "[release] no update key: set TAURI_SIGNING_PRIVATE_KEY, or KEY=<key file> (no file at $key)" >&2
    exit 1
  fi
  TAURI_SIGNING_PRIVATE_KEY="$(cat "$key")"
fi
export TAURI_SIGNING_PRIVATE_KEY
export TAURI_SIGNING_PRIVATE_KEY_PASSWORD="${TAURI_SIGNING_PRIVATE_KEY_PASSWORD:-}"
tauri_args+=(--config "$(node scripts/release-updates.mjs config "$download_base")")
echo "[release] updates: from $download_base/app/latest.json"

notarize=0
if [ -n "${APPLE_SIGNING_IDENTITY:-}" ]; then
  echo "[release] signing as: $APPLE_SIGNING_IDENTITY"
  if [ -n "${APPLE_ID:-}${APPLE_API_KEY:-}" ]; then
    notarize=1
    echo "[release] notarization: on"
  else
    echo "[release] notarization: off (set APPLE_ID, APPLE_PASSWORD and APPLE_TEAM_ID)"
  fi
else
  echo "[release] no APPLE_SIGNING_IDENTITY: ad-hoc signature, not notarized"
fi

pnpm tauri build "${tauri_args[@]}"

echo
if otool -L "$bin" | grep -E '/opt/homebrew|/usr/local'; then
  echo "✗ $bin links the libraries above: it runs on this Mac only" >&2
  exit 1
fi
echo "✓ links only system libraries"
codesign --verify --deep --strict "$app"
codesign -dv "$app" 2>&1 | grep -E '^(Authority|Signature|TeamIdentifier)=' | head -3
if [ "$notarize" = 1 ]; then
  xcrun stapler validate "$app"
fi
echo "✓ app: $app"
# Tauri notarizes the app only. The DMG is the file people download, so it gets its own ticket:
# Gatekeeper then accepts the DMG itself, also on a Mac that is offline.
dmg="$bundle/dmg/Inky_${version}_aarch64.dmg"
if [ "$notarize" = 1 ]; then
  if [ -n "${APPLE_API_KEY:-}" ]; then
    notary_args=(--key "$APPLE_API_KEY_PATH" --key-id "$APPLE_API_KEY" --issuer "$APPLE_API_ISSUER")
  else
    notary_args=(--apple-id "$APPLE_ID" --password "$APPLE_PASSWORD" --team-id "$APPLE_TEAM_ID")
  fi
  echo "[release] notarizing the DMG"
  xcrun notarytool submit "$dmg" "${notary_args[@]}" --wait
  xcrun stapler staple "$dmg"
  xcrun stapler validate "$dmg"
  spctl --assess --type open --context context:primary-signature --verbose=2 "$dmg"
fi
echo "✓ dmg: $dmg"
upload=src-tauri/target/release/upload
rm -rf "$upload"
node scripts/release-updates.mjs stage "$download_base" "$version" "$bundle" "$upload" "$conf"
echo "✓ upload: $upload (copy app/$version/ before app/latest.json)"
