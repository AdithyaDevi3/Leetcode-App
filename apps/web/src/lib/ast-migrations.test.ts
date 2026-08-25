import { describe, expect, it } from 'vitest';

import { astFixtures } from './ast-v1';
import { isAstProgram, migrateAstProgram } from './ast-migrations';

describe('AST migrations', () => {
  it('identifies versioned program nodes', () => {
    expect(isAstProgram(astFixtures.pairWithTarget)).toBe(true);
    expect(isAstProgram({ kind: 'intent' })).toBe(false);
  });

  it('preserves authored intent while normalizing migrated programs', () => {
    const migrated = migrateAstProgram(astFixtures.pairWithTarget, 2);

    expect(migrated.version).toBe(1);
    expect(migrated.body[0].body[0]).toMatchObject({ kind: 'intent', text: 'Create a map.' });
  });

  it('returns the original structure for v1 targets', () => {
    const migrated = migrateAstProgram(astFixtures.firstUniqueIndex, 1);

    expect(migrated).toMatchObject(astFixtures.firstUniqueIndex);
  });
});