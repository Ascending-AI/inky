//! `.inkyignore`: hide clutter (vendored code, generated notes, …) from the
//! sidebar, Quick Open, search and the MCP listing. Same syntax and
//! semantics as `.gitignore` (via ripgrep's `ignore` crate): one file per
//! folder, patterns relative to it, deeper files override shallower ones,
//! `!pattern` re-includes. Opening a hidden file directly still works.

use ignore::gitignore::{Gitignore, GitignoreBuilder};
use ignore::Match;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Arc;

pub const IGNORE_FILE: &str = ".inkyignore";

const HEADER: &str = "# Hidden from Inky (sidebar, Quick Open, search). Same syntax as .gitignore.\n";

/// The `.inkyignore` matchers in force for one folder: its own and its
/// ancestors' (up to the root), deepest last.
#[derive(Clone, Default)]
pub struct Ignores(Vec<Arc<Gitignore>>);

impl Ignores {
    /// The rules in force inside `dir`: these plus `dir`'s own file, if any.
    pub fn enter(&self, dir: &Path) -> Ignores {
        let file = dir.join(IGNORE_FILE);
        if !file.is_file() {
            return self.clone();
        }
        let mut builder = GitignoreBuilder::new(dir);
        // A bad line is skipped rather than voiding the whole file.
        let _ = builder.add(&file);
        match builder.build() {
            Ok(gi) if !gi.is_empty() => {
                let mut stack = self.0.clone();
                stack.push(Arc::new(gi));
                Ignores(stack)
            }
            _ => self.clone(),
        }
    }

    /// Does a rule hide `path` (a direct child of the folder these rules belong to)?
    pub fn hides(&self, path: &Path, is_dir: bool) -> bool {
        self.rule_for(path, is_dir).is_some()
    }

    /// The rule hiding `path`, as (its `.inkyignore`, the pattern).
    fn rule_for(&self, path: &Path, is_dir: bool) -> Option<(PathBuf, String)> {
        for gi in self.0.iter().rev() {
            match gi.matched(path, is_dir) {
                Match::Ignore(glob) => {
                    let file = glob.from().map(Path::to_path_buf).unwrap_or_else(|| gi.path().join(IGNORE_FILE));
                    return Some((file, glob.original().to_string()));
                }
                Match::Whitelist(_) => return None,
                Match::None => {}
            }
        }
        None
    }
}

/// Is `path` (under `root`) hidden, itself or through a hidden folder above it?
/// Returns the rule responsible.
pub fn hidden_by(root: &Path, path: &Path) -> Option<(PathBuf, String)> {
    let rel = path.strip_prefix(root).ok()?;
    let parts: Vec<_> = rel.components().collect();
    let mut rules = Ignores::default().enter(root);
    let mut at = root.to_path_buf();
    for (i, part) in parts.iter().enumerate() {
        at.push(part);
        let last = i + 1 == parts.len();
        // A deleted path with no extension was most likely a folder.
        let is_dir = !last || at.is_dir() || (!at.exists() && at.extension().is_none());
        if let Some(rule) = rules.rule_for(&at, is_dir) {
            return Some(rule);
        }
        if !last {
            rules = rules.enter(&at);
        }
    }
    None
}

pub fn is_hidden(root: &Path, path: &Path) -> bool {
    hidden_by(root, path).is_some()
}

/// The root-anchored pattern that hides exactly `rel` (a folder gets a
/// trailing slash). Characters special to gitignore are escaped.
pub fn rule_for_path(rel: &Path, is_dir: bool) -> String {
    let mut out = String::from("/");
    for c in rel.to_string_lossy().replace('\\', "/").chars() {
        if matches!(c, '*' | '?' | '[' | ']' | '\\' | '!' | '#') {
            out.push('\\');
        }
        out.push(c);
    }
    if is_dir {
        out.push('/');
    }
    out
}

