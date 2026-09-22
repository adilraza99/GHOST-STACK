/**
 * Asynchronous OTLP HTTP/HTTPS Transport for @ghoststack/node.
 *
 * Implements:
 * 1. Hard network timeouts with active socket destruction.
 * 2. Distinction between transient (retryable) and permanent (non-retryable) errors.
 * 3. Exponential backoff with randomized jitter and bounded Retry-After handling.
 * 4. Internal header injection (X-GhostStack-Internal) to prevent self-instrumentation.
 * 5. Full asynchronous transmission: never blocks host application request path.
 */

const http = require('http');
const https = require('https');

class Transport {
  /**
   * @param {object} options
   * @param {string} options.endpoint - Normalized /v1/traces URL
   * @param {string} options.apiKey - GhostStack API key
   * @param {string} options.serviceName - Registered service name
   * @param {string} options.environment - Deployment environment
   * @param {string} [options.serviceVersion]
   * @param {number} [options.timeoutMs=3000]
   * @param {number} [options.maxRetries=3]
   * @param {number} [options.maxRetryDelayMs=10000]
   * @param {boolean} [options.debug=false]
   * @param {import('./stats')} [options.stats]
   */
  constructor({
    endpoint,
    apiKey,
    serviceName,
    environment,
    serviceVersion = null,
    timeoutMs = 3000,
    maxRetries = 3,
    maxRetryDelayMs = 10000,
    debug = false,
    stats = null,
  }) {
    this.endpoint = endpoint;
    this.apiKey = apiKey;
    this.serviceName = serviceName;
    this.environment = environment;
    this.serviceVersion = serviceVersion;
    this.timeoutMs = timeoutMs;
    this.maxRetries = maxRetries;
    this.maxRetryDelayMs = maxRetryDelayMs;
    this.debug = debug;
    this.stats = stats;
    this.isShutdown = false;
    this.activeRequests = new Set();
  }

  /**
   * Sends a batch of spans asynchronously with retry and backoff.
   *
   * @param {Array<import('./span').Span>} spans
   * @returns {Promise<boolean>} True if delivered, false if failed/dropped
   */
  async sendBatch(spans) {
    if (!spans || spans.length === 0 || this.isShutdown) {
      return false;
    }

    const payload = this.formatOtlpPayload(spans);
    const bodyStr = JSON.stringify(payload);

    let attempt = 0;
    while (attempt <= this.maxRetries && !this.isShutdown) {
      try {
        const result = await this._sendHttpRequest(bodyStr);

        if (result.status >= 200 && result.status < 300) {
          if (this.stats) {
            this.stats.recordSent(spans.length);
          }
          if (this.debug) {
            console.debug(`[@ghoststack/node] Sent batch of ${spans.length} spans successfully.`);
          }
          return true;
        }

        // Check if non-retryable error
        if (this.isPermanentError(result.status)) {
          if (this.stats) {
            this.stats.recordFailed(spans.length);
          }
          if (this.debug) {
            console.debug(`[@ghoststack/node] Permanent error HTTP ${result.status}. Discarding batch.`);
          }
          return false;
        }

        // Retryable error (429, 5xx)
        attempt++;
        if (attempt <= this.maxRetries && !this.isShutdown) {
          if (this.stats) this.stats.recordRetried(1);
          const delay = this.calculateBackoff(attempt, result.headers);
          if (this.debug) {
            console.debug(`[@ghoststack/node] Transient HTTP ${result.status}. Retrying attempt ${attempt}/${this.maxRetries} in ${delay}ms.`);
          }
          await this.sleep(delay);
        }
      } catch (err) {
        // Network errors, timeouts, connection refused
        attempt++;
        if (attempt <= this.maxRetries && !this.isShutdown) {
          if (this.stats) this.stats.recordRetried(1);
          const delay = this.calculateBackoff(attempt);
          if (this.debug) {
            console.debug(`[@ghoststack/node] Network error (${err.message}). Retrying attempt ${attempt}/${this.maxRetries} in ${delay}ms.`);
          }
          await this.sleep(delay);
        } else {
          if (this.stats) {
            this.stats.recordFailed(spans.length);
          }
          return false;
        }
      }
    }

    if (this.stats) {
      this.stats.recordFailed(spans.length);
    }
    return false;
  }

