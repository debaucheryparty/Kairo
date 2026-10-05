import type { ServerInfo } from "@/src/lib/api/server";

const DB_NAME = "kairo_db";
const DB_VERSION = 1;
const STORE_SERVERS = "servers";
const STORE_PREFS = "preferences";

let dbPromise: Promise<IDBDatabase> | null = null;

function getDb(): Promise<IDBDatabase> {
  if (typeof window === "undefined" || !window.indexedDB) {
    return Promise.reject(new Error("IndexedDB not available in current environment"));
  }

  if (dbPromise) return dbPromise;

  dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    const request = window.indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_SERVERS)) {
        db.createObjectStore(STORE_SERVERS, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(STORE_PREFS)) {
        db.createObjectStore(STORE_PREFS, { keyPath: "key" });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("Failed to open IndexedDB"));
  });

  return dbPromise;
}

export type SafeServerMetadata = Omit<ServerInfo, "authToken">;

// Non-sensitive server profiles in IndexedDB
export async function idbGetServers(): Promise<SafeServerMetadata[]> {
  try {
    const db = await getDb();
    return await new Promise<SafeServerMetadata[]>((resolve, reject) => {
      const tx = db.transaction(STORE_SERVERS, "readonly");
      const store = tx.objectStore(STORE_SERVERS);
      const req = store.getAll();
      req.onsuccess = () => resolve((req.result as SafeServerMetadata[]) || []);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return [];
  }
}

export async function idbSaveServer(server: SafeServerMetadata): Promise<void> {
  // Strip any accidental sensitive secrets before saving to IndexedDB
  const { ...safe } = server;
  if ("authToken" in safe) {
    delete (safe as { authToken?: string }).authToken;
  }
  const db = await getDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_SERVERS, "readwrite");
    const store = tx.objectStore(STORE_SERVERS);
    const req = store.put(safe);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

export async function idbDeleteServer(id: string): Promise<void> {
  const db = await getDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_SERVERS, "readwrite");
    const store = tx.objectStore(STORE_SERVERS);
    const req = store.delete(id);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

export async function idbGetPreference<T>(key: string, fallback: T): Promise<T> {
  try {
    const db = await getDb();
    return await new Promise<T>((resolve) => {
      const tx = db.transaction(STORE_PREFS, "readonly");
      const store = tx.objectStore(STORE_PREFS);
      const req = store.get(key);
      req.onsuccess = () => {
        if (req.result && "value" in req.result) {
          resolve(req.result.value as T);
        } else {
          resolve(fallback);
        }
      };
      req.onerror = () => resolve(fallback);
    });
  } catch {
    return fallback;
  }
}

export async function idbSetPreference<T>(key: string, value: T): Promise<void> {
  try {
    const db = await getDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_PREFS, "readwrite");
      const store = tx.objectStore(STORE_PREFS);
      const req = store.put({ key, value });
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch {}
}

// In-memory and persistent session credential store
const activeSessionTokens = new Map<string, string>();

export function setSessionToken(serverId: string, token: string): void {
  activeSessionTokens.set(serverId, token);
  try {
    sessionStorage.setItem(`kairo_session_token:${serverId}`, token);
    localStorage.setItem(`kairo_token:${serverId}`, token);
  } catch {}
}

export function getSessionToken(serverId: string): string | undefined {
  if (activeSessionTokens.has(serverId)) {
    return activeSessionTokens.get(serverId);
  }
  try {
    const stored =
      sessionStorage.getItem(`kairo_session_token:${serverId}`) ||
      localStorage.getItem(`kairo_token:${serverId}`);
    if (stored) {
      activeSessionTokens.set(serverId, stored);
      return stored;
    }
  } catch {}
  return undefined;
}

export function clearSessionToken(serverId: string): void {
  activeSessionTokens.delete(serverId);
  try {
    sessionStorage.removeItem(`kairo_session_token:${serverId}`);
    localStorage.removeItem(`kairo_token:${serverId}`);
  } catch {}
}
