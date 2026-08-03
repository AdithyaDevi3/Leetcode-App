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