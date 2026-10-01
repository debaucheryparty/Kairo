export interface Platform {
  name: "web" | "tauri";
  
  // API URL resolution
  getApiOrigin(fallback: string): string;
  getWsOrigin(fallback: string): string;

  // File downloads
  downloadFile(serverId: string, path: string, url: string): Promise<void>;
  
  // External links
  openExternalLink(url: string): Promise<void>;

  // Token storage
  getLocalAuthToken(): Promise<string | null>;
  setLocalAuthToken(token: string): Promise<void>;

  // Initialization
  initialize(): Promise<void>;
}
