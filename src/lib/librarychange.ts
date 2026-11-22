import type { TreeNode } from "./types";

/** One changed path from the library watcher (`library-changed`). */
export interface WatchChange {
  path: string;
  exists: boolean;
  isDir: boolean;
}

function treePaths(nodes: readonly TreeNode[], into = new Set<string>()): Set<string> {
  for (const n of nodes) {
    into.add(n.path);
    treePaths(n.children, into);
  }
  return into;
}

/**
 * Does this batch of disk changes alter the sidebar tree? An agent editing a
 * document that is already listed doesn't, and re-reading a big library on
 * every such write is what kept Inky busy while agents wrote.
 */
export function changesTree(changes: readonly WatchChange[] | undefined, tree: readonly TreeNode[]): boolean {
  if (!Array.isArray(changes)) return true;
  const known = treePaths(tree);
  return changes.some((c) => {
    if (!c.exists || c.isDir) return true;
    const name = c.path.split("/").pop() ?? "";
    if (name.startsWith(".") && name.endsWith(".comments.json")) return false;
    return !known.has(c.path);
  });
}
