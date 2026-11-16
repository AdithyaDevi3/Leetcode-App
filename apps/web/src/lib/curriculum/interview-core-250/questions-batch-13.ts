import 'server-only';
import {
  freezeQuestionVersion,
  questionVersionKey,
  type InterviewCurriculumTopic,
  type QuestionDifficulty,
  type QuestionOption,
  type QuestionVersion,
} from '@leetcode-app/domain';

export const interviewCore250Batch13Topics = [
  'arrays-hashing',
  'binary-search',
  'linked-lists',
  'trees',
  'advanced-graphs',
  'dynamic-programming-1d',
  'dynamic-programming-2d',
  'greedy',
  'intervals',
  'math-geometry',
] as const satisfies readonly InterviewCurriculumTopic[];

type Topic = (typeof interviewCore250Batch13Topics)[number];

type QuestionInput = {
  questionId: string;
  title: string;
  topicId: Topic;
  difficulty: QuestionDifficulty;
  activityId: string;
  conceptIds: string[];
  prompt: string;
  options: QuestionOption[];
  correctOptionId: string;
  explanation: string;
};

const option = (id: string, text: string, misconception?: string): QuestionOption => ({
  id,
  text,
  misconceptionTags: misconception ? [misconception] : [],
});

const question = (input: QuestionInput): QuestionVersion => freezeQuestionVersion({
  questionId: input.questionId,
  version: 1,
  versionId: questionVersionKey(input.questionId, 1),
  kind: 'multiple_choice',
  status: 'in_review',
  title: input.title,
  prompt: input.prompt,
  difficulty: input.difficulty,
  activityIds: [input.activityId],
  conceptIds: [input.topicId, ...input.conceptIds],
  options: input.options,
  correctOptionId: input.correctOptionId,
  explanation: input.explanation,
  provenance: {
    kind: 'original',
    authorId: 'interview-core-250-original-author-v13',
    authoredAt: '2026-11-16T20:00:00.000Z',
  },
  review: null,
});

