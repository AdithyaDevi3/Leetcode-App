import { describe, expect, it } from 'vitest';

import { astFixtures, createIdentifierNode, createLiteralNode, createIntentNode } from './ast-v1';

describe('AST v1', () => {
  it('creates versioned nodes with spans', () => {
    const literal = createLiteralNode(42, { start: 1, end: 3 });
    const identifier = createIdentifierNode('target', { start: 4, end: 10 });
    const intent = createIntentNode('Check the complement.', { start: 11, end: 33 });

    expect(literal).toMatchObject({ kind: 'literal', version: 1, span: { start: 1, end: 3 } });
    expect(identifier).toMatchObject({ kind: 'identifier', version: 1, span: { start: 4, end: 10 } });
    expect(intent).toMatchObject({ kind: 'intent', version: 1, span: { start: 11, end: 33 } });
  });

  it('keeps authored fixtures as intent-preserving programs', () => {
    expect(astFixtures.pairWithTarget.body[0].body).toHaveLength(3);
    expect(astFixtures.firstUniqueIndex.body[0].body[0]).toMatchObject({ kind: 'intent' });
  });
});