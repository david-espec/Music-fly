import type { BookLink, SearchResult } from '../types';
import { cleanCategories, stripHtml, yearOf } from './text';

const API = 'https://www.googleapis.com/books/v1/volumes';

export type SearchField = 'all' | 'title' | 'author' | 'isbn' | 'publisher' | 'subject';

/* Formato (parcial) da resposta da API. */
interface GVolume {
  id: string;
  volumeInfo: {
    title?: string;
    subtitle?: string;
    authors?: string[];
    publisher?: string;
    publishedDate?: string;
    description?: string;
    industryIdentifiers?: { type: string; identifier: string }[];
    pageCount?: number;
    categories?: string[];
    averageRating?: number;
    ratingsCount?: number;
    imageLinks?: Record<string, string>;
    language?: string;
    previewLink?: string;
    infoLink?: string;
    canonicalVolumeLink?: string;
  };
  saleInfo?: { saleability?: string; buyLink?: string };
  accessInfo?: {
    viewability?: string;
    publicDomain?: boolean;
    webReaderLink?: string;
    epub?: { isAvailable?: boolean; downloadLink?: string };
    pdf?: { isAvailable?: boolean; downloadLink?: string };
  };
}

const https = (u?: string) => u?.replace(/^http:/, 'https:');

function coverUrls(links?: Record<string, string>) {
  const base = https(links?.thumbnail ?? links?.smallThumbnail);
  if (!base) return {};
  const clean = base.replace('&edge=curl', '');
  const big = https(links?.large ?? links?.medium ?? links?.small);
  return { coverUrl: clean, coverUrlLarge: big ?? clean.replace(/&zoom=\d/, '') + '&fife=w600-h900' };
}

export function fromVolume(v: GVolume): SearchResult {
  const i = v.volumeInfo;
  const ids = i.industryIdentifiers ?? [];
  const isbn13 = ids.find((x) => x.type === 'ISBN_13')?.identifier;
  const isbn10 = ids.find((x) => x.type === 'ISBN_10')?.identifier;
  const a = v.accessInfo ?? {};
  const links: BookLink[] = [];
  const full = a.viewability === 'ALL_PAGES' || a.publicDomain;
  if (full && a.webReaderLink) links.push({ kind: 'read', label: 'Ler grátis no Google Books', url: https(a.webReaderLink)! });
  if (a.publicDomain && a.epub?.downloadLink) links.push({ kind: 'read', label: 'Baixar EPUB (domínio público)', url: https(a.epub.downloadLink)! });
  if (a.publicDomain && a.pdf?.downloadLink) links.push({ kind: 'read', label: 'Baixar PDF (domínio público)', url: https(a.pdf.downloadLink)! });
  if (!full && a.viewability === 'PARTIAL' && i.previewLink) links.push({ kind: 'preview', label: 'Prévia no Google Books', url: https(i.previewLink)! });
  if (v.saleInfo?.saleability === 'FOR_SALE' && v.saleInfo.buyLink)
    links.push({ kind: 'buy', label: 'Comprar e-book (Google Play)', url: https(v.saleInfo.buyLink)! });
  const info = https(i.canonicalVolumeLink ?? i.infoLink);
  if (info) links.push({ kind: 'info', label: 'Ficha no Google Books', url: info });

  return {
    key: `google:${v.id}`,
    provider: 'google',
    providerId: v.id,
    title: i.title ?? 'Sem título',
    subtitle: i.subtitle,
    authors: i.authors ?? [],
    publisher: i.publisher,
    year: yearOf(i.publishedDate),
    description: stripHtml(i.description),
    categories: cleanCategories(i.categories),
    pageCount: i.pageCount || undefined,
    isbn13,
    isbn10,
    language: i.language,
    links,
    rating: i.averageRating,
    ratingsCount: i.ratingsCount,
    freeDigital: !!full,
    ...coverUrls(i.imageLinks),
  };
}

function buildQuery(text: string, field: SearchField) {
  const t = text.trim();
  switch (field) {
    case 'title': return `intitle:${t}`;
    case 'author': return `inauthor:${t}`;
    case 'isbn': return `isbn:${t.replace(/[^0-9Xx]/g, '')}`;
    case 'publisher': return `inpublisher:${t}`;
    case 'subject': return `subject:${t}`;
    default: return t;
  }
}

export class RateLimitError extends Error {}

export async function searchGoogle(text: string, field: SearchField, opts: { apiKey?: string; signal?: AbortSignal; max?: number } = {}) {
  const p = new URLSearchParams({
    q: buildQuery(text, field),
    maxResults: String(opts.max ?? 24),
    printType: 'books',
  });
  if (opts.apiKey) p.set('key', opts.apiKey);
  const res = await fetch(`${API}?${p}`, { signal: opts.signal });
  if (res.status === 429) throw new RateLimitError('Limite de consultas do Google Books atingido');
  if (!res.ok) throw new Error(`Google Books: ${res.status}`);
  const json = (await res.json()) as { items?: GVolume[] };
  return (json.items ?? []).map(fromVolume);
}

/** Detalhe de um volume (traz a sinopse completa e capas maiores). */
export async function getGoogleVolume(id: string, apiKey?: string) {
  const p = apiKey ? `?key=${encodeURIComponent(apiKey)}` : '';
  const res = await fetch(`${API}/${encodeURIComponent(id)}${p}`);
  if (!res.ok) throw new Error(`Google Books: ${res.status}`);
  return fromVolume((await res.json()) as GVolume);
}