/** Original material awaiting independent review. The live catalog does not import it. */
export const interviewCore250Batch13Questions: readonly QuestionVersion[] = Object.freeze([
  question({
    questionId: 'core250-hash-prefix-balance-count',
    title: 'Count matching prefix balances',
    topicId: 'arrays-hashing',
    difficulty: 'intermediate',
    activityId: 'balanced-symbol-range-v3',
    conceptIds: ['prefix-sum', 'frequency-map'],
    prompt: 'A range is balanced when two symbol types occur equally often. What map key identifies equal prefix balances?',
    options: [
      option('a', 'The running difference between the two counts.'),
      option('b', 'The current range length only.', 'losing-count-balance'),
      option('c', 'The largest input value.', 'using-unrelated-state'),
      option('d', 'The current index modulo two.', 'using-insufficient-state'),
    ],
    correctOptionId: 'a',
    explanation: 'Two equal prefix differences enclose a range with no net difference between the symbol counts.',
  }),
  question({
    questionId: 'core250-binary-matrix-row-elimination',
    title: 'Eliminate a sorted matrix row',
    topicId: 'binary-search',
    difficulty: 'intermediate',
    activityId: 'sorted-grid-search-v3',
    conceptIds: ['matrix-search', 'order-invariant'],
    prompt: 'Rows and columns increase in a grid. The top-right value is greater than target. Which area can contain no target?',
    options: [
      option('a', 'The rest of that column below the current value.'),
      option('b', 'The row to the left of the value.', 'discarding-smaller-values'),
      option('c', 'Every value below the row.', 'discarding-possible-values'),
      option('d', 'Only the current cell.', 'not-using-order'),
    ],
    correctOptionId: 'a',
    explanation: 'Every value below the current value in that column is larger. None can equal the smaller target.',
  }),
  question({
    questionId: 'core250-chain-merge-attach-smaller',
    title: 'Attach the smaller chain value',
    topicId: 'linked-lists',
    difficulty: 'foundation',
    activityId: 'ordered-chain-merge-v3',
    conceptIds: ['merge', 'pointer-update'],
    prompt: 'Two linked chains are already ordered. Which node should the merged chain attach next?',
    options: [
      option('a', 'The smaller current node.'),
      option('b', 'The larger current node.', 'breaking-order'),
      option('c', 'A new node with zero.', 'adding-unneeded-node'),
      option('d', 'The final node from either chain.', 'skipping-earlier-values'),
    ],
    correctOptionId: 'a',
    explanation: 'The smaller current node is the next smallest remaining value. Attaching it preserves sorted order.',
  }),
  question({
    questionId: 'core250-tree-serialize-null-marker',
    title: 'Preserve missing tree children',
    topicId: 'trees',
    difficulty: 'intermediate',
    activityId: 'tree-encode-decode-v3',
    conceptIds: ['serialization', 'tree-shape'],
    prompt: 'A tree serializer must reconstruct the original child layout. What should it record for a missing child?',
    options: [
      option('a', 'A distinct null marker.'),
      option('b', 'The parent value again.', 'changing-tree-shape'),
      option('c', 'Nothing at all.', 'losing-structure'),
      option('d', 'The depth only.', 'using-insufficient-state'),
    ],
    correctOptionId: 'a',
    explanation: 'A null marker distinguishes a missing child from a child that appears later in the value sequence.',
  }),
  question({
    questionId: 'core250-advanced-graph-probability-relaxation',
    title: 'Improve a path probability',
    topicId: 'advanced-graphs',
    difficulty: 'advanced',
    activityId: 'maximum-probability-route-v3',
    conceptIds: ['best-first-search', 'edge-relaxation'],
    prompt: 'Each graph edge has a success probability. A route reaches a neighbor with a higher probability. What should the search do?',
    options: [
      option('a', 'Update the neighbor and schedule it for reconsideration.'),
      option('b', 'Keep the lower probability.', 'rejecting-improvement'),
      option('c', 'Add all probabilities together.', 'using-wrong-path-rule'),
      option('d', 'Remove the edge.', 'discarding-valid-route'),
    ],
    correctOptionId: 'a',
    explanation: 'A better route can improve later choices from that neighbor. The search must propagate the new value.',
  }),
  question({
    questionId: 'core250-dp1d-word-segment-reachable',
    title: 'Mark a reachable text boundary',
    topicId: 'dynamic-programming-1d',
    difficulty: 'intermediate',
    activityId: 'dictionary-text-split-v3',
    conceptIds: ['boolean-state', 'substring-transition'],
    prompt: 'A text can be split into dictionary words. When should position i be marked reachable?',
    options: [
      option('a', 'A reachable earlier position ends before a dictionary word that reaches i.'),
      option('b', 'The prefix has an even length.', 'using-unrelated-property'),
      option('c', 'The final character appears in the dictionary.', 'checking-too-little'),
      option('d', 'Every earlier position is reachable.', 'requiring-too-much'),
    ],
    correctOptionId: 'a',
    explanation: 'A valid split combines one reachable prefix with one dictionary word ending at the current boundary.',
  }),
  question({
    questionId: 'core250-dp2d-path-obstacle-zero',
    title: 'Block a grid-path state',
    topicId: 'dynamic-programming-2d',
    difficulty: 'foundation',
    activityId: 'blocked-grid-routes-v3',
    conceptIds: ['grid-state', 'base-case'],
    prompt: 'A grid cell is blocked in a right-and-down path count. What path count should that cell have?',
    options: [
      option('a', 'Zero.'),
      option('b', 'One.', 'accepting-blocked-path'),
      option('c', 'The sum of all grid values.', 'using-unrelated-state'),
      option('d', 'Its row number.', 'using-position-as-count'),
    ],
    correctOptionId: 'a',
    explanation: 'No permitted path can enter a blocked cell. It cannot contribute to any later path count.',
  }),
  question({
    questionId: 'core250-greedy-gas-surplus-reset',
    title: 'Reset after a fuel deficit',
    topicId: 'greedy',
    difficulty: 'intermediate',
    activityId: 'circular-fuel-start-v3',
    conceptIds: ['running-surplus', 'start-candidate'],
    prompt: 'A circular trip loses more fuel than it gains before reaching station i. Which station can be the start of a valid route through i?',
    options: [
      option('a', 'No station in the failed segment.'),
      option('b', 'Only the first failed station.', 'keeping-invalid-start'),
      option('c', 'Every station in the failed segment.', 'ignoring-deficit'),
      option('d', 'The station with the smallest fuel cost.', 'using-local-value-only'),
    ],
    correctOptionId: 'a',
    explanation: 'Every start in the failed segment carries the same deficit before station i. The next candidate starts after it.',
  }),
  question({
    questionId: 'core250-interval-meeting-boundary-release',
    title: 'Release an ended interval',
    topicId: 'intervals',
    difficulty: 'intermediate',
    activityId: 'meeting-room-reuse-v3',
    conceptIds: ['sorted-boundaries', 'resource-reuse'],
    prompt: 'Meeting times are sorted by start and end. An end time is at or before the next start time. What should the scheduler do?',
    options: [
      option('a', 'Reuse the room that ended.'),
      option('b', 'Reserve an extra room.', 'missing-reuse'),
      option('c', 'Delete the next meeting.', 'discarding-required-work'),
      option('d', 'Move every end time later.', 'changing-input'),
    ],
    correctOptionId: 'a',
    explanation: 'The earlier meeting no longer occupies the room. Its resource is available at the next start time.',
  }),
  question({
    questionId: 'core250-math-rectangle-corner-normalize',
    title: 'Build a rectangle identity key',
    topicId: 'math-geometry',
    difficulty: 'advanced',
    activityId: 'axis-rectangle-count-v3',
    conceptIds: ['coordinate-pairs', 'canonical-key'],
    prompt: 'A method counts axis-aligned rectangles from point rows. Which row-pair key should it store?',
    options: [
      option('a', 'The two row values in a fixed sorted order.'),
      option('b', 'Only the first row value.', 'losing-pair-identity'),
      option('c', 'The current column index only.', 'using-insufficient-key'),
      option('d', 'The distance from the origin.', 'using-unrelated-property'),
    ],
    correctOptionId: 'a',
    explanation: 'The same unordered row pair must create one stable key. A repeated pair across columns forms a rectangle.',
  }),
]);
