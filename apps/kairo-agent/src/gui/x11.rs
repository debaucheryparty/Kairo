use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use async_trait::async_trait;
use tokio::sync::{broadcast, mpsc, Mutex, RwLock};
use tracing::{debug, info};
use x11rb::connection::{Connection, RequestConnection};
use x11rb::protocol::composite::{self, Redirect};
use x11rb::protocol::damage::{self, ReportLevel};
use x11rb::protocol::xproto::*;
use x11rb::protocol::xtest;

use super::{
    GuiError, GuiInputEvent, RemoteGuiBackend, RemoteSurface, SurfaceDamageFrame,
    SurfaceLifecycleNotification, SurfaceLifecycleState,
};

enum X11Command {
    Configure {
        surface_id: String,
        x: i32,
        y: i32,
        width: u32,
        height: u32,
    },
    Focus {
        surface_id: String,
    },
    Input {
        surface_id: String,
        event: GuiInputEvent,
    },
    Close {
        surface_id: String,
    },
    Refresh {
        surface_id: Option<String>,
    },
    ProcessExited {
        pid: u32,
    },
}

#[derive(Clone, Debug)]
struct X11TrackedWindow {
    surface_id: String,
    #[allow(dead_code)]
    xid: u32,
    damage_id: u32,
    app_id: String,
    pid: Option<u32>,
    title: String,
    x: i32,
    y: i32,
    width: u32,
    height: u32,
    is_transient: bool,
    parent_surface_id: Option<String>,
    sequence: u64,
}

#[inline]
fn bgra_to_rgba_inplace(buf: &mut [u8]) {
    for chunk in buf.chunks_exact_mut(4) {
        chunk.swap(0, 2);
        chunk[3] = 255;
    }
}

struct KeycodeMapper {
    min_keycode: u8,
    keysyms_per_keycode: usize,
    keysyms: Vec<u32>,
}

impl KeycodeMapper {
    fn new(conn: &impl Connection) -> Result<Self, GuiError> {
        let setup = conn.setup();
        let min_keycode = setup.min_keycode;
        let count = setup.max_keycode.saturating_sub(min_keycode) + 1;
        let mapping = get_keyboard_mapping(conn, min_keycode, count)
            .map_err(|e| GuiError::ProtocolError(e.to_string()))?
            .reply()
            .map_err(|e| GuiError::ProtocolError(e.to_string()))?;

        Ok(Self {
            min_keycode,
            keysyms_per_keycode: mapping.keysyms_per_keycode as usize,
            keysyms: mapping.keysyms,
        })
    }

    fn web_key_to_keysym(&self, key: &str, _code: &str) -> u32 {
        match key {
            "Enter" => 0xFF0D,
            "Backspace" => 0xFF08,
            "Tab" => 0xFF09,
            "Escape" => 0xFF1B,
            "ArrowLeft" => 0xFF51,
            "ArrowUp" => 0xFF52,
            "ArrowRight" => 0xFF53,
            "ArrowDown" => 0xFF54,
            "Delete" => 0xFFFF,
            "Home" => 0xFF50,
            "End" => 0xFF57,
            "PageUp" => 0xFF55,
            "PageDown" => 0xFF56,
            "Control" => 0xFFE3,
            "Shift" => 0xFFE1,
            "Alt" => 0xFFE9,
            "Meta" => 0xFFEB,
            "Insert" => 0xFF63,
            "F1" => 0xFFBE,
            "F2" => 0xFFBF,
            "F3" => 0xFFC0,
            "F4" => 0xFFC1,
            "F5" => 0xFFC2,
            "F6" => 0xFFC3,
            "F7" => 0xFFC4,
            "F8" => 0xFFC5,
            "F9" => 0xFFC6,
            "F10" => 0xFFC7,
            "F11" => 0xFFC8,
            "F12" => 0xFFC9,
            " " => 0x0020,
            s if s.len() == 1 => {
                let c = s.chars().next().unwrap_or(' ');
                c as u32
            }
            _ => 0,
        }
    }

    fn keysym_to_keycode(&self, keysym: u32) -> Option<u8> {
        if keysym == 0 || self.keysyms_per_keycode == 0 {
            return None;
        }
        for (idx, chunk) in self.keysyms.chunks(self.keysyms_per_keycode).enumerate() {
            if chunk.iter().any(|&s| s == keysym) {
                return Some(self.min_keycode + idx as u8);
            }
        }
        None
    }
}

pub struct X11Backend {
    display: String,
    running: Arc<AtomicBool>,
    cmd_tx: mpsc::Sender<X11Command>,
    cmd_rx: Arc<Mutex<Option<mpsc::Receiver<X11Command>>>>,
    frame_tx: broadcast::Sender<SurfaceDamageFrame>,
    lifecycle_tx: broadcast::Sender<SurfaceLifecycleNotification>,
    surfaces: Arc<RwLock<HashMap<String, RemoteSurface>>>,
    pid_to_app: Arc<std::sync::RwLock<HashMap<u32, String>>>,
    xvfb_child: Arc<RwLock<Option<tokio::process::Child>>>,
}

impl X11Backend {
    #[must_use]
    pub fn new(display: Option<String>) -> Self {
        let display_str = Self::find_available_display(display.as_deref());

        let (cmd_tx, cmd_rx) = mpsc::channel::<X11Command>(256);
        let (frame_tx, _) = broadcast::channel::<SurfaceDamageFrame>(512);
        let (lifecycle_tx, _) = broadcast::channel::<SurfaceLifecycleNotification>(128);
        let running = Arc::new(AtomicBool::new(false));
        let surfaces = Arc::new(RwLock::new(HashMap::new()));
        let pid_to_app = Arc::new(std::sync::RwLock::new(HashMap::new()));

        Self {
            display: display_str,
            running,
            cmd_tx,
            cmd_rx: Arc::new(Mutex::new(Some(cmd_rx))),
            frame_tx,
            lifecycle_tx,
            surfaces,
            pid_to_app,
            xvfb_child: Arc::new(RwLock::new(None)),
        }
    }

