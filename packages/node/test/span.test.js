const { Span, NoopSpan } = require('../src/span');
const SDKStats = require('../src/stats');

describe('Span & Telemetry Creation (Correction 7 & 8)', () => {
  it('should initialize a valid Span with W3C IDs and attributes', () => {
    const span = new Span({
      name: 'GET /orders',
      kind: 'SERVER',
      targetService: 'order-service',
      attributes: {
        'custom.attr': 'val1',
      },
    });

    expect(span.name).toBe('GET /orders');
    expect(span.kind).toBe(2); // SERVER
    expect(span.traceId).toMatch(/^[0-9a-f]{32}$/);
    expect(span.spanId).toMatch(/^[0-9a-f]{16}$/);
    expect(span.attributes['peer.service']).toBe('order-service');
    expect(span.attributes['custom.attr']).toBe('val1');
    expect(span.ended).toBe(false);
  });

  it('should record errors safely without leaking stack secrets or request bodies (Correction 8)', () => {
    const span = new Span({ name: 'failing-operation' });
    const err = new Error('Database connection failed for user=admin with password=secret');
    err.code = 'ECONNREFUSED';

    span.recordError(err);

    expect(span.attributes['error.type']).toBe('Error');
    expect(span.attributes['error.code']).toBe('ECONNREFUSED');
    expect(span.attributes['error.message']).toContain('Database connection failed');
    expect(span.status.code).toBe(2); // ERROR

    // Verify request / response bodies were NOT added
    expect(span.attributes['http.request.body']).toBeUndefined();
    expect(span.attributes['http.response.body']).toBeUndefined();
  });

  it('should NEVER include API key in span attributes or OTLP payload (Correction 7)', () => {
    const fakeKey = 'gh_live_supersecretapikey987654321';
    process.env.GHOSTSTACK_API_KEY = fakeKey;

    const span = new Span({
      name: 'secure-op',
      attributes: {
        'service.name': 'checkout',
      },
    });
    span.end();

    const otlp = span.toOtlpSpan();
    const serialized = JSON.stringify(otlp);

    expect(serialized).not.toContain(fakeKey);
    delete process.env.GHOSTSTACK_API_KEY;
  });

  it('should invoke onEnd callback when span.end() is called', () => {
    let endedSpan = null;
    const span = new Span({
      name: 'op',
      onEnd: (s) => { endedSpan = s; },
    });

    span.end();
    expect(span.ended).toBe(true);
    expect(endedSpan).toBe(span);
    expect(span.endTimeUnixNano).toBeDefined();
  });

  it('should convert span to standard OTLP JSON format', () => {
    const span = new Span({
      name: 'test-span',
      kind: 'CLIENT',
      attributes: {
        'str.key': 'str_val',
        'int.key': 42,
        'bool.key': true,
        'arr.key': ['a', 'b'],
      },
    });
    span.setStatus({ code: 'OK' });
    span.end();

    const otlp = span.toOtlpSpan();

    expect(otlp.name).toBe('test-span');
    expect(otlp.kind).toBe(3); // CLIENT
    expect(otlp.traceId).toBe(span.traceId);
    expect(otlp.spanId).toBe(span.spanId);
    expect(otlp.status.code).toBe(1); // OK

    const attrMap = {};
    for (const attr of otlp.attributes) {
      attrMap[attr.key] = attr.value;
    }

    expect(attrMap['str.key']).toEqual({ stringValue: 'str_val' });
    expect(attrMap['int.key']).toEqual({ intValue: 42 });
    expect(attrMap['bool.key']).toEqual({ boolValue: true });
    expect(attrMap['arr.key'].arrayValue.values).toHaveLength(2);
  });

  it('should provide a functioning NoopSpan for disabled mode', () => {
    const noop = new NoopSpan();
    expect(noop.ended).toBe(true);
    expect(noop.setAttribute('a', 'b')).toBe(noop);
    expect(noop.recordError(new Error('test'))).toBe(noop);
    expect(noop.toOtlpSpan()).toBeNull();
  });
});
