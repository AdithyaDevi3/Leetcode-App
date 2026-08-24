export type PracticeItem = {
  id: string;
  label: string;
  lesson: {
    eyebrow: string;
    title: string;
    summary: string;
    principle: string;
  };
  problem: {
    title: string;
    prompt: string;
    example: {
      input: string;
      output: string;
      note: string;
    };
    constraints: string[];
  };
  starterDraft: string;
  flawedDraft: string;
  codeFunction: string;
  codeSignature: string;
  trace: {
    title: string;
    subtitle: string;
    values: number[];
    highlights: number[];
  };
  blockOptions: Array<{ label: string; value: string }>;
};

export const practiceItems: PracticeItem[] = [
  {
    id: "pair-with-target-v1",
    label: "Pair With Target",
    lesson: {
      eyebrow: "Hash maps · Foundation",
      title: "Remember what you have seen",
      summary:
        "A hash map trades extra space for fast lookups. The useful question is often not “what pair works?” but “what value would complete the pair I am looking at now?”",
      principle:
        "Store each value only after checking for its complement. That prevents reusing the same position when one number is half the target.",
    },
    problem: {
      title: "Pair With Target",
      prompt:
        "Given a list of integers and a target, return the positions of two distinct values whose sum is the target. Exactly one valid pair exists.",
      example: {
        input: "values = [4, 7, 1, 9], target = 8",
        output: "[1, 2]",
        note: "values[1] + values[2] = 7 + 1 = 8",
      },
      constraints: [
        "2 ≤ values.length ≤ 100,000",
        "Use each position at most once",
        "Aim for O(n) time and O(n) space",
      ],
    },
    starterDraft: `Create an empty map from value to position.
For each value and position in the list:
  Let complement be target minus value.
  If complement exists in the map, return its stored position and the current position.
  Otherwise store value mapped to the current position.
Return no pair.`,
    flawedDraft: `For each value in the list:
  Look through every other value.
  If the two values add to target, return their positions.`,
    codeFunction: "findPair",
    codeSignature: "values: number[], target: number",
    trace: {
      title: "values",
      subtitle: "target 8",
      values: [4, 7, 1, 9],
      highlights: [1, 2],
    },
    blockOptions: [
      { label: "State", value: "Create an empty map from value to position." },
      { label: "Loop", value: "For each value and position in the list:" },
      { label: "Compute", value: "Let complement be target minus value." },
      {
        label: "Check",
        value:
          "If complement exists in the map, return its stored position and the current position.",
      },
      { label: "Store", value: "Otherwise store value mapped to the current position." },
      { label: "Return", value: "Return no pair." },
    ],
  },
  {
    id: "max-window-sum-v1",
    label: "Max Window Sum",
    lesson: {
      eyebrow: "Windows · Sliding window",
      title: "Hold a moving slice",
      summary:
        "A sliding window keeps only the information you need for the current range. The trick is to update the window incrementally instead of recomputing every slice from scratch.",
      principle:
        "Track the current sum, subtract the element that leaves the window, and add the new element that enters. That keeps each step constant-time.",
    },
    problem: {
      title: "Max Window Sum",
      prompt:
        "Given a list of integers and a window size, return the largest sum of any contiguous window of that size.",
      example: {
        input: "values = [2, 1, 5, 1, 3, 2], size = 3",
        output: "9",
        note: "The window [5, 1, 3] has the largest sum.",
      },
      constraints: [
        "1 ≤ values.length ≤ 100,000",
        "1 ≤ size ≤ values.length",
        "Aim for O(n) time and O(1) extra space",
      ],
    },
    starterDraft: `Track the sum of the first window.
For each new position after that:
  Remove the value that leaves the window.
  Add the value that enters the window.
  Update the best sum if the current sum is larger.
Return the best sum.`,
    flawedDraft: `For each window:
  Add every value in the window.
  If the sum is larger than before, keep it.
Return the largest sum.`,
    codeFunction: "maxWindowSum",
    codeSignature: "values: number[], size: number",
    trace: {
      title: "values",
      subtitle: "window size 3",
      values: [2, 1, 5, 1, 3, 2],
      highlights: [2, 3, 4],
    },
    blockOptions: [
      { label: "State", value: "Track the sum of the first window." },
      { label: "Slide", value: "For each new position after that:" },
      { label: "Remove", value: "Remove the value that leaves the window." },
      { label: "Add", value: "Add the value that enters the window." },
      { label: "Best", value: "Update the best sum if the current sum is larger." },
      { label: "Return", value: "Return the best sum." },
    ],
  },
  {
    id: "tree-max-depth-v1",
    label: "Tree Max Depth",
    lesson: {
      eyebrow: "Recursion · Trees",
      title: "Let the shape recurse",
      summary:
        "Tree problems often become simpler when each node trusts its children to solve their own subproblems. The parent only needs to combine the returned answers.",
      principle:
        "Ask each child for its depth, take the larger one, and add one for the current node. The recursion naturally follows the tree structure.",
    },
    problem: {
      title: "Tree Max Depth",
      prompt:
        "Given the root of a binary tree, return the maximum depth of the tree.",
      example: {
        input: "tree = [3, 9, 20, null, null, 15, 7]",
        output: "3",
        note: "The longest path has three nodes.",
      },
      constraints: [
        "1 ≤ number of nodes ≤ 10,000",
        "Use recursion or an explicit stack",
        "Aim for O(n) time and O(h) space",
      ],
    },
    starterDraft: `If the current node is empty:
  Return 0.
Ask the left child for its depth.
Ask the right child for its depth.
Return one plus the larger depth.`,
    flawedDraft: `If the current node is empty:
  Return 0.
Return one plus the left child depth.`,
    codeFunction: "maxDepth",
    codeSignature: "root: TreeNode | null",
    trace: {
      title: "tree",
      subtitle: "depth grows down each branch",
      values: [3, 9, 20, 15, 7],
      highlights: [0, 2, 3],
    },
    blockOptions: [
      { label: "Base", value: "If the current node is empty: Return 0." },
      { label: "Left", value: "Ask the left child for its depth." },
      { label: "Right", value: "Ask the right child for its depth." },
      { label: "Combine", value: "Return one plus the larger depth." },
    ],
  },
  {
    id: "first-unique-index-v1",
    label: "First Unique Index",
    lesson: {
      eyebrow: "Hash maps · Counting",
      title: "Count first, decide second",
      summary:
        "Sometimes the useful hash map is not a lookup table for complements but a frequency table for counts. The first pass gathers evidence; the second pass chooses the answer.",
      principle:
        "Count every value before searching for one that appears exactly once. That separates data collection from selection.",
    },
    problem: {
      title: "First Unique Index",
      prompt:
        "Given a list of integers, return the first position whose value appears exactly once. If no value is unique, return -1.",
      example: {
        input: "values = [9, 4, 9, 6, 4, 7]",
        output: "3",
        note: "6 is the first value that appears once.",
      },
      constraints: [
        "1 ≤ values.length ≤ 100,000",
        "Use O(n) time and O(n) space",
        "Return -1 when no value is unique",
      ],
    },
    starterDraft: `Create a map from value to count.
For each value in the list:
  Increase that value's count in the map.
For each value and position in the list:
  If the count for this value is 1, return the position.
Return -1.`,
    flawedDraft: `For each value in the list:
  If no other value matches it, return its position.
Return -1.`,
    codeFunction: "findFirstUniqueIndex",
    codeSignature: "values: number[]",
    trace: {
      title: "values",
      subtitle: "counting pass, then selection",
      values: [9, 4, 9, 6, 4, 7],
      highlights: [3, 5],
    },
    blockOptions: [
      { label: "State", value: "Create a map from value to count." },
      { label: "Count", value: "Increase that value's count in the map." },
      { label: "Scan", value: "For each value and position in the list:" },
      { label: "Check", value: "If the count for this value is 1, return the position." },
      { label: "Fallback", value: "Return -1." },
    ],
  },
];

export const defaultPracticeItem = practiceItems[0];

export const getPracticeItem = (id: string) =>
  practiceItems.find((item) => item.id === id) ?? defaultPracticeItem;

export const lesson = defaultPracticeItem.lesson;
export const problem = defaultPracticeItem.problem;
export const starterDraft = defaultPracticeItem.starterDraft;
export const flawedDraft = defaultPracticeItem.flawedDraft;