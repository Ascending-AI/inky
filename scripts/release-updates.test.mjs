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

test("manifest points darwin-aarch64 at the versioned tarball", () => {
  const m = manifest({ base: "https://dl.example.com", version: "1.4.0", signature: "SIG", pubDate: "2026-10-24T10:00:00.000Z" });
  assert.deepEqual(m, {
    version: "1.4.0", pub_date: "2026-10-24T10:00:00.000Z",
    platforms: { "darwin-aarch64": { signature: "SIG", url: "https://dl.example.com/app/1.4.0/Inky.app.tar.gz" } },
  });
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

function bundleDir(sigKey) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "inky-stage-"));
  fs.mkdirSync(path.join(dir, "bundle/macos"), { recursive: true });
  fs.mkdirSync(path.join(dir, "bundle/dmg"), { recursive: true });
  fs.writeFileSync(path.join(dir, "bundle/macos/Inky.app.tar.gz"), "TARBALL");
  fs.writeFileSync(path.join(dir, "bundle/macos/Inky.app.tar.gz.sig"), sigFor(sigKey) + "\n");
  fs.writeFileSync(path.join(dir, "bundle/dmg/Inky_1.4.0_aarch64.dmg"), "DMG");
  fs.writeFileSync(path.join(dir, "conf.json"), JSON.stringify({ plugins: { updater: { pubkey: pubFor(KEY) } } }));
  return dir;
}
const stage = (dir) =>
  spawnSync(
    process.execPath,
    [script, "stage", "https://dl.example.com", "1.4.0", path.join(dir, "bundle"), path.join(dir, "out"), path.join(dir, "conf.json")],
    { encoding: "utf8" },
  );

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
