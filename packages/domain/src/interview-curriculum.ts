export const INTERVIEW_CORE_250_TOPICS = Object.freeze([
  ['arrays-hashing', 22], ['two-pointers', 13], ['sliding-window', 9], ['binary-search', 14],
  ['linked-lists', 14], ['stacks', 14], ['trees', 23], ['tries', 4], ['backtracking', 17],
  ['heaps', 12], ['graphs', 21], ['advanced-graphs', 10], ['dynamic-programming-1d', 17],
  ['dynamic-programming-2d', 16], ['greedy', 14], ['intervals', 7], ['bit-manipulation', 10],
  ['math-geometry', 13],
] as const);

export const INTERVIEW_CORE_250_TOTAL = INTERVIEW_CORE_250_TOPICS.reduce(
  (total, [, count]) => total + count,
  0,
);

if (INTERVIEW_CORE_250_TOTAL !== 250) {
  throw new Error('The Interview Core topic allocation must total 250 exercises.');
}

export type InterviewCurriculumTopic = typeof INTERVIEW_CORE_250_TOPICS[number][0];
export type InterviewCurriculumFormat = 'multiple_choice' | 'coding' | 'reasoning';
export type InterviewCurriculumStatus = 'draft' | 'in_review' | 'reviewed' | 'retired';
export type OriginalInterviewExercise = Readonly<{
  id: string;
  topic: InterviewCurriculumTopic;
  primarySkillId: string;
  difficulty: 'foundation' | 'intermediate' | 'advanced';
  estimatedMinutes: number;
  format: InterviewCurriculumFormat;
  prerequisiteIds: readonly string[];
  misconceptionIds: readonly string[];
  provenance: Readonly<{ kind: 'original'; authorId: string; authoredAt: string }>;
  status: InterviewCurriculumStatus;
  reviewerId: string | null;
}>;

const slug = (value: unknown): string => {
  if (typeof value !== 'string' || !/^[a-z][a-z0-9-]{2,79}$/.test(value)) throw new Error('Use a lowercase curriculum identifier.');
  return value;
};
const instant = (value: unknown): string => {
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString() !== value) throw new Error('Use an ISO UTC timestamp.');
  return value;
};
const list = (value: unknown, limit: number): readonly string[] => {
  if (!Array.isArray(value) || value.length > limit) throw new Error('Use a bounded identifier list.');
  const values = value.map(slug); if (new Set(values).size !== values.length) throw new Error('Curriculum identifiers must be unique.');
  return Object.freeze(values);
};

/** Validate metadata for one original exercise without exposing prompts or keys. */
export function freezeOriginalInterviewExercise(value: unknown): OriginalInterviewExercise {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Use an exercise object.');
  const item = value as Record<string, unknown>;
  const expected = ['id','topic','primarySkillId','difficulty','estimatedMinutes','format','prerequisiteIds','misconceptionIds','provenance','status','reviewerId'];
  if (Object.keys(item).length !== expected.length || expected.some(key => !Object.hasOwn(item, key))) throw new Error('Exercise fields are invalid.');
  const topic = item.topic as InterviewCurriculumTopic;
  if (!INTERVIEW_CORE_250_TOPICS.some(([id]) => id === topic)) throw new Error('Use a supported curriculum topic.');
  if (!['foundation','intermediate','advanced'].includes(item.difficulty as string) || !['multiple_choice','coding','reasoning'].includes(item.format as string)) throw new Error('Exercise classification is invalid.');
  if (typeof item.estimatedMinutes !== 'number' || !Number.isSafeInteger(item.estimatedMinutes) || item.estimatedMinutes < 5 || item.estimatedMinutes > 180) throw new Error('Use an estimated duration from 5 to 180 minutes.');
  if (!item.provenance || typeof item.provenance !== 'object' || Array.isArray(item.provenance)) throw new Error('Original provenance is required.');
  const provenance = item.provenance as Record<string, unknown>;
  if (provenance.kind !== 'original') throw new Error('Only original exercises are allowed.');
  const status = item.status as InterviewCurriculumStatus;
  if (!['draft','in_review','reviewed','retired'].includes(status)) throw new Error('Exercise status is invalid.');
  const reviewerId = item.reviewerId === null ? null : slug(item.reviewerId);
  if ((status === 'reviewed' || status === 'retired') !== Boolean(reviewerId)) throw new Error('Reviewed exercises require an independent reviewer.');
  const authorId = slug(provenance.authorId); if (reviewerId === authorId) throw new Error('The reviewer must be independent.');
  return Object.freeze({ id: slug(item.id), topic, primarySkillId: slug(item.primarySkillId), difficulty: item.difficulty as OriginalInterviewExercise['difficulty'], estimatedMinutes: item.estimatedMinutes, format: item.format as InterviewCurriculumFormat, prerequisiteIds: list(item.prerequisiteIds, 8), misconceptionIds: list(item.misconceptionIds, 8), provenance: Object.freeze({ kind: 'original', authorId, authoredAt: instant(provenance.authoredAt) }), status, reviewerId });
}

/** Require an exact, original 250-item catalog with the intended topic balance. */
export function validateInterviewCore250Catalog(items: readonly unknown[]): readonly OriginalInterviewExercise[] {
  if (!Array.isArray(items) || items.length !== 250) throw new Error('The Interview Core catalog requires exactly 250 exercises.');
  const frozen = items.map(freezeOriginalInterviewExercise);
  if (new Set(frozen.map(item => item.id)).size !== frozen.length) throw new Error('Curriculum exercise IDs must be unique.');
  for (const [topic, expected] of INTERVIEW_CORE_250_TOPICS) if (frozen.filter(item => item.topic === topic).length !== expected) throw new Error(`Topic ${topic} requires ${expected} exercises.`);
  return Object.freeze(frozen);
}
