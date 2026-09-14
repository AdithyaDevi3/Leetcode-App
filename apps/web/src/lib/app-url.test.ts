import { describe, expect, it } from 'vitest';

import { applicationUrl, safeAppDestination } from './app-url';

describe('application URL routing', () => {
  it('uses the explicitly configured canonical URL without a path or trailing slash', () => {
    expect(applicationUrl({ NEXT_PUBLIC_APP_URL: 'https://corsair-tech-leetbot.vercel.app/ignored/' }))
      .toBe('https://corsair-tech-leetbot.vercel.app');
  });

  it('uses the current Vercel deployment URL for previews when no canonical URL is set', () => {
    expect(applicationUrl({ VERCEL_URL: 'web-preview-corsair-tech.vercel.app' }))
      .toBe('https://web-preview-corsair-tech.vercel.app');
  });

  it('falls back to local development when no valid deployment URL exists', () => {
    expect(applicationUrl({ NEXT_PUBLIC_APP_URL: 'javascript:alert(1)' })).toBe('http://localhost:3000');
  });

  it('accepts local paths and rejects external or protocol-relative redirects', () => {
    expect(safeAppDestination('/practice?problem=pair-with-target-v1')).toBe('/practice?problem=pair-with-target-v1');
    expect(safeAppDestination('https://attacker.example')).toBe('/practice');
    expect(safeAppDestination('//attacker.example')).toBe('/practice');
  });
});
