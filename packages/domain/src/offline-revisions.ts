export type OfflineRevision = { idempotencyKey: string; accountId: string | null; sessionId: string; revisionNumber: number; content: string; queuedAt: string };

export function enqueueOfflineRevision(queue: OfflineRevision[], revision: OfflineRevision): OfflineRevision[] {
  const existingIndex = queue.findIndex((item) => item.idempotencyKey === revision.idempotencyKey);
  if (existingIndex < 0) return [...queue, revision].sort((a, b) => a.queuedAt.localeCompare(b.queuedAt));
  const next = [...queue]; next[existingIndex] = revision;
  return next.sort((a, b) => a.queuedAt.localeCompare(b.queuedAt));
}

export function revisionsReadyToSync(queue: OfflineRevision[], activeAccountId: string | null): OfflineRevision[] {
  return queue.filter((revision) => revision.accountId === activeAccountId);
}
