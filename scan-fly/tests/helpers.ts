import { createRaster, type Point, type Raster } from '../src/scan/types.ts';

function inside(p: Point, poly: Point[]) {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) c = !c;
  }
  return c;
}

/** Foto sintetica: fundo de uma cor, folha de outra, com "linhas de texto" escuras dentro. */
export function syntheticPhoto(
  w: number,
  h: number,
  sheet: Point[],
  opts: { bg: number; paper: number; text?: boolean; noise?: number } ,
): Raster {
  const r = createRaster(w, h);
  let seed = 7;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647 - 0.5) * 2;
  const cx = sheet.reduce((s, p) => s + p.x, 0) / 4;
  const cy = sheet.reduce((s, p) => s + p.y, 0) / 4;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const p = { x: x + 0.5, y: y + 0.5 };
      let v = opts.bg;
      if (inside(p, sheet)) {
        v = opts.paper;
        // Texto: faixas horizontais no miolo da folha.
        if (opts.text && Math.abs(x - cx) < w * 0.15 && Math.abs(y - cy) < h * 0.2 && y % 12 < 3) v = 30;
      }
      v += (opts.noise ?? 0) * rand();
      const i = (y * w + x) * 4;
      r.data[i] = r.data[i + 1] = r.data[i + 2] = v;
      r.data[i + 3] = 255;
    }
  }
  return r;
}
