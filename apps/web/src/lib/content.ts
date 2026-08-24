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
    id: "balanced-brackets-v1",
    label: "Balanced Brackets",
    lesson: {
      eyebrow: "Stacks · Validation",
      title: "Match the most recent opener",
      summary:
        "A stack is useful when the next thing you need to match is the most recent unresolved item. Bracket validation is a classic example of that LIFO shape.",
      principle:
        "Push openers as they arrive, and when a closer appears, compare it with the most recent opener. If they do not match, the string is invalid.",
    },
    problem: {
      title: "Balanced Brackets",
      prompt:
        "Given a string containing brackets, return whether the brackets are balanced and correctly nested.",
      example: {
        input: "text = \"{[()()]}\"",
        output: "true",
        note: "Every closer matches the most recent compatible opener.",
      },
      constraints: [
        "1 ≤ text.length ≤ 100,000",
        "Use O(n) time and O(n) space",
        "Support (), {}, and []",
      ],
    },
    starterDraft: `Create an empty stack.
For each character in the text:
  If it is an opener, push it on the stack.
  If it is a closer, compare it with the top of the stack.
  If they do not match, return false.
Return whether the stack is empty.`,
    flawedDraft: `For each character in the text:
  If it is an opener, remember it.
  If it is a closer, check whether any opener exists.
Return true.`,
    codeFunction: "isBalanced",
    codeSignature: "text: string",
    trace: {
      title: "text",
      subtitle: "stack grows and shrinks with nesting",
      values: [1, 2, 3, 3, 2, 1],
      highlights: [0, 2, 4],
    },
    blockOptions: [
      { label: "State", value: "Create an empty stack." },
      { label: "Loop", value: "For each character in the text:" },
      { label: "Push", value: "If it is an opener, push it on the stack." },
      { label: "Match", value: "If it is a closer, compare it with the top of the stack." },
      { label: "Fail", value: "If they do not match, return false." },
      { label: "Finish", value: "Return whether the stack is empty." },
    ],
  },
  {
    id: "climb-stairs-v1",
    label: "Climb Stairs",
    lesson: {
      eyebrow: "Dynamic programming · Basics",
      title: "Remember the smaller answers",
      summary:
        "Dynamic programming starts when a problem keeps asking for the same smaller answers. Once you store them, the larger answer becomes a simple combination step.",
      principle:
        "The number of ways to reach step n comes from the two previous steps. Each answer depends only on a tiny sliding history.",
    },
    problem: {
      title: "Climb Stairs",
      prompt:
        "Given a staircase with n steps, return how many distinct ways you can climb to the top if you may climb one or two steps at a time.",
      example: {
        input: "n = 4",
        output: "5",
        note: "The distinct paths are 1+1+1+1, 1+1+2, 1+2+1, 2+1+1, and 2+2.",
      },
      constraints: [
        "1 ≤ n ≤ 45",
        "Use O(n) time",
        "Aim for O(1) extra space",
      ],
    },
    starterDraft: `If there are no steps, return 1.
If there is one step, return 1.
Keep the last two answers.
For each larger step count:
  Add the previous two answers.
Return the latest answer.`,
    flawedDraft: `For each step:
  Add the current step count to the answer.
Return the answer.`,
    codeFunction: "climbStairs",
    codeSignature: "n: number",
    trace: {
      title: "steps",
      subtitle: "ways grow like a small recurrence",
      values: [1, 2, 3, 4, 5],
      highlights: [1, 2, 3],
    },
    blockOptions: [
      { label: "Base", value: "If there are no steps, return 1." },
      { label: "Seed", value: "If there is one step, return 1." },
      { label: "State", value: "Keep the last two answers." },
      { label: "Update", value: "For each larger step count: Add the previous two answers." },
      { label: "Return", value: "Return the latest answer." },
    ],
  },
  {
    id: "island-count-v1",
    label: "Island Count",
    lesson: {
      eyebrow: "Graphs · Flood fill",
      title: "Visit each connected piece once",
      summary:
        "Graph traversal becomes manageable when you mark what you have already visited. For grid problems, each cell can belong to one connected region that you explore completely before moving on.",
      principle:
        "When you find land that has not been seen before, explore every adjacent land cell and mark them as visited so the same island is not counted twice.",
    },
    problem: {
      title: "Island Count",
      prompt:
        "Given a grid of 0s and 1s, return how many connected groups of 1s exist using four-directional adjacency.",
      example: {
        input: "grid = [[1,1,0],[0,1,0],[1,0,1]]",
        output: "3",
        note: "There are three separate land masses.",
      },
      constraints: [
        "1 ≤ rows, cols ≤ 300",
        "Use O(rows * cols) time",
        "Track visited cells to avoid repeats",
      ],
    },
    starterDraft: `For each cell in the grid:
  If the cell is land and has not been visited, start a search.
  Mark every connected land cell as visited.
  Increase the island count.
Return the island count.`,
    flawedDraft: `For each row in the grid:
  Count the land cells in that row.
Return the count.`,
    codeFunction: "countIslands",
    codeSignature: "grid: number[][]",
    trace: {
      title: "grid",
      subtitle: "connected land components",
      values: [1, 1, 0, 0, 1, 0, 1],
      highlights: [0, 1, 4, 6],
    },
    blockOptions: [
      { label: "Scan", value: "For each cell in the grid:" },
      { label: "Start", value: "If the cell is land and has not been visited, start a search." },
      { label: "Mark", value: "Mark every connected land cell as visited." },
      { label: "Count", value: "Increase the island count." },
      { label: "Return", value: "Return the island count." },
    ],
  },
  {
    id: "task-order-v1",
    label: "Task Order",
    lesson: {
      eyebrow: "Queues · Ordering",
      title: "Process in arrival order",
      summary:
        "A queue is the right shape when tasks should be processed in the same order they arrive. That structure is common in breadth-first exploration and basic scheduling.",
      principle:
        "Put new work at the back, take work from the front, and continue until no tasks remain. The order stays stable as the queue grows and shrinks.",
    },
    problem: {
      title: "Task Order",
      prompt:
        "Given a list of tasks with optional prerequisites, return one valid order that completes every task once all of its prerequisites have been satisfied.",
      example: {
        input: "tasks = [A, B, C], prereqs = [[A, B], [B, C]]",
        output: "[C, B, A]",
        note: "C must finish before B, and B before A.",
      },
      constraints: [
        "1 ≤ tasks.length ≤ 10,000",
        "Use O(tasks + prereqs) time",
        "Handle cycles by reporting that no order exists",
      ],
    },
    starterDraft: `Count the prerequisites for each task.
Put tasks with no prerequisites in a queue.
While the queue is not empty:
  Remove the next task.
  Add it to the order.
  Reduce the prerequisite count for its dependents.
  Add newly available tasks to the queue.
Return the order if every task was scheduled.`,
    flawedDraft: `Put the tasks in any order.
Return the tasks.`,
    codeFunction: "taskOrder",
    codeSignature: "tasks: string[]",
    trace: {
      title: "tasks",
      subtitle: "frontier of ready work",
      values: [0, 1, 2, 3],
      highlights: [0],
    },
    blockOptions: [
      { label: "Count", value: "Count the prerequisites for each task." },
      { label: "Queue", value: "Put tasks with no prerequisites in a queue." },
      { label: "Process", value: "While the queue is not empty:" },
      { label: "Schedule", value: "Remove the next task. Add it to the order." },
      { label: "Unlock", value: "Reduce the prerequisite count for its dependents." },
      { label: "Return", value: "Return the order if every task was scheduled." },
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