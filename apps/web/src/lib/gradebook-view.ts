import type { ClassGradebook, ClassGradebookLearner } from '@leetcode-app/database';

export type GradebookStatusFilter = 'all' | 'needs_attention' | 'ranked' | 'not_ranked' | 'withdrawn';
export type GradebookSort = 'learner' | 'rank' | 'total_desc';

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

  return rows.sort((left, right) => {
    if (sort === 'rank') return (left.result.rank ?? Number.MAX_SAFE_INTEGER) - (right.result.rank ?? Number.MAX_SAFE_INTEGER)
      || left.learner.displayName.localeCompare(right.learner.displayName);
    if (sort === 'total_desc') {
      const leftPercentage = Number(left.result.publishedTotal.percentage ?? -1);
      const rightPercentage = Number(right.result.publishedTotal.percentage ?? -1);
      return rightPercentage - leftPercentage || left.learner.displayName.localeCompare(right.learner.displayName);
    }
    return left.learner.displayName.localeCompare(right.learner.displayName);
  });
}

function safeCsvCell(value: string | number): string {
  let text = String(value);
  if (/^[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}

export function gradebookCsv(gradebook: ClassGradebook, rows: GradebookViewRow[]): string {
  const header = ['Rank', 'Learner', 'Email', 'Membership', ...gradebook.assignments.map(item => item.title),
    'Published points', 'Possible points', 'Percentage', 'Coverage', 'Status'];
  const body = rows.map(({ learner, result }) => [
    result.rank ?? '', learner.displayName, learner.email ?? '', learner.membership,
    ...learner.cells.map(cell => cell.state === 'published' && cell.earnedUnits !== null
      ? `${cell.earnedUnits / 100} / ${cell.maxUnits / 100}` : cell.state.replaceAll('_', ' ')),
    result.publishedTotal.earnedUnits / 100, result.publishedTotal.possibleUnits / 100,
    result.publishedTotal.percentage ?? '', `${result.coverage.published} / ${result.coverage.applicable}`,
    gradebookStatus(result),
  ]);
  return [header, ...body].map(row => row.map(safeCsvCell).join(',')).join('\r\n');
}
