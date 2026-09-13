export type FindingStatus = "pass" | "revise";

export type EvaluationFinding = {
  id: string;
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

type ConfiguredCheck = {
  id: string;
  label: string;
  pass: (source: string) => boolean;
  passDetail: string;
  reviseDetail: string;
};

const all = (source: string, patterns: RegExp[]) => patterns.every((pattern) => pattern.test(source));

const configuredChecks: Record<string, ConfiguredCheck[]> = {
  "max-window-sum-v1": [
    { id: "state", label: "Initial window", pass: (source) => all(source, [/sum/i, /first window/i]), passDetail: "You seed the running sum from the first window.", reviseDetail: "Start by summing the first complete window." },
    { id: "iteration", label: "Window movement", pass: (source) => contains(source, [/each new position/i, /slide/i, /next window/i]), passDetail: "You move the window one position at a time.", reviseDetail: "Describe how the window advances through the list." },
    { id: "update", label: "Incremental update", pass: (source) => all(source, [/remove|subtract/i, /add/i, /leaves? the window/i, /enters? the window/i]), passDetail: "Each move subtracts the outgoing value and adds the incoming value.", reviseDetail: "Subtract the value leaving the window and add the value entering it." },
    { id: "return", label: "Best sum", pass: (source) => all(source, [/best|largest|maximum/i, /return/i]), passDetail: "You track and return the largest window sum.", reviseDetail: "Update the best sum after each move and return it." },
  ],
  "tree-max-depth-v1": [
    { id: "base", label: "Empty-node base case", pass: (source) => all(source, [/empty|null/i, /return 0/i]), passDetail: "The recursion stops at an empty child.", reviseDetail: "Return zero when the current node is empty." },
    { id: "left", label: "Left subtree", pass: (source) => all(source, [/left child|left subtree/i, /depth/i]), passDetail: "You ask the left subtree for its depth.", reviseDetail: "Recursively compute the left-child depth." },
    { id: "right", label: "Right subtree", pass: (source) => all(source, [/right child|right subtree/i, /depth/i]), passDetail: "You ask the right subtree for its depth.", reviseDetail: "Recursively compute the right-child depth." },
    { id: "combine", label: "Combine depths", pass: (source) => all(source, [/larger|maximum|max/i, /one|1/i, /return/i]), passDetail: "You add the current node to the larger child depth.", reviseDetail: "Return one plus the larger child depth." },
  ],
  "balanced-brackets-v1": [
    { id: "state", label: "Stack state", pass: (source) => /stack/i.test(source), passDetail: "You use a stack for unresolved openers.", reviseDetail: "Create a stack for opening brackets." },
    { id: "push", label: "Opening brackets", pass: (source) => all(source, [/opener|opening/i, /push/i]), passDetail: "Opening brackets are pushed in order.", reviseDetail: "Push each opening bracket onto the stack." },
    { id: "match", label: "Closing brackets", pass: (source) => all(source, [/closer|closing/i, /top|most recent/i, /match|compare/i]), passDetail: "Each closer is matched with the most recent opener.", reviseDetail: "Compare every closer with the top of the stack." },
    { id: "return", label: "Validity result", pass: (source) => all(source, [/false|invalid/i, /empty/i, /return/i]), passDetail: "Mismatches fail and an empty final stack succeeds.", reviseDetail: "Return false on a mismatch and otherwise return whether the stack is empty." },
  ],
  "climb-stairs-v1": [
    { id: "base", label: "Base cases", pass: (source) => all(source, [/no steps|zero|0/i, /one step|1/i, /return/i]), passDetail: "The zero-step and one-step answers are defined.", reviseDetail: "Define the answers for zero and one step." },
    { id: "state", label: "Rolling state", pass: (source) => contains(source, [/last two/i, /previous two/i]), passDetail: "You retain only the previous two answers.", reviseDetail: "Keep the previous two results as rolling state." },
    { id: "update", label: "Recurrence", pass: (source) => all(source, [/add|sum/i, /previous two|last two/i]), passDetail: "Each new answer is the sum of the previous two.", reviseDetail: "For each larger step count, add the previous two answers." },
    { id: "return", label: "Final answer", pass: (source) => all(source, [/return/i, /latest|answer|result/i]), passDetail: "You return the final rolling answer.", reviseDetail: "Return the latest computed answer." },
  ],
  "island-count-v1": [
    { id: "scan", label: "Grid scan", pass: (source) => all(source, [/each cell|every cell/i, /grid/i]), passDetail: "You inspect every grid cell.", reviseDetail: "Scan each cell in the grid." },
    { id: "start", label: "Search trigger", pass: (source) => all(source, [/land/i, /not been visited|unvisited/i, /search|flood|travers/i]), passDetail: "A search starts only from unvisited land.", reviseDetail: "Start a search when a cell is unvisited land." },
    { id: "mark", label: "Visited region", pass: (source) => all(source, [/connected/i, /visited/i, /mark/i]), passDetail: "The complete connected region is marked visited.", reviseDetail: "Mark every connected land cell as visited." },
    { id: "count", label: "Island count", pass: (source) => all(source, [/increase|increment|add/i, /island count|count/i, /return/i]), passDetail: "Each discovered region increments the returned count.", reviseDetail: "Increment the island count per search and return it." },
  ],
  "task-order-v1": [
    { id: "state", label: "Prerequisite counts", pass: (source) => all(source, [/count/i, /prerequisite/i]), passDetail: "You track how many prerequisites remain for each task.", reviseDetail: "Count the prerequisites for every task." },
    { id: "queue", label: "Ready queue", pass: (source) => all(source, [/queue/i, /no prerequisites|zero prerequisites/i]), passDetail: "Immediately available tasks enter the queue.", reviseDetail: "Queue every task with zero prerequisites." },
    { id: "process", label: "Unlock dependents", pass: (source) => all(source, [/reduce|decrement/i, /dependent/i, /queue/i]), passDetail: "Processing a task unlocks newly available dependents.", reviseDetail: "Reduce dependent counts and queue them when they reach zero." },
    { id: "return", label: "Cycle-safe result", pass: (source) => all(source, [/every task|all tasks/i, /return/i, /order/i]), passDetail: "You return an order only when every task was scheduled.", reviseDetail: "Return the order only if it contains every task." },
  ],
  "two-sum-window-v1": [
    { id: "state", label: "Two pointers", pass: (source) => all(source, [/pointer/i, /beginning|start|left/i, /end|right/i]), passDetail: "The search starts with pointers at both ends.", reviseDetail: "Place one pointer at the start and one at the end." },
    { id: "iteration", label: "Pointer loop", pass: (source) => all(source, [/while/i, /left/i, /right/i]), passDetail: "The pointers move until they meet.", reviseDetail: "Loop while the left pointer is before the right pointer." },
    { id: "movement", label: "Directed movement", pass: (source) => all(source, [/too small/i, /too large/i, /move/i]), passDetail: "The sum determines which pointer moves.", reviseDetail: "Move left for a small sum and right for a large sum." },
    { id: "return", label: "Matching positions", pass: (source) => all(source, [/matches?|equals?/i, /return/i, /positions?|indices?/i]), passDetail: "A matching pair returns both positions.", reviseDetail: "Return both positions when the sum matches." },
  ],
  "coin-change-lite-v1": [
    { id: "state", label: "Best-answer table", pass: (source) => all(source, [/array|table|list/i, /best|smallest|minimum/i, /amount/i]), passDetail: "You store the best answer for each amount.", reviseDetail: "Create a table of best answers by amount." },
    { id: "base", label: "Zero base case", pass: (source) => all(source, [/zero|0/i, /answer|amount/i]), passDetail: "The answer for amount zero is seeded.", reviseDetail: "Set the answer for zero to zero." },
    { id: "iteration", label: "Coin transitions", pass: (source) => all(source, [/each amount/i, /each coin|every coin|try/i]), passDetail: "You try usable coins for every amount.", reviseDetail: "For each amount, try every coin that can contribute." },
    { id: "return", label: "Minimum or fallback", pass: (source) => all(source, [/smallest|minimum|best/i, /return/i, /-1/]), passDetail: "You return the minimum coin count or -1.", reviseDetail: "Return the minimum count, or -1 when the target is unreachable." },
  ],
};

const configuredEvaluation = (draft: string, checks: ConfiguredCheck[]): Evaluation => {
  const source = draft.trim();
  const findings = checks.map<EvaluationFinding>((check) => {
    const passed = source.length > 0 && check.pass(source);
    return { id: check.id, label: check.label, status: passed ? "pass" : "revise", detail: passed ? check.passDetail : check.reviseDetail };
  });
  const passedCount = findings.filter((finding) => finding.status === "pass").length;
  const approved = findings.every((finding) => finding.status === "pass");

  return {
    approved,
    score: Math.round((passedCount / findings.length) * 100),
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

  const checks = configuredChecks[problemId];
  if (checks) return configuredEvaluation(draft, checks);

  return pairWithTargetEvaluation(draft);
}
