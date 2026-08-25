import { describe, expect, it } from "vitest";

import type { AstAnalysisResult } from "./ast-analysis";
import { classifyStrategy, evaluateRubric, type RubricDefinition } from "./rubric";

const emptyAnalysis: AstAnalysisResult = {
  findings: [],
  controlFlow: { nodes: [], edges: [] },
};

const passingAnalysis: AstAnalysisResult = {
  findings: [{ id: "return-path", nodeId: "function:1", span: { start: 0, end: 1 }, status: "pass", detail: "ok" }],
  controlFlow: { nodes: [], edges: [] },
};

const rubric: RubricDefinition = {
  id: "pair-with-target-rubric-v1",
  problemId: "pair-with-target-v1",
  strategies: [
    {
      id: "hash-map",
      label: "Hash map complement lookup",
      match: (context) => /map/i.test(context.draft),
    },
    {
      id: "brute-force",
      label: "Nested comparison",
      match: (context) => /every other/i.test(context.draft),
    },
  ],
  checks: [
    {
      id: "state",
      label: "Lookup state",
      severity: "critical",
      evidence: (context) => /map/i.test(context.draft),
      passDetail: "Uses a map for lookups.",
      reviseDetail: "Name a map that stores seen values.",
    },
    {
      id: "return-path",
      label: "Return coverage",
      severity: "critical",
      evidence: (context) => context.analysis.findings.some((finding) => finding.id === "return-path" && finding.status === "pass"),
      passDetail: "Every path returns.",
      reviseDetail: "Add a return path for every branch.",
    },
    {
      id: "style",
      label: "Naming clarity",
      severity: "optional",
      evidence: (context) => context.draft.length > 10,
      passDetail: "The draft is descriptive.",
      reviseDetail: "Add more descriptive detail.",
    },
  ],
  counterexamples: [
    {
      description: "Duplicate values",
      input: "values = [3, 3], target = 6",
      expectedBehavior: "Returns positions 0 and 1.",
    },
  ],
  hints: ["Consider what value would complete the pair."],
  complexity: { time: "O(n)", space: "O(n)" },
};

describe("rubric schema", () => {
  it("classifies the authored strategy from draft evidence", () => {
    expect(classifyStrategy(rubric, { draft: "Create a map from value to position.", analysis: emptyAnalysis })).toBe(
      "hash-map",
    );
    expect(classifyStrategy(rubric, { draft: "Check every other value.", analysis: emptyAnalysis })).toBe(
      "brute-force",
    );
    expect(classifyStrategy(rubric, { draft: "Do something else.", analysis: emptyAnalysis })).toBeNull();
  });

  it("requires every critical check to pass before approving", () => {
    const result = evaluateRubric(rubric, { draft: "Create a map from value to position.", analysis: emptyAnalysis });

    expect(result.approved).toBe(false);
    expect(result.checks.find((check) => check.id === "return-path")?.status).toBe("revise");
  });

  it("approves once all critical checks pass, regardless of optional checks", () => {
    const result = evaluateRubric(rubric, { draft: "map", analysis: passingAnalysis });

    expect(result.approved).toBe(true);
    expect(result.checks.find((check) => check.id === "style")?.status).toBe("revise");
    expect(result.score).toBeLessThan(100);
  });

  it("scores based on the proportion of passing checks", () => {
    const result = evaluateRubric(rubric, {
      draft: "Create a map from value to position and check every branch.",
      analysis: passingAnalysis,
    });

    expect(result.score).toBe(100);
  });
});