    fn find_available_display(preferred: Option<&str>) -> String {
        if let Some(p) = preferred {
            let num = p.trim_start_matches(':');
            if num != "0" {
                let lock = format!("/tmp/.X{num}-lock");
                let sock = format!("/tmp/.X11-unix/X{num}");
                let is_used = std::path::Path::new(&lock).exists()
                    || std::path::Path::new(&sock).exists()
                    || x11rb::connect(Some(p)).is_ok();
                if !is_used {
                    return p.to_string();
                }
            }
        }

        // Never inherit host DISPLAY (:0). Kairo must always run in an isolated virtual framebuffer.
        // Find first free display port between 100 and 250
        for n in 100..250 {
            let candidate = format!(":{n}");
            let lock = format!("/tmp/.X{n}-lock");
            let sock = format!("/tmp/.X11-unix/X{n}");
            if !std::path::Path::new(&lock).exists() && !std::path::Path::new(&sock).exists() {
                if x11rb::connect(Some(&candidate)).is_err() {
                    return candidate;
                }
            }
        }

        ":199".to_string()
    }

    fn ensure_xvfb_running(&self) -> Result<Option<tokio::process::Child>, GuiError> {
        // If display is already active, don't spawn a new Xvfb
        if let Ok((_c, _s)) = x11rb::connect(Some(&self.display)) {
            debug!(display = %self.display, "X11 display already running");
            return Ok(None);
        }

        let display_num = self.display.trim_start_matches(':');
        let lock_path = format!("/tmp/.X{display_num}-lock");
        let sock_path = format!("/tmp/.X11-unix/X{display_num}");

        // Clean stale lock if process is dead
        if let Ok(content) = std::fs::read_to_string(&lock_path) {
            let pid = content.trim().parse::<u32>().unwrap_or(0);
            let is_alive = pid > 0 && std::path::Path::new(&format!("/proc/{pid}")).exists();
            if !is_alive {
                let _ = std::fs::remove_file(&lock_path);
                let _ = std::fs::remove_file(&sock_path);
            }
        }

        info!(display = %self.display, "Starting headless Xvfb display server");
        let child = tokio::process::Command::new("Xvfb")
            .args([
                &self.display,
                "-screen",
                "0",
                "1920x1080x24",
                "-ac",
                "-listen",
                "tcp",
            ])
            .spawn()
            .map_err(|e| GuiError::SpawnError(format!("Failed to start Xvfb: {e}")))?;

        Ok(Some(child))
    }
}

