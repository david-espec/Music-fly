import { convexHull, isConvex, largestQuadInHull, polygonArea } from './geometry.ts';
import type { Point, Quad, Raster } from './types.ts';

/**
 * Deteccao da folha na foto, sem OpenCV.
 *
 * Duas hipoteses sao geradas e a que tiver mais borda de verdade por baixo dos
 * quatro lados vence:
 *
 *  - Limiar: a folha costuma ser mais clara que a mesa. Otsu separa claro de
 *    escuro e a maior mancha clara vira candidata.
 *  - Contorno: gradiente (Sobel) marca as bordas; inundando a imagem a partir
 *    das margens, o que nao e alcancado esta cercado por borda — a folha, se o
 *    contorno dela estiver fechado. Cobre folha branca em mesa branca.
 *
 * De cada mancha sai a envoltoria convexa e, dela, o quadrilatero de maior
 * area. O resultado vem em coordenadas normalizadas (0..1).
 */

/** Maior lado da imagem usada na deteccao. Pequena de proposito: roda a cada quadro da camera. */
export const DETECT_SIZE = 320;

export interface Detection {
  quad: Quad;
  /** 0..1: quanto os lados coincidem com bordas reais da imagem. */
  score: number;
}

export function toGray(r: Raster): Float32Array {
  const g = new Float32Array(r.width * r.height);
  const d = r.data;
  for (let i = 0, j = 0; j < g.length; i += 4, j++) {
    g[j] = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
  }
  return g;
}

/** Desfoque de caixa separavel. */
export function boxBlur(src: Float32Array, w: number, h: number, radius: number): Float32Array {
  const tmp = new Float32Array(src.length);
  const out = new Float32Array(src.length);
  const span = radius * 2 + 1;
  for (let y = 0; y < h; y++) {
    let acc = 0;
    const row = y * w;
    for (let x = -radius; x <= radius; x++) acc += src[row + Math.min(w - 1, Math.max(0, x))];
    for (let x = 0; x < w; x++) {
      tmp[row + x] = acc / span;
      acc += src[row + Math.min(w - 1, x + radius + 1)] - src[row + Math.max(0, x - radius)];
    }
  }
  for (let x = 0; x < w; x++) {
    let acc = 0;
    for (let y = -radius; y <= radius; y++) acc += tmp[Math.min(h - 1, Math.max(0, y)) * w + x];
    for (let y = 0; y < h; y++) {
      out[y * w + x] = acc / span;
      acc += tmp[Math.min(h - 1, y + radius + 1) * w + x] - tmp[Math.max(0, y - radius) * w + x];
    }
  }
  return out;
}

export function otsu(gray: Float32Array): number {
  const hist = new Array<number>(256).fill(0);
  for (let i = 0; i < gray.length; i++) hist[Math.max(0, Math.min(255, gray[i] | 0))]++;
  const total = gray.length;
  let sum = 0;
  for (let i = 0; i < 256; i++) sum += i * hist[i];
  let sumB = 0;
  let wB = 0;
  let best = 0;
  let threshold = 128;
  for (let t = 0; t < 256; t++) {
    wB += hist[t];
    if (wB === 0) continue;
    const wF = total - wB;
    if (wF === 0) break;
    sumB += t * hist[t];
    const mB = sumB / wB;
    const mF = (sum - sumB) / wF;
    const between = wB * wF * (mB - mF) * (mB - mF);
    if (between > best) {
      best = between;
      threshold = t;
    }
  }
  return threshold;
}

export function sobel(gray: Float32Array, w: number, h: number): Float32Array {
  const mag = new Float32Array(gray.length);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const gx =
        -gray[i - w - 1] - 2 * gray[i - 1] - gray[i + w - 1] + gray[i - w + 1] + 2 * gray[i + 1] + gray[i + w + 1];
      const gy =
        -gray[i - w - 1] - 2 * gray[i - w] - gray[i - w + 1] + gray[i + w - 1] + 2 * gray[i + w] + gray[i + w + 1];
      mag[i] = Math.hypot(gx, gy);
    }
  }
  return mag;
}

interface Component {
  /** Pixels da mancha. */
  size: number;
  /** Para cada linha tocada, o x minimo e o maximo — basta para a envoltoria convexa. */
  spans: Map<number, [number, number]>;
}

/** Maior componente 4-conexa dos pixels marcados em `mask`. */
function largestComponent(mask: Uint8Array, w: number, h: number): Component | null {
  const label = new Int32Array(mask.length);
  const queue = new Int32Array(mask.length);
  let best: Component | null = null;
  let next = 1;
  for (let start = 0; start < mask.length; start++) {
    if (!mask[start] || label[start]) continue;
    const id = next++;
    let head = 0;
    let tail = 0;
    queue[tail++] = start;
    label[start] = id;
    const spans = new Map<number, [number, number]>();
    while (head < tail) {
      const i = queue[head++];
      const x = i % w;
      const y = (i - x) / w;
      const s = spans.get(y);
      if (!s) spans.set(y, [x, x]);
      else {
        if (x < s[0]) s[0] = x;
        if (x > s[1]) s[1] = x;
      }
      if (x > 0 && mask[i - 1] && !label[i - 1]) (label[i - 1] = id), (queue[tail++] = i - 1);
      if (x < w - 1 && mask[i + 1] && !label[i + 1]) (label[i + 1] = id), (queue[tail++] = i + 1);
      if (y > 0 && mask[i - w] && !label[i - w]) (label[i - w] = id), (queue[tail++] = i - w);
      if (y < h - 1 && mask[i + w] && !label[i + w]) (label[i + w] = id), (queue[tail++] = i + w);
    }
    if (!best || tail > best.size) best = { size: tail, spans };
  }
  return best;
}

