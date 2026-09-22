const { sanitizeAttributes } = require('./sanitization');
const { generateTraceId, generateSpanId } = require('./traceContext');

// OTLP SpanKind numeric mapping:
// 1: INTERNAL, 2: SERVER, 3: CLIENT, 4: PRODUCER, 5: CONSUMER
const SPAN_KIND_MAP = {
  INTERNAL: 1,
  SERVER: 2,
  CLIENT: 3,
  PRODUCER: 4,
  CONSUMER: 5,
};

// OTLP StatusCode: 0: UNSET, 1: OK, 2: ERROR
const STATUS_CODE_MAP = {
  UNSET: 0,
  OK: 1,
  ERROR: 2,
};

/**
 * Returns current timestamp in nanoseconds as BigInt string.
 */
function nowNanoString() {
  const [sec, nano] = process.hrtime();
  // Epoch offset + hrtime for precision
  const ms = Date.now();
  return (BigInt(ms) * 1000000n + BigInt(nano % 1000000)).toString();
}

class Span {
  /**
   * @param {object} options
   * @param {string} options.name
   * @param {string} [options.kind='INTERNAL']
   * @param {string} [options.traceId]
   * @param {string} [options.parentSpanId]
   * @param {string} [options.targetService]
   * @param {object} [options.attributes={}]
   * @param {Function} [options.onEnd]
   * @param {object} [options.stats]
   */
  constructor({
    name,
    kind = 'INTERNAL',
    traceId,
    parentSpanId = null,
    targetService = null,
    attributes = {},
    onEnd = null,
    stats = null,
  }) {
    this.name = String(name || 'unnamed-span').slice(0, 128);
    let resolvedKind = 1;
    if (typeof kind === 'number') {
      resolvedKind = kind;
    } else if (typeof kind === 'string') {
      resolvedKind = SPAN_KIND_MAP[kind.toUpperCase()] || 1;
    }
    this.kind = resolvedKind;
    this.traceId = traceId || generateTraceId();
    this.spanId = generateSpanId();
    this.parentSpanId = parentSpanId;
    this.targetService = targetService;
    this.startTimeUnixNano = nowNanoString();
    this.endTimeUnixNano = null;
    this.status = { code: 0 }; // UNSET
    this.attributes = sanitizeAttributes(attributes, stats);
    this.onEnd = onEnd;
    this.stats = stats;
    this.ended = false;

    // Attach targetService to attributes if present
    if (this.targetService) {
      this.attributes['peer.service'] = this.targetService;
    }
  }

  /**
   * Sets a single sanitized attribute.
   *
   * @param {string} key
   * @param {*} value
   * @returns {this}
   */
  setAttribute(key, value) {
    if (this.ended || !key) return this;
    const sanitized = sanitizeAttributes({ [key]: value }, this.stats);
    Object.assign(this.attributes, sanitized);
    return this;
  }

  /**
   * Sets multiple sanitized attributes.
   *
   * @param {object} attrs
   * @returns {this}
   */
  setAttributes(attrs) {
    if (this.ended || !attrs) return this;
    const sanitized = sanitizeAttributes(attrs, this.stats);
    Object.assign(this.attributes, sanitized);
    return this;
  }

  /**
   * Sets the span status.
   *
   * @param {object} status
   * @param {'OK'|'ERROR'|'UNSET'|number} status.code
   * @param {string} [status.message]
   * @returns {this}
   */
  setStatus({ code, message }) {
    if (this.ended) return this;

    let statusCode = 0;
    if (typeof code === 'string') {
      statusCode = STATUS_CODE_MAP[code.toUpperCase()] ?? 0;
    } else if (typeof code === 'number') {
      statusCode = code >= 0 && code <= 2 ? code : 0;
    }

    this.status = {
      code: statusCode,
      message: message ? String(message).slice(0, 256) : undefined,
    };

    return this;
  }

  /**
   * Safely records an error on the span without leaking sensitive data.
   * Never captures request bodies or raw error objects with potential secrets.
   *
   * @param {Error|string} err
   * @returns {this}
   */
  recordError(err) {
    if (this.ended || !err) return this;

    const errorName = (err && err.name) ? String(err.name).slice(0, 64) : 'Error';
    const rawMessage = (err && err.message) ? String(err.message) : String(err);
    const errorMessage = rawMessage.slice(0, 512);

    this.setAttribute('error.type', errorName);
    this.setAttribute('error.message', errorMessage);

    if (err && err.code) {
      this.setAttribute('error.code', String(err.code).slice(0, 64));
    }

    // Set span status to ERROR
    this.setStatus({ code: 'ERROR', message: errorMessage });

    return this;
  }

  /**
   * Ends the span and invokes the onEnd callback.
   *
   * @param {string|number|Date} [endTime]
   */
  end(endTime) {
    if (this.ended) return;
    this.ended = true;

    if (endTime instanceof Date) {
      this.endTimeUnixNano = (BigInt(endTime.getTime()) * 1000000n).toString();
    } else if (typeof endTime === 'string' || typeof endTime === 'number') {
      this.endTimeUnixNano = String(endTime);
    } else {
      this.endTimeUnixNano = nowNanoString();
    }

    if (typeof this.onEnd === 'function') {
      try {
        this.onEnd(this);
      } catch (_err) {
        // Must never throw out of end()
      }
    }
  }

  /**
   * Converts this span to an OTLP JSON span format.
   *
   * @returns {object}
   */
  toOtlpSpan() {
    const otlpAttributes = [];

    for (const [key, val] of Object.entries(this.attributes)) {
      otlpAttributes.push({
        key,
        value: this._toAnyValue(val),
      });
    }

    if (this.targetService && !this.attributes['peer.service']) {
      otlpAttributes.push({
        key: 'peer.service',
        value: { stringValue: this.targetService },
      });
    }

    return {
      traceId: this.traceId,
      spanId: this.spanId,
      parentSpanId: this.parentSpanId || undefined,
      name: this.name,
      kind: this.kind,
      startTimeUnixNano: this.startTimeUnixNano,
      endTimeUnixNano: this.endTimeUnixNano || this.startTimeUnixNano,
      attributes: otlpAttributes,
      status: {
        code: this.status.code,
        message: this.status.message || undefined,
      },
    };
  }

  _toAnyValue(val) {
    if (typeof val === 'string') {
      return { stringValue: val };
    }
    if (typeof val === 'number') {
      if (Number.isInteger(val)) {
        return { intValue: val };
      }
      return { doubleValue: val };
    }
    if (typeof val === 'boolean') {
      return { boolValue: val };
    }
    if (Array.isArray(val)) {
      return {
        arrayValue: {
          values: val.map((item) => this._toAnyValue(item)),
        },
      };
    }
    if (typeof val === 'object' && val !== null) {
      const kvList = [];
      for (const [k, v] of Object.entries(val)) {
        kvList.push({ key: k, value: this._toAnyValue(v) });
      }
      return { kvlistValue: { values: kvList } };
    }
    return { stringValue: String(val) };
  }
}

/**
 * No-op Span returned when SDK is disabled.
 */
class NoopSpan {
  constructor() {
    this.traceId = '00000000000000000000000000000000';
    this.spanId = '0000000000000000';
    this.ended = true;
  }
  setAttribute() { return this; }
  setAttributes() { return this; }
  setStatus() { return this; }
  recordError() { return this; }
  end() {}
  toOtlpSpan() { return null; }
}

module.exports = {
  Span,
  NoopSpan,
  SPAN_KIND_MAP,
  STATUS_CODE_MAP,
};
