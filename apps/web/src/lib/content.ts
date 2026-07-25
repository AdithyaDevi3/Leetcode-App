export const lesson = {
  eyebrow: "Hash maps · Foundation",
  title: "Remember what you have seen",
  summary:
    "A hash map trades extra space for fast lookups. The useful question is often not “what pair works?” but “what value would complete the pair I am looking at now?”",
  principle:
    "Store each value only after checking for its complement. That prevents reusing the same position when one number is half the target.",
};

export const problem = {
  id: "pair-with-target-v1",
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
};

export const starterDraft = `Create an empty map from value to position.
For each value and position in the list:
  Let complement be target minus value.
  If complement exists in the map, return its stored position and the current position.
  Otherwise store value mapped to the current position.
Return no pair.`;

export const flawedDraft = `For each value in the list:
  Look through every other value.
  If the two values add to target, return their positions.`;