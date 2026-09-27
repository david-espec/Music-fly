import { boxBlur } from './detect.ts';
import { createRaster, type FilterId, type Raster } from './types.ts';

/**
 * Filtros de documento.
 *
 * Todos, exceto o original, partem da mesma ideia: estimar a luz que cai sobre
 * o papel (o "fundo") e dividir a imagem por ela. Sombra da mao, canto mais
 * escuro, luz amarelada — tudo isso some e o papel fica branco por igual.
 */

export const FILTERS: { id: FilterId; label: string }[] = [
  { id: 'cor', label: 'Cor' },
  { id: 'cinza', label: 'Cinza' },
  { id: 'pb', label: 'P&B' },
  { id: 'original', label: 'Original' },
];

/**
 * Mapa de iluminacao, um valor por bloco: o brilho do papel ali. Usa um
 * percentil alto de cada bloco (o texto e escuro e fica de fora), depois um
 * maximo 3x3 e um desfoque para suavizar a transicao entre blocos.
 */
function backgroundMap(lum: Float32Array, w: number, h: number) {
  const block = Math.max(8, Math.round(Math.min(w, h) / 28));
  const bw = Math.ceil(w / block);
  const bh = Math.ceil(h / block);
  const map = new Float32Array(bw * bh);
  const hist = new Uint32Array(64);
  for (let by = 0; by < bh; by++) {
    for (let bx = 0; bx < bw; bx++) {
      hist.fill(0);
      let n = 0;
      for (let y = by * block; y < Math.min(h, (by + 1) * block); y += 2) {
        for (let x = bx * block; x < Math.min(w, (bx + 1) * block); x += 2) {
          hist[Math.min(63, lum[y * w + x] >> 2)]++;
          n++;
        }
      }
      // Percentil 90 do bloco.
      let acc = 0;
      let k = 63;
      for (; k > 0; k--) {
        acc += hist[k];
        if (acc >= n * 0.1) break;
      }
      map[by * bw + bx] = k * 4 + 2;
    }
  }
  const dilated = new Float32Array(map.length);
  for (let y = 0; y < bh; y++) {
    for (let x = 0; x < bw; x++) {
      let m = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx;
          const yy = y + dy;
          if (xx >= 0 && yy >= 0 && xx < bw && yy < bh) m = Math.max(m, map[yy * bw + xx]);
        }
      }
      dilated[y * bw + x] = m;
    }
  }
  const smooth = boxBlur(dilated, bw, bh, 1);
  return {
    /** Brilho do papel no pixel (x, y), por interpolacao bilinear entre blocos. */
    at(x: number, y: number) {
      const fx = Math.min(bw - 1, Math.max(0, (x + 0.5) / block - 0.5));
      const fy = Math.min(bh - 1, Math.max(0, (y + 0.5) / block - 0.5));
      const x0 = fx | 0;
      const y0 = fy | 0;
      const x1 = Math.min(bw - 1, x0 + 1);
      const y1 = Math.min(bh - 1, y0 + 1);
      const tx = fx - x0;
      const ty = fy - y0;
      const a = smooth[y0 * bw + x0] + (smooth[y0 * bw + x1] - smooth[y0 * bw + x0]) * tx;
      const b = smooth[y1 * bw + x0] + (smooth[y1 * bw + x1] - smooth[y1 * bw + x0]) * tx;
      return Math.max(40, a + (b - a) * ty);
    },
  };
}

const clamp255 = (v: number) => (v < 0 ? 0 : v > 255 ? 255 : v);

/** Curva de niveis: tudo abaixo de `black` vira preto, e o papel encosta no branco. */
function levels(v: number, black: number, white = 238) {
  return clamp255(((v - black) / (white - black)) * 255);
}

export function applyFilter(src: Raster, filter: FilterId): Raster {
  if (filter === 'original') return src;
  const { width: w, height: h } = src;
  const s = src.data;
  const lum = new Float32Array(w * h);
  for (let i = 0, j = 0; j < lum.length; i += 4, j++) lum[j] = 0.299 * s[i] + 0.587 * s[i + 1] + 0.114 * s[i + 2];
  const bg = backgroundMap(lum, w, h);
  const out = createRaster(w, h);
  const o = out.data;

  if (filter === 'cor') {
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        const k = 245 / bg.at(x, y);
        let r = levels(s[i] * k, 25);
        let g = levels(s[i + 1] * k, 25);
        let b = levels(s[i + 2] * k, 25);
        // Um pouco mais de saturacao: carimbos e marca-texto continuam vivos.
        const l = 0.299 * r + 0.587 * g + 0.114 * b;
        r = clamp255(l + (r - l) * 1.25);
        g = clamp255(l + (g - l) * 1.25);
        b = clamp255(l + (b - l) * 1.25);
        o[i] = r;
        o[i + 1] = g;
        o[i + 2] = b;
        o[i + 3] = 255;
      }
    }
    return out;
  }

  const norm = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) norm[y * w + x] = clamp255((lum[y * w + x] * 245) / bg.at(x, y));
  }

  if (filter === 'cinza') {
    for (let j = 0, i = 0; j < norm.length; j++, i += 4) {
      const v = levels(norm[j], 35);
      o[i] = o[i + 1] = o[i + 2] = v;
      o[i + 3] = 255;
    }
    return out;
  }

  // P&B: limiar adaptativo (Bradley) sobre a imagem ja sem sombra. A media
  // local vem de um desfoque largo; a borda da letra ganha uma rampa curta
  // em vez de degrau seco, o que deixa o texto legivel sem serrilhado.
  const radius = Math.max(4, Math.round(Math.min(w, h) / 40));
  const mean = boxBlur(norm, w, h, radius);
  for (let j = 0, i = 0; j < norm.length; j++, i += 4) {
    const t = Math.min(mean[j] * 0.86, 200);
    const v = clamp255(((norm[j] - (t - 14)) / 28) * 255);
    o[i] = o[i + 1] = o[i + 2] = v;
    o[i + 3] = 255;
  }
  return out;
}
