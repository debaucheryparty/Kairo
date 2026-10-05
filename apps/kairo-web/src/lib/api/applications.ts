import { apiRequest } from "@/src/lib/api/client";
import type { LinuxApp } from "@kairo/runtime";

export type AppCategory = "All" | "System" | "Developer Tools" | "Utilities" | "Services";

export interface VpsApp {
  id: string;
  name: string;
  genericName?: string;
  category: AppCategory;
  description: string;
  icon: string;
  exec: string;
  builtinAppId?: "terminal" | "files" | "dashboard" | "settings" | "remote-apps" | "about" | "editor";
  isTerminal?: boolean;
}

export const APP_CATEGORIES: AppCategory[] = [
  "All",
  "System",
  "Developer Tools",
  "Utilities",
  "Services",
];

export const BUILTIN_VPS_APPS: VpsApp[] = [
  {
    id: "editor",
    name: "Visual Studio Code",
    genericName: "Web Code Editor",
    category: "Developer Tools",
    description: "Fast web-native code editor with syntax highlighting, explorer, and tabs",
    icon: "vscode",
    exec: "code",
    builtinAppId: "editor",
  },
  {
    id: "terminal",
    name: "Terminal",
    genericName: "Command Line Shell",
    category: "Developer Tools",
    description: "Interactive Linux PTY shell with full terminal emulation",
    icon: "terminal",
    exec: "bash",
    builtinAppId: "terminal",
    isTerminal: true,
  },
  {
    id: "files",
    name: "Files",
    genericName: "File Manager",
    category: "Utilities",
    description: "Explore, upload, download, and organize files on the remote VPS",
    icon: "files",
    exec: "nautilus",
    builtinAppId: "files",
  },
  {
    id: "dashboard",
    name: "Activity Monitor",
    genericName: "System Monitor",
    category: "System",
    description: "Live CPU, memory, disk I/O, network bandwidth, and process inspection",
    icon: "dashboard",
    exec: "htop",
    builtinAppId: "dashboard",
  },
  {
    id: "settings",
    name: "System Settings",
    genericName: "Server Preferences",
    category: "System",
    description: "Configure VPS networking, SSH keys, security modes, and desktop appearance",
    icon: "settings",
    exec: "settings",
    builtinAppId: "settings",
  },
  {
    id: "about",
    name: "About Kairo VPS",
    genericName: "System Information",
    category: "System",
    description: "Host platform specifications, Linux kernel release, and runtime architecture",
    icon: "settings",
    exec: "uname -a",
    builtinAppId: "about",
  },
];

export function mapLinuxApp(app: LinuxApp): VpsApp {
  let category: AppCategory = "Utilities";
  const catStr = app.categories.join(" ").toLowerCase();
  if (catStr.includes("develop") || catStr.includes("ide") || catStr.includes("code") || catStr.includes("texteditor")) {
    category = "Developer Tools";
  } else if (catStr.includes("system") || catStr.includes("monitor") || catStr.includes("admin")) {
    category = "System";
  } else if (catStr.includes("network") || catStr.includes("server") || catStr.includes("database")) {
    category = "Services";
  }

  const appIdLower = app.appId.toLowerCase();
  const execLower = app.exec.toLowerCase();

  let builtinAppId: VpsApp["builtinAppId"] | undefined;
  if (
    appIdLower.includes("code") ||
    execLower.startsWith("code") ||
    appIdLower.includes("vscode")
  ) {
    builtinAppId = "editor";
  } else if (
    app.isTerminal ||
    appIdLower.includes("terminal") ||
    execLower === "bash" ||
    execLower.startsWith("xterm")
  ) {
    builtinAppId = "terminal";
  } else if (
    appIdLower.includes("nautilus") ||
    appIdLower.includes("thunar") ||
    appIdLower === "files"
  ) {
    builtinAppId = "files";
  }

  return {
    id: app.appId,
    name: app.name,
    genericName: app.genericName,
    category,
    description: app.comment || app.genericName || `Launch ${app.exec} on remote computer`,
    icon: app.icon || (builtinAppId === "editor" ? "vscode" : app.isTerminal ? "terminal" : "files"),
    exec: app.exec,
    builtinAppId,
    isTerminal: app.isTerminal,
  };
}

export function mergeVpsApplications(remote: LinuxApp[]): VpsApp[] {
  const mapped = remote.map(mapLinuxApp);
  const combined = [...BUILTIN_VPS_APPS];
  for (const item of mapped) {
    if (!combined.some((c) => c.id === item.id || c.exec === item.exec)) {
      combined.push(item);
    }
  }
  return combined;
}

export async function listVpsApplications(serverId?: string): Promise<VpsApp[]> {
  try {
    const query = serverId ? `?serverId=${encodeURIComponent(serverId)}` : "";
    const remote = await apiRequest<LinuxApp[]>(`/api/applications${query}`);
    if (Array.isArray(remote) && remote.length > 0) {
      return mergeVpsApplications(remote);
    }
  } catch {}

  return BUILTIN_VPS_APPS;
}
