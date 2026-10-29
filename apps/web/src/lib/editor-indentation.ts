export type EditorSelection = { source: string; start: number; end: number };

/** Pure fallback edits keep text and selection changes in the same operation. */
export function indentEditorSelection(selection: EditorSelection, size: number, outdent = false): EditorSelection {
  const { source, start, end } = selection;
  const lineStart = start === 0 ? 0 : source.lastIndexOf('\n', start - 1) + 1;
  if (start === end && !outdent) {
    const spaces = ' '.repeat(size - ((start - lineStart) % size));
    return { source: source.slice(0, start) + spaces + source.slice(end), start: start + spaces.length, end: start + spaces.length };
  }
  const selectionEnd = end > start && source[end - 1] === '\n' ? end - 1 : end;
  const lineEnd = source.indexOf('\n', selectionEnd);
  const stop = lineEnd < 0 ? source.length : lineEnd;
  const lines = source.slice(lineStart, stop).split('\n');
  const changes = lines.map(line => outdent ? -(line.startsWith('\t') ? 1 : Math.min(size, /^ */.exec(line)![0].length)) : size);
  const replacement = lines.map((line, index) => outdent ? line.slice(-changes[index]) : ' '.repeat(size) + line).join('\n');
  const delta = changes.reduce((sum, count) => sum + count, 0);
  const firstRemoved = Math.max(0, -changes[0]);
  return {
    source: source.slice(0, lineStart) + replacement + source.slice(stop),
    start: outdent ? Math.max(lineStart, start - firstRemoved) : start + changes[0],
    end: Math.max(lineStart, end + delta),
  };
}

export function editorNewline(selection: EditorSelection, size: number, language: string): EditorSelection {
  const { source, start, end } = selection;
  const before = source.slice(start === 0 ? 0 : source.lastIndexOf('\n', start - 1) + 1, start);
  const indentation = /^\s*/.exec(before)?.[0] ?? '';
  const opensBlock = language === 'python' ? /:\s*(?:#.*)?$/.test(before) : language !== 'text' && /\{\s*$/.test(before);
  const inserted = '\n' + indentation + (opensBlock ? ' '.repeat(size) : '');
  return { source: source.slice(0, start) + inserted + source.slice(end), start: start + inserted.length, end: start + inserted.length };
}
