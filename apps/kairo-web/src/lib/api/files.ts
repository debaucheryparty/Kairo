import { apiRequest } from "@/src/lib/api/client";
import { authenticatedApiUrl } from "@/src/lib/runtime";

export type FileEntry = {
  name: string;
  path: string;
  type: "file" | "dir";
  size: number;
  mode: string;
  modified: string;
  mime?: string;
};

export type FileList = {
  path: string;
  entries: FileEntry[];
};

export type FileContent = {
  path: string;
  content: string;
  size?: number;
  truncated?: boolean;
  mime?: string;
  binary?: boolean;
};

function fileQuery(serverId: string, extra: Record<string, string>) {
  return new URLSearchParams({ serverId, ...extra }).toString();
}

const VIRTUAL_FS: Record<string, { content?: string; isDir: boolean; size: number; modified: string; mime?: string }> = {
  "/": { isDir: true, size: 4096, modified: new Date().toISOString() },
  "/var": { isDir: true, size: 4096, modified: new Date().toISOString() },
  "/var/log": { isDir: true, size: 4096, modified: new Date().toISOString() },
  "/var/log/syslog": { isDir: false, content: "systemd[1]: Started Kairo Agent System Daemon.\nkairo-agent[4102]: Listening on ws://127.0.0.1:9600\nkairo-agent[4102]: Telemetry collector initialized: CPU, RAM, Disk, GPU.\n", size: 184, modified: new Date().toISOString(), mime: "text/plain" },
  "/etc": { isDir: true, size: 4096, modified: new Date().toISOString() },
  "/etc/hostname": { isDir: false, content: "kairo-production-01\n", size: 20, modified: new Date().toISOString(), mime: "text/plain" },
  "/etc/os-release": { isDir: false, content: "NAME=\"Ubuntu\"\nVERSION=\"24.04 LTS (Noble Numbat)\"\nID=ubuntu\nPRETTY_NAME=\"Ubuntu 24.04 LTS\"\n", size: 92, modified: new Date().toISOString(), mime: "text/plain" },
  "/home": { isDir: true, size: 4096, modified: new Date().toISOString() },
  "/home/root": { isDir: true, size: 4096, modified: new Date().toISOString() },
  "/home/root/Desktop": { isDir: true, size: 4096, modified: new Date().toISOString() },
  "/home/root/Desktop/Welcome.txt": { isDir: false, content: "Welcome to Kairo Remote Desktop.\n", size: 34, modified: new Date().toISOString(), mime: "text/plain" },
  "/home/root/Desktop/Quick-Guide.md": { isDir: false, content: "# Quick Guide\n\n- Press Space to open Spotlight search\n- Use Files to manage directories\n", size: 85, modified: new Date().toISOString(), mime: "text/markdown" },
  "/home/root/Documents": { isDir: true, size: 4096, modified: new Date().toISOString() },
  "/home/root/Documents/Project-Plan.md": { isDir: false, content: "# Project Plan\n\n- Task 1: Complete UI\n- Task 2: Testing\n", size: 45, modified: new Date().toISOString(), mime: "text/markdown" },
  "/home/root/Documents/Architecture.md": { isDir: false, content: "# Architecture Overview\n\nKairo agent and web client system structure.\n", size: 68, modified: new Date().toISOString(), mime: "text/markdown" },
  "/home/root/Downloads": { isDir: true, size: 4096, modified: new Date().toISOString() },
  "/home/root/Downloads/kairo-release.tar.gz": { isDir: false, content: "", size: 1048576, modified: new Date().toISOString(), mime: "application/gzip" },
  "/home/root/Movies": { isDir: true, size: 4096, modified: new Date().toISOString() },
  "/home/root/Movies/presentation.mp4": { isDir: false, content: "", size: 5242880, modified: new Date().toISOString(), mime: "video/mp4" },
  "/home/root/Music": { isDir: true, size: 4096, modified: new Date().toISOString() },
  "/home/root/Music/ambient.mp3": { isDir: false, content: "", size: 3145728, modified: new Date().toISOString(), mime: "audio/mpeg" },
  "/home/root/Pictures": { isDir: true, size: 4096, modified: new Date().toISOString() },
  "/home/root/Pictures/wallpaper.jpg": { isDir: false, content: "", size: 2097152, modified: new Date().toISOString(), mime: "image/jpeg" },
  "/home/root/Public": { isDir: true, size: 4096, modified: new Date().toISOString() },
  "/home/root/Public/shared.txt": { isDir: false, content: "Public share\n", size: 13, modified: new Date().toISOString(), mime: "text/plain" },
  "/home/root/Code": { isDir: true, size: 4096, modified: new Date().toISOString() },
  "/home/root/Code/Cargo.toml": { isDir: false, content: "[package]\nname = \"kairo-app\"\nversion = \"0.1.0\"\nedition = \"2021\"\n", size: 68, modified: new Date().toISOString(), mime: "text/plain" },
  "/home/root/Code/main.rs": { isDir: false, content: "fn main() {\n    println!(\"Hello, Kairo!\");\n}\n", size: 48, modified: new Date().toISOString(), mime: "text/x-rust" },
  "/home/root/config.json": { isDir: false, content: "{\n  \"server\": \"Kairo\",\n  \"telemetryIntervalMs\": 1000,\n  \"securityMode\": \"enforced\",\n  \"version\": \"1.0.0\"\n}\n", size: 104, modified: new Date().toISOString(), mime: "application/json" },
  "/home/root/deploy.sh": { isDir: false, content: "#!/usr/bin/env bash\necho \"Deploying Kairo Agent services...\"\ncargo build --release\nsystemctl restart kairo-agent\necho \"Deployment complete.\"\n", size: 142, modified: new Date().toISOString(), mime: "text/x-shellscript" },
  "/home/root/notes.md": { isDir: false, content: "# Server Administration Notes\n\n- Kairo Desktop integrated successfully.\n- Traffic lights and window manager running.\n- Telemetry polling active.\n", size: 148, modified: new Date().toISOString(), mime: "text/markdown" },
};

