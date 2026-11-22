//! A small diagnostic log for "the window is black for a moment when I come
//! back to Inky": page loads, window focus, and the page's own timings, one
//! line each, in `~/Library/Logs/com.inky.app/display.log`.

use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::Path;
use std::time::{SystemTime, UNIX_EPOCH};

/// The log is kept under this size; the previous one is kept as `.old`.
const MAX_BYTES: u64 = 512 * 1024;

/// `2026-11-20 14:03:07.123Z` for a Unix time in milliseconds (UTC).
pub fn stamp(unix_ms: u64) -> String {
    let secs = unix_ms / 1000;
    let (h, m, s) = ((secs / 3600) % 24, (secs / 60) % 60, secs % 60);
    // Days since 1970-01-01 to a civil date (Howard Hinnant's algorithm).
    let z = (secs / 86_400) as i64 + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z.rem_euclid(146_097);
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let day = doy - (153 * mp + 2) / 5 + 1;
    let month = if mp < 10 { mp + 3 } else { mp - 9 };
    let year = yoe + era * 400 + i64::from(month <= 2);
    format!("{year:04}-{month:02}-{day:02} {h:02}:{m:02}:{s:02}.{:03}Z", unix_ms % 1000)
}

/// Appends one stamped line to `file`, moving a full log aside first.
pub fn append_to(file: &Path, line: &str) -> std::io::Result<()> {
    if let Some(dir) = file.parent() {
        fs::create_dir_all(dir)?;
    }
    if fs::metadata(file).map(|m| m.len() >= MAX_BYTES).unwrap_or(false) {
        fs::rename(file, file.with_extension("log.old"))?;
    }
    let now = SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_millis() as u64).unwrap_or(0);
    let mut f = OpenOptions::new().create(true).append(true).open(file)?;
    writeln!(f, "{} {}", stamp(now), line.replace('\n', " "))
}

/// Logs to the app's log folder; failures are ignored (it is only diagnostics).
pub fn log(app: &tauri::AppHandle, line: &str) {
    use tauri::Manager;
    if let Ok(dir) = app.path().app_log_dir() {
        let _ = append_to(&dir.join("display.log"), line);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn stamps_utc_dates() {
        assert_eq!(stamp(0), "1970-01-01 00:00:00.000Z");
        assert_eq!(stamp(951_782_400_000), "2000-02-29 00:00:00.000Z");
        assert_eq!(stamp(1_795_187_587_123), "2026-11-20 15:13:07.123Z");
    }

    #[test]
    fn appends_lines_and_rotates_a_full_log() {
        let dir = tempfile::tempdir().unwrap();
        let file = dir.path().join("logs/display.log");
        append_to(&file, "one\ntwo").unwrap();
        append_to(&file, "three").unwrap();
        let text = fs::read_to_string(&file).unwrap();
        let lines: Vec<&str> = text.lines().collect();
        assert_eq!(lines.len(), 2);
        assert!(lines[0].ends_with("Z one two"));
        assert!(lines[1].ends_with("Z three"));

        fs::write(&file, vec![b'x'; MAX_BYTES as usize]).unwrap();
        append_to(&file, "fresh").unwrap();
        assert!(fs::read_to_string(&file).unwrap().ends_with("Z fresh\n"));
        assert_eq!(fs::metadata(dir.path().join("logs/display.log.old")).unwrap().len(), MAX_BYTES);
    }
}
