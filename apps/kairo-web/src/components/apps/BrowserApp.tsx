"use client";

import { useState, useRef } from "react";
import {
  ArrowLeft,
  ArrowRight,
  RotateCw,
  Home,
  Plus,
  X,
  Search,
  ExternalLink,
  Shield,
  Globe,
  MonitorPlay,
  Bookmark,
} from "lucide-react";
import { useRuntimeClient } from "@/src/lib/session";
import { useWindowManager, type WindowPayload } from "@/src/components/window/window-context";

interface Tab {
  id: string;
  title: string;
  url: string;
  favicon?: string;
  inputUrl: string;
}

const DEFAULT_BOOKMARKS = [
  { title: "GitHub", url: "https://github.com", icon: "🐙" },
  { title: "Hyprland Wiki", url: "https://wiki.hyprland.org", icon: "❄️" },
  { title: "Docker Hub", url: "https://hub.docker.com", icon: "🐳" },
  { title: "Kairo Docs", url: "https://kairo.dev", icon: "⚡" },
  { title: "DuckDuckGo", url: "https://duckduckgo.com", icon: "🦆" },
  { title: "Localhost :8080", url: "http://localhost:8080", icon: "🖥️" },
  { title: "Localhost :3000", url: "http://localhost:3000", icon: "🌐" },
];

