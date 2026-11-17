#!/usr/bin/env node
/**
 * Assemble a GitHub-release folder in dist/release from whichever platforms
 * were built:
 *   macOS:   Inky_<version>_aarch64.dmg (new users), Inky.app.tar.gz + .sig (updater)
 *   Windows: Inky_<version>_x64-setup.exe (new users and updater) + .sig
 *   latest.json — the updater feed covering every platform found (upload as-is)
 *
 * Artifacts are looked up under the local bundle folder, or under the folders
 * given as arguments (CI downloads each platform's bundle into its own folder):
 *   node scripts/release.mjs [dir…]
 *
 * The download URL is derived from the updater endpoint in tauri.conf.json;
 * override the repo with:  REPO=owner/name node scripts/release.mjs
 */
import fs from "node:fs";
import path from "node:path";

const root = path.join(import.meta.dirname, "..");
const conf = JSON.parse(fs.readFileSync(path.join(root, "src-tauri/tauri.conf.json"), "utf8"));
const version = conf.version;
const bundle = path.join(root, "src-tauri/target/release/bundle");

let repo = process.env.REPO;
if (!repo) {
  const endpoint = conf.plugins?.updater?.endpoints?.[0] ?? "";
  const m = endpoint.match(/github\.com\/([^/]+)\/([^/]+)\//);
  if (m) repo = `${m[1]}/${m[2]}`;
}
if (!repo || repo.includes("REPLACE_WITH")) {
  console.warn(
    "⚠️  Updater endpoint still has the placeholder repo. Set it in src-tauri/tauri.conf.json\n" +
      "   (or run with REPO=owner/name) — latest.json will contain a placeholder URL.",
  );
  repo ??= "REPLACE_WITH_YOUR_GITHUB_USER/inky";
}

const dirs = process.argv.length > 2 ? process.argv.slice(2) : [bundle];

/** First file named `name` anywhere under `dirs`. */
function find(name) {
  for (const dir of dirs) {
    const hit = fs
      .readdirSync(dir, { recursive: true })
      .map(String)
      .find((f) => path.basename(f) === name);
    if (hit) return path.join(dir, hit);
  }
  return null;
}

const download = (file) => `https://github.com/${repo}/releases/download/v${version}/${file}`;

const PLATFORMS = [
  {
    key: "darwin-aarch64",
    label: "macOS",
    installer: `Inky_${version}_aarch64.dmg`,
    update: "Inky.app.tar.gz",
  },
  {
    key: "windows-x86_64",
    label: "Windows",
    installer: `Inky_${version}_x64-setup.exe`,
    update: `Inky_${version}_x64-setup.exe`,
  },
];

const out = path.join(root, "dist", "release");
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });

const platforms = {};
for (const p of PLATFORMS) {
  const files = [p.installer, p.update, `${p.update}.sig`].map((name) => [name, find(name)]);
  const missing = files.filter(([, f]) => !f).map(([name]) => name);
  if (missing.length === files.length) continue;
  if (missing.length) {
    console.error(`${p.label} build is incomplete; missing: ${missing.join(", ")}`);
    process.exit(1);
  }
  for (const [name, f] of files) fs.copyFileSync(f, path.join(out, name));
  platforms[p.key] = {
    signature: fs.readFileSync(path.join(out, `${p.update}.sig`), "utf8").trim(),
    url: download(p.update),
  };
  console.log(`Found the ${p.label} build`);
}
if (!Object.keys(platforms).length) {
  console.error(`No build artifacts under ${dirs.join(", ")}.\nRun \`make dmg\` (or build on Windows) first.`);
  process.exit(1);
}

const latest = { version, pub_date: new Date().toISOString(), platforms };
fs.writeFileSync(path.join(out, "latest.json"), JSON.stringify(latest, null, 2) + "\n");

console.log(`\nRelease v${version} assembled in dist/release:`);
for (const f of fs.readdirSync(out)) console.log(`  ${f}`);
console.log(`\nNext: create GitHub release "v${version}" on ${repo} and upload all of these files.`);
