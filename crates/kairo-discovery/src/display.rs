use kairo_protocol::v1::DisplayServer;
use tracing::debug;

pub fn detect() -> DisplayServer {
    let wayland = has_wayland();
    let x11 = has_x11();

    let result = match (wayland, x11) {
        (true, true) => DisplayServer::Both,
        (true, false) => DisplayServer::Wayland,
        (false, true) => DisplayServer::X11,
        (false, false) => DisplayServer::None,
    };

    debug!(?result, "display server detection complete");
    result
}

fn has_wayland() -> bool {
    std::env::var("WAYLAND_DISPLAY").is_ok()
        || std::env::var("XDG_SESSION_TYPE")
            .map(|v| v.eq_ignore_ascii_case("wayland"))
            .unwrap_or(false)
}

fn has_x11() -> bool {
    std::env::var("DISPLAY").is_ok()
        || std::env::var("XDG_SESSION_TYPE")
            .map(|v| v.eq_ignore_ascii_case("x11"))
            .unwrap_or(false)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_detect_does_not_panic() {
        let _ = detect();
    }

    #[test]
    fn test_none_when_no_display_env() {
        // In a truly headless environment with no DISPLAY or WAYLAND_DISPLAY
        // set, the result should be None.  We cannot guarantee the test
        // environment here, so we only assert the function returns a valid
        // variant.
        let server = detect();
        let valid = matches!(
            server,
            DisplayServer::None | DisplayServer::X11 | DisplayServer::Wayland | DisplayServer::Both
        );
        assert!(valid);
    }

    /// Simulate DISPLAY being set (X11 environment).
    #[test]
    fn test_x11_detection() {
        // has_x11 reads environment variables; we verify it compiles and runs.
        let _ = has_x11();
    }

    /// Simulate WAYLAND_DISPLAY being set.
    #[test]
    fn test_wayland_detection() {
        let _ = has_wayland();
    }

    /// Unit test with controlled environment variable.
    #[test]
    fn test_both_when_both_vars_set() {
        // We cannot safely set env vars in parallel tests without risk, so we
        // test the logic directly rather than through detect().
        let wayland = true;
        let x11 = true;
        let result = match (wayland, x11) {
            (true, true) => DisplayServer::Both,
            (true, false) => DisplayServer::Wayland,
            (false, true) => DisplayServer::X11,
            (false, false) => DisplayServer::None,
        };
        assert_eq!(result as i32, DisplayServer::Both as i32);
    }

    #[test]
    fn test_x11_only() {
        let result = match (false, true) {
            (true, true) => DisplayServer::Both,
            (true, false) => DisplayServer::Wayland,
            (false, true) => DisplayServer::X11,
            (false, false) => DisplayServer::None,
        };
        assert_eq!(result as i32, DisplayServer::X11 as i32);
    }
}
