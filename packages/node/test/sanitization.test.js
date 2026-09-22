const {
  isSensitiveHeader,
  sanitizeHeaders,
  sanitizeUrl,
  sanitizePath,
  normalizeTargetService,
  sanitizeAttributes,
  LIMITS,
} = require('../src/sanitization');
const SDKStats = require('../src/stats');

describe('Sanitization & Sensitive Data Protection', () => {
  describe('Header Sanitization', () => {
    it('should identify sensitive headers case-insensitively', () => {
      expect(isSensitiveHeader('Authorization')).toBe(true);
      expect(isSensitiveHeader('authorization')).toBe(true);
      expect(isSensitiveHeader('AUTHORIZATION')).toBe(true);
      expect(isSensitiveHeader('Cookie')).toBe(true);
      expect(isSensitiveHeader('Set-Cookie')).toBe(true);
      expect(isSensitiveHeader('X-GhostStack-Key')).toBe(true);
      expect(isSensitiveHeader('x-api-key')).toBe(true);
      expect(isSensitiveHeader('Content-Type')).toBe(false);
      expect(isSensitiveHeader('Accept')).toBe(false);
    });

    it('should scrub sensitive headers from header objects', () => {
      const headers = {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer secret-token-12345',
        'Cookie': 'session=abcdef',
        'X-GhostStack-Key': 'gh_live_secretkey',
        'X-Custom-Header': 'safe-value',
      };

      const sanitized = sanitizeHeaders(headers);

      expect(sanitized['content-type']).toBe('application/json');
      expect(sanitized['x-custom-header']).toBe('safe-value');
      expect(sanitized['authorization']).toBeUndefined();
      expect(sanitized['cookie']).toBeUndefined();
      expect(sanitized['x-ghoststack-key']).toBeUndefined();
    });
  });

  describe('URL & Path Sanitization (Correction 10)', () => {
    it('should strip basic auth credentials from URLs', () => {
      const url = 'https://admin:supersecret@payment.internal/v1/charge';
      expect(sanitizeUrl(url)).toBe('https://payment.internal/v1/charge');
    });

    it('should redact sensitive query parameters in absolute URLs', () => {
      const url = 'https://api.stripe.com/v1/charges?token=tok_12345&amount=5000&api_key=sk_test_999';
      const clean = sanitizeUrl(url);

      expect(clean).toContain('amount=5000');
      expect(clean).toContain('token=%5BREDACTED%5D');
      expect(clean).toContain('api_key=%5BREDACTED%5D');
      expect(clean).not.toContain('tok_12345');
      expect(clean).not.toContain('sk_test_999');
    });

    it('should redact sensitive query parameters in relative paths', () => {
      const path = '/api/checkout?session_id=123&secret=my_secret_token&cartId=45';
      const clean = sanitizePath(path);

      expect(clean).toContain('cartId=45');
      expect(clean).toContain('secret=%5BREDACTED%5D');
      expect(clean).toContain('session_id=%5BREDACTED%5D');
      expect(clean).not.toContain('my_secret_token');
    });

    it('should handle URL-encoded and mixed-case sensitive parameters', () => {
      const url = 'https://example.com/api?API_KEY=mykey&AccessToken=abc';
      const clean = sanitizeUrl(url);

      expect(clean).toContain('API_KEY=%5BREDACTED%5D');
      expect(clean).toContain('AccessToken=%5BREDACTED%5D');
      expect(clean).not.toContain('mykey');
      expect(clean).not.toContain('abc');
    });
  });

  describe('Stable Dependency Target Identity (Correction 11)', () => {
    it('should extract clean host identity from URL without path or query params', () => {
      const url = 'https://payment-service.internal:8443/api/v2/pay/order-12345?token=xyz';
      expect(normalizeTargetService(url)).toBe('payment-service.internal:8443');
    });

    it('should extract host from http options object', () => {
      const opts = {
        hostname: 'inventory-service',
        port: 9000,
        path: '/items/999',
      };
      expect(normalizeTargetService(opts)).toBe('inventory-service:9000');
    });

    it('should strip credentials if embedded in host', () => {
      expect(normalizeTargetService('user:pass@auth-service.prod:443'))
        .toBe('auth-service.prod:443');
    });
  });

  describe('Attribute Bounding & Scrubbing (Correction 9)', () => {
    it('should scrub sensitive attribute keys', () => {
      const raw = {
        'user.id': 123,
        'password': 'plaintextPassword',
        'auth.token': 'jwt.token.here',
        'apiKey': 'secret-key',
        'app.name': 'checkout',
      };

      const clean = sanitizeAttributes(raw);

      expect(clean['user.id']).toBe(123);
      expect(clean['app.name']).toBe('checkout');
      expect(clean['password']).toBe('[REDACTED]');
      expect(clean['auth.token']).toBe('[REDACTED]');
      expect(clean['apiKey']).toBe('[REDACTED]');
    });

    it('should truncate strings exceeding maxStringLength', () => {
      const stats = new SDKStats();
      const longStr = 'a'.repeat(2000);
      const clean = sanitizeAttributes({ 'long.text': longStr }, stats);

      expect(clean['long.text'].length).toBe(LIMITS.maxStringLength);
      expect(stats.attributesTruncated).toBeGreaterThan(0);
    });

    it('should bound array length and object depth', () => {
      const stats = new SDKStats();
      const deepObj = {
        l1: {
          l2: {
            l3: {
              l4: {
                l5: 'too deep',
              },
            },
          },
        },
      };

      const clean = sanitizeAttributes(deepObj, stats);
      expect(clean.l1.l2.l3.l4).toBe('[TRUNCATED_DEPTH]');
      expect(stats.attributesTruncated).toBeGreaterThan(0);
    });

    it('should cap total attribute count at maxAttributes', () => {
      const stats = new SDKStats();
      const largeDict = {};
      for (let i = 0; i < 100; i++) {
        largeDict[`attr_${i}`] = i;
      }

      const clean = sanitizeAttributes(largeDict, stats);
      expect(Object.keys(clean).length).toBe(LIMITS.maxAttributes);
      expect(stats.attributesTruncated).toBeGreaterThan(0);
    });
  });
});
