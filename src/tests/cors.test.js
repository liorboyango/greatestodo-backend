/**
 * Tests for CORS configuration.
 */

const { ALLOWED_ORIGINS } = require('../config/cors');

describe('CORS Configuration', () => {
  it('should include localhost:3000 as an allowed origin', () => {
    expect(ALLOWED_ORIGINS).toContain('http://localhost:3000');
  });

  it('should include GitHub Pages as an allowed origin', () => {
    expect(ALLOWED_ORIGINS).toContain('https://liorboyango.github.io');
  });

  it('should have at least 2 allowed origins', () => {
    expect(ALLOWED_ORIGINS.length).toBeGreaterThanOrEqual(2);
  });
});
