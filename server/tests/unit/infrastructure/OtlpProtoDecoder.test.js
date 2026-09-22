const OtlpProtoDecoder = require('../../../src/infrastructure/otlp/OtlpProtoDecoder');

/**
 * Minimal protobuf builder to construct test binary buffers without external dependencies.
 */
class ProtoBuilder {
  constructor() {
    this.parts = [];
  }

  writeVarint(fieldNumber, value) {
    this.writeTag(fieldNumber, 0);
    this.appendVarint(BigInt(value));
    return this;
  }

  writeFixed64(fieldNumber, bigIntValue) {
    this.writeTag(fieldNumber, 1);
    const buf = Buffer.alloc(8);
    buf.writeBigUInt64LE(BigInt(bigIntValue), 0);
    this.parts.push(buf);
    return this;
  }

  writeDouble(fieldNumber, doubleValue) {
    this.writeTag(fieldNumber, 1);
    const buf = Buffer.alloc(8);
    buf.writeDoubleLE(doubleValue, 0);
    this.parts.push(buf);
    return this;
  }

  writeFixed32(fieldNumber, uint32Value) {
    this.writeTag(fieldNumber, 5);
    const buf = Buffer.alloc(4);
    buf.writeUInt32LE(uint32Value, 0);
    this.parts.push(buf);
    return this;
  }

  writeBytes(fieldNumber, buffer) {
    this.writeTag(fieldNumber, 2);
    const b = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
    this.appendVarint(BigInt(b.length));
    this.parts.push(b);
    return this;
  }

  writeString(fieldNumber, str) {
    return this.writeBytes(fieldNumber, Buffer.from(str, 'utf8'));
  }

  writeMessage(fieldNumber, builder) {
    return this.writeBytes(fieldNumber, builder.toBuffer());
  }

  writeTag(fieldNumber, wireType) {
    const tag = (BigInt(fieldNumber) << 3n) | BigInt(wireType);
    this.appendVarint(tag);
  }

  appendVarint(val) {
    let v = BigInt(val);
    const bytes = [];
    while (v >= 0x80n) {
      bytes.push(Number((v & 0x7fn) | 0x80n));
      v >>= 7n;
    }
    bytes.push(Number(v & 0x7fn));
    this.parts.push(Buffer.from(bytes));
  }

  toBuffer() {
    return Buffer.concat(this.parts);
  }
}

