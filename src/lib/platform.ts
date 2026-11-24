/**
 * The few things that differ between macOS and Windows: the shortcut
 * modifier, how shortcuts are written, and what the file manager is called.
 */

const ua = typeof navigator === "undefined" ? "" : navigator.userAgent;

export const isMac = /Macintosh|Mac OS X/.test(ua);
export const isWindows = /Windows/.test(ua);

/** The shortcut modifier is down: ⌘ on macOS, Ctrl elsewhere. */
export function modKey(e: KeyboardEvent | MouseEvent): boolean {
  return isMac ? e.metaKey : e.ctrlKey;
}

const WORDS: Record<string, string> = { "⌘": "Ctrl", "⌃": "Ctrl", "⇧": "Shift", "⌥": "Alt", "↩": "Enter", "−": "-" };

/**
 * A shortcut written the macOS way ("⌘⇧V", "⌘1 / ⌘2") as this platform
 * writes it ("Ctrl+Shift+V", "Ctrl+1 / Ctrl+2").
 */
export function shortcut(mac: string, forMac = isMac): string {
  if (forMac) return mac;
  return mac.replace(/[⌘⌃⇧⌥]+./gu, (combo) =>
    [...combo].map((ch) => WORDS[ch] ?? ch.toUpperCase()).join("+"),
  );
}

/** "⌘-click" or "Ctrl+click": opening a link or file in a background tab. */
export const modClick = isMac ? "⌘-click" : "Ctrl+click";

/** "Finder" or "File Explorer", for "Show in …" labels. */
export const fileManager = isMac ? "Finder" : "File Explorer";

/** An OS path with `/` separators (what the backend sends and the UI expects). */
export function slashed(path: string): string {
  return isWindows ? path.replace(/\\/g, "/") : path;
}
