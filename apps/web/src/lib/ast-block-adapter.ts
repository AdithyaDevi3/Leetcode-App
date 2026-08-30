import { formatStructuredEnglish, parseStructuredEnglish } from './ast-parser';
import type { AstExpressionNode, AstProgramNode } from './ast-v1';

export type BlockModel = {
  blocks: string[];
  program: AstProgramNode;
};

export const draftToBlockModel = (draft: string, functionName = 'findPair'): BlockModel => {
  const program = parseStructuredEnglish(draft, functionName).program;
  const blocks = astProgramToBlocks(program);

  return { blocks, program };
};

export const blockModelToDraft = (blocks: string[], functionName = 'findPair') =>
  formatStructuredEnglish(parseStructuredEnglish(blocks.join('\n'), functionName).program);

export const astProgramToBlocks = (program: AstProgramNode) => {
  const functionNode = program.body[0];

  return functionNode?.body.map((statement) => {
    if (statement.kind === 'intent') {
      return statement.text;
    }

    if (statement.kind === 'return') {
      return `Return ${formatReturnValue(statement.value)}`;
    }

    if (statement.kind === 'assignment') {
      return `Store ${formatExpression(statement.value)} as ${statement.target.name}`;
    }

    if (statement.kind === 'loop') {
      return `For each ${statement.iterator.name} in ${formatExpression(statement.iterable)}`;
    }

    return 'Unsupported block';
  }) ?? [];
};

const formatReturnValue = (expression: AstExpressionNode | null) => {
  if (!expression) {
    return 'nothing';
  }

  return formatExpression(expression);
};

const formatExpression = (expression: { kind: string; [key: string]: unknown }) => {
  if (expression.kind === 'literal') {
    return typeof expression.value === 'string' ? `"${expression.value}"` : String(expression.value);
  }

  if (expression.kind === 'identifier') {
    return expression.name as string;
  }

  if (expression.kind === 'intent') {
    return expression.text as string;
  }

  return 'value';
};
