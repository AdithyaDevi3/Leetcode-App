/** Points are stored in hundredths. Percentages are rounded only for display. */
export const GRADE_POINT_SCALE = 100;
export const GRADEBOOK_CALCULATION_VERSION = 'points-v1';

export type GradeCriterion = Readonly<{ id: string; label: string; maxUnits: number }>;
export type AssignmentGradePolicy = Readonly<{
  assignmentId: string;
  versionId: string;
  contentVersionId: string;
  maxUnits: number;
  attemptPolicy: 'latest' | 'best';
  scoring:
    | Readonly<{ mode: 'verified_completion'; verifierVersionId: string }>
    | Readonly<{ mode: 'reviewed_rubric'; rubricVersionId: string; criteria: readonly GradeCriterion[] }>;
}>;

export type AssignmentGradeResult =
  | Readonly<{ status: 'unsubmitted' | 'queued' | 'running' | 'needs_review' | 'unavailable' }>
  | Readonly<{
      status: 'scored';
      earnedUnits: number;
      attemptId: string;
      responseRevisionId: string;
      evaluatorVersionId: string;
      gradeRevisionId: string;
      publication: 'draft' | 'published';
      dispute: 'none' | 'open' | 'resolved';
    }>
  | Readonly<{
      status: 'missing_zero';
      gradeRevisionId: string;
      finalizedBy: string;
      reason: string;
      dispute: 'none' | 'open' | 'resolved';
    }>;

export type GradebookCell = Readonly<{
  assignmentId: string;
  policyVersionId: string;
}> & (
  | Readonly<{ applicability: 'assigned'; result: AssignmentGradeResult }>
  | Readonly<{ applicability: 'excused' | 'not_assigned' }>
);

export type GradebookLearner = Readonly<{
  learnerId: string;
  membership: 'included' | 'withdrawn';
  cells: readonly GradebookCell[];
}>;

export type GradeTotal = Readonly<{
  earnedUnits: number;
  possibleUnits: number;
  /** Null for an empty denominator; never an invented zero or perfect score. */
  percentage: string | null;
}>;

export type RankingExclusion =
  | 'withdrawn' | 'no_assignments' | 'different_assignment_set'
  | 'unsubmitted' | 'awaiting_grade' | 'unpublished_grade' | 'disputed_grade';

export type GradebookRow = Readonly<{
  learnerId: string;
  publishedTotal: GradeTotal;
  /** Total eligible for this exact comparison set, not an adjusted personal course total. */
  finalizedTotal: GradeTotal | null;
  coverage: Readonly<{ published: number; applicable: number; comparison: number }>;
  exclusions: readonly RankingExclusion[];
  rank: number | null;
}>;

function identifier(value: string): void {
  if (typeof value !== 'string' || !value.trim()) throw new Error('A nonempty identifier or label is required');
}

function units(value: number, positive = false): void {
  if (!Number.isSafeInteger(value) || value < (positive ? 1 : 0)) throw new Error('Point units must be safe nonnegative integers; maxima must be positive');
}

function addUnits(left: number, right: number): number {
  const sum = left + right;
  units(sum);
  return sum;
}

