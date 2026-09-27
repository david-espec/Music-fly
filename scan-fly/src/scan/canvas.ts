import type { Raster, Rotation } from './types.ts';

/**
 * Ponte entre Blob/ImageBitmap e Raster. Funciona tanto na janela quanto no
 * worker: prefere OffscreenCanvas e cai para <canvas> quando ele nao existe.
 */

type AnyCanvas = OffscreenCanvas | HTMLCanvasElement;

function makeCanvas(w: number, h: number): AnyCanvas {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

function ctx2d(c: AnyCanvas) {
  const ctx = c.getContext('2d', { willReadFrequently: true }) as
    | OffscreenCanvasRenderingContext2D
    | CanvasRenderingContext2D
    | null;
  if (!ctx) throw new Error('Canvas 2D indisponivel.');
  return ctx;
}

export async function decode(blob: Blob): Promise<ImageBitmap> {
  return createImageBitmap(blob, { imageOrientation: 'from-image' });
}

/** Desenha uma imagem reduzida para caber em `maxSide` e devolve os pixels. */
export function rasterFrom(
  source: CanvasImageSource & { width: number; height: number },
  maxSide = Infinity,
  srcW = source.width,
  srcH = source.height,
): Raster {
  const k = Math.min(1, maxSide / Math.max(srcW, srcH));
  const w = Math.max(1, Math.round(srcW * k));
  const h = Math.max(1, Math.round(srcH * k));
  const c = makeCanvas(w, h);
  const ctx = ctx2d(c);
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(source, 0, 0, w, h);
  const img = ctx.getImageData(0, 0, w, h);
  return { data: img.data, width: w, height: h };
}

export async function encodeJpeg(r: Raster, quality: number): Promise<Blob> {
  const c = makeCanvas(r.width, r.height);
  const ctx = ctx2d(c);
  ctx.putImageData(new ImageData(r.data as Uint8ClampedArray<ArrayBuffer>, r.width, r.height), 0, 0);
  if ('convertToBlob' in c) return c.convertToBlob({ type: 'image/jpeg', quality });
  return new Promise((resolve, reject) =>
    c.toBlob((b) => (b ? resolve(b) : reject(new Error('Falha ao gerar JPEG.'))), 'image/jpeg', quality),
  );
}

/** Reencoda uma foto ja girada conforme o EXIF, limitada a `maxSide`. */
export async function normalizePhoto(blob: Blob, maxSide: number, quality: number) {
  const bmp = await decode(blob);
  try {
    const r = rasterFrom(bmp, maxSide);
    return { blob: await encodeJpeg(r, quality), width: r.width, height: r.height };
  } finally {
    bmp.close();
  }
}

export const nextRotation = (r: Rotation, dir: 1 | -1): Rotation => (((r + 90 * dir + 360) % 360) as Rotation);
