import { describe, expect, it } from 'vitest';
import {
  calculateGradebook, calculateGradeTotal, freezeAssignmentGradePolicy, parseGradePoints,
  type AssignmentGradePolicy, type AssignmentGradeResult, type GradebookCell, type GradebookLearner,
} from './gradebook';

const policy = (assignmentId: string, maxUnits = 10000): AssignmentGradePolicy => ({
  assignmentId, versionId: `${assignmentId}-v1`, contentVersionId: 'content-v1', maxUnits,
  attemptPolicy: 'latest', scoring: { mode: 'reviewed_rubric', rubricVersionId: 'rubric-v1', criteria: [{ id: 'reasoning', label: 'Reasoning', maxUnits }] },
});
const scored = (earnedUnits: number): Extract<AssignmentGradeResult, { status: 'scored' }> => ({ status: 'scored', earnedUnits, attemptId: 'attempt-1', responseRevisionId: 'response-v1', evaluatorVersionId: 'reviewer-v1', gradeRevisionId: 'grade-v1', publication: 'published', dispute: 'none' });
const cell = (assignmentId: string, result: AssignmentGradeResult): GradebookCell => ({ assignmentId, policyVersionId: `${assignmentId}-v1`, applicability: 'assigned', result });
const learner = (learnerId: string, cells: readonly GradebookCell[]): GradebookLearner => ({ learnerId, membership: 'included', cells });
const one = (result: AssignmentGradeResult) => calculateGradebook([policy('a')], [learner('student', [cell('a', result)])])[0];

describe('exact grade points', () => {
  it.each([['0', 0], ['12', 1200], ['12.3', 1230], ['12.34', 1234], ['90071992547409.91', Number.MAX_SAFE_INTEGER]])('parses %s exactly', (input, expected) => {
    expect(parseGradePoints(input)).toBe(expected);
  });
  it.each(['', '-1', '1.234', 'NaN', 'Infinity', '1e3', ' 1', '01', '1.', '90071992547409.92'])('rejects %s', value => {
    expect(() => parseGradePoints(value)).toThrow();
  });
  it('represents empty work as unknown and rounds half-up only for display', () => {
    expect(calculateGradeTotal(0, 0).percentage).toBeNull();
    expect(calculateGradeTotal(1, 32).percentage).toBe('3.13');
    expect(calculateGradeTotal(2, 3).percentage).toBe('66.67');
    expect(calculateGradeTotal(Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER).percentage).toBe('100.00');
  });
  it.each([[-1, 100], [NaN, 100], [Infinity, 100], [0.1, 100], [101, 100], [1, 0], [0, -1], [0, Number.MAX_SAFE_INTEGER + 1]])('rejects invalid total %s/%s', (earned, possible) => {
    expect(() => calculateGradeTotal(earned, possible)).toThrow();
  });
});

describe('frozen assignment policies', () => {
  it('isolates and freezes criteria as well as the policy', () => {
    const input = policy('a');
    const frozen = freezeAssignmentGradePolicy(input);
    expect(frozen).toEqual(input);
    expect(frozen).not.toBe(input);
    expect(Object.isFrozen(frozen)).toBe(true);
    if (frozen.scoring.mode !== 'reviewed_rubric' || input.scoring.mode !== 'reviewed_rubric') throw new Error('fixture');
    expect(Object.isFrozen(frozen.scoring.criteria)).toBe(true);
    expect(Object.isFrozen(frozen.scoring.criteria[0])).toBe(true);
    expect(frozen.scoring.criteria[0]).not.toBe(input.scoring.criteria[0]);
  });
  it('rejects mismatched or duplicate rubric maxima and empty version identities', () => {
    expect(() => freezeAssignmentGradePolicy({ ...policy('a'), maxUnits: 0 })).toThrow();
    expect(() => freezeAssignmentGradePolicy({ ...policy('a'), contentVersionId: '' })).toThrow();
    expect(() => freezeAssignmentGradePolicy({ ...policy('a'), maxUnits: 1 })).toThrow();
    expect(() => freezeAssignmentGradePolicy({ ...policy('a'), scoring: { mode: 'reviewed_rubric', rubricVersionId: 'v1', criteria: [
      { id: 'same', label: 'First', maxUnits: 5000 }, { id: 'same', label: 'Second', maxUnits: 5000 },
    ] } })).toThrow('Duplicate');
    expect(() => freezeAssignmentGradePolicy({ ...policy('a'), scoring: { mode: 'verified_completion', verifierVersionId: '' } })).toThrow();
  });
});

