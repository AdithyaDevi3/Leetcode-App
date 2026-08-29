export type SystemDesignStage = 'requirements' | 'assumptions' | 'architecture' | 'failure_analysis' | 'review';
const stages: SystemDesignStage[] = ['requirements', 'assumptions', 'architecture', 'failure_analysis', 'review'];

export function nextSystemDesignStage(current: SystemDesignStage | null, completed: SystemDesignStage[]): SystemDesignStage | null {
  const currentIndex = current ? stages.indexOf(current) : -1;
  const candidate = stages[currentIndex + 1] ?? null;
  if (!candidate) return null;
  const prerequisites = stages.slice(0, currentIndex + 1);
  return prerequisites.every((stage) => completed.includes(stage)) ? candidate : current;
}

export function canCompleteSystemDesignStage(stage: SystemDesignStage, document: { requirements: string[]; assumptions: string[]; components: unknown[]; failureNotes: string[] }): boolean {
  if (stage === 'requirements') return document.requirements.length > 0;
  if (stage === 'assumptions') return document.assumptions.length > 0;
  if (stage === 'architecture') return document.components.length > 0;
  if (stage === 'failure_analysis') return document.failureNotes.length > 0;
  return document.requirements.length > 0 && document.assumptions.length > 0 && document.components.length > 0 && document.failureNotes.length > 0;
}
