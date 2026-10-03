import { apiRequest } from "@/src/lib/api/client";

export type ServerStatus =
  "online" | "offline" | "connecting" | "error" | "authentication_failed" | "unknown";

export type ServerInfo = {
  id: string;
  name: string;
  hostname: string;
  status: ServerStatus;
  host: string;
  port?: number;
  username: string;
  authType?: "password" | "private_key" | "token";
  authToken?: string;
  tunnelMode?: boolean;
  tunnelUrl?: string;
  cpuUsage: number;
  memoryUsage: number;
  diskUsage: number;
  uptimeSeconds: number;
  error?: string;
  lastSeen?: string;
};

export type ServerWriteInput = {
  name: string;
  host: string;
  port: number;
  username: string;
  authType: "password" | "private_key" | "token";
  password?: string;
  privateKey?: string;
  authToken?: string;
  tunnelMode?: boolean;
  tunnelUrl?: string;
};

export type ConnectionTestResult = {
  ok: boolean;
  latencyMs: number;
  error?: string;
  server: ServerInfo;
};

const STORAGE_KEY = "kairo_servers";

function getStoredServers(): ServerInfo[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch {}
  return [];
}

function saveStoredServers(servers: ServerInfo[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(servers));
  } catch {}
}

export async function getServer(serverId: string, init?: RequestInit): Promise<ServerInfo> {
  try {
    const query = new URLSearchParams({ serverId, _: String(Date.now()) });
    return await apiRequest<ServerInfo>(`/api/server?${query.toString()}`, init);
  } catch {
    const servers = getStoredServers();
    const found = servers.find((s) => s.id === serverId);
    if (found) {
      return found;
    }
    throw new Error(`Server ${serverId} not found`);
  }
}

export async function getServerMetrics(serverId: string, init?: RequestInit): Promise<ServerInfo> {
  return getServer(serverId, init);
}

export async function listServers(init?: RequestInit): Promise<ServerInfo[]> {
  try {
    const query = new URLSearchParams({ _: String(Date.now()) });
    const body = await apiRequest<{ servers: ServerInfo[] }>(
      `/api/servers?${query.toString()}`,
      init,
    );
    if (body.servers && body.servers.length > 0) return body.servers;
  } catch {}
  return getStoredServers();
}

export async function createServer(input: ServerWriteInput): Promise<ServerInfo> {
  try {
    return await apiRequest<ServerInfo>("/api/servers", {
      method: "POST",
      body: JSON.stringify(input),
      timeoutMs: 25000,
    });
  } catch {
    const servers = getStoredServers();
    const newServer: ServerInfo = {
      id: `server-${Date.now()}`,
      name: input.name,
      host: input.host,
      hostname: input.host,
      port: input.port,
      username: input.username,
      authType: input.authType,
      authToken: input.authToken,
      tunnelMode: input.tunnelMode,
      tunnelUrl: input.tunnelUrl,
      status: "offline",
      cpuUsage: 0,
      memoryUsage: 0,
      diskUsage: 0,
      uptimeSeconds: 0,
      lastSeen: new Date().toISOString(),
    };
    servers.push(newServer);
    saveStoredServers(servers);
    return newServer;
  }
}

export async function updateServer(id: string, input: ServerWriteInput): Promise<ServerInfo> {
  try {
    return await apiRequest<ServerInfo>(`/api/servers/${id}`, {
      method: "PUT",
      body: JSON.stringify(input),
      timeoutMs: 25000,
    });
  } catch {
    const servers = getStoredServers();
    const index = servers.findIndex((s) => s.id === id);
    if (index !== -1) {
      servers[index] = {
        ...servers[index],
        name: input.name,
        host: input.host,
        port: input.port,
        username: input.username,
        authType: input.authType,
        authToken: input.authToken !== undefined ? input.authToken : servers[index].authToken,
        tunnelMode: input.tunnelMode,
        tunnelUrl: input.tunnelUrl,
      };
      saveStoredServers(servers);
      return servers[index];
    }
    throw new Error("Server not found");
  }
}

export async function deleteServer(id: string): Promise<{ status: string }> {
  try {
    return await apiRequest<{ status: string }>(`/api/servers/${id}`, {
      method: "DELETE",
    });
  } catch {
    const servers = getStoredServers().filter((s) => s.id !== id);
    saveStoredServers(servers);
    return { status: "deleted" };
  }
}

export async function testServerConnection(id: string): Promise<ConnectionTestResult> {
  const servers = getStoredServers();
  const server = servers.find((s) => s.id === id);
  if (!server) {
    throw new Error(`Server ${id} not found`);
  }

  try {
    return await apiRequest<ConnectionTestResult>(`/api/servers/${id}/test-connection`, {
      method: "POST",
      timeoutMs: 10000,
    });
  } catch {
    const protocol = server.tunnelMode
      ? "wss"
      : typeof window !== "undefined" && window.location.protocol === "https:"
        ? "wss"
        : "ws";
    const port = server.port || 9600;
    const host = server.host.includes(":") ? server.host : `${server.host}:${port}`;
    const wsUrl = server.tunnelMode && server.tunnelUrl ? server.tunnelUrl : `${protocol}://${host}`;

    const start = performance.now();
    try {
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          ws.close();
          reject(new Error("Connection timed out after 5s"));
        }, 5000);

        const ws = new WebSocket(wsUrl);
        ws.onopen = () => {
          clearTimeout(timeout);
          ws.close();
          resolve();
        };
        ws.onerror = () => {
          clearTimeout(timeout);
          reject(new Error(`Failed to reach Kairo agent at ${wsUrl}`));
        };
      });

      const latencyMs = Math.max(1, Math.round(performance.now() - start));
      const updatedServer: ServerInfo = {
        ...server,
        status: "online",
        lastSeen: new Date().toISOString(),
        error: undefined,
      };
      const updatedList = servers.map((s) => (s.id === id ? updatedServer : s));
      saveStoredServers(updatedList);

      return {
        ok: true,
        latencyMs,
        server: updatedServer,
      };
    } catch (wsErr) {
      const errMessage = wsErr instanceof Error ? wsErr.message : "Connection failed";
      const updatedServer: ServerInfo = { ...server, status: "error", error: errMessage };
      const updatedList = servers.map((s) => (s.id === id ? updatedServer : s));
      saveStoredServers(updatedList);

      return {
        ok: false,
        latencyMs: 0,
        error: errMessage,
        server: updatedServer,
      };
    }
  }
}

export async function connectServer(id: string): Promise<ServerInfo> {
  const servers = getStoredServers();
  const server = servers.find((s) => s.id === id);
  if (!server) throw new Error("Server not found");

  try {
    return await apiRequest<ServerInfo>(`/api/servers/${id}/connect`, {
      method: "POST",
      timeoutMs: 25000,
    });
  } catch {
    return server;
  }
}

export async function disconnectServer(id: string): Promise<ServerInfo> {
  const servers = getStoredServers();
  const server = servers.find((s) => s.id === id);
  if (!server) throw new Error("Server not found");

  try {
    return await apiRequest<ServerInfo>(`/api/servers/${id}/disconnect`, {
      method: "POST",
      timeoutMs: 15000,
    });
  } catch {
    const updated = { ...server, status: "offline" as const };
    const nextList = servers.map((s) => (s.id === id ? updated : s));
    saveStoredServers(nextList);
    return updated;
  }
}
