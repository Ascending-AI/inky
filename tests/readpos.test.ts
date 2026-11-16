import { beforeEach, describe, expect, it } from "vitest";
import {
  forgetPositions,
  getPosition,
  remapPositions,
  resolveIndex,
  savePosition,
  type ReadPos,
} from "$lib/readpos";

const pos = (index: number, key = "k", at = 1): ReadPos => ({
  index,
  key,
  offset: 0.5,
  fraction: 0.4,
  at,
});

describe("resolveIndex", () => {
  it("keeps the index while its text still matches", () => {
    expect(resolveIndex(["a", "b", "c"], { index: 1, key: "b" })).toBe(1);
  });
  it("follows the block when earlier blocks were added or removed", () => {
    expect(resolveIndex(["new", "a", "b", "c"], { index: 1, key: "b" })).toBe(2);
    expect(resolveIndex(["b", "c"], { index: 1, key: "b" })).toBe(0);
  });
  it("picks the matching block nearest the old index", () => {
    expect(resolveIndex(["x", "y", "x", "z", "z", "x"], { index: 4, key: "x" })).toBe(5);
  });
  it("gives up when the block is gone", () => {
    expect(resolveIndex(["a", "c"], { index: 1, key: "b" })).toBe(-1);
  });
});

describe("position store", () => {
  beforeEach(() => localStorage.clear());

  it("saves, reads and forgets a position", () => {
    savePosition("/lib/a.md", pos(3));
    expect(getPosition("/lib/a.md")?.index).toBe(3);
    savePosition("/lib/a.md", null);
    expect(getPosition("/lib/a.md")).toBeNull();
  });

  it("follows renamed files and folders", () => {
    savePosition("/lib/dir/a.md", pos(1));
    savePosition("/lib/dirx/b.md", pos(2));
    remapPositions("/lib/dir", "/lib/moved");
    expect(getPosition("/lib/moved/a.md")?.index).toBe(1);
    expect(getPosition("/lib/dir/a.md")).toBeNull();
    expect(getPosition("/lib/dirx/b.md")?.index).toBe(2);
  });

  it("forgets everything under a deleted folder", () => {
    savePosition("/lib/dir/a.md", pos(1));
    savePosition("/lib/other.md", pos(2));
    forgetPositions("/lib/dir");
    expect(getPosition("/lib/dir/a.md")).toBeNull();
    expect(getPosition("/lib/other.md")).not.toBeNull();
  });

  it("keeps only the most recent 500 documents", () => {
    for (let i = 0; i < 501; i++) savePosition(`/lib/${i}.md`, pos(i, "k", i));
    expect(getPosition("/lib/0.md")).toBeNull();
    expect(getPosition("/lib/500.md")).not.toBeNull();
  });
});
