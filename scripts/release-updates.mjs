#!/usr/bin/env node
// Update files for `make release`: the updater config overlay, the signature check and the
// staged upload folder (app/latest.json, app/<version>/Inky.app.tar.gz, Inky.dmg).
// The same base rule is used by scripts/release.sh (it calls `check-base`).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HTTPS_BASE = /^https:\/\/[A-Za-z0-9.-]+(:[0-9]+)?(\/[A-Za-z0-9._~-]+)*$/;

export function checkBase(base) {
  if (HTTPS_BASE.test(base)) return base;
  throw new Error(
    `DOWNLOAD_BASE must be an https URL without a trailing slash, e.g. https://downloads.example.com/inky (got "${base}")`,
  );
}

// Merged over tauri.conf.json with --config: the app reads its updates from this host.
// The public key stays the one in tauri.conf.json.
export function updaterConfig(base) {
  checkBase(base);
  return { plugins: { updater: { endpoints: [`${base}/app/latest.json`] } } };
}

// A minisign key or signature, as Tauri stores it: base64 of a text file whose second line is
// base64 of <2 bytes algorithm><8 bytes key id><key or signature>. Gives the key id as hex.
export function keyId(base64File) {
  const text = Buffer.from(base64File.trim(), "base64").toString("utf8");
  const line = text.split("\n")[1];
  if (!line) return null;
  const bytes = Buffer.from(line.trim(), "base64");
  return bytes.length >= 10 ? bytes.subarray(2, 10).toString("hex") : null;
}

export function manifest({ base, version, signature, pubDate }) {
  return {
    version,
    pub_date: pubDate,
    platforms: { "darwin-aarch64": { signature, url: `${base}/app/${version}/Inky.app.tar.gz` } },
  };
}

function stage(base, version, bundleDir, outDir, confFile) {
  checkBase(base);
  const tar = path.join(bundleDir, "macos/Inky.app.tar.gz");
  const dmg = path.join(bundleDir, `dmg/Inky_${version}_aarch64.dmg`);
  for (const f of [tar, `${tar}.sig`, dmg]) {
    if (!fs.existsSync(f)) throw new Error(`missing ${f}`);
  }
  const signature = fs.readFileSync(`${tar}.sig`, "utf8").trim();
  // An installed app accepts only an update signed with the key it was built with.
  const pubkey = JSON.parse(fs.readFileSync(confFile, "utf8")).plugins?.updater?.pubkey ?? "";
  const want = keyId(pubkey);
  if (!want || keyId(signature) !== want) {
    throw new Error(
      `the update is not signed with the key of ${confFile} (plugins.updater.pubkey): installed apps would refuse it`,
    );
  }
  const app = path.join(outDir, "app");
  fs.rmSync(app, { recursive: true, force: true });
  fs.mkdirSync(path.join(app, version), { recursive: true });
  fs.copyFileSync(tar, path.join(app, version, "Inky.app.tar.gz"));
  fs.writeFileSync(
    path.join(app, "latest.json"),
    JSON.stringify(manifest({ base, version, signature, pubDate: new Date().toISOString() }), null, 2) + "\n",
  );
  fs.copyFileSync(dmg, path.join(outDir, "Inky.dmg"));
}

function main(argv) {
  const [cmd, ...a] = argv;
  if (cmd === "check-base" && a.length === 1) checkBase(a[0]);
  else if (cmd === "config" && a.length === 1) console.log(JSON.stringify(updaterConfig(a[0])));
  else if (cmd === "stage" && a.length === 5) stage(...a);
  else throw new Error("usage: release-updates.mjs check-base <base> | config <base> | stage <base> <version> <bundle-dir> <out-dir> <tauri.conf.json>");
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  try {
    main(process.argv.slice(2));
  } catch (e) {
    console.error(`[release] ${e.message}`);
    process.exit(1);
  }
}
