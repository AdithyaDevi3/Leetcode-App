import { describe, expect, it, vi } from 'vitest';
import { evaluateWithGateway, redactAiInput } from './ai-gateway';
import { mergeEvaluationEvidence } from './evaluation-merge';

describe('evaluation gateway', () => {
  it('redacts credential-like learner content and validates provider output', async () => {
    expect(redactAiInput('api_key=abc123')).toContain('[REDACTED]');
    const provider = vi.fn().mockResolvedValue({ approved: true, confidence: 0.9, findings: [], modelVersion: 'm1', promptVersion: 'p1' });
    await expect(evaluateWithGateway(provider, { problem: 'p password: abc', learnerText: 'text' })).resolves.toMatchObject({ approved: true, schemaVersion: 'ai-evaluation-v1' });
    expect(provider.mock.calls[0][0].problem).toContain('[REDACTED]');
  });

  it('rejects ungrounded AI approval when deterministic evidence contradicts it', () => {
    const result = mergeEvaluationEvidence({ approved: false, findings: [{ id: 'lookup', status: 'revise', detail: 'missing' }] }, { approved: true, confidence: 1, findings: [], modelVersion: 'm', promptVersion: 'p', schemaVersion: 's' });
    expect(result.approved).toBe(false);
  });
});
