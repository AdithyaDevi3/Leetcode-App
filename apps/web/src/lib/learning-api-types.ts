import type { LearningEvidenceSnapshot, LearningPlan } from '@leetcode-app/domain';

/** Client-safe aggregates. Academic grades and private assessment answers are separate. */
export type LearningApiResponse = {
  learnerId: string;
  snapshot: LearningEvidenceSnapshot;
  plan: LearningPlan;
  /** Absent only for older clients/fixtures; never contains private ranking inputs. */
  decisionKey?: string | null;
};

export type LearningRecommendationRequest = {
  practiceId: string;
  expectedDecisionKey: string;
  requestKey: string;
};

export type LearningRecommendationReceipt = {
  requestKey: string;
  decisionKey: string;
  selectionId: string;
  practiceId: string;
  selectedAt: string;
};

export type LearningRecommendationResponse = {
  learnerId: string;
  receipt: LearningRecommendationReceipt;
};

export type LearningSnapshotResponse = LearningApiResponse;

export type LearningReviewRequest = {
  conceptId: string;
  expectedRevision: number;
  days: 1 | 3 | 7;
  requestKey: string;
};

export type LearningReviewReceipt = {
  conceptId: string;
  requestKey: string;
  previousRevision: number;
  revision: number;
  dueAt: string;
};

export type LearningReviewResponse = LearningApiResponse & {
  reviewReceipt: LearningReviewReceipt;
};