export function BrowserApp({ payload }: { payload?: WindowPayload }) {
  const runtimeClient = useRuntimeClient();
  const { openWindow } = useWindowManager();

  const [tabs, setTabs] = useState<Tab[]>([
    {
      id: "tab-1",
      title: "Kairo Start",
      url: "about:home",
      inputUrl: "",
    },
  ]);
  const [activeTabId, setActiveTabId] = useState("tab-1");
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const activeTab = tabs.find((t) => t.id === activeTabId) || tabs[0];

  const handleNewTab = (initialUrl = "about:home") => {
    const newId = `tab-${Date.now()}`;
    const newTab: Tab = {
      id: newId,
      title: initialUrl === "about:home" ? "New Tab" : initialUrl.replace(/^https?:\/\//, ""),
      url: initialUrl,
      inputUrl: initialUrl === "about:home" ? "" : initialUrl,
    };
    setTabs((prev) => [...prev, newTab]);
    setActiveTabId(newId);
  };

  const handleCloseTab = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (tabs.length === 1) {
      // Keep at least one tab
      setTabs([
        {
          id: `tab-${Date.now()}`,
          title: "New Tab",
          url: "about:home",
          inputUrl: "",
        },
      ]);
      return;
    }
    const idx = tabs.findIndex((t) => t.id === id);
    const nextTabs = tabs.filter((t) => t.id !== id);
    setTabs(nextTabs);
    if (activeTabId === id) {
      const nextActive = nextTabs[Math.max(0, idx - 1)];
      setActiveTabId(nextActive.id);
    }
  };

  const handleNavigate = (urlStr: string) => {
    let finalUrl = urlStr.trim();
    if (!finalUrl) return;

    if (!finalUrl.startsWith("http://") && !finalUrl.startsWith("https://") && !finalUrl.startsWith("about:")) {
      if (finalUrl.includes(".") && !finalUrl.includes(" ")) {
        finalUrl = `https://${finalUrl}`;
      } else {
        finalUrl = `https://duckduckgo.com/?q=${encodeURIComponent(finalUrl)}`;
      }
    }

    setTabs((prev) =>
      prev.map((t) =>
        t.id === activeTabId
          ? {
              ...t,
              url: finalUrl,
              inputUrl: finalUrl.startsWith("about:") ? "" : finalUrl,
              title: finalUrl.replace(/^https?:\/\//, "").slice(0, 20),
            }
          : t,
      ),
    );
  };

  const handleReload = () => {
    if (iframeRef.current && activeTab.url !== "about:home") {
      iframeRef.current.src = activeTab.url;
    }
  };

  const handleLaunchRemoteChrome = () => {
    if (runtimeClient?.getSession()) {
      void runtimeClient
        .launchApplication({
          appId: "google-chrome",
          exec: "google-chrome-stable",
          args: ["--new-window"],
        })
        .catch(() => {
          // If chrome is not installed, fallback to firefox or default browser
          void runtimeClient.launchApplication({
            appId: "firefox",
            exec: "firefox",
          });
        });
    }
  };

  return (
    <div className="flex h-full w-full flex-col bg-[var(--md-sys-color-surface)] text-[var(--md-sys-color-on-surface)] select-none font-sans overflow-hidden">
      {/* Top Tab Bar (Material 3 Expressive pill style) */}
      <div className="flex items-center gap-1.5 px-3 pt-2 bg-[var(--md-sys-color-surface-container-low)] border-b border-[var(--md-sys-color-outline-variant)]/25 overflow-x-auto no-scrollbar">
        {tabs.map((tab) => {
          const isActive = tab.id === activeTabId;
          return (
            <div
              key={tab.id}
              onClick={() => setActiveTabId(tab.id)}
              className={`group relative flex items-center gap-2 h-9 px-3.5 rounded-t-xl text-[12px] font-medium transition-all duration-150 cursor-pointer max-w-[190px] min-w-[120px] ${
                isActive
                  ? "bg-[var(--md-sys-color-surface)] text-[var(--md-sys-color-primary)] shadow-sm font-semibold border-t-2 border-[var(--md-sys-color-primary)]"
                  : "bg-[var(--md-sys-color-surface-container)] text-[var(--md-sys-color-on-surface-variant)] hover:bg-[var(--md-sys-color-surface-container-high)] hover:text-[var(--md-sys-color-on-surface)]"
              }`}
            >
              <Globe className={`size-3.5 shrink-0 ${isActive ? "text-[var(--m3-primary)]" : "text-white/40"}`} />
              <span className="truncate flex-1">{tab.title}</span>
              <button
                type="button"
                onClick={(e) => handleCloseTab(e, tab.id)}
                className="size-4.5 rounded-full flex items-center justify-center text-white/40 hover:bg-white/10 hover:text-white transition-colors"
                title="Close Tab"
              >
                <X className="size-3" />
              </button>
            </div>
          );
        })}

        <button
          type="button"
          onClick={() => handleNewTab()}
          className="size-7 rounded-lg flex items-center justify-center text-white/60 hover:bg-white/10 hover:text-white transition-colors ml-1"
          title="New Tab"
        >
          <Plus className="size-4" />
        </button>

        <div className="ml-auto flex items-center gap-2 pb-1.5 pr-1">
          <button
            type="button"
            onClick={handleLaunchRemoteChrome}
            className="group relative overflow-hidden flex items-center gap-1.5 px-3 py-1 rounded-full bg-[var(--md-sys-color-primary,var(--m3-primary))]/15 text-[var(--md-sys-color-primary,var(--m3-primary))] text-[11px] font-medium transition-colors border border-[var(--md-sys-color-primary,var(--m3-primary))]/30 m3-focus-ring"
            title="Launch native remote browser on host (Wayland surface)"
          >
            <div className="m3-state-layer" />
            <MonitorPlay className="size-3 relative z-[1]" />
            <span className="relative z-[1]">Launch on Host</span>
          </button>
        </div>
      </div>

      {/* Navigation Toolbar (M3 Surface) */}
      <div className="flex items-center gap-2 px-3 py-2 bg-[var(--md-sys-color-surface-container)] border-b border-[var(--md-sys-color-outline-variant)]/20">
        <div className="flex items-center gap-1 text-white/70">
          <button
            type="button"
            onClick={() => handleNavigate("about:home")}
            className="group relative overflow-hidden size-7 rounded-lg flex items-center justify-center hover:text-white transition-colors m3-focus-ring"
            title="Home"
          >
            <div className="m3-state-layer" />
            <Home className="size-3.5 relative z-[1]" />
          </button>
          <button
            type="button"
            onClick={handleReload}
            className="group relative overflow-hidden size-7 rounded-lg flex items-center justify-center hover:text-white transition-colors m3-focus-ring"
            title="Reload"
          >
            <div className="m3-state-layer" />
            <RotateCw className="size-3.5 relative z-[1]" />
          </button>
        </div>

        {/* URL Input Bar */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleNavigate(activeTab.inputUrl);
          }}
          className="flex-1 flex items-center gap-2 px-3 py-1.5 rounded-full bg-[var(--md-sys-color-surface-container-high)] border border-[var(--md-sys-color-outline-variant)]/30 focus-within:border-[var(--m3-primary)] focus-within:ring-2 focus-within:ring-[var(--m3-primary)]/30 transition-all"
        >
          {activeTab.url.startsWith("https://") ? (
            <Shield className="size-3.5 text-emerald-400 shrink-0" />
          ) : (
            <Search className="size-3.5 text-white/40 shrink-0" />
          )}
          <input
            type="text"
            value={activeTab.inputUrl}
            onChange={(e) => {
              const val = e.target.value;
              setTabs((prev) =>
                prev.map((t) => (t.id === activeTabId ? { ...t, inputUrl: val } : t)),
              );
            }}
            placeholder="Search with DuckDuckGo or enter web address..."
            className="w-full bg-transparent text-[12px] text-white placeholder-white/40 focus:outline-none"
          />
        </form>
      </div>

      {/* Bookmarks Bar */}
      <div className="flex items-center gap-2 px-3 py-1 bg-[var(--md-sys-color-surface-container-low)] border-b border-[var(--md-sys-color-outline-variant)]/15 overflow-x-auto no-scrollbar">
        {DEFAULT_BOOKMARKS.map((bm) => (
          <button
            key={bm.title}
            type="button"
            onClick={() => handleNavigate(bm.url)}
            className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-md hover:bg-white/10 text-white/70 hover:text-white text-[11px] font-medium transition-colors shrink-0"
          >
            <span>{bm.icon}</span>
            <span>{bm.title}</span>
          </button>
        ))}
      </div>

      {/* Browser Viewport */}
      <div className="relative flex-1 w-full bg-[#141318] overflow-hidden">
        {activeTab.url === "about:home" ? (
          <div className="h-full flex flex-col items-center justify-center p-8 text-center max-w-2xl mx-auto animate-in fade-in duration-200">
            <div className="size-16 rounded-2xl bg-gradient-to-tr from-[var(--m3-primary)] to-[var(--m3-secondary,#cfbcff)] flex items-center justify-center shadow-lg shadow-[var(--m3-primary)]/20 mb-4">
              <Globe className="size-8 text-[#141318]" />
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-white mb-2">Kairo Web Navigator</h1>
            <p className="text-sm text-white/60 mb-6">
              Browse web interfaces, test server ports, or launch full native Chrome with GPU rendering on the host.
            </p>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleNavigate(activeTab.inputUrl);
              }}
              className="w-full max-w-lg flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-[#1c1b21] border border-white/10 shadow-xl focus-within:border-[var(--m3-primary)] focus-within:ring-2 focus-within:ring-[var(--m3-primary)]/30 transition-all mb-8"
            >
              <Search className="size-4 text-[var(--m3-primary)]" />
              <input
                type="text"
                value={activeTab.inputUrl}
                onChange={(e) => {
                  const val = e.target.value;
                  setTabs((prev) =>
                    prev.map((t) => (t.id === activeTabId ? { ...t, inputUrl: val } : t)),
                  );
                }}
                placeholder="Search web or type URL (e.g. localhost:8080)..."
                className="w-full bg-transparent text-sm text-white placeholder-white/40 focus:outline-none"
                autoFocus
              />
            </form>

            <div className="grid grid-cols-4 gap-3 w-full">
              {DEFAULT_BOOKMARKS.slice(0, 4).map((bm) => (
                <div
                  key={bm.title}
                  onClick={() => handleNavigate(bm.url)}
                  className="p-3 rounded-xl bg-[#1c1b21] hover:bg-[#25242b] border border-white/[0.05] flex flex-col items-center gap-1.5 cursor-pointer transition-all hover:scale-105"
                >
                  <span className="text-xl">{bm.icon}</span>
                  <span className="text-[11px] font-medium text-white/80">{bm.title}</span>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <iframe
            ref={iframeRef}
            src={activeTab.url}
            title={activeTab.title}
            className="w-full h-full border-none bg-white"
            sandbox="allow-same-origin allow-scripts allow-forms allow-popups"
          />
        )}
      </div>
    </div>
  );
}
