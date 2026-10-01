"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { relaunch } from "@tauri-apps/plugin-process";
import { check, type DownloadEvent, type Update } from "@tauri-apps/plugin-updater";

import { BrandMark } from "@/src/components/brand/BrandMark";
import { currentRuntime, isDesktopRuntime } from "@/src/lib/runtime";
import { useSelectedServer } from "@/src/lib/session";
import { platform } from "@platform";

type UpdatePhase = "idle" | "checking" | "up-to-date" | "available" | "downloading" | "error";

type AvailableUpdate = {
  version: string;
  body?: string | null;
};

export function SettingsApp() {
  const selected = useSelectedServer();
  const desktop = isDesktopRuntime();
  const runtime = currentRuntime();
  const [version, setVersion] = useState<string>(() => (isDesktopRuntime() ? "…" : "web"));
  const [phase, setPhase] = useState<UpdatePhase>("idle");
  const [available, setAvailable] = useState<AvailableUpdate | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [wallpaperInput, setWallpaperInput] = useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("kairo_wallpaper") || "/wallpaper.jpg";
    }
    return "/wallpaper.jpg";
  });
  const downloadedRef = useRef(0);

  const applyWallpaper = () => {
    const val = wallpaperInput.trim();
    if (val && val !== "/wallpaper.jpg") {
      localStorage.setItem("kairo_wallpaper", val);
    } else {
      localStorage.removeItem("kairo_wallpaper");
    }
    window.dispatchEvent(new Event("kairo:wallpaper-change"));
  };

  const resetWallpaper = () => {
    localStorage.removeItem("kairo_wallpaper");
    setWallpaperInput("/wallpaper.jpg");
    window.dispatchEvent(new Event("kairo:wallpaper-change"));
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        setWallpaperInput(reader.result);
        localStorage.setItem("kairo_wallpaper", reader.result);
        window.dispatchEvent(new Event("kairo:wallpaper-change"));
      }
    };
    reader.readAsDataURL(file);
  };

  const updaterRef = useRef<Update | null>(null);

  const checkForUpdates = useCallback(async () => {
    if (!isDesktopRuntime()) return;
    setPhase("checking");
    setError(null);
    try {
      const update = await check();
      if (update) {
        setAvailable({ version: update.version, body: update.body });
        setPhase("available");
        updaterRef.current = update;
      } else {
        setPhase("up-to-date");
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
      setPhase("error");
    }
  }, []);

  const installUpdate = useCallback(async () => {
    if (!updaterRef.current) return;
    setPhase("downloading");
    setError(null);
    try {
      let downloaded = 0;
      let contentLength = 0;
      await updaterRef.current.downloadAndInstall((event: DownloadEvent) => {
        if (event.event === "Started") {
          contentLength = event.data.contentLength ?? 0;
        } else if (event.event === "Progress") {
          downloaded += event.data.chunkLength;
          if (contentLength) {
            setProgress(Math.round((downloaded / contentLength) * 100));
          }
        }
      });
      await relaunch();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
      setPhase("error");
    }
  }, []);

  return (
    <div className="flex h-full flex-col gap-8 sui-app overflow-auto px-8 py-10">
      <div className="flex items-start gap-4">
        <BrandMark size={48} />
        <div>
          <p className="text-[11px] font-medium uppercase tracking-[0.22em] sui-muted">Kairo</p>
          <h3 className="mt-2 text-2xl font-semibold tracking-tight sui-title">Settings</h3>
          <p className="mt-2 max-w-md text-sm leading-6 sui-muted">
            Application information and safe preferences. Secrets and credentials are never shown
            here.
          </p>
        </div>
      </div>

      <section className="max-w-lg space-y-3" aria-labelledby="settings-about">
        <h4 id="settings-about" className="text-sm font-medium sui-title">
          About
        </h4>
        <dl className="space-y-2 text-sm sui-muted">
          <div className="flex justify-between gap-4">
            <dt>Application</dt>
            <dd className="flex items-center gap-2 sui-title">
              <BrandMark size={18} />
              Kairo
            </dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt>Version</dt>
            <dd className="sui-title">{version}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt>License</dt>
            <dd className="sui-title">Open source</dd>
          </div>
        </dl>
        <p className="text-sm leading-6 sui-muted">
          Documentation:{" "}
          <button
            type="button"
            className="underline underline-offset-2 cursor-pointer"
            onClick={(e) => {
              e.preventDefault();
              platform.openExternalLink("https://github.com/debaucheryparty/Kairo");
            }}
          >
            GitHub repository
          </button>
        </p>
      </section>

      <section className="max-w-lg space-y-3" aria-labelledby="settings-runtime">
        <h4 id="settings-runtime" className="text-sm font-medium sui-title">
          Runtime
        </h4>
        <dl className="space-y-2 text-sm sui-muted">
          <div className="flex justify-between gap-4">
            <dt>Mode</dt>
            <dd className="sui-title capitalize">{runtime}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt>Backend</dt>
            <dd className="sui-title">
              {desktop ? "Local Go (loopback)" : "Remote / shared Go API"}
            </dd>
          </div>
          {selected ? (
            <div className="flex justify-between gap-4">
              <dt>Active server</dt>
              <dd className="truncate sui-title">{selected.name}</dd>
            </div>
          ) : null}
        </dl>
        <p className="text-[12px] leading-5 sui-muted">
          SSH, SFTP, and terminals always run in the Go backend. The UI never dials SSH directly.
        </p>
      </section>

      {desktop ? (
        <section className="max-w-lg space-y-3" aria-labelledby="settings-updates">
          <h4 id="settings-updates" className="text-sm font-medium sui-title">
            Updates
          </h4>
          <p className="text-sm leading-6 sui-muted">
            Checks GitHub Releases for a newer signed build. Packages are verified before install.
            Updates never install unless you choose Install and restart.
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="rounded-md border border-white/15 bg-white/5 px-3 py-1.5 text-sm sui-title hover:bg-white/10 disabled:opacity-50"
              onClick={() => void checkForUpdates()}
              disabled={phase === "checking" || phase === "downloading"}
            >
              {phase === "checking" ? "Checking…" : "Check for updates"}
            </button>
            {(phase === "available" || phase === "downloading") && available ? (
              <button
                type="button"
                className="rounded-md border border-white/15 bg-white/10 px-3 py-1.5 text-sm sui-title hover:bg-white/15 disabled:opacity-50"
                onClick={() => void installUpdate()}
                disabled={phase === "downloading"}
              >
                {phase === "downloading"
                  ? "Downloading…"
                  : `Install ${available.version} and restart`}
              </button>
            ) : null}
          </div>
          {phase === "up-to-date" ? (
            <p className="text-sm sui-muted">You are on the latest release.</p>
          ) : null}
          {(phase === "available" || phase === "downloading") && available ? (
            <p className="text-sm sui-muted">
              Update available: <span className="sui-title">{available.version}</span>
              {available.body ? (
                <span className="mt-1 block whitespace-pre-wrap text-[12px] opacity-80">
                  {available.body}
                </span>
              ) : null}
            </p>
          ) : null}
          {phase === "downloading" ? (
            <p className="text-sm sui-muted">
              Downloading update
              {progress !== null ? ` (${progress}%)` : ""}… Kairo will restart when finished.
            </p>
          ) : null}
          {phase === "error" && error ? (
            <p className="text-sm text-red-300/90" role="alert">
              {error}
            </p>
          ) : null}
        </section>
      ) : (
        <section className="max-w-lg space-y-2" aria-labelledby="settings-web-note">
          <h4 id="settings-web-note" className="text-sm font-medium sui-title">
            Web deployment
          </h4>
          <p className="text-sm leading-6 sui-muted">
            In-app updates apply to the desktop application. Upgrade the web deployment with your
            usual Docker or host process.
          </p>
        </section>
      )}

      <section className="max-w-lg space-y-3" aria-labelledby="settings-wallpaper">
        <h4 id="settings-wallpaper" className="text-sm font-medium sui-title">
          Desktop Wallpaper
        </h4>
        <p className="text-sm leading-6 sui-muted">
          The default wallpaper is hosted on the VPS at <code className="font-mono text-xs">/wallpaper.jpg</code>. Set a custom image URL or select a local image.
        </p>
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <input
              type="text"
              placeholder="/wallpaper.jpg or custom URL"
              value={wallpaperInput}
              onChange={(e) => setWallpaperInput(e.target.value)}
              className="flex-1 rounded-md border border-white/15 bg-white/5 px-3 py-1.5 text-xs text-white placeholder-white/40 outline-none focus:border-sky-500 font-mono"
            />
            <button
              type="button"
              onClick={applyWallpaper}
              className="rounded-md bg-white/10 px-3 py-1.5 text-xs font-medium text-white hover:bg-white/20"
            >
              Apply
            </button>
            <button
              type="button"
              onClick={resetWallpaper}
              className="rounded-md border border-white/10 px-3 py-1.5 text-xs font-medium text-white/70 hover:bg-white/5 hover:text-white"
            >
              Reset
            </button>
          </div>
          <div className="flex items-center gap-2 text-xs sui-muted">
            <span>Upload from local disk:</span>
            <input
              type="file"
              accept="image/*"
              onChange={handleFileUpload}
              className="text-xs text-white/70 file:mr-2 file:rounded file:border-0 file:bg-white/10 file:px-2 file:py-1 file:text-xs file:font-medium file:text-white hover:file:bg-white/20"
            />
          </div>
        </div>
      </section>

      <section className="max-w-lg space-y-2" aria-labelledby="settings-shortcuts">
        <h4 id="settings-shortcuts" className="text-sm font-medium sui-title">
          Keyboard shortcuts
        </h4>
        <ul className="space-y-1.5 text-sm sui-muted">
          <li>
            <kbd className="sui-title">⌘/Ctrl</kbd> + <kbd className="sui-title">K</kbd> — Server
            menu
          </li>
          <li>
            <kbd className="sui-title">⌘/Ctrl</kbd> + <kbd className="sui-title">,</kbd> — Settings
          </li>
          <li>
            <kbd className="sui-title">⌘/Ctrl</kbd> + <kbd className="sui-title">W</kbd> — Close
            focused window (not while typing in Terminal)
          </li>
          <li>
            <kbd className="sui-title">Esc</kbd> — Clear menus / focus
          </li>
        </ul>
      </section>
    </div>
  );
}
