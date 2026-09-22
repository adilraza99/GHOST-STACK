const OtlpSpanTranslator = require('../../../src/domain/adapters/OtlpSpanTranslator');

describe('OtlpSpanTranslator', () => {
  const sampleTraceId = '4bf92f3577b34da6a3ce929d0e0e4736';
  const sampleSpanId = '00f067aa0ba902b7';

  it('should translate a standard OTLP span into canonical telemetry format', () => {
    const span = {
      traceId: sampleTraceId,
      spanId: sampleSpanId,
      name: 'GET /api/checkout',
      kind: 3, // CLIENT
      startTimeUnixNano: '1726999999000000000',
      endTimeUnixNano: '1726999999045000000', // 45ms latency
      attributes: [
        { key: 'http.method', value: { stringValue: 'GET' } },
        { key: 'http.status_code', value: { intValue: 200 } },
        { key: 'peer.service', value: { stringValue: 'payment-service' } },
      ],
      status: { code: 1 },
    };

    const resourceAttrs = {
      'service.name': 'order-service',
      'deployment.environment.name': 'production',
    };

    const result = OtlpSpanTranslator.translateSpan(span, resourceAttrs, {
      projectId: 'proj-123',
    });

    expect(result.success).toBe(true);
    const event = result.data;
    expect(event.sourceService).toBe('order-service');
    expect(event.targetService).toBe('payment-service');
    expect(event.projectId).toBe('proj-123');
    expect(event.environment).toBe('production');
    expect(event.endpoint).toBe('GET /api/checkout');
    expect(event.method).toBe('GET');
    expect(event.statusCode).toBe(200);
    expect(event.latencyMs).toBe(45);
    expect(event.traceId).toBe(sampleTraceId);
    expect(event.requestId).toBe(sampleSpanId);
    expect(event.eventId).toBe(`otlp_${sampleTraceId}_${sampleSpanId}`);
  });

  it('should reject spans missing service.name', () => {
    const span = {
      traceId: sampleTraceId,
      spanId: sampleSpanId,
      name: 'GET /health',
      kind: 1,
    };

    const result = OtlpSpanTranslator.translateSpan(span, {}, { projectId: 'p1' });
    expect(result.success).toBe(false);
    expect(result.reason).toBe('MISSING_SERVICE_NAME');
  });

  it('should not manufacture HTTP 500 when no HTTP status code exists', () => {
    const span = {
      traceId: sampleTraceId,
      spanId: sampleSpanId,
      name: 'process_queue',
      kind: 1, // INTERNAL
      status: {
        code: 2, // ERROR
        message: 'Database timeout',
      },
    };

    const resourceAttrs = { 'service.name': 'worker-service' };
    const result = OtlpSpanTranslator.translateSpan(span, resourceAttrs, { projectId: 'p1' });

    expect(result.success).toBe(true);
    expect(result.data.statusCode).toBeNull(); // Must NOT invent 500!
    expect(result.data.metadata.otlp.status).toEqual({
      code: 2,
      message: 'Database timeout',
    });
  });

  it('should preserve INTERNAL spans without creating false cross-service dependencies', () => {
    const span = {
      traceId: sampleTraceId,
      spanId: sampleSpanId,
      name: 'compute_hash',
      kind: 'SPAN_KIND_INTERNAL',
      startTimeUnixNano: '1726999999000000000',
      endTimeUnixNano: '1726999999010000000',
      attributes: [
        { key: 'peer.service', value: { stringValue: 'should-be-ignored-for-internal' } },
      ],
    };

    const resourceAttrs = { 'service.name': 'crypto-service' };
    const result = OtlpSpanTranslator.translateSpan(span, resourceAttrs);

    expect(result.success).toBe(true);
    expect(result.data.sourceService).toBe('crypto-service');
    expect(result.data.targetService).toBeNull(); // No false dependency!
    expect(result.data.latencyMs).toBe(10);
  });

  it('should not treat db.system alone as targetService', () => {
    const span = {
      traceId: sampleTraceId,
      spanId: sampleSpanId,
      name: 'find_user',
      kind: 3, // CLIENT
      attributes: [
        { key: 'db.system', value: { stringValue: 'mongodb' } },
        { key: 'db.name', value: { stringValue: 'users' } },
      ],
    };

    const resourceAttrs = { 'service.name': 'user-service' };
    const result = OtlpSpanTranslator.translateSpan(span, resourceAttrs);

    expect(result.success).toBe(true);
    expect(result.data.targetService).toBeNull(); // Not "mongodb"!
    expect(result.data.metadata.dbSystem).toBe('mongodb');
    expect(result.data.dependencyType).toBe('database');
  });

  it('should prefer peer.service for CLIENT spans', () => {
    const span = {
      traceId: sampleTraceId,
      spanId: sampleSpanId,
      name: 'call_auth',
      kind: 3, // CLIENT
      attributes: [
        { key: 'peer.service', value: { stringValue: 'auth-service' } },
        { key: 'http.host', value: { stringValue: 'auth.internal' } },
      ],
    };

    const resourceAttrs = { 'service.name': 'gateway' };
    const result = OtlpSpanTranslator.translateSpan(span, resourceAttrs);

    expect(result.success).toBe(true);
    expect(result.data.targetService).toBe('auth-service');
  });

  it('should fallback to http.host or server.address if peer.service is absent on CLIENT span', () => {
    const span = {
      traceId: sampleTraceId,
      spanId: sampleSpanId,
      name: 'call_external',
      kind: 3, // CLIENT
      attributes: [
        { key: 'server.address', value: { stringValue: 'api.stripe.com' } },
      ],
    };

    const resourceAttrs = { 'service.name': 'billing' };
    const result = OtlpSpanTranslator.translateSpan(span, resourceAttrs);

    expect(result.success).toBe(true);
    expect(result.data.targetService).toBe('api.stripe.com');
  });

  it('should prefer deployment.environment.name over legacy deployment.environment', () => {
    const span = {
      traceId: sampleTraceId,
      spanId: sampleSpanId,
      name: 'test',
      kind: 1,
    };

    const resourceAttrs = {
      'service.name': 'svc',
      'deployment.environment': 'staging-legacy',
      'deployment.environment.name': 'staging-modern',
    };

    const result = OtlpSpanTranslator.translateSpan(span, resourceAttrs);
    expect(result.success).toBe(true);
    expect(result.data.environment).toBe('staging-modern');
  });

  it('should never allow OTLP resource attributes to overwrite authenticated projectId', () => {
    const span = {
      traceId: sampleTraceId,
      spanId: sampleSpanId,
      name: 'test',
      kind: 1,
    };

    const resourceAttrs = {
      'service.name': 'svc',
      'projectId': 'malicious-project',
      'project.id': 'attacker-project',
    };

    const result = OtlpSpanTranslator.translateSpan(span, resourceAttrs, {
      projectId: 'authenticated-project-id',
    });

    expect(result.success).toBe(true);
    expect(result.data.projectId).toBe('authenticated-project-id');
  });

  it('should handle translateBatch with multiple ResourceSpans and track rejections', () => {
    const batch = [
      {
        resource: {
          attributes: [
            { key: 'service.name', value: { stringValue: 'service-a' } },
          ],
        },
        scopeSpans: [
          {
            spans: [
              {
                traceId: '11111111111111111111111111111111',
                spanId: '2222222222222222',
                name: 'span-1',
                kind: 1,
              },
              {
                traceId: '11111111111111111111111111111111',
                spanId: '3333333333333333',
                name: 'span-2',
                kind: 2,
              },
            ],
          },
        ],
      },
      {
        resource: {
          // Missing service.name!
          attributes: [
            { key: 'some.attr', value: { stringValue: 'val' } },
          ],
        },
        scopeSpans: [
          {
            spans: [
              {
                traceId: '44444444444444444444444444444444',
                spanId: '5555555555555555',
                name: 'rejected-span',
                kind: 1,
              },
            ],
          },
        ],
      },
    ];

    const result = OtlpSpanTranslator.translateBatch(batch, { projectId: 'my-proj' });

    expect(result.events.length).toBe(2);
    expect(result.events[0].sourceService).toBe('service-a');
    expect(result.events[0].requestId).toBe('2222222222222222');
    expect(result.events[1].requestId).toBe('3333333333333333');
    expect(result.rejectedCount).toBe(1);
    expect(result.rejections[0].reason).toBe('MISSING_SERVICE_NAME');
    expect(result.rejections[0].spanId).toBe('5555555555555555');
  });

  it('should accurately parse nanosecond timestamps using BigInt without precision loss', () => {
    // 1726999999123456789 ns -> 1726999999123 ms
    const span = {
      traceId: sampleTraceId,
      spanId: sampleSpanId,
      name: 'precision_test',
      kind: 1,
      startTimeUnixNano: '1726999999123456789',
      endTimeUnixNano: '1726999999153456789', // 30ms later
    };

    const result = OtlpSpanTranslator.translateSpan(span, { 'service.name': 's' });
    expect(result.success).toBe(true);
    expect(result.data.timestamp.getTime()).toBe(1726999999123);
    expect(result.data.latencyMs).toBe(30);
  });
});
