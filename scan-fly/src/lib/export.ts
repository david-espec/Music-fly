import type { DocRecord, PageRecord } from '../db.ts';
import { buildPdf, type PageSize } from '../scan/pdf.ts';
import { fileName } from './format.ts';

export async function makePdf(doc: DocRecord, pages: PageRecord[], pageSize: PageSize): Promise<File> {
  const images = await Promise.all(
    pages.map(async (p) => ({
      jpeg: new Uint8Array(await p.processed.arrayBuffer()),
      width: p.width,
      height: p.height,
    })),
  );
  const bytes = buildPdf(images, { title: doc.name, pageSize });
  return new File([bytes as Uint8Array<ArrayBuffer>], fileName(doc.name, 'pdf'), { type: 'application/pdf' });
}

export function makeJpegs(doc: DocRecord, pages: PageRecord[]): File[] {
  const pad = String(pages.length).length;
  return pages.map(
    (p, i) =>
      new File([p.processed], fileName(pages.length > 1 ? `${doc.name} ${String(i + 1).padStart(pad, '0')}` : doc.name, 'jpg'), {
        type: 'image/jpeg',
      }),
  );
}

export function canShareFiles(files: File[]): boolean {
  try {
    return typeof navigator.canShare === 'function' && navigator.canShare({ files });
  } catch {
    return false;
  }
}

/** Abre a folha de compartilhar do sistema. Devolve false se o usuario cancelou. */
export async function shareFiles(files: File[], title: string): Promise<boolean> {
  try {
    await navigator.share({ files, title });
    return true;
  } catch (e) {
    if ((e as DOMException)?.name === 'AbortError') return false;
    throw e;
  }
}

export function download(file: File) {
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = file.name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}
