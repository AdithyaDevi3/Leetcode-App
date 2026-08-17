import { describe, expect, it } from "vitest";

import {
  buildCodeFromPlan,
  defaultCode,
  deserializePracticeSession,
  joinBlocksIntoDraft,
  serializePracticeSession,
  splitDraftIntoBlocks,
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

  it("round-trips a practice session snapshot", () => {
    const serialized = serializePracticeSession({
      draft: "Create a map.",
      mode: "blocks",
      code: "function findPair() {}",
      codeChecked: true,
      completed: false,
      evaluation: {
        approved: false,
        score: 50,
        summary: "Halfway there.",
        findings: [],
      },
    });

    expect(deserializePracticeSession(serialized)).toMatchObject({
      draft: "Create a map.",
      mode: "blocks",
      codeChecked: true,
      completed: false,
    });
  });

  it("rejects malformed snapshots", () => {
    expect(deserializePracticeSession("not-json")).toBeNull();
    expect(deserializePracticeSession(JSON.stringify({ draft: 42 }))).toBeNull();
  });
});