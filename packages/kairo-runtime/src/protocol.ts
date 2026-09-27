export interface HandshakeInitPayload {
  protocolVersion: number;
  clientId: string;
}

export interface HandshakeAckPayload {
  protocolVersion: number;
  agentId: string;
  sessionId: string;
  capabilities: string[];
}

export interface FileEntry {
  path: string;
  fileType: number;
  size: number;
  modifiedAt: number;
  revision: string;
}

export interface KairoErrorPayload {
  code: number;
  message: string;
  requestId: string;
}

const textDecoder = new TextDecoder();

function concat(arrays: Uint8Array[]): Uint8Array {
  const total = arrays.reduce((acc, a) => acc + a.byteLength, 0);
  const result = new Uint8Array(total);
  let offset = 0;
  for (const arr of arrays) {
    result.set(arr, offset);
    offset += arr.byteLength;
  }
  return result;
}

function encodeVarint(val: number): Uint8Array {
  const bytes: number[] = [];
  let v = val;
  while (v >= 0x80) {
    bytes.push((v & 0x7f) | 0x80);
    v >>>= 7;
  }
  bytes.push(v & 0x7f);
  return new Uint8Array(bytes);
}

function encodeStringField(fieldNumber: number, str: string): Uint8Array {
  const textBytes = new TextEncoder().encode(str);
  const tag = (fieldNumber << 3) | 2;
  const lenBytes = encodeVarint(textBytes.byteLength);
  return concat([new Uint8Array([tag]), lenBytes, textBytes]);
}

function encodeBytesField(fieldNumber: number, bytes: Uint8Array): Uint8Array {
  const tag = (fieldNumber << 3) | 2;
  const lenBytes = encodeVarint(bytes.byteLength);
  return concat([new Uint8Array([tag]), lenBytes, bytes]);
}

function encodeUintField(fieldNumber: number, val: number): Uint8Array {
  const tag = (fieldNumber << 3) | 0;
  return concat([new Uint8Array([tag]), encodeVarint(val)]);
}

export function encodeHandshakeInit(payload: HandshakeInitPayload): Uint8Array {
  return concat([
    encodeUintField(1, payload.protocolVersion),
    encodeStringField(2, payload.clientId),
  ]);
}

export function decodeHandshakeAck(data: Uint8Array): HandshakeAckPayload {
  let offset = 0;
  let protocolVersion = 0;
  let agentId = '';
  let sessionId = '';
  const capabilities: string[] = [];
  const textDecoder = new TextDecoder();

  while (offset < data.byteLength) {
    const tag = data[offset++];
    const fieldNumber = tag >> 3;
    const wireType = tag & 0x07;

    if (wireType === 0) {
      let value = 0;
      let shift = 0;
      while (offset < data.byteLength) {
        const byte = data[offset++];
        value |= (byte & 0x7f) << shift;
        if ((byte & 0x80) === 0) break;
        shift += 7;
      }
      if (fieldNumber === 1) protocolVersion = value;
    } else if (wireType === 2) {
      let length = 0;
      let shift = 0;
      while (offset < data.byteLength) {
        const byte = data[offset++];
        length |= (byte & 0x7f) << shift;
        if ((byte & 0x80) === 0) break;
        shift += 7;
      }
      const bytes = data.subarray(offset, offset + length);
      offset += length;
      const str = textDecoder.decode(bytes);

      if (fieldNumber === 2) agentId = str;
      else if (fieldNumber === 3) sessionId = str;
      else if (fieldNumber === 4) capabilities.push(str);
    } else {
      break;
    }
  }

  return { protocolVersion, agentId, sessionId, capabilities };
}

export function encodeListDirectoryRequest(path: string): Uint8Array {
  return encodeStringField(1, path);
}

export function decodeListDirectoryResponse(data: Uint8Array): FileEntry[] {
  let offset = 0;
  const entries: FileEntry[] = [];
  const textDecoder = new TextDecoder();

  while (offset < data.byteLength) {
    const tag = data[offset++];
    const fieldNumber = tag >> 3;
    const wireType = tag & 0x07;

    if (fieldNumber === 1 && wireType === 2) {
      // Repeated FileEntry
      let length = 0;
      let shift = 0;
      while (offset < data.byteLength) {
        const byte = data[offset++];
        length |= (byte & 0x7f) << shift;
        if ((byte & 0x80) === 0) break;
        shift += 7;
      }

      const entryEnd = offset + length;
      let path = '';
      let fileType = 0;
      let size = 0;
      let modifiedAt = 0;
      let revision = '';

      while (offset < entryEnd) {
        const entryTag = data[offset++];
        const fn = entryTag >> 3;
        const wt = entryTag & 0x07;

        if (wt === 0) {
          let val = 0;
          let s = 0;
          while (offset < entryEnd) {
            const b = data[offset++];
            val |= (b & 0x7f) << s;
            if ((b & 0x80) === 0) break;
            s += 7;
          }
          if (fn === 2) fileType = val;
          else if (fn === 3) size = val;
          else if (fn === 4) modifiedAt = val;
        } else if (wt === 2) {
          let l = 0;
          let s = 0;
          while (offset < entryEnd) {
            const b = data[offset++];
            l |= (b & 0x7f) << s;
            if ((b & 0x80) === 0) break;
            s += 7;
          }
          const str = textDecoder.decode(data.subarray(offset, offset + l));
          offset += l;
          if (fn === 1) path = str;
          else if (fn === 5) revision = str;
        }
      }

      entries.push({ path, fileType, size, modifiedAt, revision });
    } else {
      break;
    }
  }

  return entries;
}

