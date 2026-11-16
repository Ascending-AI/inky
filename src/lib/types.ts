export interface TreeNode {
  name: string;
  path: string;
  isDir: boolean;
  children: TreeNode[];
  /** Hidden by an `.inkyignore` rule; only listed while showing hidden items. */
  hidden?: boolean;
}

export type ThemeName = "light" | "dark" | "book";
export type ViewMode = "preview" | "split" | "editor";

/** A file or folder handed to Inky by macOS (Finder, `inky`, File → Open). */
export interface OpenRequest {
  kind: "file" | "folder";
  path: string;
}
