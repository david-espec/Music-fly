/** Carrega um Blob/File como imagem decodificada. */
export async function loadBitmap(src: Blob): Promise<ImageBitmap | HTMLImageElement> {
  if ('createImageBitmap' in window) {
    try { return await createImageBitmap(src, { imageOrientation: 'from-image' }); } catch { /* cai no <img> */ }
  }
  const url = URL.createObjectURL(src);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return img;
  } finally {
    URL.revokeObjectURL(url);
  }
}

type Drawable = ImageBitmap | HTMLImageElement | HTMLVideoElement | HTMLCanvasElement;

const dims = (d: Drawable) =>
  d instanceof HTMLVideoElement ? { w: d.videoWidth, h: d.videoHeight }
  : d instanceof HTMLImageElement ? { w: d.naturalWidth, h: d.naturalHeight }
  : { w: d.width, h: d.height };

/** Desenha num canvas limitado a maxSide, opcionalmente recortando (crop em fracoes 0..1). */
export function toCanvas(d: Drawable, maxSide: number, crop?: { x: number; y: number; w: number; h: number }) {
  const { w, h } = dims(d);
  const c = crop ?? { x: 0, y: 0, w: 1, h: 1 };
  const sw = w * c.w, sh = h * c.h;
  const scale = Math.min(1, maxSide / Math.max(sw, sh));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(sw * scale);
  canvas.height = Math.round(sh * scale);
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(d, w * c.x, h * c.y, sw, sh, 0, 0, canvas.width, canvas.height);
  return canvas;
}

export const canvasToBlob = (c: HTMLCanvasElement, type = 'image/jpeg', q = 0.86) =>
  new Promise<Blob>((ok, fail) => c.toBlob((b) => (b ? ok(b) : fail(new Error('Falha ao gerar imagem'))), type, q));

/** Reduz uma foto para guardar como capa (ate 900px no lado maior). */
export async function compressCover(src: Blob, maxSide = 900) {
  const bmp = await loadBitmap(src);
  return canvasToBlob(toCanvas(bmp, maxSide));
}

/**
 * Baixa a capa de um resultado para guardar no aparelho. Algumas fontes nao
 * liberam CORS; nesse caso devolve null e o app guarda so a URL.
 */
export async function downloadCover(urls: (string | undefined)[]): Promise<Blob | null> {
  for (const url of urls) {
    if (!url) continue;
    try {
      const res = await fetch(url, { mode: 'cors' });
      if (!res.ok) continue;
      const blob = await res.blob();
      // Placeholders "imagem indisponivel" costumam ser minusculos.
      if (!blob.type.startsWith('image/') || blob.size < 1500) continue;
      return blob;
    } catch { /* tenta a proxima */ }
  }
  return null;
}
