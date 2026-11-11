import type { SearchResult } from '../types';
import { getGoogleVolume, RateLimitError, searchGoogle, type SearchField } from './googleBooks';
import { getOpenLibraryWork, searchOpenLibrary } from './openLibrary';
import { asIsbn } from './isbn';
import { mergeLinks } from './links';
import { cleanCategories, norm } from './text';

export type { SearchField };

export interface SearchOutcome {
  results: SearchResult[];
  /** Fontes que falharam (para avisar sem esconder o que deu certo). */
  failed: string[];
}

const dedupeKey = (r: SearchResult) =>
  r.isbn13 ?? `${norm(r.title)}|${norm(r.authors[0]?.split(' ').pop())}`;

/** Completa o resultado "a" com o que faltar, vindo de "b". */
export function mergeResult(a: SearchResult, b: SearchResult): SearchResult {
  return {
    ...a,
    subtitle: a.subtitle ?? b.subtitle,
    authors: a.authors.length ? a.authors : b.authors,
    publisher: a.publisher ?? b.publisher,
    year: a.year ?? b.year,
    description: a.description ?? b.description,
    categories: a.categories.length ? a.categories : b.categories,
    pageCount: a.pageCount ?? b.pageCount,
    isbn13: a.isbn13 ?? b.isbn13,
    isbn10: a.isbn10 ?? b.isbn10,
    coverUrl: a.coverUrl ?? b.coverUrl,
    coverUrlLarge: a.coverUrlLarge ?? b.coverUrlLarge,
    rating: a.rating ?? b.rating,
    ratingsCount: a.ratingsCount ?? b.ratingsCount,
    freeDigital: a.freeDigital || b.freeDigital,
    links: mergeLinks(a.links, b.links),
  };
}

/** Guarda em memoria os resultados vistos, para abrir o detalhe sem nova consulta. */
const cache = new Map<string, SearchResult>();
export const cachedResult = (key: string) => cache.get(key);
export const rememberResult = (r: SearchResult) => cache.set(r.key, r);

/**
 * Pesquisa no Google Books e no Open Library ao mesmo tempo, intercala e
 * junta duplicatas (mesmo ISBN ou mesmo titulo + autor).
 */
export async function searchBooks(
  text: string,
  field: SearchField,
  opts: { apiKey?: string; signal?: AbortSignal } = {},
): Promise<SearchOutcome> {
  let f = field;
  if (f === 'all' && asIsbn(text)) f = 'isbn';
  const q = f === 'isbn' ? asIsbn(text) ?? text : text;

  const [g, o] = await Promise.allSettled([
    searchGoogle(q, f, opts),
    searchOpenLibrary(q, f, opts),
  ]);
  if (opts.signal?.aborted) throw new DOMException('aborted', 'AbortError');

  const failed: string[] = [];
  if (g.status === 'rejected') failed.push(g.reason instanceof RateLimitError ? 'Google Books (limite de consultas)' : 'Google Books');
  if (o.status === 'rejected') failed.push('Open Library');
  const gl = g.status === 'fulfilled' ? g.value : [];
  const ol = o.status === 'fulfilled' ? o.value : [];

  const interleaved: SearchResult[] = [];
  for (let i = 0; i < Math.max(gl.length, ol.length); i++) {
    if (gl[i]) interleaved.push(gl[i]);
    if (ol[i]) interleaved.push(ol[i]);
  }
  const byKey = new Map<string, SearchResult>();
  for (const r of interleaved) {
    const k = dedupeKey(r);
    const prev = byKey.get(k);
    byKey.set(k, prev ? mergeResult(prev, r) : r);
  }
  // Livros com capa e com mais informacoes primeiro, mantendo a ordem de relevancia.
  const results = [...byKey.values()]
    .map((r, i) => ({ r, s: i - (r.coverUrl ? 6 : 0) - (r.isbn13 ? 2 : 0) }))
    .sort((a, b) => a.s - b.s)
    .map((x) => x.r);
  results.forEach(rememberResult);
  if (!results.length && failed.length === 2) throw new Error('Não foi possível consultar as fontes. Verifique a conexão.');
  return { results, failed };
}

/** Detalhe completo: busca a sinopse e, se possivel, completa com a outra fonte. */
export async function loadDetails(base: SearchResult, apiKey?: string): Promise<SearchResult> {
  let r = base;
  try {
    if (r.provider === 'google') {
      r = mergeResult(await getGoogleVolume(r.providerId, apiKey), r);
    } else {
      const w = await getOpenLibraryWork(r.providerId);
      r = { ...r, description: r.description ?? w.description, categories: r.categories.length ? r.categories : cleanCategories(w.subjects) };
    }
  } catch { /* fica com o que ja tinha */ }
  // Sem sinopse? Tenta a outra fonte pelo ISBN.
  if (!r.description && r.isbn13) {
    try {
      const other = r.provider === 'google'
        ? await searchOpenLibrary(r.isbn13, 'isbn', { max: 1 })
        : await searchGoogle(r.isbn13, 'isbn', { apiKey, max: 1 });
      if (other[0]) {
        let extra = other[0];
        if (extra.provider === 'openlibrary' && !extra.description) {
          const w = await getOpenLibraryWork(extra.providerId).catch(() => null);
          if (w?.description) extra = { ...extra, description: w.description };
        }
        r = mergeResult(r, extra);
      }
    } catch { /* ignora */ }
  }
  rememberResult(r);
  return r;
}

/** Abre um resultado pelo identificador (quando o app foi recarregado no detalhe). */
export async function resultFromKey(key: string, apiKey?: string): Promise<SearchResult | null> {
  const c = cachedResult(key);
  if (c) return c;
  const [provider, ...rest] = key.split(':');
  const id = rest.join(':');
  if (provider === 'google') return getGoogleVolume(id, apiKey).catch(() => null);
  if (provider === 'openlibrary') {
    const docs = await searchOpenLibrary(id.replace('/works/', ''), 'all', { max: 5 }).catch(() => []);
    return docs.find((d) => d.providerId === id) ?? null;
  }
  return null;
}

/** Procura por ISBN nas duas fontes e devolve o resultado mais completo. */
export async function lookupIsbn(isbn: string, apiKey?: string) {
  const { results } = await searchBooks(isbn, 'isbn', { apiKey });
  return results;
}