#[async_trait]
impl RemoteGuiBackend for X11Backend {
    async fn start(&self) -> Result<(), GuiError> {
        if self.running.load(Ordering::Relaxed) {
            return Ok(());
        }

        // Spawn Xvfb if not already running
        if let Some(xvfb) = self.ensure_xvfb_running()? {
            let mut lock = self.xvfb_child.write().await;
            *lock = Some(xvfb);
        }

        // Connect pure-Rust x11rb with retry loop (waiting for socket readiness)
        let mut conn_opt = None;
        for _ in 0..50 {
            match x11rb::connect(Some(&self.display)) {
                Ok(c) => {
                    conn_opt = Some(c);
                    break;
                }
                Err(_) => {
                    tokio::time::sleep(Duration::from_millis(100)).await;
                }
            }
        }

        let (conn, screen_num) = conn_opt
            .ok_or_else(|| GuiError::ConnectionError(format!("{}: connection timed out", self.display)))?;

        let screen = &conn.setup().roots[screen_num];
        let root = screen.root;

        composite::query_version(&conn, 0, 4)
            .map_err(|e| GuiError::ProtocolError(e.to_string()))?
            .reply()
            .map_err(|e| GuiError::ProtocolError(e.to_string()))?;

        damage::query_version(&conn, 1, 1)
            .map_err(|e| GuiError::ProtocolError(e.to_string()))?
            .reply()
            .map_err(|e| GuiError::ProtocolError(e.to_string()))?;

        composite::redirect_subwindows(&conn, root, Redirect::AUTOMATIC)
            .map_err(|e| GuiError::ProtocolError(e.to_string()))?
            .check()
            .map_err(|e| GuiError::ProtocolError(e.to_string()))?;

        change_window_attributes(
            &conn,
            root,
            &ChangeWindowAttributesAux::new().event_mask(EventMask::SUBSTRUCTURE_NOTIFY),
        )
        .map_err(|e| GuiError::ProtocolError(e.to_string()))?
        .check()
        .map_err(|e| GuiError::ProtocolError(e.to_string()))?;

        let keymapper = Arc::new(KeycodeMapper::new(&conn)?);

        let cmd_rx_opt = self.cmd_rx.lock().await.take();
        let Some(mut cmd_rx) = cmd_rx_opt else {
            return Ok(());
        };

        self.running.store(true, Ordering::Relaxed);
        let running_clone = self.running.clone();
        let frame_tx = self.frame_tx.clone();
        let lifecycle_tx = self.lifecycle_tx.clone();
        let surfaces_store = self.surfaces.clone();
        let pid_to_app_clone = self.pid_to_app.clone();

        let _ = conn.flush();

        // Spawn dedicated X11 background thread
        std::thread::spawn(move || {
            let mut tracked_windows: HashMap<u32, X11TrackedWindow> = HashMap::new();
            let mut damage_to_xid: HashMap<u32, u32> = HashMap::new();
            let mut xid_to_surface_id: HashMap<u32, String> = HashMap::new();
            let mut surface_id_to_xid: HashMap<String, u32> = HashMap::new();

            while running_clone.load(Ordering::Relaxed) {
                // Drain incoming commands
                while let Ok(cmd) = cmd_rx.try_recv() {
                    match cmd {
                        X11Command::Configure {
                            surface_id,
                            x,
                            y,
                            width,
                            height,
                        } => {
                            if let Some(&xid) = surface_id_to_xid.get(&surface_id) {
                                let values = ConfigureWindowAux::new()
                                    .x(x)
                                    .y(y)
                                    .width(width.max(1))
                                    .height(height.max(1));
                                let _ = configure_window(&conn, xid, &values);
                                let _ = conn.flush();
                            }
                        }
                        X11Command::Focus { surface_id } => {
                            if let Some(&xid) = surface_id_to_xid.get(&surface_id) {
                                let _ = set_input_focus(
                                    &conn,
                                    InputFocus::POINTER_ROOT,
                                    xid,
                                    x11rb::CURRENT_TIME,
                                );
                                let _ = conn.flush();
                            }
                        }
                        X11Command::Input { surface_id, event } => {
                            if let Some(&xid) = surface_id_to_xid.get(&surface_id) {
                                match event {
                                    GuiInputEvent::MouseMove { x, y } => {
                                        if let Ok(coords) =
                                            translate_coordinates(&conn, xid, root, x as i16, y as i16)
                                        {
                                            if let Ok(reply) = coords.reply() {
                                                let _ = xtest::fake_input(
                                                    &conn,
                                                    6, // MotionNotify
                                                    0,
                                                    x11rb::CURRENT_TIME,
                                                    root,
                                                    reply.dst_x,
                                                    reply.dst_y,
                                                    0,
                                                );
                                                let _ = conn.flush();
                                            }
                                        }
                                    }
                                    GuiInputEvent::MouseDown { button, x, y } => {
                                        if let Ok(coords) =
                                            translate_coordinates(&conn, xid, root, x as i16, y as i16)
                                        {
                                            if let Ok(reply) = coords.reply() {
                                                let _ = xtest::fake_input(
                                                    &conn,
                                                    6,
                                                    0,
                                                    x11rb::CURRENT_TIME,
                                                    root,
                                                    reply.dst_x,
                                                    reply.dst_y,
                                                    0,
                                                );
                                                let _ = xtest::fake_input(
                                                    &conn,
                                                    4, // ButtonPress
                                                    (button + 1) as u8,
                                                    x11rb::CURRENT_TIME,
                                                    root,
                                                    reply.dst_x,
                                                    reply.dst_y,
                                                    0,
                                                );
                                                let _ = conn.flush();
                                            }
                                        }
                                    }
                                    GuiInputEvent::MouseUp { button, x, y } => {
                                        if let Ok(coords) =
                                            translate_coordinates(&conn, xid, root, x as i16, y as i16)
                                        {
                                            if let Ok(reply) = coords.reply() {
                                                let _ = xtest::fake_input(
                                                    &conn,
                                                    5, // ButtonRelease
                                                    (button + 1) as u8,
                                                    x11rb::CURRENT_TIME,
                                                    root,
                                                    reply.dst_x,
                                                    reply.dst_y,
                                                    0,
                                                );
                                                let _ = conn.flush();
                                            }
                                        }
                                    }
                                    GuiInputEvent::KeyDown { key, code } => {
                                        let t0 = std::time::Instant::now();
                                        info!("[AGENT XTEST] injecting keydown key={}", key);
                                        let keysym = keymapper.web_key_to_keysym(&key, &code);
                                        if let Some(keycode) = keymapper.keysym_to_keycode(keysym) {
                                            let _ = xtest::fake_input(
                                                &conn,
                                                2, // KeyPress
                                                keycode,
                                                x11rb::CURRENT_TIME,
                                                root,
                                                0,
                                                0,
                                                0,
                                            );
                                            let _ = conn.flush();
                                            info!("[AGENT XTEST] completed keydown key={} in {:?}", key, t0.elapsed());
                                        }
                                    }
                                    GuiInputEvent::KeyUp { key, code } => {
                                        let keysym = keymapper.web_key_to_keysym(&key, &code);
                                        if let Some(keycode) = keymapper.keysym_to_keycode(keysym) {
                                            let _ = xtest::fake_input(
                                                &conn,
                                                3, // KeyRelease
                                                keycode,
                                                x11rb::CURRENT_TIME,
                                                root,
                                                0,
                                                0,
                                                0,
                                            );
                                            let _ = conn.flush();
                                        }
                                    }
                                    GuiInputEvent::Wheel { delta_y, .. } => {
                                        let btn = if delta_y < 0 { 4 } else { 5 };
                                        let _ = xtest::fake_input(
                                            &conn,
                                            4,
                                            btn,
                                            x11rb::CURRENT_TIME,
                                            root,
                                            0,
                                            0,
                                            0,
                                        );
                                        let _ = xtest::fake_input(
                                            &conn,
                                            5,
                                            btn,
                                            x11rb::CURRENT_TIME,
                                            root,
                                            0,
                                            0,
                                            0,
                                        );
                                        let _ = conn.flush();
                                    }
                                }
                            }
                        }
                        X11Command::Close { surface_id } => {
                            if let Some(&xid) = surface_id_to_xid.get(&surface_id) {
                                Self::close_window(&conn, xid);
                            }
                        }
                        X11Command::Refresh { surface_id } => {
                            let targets: Vec<(u32, String, u32, u32)> = tracked_windows
                                .values()
                                .filter(|w| {
                                    if let Some(ref sid) = surface_id {
                                        &w.surface_id == sid
                                    } else {
                                        true
                                    }
                                })
                                .map(|w| (w.xid, w.surface_id.clone(), w.width, w.height))
                                .collect();

                            for (xid, sid, w, h) in targets {
                                if w > 0 && h > 0 {
                                    if let Ok(Ok(reply)) = get_image(
                                        &conn,
                                        ImageFormat::Z_PIXMAP,
                                        xid,
                                        0,
                                        0,
                                        w as u16,
                                        h as u16,
                                        !0,
                                    )
                                    .map(|c| c.reply())
                                    {
                                        if reply.data.len() >= (w as usize) * (h as usize) * 4 {
                                            let mut data = reply.data;
                                            bgra_to_rgba_inplace(&mut data);
                                            if let Some(win) = tracked_windows.get_mut(&xid) {
                                                win.sequence += 1;
                                                let seq = win.sequence;
                                                let timestamp_us = SystemTime::now()
                                                    .duration_since(UNIX_EPOCH)
                                                    .unwrap_or_default()
                                                    .as_micros()
                                                    as u64;

                                                let frame = SurfaceDamageFrame {
                                                    surface_id: sid,
                                                    sequence: seq,
                                                    x: 0,
                                                    y: 0,
                                                    width: w,
                                                    height: h,
                                                    codec: "raw_rgba".to_string(),
                                                    data,
                                                    timestamp_us,
                                                };

                                                let _ = frame_tx.send(frame);
                                            }
                                        }
                                    }
                                }
                            }
                        }
                        X11Command::ProcessExited { pid } => {
                            let xids_to_remove: Vec<u32> = tracked_windows
                                .iter()
                                .filter(|(_, win)| win.pid == Some(pid))
                                .map(|(&xid, _)| xid)
                                .collect();

                            for xid in xids_to_remove {
                                if let Some(win) = tracked_windows.remove(&xid) {
                                    damage_to_xid.remove(&win.damage_id);
                                    xid_to_surface_id.remove(&xid);
                                    surface_id_to_xid.remove(&win.surface_id);

                                    let surface = RemoteSurface {
                                        surface_id: win.surface_id.clone(),
                                        app_id: win.app_id.clone(),
                                        title: win.title.clone(),
                                        x: win.x,
                                        y: win.y,
                                        width: win.width,
                                        height: win.height,
                                        state: SurfaceLifecycleState::Destroyed,
                                        is_transient: win.is_transient,
                                        parent_surface_id: win.parent_surface_id.clone(),
                                    };

                                    let _ = lifecycle_tx.send(SurfaceLifecycleNotification {
                                        surface,
                                        state: SurfaceLifecycleState::Destroyed,
                                    });
                                }
                            }
                        }
                    }
                }

                // Poll X11 events
                while let Ok(Some(event)) = conn.poll_for_event() {
                    match event {
                        x11rb::protocol::Event::CreateNotify(_c) => {
                            // Unmapped windows are not visible surfaces. Defer registration to MapNotify.
                        }
                        x11rb::protocol::Event::UnmapNotify(u) => {
                            if let Some(win) = tracked_windows.remove(&u.window) {
                                damage_to_xid.remove(&win.damage_id);
                                xid_to_surface_id.remove(&u.window);
                                surface_id_to_xid.remove(&win.surface_id);

                                let surface = RemoteSurface {
                                    surface_id: win.surface_id.clone(),
                                    app_id: win.app_id.clone(),
                                    title: win.title.clone(),
                                    x: win.x,
                                    y: win.y,
                                    width: win.width,
                                    height: win.height,
                                    state: SurfaceLifecycleState::Destroyed,
                                    is_transient: win.is_transient,
                                    parent_surface_id: win.parent_surface_id.clone(),
                                };

                                let _ = lifecycle_tx.send(SurfaceLifecycleNotification {
                                    surface,
                                    state: SurfaceLifecycleState::Destroyed,
                                });
                            }
                        }
                        x11rb::protocol::Event::MapNotify(m) => {
                            if m.window != root && !m.override_redirect {
                                if !tracked_windows.contains_key(&m.window) {
                                    Self::register_window(
                                        &conn,
                                        m.window,
                                        &mut tracked_windows,
                                        &mut damage_to_xid,
                                        &mut xid_to_surface_id,
                                        &mut surface_id_to_xid,
                                        &lifecycle_tx,
                                        &pid_to_app_clone,
                                    );
                                }
                                if let Some(win) = tracked_windows.get(&m.window) {
                                    if win.width > 0 && win.height > 0 {
                                        if let Ok(Ok(reply)) = get_image(
                                            &conn,
                                            ImageFormat::Z_PIXMAP,
                                            m.window,
                                            0,
                                            0,
                                            win.width as u16,
                                            win.height as u16,
                                            !0,
                                        )
                                        .map(|c| c.reply()) {
                                            let expected_len = (win.width as usize) * (win.height as usize) * 4;
                                            if reply.data.len() >= expected_len {
                                                let mut data = reply.data;
                                                bgra_to_rgba_inplace(&mut data);
                                                let timestamp_us = SystemTime::now()
                                                    .duration_since(UNIX_EPOCH)
                                                    .unwrap_or_default()
                                                    .as_micros() as u64;
                                                let frame = SurfaceDamageFrame {
                                                    surface_id: win.surface_id.clone(),
                                                    sequence: win.sequence,
                                                    x: 0,
                                                    y: 0,
                                                    width: win.width,
                                                    height: win.height,
                                                    codec: "raw_rgba".to_string(),
                                                    data,
                                                    timestamp_us,
                                                };
                                                let _ = frame_tx.send(frame);
                                            }
                                        }
                                    }
                                }
                            }
                        }
                        x11rb::protocol::Event::ConfigureNotify(c) => {
                            if let Some(win) = tracked_windows.get_mut(&c.window) {
                                win.x = c.x as i32;
                                win.y = c.y as i32;
                                win.width = c.width as u32;
                                win.height = c.height as u32;

                                let surface = RemoteSurface {
                                    surface_id: win.surface_id.clone(),
                                    app_id: win.app_id.clone(),
                                    title: win.title.clone(),
                                    x: win.x,
                                    y: win.y,
                                    width: win.width,
                                    height: win.height,
                                    state: SurfaceLifecycleState::Configured,
                                    is_transient: win.is_transient,
                                    parent_surface_id: win.parent_surface_id.clone(),
                                };

                                let _ = lifecycle_tx.send(SurfaceLifecycleNotification {
                                    surface,
                                    state: SurfaceLifecycleState::Configured,
                                });
                            }
                        }
                        x11rb::protocol::Event::FocusIn(f) => {
                            if let Some(win) = tracked_windows.get(&f.event) {
                                let surface = RemoteSurface {
                                    surface_id: win.surface_id.clone(),
                                    app_id: win.app_id.clone(),
                                    title: win.title.clone(),
                                    x: win.x,
                                    y: win.y,
                                    width: win.width,
                                    height: win.height,
                                    state: SurfaceLifecycleState::Focused,
                                    is_transient: win.is_transient,
                                    parent_surface_id: win.parent_surface_id.clone(),
                                };

                                let _ = lifecycle_tx.send(SurfaceLifecycleNotification {
                                    surface,
                                    state: SurfaceLifecycleState::Focused,
                                });
                            }
                        }
                        x11rb::protocol::Event::FocusOut(f) => {
                            if let Some(win) = tracked_windows.get(&f.event) {
                                let surface = RemoteSurface {
                                    surface_id: win.surface_id.clone(),
                                    app_id: win.app_id.clone(),
                                    title: win.title.clone(),
                                    x: win.x,
                                    y: win.y,
                                    width: win.width,
                                    height: win.height,
                                    state: SurfaceLifecycleState::Unfocused,
                                    is_transient: win.is_transient,
                                    parent_surface_id: win.parent_surface_id.clone(),
                                };

                                let _ = lifecycle_tx.send(SurfaceLifecycleNotification {
                                    surface,
                                    state: SurfaceLifecycleState::Unfocused,
                                });
                            }
                        }
                        x11rb::protocol::Event::PropertyNotify(p) => {
                            if let Some(win) = tracked_windows.get_mut(&p.window) {
                                let new_title = Self::get_window_title(&conn, p.window);
                                if new_title != win.title {
                                    win.title = new_title;
                                    let surface = RemoteSurface {
                                        surface_id: win.surface_id.clone(),
                                        app_id: win.app_id.clone(),
                                        title: win.title.clone(),
                                        x: win.x,
                                        y: win.y,
                                        width: win.width,
                                        height: win.height,
                                        state: SurfaceLifecycleState::Configured,
                                        is_transient: win.is_transient,
                                        parent_surface_id: win.parent_surface_id.clone(),
                                    };
                                    let _ = lifecycle_tx.send(SurfaceLifecycleNotification {
                                        surface,
                                        state: SurfaceLifecycleState::Configured,
                                    });
                                }
                            }
                        }
                        x11rb::protocol::Event::DestroyNotify(d) => {
                            if let Some(win) = tracked_windows.remove(&d.window) {
                                damage_to_xid.remove(&win.damage_id);
                                xid_to_surface_id.remove(&d.window);
                                surface_id_to_xid.remove(&win.surface_id);

                                let surface = RemoteSurface {
                                    surface_id: win.surface_id.clone(),
                                    app_id: win.app_id.clone(),
                                    title: win.title.clone(),
                                    x: win.x,
                                    y: win.y,
                                    width: win.width,
                                    height: win.height,
                                    state: SurfaceLifecycleState::Destroyed,
                                    is_transient: win.is_transient,
                                    parent_surface_id: win.parent_surface_id.clone(),
                                };

                                let _ = lifecycle_tx.send(SurfaceLifecycleNotification {
                                    surface,
                                    state: SurfaceLifecycleState::Destroyed,
                                });
                            }
                        }
                        x11rb::protocol::Event::DamageNotify(d) => {
                            if let Some(&xid) = damage_to_xid.get(&d.damage) {
                                // Always subtract reported damage to clear server state
                                let _ = damage::subtract(
                                    &conn,
                                    d.damage,
                                    x11rb::NONE,
                                    x11rb::NONE,
                                );

                                if let Some(win) = tracked_windows.get_mut(&xid) {
                                    let win_w = win.width as i32;
                                    let win_h = win.height as i32;
                                    if win_w <= 0 || win_h <= 0 {
                                        continue;
                                    }

                                    let raw_x = d.area.x as i32;
                                    let raw_y = d.area.y as i32;
                                    let raw_w = d.area.width as i32;
                                    let raw_h = d.area.height as i32;

                                    // Intersect damaged rect with window bounds [0, 0, win_w, win_h]
                                    let clip_x0 = raw_x.max(0);
                                    let clip_y0 = raw_y.max(0);
                                    let clip_x1 = (raw_x + raw_w).min(win_w);
                                    let clip_y1 = (raw_y + raw_h).min(win_h);

                                    if clip_x1 <= clip_x0 || clip_y1 <= clip_y0 {
                                        continue;
                                    }

                                    let x = clip_x0 as i16;
                                    let y = clip_y0 as i16;
                                    let w = (clip_x1 - clip_x0) as u16;
                                    let h = (clip_y1 - clip_y0) as u16;

                                    if let Ok(Ok(reply)) = get_image(
                                        &conn,
                                        ImageFormat::Z_PIXMAP,
                                        xid,
                                        x,
                                        y,
                                        w,
                                        h,
                                        !0,
                                    )
                                    .map(|c| c.reply())
                                    {
                                        let expected_len = (w as usize) * (h as usize) * 4;
                                        if reply.data.len() < expected_len {
                                            continue;
                                        }

                                        let mut data = reply.data;
                                        bgra_to_rgba_inplace(&mut data);

                                        win.sequence += 1;
                                        let seq = win.sequence;
                                        let sid = win.surface_id.clone();

                                        let timestamp_us = SystemTime::now()
                                            .duration_since(UNIX_EPOCH)
                                            .unwrap_or_default()
                                            .as_micros()
                                            as u64;

                                        info!(
                                            "[AGENT FRAME] captured sid={} seq={} area={}x{}+{}+{} bytes={}",
                                            sid, seq, w, h, x, y, data.len()
                                        );

                                        let frame = SurfaceDamageFrame {
                                            surface_id: sid,
                                            sequence: seq,
                                            x: x as i32,
                                            y: y as i32,
                                            width: w as u32,
                                            height: h as u32,
                                            codec: "raw_rgba".to_string(),
                                            data,
                                            timestamp_us,
                                        };

                                        let _ = frame_tx.send(frame);
                                    }
                                }
                            }
                        }
                        _ => {}
                    }
                }

                // Sync known surfaces into the shared RwLock
                let current_surfaces: HashMap<String, RemoteSurface> = tracked_windows
                    .values()
                    .map(|w| {
                        (
                            w.surface_id.clone(),
                            RemoteSurface {
                                surface_id: w.surface_id.clone(),
                                app_id: w.app_id.clone(),
                                title: w.title.clone(),
                                x: w.x,
                                y: w.y,
                                width: w.width,
                                height: w.height,
                                state: if w.is_transient {
                                    SurfaceLifecycleState::Transient
                                } else {
                                    SurfaceLifecycleState::Created
                                },
                                is_transient: w.is_transient,
                                parent_surface_id: w.parent_surface_id.clone(),
                            },
                        )
                    })
                    .collect();

                if let Ok(mut lock) = surfaces_store.try_write() {
                    *lock = current_surfaces;
                }

                std::thread::sleep(Duration::from_millis(5));
            }
        });

        info!(display = %self.display, "X11 Remote GUI Backend initialized and running");
        Ok(())
    }

