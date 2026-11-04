import type { ClassGradebook, ClassGradebookLearner } from '@leetcode-app/database';

export type GradebookStatusFilter = 'all' | 'needs_attention' | 'ranked' | 'not_ranked' | 'withdrawn';
export type GradebookSort = 'learner' | 'rank' | 'total_desc' | 'total_asc' | 'assignment_desc' | 'assignment_asc';

export type GradebookViewRow = {
  learner: ClassGradebookLearner;
  result: ClassGradebook['rows'][number];
};

const attentionExclusions = new Set(['unsubmitted', 'awaiting_grade', 'unpublished_grade', 'disputed_grade']);

export function gradebookStatus(result: ClassGradebook['rows'][number]): string {
  if (result.rank !== null) return 'Eligible';
  const reason = result.exclusions[0];
  return reason ? reason.replaceAll('_', ' ') : 'Not ranked';
}

export function gradebookAwaitingCellCount(gradebook: ClassGradebook): number {
  return gradebook.learners.reduce((count, learner) => count + learner.cells.filter(cell =>
    ['needs_review', 'draft', 'unavailable'].includes(cell.state),
  ).length, 0);
}

export function filterAndSortGradebook(
  gradebook: ClassGradebook,
  query: string,
  filter: GradebookStatusFilter,
  sort: GradebookSort,
  assignmentId?: string,
): GradebookViewRow[] {
  const normalized = query.trim().toLocaleLowerCase();
  const rows = gradebook.learners
    .map(learner => ({ learner, result: gradebook.rows.find(row => row.learnerId === learner.id)! }))
    .filter(({ learner, result }) => {
      if (normalized && !`${learner.displayName} ${learner.email ?? ''}`.toLocaleLowerCase().includes(normalized)) return false;
      if (filter === 'ranked') return result.rank !== null;
      if (filter === 'not_ranked') return result.rank === null;
      if (filter === 'withdrawn') return learner.membership === 'withdrawn';
      if (filter === 'needs_attention') return result.exclusions.some(item => attentionExclusions.has(item));
      return true;
    });

  const compareLearners = (left: GradebookViewRow, right: GradebookViewRow) =>
    left.learner.displayName.localeCompare(right.learner.displayName, 'en') || left.learner.id.localeCompare(right.learner.id, 'en');
  const publishedScore = (row: GradebookViewRow): number | null => {
    const cell = row.learner.cells.find(item => item.assignmentId === assignmentId);
    return cell?.state === 'published' && cell.earnedUnits !== null && cell.maxUnits > 0
      ? cell.earnedUnits / cell.maxUnits : null;
  };
  const compareScores = (left: number | null, right: number | null, descending: boolean) => {
    if (left === null) return right === null ? 0 : 1;
    if (right === null) return -1;
    return descending ? right - left : left - right;
  };

  return rows.sort((left, right) => {
    if (sort === 'rank') return (left.result.rank ?? Number.MAX_SAFE_INTEGER) - (right.result.rank ?? Number.MAX_SAFE_INTEGER)
      || compareLearners(left, right);
    if (sort === 'total_desc' || sort === 'total_asc') {
      const leftPercentage = left.result.publishedTotal.percentage === null ? null : Number(left.result.publishedTotal.percentage);
      const rightPercentage = right.result.publishedTotal.percentage === null ? null : Number(right.result.publishedTotal.percentage);
      return compareScores(leftPercentage, rightPercentage, sort === 'total_desc') || compareLearners(left, right);
    }
    if (sort === 'assignment_desc' || sort === 'assignment_asc') {
      return compareScores(publishedScore(left), publishedScore(right), sort === 'assignment_desc') || compareLearners(left, right);
    }
    return compareLearners(left, right);
  });
}

function safeCsvCell(value: string | number): string {
  let text = String(value);
  if (/^[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}

export function gradebookCsv(gradebook: ClassGradebook, rows: GradebookViewRow[], assignmentId?: string): string {
  const assignments = assignmentId ? gradebook.assignments.filter(item => item.id === assignmentId) : gradebook.assignments;
  const header = ['Rank', 'Learner', 'Email', 'Membership', ...assignments.map(item => item.title),
    'Published points', 'Possible points', 'Percentage', 'Coverage', 'Status'];
  const body = rows.map(({ learner, result }) => [
    result.rank ?? '', learner.displayName, learner.email ?? '', learner.membership,
    ...assignments.map(assignment => {
      const cell = learner.cells.find(item => item.assignmentId === assignment.id);
      return cell?.state === 'published' && cell.earnedUnits !== null
        ? `${cell.earnedUnits / 100} / ${cell.maxUnits / 100}` : (cell?.state ?? 'not_assigned').replaceAll('_', ' ');
    }),
    result.publishedTotal.earnedUnits / 100, result.publishedTotal.possibleUnits / 100,
    result.publishedTotal.percentage ?? '', `${result.coverage.published} / ${result.coverage.applicable}`,
    gradebookStatus(result),
  ]);
  return [header, ...body].map(row => row.map(safeCsvCell).join(',')).join('\r\n');
}
