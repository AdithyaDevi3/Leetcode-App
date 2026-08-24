import type {
  AstAssignmentNode,
  AstAssertionNode,
  AstCallNode,
  AstConditionNode,
  AstExpressionNode,
  AstFunctionNode,
  AstIdentifierNode,
  AstIntentNode,
  AstLiteralNode,
  AstLoopNode,
  AstProgramNode,
  AstReturnNode,
  AstStatementNode,
} from './ast-v1';

export type AstAnalysisFinding = {
  id: 'symbol' | 'return-path' | 'mutation-use' | 'operation-cost';
  nodeId: string;
  span: { start: number; end: number };
  status: 'pass' | 'revise';
  detail: string;
};

export type AstAnalysisResult = {
  findings: AstAnalysisFinding[];
};

type SymbolTable = Map<string, AstIdentifierNode>;

const createFinding = (
  id: AstAnalysisFinding['id'],
  node: { id: string; span: { start: number; end: number } },
  status: AstAnalysisFinding['status'],
  detail: string,
): AstAnalysisFinding => ({ id, nodeId: node.id, span: node.span, status, detail });

const collectExpressionIdentifiers = (expression: AstExpressionNode, names: Set<string>): void => {
  if (expression.kind === 'identifier') {
    names.add(expression.name);
    return;
  }

  if (expression.kind === 'call') {
    names.add(expression.callee.name);
    expression.args.forEach((arg) => collectExpressionIdentifiers(arg, names));
  }
};

const analyzeStatementList = (
  statements: AstStatementNode[],
  symbols: SymbolTable,
  findings: AstAnalysisFinding[],
): { returnsAlways: boolean; uses: Set<string>; assigns: Set<string> } => {
  let returnsAlways = false;
  const uses = new Set<string>();
  const assigns = new Set<string>();

  for (const statement of statements) {
    if (statement.kind === 'intent') {
      continue;
    }

    if (statement.kind === 'return') {
      returnsAlways = true;
      if (statement.value) {
        collectExpressionIdentifiers(statement.value, uses);
      }
      continue;
    }

    if (statement.kind === 'assignment') {
      symbols.set(statement.target.name, statement.target);
      assigns.add(statement.target.name);
      collectExpressionIdentifiers(statement.value, uses);
      continue;
    }

    if (statement.kind === 'assertion') {
      collectExpressionIdentifiers(statement.value, uses);
      continue;
    }

    if (statement.kind === 'loop') {
      symbols.set(statement.iterator.name, statement.iterator);
      collectExpressionIdentifiers(statement.iterable, uses);
      const nested = analyzeStatementList(statement.body, new Map(symbols), findings);
      nested.uses.forEach((name) => uses.add(name));
      nested.assigns.forEach((name) => assigns.add(name));
      returnsAlways = returnsAlways && nested.returnsAlways;
      findings.push(
        createFinding(
          'operation-cost',
          statement,
          'pass',
          'Loop usage is tracked explicitly for bounded cost inference.',
        ),
      );
      continue;
    }

    if (statement.kind === 'condition') {
      collectExpressionIdentifiers(statement.test, uses);
      const consequent = analyzeStatementList(statement.consequent, new Map(symbols), findings);
      const alternate = analyzeStatementList(statement.alternate, new Map(symbols), findings);
      consequent.uses.forEach((name) => uses.add(name));
      alternate.uses.forEach((name) => uses.add(name));
      consequent.assigns.forEach((name) => assigns.add(name));
      alternate.assigns.forEach((name) => assigns.add(name));
      returnsAlways = consequent.returnsAlways && alternate.returnsAlways;
    }
  }

  return { returnsAlways, uses, assigns };
};

const analysisForFunction = (fn: AstFunctionNode): AstAnalysisFinding[] => {
  const findings: AstAnalysisFinding[] = [];
  const symbols: SymbolTable = new Map();

  fn.parameters.forEach((parameter) => {
    symbols.set(parameter, {
      kind: 'identifier',
      id: `parameter:${parameter}`,
      version: fn.version,
      span: fn.span,
      name: parameter,
    });
  });

  const result = analyzeStatementList(fn.body, symbols, findings);
  const unusedAssignments = [...result.assigns].filter((name) => !result.uses.has(name));
  const undefinedUses = [...result.uses].filter((name) => !symbols.has(name));

  if (undefinedUses.length > 0) {
    findings.push(
      createFinding(
        'symbol',
        fn,
        'revise',
        `Undefined symbols: ${undefinedUses.sort().join(', ')}.`,
      ),
    );
  } else {
    findings.push(createFinding('symbol', fn, 'pass', 'All referenced symbols are defined in scope.'));
  }

  findings.push(
    createFinding(
      'return-path',
      fn,
      result.returnsAlways ? 'pass' : 'revise',
      result.returnsAlways ? 'Every control path returns a value.' : 'Add a return path for every branch.',
    ),
  );

  findings.push(
    createFinding(
      'mutation-use',
      fn,
      unusedAssignments.length === 0 ? 'pass' : 'revise',
      unusedAssignments.length === 0
        ? 'Every assigned symbol is used later in the function.'
        : `Unused assignments: ${unusedAssignments.sort().join(', ')}.`,
    ),
  );

  const operationCost = fn.body.some((statement) => statement.kind === 'loop') ? 'revise' : 'pass';
  findings.push(
    createFinding(
      'operation-cost',
      fn,
      operationCost,
      operationCost === 'pass'
        ? 'No nested iteration was detected in the top-level function body.'
        : 'Loops were detected; verify the algorithm stays within the intended cost bound.',
    ),
  );

  return findings;
};

export function analyzeAstProgram(program: AstProgramNode): AstAnalysisResult {
  const findings: AstAnalysisFinding[] = [];

  for (const fn of program.body) {
    findings.push(...analysisForFunction(fn));
  }

  return { findings };
}