    async fn spawn_app(
        &self,
        app_id: &str,
        exec: &str,
        args: &[String],
        working_directory: &str,
    ) -> Result<u32, GuiError> {
        let mut parts = exec.split_whitespace();
        let binary = parts.next().unwrap_or(app_id);
        let mut cmd = tokio::process::Command::new(binary);

        for arg in parts {
            if !arg.starts_with('%') {
                cmd.arg(arg);
            }
        }

        for arg in args {
            cmd.arg(arg);
        }

        if !working_directory.is_empty() {
            cmd.current_dir(working_directory);
        }

        cmd.env("DISPLAY", &self.display);
        cmd.env("GDK_BACKEND", "x11");
        cmd.env("QT_QPA_PLATFORM", "xcb");
        cmd.env("MOZ_ENABLE_WAYLAND", "0");
        cmd.env_remove("WAYLAND_DISPLAY");

        let mut child = cmd
            .spawn()
            .map_err(|e| GuiError::SpawnError(format!("Failed to spawn {exec}: {e}")))?;

        let pid = child.id().unwrap_or(0);
        if let Ok(mut map) = self.pid_to_app.write() {
            map.insert(pid, app_id.to_string());
        }

        let cmd_tx_clone = self.cmd_tx.clone();
        let pid_to_app_clone = self.pid_to_app.clone();
        tokio::spawn(async move {
            let _ = child.wait().await;
            if let Ok(mut map) = pid_to_app_clone.write() {
                map.remove(&pid);
            }
            let _ = cmd_tx_clone.send(X11Command::ProcessExited { pid }).await;
        });

        info!(pid = pid, app = %app_id, exec = %exec, display = %self.display, "Spawned X11 application");
        Ok(pid)
    }

