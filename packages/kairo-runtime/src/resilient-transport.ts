import { ConnectionState, type ConnectionStore } from './connection';
import type { TransportAdapter } from './transport';

export interface ResilientTransportConfig {
  primaryUrl: string;
  fallbackUrls?: string[];
  initialBackoffMs?: number;
  maxBackoffMs?: number;
  maxReconnectAttempts?: number;
  connectionStore?: { getState: () => ConnectionStore };
  onReconnected?: () => void;
}

export class ResilientTransportAdapter implements TransportAdapter {
  private primaryUrl: string;
  private fallbackUrls: string[];
  private currentUrlIdx = 0;
  private ws: WebSocket | null = null;
  private messageHandlers = new Set<(data: ArrayBuffer) => void>();
  private closeHandlers = new Set<(reason: string) => void>();
  private errorHandlers = new Set<(error: Error) => void>();

  private isExplicitClose = false;
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private initialBackoffMs: number;
  private maxBackoffMs: number;
  private maxReconnectAttempts: number;
  private store?: { getState: () => ConnectionStore };
  private onReconnectedCallback?: () => void;

  constructor(config: ResilientTransportConfig) {
    this.primaryUrl = config.primaryUrl;
    this.fallbackUrls = config.fallbackUrls || [];
    this.initialBackoffMs = config.initialBackoffMs || 1000;
    this.maxBackoffMs = config.maxBackoffMs || 30000;
    this.maxReconnectAttempts = config.maxReconnectAttempts || 10;
    this.store = config.connectionStore;
    this.onReconnectedCallback = config.onReconnected;
  }

  getEndpoints(): string[] {
    return [this.primaryUrl, ...this.fallbackUrls];
  }

  getActiveUrl(): string {
    const endpoints = this.getEndpoints();
    return endpoints[this.currentUrlIdx % endpoints.length];
  }

  async connect(url?: string): Promise<void> {
    if (url) {
      this.primaryUrl = url;
      this.currentUrlIdx = 0;
    }
    this.isExplicitClose = false;
    this.reconnectAttempts = 0;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    return this.connectCandidate(0);
  }

  private async connectCandidate(startIdx: number): Promise<void> {
    const endpoints = this.getEndpoints();
    let lastError: Error = new Error('No endpoints configured');

    for (let i = 0; i < endpoints.length; i++) {
      const idx = (startIdx + i) % endpoints.length;
      const targetUrl = endpoints[idx];
      try {
        await this.attemptSingleConnect(targetUrl);
        this.currentUrlIdx = idx;
        return;
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
      }
    }

    throw lastError;
  }

  private attemptSingleConnect(targetUrl: string): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      try {
        const socket = new WebSocket(targetUrl);
        socket.binaryType = 'arraybuffer';

        let settled = false;

        const connectTimeout = setTimeout(() => {
          if (!settled) {
            settled = true;
            try {
              socket.close();
            } catch {}
            reject(new Error(`Connection to ${targetUrl} timed out`));
          }
        }, 5000);

        socket.onopen = () => {
          if (settled) return;
          settled = true;
          clearTimeout(connectTimeout);
          this.ws = socket;
          this.setupSocketHandlers(socket);
          resolve();
        };

        socket.onerror = (ev) => {
          if (settled) return;
          settled = true;
          clearTimeout(connectTimeout);
          reject(new Error(`WebSocket connection failed to ${targetUrl}: ${ev.type}`));
        };
      } catch (err) {
        reject(err instanceof Error ? err : new Error(String(err)));
      }
    });
  }

  private setupSocketHandlers(socket: WebSocket): void {
    socket.onmessage = (event: MessageEvent) => {
      const buffer =
        event.data instanceof ArrayBuffer
          ? event.data
          : new Uint8Array(event.data).buffer;
      for (const handler of this.messageHandlers) {
        handler(buffer);
      }
    };

    socket.onerror = (ev) => {
      const err = new Error(`WebSocket error: ${ev.type}`);
      for (const handler of this.errorHandlers) {
        handler(err);
      }
    };

    socket.onclose = (event: CloseEvent) => {
      const reason = event.reason || `Socket closed with code ${event.code}`;
      if (this.isExplicitClose) {
        for (const handler of this.closeHandlers) {
          handler(reason);
        }
        return;
      }

      this.handleUnexpectedClose(reason);
    };
  }

  private handleUnexpectedClose(reason: string): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      if (this.store) {
        this.store.getState().transition(ConnectionState.Disconnected);
        this.store.getState().setError(`Reconnection failed after ${this.reconnectAttempts} attempts`);
      }
      for (const handler of this.closeHandlers) {
        handler(reason);
      }
      return;
    }

    this.reconnectAttempts++;
    if (this.store) {
      this.store.getState().transition(ConnectionState.Reconnecting);
      this.store.getState().recordReconnectAttempt();
      this.store.getState().setError(`Reconnecting (attempt ${this.reconnectAttempts})...`);
    }

    const backoff =
      Math.min(
        this.maxBackoffMs,
        this.initialBackoffMs * Math.pow(1.5, this.reconnectAttempts - 1)
      ) +
      Math.random() * 500;

    this.reconnectTimer = setTimeout(async () => {
      try {
        const nextIdx = this.currentUrlIdx + 1;
        await this.connectCandidate(nextIdx);
        this.reconnectAttempts = 0;
        if (this.store) {
          this.store.getState().transition(ConnectionState.Connected);
        }
        if (this.onReconnectedCallback) {
          this.onReconnectedCallback();
        }
      } catch {
        this.handleUnexpectedClose(reason);
      }
    }, backoff);
  }

  async send(data: ArrayBuffer): Promise<void> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('Transport not connected');
    }
    this.ws.send(data);
  }

  onMessage(handler: (data: ArrayBuffer) => void): void {
    this.messageHandlers.add(handler);
  }

  onClose(handler: (reason: string) => void): void {
    this.closeHandlers.add(handler);
  }

  onError(handler: (error: Error) => void): void {
    this.errorHandlers.add(handler);
  }

  async close(): Promise<void> {
    this.isExplicitClose = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  isConnected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }
}
