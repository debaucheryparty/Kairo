import { ConnectionState, type ConnectionStore } from './connection';
import { decodeEnvelope, encodeEnvelope, MessageKind, Opcode } from './envelope';
import {
  decodeAttachPtyResponse,
  decodeCreatePtyResponse,
  decodeGetMetricsResponse,
  decodeHandshakeAck,
  decodeKairoError,
  decodeListDirectoryResponse,
  decodeListProcessesResponse,
  decodeListPtysResponse,
  decodePtyOutput,
  decodeReadFileResponse,
  decodeWriteFileResponse,
  encodeAttachPtyRequest,
  encodeClosePtyRequest,
  encodeCreatePtyRequest,
  encodeGetMetricsRequest,
  encodeHandshakeInit,
  encodeKillProcessRequest,
  encodeListDirectoryRequest,
  encodeListProcessesRequest,
  encodeListPtysRequest,
  encodePtyInput,
  encodeReadFileRequest,
  encodeResizePtyRequest,
  encodeWriteFileRequest,
  encodeWatchRequest,
  decodeWatchResponse,
  decodeFileEvent,
  encodeListContainersRequest,
  decodeListContainersResponse,
  encodeManageContainerRequest,
  decodeManageContainerResponse,
  encodeContainerLogsRequest,
  decodeContainerLogsResponse,
  encodeListServicesRequest,
  decodeListServicesResponse,
  encodeManageServiceRequest,
  decodeManageServiceResponse,
  encodeListAppsRequest,
  decodeListAppsResponse,
  encodeLaunchAppRequest,
  decodeLaunchAppResponse,
  encodeCloseSurfaceRequest,
  decodeCloseSurfaceResponse,
  encodeGetGpuInfoRequest,
  decodeGetGpuInfoResponse,
  encodeStartGpuStreamRequest,
  decodeStartGpuStreamResponse,
  encodeStopGpuStreamRequest,
  decodeStopGpuStreamResponse,
  encodeGpuStreamStatsRequest,
  decodeGpuStreamStats,
  type FileEntry,
  type FileEventPayload,
  type HandshakeAckPayload,
  type ProcessInfo,
  type PtySessionInfo,
  type SystemMetrics,
  type DockerContainer,
  ContainerAction,
  type SystemService,
  ServiceAction,
  type LinuxApp,
  type LaunchAppResponsePayload,
  encodeSurfaceInputEvent,
  decodeSurfaceFrame,
  type SurfaceInputEventPayload,
  type SurfaceFramePayload,
  type GetGpuInfoResponsePayload,
  type StartGpuStreamRequestPayload,
  type StartGpuStreamResponsePayload,
  type GpuStreamStatsPayload,
} from './protocol';
import type { KairoSession } from './session';
import type { TransportAdapter } from './transport';

export interface KairoClientOptions {
  transport: TransportAdapter;
  connectionStore: { getState: () => ConnectionStore };
  clientId?: string;
  authToken?: string;
  tunnelRelayUrl?: string;
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
  private authToken?: string;
  private tunnelRelayUrl?: string;
  private handshakeTimeoutMs: number;
  private currentSession: KairoSession | null = null;
  private nextRequestId = 1n;
  private pendingRequests = new Map<string, PendingRequest>();
  private eventListeners = new Map<number, Set<(payload: Uint8Array) => void>>();

