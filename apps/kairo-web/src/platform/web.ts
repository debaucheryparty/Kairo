import type { Platform } from "./types";

export const platform: Platform = {
  name: "web",

  getApiOrigin(fallback: string): string {
    return fallback;
  },

  getWsOrigin(fallback: string): string {
    return fallback;
  },

  async downloadFile(serverId: string, path: string, url: string): Promise<void> {
    window.location.href = url;
  },

  async openExternalLink(url: string): Promise<void> {
    window.open(url, "_blank", "noopener,noreferrer");
  },

  async getLocalAuthToken(): Promise<string | null> {
    return null;
  },

  async setLocalAuthToken(token: string): Promise<void> {
    // No-op for web
  },

  async initialize(): Promise<void> {
    // No-op for web
  }
};
