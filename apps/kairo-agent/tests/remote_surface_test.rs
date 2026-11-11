#![allow(clippy::unwrap_used, clippy::expect_used, clippy::collapsible_if)]

use kairo_agent::{GuiInputEvent, RemoteGuiBackend, SurfaceLifecycleState, X11Backend};
use std::time::Duration;

#[tokio::test]
async fn test_x11_remote_surface_pipeline_end_to_end() {
    // Distinct preferred displays keep parallel tests off each other's windows
    // Distinct preferred displays keep parallel tests off each other's windows
    let backend = X11Backend::new(Some(":150".to_string()));

    // 1. Start the X11 Backend
    if let Err(e) = backend.start().await {
        eprintln!("Skipping X11 test (Xvfb unavailable: {e:?})");
        return;
    }

    let mut frame_rx = backend.subscribe_frames();
    let mut lifecycle_rx = backend.subscribe_lifecycle();

    // 2. Spawn a real X11 application: xterm
    let pid = backend
        .spawn_app(
            "xterm",
            "xterm",
            &["-geometry".to_string(), "80x24".to_string()],
            "",
        )
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

#[tokio::test]
async fn test_generic_process_lifecycle_and_association() {
    let backend = X11Backend::new(Some(":151".to_string()));
    if let Err(e) = backend.start().await {
        eprintln!("Skipping X11 test (Xvfb unavailable: {e:?})");
        return;
    }

    let mut lifecycle_rx = backend.subscribe_lifecycle();

    // 1. Spawn independent process
    let pid1 = backend
        .spawn_app(
            "xterm",
            "xterm",
            &["-geometry".to_string(), "60x20".to_string()],
            "",
        )
        .await
        .expect("Failed to spawn xterm");
    assert!(pid1 > 0);

    // 2. Wait for surface creation
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

    // 3. Verify process tracking & association in list_processes()
    let procs = backend.list_processes().await;
    let proc = procs
        .iter()
        .find(|p| p.pid == pid1)
        .expect("Process should be tracked");
    assert_eq!(proc.app_id, "xterm");
    assert_eq!(proc.state, "running");
    assert!(
        proc.surface_ids.contains(&surface_id),
        "Process should be associated with surface"
    );

    // 4. Test process reuse: launching existing app should reuse PID and focus surface
    let pid2 = backend
        .spawn_app("xterm", "xterm", &[], "")
        .await
        .expect("Failed to reuse app");
    assert_eq!(
        pid1, pid2,
        "Single instance policy should reuse existing PID"
    );

    // 5. Clean up surface
    let _ = backend.close_surface(&surface_id).await;
}

#[tokio::test]
async fn test_latency_measurements() {
    let backend = X11Backend::new(Some(":152".to_string()));
    if let Err(e) = backend.start().await {
        eprintln!("Skipping X11 test (Xvfb unavailable: {e:?})");
        return;
    }

    let mut frame_rx = backend.subscribe_frames();
    let mut lifecycle_rx = backend.subscribe_lifecycle();

    // 1. New application / tab spawn -> first frame
    let t_spawn_start = std::time::Instant::now();
    let _pid = backend
        .spawn_app(
            "xterm",
            "xterm",
            &["-geometry".to_string(), "80x24".to_string()],
            "",
        )
        .await
        .expect("Failed to spawn app");

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
    let t_surface_created = t_spawn_start.elapsed();

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
    .expect("Timed out waiting for initial frame");

    let t_first_frame = t_spawn_start.elapsed();
    println!("=== LATENCY MEASUREMENT REPORT ===");
    println!("1. First Frame & Spawn:");
    println!("   Surface Created: {:?}", t_surface_created);
    println!("   First Frame Received: {:?}", t_first_frame);
    println!(
        "   First Frame Dimensions: {}x{}",
        initial_frame.width, initial_frame.height
    );
    println!(
        "   First Frame Payload Size: {} bytes",
        initial_frame.data.len()
    );

    // 2. Single Keypress Latency (KeyDown -> Damage Frame)
    let t_key_start = std::time::Instant::now();
    backend
        .send_input(
            &surface_id,
            GuiInputEvent::KeyDown {
                key: "a".to_string(),
                code: "".to_string(),
            },
        )
        .await
        .expect("send keydown");
    backend
        .send_input(
            &surface_id,
            GuiInputEvent::KeyUp {
                key: "a".to_string(),
                code: "".to_string(),
            },
        )
        .await
        .expect("send keyup");

    let key_frame = tokio::time::timeout(Duration::from_secs(5), async {
        loop {
            if let Ok(f) = frame_rx.recv().await {
                if f.surface_id == surface_id && f.sequence > initial_frame.sequence {
                    return f;
                }
            }
        }
    })
    .await
    .expect("Timed out waiting for damage after single keypress");

    let t_key_damage = t_key_start.elapsed();
    println!("2. Single Keypress:");
    println!("   Input -> Damage Frame: {:?}", t_key_damage);
    println!(
        "   Dirty Rect: {}x{} at ({}, {})",
        key_frame.width, key_frame.height, key_frame.x, key_frame.y
    );
    println!(
        "   Dirty Frame Payload Size: {} bytes",
        key_frame.data.len()
    );

    // 3. Mouse Click Latency (MouseDown -> Damage Frame)
    let t_click_start = std::time::Instant::now();
    backend
        .send_input(
            &surface_id,
            GuiInputEvent::MouseDown {
                button: 0,
                x: 100,
                y: 100,
            },
        )
        .await
        .expect("send mousedown");
    backend
        .send_input(
            &surface_id,
            GuiInputEvent::MouseUp {
                button: 0,
                x: 100,
                y: 100,
            },
        )
        .await
        .expect("send mouseup");

    let click_frame = tokio::time::timeout(Duration::from_secs(5), async {
        loop {
            if let Ok(f) = frame_rx.recv().await {
                if f.surface_id == surface_id && f.sequence > key_frame.sequence {
                    return f;
                }
            }
        }
    })
    .await;

    println!("3. Mouse Click:");
    match click_frame {
        Ok(f) => {
            let t_click_damage = t_click_start.elapsed();
            println!("   Input -> Damage Frame: {:?}", t_click_damage);
            println!(
                "   Dirty Rect: {}x{} at ({}, {})",
                f.width, f.height, f.x, f.y
            );
            println!("   Dirty Frame Payload Size: {} bytes", f.data.len());
        }
        Err(_) => {
            println!("   Click produced no damage (window content did not change visual state)");
        }
    }

    // 4. 10 Rapid Keypresses
    println!("4. 10 Rapid Keypresses:");
    let t_rapid_start = std::time::Instant::now();
    let mut last_seq = key_frame.sequence;
    for i in 0..10 {
        let ch = ((b'0' + i) as char).to_string();
        let _ = backend
            .send_input(
                &surface_id,
                GuiInputEvent::KeyDown {
                    key: ch.clone(),
                    code: "".to_string(),
                },
            )
            .await;
        let _ = backend
            .send_input(
                &surface_id,
                GuiInputEvent::KeyUp {
                    key: ch,
                    code: "".to_string(),
                },
            )
            .await;
    }

    let mut frames_received = 0;
    let timeout_rapid = Duration::from_millis(1500);
    let start_wait = std::time::Instant::now();
    while start_wait.elapsed() < timeout_rapid {
        if let Ok(Ok(f)) = tokio::time::timeout(Duration::from_millis(200), frame_rx.recv()).await {
            if f.surface_id == surface_id && f.sequence > last_seq {
                last_seq = f.sequence;
                frames_received += 1;
            }
        } else {
            break;
        }
    }
    let t_rapid_total = t_rapid_start.elapsed();
    println!(
        "   Total time for 10 rapid keypresses + coalesced frames: {:?}",
        t_rapid_total
    );
    println!("   Damage frames received: {}", frames_received);

    let _ = backend.close_surface(&surface_id).await;
}
