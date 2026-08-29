export type AccountLifecycleRequestType = 'export' | 'deletion';
export type AccountLifecycleRequestStatus = 'requested' | 'processing' | 'completed' | 'rejected';
export type AccountLifecycleRequest = { id: string; userId: string; type: AccountLifecycleRequestType; status: AccountLifecycleRequestStatus; requestedAt: string; completedAt: string | null; reason: string | null };

export function canTransitionLifecycleRequest(from: AccountLifecycleRequestStatus, to: AccountLifecycleRequestStatus): boolean {
  const transitions: Record<AccountLifecycleRequestStatus, AccountLifecycleRequestStatus[]> = {
    requested: ['processing', 'rejected'], processing: ['completed', 'rejected'], completed: [], rejected: [],
  };
  return transitions[from].includes(to);
}
