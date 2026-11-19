/**
 * Local images load through Tauri's asset protocol, and the webview caches
 * them by URL. When an agent replaces a picture in place, the URL stays the
 * same, so the old picture keeps showing until Inky restarts.
 *
 * Each image's file stamp (modified time + size) is recorded the first time
 * it is shown. When a later stamp differs, the image gets a version that is
 * appended to its URL (`?v=…`, ignored by the asset protocol), which makes
 * the webview load it again.
 */

/**
 * Record fresh `stamps` (absolute path → stamp). The first stamp of an image
 * is its baseline: the URL it was shown with already matches the file. A
 * different stamp later sets `versions[path]`. Returns the paths that changed.
 */
export function applyStamps(
  seen: Map<string, string>,
  versions: Record<string, string>,
  stamps: Record<string, string>,
): string[] {
  const changed: string[] = [];
  for (const [path, stamp] of Object.entries(stamps)) {
    const prev = seen.get(path);
    seen.set(path, stamp);
    if (prev !== undefined && prev !== stamp) {
      versions[path] = stamp;
      changed.push(path);
    }
  }
  return changed;
}
