#!/usr/bin/env node
// Drives the installed Windows app the way a person would. CI runs it on a
// windows runner after scripts/smoke-windows.mjs has installed Inky.
//
//   node e2e/windows.mjs [path to Inky.exe]
//
// Inky is started with WebView2's standard switch for a DevTools port
// (WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS), and the test talks to the page over
// the Chrome DevTools Protocol: it reads the page, and sends mouse and key
// events the page receives like real input. No WebDriver (msedgedriver looks
// for its port file in a profile of its own, and Tauri gives WebView2 the
// app's), no npm packages: Node has fetch and WebSocket.
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

const PORT = 9333;
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

// An Inky that is already running would take this launch and the new one
// would quit (single instance), with a browser started without the port.
const powershell = (command) =>
  spawnSync("powershell", ["-NoProfile", "-Command", command], { encoding: "utf8" }).stdout?.trim() ?? "";
const others = powershell(
  "Get-CimInstance Win32_Process -Filter \"Name='Inky.exe'\" | ForEach-Object { \"$($_.ProcessId) $($_.CommandLine)\" }",
);
if (others) {
  console.log(`! stopping Inky processes that were already running:\n${others}`);
  spawnSync("taskkill", ["/IM", "Inky.exe", "/F", "/T"], { stdio: "inherit" });
  await sleep(2000);
}

// --- The page, over the DevTools protocol ---------------------------------