    async fn configure_surface(
        &self,
        surface_id: &str,
        x: i32,
        y: i32,
        width: u32,
        height: u32,
    ) -> Result<(), GuiError> {
        self.cmd_tx
            .send(X11Command::Configure {
                surface_id: surface_id.to_string(),
                x,
                y,
                width,
                height,
            })
            .await
            .map_err(|e| GuiError::BackendError(e.to_string()))
    }

    async fn focus_surface(&self, surface_id: &str) -> Result<(), GuiError> {
        self.cmd_tx
            .send(X11Command::Focus {
                surface_id: surface_id.to_string(),
            })
            .await
            .map_err(|e| GuiError::BackendError(e.to_string()))
    }

    async fn send_input(&self, surface_id: &str, event: GuiInputEvent) -> Result<(), GuiError> {
        self.cmd_tx
            .send(X11Command::Input {
                surface_id: surface_id.to_string(),
                event,
            })
            .await
            .map_err(|e| GuiError::BackendError(e.to_string()))
    }

    async fn close_surface(&self, surface_id: &str) -> Result<bool, GuiError> {
        let matching_surfaces: Vec<String> = {
            let map = self.surfaces.read().await;
            if map.contains_key(surface_id) {
                vec![surface_id.to_string()]
            } else if let Some(pid_str) = surface_id.strip_prefix("app-") {
                if let Ok(pid) = pid_str.parse::<u32>() {
                    let app_opt = self.pid_to_app.read().ok().and_then(|m| m.get(&pid).cloned());
                    if let Some(app) = app_opt {
                        map.values()
                            .filter(|s| s.app_id == app)
                            .map(|s| s.surface_id.clone())
                            .collect()
                    } else {
                        vec![]
                    }
                } else {
                    vec![]
                }
            } else {
                vec![]
            }
        };

        let mut closed_any = false;
        for sid in matching_surfaces {
            let _ = self.cmd_tx.send(X11Command::Close { surface_id: sid }).await;
            closed_any = true;
        }

        // If surface_id is app-<pid>, also terminate the spawned process if still running
        if let Some(pid_str) = surface_id.strip_prefix("app-") {
            if let Ok(pid) = pid_str.parse::<u32>() {
                let _ = tokio::process::Command::new("kill")
                    .args(["-TERM", &pid.to_string()])
                    .status()
                    .await;
                closed_any = true;
            }
        }

        // If direct surface_id wasn't in surfaces map yet, still forward Close command
        if !closed_any && surface_id.starts_with("x11-win-") {
            let _ = self
                .cmd_tx
                .send(X11Command::Close {
                    surface_id: surface_id.to_string(),
                })
                .await;
            closed_any = true;
        }

        Ok(closed_any)
    }