  /**
   * Low-level HTTP/HTTPS request with hard timeout.
   *
   * @param {string} bodyStr
   * @returns {Promise<{ status: number, headers: object, data: string }>}
   */
  _sendHttpRequest(bodyStr) {
    return new Promise((resolve, reject) => {
      const url = new URL(this.endpoint);
      const isHttps = url.protocol === 'https:';
      const client = isHttps ? https : http;

      const headers = {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(bodyStr),
        'User-Agent': 'ghoststack-node-sdk/0.1.0',
        'X-GhostStack-Internal': '1', // Prevents self-instrumentation recursion
      };

      if (this.apiKey) {
        headers['X-GhostStack-Key'] = this.apiKey;
      }

      const reqOptions = {
        method: 'POST',
        hostname: url.hostname,
        port: url.port || (isHttps ? 443 : 80),
        path: url.pathname + url.search,
        headers,
      };

      let timer = null;
      const req = client.request(reqOptions, (res) => {
        let resData = '';
        res.setEncoding('utf8');

        res.on('data', (chunk) => {
          resData += chunk;
        });

        res.on('end', () => {
          if (timer) clearTimeout(timer);
          this.activeRequests.delete(req);
          resolve({
            status: res.statusCode || 500,
            headers: res.headers,
            data: resData,
          });
        });
      });

      this.activeRequests.add(req);

      // Hard timeout enforcement
      timer = setTimeout(() => {
        req.destroy(new Error(`GHOST-STACK transport timeout after ${this.timeoutMs}ms`));
      }, this.timeoutMs);

      // Prevent timer from keeping the process alive
      if (timer.unref) timer.unref();

      req.on('error', (err) => {
        if (timer) clearTimeout(timer);
        this.activeRequests.delete(req);
        reject(err);
      });

      req.write(bodyStr);
      req.end();
    });
  }

  /**
   * Identifies permanent non-retryable HTTP status codes.
   */
  isPermanentError(status) {
    // 400 (Bad Request), 401 (Unauthorized), 403 (Forbidden), 415 (Unsupported Media Type), 501 (Not Implemented)
    return status === 400 || status === 401 || status === 403 || status === 415 || status === 501;
  }

  /**
   * Calculates exponential backoff with randomized jitter and Retry-After support.
   */
  calculateBackoff(attempt, headers = {}) {
    // Check Retry-After
    if (headers && headers['retry-after']) {
      const retryAfter = headers['retry-after'];
      let delaySeconds = Number(retryAfter);
      if (!isNaN(delaySeconds) && delaySeconds > 0) {
        const cappedMs = Math.min(delaySeconds * 1000, this.maxRetryDelayMs);
        const jitter = Math.floor(Math.random() * 300);
        return cappedMs + jitter;
      }
    }

    // Exponential backoff: base 200ms * 2^(attempt - 1)
    const baseDelay = 200 * Math.pow(2, attempt - 1);
    const capped = Math.min(baseDelay, this.maxRetryDelayMs);
    const jitter = Math.floor(Math.random() * (capped * 0.3));
    return capped + jitter;
  }

  sleep(ms) {
    return new Promise((resolve) => {
      const timer = setTimeout(resolve, ms);
      if (timer.unref) timer.unref();
    });
  }

  /**
   * Formats internal spans into standard OTLP ExportTraceServiceRequest JSON.
   */
  formatOtlpPayload(spans) {
    const resourceAttributes = [
      { key: 'service.name', value: { stringValue: this.serviceName } },
      { key: 'deployment.environment.name', value: { stringValue: this.environment } },
    ];

    if (this.serviceVersion) {
      resourceAttributes.push({
        key: 'service.version',
        value: { stringValue: this.serviceVersion },
      });
    }

    return {
      resourceSpans: [
        {
          resource: {
            attributes: resourceAttributes,
          },
          scopeSpans: [
            {
              scope: {
                name: '@ghoststack/node',
                version: '0.1.0',
              },
              spans: spans.map((s) => s.toOtlpSpan()),
            },
          ],
        },
      ],
    };
  }

  /**
   * Aborts all in-flight network requests and shuts down transport.
   */
  abort() {
    this.isShutdown = true;
    for (const req of this.activeRequests) {
      try {
        req.destroy(new Error('GHOST-STACK client shutdown'));
      } catch (_err) {
        // ignore cleanup error
      }
    }
    this.activeRequests.clear();
  }
}

module.exports = Transport;