const app = spawn(exe, [], {
  stdio: "ignore",
  env: { ...process.env, WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${PORT}` },
});
let exited = null;
app.on("exit", (code) => (exited = code));

/** Where WebView2 says it opened its port, and Inky's own log, for a failure. */
function evidence() {
  const found = powershell(
    `Get-ChildItem -Path $env:LOCALAPPDATA, $env:TEMP -Recurse -Filter DevToolsActivePort -ErrorAction SilentlyContinue | ForEach-Object { "$($_.FullName): $((Get-Content $_.FullName) -join ' ')" }`,
  );
  const display = [path.join(local, "com.inky.app", "logs", "display.log"), path.join(local, "com.inky.app", "display.log")].find((f) =>
    fs.existsSync(f),
  );
  const tail = display ? fs.readFileSync(display, "utf8").split("\n").slice(-12).join("\n") : "(none)";
  return `--- DevToolsActivePort files ---\n${found || "(none)"}\n--- Inky display log (end) ---\n${tail}\n--- Inky exited: ${exited}`;
}

let socket;
let nextId = 1;
/** The page's console messages, errors and browser log, printed on failure. */
const pageLog = [];
const pending = new Map();

async function connect() {
  for (let waited = 0; waited < 60_000; waited += 500) {
    if (exited !== null) throw new Error(`Inky exited with ${exited}`);
    try {
      const targets = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
      const page = targets.find((t) => t.type === "page" && t.url.includes("tauri.localhost"));
      if (page) {
        socket = new WebSocket(page.webSocketDebuggerUrl);
        await new Promise((resolve, reject) => {
          socket.onopen = resolve;
          socket.onerror = () => reject(new Error("the DevTools socket did not open"));
        });
        socket.onmessage = (event) => {
          const msg = JSON.parse(event.data);
          if (msg.method === "Runtime.consoleAPICalled") {
            const text = msg.params.args.map((a) => a.value ?? a.description ?? "").join(" ");
            pageLog.push(`console.${msg.params.type}: ${text}`);
          } else if (msg.method === "Runtime.exceptionThrown") {
            pageLog.push(`exception: ${msg.params.exceptionDetails.exception?.description ?? msg.params.exceptionDetails.text}`);
          } else if (msg.method === "Log.entryAdded") {
            const e = msg.params.entry;
            pageLog.push(`${e.level}: ${e.text}${e.url ? ` (${e.url})` : ""}`);
          }
          pending.get(msg.id)?.(msg);
          pending.delete(msg.id);
        };
        return page.url;
      }
    } catch {
      // Not up yet.
    }
    await sleep(500);
  }
  throw new Error(`no DevTools port on ${PORT} after 60 s`);
}

function cdp(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = nextId++;
    const timer = setTimeout(() => reject(new Error(`no answer to ${method}`)), 15_000);
    pending.set(id, (msg) => {
      clearTimeout(timer);
      msg.error ? reject(new Error(`${method}: ${msg.error.message}`)) : resolve(msg.result);
    });
    socket.send(JSON.stringify({ id, method, params }));
  });
}

/** Run `script` (a function body that returns a value) in the page. */
async function exec(script) {
  const r = await cdp("Runtime.evaluate", {
    expression: `(async () => { ${script} })()`,
    returnByValue: true,
    awaitPromise: true,
  });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
  return r.result.value;
}

async function waitFor(what, script, timeout = 20_000) {
  const end = Date.now() + timeout;
  let last;
  while (Date.now() < end) {
    try {
      last = await exec(script);
      if (last) return last;
    } catch (e) {
      last = e.message;
    }
    await sleep(250);
  }
  throw new Error(`timed out waiting for ${what} (last: ${JSON.stringify(last)})`);
}

const CTRL = 2; // CDP modifier bit for Control.

/** A real mouse click on the middle of the first element matching `css`. */
async function click(css, modifiers = 0) {
  const at = await exec(`
    const el = document.querySelector(${JSON.stringify(css)});
    if (!el) return null;
    el.scrollIntoView({ block: "center" });
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };`);
  if (!at) throw new Error(`nothing matches ${css}`);
  for (const type of ["mouseMoved", "mousePressed", "mouseReleased"]) {
    await cdp("Input.dispatchMouseEvent", { type, x: at.x, y: at.y, button: "left", clickCount: 1, modifiers });
  }
}
const ctrlClick = (css) => click(css, CTRL);

/** A key press with modifiers, as Windows would send it. */
const KEYS = {
  1: { code: "Digit1", vk: 49 },
  2: { code: "Digit2", vk: 50 },
  3: { code: "Digit3", vk: 51 },
  k: { code: "KeyK", vk: 75 },
  s: { code: "KeyS", vk: 83 },
  w: { code: "KeyW", vk: 87 },
  Escape: { code: "Escape", vk: 27 },
  End: { code: "End", vk: 35 },
};
async function press(key, modifiers = 0) {
  const { code, vk } = KEYS[key];
  const text = key.length === 1 && !modifiers ? key : undefined;
  const base = { key, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk, modifiers };
  await cdp("Input.dispatchKeyEvent", { type: text ? "keyDown" : "rawKeyDown", ...base, text });
  await cdp("Input.dispatchKeyEvent", { type: "keyUp", ...base });
}

const type = (text) => cdp("Input.insertText", { text });

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
  console.log(`page: ${await connect()}`);
  await cdp("Runtime.enable");
  await cdp("Log.enable");

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
    await waitFor(
      "the table",
      `return [...document.querySelectorAll(".prose-doc td")].some((td) => td.textContent.trim() === "rendered");`,
    );
  });

  await check("a picture next to the document shows", async () => {
    try {
      await waitFor(
        "the picture to load",
        `const img = document.querySelector(".prose-doc img"); return !!img && img.complete && img.naturalWidth > 0;`,
      );
    } catch (e) {
      const seen = await exec(`
        const img = document.querySelector(".prose-doc img");
        if (!img) return "no img";
        const status = await fetch(img.currentSrc || img.src).then((r) => r.status + " " + r.headers.get("content-type"), (err) => "fetch failed: " + err);
        return { html: img.outerHTML, complete: img.complete, width: img.naturalWidth, status };`);
      throw new Error(`${e.message}; the img: ${JSON.stringify(seen)}`);
    }
  });

  await check("a video next to the document plays", async () => {
    await waitFor(
      "the video's metadata",
      `const v = document.querySelector(".prose-doc .video-embed video");
       return !!v && v.readyState >= 1 && !v.closest(".video-missing") && v.duration > 0;`,
    );
  });

  await check("paths in the app use forward slashes", async () => {
    const paths = await exec(
      `return [...document.querySelectorAll("[title]")].map((e) => e.getAttribute("title")).filter((t) => t.includes("\\\\"));`,
    );
    if (paths.length) throw new Error(`backslashes in ${paths.join(", ")}`);
  });

  await check("Ctrl+2 and Ctrl+1 switch between Split and Reading", async () => {
    await press("2", CTRL);
    await waitFor("the editor", shown(".cm-editor"));
    await press("1", CTRL);
    await waitFor("the editor to go", `return !document.querySelector(".cm-editor");`);
  });

  await check("Ctrl+K opens Quick Open and Escape closes it", async () => {
    await press("k", CTRL);
    await waitFor("Quick Open", shown('input[placeholder="Open document…"]'));
    await waitFor(
      "its search box to have focus",
      `return document.activeElement?.getAttribute("placeholder") === "Open document…" || null;`,
      5_000,
    ).catch(async (e) => {
      const active = await exec(`const a = document.activeElement; return a ? a.outerHTML.slice(0, 200) : "none";`);
      throw new Error(`${e.message}; focus is on ${active}`);
    });
    await press("Escape");
    await waitFor("Quick Open to close", `return !document.querySelector('input[placeholder="Open document…"]');`);
  });

  // One failure must not block the next checks: no Quick Open left over.
  const closeQuickOpen = async () => {
    if (await exec(`return !!document.querySelector('input[placeholder="Open document…"]');`)) {
      await press("Escape");
      await exec(`document.querySelector('input[placeholder="Open document…"]')?.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })); return true;`);
      await sleep(300);
    }
  };

  await check("a relative link opens the other document", async () => {
    await closeQuickOpen();
    await click(".prose-doc a");
    await waitFor("the other document", heading("Other note"));
  });

  await check("Ctrl+click opens a background tab and Ctrl+W closes a tab", async () => {
    await closeQuickOpen();
    await ctrlClick('button[title="Start.md"]');
    await waitFor("two tabs", `return document.querySelectorAll('[role="tab"]').length >= 2;`);
    const before = await exec(`return document.querySelectorAll('[role="tab"]').length;`);
    await press("w", CTRL);
    await waitFor("one tab fewer", `return document.querySelectorAll('[role="tab"]').length < ${before};`);
  });

  await check("an edit in the Writing view saves to disk", async () => {
    await click('button[title="Other.md"]');
    await waitFor("Other note", heading("Other note"));
    await press("3", CTRL);
    await waitFor("the editor", shown(".cm-content"));
    await click(".cm-content");
    await press("End", CTRL);
    await type("\nSaved from Windows.");
    await press("s", CTRL);
    const file = path.join(library, "Other.md");
    const end = Date.now() + 10_000;
    while (!fs.readFileSync(file, "utf8").includes("Saved from Windows.")) {
      if (Date.now() > end) throw new Error(`Other.md is still:\n${fs.readFileSync(file, "utf8")}`);
      await sleep(250);
    }
    await press("1", CTRL);
  });

  await check("a document an agent writes shows up in the sidebar", async () => {
    fs.writeFileSync(path.join(library, "From an agent.md"), "# From an agent\n");
    await waitFor("the new document", shown('button[title="From an agent.md"]'), 20_000);
  });

  await check("Inky is still running", async () => {
    if (exited !== null) throw new Error(`Inky exited with ${exited}`);
  });
} catch (e) {
  failures++;
  console.error(`✗ ${e.message.slice(0, 400)}`);
  console.error(evidence());
} finally {
  socket?.close();
  spawnSync("taskkill", ["/PID", String(app.pid), "/F", "/T"], { stdio: "ignore" });
}

console.log(`\n${results.join("\n")}`);
if (failures && pageLog.length) console.log(`\n--- the page's log ---\n${pageLog.slice(-40).join("\n")}`);
if (failures) {
  console.error(`\n${failures} check(s) failed`);
  process.exit(1);
}
console.log("\nAll Windows checks passed");
