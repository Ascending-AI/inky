/**
 * Reading typography: typeface pairing, line spacing, paragraph spacing and
 * a book layout (justified, hyphenated). Every option is applied as CSS
 * custom properties on the root element; "theme" spacing values remove the
 * property so the stylesheet's defaults show through. Typography is never part
 * of a colour theme.
 *
 * Typefaces are macOS system fonts, so nothing has to be downloaded and the
 * app stays offline.
 */

export const TYPEFACES = {
  default: {
    label: "Default",
    body: `-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", sans-serif`,
    heading: `-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", sans-serif`,
  },
  sans: {
    label: "San Francisco",
    body: `-apple-system, BlinkMacSystemFont, "Helvetica Neue", sans-serif`,
    heading: `-apple-system, BlinkMacSystemFont, "Helvetica Neue", sans-serif`,
  },
  newyork: {
    label: "New York",
    body: `ui-serif, "New York", Georgia, serif`,
    heading: `-apple-system, BlinkMacSystemFont, "Helvetica Neue", sans-serif`,
  },
  charter: {
    label: "Charter",
    body: `Charter, "Bitstream Charter", Georgia, serif`,
    heading: `"Avenir Next", Avenir, -apple-system, sans-serif`,
  },
  iowan: {
    label: "Iowan",
    body: `"Iowan Old Style", Palatino, Georgia, serif`,
    heading: `"Iowan Old Style", Palatino, Georgia, serif`,
  },
  avenir: {
    label: "Avenir",
    body: `"Avenir Next", Avenir, -apple-system, sans-serif`,
    heading: `"Avenir Next", Avenir, -apple-system, sans-serif`,
  },
} as const;

export const LINE_SPACINGS = {
  tight: { label: "Tight", value: "1.5" },
  theme: { label: "Normal", value: null },
  relaxed: { label: "Relaxed", value: "2" },
} as const;

export const PARA_SPACINGS = {
  compact: { label: "Compact", value: "0.5em" },
  theme: { label: "Normal", value: null },
  airy: { label: "Airy", value: "1.4em" },
} as const;

export type Typeface = keyof typeof TYPEFACES;
export type LineSpacing = keyof typeof LINE_SPACINGS;
export type ParaSpacing = keyof typeof PARA_SPACINGS;

export interface Typography {
  typeface: Typeface;
  lineSpacing: LineSpacing;
  paraSpacing: ParaSpacing;
  /** Justified, hyphenated paragraphs. */
  justify: boolean;
}

export const DEFAULT_TYPOGRAPHY: Typography = {
  typeface: "default",
  lineSpacing: "theme",
  paraSpacing: "theme",
  justify: false,
};

const STORAGE_KEY = "inky.typography";

/**
 * Stored settings, with anything unknown (renamed options, junk) reset. The old
 * "theme" typeface meant "whatever the theme says": serif for Book, system
 * otherwise, so it maps by the stored theme id.
 */
export function loadTypography(storedThemeId?: string): Typography {
  let raw: Partial<Typography> = {};
  try {
    raw = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}") ?? {};
  } catch {
    // Fall through to defaults.
  }
  return {
    typeface: legacyTypeface(raw.typeface, storedThemeId),
    lineSpacing: raw.lineSpacing && raw.lineSpacing in LINE_SPACINGS ? raw.lineSpacing : "theme",
    paraSpacing: raw.paraSpacing && raw.paraSpacing in PARA_SPACINGS ? raw.paraSpacing : "theme",
    justify: raw.justify === true,
  };
}

function legacyTypeface(stored: unknown, storedThemeId?: string): Typeface {
  if (typeof stored === "string" && stored !== "theme" && stored in TYPEFACES) return stored as Typeface;
  // Missing (never opened Reading settings), the old "theme" value, or junk:
  // what the theme used to say, serif for Book and system otherwise.
  return storedThemeId === "book" ? "iowan" : "default";
}

export function saveTypography(t: Typography) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(t));
  } catch {
    // A convenience; ignore storage failures.
  }
}

/** Root CSS properties for `t`; `null` means "remove, use the stylesheet's". */
export function typographyVars(t: Typography): Record<string, string | null> {
  const face = TYPEFACES[t.typeface];
  return {
    "--prose-font": face.body,
    "--prose-heading-font": face.heading,
    "--prose-leading": LINE_SPACINGS[t.lineSpacing].value,
    "--prose-para-gap": PARA_SPACINGS[t.paraSpacing].value,
  };
}

export function isDefaultTypography(t: Typography): boolean {
  return (Object.keys(DEFAULT_TYPOGRAPHY) as (keyof Typography)[]).every(
    (k) => t[k] === DEFAULT_TYPOGRAPHY[k],
  );
}