  constructor(options: KairoClientOptions) {
    this.transport = options.transport;
    this.store = options.connectionStore;
    this.clientId = options.clientId || 'kairo-web-client';
    this.authToken = options.authToken;
    this.tunnelRelayUrl = options.tunnelRelayUrl;
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

  async connect(url: string, tokenOverride?: string, tunnelRelayOverride?: string): Promise<KairoSession> {
    const store = this.store.getState();
    store.transition(ConnectionState.Connecting);

    const relay = tunnelRelayOverride ?? this.tunnelRelayUrl;
    const connectUrl = relay ? `${relay.replace(/\/$/, '')}/tunnel?target=${encodeURIComponent(url)}` : url;
    await this.transport.connect(connectUrl);
    store.transition(ConnectionState.Authenticating);

    const token = tokenOverride ?? this.authToken;
    const initBytes = encodeHandshakeInit({
      protocolVersion: 1,
      clientId: this.clientId,
      authToken: token,
      timestamp: Date.now(),
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

    if (ack.authenticated === false || Boolean(ack.errorMessage)) {
      const err = new Error(ack.errorMessage || 'Authentication failed: invalid token');
      store.setError(err.message);
      store.transition(ConnectionState.Disconnected);
      await this.transport.close();
      throw err;
    }

    this.currentSession = {
      sessionId: ack.sessionId,
      computerId: ack.agentId,
      capabilities: ack.capabilities,
      protocolVersion: ack.protocolVersion,
    };

    store.transition(ConnectionState.Connected);
    return this.currentSession;
  }

  getHomeDirectory(): string | null {
    const prefix = 'home:';
    const entry = this.currentSession?.capabilities.find((c) => c.startsWith(prefix));
    return entry ? entry.slice(prefix.length) : null;
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

  async watchDirectory(path = '', recursive = false): Promise<boolean> {
    const payload = encodeWatchRequest(path, recursive);
    const respBytes = await this.sendRequest(Opcode.FsWatch, payload);
    const res = decodeWatchResponse(respBytes);
    return res.success;
  }

  onFileEvent(listener: (event: FileEventPayload) => void): () => void {
    return this.onEvent(Opcode.FsWatch, (payload) => {
      try {
        const event = decodeFileEvent(payload);
        listener(event);
      } catch (err) {
        console.error('Failed to decode FileEvent:', err);
      }
    });
  }

  async sendNotification(opcode: Opcode, payload: Uint8Array): Promise<void> {
    if (!this.currentSession) {
      throw new Error('Not connected to a Kairo Agent');
    }
    const frame = encodeEnvelope(MessageKind.Request, 0n, payload, opcode);
    await this.transport.send(frame.buffer as ArrayBuffer);
  }

  onEvent(opcode: Opcode, listener: (payload: Uint8Array) => void): () => void {
    let set = this.eventListeners.get(opcode);
    if (!set) {
      set = new Set();
      this.eventListeners.set(opcode, set);
    }
    set.add(listener);
    return () => {
      set?.delete(listener);
    };
  }

  onTerminalOutput(listener: (output: { ptyId: string; data: Uint8Array }) => void): () => void {
    return this.onEvent(Opcode.TerminalOutput, (payload) => {
      try {
        const decoded = decodePtyOutput(payload);
        listener(decoded);
      } catch (err) {
        console.error('Failed to decode PtyOutput event:', err);
      }
    });
  }

  async createPty(
    shell = '',
    cols = 80,
    rows = 24,
    workingDirectory = ''
  ): Promise<string> {
    const payload = encodeCreatePtyRequest({ shell, cols, rows, workingDirectory });
    const respBytes = await this.sendRequest(Opcode.TerminalCreatePty, payload);
    const resp = decodeCreatePtyResponse(respBytes);
    return resp.ptyId;
  }

  async writePty(ptyId: string, data: Uint8Array | string): Promise<void> {
    const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data;
    const payload = encodePtyInput(ptyId, bytes);
    await this.sendNotification(Opcode.TerminalInput, payload);
  }

  async resizePty(ptyId: string, cols: number, rows: number): Promise<void> {
    const payload = encodeResizePtyRequest(ptyId, cols, rows);
    await this.sendNotification(Opcode.TerminalResize, payload);
  }

  async closePty(ptyId: string): Promise<void> {
    const payload = encodeClosePtyRequest(ptyId);
    await this.sendNotification(Opcode.TerminalClose, payload);
  }

  async attachPty(ptyId: string): Promise<{ ptyId: string; backlog: Uint8Array }> {
    const payload = encodeAttachPtyRequest(ptyId);
    const respBytes = await this.sendRequest(Opcode.TerminalAttach, payload);
    return decodeAttachPtyResponse(respBytes);
  }

  async listPtys(): Promise<PtySessionInfo[]> {
    const payload = encodeListPtysRequest();
    const respBytes = await this.sendRequest(Opcode.TerminalList, payload);
    return decodeListPtysResponse(respBytes);
  }

  async getMetrics(): Promise<SystemMetrics> {
    const payload = encodeGetMetricsRequest();
    const respBytes = await this.sendRequest(Opcode.MetricsGet, payload);
    return decodeGetMetricsResponse(respBytes);
  }

  async listProcesses(): Promise<ProcessInfo[]> {
    const payload = encodeListProcessesRequest();
    const respBytes = await this.sendRequest(Opcode.ProcessList, payload);
    return decodeListProcessesResponse(respBytes);
  }

  async killProcess(processId: string, signal = 9): Promise<void> {
    const payload = encodeKillProcessRequest(processId, signal);
    await this.sendNotification(Opcode.ProcessKill, payload);
  }

  async listContainers(all = false): Promise<{
    containers: DockerContainer[];
    dockerAvailable: boolean;
  }> {
    const payload = encodeListContainersRequest(all);
    const respBytes = await this.sendRequest(Opcode.DockerListContainers, payload);
    return decodeListContainersResponse(respBytes);
  }

  async manageContainer(
    containerId: string,
    action: ContainerAction
  ): Promise<{ success: boolean; message: string }> {
    const payload = encodeManageContainerRequest(containerId, action);
    const respBytes = await this.sendRequest(Opcode.DockerManageContainer, payload);
    return decodeManageContainerResponse(respBytes);
  }

  async getContainerLogs(containerId: string, tail = 100): Promise<string> {
    const payload = encodeContainerLogsRequest(containerId, tail);
    const respBytes = await this.sendRequest(Opcode.DockerContainerLogs, payload);
    const res = decodeContainerLogsResponse(respBytes);
    return res.logs;
  }

  async listServices(): Promise<{
    services: SystemService[];
    systemdAvailable: boolean;
  }> {
    const payload = encodeListServicesRequest();
    const respBytes = await this.sendRequest(Opcode.SystemListServices, payload);
    return decodeListServicesResponse(respBytes);
  }

  async manageService(
    serviceName: string,
    action: ServiceAction
  ): Promise<{ success: boolean; message: string }> {
    const payload = encodeManageServiceRequest(serviceName, action);
    const respBytes = await this.sendRequest(Opcode.SystemManageService, payload);
    return decodeManageServiceResponse(respBytes);
  }

  async listApplications(): Promise<LinuxApp[]> {
    const payload = encodeListAppsRequest();
    const respBytes = await this.sendRequest(Opcode.AppList, payload);
    return decodeListAppsResponse(respBytes);
  }

  async launchApplication(req: {
    appId: string;
    exec?: string;
    args?: string[];
    workingDirectory?: string;
  }): Promise<LaunchAppResponsePayload> {
    const payload = encodeLaunchAppRequest(req);
    const respBytes = await this.sendRequest(Opcode.AppLaunch, payload);
    return decodeLaunchAppResponse(respBytes);
  }

  async closeSurface(surfaceId: string): Promise<boolean> {
    const payload = encodeCloseSurfaceRequest(surfaceId);
    const respBytes = await this.sendRequest(Opcode.SurfaceClose, payload);
    return decodeCloseSurfaceResponse(respBytes);
  }

  async sendSurfaceInput(event: SurfaceInputEventPayload): Promise<void> {
    const payload = encodeSurfaceInputEvent(event);
    await this.sendNotification(Opcode.SurfaceInput, payload);
  }

  onSurfaceFrame(listener: (frame: SurfaceFramePayload) => void): () => void {
    return this.onEvent(Opcode.SurfaceFrame, (payload) => {
      try {
        listener(decodeSurfaceFrame(payload));
      } catch (err) {
        console.error('Failed to decode SurfaceFrame event:', err);
      }
    });
  }

  async getGpuInfo(): Promise<GetGpuInfoResponsePayload> {
    const payload = encodeGetGpuInfoRequest();
    const respBytes = await this.sendRequest(Opcode.GpuGetInfo, payload);
    return decodeGetGpuInfoResponse(respBytes);
  }

  async startGpuStream(req: StartGpuStreamRequestPayload): Promise<StartGpuStreamResponsePayload> {
    const payload = encodeStartGpuStreamRequest(req);
    const respBytes = await this.sendRequest(Opcode.GpuStartStream, payload);
    return decodeStartGpuStreamResponse(respBytes);
  }

  async stopGpuStream(streamId: string): Promise<boolean> {
    const payload = encodeStopGpuStreamRequest(streamId);
    const respBytes = await this.sendRequest(Opcode.GpuStopStream, payload);
    return decodeStopGpuStreamResponse(respBytes);
  }

  async getGpuStreamStats(streamId: string): Promise<GpuStreamStatsPayload> {
    const payload = encodeGpuStreamStatsRequest(streamId);
    const respBytes = await this.sendRequest(Opcode.GpuStreamStats, payload);
    return decodeGpuStreamStats(respBytes);
  }

  private handleIncomingMessage(data: Uint8Array): void {
    try {
      const envelope = decodeEnvelope(data);

      if (envelope.kind === MessageKind.Event) {
        const listeners = this.eventListeners.get(envelope.flags);
        if (listeners) {
          for (const listener of listeners) {
            try {
              listener(envelope.payload);
            } catch (err) {
              console.error('Error in event listener:', err);
            }
          }
        }
        return;
      }

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
    } catch {
    }
  }
}
