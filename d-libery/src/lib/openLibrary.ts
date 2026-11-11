import type { BookLink, SearchResult } from '../types';
import type { SearchField } from './googleBooks';
import { isValidIsbn13, isbn10to13, isValidIsbn10 } from './isbn';
import { cleanCategories, yearOf } from './text';

const BASE = 'https://openlibrary.org';
const FIELDS = [
  'key', 'title', 'subtitle', 'author_name', 'first_publish_year', 'publisher', 'isbn', 'cover_i',
  'number_of_pages_median', 'subject', 'language', 'ebook_access', 'ia', 'ratings_average', 'ratings_count',
].join(',');

interface OLDoc {
  key: string;
  title?: string;
  subtitle?: string;
  author_name?: string[];
  first_publish_year?: number;
  publisher?: string[];
  isbn?: string[];
  cover_i?: number;
  number_of_pages_median?: number;
  subject?: string[];
  language?: string[];
  ebook_access?: 'no_ebook' | 'unclassified' | 'printdisabled' | 'borrowable' | 'public';
  ia?: string[];
  ratings_average?: number;
  ratings_count?: number;
}

export const olCover = (id: number, size: 'S' | 'M' | 'L') => `https://covers.openlibrary.org/b/id/${id}-${size}.jpg`;

/** Escolhe um ISBN do documento: de preferencia o pesquisado, senao um 13 valido (978/979 primeiro). */
function pickIsbn(isbns: string[] = [], wanted?: string) {
  if (wanted && isbns.includes(wanted)) return wanted;
  const thirteen = isbns.filter(isValidIsbn13);
  const br = thirteen.find((i) => i.startsWith('97885') || i.startsWith('97865'));
  if (br) return br;
  if (thirteen[0]) return thirteen[0];
  const ten = isbns.find(isValidIsbn10);
  return ten ? isbn10to13(ten) : undefined;
}

function fromDoc(d: OLDoc, wantedIsbn?: string): SearchResult {
  const links: BookLink[] = [];
  const ia = d.ia?.[0];
  if (d.ebook_access === 'public' && ia)
    links.push({ kind: 'read', label: 'Ler grátis no Internet Archive', url: `https://archive.org/details/${ia}` });
  else if (d.ebook_access === 'borrowable')
    links.push({ kind: 'read', label: 'Emprestar grátis no Open Library', url: `${BASE}${d.key}` });
  links.push({ kind: 'info', label: 'Ficha no Open Library', url: `${BASE}${d.key}` });

  return {
    key: `openlibrary:${d.key}`,
    provider: 'openlibrary',
    providerId: d.key,
    title: d.title ?? 'Sem título',
    subtitle: d.subtitle,
    authors: d.author_name ?? [],
    publisher: d.publisher?.[0],
    year: yearOf(d.first_publish_year),
    categories: cleanCategories(d.subject?.slice(0, 6)),
    pageCount: d.number_of_pages_median,
    isbn13: pickIsbn(d.isbn, wantedIsbn),
    language: d.language?.[0],
    links,
    rating: d.ratings_average ? Math.round(d.ratings_average * 10) / 10 : undefined,
    ratingsCount: d.ratings_count,
    freeDigital: d.ebook_access === 'public' || d.ebook_access === 'borrowable',
    coverUrl: d.cover_i ? olCover(d.cover_i, 'M') : undefined,
    coverUrlLarge: d.cover_i ? olCover(d.cover_i, 'L') : undefined,
  };
}

export async function searchOpenLibrary(text: string, field: SearchField, opts: { signal?: AbortSignal; max?: number } = {}) {
  const t = text.trim();
  const p = new URLSearchParams({ fields: FIELDS, limit: String(opts.max ?? 20) });
  const isbn = field === 'isbn' ? t.replace(/[^0-9Xx]/g, '') : undefined;
  const param: Record<SearchField, string> = {
    all: 'q', title: 'title', author: 'author', isbn: 'isbn', publisher: 'publisher', subject: 'subject',
  };
  p.set(param[field], isbn ?? t);
  const res = await fetch(`${BASE}/search.json?${p}`, { signal: opts.signal });
  if (!res.ok) throw new Error(`Open Library: ${res.status}`);
  const json = (await res.json()) as { docs?: OLDoc[] };
  return (json.docs ?? []).map((d) => fromDoc(d, isbn));
}

/** Sinopse e assuntos da obra (a busca nao traz a descricao). */
export async function getOpenLibraryWork(workKey: string) {
  const res = await fetch(`${BASE}${workKey}.json`);
  if (!res.ok) throw new Error(`Open Library: ${res.status}`);
  const w = (await res.json()) as { description?: string | { value: string }; subjects?: string[]; title?: string };
  const description = typeof w.description === 'string' ? w.description : w.description?.value;
  return {
    description: description?.replace(/\r\n/g, '\n').replace(/\(\[source\]\[\d+\]\)|\[\d+\]: \S+/g, '').trim(),
    subjects: w.subjects ?? [],
  };
}
