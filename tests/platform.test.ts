import { describe, expect, it } from "vitest";
import { shortcut } from "../src/lib/platform";

describe("shortcut", () => {
  it("keeps macOS symbols on macOS", () => {
    expect(shortcut("⌘⇧V", true)).toBe("⌘⇧V");
  });

  it("spells shortcuts out elsewhere", () => {
    expect(shortcut("⌘⇧V", false)).toBe("Ctrl+Shift+V");
    expect(shortcut("Reading (⌘1)", false)).toBe("Reading (Ctrl+1)");
    expect(shortcut("⌘1 / ⌘2 / ⌘3", false)).toBe("Ctrl+1 / Ctrl+2 / Ctrl+3");
    expect(shortcut("Back (⌘[)", false)).toBe("Back (Ctrl+[)");
    expect(shortcut("⌘↩ to close", false)).toBe("Ctrl+Enter to close");
    expect(shortcut("⌘b", false)).toBe("Ctrl+B");
  });
});
