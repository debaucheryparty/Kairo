import { ConnectionState, type ConnectionStore } from './connection';
import { decodeEnvelope, encodeEnvelope, MessageKind, Opcode } from './envelope';
import {
  decodeHandshakeAck,
  decodeKairoError,
  decodeListDirectoryResponse,
  decodeReadFileResponse,
  decodeWriteFileResponse,
  encodeHandshakeInit,
  encodeListDirectoryRequest,
  encodeReadFileRequest,
  encodeWriteFileRequest,
  type FileEntry,
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

interface PendingRequest {
  resolve: (data: Uint8Array) => void;
  reject: (err: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

export class KairoClient {
  private transport: TransportAdapter;
  private store: { getState: () => ConnectionStore };
  private clientId: string;
  private handshakeTimeoutMs: number;
  private currentSession: KairoSession | null = null;
  private nextRequestId = 1n;
  private pendingRequests = new Map<string, PendingRequest>();

  constructor(options: KairoClientOptions) {
    this.transport = options.transport;
    this.store = options.connectionStore;
    this.clientId = options.clientId || 'kairo-web-client';
    this.handshakeTimeoutMs = options.handshakeTimeoutMs || 10_000;

    this.transport.onClose((reason) => {
      this.currentSession = null;
      for (const [, req] of this.pendingRequests) {
        clearTimeout(req.timer);
        req.reject(new Error(`Connection closed: ${reason}`));
      }
      this.pendingRequests.clear();
      this.store.getState().transition(ConnectionState.Disconnected);
      this.store.getState().setError(reason);
    });

    this.transport.onError((error) => {
      this.store.getState().setError(error.message);
    });

    this.transport.onMessage((data) => {
      this.handleIncomingMessage(new Uint8Array(data));
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
        this.pendingRequests.delete(requestId.toString());
        reject(new Error('Handshake timed out waiting for server response'));
      }, this.handshakeTimeoutMs);

      this.pendingRequests.set(requestId.toString(), {
        resolve: (payload) => {
          try {
            resolve(decodeHandshakeAck(payload));
          } catch (e) {
            reject(e instanceof Error ? e : new Error(String(e)));
          }
        },
        reject,
        timer,
      });
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

  async sendRequest(opcode: Opcode, payload: Uint8Array): Promise<Uint8Array> {
    if (!this.currentSession) {
      throw new Error('Not connected to a Kairo Agent');
    }

    const requestId = this.nextRequestId++;
    const frame = encodeEnvelope(MessageKind.Request, requestId, payload, opcode);

    return new Promise<Uint8Array>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingRequests.delete(requestId.toString());
        reject(new Error(`Request timed out (opcode ${opcode})`));
      }, 15_000);

      this.pendingRequests.set(requestId.toString(), { resolve, reject, timer });

      this.transport.send(frame.buffer as ArrayBuffer).catch((err) => {
        clearTimeout(timer);
        this.pendingRequests.delete(requestId.toString());
        reject(err);
      });
    });
  }

  async listDirectory(path = ''): Promise<FileEntry[]> {
    const payload = encodeListDirectoryRequest(path);
    const respBytes = await this.sendRequest(Opcode.FsListDirectory, payload);
    return decodeListDirectoryResponse(respBytes);
  }

  async readFile(
    path: string,
    offset = 0,
    length = 0
  ): Promise<{ content: Uint8Array; revision: string }> {
    const payload = encodeReadFileRequest(path, offset, length);
    const respBytes = await this.sendRequest(Opcode.FsReadFile, payload);
    return decodeReadFileResponse(respBytes);
  }

  async writeFile(
    path: string,
    content: Uint8Array,
    expectedRevision = ''
  ): Promise<{ revision: string }> {
    const payload = encodeWriteFileRequest(path, content, expectedRevision);
    const respBytes = await this.sendRequest(Opcode.FsWriteFile, payload);
    return decodeWriteFileResponse(respBytes);
  }

  private handleIncomingMessage(data: Uint8Array): void {
    try {
      const envelope = decodeEnvelope(data);
      const reqId = envelope.requestId.toString();
      const pending = this.pendingRequests.get(reqId);

      if (!pending) return;

      this.pendingRequests.delete(reqId);
      clearTimeout(pending.timer);

      if (envelope.kind === MessageKind.Response || envelope.kind === MessageKind.HandshakeAck) {
        pending.resolve(envelope.payload);
      } else if (envelope.kind === MessageKind.Error) {
        const err = decodeKairoError(envelope.payload);
        pending.reject(new Error(`Agent error [code ${err.code}]: ${err.message}`));
      }
    } catch (e) {
      // Ignored malformed messages
    }
  }
}