export function encodeReadFileRequest(path: string, offset = 0, length = 0): Uint8Array {
  return concat([
    encodeStringField(1, path),
    encodeUintField(2, offset),
    encodeUintField(3, length),
  ]);
}

export function decodeReadFileResponse(data: Uint8Array): { content: Uint8Array; revision: string } {
  let offset = 0;
  let content = new Uint8Array(0);
  let revision = '';
  const textDecoder = new TextDecoder();

  while (offset < data.byteLength) {
    const tag = data[offset++];
    const fieldNumber = tag >> 3;
    const wireType = tag & 0x07;

    if (wireType === 2) {
      let length = 0;
      let shift = 0;
      while (offset < data.byteLength) {
        const byte = data[offset++];
        length |= (byte & 0x7f) << shift;
        if ((byte & 0x80) === 0) break;
        shift += 7;
      }
      if (fieldNumber === 1) {
        content = data.slice(offset, offset + length);
      } else if (fieldNumber === 2) {
        revision = textDecoder.decode(data.subarray(offset, offset + length));
      }
      offset += length;
    } else {
      break;
    }
  }

  return { content, revision };
}

export function encodeWriteFileRequest(
  path: string,
  content: Uint8Array,
  expectedRevision = ''
): Uint8Array {
  return concat([
    encodeStringField(1, path),
    encodeBytesField(2, content),
    encodeStringField(3, expectedRevision),
  ]);
}

export function decodeWriteFileResponse(data: Uint8Array): { revision: string } {
  let offset = 0;
  let revision = '';
  const textDecoder = new TextDecoder();

  while (offset < data.byteLength) {
    const tag = data[offset++];
    const fieldNumber = tag >> 3;
    const wireType = tag & 0x07;

    if (wireType === 2) {
      let length = 0;
      let shift = 0;
      while (offset < data.byteLength) {
        const byte = data[offset++];
        length |= (byte & 0x7f) << shift;
        if ((byte & 0x80) === 0) break;
        shift += 7;
      }
      if (fieldNumber === 1) {
        revision = textDecoder.decode(data.subarray(offset, offset + length));
      }
      offset += length;
    } else {
      break;
    }
  }

  return { revision };
}

export enum FileEventKind {
  Unspecified = 0,
  Created = 1,
  Modified = 2,
  Deleted = 3,
  Renamed = 4,
}

export interface FileEventPayload {
  path: string;
  kind: FileEventKind;
}

export function encodeWatchRequest(path: string, recursive = false): Uint8Array {
  return concat([
    encodeStringField(1, path),
    encodeUintField(2, recursive ? 1 : 0),
  ]);
}

export function decodeWatchResponse(data: Uint8Array): { success: boolean } {
  let offset = 0;
  let success = false;
  while (offset < data.byteLength) {
    const tag = data[offset++];
    const fieldNumber = tag >> 3;
    const wireType = tag & 0x07;
    if (wireType === 0) {
      let value = 0;
      let shift = 0;
      while (offset < data.byteLength) {
        const byte = data[offset++];
        value |= (byte & 0x7f) << shift;
        if ((byte & 0x80) === 0) break;
        shift += 7;
      }
      if (fieldNumber === 1) success = value !== 0;
    } else {
      break;
    }
  }
  return { success };
}

export function decodeFileEvent(data: Uint8Array): FileEventPayload {
  let offset = 0;
  let path = '';
  let kind = FileEventKind.Unspecified;
  const textDecoder = new TextDecoder();

  while (offset < data.byteLength) {
    const tag = data[offset++];
    const fieldNumber = tag >> 3;
    const wireType = tag & 0x07;

    if (wireType === 0) {
      let value = 0;
      let shift = 0;
      while (offset < data.byteLength) {
        const byte = data[offset++];
        value |= (byte & 0x7f) << shift;
        if ((byte & 0x80) === 0) break;
        shift += 7;
      }
      if (fieldNumber === 2) kind = value as FileEventKind;
    } else if (wireType === 2) {
      let length = 0;
      let shift = 0;
      while (offset < data.byteLength) {
        const byte = data[offset++];
        length |= (byte & 0x7f) << shift;
        if ((byte & 0x80) === 0) break;
        shift += 7;
      }
      if (fieldNumber === 1) {
        path = textDecoder.decode(data.subarray(offset, offset + length));
      }
      offset += length;
    } else {
      break;
    }
  }

  return { path, kind };
}

export function decodeKairoError(data: Uint8Array): KairoErrorPayload {
  let offset = 0;
  let code = 0;
  let message = '';
  let requestId = '';
  const textDecoder = new TextDecoder();

  while (offset < data.byteLength) {
    const tag = data[offset++];
    const fieldNumber = tag >> 3;
    const wireType = tag & 0x07;

    if (wireType === 0) {
      let value = 0;
      let shift = 0;
      while (offset < data.byteLength) {
        const byte = data[offset++];
        value |= (byte & 0x7f) << shift;
        if ((byte & 0x80) === 0) break;
        shift += 7;
      }
      if (fieldNumber === 1) code = value;
    } else if (wireType === 2) {
      let length = 0;
      let shift = 0;
      while (offset < data.byteLength) {
        const byte = data[offset++];
        length |= (byte & 0x7f) << shift;
        if ((byte & 0x80) === 0) break;
        shift += 7;
      }
      const str = textDecoder.decode(data.subarray(offset, offset + length));
      offset += length;
      if (fieldNumber === 2) message = str;
      else if (fieldNumber === 3) requestId = str;
    } else {
      break;
    }
  }

  return { code, message, requestId };
}

