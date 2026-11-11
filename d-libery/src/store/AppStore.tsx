import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import * as store from '../lib/db';
import { downloadCover } from '../lib/image';
import { shopLinks, mergeLinks } from '../lib/links';
import { todayIso } from '../lib/format';
import { norm } from '../lib/text';
import { DEFAULT_SETTINGS, type Book, type BookInfo, type ReadingStatus, type SearchResult, type Settings } from '../types';

export type BookPatch = Partial<Omit<Book, 'id' | 'createdAt'>>;

export interface NewBookInput extends BookInfo {
  origin: Book['origin'];
  originId?: string;
  coverBlob?: Blob | null;
  coverUrl?: string;
  status?: ReadingStatus;
  favorite?: boolean;
  rating?: number;
  notes?: string;
  pagesRead?: number;
  startedAt?: string;
  finishedAt?: string;
}

interface AppState {
  ready: boolean;
  books: Book[];
  settings: Settings;
  updateSettings(p: Partial<Settings>): Promise<void>;
  addBook(input: NewBookInput): Promise<Book>;
  addFromResult(r: SearchResult, extra?: Partial<NewBookInput>): Promise<Book>;
  updateBook(id: string, patch: BookPatch, newCover?: Blob | null): Promise<void>;
  removeBook(id: string): Promise<{ book: Book; cover?: Blob } | null>;
  restoreBook(book: Book, cover?: Blob): Promise<void>;
  toggleFavorite(id: string): Promise<void>;
  findExisting(r: Pick<SearchResult, 'isbn13' | 'title' | 'authors'> & { key?: string }): Book | undefined;
  reload(): Promise<void>;
}

const Ctx = createContext<AppState | null>(null);

export const useApp = () => {
  const c = useContext(Ctx);
  if (!c) throw new Error('useApp fora do AppProvider');
  return c;
};

/**
 * Regras de status: comecar a ler marca a data de inicio; concluir marca a
 * data de termino e completa as paginas lidas. Cada mudanca nas paginas lidas
 * entra no historico de progresso (usado nas estatisticas).
 */
