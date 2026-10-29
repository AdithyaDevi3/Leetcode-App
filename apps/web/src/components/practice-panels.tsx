'use client';

import { useEffect, useId, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react';
import { ChevronDown, ChevronUp, RotateCcw } from 'lucide-react';
import { readBrowserStorage, writeBrowserStorage } from '@/lib/safe-browser-storage';
import './practice-panels.css';

export type PracticePanel = 'context' | 'task' | 'results';

type LayoutPreferences = { contextWidth: number; taskHeight: number; resultsCollapsed: boolean };
const defaults: LayoutPreferences = { contextWidth: 42, taskHeight: 74, resultsCollapsed: false };
const preferenceKey = 'method:practice-layout:v1';

const limit = (value: number, minimum: number, maximum: number) => Math.min(maximum, Math.max(minimum, value));
const boundedRatio = (ratio: number, size: number, firstMinimum: number, lastMinimum: number, low: number, high: number) => {
  // Keep both panels usable when space permits, without overflowing short windows.
  const available = Math.max(1, size - 8);
  const min = Math.min(high, Math.max(low, Math.min(firstMinimum, available * .35) / available * 100));
  const max = Math.max(min, Math.min(high, (available - Math.min(lastMinimum, available * .35)) / available * 100));
  return limit(ratio, min, max);
};

export function PracticePanels({
  context,
  children,
  results,
  contextLabel = 'Problem & context',
  taskLabel = 'Workspace',
  resultsLabel = 'Test results',
  activePanel,
  onPanelChange,
}: {
  context: ReactNode;
  children: ReactNode;
  results?: ReactNode;
  contextLabel?: string;
  taskLabel?: string;
  resultsLabel?: string;
  activePanel?: PracticePanel;
  onPanelChange?: (panel: PracticePanel) => void;
}) {
  const id = useId();
  const gridRef = useRef<HTMLDivElement>(null);
  const taskStackRef = useRef<HTMLDivElement>(null);
  const dragging = useRef<'context' | 'results' | null>(null);
  const [resizing, setResizing] = useState<'context' | 'results' | null>(null);
  const [preferences, setPreferences] = useState<LayoutPreferences>(defaults);
  const [preferencesLoaded, setPreferencesLoaded] = useState(false);
  const [localPanel, setLocalPanel] = useState<PracticePanel>('task');
  const hasResults = results !== undefined && results !== null;
  const requestedPanel = activePanel ?? localPanel;
  const selectedPanel = !hasResults && requestedPanel === 'results' ? 'task' : requestedPanel;
  const contextId = `${id}-context`;
  const taskId = `${id}-task`;
  const resultsId = `${id}-results`;

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        const stored = JSON.parse(readBrowserStorage(preferenceKey) ?? 'null') as Partial<LayoutPreferences> | null;
        if (stored && typeof stored === 'object') {
          setPreferences({
            contextWidth: typeof stored.contextWidth === 'number' && Number.isFinite(stored.contextWidth) ? limit(stored.contextWidth, 28, 65) : defaults.contextWidth,
            taskHeight: typeof stored.taskHeight === 'number' && Number.isFinite(stored.taskHeight) ? limit(stored.taskHeight, 25, 85) : defaults.taskHeight,
            resultsCollapsed: stored.resultsCollapsed === true,
          });
        }
      } catch { /* Invalid layout preferences never prevent opening saved work. */ }
      setPreferencesLoaded(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!preferencesLoaded) return;
    const timer = window.setTimeout(() => writeBrowserStorage(preferenceKey, JSON.stringify(preferences)), 200);
    return () => window.clearTimeout(timer);
  }, [preferences, preferencesLoaded]);

  useEffect(() => {
    if (selectedPanel !== 'results' || !preferences.resultsCollapsed) return;
    const timer = window.setTimeout(() => setPreferences((current) => ({ ...current, resultsCollapsed: false })), 0);
    return () => window.clearTimeout(timer);
  }, [selectedPanel, preferences.resultsCollapsed]);

  const selectPanel = (panel: PracticePanel) => {
    setLocalPanel(panel);
    onPanelChange?.(panel);
  };

  const updateRatio = (axis: 'context' | 'results', ratio: number) => {
    const size = axis === 'context' ? gridRef.current?.clientWidth ?? 1 : taskStackRef.current?.clientHeight ?? 1;
    const value = axis === 'context'
      ? boundedRatio(ratio, size, 250, 320, 28, 65)
      : boundedRatio(ratio, size, 180, 120, 25, 85);
    setPreferences((current) => ({ ...current, [axis === 'context' ? 'contextWidth' : 'taskHeight']: value }));
  };

  const beginResize = (event: PointerEvent<HTMLDivElement>, axis: 'context' | 'results') => {
    if (event.button !== 0) return;
    event.preventDefault();
    dragging.current = axis;
    setResizing(axis);
    event.currentTarget.setPointerCapture(event.pointerId);
    event.currentTarget.focus({ preventScroll: true });
  };

  const moveResize = (event: PointerEvent<HTMLDivElement>) => {
    const axis = dragging.current;
    if (!axis) return;
    const bounds = (axis === 'context' ? gridRef.current : taskStackRef.current)?.getBoundingClientRect();
    if (!bounds) return;
    const size = axis === 'context' ? bounds.width : bounds.height;
    const position = axis === 'context' ? event.clientX - bounds.left : event.clientY - bounds.top;
    updateRatio(axis, (position - 4) / Math.max(1, size - 8) * 100);
  };

  const finishResize = () => {
    dragging.current = null;
    setResizing(null);
  };

  const resizeWithKeyboard = (event: KeyboardEvent<HTMLDivElement>, axis: 'context' | 'results') => {
    const value = axis === 'context' ? preferences.contextWidth : preferences.taskHeight;
    const decrease = axis === 'context' ? 'ArrowLeft' : 'ArrowUp';
    const increase = axis === 'context' ? 'ArrowRight' : 'ArrowDown';
    const delta = event.shiftKey ? 10 : 2;
    if (event.key === decrease || event.key === increase || event.key === 'Home' || event.key === 'End') {
      event.preventDefault();
      updateRatio(axis, event.key === 'Home' ? 0 : event.key === 'End' ? 100 : value + (event.key === increase ? delta : -delta));
    }
  };

  const separator = (axis: 'context' | 'results') => <div
    className={`practice-panel-separator practice-panel-separator-${axis}`}
    role="separator"
    aria-label={axis === 'context' ? 'Resize problem and workspace panels' : 'Resize editor and results panels'}
    aria-orientation={axis === 'context' ? 'vertical' : 'horizontal'}
    aria-controls={axis === 'context' ? contextId : taskId}
    aria-valuemin={axis === 'context' ? 28 : 25}
    aria-valuemax={axis === 'context' ? 65 : 85}
    aria-valuenow={Math.round(axis === 'context' ? preferences.contextWidth : preferences.taskHeight)}
    aria-valuetext={`${Math.round(axis === 'context' ? preferences.contextWidth : preferences.taskHeight)} percent ${axis === 'context' ? 'problem panel width' : 'editor height'}`}
    tabIndex={0}
    title="Drag or use arrow keys to resize. Hold Shift for larger steps."
    onPointerDown={(event) => beginResize(event, axis)}
    onPointerMove={moveResize}
    onPointerUp={finishResize}
    onPointerCancel={finishResize}
    onLostPointerCapture={finishResize}
    onKeyDown={(event) => resizeWithKeyboard(event, axis)}
    onDoubleClick={() => setPreferences((current) => ({ ...current, [axis === 'context' ? 'contextWidth' : 'taskHeight']: axis === 'context' ? defaults.contextWidth : defaults.taskHeight }))}
  ><span aria-hidden="true" /></div>;

  const styles = { '--practice-context-width': `${preferences.contextWidth}%`, '--practice-task-height': `${preferences.taskHeight}%` } as CSSProperties;

  return <div className="practice-panels" style={styles} data-mobile-panel={selectedPanel} data-resizing={resizing ?? undefined}>
    <div className="practice-panels-toolbar">
      <nav className="practice-panels-mobile-nav" aria-label="Workspace panels">
        {([{ value: 'context', label: 'Problem', controls: contextId }, { value: 'task', label: taskLabel, controls: taskId }, ...(hasResults ? [{ value: 'results', label: 'Results', controls: resultsId }] : [])] as const).map(({ value, label, controls }) => <button key={value} type="button" aria-pressed={selectedPanel === value} aria-controls={controls} onClick={() => selectPanel(value as PracticePanel)}>{label}</button>)}
      </nav>
      <div className="practice-panels-layout-actions">
        {hasResults ? <button className="practice-panels-results-toggle" type="button" aria-expanded={!preferences.resultsCollapsed} aria-controls={resultsId} onClick={() => {
          selectPanel(preferences.resultsCollapsed ? 'results' : 'task');
          setPreferences((current) => ({ ...current, resultsCollapsed: !current.resultsCollapsed }));
        }}>{preferences.resultsCollapsed ? <ChevronUp size={14} /> : <ChevronDown size={14} />}{preferences.resultsCollapsed ? 'Show results' : 'Hide results'}</button> : null}
        <button type="button" aria-label="Reset panel layout" title="Reset panel layout" onClick={() => setPreferences(defaults)}><RotateCcw size={13} /><span>Reset layout</span></button>
      </div>
    </div>
    <div ref={gridRef} className="practice-panels-grid">
      <section id={contextId} className="practice-panel practice-panel-context" aria-label={contextLabel}>
        <div className="practice-panel-content practice-panel-context-content">{context}</div>
      </section>
      {separator('context')}
      <div ref={taskStackRef} className="practice-panels-task-stack" data-has-results={hasResults} data-results-collapsed={preferences.resultsCollapsed}>
        <section id={taskId} className="practice-panel practice-panel-task" aria-label={taskLabel}>
          <div className="practice-panel-content practice-panel-task-content">{children}</div>
        </section>
        {hasResults ? <>
          {separator('results')}
          <section id={resultsId} className="practice-panel practice-panel-results" aria-label={resultsLabel}>
            <div className="practice-panel-content practice-panel-results-content">{results}</div>
          </section>
        </> : null}
      </div>
    </div>
  </div>;
}
