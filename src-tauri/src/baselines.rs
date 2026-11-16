//! "Last read" copies of documents, for showing what changed since the
//! reader last looked. Kept in the app's data folder (never in the library),
//! one file per document named by a stable hash of its path.

use std::fs;
use std::path::{Path, PathBuf};

/// FNV-1a: stable across Rust releases (unlike `DefaultHasher`), so a
/// document keeps its baseline file between app versions.
fn fnv1a(s: &str) -> u64 {
    let mut h: u64 = 0xcbf2_9ce4_8422_2325;
    for b in s.as_bytes() {
        h ^= u64::from(*b);
        h = h.wrapping_mul(0x0100_0000_01b3);
    }
    h
}

fn file_for(dir: &Path, doc: &str) -> PathBuf {
    dir.join(format!("{:016x}.md", fnv1a(doc)))
}

pub fn read(dir: &Path, doc: &str) -> Option<String> {
    fs::read_to_string(file_for(dir, doc)).ok()
}

pub fn write(dir: &Path, doc: &str, content: &str) -> Result<(), String> {
    fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    fs::write(file_for(dir, doc), content).map_err(|e| e.to_string())
}

/// A document was renamed or moved: its baseline follows it.
pub fn rename(dir: &Path, from: &str, to: &str) {
    let src = file_for(dir, from);
    if src.exists() {
        let _ = fs::rename(src, file_for(dir, to));
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn write_read_and_follow_a_rename() {
        let d = tempfile::tempdir().unwrap();
        let dir = d.path().join("baselines");
        assert_eq!(read(&dir, "/lib/a.md"), None);
        write(&dir, "/lib/a.md", "v1").unwrap();
        assert_eq!(read(&dir, "/lib/a.md").as_deref(), Some("v1"));
        assert_eq!(read(&dir, "/lib/b.md"), None);
        rename(&dir, "/lib/a.md", "/lib/b.md");
        assert_eq!(read(&dir, "/lib/a.md"), None);
        assert_eq!(read(&dir, "/lib/b.md").as_deref(), Some("v1"));
    }

    #[test]
    fn hash_is_stable() {
        assert_eq!(fnv1a(""), 0xcbf2_9ce4_8422_2325);
        assert_eq!(fnv1a("a"), 0xaf63_dc4c_8601_ec8c);
    }
}
