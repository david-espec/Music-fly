/** Ponto em coordenadas normalizadas (0..1) ou em pixels, conforme o contexto. */
export interface Point {
  x: number;
  y: number;
}

/** Quatro cantos na ordem: superior esquerdo, superior direito, inferior direito, inferior esquerdo. */
export type Quad = [Point, Point, Point, Point];

/** Buffer RGBA no mesmo formato do ImageData, mas criavel fora do navegador (testes, worker). */
export interface Raster {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

export type FilterId = 'original' | 'cor' | 'cinza' | 'pb';

export type Rotation = 0 | 90 | 180 | 270;

export function createRaster(width: number, height: number): Raster {
  return { data: new Uint8ClampedArray(width * height * 4), width, height };
}
