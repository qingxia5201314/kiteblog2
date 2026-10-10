export interface MarkdownIndentResult {
  value: string;
  selectionStart: number;
  selectionEnd: number;
}

const INDENT = '  ';

function lineStart(value: string, position: number) {
  return value.lastIndexOf('\n', Math.max(0, position - 1)) + 1;
}

function lineBlockEnd(value: string, selectionStart: number, selectionEnd: number) {
  if (selectionEnd > selectionStart && value[selectionEnd - 1] === '\n') return selectionEnd - 1;
  const nextBreak = value.indexOf('\n', selectionEnd);
  return nextBreak === -1 ? value.length : nextBreak;
}

function removableIndent(line: string) {
  if (line.startsWith('\t')) return 1;
  return Math.min(INDENT.length, line.match(/^ */)?.[0].length ?? 0);
}

export function applyMarkdownIndent(
  value: string,
  selectionStart: number,
  selectionEnd: number,
  outdent: boolean
): MarkdownIndentResult {
  const start = Math.max(0, Math.min(selectionStart, value.length));
  const end = Math.max(start, Math.min(selectionEnd, value.length));

  if (!outdent && start === end) {
    return {
      value: `${value.slice(0, start)}${INDENT}${value.slice(end)}`,
      selectionStart: start + INDENT.length,
      selectionEnd: start + INDENT.length
    };
  }

  const blockStart = lineStart(value, start);
  const blockEnd = lineBlockEnd(value, start, end);
  const lines = value.slice(blockStart, blockEnd).split('\n');

  if (!outdent) {
    const replacement = lines.map((line) => `${INDENT}${line}`).join('\n');
    const added = INDENT.length * lines.length;
    return {
      value: `${value.slice(0, blockStart)}${replacement}${value.slice(blockEnd)}`,
      selectionStart: start + INDENT.length,
      selectionEnd: end + added
    };
  }

  const removedByLine = lines.map(removableIndent);
  const replacement = lines
    .map((line, index) => line.slice(removedByLine[index]))
    .join('\n');
  const removedBeforeStart = Math.min(removedByLine[0], start - blockStart);
  const removedTotal = removedByLine.reduce((total, count) => total + count, 0);
  return {
    value: `${value.slice(0, blockStart)}${replacement}${value.slice(blockEnd)}`,
    selectionStart: start - removedBeforeStart,
    selectionEnd: Math.max(start - removedBeforeStart, end - removedTotal)
  };
}
