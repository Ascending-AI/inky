import { describe, expect, it } from "vitest";
import { END, baselineAfterEdit, diffBlocks } from "$lib/changes";

const doc = (...blocks: string[]) => blocks.join("\n\n") + "\n";

describe("diffBlocks", () => {
  it("is null when nothing changed (whitespace between blocks aside)", () => {
    expect(diffBlocks(doc("# T", "A", "B"), "# T\n\n\n\nA\n\nB")).toBeNull();
  });

  it("marks an edited block with its earlier version", () => {
    const c = diffBlocks(doc("# T", "Old para", "B"), doc("# T", "New para", "B"))!;
    expect(c.changed.get("New para")).toBe("Old para");
    expect(c.count).toBe(1);
  });

  it("marks added blocks as new", () => {
    const c = diffBlocks(doc("A", "B"), doc("A", "Inserted", "B", "Appended"))!;
    expect(c.changed.get("Inserted")).toBeNull();
    expect(c.changed.get("Appended")).toBeNull();
    expect(c.changed.has("A")).toBe(false);
    expect(c.count).toBe(2);
  });

  it("anchors removed blocks to the block after them, or the end", () => {
    const c = diffBlocks(doc("A", "Gone 1", "Gone 2", "B", "Tail"), doc("A", "B"))!;
    expect(c.removedBefore.get("B")).toEqual(["Gone 1", "Gone 2"]);
    expect(c.removedBefore.get(END)).toEqual(["Tail"]);
    expect(c.count).toBe(2);
  });

  it("keeps fenced code blocks whole", () => {
    const before = doc("A", "```\nx = 1\n\ny = 2\n```");
    const after = doc("A", "```\nx = 1\n\ny = 3\n```");
    const c = diffBlocks(before, after)!;
    expect(c.count).toBe(1);
    expect([...c.changed.keys()][0]).toContain("y = 3");
  });
});

describe("baselineAfterEdit", () => {
  it("treats the reader's own edits as read and keeps unread changes", () => {
    const baseline = doc("A", "Old B", "Removed", "C");
    const agent = doc("A", "New B", "C", "Agent added");
    const changes = diffBlocks(baseline, agent)!;
    // The reader then edits A and C.
    const mine = doc("A edited", "New B", "C edited", "Agent added");
    const next = baselineAfterEdit(mine, changes);
    const left = diffBlocks(next, mine)!;
    expect([...left.changed.entries()]).toEqual([
      ["New B", "Old B"],
      ["Agent added", null],
    ]);
    expect(left.removedBefore.get("C edited")).toBeUndefined(); // anchor edited → removal read
  });

  it("keeps a removal whose anchor the reader did not touch", () => {
    const changes = diffBlocks(doc("A", "Gone", "B"), doc("A", "B"))!;
    const mine = doc("A changed", "B");
    expect(diffBlocks(baselineAfterEdit(mine, changes), mine)?.removedBefore.get("B")).toEqual([
      "Gone",
    ]);
  });
});
