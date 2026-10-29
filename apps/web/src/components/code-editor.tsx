'use client';

import { useCallback, useEffect, useId, useImperativeHandle, useRef, useState, type KeyboardEvent, type Ref } from 'react';
import type { EditorState } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';
import type { EditorConfiguration, EditorLanguage } from '@/lib/code-editor-runtime';
import { editorNewline, indentEditorSelection, type EditorSelection } from '@/lib/editor-indentation';

export type CodeEditorHandle = { focus: () => void };
export type CodeEditorProps = {
  value: string;
  onChange: (value: string) => boolean | void;
  language: EditorLanguage;
  label: string;
  editorKey: string;
  disabled?: boolean;
  className?: string;
  ref?: Ref<CodeEditorHandle>;
};

type Runtime = typeof import('@/lib/code-editor-runtime');

export function CodeEditor({ value, onChange, language, label, editorKey, disabled = false, className = '', ref }: CodeEditorProps) {
  const host = useRef<HTMLDivElement>(null);
  const fallback = useRef<HTMLTextAreaElement>(null);
  const view = useRef<EditorView | null>(null);
  const runtime = useRef<Runtime | null>(null);
  const states = useRef(new Map<string, EditorState>());
  const activeKey = useRef(editorKey);
  const escaped = useRef(false);
  const fallbackHistory = useRef<{ undo: EditorSelection[]; redo: EditorSelection[] }>({ undo: [], redo: [] });
  const fallbackBeforeInput = useRef<EditorSelection | null>(null);
  const [ready, setReady] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [indentOverride, setIndentOverride] = useState<number | null>(null);
  const indentSize = indentOverride ?? (language === 'python' ? 4 : 2);
  const [wrap, setWrap] = useState(true);
  const [fontSize, setFontSize] = useState(14);
  const [position, setPosition] = useState({ line: 1, column: 1 });
  const helpId = useId();
  const latest = useRef({ value, language, label, disabled, editorKey, indentSize, wrap, fontSize, onChange });

  useEffect(() => { latest.current = { value, language, label, disabled, editorKey, indentSize, wrap, fontSize, onChange }; }, [value, language, label, disabled, editorKey, indentSize, wrap, fontSize, onChange]);

  const configuration = useCallback((): EditorConfiguration => ({
    ...latest.current,
    descriptionId: helpId,
    onChange: (next, previous, changed) => {
      if (latest.current.onChange(next) === false) {
        runtime.current?.restoreRejectedEditorChange(() => view.current, changed, previous, restored => {
          const head = restored.selection.main.head;
          const line = restored.doc.lineAt(head);
          setPosition({ line: line.number, column: head - line.from + 1 });
        });
      } else latest.current.value = next;
    },
    onSelection: (line, column) => setPosition({ line, column }),
  }), [helpId]);

  useImperativeHandle(ref, () => ({ focus: () => { if (view.current) view.current.focus(); else fallback.current?.focus({ preventScroll: true }); } }), []);

  useEffect(() => {
    let canceled = false;
    const cachedStates = states.current;
    void import('@/lib/code-editor-runtime').then(editorRuntime => {
      if (canceled || !host.current) return;
      runtime.current = editorRuntime;
      activeKey.current = latest.current.editorKey;
      const shouldFocus = document.activeElement === fallback.current;
      const selection = fallback.current ? { anchor: Math.min(latest.current.value.length, fallback.current.selectionStart), head: Math.min(latest.current.value.length, fallback.current.selectionEnd) } : undefined;
      view.current = new editorRuntime.EditorView({ parent: host.current, state: editorRuntime.createEditorState(latest.current.value, configuration()) });
      if (selection) view.current.dispatch({ selection });
      if (shouldFocus) view.current.focus();
      setReady(true);
    }).catch(() => { if (!canceled) setLoadFailed(true); });
    return () => { canceled = true; view.current?.destroy(); view.current = null; cachedStates.clear(); };
    // The loader reads current props after resolving, including edits made in the fallback.
  }, [configuration]);

  useEffect(() => {
    const editor = view.current;
    const editorRuntime = runtime.current;
    if (!ready || !editor || !editorRuntime) return;
    if (activeKey.current !== editorKey) {
      states.current.set(activeKey.current, editor.state);
      const saved = states.current.get(editorKey);
      editor.setState(saved && saved.doc.toString() === value ? saved : editorRuntime.createEditorState(value, configuration()));
      activeKey.current = editorKey;
      while (states.current.size > 4) states.current.delete(states.current.keys().next().value!);
      fallbackHistory.current = { undo: [], redo: [] };
    } else if (editor.state.doc.toString() !== value) {
      // Explicit restore/reset must not leave an undo transaction from an old snapshot.
      editor.setState(editorRuntime.createEditorState(value, configuration()));
    }
    const head = editor.state.selection.main.head;
    const line = editor.state.doc.lineAt(head);
    setPosition({ line: line.number, column: head - line.from + 1 });
  }, [ready, editorKey, value, configuration]);

  useEffect(() => {
    if (ready && view.current && runtime.current) runtime.current.reconfigureEditor(view.current, configuration());
  }, [ready, editorKey, language, label, disabled, indentSize, wrap, fontSize, configuration]);

  const editFallback = (next: EditorSelection, record = true) => {
    const textarea = fallback.current;
    if (!textarea) return;
    const previous = { source: value, start: textarea.selectionStart, end: textarea.selectionEnd };
    if (onChange(next.source) === false) {
      textarea.value = previous.source;
      textarea.setSelectionRange(previous.start, previous.end);
      return;
    }
    if (record) {
      fallbackHistory.current.undo.push(previous);
      if (fallbackHistory.current.undo.length > 100) fallbackHistory.current.undo.shift();
      fallbackHistory.current.redo = [];
    }
    latest.current.value = next.source;
    requestAnimationFrame(() => { if (fallback.current?.value === next.source) fallback.current.setSelectionRange(next.start, next.end); });
  };
  const fallbackKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.nativeEvent.isComposing || disabled) return;
    if (event.key === 'Escape') { escaped.current = true; return; }
    const letTabLeave = escaped.current;
    escaped.current = false;
    const textarea = event.currentTarget;
    const selection = { source: value, start: textarea.selectionStart, end: textarea.selectionEnd };
    if (event.key === 'Tab' && !letTabLeave) {
      event.preventDefault();
      editFallback(indentEditorSelection(selection, indentSize, event.shiftKey));
    } else if (event.key === 'Enter' && !event.metaKey && !event.ctrlKey && !event.altKey) {
      event.preventDefault();
      editFallback(editorNewline(selection, indentSize, language));
    } else if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z') {
      const history = fallbackHistory.current;
      const source = event.shiftKey ? history.redo : history.undo;
      const target = event.shiftKey ? history.undo : history.redo;
      const previous = source.pop();
      if (previous) { event.preventDefault(); target.push(selection); editFallback(previous, false); }
    }
  };

  const command = (name: 'undo' | 'redo' | 'indentSelection' | 'openSearchPanel') => {
    if (!view.current || !runtime.current) return;
    runtime.current[name](view.current);
    view.current.focus();
  };

  return <div className={`code-editor-frame ${className}`} data-editor-ready={ready ? 'true' : 'false'}>
    <div className="code-editor-toolbar" role="group" aria-label={`${label} editor controls`}>
      <button type="button" disabled={disabled || !ready} onClick={() => command('undo')} aria-label={`Undo in ${label}`}>Undo</button>
      <button type="button" disabled={disabled || !ready} onClick={() => command('redo')} aria-label={`Redo in ${label}`}>Redo</button>
      <button type="button" disabled={disabled || !ready} onClick={() => command('indentSelection')}>Reindent selection</button>
      <button type="button" disabled={!ready} onClick={() => command('openSearchPanel')} aria-label={`Find in ${label}`}>Find</button>
      <label>Spaces <select aria-label={`${label} indentation`} value={indentSize} onChange={event => setIndentOverride(Number(event.target.value))}><option value={2}>2</option><option value={4}>4</option></select></label>
      <label>Font <select aria-label={`${label} font size`} value={fontSize} onChange={event => setFontSize(Number(event.target.value))}><option value={12}>12</option><option value={14}>14</option><option value={16}>16</option><option value={18}>18</option></select></label>
      <button type="button" aria-pressed={wrap} onClick={() => setWrap(!wrap)}>Wrap</button>
    </div>
    <div className="code-editor-host" ref={host} hidden={!ready} />
    {!ready ? <textarea ref={fallback} className="code-editor-fallback" aria-label={label} aria-describedby={helpId} disabled={disabled} spellCheck={false} autoCorrect="off" autoCapitalize="off" value={value} onKeyDown={fallbackKeyDown} onBeforeInput={event => {
      const textarea = event.currentTarget;
      fallbackBeforeInput.current = { source: value, start: textarea.selectionStart, end: textarea.selectionEnd };
    }} onChange={event => {
      const textarea = event.currentTarget;
      const previous = fallbackBeforeInput.current?.source === value ? fallbackBeforeInput.current : { source: value, start: Math.min(value.length, textarea.selectionStart), end: Math.min(value.length, textarea.selectionEnd) };
      fallbackBeforeInput.current = null;
      const next = textarea.value;
      if (onChange(next) === false) {
        textarea.value = previous.source;
        textarea.setSelectionRange(previous.start, previous.end);
        return;
      }
      fallbackHistory.current.undo.push(previous);
      if (fallbackHistory.current.undo.length > 100) fallbackHistory.current.undo.shift();
      fallbackHistory.current.redo = [];
      latest.current.value = next;
    }} style={{ fontSize, tabSize: indentSize, whiteSpace: wrap ? 'pre-wrap' : 'pre' }} /> : null}
    <div className="code-editor-footer"><span>Ln {position.line}, Col {position.column}</span><span>{indentSize} spaces</span><details className="code-editor-help"><summary>Keyboard help</summary><p id={helpId}>Tab indents; Shift+Tab outdents. Press Escape, then Tab or Shift+Tab to leave the editor. Use Ctrl/Cmd+Z to undo and Ctrl/Cmd+F to find. Reindent selection adjusts indentation; it does not repair program logic.</p></details></div>
    {loadFailed ? <p role="status">The enhanced editor could not load. You can keep editing and saving in the text editor.</p> : null}
  </div>;
}
