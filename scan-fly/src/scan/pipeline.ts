import { decode, encodeJpeg, rasterFrom } from './canvas.ts';
import { DETECT_SIZE, detectDocument, type Detection } from './detect.ts';
import { applyFilter } from './filters.ts';
import type { FilterId, Quad, Raster, Rotation } from './types.ts';
import { downscale, rotateRaster, warpPerspective } from './warp.ts';

export const THUMB_SIZE = 360;

export interface ProcessRequest {
  original: Blob;
  quad: Quad;
  rotation: Rotation;
  filter: FilterId;
  quality: number;
  maxSide?: number;
}

export interface ProcessResult {
  processed: Blob;
  thumb: Blob;
  width: number;
  height: number;
}

/** Recorte, perspectiva, filtro e rotacao: da foto crua a pagina pronta. */
export async function processPage(req: ProcessRequest): Promise<ProcessResult> {
  const bmp = await decode(req.original);
  let src: Raster;
  try {
    src = rasterFrom(bmp);
  } finally {
    bmp.close();
  }
  const warped = warpPerspective(src, req.quad, req.maxSide ?? 2400);
  const filtered = applyFilter(warped, req.filter);
  const final = rotateRaster(filtered, req.rotation);
  const [processed, thumb] = await Promise.all([
    encodeJpeg(final, req.quality),
    encodeJpeg(downscale(final, THUMB_SIZE), 0.8),
  ]);
  return { processed, thumb, width: final.width, height: final.height };
}

export async function detectInBlob(blob: Blob): Promise<Detection | null> {
  const bmp = await decode(blob);
  try {
    return detectDocument(rasterFrom(bmp, DETECT_SIZE));
  } finally {
    bmp.close();
  }
}

/** Amostras pequenas de cada filtro, para a fileira de escolha. */
export async function filterPreviews(original: Blob, quad: Quad, rotation: Rotation, filters: FilterId[]) {
  const bmp = await decode(original);
  let src: Raster;
  try {
    src = rasterFrom(bmp, 900);
  } finally {
    bmp.close();
  }
  const warped = rotateRaster(downscale(warpPerspective(src, quad, 900), 220), rotation);
  const out: Partial<Record<FilterId, Blob>> = {};
  for (const f of filters) out[f] = await encodeJpeg(applyFilter(warped, f), 0.8);
  return out;
}
