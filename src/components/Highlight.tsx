import { Fragment } from 'react';
import { highlightRanges } from '../lib/search';

/** Mostra `text` com os trechos que casaram com a busca em destaque. */
export function Highlight({ text, terms }: { text: string; terms: string[] }) {
  const ranges = highlightRanges(text, terms);
  if (ranges.length === 0) return <>{text}</>;

  const pieces: React.ReactNode[] = [];
  let cursor = 0;
  for (const [start, end] of ranges) {
    if (start > cursor) pieces.push(<Fragment key={`t${cursor}`}>{text.slice(cursor, start)}</Fragment>);
    pieces.push(<mark key={`m${start}`}>{text.slice(start, end)}</mark>);
    cursor = end;
  }
  if (cursor < text.length) pieces.push(<Fragment key="rest">{text.slice(cursor)}</Fragment>);

  return <>{pieces}</>;
}