    async fn list_surfaces(&self) -> Vec<RemoteSurface> {
        let map = self.surfaces.read().await;
        map.values().cloned().collect()
    }

    async fn refresh_surface(&self, surface_id: Option<&str>) -> Result<(), GuiError> {
        self.cmd_tx
            .send(X11Command::Refresh {
                surface_id: surface_id.map(ToString::to_string),
            })
            .await
            .map_err(|e| GuiError::BackendError(e.to_string()))
    }

    fn subscribe_frames(&self) -> broadcast::Receiver<SurfaceDamageFrame> {
        self.frame_tx.subscribe()
    }

    fn subscribe_lifecycle(&self) -> broadcast::Receiver<SurfaceLifecycleNotification> {
        self.lifecycle_tx.subscribe()
    }
}

impl X11Backend {
    fn register_window(
        conn: &impl Connection,
        win: u32,
        tracked_windows: &mut HashMap<u32, X11TrackedWindow>,
        damage_to_xid: &mut HashMap<u32, u32>,
        xid_to_surface_id: &mut HashMap<u32, String>,
        surface_id_to_xid: &mut HashMap<String, u32>,
        lifecycle_tx: &broadcast::Sender<SurfaceLifecycleNotification>,
        pid_to_app: &Arc<std::sync::RwLock<HashMap<u32, String>>>,
    ) {
        if tracked_windows.contains_key(&win) {
            return;
        }

        // Check if window is transient (dialog, popup, modal)
        let mut is_transient = false;
        let mut parent_surface_id = None;
        if let Ok(prop) = get_property(
            conn,
            false,
            win,
            AtomEnum::WM_TRANSIENT_FOR,
            AtomEnum::WINDOW,
            0,
            1,
        ) {
            if let Ok(reply) = prop.reply() {
                if reply.format == 32 && reply.value.len() >= 4 {
                    let parent_xid = u32::from_ne_bytes([
                        reply.value[0],
                        reply.value[1],
                        reply.value[2],
                        reply.value[3],
                    ]);
                    is_transient = true;
                    parent_surface_id = xid_to_surface_id.get(&parent_xid).cloned();
                }
            }
        }

        let geom = match get_geometry(conn, win).map(|c| c.reply()) {
            Ok(Ok(g)) => g,
            _ => return,
        };

        // Ignore invisible IPC/clipboard/message helper windows (e.g. 1x1 or 10x10)
        if geom.width < 32 || geom.height < 32 {
            return;
        }

        let title = Self::get_window_title(conn, win);
        let pid = Self::get_window_pid(conn, win);
        let app_id = if let Some(p) = pid {
            if let Ok(map) = pid_to_app.read() {
                map.get(&p).cloned().unwrap_or_else(|| {
                    Self::get_window_wm_class(conn, win).unwrap_or_else(|| "x11-app".to_string())
                })
            } else {
                Self::get_window_wm_class(conn, win).unwrap_or_else(|| "x11-app".to_string())
            }
        } else {
            Self::get_window_wm_class(conn, win).unwrap_or_else(|| "x11-app".to_string())
        };

        let dmg_id = match conn.generate_id() {
            Ok(id) => id,
            Err(_) => return,
        };

        if damage::create(conn, dmg_id, win, ReportLevel::NON_EMPTY)
            .map(|c| c.check())
            .is_err()
        {
            return;
        }

        let _ = change_window_attributes(
            conn,
            win,
            &ChangeWindowAttributesAux::new().event_mask(
                EventMask::STRUCTURE_NOTIFY
                    | EventMask::FOCUS_CHANGE
                    | EventMask::PROPERTY_CHANGE,
            ),
        );

        let surface_id = format!("x11-win-0x{win:x}");
        let state = if is_transient {
            SurfaceLifecycleState::Transient
        } else {
            SurfaceLifecycleState::Created
        };

        let tracked = X11TrackedWindow {
            surface_id: surface_id.clone(),
            xid: win,
            damage_id: dmg_id,
            app_id: app_id.clone(),
            pid,
            title: title.clone(),
            x: geom.x as i32,
            y: geom.y as i32,
            width: geom.width as u32,
            height: geom.height as u32,
            is_transient,
            parent_surface_id: parent_surface_id.clone(),
            sequence: 0,
        };

        tracked_windows.insert(win, tracked);
        damage_to_xid.insert(dmg_id, win);
        xid_to_surface_id.insert(win, surface_id.clone());
        surface_id_to_xid.insert(surface_id.clone(), win);

        let surface = RemoteSurface {
            surface_id,
            app_id,
            title,
            x: geom.x as i32,
            y: geom.y as i32,
            width: geom.width as u32,
            height: geom.height as u32,
            state,
            is_transient,
            parent_surface_id,
        };

        let _ = lifecycle_tx.send(SurfaceLifecycleNotification { surface, state });
    }

