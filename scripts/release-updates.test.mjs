import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { checkBase, updaterConfig, manifest, keyId } from "./release-updates.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const script = path.join(here, "release-updates.mjs");

// Minisign files as Tauri stores them: base64 of the text file.
const line = (id, size) => Buffer.concat([Buffer.from("Ed"), Buffer.from(id, "hex"), Buffer.alloc(size)]).toString("base64");
const pubFor = (id) => Buffer.from(`untrusted comment: minisign public key\n${line(id, 32)}\n`).toString("base64");
const sigFor = (id) =>
  Buffer.from(`untrusted comment: x\n${line(id, 64)}\ntrusted comment: timestamp:1\tfile:Inky.app.tar.gz\nAbC\n`).toString("base64");

const KEY = "0011223344556677";
const OTHER = "8899aabbccddeeff";

test("checkBase takes https bases only", () => {
  assert.equal(checkBase("https://dl.example.com/inky"), "https://dl.example.com/inky");
  for (const bad of ["http://dl.example.com", "http://127.0.0.1:8799", "https://dl.example.com/", "https://dl.example.com/a?b", "ftp://x", ""])
    assert.throws(() => checkBase(bad));
});

test("updaterConfig points the updater at <base>/app/latest.json", () => {
  assert.deepEqual(updaterConfig("https://dl.example.com"), {
    plugins: { updater: { endpoints: ["https://dl.example.com/app/latest.json"] } },
  });
});

test("manifest points each platform at its versioned update", () => {
  const m = manifest({
    base: "https://dl.example.com", version: "1.4.0", pubDate: "2026-10-24T10:00:00.000Z",
    signatures: { "darwin-aarch64": "SIG", "windows-x86_64": "WSIG" },
  });
  assert.deepEqual(m, {
    version: "1.4.0", pub_date: "2026-10-24T10:00:00.000Z",
    platforms: {
      "darwin-aarch64": { signature: "SIG", url: "https://dl.example.com/app/1.4.0/Inky.app.tar.gz" },
      "windows-x86_64": { signature: "WSIG", url: "https://dl.example.com/app/1.4.0/Inky_1.4.0_x64-setup.exe" },
    },
  });
  assert.throws(() => manifest({ base: "https://dl.example.com", version: "1.4.0", pubDate: "x", signatures: {} }));
});

test("keyId reads the key id of a public key and of a signature", () => {
  assert.equal(keyId(pubFor(KEY)), KEY);
  assert.equal(keyId(sigFor(KEY)), KEY);
  assert.equal(keyId(""), null);
});

test("the key in tauri.conf.json has a key id", () => {
  const conf = JSON.parse(fs.readFileSync(path.join(here, "../src-tauri/tauri.conf.json"), "utf8"));
  assert.match(keyId(conf.plugins.updater.pubkey), /^[0-9a-f]{16}$/);
});

function bundleDir(sigKey, { mac = true, windows = false } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "inky-stage-"));
  const put = (rel, text) => {
    fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
    fs.writeFileSync(path.join(dir, rel), text);
  };
  if (mac) {
    put("bundle/macos/Inky.app.tar.gz", "TARBALL");
    put("bundle/macos/Inky.app.tar.gz.sig", sigFor(sigKey) + "\n");
    put("bundle/dmg/Inky_1.4.0_aarch64.dmg", "DMG");
  }
  if (windows) {
    put("winbundle/nsis/Inky_1.4.0_x64-setup.exe", "SETUP");
    put("winbundle/nsis/Inky_1.4.0_x64-setup.exe.sig", sigFor(sigKey) + "\n");
  }
  put("conf.json", JSON.stringify({ plugins: { updater: { pubkey: pubFor(KEY) } } }));
  return dir;
}
const run = (...args) => spawnSync(process.execPath, [script, ...args], { encoding: "utf8" });
const stage = (dir, bundle = "bundle", out = "out") =>
  run("stage", "https://dl.example.com", "1.4.0", path.join(dir, bundle), path.join(dir, out), path.join(dir, "conf.json"));

test("stage refuses an update signed with another key", () => {
  const dir = bundleDir(OTHER);
  const r = stage(dir);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /not signed with the key/);
  assert.equal(fs.existsSync(path.join(dir, "out/app/latest.json")), false);
});

test("stage writes the host layout", () => {
  const dir = bundleDir(KEY);
  const r = stage(dir);
  assert.equal(r.status, 0, r.stderr);
  const out = path.join(dir, "out");
  assert.equal(fs.readFileSync(path.join(out, "app/1.4.0/Inky.app.tar.gz"), "utf8"), "TARBALL");
  assert.equal(fs.readFileSync(path.join(out, "Inky.dmg"), "utf8"), "DMG");
  const latest = JSON.parse(fs.readFileSync(path.join(out, "app/latest.json"), "utf8"));
  assert.equal(latest.platforms["darwin-aarch64"].signature, sigFor(KEY));
  assert.equal(latest.version, "1.4.0");
});

test("stage writes the Windows installer, which is also the update", () => {
  const dir = bundleDir(KEY, { mac: false, windows: true });
  const r = stage(dir, "winbundle");
  assert.equal(r.status, 0, r.stderr);
  const out = path.join(dir, "out");
  assert.equal(fs.readFileSync(path.join(out, "app/1.4.0/Inky_1.4.0_x64-setup.exe"), "utf8"), "SETUP");
  assert.equal(fs.readFileSync(path.join(out, "Inky-setup.exe"), "utf8"), "SETUP");
  const latest = JSON.parse(fs.readFileSync(path.join(out, "app/latest.json"), "utf8"));
  assert.deepEqual(Object.keys(latest.platforms), ["windows-x86_64"]);
  assert.equal(latest.platforms["windows-x86_64"].url, "https://dl.example.com/app/1.4.0/Inky_1.4.0_x64-setup.exe");
});

test("feed covers every platform staged into one folder", () => {
  const dir = bundleDir(KEY, { mac: true, windows: true });
  assert.equal(stage(dir, "bundle", "mac").status, 0);
  assert.equal(stage(dir, "winbundle", "win").status, 0);
  // CI downloads both staged folders into one.
  fs.cpSync(path.join(dir, "mac"), path.join(dir, "all"), { recursive: true });
  fs.cpSync(path.join(dir, "win"), path.join(dir, "all"), { recursive: true });
  const r = run("feed", "https://dl.example.com", "1.4.0", path.join(dir, "all"));
  assert.equal(r.status, 0, r.stderr);
  const latest = JSON.parse(fs.readFileSync(path.join(dir, "all/app/latest.json"), "utf8"));
  assert.deepEqual(Object.keys(latest.platforms).sort(), ["darwin-aarch64", "windows-x86_64"]);
  assert.equal(latest.platforms["darwin-aarch64"].signature, sigFor(KEY));
});

test("stage refuses a half-built platform", () => {
  const dir = bundleDir(KEY, { mac: false, windows: true });
  fs.rmSync(path.join(dir, "winbundle/nsis/Inky_1.4.0_x64-setup.exe.sig"));
  const r = stage(dir, "winbundle");
  assert.equal(r.status, 1);
  assert.match(r.stderr, /missing/);
});
