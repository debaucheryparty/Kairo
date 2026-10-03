"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { ApiError } from "@/src/lib/api/client";
import { type NewServerInput, type Server, type ServerStatus } from "@/src/lib/servers";
import {
  createServer,
  deleteServer as deleteServerApi,
  disconnectServer as disconnectServerApi,
  listServers,
  testServerConnection,
  updateServer as updateServerApi,
  type ConnectionTestResult,
  type ServerInfo,
} from "@/src/lib/api/server";

import { KairoClient, createConnectionStore, WebSocketTransportAdapter } from "@kairo/runtime";
import { setActiveRuntimeClient } from "@/src/lib/api/files";

export type AppScreen = "server-selection" | "booting" | "logging-off" | "desktop";

type SessionContextValue = {
  screen: AppScreen;
  servers: Server[];
  selectedServer: Server | null;
  loadingServers: boolean;
  serversError: string | null;
  runtimeClient: KairoClient | null;
  runtimeConnected: boolean;
  refreshServers: () => Promise<Server[]>;
  selectServer: (server: Server) => boolean;
  addServer: (input: NewServerInput) => Promise<Server>;
  updateServer: (id: string, input: NewServerInput) => Promise<Server>;
  deleteServer: (id: string) => Promise<void>;
  testConnection: (id: string) => Promise<ConnectionTestResult>;
  completeBoot: () => void;
  logOut: () => void;
  completeLogOut: () => void;
  backToServers: () => void;
  retryBoot: () => void;
  switchServer: (server: Server) => void;
};

const SessionContext = createContext<SessionContextValue | null>(null);

function asStatus(value: string | undefined): ServerStatus {
  switch (value) {
    case "online":
    case "offline":
    case "connecting":
    case "error":
    case "authentication_failed":
    case "unknown":
      return value;
    default:
      return "unknown";
  }
}

export function toSessionServer(info: ServerInfo): Server {
  const hostname = info.hostname || info.host;
  return {
    id: info.id,
    name: info.name || hostname,
    hostname,
    address: info.host,
    status: asStatus(info.status),
    sshPort: info.port,
    username: info.username,
    authType: info.authType,
    tunnelMode: info.tunnelMode,
    tunnelUrl: info.tunnelUrl,
    error: info.error,
    lastSeen: info.lastSeen,
  };
}

