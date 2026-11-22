/** `path` is `root` or lies beneath it. */
export function isInside(path: string, root: string): boolean {
  if (!root) return false;
  return path === root || path.startsWith(root + "/");
}

/** Parent folder of `path`, with the home folder shortened to `~`. */
export function displayDir(path: string, home: string): string {
  const dir = path.slice(0, path.lastIndexOf("/")) || "/";
  if (home && isInside(dir, home)) return "~" + dir.slice(home.length);
  return dir;
}

export interface Crumb {
  label: string;
  /** Absolute folder this crumb stands for. */
  dir: string;
  /** Inside the library or opened folder, so its contents can be listed. */
  browsable: boolean;
}

/**
 * Folder trail from the visible root (opened folder, else Library) down to the
 * document's own folder. Documents outside both get one crumb: their folder.
 */
export function breadcrumbs(
  path: string,
  roots: { library: string; workspace: string | null; home: string },
): Crumb[] {
  const dir = path.slice(0, path.lastIndexOf("/")) || "/";
  const root =
    roots.workspace && isInside(path, roots.workspace)
      ? { dir: roots.workspace, label: roots.workspace.split("/").pop() || roots.workspace }
      : isInside(path, roots.library)
        ? { dir: roots.library, label: "Library" }
        : null;
  if (!root) return [{ label: displayDir(path, roots.home), dir, browsable: false }];
  const crumbs: Crumb[] = [{ label: root.label, dir: root.dir, browsable: true }];
  let at = root.dir;
  for (const part of dir.slice(root.dir.length).split("/").filter(Boolean)) {
    at = `${at}/${part}`;
    crumbs.push({ label: part, dir: at, browsable: true });
  }
  return crumbs;
}

/** Images the sidebar lists and previews (mirrors `IMAGE_EXTENSIONS` in library.rs). */
const IMAGE_RE = /\.(png|jpe?g|gif|webp|svg|avif|bmp|heic)$/i;

export function isImagePath(path: string): boolean {
  return IMAGE_RE.test(path);
}

/** Videos the sidebar lists and plays in a tab (mirrors `VIDEO_EXTENSIONS` in library.rs). */
const VIDEO_RE = /\.(mp4|mov|m4v|webm)$/i;

export function isVideoPath(path: string): boolean {
  return VIDEO_RE.test(path);
}

/** `path` after `from` was renamed or moved to `to` (unchanged if unaffected). */
export function remapPath(path: string, from: string, to: string): string {
  if (path === from) return to;
  if (path.startsWith(from + "/")) return to + path.slice(from.length);
  return path;
}

/** Folder paths stored as a JSON array; anything malformed reads as none. */
export function parsePathList(raw: string | null): string[] {
  try {
    const list: unknown = JSON.parse(raw ?? "[]");
    return Array.isArray(list) ? list.filter((p): p is string => typeof p === "string") : [];
  } catch {
    return [];
  }
}
