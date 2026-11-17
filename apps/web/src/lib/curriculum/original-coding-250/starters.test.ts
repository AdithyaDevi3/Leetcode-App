import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { originalCoding250Batch1 } from './questions-batch-1';
import { originalCoding250Batch2 } from './questions-batch-2';
import { originalCoding250Candidates } from './questions-index';
import { createOriginalCodingStarter } from './starters';

const question = originalCoding250Batch1[0];

describe('createOriginalCodingStarter', () => {
  it.each(['typescript', 'python', 'cpp', 'java'] as const)('creates a %s starter with the documented function', (language) => {
    expect(createOriginalCodingStarter(question, language)).toContain(language === 'python' ? 'build_frequency_ledger' : question.functionName);
  });

  it('keeps object types together when it splits a signature', () => {
    const complex = originalCoding250Batch2.find(item => item.functionSignature.includes('{'));
    expect(complex).toBeDefined();
    expect(createOriginalCodingStarter(complex!, 'typescript')).toContain(complex!.functionSignature);
    expect(createOriginalCodingStarter(complex!, 'python').split('\n')[0]).not.toContain('{ id:');
    expect(createOriginalCodingStarter(complex!, 'cpp').split('\n')[0]).not.toContain('{ id:');
    expect(createOriginalCodingStarter(complex!, 'java').split('\n').find(line => line.includes('public Object'))).not.toContain('{ id:');
  });

  it('creates a starter in every supported language for each candidate', () => {
    for (const candidate of originalCoding250Candidates) {
      for (const language of ['typescript', 'python', 'cpp', 'java'] as const) {
        expect(createOriginalCodingStarter(candidate, language)).toContain(
          language === 'python' ? candidate.functionName.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase() : candidate.functionName,
        );
      }
    }
  });
});
