export { ConnectionState, type ConnectionStore, createConnectionStore } from './connection';
export { type TransportAdapter } from './transport';
export { type KairoSession } from './session';
export { WebSocketTransportAdapter } from './websocket';
export { KairoClient, type KairoClientOptions } from './client';
export {
  encodeEnvelope,
  decodeEnvelope,
  MessageKind,
  Opcode,
  type KairoEnvelope,
  HEADER_SIZE,
  MAGIC,
  PROTOCOL_VERSION,
} from './envelope';
export {
  encodeHandshakeInit,
  decodeHandshakeAck,
  encodeListDirectoryRequest,
  decodeListDirectoryResponse,
  encodeReadFileRequest,
  decodeReadFileResponse,
  encodeWriteFileRequest,
  decodeWriteFileResponse,
  encodeCreatePtyRequest,
  decodeCreatePtyResponse,
  encodePtyInput,
  decodePtyOutput,
  encodeResizePtyRequest,
  encodeClosePtyRequest,
  encodeAttachPtyRequest,
  decodeAttachPtyResponse,
  encodeListPtysRequest,
  decodeListPtysResponse,
  encodeGetMetricsRequest,
  decodeGetMetricsResponse,
  encodeListProcessesRequest,
  decodeListProcessesResponse,
  encodeKillProcessRequest,
  type HandshakeInitPayload,
  type HandshakeAckPayload,
  type FileEntry,
  type KairoErrorPayload,
  type CreatePtyRequestPayload,
  type SystemMetrics,
  type ProcessInfo,
  type PtySessionInfo,
} from './protocol';

