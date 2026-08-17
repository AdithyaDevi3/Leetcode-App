import { describe, expect, it } from "vitest";

import { flawedDraft, practiceItems, starterDraft } from "./content";
import { evaluatePseudocode } from "./evaluator";

describe("evaluatePseudocode", () => {
  it("approves an implementation-ready one-pass map strategy", () => {
    const result = evaluatePseudocode(starterDraft);

    expect(result.approved).toBe(true);
    expect(result.score).toBe(100);
    expect(result.findings.every((finding) => finding.status === "pass")).toBe(true);
  });

  it("keeps a repeated-search strategy locked", () => {
    const result = evaluatePseudocode(flawedDraft);

    expect(result.approved).toBe(false);
    expect(result.findings.find((finding) => finding.id === "complexity")?.status).toBe(
      "revise",
    );
  });

  it("requires lookup to happen before storage", () => {
    const result = evaluatePseudocode(`Create a map.
For each value and position:
  Store value in the map.
  Let complement be target minus value.
  If complement exists in the map, return both positions.`);

    expect(result.approved).toBe(false);
    expect(result.findings.find((finding) => finding.id === "ordering")?.status).toBe(
      "revise",
    );
  });

  it("returns an actionable empty state", () => {
    const result = evaluatePseudocode("   ");

    expect(result.approved).toBe(false);
    expect(result.score).toBe(0);
    expect(result.summary).toContain("plain English");
  });

  it("approves the first-unique-index strategy with the matching rubric", () => {
    const result = evaluatePseudocode(practiceItems[1].starterDraft, practiceItems[1].id);

    expect(result.approved).toBe(true);
    expect(result.score).toBe(100);
  });
});