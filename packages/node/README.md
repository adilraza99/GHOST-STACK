# @ghoststack/node

Official production-grade Node.js SDK for the **GHOST-STACK** Change-Aware Incident Intelligence platform.

---

## 1. What the SDK Does

`@ghoststack/node` connects your Node.js and Express applications to GHOST-STACK with OpenTelemetry-compatible distributed tracing and change-aware incident intelligence.

Observability infrastructure must **never** degrade or impact application infrastructure. The SDK operates under strict production guarantees:
- **100% Non-Blocking & Asynchronous**: Telemetry is buffered in-memory and flushed asynchronously on unref'd timers. Request paths are **never** blocked by network calls to GHOST-STACK.
- **Strictly Bounded Memory**: Queue capacity is hard-capped (`maxBufferSize`, default `1000`). If capacity is reached, the deterministic **`drop-oldest`** backpressure policy discards the oldest spans to accommodate new telemetry without leaking memory.
- **Hard Network Timeouts & Resilient Retries**: Network requests have strict timeouts (`timeoutMs`, default `3000ms`). Transient errors (429, 500, 503) are retried with exponential backoff and randomized jitter. Permanent errors (400, 401, 403, 404, 501) are discarded immediately.
- **Zero Runtime Dependencies**: Built entirely using Node.js built-ins (`http`, `https`, `crypto`, `async_hooks`). No external npm dependency baggage.
- **Built-in Sanitization & Privacy**: Out-of-the-box credential stripping, header blocklists, sensitive query parameter redaction, and bounded attribute depths.
- **Clean Process Exits**: Background timers are unref'd, allowing Node.js processes to exit naturally on SIGINT/SIGTERM without hanging.

---

## 2. Installation

Install via npm:

```bash
npm install @ghoststack/node
```

Or install from a local package tarball:

```bash
npm install /path/to/ghoststack-node-0.1.0.tgz
```

> **Requirements**: Node.js `>= 18.0.0`

---

## 3. Configuration

The SDK can be configured either via environment variables or programmatically via options passed to `init(options)`. Explicit options always take precedence over environment variables.

| Option | Environment Variable | Type | Default | Description |
| :--- | :--- | :--- | :--- | :--- |
| `serviceName` | `GHOSTSTACK_SERVICE_NAME` | `string` | **Required** | Logical service identity registered in GHOST-STACK. |
| `apiKey` | `GHOSTSTACK_API_KEY` | `string` | Required in prod | GHOST-STACK Project Ingestion Key (`X-GhostStack-Key`). |
| `endpoint` | `GHOSTSTACK_ENDPOINT` | `string` | Localhost in dev | GHOST-STACK server URL (normalized to canonical `/v1/traces`). |
| `environment` | `GHOSTSTACK_ENVIRONMENT` / `NODE_ENV` | `string` | `'production'` | Environment name (`'production'`, `'staging'`, `'development'`). |
| `serviceVersion` | `GHOSTSTACK_SERVICE_VERSION` | `string` | `null` | Deployment release version or git commit SHA. |
| `sampleRate` | `GHOSTSTACK_SAMPLE_RATE` | `number` | `1.0` | Sampling ratio between `0.0` and `1.0`. |
| `batchSize` | `GHOSTSTACK_BATCH_SIZE` | `number` | `100` | Maximum spans sent per flush request. |
| `flushIntervalMs` | `GHOSTSTACK_FLUSH_INTERVAL_MS` | `number` | `2000` | Background transmission interval in milliseconds. |
| `maxBufferSize` | `GHOSTSTACK_MAX_BUFFER_SIZE` | `number` | `1000` | Maximum spans buffered before drop-oldest eviction. |
| `timeoutMs` | `GHOSTSTACK_TIMEOUT_MS` | `number` | `3000` | Hard HTTP socket timeout per transmission request. |
| `maxRetries` | `GHOSTSTACK_MAX_RETRIES` | `number` | `3` | Maximum retry attempts for transient network/server errors. |
| `retainErrors` | `GHOSTSTACK_RETAIN_ERRORS` | `boolean` | `true` | Retain error spans even if unsampled by `sampleRate`. |
| `disabled` | `GHOSTSTACK_DISABLED` | `boolean` | `false` | Complete circuit-breaker; turns all operations into no-ops. |
| `debug` | `GHOSTSTACK_DEBUG` | `boolean` | `false` | Enables diagnostic logging to stderr. |

---

## 4. Minimal Express Example

