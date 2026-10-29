import { describe, expect, it } from 'vitest';
import { editorNewline, indentEditorSelection } from './editor-indentation';

describe('fallback editor transactions', () => {
  it('inserts spaces to the next indent stop at a caret', () => {
    expect(indentEditorSelection({ source: ' abc', start: 2, end: 2 }, 4)).toEqual({ source: ' a  bc', start: 4, end: 4 });
  });
  it('indents and outdents selected lines without consuming a following unselected line', () => {
    const selected = { source: 'a\nb\nc', start: 0, end: 4 };
    const indented = indentEditorSelection(selected, 2);
    expect(indented).toEqual({ source: '  a\n  b\nc', start: 2, end: 8 });
    expect(indentEditorSelection(indented, 2, true)).toEqual(selected);
  });
  it('outdents spaces and a leading tab without deleting non-whitespace', () => {
    expect(indentEditorSelection({ source: ' x\n\ty', start: 0, end: 5 }, 4, true)).toEqual({ source: 'x\ny', start: 0, end: 3 });
  });
  it('preserves selected source outside the inserted newline and uses language indentation', () => {
    expect(editorNewline({ source: '    if value:', start: 13, end: 13 }, 4, 'python').source).toBe('    if value:\n        ');
    expect(editorNewline({ source: 'if (ok) {', start: 9, end: 9 }, 2, 'typescript').source).toBe('if (ok) {\n  ');
    expect(editorNewline({ source: '  step:', start: 7, end: 7 }, 2, 'text').source).toBe('  step:\n  ');
  });
});
