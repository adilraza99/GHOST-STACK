export interface GhostStackConfig {
  apiKey?: string;
  serviceName: string;
  environment?: string;
  serviceVersion?: string;
  endpoint?: string;
  sampleRate?: number;
  batchSize?: number;
  flushIntervalMs?: number;
  maxBufferSize?: number;
  timeoutMs?: number;
  maxRetries?: number;
  maxRetryDelayMs?: number;
  disabled?: boolean;
  debug?: boolean;
  retainErrors?: boolean;
  instrumentHttp?: boolean;
}

export interface SpanOptions {
  kind?: 'INTERNAL' | 'SERVER' | 'CLIENT' | 'PRODUCER' | 'CONSUMER';
  traceId?: string;
  parentSpanId?: string;
  targetService?: string;
  attributes?: Record<string, any>;
}

export interface Span {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  setAttribute(key: string, value: any): this;
  setAttributes(attrs: Record<string, any>): this;
  setStatus(status: { code: 'OK' | 'ERROR' | 'UNSET'; message?: string }): this;
  recordError(err: Error | string): this;
  end(endTime?: Date | number | string): void;
}

export interface SDKStats {
  eventsBuffered: number;
  eventsSent: number;
  eventsDropped: number;
  eventsFailed: number;
  eventsRetried: number;
  attributesTruncated: number;
  lastSuccessAt: string | null;
  lastFailureAt: string | null;
}

export class ConfigError extends Error {
  constructor(message: string);
}

export class GhostStackClient {
  constructor(options?: GhostStackConfig);
  startSpan(name: string, options?: SpanOptions): Span;
  getActiveSpan(): Span | null;
  withSpan<T>(span: Span, fn: () => T): T;
  flush(): Promise<void>;
  middleware(): (req: any, res: any, next: (err?: any) => void) => void;
  instrumentHttp(): this;
  uninstrumentHttp(): this;
  getStats(): SDKStats;
  shutdown(options?: { timeoutMs?: number }): Promise<void>;
}

export function init(options?: GhostStackConfig): GhostStackClient;
export function getClient(): GhostStackClient | null;
export function shutdown(options?: { timeoutMs?: number }): Promise<void>;
export function middleware(): (req: any, res: any, next: (err?: any) => void) => void;
export function parseTraceparent(header: string): { version: string; traceId: string; parentId: string; traceFlags: string; sampled: boolean } | null;
export function formatTraceparent(traceId: string, spanId: string, sampled?: boolean): string;
export function injectTraceContext(headers: Record<string, any>, traceId: string, spanId: string, sampled?: boolean): Record<string, any>;
export function getActiveSpan(): Span | null;
export function runWithSpan<T>(span: Span, fn: () => T): T;
