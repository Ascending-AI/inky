//! Colour theme files: one `<id>.json` per theme in the app's config folder
//! (never in the library). The frontend owns the format; this module only
//! lists, writes and deletes the files safely.

use std::fs;
use std::path::Path;

/// `^[a-z0-9][a-z0-9-]{0,63}$`
pub fn valid_id(id: &str) -> bool {
    let b = id.as_bytes();
    if b.is_empty() || b.len() > 64 {
        return false;
    }
    let first_ok = b[0].is_ascii_lowercase() || b[0].is_ascii_digit();
    first_ok && b[1..].iter().all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || *c == b'-')
}

/// A theme file: its name without `.json` (the theme's id) and its text.
#[derive(serde::Serialize, Debug, PartialEq)]
pub struct ThemeFile {
    pub id: String,
    pub json: String,
}

/// Every `<valid id>.json` file directly in `dir`, sorted by file name.
pub fn list(dir: &Path) -> Vec<ThemeFile> {
    let Ok(entries) = fs::read_dir(dir) else { return Vec::new() };
    let mut files: Vec<_> = entries
        .filter_map(Result::ok)
        .filter(|e| e.path().is_file() && e.path().extension().is_some_and(|x| x == "json"))
        .map(|e| e.path())
        .collect();
    files.sort_by(|a, b| a.file_name().cmp(&b.file_name()));
    files
        .iter()
        .filter_map(|p| {
            let id = p.file_stem()?.to_str()?;
            if !valid_id(id) {
                return None;
            }
            Some(ThemeFile { id: id.to_string(), json: fs::read_to_string(p).ok()? })
        })
        .collect()
}

/// Atomically write `<id>.json` (write-then-rename).
pub fn write(dir: &Path, id: &str, json: &str) -> Result<(), String> {
    if !valid_id(id) {
        return Err(format!("invalid theme id: {id}"));
    }
    serde_json::from_str::<serde_json::Value>(json).map_err(|e| format!("invalid theme: {e}"))?;
    fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    let file = dir.join(format!("{id}.json"));
    let tmp = dir.join(format!("{id}.json.tmp"));
    fs::write(&tmp, json).map_err(|e| e.to_string())?;
    fs::rename(&tmp, &file).map_err(|e| e.to_string())
}

/// Remove `<id>.json`; a file that is already gone is fine.
pub fn delete(dir: &Path, id: &str) -> Result<(), String> {
    if !valid_id(id) {
        return Err(format!("invalid theme id: {id}"));
    }
    match fs::remove_file(dir.join(format!("{id}.json"))) {
        Ok(()) => Ok(()),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(e) => Err(e.to_string()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn tmp(name: &str) -> std::path::PathBuf {
        let d = std::env::temp_dir().join(format!("inky-themes-{name}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&d);
        d
    }

    #[test]
    fn valid_id_rules() {
        assert!(valid_id("fjord"));
        assert!(valid_id("my-theme-2"));
        assert!(valid_id(&"a".repeat(64)));
        for bad in ["", "-x", "Fjord", "a/b", ".."] {
            assert!(!valid_id(bad), "{bad}");
        }
        assert!(!valid_id(&"a".repeat(65)));
    }

    #[test]
    fn write_then_list_round_trips() {
        let d = tmp("rt");
        write(&d, "b", r#"{"n":2}"#).unwrap();
        write(&d, "a", r#"{"n":1}"#).unwrap();
        assert_eq!(list(&d).iter().map(|f| f.json.as_str()).collect::<Vec<_>>(), vec![r#"{"n":1}"#, r#"{"n":2}"#]);
        write(&d, "a", r#"{"n":3}"#).unwrap();
        assert_eq!(list(&d)[0].json, r#"{"n":3}"#);
        let _ = fs::remove_dir_all(&d);
    }

    #[test]
    fn write_rejects_bad_id_and_bad_json() {
        let d = tmp("bad");
        assert!(write(&d, "../x", "{}").is_err());
        assert!(write(&d, "Ok", "{}").is_err());
        assert!(write(&d, "ok", "not json").is_err());
        assert!(list(&d).is_empty());
        let _ = fs::remove_dir_all(&d);
    }

    #[test]
    fn write_is_atomic_leaves_no_tmp() {
        let d = tmp("atomic");
        write(&d, "x", "{}").unwrap();
        let names: Vec<_> = fs::read_dir(&d).unwrap().map(|e| e.unwrap().file_name()).collect();
        assert_eq!(names, vec![std::ffi::OsString::from("x.json")]);
        let _ = fs::remove_dir_all(&d);
    }

    #[test]
    fn delete_missing_is_ok() {
        let d = tmp("del");
        assert!(delete(&d, "nope").is_ok());
        write(&d, "x", "{}").unwrap();
        delete(&d, "x").unwrap();
        assert!(list(&d).is_empty());
        assert!(delete(&d, "../x").is_err());
        let _ = fs::remove_dir_all(&d);
    }

    #[test]
    fn list_skips_non_json_and_subdirs() {
        let d = tmp("skip");
        write(&d, "a", "{}").unwrap();
        fs::write(d.join("note.txt"), "x").unwrap();
        fs::create_dir(d.join("sub.json")).unwrap();
        fs::write(d.join("Bad Name.json"), "{}").unwrap();
        assert_eq!(list(&d), vec![ThemeFile { id: "a".into(), json: "{}".into() }]);
        assert!(list(&d.join("missing")).is_empty());
        let _ = fs::remove_dir_all(&d);
    }
}
