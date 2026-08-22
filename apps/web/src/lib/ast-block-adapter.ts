import { formatStructuredEnglish, parseStructuredEnglish } from './ast-parser';
import type { AstProgramNode } from './ast-v1';

export type BlockModel = {
  blocks: string[];
  program: AstProgramNode;
};

export const draftToBlockModel = (draft: string, functionName = 'findPair'): BlockModel => {
  const program = parseStructuredEnglish(draft, functionName).program;
  const blocks = program.body[0]?.body.map((statement) => {
    if (statement.kind === 'intent') {
      return statement.text;
    }

    return formatStructuredEnglish({ ...program, body: [{ ...program.body[0], body: [statement] }] });
  }) ?? [];

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
      return `Return ${statement.value && 'kind' in statement.value ? statement.value.kind : 'nothing'}`;
    }

    if (statement.kind === 'assignment') {
      return `Store ${statement.value.kind === 'literal' ? statement.value.value : 'value'} as ${statement.target.name}`;
    }

    if (statement.kind === 'loop') {
      return `For each ${statement.iterator.name} in ${statement.iterable.kind === 'identifier' ? statement.iterable.name : 'values'}`;
    }

    return 'Unsupported block';
  }) ?? [];
};
