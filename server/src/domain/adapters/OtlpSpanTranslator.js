const { v4: uuidv4 } = require('uuid');

/**
 * OtlpSpanTranslator
 *
 * Domain adapter for translating OpenTelemetry (OTLP) Spans
 * into GHOST-STACK canonical telemetry data objects accepted by
 * TelemetryProcessingService.process(data).
 *
 * Architectural Invariants:
 * 1. Pure domain translation logic — zero I/O, zero database access.
 * 2. Authenticated project identity is NEVER overwritten by OTLP attributes.
 * 3. Does not manufacture HTTP 500 status codes when no HTTP status exists.
 * 4. INTERNAL spans are preserved for service metrics/detection but do NOT
 *    create cross-service dependencies (targetService = null).
 * 5. Rejects spans missing service.name and reports them in partialSuccess.
 * 6. Generates deterministic eventIds (otlp_${traceId}_${spanId}) to ensure
 *    ingestion idempotency on retries.
 */
class OtlpSpanTranslator {
  /**
   * Translates a collection of OTLP ResourceSpans into canonical telemetry event objects.
   *
   * @param {Array<object>} resourceSpans - OTLP ResourceSpans array
   * @param {object} options
   * @param {string} [options.projectId='project-default'] - Authenticated project ID
   * @returns {{
   *   events: Array<object>,
   *   rejectedCount: number,
   *   rejections: Array<{ reason: string, traceId?: string, spanId?: string }>
   * }}
   */
  static translateBatch(resourceSpans, options = {}) {
    const projectId = options.projectId || 'project-default';
    const events = [];
    const rejections = [];

    if (!Array.isArray(resourceSpans)) {
      return { events, rejectedCount: 0, rejections };
    }

    for (const rs of resourceSpans) {
      if (!rs || typeof rs !== 'object') continue;

      const resourceAttrs = this.attributesToObject(rs.resource?.attributes);
      const scopeSpans = rs.scopeSpans || rs.instrumentationLibrarySpans || [];

      if (!Array.isArray(scopeSpans)) continue;

      for (const ss of scopeSpans) {
        if (!ss || typeof ss !== 'object') continue;
        const spans = ss.spans || [];
        if (!Array.isArray(spans)) continue;

        for (const span of spans) {
          if (!span || typeof span !== 'object') continue;

          const result = this.translateSpan(span, resourceAttrs, { projectId });
          if (result.success) {
            events.push(result.data);
          } else {
            rejections.push({
              reason: result.reason,
              traceId: span.traceId ? this.toHexString(span.traceId) : undefined,
              spanId: span.spanId ? this.toHexString(span.spanId) : undefined,
            });
          }
        }
      }
    }

    return {
      events,
      rejectedCount: rejections.length,
      rejections,
    };
  }

