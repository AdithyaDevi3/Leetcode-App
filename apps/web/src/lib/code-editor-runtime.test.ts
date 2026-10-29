import { describe, expect, it } from 'vitest';
import { EditorSelection, type EditorState, type StateCommand } from '@codemirror/state';
import { indentLess, insertNewlineAndIndent, undo } from '@codemirror/commands';
import { createEditorState, indentEditorAtCursor, restoreRejectedEditorChange, type EditorConfiguration, type EditorLanguage } from './code-editor-runtime';

function editor(source: string, language: EditorLanguage = 'python') {
  const config: EditorConfiguration = { language, label: 'Synthetic editor', disabled: false, indentSize: language === 'python' ? 4 : 2, fontSize: 14, wrap: true, onChange: () => {}, onSelection: () => {} };
  let state: EditorState = createEditorState(source, config);
  return {
    state: () => state,
    select: (from: number, to = from) => { state = state.update({ selection: EditorSelection.single(from, to) }).state; },
    run: (command: StateCommand) => command({ state, dispatch: transaction => { state = transaction.state; } }),
  };
}

describe('CodeMirror editor transactions', () => {
  it('inserts to an indent stop at the caret and undoes the exact edit', () => {
    const target = editor('value');
    target.select(1);
    target.run(indentEditorAtCursor);
    expect(target.state().doc.toString()).toBe('v   alue');
    expect(target.state().selection.main.head).toBe(4);
    target.run(undo);
    expect(target.state().doc.toString()).toBe('value');
    expect(target.state().selection.main.head).toBe(1);
  });
  it('indents selected lines, outdents them, and preserves a following line', () => {
    const target = editor('first\nsecond\nthird', 'typescript');
    target.select(0, 13);
    target.run(indentEditorAtCursor);
    expect(target.state().doc.toString()).toBe('  first\n  second\nthird');
    target.run(indentLess);
    expect(target.state().doc.toString()).toBe('first\nsecond\nthird');
    target.run(undo);
    expect(target.state().doc.toString()).toBe('  first\n  second\nthird');
  });
  it.each(['python', 'cpp', 'typescript'] as const)('Enter uses %s indentation', language => {
    const source = language === 'python' ? 'def solve():' : language === 'cpp' ? 'int solve() {' : 'function solve() {';
    const target = editor(source, language);
    target.select(source.length);
    target.run(insertNewlineAndIndent);
    expect(target.state().doc.toString()).toBe(source + '\n' + ' '.repeat(language === 'python' ? 4 : 2));
  });
  it('does not edit a read-only document', () => {
    const state = createEditorState('original', { language: 'text', label: 'Read only', disabled: true, indentSize: 2, fontSize: 14, wrap: true, onChange: () => {}, onSelection: () => {} });
    expect(indentEditorAtCursor({ state, dispatch: () => { throw new Error('Unexpected edit'); } })).toBe(false);
  });
  it('restores text, selection and valid undo history after rejecting a controlled edit', async () => {
    const target = editor('value');
    target.select(1);
    target.run(indentEditorAtCursor);
    const previous = target.state();
    const rejected = previous.update({ changes: { from: 0, insert: 'rejected' }, userEvent: 'input' }).state;
    const controller = { state: rejected, setState: (state: EditorState) => { controller.state = state; } };
    restoreRejectedEditorChange(() => controller, rejected, previous);
    expect(controller.state).toBe(rejected);
    await Promise.resolve();
    expect(controller.state).toBe(previous);
    expect(controller.state.selection.main.head).toBe(4);
    undo({ state: controller.state, dispatch: transaction => { controller.state = transaction.state; } });
    expect(controller.state.doc.toString()).toBe('value');
    expect(controller.state.selection.main.head).toBe(1);
  });
  it('does not overwrite a later accepted edit or an unmounted editor', async () => {
    const previous = editor('original').state();
    const rejected = previous.update({ changes: { from: 0, insert: 'rejected' } }).state;
    const later = previous.update({ changes: { from: 0, insert: 'accepted' } }).state;
    const controller = { state: rejected, setState: (state: EditorState) => { controller.state = state; } };
    restoreRejectedEditorChange(() => controller, rejected, previous);
    controller.state = later;
    restoreRejectedEditorChange(() => null, rejected, previous, () => { throw new Error('Unmounted editor restored'); });
    await Promise.resolve();
    expect(controller.state).toBe(later);
  });
});