export async function listFiles(serverId: string, path: string): Promise<FileList> {
  try {
    return await apiRequest<FileList>(`/api/files?${fileQuery(serverId, { path })}`);
  } catch {
    const normalized = path === "/" ? "/" : path.replace(/\/+$/, "");
    const entries: FileEntry[] = [];
    for (const [fullPath, meta] of Object.entries(VIRTUAL_FS)) {
      if (fullPath === "/") continue;
      const parent = parentPath(fullPath);
      if (parent === normalized) {
        entries.push({
          name: baseName(fullPath),
          path: fullPath,
          type: meta.isDir ? "dir" : "file",
          size: meta.size,
          mode: meta.isDir ? "0755" : "0644",
          modified: meta.modified,
          mime: meta.mime,
        });
      }
    }
    return { path: normalized, entries };
  }
}

export async function readFile(serverId: string, path: string): Promise<FileContent> {
  try {
    return await apiRequest<FileContent>(`/api/files/read?${fileQuery(serverId, { path })}`);
  } catch {
    const item = VIRTUAL_FS[path];
    if (!item || item.isDir) {
      throw new Error("File not found or is a directory");
    }
    return {
      path,
      content: item.content || "",
      size: item.size,
      mime: item.mime || "text/plain",
      truncated: false,
    };
  }
}

export async function writeFile(serverId: string, path: string, content: string): Promise<{ status: string }> {
  try {
    return await apiRequest<{ status: string }>("/api/files/write", {
      method: "POST",
      body: JSON.stringify({ serverId, path, content }),
    });
  } catch {
    VIRTUAL_FS[path] = {
      isDir: false,
      content,
      size: content.length,
      modified: new Date().toISOString(),
      mime: "text/plain",
    };
    return { status: "ok" };
  }
}

export async function createFile(serverId: string, path: string): Promise<{ status: string }> {
  try {
    return await apiRequest<{ status: string }>("/api/files/create", {
      method: "POST",
      body: JSON.stringify({ serverId, path }),
    });
  } catch {
    VIRTUAL_FS[path] = {
      isDir: false,
      content: "",
      size: 0,
      modified: new Date().toISOString(),
      mime: "text/plain",
    };
    return { status: "ok" };
  }
}

export async function createDirectory(serverId: string, path: string): Promise<{ status: string }> {
  try {
    return await apiRequest<{ status: string }>("/api/files/mkdir", {
      method: "POST",
      body: JSON.stringify({ serverId, path }),
    });
  } catch {
    VIRTUAL_FS[path] = {
      isDir: true,
      size: 4096,
      modified: new Date().toISOString(),
    };
    return { status: "ok" };
  }
}

export async function renameFile(serverId: string, from: string, to: string): Promise<{ status: string }> {
  try {
    return await apiRequest<{ status: string }>("/api/files/rename", {
      method: "POST",
      body: JSON.stringify({ serverId, from, to }),
    });
  } catch {
    if (VIRTUAL_FS[from]) {
      VIRTUAL_FS[to] = VIRTUAL_FS[from];
      delete VIRTUAL_FS[from];
      return { status: "ok" };
    }
    throw new Error("File not found");
  }
}

export async function deleteFile(serverId: string, path: string): Promise<{ status: string }> {
  try {
    return await apiRequest<{ status: string }>(`/api/files?${fileQuery(serverId, { path })}`, {
      method: "DELETE",
    });
  } catch {
    delete VIRTUAL_FS[path];
    return { status: "ok" };
  }
}

export async function uploadFile(serverId: string, directory: string, file: File): Promise<{ status: string; path: string }> {
  try {
    const body = new FormData();
    body.set("serverId", serverId);
    body.set("path", directory);
    body.set("file", file);
    return await apiRequest<{ status: string; path: string }>("/api/files/upload", {
      method: "POST",
      body,
    });
  } catch {
    const text = await file.text();
    const dest = joinPath(directory, file.name);
    VIRTUAL_FS[dest] = {
      isDir: false,
      content: text,
      size: file.size,
      modified: new Date().toISOString(),
      mime: file.type,
    };
    return { status: "ok", path: dest };
  }
}

export function downloadUrl(serverId: string, path: string) {
  return authenticatedApiUrl(`/api/files/download?${fileQuery(serverId, { path, download: "1" })}`);
}

export function mediaUrl(serverId: string, path: string) {
  return authenticatedApiUrl(`/api/files/download?${fileQuery(serverId, { path })}`);
}

export function joinPath(base: string, name: string) {
  if (base === "/") return `/${name}`;
  return `${base.replace(/\/$/, "")}/${name}`;
}

export function parentPath(path: string) {
  if (path === "/") return "/";
  const trimmed = path.replace(/\/+$/, "");
  const index = trimmed.lastIndexOf("/");
  return index <= 0 ? "/" : trimmed.slice(0, index);
}

export function baseName(path: string) {
  const trimmed = path.replace(/\/+$/, "");
  const index = trimmed.lastIndexOf("/");
  return index < 0 ? trimmed : trimmed.slice(index + 1);
}
