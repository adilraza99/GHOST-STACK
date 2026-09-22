# @ghoststack/node

Official production-grade Node.js SDK for the **GHOST-STACK** Change-Aware Incident Intelligence platform.

---

## Design Philosophy & Guarantees

Observability infrastructure must **never** become application infrastructure. Under no circumstances should telemetry collection degrade, slow down, block, or crash your application:

1. **100% Non-Blocking & Asynchronous Transmission**: Telemetry is buffered in-memory and flushed asynchronously on a dedicated unref'd timer. Customer request paths are **never** blocked by network calls to GHOST-STACK.
2. **Strictly Bounded Memory**: Queue capacity is hard-capped (`maxBufferSize`, default `1000`). If capacity is reached during an outage, the deterministic **`drop-oldest`** backpressure policy discards the oldest spans to accommodate newer telemetry without memory leaks.
3. **Hard Network Timeouts & Resilient Retries**: Network requests have strict timeouts (`timeoutMs`, default `3000ms`). Transient errors (500, 503, 429, ECONNRESET) are retried with exponential backoff and randomized jitter to prevent thundering herds. Non-retryable client errors (400, 401, 403, 404, 501) are immediately discarded.
4. **Clean Process Exits**: Background flush timers use `.unref()` so the SDK will never prevent your Node.js process from exiting cleanly.
5. **Zero Heavy Runtime Dependencies**: Implemented in pure standard Node.js built-ins (`http`, `https`, `crypto`, `async_hooks`). Zero npm dependency baggage.
6. **Built-in Sanitization & Privacy**: Out-of-the-box credential stripping, header blocklists, sensitive query parameter redaction, and bounded attribute depths.

---

## Installation

```bash
npm install @ghoststack/node
```

> **Requirements**: Node.js `>= 18.0.0`

---

## Quick Start

### Express Integration

```javascript
const express = require('express');
const ghoststack = require('@ghoststack/node');

// 1. Initialize the SDK
const client = ghoststack.init({
  serviceName: 'order-service',
  environment: process.env.NODE_ENV || 'production',
  apiKey: process.env.GHOSTSTACK_API_KEY,
  endpoint: process.env.GHOSTSTACK_ENDPOINT, // e.g. 'https://ghoststack.internal:3000'
});

// 2. Enable automatic outgoing HTTP client instrumentation (optional)
client.instrumentHttp();

const app = express();

// 3. Attach Express middleware (captures route templates, latency, status codes)
app.use(client.middleware());

app.get('/api/orders/:id', (req, res) => {
  res.json({ orderId: req.params.id, status: 'confirmed' });
});

// 4. Graceful shutdown
process.on('SIGTERM', async () => {
  await ghoststack.shutdown();
  process.exit(0);
});

app.listen(3000);
```

---

## Configuration

The SDK can be configured programmatically via `init(options)` or via environment variables:

| Option | Environment Variable | Type | Default | Description |
| :--- | :--- | :--- | :--- | :--- |
| `serviceName` | `GHOSTSTACK_SERVICE_NAME` | `string` | **Required** | Logical service identity. |
| `apiKey` | `GHOSTSTACK_API_KEY` | `string` | Required in prod | GHOST-STACK Project Ingestion API Key (`X-GhostStack-Key`). |
| `endpoint` | `GHOSTSTACK_ENDPOINT` | `string` | Localhost in dev | Base URL or trace path (`/v1/traces` normalized automatically). |
| `environment` | `GHOSTSTACK_ENVIRONMENT` / `NODE_ENV` | `string` | `'production'` | Environment name (e.g. `'production'`, `'staging'`). |
| `serviceVersion` | `GHOSTSTACK_SERVICE_VERSION` | `string` | `null` | Deployment release or git commit SHA. |
| `sampleRate` | `GHOSTSTACK_SAMPLE_RATE` | `number` | `1.0` | Sampling ratio between `0.0` and `1.0`. |
| `batchSize` | `GHOSTSTACK_BATCH_SIZE` | `number` | `100` | Maximum spans sent per flush request. |
| `flushIntervalMs` | `GHOSTSTACK_FLUSH_INTERVAL_MS` | `number` | `2000` | Background transmission interval in milliseconds. |
| `maxBufferSize` | `GHOSTSTACK_MAX_BUFFER_SIZE` | `number` | `1000` | Maximum spans buffered in-memory before drop-oldest. |
| `timeoutMs` | `GHOSTSTACK_TIMEOUT_MS` | `number` | `3000` | Hard HTTP socket timeout per transmission request. |
| `maxRetries` | `GHOSTSTACK_MAX_RETRIES` | `number` | `3` | Maximum retry attempts for transient network/server errors. |
| `retainErrors` | `GHOSTSTACK_RETAIN_ERRORS` | `boolean` | `true` | Retain error spans even if unsampled by `sampleRate`. |
| `disabled` | `GHOSTSTACK_DISABLED` | `boolean` | `false` | Complete circuit-breaker; turns all operations into no-ops. |
| `debug` | `GHOSTSTACK_DEBUG` | `boolean` | `false` | Enables diagnostic logging to stderr. |

