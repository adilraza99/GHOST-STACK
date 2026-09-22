const {
  parseTraceparent,
  generateTraceId,
  generateSpanId,
  formatTraceparent,
  injectTraceContext,
} = require('../src/traceContext');

describe('W3C Trace Context (Correction 5 & 6)', () => {
  const validTraceId = '4bf92f3577b34da6a3ce929d0e0e4736';
  const validSpanId = '00f067aa0ba902b7';

  describe('parseTraceparent', () => {
    it('should parse a valid sampled traceparent', () => {
      const header = `00-${validTraceId}-${validSpanId}-01`;
      const parsed = parseTraceparent(header);

      expect(parsed).not.toBeNull();
      expect(parsed.version).toBe('00');
      expect(parsed.traceId).toBe(validTraceId);
      expect(parsed.parentId).toBe(validSpanId);
      expect(parsed.traceFlags).toBe('01');
      expect(parsed.sampled).toBe(true);
    });

    it('should parse a valid unsampled traceparent', () => {
      const header = `00-${validTraceId}-${validSpanId}-00`;
      const parsed = parseTraceparent(header);

      expect(parsed).not.toBeNull();
      expect(parsed.sampled).toBe(false);
    });

    it('should reject version ff per W3C specification', () => {
      const header = `ff-${validTraceId}-${validSpanId}-01`;
      expect(parseTraceparent(header)).toBeNull();
    });

    it('should reject all-zero traceId per W3C specification', () => {
      const allZeroTrace = '00000000000000000000000000000000';
      const header = `00-${allZeroTrace}-${validSpanId}-01`;
      expect(parseTraceparent(header)).toBeNull();
    });

    it('should reject all-zero parentId (spanId) per W3C specification', () => {
      const allZeroSpan = '0000000000000000';
      const header = `00-${validTraceId}-${allZeroSpan}-01`;
      expect(parseTraceparent(header)).toBeNull();
    });

    it('should reject malformed hex characters', () => {
      const malformed = '00-zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz-00f067aa0ba902b7-01';
      expect(parseTraceparent(malformed)).toBeNull();
    });

    it('should reject invalid lengths', () => {
      // traceId too short (31 chars instead of 32)
      const shortTrace = `00-${validTraceId.slice(0, 31)}-${validSpanId}-01`;
      expect(parseTraceparent(shortTrace)).toBeNull();

      // spanId too short (15 chars instead of 16)
      const shortSpan = `00-${validTraceId}-${validSpanId.slice(0, 15)}-01`;
      expect(parseTraceparent(shortSpan)).toBeNull();
    });

    it('should return null for null, undefined, or empty string', () => {
      expect(parseTraceparent(null)).toBeNull();
      expect(parseTraceparent(undefined)).toBeNull();
      expect(parseTraceparent('')).toBeNull();
    });
  });

  describe('ID Generation', () => {
    it('should generate 32-hex character traceId that is never all-zero', () => {
      const id = generateTraceId();
      expect(id).toMatch(/^[0-9a-f]{32}$/);
      expect(id).not.toBe('00000000000000000000000000000000');
    });

    it('should generate 16-hex character spanId that is never all-zero', () => {
      const id = generateSpanId();
      expect(id).toMatch(/^[0-9a-f]{16}$/);
      expect(id).not.toBe('0000000000000000');
    });
  });

  describe('Context Propagation (Correction 6)', () => {
    it('should format valid W3C traceparent string', () => {
      const tp = formatTraceparent(validTraceId, validSpanId, true);
      expect(tp).toBe(`00-${validTraceId}-${validSpanId}-01`);
    });

    it('should inject ONLY traceparent into headers without copying sensitive data', () => {
      const headers = {
        'Content-Type': 'application/json',
      };

      const injected = injectTraceContext(headers, validTraceId, validSpanId, true);
      expect(injected['traceparent']).toBe(`00-${validTraceId}-${validSpanId}-01`);
      expect(injected['authorization']).toBeUndefined();
      expect(injected['cookie']).toBeUndefined();
      expect(injected['x-ghoststack-key']).toBeUndefined();
    });
  });
});
