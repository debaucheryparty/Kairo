import type { TransportAdapter } from './transport';

export class WebSocketTransportAdapter implements TransportAdapter {
  private socket: WebSocket | null = null;
  private messageHandlers: Array<(data: ArrayBuffer) => void> = [];
  private closeHandlers: Array<(reason: string) => void> = [];
  private errorHandlers: Array<(error: Error) => void> = [];

  async connect(url: string): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        const ws = new WebSocket(url);
        ws.binaryType = 'arraybuffer';

        ws.onopen = () => {
          this.socket = ws;
          resolve();
        };

        ws.onmessage = (event) => {
          if (event.data instanceof ArrayBuffer) {
            for (const handler of this.messageHandlers) {
              handler(event.data);
            }
          }
        };

        ws.onclose = (event) => {
          this.socket = null;
          for (const handler of this.closeHandlers) {
            handler(event.reason || 'connection closed');
          }
        };

        ws.onerror = () => {
          const err = new Error('WebSocket connection error');
          for (const handler of this.errorHandlers) {
            handler(err);
          }
          if (!this.socket) {
            reject(err);
          }
        };
      } catch (err) {
        reject(err instanceof Error ? err : new Error(String(err)));
      }
    });
  }

  async send(data: ArrayBuffer): Promise<void> {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      throw new Error('WebSocket is not connected');
    }
    this.socket.send(data);
  }

  onMessage(handler: (data: ArrayBuffer) => void): void {
    this.messageHandlers.push(handler);
  }

  onClose(handler: (reason: string) => void): void {
    this.closeHandlers.push(handler);
  }

  onError(handler: (error: Error) => void): void {
    this.errorHandlers.push(handler);
  }

  async close(): Promise<void> {
    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }
  }

  isConnected(): boolean {
    return this.socket !== null && this.socket.readyState === WebSocket.OPEN;
  }
}
