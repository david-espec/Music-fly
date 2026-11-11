import * as store from './db';
import { isNative } from './native';
import type { Book, Settings } from '../types';

interface BackupFile {
  app: 'd-libery';
  version: 1;
  exportedAt: string;
  settings?: Partial<Settings>;
  books: Book[];
  images: { id: string; type: string; data: string }[];
}

const toBase64 = (blob: Blob) =>
  new Promise<string>((ok, fail) => {
    const r = new FileReader();
    r.onload = () => ok(String(r.result).split(',')[1] ?? '');
    r.onerror = () => fail(r.error);
    r.readAsDataURL(blob);
  });

const fromBase64 = (data: string, type: string) => {
  const bin = atob(data);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type });
};

/** Gera um arquivo .json com toda a estante, incluindo as capas. */
export async function exportBackup() {
  const [books, images, settings] = await Promise.all([store.getAllBooks(), store.getAllImages(), store.getSettings()]);
  const file: BackupFile = {
    app: 'd-libery',
    version: 1,
    exportedAt: new Date().toISOString(),
    settings: settings ? { ...settings, googleApiKey: '' } : undefined,
    books,
    images: await Promise.all(images.map(async (i) => ({ id: i.id, type: i.blob.type, data: await toBase64(i.blob) }))),
  };
  const json = JSON.stringify(file);
  const name = `d-libery-backup-${new Date().toISOString().slice(0, 10)}.json`;
  if (isNative()) {
    // No APK nao ha "download": grava na pasta Documentos do celular.
    const { Filesystem, Directory, Encoding } = await import('@capacitor/filesystem');
    await Filesystem.writeFile({ path: name, data: json, directory: Directory.Documents, encoding: Encoding.UTF8 });
    return { count: books.length, where: `Documentos/${name}` };
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  return { count: books.length, where: 'Downloads' };
}

/** Restaura um backup, somando a estante atual (livros com mesmo id sao substituidos). */
export async function importBackup(file: File) {
  const json = JSON.parse(await file.text()) as BackupFile;
  if (json.app !== 'd-libery' || !Array.isArray(json.books)) throw new Error('Arquivo de backup inválido');
  for (const img of json.images ?? []) await store.putImage(fromBase64(img.data, img.type), img.id);
  for (const b of json.books) await store.putBook(b);
  if (json.settings) {
    const cur = await store.getSettings();
    await store.putSettings({ ...(json.settings as Settings), googleApiKey: cur?.googleApiKey ?? '', onboarded: true });
  }
  return json.books.length;
}
