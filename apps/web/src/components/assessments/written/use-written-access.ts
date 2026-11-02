'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { record } from './written-contract';

export class WrittenRequestError extends Error {
  constructor(readonly status: number, readonly code: string | null, message: string) { super(message); }
}
export function useWrittenAccess<T>({ actorId, initialUrl, validate }: { actorId: string; initialUrl: string; validate: (value: unknown) => value is T }) {
  const [value, setValue] = useState<T | null>(null), [verified, setVerified] = useState(false), [loading, setLoading] = useState(true);
  const [stopped, setStopped] = useState(false), [error, setError] = useState<string | null>(null);
  const alive = useRef(true), closed = useRef(false), verifiedNow = useRef(false), epoch = useRef(0), urlNow = useRef(initialUrl), validator = useRef(validate);
  const invalidate = useCallback(() => { epoch.current++; }, []);
  useEffect(() => { validator.current = validate; }, [validate]);
  const hide = useCallback(() => { epoch.current++; verifiedNow.current = false; setVerified(false); setLoading(false); }, []);
  const stop = useCallback(() => { closed.current = true; epoch.current++; verifiedNow.current = false; setVerified(false); setValue(null); setStopped(true); setLoading(false); setError('Your account changed. Reopen this assignment in the intended account. Original browser work remains scoped to its author.'); }, []);
  const changed = (response: Response, body: unknown) => response.status === 401 || record(body) && (body.code === 'owner_changed' || body.error === 'owner_changed' || typeof body.actorId === 'string' && body.actorId !== actorId);
  const read = useCallback(async (url = urlNow.current): Promise<T | null> => {
    if (closed.current) return null;
    urlNow.current = url; const turn = ++epoch.current; verifiedNow.current = false; setVerified(false); setLoading(true); setError(null);
    try {
      const response = await fetch(url, { cache: 'no-store', headers: { 'x-written-actor': actorId }, signal: AbortSignal.timeout(15_000) });
      const body: unknown = await response.json().catch(() => null);
      if (!alive.current || turn !== epoch.current || closed.current) return null;
      if (changed(response, body)) { stop(); return null; }
      if (!response.ok) throw new Error(record(body) && typeof body.message === 'string' ? body.message : 'Assignment access could not be checked. Retry the preview.');
      if (!validator.current(body)) throw new Error('The assignment response could not be verified. Reload before continuing.');
      setValue(body); verifiedNow.current = true; setVerified(true); return body;
    } catch (cause) { if (alive.current && turn === epoch.current && !closed.current) setError(cause instanceof Error ? cause.message : 'Assignment access is unavailable.'); return null; }
    finally { if (alive.current && turn === epoch.current) setLoading(false); }
    // Owner changes remount the workspace; the current validator is in a ref.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actorId, stop]);
  useEffect(() => {
    alive.current = true; urlNow.current = initialUrl; const timer = window.setTimeout(() => { void read(); }, 0);
    const focus = () => { void read(); }, visibility = () => { if (document.visibilityState === 'hidden') hide(); else focus(); };
    window.addEventListener('blur', hide); window.addEventListener('focus', focus); document.addEventListener('visibilitychange', visibility);
    return () => { alive.current = false; invalidate(); window.clearTimeout(timer); window.removeEventListener('blur', hide); window.removeEventListener('focus', focus); document.removeEventListener('visibilitychange', visibility); };
  }, [initialUrl, read, hide, invalidate]);
  async function command<R>(url: string, body: unknown, valid: (value: unknown) => value is R, recoverPending = false): Promise<R | null> {
    if ((!verifiedNow.current && !recoverPending) || closed.current) return null;
    const turn = epoch.current;
    const response = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', 'x-written-actor': actorId }, body: JSON.stringify(body), signal: AbortSignal.timeout(15_000) });
    const result: unknown = await response.json().catch(() => null);
    if (!alive.current || turn !== epoch.current || closed.current) return null;
    if (changed(response, result)) { stop(); return null; }
    if (!response.ok) {
      if ([403, 404, 409].includes(response.status)) hide();
      throw new WrittenRequestError(response.status, record(result) && typeof result.code === 'string' ? result.code : record(result) && typeof result.error === 'string' ? result.error : null,
        record(result) && typeof result.message === 'string' ? result.message : record(result) && typeof result.error === 'string' ? result.error : 'The request could not be confirmed. Retry its original receipt.');
    }
    if (!valid(result)) throw new Error('The accepted receipt could not be verified. Retry the same request to recover it.');
    return result;
  }
  return { data: verified ? value : null, loading, stopped, error, read, command, verifiedNow };
}
