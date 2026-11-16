import 'server-only';

import type { OriginalCodingQuestion } from '@leetcode-app/domain';
import { originalCoding250Batch1 } from './questions-batch-1';
import { originalCoding250Batch2 } from './questions-batch-2';
import { originalCoding250Batch3 } from './questions-batch-3';
import { originalCoding250Batch4 } from './questions-batch-4';
import { originalCoding250Batch5 } from './questions-batch-5';
import { originalCoding250Batch6 } from './questions-batch-6';
import { originalCoding250Batch7 } from './questions-batch-7';
import { originalCoding250Batch8 } from './questions-batch-8';
import { originalCoding250Batch9 } from './questions-batch-9';
import { originalCoding250Batch10 } from './questions-batch-10';
import { originalCoding250Batch11 } from './questions-batch-11';
import { originalCoding250Batch12 } from './questions-batch-12';
import { originalCoding250Batch13 } from './questions-batch-13';

/** Unpublished original coding questions. Do not expose server checks from here. */
export const originalCoding250Candidates: readonly OriginalCodingQuestion[] = Object.freeze([
  ...originalCoding250Batch1,
  ...originalCoding250Batch2,
  ...originalCoding250Batch3,
  ...originalCoding250Batch4,
  ...originalCoding250Batch5,
  ...originalCoding250Batch6,
  ...originalCoding250Batch7,
  ...originalCoding250Batch8,
  ...originalCoding250Batch9,
  ...originalCoding250Batch10,
  ...originalCoding250Batch11,
  ...originalCoding250Batch12,
  ...originalCoding250Batch13,
]);

export function validateOriginalCoding250Candidates(
  items: readonly OriginalCodingQuestion[] = originalCoding250Candidates,
): readonly OriginalCodingQuestion[] {
  if (new Set(items.map(item => item.id)).size !== items.length) throw new Error('Coding-question IDs must be unique.');
  if (!items.every(item => item.provenance.kind === 'original' && item.status === 'in_review' && item.reviewerId === null)) {
    throw new Error('Coding questions must remain original and review-gated.');
  }
  return items;
}