export interface CreatePtyRequestPayload {
  shell?: string;
  cols?: number;
  rows?: number;
  workingDirectory?: string;
}

export function encodeCreatePtyRequest(req: CreatePtyRequestPayload = {}): Uint8Array {
  const parts: Uint8Array[] = [];
  if (req.shell) {
    parts.push(encodeStringField(1, req.shell));
  }
  if (req.cols !== undefined) {
    parts.push(encodeUintField(2, req.cols));
  }
  if (req.rows !== undefined) {
    parts.push(encodeUintField(3, req.rows));
  }
  if (req.workingDirectory) {
    parts.push(encodeStringField(4, req.workingDirectory));
  }
  return concat(parts);
}

export function decodeCreatePtyResponse(data: Uint8Array): { ptyId: string } {
  let offset = 0;
  let ptyId = '';
  const textDecoder = new TextDecoder();

  while (offset < data.byteLength) {
    const tag = data[offset++];
    const fieldNumber = tag >> 3;
    const wireType = tag & 0x07;

    if (wireType === 2) {
      let length = 0;
      let shift = 0;
      while (offset < data.byteLength) {
        const byte = data[offset++];
        length |= (byte & 0x7f) << shift;
        if ((byte & 0x80) === 0) break;
        shift += 7;
      }
      if (fieldNumber === 1) {
        ptyId = textDecoder.decode(data.subarray(offset, offset + length));
      }
      offset += length;
    } else {
      break;
    }
  }

  return { ptyId };
}

export function encodePtyInput(ptyId: string, data: Uint8Array): Uint8Array {
  return concat([
    encodeStringField(1, ptyId),
    encodeBytesField(2, data),
  ]);
}

export function decodePtyOutput(data: Uint8Array): { ptyId: string; data: Uint8Array } {
  let offset = 0;
  let ptyId = '';
  let outputData = new Uint8Array(0);
  const textDecoder = new TextDecoder();

  while (offset < data.byteLength) {
    const tag = data[offset++];
    const fieldNumber = tag >> 3;
    const wireType = tag & 0x07;

    if (wireType === 2) {
      let length = 0;
      let shift = 0;
      while (offset < data.byteLength) {
        const byte = data[offset++];
        length |= (byte & 0x7f) << shift;
        if ((byte & 0x80) === 0) break;
        shift += 7;
      }
      if (fieldNumber === 1) {
        ptyId = textDecoder.decode(data.subarray(offset, offset + length));
      } else if (fieldNumber === 2) {
        outputData = data.slice(offset, offset + length);
      }
      offset += length;
    } else {
      break;
    }
  }

  return { ptyId, data: outputData };
}

export function encodeResizePtyRequest(ptyId: string, cols: number, rows: number): Uint8Array {
  return concat([
    encodeStringField(1, ptyId),
    encodeUintField(2, cols),
    encodeUintField(3, rows),
  ]);
}

export function encodeClosePtyRequest(ptyId: string): Uint8Array {
  return encodeStringField(1, ptyId);
}

export interface SystemMetrics {
  cpuUsagePercent: number;
  memoryTotalBytes: number;
  memoryUsedBytes: number;
  diskTotalBytes: number;
  diskUsedBytes: number;
  loadAverage1m: number;
  loadAverage5m: number;
  loadAverage15m: number;
  uptimeSeconds: number;
}

export function encodeGetMetricsRequest(): Uint8Array {
  return new Uint8Array(0);
}

export function decodeGetMetricsResponse(data: Uint8Array): SystemMetrics {
  let offset = 0;
  const metrics: SystemMetrics = {
    cpuUsagePercent: 0,
    memoryTotalBytes: 0,
    memoryUsedBytes: 0,
    diskTotalBytes: 0,
    diskUsedBytes: 0,
    loadAverage1m: 0,
    loadAverage5m: 0,
    loadAverage15m: 0,
    uptimeSeconds: 0,
  };

  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);

  while (offset < data.byteLength) {
    const tag = data[offset++];
    const fieldNumber = tag >> 3;
    const wireType = tag & 0x07;

    if (fieldNumber === 1 && wireType === 2) {
      let length = 0;
      let shift = 0;
      while (offset < data.byteLength) {
        const byte = data[offset++];
        length |= (byte & 0x7f) << shift;
        if ((byte & 0x80) === 0) break;
        shift += 7;
      }

      const end = offset + length;
      while (offset < end) {
        const subTag = data[offset++];
        const fn = subTag >> 3;
        const wt = subTag & 0x07;

        if (wt === 1) {
          const val = view.getFloat64(offset, true);
          offset += 8;
          if (fn === 1) metrics.cpuUsagePercent = val;
          else if (fn === 6) metrics.loadAverage1m = val;
          else if (fn === 7) metrics.loadAverage5m = val;
          else if (fn === 8) metrics.loadAverage15m = val;
        } else if (wt === 0) {
          let val = 0;
          let s = 0;
          while (offset < end) {
            const b = data[offset++];
            val += (b & 0x7f) * Math.pow(2, s);
            if ((b & 0x80) === 0) break;
            s += 7;
          }
          if (fn === 2) metrics.memoryTotalBytes = val;
          else if (fn === 3) metrics.memoryUsedBytes = val;
          else if (fn === 4) metrics.diskTotalBytes = val;
          else if (fn === 5) metrics.diskUsedBytes = val;
          else if (fn === 9) metrics.uptimeSeconds = val;
        } else if (wt === 2) {
          let l = 0;
          let s = 0;
          while (offset < end) {
            const b = data[offset++];
            l |= (b & 0x7f) << s;
            if ((b & 0x80) === 0) break;
            s += 7;
          }
          offset += l;
        } else if (wt === 5) {
          offset += 4;
        } else {
          break;
        }
      }
    } else {
      break;
    }
  }

  return metrics;
}

