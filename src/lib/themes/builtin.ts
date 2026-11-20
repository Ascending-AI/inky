/**
 * The three built-in themes, with every key set explicitly. The values are
 * the ones the old `:root` / `.dark` / `.book` CSS blocks held, so the built-ins
 * look exactly as they always did. Typography is not part of a theme.
 */
import type { Theme } from "./model";

// The tab strip is a plain colour: the same mix the stylesheet always made, with
// each theme's own text and page colours written out.
const STRIP_LIGHT = "color-mix(in oklab, oklch(0.141 0.005 285.823) 3.5%, oklch(1 0 0))";
const STRIP_DARK = "color-mix(in oklab, black 12%, oklch(0.245 0.006 264))";
const STRIP_BOOK = "color-mix(in oklab, oklch(0.3 0.03 60) 3.5%, oklch(0.955 0.018 84))";

export const LIGHT: Theme = {
  id: "light",
  name: "Light",
  kind: "light",
  colors: {
    page: "oklch(1 0 0)",
    text: "oklch(0.141 0.005 285.823)",
    accent: "oklch(0.488 0.217 264.052)",
    sidebar: "oklch(0.985 0 0)",
    border: "oklch(0.92 0.004 286.32)",
    mutedText: "oklch(0.552 0.016 285.938)",
    hover: "oklch(0.967 0.001 286.375)",
    tableHeader: "oklch(0.967 0.001 286.375)",
    inlineCode: "oklch(0.96 0.004 286.32)",
    quoteBar: "oklch(0.87 0.006 286.32)",
    selection: "oklch(0.62 0.19 260 / 22%)",
    commentMark: "rgb(250 204 21)",
    tabStrip: STRIP_LIGHT,
  },
  ui: {
    card: "oklch(1 0 0)",
    cardText: "oklch(0.141 0.005 285.823)",
    popover: "oklch(1 0 0)",
    popoverText: "oklch(0.141 0.005 285.823)",
    primary: "oklch(0.21 0.006 285.885)",
    primaryText: "oklch(0.985 0 0)",
    secondary: "oklch(0.967 0.001 286.375)",
    secondaryText: "oklch(0.21 0.006 285.885)",
    hoverText: "oklch(0.21 0.006 285.885)",
    destructive: "oklch(0.577 0.245 27.325)",
    destructiveText: "oklch(0.985 0 0)",
    input: "oklch(0.92 0.004 286.32)",
    ring: "oklch(0.705 0.015 286.067)",
    sidebarText: "oklch(0.141 0.005 285.823)",
    sidebarBorder: "oklch(0.92 0.004 286.32)",
    commentLine: "rgb(202 138 4)",
  },
  syntax: {
    comment: "#6a737d",
    keyword: "#d73a49",
    string: "#032f62",
    title: "#6f42c1",
    number: "#005cc5",
    attr: "#22863a",
  },
};

export const DARK: Theme = {
  id: "dark",
  name: "Dark",
  kind: "dark",
  colors: {
    page: "oklch(0.245 0.006 264)",
    text: "oklch(0.95 0.004 264)",
    accent: "oklch(0.707 0.165 254.624)",
    sidebar: "oklch(0.27 0.006 264)",
    border: "oklch(1 0 0 / 13%)",
    mutedText: "oklch(0.72 0.012 264)",
    hover: "oklch(0.34 0.007 264)",
    tableHeader: "oklch(0.32 0.006 264)",
    inlineCode: "oklch(0.3 0.006 264)",
    quoteBar: "oklch(0.42 0.008 264)",
    selection: "oklch(0.62 0.19 260 / 38%)",
    commentMark: "rgb(250 204 21)",
    tabStrip: STRIP_DARK,
  },
  ui: {
    card: "oklch(0.285 0.006 264)",
    cardText: "oklch(0.95 0.004 264)",
    popover: "oklch(0.285 0.006 264)",
    popoverText: "oklch(0.95 0.004 264)",
    primary: "oklch(0.92 0.004 286.32)",
    primaryText: "oklch(0.245 0.006 264)",
    secondary: "oklch(0.32 0.006 264)",
    secondaryText: "oklch(0.95 0.004 264)",
    hoverText: "oklch(0.95 0.004 264)",
    destructive: "oklch(0.704 0.191 22.216)",
    destructiveText: "oklch(0.95 0.004 264)",
    input: "oklch(1 0 0 / 17%)",
    ring: "oklch(0.58 0.014 264)",
    sidebarText: "oklch(0.95 0.004 264)",
    sidebarBorder: "oklch(1 0 0 / 11%)",
    commentLine: "rgb(202 138 4)",
  },
  syntax: {
    comment: "#8b949e",
    keyword: "#ff7b72",
    string: "#a5d6ff",
    title: "#d2a8ff",
    number: "#79c0ff",
    attr: "#7ee787",
  },
};

export const BOOK: Theme = {
  id: "book",
  name: "Book",
  kind: "light",
  colors: {
    page: "oklch(0.955 0.018 84)",
    text: "oklch(0.3 0.03 60)",
    accent: "oklch(0.45 0.1 40)",
    sidebar: "oklch(0.935 0.02 84)",
    border: "oklch(0.87 0.02 80)",
    mutedText: "oklch(0.5 0.03 60)",
    hover: "oklch(0.89 0.025 80)",
    tableHeader: "oklch(0.91 0.02 84)",
    inlineCode: "oklch(0.9 0.02 84)",
    quoteBar: "oklch(0.8 0.03 80)",
    selection: "oklch(0.78 0.09 85 / 50%)",
    commentMark: "rgb(250 204 21)",
    tabStrip: STRIP_BOOK,
  },
  ui: {
    card: "oklch(0.97 0.014 84)",
    cardText: "oklch(0.3 0.03 60)",
    popover: "oklch(0.97 0.014 84)",
    popoverText: "oklch(0.3 0.03 60)",
    primary: "oklch(0.42 0.06 50)",
    primaryText: "oklch(0.97 0.014 84)",
    secondary: "oklch(0.91 0.02 84)",
    secondaryText: "oklch(0.35 0.04 55)",
    hoverText: "oklch(0.32 0.04 55)",
    destructive: "oklch(0.55 0.2 28)",
    destructiveText: "oklch(0.97 0.014 84)",
    input: "oklch(0.87 0.02 80)",
    ring: "oklch(0.6 0.05 60)",
    sidebarText: "oklch(0.3 0.03 60)",
    sidebarBorder: "oklch(0.87 0.02 80)",
    commentLine: "rgb(202 138 4)",
  },
  syntax: {
    comment: "#8a7a66",
    keyword: "#a0430a",
    string: "#5c661f",
    title: "#7d4a9e",
    number: "#14657f",
    attr: "#3f6d34",
  },
};

export const BUILT_IN: readonly Theme[] = [LIGHT, DARK, BOOK];
