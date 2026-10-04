import type { KairoClient } from "@kairo/runtime";
import { apiRequest } from "@/src/lib/api/client";
import { authenticatedApiUrl } from "@/src/lib/runtime";

let activeRuntimeClient: KairoClient | null = null;

export function setActiveRuntimeClient(client: KairoClient | null) {
  activeRuntimeClient = client;
}

export function getActiveRuntimeClient(): KairoClient | null {
  return activeRuntimeClient;
}

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

export async function listFiles(serverId: string, path: string, client?: KairoClient | null): Promise<FileList> {
  const activeClient = client ?? activeRuntimeClient;
  if (activeClient?.getSession()) {
    const entries = await activeClient.listDirectory(path);
    const mapped: FileEntry[] = entries.map((e) => ({
      name: e.path,
      path: joinPath(path || "/", e.path),
      type: e.fileType === 1 ? "dir" : "file",
      size: e.size,
      mode: e.fileType === 1 ? "0755" : "0644",
      modified: e.modifiedAt ? new Date(e.modifiedAt * 1000).toISOString() : new Date().toISOString(),
    }));
    return { path: path || "/", entries: mapped };
  }

  return await apiRequest<FileList>(`/api/files?${fileQuery(serverId, { path })}`);
}

export async function readFile(serverId: string, path: string, client?: KairoClient | null): Promise<FileContent> {
  const activeClient = client ?? activeRuntimeClient;
  if (activeClient?.getSession()) {
    const resp = await activeClient.readFile(path);
    const text = new TextDecoder().decode(resp.content);
    return {
      path,
      content: text,
      size: resp.content.byteLength,
      mime: "text/plain",
      truncated: false,
    };
  }

  return await apiRequest<FileContent>(`/api/files/read?${fileQuery(serverId, { path })}`);
}

export async function writeFile(serverId: string, path: string, content: string, client?: KairoClient | null): Promise<{ status: string }> {
  const activeClient = client ?? activeRuntimeClient;
  if (activeClient?.getSession()) {
    const bytes = new TextEncoder().encode(content);
    await activeClient.writeFile(path, bytes);
    return { status: "ok" };
  }

  return await apiRequest<{ status: string }>("/api/files/write", {
    method: "POST",
    body: JSON.stringify({ serverId, path, content }),
  });
}

export async function createFile(serverId: string, path: string, client?: KairoClient | null): Promise<{ status: string }> {
  const activeClient = client ?? activeRuntimeClient;
  if (activeClient?.getSession()) {
    await activeClient.writeFile(path, new Uint8Array(0));
    return { status: "ok" };
  }

  return await apiRequest<{ status: string }>("/api/files/create", {
    method: "POST",
    body: JSON.stringify({ serverId, path }),
  });
}

export async function createDirectory(serverId: string, path: string, client?: KairoClient | null): Promise<{ status: string }> {
  const activeClient = client ?? activeRuntimeClient;
  if (activeClient?.getSession()) {
    await activeClient.writeFile(joinPath(path, ".keep"), new Uint8Array(0));
    return { status: "ok" };
  }

  return await apiRequest<{ status: string }>("/api/files/mkdir", {
    method: "POST",
    body: JSON.stringify({ serverId, path }),
  });
}

export async function renameFile(serverId: string, from: string, to: string): Promise<{ status: string }> {
  return await apiRequest<{ status: string }>("/api/files/rename", {
    method: "POST",
    body: JSON.stringify({ serverId, from, to }),
  });
}

export async function deleteFile(serverId: string, path: string): Promise<{ status: string }> {
  return await apiRequest<{ status: string }>(`/api/files?${fileQuery(serverId, { path })}`, {
    method: "DELETE",
  });
}

export async function uploadFile(serverId: string, directory: string, file: File, client?: KairoClient | null): Promise<{ status: string; path: string }> {
  const activeClient = client ?? activeRuntimeClient;
  const dest = joinPath(directory, file.name);
  if (activeClient?.getSession()) {
    const buffer = await file.arrayBuffer();
    await activeClient.writeFile(dest, new Uint8Array(buffer));
    return { status: "ok", path: dest };
  }

  const body = new FormData();
  body.set("serverId", serverId);
  body.set("path", directory);
  body.set("file", file);
  return await apiRequest<{ status: string; path: string }>("/api/files/upload", {
    method: "POST",
    body,
  });
}

export function downloadUrl(serverId: string, path: string): string {
  const name = baseName(path).toLowerCase();
  if (name === "wallpaper.jpg" || name === "wallpaper.png" || name === "wallpaper.jpeg") {
    return "/wallpaper.jpg";
  }
  return authenticatedApiUrl(`/api/files/download?${fileQuery(serverId, { path, download: "1" })}`);
}

export function mediaUrl(serverId: string, path: string): string {
  const name = baseName(path).toLowerCase();
  if (name === "wallpaper.jpg" || name === "wallpaper.png" || name === "wallpaper.jpeg") {
    return "/wallpaper.jpg";
  }
  return authenticatedApiUrl(`/api/files/download?${fileQuery(serverId, { path })}`);
}

export function joinPath(base: string, name: string): string {
  if (base === "/") return `/${name}`;
  return `${base.replace(/\/$/, "")}/${name}`;
}

export function parentPath(path: string): string {
  if (path === "/") return "/";
  const trimmed = path.replace(/\/+$/, "");
  const index = trimmed.lastIndexOf("/");
  return index <= 0 ? "/" : trimmed.slice(0, index);
}

export function baseName(path: string): string {
  const trimmed = path.replace(/\/+$/, "");
  const index = trimmed.lastIndexOf("/");
  return index < 0 ? trimmed : trimmed.slice(index + 1);
}
