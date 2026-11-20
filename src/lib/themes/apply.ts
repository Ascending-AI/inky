import { resolveTheme, type Theme } from "./model";

/** Put a theme on `root`: every colour property, colour scheme and kind class. */
export function applyThemeTo(root: HTMLElement, t: Theme): void {
  for (const [prop, value] of Object.entries(resolveTheme(t))) {
    root.style.setProperty(prop, value);
  }
  root.style.colorScheme = t.kind;
  // Tailwind's `dark` variant and the `.dark …` rules in app.css key off this.
  root.classList.remove("light", "dark", "book");
  root.classList.add(t.kind);
}