/** Parse decimal point input without introducing binary floating-point error. */
export function parseGradePoints(value: string): number {
  if (typeof value !== 'string' || !/^(0|[1-9]\d*)(\.\d{1,2})?$/.test(value)) throw new Error('Use nonnegative points with at most two decimal places');
  const [whole, fraction = ''] = value.split('.');
  const result = BigInt(whole) * BigInt(GRADE_POINT_SCALE) + BigInt(fraction.padEnd(2, '0'));
  if (result > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('Points exceed the supported range');
  return Number(result);
}

/** Return an isolated, deeply frozen policy; persisted policies also need immutable storage. */
export function freezeAssignmentGradePolicy(policy: AssignmentGradePolicy): AssignmentGradePolicy {
  identifier(policy.assignmentId);
  identifier(policy.versionId);
  identifier(policy.contentVersionId);
  units(policy.maxUnits, true);
  if (!['latest', 'best'].includes(policy.attemptPolicy)) throw new Error('Unsupported attempt policy');
  if (policy.scoring.mode === 'verified_completion') {
    identifier(policy.scoring.verifierVersionId);
    return Object.freeze({ ...policy, scoring: Object.freeze({ ...policy.scoring }) });
  }
  if (policy.scoring.mode !== 'reviewed_rubric') throw new Error('Unsupported scoring mode');
  identifier(policy.scoring.rubricVersionId);
  const seen = new Set<string>();
  let maximum = 0;
  const criteria = policy.scoring.criteria.map(criterion => {
    identifier(criterion.id);
    identifier(criterion.label);
    units(criterion.maxUnits, true);
    if (seen.has(criterion.id)) throw new Error('Duplicate rubric criterion');
    seen.add(criterion.id);
    maximum = addUnits(maximum, criterion.maxUnits);
    return Object.freeze({ ...criterion });
  });
  if (maximum !== policy.maxUnits) throw new Error('Rubric maxima must equal assignment points');
  return Object.freeze({ ...policy, scoring: Object.freeze({ ...policy.scoring, criteria: Object.freeze(criteria) }) });
}

export function calculateGradeTotal(earnedUnits: number, possibleUnits: number): GradeTotal {
  units(earnedUnits);
  units(possibleUnits);
  if (earnedUnits > possibleUnits) throw new Error('Earned points exceed possible points');
  if (!possibleUnits) return { earnedUnits, possibleUnits, percentage: null };
  // Hundredths of one percent, rounded half-up with exact integer arithmetic.
  const rounded = (BigInt(earnedUnits) * 20_000n + BigInt(possibleUnits)) / (2n * BigInt(possibleUnits));
  return { earnedUnits, possibleUnits, percentage: `${rounded / 100n}.${String(rounded % 100n).padStart(2, '0')}` };
}

function publishedScore(result: AssignmentGradeResult, policy: AssignmentGradePolicy): number | null {
  switch (result.status) {
    case 'unsubmitted': case 'queued': case 'running': case 'needs_review': case 'unavailable': return null;
    case 'scored':
      identifier(result.attemptId);
      identifier(result.responseRevisionId);
      identifier(result.evaluatorVersionId);
      identifier(result.gradeRevisionId);
      units(result.earnedUnits);
      if (result.earnedUnits > policy.maxUnits) throw new Error('Grade exceeds assignment maximum');
      if (policy.scoring.mode === 'verified_completion' && result.earnedUnits !== 0 && result.earnedUnits !== policy.maxUnits) throw new Error('Verified completion grades must be zero or full points');
      if (!['draft', 'published'].includes(result.publication)) throw new Error('Invalid publication state');
      if (!['none', 'open', 'resolved'].includes(result.dispute)) throw new Error('Invalid dispute state');
      return result.publication === 'published' ? result.earnedUnits : null;
    case 'missing_zero':
      identifier(result.gradeRevisionId);
      identifier(result.finalizedBy);
      identifier(result.reason);
      if (!['none', 'open', 'resolved'].includes(result.dispute)) throw new Error('Invalid dispute state');
      return 0;
    default: throw new Error('Invalid grade state');
  }
}

/**
 * Compute one declared comparison cohort. Callers must authorize access and pin
 * a consistent database snapshot first. No private diagnostic or mastery input
 * belongs here. Require one explicit cell per assignment, including excusals.
 */
export function calculateGradebook(
  policies: readonly AssignmentGradePolicy[],
  learners: readonly GradebookLearner[],
): GradebookRow[] {
  const assignments = new Map<string, AssignmentGradePolicy>();
  for (const input of policies) {
    const policy = freezeAssignmentGradePolicy(input);
    if (assignments.has(policy.assignmentId)) throw new Error('Duplicate assignment');
    assignments.set(policy.assignmentId, policy);
  }
  const learnerIds = new Set<string>();
  const rows = learners.map(learner => {
    identifier(learner.learnerId);
    if (learnerIds.has(learner.learnerId)) throw new Error('Duplicate learner');
    learnerIds.add(learner.learnerId);
    if (!['included', 'withdrawn'].includes(learner.membership)) throw new Error('Invalid cohort membership');
    const exclusions = new Set<RankingExclusion>();
    if (learner.membership === 'withdrawn') exclusions.add('withdrawn');
    if (!assignments.size) exclusions.add('no_assignments');
    const seen = new Set<string>();
    let earned = 0, possible = 0, published = 0, applicable = 0;
    for (const cell of learner.cells) {
      const policy = assignments.get(cell.assignmentId);
      if (!policy || seen.has(cell.assignmentId)) throw new Error('Unknown or duplicate assignment cell');
      seen.add(cell.assignmentId);
      if (cell.policyVersionId !== policy.versionId) throw new Error('Grade policy version mismatch');
      if (cell.applicability === 'excused' || cell.applicability === 'not_assigned') {
        exclusions.add('different_assignment_set');
        continue;
      }
      if (cell.applicability !== 'assigned') throw new Error('Invalid assignment applicability');
      applicable++;
      const score = publishedScore(cell.result, policy);
      if (score !== null) {
        earned = addUnits(earned, score);
        possible = addUnits(possible, policy.maxUnits);
        published++;
      }
      if (cell.result.status === 'scored' || cell.result.status === 'missing_zero') {
        if (cell.result.dispute === 'open') exclusions.add('disputed_grade');
        if (score === null) exclusions.add('unpublished_grade');
      } else if (cell.result.status === 'unsubmitted') exclusions.add('unsubmitted');
      else exclusions.add('awaiting_grade');
    }
    if (seen.size !== assignments.size) throw new Error('Missing assignment cell; provide an explicit state');
    const total = calculateGradeTotal(earned, possible);
    return {
      learnerId: learner.learnerId,
      publishedTotal: total,
      finalizedTotal: exclusions.size ? null : total,
      coverage: { published, applicable, comparison: assignments.size },
      exclusions: [...exclusions].sort(),
      rank: null as number | null,
    };
  });
  const eligible = rows.filter(row => row.finalizedTotal !== null).sort((a, b) => {
    const left = BigInt(a.publishedTotal.earnedUnits) * BigInt(b.publishedTotal.possibleUnits);
    const right = BigInt(b.publishedTotal.earnedUnits) * BigInt(a.publishedTotal.possibleUnits);
    return left === right ? 0 : left > right ? -1 : 1;
  });
  for (let index = 0; index < eligible.length; index++) {
    const current = eligible[index];
    const previous = eligible[index - 1];
    const tied = previous && BigInt(previous.publishedTotal.earnedUnits) * BigInt(current.publishedTotal.possibleUnits)
      === BigInt(current.publishedTotal.earnedUnits) * BigInt(previous.publishedTotal.possibleUnits);
    current.rank = tied ? previous.rank : index + 1;
  }
  return rows;
}
