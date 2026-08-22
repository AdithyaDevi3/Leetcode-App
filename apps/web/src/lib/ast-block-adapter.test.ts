import { describe, expect, it } from 'vitest';

import { astFixtures } from './ast-v1';
import { astProgramToBlocks, blockModelToDraft, draftToBlockModel } from './ast-block-adapter';

describe('AST block adapter', () => {
  it('projects structured English into block models', () => {
    const model = draftToBlockModel('Store 1 as count\nReturn count', 'findFirstUniqueIndex');

    expect(model.blocks).toEqual(['Store 1 as count', 'Return count']);
    expect(model.program.body[0].body).toHaveLength(2);
  });

  it('round-trips blocks back to a draft', () => {
    expect(blockModelToDraft(['Store 1 as count', 'Return count'], 'findFirstUniqueIndex')).toBe(
      'Store 1 as count\nReturn count',
    );
  });

  it('renders existing intent fixtures as editable blocks', () => {
    expect(astProgramToBlocks(astFixtures.pairWithTarget)).toEqual(['Create a map.', 'Check the complement.', 'Return nothing']);
  });
});