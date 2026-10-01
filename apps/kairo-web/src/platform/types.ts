export interface Platform {
  name: "web" | "tauri";
  getApiOrigin(fallback: string): string;
  getWsOrigin(fallback: string): string;
  downloadFile(serverId: string, path: string, url: string): Promise<void>;
  openExternalLink(url: string): Promise<void>;
  getLocalAuthToken(): Promise<string | null>;
  setLocalAuthToken(token: string): Promise<void>;
  initialize(): Promise<void>;
}
