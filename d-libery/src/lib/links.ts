import type { BookInfo, BookLink } from '../types';

/** Links de busca em livrarias e sebos, montados a partir do ISBN ou titulo. */
export function shopLinks(info: Pick<BookInfo, 'title' | 'authors' | 'isbn13' | 'isbn10'>): BookLink[] {
  const isbn = info.isbn13 ?? info.isbn10;
  const q = encodeURIComponent(isbn ?? [info.title, info.authors[0]].filter(Boolean).join(' '));
  const qText = encodeURIComponent([info.title, info.authors[0]].filter(Boolean).join(' '));
  return [
    { kind: 'buy', label: 'Amazon', url: `https://www.amazon.com.br/s?k=${q}&i=stripbooks` },
    { kind: 'buy', label: 'Estante Virtual (sebos)', url: `https://www.estantevirtual.com.br/busca?q=${qText}` },
    { kind: 'info', label: 'Pesquisar na web', url: `https://www.google.com/search?tbm=bks&q=${q}` },
  ];
}

/** Junta links sem repetir URL; leitura gratuita primeiro. */
export function mergeLinks(...lists: BookLink[][]) {
  const order: Record<BookLink['kind'], number> = { read: 0, preview: 1, info: 2, buy: 3 };
  const seen = new Set<string>();
  const out: BookLink[] = [];
  for (const l of lists.flat()) {
    if (seen.has(l.url)) continue;
    seen.add(l.url);
    out.push(l);
  }
  return out.sort((a, b) => order[a.kind] - order[b.kind]);
}