function toWriteInput(input: NewServerInput) {
  return {
    name: input.name.trim(),
    host: input.address.trim(),
    port: input.sshPort,
    username: input.username.trim(),
    authType: input.authType,
    password: input.password,
    privateKey: input.privateKey,
    authToken: input.authToken,
    tunnelMode: input.tunnelMode,
    tunnelUrl: input.tunnelUrl,
  };
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [screen, setScreen] = useState<AppScreen>("server-selection");
  const [servers, setServers] = useState<Server[]>([]);
  const [selectedServer, setSelectedServer] = useState<Server | null>(null);
  const [loadingServers, setLoadingServers] = useState(true);
  const [serversError, setServersError] = useState<string | null>(null);
  const [runtimeClient, setRuntimeClient] = useState<KairoClient | null>(null);
  const [runtimeConnected, setRuntimeConnected] = useState(false);

  useEffect(() => {
    if (!selectedServer || screen !== "desktop") {
      if (runtimeClient) {
        void runtimeClient.disconnect().catch(() => undefined);
        setRuntimeClient(null);
        setRuntimeConnected(false);
        setActiveRuntimeClient(null);
      }
      return;
    }

    let active = true;
    const store = createConnectionStore();
    const transport = new WebSocketTransportAdapter();
    const client = new KairoClient({
      transport,
      connectionStore: store,
      clientId: "kairo-web",
      authToken: selectedServer.authToken,
      tunnelRelayUrl: selectedServer.tunnelMode ? selectedServer.tunnelUrl : undefined,
    });

    const protocol = typeof window !== "undefined" && window.location.protocol === "https:" ? "wss" : "ws";
    const port = selectedServer.sshPort || 9600;
    const host = selectedServer.address.includes(":") ? selectedServer.address : `${selectedServer.address}:${port}`;
    const url = selectedServer.address.startsWith("ws://") || selectedServer.address.startsWith("wss://")
      ? selectedServer.address
      : `${protocol}://${host}`;

    void client
      .connect(url, selectedServer.authToken, selectedServer.tunnelMode ? selectedServer.tunnelUrl : undefined)
      .then(() => {
        if (!active) {
          void client.disconnect().catch(() => undefined);
          return;
        }
        setRuntimeClient(client);
        setRuntimeConnected(true);
        setActiveRuntimeClient(client);
      })
      .catch(() => {
        if (!active) return;
        setRuntimeClient(null);
        setRuntimeConnected(false);
        setActiveRuntimeClient(null);
      });

    return () => {
      active = false;
      void client.disconnect().catch(() => undefined);
      setRuntimeClient(null);
      setRuntimeConnected(false);
      setActiveRuntimeClient(null);
    };
  }, [
    selectedServer?.id,
    selectedServer?.address,
    selectedServer?.sshPort,
    selectedServer?.authToken,
    selectedServer?.tunnelMode,
    selectedServer?.tunnelUrl,
    screen,
  ]);

  const refreshServers = useCallback(async () => {
    try {
      const items = await listServers();
      const next = items.map(toSessionServer);
      setServers(next);
      setServersError(null);
      setSelectedServer((current) => {
        if (!current) return next[0] || null;
        return next.find((item) => item.id === current.id) || current;
      });
      return next;
    } catch (err) {
      const message = err instanceof Error ? err.message : "unable to load servers";
      setServersError(message);
      return [];
    } finally {
      setLoadingServers(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    void listServers()
      .then((items) => {
        if (cancelled) return;
        const next = items.map(toSessionServer);
        setServers(next);
        const storedActiveId =
          typeof window !== "undefined" ? localStorage.getItem("kairo_active_server_id") : null;
        if (storedActiveId) {
          const matched = next.find((s) => s.id === storedActiveId);
          if (matched) {
            setSelectedServer(matched);
            setScreen("desktop");
          }
        }
        setServersError(null);
      })
      .catch((err) => {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : "unable to load servers";
        setServersError(message);
      })
      .finally(() => {
        if (!cancelled) setLoadingServers(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const selectServer = useCallback((server: Server) => {
    if (typeof window !== "undefined") {
      localStorage.setItem("kairo_active_server_id", server.id);
    }
    setSelectedServer(server);
    setScreen("booting");
    return true;
  }, []);

  const addServer = useCallback(async (input: NewServerInput) => {
    const created = toSessionServer(await createServer(toWriteInput(input)));
    setServers((current) => {
      if (current.some((item) => item.id === created.id)) return current;
      return [...current, created];
    });
    return created;
  }, []);

  const updateServer = useCallback(async (id: string, input: NewServerInput) => {
    const updated = toSessionServer(await updateServerApi(id, toWriteInput(input)));
    setServers((current) => current.map((item) => (item.id === id ? updated : item)));
    setSelectedServer((current) => (current?.id === id ? updated : current));
    return updated;
  }, []);

  const deleteServer = useCallback(
    async (id: string) => {
      await deleteServerApi(id);
      setServers((current) => current.filter((item) => item.id !== id));
      setSelectedServer((current) => {
        if (current?.id !== id) return current;
        return null;
      });
      setScreen((current) => {
        if (selectedServer?.id === id && current !== "server-selection") {
          return "server-selection";
        }
        return current;
      });
    },
    [selectedServer?.id],
  );

  const testConnection = useCallback(async (id: string) => {
    const result = await testServerConnection(id);
    const next = toSessionServer(result.server);
    setServers((current) => current.map((item) => (item.id === id ? next : item)));
    return result;
  }, []);

  const completeBoot = useCallback(() => {
    setScreen("desktop");
  }, []);

  const logOut = useCallback(() => {
    setScreen("logging-off");
  }, []);

  const completeLogOut = useCallback(() => {
    const id = selectedServer?.id;
    if (typeof window !== "undefined") {
      localStorage.removeItem("kairo_active_server_id");
    }
    setSelectedServer(null);
    setScreen("server-selection");
    if (id) {
      void disconnectServerApi(id).catch(() => undefined);
    }
    void refreshServers();
  }, [refreshServers, selectedServer?.id]);

  const backToServers = useCallback(() => {
    const id = selectedServer?.id;
    if (typeof window !== "undefined") {
      localStorage.removeItem("kairo_active_server_id");
    }
    setSelectedServer(null);
    setScreen("server-selection");
    if (id) {
      void disconnectServerApi(id).catch(() => undefined);
    }
    void refreshServers();
  }, [refreshServers, selectedServer?.id]);

  const retryBoot = useCallback(() => {
    if (!selectedServer) {
      setScreen("server-selection");
      return;
    }
    setScreen("booting");
  }, [selectedServer]);

  const switchServer = useCallback(
    (server: Server) => {
      const previous = selectedServer?.id;
      if (previous && previous !== server.id) {
        void disconnectServerApi(previous).catch(() => undefined);
      }
      setSelectedServer(server);
      setScreen("booting");
    },
    [selectedServer?.id],
  );

  const value = useMemo<SessionContextValue>(
    () => ({
      screen,
      servers,
      selectedServer,
      loadingServers,
      serversError,
      runtimeClient,
      runtimeConnected,
      refreshServers,
      selectServer,
      addServer,
      updateServer,
      deleteServer,
      testConnection,
      completeBoot,
      logOut,
      completeLogOut,
      backToServers,
      retryBoot,
      switchServer,
    }),
    [
      screen,
      servers,
      selectedServer,
      loadingServers,
      serversError,
      runtimeClient,
      runtimeConnected,
      refreshServers,
      selectServer,
      addServer,
      updateServer,
      deleteServer,
      testConnection,
      completeBoot,
      logOut,
      completeLogOut,
      backToServers,
      retryBoot,
      switchServer,
    ],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession() {
  const context = useContext(SessionContext);
  if (!context) {
    throw new Error("useSession must be used within SessionProvider");
  }
  return context;
}

export function useSelectedServer() {
  const context = useContext(SessionContext);
  return context?.selectedServer ?? null;
}

export function useRuntimeClient() {
  const context = useContext(SessionContext);
  return context?.runtimeClient ?? null;
}

export function formatApiError(err: unknown, fallback = "request failed") {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error) return err.message;
  return fallback;
}
