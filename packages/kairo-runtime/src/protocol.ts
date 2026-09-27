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

export function encodeHandshakeInit(payload: HandshakeInitPayload): Uint8Array {
  const parts: Uint8Array[] = [];

  // Field 1: protocol_version (uint32, tag = (1 << 3) | 0 = 0x08)
  parts.push(new Uint8Array([0x08, payload.protocolVersion & 0x7f]));

  // Field 2: client_id (string, tag = (2 << 3) | 2 = 0x12)
  const clientBytes = new TextEncoder().encode(payload.clientId);
  parts.push(new Uint8Array([0x12, clientBytes.byteLength]));
  parts.push(clientBytes);

  const totalLength = parts.reduce((acc, p) => acc + p.byteLength, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.byteLength;
  }
  return result;
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
      // Varint
      let value = 0;
      let shift = 0;
      while (offset < data.byteLength) {
        const byte = data[offset++];
        value |= (byte & 0x7f) << shift;
        if ((byte & 0x80) === 0) break;
        shift += 7;
      }
      if (fieldNumber === 1) {
        protocolVersion = value;
      }
    } else if (wireType === 2) {
      // Length-delimited
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

      if (fieldNumber === 2) {
        agentId = str;
      } else if (fieldNumber === 3) {
        sessionId = str;
      } else if (fieldNumber === 4) {
        capabilities.push(str);
      }
    } else {
      // Skip unknown wire types
      break;
    }
  }

  return {
    protocolVersion,
    agentId,
    sessionId,
    capabilities,
  };
}
