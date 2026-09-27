import { addPages, createDoc, newId, type PageRecord } from '../db.ts';
import { getPrefs, QUALITY } from '../prefs.ts';
import { normalizePhoto } from '../scan/canvas.ts';
import { defaultQuad } from '../scan/geometry.ts';
import { detectBlob, processPage } from '../scan/processor.ts';
import type { FilterId, Quad, Rotation } from '../scan/types.ts';

/** Foto pronta para recortar: orientada, reduzida e com os cantos sugeridos. */
export interface Photo {
  blob: Blob;
  width: number;
  height: number;
  quad: Quad;
  detected: boolean;
}

/** Maior lado guardado para a foto original. Acima disso so pesa, sem ganhar leitura. */
const ORIGINAL_MAX = 3200;

export async function preparePhoto(raw: Blob): Promise<Photo> {
  const photo = await normalizePhoto(raw, ORIGINAL_MAX, 0.92);
  const d = await detectBlob(photo.blob).catch(() => null);
  return { ...photo, quad: d?.quad ?? defaultQuad(), detected: !!d };
}

export async function buildPage(
  docId: string,
  photo: Photo,
  opts: { quad?: Quad; rotation?: Rotation; filter?: FilterId } = {},
): Promise<PageRecord> {
  const prefs = getPrefs();
  const q = QUALITY[prefs.quality];
  const quad = opts.quad ?? photo.quad;
  const rotation = opts.rotation ?? 0;
  const filter = opts.filter ?? prefs.defaultFilter;
  const r = await processPage({ original: photo.blob, quad, rotation, filter, quality: q.jpeg, maxSide: q.maxSide });
  return {
    id: newId(),
    docId,
    createdAt: Date.now(),
    original: photo.blob,
    originalWidth: photo.width,
    originalHeight: photo.height,
    quad,
    rotation,
    filter,
    processed: r.processed,
    thumb: r.thumb,
    width: r.width,
    height: r.height,
  };
}

/** Reprocessa uma pagina existente depois de mudar recorte, giro ou filtro. */
export async function rebuildPage(page: PageRecord, patch: Partial<Pick<PageRecord, 'quad' | 'rotation' | 'filter'>>) {
  const next = { ...page, ...patch };
  const q = QUALITY[getPrefs().quality];
  const r = await processPage({
    original: next.original,
    quad: next.quad,
    rotation: next.rotation,
    filter: next.filter,
    quality: q.jpeg,
    maxSide: q.maxSide,
  });
  return { ...next, processed: r.processed, thumb: r.thumb, width: r.width, height: r.height };
}

/**
 * Importa imagens da galeria/arquivos para um documento (novo, se nao vier
 * `docId`). Cada imagem passa pela deteccao de bordas; a pessoa pode ajustar
 * depois. Devolve o id do documento, ou nada se nenhuma imagem serviu.
 */
export async function importImages(
  files: File[],
  docId: string | undefined,
  onProgress?: (done: number, total: number) => void,
): Promise<string | undefined> {
  const images = files.filter((f) => f.type.startsWith('image/') || /\.(jpe?g|png|webp|heic|heif|gif|bmp)$/i.test(f.name));
  if (!images.length) return undefined;
  let id = docId;
  let done = 0;
  for (const f of images) {
    try {
      const photo = await preparePhoto(f);
      id ??= (await createDoc(f.name.replace(/\.[^.]+$/, '') || undefined)).id;
      await addPages(id, [await buildPage(id, photo)]);
    } catch (e) {
      console.error(`Falha ao importar ${f.name}`, e);
    }
    onProgress?.(++done, images.length);
  }
  return id;
}
