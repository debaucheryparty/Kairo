export const MAGIC = [0x4b, 0x52]; // 'K', 'R'
export const PROTOCOL_VERSION = 1;
export const HEADER_SIZE = 20;
export const MAX_PAYLOAD_SIZE = 16 * 1024 * 1024;

export enum MessageKind {
  HandshakeInit = 1,
  HandshakeAck = 2,
  Request = 3,
  Response = 4,
  Event = 5,
  Error = 6,
}

export enum Opcode {
  None = 0,
  FsListDirectory = 10,
  FsReadFile = 11,
  FsWriteFile = 12,
  FsWatch = 13,
  TerminalCreatePty = 20,
  TerminalInput = 21,
  TerminalOutput = 22,
  TerminalResize = 23,
  TerminalClose = 24,
  TerminalAttach = 25,
  TerminalList = 26,
  ProcessList = 30,
  ProcessSpawn = 31,
  ProcessKill = 32,
  MetricsGet = 40,
  DockerListContainers = 50,
  DockerManageContainer = 51,
  DockerContainerLogs = 52,
  SystemListServices = 60,
  SystemManageService = 61,
  AppList = 70,
  AppLaunch = 71,
  SurfaceInput = 72,
  SurfaceClose = 73,
  GpuGetInfo = 80,
  GpuStartStream = 81,
  GpuStopStream = 82,
  GpuStreamStats = 83,
}

export interface KairoEnvelope {
  version: number;
  kind: MessageKind;
  flags: number;
  requestId: bigint;
  payload: Uint8Array;
}

export function encodeEnvelope(
  kind: MessageKind,
  requestId: bigint,
  payload: Uint8Array = new Uint8Array(0),
  opcode: Opcode = Opcode.None
): Uint8Array {
  if (payload.byteLength > MAX_PAYLOAD_SIZE) {
    throw new Error(`Payload too large: ${payload.byteLength} bytes (max ${MAX_PAYLOAD_SIZE})`);
  }

  const buffer = new ArrayBuffer(HEADER_SIZE + payload.byteLength);
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);

  view.setUint8(0, MAGIC[0]);
  view.setUint8(1, MAGIC[1]);
  view.setUint16(2, PROTOCOL_VERSION);
  view.setUint16(4, kind);
  view.setUint16(6, opcode); // flags contains opcode
  view.setBigUint64(8, requestId);
  view.setUint32(16, payload.byteLength);

  if (payload.byteLength > 0) {
    bytes.set(payload, HEADER_SIZE);
  }

  return bytes;
}

export function decodeEnvelope(data: Uint8Array): KairoEnvelope {
  if (data.byteLength < HEADER_SIZE) {
    throw new Error(`Frame too short: expected ${HEADER_SIZE} bytes, got ${data.byteLength}`);
  }

  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);

  const m0 = view.getUint8(0);
  const m1 = view.getUint8(1);
  if (m0 !== MAGIC[0] || m1 !== MAGIC[1]) {
    throw new Error(`Invalid magic bytes: [${m0}, ${m1}]`);
  }

  const version = view.getUint16(2);
  if (version !== PROTOCOL_VERSION) {
    throw new Error(`Version mismatch: local=${PROTOCOL_VERSION}, remote=${version}`);
  }

  const kind = view.getUint16(4) as MessageKind;
  const flags = view.getUint16(6);
  const requestId = view.getBigUint64(8);
  const payloadLen = view.getUint32(16);

  if (payloadLen > MAX_PAYLOAD_SIZE) {
    throw new Error(`Payload too large: ${payloadLen} bytes`);
  }

  const totalLength = HEADER_SIZE + payloadLen;
  if (data.byteLength !== totalLength) {
    throw new Error(`Payload length mismatch: expected ${payloadLen} bytes, got ${data.byteLength - HEADER_SIZE}`);
  }

  const payload = new Uint8Array(
    data.buffer,
    data.byteOffset + HEADER_SIZE,
    payloadLen
  );

  return {
    version,
    kind,
    flags,
    requestId,
    payload,
  };
}
