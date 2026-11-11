import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { Book, Settings } from '../types';

interface LiberyDB extends DBSchema {
  books: { key: string; value: Book; indexes: { byUpdated: number } };
  /** Imagens (capas e foto de perfil) guardadas como Blob. */
  images: { key: string; value: { id: string; blob: Blob; createdAt: number } };
  meta: { key: string; value: unknown };
}

let dbp: Promise<IDBPDatabase<LiberyDB>> | null = null;

export function db() {
  if (!dbp) {
    dbp = openDB<LiberyDB>('d-libery', 1, {
      upgrade(d) {
        const books = d.createObjectStore('books', { keyPath: 'id' });
        books.createIndex('byUpdated', 'updatedAt');
        d.createObjectStore('images', { keyPath: 'id' });
        d.createObjectStore('meta');
      },
    });
  }
  return dbp;
}

export const uid = (): string =>
  (crypto.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`);

export async function getAllBooks() {
  return (await db()).getAll('books');
}
export async function putBook(book: Book) {
  await (await db()).put('books', book);
}
export async function deleteBook(id: string) {
  await (await db()).delete('books', id);
}

export async function putImage(blob: Blob, id = uid()) {
  await (await db()).put('images', { id, blob, createdAt: Date.now() });
  return id;
}
export async function getImage(id: string) {
  return (await (await db()).get('images', id))?.blob;
}
export async function deleteImage(id: string) {
  await (await db()).delete('images', id);
}
export async function getAllImages() {
  return (await db()).getAll('images');
}

export async function getSettings(): Promise<Partial<Settings> | undefined> {
  return (await (await db()).get('meta', 'settings')) as Partial<Settings> | undefined;
}
export async function putSettings(s: Settings) {
  await (await db()).put('meta', s, 'settings');
}

export async function clearAll() {
  const d = await db();
  await Promise.all([d.clear('books'), d.clear('images'), d.clear('meta')]);
}
