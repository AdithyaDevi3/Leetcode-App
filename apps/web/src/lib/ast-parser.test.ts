import { describe, expect, it } from 'vitest';

import { astFixtures } from './ast-v1';
import { formatStructuredEnglish, parseStructuredEnglish } from './ast-parser';

describe('structured English parser', () => {
  it('parses supported statements and preserves unknown text as intent', () => {
    const source = 'Store 1 as count\nCount each value.\nReturn count';

    const result = parseStructuredEnglish(source, 'findFirstUniqueIndex');

    expect(result.diagnostics).toHaveLength(0);
    expect(result.program.body[0].body).toHaveLength(3);
    expect(result.program.body[0].body[1]).toMatchObject({ kind: 'intent' });
  });

  it('round-trips supported instructions', () => {
    const source = 'Store 1 as count\nReturn count';

    const parsed = parseStructuredEnglish(source);
    const formatted = formatStructuredEnglish(parsed.program);

    expect(formatted).toBe(source);
  });

  it('preserves the authored fixture text as intent', () => {
    const formatted = formatStructuredEnglish(astFixtures.pairWithTarget);

    expect(formatted).toContain('Create a map.');
    expect(formatted).toContain('Check the complement.');
  });
});