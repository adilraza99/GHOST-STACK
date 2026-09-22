/**
 * OtlpProtoDecoder
 *
 * Lightweight, zero-dependency proto3 binary decoder for OTLP
 * ExportTraceServiceRequest payloads.
 *
 * Adheres strictly to the protobuf wire format specification:
 * - Wire Type 0: Varint (int32, int64, uint32, uint64, bool, enum)
 * - Wire Type 1: 64-bit (fixed64, double)
 * - Wire Type 2: Length-delimited (string, bytes, embedded message)
 * - Wire Type 5: 32-bit (fixed32, float)
 *
 * Safely skips unknown fields, supports arbitrary field ordering,
 * handles repeated fields, and validates buffer boundaries.
 */
class OtlpProtoDecoder {
  /**
   * Decodes an ExportTraceServiceRequest binary protobuf buffer into an object
   * matching the OTLP JSON structure: { resourceSpans: [...] }.
   *
   * @param {Buffer|Uint8Array} buffer
   * @returns {{ resourceSpans: Array<object> }}
   */
  static decode(buffer) {
    if (!buffer || buffer.length === 0) {
      return { resourceSpans: [] };
    }

    const buf = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
    const reader = new ProtoReader(buf);
    const resourceSpans = [];

    while (reader.hasMore()) {
      const { fieldNumber, wireType } = reader.readTag();

      // Field 1: repeated ResourceSpans resource_spans
      if (fieldNumber === 1 && wireType === 2) {
        const spanSlice = reader.readBytes();
        resourceSpans.push(this.decodeResourceSpans(spanSlice));
      } else {
        reader.skip(wireType);
      }
    }

    return { resourceSpans };
  }

  static decodeResourceSpans(buffer) {
    const reader = new ProtoReader(buffer);
    const result = {
      resource: null,
      scopeSpans: [],
    };

    while (reader.hasMore()) {
      const { fieldNumber, wireType } = reader.readTag();

      if (fieldNumber === 1 && wireType === 2) {
        result.resource = this.decodeResource(reader.readBytes());
      } else if (fieldNumber === 2 && wireType === 2) {
        result.scopeSpans.push(this.decodeScopeSpans(reader.readBytes()));
      } else {
        reader.skip(wireType);
      }
    }

    return result;
  }

  static decodeResource(buffer) {
    const reader = new ProtoReader(buffer);
    const attributes = [];

    while (reader.hasMore()) {
      const { fieldNumber, wireType } = reader.readTag();

      if (fieldNumber === 1 && wireType === 2) {
        attributes.push(this.decodeKeyValue(reader.readBytes()));
      } else {
        reader.skip(wireType);
      }
    }

    return { attributes };
  }

  static decodeScopeSpans(buffer) {
    const reader = new ProtoReader(buffer);
    const result = {
      scope: null,
      spans: [],
    };

    while (reader.hasMore()) {
      const { fieldNumber, wireType } = reader.readTag();

      if (fieldNumber === 1 && wireType === 2) {
        result.scope = this.decodeScope(reader.readBytes());
      } else if (fieldNumber === 2 && wireType === 2) {
        result.spans.push(this.decodeSpan(reader.readBytes()));
      } else {
        reader.skip(wireType);
      }
    }

    return result;
  }

  static decodeScope(buffer) {
    const reader = new ProtoReader(buffer);
    const scope = { name: '', version: '' };

    while (reader.hasMore()) {
      const { fieldNumber, wireType } = reader.readTag();

      if (fieldNumber === 1 && wireType === 2) {
        scope.name = reader.readString();
      } else if (fieldNumber === 2 && wireType === 2) {
        scope.version = reader.readString();
      } else {
        reader.skip(wireType);
      }
    }

    return scope;
  }

