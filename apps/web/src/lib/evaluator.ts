export type FindingStatus = "pass" | "revise";

export type EvaluationFinding = {
  id: "state" | "iteration" | "complement" | "lookup" | "ordering" | "return" | "complexity";
  label: string;
  status: FindingStatus;
  detail: string;
};

export type Evaluation = {
  approved: boolean;
  score: number;
  summary: string;
  findings: EvaluationFinding[];
};

type Rule = {
  id: EvaluationFinding["id"];
  label: string;
  pass: (source: string) => boolean;
  passDetail: string;
  reviseDetail: string;
};

const contains = (source: string, terms: RegExp[]) =>
  terms.some((term) => term.test(source));

const rules: Rule[] = [
  {
    id: "state",
    label: "Lookup state",
    pass: (source) => contains(source, [/\bmap\b/i, /hash\s*(map|table)/i, /dictionary/i]),
    passDetail: "You preserve earlier values in a constant-time lookup structure.",
    reviseDetail: "Name a map or dictionary that stores each seen value and its position.",
  },
  {
    id: "iteration",
    label: "Single pass",
    pass: (source) =>
      contains(source, [/for each/i, /iterate/i, /loop/i]) &&
      !contains(source, [/use\s+(a\s+)?nested loop/i, /with\s+(a\s+)?nested loop/i, /nested loop approach/i, /every other/i, /for each[\s\S]*for each/i]),
    passDetail: "The list is traversed once rather than searched repeatedly.",
    reviseDetail: "Describe one pass over the list; avoid scanning all other values for every item.",
  },
  {
    id: "complement",
    label: "Complement",
    pass: (source) =>
      contains(source, [/complement/i, /needed/i, /difference/i]) &&
      contains(source, [/target\s*(minus|-)/i, /subtract.*from target/i]),
    passDetail: "You derive the exact value needed to complete the target.",
    reviseDetail: "Define a complement as target minus the current value.",
  },
  {
    id: "lookup",
    label: "Fast lookup",
    pass: (source) =>
      contains(source, [/exists? in (the )?map/i, /map contains/i, /look up.*map/i, /find.*map/i]),
    passDetail: "The complement is checked against values seen earlier.",
    reviseDetail: "Check whether the complement already exists in the map.",
  },
  {
    id: "ordering",
    label: "Distinct positions",
    pass: (source) => {
      const lookupAt = source.search(/exists? in (the )?map|map contains|look up.*map|find.*map/i);
      // Ignore initial map setup (for example, "create a dictionary that stores
      // values") and require the mutation that occurs after the lookup.
      const mutationAfterLookup = lookupAt >= 0
        ? source.slice(lookupAt).search(/\b(store|insert)\b|\badd\b.*\bmap\b|\bmap\[.*\]\s*=/i)
        : -1;
      return lookupAt >= 0 && mutationAfterLookup > 0;
    },
    passDetail: "Lookup happens before storage, so the current position cannot match itself.",
    reviseDetail: "Check the map before storing the current value to guarantee distinct positions.",
  },
  {
    id: "return",
    label: "Return value",
    pass: (source) =>
      contains(source, [/return/i]) && contains(source, [/positions?/i, /indices?/i]),
    passDetail: "The plan returns both positions when a match is found.",
    reviseDetail: "State that both the stored position and current position are returned.",
  },
  {
    id: "complexity",
    label: "Target complexity",
    pass: (source) =>
      !contains(source, [/use\s+(a\s+)?nested loop/i, /with\s+(a\s+)?nested loop/i, /nested loop approach/i, /every other/i, /sort the list/i, /for each[\s\S]*for each/i]),
    passDetail: "The described operations support O(n) time and O(n) extra space.",
    reviseDetail: "Replace repeated searching or sorting with one pass and map lookups.",
  },
];

