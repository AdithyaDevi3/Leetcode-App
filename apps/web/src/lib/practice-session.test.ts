import { describe, expect, it } from "vitest";

import {
  buildCodeFromPlan,
  defaultCode,
  deserializePracticeSession,
  joinBlocksIntoDraft,
  practiceCodeDrafts,
  practiceWorkspaceValidationError,
  serializePracticeSession,
  splitDraftIntoBlocks,
  type PracticeSessionState,
} from "./practice-session";

describe("practice-session helpers", () => {
  it("keeps block order while trimming empty lines", () => {
    expect(splitDraftIntoBlocks("State\n\n  Loop  \n  Return")).toEqual(["State", "Loop", "Return"]);
    expect(joinBlocksIntoDraft([" State ", "", "Return "])).toBe("State\nReturn");
  });

  it("translates a plan into commented code", () => {
    const code = buildCodeFromPlan("Create a map.\nFor each value:");

    expect(code).toContain("// Create a map.");
    expect(code).toContain("// For each value:");
  });

  it("uses the correct signature for each starter function", () => {
    expect(defaultCode("findPair")).toContain("values: number[], target: number");
    expect(defaultCode("findFirstUniqueIndex")).toContain("values: number[]");
    expect(buildCodeFromPlan("findFirstUniqueIndex", "values: number[]", "Count values first.")).toContain(
      "function findFirstUniqueIndex(values: number[])",
    );
  });

  it("builds Python starters from the saved language preference", () => {
    expect(defaultCode("countIslands", "grid: number[][]", "python")).toContain(
      "def count_islands(grid: list[list[int]]):",
    );
  });

  it("builds C++20 starters with translated signatures", () => {
    expect(defaultCode("taskOrder", "tasks: string[], prerequisites: string[][]", "cpp"))
      .toContain("vector<string> taskOrder(vector<string> tasks, vector<vector<string>> prerequisites)");
  });

  it("round-trips a practice session snapshot", () => {
    const serialized = serializePracticeSession({
      draft: "Create a map.",
      mode: "blocks",
      language: "typescript",
      code: "function findPair() {}",
      codeChecked: true,
      completed: false,
      evaluation: {
        rubricVersion: "reasoning-rubric-v3",
        approved: false,
        score: 50,
        summary: "Halfway there.",
        findings: [],
      },
      codeGrade: null,
    });

    expect(deserializePracticeSession(serialized)).toMatchObject({
      draft: "Create a map.",
      mode: "blocks",
      language: "typescript",
      codeChecked: true,
      completed: false,
    });
  });

  it("rejects malformed snapshots", () => {
    expect(deserializePracticeSession("not-json")).toBeNull();
    expect(deserializePracticeSession(JSON.stringify({ draft: 42 }))).toBeNull();
    expect(deserializePracticeSession('null')).toBeNull();
  });

  it('preserves legacy snapshots and derives their active language draft', () => {
    expect(deserializePracticeSession(serializePracticeSession(workspace))).toEqual(workspace);
    expect(practiceCodeDrafts(workspace)).toEqual({ python: workspace.code });
  });

  it('round-trips every language draft while the active source remains authoritative', () => {
    const stored = { ...workspace, codeDraftVersion: 1 as const, codeByLanguage: {
      python: 'stale active copy', cpp: 'int answer() { return 7; }', typescript: 'const answer = () => 7;',
    } };
    const restored = deserializePracticeSession(serializePracticeSession(stored));
    expect(restored).toMatchObject({ ...workspace, codeDraftVersion: 1, codeByLanguage: {
      python: workspace.code, cpp: stored.codeByLanguage.cpp, typescript: stored.codeByLanguage.typescript,
    } });
    const switched = { ...restored!, language: 'cpp' as const, code: restored!.codeByLanguage!.cpp! };
    expect(practiceCodeDrafts(switched)).toEqual({
      python: workspace.code, cpp: stored.codeByLanguage.cpp, typescript: stored.codeByLanguage.typescript,
    });
  });

  it('rejects unsupported draft formats instead of silently dropping languages', () => {
    for (const extra of [
      { codeByLanguage: { python: 'pass' } },
      { codeDraftVersion: 2, codeByLanguage: { python: 'pass' } },
      { codeDraftVersion: 1 },
      { codeDraftVersion: 1, codeByLanguage: [] },
      { codeDraftVersion: 1, codeByLanguage: { ruby: 'puts 1' } },
      { codeDraftVersion: 1, codeByLanguage: { cpp: 7 } },
      { codeDraftVersion: 1, codeByLanguage: {}, language: 'ruby' },
    ]) {
      expect(deserializePracticeSession(JSON.stringify({ ...workspace, ...extra }))).toBeNull();
    }
  });

  it('enforces UTF-8 source, combined source and normalized serialized limits without truncation', () => {
    const candidate = { ...workspace, codeDraftVersion: 1 as const, codeByLanguage: { python: workspace.code, cpp: 'é'.repeat(50_001) } };
    expect(practiceWorkspaceValidationError(candidate)).toContain('100 KB');
    expect(deserializePracticeSession(JSON.stringify(candidate))).toBeNull();
    const combined = { ...candidate, code: 'x'.repeat(70_000), codeByLanguage: {
      python: 'x'.repeat(70_000), cpp: 'x'.repeat(70_000), typescript: 'x'.repeat(70_000),
    } };
    expect(practiceWorkspaceValidationError(combined)).toContain('200 KB');
    const normalizedTooLarge = { ...candidate, draft: 'x'.repeat(49_000), code: 'x'.repeat(80_000), codeByLanguage: { cpp: 'x'.repeat(80_000) } };
    expect(JSON.stringify(normalizedTooLarge).length).toBeLessThan(250_000);
    expect(deserializePracticeSession(JSON.stringify(normalizedTooLarge))).toBeNull();
    expect(candidate.codeByLanguage.cpp).toHaveLength(50_001);
  });
});

const workspace: PracticeSessionState = {
  draft: 'Track values already seen.', mode: 'text', language: 'python', code: 'def answer():\n    return 7',
  codeChecked: false, completed: false, evaluation: null, codeGrade: null,
};
