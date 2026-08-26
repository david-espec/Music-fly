/**
 * Formato LRC: letras com marcacao de tempo por linha.
 *
 *   [ar:Artista]
 *   [offset:+500]
 *   [00:12.34]Primeira linha
 *   [00:15.00][01:20.10]Refrao que se repete
 */
import type { LyricLine } from '../types';

/** [mm:ss.xx], [mm:ss:xx] ou [hh:mm:ss.xx] no inicio da linha. */
const TIME_TAG = /\[(\d{1,3}):(\d{1,2})(?:[.:](\d{1,3}))?\]/g;
/** Cabecalhos como [ar:...], [ti:...], [offset:+500]. */
const META_TAG = /^\[([a-z]+):(.*)\]$/i;
/** Marcas por palavra do "enhanced LRC": <00:12.34>. */
const WORD_TAG = /<\d{1,3}:\d{1,2}(?:[.:]\d{1,3})?>/g;

export interface ParsedLrc {
  lines: LyricLine[];
  title?: string;
  artist?: string;
}

function toSeconds(minutes: string, seconds: string, fraction?: string): number {
  // Duas casas significam centesimos; tres, milesimos.
  const frac = fraction ? Number(fraction) / 10 ** fraction.length : 0;
  return Number(minutes) * 60 + Number(seconds) + frac;
}

/**
 * Le um arquivo LRC. Devolve as linhas ordenadas por tempo; linhas sem
 * marcacao de tempo sao descartadas (nao da para sincronizar o que nao tem
 * tempo, e mantê-las bagunçaria a rolagem).
 */
export function parseLrc(source: string): ParsedLrc {
  const lines: LyricLine[] = [];
  let offsetSeconds = 0;
  let title: string | undefined;
  let artist: string | undefined;

  for (const rawLine of source.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;

    const meta = META_TAG.exec(line);
    if (meta && !/^\d+$/.test(meta[1])) {
      const key = meta[1].toLowerCase();
      const value = meta[2].trim();
      if (key === 'offset') offsetSeconds = (Number(value) || 0) / 1000;
      else if (key === 'ti') title = value;
      else if (key === 'ar') artist = value;
      continue;
    }

    TIME_TAG.lastIndex = 0;
    const times: number[] = [];
    let match: RegExpExecArray | null;
    let endOfTags = 0;
    while ((match = TIME_TAG.exec(line)) !== null) {
      // So contam as marcas coladas no inicio da linha.
      if (match.index !== endOfTags) break;
      endOfTags = match.index + match[0].length;
      times.push(toSeconds(match[1], match[2], match[3]));
    }
    if (times.length === 0) continue;

    const text = line.slice(endOfTags).replace(WORD_TAG, '').trim();
    for (const time of times) lines.push({ time, text });
  }

  lines.sort((a, b) => a.time - b.time);
  // O offset do arquivo desloca a letra inteira.
  const shifted = offsetSeconds
    ? lines.map((line) => ({ ...line, time: Math.max(0, line.time + offsetSeconds) }))
    : lines;

  return { lines: shifted, title, artist };
}

/** Texto corrido, para quando so ha letra sem sincronia. */
export function parsePlain(source: string): LyricLine[] {
  return source
    .split(/\r?\n/)
    .map((line) => line.trim())
    .map((text) => ({ time: Number.NaN, text }));
}

/**
 * Indice da linha que deve estar destacada em `time`, ou -1 antes da primeira.
 * Busca binaria: roda a cada quadro de animacao.
 */
export function activeLineIndex(lines: LyricLine[], time: number): number {
  let low = 0;
  let high = lines.length - 1;
  let found = -1;
  while (low <= high) {
    const mid = (low + high) >> 1;
    if (lines[mid].time <= time) {
      found = mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }
  return found;
}

export function hasTimestamps(lines: LyricLine[]): boolean {
  return lines.some((line) => Number.isFinite(line.time));
}
