import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { FilterId, Quad, Rotation } from './scan/types.ts';

/**
 * Tudo fica no IndexedDB do aparelho: documentos, a foto original de cada
 * pagina (para dar para recortar de novo) e a versao processada.
 */

export interface DocRecord {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  pageIds: string[];
}

export interface PageRecord {
  id: string;
  docId: string;
  createdAt: number;
  /** Foto como veio da camera, ja na orientacao certa. */
  original: Blob;
  originalWidth: number;
  originalHeight: number;
  quad: Quad;
  rotation: Rotation;
  filter: FilterId;
  processed: Blob;
  thumb: Blob;
  width: number;
  height: number;
}

interface ScanDB extends DBSchema {
  docs: { key: string; value: DocRecord; indexes: { byUpdated: number } };
  pages: { key: string; value: PageRecord; indexes: { byDoc: string } };
}

let dbp: Promise<IDBPDatabase<ScanDB>> | null = null;

function db() {
  dbp ??= openDB<ScanDB>('scan-fly', 1, {
    upgrade(d) {
      const docs = d.createObjectStore('docs', { keyPath: 'id' });
      docs.createIndex('byUpdated', 'updatedAt');
      const pages = d.createObjectStore('pages', { keyPath: 'id' });
      pages.createIndex('byDoc', 'docId');
    },
  });
  return dbp;
}

/** Aviso simples de "algo mudou", para as telas recarregarem. */
const listeners = new Set<() => void>();
export function onChange(fn: () => void) {
  listeners.add(fn);
  return () => void listeners.delete(fn);
}
const emit = () => listeners.forEach((fn) => fn());

export const newId = () => crypto.randomUUID();

export function defaultDocName(d = new Date()) {
  const p = (n: number) => String(n).padStart(2, '0');
  return `Digitalização ${p(d.getDate())}-${p(d.getMonth() + 1)}-${d.getFullYear()} ${p(d.getHours())}h${p(d.getMinutes())}`;
}

export async function listDocs(): Promise<DocRecord[]> {
  const all = await (await db()).getAllFromIndex('docs', 'byUpdated');
  return all.reverse();
}

export const getDoc = async (id: string) => (await db()).get('docs', id);
export const getPage = async (id: string) => (await db()).get('pages', id);

export async function getPages(doc: DocRecord): Promise<PageRecord[]> {
  const d = await db();
  const pages = await Promise.all(doc.pageIds.map((id) => d.get('pages', id)));
  return pages.filter((p): p is PageRecord => !!p);
}

export async function createDoc(name = defaultDocName()): Promise<DocRecord> {
  const now = Date.now();
  const doc: DocRecord = { id: newId(), name, createdAt: now, updatedAt: now, pageIds: [] };
  await (await db()).put('docs', doc);
  emit();
  return doc;
}

export async function updateDoc(id: string, patch: Partial<Omit<DocRecord, 'id'>>) {
  const d = await db();
  const tx = d.transaction('docs', 'readwrite');
  const doc = await tx.store.get(id);
  if (!doc) return;
  await tx.store.put({ ...doc, ...patch, updatedAt: Date.now() });
  await tx.done;
  emit();
}

export async function addPages(docId: string, pages: PageRecord[], at?: number) {
  const d = await db();
  const tx = d.transaction(['docs', 'pages'], 'readwrite');
  const doc = await tx.objectStore('docs').get(docId);
  if (!doc) throw new Error('Documento nao existe mais.');
  for (const p of pages) await tx.objectStore('pages').put(p);
  const ids = doc.pageIds.slice();
  ids.splice(at ?? ids.length, 0, ...pages.map((p) => p.id));
  await tx.objectStore('docs').put({ ...doc, pageIds: ids, updatedAt: Date.now() });
  await tx.done;
  emit();
}

export async function savePage(page: PageRecord) {
  const d = await db();
  const tx = d.transaction(['docs', 'pages'], 'readwrite');
  await tx.objectStore('pages').put(page);
  const doc = await tx.objectStore('docs').get(page.docId);
  if (doc) await tx.objectStore('docs').put({ ...doc, updatedAt: Date.now() });
  await tx.done;
  emit();
}

export async function deletePage(page: PageRecord) {
  const d = await db();
  const tx = d.transaction(['docs', 'pages'], 'readwrite');
  await tx.objectStore('pages').delete(page.id);
  const doc = await tx.objectStore('docs').get(page.docId);
  if (doc) {
    await tx.objectStore('docs').put({
      ...doc,
      pageIds: doc.pageIds.filter((id) => id !== page.id),
      updatedAt: Date.now(),
    });
  }
  await tx.done;
  emit();
}

export async function deleteDoc(id: string) {
  const d = await db();
  const tx = d.transaction(['docs', 'pages'], 'readwrite');
  const doc = await tx.objectStore('docs').get(id);
  if (doc) for (const pid of doc.pageIds) await tx.objectStore('pages').delete(pid);
  await tx.objectStore('docs').delete(id);
  await tx.done;
  emit();
}

/** Junta varios documentos no primeiro da lista, na ordem dada. */
export async function mergeDocs(ids: string[], name: string) {
  const d = await db();
  const tx = d.transaction(['docs', 'pages'], 'readwrite');
  const docs = (await Promise.all(ids.map((id) => tx.objectStore('docs').get(id)))).filter(
    (x): x is DocRecord => !!x,
  );
  if (docs.length < 2) return;
  const [target, ...rest] = docs;
  const pageIds = docs.flatMap((x) => x.pageIds);
  for (const other of rest) {
    for (const pid of other.pageIds) {
      const p = await tx.objectStore('pages').get(pid);
      if (p) await tx.objectStore('pages').put({ ...p, docId: target.id });
    }
    await tx.objectStore('docs').delete(other.id);
  }
  await tx.objectStore('docs').put({ ...target, name, pageIds, updatedAt: Date.now() });
  await tx.done;
  emit();
  return target.id;
}
