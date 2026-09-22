/**
 * GhostStackClient
 *
 * Core orchestrator for @ghoststack/node.
 *
 * Non-Negotiable Reliability Guarantees:
 * 1. 100% Asynchronous telemetry transmission — customer request paths are NEVER blocked.
 * 2. Bounded memory and queue depth with deterministic drop-oldest policy.
 * 3. Unref'd background timers ensure zero Node process hangs on exit.
 * 4. Hard network timeouts and transient retry backoff with randomized jitter.
 * 5. Complete isolation: GHOST-STACK downtime never impacts host application availability.
 */

const { resolveConfig } = require('./config');
const SDKStats = require('./stats');
const BoundedBuffer = require('./buffer');
const Transport = require('./transport');
const { Span, NoopSpan } = require('./span');
const { getActiveSpan, runWithSpan } = require('./traceContext');
const { instrumentHttp, uninstrumentHttp } = require('./instrumentation/http');
const { createExpressMiddleware } = require('./instrumentation/express');

class GhostStackClient {
  /**
   * @param {object} [userOptions={}]
   */
  constructor(userOptions = {}) {
    this.config = resolveConfig(userOptions);
    this.stats = new SDKStats();
    this.buffer = new BoundedBuffer({
      maxBufferSize: this.config.maxBufferSize,
      stats: this.stats,
    });

    this.transport = new Transport({
      endpoint: this.config.endpoint,
      apiKey: this.config.apiKey,
      serviceName: this.config.serviceName,
      environment: this.config.environment,
      serviceVersion: this.config.serviceVersion,
      timeoutMs: this.config.timeoutMs,
      maxRetries: this.config.maxRetries,
      maxRetryDelayMs: this.config.maxRetryDelayMs,
      debug: this.config.debug,
      stats: this.stats,
    });

    this.isShutdown = false;
    this.isFlushing = false;
    this.flushTimer = null;

    // Start background flush worker if not disabled
    if (!this.config.disabled) {
      this.flushTimer = setInterval(() => {
        this.flush().catch(() => {});
      }, this.config.flushIntervalMs);

      // Never keep the Node process alive due to SDK timers
      if (this.flushTimer.unref) {
        this.flushTimer.unref();
      }

      // Automatic HTTP instrumentation if explicitly requested
      if (userOptions.instrumentHttp) {
        this.instrumentHttp();
      }
    }
  }

  /**
   * Starts a new span.
   * Synchronous, microsecond-fast, zero I/O.
   *
   * @param {string} name
   * @param {object} [options={}]
   * @returns {Span|NoopSpan}
   */
  startSpan(name, options = {}) {
    if (this.config.disabled || this.isShutdown) {
      return new NoopSpan();
    }

    // Determine initial sampling
    const isSampled = Math.random() < this.config.sampleRate;

    const active = getActiveSpan();
    const effectiveTraceId = options.traceId || (active ? active.traceId : undefined);
    const effectiveParentSpanId = options.parentSpanId !== undefined
      ? options.parentSpanId
      : (active ? active.spanId : undefined);

    const span = new Span({
      name,
      kind: options.kind || 'INTERNAL',
      traceId: effectiveTraceId,
      parentSpanId: effectiveParentSpanId,
      targetService: options.targetService,
      attributes: options.attributes || {},
      onEnd: (endedSpan) => this._onSpanEnd(endedSpan, isSampled),
      stats: this.stats,
    });

    return span;
  }

  /**
   * Returns the currently active span in the current async context.
   * @returns {Span|null}
   */
  getActiveSpan() {
    return getActiveSpan();
  }

  /**
   * Executes a synchronous or asynchronous function within the context of a span.
   *
   * @template T
   * @param {Span} span
   * @param {() => T} fn
   * @returns {T}
   */
  withSpan(span, fn) {
    return runWithSpan(span, fn);
  }

  /**
   * Handles span completion.
   * Implements sampling with error retention (Correction 12).
   */
  _onSpanEnd(span, wasSampled) {
    if (this.config.disabled || this.isShutdown) {
      return;
    }

    // Error retention policy: if span is anomalous/error, retain even if sampled out
    const isError = span.status.code === 2 || (span.attributes['http.status_code'] >= 500);
    const shouldRetain = wasSampled || (this.config.retainErrors && isError);

    if (!shouldRetain) {
      return; // Discarded by sampling
    }

    this.buffer.push(span);

    // If buffer reaches batch threshold, trigger non-blocking flush
    if (this.buffer.length >= this.config.batchSize && !this.isFlushing) {
      setImmediate(() => {
        this.flush().catch(() => {});
      });
    }
  }

  /**
   * Flushes available spans to GHOST-STACK in batches asynchronously.
   *
   * @returns {Promise<void>}
   */
  async flush() {
    if (this.config.disabled || this.isFlushing || this.buffer.isEmpty()) {
      return;
    }

    this.isFlushing = true;
    try {
      while (!this.buffer.isEmpty() && !this.isShutdown) {
        const batch = this.buffer.drain(this.config.batchSize);
        if (batch.length === 0) break;

        await this.transport.sendBatch(batch);
      }
    } finally {
      this.isFlushing = false;
    }
  }

  /**
   * Returns Express middleware for automatic route & latency tracking.
   *
   * @returns {import('express').RequestHandler}
   */
  middleware() {
    return createExpressMiddleware(this);
  }

  /**
   * Enables automatic HTTP and HTTPS client instrumentation.
   */
  instrumentHttp() {
    if (!this.config.disabled) {
      instrumentHttp(this);
    }
    return this;
  }

  /**
   * Reverts HTTP instrumentation.
   */
  uninstrumentHttp() {
    uninstrumentHttp(this);
    return this;
  }

  /**
   * Returns safe SDK diagnostics.
   *
   * @returns {object}
   */
  getStats() {
    return this.stats.toJSON();
  }

  /**
   * Shuts down the SDK gracefully and idempotently.
   *
   * @param {object} [options={}]
   * @param {number} [options.timeoutMs=2000] - Hard shutdown timeout
   * @returns {Promise<void>}
   */
  async shutdown(options = {}) {
    if (this.isShutdown) {
      return; // Idempotent shutdown
    }
    this.isShutdown = true;

    // Clear background timer
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }

    // Uninstrument HTTP
    this.uninstrumentHttp();

    const shutdownTimeout = options.timeoutMs || 2000;

    // Attempt bounded final flush
    const flushPromise = this.flush();
    const timeoutPromise = new Promise((resolve) => setTimeout(resolve, shutdownTimeout));

    await Promise.race([flushPromise, timeoutPromise]);

    // Abort any remaining network sockets
    this.transport.abort();
  }
}

GhostStackClient.GhostStackClient = GhostStackClient;
module.exports = GhostStackClient;
