import { Fragment } from 'react';

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function splitHighlightedText(text: string, query: string) {
  const needle = query.trim();
  if (!needle) return [{ text, match: false }];
  const matcher = new RegExp(`(${escapeRegExp(needle)})`, 'gi');
  return text.split(matcher).filter(Boolean).map((part) => ({
    text: part,
    match: part.toLowerCase() === needle.toLowerCase()
  }));
}

export function SearchHighlight({ text, query }: { text: string; query: string }) {
  return (
    <>
      {splitHighlightedText(text, query).map((part, index) => (
        <Fragment key={`${index}:${part.text}`}>
          {part.match ? <mark>{part.text}</mark> : part.text}
        </Fragment>
      ))}
    </>
  );
}