    fn get_window_pid(conn: &impl RequestConnection, win: u32) -> Option<u32> {
        let net_wm_pid_atom = conn
            .intern_atom(false, b"_NET_WM_PID")
            .ok()?
            .reply()
            .ok()?
            .atom;
        let prop = get_property(
            conn,
            false,
            win,
            net_wm_pid_atom,
            AtomEnum::CARDINAL,
            0,
            1,
        )
        .ok()?
        .reply()
        .ok()?;

        if prop.format == 32 && prop.value.len() >= 4 {
            let pid = u32::from_ne_bytes([
                prop.value[0],
                prop.value[1],
                prop.value[2],
                prop.value[3],
            ]);
            if pid > 0 {
                return Some(pid);
            }
        }
        None
    }

    fn get_window_wm_class(conn: &impl RequestConnection, win: u32) -> Option<String> {
        let prop = get_property(
            conn,
            false,
            win,
            AtomEnum::WM_CLASS,
            AtomEnum::STRING,
            0,
            128,
        )
        .ok()?
        .reply()
        .ok()?;

        if !prop.value.is_empty() {
            let parts: Vec<&[u8]> = prop.value.split(|&b| b == 0).filter(|p| !p.is_empty()).collect();
            if let Some(first) = parts.first() {
                return Some(String::from_utf8_lossy(first).to_string());
            }
        }
        None
    }

