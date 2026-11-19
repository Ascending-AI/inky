/**
 * Code blocks in the reading view: syntax colours (highlight.js), a language
 * label, terminal sessions told apart from scripts, and compact JSON laid out
 * for reading. Only the display changes; the document's text stays as written.
 */
import hljs from "highlight.js/lib/common";

export interface HighlightedCode {
  /** Highlighted HTML (escaped). */
  html: string;
  /** The text that was highlighted (JSON may be re-indented). */
  text: string;
  /** highlight.js language id, or "plaintext". */
  language: string;
  /** Shown above the block; empty when the language was only guessed. */
  label: string;
  /** A terminal session: `$` prompts with commands and their output. */
  shell: boolean;
}

/** Languages worth guessing for unlabelled blocks (the rest misfire too often). */
const GUESSABLE = [
  "javascript", "typescript", "python", "bash", "json", "yaml", "sql", "rust", "go", "java",
  "css", "xml", "markdown", "diff", "ruby", "php", "c", "cpp", "csharp", "swift", "kotlin", "ini",
];
/** Below this highlight.js relevance a guess is mostly noise. */
const MIN_RELEVANCE = 3;
const PLAIN_NAMES = new Set(["text", "txt", "plain", "plaintext", "output", "none"]);
const SESSION_NAMES = new Set(["console", "shell-session", "terminal", "shellsession"]);
const SCRIPT_SHELLS = new Set(["bash", "sh", "zsh", "shell", "fish"]);
const LABELS: Record<string, string> = { bash: "Shell", shell: "Terminal", plaintext: "" };

/** The first non-empty line starts with a `$ ` prompt. */
export function isShellSession(code: string): boolean {
  const first = code.split("\n").find((l) => l.trim() !== "");
  return first !== undefined && /^\s{0,3}\$ /.test(first);
}

export function highlightCode(code: string, lang: string): HighlightedCode {
  const name = lang.trim().toLowerCase();
  const known = name ? hljs.getLanguage(name) : undefined;

  if (SESSION_NAMES.has(name) || ((!name || SCRIPT_SHELLS.has(name)) && isShellSession(code))) {
    return result(code, "shell", "Terminal", true);
  }
  if (known) {
    const id = canonical(name);
    const text = id === "json" ? layoutJson(code) : code;
    return result(text, id, LABELS[id] ?? known.name ?? name, false);
  }
  if (name) {
    return result(code, "plaintext", PLAIN_NAMES.has(name) ? "" : lang.trim(), false);
  }
  // Unlabelled: JSON is recognised for certain; anything else is a guess.
  if (/^\s*[[{]/.test(code) && isJson(code)) return result(layoutJson(code), "json", "", false);
  const guess = hljs.highlightAuto(code, GUESSABLE);
  if (guess.language && guess.relevance >= MIN_RELEVANCE) {
    return { html: guess.value, text: code, language: guess.language, label: "", shell: false };
  }
  return result(code, "plaintext", "", false);
}

function result(text: string, language: string, label: string, shell: boolean): HighlightedCode {
  return { html: hljs.highlight(text, { language }).value, text, language, label, shell };
}

/** highlight.js id for a name or alias ("py" → "python"). */
function canonical(name: string): string {
  const lang = hljs.getLanguage(name);
  const ids = hljs.listLanguages();
  return ids.find((id) => hljs.getLanguage(id) === lang) ?? name;
}

function isJson(code: string): boolean {
  try {
    JSON.parse(code);
    return true;
  } catch {
    return false;
  }
}

/** Lists of plain values up to this width stay on one line: `["R1", "R2"]`. */
const INLINE_LIST = 60;

/**
 * Lay out valid JSON for reading: one entry per line, two spaces per level,
 * short lists of plain values kept on one line. Works on the characters, not
 * parsed values, so numbers and strings stay exactly as written (no `1.50` →
 * `1.5`, no precision loss). Invalid JSON is returned unchanged.
 */
export function layoutJson(code: string): string {
  if (!isJson(code)) return code;
  const src = code.trim();
  let out = "";
  let depth = 0;
  const pad = () => "\n" + "  ".repeat(depth);
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (ch === '"') {
      const end = stringEnd(src, i);
      out += src.slice(i, end + 1);
      i = end;
    } else if (/\s/.test(ch)) {
      continue;
    } else if (ch === "{" || ch === "[") {
      const close = closing(src, i);
      const inner = compact(src.slice(i + 1, close));
      if (inner === "") {
        out += ch + src[close];
        i = close;
      } else if (ch === "[" && !hasContainer(src, i + 1, close) && inner.length + 2 <= INLINE_LIST) {
        out += `[${inner}]`;
        i = close;
      } else {
        depth++;
        out += ch + pad();
      }
    } else if (ch === "}" || ch === "]") {
      depth--;
      out += pad() + ch;
    } else if (ch === ",") {
      out += "," + pad();
    } else if (ch === ":") {
      out += ": ";
    } else {
      out += ch;
    }
  }
  return out;
}

/** Index of the quote closing the string that opens at `start`. */
function stringEnd(src: string, start: number): number {
  for (let i = start + 1; i < src.length; i++) {
    if (src[i] === "\\") i++;
    else if (src[i] === '"') return i;
  }
  return src.length - 1;
}

/** Index of the bracket closing the one at `open`. */
function closing(src: string, open: number): number {
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    const ch = src[i];
    if (ch === '"') i = stringEnd(src, i);
    else if (ch === "{" || ch === "[") depth++;
    else if ((ch === "}" || ch === "]") && --depth === 0) return i;
  }
  return src.length - 1;
}

function hasContainer(src: string, from: number, to: number): boolean {
  for (let i = from; i < to; i++) {
    if (src[i] === '"') i = stringEnd(src, i);
    else if (src[i] === "{" || src[i] === "[") return true;
  }
  return false;
}

/** One-line form of a list's contents: no whitespace, `, ` between items. */
function compact(body: string): string {
  let out = "";
  for (let i = 0; i < body.length; i++) {
    const ch = body[i];
    if (ch === '"') {
      const end = stringEnd(body, i);
      out += body.slice(i, end + 1);
      i = end;
    } else if (ch === ",") out += ", ";
    else if (!/\s/.test(ch)) out += ch;
  }
  return out;
}

/**
 * What the Copy button copies: the block's text, or for a terminal session
 * just the commands (no `$` prompts, no output), ready to paste into a shell.
 */
export function codeBlockText(pre: Element): string {
  const code = pre.querySelector("code") ?? pre;
  if (pre.classList.contains("code-shell")) {
    const commands = [...code.querySelectorAll(".language-bash")].map((el) => el.textContent ?? "");
    if (commands.length) return commands.join("\n");
  }
  return code.textContent ?? "";
}
