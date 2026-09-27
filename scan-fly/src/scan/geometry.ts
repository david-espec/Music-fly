import type { Point, Quad } from './types.ts';

export const dist = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);

/** Area com sinal (formula do laco); positiva quando os pontos giram no sentido horario em tela. */
export function polygonArea(pts: readonly Point[]): number {
  let s = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    s += a.x * b.y - b.x * a.y;
  }
  return s / 2;
}

/**
 * Reordena quatro pontos soltos como sup-esq, sup-dir, inf-dir, inf-esq.
 * Ordena pelo angulo em torno do centroide, e roda a lista para comecar pelo
 * ponto com menor x+y.
 */
export function orderQuad(pts: readonly Point[]): Quad {
  const cx = pts.reduce((s, p) => s + p.x, 0) / pts.length;
  const cy = pts.reduce((s, p) => s + p.y, 0) / pts.length;
  const sorted = [...pts].sort(
    (a, b) => Math.atan2(a.y - cy, a.x - cx) - Math.atan2(b.y - cy, b.x - cx),
  );
  let start = 0;
  for (let i = 1; i < 4; i++) {
    if (sorted[i].x + sorted[i].y < sorted[start].x + sorted[start].y) start = i;
  }
  return [0, 1, 2, 3].map((i) => sorted[(start + i) % 4]) as Quad;
}

/** Verdadeiro se o quadrilatero e convexo e nao se cruza. */
export function isConvex(q: Quad): boolean {
  let sign = 0;
  for (let i = 0; i < 4; i++) {
    const a = q[i];
    const b = q[(i + 1) % 4];
    const c = q[(i + 2) % 4];
    const cross = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
    if (Math.abs(cross) < 1e-9) return false;
    const s = Math.sign(cross);
    if (sign === 0) sign = s;
    else if (s !== sign) return false;
  }
  return true;
}

/** Envoltoria convexa (cadeia monotona de Andrew), em ordem anti-horaria matematica. */
export function convexHull(points: Point[]): Point[] {
  if (points.length < 3) return points.slice();
  const pts = points.slice().sort((a, b) => a.x - b.x || a.y - b.y);
  const cross = (o: Point, a: Point, b: Point) =>
    (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lower: Point[] = [];
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper: Point[] = [];
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
    upper.push(p);
  }
  lower.pop();
  upper.pop();
  return lower.concat(upper);
}

/**
 * Quadrilatero de maior area com vertices na envoltoria. Comeca pelos pontos
 * extremos nas diagonais e melhora um canto por vez ate estabilizar — para as
 * envoltorias pequenas daqui (dezenas de pontos) converge em poucas voltas.
 */
export function largestQuadInHull(hull: Point[]): Quad | null {
  if (hull.length < 4) return null;
  const n = hull.length;
  const pick = (score: (p: Point) => number) => {
    let best = 0;
    for (let i = 1; i < n; i++) if (score(hull[i]) > score(hull[best])) best = i;
    return best;
  };
  let idx = [
    pick((p) => -p.x - p.y),
    pick((p) => p.x - p.y),
    pick((p) => p.x + p.y),
    pick((p) => -p.x + p.y),
  ];
  if (new Set(idx).size < 4) {
    idx = [0, Math.floor(n / 4), Math.floor(n / 2), Math.floor((3 * n) / 4)];
  }
  const area = (ids: number[]) => Math.abs(polygonArea(ids.map((i) => hull[i])));
  let bestArea = area(idx);
  for (let round = 0; round < 10; round++) {
    let improved = false;
    for (let k = 0; k < 4; k++) {
      for (let c = 0; c < n; c++) {
        if (idx.includes(c)) continue;
        const trial = idx.slice();
        trial[k] = c;
        const a = area(trial);
        if (a > bestArea + 1e-9 && isConvex(orderQuad(trial.map((i) => hull[i])))) {
          bestArea = a;
          idx = trial;
          improved = true;
        }
      }
    }
    if (!improved) break;
  }
  return orderQuad(idx.map((i) => hull[i]));
}

/**
 * Homografia 3x3 (em vetor de 9, h[8] = 1) que leva os pontos `from` nos `to`.
 * Resolve o sistema linear 8x8 por eliminacao de Gauss com pivoteamento.
 */
export function homography(from: readonly Point[], to: readonly Point[]): number[] {
  const A: number[][] = [];
  const b: number[] = [];
  for (let i = 0; i < 4; i++) {
    const { x, y } = from[i];
    const { x: u, y: v } = to[i];
    A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]);
    b.push(u);
    A.push([0, 0, 0, x, y, 1, -v * x, -v * y]);
    b.push(v);
  }
  const n = 8;
  for (let col = 0; col < n; col++) {
    let piv = col;
    for (let r = col + 1; r < n; r++) if (Math.abs(A[r][col]) > Math.abs(A[piv][col])) piv = r;
    [A[col], A[piv]] = [A[piv], A[col]];
    [b[col], b[piv]] = [b[piv], b[col]];
    const d = A[col][col];
    if (Math.abs(d) < 1e-12) throw new Error('Pontos degenerados: nao ha homografia.');
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const f = A[r][col] / d;
      if (f === 0) continue;
      for (let c = col; c < n; c++) A[r][c] -= f * A[col][c];
      b[r] -= f * b[col];
    }
  }
  const h = b.map((v, i) => v / A[i][i]);
  h.push(1);
  return h;
}

export function applyHomography(h: readonly number[], p: Point): Point {
  const w = h[6] * p.x + h[7] * p.y + h[8];
  return { x: (h[0] * p.x + h[1] * p.y + h[2]) / w, y: (h[3] * p.x + h[4] * p.y + h[5]) / w };
}

/** Quadro cheio com uma margem, usado quando a deteccao nao encontra a folha. */
export function defaultQuad(inset = 0.04): Quad {
  const a = inset;
  const b = 1 - inset;
  return [
    { x: a, y: a },
    { x: b, y: a },
    { x: b, y: b },
    { x: a, y: b },
  ];
}

export const FULL_QUAD: Quad = defaultQuad(0);