    fn get_window_title(conn: &impl RequestConnection, win: u32) -> String {
        // Try _NET_WM_NAME first (UTF-8)
        let net_wm_name_atom = conn
            .intern_atom(false, b"_NET_WM_NAME")
            .ok()
            .and_then(|c| c.reply().ok())
            .map(|r| r.atom);
        let utf8_string_atom = conn
            .intern_atom(false, b"UTF8_STRING")
            .ok()
            .and_then(|c| c.reply().ok())
            .map(|r| r.atom);

        if let (Some(net_name), Some(utf8)) = (net_wm_name_atom, utf8_string_atom) {
            if let Ok(prop) = get_property(conn, false, win, net_name, utf8, 0, 256) {
                if let Ok(reply) = prop.reply() {
                    if !reply.value.is_empty() {
                        return String::from_utf8_lossy(&reply.value).to_string();
                    }
                }
            }
        }

        // Fallback to WM_NAME (STRING)
        if let Ok(prop) = get_property(conn, false, win, AtomEnum::WM_NAME, AtomEnum::STRING, 0, 256) {
            if let Ok(reply) = prop.reply() {
                if !reply.value.is_empty() {
                    return String::from_utf8_lossy(&reply.value).to_string();
                }
            }
        }
        format!("Window-0x{win:x}")
    }

    fn close_window(conn: &impl Connection, win: u32) {
        let wm_protocols_atom = conn
            .intern_atom(false, b"WM_PROTOCOLS")
            .ok()
            .and_then(|c| c.reply().ok())
            .map(|r| r.atom);
        let wm_delete_window_atom = conn
            .intern_atom(false, b"WM_DELETE_WINDOW")
            .ok()
            .and_then(|c| c.reply().ok())
            .map(|r| r.atom);

        let mut supports_delete = false;
        if let (Some(protocols), Some(delete_atom)) = (wm_protocols_atom, wm_delete_window_atom) {
            if let Ok(prop) = get_property(conn, false, win, protocols, AtomEnum::ATOM, 0, 32) {
                if let Ok(reply) = prop.reply() {
                    let atoms: Vec<u32> = reply.value32().map(|it| it.collect()).unwrap_or_default();
                    if atoms.contains(&delete_atom) {
                        supports_delete = true;
                        let event = ClientMessageEvent {
                            response_type: CLIENT_MESSAGE_EVENT,
                            format: 32,
                            sequence: 0,
                            window: win,
                            type_: protocols,
                            data: ClientMessageData::from([delete_atom, x11rb::CURRENT_TIME, 0, 0, 0]),
                        };
                        let _ = conn.send_event(false, win, EventMask::NO_EVENT, event);
                    }
                }
            }
        }

        if !supports_delete {
            let _ = destroy_window(conn, win);
        }
        let _ = conn.flush();
    }
}

impl Drop for X11Backend {
    fn drop(&mut self) {
        self.running.store(false, Ordering::Relaxed);
        let display_num = self.display.trim_start_matches(':').to_string();
        if let Ok(mut lock) = self.xvfb_child.try_write() {
            if let Some(mut child) = lock.take() {
                let _ = child.start_kill();
            }
        }
        let _ = std::fs::remove_file(format!("/tmp/.X{display_num}-lock"));
        let _ = std::fs::remove_file(format!("/tmp/.X11-unix/X{display_num}"));
    }
}
