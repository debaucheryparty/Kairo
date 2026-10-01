import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-shell";
import { LazyStore } from "@tauri-apps/plugin-store";

import type { Platform } from "./types";

const store = new LazyStore("kairo-settings.json");
let cachedBackendPort: number | null = null;

export const platform: Platform = {
  name: "tauri",

  getApiOrigin(_fallback: string): string {
    return cachedBackendPort ? `http://127.0.0.1:${cachedBackendPort}` : "http://127.0.0.1:8080";
  },

  getWsOrigin(_fallback: string): string {
    return cachedBackendPort ? `ws://127.0.0.1:${cachedBackendPort}` : "ws://127.0.0.1:8080";
  },

  async downloadFile(_serverId: string, _path: string, url: string): Promise<void> {
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
