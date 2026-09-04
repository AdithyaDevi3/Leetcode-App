import {
  astFixtures,
  createIdentifierNode,
  createIntentNode,
  createLiteralNode,
  type AstAssignmentNode,
  type AstExpressionNode,
  type AstFunctionNode,
  type AstLoopNode,
  type AstProgramNode,
  type AstReturnNode,
  type AstStatementNode,
  type AstVersion,
} from './ast-v1';

export type AstParseDiagnostic = {
  message: string;
  line: number;
};

export type AstParseResult = {
  program: AstProgramNode;
  diagnostics: AstParseDiagnostic[];
};

const version: AstVersion = 1;

const makeSpan = (line: number, text: string) => ({
  start: line,
  end: line + text.length,
});

const parseExpression = (line: number, text: string): AstExpressionNode => {
  const trimmed = text.trim();

  if (/^".*"$/.test(trimmed) || /^'.*'$/.test(trimmed)) {
    return createLiteralNode(trimmed.slice(1, -1), makeSpan(line, text));
  }

  if (/^-?\d+(\.\d+)?$/.test(trimmed)) {
    return createLiteralNode(Number(trimmed), makeSpan(line, text));
  }

  return createIntentNode(trimmed, makeSpan(line, text));
};

const parseStatement = (line: number, text: string): AstStatementNode => {
  const trimmed = text.trim();

  if (/^Return\s+/i.test(trimmed)) {
    return {
      kind: 'return',
      version,
      id: `return:${line}`,
      span: makeSpan(line, text),
      value: parseExpression(line, trimmed.replace(/^Return\s+/i, '')),
    } satisfies AstReturnNode;
  }

  if (/^Store\s+/i.test(trimmed) && /\s+as\s+/i.test(trimmed)) {
    const match = trimmed.match(/^Store\s+(.+?)\s+as\s+(.+)$/i);
    if (match) {
      const [, valueText, nameText] = match;
      const target = createIdentifierNode(nameText.trim(), makeSpan(line, nameText.trim()));

      return {
        kind: 'assignment',
        version,
        id: `assignment:${line}`,
        span: makeSpan(line, text),
        target,
        value: parseExpression(line, valueText),
      } satisfies AstAssignmentNode;
    }
  }

  if (/^For each\s+/i.test(trimmed) && /\s+in\s+/i.test(trimmed)) {
    const match = trimmed.match(/^For each\s+(.+?)\s+in\s+(.+)$/i);
    if (match) {
      const [, iteratorText, iterableText] = match;
      const iterator = createIdentifierNode(iteratorText.trim(), makeSpan(line, iteratorText.trim()));

      return {
        kind: 'loop',
        version,
        id: `loop:${line}`,
        span: makeSpan(line, text),
        iterator,
        iterable: parseExpression(line, iterableText),
        body: [createIntentNode('Loop body omitted in this constrained parser.', makeSpan(line, text))],
      } satisfies AstLoopNode;
    }
  }

  return createIntentNode(trimmed, makeSpan(line, text));
};

export function parseStructuredEnglish(source: string, functionName = 'findPair'): AstParseResult {
  const diagnostics: AstParseDiagnostic[] = [];
  const lines = source.split('\n');
  const body: AstStatementNode[] = [];

  lines.forEach((lineText, index) => {
    const line = index + 1;
    if (!lineText.trim()) {
      return;
    }

    try {
      body.push(parseStatement(line, lineText));
    } catch {
      diagnostics.push({ message: 'Unable to parse line as structured English.', line });
      body.push(createIntentNode(lineText.trim(), makeSpan(line, lineText)));
    }
  });

  return {
    diagnostics,
    program: {
      kind: 'program',
      version,
      id: 'program:structured-english',
      span: { start: 0, end: source.length },
      body: [
        {
          kind: 'function',
          version,
          id: `function:${functionName}`,
          span: { start: 0, end: source.length },
          name: functionName,
          parameters: functionName === 'findFirstUniqueIndex' ? ['values'] : ['values', 'target'],
          body,
        },
      ],
    },
  };
}

export function formatStructuredEnglish(program: AstProgramNode): string {
  const functionNode = program.body[0] as AstFunctionNode | undefined;
  if (!functionNode) {
    return '';
  }

  return functionNode.body
    .map((statement) => {
      if (statement.kind === 'return') {
        return `Return ${formatExpression(statement.value)}`;
      }

      if (statement.kind === 'assignment') {
        return `Store ${formatExpression(statement.value)} as ${statement.target.name}`;
      }

      if (statement.kind === 'loop') {
        return `For each ${statement.iterator.name} in ${formatExpression(statement.iterable)}`;
      }

      return statement.kind === 'intent' ? statement.text : 'Unsupported statement';
    })
    .join('\n');
}

const formatExpression = (expression: AstExpressionNode | null): string => {
  if (!expression) {
    return 'nothing';
  }

  if (expression.kind === 'literal') {
    return typeof expression.value === 'string' ? `"${expression.value}"` : String(expression.value);
  }

  if (expression.kind === 'identifier') {
    return expression.name;
  }

  if (expression.kind === 'intent') {
    return expression.text;
  }

  return `${expression.callee.name}(${expression.args.map((arg) => formatExpression(arg)).join(', ')})`;
};

export const astParserFixtures = astFixtures;
