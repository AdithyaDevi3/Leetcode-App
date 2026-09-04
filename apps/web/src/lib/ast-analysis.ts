import type {
  AstExpressionNode,
  AstFunctionNode,
  AstIdentifierNode,
  AstProgramNode,
  AstStatementNode,
} from './ast-v1';

export type AstAnalysisFinding = {
  id: 'symbol' | 'return-path' | 'mutation-use' | 'operation-cost';
  nodeId: string;
  span: { start: number; end: number };
  status: 'pass' | 'revise';
  detail: string;
};

export type AstControlFlowNode = {
  id: string;
  label: string;
  span: { start: number; end: number };
  kind: 'entry' | 'statement' | 'branch' | 'exit';
};

export type AstControlFlowEdge = {
  from: string;
  to: string;
  label?: string;
};

export type AstAnalysisResult = {
  findings: AstAnalysisFinding[];
  controlFlow: {
    nodes: AstControlFlowNode[];
    edges: AstControlFlowEdge[];
  };
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
): { returnsAlways: boolean; uses: Set<string>; assigns: Set<string>; hasLoop: boolean; hasBranch: boolean } => {
  let returnsAlways = false;
  const uses = new Set<string>();
  const assigns = new Set<string>();
  let hasLoop = false;
  let hasBranch = false;

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
      hasLoop = true;
      symbols.set(statement.iterator.name, statement.iterator);
      collectExpressionIdentifiers(statement.iterable, uses);
      const nested = analyzeStatementList(statement.body, new Map(symbols), findings);
      nested.uses.forEach((name) => uses.add(name));
      nested.assigns.forEach((name) => assigns.add(name));
      hasLoop = hasLoop || nested.hasLoop;
      hasBranch = hasBranch || nested.hasBranch;
      returnsAlways = returnsAlways && nested.returnsAlways;
      findings.push(
        createFinding(
          'operation-cost',
          statement,
          nested.hasLoop || nested.hasBranch ? 'revise' : 'pass',
          nested.hasLoop || nested.hasBranch
            ? 'Nested control flow increases cost sensitivity; verify the intended bound.'
            : 'Loop usage is tracked explicitly for bounded cost inference.',
        ),
      );
      continue;
    }

    if (statement.kind === 'condition') {
      hasBranch = true;
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

  return { returnsAlways, uses, assigns, hasLoop, hasBranch };
};

const containsConditional = (statements: AstStatementNode[]): boolean => statements.some((statement) =>
  statement.kind === 'condition' || (statement.kind === 'loop' && containsConditional(statement.body)),
);

const buildControlFlow = (fn: AstFunctionNode) => {
  const nodes: AstControlFlowNode[] = [
    { id: `${fn.id}:entry`, label: `entry:${fn.name}`, span: fn.span, kind: 'entry' },
    { id: `${fn.id}:exit`, label: `exit:${fn.name}`, span: fn.span, kind: 'exit' },
  ];
  const edges: AstControlFlowEdge[] = [];
  let previous = `${fn.id}:entry`;

  fn.body.forEach((statement, index) => {
    const nodeId = `${fn.id}:statement:${index}`;
    const kind = statement.kind === 'condition' || (statement.kind === 'loop' && containsConditional(statement.body))
      ? 'branch'
      : 'statement';
    nodes.push({ id: nodeId, label: statement.kind, span: statement.span, kind });
    edges.push({ from: previous, to: nodeId });

    if (statement.kind === 'condition') {
      const consequentId = `${nodeId}:consequent`;
      const alternateId = `${nodeId}:alternate`;
      nodes.push({ id: consequentId, label: 'consequent', span: statement.span, kind: 'statement' });
      nodes.push({ id: alternateId, label: 'alternate', span: statement.span, kind: 'statement' });
      edges.push({ from: nodeId, to: consequentId, label: 'yes' });
      edges.push({ from: nodeId, to: alternateId, label: 'no' });
      edges.push({ from: consequentId, to: `${fn.id}:exit` });
      edges.push({ from: alternateId, to: `${fn.id}:exit` });
    }

    if (statement.kind === 'return') {
      edges.push({ from: nodeId, to: `${fn.id}:exit` });
    }

    previous = nodeId;
  });

  edges.push({ from: previous, to: `${fn.id}:exit` });
  return { nodes, edges };
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
      result.returnsAlways || fn.body.some((statement) => statement.kind === 'return') ? 'pass' : 'revise',
      result.returnsAlways || fn.body.some((statement) => statement.kind === 'return')
        ? 'Return coverage is represented in the control-flow graph.'
        : 'Add a return path for every branch.',
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

  const operationCost = result.hasLoop && result.hasBranch ? 'revise' : result.hasLoop ? 'revise' : 'pass';
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
  const controlFlow = {
    nodes: [] as AstControlFlowNode[],
    edges: [] as AstControlFlowEdge[],
  };

  for (const fn of program.body) {
    findings.push(...analysisForFunction(fn));
    const graph = buildControlFlow(fn);
    controlFlow.nodes.push(...graph.nodes);
    controlFlow.edges.push(...graph.edges);
  }

  return { findings, controlFlow };
}
