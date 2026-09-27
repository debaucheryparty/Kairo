export interface TransportAdapter {
  connect(url: string): Promise<void>;
  send(data: ArrayBuffer): Promise<void>;
  onMessage(handler: (data: ArrayBuffer) => void): void;
  onClose(handler: (reason: string) => void): void;
  onError(handler: (error: Error) => void): void;
  close(): Promise<void>;
  isConnected(): boolean;
}
