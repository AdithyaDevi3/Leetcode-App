export type PublicationReview = { reviewerId: string; approvedAt: string; rightsApproved: boolean };
export type PublicationCandidate = { version: number; title: string; body: string; provenance: string; review?: PublicationReview; previousVersion?: number };

export function validatePublication(candidate: PublicationCandidate): string[] {
  const errors: string[] = [];
  if (!Number.isInteger(candidate.version) || candidate.version < 1) errors.push('Version must be a positive integer');
  if (!candidate.title.trim() || !candidate.body.trim()) errors.push('Title and body are required');
  if (!candidate.provenance.trim()) errors.push('Provenance is required');
  if (!candidate.review?.reviewerId || !candidate.review.approvedAt) errors.push('Reviewer approval is required');
  if (candidate.review && !candidate.review.rightsApproved) errors.push('Rights approval is required');
  if (candidate.previousVersion !== undefined && candidate.version <= candidate.previousVersion) errors.push('Version must increase immutably');
  return errors;
}