/** Transforma uma mancha no melhor quadrilatero (em pixels), ou nada se ela nao parecer uma folha. */
function componentToQuad(c: Component, w: number, h: number): Quad | null {
  const imageArea = w * h;
  if (c.size < imageArea * 0.08) return null;
  const pts: Point[] = [];
  for (const [y, [x0, x1]] of c.spans) {
    pts.push({ x: x0, y }, { x: x1 + 1, y }, { x: x0, y: y + 1 }, { x: x1 + 1, y: y + 1 });
  }
  const hull = convexHull(pts);
  const hullArea = Math.abs(polygonArea(hull));
  const quad = largestQuadInHull(hull);
  if (!quad || !isConvex(quad)) return null;
  const quadArea = Math.abs(polygonArea(quad));
  // A forma precisa ser quase um quadrilatero e ocupar boa parte da foto.
  if (quadArea < imageArea * 0.1 || quadArea > imageArea * 0.995) return null;
  if (quadArea / hullArea < 0.85) return null;
  if (c.size / hullArea < 0.5) return null;
  return quad;
}

/**
 * Media do gradiente ao longo dos lados. Lado colado na margem da foto (folha
 * cortada pelo enquadramento) conta como neutro, ja que ali nao ha borda para ver.
 */
function edgeSupport(q: Quad, mag: Float32Array, w: number, h: number, magScale: number): number {
  let total = 0;
  for (let s = 0; s < 4; s++) {
    const a = q[s];
    const b = q[(s + 1) % 4];
    const onBorder = (p: Point) => p.x <= 2 || p.y <= 2 || p.x >= w - 3 || p.y >= h - 3;
    if (onBorder(a) && onBorder(b)) {
      total += 0.5;
      continue;
    }
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    const steps = Math.max(8, Math.round(len));
    let acc = 0;
    let hits = 0;
    for (let k = 1; k < steps; k++) {
      const t = k / steps;
      const x = a.x + (b.x - a.x) * t;
      const y = a.y + (b.y - a.y) * t;
      // Maximo numa janela 3x3: a borda pode estar a um pixel do lado estimado.
      let m = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const xi = Math.round(x) + dx;
          const yi = Math.round(y) + dy;
          if (xi < 0 || yi < 0 || xi >= w || yi >= h) continue;
          m = Math.max(m, mag[yi * w + xi]);
        }
      }
      acc += Math.min(1, m / magScale);
      if (m > magScale * 0.5) hits++;
    }
    total += 0.5 * (acc / (steps - 1)) + 0.5 * (hits / (steps - 1));
  }
  return total / 4;
}

export function detectDocument(r: Raster): Detection | null {
  const { width: w, height: h } = r;
  if (w < 16 || h < 16) return null;
  const gray = boxBlur(toGray(r), w, h, 1);
  const mag = sobel(gray, w, h);

  // Escala do gradiente: o percentil 95, para nao depender do contraste da foto.
  const sortedMag = Float32Array.from(mag).sort();
  const p95 = sortedMag[Math.floor(sortedMag.length * 0.95)];
  const magScale = Math.max(40, p95);

  const candidates: Quad[] = [];

  // Hipotese 1: limiar de Otsu, mancha clara.
  const t = otsu(gray);
  const bright = new Uint8Array(w * h);
  for (let i = 0; i < gray.length; i++) bright[i] = gray[i] > t ? 1 : 0;
  const c1 = largestComponent(bright, w, h);
  const q1 = c1 && componentToQuad(c1, w, h);
  if (q1) candidates.push(q1);

  // Hipotese 2: regiao cercada por bordas.
  const edgeT = Math.max(30, sortedMag[Math.floor(sortedMag.length * 0.85)]);
  const edge = new Uint8Array(w * h);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      if (mag[i] < edgeT) continue;
      // Dilatacao 3x3 fecha falhas pequenas no contorno.
      edge[i] = edge[i - 1] = edge[i + 1] = edge[i - w] = edge[i + w] = 1;
    }
  }
  const outside = new Uint8Array(w * h);
  const queue = new Int32Array(w * h);
  let tail = 0;
  const seed = (i: number) => {
    if (!edge[i] && !outside[i]) (outside[i] = 1), (queue[tail++] = i);
  };
  for (let x = 0; x < w; x++) seed(x), seed((h - 1) * w + x);
  for (let y = 0; y < h; y++) seed(y * w), seed(y * w + w - 1);
  for (let head = 0; head < tail; head++) {
    const i = queue[head];
    const x = i % w;
    if (x > 0) seed(i - 1);
    if (x < w - 1) seed(i + 1);
    if (i >= w) seed(i - w);
    if (i < w * (h - 1)) seed(i + w);
  }
  const enclosed = new Uint8Array(w * h);
  for (let i = 0; i < enclosed.length; i++) enclosed[i] = outside[i] ? 0 : 1;
  const c2 = largestComponent(enclosed, w, h);
  const q2 = c2 && componentToQuad(c2, w, h);
  if (q2) candidates.push(q2);

  let best: Detection | null = null;
  for (const q of candidates) {
    const score = edgeSupport(q, mag, w, h, magScale);
    if (!best || score > best.score) best = { quad: q, score };
  }
  if (!best || best.score < 0.35) return null;
  return {
    score: best.score,
    quad: best.quad.map((p) => ({ x: p.x / w, y: p.y / h })) as Quad,
  };
}