export interface ProcessInfo {
  processId: string;
  pid: number;
  executable: string;
  arguments: string[];
  state: number;
  owner: string;
}

export function encodeListProcessesRequest(): Uint8Array {
  return new Uint8Array(0);
}

export function decodeListProcessesResponse(data: Uint8Array): ProcessInfo[] {
  let offset = 0;
  const processes: ProcessInfo[] = [];
  const textDecoder = new TextDecoder();

  while (offset < data.byteLength) {
    const tag = data[offset++];
    const fieldNumber = tag >> 3;
    const wireType = tag & 0x07;

    if (fieldNumber === 1 && wireType === 2) {
      let length = 0;
      let shift = 0;
      while (offset < data.byteLength) {
        const byte = data[offset++];
        length |= (byte & 0x7f) << shift;
        if ((byte & 0x80) === 0) break;
        shift += 7;
      }

      const end = offset + length;
      let processId = '';
      let pid = 0;
      let executable = '';
      const args: string[] = [];
      let state = 0;
      let owner = '';

      while (offset < end) {
        const subTag = data[offset++];
        const fn = subTag >> 3;
        const wt = subTag & 0x07;

        if (wt === 0) {
          let val = 0;
          let s = 0;
          while (offset < end) {
            const b = data[offset++];
            val |= (b & 0x7f) << s;
            if ((b & 0x80) === 0) break;
            s += 7;
          }
          if (fn === 2) pid = val;
          else if (fn === 5) state = val;
        } else if (wt === 2) {
          let l = 0;
          let s = 0;
          while (offset < end) {
            const b = data[offset++];
            l |= (b & 0x7f) << s;
            if ((b & 0x80) === 0) break;
            s += 7;
          }
          const str = textDecoder.decode(data.subarray(offset, offset + l));
          offset += l;
          if (fn === 1) processId = str;
          else if (fn === 3) executable = str;
          else if (fn === 4) args.push(str);
          else if (fn === 6) owner = str;
        } else {
          break;
        }
      }

      processes.push({ processId, pid, executable, arguments: args, state, owner });
    } else {
      break;
    }
  }

  return processes;
}

export function encodeKillProcessRequest(processId: string, signal = 9): Uint8Array {
  return concat([
    encodeStringField(1, processId),
    encodeUintField(2, signal),
  ]);
}

export interface PtySessionInfo {
  ptyId: string;
  shell: string;
  cols: number;
  rows: number;
}

export function encodeAttachPtyRequest(ptyId: string): Uint8Array {
  return encodeStringField(1, ptyId);
}

export function decodeAttachPtyResponse(data: Uint8Array): { ptyId: string; backlog: Uint8Array } {
  let offset = 0;
  let ptyId = '';
  let backlog = new Uint8Array(0);
  const textDecoder = new TextDecoder();

  while (offset < data.byteLength) {
    const tag = data[offset++];
    const fieldNumber = tag >> 3;
    const wireType = tag & 0x07;

    if (wireType === 2) {
      let length = 0;
      let shift = 0;
      while (offset < data.byteLength) {
        const byte = data[offset++];
        length |= (byte & 0x7f) << shift;
        if ((byte & 0x80) === 0) break;
        shift += 7;
      }
      if (fieldNumber === 1) {
        ptyId = textDecoder.decode(data.subarray(offset, offset + length));
      } else if (fieldNumber === 2) {
        backlog = data.slice(offset, offset + length);
      }
      offset += length;
    } else {
      break;
    }
  }

  return { ptyId, backlog };
}

export function encodeListPtysRequest(): Uint8Array {
  return new Uint8Array(0);
}

export function decodeListPtysResponse(data: Uint8Array): PtySessionInfo[] {
  let offset = 0;
  const sessions: PtySessionInfo[] = [];
  const textDecoder = new TextDecoder();

  while (offset < data.byteLength) {
    const tag = data[offset++];
    const fieldNumber = tag >> 3;
    const wireType = tag & 0x07;

    if (fieldNumber === 1 && wireType === 2) {
      let length = 0;
      let shift = 0;
      while (offset < data.byteLength) {
        const byte = data[offset++];
        length |= (byte & 0x7f) << shift;
        if ((byte & 0x80) === 0) break;
        shift += 7;
      }

      const end = offset + length;
      let ptyId = '';
      let shell = '';
      let cols = 0;
      let rows = 0;

      while (offset < end) {
        const subTag = data[offset++];
        const fn = subTag >> 3;
        const wt = subTag & 0x07;

        if (wt === 0) {
          let val = 0;
          let s = 0;
          while (offset < end) {
            const b = data[offset++];
            val |= (b & 0x7f) << s;
            if ((b & 0x80) === 0) break;
            s += 7;
          }
          if (fn === 3) cols = val;
          else if (fn === 4) rows = val;
        } else if (wt === 2) {
          let l = 0;
          let s = 0;
          while (offset < end) {
            const b = data[offset++];
            l |= (b & 0x7f) << s;
            if ((b & 0x80) === 0) break;
            s += 7;
          }
          const str = textDecoder.decode(data.subarray(offset, offset + l));
          offset += l;
          if (fn === 1) ptyId = str;
          else if (fn === 2) shell = str;
        } else {
          break;
        }
      }

      sessions.push({ ptyId, shell, cols, rows });
    } else {
      break;
    }
  }

  return sessions;
}

