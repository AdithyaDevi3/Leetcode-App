export type AstVersion = 1;

export type AstSourceSpan = {
  start: number;
  end: number;
};

export type AstNodeBase = {
  id: string;
  version: AstVersion;
  span: AstSourceSpan;
};

export type AstLiteralNode = AstNodeBase & {
  kind: 'literal';
  value: string | number | boolean | null;
};

export type AstIdentifierNode = AstNodeBase & {
  kind: 'identifier';
  name: string;
};

export type AstAssignmentNode = AstNodeBase & {
  kind: 'assignment';
  target: AstIdentifierNode;
  value: AstExpressionNode;
};

export type AstConditionNode = AstNodeBase & {
  kind: 'condition';
  test: AstExpressionNode;
  consequent: AstStatementNode[];
  alternate: AstStatementNode[];
};

export type AstLoopNode = AstNodeBase & {
  kind: 'loop';
  iterator: AstIdentifierNode;
  iterable: AstExpressionNode;
  body: AstStatementNode[];
};

export type AstReturnNode = AstNodeBase & {
  kind: 'return';
  value: AstExpressionNode | null;
};

export type AstAssertionNode = AstNodeBase & {
  kind: 'assertion';
  value: AstExpressionNode;
  message?: string;
};

export type AstIntentNode = AstNodeBase & {
  kind: 'intent';
  text: string;
};

export type AstCallNode = AstNodeBase & {
  kind: 'call';
  callee: AstIdentifierNode;
  args: AstExpressionNode[];
};

export type AstExpressionNode =
  | AstLiteralNode
  | AstIdentifierNode
  | AstCallNode
  | AstIntentNode;

export type AstStatementNode =
  | AstAssignmentNode
  | AstConditionNode
  | AstLoopNode
  | AstReturnNode
  | AstAssertionNode
  | AstIntentNode;

export type AstFunctionNode = AstNodeBase & {
  kind: 'function';
  name: string;
  parameters: string[];
  body: AstStatementNode[];
};

export type AstProgramNode = AstNodeBase & {
  kind: 'program';
  body: AstFunctionNode[];
};

export type AstNode =
  | AstProgramNode
  | AstFunctionNode
  | AstStatementNode
  | AstExpressionNode;

const baseNode = (kind: AstNode['kind'], span: AstSourceSpan): AstNodeBase => ({
  id: `${kind}:${span.start}-${span.end}`,
  version: 1,
  span,
});

export const createLiteralNode = (
  value: AstLiteralNode['value'],
  span: AstSourceSpan,
): AstLiteralNode => ({
  ...baseNode('literal', span),
  kind: 'literal',
  value,
});

export const createIdentifierNode = (name: string, span: AstSourceSpan): AstIdentifierNode => ({
  ...baseNode('identifier', span),
  kind: 'identifier',
  name,
});

export const createIntentNode = (text: string, span: AstSourceSpan): AstIntentNode => ({
  ...baseNode('intent', span),
  kind: 'intent',
  text,
});

export const astFixtures = {
  pairWithTarget: {
    kind: 'program',
    version: 1 as const,
    id: 'program:0-42',
    span: { start: 0, end: 42 },
    body: [
      {
        kind: 'function',
        version: 1 as const,
        id: 'function:0-42',
        span: { start: 0, end: 42 },
        name: 'findPair',
        parameters: ['values', 'target'],
        body: [
          createIntentNode('Create a map.', { start: 0, end: 14 }),
          createIntentNode('Check the complement.', { start: 15, end: 38 }),
          {
            kind: 'return',
            version: 1 as const,
            id: 'return:39-42',
            span: { start: 39, end: 42 },
            value: null,
          },
        ],
      },
    ],
  } satisfies AstProgramNode,
  firstUniqueIndex: {
    kind: 'program',
    version: 1 as const,
    id: 'program:0-45',
    span: { start: 0, end: 45 },
    body: [
      {
        kind: 'function',
        version: 1 as const,
        id: 'function:0-45',
        span: { start: 0, end: 45 },
        name: 'findFirstUniqueIndex',
        parameters: ['values'],
        body: [
          createIntentNode('Count each value.', { start: 0, end: 17 }),
          createIntentNode('Return the first unique index.', { start: 18, end: 47 }),
        ],
      },
    ],
  } satisfies AstProgramNode,
};