  static decodeSpan(buffer) {
    const reader = new ProtoReader(buffer);
    const span = {
      traceId: '',
      spanId: '',
      parentSpanId: '',
      name: '',
      kind: 0,
      startTimeUnixNano: '0',
      endTimeUnixNano: '0',
      attributes: [],
      status: null,
    };

    while (reader.hasMore()) {
      const { fieldNumber, wireType } = reader.readTag();

      switch (fieldNumber) {
        case 1: // trace_id (bytes, 16 bytes)
          if (wireType === 2) {
            span.traceId = reader.readBytes().toString('hex');
          } else reader.skip(wireType);
          break;
        case 2: // span_id (bytes, 8 bytes)
          if (wireType === 2) {
            span.spanId = reader.readBytes().toString('hex');
          } else reader.skip(wireType);
          break;
        case 4: // parent_span_id (bytes, 8 bytes)
          if (wireType === 2) {
            span.parentSpanId = reader.readBytes().toString('hex');
          } else reader.skip(wireType);
          break;
        case 5: // name (string)
          if (wireType === 2) {
            span.name = reader.readString();
          } else reader.skip(wireType);
          break;
        case 6: // kind (enum varint)
          if (wireType === 0) {
            span.kind = Number(reader.readVarint());
          } else reader.skip(wireType);
          break;
        case 7: // start_time_unix_nano (fixed64)
          if (wireType === 1) {
            span.startTimeUnixNano = reader.readFixed64().toString();
          } else reader.skip(wireType);
          break;
        case 8: // end_time_unix_nano (fixed64)
          if (wireType === 1) {
            span.endTimeUnixNano = reader.readFixed64().toString();
          } else reader.skip(wireType);
          break;
        case 9: // attributes (repeated KeyValue)
          if (wireType === 2) {
            span.attributes.push(this.decodeKeyValue(reader.readBytes()));
          } else reader.skip(wireType);
          break;
        case 15: // status (Status)
          if (wireType === 2) {
            span.status = this.decodeStatus(reader.readBytes());
          } else reader.skip(wireType);
          break;
        default:
          reader.skip(wireType);
      }
    }

    return span;
  }

  static decodeStatus(buffer) {
    const reader = new ProtoReader(buffer);
    const status = { code: 0, message: '' };

    while (reader.hasMore()) {
      const { fieldNumber, wireType } = reader.readTag();

      if (fieldNumber === 2 && wireType === 2) {
        status.message = reader.readString();
      } else if (fieldNumber === 3 && wireType === 0) {
        status.code = Number(reader.readVarint());
      } else {
        reader.skip(wireType);
      }
    }

    return status;
  }

  static decodeKeyValue(buffer) {
    const reader = new ProtoReader(buffer);
    let key = '';
    let value = null;

    while (reader.hasMore()) {
      const { fieldNumber, wireType } = reader.readTag();

      if (fieldNumber === 1 && wireType === 2) {
        key = reader.readString();
      } else if (fieldNumber === 2 && wireType === 2) {
        value = this.decodeAnyValue(reader.readBytes());
      } else {
        reader.skip(wireType);
      }
    }

    return { key, value };
  }

  static decodeAnyValue(buffer) {
    const reader = new ProtoReader(buffer);
    let result = null;

    while (reader.hasMore()) {
      const { fieldNumber, wireType } = reader.readTag();

      switch (fieldNumber) {
        case 1: // string_value
          if (wireType === 2) {
            result = { stringValue: reader.readString() };
          } else reader.skip(wireType);
          break;
        case 2: // bool_value
          if (wireType === 0) {
            result = { boolValue: reader.readVarint() !== 0n };
          } else reader.skip(wireType);
          break;
        case 3: // int_value (int64 varint)
          if (wireType === 0) {
            const v = reader.readVarintSigned();
            const num = Number(v);
            result = { intValue: Number.isSafeInteger(num) ? num : v.toString() };
          } else reader.skip(wireType);
          break;
        case 4: // double_value (fixed64)
          if (wireType === 1) {
            result = { doubleValue: reader.readDouble() };
          } else reader.skip(wireType);
          break;
        case 5: // array_value
          if (wireType === 2) {
            result = { arrayValue: this.decodeArrayValue(reader.readBytes()) };
          } else reader.skip(wireType);
          break;
        case 6: // kvlist_value
          if (wireType === 2) {
            result = { kvlistValue: this.decodeKeyValueList(reader.readBytes()) };
          } else reader.skip(wireType);
          break;
        case 7: // bytes_value
          if (wireType === 2) {
            result = { bytesValue: reader.readBytes().toString('base64') };
          } else reader.skip(wireType);
          break;
        default:
          reader.skip(wireType);
      }
    }

    return result || {};
  }