export interface DockerContainer {
  id: string;
  name: string;
  image: string;
  state: string;
  status: string;
  createdAt: number;
  ports: string[];
}

export enum ContainerAction {
  Unspecified = 0,
  Start = 1,
  Stop = 2,
  Restart = 3,
}

export interface SystemService {
  name: string;
  description: string;
  loadState: string;
  activeState: string;
  subState: string;
}

export enum ServiceAction {
  Unspecified = 0,
  Start = 1,
  Stop = 2,
  Restart = 3,
}

export function encodeListContainersRequest(all = false): Uint8Array {
  return encodeUintField(1, all ? 1 : 0);
}

export function decodeListContainersResponse(data: Uint8Array): {
  containers: DockerContainer[];
  dockerAvailable: boolean;
} {
  let offset = 0;
  const containers: DockerContainer[] = [];
  let dockerAvailable = false;
  const textDecoder = new TextDecoder();

  while (offset < data.byteLength) {
    const tag = data[offset++];
    const fieldNumber = tag >> 3;
    const wireType = tag & 0x07;

    if (fieldNumber === 2 && wireType === 0) {
      let value = 0;
      let shift = 0;
      while (offset < data.byteLength) {
        const byte = data[offset++];
        value |= (byte & 0x7f) << shift;
        if ((byte & 0x80) === 0) break;
        shift += 7;
      }
      dockerAvailable = value !== 0;
    } else if (fieldNumber === 1 && wireType === 2) {
      let length = 0;
      let shift = 0;
      while (offset < data.byteLength) {
        const byte = data[offset++];
        length |= (byte & 0x7f) << shift;
        if ((byte & 0x80) === 0) break;
        shift += 7;
      }

      const end = offset + length;
      let id = '';
      let name = '';
      let image = '';
      let state = '';
      let status = '';
      let createdAt = 0;
      const ports: string[] = [];

      while (offset < end) {
        const itemTag = data[offset++];
        const fn = itemTag >> 3;
        const wt = itemTag & 0x07;

        if (wt === 0) {
          let val = 0;
          let s = 0;
          while (offset < end) {
            const b = data[offset++];
            val |= (b & 0x7f) << s;
            if ((b & 0x80) === 0) break;
            s += 7;
          }
          if (fn === 6) createdAt = val;
        } else if (wt === 2) {
          let l = 0;
          let s = 0;
          while (offset < end) {
            const b = data[offset++];
            l |= (b & 0x7f) << s;
            if ((b & 0x80) === 0) break;
            s += 7;
          }
          const str = textDecoder.decode(data.subarray(offset, offset + l));
          offset += l;
          if (fn === 1) id = str;
          else if (fn === 2) name = str;
          else if (fn === 3) image = str;
          else if (fn === 4) state = str;
          else if (fn === 5) status = str;
          else if (fn === 7) ports.push(str);
        } else {
          break;
        }
      }

      containers.push({ id, name, image, state, status, createdAt, ports });
    } else {
      break;
    }
  }

  return { containers, dockerAvailable };
}

export function encodeManageContainerRequest(
  containerId: string,
  action: ContainerAction
): Uint8Array {
  return concat([encodeStringField(1, containerId), encodeUintField(2, action)]);
}

export function decodeManageContainerResponse(data: Uint8Array): {
  success: boolean;
  message: string;
} {
  let offset = 0;
  let success = false;
  let message = '';
  const textDecoder = new TextDecoder();

  while (offset < data.byteLength) {
    const tag = data[offset++];
    const fieldNumber = tag >> 3;
    const wireType = tag & 0x07;

    if (wireType === 0) {
      let value = 0;
      let shift = 0;
      while (offset < data.byteLength) {
        const byte = data[offset++];
        value |= (byte & 0x7f) << shift;
        if ((byte & 0x80) === 0) break;
        shift += 7;
      }
      if (fieldNumber === 1) success = value !== 0;
    } else if (wireType === 2) {
      let length = 0;
      let shift = 0;
      while (offset < data.byteLength) {
        const byte = data[offset++];
        length |= (byte & 0x7f) << shift;
        if ((byte & 0x80) === 0) break;
        shift += 7;
      }
      if (fieldNumber === 2) {
        message = textDecoder.decode(data.subarray(offset, offset + length));
      }
      offset += length;
    } else {
      break;
    }
  }

  return { success, message };
}

export function encodeContainerLogsRequest(containerId: string, tail = 100): Uint8Array {
  return concat([encodeStringField(1, containerId), encodeUintField(2, tail)]);
}

