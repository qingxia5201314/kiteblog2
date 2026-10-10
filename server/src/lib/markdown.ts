export type MarkdownBlock =
  | { type: 'heading'; level: 1 | 2 | 3; text: string }
  | { type: 'paragraph'; text: string }
  | { type: 'blockquote'; text: string }
  | { type: 'list'; ordered: boolean; items: string[] }
  | { type: 'code'; language: string; code: string }
  | { type: 'math'; formula: string }
  | { type: 'image'; alt: string; url: string };

function flushParagraph(blocks: MarkdownBlock[], paragraph: string[]) {
  if (paragraph.length === 0) return;
  blocks.push({ type: 'paragraph', text: paragraph.join('\n') });
  paragraph.length = 0;
}

function flushList(blocks: MarkdownBlock[], list: { ordered: boolean; items: string[] } | undefined) {
  if (!list) return undefined;
  blocks.push({ type: 'list', ordered: list.ordered, items: list.items });
  return undefined;
}

export function parseMarkdown(markdown: string): MarkdownBlock[] {
  const blocks: MarkdownBlock[] = [];
  const paragraph: string[] = [];
  let currentList: { ordered: boolean; items: string[] } | undefined;
  let codeLanguage = '';
  let codeLines: string[] | undefined;
  let mathLines: string[] | undefined;

  for (const line of markdown.replace(/\r\n/g, '\n').split('\n')) {
    const fenceMatch = line.match(/^```([\w-]*)\s*$/);

    if (fenceMatch && codeLines) {
      blocks.push({ type: 'code', language: codeLanguage, code: codeLines.join('\n') });
      codeLines = undefined;
      codeLanguage = '';
      continue;
    }

    if (codeLines) {
      codeLines.push(line);
      continue;
    }

    if (fenceMatch) {
      flushParagraph(blocks, paragraph);
      currentList = flushList(blocks, currentList);
      codeLanguage = fenceMatch[1] ?? '';
      codeLines = [];
      continue;
    }

    if (line.trim() === '$$') {
      if (mathLines) {
        blocks.push({ type: 'math', formula: mathLines.join('\n').trim() });
        mathLines = undefined;
      } else {
        flushParagraph(blocks, paragraph);
        currentList = flushList(blocks, currentList);
        mathLines = [];
      }
      continue;
    }

    if (mathLines) {
      mathLines.push(line);
      continue;
    }

    if (!line.trim()) {
      flushParagraph(blocks, paragraph);
      currentList = flushList(blocks, currentList);
      continue;
    }

    const imageMatch = line.match(/^!\[(.*)]\((https?:\/\/.+|\/api\/images\/raw\/[^)\s]+)\)$/);
    if (imageMatch) {
      flushParagraph(blocks, paragraph);
      currentList = flushList(blocks, currentList);
      blocks.push({ type: 'image', alt: imageMatch[1], url: imageMatch[2] });
      continue;
    }

    const headingMatch = line.match(/^(#{1,3})\s+(.+)$/);
    if (headingMatch) {
      flushParagraph(blocks, paragraph);
      currentList = flushList(blocks, currentList);
      blocks.push({
        type: 'heading',
        level: headingMatch[1].length as 1 | 2 | 3,
        text: headingMatch[2]
      });
      continue;
    }

    const quoteMatch = line.match(/^>\s+(.+)$/);
    if (quoteMatch) {
      flushParagraph(blocks, paragraph);
      currentList = flushList(blocks, currentList);
      blocks.push({ type: 'blockquote', text: quoteMatch[1] });
      continue;
    }

    const unorderedMatch = line.match(/^[-*]\s+(.+)$/);
    const orderedMatch = line.match(/^\d+\.\s+(.+)$/);

    if (unorderedMatch || orderedMatch) {
      flushParagraph(blocks, paragraph);
      const ordered = Boolean(orderedMatch);
      const item = unorderedMatch?.[1] ?? orderedMatch?.[1] ?? '';

      if (!currentList || currentList.ordered !== ordered) {
        currentList = flushList(blocks, currentList);
        currentList = { ordered, items: [] };
      }

      currentList.items.push(item);
      continue;
    }

    currentList = flushList(blocks, currentList);
    paragraph.push(line);
  }

  if (codeLines) {
    blocks.push({ type: 'code', language: codeLanguage, code: codeLines.join('\n') });
  }

  if (mathLines) {
    blocks.push({ type: 'paragraph', text: `$$\n${mathLines.join('\n')}` });
  }

  flushParagraph(blocks, paragraph);
  flushList(blocks, currentList);

  return blocks;
}
