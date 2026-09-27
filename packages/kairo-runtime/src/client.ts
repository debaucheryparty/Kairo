import { ConnectionState, type ConnectionStore } from './connection';
import { decodeEnvelope, encodeEnvelope, MessageKind } from './envelope';
import {
  decodeHandshakeAck,
  encodeHandshakeInit,
  type HandshakeAckPayload,
} from './protocol';
import type { KairoSession } from './session';
import type { TransportAdapter } from './transport';

export interface KairoClientOptions {
  transport: TransportAdapter;
  connectionStore: { getState: () => ConnectionStore };
  clientId?: string;
  handshakeTimeoutMs?: number;
}

export class KairoClient {
  private transport: TransportAdapter;
  private store: { getState: () => ConnectionStore };
  private clientId: string;
  private handshakeTimeoutMs: number;
  private currentSession: KairoSession | null = null;
  private nextRequestId = 1n;

  constructor(options: KairoClientOptions) {
    this.transport = options.transport;
    this.store = options.connectionStore;
    this.clientId = options.clientId || 'kairo-web-client';
    this.handshakeTimeoutMs = options.handshakeTimeoutMs || 10_000;

    this.transport.onClose((reason) => {
      this.currentSession = null;
      this.store.getState().transition(ConnectionState.Disconnected);
      this.store.getState().setError(reason);
    });

    this.transport.onError((error) => {
      this.store.getState().setError(error.message);
    });
  }

  getSession(): KairoSession | null {
    return this.currentSession;
  }

  async connect(url: string): Promise<KairoSession> {
    const store = this.store.getState();
    store.transition(ConnectionState.Connecting);

    await this.transport.connect(url);
    store.transition(ConnectionState.Authenticating);

    const initBytes = encodeHandshakeInit({
      protocolVersion: 1,
      clientId: this.clientId,
    });

    const requestId = this.nextRequestId++;
    const frame = encodeEnvelope(MessageKind.HandshakeInit, requestId, initBytes);

    const handshakeAckPromise = new Promise<HandshakeAckPayload>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error('Handshake timed out waiting for server response'));
      }, this.handshakeTimeoutMs);

      const handler = (data: ArrayBuffer) => {
        try {
          const envelope = decodeEnvelope(new Uint8Array(data));
          if (envelope.kind === MessageKind.HandshakeAck) {
            clearTimeout(timer);
            const ack = decodeHandshakeAck(envelope.payload);
            resolve(ack);
          }
        } catch (err) {
          clearTimeout(timer);
          reject(err);
        }
      };

      this.transport.onMessage(handler);
    });

    await this.transport.send(frame.buffer as ArrayBuffer);
    const ack = await handshakeAckPromise;

    this.currentSession = {
      sessionId: ack.sessionId,
      computerId: ack.agentId,
      capabilities: ack.capabilities,
      protocolVersion: ack.protocolVersion,
    };

    store.transition(ConnectionState.Connected);
    return this.currentSession;
  }

  async disconnect(): Promise<void> {
    this.currentSession = null;
    await this.transport.close();
    this.store.getState().transition(ConnectionState.Disconnected);
  }
}