```javascript
const express = require('express');
const ghoststack = require('@ghoststack/node');

// 1. Initialize the SDK singleton (reads env vars or options)
const client = ghoststack.init({
  serviceName: 'order-service',
  environment: process.env.NODE_ENV || 'production',
  apiKey: process.env.GHOSTSTACK_API_KEY,
  endpoint: process.env.GHOSTSTACK_ENDPOINT, // e.g. 'https://ghoststack.example.com'
});

// 2. Instrument outgoing HTTP calls (propagates W3C traceparent to downstream services)
client.instrumentHttp();

const app = express();
app.use(express.json());

// 3. Attach Express middleware (captures route templates, latency, status codes)
app.use(ghoststack.middleware());

// Route handlers
app.get('/api/orders/:id', (req, res) => {
  res.json({ orderId: req.params.id, status: 'confirmed' });
});

app.get('/api/orders/:id/error', (req, res) => {
  res.status(500).json({ error: 'Payment gateway timeout' });
});

// 4. Graceful shutdown handler
process.on('SIGTERM', async () => {
  await ghoststack.shutdown({ timeoutMs: 2000 });
  process.exit(0);
});

app.listen(8080, () => {
  console.log('Order service listening on port 8080');
});
```

---

## 5. Automatic Instrumentation

### Express Middleware
`ghoststack.middleware()` or `client.middleware()` captures:
- Route template path (e.g. `GET /api/orders/:id` instead of cardinality-exploding dynamic IDs).
- HTTP method, target URL, and status code.
- Automatic error classification: HTTP status `>= 500` is marked as `ERROR` status on the span.
- W3C `traceparent` extraction from incoming headers.
- Idempotent: safe if added to multiple sub-routers.

### Outgoing HTTP & HTTPS Client Instrumentation
`client.instrumentHttp()` patches Node's built-in `http.request` and `https.request`:
- Transparently captures downstream dependency calls as `CLIENT` spans.
- Automatically injects the W3C `traceparent` header into outgoing headers.
- **Zero Self-Instrumentation**: Calls destined for the configured GHOST-STACK endpoint or carrying `X-GhostStack-Internal: 1` are excluded to prevent infinite recursive telemetry loops.
- Can be uninstrumented cleanly with `client.uninstrumentHttp()`.

---

## 6. OpenTelemetry & Trace Behavior

The SDK strictly adheres to the **W3C Trace Context Level 1 Specification**:
- **Format**: `traceparent: 00-<32-hex-trace-id>-<16-hex-parent-id>-<2-hex-flags>`
- **Strict Validation**: Malformed headers (invalid lengths, forbidden version `ff`, or all-zero IDs) are rejected safely and replaced with cryptographically random identifiers.
- **Trace Context Propagation**: Binds active spans to Node's `AsyncLocalStorage` so async child operations and downstream HTTP calls automatically inherit the active trace ID.

### Manual Context Access:
```javascript
const { getActiveSpan, runWithSpan } = require('@ghoststack/node');

const active = getActiveSpan();
if (active) {
  console.log('Current Trace ID:', active.traceId);
  console.log('Current Span ID:', active.spanId);
}
```

---

## 7. Environment Configuration Guardrails

To prevent silent failures and accidental leakage:
1. **Production Endpoint Enforcement**: In `production`, omitting `endpoint` throws `ConfigError`. The SDK will **never** silently fall back to `localhost` in production.
2. **Production API Key Enforcement**: In `production`, omitting `apiKey` throws `ConfigError`.
3. **Canonical Normalization**: Any provided endpoint URL (e.g. `http://ghoststack:3000` or `http://ghoststack:3000/api/otlp/v1/traces`) is automatically normalized to the canonical OTLP path: `/v1/traces`.
4. **Local Development Fallback**: In `development` or `test` modes, omitting `endpoint` defaults to `http://localhost:3000`.

---

## 8. Security, Sanitization & Data Privacy

All telemetry data passes through a sanitization pipeline before entering the buffer:
1. **Header Blocklist**: Automatically scrubs `authorization`, `cookie`, `set-cookie`, `x-api-key`, `x-ghoststack-key`, `x-auth-token`, `x-access-token`, `x-refresh-token`.
2. **URL Credential Stripping**: Embedded credentials (`https://user:password@host/path`) are stripped to `https://host/path`.
3. **Query Parameter Scrubbing**: Parameters matching `token`, `secret`, `password`, `key`, `credential`, `session` are replaced with `[REDACTED]`.
4. **Bounded Attributes**:
   - Maximum 64 attributes per span.
   - Maximum 128 characters per attribute key.
   - Maximum 1024 characters per string value (truncated cleanly).
   - Maximum array length of 32 elements.
   - Maximum object depth of 3 levels.
