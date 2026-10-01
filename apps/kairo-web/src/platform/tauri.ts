import type { Platform } from "./types";
import { open } from "@tauri-apps/plugin-shell";
import { invoke } from "@tauri-apps/api/core";
import { LazyStore } from "@tauri-apps/plugin-store";

const store = new LazyStore("kairo-settings.json");
let cachedBackendPort: number | null = null;

export const platform: Platform = {
  name: "tauri",

  getApiOrigin(fallback: string): string {
    // In Tauri, we ignore the fallback and rely on the local Go sidecar
    // For now, we'll return a placeholder port or default.
    // In Phase 3, we'll read the dynamic port assigned to the sidecar.
    return cachedBackendPort ? `http://127.0.0.1:${cachedBackendPort}` : "http://127.0.0.1:8080";
  },

  getWsOrigin(fallback: string): string {
    return cachedBackendPort ? `ws://127.0.0.1:${cachedBackendPort}` : "ws://127.0.0.1:8080";
  },

  async downloadFile(serverId: string, path: string, url: string): Promise<void> {
    // We cannot navigate away. We'll use tauri-plugin-fs in combination with standard fetch 
    // to download the file directly, or use shell open if it's a media URL that can be opened externally.
    // For now, we'll just open the URL externally so the OS handles it, instead of breaking the app.
    // In a complete implementation we might prompt to save using @tauri-apps/plugin-dialog.
    await open(url);
  },

  async openExternalLink(url: string): Promise<void> {
    await open(url);
  },

  async getLocalAuthToken(): Promise<string | null> {
    try {
      const token = await store.get<string>("localAuthToken");
      return token || null;
    } catch {
      return null;
    }
  },

  async setLocalAuthToken(token: string): Promise<void> {
    await store.set("localAuthToken", token);
    await store.save();
  },

  async initialize(): Promise<void> {
    try {
      cachedBackendPort = await invoke<number>("get_backend_port");
    } catch (err) {
      console.warn("Could not get dynamic backend port from Tauri, using default 8080.", err);
    }
  }
};
