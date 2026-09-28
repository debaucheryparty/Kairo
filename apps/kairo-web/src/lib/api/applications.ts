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
  builtinAppId?: "terminal" | "files" | "dashboard" | "settings" | "editor" | "databases" | "domains" | "about";
  isTerminal?: boolean;
}

export const APP_CATEGORIES: AppCategory[] = [
  "All",
  "System",
  "Developer Tools",
  "Utilities",
  "Services",
];

const DEFAULT_VPS_APPS: VpsApp[] = [
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
    id: "editor",
    name: "Code Editor",
    genericName: "Text Editor",
    category: "Developer Tools",
    description: "Lightweight code editor for scripts, configs, and server files",
    icon: "editor",
    exec: "nano",
    builtinAppId: "editor",
  },
  {
    id: "databases",
    name: "Databases & Docker",
    genericName: "Container & DB Manager",
    category: "Services",
    description: "Manage Docker containers, PostgreSQL, MySQL, and Redis services",
    icon: "databases",
    exec: "docker",
    builtinAppId: "databases",
  },
  {
    id: "domains",
    name: "Domains & Reverse Proxy",
    genericName: "Web Server & Routing",
    category: "Services",
    description: "Configure domain routing, SSL certificates, Nginx, and Caddy reverse proxies",
    icon: "domains",
    exec: "nginx",
    builtinAppId: "domains",
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
    id: "htop",
    name: "Htop Process Viewer",
    genericName: "Interactive Process Viewer",
    category: "System",
    description: "Real-time process tree, memory consumption, and thread monitor",
    icon: "dashboard",
    exec: "htop",
    builtinAppId: "terminal",
    isTerminal: true,
  },
  {
    id: "python",
    name: "Python 3",
    genericName: "Python Interpreter",
    category: "Developer Tools",
    description: "Interactive Python 3 REPL and script runtime",
    icon: "editor",
    exec: "python3",
    builtinAppId: "terminal",
    isTerminal: true,
  },
  {
    id: "git",
    name: "Git VCS",
    genericName: "Version Control",
    category: "Developer Tools",
    description: "Distributed version control system for repositories on the host",
    icon: "terminal",
    exec: "git",
    builtinAppId: "terminal",
    isTerminal: true,
  },
  {
    id: "systemd",
    name: "Systemd Services",
    genericName: "Service Manager",
    category: "Services",
    description: "Inspect and manage active system daemons and background units",
    icon: "settings",
    exec: "systemctl status",
    builtinAppId: "terminal",
    isTerminal: true,
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

function mapLinuxApp(app: LinuxApp): VpsApp {
  let category: AppCategory = "Utilities";
  const catStr = app.categories.join(" ").toLowerCase();
  if (catStr.includes("develop") || catStr.includes("ide") || catStr.includes("code") || catStr.includes("texteditor")) {
    category = "Developer Tools";
  } else if (catStr.includes("system") || catStr.includes("monitor") || catStr.includes("admin")) {
    category = "System";
  } else if (catStr.includes("network") || catStr.includes("server") || catStr.includes("database")) {
    category = "Services";
  }

  return {
    id: app.appId,
    name: app.name,
    genericName: app.genericName,
    category,
    description: app.comment || app.genericName || `Launch ${app.exec} on remote computer`,
    icon: app.icon || (app.isTerminal ? "terminal" : "files"),
    exec: app.exec,
    isTerminal: app.isTerminal,
  };
}

export async function listVpsApplications(serverId?: string): Promise<VpsApp[]> {
  try {
    const query = serverId ? `?serverId=${encodeURIComponent(serverId)}` : "";
    const remote = await apiRequest<LinuxApp[]>(`/api/applications${query}`);
    if (Array.isArray(remote) && remote.length > 0) {
      const mapped = remote.map(mapLinuxApp);
      const combined = [...DEFAULT_VPS_APPS];
      for (const item of mapped) {
        if (!combined.some((c) => c.id === item.id || c.exec === item.exec)) {
          combined.push(item);
        }
      }
      return combined;
    }
  } catch {}

  return DEFAULT_VPS_APPS;
}
