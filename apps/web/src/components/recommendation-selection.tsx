'use client';

import { useEffect, useRef, useState, type MouseEvent } from 'react';
import { practiceItems } from '@/lib/content';
import type { LearningRecommendationRequest, LearningRecommendationResponse } from '@/lib/learning-api-types';

const practiceIds = new Set(practiceItems.map(item => item.id));
const hrefFor = (id: string) => `/practice?problem=${encodeURIComponent(id)}`;
const record = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const decisionKey = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const uuid = (value: unknown): value is string => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const button = 'inline-flex min-h-11 items-center justify-center rounded-md border border-[var(--line)] bg-white px-4 py-2 text-sm font-bold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--moss)] disabled:cursor-not-allowed disabled:opacity-50';

export function validRecommendationRequest(value: unknown): value is LearningRecommendationRequest {
  return record(value) && typeof value.practiceId === 'string' && practiceIds.has(value.practiceId)
    && decisionKey(value.expectedDecisionKey) && uuid(value.requestKey)
    && Object.keys(value).length === 3;
}

export function validRecommendationReceipt(value: unknown, request: LearningRecommendationRequest, learnerId: string): value is LearningRecommendationResponse {
  if (!record(value) || value.learnerId !== learnerId || !record(value.receipt)) return false;
  const receipt = value.receipt;
  return receipt.requestKey === request.requestKey && receipt.decisionKey === request.expectedDecisionKey
    && receipt.practiceId === request.practiceId && uuid(receipt.selectionId)
    && typeof receipt.selectedAt === 'string' && Number.isFinite(Date.parse(receipt.selectedAt));
}

/** A single pending command is shared by all recommendation links for this account. */
export function useRecommendationSelection({ learnerId, blocked, ownerChanged, onOwnerChanged, onRefresh }: {
  learnerId: string; blocked: boolean; ownerChanged: boolean;
  onOwnerChanged: () => void; onRefresh: () => void;
}) {
  const [pending, setPending] = useState<LearningRecommendationRequest | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);
  const alive = useRef(false);
  const stopped = useRef(false);
  const inFlight = useRef(false);
  const currentRequest = useRef<LearningRecommendationRequest | null>(null);
  const blockedNow = useRef(blocked);
  const storageKey = `method:learning-selection:${learnerId}`;

  useEffect(() => { blockedNow.current = blocked; }, [blocked]);
  useEffect(() => { if (ownerChanged) stopped.current = true; }, [ownerChanged]);

  useEffect(() => {
    alive.current = true;
    let current = true;
    queueMicrotask(() => {
      if (!current) return;
      try {
        const saved: unknown = JSON.parse(window.sessionStorage.getItem(storageKey) ?? 'null');
        if (validRecommendationRequest(saved)) {
          currentRequest.current = saved;
          setPending(saved);
          setError('An earlier practice selection needs confirmation. Retry to recover its saved receipt.');
        }
      } catch { /* A command also stays in memory if browser recovery is unavailable. */ }
    });
    return () => { current = false; alive.current = false; };
  }, [storageKey]);

  function remember(request: LearningRecommendationRequest | null) {
    currentRequest.current = request;
    setPending(request);
    try {
      if (request) window.sessionStorage.setItem(storageKey, JSON.stringify(request));
      else window.sessionStorage.removeItem(storageKey);
    } catch { /* Retain the original command in memory for a safe retry. */ }
  }

  async function select(request: LearningRecommendationRequest) {
    if (inFlight.current || stopped.current || blockedNow.current || conflict) return;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    remember(request);
    try {
      const response = await fetch('/api/learner/learning/recommendations', {
        method: 'POST', headers: { 'content-type': 'application/json', 'x-learning-owner': learnerId },
        body: JSON.stringify(request), signal: AbortSignal.timeout(15_000),
      });
      const body: unknown = await response.json().catch(() => null);
      if (!alive.current || stopped.current) return;
      if (record(body) && typeof body.learnerId === 'string' && body.learnerId !== learnerId) {
        stopped.current = true;
        onOwnerChanged();
        return;
      }
      if (!response.ok) {
        const code = record(body) ? body.code : null;
        if (response.status === 401 || code === 'owner_changed') {
          stopped.current = true;
          onOwnerChanged();
        } else if (response.status === 409) {
          remember(null);
          setConflict(true);
        } else if (response.status === 400 || response.status === 413) remember(null);
        throw new Error(record(body) && typeof body.error === 'string' ? body.error : 'We could not confirm this practice selection. Retry the same request.');
      }
      if (!validRecommendationReceipt(body, request, learnerId)) {
        throw new Error('We could not confirm the saved practice selection. Retry to recover its receipt.');
      }
      // Navigation uses the locally known activity, never a URL from the response.
      remember(null);
      window.location.assign(hrefFor(request.practiceId));
    } catch (cause) {
      if (alive.current && !stopped.current) setError(cause instanceof Error ? cause.message : 'We could not confirm this practice selection. Retry the same request.');
    } finally {
      inFlight.current = false;
      if (alive.current) setBusy(false);
    }
  }

  const start = (event: MouseEvent<HTMLAnchorElement>, practiceId: string, expectedDecisionKey: string | null | undefined) => {
    if (stopped.current || blockedNow.current || conflict) { event.preventDefault(); return; }
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || !decisionKey(expectedDecisionKey)) return;
    event.preventDefault();
    if (!practiceIds.has(practiceId) || inFlight.current) return;
    const previous = currentRequest.current;
    if (previous && previous.practiceId !== practiceId) {
      setError('Confirm your earlier practice selection before recording another one. You can also open that practice without confirming.');
      return;
    }
    void select(previous ?? { practiceId, expectedDecisionKey, requestKey: crypto.randomUUID() });
  };

  const recovery = ownerChanged ? null : <div aria-live="polite" className="space-y-3">
    {busy ? <p className="text-sm" role="status" aria-label="Practice selection status">Saving your practice selection…</p> : null}
    {error ? <p className="text-sm" role="alert" aria-label="Practice selection error">{error}</p> : null}
    {conflict ? <button type="button" className={button} disabled={busy || blocked} onClick={() => { setConflict(false); setError(null); onRefresh(); }}>Load latest practice plan</button> : pending && !busy ? <div className="flex flex-wrap gap-3">
      <button type="button" className={button} disabled={blocked} onClick={() => void select(currentRequest.current!)}>Retry practice selection</button>
      <a className={button} href={hrefFor(pending.practiceId)}>Open practice without confirming selection</a>
    </div> : null}
  </div>;

  return { start, recovery, busy };
}
