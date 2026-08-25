import type { AstAnalysisResult } from "./ast-analysis";

export type RubricCheckSeverity = "critical" | "optional";

export type RubricEvidenceContext = {
  draft: string;
  analysis: AstAnalysisResult;
};

export type RubricCheck = {
  id: string;
  label: string;
  severity: RubricCheckSeverity;
  evidence: (context: RubricEvidenceContext) => boolean;
  passDetail: string;
  reviseDetail: string;
};

export type RubricStrategy = {
  id: string;
  label: string;
  match: (context: RubricEvidenceContext) => boolean;
};

export type RubricCounterexample = {
  description: string;
  input: string;
  expectedBehavior: string;
};

export type RubricComplexityBound = {
  time: string;
  space: string;
};

export type RubricDefinition = {
  id: string;
  problemId: string;
  strategies: RubricStrategy[];
  checks: RubricCheck[];
  counterexamples: RubricCounterexample[];
  hints: string[];
  complexity: RubricComplexityBound;
};

export type RubricCheckResult = {
  id: string;
  label: string;
  severity: RubricCheckSeverity;
  status: "pass" | "revise";
  detail: string;
};

export type RubricEvaluation = {
  strategyId: string | null;
  approved: boolean;
  score: number;
  checks: RubricCheckResult[];
};

export function classifyStrategy(rubric: RubricDefinition, context: RubricEvidenceContext): string | null {
  return rubric.strategies.find((strategy) => strategy.match(context))?.id ?? null;
}

export function evaluateRubric(rubric: RubricDefinition, context: RubricEvidenceContext): RubricEvaluation {
  const strategyId = classifyStrategy(rubric, context);

  const checks: RubricCheckResult[] = rubric.checks.map((check) => {
    const passed = check.evidence(context);
    return {
      id: check.id,
      label: check.label,
      severity: check.severity,
      status: passed ? "pass" : "revise",
      detail: passed ? check.passDetail : check.reviseDetail,
    };
  });

  const criticalChecks = checks.filter((check) => check.severity === "critical");
  const approved = criticalChecks.length > 0 && criticalChecks.every((check) => check.status === "pass");
  const passedCount = checks.filter((check) => check.status === "pass").length;
  const score = checks.length === 0 ? 0 : Math.round((passedCount / checks.length) * 100);

  return { strategyId, approved, score, checks };
}
