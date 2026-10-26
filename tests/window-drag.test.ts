import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");

function readJson(rel: string) {
  return JSON.parse(readFileSync(path.join(root, rel), "utf8"));
}

describe("window dragging", () => {
  it("uses an overlay title bar, so the webview owns the drag area", () => {
    const conf = readJson("src-tauri/tauri.conf.json");
    expect(conf.app.windows[0].titleBarStyle).toBe("Overlay");
  });

  it("marks a drag region in the toolbar", () => {
    const toolbar = readFileSync(
      path.join(root, "src/lib/components/Toolbar.svelte"),
      "utf8",
    );
    expect(toolbar).toContain("data-tauri-drag-region");
  });

  it("grants start-dragging, which core:default does not include", () => {
    const cap = readJson("src-tauri/capabilities/default.json");
    const ids = cap.permissions.map((p: unknown) =>
      typeof p === "string" ? p : (p as { identifier: string }).identifier,
    );
    expect(ids).toContain("core:window:allow-start-dragging");
  });
});
