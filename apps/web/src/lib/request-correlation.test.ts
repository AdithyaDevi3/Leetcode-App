import { describe, expect, it } from 'vitest';
import { getOrCreateRequestId } from './request-correlation';

describe('request correlation', () => {
  it('preserves a safe incoming request ID', () => {
    expect(getOrCreateRequestId('request_id-123456')).toBe('request_id-123456');
  });

  it('generates a replacement for missing or unsafe IDs', () => {
    expect(getOrCreateRequestId(undefined, () => 'generated-request-1')).toBe('generated-request-1');
    expect(getOrCreateRequestId('<script>alert(1)</script>', () => 'generated-request-2')).toBe('generated-request-2');
  });
});