function applyRules(prev: Book | null, next: Book): Book {
  const b = { ...next };
  const today = todayIso();
  if (b.status === 'reading' && !b.startedAt) b.startedAt = today;
  if (b.status === 'read') {
    if (!b.startedAt) b.startedAt = b.finishedAt ?? today;
    if (!b.finishedAt) b.finishedAt = today;
    if (b.pageCount && b.pagesRead < b.pageCount) b.pagesRead = b.pageCount;
  }
  if (b.status !== 'read' && prev?.status === 'read' && b.finishedAt === prev.finishedAt) b.finishedAt = undefined;
  if (b.pageCount) b.pagesRead = Math.min(b.pagesRead, b.pageCount);
  b.pagesRead = Math.max(0, Math.round(b.pagesRead || 0));
  if ((prev?.pagesRead ?? 0) !== b.pagesRead) {
    const log = b.progress.filter((p) => p.date !== today);
    b.progress = [...log, { date: today, pages: b.pagesRead }];
  }
  return b;
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [books, setBooks] = useState<Book[]>([]);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);

  const reload = useCallback(async () => {
    const [all, s] = await Promise.all([store.getAllBooks(), store.getSettings()]);
    setBooks(all.sort((a, b) => b.createdAt - a.createdAt));
    setSettings({ ...DEFAULT_SETTINGS, ...s });
  }, []);

  useEffect(() => {
    reload().finally(() => setReady(true));
    // Pede ao navegador para nao apagar os dados sob pressao de espaco.
    navigator.storage?.persist?.().catch(() => {});
  }, [reload]);

  const updateSettings = useCallback(async (p: Partial<Settings>) => {
    let next!: Settings;
    setSettings((s) => (next = { ...s, ...p }));
    await store.putSettings(next);
  }, []);

  const addBook = useCallback(async (input: NewBookInput) => {
    const { coverBlob, ...info } = input;
    const coverId = coverBlob ? await store.putImage(coverBlob) : undefined;
    const now = Date.now();
    const book = applyRules(null, {
      ...info,
      id: store.uid(),
      coverId,
      links: mergeLinks(info.links ?? [], shopLinks(info)),
      status: info.status ?? 'want',
      favorite: info.favorite ?? false,
      rating: info.rating ?? 0,
      notes: info.notes ?? '',
      pagesRead: info.pagesRead ?? 0,
      progress: [],
      createdAt: now,
      updatedAt: now,
    });
    await store.putBook(book);
    setBooks((bs) => [book, ...bs]);
    return book;
  }, []);

  const addFromResult = useCallback(async (r: SearchResult, extra: Partial<NewBookInput> = {}) => {
    const coverBlob = extra.coverBlob !== undefined ? extra.coverBlob : await downloadCover([r.coverUrlLarge, r.coverUrl]);
    return addBook({
      title: r.title, subtitle: r.subtitle, authors: r.authors, publisher: r.publisher, year: r.year,
      description: r.description, categories: r.categories, pageCount: r.pageCount, isbn13: r.isbn13,
      isbn10: r.isbn10, language: r.language, links: r.links,
      coverUrl: coverBlob ? undefined : r.coverUrlLarge ?? r.coverUrl,
      origin: r.provider, originId: r.providerId,
      ...extra,
      coverBlob,
    });
  }, [addBook]);

  const updateBook = useCallback(async (id: string, patch: BookPatch, newCover?: Blob | null) => {
    const prev = (await store.getAllBooks()).find((b) => b.id === id);
    if (!prev) return;
    let coverId = prev.coverId;
    let coverUrl = patch.coverUrl ?? prev.coverUrl;
    if (newCover !== undefined) {
      if (prev.coverId) await store.deleteImage(prev.coverId);
      coverId = newCover ? await store.putImage(newCover) : undefined;
      if (newCover) coverUrl = undefined;
    }
    const next = applyRules(prev, { ...prev, ...patch, coverId, coverUrl, id, updatedAt: Date.now() });
    await store.putBook(next);
    setBooks((bs) => bs.map((b) => (b.id === id ? next : b)));
  }, []);

  const removeBook = useCallback(async (id: string) => {
    const b = (await store.getAllBooks()).find((x) => x.id === id);
    if (!b) return null;
    const cover = b.coverId ? await store.getImage(b.coverId) : undefined;
    if (b.coverId) await store.deleteImage(b.coverId);
    await store.deleteBook(id);
    setBooks((bs) => bs.filter((x) => x.id !== id));
    return { book: b, cover };
  }, []);

  /** Desfaz uma remocao: devolve o livro e a capa exatamente como estavam. */
  const restoreBook = useCallback(async (book: Book, cover?: Blob) => {
    if (cover && book.coverId) await store.putImage(cover, book.coverId);
    await store.putBook(book);
    setBooks((bs) => [book, ...bs.filter((x) => x.id !== book.id)].sort((a, b) => b.createdAt - a.createdAt));
  }, []);

  const toggleFavorite = useCallback(async (id: string) => {
    const b = books.find((x) => x.id === id);
    if (b) await updateBook(id, { favorite: !b.favorite });
  }, [books, updateBook]);

  const findExisting = useCallback((r: Pick<SearchResult, 'isbn13' | 'title' | 'authors'> & { key?: string }) => {
    return books.find((b) =>
      (r.key && `${b.origin}:${b.originId}` === r.key) ||
      (r.isbn13 && b.isbn13 === r.isbn13) ||
      (norm(b.title) === norm(r.title) && norm(b.authors[0]) === norm(r.authors[0])));
  }, [books]);

  const value = useMemo<AppState>(() => ({
    ready, books, settings, updateSettings, addBook, addFromResult, updateBook, removeBook, restoreBook, toggleFavorite, findExisting, reload,
  }), [ready, books, settings, updateSettings, addBook, addFromResult, updateBook, removeBook, restoreBook, toggleFavorite, findExisting, reload]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** Rascunho passado da camera/pesquisa para o formulario de cadastro. */
export interface Draft extends Partial<NewBookInput> { photo?: Blob; fromResult?: SearchResult }
let draft: Draft | null = null;
export const setDraft = (d: Draft | null) => { draft = d; };
export const takeDraft = () => draft;
