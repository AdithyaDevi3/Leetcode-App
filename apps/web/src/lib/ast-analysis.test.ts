import { describe, expect, it } from 'vitest';

import { createIdentifierNode, createIntentNode } from './ast-v1';
import { analyzeAstProgram } from './ast-analysis';

describe('AST static analysis', () => {
  it('flags undefined symbols and missing return paths', () => {
    const program = {
      kind: 'program',
      version: 1 as const,
      id: 'program:analysis',
      span: { start: 0, end: 1 },
      body: [
        {
          kind: 'function',
          version: 1 as const,
          id: 'function:analysis',
          span: { start: 0, end: 1 },
          name: 'analyze',
          parameters: ['values'],
          body: [
            {
              kind: 'assignment',
              version: 1 as const,
              id: 'assignment:1',
              span: { start: 0, end: 1 },
              target: createIdentifierNode('count', { start: 0, end: 1 }),
              value: createIdentifierNode('missing', { start: 0, end: 1 }),
            },
            createIntentNode('Consider the loop.', { start: 1, end: 2 }),
          ],
        },
      ],
    } as const;

    const result = analyzeAstProgram(program);

    expect(result.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'symbol', status: 'revise' }),
        expect.objectContaining({ id: 'return-path', status: 'revise' }),
        expect.objectContaining({ id: 'mutation-use', status: 'revise' }),
      ]),
    );
  });

  it('passes a fully defined function body', () => {
    const program = {
      kind: 'program',
      version: 1 as const,
      id: 'program:analysis-pass',
      span: { start: 0, end: 10 },
      body: [
        {
          kind: 'function',
          version: 1 as const,
          id: 'function:analysis-pass',
          span: { start: 0, end: 10 },
          name: 'analyze',
          parameters: ['values'],
          body: [
            {
              kind: 'return',
              version: 1 as const,
              id: 'return:1',
              span: { start: 0, end: 1 },
              value: createIdentifierNode('values', { start: 0, end: 1 }),
            },
          ],
        },
      ],
    } as const;

    const result = analyzeAstProgram(program);

    expect(result.findings.every((finding) => finding.status === 'pass')).toBe(true);
  });
});