5. **No Secret Logging**: The SDK **never** logs API keys or authorization headers.

---

## 9. Retry, Buffering & Drop-Oldest Behavior

Under network degradation or backend outages:
- Spans buffer in memory up to `maxBufferSize` (default `1000`).
- If full, the **`drop-oldest`** policy discards the oldest spans to accommodate newer telemetry without memory growth.
- Transient errors (`429 Too Many Requests`, `500 Internal Server Error`, `503 Service Unavailable`, `ECONNRESET`, `ECONNREFUSED`) are retried up to `maxRetries` (default 3) using exponential backoff with randomized jitter.
- The `Retry-After` header is respected when provided by the server.
- The host application is completely isolated from GHOST-STACK latency or outages.

---

## 10. Disabling the SDK (Circuit Breaker)

To completely disable the SDK in testing, staging, or emergency scenarios:

Set environment variable:
```bash
GHOSTSTACK_DISABLED=true
```

Or pass `disabled: true` in options:
```javascript
const client = ghoststack.init({
  serviceName: 'order-service',
  disabled: true,
});
```

When disabled:
- `startSpan()` returns a lightweight `NoopSpan` (< 1 µs overhead).
- Middleware simply calls `next()`.
- Background flush timers are never scheduled.
- Zero network requests are made.

---

## 11. Clean & Idempotent Shutdown

The SDK provides an idempotent shutdown method that flushes pending spans within a bounded timeout:

```javascript
// Graceful shutdown
await ghoststack.shutdown({ timeoutMs: 2000 });
```

- Background flush timers are cleared immediately.
- HTTP client instrumentation is restored.
- Pending spans in the buffer are flushed in a final bounded batch.
- If the backend is slow, the timeout fires and remaining sockets are cleanly destroyed.
- Subsequent calls to `shutdown()` resolve immediately without error.

---

## 12. Troubleshooting & Common Errors

### `ConfigError: serviceName is required`
- **Cause**: Neither `options.serviceName` nor `GHOSTSTACK_SERVICE_NAME` was provided.
- **Fix**: Specify `serviceName: 'your-service'` or export `GHOSTSTACK_SERVICE_NAME=your-service`.

### `ConfigError: An explicit endpoint is required in production`
- **Cause**: `NODE_ENV=production` or `environment='production'` without an explicit endpoint.
- **Fix**: Set `GHOSTSTACK_ENDPOINT=https://your-ghoststack-host:3000`.

### `ConfigError: apiKey is required in production`
- **Cause**: Production environment without a project ingestion key.
- **Fix**: Create an API key in the GHOST-STACK dashboard and export `GHOSTSTACK_API_KEY=gs_live_...`.

### `HTTP 401 Unauthorized during flush`
- **Cause**: The API key is invalid or has been revoked.
- **Fix**: Verify your project API key in the GHOST-STACK control plane.

---

## 13. Local GHOST-STACK Setup

1. Start your local GHOST-STACK backend on `http://localhost:3000`.
2. Create a project and generate an API key from the UI or REST API.
3. Configure your application:
   ```bash
   export GHOSTSTACK_SERVICE_NAME=my-local-service
   export GHOSTSTACK_ENVIRONMENT=development
   export GHOSTSTACK_ENDPOINT=http://localhost:3000
   export GHOSTSTACK_API_KEY=gs_live_your_dev_key
   ```
4. Start your application and send HTTP traffic. Spans will appear in GHOST-STACK immediately.

---

## 14. Production GHOST-STACK Setup

1. Deploy GHOST-STACK with HTTPS enabled.
2. In your production container / environment:
   ```bash
   export NODE_ENV=production
   export GHOSTSTACK_SERVICE_NAME=order-service
   export GHOSTSTACK_ENVIRONMENT=production
   export GHOSTSTACK_ENDPOINT=https://ghoststack.internal.company.com
   export GHOSTSTACK_API_KEY=gs_live_prod_secure_key
   ```
3. Initialize the SDK at the very beginning of your application entry point before other modules:
   ```javascript
   const ghoststack = require('@ghoststack/node');
   ghoststack.init();
   ```

---

## Diagnostics

Inspect live operational statistics at any time:

```javascript
const stats = ghoststack.getClient().getStats();
console.log(stats);
// {
//   eventsBuffered: 0,
//   eventsSent: 450,
//   eventsDropped: 0,
//   eventsFailed: 0,
//   eventsRetried: 1,
//   attributesTruncated: 0,
//   lastSuccessAt: '2026-09-23T04:50:12.123Z',
//   lastFailureAt: null
// }
```

---

## License

Apache-2.0
