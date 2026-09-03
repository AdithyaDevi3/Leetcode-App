export type AiFinding = { id: string; status: 'pass' | 'revise'; confidence: number; detail: string; sourceSpan?: { start: number; end: number }; nodeId?: string };
export type AiEvaluation = { approved: boolean; confidence: number; findings: AiFinding[]; modelVersion: string; promptVersion: string; schemaVersion: string };
export type AiProvider = (input: { problem: string; learnerText: string; signal: AbortSignal }) => Promise<unknown>;

const secretPattern = /(api[_ -]?key|password|secret|token)\s*[:=]\s*\S+/gi;
const emailPattern = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const isFiniteNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

export function redactAiInput(value: string) {
  return value.replace(secretPattern, '$1: [REDACTED]').replace(emailPattern, '[REDACTED_EMAIL]');
}

export function isAiEvaluationEnabled() {
  return process.env.EVALUATION_AI_ENABLED === 'true';
}

export function validateAiEvaluation(value: unknown): AiEvaluation {
  if (!value || typeof value !== 'object') throw new Error('Invalid AI evaluation');
  const candidate = value as Partial<AiEvaluation>;
  if (typeof candidate.approved !== 'boolean' || !isFiniteNumber(candidate.confidence) || !Array.isArray(candidate.findings) || candidate.findings.length > 50 || typeof candidate.modelVersion !== 'string' || typeof candidate.promptVersion !== 'string' || typeof candidate.schemaVersion !== 'string') throw new Error('Invalid AI evaluation');
  const findings = candidate.findings.map((finding) => {
    if (!finding || typeof finding !== 'object') throw new Error('Invalid AI finding');
    const item = finding as Partial<AiFinding>;
    const sourceSpan = item.sourceSpan;
    const status = item.status;
    if (typeof item.id !== 'string' || !item.id || (status !== 'pass' && status !== 'revise') || !isFiniteNumber(item.confidence) || typeof item.detail !== 'string') throw new Error('Invalid AI finding');
    if (sourceSpan && (!Number.isInteger(sourceSpan.start) || !Number.isInteger(sourceSpan.end) || sourceSpan.start < 0 || sourceSpan.end < sourceSpan.start)) throw new Error('Invalid AI source span');
    if (item.nodeId !== undefined && (typeof item.nodeId !== 'string' || !item.nodeId)) throw new Error('Invalid AI node ID');
    return { id: item.id, status, confidence: Math.max(0, Math.min(1, item.confidence)), detail: item.detail, ...(sourceSpan ? { sourceSpan } : {}), ...(item.nodeId ? { nodeId: item.nodeId } : {}) };
  });
  return { approved: candidate.approved, confidence: Math.max(0, Math.min(1, candidate.confidence)), findings, modelVersion: candidate.modelVersion, promptVersion: candidate.promptVersion, schemaVersion: candidate.schemaVersion };
}

export async function evaluateWithGateway(provider: AiProvider, input: { problem: string; learnerText: string }, options: { timeoutMs?: number } = {}) {
  if (!isAiEvaluationEnabled()) return null;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 5000);
  try {
    const value = await provider({ problem: redactAiInput(input.problem), learnerText: redactAiInput(input.learnerText), signal: controller.signal });
    return validateAiEvaluation(value);
  } finally { clearTimeout(timeout); }
}
