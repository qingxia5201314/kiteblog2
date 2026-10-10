export function insertAtSelection(value: string, insert: string, selectionStart = value.length, selectionEnd = selectionStart) {
  const start = Math.max(0, Math.min(selectionStart, value.length));
  const end = Math.max(start, Math.min(selectionEnd, value.length));
  const nextValue = `${value.slice(0, start)}${insert}${value.slice(end)}`;
  return {
    value: nextValue,
    cursor: start + insert.length
  };
}

export function getFirstClipboardImage(items: Iterable<Pick<DataTransferItem, 'kind' | 'type' | 'getAsFile'>>) {
  for (const item of items) {
    if (item.kind === 'file' && item.type.startsWith('image/')) {
      const file = item.getAsFile();
      if (file) return file;
    }
  }
  return null;
}

export function createMarkdownImageBlock(alt: string, url: string): string {
  const safeAlt = String(alt || 'image').replace(/[\r\n[\]]/g, ' ').trim() || 'image';
  return `\n\n![${safeAlt}](${url})\n\n`;
}