export function decodeContainerLogsResponse(data: Uint8Array): { logs: string } {
  let offset = 0;
  let logs = '';
  const textDecoder = new TextDecoder();

  while (offset < data.byteLength) {
    const tag = data[offset++];
    const fieldNumber = tag >> 3;
    const wireType = tag & 0x07;

    if (wireType === 2) {
      let length = 0;
      let shift = 0;
      while (offset < data.byteLength) {
        const byte = data[offset++];
        length |= (byte & 0x7f) << shift;
        if ((byte & 0x80) === 0) break;
        shift += 7;
      }
      if (fieldNumber === 1) {
        logs = textDecoder.decode(data.subarray(offset, offset + length));
      }
      offset += length;
    } else {
      break;
    }
  }

  return { logs };
}

export function encodeListServicesRequest(): Uint8Array {
  return new Uint8Array(0);
}

export function decodeListServicesResponse(data: Uint8Array): {
  services: SystemService[];
  systemdAvailable: boolean;
} {
  let offset = 0;
  const services: SystemService[] = [];
  let systemdAvailable = false;
  const textDecoder = new TextDecoder();

  while (offset < data.byteLength) {
    const tag = data[offset++];
    const fieldNumber = tag >> 3;
    const wireType = tag & 0x07;

    if (fieldNumber === 2 && wireType === 0) {
      let value = 0;
      let shift = 0;
      while (offset < data.byteLength) {
        const byte = data[offset++];
        value |= (byte & 0x7f) << shift;
        if ((byte & 0x80) === 0) break;
        shift += 7;
      }
      systemdAvailable = value !== 0;
    } else if (fieldNumber === 1 && wireType === 2) {
      let length = 0;
      let shift = 0;
      while (offset < data.byteLength) {
        const byte = data[offset++];
        length |= (byte & 0x7f) << shift;
        if ((byte & 0x80) === 0) break;
        shift += 7;
      }

      const end = offset + length;
      let name = '';
      let description = '';
      let loadState = '';
      let activeState = '';
      let subState = '';

      while (offset < end) {
        const itemTag = data[offset++];
        const fn = itemTag >> 3;
        const wt = itemTag & 0x07;

        if (wt === 2) {
          let l = 0;
          let s = 0;
          while (offset < end) {
            const b = data[offset++];
            l |= (b & 0x7f) << s;
            if ((b & 0x80) === 0) break;
            s += 7;
          }
          const str = textDecoder.decode(data.subarray(offset, offset + l));
          offset += l;
          if (fn === 1) name = str;
          else if (fn === 2) description = str;
          else if (fn === 3) loadState = str;
          else if (fn === 4) activeState = str;
          else if (fn === 5) subState = str;
        } else {
          break;
        }
      }

      services.push({ name, description, loadState, activeState, subState });
    } else {
      break;
    }
  }

  return { services, systemdAvailable };
}

export function encodeManageServiceRequest(serviceName: string, action: ServiceAction): Uint8Array {
  return concat([encodeStringField(1, serviceName), encodeUintField(2, action)]);
}

export function decodeManageServiceResponse(data: Uint8Array): {
  success: boolean;
  message: string;
} {
  return decodeManageContainerResponse(data);
}

export interface LinuxApp {
  appId: string;
  name: string;
  genericName: string;
  comment: string;
  icon: string;
  exec: string;
  categories: string[];
  isTerminal: boolean;
}

export interface LaunchAppResponsePayload {
  surfaceId: string;
  processId: string;
  state: string;
}

export interface RemoteSurfaceInfo {
  surfaceId: string;
  appId: string;
  title: string;
  width: number;
  height: number;
  backend: string;
  state: string;
}

export function encodeListAppsRequest(): Uint8Array {
  return new Uint8Array(0);
}

export function decodeListAppsResponse(data: Uint8Array): LinuxApp[] {
  const apps: LinuxApp[] = [];
  let offset = 0;

  while (offset < data.byteLength) {
    const tag = data[offset++];
    const fieldNumber = tag >> 3;
    const wireType = tag & 0x07;

    if (fieldNumber === 1 && wireType === 2) {
      let length = 0;
      let shift = 0;
      while (offset < data.byteLength) {
        const byte = data[offset++];
        length |= (byte & 0x7f) << shift;
        if ((byte & 0x80) === 0) break;
        shift += 7;
      }

      const end = offset + length;
      let appId = '';
      let name = '';
      let genericName = '';
      let comment = '';
      let icon = '';
      let exec = '';
      const categories: string[] = [];
      let isTerminal = false;

      while (offset < end) {
        const itemTag = data[offset++];
        const fn = itemTag >> 3;
        const wt = itemTag & 0x07;

        if (wt === 2) {
          let l = 0;
          let s = 0;
          while (offset < end) {
            const b = data[offset++];
            l |= (b & 0x7f) << s;
            if ((b & 0x80) === 0) break;
            s += 7;
          }
          const str = textDecoder.decode(data.subarray(offset, offset + l));
          offset += l;
          if (fn === 1) appId = str;
          else if (fn === 2) name = str;
          else if (fn === 3) genericName = str;
          else if (fn === 4) comment = str;
          else if (fn === 5) icon = str;
          else if (fn === 6) exec = str;
          else if (fn === 7) categories.push(str);
        } else if (wt === 0) {
          let val = 0;
          let s = 0;
          while (offset < end) {
            const b = data[offset++];
            val |= (b & 0x7f) << s;
            if ((b & 0x80) === 0) break;
            s += 7;
          }
          if (fn === 8) isTerminal = val !== 0;
        } else {
          break;
        }
      }

      apps.push({
        appId,
        name,
        genericName,
        comment,
        icon,
        exec,
        categories,
        isTerminal,
      });
    } else {
      break;
    }
  }

  return apps;
}

