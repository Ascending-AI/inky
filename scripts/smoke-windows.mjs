#!/usr/bin/env node
// The Windows installer works on a clean machine: CI runs this after the build
// (.github/workflows/release.yml and check.yml), on a windows runner.
//
//   node scripts/smoke-windows.mjs <Inky_x.y.z_x64-setup.exe>
//
// 1. The installer installs quietly for this user, without admin rights.
// 2. `Inky.exe --mcp` serves agents: it writes, reads and lists a document.
// 3. Inky.exe opens that document: the window loads the page and the page's
//    code runs and talks to the backend (seen in the display log).
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const fail = (msg) => {
  console.error(`✗ ${msg}`);
  process.exit(1);
};
const ok = (msg) => console.log(`✓ ${msg}`);

/** Every running Inky.exe with its command line (empty when none). */
function running() {
  const r = spawnSync(
    "powershell",
    [
      "-NoProfile",
      "-Command",
      "Get-CimInstance Win32_Process -Filter \"Name='Inky.exe'\" | ForEach-Object { \"$($_.ProcessId) $($_.ParentProcessId) $($_.CommandLine)\" }",
    ],
    { encoding: "utf8" },
  );
  return (r.stdout ?? "").trim();
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const installer = process.argv[2];
if (!installer || !fs.existsSync(installer)) fail(`no installer at ${installer}`);
const local = process.env.LOCALAPPDATA ?? fail("LOCALAPPDATA is not set");

// 1. Install. NSIS: /S is silent; currentUser mode needs no elevation.
const install = spawnSync(installer, ["/S"], { stdio: "inherit", timeout: 180_000 });
if (install.status !== 0) fail(`the installer exited with ${install.status ?? install.error}`);
const candidates = [path.join(local, "Inky", "Inky.exe"), path.join(local, "Programs", "Inky", "Inky.exe")];
const exe = candidates.find((p) => fs.existsSync(p)) ?? fail(`Inky.exe is in none of ${candidates.join(", ")}`);
ok(`installed: ${exe}`);
const afterInstall = running();
if (afterInstall) console.log(`! Inky is running after the install (pid, parent, command):\n${afterInstall}`);

// A library of our own, so nothing depends on the runner's Documents folder.
const library = fs.mkdtempSync(path.join(os.tmpdir(), "inky-smoke-"));
const env = { ...process.env, INKY_LIBRARY: library };

// 2. MCP over stdio: newline-delimited JSON-RPC.
async function mcp() {
  const child = spawn(exe, ["--mcp"], { env, stdio: ["pipe", "pipe", "inherit"] });
  const pending = new Map();
  let buffer = "";
  child.stdout.setEncoding("utf8");
  child.stdout.on("data", (chunk) => {
    buffer += chunk;
    let nl;
    while ((nl = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, nl).trim();
      buffer = buffer.slice(nl + 1);
      if (!line) continue;
      const msg = JSON.parse(line);
      pending.get(msg.id)?.(msg);
    }
  });
  let next = 1;
  const send = (method, params) =>
    new Promise((resolve, reject) => {
      const id = next++;
      const timer = setTimeout(() => reject(new Error(`no answer to ${method}`)), 30_000);
      pending.set(id, (msg) => {
        clearTimeout(timer);
        msg.error ? reject(new Error(`${method}: ${JSON.stringify(msg.error)}`)) : resolve(msg.result);
      });
      child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n");
    });
  const call = async (name, args) => {
    const r = await send("tools/call", { name, arguments: args });
    const text = r.content?.map((c) => c.text).join("\n") ?? "";
    if (r.isError) throw new Error(`${name}: ${text}`);
    return text;
  };
  try {
    await send("initialize", {
      protocolVersion: "2025-06-18",
      capabilities: {},
      clientInfo: { name: "inky-smoke", version: "1" },
    });
    child.stdin.write(JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }) + "\n");
    const doc = "# Smoke test\n\n| Platform | Works |\n|---|---|\n| Windows | yes |\n";
    await call("write_document", { path: "Notes/smoke.md", content: doc });
    const read = await call("read_document", { path: "Notes/smoke.md" });
    if (!read.includes("| Windows | yes |")) throw new Error(`read_document gave back: ${read}`);
    const listing = await call("list_documents", {});
    if (!listing.includes("Notes/smoke.md")) throw new Error(`list_documents does not show Notes/smoke.md:\n${listing}`);
    if (listing.includes("\\")) throw new Error(`list_documents shows backslashes:\n${listing}`);
  } finally {
    child.stdin.end();
    child.kill();
  }
}
await mcp().catch((e) => fail(`MCP over stdio: ${e.message}`));
const smokeDoc = path.join(library, "Notes", "smoke.md");
if (!fs.existsSync(smokeDoc)) fail(`the MCP server did not write ${smokeDoc}`);
ok("MCP over stdio: write, read and list a document");

// 3. The app opens the document. Its display log (app_log_dir/display.log)
// records the page load and the page's own first line, which comes through IPC.
const logs = [path.join(local, "com.inky.app", "logs", "display.log"), path.join(local, "com.inky.app", "display.log")];
for (const f of logs) fs.rmSync(f, { force: true });
// Another Inky would take the document and this one would quit (single instance).
const before = running();
if (before) fail(`Inky is already running before the app test (pid, parent, command):\n${before}`);
const app = spawn(exe, [smokeDoc], { env, stdio: ["ignore", "pipe", "pipe"] });
let output = "";
app.stdout.on("data", (d) => (output += d));
app.stderr.on("data", (d) => (output += d));
let exited = null;
app.on("exit", (code) => (exited = code));
const readLog = () => logs.map((f) => (fs.existsSync(f) ? fs.readFileSync(f, "utf8") : "")).join("");
const why = () =>
  `\n--- display log ---\n${readLog() || "(none)"}\n--- output ---\n${output || "(none)"}\n--- running Inky ---\n${running() || "(none)"}`;
const want = ["app start", "page load finished", "page: page start"];
let log = "";
for (let waited = 0; waited < 90_000; waited += 1000) {
  await sleep(1000);
  if (exited !== null) fail(`Inky exited with ${exited} while starting${why()}`);
  log = readLog();
  if (want.every((w) => log.includes(w))) break;
}
const missing = want.filter((w) => !log.includes(w));
if (missing.length) fail(`the display log lacks ${missing.join(", ")}${why()}`);
// Still up a few seconds later: no crash after the first paint.
await sleep(5000);
if (exited !== null) fail(`Inky exited with ${exited} after loading${why()}`);
app.kill();
ok("the app starts, loads its page and runs it");
console.log(log.trim());