  /**
   * Translates an individual OTLP Span and resource attributes into canonical telemetry data.
   *
   * @param {object} span - OTLP Span object
   * @param {object} resourceAttrs - Key-value map of resource attributes
   * @param {object} options
   * @param {string} options.projectId - Authenticated project ID
   * @returns {{ success: true, data: object } | { success: false, reason: string }}
   */
  static translateSpan(span, resourceAttrs = {}, options = {}) {
    const spanAttrs = this.attributesToObject(span.attributes);

    // 1. Resolve sourceService (mandatory)
    const sourceService = (
      resourceAttrs['service.name'] ||
      spanAttrs['service.name'] ||
      ''
    ).trim();

    if (!sourceService) {
      return { success: false, reason: 'MISSING_SERVICE_NAME' };
    }

    // 2. Resolve environment (prefer deployment.environment.name, then deployment.environment)
    const environment = (
      resourceAttrs['deployment.environment.name'] ||
      resourceAttrs['deployment.environment'] ||
      spanAttrs['deployment.environment.name'] ||
      spanAttrs['deployment.environment'] ||
      'production'
    ).trim();

    // 3. Resolve traceId and spanId
    const traceId = span.traceId ? this.toHexString(span.traceId) : null;
    const spanId = span.spanId ? this.toHexString(span.spanId) : null;
    const parentSpanId = span.parentSpanId ? this.toHexString(span.parentSpanId) : null;

    // 4. Deterministic eventId for idempotency
    const eventId = (traceId && spanId)
      ? `otlp_${traceId}_${spanId}`
      : (spanId ? `otlp_${spanId}` : uuidv4());

    // 5. Timestamps and Latency
    const { timestamp, latencyMs } = this.parseTimestamps(
      span.startTimeUnixNano,
      span.endTimeUnixNano
    );

    // 6. Endpoint / Name
    const endpoint = span.name
      || spanAttrs['http.target']
      || spanAttrs['http.route']
      || spanAttrs['url.path']
      || null;

    // 7. HTTP Method
    const rawMethod = spanAttrs['http.method']
      || spanAttrs['http.request.method']
      || null;
    const method = rawMethod ? String(rawMethod).toUpperCase() : null;

    // 8. HTTP Status Code (strict: do NOT manufacture 500 when no HTTP status exists)
    let statusCode = null;
    const rawStatusCode = spanAttrs['http.status_code']
      ?? spanAttrs['http.response.status_code']
      ?? null;

    if (rawStatusCode !== null && rawStatusCode !== undefined) {
      const parsedCode = Number(rawStatusCode);
      if (Number.isInteger(parsedCode) && parsedCode >= 100 && parsedCode <= 599) {
        statusCode = parsedCode;
      }
    }

    // 9. Span Kind and Target Service resolution (Prevent false dependencies)
    const spanKind = this.normalizeSpanKind(span.kind);
    const targetService = this.resolveTargetService(spanKind, spanAttrs);

    // 10. Dependency type
    let dependencyType = 'sync';
    if (spanKind === 'PRODUCER' || spanKind === 'CONSUMER') {
      dependencyType = 'async';
    } else if (spanAttrs['db.system']) {
      dependencyType = 'database';
    }

    // 11. Preserved metadata
    const metadata = {
      ...spanAttrs,
      otlp: {
        kind: spanKind,
        spanId,
        parentSpanId,
        traceState: span.traceState || null,
        status: span.status ? {
          code: span.status.code,
          message: span.status.message || null,
        } : null,
      },
    };

    if (spanAttrs['db.system']) {
      metadata.dbSystem = spanAttrs['db.system'];
    }

    return {
      success: true,
      data: {
        eventId,
        projectId: options.projectId || 'project-default',
        timestamp,
        sourceService,
        targetService,
        endpoint,
        method,
        statusCode,
        latencyMs,
        traceId,
        requestId: spanId,
        environment,
        dependencyType,
        metadata,
      },
    };
  }

  /**
   * Resolves the target service based on span kind and attributes.
   * Internal and Server spans do not create cross-service dependencies.
   *
   * @param {string} spanKind - 'INTERNAL' | 'SERVER' | 'CLIENT' | 'PRODUCER' | 'CONSUMER' | 'UNSPECIFIED'
   * @param {object} spanAttrs - Key-value map of span attributes
   * @returns {string|null}
   */
  static resolveTargetService(spanKind, spanAttrs) {
    // Internal spans never create cross-service dependencies
    if (spanKind === 'INTERNAL') {
      return null;
    }

    // Server spans represent work on the server side; they do not represent outgoing client dependencies
    if (spanKind === 'SERVER') {
      return null;
    }

    // For CLIENT, PRODUCER, or unspecified spans with remote call attributes:
    // 1. peer.service is the primary semantic convention for remote service name
    if (spanAttrs['peer.service']) {
      const peer = String(spanAttrs['peer.service']).trim();
      if (peer) return peer;
    }

    // 2. rpc.service (e.g. gRPC service name)
    if (spanAttrs['rpc.service']) {
      const rpc = String(spanAttrs['rpc.service']).trim();
      if (rpc) return rpc;
    }

    // 3. For CLIENT calls, server.address or http.host (if remote host is specified)
    if (spanKind === 'CLIENT') {
      const host = spanAttrs['server.address'] || spanAttrs['http.host'] || spanAttrs['net.peer.name'];
      if (host) {
        const trimmed = String(host).trim();
        if (trimmed) return trimmed;
      }
    }

    return null;
  }