export function encodeLaunchAppRequest(req: {
  appId: string;
  exec?: string;
  args?: string[];
  workingDirectory?: string;
}): Uint8Array {
  const parts: Uint8Array[] = [encodeStringField(1, req.appId)];
  if (req.exec) {
    parts.push(encodeStringField(2, req.exec));
  }
  if (req.args) {
    for (const arg of req.args) {
      parts.push(encodeStringField(3, arg));
    }
  }
  if (req.workingDirectory) {
    parts.push(encodeStringField(4, req.workingDirectory));
  }
  return concat(parts);
}

export function decodeLaunchAppResponse(data: Uint8Array): LaunchAppResponsePayload {
  let surfaceId = '';
  let processId = '';
  let state = '';
  let offset = 0;

  while (offset < data.byteLength) {
    const tag = data[offset++];
    const fieldNumber = tag >> 3;
    const wireType = tag & 0x07;

    if (wireType === 2) {
      let length = 0;
      let shift = 0;
      while (offset < data.byteLength) {
        const byte = data[offset++];
        length |= (byte & 0x7f) << shift;
        if ((byte & 0x80) === 0) break;
        shift += 7;
      }
      const str = textDecoder.decode(data.subarray(offset, offset + length));
      offset += length;
      if (fieldNumber === 1) surfaceId = str;
      else if (fieldNumber === 2) processId = str;
      else if (fieldNumber === 3) state = str;
    } else {
      break;
    }
  }

  return { surfaceId, processId, state };
}

export function encodeCloseSurfaceRequest(surfaceId: string): Uint8Array {
  return encodeStringField(1, surfaceId);
}

export function decodeCloseSurfaceResponse(data: Uint8Array): boolean {
  let success = false;
  let offset = 0;
  while (offset < data.byteLength) {
    const tag = data[offset++];
    const fieldNumber = tag >> 3;
    const wireType = tag & 0x07;

    if (fieldNumber === 1 && wireType === 0) {
      let val = 0;
      let shift = 0;
      while (offset < data.byteLength) {
        const byte = data[offset++];
        val |= (byte & 0x7f) << shift;
        if ((byte & 0x80) === 0) break;
        shift += 7;
      }
      success = val !== 0;
    } else {
      break;
    }
  }
  return success;
}

export interface GpuDevicePayload {
  gpuId: string;
  name: string;
  vendor: string;
  driverVersion: string;
  memoryTotalBytes: number;
  memoryUsedBytes: number;
  temperatureCelsius: number;
  utilizationPercent: number;
  supportedEncoders: string[];
}

export interface GetGpuInfoResponsePayload {
  gpuAvailable: boolean;
  devices: GpuDevicePayload[];
  defaultEncoder: string;
}

export interface StartGpuStreamRequestPayload {
  gpuId: string;
  width?: number;
  height?: number;
  targetFps?: number;
  codec?: string;
  bitrateKbps?: number;
}

export interface StartGpuStreamResponsePayload {
  streamId: string;
  activeEncoder: string;
  actualFps: number;
  streamEndpoint: string;
}

export interface GpuStreamStatsPayload {
  streamId: string;
  currentFps: number;
  bitrateKbps: number;
  rttMs: number;
  frameLossPercent: number;
}

export function encodeGetGpuInfoRequest(): Uint8Array {
  return new Uint8Array(0);
}

export function decodeGetGpuInfoResponse(data: Uint8Array): GetGpuInfoResponsePayload {
  let gpuAvailable = false;
  let defaultEncoder = '';
  const devices: GpuDevicePayload[] = [];
  let offset = 0;

  while (offset < data.byteLength) {
    const tag = data[offset++];
    const fieldNumber = tag >> 3;
    const wireType = tag & 0x07;

    if (fieldNumber === 1 && wireType === 0) {
      let val = 0;
      let shift = 0;
      while (offset < data.byteLength) {
        const byte = data[offset++];
        val |= (byte & 0x7f) << shift;
        if ((byte & 0x80) === 0) break;
        shift += 7;
      }
      gpuAvailable = val !== 0;
    } else if (fieldNumber === 3 && wireType === 2) {
      let length = 0;
      let shift = 0;
      while (offset < data.byteLength) {
        const byte = data[offset++];
        length |= (byte & 0x7f) << shift;
        if ((byte & 0x80) === 0) break;
        shift += 7;
      }
      defaultEncoder = textDecoder.decode(data.subarray(offset, offset + length));
      offset += length;
    } else if (fieldNumber === 2 && wireType === 2) {
      let length = 0;
      let shift = 0;
      while (offset < data.byteLength) {
        const byte = data[offset++];
        length |= (byte & 0x7f) << shift;
        if ((byte & 0x80) === 0) break;
        shift += 7;
      }
      const end = offset + length;
      let gpuId = '';
      let name = '';
      let vendor = '';
      let driverVersion = '';
      let memoryTotalBytes = 0;
      let memoryUsedBytes = 0;
      let temperatureCelsius = 0;
      let utilizationPercent = 0;
      const supportedEncoders: string[] = [];

      while (offset < end) {
        const itemTag = data[offset++];
        const fn = itemTag >> 3;
        const wt = itemTag & 0x07;

        if (wt === 2) {
          let l = 0;
          let s = 0;
          while (offset < end) {
            const b = data[offset++];
            l |= (b & 0x7f) << s;
            if ((b & 0x80) === 0) break;
            s += 7;
          }
          const str = textDecoder.decode(data.subarray(offset, offset + l));
          offset += l;
          if (fn === 1) gpuId = str;
          else if (fn === 2) name = str;
          else if (fn === 3) vendor = str;
          else if (fn === 4) driverVersion = str;
          else if (fn === 9) supportedEncoders.push(str);
        } else if (wt === 0) {
          let val = 0;
          let s = 0;
          while (offset < end) {
            const b = data[offset++];
            val |= (b & 0x7f) << s;
            if ((b & 0x80) === 0) break;
            s += 7;
          }
          if (fn === 5) memoryTotalBytes = val;
          else if (fn === 6) memoryUsedBytes = val;
          else if (fn === 7) temperatureCelsius = val;
          else if (fn === 8) utilizationPercent = val;
        } else {
          break;
        }
      }

      devices.push({
        gpuId,
        name,
        vendor,
        driverVersion,
        memoryTotalBytes,
        memoryUsedBytes,
        temperatureCelsius,
        utilizationPercent,
        supportedEncoders,
      });
    } else {
      break;
    }
  }

  return { gpuAvailable, devices, defaultEncoder };
}

