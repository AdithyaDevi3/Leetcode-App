'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { record } from './template-contract';

export class TemplateRequestError extends Error {
  constructor(readonly status: number, readonly code: string | null, message: string) { super(message); }
}
export function useOwnerPreview<T>({ actorId, initialUrl, validate }: { actorId: string; initialUrl: string; validate: (value: unknown) => value is T }) {
  const [value, setValue] = useState<T | null>(null);
  const [verified, setVerified] = useState(false);
  const [loading, setLoading] = useState(true);
  const [stopped, setStopped] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const alive = useRef(true), closed = useRef(false), verifiedNow = useRef(false), epoch = useRef(0);
  const currentUrl = useRef(initialUrl), validator = useRef(validate);
  useEffect(() => { validator.current = validate; }, [validate]);
  const invalidate = useCallback(() => { epoch.current += 1; }, []);
  const hide = useCallback(() => { epoch.current++; verifiedNow.current = false; setVerified(false); setLoading(false); }, []);
  const stop = useCallback(() => {
    closed.current = true; epoch.current++; verifiedNow.current = false;
    setVerified(false); setStopped(true); setValue(null); setLoading(false);
    setError('Your account changed. Reopen the template workspace in the intended account. Original recovery requests remain in this tab.');
  }, []);
  function changed(response: Response, body: unknown) {
    return response.status === 401 || (record(body) && (body.code === 'owner_changed' || (typeof body.actorId === 'string' && body.actorId !== actorId)));
  }
  const read = useCallback(async (url = currentUrl.current): Promise<T | null> => {
    if (closed.current) return null;
    currentUrl.current = url;
    const turn = ++epoch.current; verifiedNow.current = false; setVerified(false); setLoading(true); setError(null);
    try {
      const response = await fetch(url, { cache: 'no-store', headers: { 'x-assessment-author': actorId }, signal: AbortSignal.timeout(15_000) });
      const body: unknown = await response.json().catch(() => null);
      if (!alive.current || turn !== epoch.current || closed.current) return null;
      if (changed(response, body)) { stop(); return null; }
      if (!response.ok) throw new Error(record(body) && typeof body.error === 'string' ? body.error : 'Template access could not be checked. Retry the preview.');
      if (!validator.current(body)) throw new Error('The template response could not be verified. Reload before continuing.');
      setValue(body); verifiedNow.current = true; setVerified(true); return body;
    } catch (cause) {
      if (alive.current && turn === epoch.current && !closed.current) setError(cause instanceof Error ? cause.message : 'Template preview is unavailable.');
      return null;
    } finally { if (alive.current && turn === epoch.current) setLoading(false); }
    // Identity changes remount the page. The latest validator is kept in a ref.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actorId, stop]);
  useEffect(() => {
    alive.current = true; currentUrl.current = initialUrl;
    const timer = window.setTimeout(() => { void read(); }, 0);
    const focus = () => { void read(); };
    const visibility = () => { if (document.visibilityState === 'hidden') hide(); else focus(); };
    window.addEventListener('blur', hide); window.addEventListener('focus', focus); document.addEventListener('visibilitychange', visibility);
    return () => { alive.current = false; invalidate(); window.clearTimeout(timer); window.removeEventListener('blur', hide); window.removeEventListener('focus', focus); document.removeEventListener('visibilitychange', visibility); };
  }, [initialUrl, read, hide, invalidate]);
  async function command<R>(url: string, body: unknown, valid: (value: unknown) => value is R): Promise<R | null> {
    if (!verifiedNow.current || closed.current) return null;
    const turn = epoch.current;
    const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-assessment-author': actorId }, body: JSON.stringify(body), signal: AbortSignal.timeout(15_000) });
    const result: unknown = await response.json().catch(() => null);
    if (!alive.current || turn !== epoch.current || closed.current) return null;
    if (changed(response, result)) { stop(); return null; }
    if (!response.ok) {
      if ([403, 404, 409].includes(response.status)) hide();
      throw new TemplateRequestError(response.status, record(result) && typeof result.code === 'string' ? result.code : null,
        record(result) && typeof result.error === 'string' ? result.error : 'The request could not be confirmed. Retry the same request to recover its receipt.');
    }
    if (!valid(result)) throw new Error('The saved receipt could not be verified. Retry the same request to recover it.');
    return result;
  }
  return { data: verified ? value : null, loading, stopped, error, read, command, hide, verifiedNow };
}
