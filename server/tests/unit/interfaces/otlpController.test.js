const { createOtlpController } = require('../../../src/interfaces/http/controllers/otlpController');

describe('OtlpController Unit Tests', () => {
  let mockTelemetryService;
  let ctrl;
  const sampleTraceId = '0123456789abcdef0123456789abcdef';
  const sampleSpanId = '0123456789abcdef';

  beforeEach(() => {
    mockTelemetryService = {
      process: vi.fn().mockResolvedValue({}),
    };
    ctrl = createOtlpController({
      telemetryProcessingService: mockTelemetryService,
      config: {
        otlp: {
          maxSpansPerRequest: 10,
        },
      },
    });
  });

  function createMockReqRes(body = {}, headers = {}, ghostStack = { projectId: 'proj-unit' }) {
    const req = {
      body,
      headers: { ...headers },
      ghostStack,
    };
    const res = {
      statusCode: 200,
      data: null,
      status(code) {
        this.statusCode = code;
        return this;
      },
      json(payload) {
        this.data = payload;
        return this;
      },
    };
    return { req, res };
  }

  it('should ingest valid OTLP JSON traces and feed TelemetryProcessingService', async () => {
    const payload = {
      resourceSpans: [
        {
          resource: {
            attributes: [
              { key: 'service.name', value: { stringValue: 'order-service' } },
            ],
          },
          scopeSpans: [
            {
              spans: [
                {
                  traceId: sampleTraceId,
                  spanId: sampleSpanId,
                  name: 'GET /orders',
                  kind: 2,
                  startTimeUnixNano: '1726999999000000000',
                  endTimeUnixNano: '1726999999020000000',
                },
              ],
            },
          ],
        },
      ],
    };

    const { req, res } = createMockReqRes(payload);
    await ctrl.ingestTraces(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.data).toEqual({
      partialSuccess: {
        rejectedSpans: 0,
      },
    });

    expect(mockTelemetryService.process).toHaveBeenCalledTimes(1);
    const passedEvent = mockTelemetryService.process.mock.calls[0][0];
    expect(passedEvent.sourceService).toBe('order-service');
    expect(passedEvent.projectId).toBe('proj-unit');
    expect(passedEvent.endpoint).toBe('GET /orders');
  });

  it('should report partialSuccess when a span is missing service.name', async () => {
    const payload = {
      resourceSpans: [
        {
          resource: {
            attributes: [], // missing service.name
          },
          scopeSpans: [
            {
              spans: [
                {
                  traceId: sampleTraceId,
                  spanId: sampleSpanId,
                  name: 'GET /broken',
                },
              ],
            },
          ],
        },
      ],
    };

    const { req, res } = createMockReqRes(payload);
    await ctrl.ingestTraces(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.data.partialSuccess.rejectedSpans).toBe(1);
    expect(res.data.partialSuccess.errorMessage).toMatch(/missing service\.name/);
    expect(mockTelemetryService.process).not.toHaveBeenCalled();
  });

  it('should enforce maxSpansPerRequest limit and reject with 400', async () => {
    const spans = Array.from({ length: 11 }, (_, i) => ({
      traceId: sampleTraceId,
      spanId: `span_${i}`,
      name: `span_${i}`,
    }));

    const payload = {
      resourceSpans: [
        {
          resource: {
            attributes: [{ key: 'service.name', value: { stringValue: 'big-batch' } }],
          },
          scopeSpans: [{ spans }],
        },
      ],
    };

    const { req, res } = createMockReqRes(payload);
    await ctrl.ingestTraces(req, res);

    expect(res.statusCode).toBe(400);
    expect(res.data.error.code).toBe('SPAN_LIMIT_EXCEEDED');
    expect(mockTelemetryService.process).not.toHaveBeenCalled();
  });

  it('should return 400 when given a malformed protobuf buffer', async () => {
    // Truncated protobuf tag
    const truncatedBuffer = Buffer.from([0x0a, 0x50, 0x01, 0x02]);
    const { req, res } = createMockReqRes(truncatedBuffer, {
      'content-type': 'application/x-protobuf',
    });

    await ctrl.ingestTraces(req, res);

    expect(res.statusCode).toBe(400);
    expect(res.data.error.code).toBe('MALFORMED_PROTOBUF');
  });

  it('should return 501 NOT_IMPLEMENTED for metrics ingestion', async () => {
    const { req, res } = createMockReqRes({});
    await ctrl.rejectMetrics(req, res);

    expect(res.statusCode).toBe(501);
    expect(res.data.error.code).toBe('NOT_IMPLEMENTED');
    expect(res.data.error.message).toMatch(/Metrics ingestion is not supported/);
  });

  it('should return 501 NOT_IMPLEMENTED for logs ingestion', async () => {
    const { req, res } = createMockReqRes({});
    await ctrl.rejectLogs(req, res);

    expect(res.statusCode).toBe(501);
    expect(res.data.error.code).toBe('NOT_IMPLEMENTED');
    expect(res.data.error.message).toMatch(/Logs ingestion is not supported/);
  });
});
