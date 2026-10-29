import { EditorSelection, EditorState, StateEffect, countColumn, type Extension, type StateCommand } from '@codemirror/state';
import { EditorView, keymap, lineNumbers, highlightActiveLineGutter, drawSelection, highlightActiveLine } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap, indentMore, indentLess, indentSelection, isolateHistory, undo, redo } from '@codemirror/commands';
import { bracketMatching, defaultHighlightStyle, getIndentUnit, indentOnInput, indentUnit, syntaxHighlighting } from '@codemirror/language';
import { closeBrackets, closeBracketsKeymap } from '@codemirror/autocomplete';
import { highlightSelectionMatches, openSearchPanel, searchKeymap } from '@codemirror/search';
import { python } from '@codemirror/lang-python';
import { cpp } from '@codemirror/lang-cpp';
import { javascript } from '@codemirror/lang-javascript';
import type { CodingLanguage } from './practice-session';

export type EditorLanguage = CodingLanguage | 'text';
export type EditorConfiguration = {
  language: EditorLanguage;
  label: string;
  descriptionId?: string;
  disabled: boolean;
  indentSize: number;
  wrap: boolean;
  fontSize: number;
  onChange: (value: string, previous: EditorState, current: EditorState) => void;
  onSelection: (line: number, column: number) => void;
};

export function editorLanguageExtension(language: EditorLanguage): Extension {
  return language === 'python' ? python() : language === 'cpp' ? cpp() : language === 'typescript' ? javascript({ typescript: true }) : [];
}

export const indentEditorAtCursor: StateCommand = ({ state, dispatch }) => {
  if (state.readOnly) return false;
  if (state.selection.ranges.some(range => !range.empty)) return indentMore({ state, dispatch });
  const unit = getIndentUnit(state);
  dispatch(state.update(state.changeByRange(range => {
    const line = state.doc.lineAt(range.head);
    const column = countColumn(state.doc.sliceString(line.from, range.head), state.tabSize);
    const spaces = ' '.repeat(unit - (column % unit));
    return { changes: { from: range.from, insert: spaces }, range: EditorSelection.cursor(range.from + spaces.length) };
  }), { scrollIntoView: true, userEvent: 'input.indent' }));
  return true;
};

export function editorExtensions(config: EditorConfiguration): Extension[] {
  return [
    lineNumbers(), highlightActiveLineGutter(), drawSelection(), highlightActiveLine(),
    history(), bracketMatching(), closeBrackets(), indentOnInput(), highlightSelectionMatches(),
    EditorState.transactionExtender.of(transaction => transaction.isUserEvent('input.indent') ? { annotations: isolateHistory.of('full') } : null),
    editorLanguageExtension(config.language), syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
    indentUnit.of(' '.repeat(config.indentSize)), EditorState.tabSize.of(config.indentSize),
    EditorState.readOnly.of(config.disabled), EditorView.editable.of(!config.disabled),
    EditorView.contentAttributes.of({ 'aria-label': config.label, 'aria-describedby': config.descriptionId ?? '', 'aria-multiline': 'true', 'aria-disabled': String(config.disabled), spellcheck: 'false', autocorrect: 'off', autocapitalize: 'off' }),
    keymap.of([
      { key: 'Escape', run: view => { view.setTabFocusMode(2000); return false; } },
      { key: 'Tab', run: indentEditorAtCursor, shift: indentLess },
      ...closeBracketsKeymap, ...defaultKeymap, ...historyKeymap, ...searchKeymap,
    ]),
    config.wrap ? EditorView.lineWrapping : [],
    EditorView.theme({
      '&': { height: '100%', color: 'var(--ink, #233329)', backgroundColor: 'var(--surface, #fff)', fontSize: `${config.fontSize}px` },
      '&.cm-focused': { outline: '2px solid var(--moss, #3d654b)', outlineOffset: '-2px' },
      '.cm-scroller': { overflow: 'auto', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace', lineHeight: '1.65' },
      '.cm-content': { padding: '12px 0', minHeight: '100%' },
      '.cm-line': { padding: '0 12px' },
      '.cm-gutters': { color: 'var(--muted, #738078)', backgroundColor: 'var(--paper, #f6f7f3)', border: 'none' },
      '.cm-activeLine, .cm-activeLineGutter': { backgroundColor: 'rgba(80, 125, 90, 0.06)' },
      '.cm-cursor': { borderLeftColor: 'var(--ink, #233329)' },
      '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection': { backgroundColor: '#cdddcc' },
      '.cm-panels': { backgroundColor: 'var(--paper, #f6f7f3)', color: 'var(--ink, #233329)' },
      '.cm-search input': { backgroundColor: 'var(--surface, #fff)', color: 'var(--ink, #233329)' },
    }),
    EditorView.updateListener.of(update => {
      if (update.docChanged) config.onChange(update.state.doc.toString(), update.startState, update.state);
      if (update.docChanged || update.selectionSet) {
        const head = update.state.selection.main.head;
        const line = update.state.doc.lineAt(head);
        config.onSelection(line.number, head - line.from + 1);
      }
    }),
  ];
}

export const createEditorState = (source: string, config: EditorConfiguration) => EditorState.create({ doc: source, extensions: editorExtensions(config) });
export const reconfigureEditor = (view: EditorView, config: EditorConfiguration) => view.dispatch({ effects: StateEffect.reconfigure.of(editorExtensions(config)) });

/** Restore after the current update completes, including history before a rejected edit. */
export function restoreRejectedEditorChange(
  current: () => Pick<EditorView, 'state' | 'setState'> | null,
  rejected: EditorState,
  previous: EditorState,
  restored: (state: EditorState) => void = () => {},
) {
  queueMicrotask(() => {
    const editor = current();
    // A later accepted edit, language switch, restore or unmount takes precedence.
    if (!editor || editor.state.doc !== rejected.doc) return;
    editor.setState(previous);
    restored(previous);
  });
}
export { EditorView, undo, redo, indentSelection, openSearchPanel };
