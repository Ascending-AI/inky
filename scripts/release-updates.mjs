#!/usr/bin/env node
// Update files for `make release` and the release workflow: the updater config overlay, the
// signature check and the staged upload folder (app/latest.json, app/<version>/…, Inky.dmg,
// Inky-setup.exe).
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

// What each platform's build leaves in the bundle folder (Tauri's layout) and where it goes on
// the download host: the update the app installs, the installer people download (versioned,
// and under a fixed name that always holds the latest one).
export function platforms(version) {
  return {
    "darwin-aarch64": {
      update: { from: "macos/Inky.app.tar.gz", to: "Inky.app.tar.gz" },
      installer: { from: `dmg/Inky_${version}_aarch64.dmg`, to: `Inky_${version}_aarch64.dmg` },
      latest: "Inky.dmg",
    },
    "windows-x86_64": {
      // The NSIS installer is also the update: the app runs it quietly.
      update: { from: `nsis/Inky_${version}_x64-setup.exe`, to: `Inky_${version}_x64-setup.exe` },
      installer: { from: `nsis/Inky_${version}_x64-setup.exe`, to: `Inky_${version}_x64-setup.exe` },
      latest: "Inky-setup.exe",
    },
  };
}

// The feed: `signatures` maps each built platform to its update's signature.
export function manifest({ base, version, signatures, pubDate }) {
  const all = platforms(version);
  const entries = Object.entries(signatures).map(([key, signature]) => {
    if (!all[key]) throw new Error(`unknown platform ${key}`);
    return [key, { signature, url: `${base}/app/${version}/${all[key].update.to}` }];
  });
  if (!entries.length) throw new Error("no platform was built");
  return { version, pub_date: pubDate, platforms: Object.fromEntries(entries) };
}

// Stage whatever this machine built into outDir, a mirror of the download host:
// app/<version>/<update>, its .sig, the versioned installer, <latest installer name>, and
// app/<version>/<platform>.sig.json for `feed`. Then write the feed from every platform staged
// in outDir so far (CI stages each platform on its own runner and merges the folders).
function stage(base, version, bundleDir, outDir, confFile) {
  checkBase(base);
  const pubkey = JSON.parse(fs.readFileSync(confFile, "utf8")).plugins?.updater?.pubkey ?? "";
  const want = keyId(pubkey);
  const dir = path.join(outDir, "app", version);
  let staged = 0;
  for (const [key, p] of Object.entries(platforms(version))) {
    const update = path.join(bundleDir, p.update.from);
    const installer = path.join(bundleDir, p.installer.from);
    const found = [update, `${update}.sig`, installer].filter((f) => fs.existsSync(f));
    if (!found.length) continue;
    if (found.length < 3) {
      const missing = [update, `${update}.sig`, installer].filter((f) => !fs.existsSync(f));
      throw new Error(`missing ${missing.join(", ")}`);
    }
    const signature = fs.readFileSync(`${update}.sig`, "utf8").trim();
    // An installed app accepts only an update signed with the key it was built with.
    if (!want || keyId(signature) !== want) {
      throw new Error(
        `the ${key} update is not signed with the key of ${confFile} (plugins.updater.pubkey): installed apps would refuse it`,
      );
    }
    fs.mkdirSync(dir, { recursive: true });
    fs.copyFileSync(update, path.join(dir, p.update.to));
    fs.writeFileSync(path.join(dir, `${p.update.to}.sig`), signature + "\n");
    fs.copyFileSync(installer, path.join(dir, p.installer.to));
    fs.copyFileSync(installer, path.join(outDir, p.latest));
    fs.writeFileSync(path.join(dir, `${key}.sig.json`), JSON.stringify({ signature }) + "\n");
    staged++;
  }
  if (!staged) throw new Error(`no build in ${bundleDir}`);
  feed(base, version, outDir);
}

// app/latest.json from the platforms staged under outDir/app/<version>/.
function feed(base, version, outDir) {
  checkBase(base);
  const dir = path.join(outDir, "app", version);
  const signatures = {};
  for (const key of Object.keys(platforms(version))) {
    const f = path.join(dir, `${key}.sig.json`);
    if (fs.existsSync(f)) signatures[key] = JSON.parse(fs.readFileSync(f, "utf8")).signature;
  }
  const latest = manifest({ base, version, signatures, pubDate: new Date().toISOString() });
  fs.writeFileSync(path.join(outDir, "app", "latest.json"), JSON.stringify(latest, null, 2) + "\n");
  console.log(`[release] feed: ${Object.keys(signatures).join(", ")}`);
}

function main(argv) {
  const [cmd, ...a] = argv;
  if (cmd === "check-base" && a.length === 1) checkBase(a[0]);
  else if (cmd === "config" && a.length === 1) console.log(JSON.stringify(updaterConfig(a[0])));
  else if (cmd === "stage" && a.length === 5) stage(...a);
  else if (cmd === "feed" && a.length === 3) feed(...a);
  else throw new Error("usage: release-updates.mjs check-base <base> | config <base> | stage <base> <version> <bundle-dir> <out-dir> <tauri.conf.json> | feed <base> <version> <out-dir>");
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  try {
    main(process.argv.slice(2));
  } catch (e) {
    console.error(`[release] ${e.message}`);
    process.exit(1);
  }
}
