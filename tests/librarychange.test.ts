import { describe, expect, it } from "vitest";
import { changesTree, type WatchChange } from "../src/lib/librarychange";
import type { TreeNode } from "../src/lib/types";

const doc = (path: string): TreeNode => ({ name: path.split("/").pop()!, path, isDir: false, children: [] });
const tree: TreeNode[] = [
  { name: "Notes", path: "/lib/Notes", isDir: true, children: [doc("/lib/Notes/a.md"), doc("/lib/Notes/pic.png")] },
  doc("/lib/b.md"),
];
const edit = (path: string): WatchChange => ({ path, exists: true, isDir: false });

describe("changesTree", () => {
  it("ignores edits to documents and images already in the tree", () => {
    expect(changesTree([edit("/lib/Notes/a.md"), edit("/lib/b.md"), edit("/lib/Notes/pic.png")], tree)).toBe(false);
  });

  it("ignores comment sidecars", () => {
    expect(changesTree([edit("/lib/Notes/.a.md.comments.json")], tree)).toBe(false);
  });

  it("counts new, removed and folder changes", () => {
    expect(changesTree([edit("/lib/Notes/new.md")], tree)).toBe(true);
    expect(changesTree([{ path: "/lib/b.md", exists: false, isDir: false }], tree)).toBe(true);
    expect(changesTree([{ path: "/lib/Notes", exists: true, isDir: true }], tree)).toBe(true);
  });

  it("counts hide-rule edits", () => {
    expect(changesTree([edit("/lib/.inkyignore")], tree)).toBe(true);
  });

  it("refreshes when it cannot tell what changed", () => {
    expect(changesTree(undefined, tree)).toBe(true);
    expect(changesTree([edit("/lib/b.md"), edit("/lib/c.md")], tree)).toBe(true);
  });
});
