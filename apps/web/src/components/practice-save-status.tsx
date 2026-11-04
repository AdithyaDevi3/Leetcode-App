'use client';

import { Check, Save, X } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import type { PracticeSyncStatus } from '@/lib/practice-sync';

export function PracticeSaveStatus({ label, status, scope, onRetry }: {
  label: string;
  status: PracticeSyncStatus;
  scope: string;
  onRetry: () => void;
}) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const close = () => { setOpen(false); trigger.current?.focus(); };

  useEffect(() => {
    if (!open) return;
    const dismiss = (event: PointerEvent) => {
      if (event.target instanceof Node && !root.current?.contains(event.target)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      setOpen(false);
      trigger.current?.focus();
    };
    document.addEventListener('pointerdown', dismiss);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('pointerdown', dismiss);
      document.removeEventListener('keydown', escape);
    };
  }, [open]);

  return <div className="practice-save-status" ref={root} onBlur={event => {
    if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
  }}>
    <button className="practice-save-button" type="button" ref={trigger}
      aria-label={`Practice save status: ${label}`} aria-live="polite" aria-atomic="true" aria-expanded={open} aria-controls={id}
      data-save-status={status} onClick={() => setOpen(value => !value)}>
      {status === 'saved' ? <Check size={14} aria-hidden="true" /> : <Save size={14} aria-hidden="true" />}
      <span>{status === 'saved' ? 'Saved' : label}</span>
    </button>
    {open ? <section className="practice-save-details" id={id} aria-label="Practice save details">
      <div><h2>{label}</h2><button type="button" className="practice-save-close" aria-label="Close save details" onClick={close}><X size={16} aria-hidden="true" /></button></div>
      <p>{status === 'saved' ? 'Your latest save was confirmed by the server. You can continue working; changes save automatically.'
        : status === 'saving' ? 'Saving your latest changes. Keep this tab open until the save is confirmed.'
        : status === 'conflict' ? 'Saving is paused because another draft changed. Choose the draft to continue in the conflict notice.'
        : status === 'offline' ? 'A server save has not been confirmed. Keep this tab open and retry when your connection is available.'
        : 'Your work saves automatically as you practice. A confirmed save will appear here.'}</p>
      {scope === 'device' ? <button type="button" className="text-button" onClick={() => window.dispatchEvent(new Event('practice-owner-changed'))}>Reconnect account</button>
        : status === 'offline' ? <button type="button" className="text-button" onClick={onRetry}>Retry account save</button> : null}
    </section> : null}
  </div>;
}