describe('gradebook totals and competition ranking', () => {
  const policies = [policy('a', 2000), policy('b', 3000), policy('c', 5000)];
  const complete = (id: string, scores: number[]) => learner(id, scores.map((score, i) => cell(policies[i].assignmentId, scored(score * 100))));
  const fixtures: GradebookLearner[] = [
    complete('ada', [18, 27, 45]), complete('ben', [20, 25, 45]),
    learner('chen', [cell('a', scored(2000)), cell('b', scored(3000)), cell('c', { status: 'queued' })]),
    complete('devi', [16, 24, 40]),
    learner('eli', [cell('a', scored(2000)), { assignmentId: 'b', policyVersionId: 'b-v1', applicability: 'excused' }, cell('c', scored(4500))]),
    learner('farah', [cell('a', scored(1800)), cell('b', scored(2700)), cell('c', { status: 'unsubmitted' })]),
  ];

  it('matches the reviewed worked example without ranking partial or different assignment sets', () => {
    const rows = calculateGradebook(policies, fixtures);
    expect(rows.map(row => row.rank)).toEqual([1, 1, null, 3, null, null]);
    expect(rows[2]).toMatchObject({ publishedTotal: { percentage: '100.00' }, finalizedTotal: null, coverage: { published: 2, applicable: 3, comparison: 3 }, exclusions: ['awaiting_grade'] });
    expect(rows[4]).toMatchObject({ publishedTotal: { earnedUnits: 6500, possibleUnits: 7000, percentage: '92.86' }, rank: null, exclusions: ['different_assignment_set'] });
    expect(rows[5].publishedTotal.percentage).toBe('90.00');
  });
  it('only assigns a missing-work zero with an explicit attributable finalization', () => {
    const final = learner('farah', [cell('a', scored(1800)), cell('b', scored(2700)), cell('c', {
      status: 'missing_zero', gradeRevisionId: 'missing-v1', finalizedBy: 'instructor', reason: 'Closed assignment without submission', dispute: 'none',
    })]);
    expect(calculateGradebook(policies, [...fixtures.slice(0, 5), final])[5]).toMatchObject({ publishedTotal: { percentage: '45.00' }, rank: 4 });
    expect(() => one({ status: 'missing_zero', gradeRevisionId: 'v1', finalizedBy: '', reason: 'Missing', dispute: 'none' })).toThrow();
  });
  it.each(['queued', 'running', 'needs_review', 'unavailable'] as const)('%s never becomes zero or rank', status => {
    expect(one({ status })).toMatchObject({ publishedTotal: { earnedUnits: 0, possibleUnits: 0, percentage: null }, rank: null, exclusions: ['awaiting_grade'] });
  });
  it('excludes unpublished or disputed scores and preserves the published disputed value', () => {
    expect(one({ ...scored(9000), publication: 'draft' })).toMatchObject({ publishedTotal: { percentage: null }, rank: null, exclusions: ['unpublished_grade'] });
    expect(one({ ...scored(9000), dispute: 'open' })).toMatchObject({ publishedTotal: { percentage: '90.00' }, rank: null, exclusions: ['disputed_grade'] });
  });
  it('does not invent ranks for empty assignment sets or withdrawn learners', () => {
    expect(calculateGradebook([], [learner('student', [])])[0]).toMatchObject({ rank: null, exclusions: ['no_assignments'] });
    expect(calculateGradebook([policy('a')], [{ ...learner('student', [cell('a', scored(10000))]), membership: 'withdrawn' }])[0]).toMatchObject({ rank: null, exclusions: ['withdrawn'] });
    expect(calculateGradebook(policies, [])).toEqual([]);
  });
  it('ranks exact values even when displayed percentages tie', () => {
    const max = Number.MAX_SAFE_INTEGER;
    const rows = calculateGradebook([policy('a', max)], [learner('lower', [cell('a', scored(max - 1))]), learner('higher', [cell('a', scored(max))])]);
    expect(rows.map(row => row.publishedTotal.percentage)).toEqual(['100.00', '100.00']);
    expect(rows.map(row => row.rank)).toEqual([2, 1]);
  });
  it('is permutation invariant, JSON serializable, and leaves inputs untouched', () => {
    const before = JSON.stringify(fixtures);
    const expected = calculateGradebook(policies, fixtures);
    const reversed = calculateGradebook([...policies].reverse(), [...fixtures].reverse().map(row => ({ ...row, cells: [...row.cells].reverse() })));
    expect([...reversed].reverse()).toEqual(expected);
    expect(JSON.parse(JSON.stringify(expected))).toEqual(expected);
    expect(JSON.stringify(fixtures)).toBe(before);
  });
  it('recomputes a corrected grade without mutating a prior result', () => {
    const first = calculateGradebook(policies, fixtures);
    const corrected = calculateGradebook(policies, [complete('ada', [20, 30, 50]), ...fixtures.slice(1)]);
    expect(first[1].rank).toBe(1);
    expect(corrected[1].rank).toBe(2);
    expect(first[0].publishedTotal.earnedUnits).toBe(9000);
    expect(corrected[0].publishedTotal.earnedUnits).toBe(10000);
  });
  it('preserves bounded totals, exact ties, and monotonic rank across varied cohorts', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const scores = Array.from({ length: 25 }, (_, index) => (seed * (index + 3) * 7919) % 10001);
      const cohort = scores.map((score, index) => learner(`student-${index}`, [cell('a', scored(score))]));
      const rows = calculateGradebook([policy('a')], cohort);
      rows.forEach((row, index) => {
        expect(row.rank).toBe(1 + scores.filter(score => score > scores[index]).length);
        expect(Number(row.publishedTotal.percentage)).toBeGreaterThanOrEqual(0);
        expect(Number(row.publishedTotal.percentage)).toBeLessThanOrEqual(100);
      });
      const improved = calculateGradebook([policy('a')], [learner('student-0', [cell('a', scored(10000))]), ...cohort.slice(1)]);
      expect(improved[0].rank).toBeLessThanOrEqual(rows[0].rank!);
    }
  });
  it('rejects duplicate learners, assignments, cells, absent cells, and wrong versions', () => {
    expect(() => calculateGradebook(policies, [fixtures[0], fixtures[0]])).toThrow('Duplicate learner');
    expect(() => calculateGradebook([policy('a'), policy('a')], [])).toThrow('Duplicate assignment');
    expect(() => calculateGradebook([policy('a')], [learner('x', [])])).toThrow('Missing assignment');
    expect(() => calculateGradebook([policy('a')], [learner('x', [cell('b', scored(1))])])).toThrow('Unknown');
    expect(() => calculateGradebook([policy('a')], [learner('x', [cell('a', scored(1)), cell('a', scored(1))])])).toThrow('duplicate');
    expect(() => calculateGradebook([policy('a')], [learner('x', [{ ...cell('a', scored(1)), policyVersionId: 'old' }])])).toThrow('version mismatch');
  });
  it('rejects invalid grades, forged states, nonbinary completion grades, and overflowing totals', () => {
    expect(() => one(scored(NaN))).toThrow();
    expect(() => one(scored(10001))).toThrow();
    expect(() => one({ status: 'invented' } as unknown as AssignmentGradeResult)).toThrow('Invalid grade state');
    const binary = { ...policy('a'), scoring: { mode: 'verified_completion' as const, verifierVersionId: 'suite-v1' } };
    expect(() => calculateGradebook([binary], [learner('x', [cell('a', scored(5000))])])).toThrow('zero or full');
    for (const score of [0, 10000]) expect(calculateGradebook([binary], [learner('x', [cell('a', scored(score))])])[0].rank).toBe(1);
    expect(() => calculateGradebook([policy('a', Number.MAX_SAFE_INTEGER), policy('b', 1)], [learner('x', [cell('a', scored(0)), cell('b', scored(0))])])).toThrow('safe');
  });
});