  static decodeArrayValue(buffer) {
    const reader = new ProtoReader(buffer);
    const values = [];

    while (reader.hasMore()) {
      const { fieldNumber, wireType } = reader.readTag();

      if (fieldNumber === 1 && wireType === 2) {
        values.push(this.decodeAnyValue(reader.readBytes()));
      } else {
        reader.skip(wireType);
      }
    }

    return { values };
  }

  static decodeKeyValueList(buffer) {
    const reader = new ProtoReader(buffer);
    const values = [];

    while (reader.hasMore()) {
      const { fieldNumber, wireType } = reader.readTag();

      if (fieldNumber === 1 && wireType === 2) {
        values.push(this.decodeKeyValue(reader.readBytes()));
      } else {
        reader.skip(wireType);
      }
    }

    return { values };
  }
}

/**
 * Low-level binary stream reader for protobuf wire format.
 */
class ProtoReader {
  constructor(buffer) {
    this.buffer = buffer;
    this.offset = 0;
  }

  hasMore() {
    return this.offset < this.buffer.length;
  }

  readTag() {
    const key = this.readVarint();
    const wireType = Number(key & 0x07n);
    const fieldNumber = Number(key >> 3n);

    if (wireType > 5 || wireType === 3 || wireType === 4) {
      throw new Error(`Invalid protobuf wire type: ${wireType} at offset ${this.offset}`);
    }

    return { fieldNumber, wireType };
  }

  readVarint() {
    let result = 0n;
    let shift = 0n;
    let bytesRead = 0;

    while (true) {
      if (this.offset >= this.buffer.length) {
        throw new Error('Truncated buffer: unexpected EOF while reading varint');
      }

      const byte = BigInt(this.buffer[this.offset++]);
      bytesRead++;

      if (bytesRead > 10) {
        throw new Error('Malformed varint: exceeds 10 bytes');
      }

      result |= (byte & 0x7fn) << shift;
      if ((byte & 0x80n) === 0n) {
        break;
      }
      shift += 7n;
    }

    return result;
  }

  readVarintSigned() {
    const raw = this.readVarint();
    // 64-bit two's complement
    if (raw > 0x7fffffffffffffffn) {
      return raw - 0x10000000000000000n;
    }
    return raw;
  }

  readBytes() {
    const length = Number(this.readVarint());
    if (this.offset + length > this.buffer.length) {
      throw new Error(`Truncated buffer: expected ${length} bytes, only ${this.buffer.length - this.offset} available`);
    }
    const slice = this.buffer.subarray(this.offset, this.offset + length);
    this.offset += length;
    return slice;
  }

  readString() {
    return this.readBytes().toString('utf8');
  }

  readFixed64() {
    if (this.offset + 8 > this.buffer.length) {
      throw new Error('Truncated buffer: unexpected EOF while reading 64-bit value');
    }
    const val = this.buffer.readBigUInt64LE(this.offset);
    this.offset += 8;
    return val;
  }

  readDouble() {
    if (this.offset + 8 > this.buffer.length) {
      throw new Error('Truncated buffer: unexpected EOF while reading double value');
    }
    const val = this.buffer.readDoubleLE(this.offset);
    this.offset += 8;
    return val;
  }

  skip(wireType) {
    switch (wireType) {
      case 0: // Varint
        this.readVarint();
        break;
      case 1: // 64-bit
        if (this.offset + 8 > this.buffer.length) {
          throw new Error('Truncated buffer while skipping 64-bit field');
        }
        this.offset += 8;
        break;
      case 2: // Length-delimited
        {
          const len = Number(this.readVarint());
          if (this.offset + len > this.buffer.length) {
            throw new Error('Truncated buffer while skipping length-delimited field');
          }
          this.offset += len;
        }
        break;
      case 5: // 32-bit
        if (this.offset + 4 > this.buffer.length) {
          throw new Error('Truncated buffer while skipping 32-bit field');
        }
        this.offset += 4;
        break;
      default:
        throw new Error(`Unsupported wire type to skip: ${wireType}`);
    }
  }
}

module.exports = OtlpProtoDecoder;