describe('OtlpProtoDecoder', () => {
  it('should decode an empty buffer gracefully', () => {
    const res = OtlpProtoDecoder.decode(Buffer.alloc(0));
    expect(res).toEqual({ resourceSpans: [] });
  });

  it('should decode a complete ExportTraceServiceRequest with ResourceSpans, ScopeSpans, and Span', () => {
    // 1. AnyValue for service.name
    const serviceNameValue = new ProtoBuilder().writeString(1, 'payment-gateway');
    const serviceNameAttr = new ProtoBuilder()
      .writeString(1, 'service.name')
      .writeMessage(2, serviceNameValue);

    // 2. Resource
    const resource = new ProtoBuilder()
      .writeMessage(1, serviceNameAttr);

    // 3. Span attribute (http.status_code = 200)
    const statusCodeVal = new ProtoBuilder().writeVarint(3, 200);
    const statusAttr = new ProtoBuilder()
      .writeString(1, 'http.status_code')
      .writeMessage(2, statusCodeVal);

    // 4. Status
    const status = new ProtoBuilder()
      .writeString(2, 'OK')
      .writeVarint(3, 1);

    // 5. Span
    const traceId = Buffer.from('0123456789abcdef0123456789abcdef', 'hex'); // 16 bytes
    const spanId = Buffer.from('fedcba9876543210', 'hex'); // 8 bytes

    const span = new ProtoBuilder()
      .writeBytes(1, traceId)
      .writeBytes(2, spanId)
      .writeString(5, 'POST /charge')
      .writeVarint(6, 2) // SERVER
      .writeFixed64(7, 1726999999000000000n)
      .writeFixed64(8, 1726999999050000000n)
      .writeMessage(9, statusAttr)
      .writeMessage(15, status);

    // 6. ScopeSpans
    const scope = new ProtoBuilder()
      .writeString(1, 'express')
      .writeString(2, '4.18.2');

    const scopeSpans = new ProtoBuilder()
      .writeMessage(1, scope)
      .writeMessage(2, span);

    // 7. ResourceSpans
    const resourceSpans = new ProtoBuilder()
      .writeMessage(1, resource)
      .writeMessage(2, scopeSpans);

    // 8. Root request
    const request = new ProtoBuilder()
      .writeMessage(1, resourceSpans);

    const decoded = OtlpProtoDecoder.decode(request.toBuffer());

    expect(decoded.resourceSpans).toHaveLength(1);
    const rs = decoded.resourceSpans[0];
    expect(rs.resource.attributes).toHaveLength(1);
    expect(rs.resource.attributes[0].key).toBe('service.name');
    expect(rs.resource.attributes[0].value.stringValue).toBe('payment-gateway');

    expect(rs.scopeSpans).toHaveLength(1);
    const ss = rs.scopeSpans[0];
    expect(ss.scope.name).toBe('express');
    expect(ss.spans).toHaveLength(1);

    const s = ss.spans[0];
    expect(s.traceId).toBe('0123456789abcdef0123456789abcdef');
    expect(s.spanId).toBe('fedcba9876543210');
    expect(s.name).toBe('POST /charge');
    expect(s.kind).toBe(2);
    expect(s.startTimeUnixNano).toBe('1726999999000000000');
    expect(s.endTimeUnixNano).toBe('1726999999050000000');
    expect(s.attributes).toHaveLength(1);
    expect(s.attributes[0].key).toBe('http.status_code');
    expect(s.attributes[0].value.intValue).toBe(200);
    expect(s.status.code).toBe(1);
    expect(s.status.message).toBe('OK');
  });

  it('should safely skip unknown fields without corrupting decoding', () => {
    // Add unknown fields of all wire types (0, 1, 2, 5)
    const resource = new ProtoBuilder()
      .writeVarint(99, 12345) // unknown varint
      .writeFixed64(98, 987654321n) // unknown 64-bit
      .writeString(97, 'unknown string') // unknown length-delimited
      .writeFixed32(96, 42) // unknown 32-bit
      .writeMessage(1, new ProtoBuilder() // known attribute
        .writeString(1, 'service.name')
        .writeMessage(2, new ProtoBuilder().writeString(1, 'robust-service'))
      );

    const rs = new ProtoBuilder()
      .writeVarint(55, 999) // unknown field in ResourceSpans
      .writeMessage(1, resource);

    const req = new ProtoBuilder()
      .writeVarint(88, 1) // unknown field in root message
      .writeMessage(1, rs);

    const decoded = OtlpProtoDecoder.decode(req.toBuffer());
    expect(decoded.resourceSpans).toHaveLength(1);
    expect(decoded.resourceSpans[0].resource.attributes[0].key).toBe('service.name');
    expect(decoded.resourceSpans[0].resource.attributes[0].value.stringValue).toBe('robust-service');
  });

  it('should handle arbitrary field ordering', () => {
    // Span fields written in reverse order: status (15), attributes (9), kind (6), name (5), spanId (2), traceId (1)
    const span = new ProtoBuilder()
      .writeMessage(15, new ProtoBuilder().writeVarint(3, 2))
      .writeVarint(6, 1)
      .writeString(5, 'reverse_order_test')
      .writeBytes(2, Buffer.from('1122334455667788', 'hex'))
      .writeBytes(1, Buffer.from('aabbccddeeff00112233445566778899', 'hex'));

    const ss = new ProtoBuilder().writeMessage(2, span);
    const rs = new ProtoBuilder().writeMessage(2, ss);
    const req = new ProtoBuilder().writeMessage(1, rs);

    const decoded = OtlpProtoDecoder.decode(req.toBuffer());
    const s = decoded.resourceSpans[0].scopeSpans[0].spans[0];
    expect(s.name).toBe('reverse_order_test');
    expect(s.traceId).toBe('aabbccddeeff00112233445566778899');
    expect(s.spanId).toBe('1122334455667788');
    expect(s.kind).toBe(1);
    expect(s.status.code).toBe(2);
  });

  it('should decode repeated fields: multiple ResourceSpans, ScopeSpans, and Spans', () => {
    const span1 = new ProtoBuilder().writeString(5, 'span-1');
    const span2 = new ProtoBuilder().writeString(5, 'span-2');
    const ss1 = new ProtoBuilder().writeMessage(2, span1).writeMessage(2, span2);

    const span3 = new ProtoBuilder().writeString(5, 'span-3');
    const ss2 = new ProtoBuilder().writeMessage(2, span3);

    const rs1 = new ProtoBuilder().writeMessage(2, ss1);
    const rs2 = new ProtoBuilder().writeMessage(2, ss2);

    const req = new ProtoBuilder()
      .writeMessage(1, rs1)
      .writeMessage(1, rs2);

    const decoded = OtlpProtoDecoder.decode(req.toBuffer());
    expect(decoded.resourceSpans).toHaveLength(2);
    expect(decoded.resourceSpans[0].scopeSpans[0].spans).toHaveLength(2);
    expect(decoded.resourceSpans[1].scopeSpans[0].spans).toHaveLength(1);
  });

  it('should decode all AnyValue types: bool, double, bytes, array, kvlist', () => {
    const anyBool = new ProtoBuilder().writeVarint(2, 1);
    const anyDouble = new ProtoBuilder().writeDouble(4, 3.14159);
    const anyBytes = new ProtoBuilder().writeBytes(7, Buffer.from('hello bytes'));
    const anyArray = new ProtoBuilder().writeMessage(5, new ProtoBuilder()
      .writeMessage(1, new ProtoBuilder().writeString(1, 'elem1'))
      .writeMessage(1, new ProtoBuilder().writeString(1, 'elem2'))
    );

    const span = new ProtoBuilder()
      .writeString(5, 'anyvalue_test')
      .writeMessage(9, new ProtoBuilder().writeString(1, 'attr_bool').writeMessage(2, anyBool))
      .writeMessage(9, new ProtoBuilder().writeString(1, 'attr_double').writeMessage(2, anyDouble))
      .writeMessage(9, new ProtoBuilder().writeString(1, 'attr_bytes').writeMessage(2, anyBytes))
      .writeMessage(9, new ProtoBuilder().writeString(1, 'attr_array').writeMessage(2, anyArray));

    const req = new ProtoBuilder().writeMessage(1, new ProtoBuilder().writeMessage(2, new ProtoBuilder().writeMessage(2, span)));
    const decoded = OtlpProtoDecoder.decode(req.toBuffer());
    const attrs = decoded.resourceSpans[0].scopeSpans[0].spans[0].attributes;

    expect(attrs[0].key).toBe('attr_bool');
    expect(attrs[0].value.boolValue).toBe(true);

    expect(attrs[1].key).toBe('attr_double');
    expect(attrs[1].value.doubleValue).toBeCloseTo(3.14159);

    expect(attrs[2].key).toBe('attr_bytes');
    expect(attrs[2].value.bytesValue).toBe(Buffer.from('hello bytes').toString('base64'));

    expect(attrs[3].key).toBe('attr_array');
    expect(attrs[3].value.arrayValue.values).toHaveLength(2);
    expect(attrs[3].value.arrayValue.values[0].stringValue).toBe('elem1');
  });

  it('should throw on truncated buffer (unexpected EOF)', () => {
    // Length-delimited string that says length=20 but buffer only has 5 bytes
    const tag = (BigInt(1) << 3n) | 2n; // field 1, wire type 2
    const buf = Buffer.from([Number(tag), 20, 0x61, 0x62, 0x63]); // only 3 bytes instead of 20

    expect(() => OtlpProtoDecoder.decode(buf)).toThrow(/Truncated buffer/);
  });

  it('should throw on invalid wire type', () => {
    // Tag with wire type 3 (deprecated group)
    const tag = (BigInt(1) << 3n) | 3n;
    const buf = Buffer.from([Number(tag), 0x01]);

    expect(() => OtlpProtoDecoder.decode(buf)).toThrow(/Invalid protobuf wire type/);
  });

  it('should throw on malformed varint (>10 bytes)', () => {
    // 12 consecutive bytes with MSB set (0x80)
    const buf = Buffer.from([0x80, 0x80, 0x80, 0x80, 0x80, 0x80, 0x80, 0x80, 0x80, 0x80, 0x80, 0x80]);

    expect(() => OtlpProtoDecoder.decode(buf)).toThrow(/Malformed varint/);
  });
});
