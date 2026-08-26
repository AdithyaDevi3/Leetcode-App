export type AiFinding = { id: string; status: 'pass' | 'revise'; confidence: number; detail: string; sourceSpan?: { start: number; end: number }; nodeId?: string };
export type AiEvaluation = { approved: boolean; confidence: number; findings: AiFinding[]; modelVersion: string; promptVersion: string; schemaVersion: string };
export type AiProvider = (input: { problem: string; learnerText: string; signal: AbortSignal }) => Promise<unknown>;

const secretPattern = /(api[_ -]?key|password|secret|token)\s*[:=]\s*\S+/gi;
export function redactAiInput(value: string) { return value.replace(secretPattern, '$1: [REDACTED]'); }

export function validateAiEvaluation(value: unknown): AiEvaluation {
  if (!value || typeof value !== 'object') throw new Error('Invalid AI evaluation');
  const candidate = value as Partial<AiEvaluation>;
  if (typeof candidate.approved !== 'boolean' || typeof candidate.confidence !== 'number' || !Array.isArray(candidate.findings)) throw new Error('Invalid AI evaluation');
  const findings = candidate.findings.map((finding) => {
    if (!finding || typeof finding !== 'object' || !['pass', 'revise'].includes((finding as AiFinding).status) || typeof (finding as AiFinding).confidence !== 'number') throw new Error('Invalid AI finding');
    return finding as AiFinding;
  });
  return { approved: candidate.approved, confidence: Math.max(0, Math.min(1, candidate.confidence)), findings, modelVersion: String(candidate.modelVersion ?? 'unknown'), promptVersion: String(candidate.promptVersion ?? 'unknown'), schemaVersion: String(candidate.schemaVersion ?? 'ai-evaluation-v1') };
}

export async function evaluateWithGateway(provider: AiProvider, input: { problem: string; learnerText: string }, options: { timeoutMs?: number; enabled?: boolean } = {}) {
  if (options.enabled === false) return null;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 5000);
  try {
    const value = await provider({ problem: redactAiInput(input.problem), learnerText: redactAiInput(input.learnerText), signal: controller.signal });
    return validateAiEvaluation(value);
  } finally { clearTimeout(timeout); }
}
