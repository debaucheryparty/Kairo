use std::time::Duration;
use kairo_agent::{GuiInputEvent, RemoteGuiBackend, SurfaceLifecycleState, X11Backend};

#[tokio::test]
async fn test_x11_remote_surface_pipeline_end_to_end() {
    let backend = X11Backend::new(None);

    // 1. Start the X11 Backend
    backend.start().await.expect("Failed to start X11 backend");

    let mut frame_rx = backend.subscribe_frames();
    let mut lifecycle_rx = backend.subscribe_lifecycle();

    // 2. Spawn a real X11 application: xterm
    let pid = backend
        .spawn_app("xterm", "xterm", &["-geometry".to_string(), "80x24".to_string()], "")
        .await
        .expect("Failed to spawn xterm");
    assert!(pid > 0, "PID should be positive");

    // 3. Verify Surface Creation Lifecycle
    let notif = tokio::time::timeout(Duration::from_secs(8), async {
        loop {
            if let Ok(n) = lifecycle_rx.recv().await {
                if n.state == SurfaceLifecycleState::Created {
                    return n;
                }
            }
        }
    })
    .await
    .expect("Timed out waiting for surface Created event");

    let surface_id = notif.surface.surface_id.clone();
    assert!(surface_id.starts_with("x11-win-0x"));
    assert!(notif.surface.width > 0);
    assert!(notif.surface.height > 0);

    // 4. Verify Damage Updates (Partial dirty rectangles with raw_bgra)
    let initial_frame = tokio::time::timeout(Duration::from_secs(8), async {
        loop {
            if let Ok(f) = frame_rx.recv().await {
                if f.surface_id == surface_id {
                    return f;
                }
            }
        }
    })
    .await
    .expect("Timed out waiting for initial damage frame");

    assert!(initial_frame.codec == "raw_rgba" || initial_frame.codec == "raw_bgra");
    assert!(initial_frame.width > 0);
    assert!(initial_frame.height > 0);
    assert!(initial_frame.timestamp_us > 0);
    assert!(!initial_frame.data.is_empty());

    // 5. Verify Direct XTest Keyboard Input
    backend
        .send_input(
            &surface_id,
            GuiInputEvent::KeyDown {
                key: "x".to_string(),
                code: "".to_string(),
            },
        )
        .await
        .expect("Failed to send keydown");

    backend
        .send_input(
            &surface_id,
            GuiInputEvent::KeyUp {
                key: "x".to_string(),
                code: "".to_string(),
            },
        )
        .await
        .expect("Failed to send keyup");

    // 6. Verify Damage update produced by typed character
    let typed_frame = tokio::time::timeout(Duration::from_secs(5), async {
        loop {
            if let Ok(f) = frame_rx.recv().await {
                if f.surface_id == surface_id {
                    return f;
                }
            }
        }
    })
    .await
    .expect("Timed out waiting for damage frame after typing");

    assert!(typed_frame.codec == "raw_rgba" || typed_frame.codec == "raw_bgra");
    assert!(typed_frame.sequence > initial_frame.sequence);
    assert!(typed_frame.timestamp_us >= initial_frame.timestamp_us);

    // 7. Verify Configure (Move / Resize)
    backend
        .configure_surface(&surface_id, 80, 80, 700, 500)
        .await
        .expect("Failed to configure surface");

    // 8. Verify Focus
    backend
        .focus_surface(&surface_id)
        .await
        .expect("Failed to focus surface");

    // 9. Verify Destruction
    let closed = backend
        .close_surface(&surface_id)
        .await
        .expect("Failed to close surface");
    assert!(closed, "Surface should be closed successfully");
}
