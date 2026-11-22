import { invoke } from "@tauri-apps/api/core";

/**
 * Diagnostics for "the window is black for a moment when I come back to
 * Inky". Lines go to ~/Library/Logs/com.inky.app/display.log, next to the
 * Rust side's page-load and window-focus lines.
 */
export function displayLog(line: string) {
  invoke("display_log", { line }).catch(() => {});
}

/** Milliseconds from now until the page has drawn a frame. */
function untilNextFrame(): Promise<number> {
  const t0 = performance.now();
  return new Promise((done) =>
    requestAnimationFrame(() => requestAnimationFrame(() => done(Math.round(performance.now() - t0)))),
  );
}

const elements = () => document.getElementsByTagName("*").length;

export function startDisplayLog() {
  displayLog(`page start, ${Math.round(performance.now())} ms after navigation`);
  let hiddenAt = document.hidden ? performance.now() : null;
  document.addEventListener("visibilitychange", async () => {
    if (document.hidden) {
      hiddenAt = performance.now();
      displayLog("hidden");
      return;
    }
    const away = hiddenAt === null ? "?" : Math.round((performance.now() - hiddenAt) / 1000);
    hiddenAt = null;
    const ms = await untilNextFrame();
    displayLog(`visible after ${away} s hidden; first frame ${ms} ms; ${elements()} elements`);
  });
  window.addEventListener("focus", async () => {
    const ms = await untilNextFrame();
    displayLog(`focus; first frame ${ms} ms; ${elements()} elements`);
  });
}
