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


