import type { AstNode, AstProgramNode } from './ast-v1';

export type AstMigrationSnapshot = {
  sourceVersion: number;
  targetVersion: number;
  program: AstProgramNode;
};

export type AstMigrationStep = (program: AstProgramNode) => AstProgramNode;

export type AstMigrationPlan = {
  version: number;
  steps: AstMigrationStep[];
};

const cloneProgram = (program: AstProgramNode): AstProgramNode => structuredClone(program);

const normalizeUnknownNodes = (program: AstProgramNode): AstProgramNode => {
  const nextProgram = cloneProgram(program);

  nextProgram.body = nextProgram.body.map((functionNode) => ({
    ...functionNode,
    body: functionNode.body.map((statement) => {
      if (statement.kind !== 'intent') {
        return statement;
      }

      return {
        ...statement,
        text: statement.text.trim(),
      };
    }),
  }));

  return nextProgram;
};

const versionTwoPlan: AstMigrationPlan = {
  version: 2,
  steps: [normalizeUnknownNodes],
};

export const astMigrationPlans = [versionTwoPlan];

export function migrateAstProgram(program: AstProgramNode, targetVersion = 2): AstProgramNode {
  const current = cloneProgram(program);

  if (targetVersion <= 1) {
    return current;
  }

  for (const plan of astMigrationPlans) {
    if (plan.version > targetVersion) {
      continue;
    }

    for (const step of plan.steps) {
      Object.assign(current, step(current));
    }
  }

  return current;
}

export function isAstProgram(value: unknown): value is AstProgramNode {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const candidate = value as AstNode;
  return candidate.kind === 'program' && Array.isArray((candidate as AstProgramNode).body);
}
