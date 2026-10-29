export const practiceStages = ['approach', 'feedback', 'code'] as const;
export type PracticeStage = typeof practiceStages[number];

export const parsePracticeStage = (value: string | null, assigned = false): PracticeStage =>
  practiceStages.find(stage => stage === value) ?? (assigned ? 'code' : 'approach');

export function practiceStageUrl(href: string, stage: PracticeStage) {
  const url = new URL(href);
  url.searchParams.set('stage', stage);
  url.hash = '';
  return `${url.pathname}${url.search}`;
}
