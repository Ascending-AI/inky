SHELL := /bin/bash
KEY ?= $(HOME)/.tauri/inky.key
BUNDLE_DIR := src-tauri/target/release/bundle

.DEFAULT_GOAL := help
.PHONY: help dev check dmg release icons open mcp clean web-dev web-build web-check

help: ## Show available targets
	@echo "Inky — available targets:" && echo
	@grep -E '^[a-zA-Z_-]+:.*?## ' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-10s\033[0m %s\n", $$1, $$2}'

dev: ## Run the app in development mode (hot reload)
	pnpm tauri dev

check: ## Type-check the frontend, then check and test the Rust backend and the release scripts
	pnpm check
	cd src-tauri && cargo check && cargo test
	node --test scripts/release-updates.test.mjs

dmg: ## Build the .app, .dmg and updater artifacts for this Mac (quick local build)
	TAURI_SIGNING_PRIVATE_KEY=$(KEY) TAURI_SIGNING_PRIVATE_KEY_PASSWORD="" pnpm tauri build
	@echo && echo "Artifacts:" && ls -1 $(BUNDLE_DIR)/dmg/*.dmg $(BUNDLE_DIR)/macos/Inky.app.tar.gz*

# CI runs this on a tag vX.Y.Z (.github/workflows/release.yml, docs/ops/desktop-release.md).
# APP_VERSION=1.2.3 sets the version; DOWNLOAD_BASE=https://… is the download host;
# APPLE_SIGNING_IDENTITY signs; APPLE_ID or APPLE_API_KEY notarizes. Details: scripts/release.sh.
release: ## Build Inky.app + DMG for other Macs and stage the download host's files
	KEY=$(KEY) scripts/release.sh

web-dev: ## The download site on http://localhost:5175 (web/)
	cd web && pnpm install && pnpm dev

web-build: ## Build the download site to web/dist (PUBLIC_DOWNLOAD_BASE=https://… sets another download host)
	cd web && pnpm install && pnpm build

web-check: ## Type-check and test the download site
	cd web && pnpm install && pnpm check && pnpm test

CHROME := /Applications/Google Chrome.app/Contents/MacOS/Google Chrome

icons: ## Regenerate all app icons, and the site's copies, from assets/icon.svg (transparent bg)
	"$(CHROME)" --headless --disable-gpu --screenshot=/tmp/inky-icon.png \
		--window-size=1024,1024 --default-background-color=00000000 \
		--hide-scrollbars "file://$(PWD)/assets/icon.svg" 2>/dev/null
	pnpm tauri icon /tmp/inky-icon.png
	rm -f /tmp/inky-icon.png
	cp src-tauri/icons/128x128@2x.png web/src/assets/icon.png
	cp src-tauri/icons/32x32.png web/src/assets/favicon.png

open: ## Open the last built release app
	open $(BUNDLE_DIR)/macos/Inky.app

mcp: ## Run the MCP server on stdio (dev build, for manual testing)
	cargo run --manifest-path src-tauri/Cargo.toml -- --mcp

clean: ## Remove frontend and bundle build outputs
	rm -rf build dist $(BUNDLE_DIR)
