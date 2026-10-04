import { createStore } from 'zustand/vanilla';

export enum ConnectionState {
  Disconnected = 'disconnected',
  Connecting = 'connecting',
  Authenticating = 'authenticating',
  Connected = 'connected',
  Degraded = 'degraded',
  Reconnecting = 'reconnecting',
}

interface ConnectionStoreState {
  state: ConnectionState;
  error: string | null;
  lastConnectedAt: number | null;
  reconnectAttempts: number;
}

interface ConnectionStoreActions {
  transition: (next: ConnectionState) => void;
  setError: (error: string) => void;
  recordReconnectAttempt: () => void;
  reset: () => void;
}

export type ConnectionStore = ConnectionStoreState & ConnectionStoreActions;
export type ConnectionStoreApi = ReturnType<typeof createConnectionStore>;

const INITIAL_STATE: ConnectionStoreState = {
  state: ConnectionState.Disconnected,
  error: null,
  lastConnectedAt: null,
  reconnectAttempts: 0,
};

export function createConnectionStore() {
  return createStore<ConnectionStore>((set) => ({
    ...INITIAL_STATE,

    transition(next: ConnectionState) {
      set((prev) => {
        const update: Partial<ConnectionStoreState> = { state: next, error: null };
        if (next === ConnectionState.Connected) {
          update.lastConnectedAt = Date.now();
          update.reconnectAttempts = 0;
        }
        return update;
      });
    },

    setError(error: string) {
      set({ error });
    },

    recordReconnectAttempt() {
      set((prev) => ({ reconnectAttempts: prev.reconnectAttempts + 1 }));
    },

    reset() {
      set(INITIAL_STATE);
    },
  }));
}
