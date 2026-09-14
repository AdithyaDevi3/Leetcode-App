export const evaluationPolicy = {
  evaluatorVersion: 'deterministic-v2',
  reasoningRubricVersion: 'reasoning-rubric-v2',
  minimumAiConfidence: 0.8,
  maxJobAttempts: 3,
  pollingIntervalMs: 1_000,
} as const;