### Production vs Development Guardrails

To prevent accidental data leakage or silent delivery to nowhere:
- In `production`, omitting `endpoint` throws `ConfigError`. The SDK will **never** silently fall back to `localhost` in production.
- In `production`, omitting `apiKey` throws `ConfigError`.
- Any endpoint provided (e.g. `http://ghoststack:3000` or `http://ghoststack:3000/api/otlp/v1/traces`) is automatically normalized to the canonical OTLP trace path `/v1/traces`.

---

## Distributed Tracing & W3C Trace Context

The SDK natively implements the [W3C Trace Context specification](https://www.w3.org/TR/trace-context/):

- **Header Format**: `traceparent: 00-<trace_id>-<parent_id>-<flags>`
- **Strict Validation**: Invalid traceparents (bad version `ff`, non-hex characters, all-zero IDs) are rejected and cleanly replaced with fresh identifiers.
- **Automatic Context Propagation**: Express middleware automatically extracts incoming `traceparent` headers and binds the active span to Node's `AsyncLocalStorage`.
- **Outgoing HTTP Injection**: When `client.instrumentHttp()` is active, outgoing `http.request()` and `https.request()` calls automatically inherit the active trace ID and inject the child span's `traceparent` header.

### Manual Context Management

```javascript
const { getActiveSpan, runWithSpan } = require('@ghoststack/node');

// Execute an asynchronous unit of work within a span context
await client.withSpan(span, async () => {
  const current = client.getActiveSpan();
  console.log('Active trace ID:', current.traceId);
  await doWork();
});
```

---

## Manual Span Instrumentation

For granular tracing of internal operations:

```javascript
const span = client.startSpan('process-payment', {
  kind: 'INTERNAL', // 'INTERNAL' | 'SERVER' | 'CLIENT' | 'PRODUCER' | 'CONSUMER'
  targetService: 'payment-gateway',
  attributes: {
    'payment.provider': 'stripe',
    'payment.amount': 49.99,
  },
});

try {
  const result = await chargeCustomer();
  span.setAttribute('payment.transaction_id', result.id);
  span.setStatus({ code: 'OK' });
} catch (err) {
  // Safe error recording: records error.type, error.message, error.code
  // NEVER captures raw customer request bodies or stack secret leaks
  span.recordError(err);
  throw err;
} finally {
  span.end();
}
```

---

## Sanitization & Data Safety

The SDK enforces strict data security boundaries before any telemetry enters the buffer:

1. **Header Blocklist**: Automatically scrubs `authorization`, `cookie`, `set-cookie`, `x-api-key`, `x-auth-token`, and bearer tokens.
2. **URL Credential Stripping**: URLs like `https://user:password@host:port/path` are stripped to `https://host:port/path`.
3. **Sensitive Query Scrubbing**: Query parameters matching `token`, `secret`, `password`, `key`, `credential`, etc., are replaced with `[REDACTED]`.
4. **Attribute Bounds**:
   - Max 64 attributes per span.
   - Max 128 characters per attribute key.
   - Max 1024 characters per string value (truncated cleanly).
   - Max array length of 32 elements.
   - Max object depth of 3 levels.
5. **No Self-Instrumentation**: Telemetry delivery requests to GHOST-STACK automatically include `X-GhostStack-Internal: 1` and are excluded from outbound HTTP instrumentation to eliminate infinite recursive telemetry loops.

---

## Diagnostics & Telemetry Statistics

You can inspect the client's internal operational state at any time:

```javascript
const stats = client.getStats();

console.log(stats);
// {
//   eventsBuffered: 0,
//   eventsSent: 1542,
//   eventsDropped: 0,
//   eventsFailed: 0,
//   eventsRetried: 2,
//   attributesTruncated: 0,
//   lastSuccessAt: '2026-09-22T18:18:43.986Z',
//   lastFailureAt: null
// }
```

---

## Failure Behavior & Outage Resilience

| Scenario | SDK Behavior | Host Application Impact |
| :--- | :--- | :--- |
| **GHOST-STACK Down (ECONNREFUSED / 503)** | Spans buffer up to `maxBufferSize`. When full, oldest spans are discarded (`drop-oldest`). Transient retries execute with backoff + jitter. | **Zero**. Requests complete normally. |
| **GHOST-STACK Slow / Unresponsive** | Request is aborted after `timeoutMs` (default 3s). Socket is cleanly destroyed. | **Zero**. No hung processes or memory leaks. |
| **Invalid API Key / 401 Unauthorized** | Immediately dropped. No retries. Diagnostics record `eventsFailed`. | **Zero**. Host application unaffected. |
| **Process Exit / SIGTERM** | `shutdown()` flushes pending spans up to a bounded timeout (default 2s). Timers are unref'd so the process exits without hanging. | Clean shutdown. |

---

## License

Apache-2.0
