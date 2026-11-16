/**
 * "What changed since I last read this": a block-level diff between the
 * document as the reader last saw it (the baseline) and as it is now.
 *
 * Blocks are the top-level markdown blocks the reading pane renders
 * (paragraphs, headings, lists, tables…), keyed by their trimmed source, so
 * the Preview can find each changed block's element through its block map.
 */

import { extractBlocks } from "./markdown";

export interface ChangeSet {
  /** Changed block source → its earlier version, or null for a new block. */
  changed: Map<string, string | null>;
  /** Block source → blocks removed just before it ("" = end of document). */
  removedBefore: Map<string, string[]>;
  /** Changed blocks plus places where something was removed. */
  count: number;
}

export const END = "";

export function blockTexts(src: string): string[] {
  return extractBlocks(src)
    .map((b) => src.slice(b.start, b.end).trim())
    .filter(Boolean);
}

/** Longest common subsequence alignment: pairs of matching indices. */
function lcsPairs(a: string[], b: string[]): [number, number][] {
  // Trim the common prefix and suffix first; edits are usually local.
  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start++;
  let endA = a.length;
  let endB = b.length;
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) {
    endA--;
    endB--;
  }
  const n = endA - start;
  const m = endB - start;
  const dp = new Uint32Array((n + 1) * (m + 1));
  const at = (i: number, j: number) => i * (m + 1) + j;
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[at(i, j)] =
        a[start + i] === b[start + j]
          ? dp[at(i + 1, j + 1)] + 1
          : Math.max(dp[at(i + 1, j)], dp[at(i, j + 1)]);
    }
  }
  const pairs: [number, number][] = [];
  for (let k = 0; k < start; k++) pairs.push([k, k]);
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[start + i] === b[start + j]) {
      pairs.push([start + i, start + j]);
      i++;
      j++;
    } else if (dp[at(i + 1, j)] >= dp[at(i, j + 1)]) {
      i++;
    } else {
      j++;
    }
  }
  for (let k = 0; k < a.length - endA; k++) pairs.push([endA + k, endB + k]);
  return pairs;
}

/** What changed from `before` to `after`; null when nothing did. */
export function diffBlocks(before: string, after: string): ChangeSet | null {
  const a = blockTexts(before);
  const b = blockTexts(after);
  const changed = new Map<string, string | null>();
  const removedBefore = new Map<string, string[]>();
  let removals = 0;
  let ia = 0;
  let ib = 0;
  // A sentinel pair at the end closes the last gap.
  for (const [pa, pb] of [...lcsPairs(a, b), [a.length, b.length] as [number, number]]) {
    const olds = a.slice(ia, pa);
    const news = b.slice(ib, pb);
    // Same number of slots on both sides read as edits; the rest as
    // additions or removals.
    news.forEach((text, k) => changed.set(text, k < olds.length ? olds[k] : null));
    const gone = olds.slice(news.length);
    if (gone.length > 0) {
      const anchor = pb < b.length ? b[pb] : END;
      removedBefore.set(anchor, [...(removedBefore.get(anchor) ?? []), ...gone]);
      removals++;
    }
    ia = pa + 1;
    ib = pb + 1;
  }
  const count = changed.size + removals;
  return count > 0 ? { changed, removedBefore, count } : null;
}

/**
 * The baseline to keep after the reader edits a document that still has
 * unread changes: their own edits count as read, while untouched unread
 * changes (and removals) stay unread, so the next diff shows only those.
 */
export function baselineAfterEdit(current: string, changes: ChangeSet): string {
  const out: string[] = [];
  for (const text of blockTexts(current)) {
    out.push(...(changes.removedBefore.get(text) ?? []));
    if (!changes.changed.has(text)) out.push(text);
    else {
      const old = changes.changed.get(text);
      if (old != null) out.push(old);
    }
  }
  out.push(...(changes.removedBefore.get(END) ?? []));
  return out.join("\n\n") + "\n";
}

// --- three-way merge -----------------------------------------------------------

/** A block plus the text up to the next block (its trailing blank lines). */
interface Segment {
  key: string;
  text: string;
}

function segments(src: string): Segment[] {
  const blocks = extractBlocks(src);
  return blocks
    .map((b, i) => ({
      key: src.slice(b.start, b.end).trim(),
      text: src.slice(b.start, i + 1 < blocks.length ? blocks[i + 1].start : src.length),
    }))
    .filter((s) => s.key);
}

export interface MergeConflict {
  base: string;
  mine: string;
  theirs: string;
}

export interface MergeResult {
  text: string;
  /** Places both sides changed differently; `text` holds their version there. */
  conflicts: MergeConflict[];
}

/**
 * Merge the reader's edits (`mine`) with someone else's (`theirs`), both
 * made on top of `base`, block by block: a block changed on one side takes
 * that side; changed identically on both, either; changed differently on
 * both, it is a conflict. Untouched stretches keep `theirs`' exact text.
 */
export function merge3(base: string, mine: string, theirs: string): MergeResult {
  const B = segments(base);
  const M = segments(mine);
  const T = segments(theirs);
  const keys = (s: Segment[]) => s.map((x) => x.key);
  const inMine = new Map(lcsPairs(keys(B), keys(M)));
  const inTheirs = new Map(lcsPairs(keys(B), keys(T)));
  const same = (a: Segment[], b: Segment[]) => a.length === b.length && a.every((x, n) => x.key === b[n].key);
  const joined = (s: Segment[]) => s.map((x) => x.text).join("").trim();

  const out: Segment[] = [];
  const conflicts: MergeConflict[] = [];
  let i = 0;
  let j = 0;
  let k = 0;
  for (let b = 0; b <= B.length; b++) {
    // A block both sides kept closes the stretch before it.
    const end = b === B.length;
    if (!end && !(inMine.has(b) && inTheirs.has(b))) continue;
    const mj = end ? M.length : inMine.get(b)!;
    const tk = end ? T.length : inTheirs.get(b)!;
    if (mj < j || tk < k) continue;
    const cb = B.slice(i, b);
    const cm = M.slice(j, mj);
    const ct = T.slice(k, tk);
    if (same(cm, cb)) out.push(...ct);
    else if (same(ct, cb) || same(cm, ct)) out.push(...cm);
    else {
      conflicts.push({ base: joined(cb), mine: joined(cm), theirs: joined(ct) });
      out.push(...ct);
    }
    if (!end) out.push(T[tk]);
    i = b + 1;
    j = mj + 1;
    k = tk + 1;
  }

  // Blocks from different documents: keep a blank line between them.
  const text = out
    .map((s, n) => (n < out.length - 1 && !s.text.endsWith("\n\n") ? s.text.trimEnd() + "\n\n" : s.text))
    .join("");
  const endsWithNewline = [mine, theirs].some((d) => d.endsWith("\n"));
  return { text: endsWithNewline && text && !text.endsWith("\n") ? text + "\n" : text, conflicts };
}
