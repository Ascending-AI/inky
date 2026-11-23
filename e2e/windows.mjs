#!/usr/bin/env node
// Drives the installed Windows app the way a person would, through
// tauri-driver (WebDriver for WebView2). CI runs it on a windows runner after
// scripts/smoke-windows.mjs has installed Inky.
//
//   node e2e/windows.mjs [path to Inky.exe]
//
// Needs tauri-driver and a matching msedgedriver on PATH. No npm packages:
// the W3C WebDriver protocol is a handful of HTTP calls.
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
// The given Inky.exe, or else the one the installer put in this user's folder.
const local = process.env.LOCALAPPDATA ?? "";
const exe =
  process.argv[2] ??
  [path.join(local, "Inky", "Inky.exe"), path.join(local, "Programs", "Inky", "Inky.exe")].find((p) => fs.existsSync(p));
if (!exe || !fs.existsSync(exe)) throw new Error(`no app at ${exe ?? "the install folder"}`);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failures = 0;
const results = [];

// A copy of the fixture library, and a config that points the app at it.
const library = fs.mkdtempSync(path.join(os.tmpdir(), "inky-e2e-"));
fs.cpSync(path.join(here, "fixtures", "library"), library, { recursive: true });
const configDir = path.join(process.env.APPDATA ?? path.join(os.homedir(), "AppData", "Roaming"), "com.inky.app");
fs.mkdirSync(configDir, { recursive: true });
fs.writeFileSync(path.join(configDir, "config.json"), JSON.stringify({ library }));
console.log(`library: ${library}`);

// An Inky that is already running would take the session's launch and the new
// one would quit (single instance): say so, and stop it.
const others = spawnSync(
  "powershell",
  ["-NoProfile", "-Command", "Get-CimInstance Win32_Process -Filter \"Name='Inky.exe'\" | ForEach-Object { \"$($_.ProcessId) $($_.CommandLine)\" }"],
  { encoding: "utf8" },
).stdout?.trim();
if (others) {
  console.log(`! stopping Inky processes that were already running:\n${others}`);
  spawnSync("taskkill", ["/IM", "Inky.exe", "/F", "/T"], { stdio: "inherit" });
}

// --- WebDriver -------------------------------------------------------------

const driver = spawn("tauri-driver", [], { stdio: "inherit" });
const base = "http://127.0.0.1:4444";
let session = "";