/// Append `rule` to `root`'s `.inkyignore` (created if missing); no-op if present.
pub fn add_rule(root: &Path, rule: &str) -> Result<(), String> {
    let file = root.join(IGNORE_FILE);
    let mut text = fs::read_to_string(&file).unwrap_or_else(|_| HEADER.to_string());
    if text.lines().any(|l| l.trim_end() == rule) {
        return Ok(());
    }
    if !text.is_empty() && !text.ends_with('\n') {
        text.push('\n');
    }
    text.push_str(rule);
    text.push('\n');
    fs::write(file, text).map_err(|e| e.to_string())
}

/// Remove `rule` from `root`'s `.inkyignore`; false if it was not there.
pub fn remove_rule(root: &Path, rule: &str) -> Result<bool, String> {
    let file = root.join(IGNORE_FILE);
    let Ok(text) = fs::read_to_string(&file) else {
        return Ok(false);
    };
    let kept: Vec<&str> = text.lines().filter(|l| l.trim_end() != rule).collect();
    if kept.len() == text.lines().count() {
        return Ok(false);
    }
    let mut out = kept.join("\n");
    out.push('\n');
    fs::write(file, out).map_err(|e| e.to_string())?;
    Ok(true)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn tree(paths: &[&str]) -> tempfile::TempDir {
        let d = tempfile::tempdir().unwrap();
        for p in paths {
            let full = d.path().join(p);
            if p.ends_with('/') {
                fs::create_dir_all(full).unwrap();
            } else {
                fs::create_dir_all(full.parent().unwrap()).unwrap();
                fs::write(full, "x").unwrap();
            }
        }
        d
    }

    #[test]
    fn gitignore_semantics_with_nested_files() {
        let d = tree(&["a/vendor_src/x.md", "a/keep.md", "a/b/gen.generated.md", "a/b/ok.md", "z.md"]);
        let root = d.path();
        fs::write(root.join(IGNORE_FILE), "vendor_src/\n*.generated.md\n").unwrap();
        fs::write(root.join("a/b").join(IGNORE_FILE), "!gen.generated.md\nok.md\n").unwrap();
        assert!(is_hidden(root, &root.join("a/vendor_src")));
        assert!(is_hidden(root, &root.join("a/vendor_src/x.md")), "inside a hidden folder");
        assert!(!is_hidden(root, &root.join("a/keep.md")));
        assert!(!is_hidden(root, &root.join("a/b/gen.generated.md")), "deeper file re-includes");
        assert!(is_hidden(root, &root.join("a/b/ok.md")), "deeper file adds rules");
        assert!(!is_hidden(root, &root.join("z.md")));
    }

    #[test]
    fn reports_which_rule_hides_a_path() {
        let d = tree(&["lab/x.md"]);
        fs::write(d.path().join(IGNORE_FILE), "# c\nlab/\n").unwrap();
        let (file, rule) = hidden_by(d.path(), &d.path().join("lab/x.md")).unwrap();
        assert_eq!(rule, "lab/");
        assert_eq!(file, d.path().join(IGNORE_FILE));
    }

    #[test]
    fn add_and_remove_exact_rules() {
        let d = tree(&["Research/vendor src/a.md", "Research/[draft]*.md"]);
        let root = d.path();
        let folder = rule_for_path(Path::new("Research/vendor src"), true);
        assert_eq!(folder, "/Research/vendor src/");
        add_rule(root, &folder).unwrap();
        add_rule(root, &folder).unwrap();
        let text = fs::read_to_string(root.join(IGNORE_FILE)).unwrap();
        assert_eq!(text.matches(&folder).count(), 1, "added once");
        assert!(text.starts_with('#'), "explains itself");
        assert!(is_hidden(root, &root.join("Research/vendor src/a.md")));

        // Special characters are escaped, so the rule hides only that file.
        let odd = rule_for_path(Path::new("Research/[draft]*.md"), false);
        add_rule(root, &odd).unwrap();
        assert!(is_hidden(root, &root.join("Research/[draft]*.md")));

        assert!(remove_rule(root, &folder).unwrap());
        assert!(!remove_rule(root, &folder).unwrap());
        assert!(!is_hidden(root, &root.join("Research/vendor src/a.md")));
    }
}
