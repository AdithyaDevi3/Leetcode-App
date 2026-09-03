import { describe, expect, it, vi } from 'vitest';
import { evaluateWithGateway, redactAiInput, validateAiEvaluation } from './ai-gateway';
import { mergeEvaluationEvidence } from './evaluation-merge';

describe('evaluation gateway', () => {
  it('redacts credential-like learner content and validates provider output', async () => {
    expect(redactAiInput('api_key=abc123 learner@example.com')).toContain('[REDACTED_EMAIL]');
    vi.stubEnv('EVALUATION_AI_ENABLED', 'true');
    const provider = vi.fn().mockResolvedValue({ approved: true, confidence: 0.9, findings: [], modelVersion: 'm1', promptVersion: 'p1' });
    await expect(evaluateWithGateway(provider, { problem: 'p password: abc', learnerText: 'text' })).rejects.toThrow('Invalid AI evaluation');
    provider.mockResolvedValue({ approved: true, confidence: 0.9, findings: [], modelVersion: 'm1', promptVersion: 'p1', schemaVersion: 'ai-evaluation-v1' });
    await expect(evaluateWithGateway(provider, { problem: 'p password: abc', learnerText: 'text' })).resolves.toMatchObject({ approved: true, schemaVersion: 'ai-evaluation-v1' });
    expect(provider.mock.calls[0][0].problem).toContain('[REDACTED]');
  });

  it('never calls a provider unless the server kill switch is explicitly enabled', async () => {
    vi.stubEnv('EVALUATION_AI_ENABLED', 'false');
    const provider = vi.fn();
    await expect(evaluateWithGateway(provider, { problem: 'p', learnerText: 'text' })).resolves.toBeNull();
    expect(provider).not.toHaveBeenCalled();
  });

  it('rejects malformed and ungrounded provider findings', () => {
    expect(() => validateAiEvaluation({ approved: true, confidence: Number.NaN, findings: [], modelVersion: 'm', promptVersion: 'p', schemaVersion: 's' })).toThrow('Invalid AI evaluation');
    expect(() => validateAiEvaluation({ approved: true, confidence: 1, findings: [{ id: 'f', status: 'revise', confidence: 1, detail: 'x', sourceSpan: { start: 4, end: 2 } }], modelVersion: 'm', promptVersion: 'p', schemaVersion: 's' })).toThrow('Invalid AI source span');
  });

  it('rejects ungrounded AI approval when deterministic evidence contradicts it', () => {
    const result = mergeEvaluationEvidence({ approved: false, findings: [{ id: 'lookup', status: 'revise', detail: 'missing' }] }, { approved: true, confidence: 1, findings: [], modelVersion: 'm', promptVersion: 'p', schemaVersion: 's' });
    expect(result.approved).toBe(false);
  });
});