export function encodeStartGpuStreamRequest(req: StartGpuStreamRequestPayload): Uint8Array {
  const parts: Uint8Array[] = [encodeStringField(1, req.gpuId)];
  if (req.width !== undefined) parts.push(encodeUintField(2, req.width));
  if (req.height !== undefined) parts.push(encodeUintField(3, req.height));
  if (req.targetFps !== undefined) parts.push(encodeUintField(4, req.targetFps));
  if (req.codec) parts.push(encodeStringField(5, req.codec));
  if (req.bitrateKbps !== undefined) parts.push(encodeUintField(6, req.bitrateKbps));
  return concat(parts);
}

export function decodeStartGpuStreamResponse(data: Uint8Array): StartGpuStreamResponsePayload {
  let streamId = '';
  let activeEncoder = '';
  let actualFps = 0;
  let streamEndpoint = '';
  let offset = 0;

  while (offset < data.byteLength) {
    const tag = data[offset++];
    const fieldNumber = tag >> 3;
    const wireType = tag & 0x07;

    if (wireType === 2) {
      let length = 0;
      let shift = 0;
      while (offset < data.byteLength) {
        const byte = data[offset++];
        length |= (byte & 0x7f) << shift;
        if ((byte & 0x80) === 0) break;
        shift += 7;
      }
      const str = textDecoder.decode(data.subarray(offset, offset + length));
      offset += length;
      if (fieldNumber === 1) streamId = str;
      else if (fieldNumber === 2) activeEncoder = str;
      else if (fieldNumber === 4) streamEndpoint = str;
    } else if (wireType === 0) {
      let val = 0;
      let shift = 0;
      while (offset < data.byteLength) {
        const byte = data[offset++];
        val |= (byte & 0x7f) << shift;
        if ((byte & 0x80) === 0) break;
        shift += 7;
      }
      if (fieldNumber === 3) actualFps = val;
    } else {
      break;
    }
  }

  return { streamId, activeEncoder, actualFps, streamEndpoint };
}

export function encodeStopGpuStreamRequest(streamId: string): Uint8Array {
  return encodeStringField(1, streamId);
}

export function decodeStopGpuStreamResponse(data: Uint8Array): boolean {
  return decodeCloseSurfaceResponse(data);
}

export function encodeGpuStreamStatsRequest(streamId: string): Uint8Array {
  return encodeStringField(1, streamId);
}

export function decodeGpuStreamStats(data: Uint8Array): GpuStreamStatsPayload {
  let streamId = '';
  let currentFps = 0;
  let bitrateKbps = 0;
  let rttMs = 0;
  let frameLossPercent = 0;
  let offset = 0;

  while (offset < data.byteLength) {
    const tag = data[offset++];
    const fieldNumber = tag >> 3;
    const wireType = tag & 0x07;

    if (wireType === 2) {
      let length = 0;
      let shift = 0;
      while (offset < data.byteLength) {
        const byte = data[offset++];
        length |= (byte & 0x7f) << shift;
        if ((byte & 0x80) === 0) break;
        shift += 7;
      }
      const str = textDecoder.decode(data.subarray(offset, offset + length));
      offset += length;
      if (fieldNumber === 1) streamId = str;
    } else if (wireType === 0) {
      let val = 0;
      let shift = 0;
      while (offset < data.byteLength) {
        const byte = data[offset++];
        val |= (byte & 0x7f) << shift;
        if ((byte & 0x80) === 0) break;
        shift += 7;
      }
      if (fieldNumber === 2) currentFps = val;
      else if (fieldNumber === 3) bitrateKbps = val;
      else if (fieldNumber === 4) rttMs = val;
    } else if (wireType === 5) {
      if (offset + 4 <= data.byteLength) {
        const view = new DataView(data.buffer, data.byteOffset + offset, 4);
        frameLossPercent = view.getFloat32(0, true);
        offset += 4;
      } else {
        break;
      }
    } else {
      break;
    }
  }

  return { streamId, currentFps, bitrateKbps, rttMs, frameLossPercent };
}