async function wd(method, route, body) {
  const res = await fetch(`${base}${route}`, {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${method} ${route}: ${res.status} ${JSON.stringify(json.value ?? json)}`);
  return json.value;
}
const s = (route) => `/session/${session}${route}`;
const exec = (script, ...args) => wd("POST", s("/execute/sync"), { script, args });

async function waitFor(what, script, timeout = 20_000, ...args) {
  const end = Date.now() + timeout;
  let last;
  while (Date.now() < end) {
    try {
      last = await exec(script, ...args);
      if (last) return last;
    } catch (e) {
      last = e.message;
    }
    await sleep(250);
  }
  throw new Error(`timed out waiting for ${what} (last: ${JSON.stringify(last)})`);
}

async function element(css) {
  const v = await wd("POST", s("/element"), { using: "css selector", value: css });
  return Object.values(v)[0];
}
const click = async (css) => wd("POST", s(`/element/${await element(css)}/click`), {});

const KEY = { ctrl: "", shift: "", escape: "" };

/** Press keys together, e.g. press(KEY.ctrl, "2"). */
async function press(...keys) {
  const down = keys.map((value) => ({ type: "keyDown", value }));
  const up = [...keys].reverse().map((value) => ({ type: "keyUp", value }));
  await wd("POST", s("/actions"), { actions: [{ type: "key", id: "kb", actions: [...down, ...up] }] });
  await wd("DELETE", s("/actions"));
}

async function type(text) {
  const actions = [...text].flatMap((value) => [{ type: "keyDown", value }, { type: "keyUp", value }]);
  await wd("POST", s("/actions"), { actions: [{ type: "key", id: "kb", actions }] });
  await wd("DELETE", s("/actions"));
}

/** Ctrl+click: opens in a background tab. */
async function ctrlClick(css) {
  const origin = { "element-6066-11e4-a52e-4f735466cecf": await element(css) };
  await wd("POST", s("/actions"), {
    actions: [
      { type: "key", id: "kb", actions: [{ type: "keyDown", value: KEY.ctrl }, { type: "pause" }, { type: "pause" }, { type: "keyUp", value: KEY.ctrl }] },
      {
        type: "pointer",
        id: "mouse",
        parameters: { pointerType: "mouse" },
        actions: [
          { type: "pointerMove", origin, x: 0, y: 0 },
          { type: "pointerDown", button: 0 },
          { type: "pointerUp", button: 0 },
          { type: "pause" },
        ],
      },
    ],
  });
  await wd("DELETE", s("/actions"));
}

async function check(name, fn) {
  try {
    await fn();
    results.push(`✓ ${name}`);
    console.log(`✓ ${name}`);
  } catch (e) {
    failures++;
    results.push(`✗ ${name}: ${e.message}`);
    console.error(`✗ ${name}: ${e.message}`);
  }
}

// --- The checks ------------------------------------------------------------

try {
  for (let i = 0; ; i++) {
    try {
      await fetch(`${base}/status`);
      break;
    } catch {
      if (i > 60) throw new Error("tauri-driver did not start");
      await sleep(500);
    }
  }
  const created = await wd("POST", "/session", {
    // webviewOptions puts msedgedriver in WebView2 mode; without it, it starts
    // the app as if it were Edge and waits for a debug port that never opens.
    capabilities: { alwaysMatch: { "tauri:options": { application: exe, webviewOptions: {} } } },
  });
  session = created.sessionId;

  const shown = (css) => `return !!document.querySelector(${JSON.stringify(css)});`;
  const heading = (title) =>
    `return document.querySelector(".prose-doc h1")?.textContent?.trim() === ${JSON.stringify(title)};`;

  await check("the sidebar lists the library", async () => {
    await waitFor("Other.md in the sidebar", shown('button[title="Other.md"]'), 60_000);
    await waitFor("the Guides folder", shown('button[title="Guides"]'));
  });

  await check("a document in a folder opens and renders", async () => {
    await click('button[title="Guides"]');
    await waitFor("Start.md in the sidebar", shown('button[title="Start.md"]'));
    await click('button[title="Start.md"]');
    await waitFor("the heading", heading("Start here"));
    await waitFor("the table", `return [...document.querySelectorAll(".prose-doc td")].some((td) => td.textContent.trim() === "rendered");`);
  });

  await check("a picture next to the document shows", async () => {
    await waitFor(
      "the picture to load",
      `const img = document.querySelector(".prose-doc img"); return !!img && img.complete && img.naturalWidth > 0;`,
    );
  });

  await check("a video next to the document plays", async () => {
    await waitFor(
      "the video's metadata",
      `const v = document.querySelector(".prose-doc .video-embed video");
       return !!v && v.readyState >= 1 && !v.closest(".video-missing") && v.duration > 0;`,
    );
  });

  await check("paths in the app use forward slashes", async () => {
    const paths = await exec(`return [...document.querySelectorAll("[title]")].map((e) => e.getAttribute("title")).filter((t) => t.includes("\\\\"));`);
    if (paths.length) throw new Error(`backslashes in ${paths.join(", ")}`);
  });

  await check("Ctrl+2 and Ctrl+1 switch between Split and Reading", async () => {
    await press(KEY.ctrl, "2");
    await waitFor("the editor", shown(".cm-editor"));
    await press(KEY.ctrl, "1");
    await waitFor("the editor to go", `return !document.querySelector(".cm-editor");`);
  });

  await check("Ctrl+K opens Quick Open and Escape closes it", async () => {
    await press(KEY.ctrl, "k");
    await waitFor("Quick Open", shown('input[placeholder="Open document…"]'));
    await press(KEY.escape);
    await waitFor("Quick Open to close", `return !document.querySelector('input[placeholder="Open document…"]');`);
  });

  await check("a relative link opens the other document", async () => {
    await click(".prose-doc a");
    await waitFor("the other document", heading("Other note"));
  });

  await check("Ctrl+click opens a background tab and Ctrl+W closes a tab", async () => {
    await ctrlClick('button[title="Start.md"]');
    await waitFor("two tabs", `return document.querySelectorAll('[role="tab"]').length >= 2;`);
    const before = await exec(`return document.querySelectorAll('[role="tab"]').length;`);
    await press(KEY.ctrl, "w");
    await waitFor("one tab fewer", `return document.querySelectorAll('[role="tab"]').length < ${before};`);
  });

  await check("an edit in the Writing view saves to disk", async () => {
    await click('button[title="Other.md"]');
    await waitFor("Other note", heading("Other note"));
    await press(KEY.ctrl, "3");
    await waitFor("the editor", shown(".cm-content"));
    await click(".cm-content");
    await press(KEY.ctrl, ""); // Ctrl+End
    await type("\nSaved from Windows.");
    await press(KEY.ctrl, "s");
    const file = path.join(library, "Other.md");
    const end = Date.now() + 10_000;
    while (!fs.readFileSync(file, "utf8").includes("Saved from Windows.")) {
      if (Date.now() > end) throw new Error(`Other.md is still:\n${fs.readFileSync(file, "utf8")}`);
      await sleep(250);
    }
    await press(KEY.ctrl, "1");
  });

  await check("a document an agent writes shows up in the sidebar", async () => {
    fs.writeFileSync(path.join(library, "From an agent.md"), "# From an agent\n");
    await waitFor("the new document", shown('button[title="From an agent.md"]'), 20_000);
  });
} catch (e) {
  failures++;
  console.error(`✗ ${e.message}`);
} finally {
  if (session) await wd("DELETE", `/session/${session}`).catch(() => {});
  driver.kill();
}

console.log(`\n${results.join("\n")}`);
if (failures) {
  console.error(`\n${failures} check(s) failed`);
  process.exit(1);
}
console.log("\nAll Windows checks passed");
