export const evaluationPolicy = {
  evaluatorVersion: 'deterministic-v3',
  reasoningRubricVersion: 'reasoning-rubric-v3',
  minimumAiConfidence: 0.8,
  maxJobAttempts: 3,
  pollingIntervalMs: 1_000,
} as const;
