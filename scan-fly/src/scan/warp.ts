import { dist, homography } from './geometry.ts';
import { createRaster, type Quad, type Raster, type Rotation } from './types.ts';

/** Fracao de cada lado descartada no recorte, para nao pegar a borda da mesa. */
export const EDGE_TRIM = 0.006;

/** Tamanho de saida que preserva a proporcao real da folha, sem ampliar alem da foto. */
export function outputSize(src: Raster, quad: Quad, maxSide: number): { width: number; height: number } {
  const px = quad.map((p) => ({ x: p.x * src.width, y: p.y * src.height }));
  const w = Math.max(dist(px[0], px[1]), dist(px[3], px[2]));
  const h = Math.max(dist(px[0], px[3]), dist(px[1], px[2]));
  const scale = Math.min(1, maxSide / Math.max(w, h));
  return { width: Math.max(1, Math.round(w * scale)), height: Math.max(1, Math.round(h * scale)) };
}

/**
 * Corrige a perspectiva: para cada pixel da saida, a homografia diz de onde
 * ler na foto, e o valor sai por interpolacao bilinear.
 */
export function warpPerspective(src: Raster, quad: Quad, maxSide = 2400): Raster {
  const { width, height } = outputSize(src, quad, maxSide);
  const out = createRaster(width, height);
  // Mapeamento continuo: o retangulo [0,W]x[0,H] da saida vai no quadrilatero.
  // Cada pixel amostra no seu centro, recuado uma fracao minima para dentro —
  // senao a primeira e a ultima linha misturam o fundo da mesa com o papel e,
  // no P&B, viram um pontilhado na borda.
  const srcPts = quad.map((p) => ({ x: p.x * src.width, y: p.y * src.height }));
  const m = EDGE_TRIM;
  const dstPts = [
    { x: 0, y: 0 },
    { x: 1, y: 0 },
    { x: 1, y: 1 },
    { x: 0, y: 1 },
  ];
  const H = homography(dstPts, srcPts);
  const kx = (1 - 2 * m) / width;
  const ky = (1 - 2 * m) / height;
  const sw = src.width;
  const sh = src.height;
  const s = src.data;
  const o = out.data;
  let oi = 0;
  for (let y = 0; y < height; y++) {
    const v = m + (y + 0.5) * ky;
    for (let x = 0; x < width; x++) {
      const u = m + (x + 0.5) * kx;
      const wz = H[6] * u + H[7] * v + H[8];
      let sx = (H[0] * u + H[1] * v + H[2]) / wz - 0.5;
      let sy = (H[3] * u + H[4] * v + H[5]) / wz - 0.5;
      if (sx < 0) sx = 0;
      else if (sx > sw - 1) sx = sw - 1;
      if (sy < 0) sy = 0;
      else if (sy > sh - 1) sy = sh - 1;
      const x0 = sx | 0;
      const y0 = sy | 0;
      const x1 = x0 < sw - 1 ? x0 + 1 : x0;
      const y1 = y0 < sh - 1 ? y0 + 1 : y0;
      const fx = sx - x0;
      const fy = sy - y0;
      const i00 = (y0 * sw + x0) * 4;
      const i10 = (y0 * sw + x1) * 4;
      const i01 = (y1 * sw + x0) * 4;
      const i11 = (y1 * sw + x1) * 4;
      for (let c = 0; c < 3; c++) {
        const top = s[i00 + c] + (s[i10 + c] - s[i00 + c]) * fx;
        const bot = s[i01 + c] + (s[i11 + c] - s[i01 + c]) * fx;
        o[oi + c] = top + (bot - top) * fy;
      }
      o[oi + 3] = 255;
      oi += 4;
    }
  }
  return out;
}

/** Gira em multiplos de 90 graus, no sentido horario. */
export function rotateRaster(src: Raster, rotation: Rotation): Raster {
  if (rotation === 0) return src;
  const { width: w, height: h } = src;
  const swap = rotation !== 180;
  const out = createRaster(swap ? h : w, swap ? w : h);
  const ow = out.width;
  const s = new Uint32Array(src.data.buffer, src.data.byteOffset, w * h);
  const o = new Uint32Array(out.data.buffer, out.data.byteOffset, out.width * out.height);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let nx: number;
      let ny: number;
      if (rotation === 90) (nx = h - 1 - y), (ny = x);
      else if (rotation === 180) (nx = w - 1 - x), (ny = h - 1 - y);
      else (nx = y), (ny = w - 1 - x);
      o[ny * ow + nx] = s[y * w + x];
    }
  }
  return out;
}

/** Reducao por media de area — boa para miniaturas e para a deteccao. */
export function downscale(src: Raster, maxSide: number): Raster {
  const scale = maxSide / Math.max(src.width, src.height);
  if (scale >= 1) return src;
  const w = Math.max(1, Math.round(src.width * scale));
  const h = Math.max(1, Math.round(src.height * scale));
  const out = createRaster(w, h);
  const fx = src.width / w;
  const fy = src.height / h;
  for (let y = 0; y < h; y++) {
    const y0 = Math.floor(y * fy);
    const y1 = Math.max(y0 + 1, Math.floor((y + 1) * fy));
    for (let x = 0; x < w; x++) {
      const x0 = Math.floor(x * fx);
      const x1 = Math.max(x0 + 1, Math.floor((x + 1) * fx));
      let r = 0;
      let g = 0;
      let b = 0;
      for (let yy = y0; yy < y1; yy++) {
        for (let xx = x0; xx < x1; xx++) {
          const i = (yy * src.width + xx) * 4;
          r += src.data[i];
          g += src.data[i + 1];
          b += src.data[i + 2];
        }
      }
      const n = (y1 - y0) * (x1 - x0);
      const o = (y * w + x) * 4;
      out.data[o] = r / n;
      out.data[o + 1] = g / n;
      out.data[o + 2] = b / n;
      out.data[o + 3] = 255;
    }
  }
  return out;
}