const pairWithTargetEvaluation = (draft: string): Evaluation => {
  const source = draft.trim();
  const findings = rules.map<EvaluationFinding>((rule) => {
    const passed = source.length > 0 && rule.pass(source);
    return {
      id: rule.id,
      label: rule.label,
      status: passed ? "pass" : "revise",
      detail: passed ? rule.passDetail : rule.reviseDetail,
    };
  });
  const passedCount = findings.filter((finding) => finding.status === "pass").length;
  const score = Math.round((passedCount / findings.length) * 100);
  const approved = findings.every((finding) => finding.status === "pass");

  return {
    approved,
    score,
    findings,
    summary: approved
      ? "Your reasoning is implementation-ready. The coding workspace is unlocked."
      : source.length === 0
        ? "Write your approach in plain English. Evaluation will focus on the algorithm, not syntax."
        : `${findings.length - passedCount} reasoning check${findings.length - passedCount === 1 ? "" : "s"} still need attention.`,
  };
};

const firstUniqueIndexEvaluation = (draft: string): Evaluation => {
  const source = draft.trim();
  const findings: EvaluationFinding[] = [
    {
      id: "state",
      label: "Count map",
      status: contains(source, [/count/i, /frequency/i, /map/i]) ? "pass" : "revise",
      detail: contains(source, [/count/i, /frequency/i, /map/i])
        ? "You keep a table of frequencies for each value."
        : "Describe a map that counts how many times each value appears.",
    },
    {
      id: "iteration",
      label: "Two-pass scan",
      status:
        contains(source, [/for each/i, /loop/i]) &&
        (contains(source, [/again|second pass|then/i]) || (source.match(/for each/gi)?.length ?? 0) >= 2)
        ? "pass"
        : "revise",
      detail:
        contains(source, [/for each/i, /loop/i]) &&
        (contains(source, [/again|second pass|then/i]) || (source.match(/for each/gi)?.length ?? 0) >= 2)
          ? "You separate counting from selecting the answer."
          : "Count first, then scan again to find the first value with count one.",
    },
    {
      id: "lookup",
      label: "Unique check",
      status: contains(source, [/count.*1|equals 1|is 1/i]) ? "pass" : "revise",
      detail: contains(source, [/count.*1|equals 1|is 1/i])
        ? "You explicitly look for a value that appears once."
        : "State that the first unique value is the one whose count equals one.",
    },
    {
      id: "ordering",
      label: "Return position",
      status: contains(source, [/return/i, /position|index/i]) ? "pass" : "revise",
      detail: contains(source, [/return/i, /position|index/i])
        ? "The plan returns the first matching position."
        : "Name the position or index you return when a unique value is found.",
    },
    {
      id: "return",
      label: "No unique fallback",
      status: contains(source, [/-1|no unique|none/i]) ? "pass" : "revise",
      detail: contains(source, [/-1|no unique|none/i])
        ? "The fallback return is defined."
        : "Specify that the algorithm returns -1 when no unique value exists.",
    },
    {
      id: "complexity",
      label: "Target complexity",
      status: !contains(source, [/nested loop/i, /every other/i, /sort/i]) ? "pass" : "revise",
      detail: !contains(source, [/nested loop/i, /every other/i, /sort/i])
        ? "The described operations support O(n) time and O(n) extra space."
        : "Replace repeated searching or sorting with counting and a linear scan.",
    },
  ];

  const passedCount = findings.filter((finding) => finding.status === "pass").length;
  const score = Math.round((passedCount / findings.length) * 100);
  const approved = findings.every((finding) => finding.status === "pass");

  return {
    approved,
    score,
    findings,
    summary: approved
      ? "Your reasoning is implementation-ready. The coding workspace is unlocked."
      : source.length === 0
        ? "Write your approach in plain English. Evaluation will focus on the algorithm, not syntax."
        : `${findings.length - passedCount} reasoning check${findings.length - passedCount === 1 ? "" : "s"} still need attention.`,
  };
};

export function evaluatePseudocode(draft: string, problemId = "pair-with-target-v1"): Evaluation {
  if (problemId === "first-unique-index-v1") {
    return firstUniqueIndexEvaluation(draft);
  }

  return pairWithTargetEvaluation(draft);
}