  /**
   * Normalizes numeric or string span kind into standard string names.
   * 0: UNSPECIFIED, 1: INTERNAL, 2: SERVER, 3: CLIENT, 4: PRODUCER, 5: CONSUMER
   *
   * @param {number|string} kind
   * @returns {string}
   */
  static normalizeSpanKind(kind) {
    if (typeof kind === 'string') {
      const upper = kind.toUpperCase();
      if (upper.includes('INTERNAL')) return 'INTERNAL';
      if (upper.includes('SERVER')) return 'SERVER';
      if (upper.includes('CLIENT')) return 'CLIENT';
      if (upper.includes('PRODUCER')) return 'PRODUCER';
      if (upper.includes('CONSUMER')) return 'CONSUMER';
      return 'UNSPECIFIED';
    }

    switch (Number(kind)) {
      case 1: return 'INTERNAL';
      case 2: return 'SERVER';
      case 3: return 'CLIENT';
      case 4: return 'PRODUCER';
      case 5: return 'CONSUMER';
      default: return 'UNSPECIFIED';
    }
  }

  /**
   * Converts nanosecond start and end times to Date and latencyMs using BigInt.
   *
   * @param {string|number|bigint} startNano
   * @param {string|number|bigint} endNano
   * @returns {{ timestamp: Date, latencyMs: number|null }}
   */
  static parseTimestamps(startNano, endNano) {
    let startMs = null;
    let endMs = null;

    if (startNano !== undefined && startNano !== null && startNano !== '') {
      try {
        const bn = BigInt(startNano);
        startMs = Number(bn / 1000000n);
      } catch (_err) {
        // invalid BigInt representation
      }
    }

    if (endNano !== undefined && endNano !== null && endNano !== '') {
      try {
        const bn = BigInt(endNano);
        endMs = Number(bn / 1000000n);
      } catch (_err) {
        // invalid BigInt representation
      }
    }

    const timestamp = (startMs !== null && !isNaN(startMs) && startMs > 0)
      ? new Date(startMs)
      : new Date();

    let latencyMs = null;
    if (startMs !== null && endMs !== null && !isNaN(startMs) && !isNaN(endMs)) {
      latencyMs = Math.max(0, endMs - startMs);
    }

    return { timestamp, latencyMs };
  }

  /**
   * Converts an attributes collection (array of KeyValue or object map)
   * into a plain JavaScript key-value object.
   *
   * @param {Array|object} attrs
   * @returns {object}
   */
  static attributesToObject(attrs) {
    if (!attrs) return {};

    if (!Array.isArray(attrs) && typeof attrs === 'object') {
      const result = {};
      for (const [key, val] of Object.entries(attrs)) {
        result[key] = this.extractAnyValue(val);
      }
      return result;
    }

    if (!Array.isArray(attrs)) return {};

    const result = {};
    for (const item of attrs) {
      if (!item || typeof item !== 'object' || !item.key) continue;
      result[item.key] = this.extractAnyValue(item.value);
    }
    return result;
  }

  /**
   * Extracts scalar or structured value from OTLP AnyValue format.
   *
   * @param {*} val
   * @returns {*}
   */
  static extractAnyValue(val) {
    if (val === null || val === undefined) return null;
    if (typeof val !== 'object') return val;

    if ('stringValue' in val) return val.stringValue;
    if ('intValue' in val) {
      const num = Number(val.intValue);
      return Number.isSafeInteger(num) ? num : val.intValue;
    }
    if ('doubleValue' in val) return Number(val.doubleValue);
    if ('boolValue' in val) return Boolean(val.boolValue);
    if ('bytesValue' in val) return val.bytesValue;

    if ('arrayValue' in val && val.arrayValue?.values && Array.isArray(val.arrayValue.values)) {
      return val.arrayValue.values.map((v) => this.extractAnyValue(v));
    }

    if ('kvlistValue' in val && val.kvlistValue?.values && Array.isArray(val.kvlistValue.values)) {
      const obj = {};
      for (const item of val.kvlistValue.values) {
        if (item && item.key) {
          obj[item.key] = this.extractAnyValue(item.value);
        }
      }
      return obj;
    }

    if ('value' in val) return this.extractAnyValue(val.value);

    return val;
  }

  /**
   * Converts raw byte array, Buffer, or hex string to lowercase hex string.
   *
   * @param {string|Buffer|Uint8Array|Array} id
   * @returns {string}
   */
  static toHexString(id) {
    if (!id) return '';
    if (typeof id === 'string') return id.toLowerCase();
    if (Buffer.isBuffer(id)) return id.toString('hex').toLowerCase();
    if (id instanceof Uint8Array || Array.isArray(id)) {
      return Buffer.from(id).toString('hex').toLowerCase();
    }
    return String(id).toLowerCase();
  }
}

module.exports = OtlpSpanTranslator;
