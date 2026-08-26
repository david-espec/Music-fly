/**
 * Busca de letras no LRCLIB (lrclib.net): acervo aberto de letras
 * sincronizadas, sem chave de API, sem cadastro e sem anuncios.
 */
import type { LyricLine, Track } from '../types';
import { parseLrc, parsePlain } from './lrc';

const ENDPOINT = 'https://lrclib.net/api';

interface LrclibRecord {
  id?: number;
  trackName?: string;
  artistName?: string;
  albumName?: string;
  duration?: number;
  instrumental?: boolean;
  plainLyrics?: string | null;
  syncedLyrics?: string | null;
}

export interface LyricsResult {
  lines: LyricLine[];
  synced: boolean;
  instrumental: boolean;
}

/** Converte um registro do LRCLIB no formato usado pelo app. */
function toResult(record: LrclibRecord): LyricsResult | null {
  if (record.instrumental) {
    return { lines: [], synced: false, instrumental: true };
  }
  if (record.syncedLyrics?.trim()) {
    const { lines } = parseLrc(record.syncedLyrics);
    if (lines.length > 0) return { lines, synced: true, instrumental: false };
  }
  if (record.plainLyrics?.trim()) {
    return { lines: parsePlain(record.plainLyrics), synced: false, instrumental: false };
  }
  return null;
}

/**
 * Procura a letra de uma faixa. Tenta primeiro a correspondencia exata (que
 * usa a duracao para escolher a gravacao certa) e cai para a busca ampla.
 */
export async function fetchLyrics(
  track: Track,
  signal?: AbortSignal,
): Promise<LyricsResult | null> {
  const exact = new URLSearchParams({
    track_name: track.title,
    artist_name: track.artist,
  });
  if (track.album && track.album !== 'Album desconhecido') {
    exact.set('album_name', track.album);
  }
  if (track.duration > 0) exact.set('duration', String(Math.round(track.duration)));

  const direct = await request(`${ENDPOINT}/get?${exact}`, signal);
  if (direct && !Array.isArray(direct)) {
    const result = toResult(direct);
    if (result) return result;
  }

  const search = new URLSearchParams({
    track_name: track.title,
    artist_name: track.artist,
  });
  const found = await request(`${ENDPOINT}/search?${search}`, signal);
  if (!Array.isArray(found)) return null;

  // Preferimos a versao sincronizada cuja duracao mais se aproxima da faixa.
  const ranked = [...found].sort((a, b) => {
    const syncedFirst = Number(!!b.syncedLyrics) - Number(!!a.syncedLyrics);
    if (syncedFirst !== 0) return syncedFirst;
    if (!track.duration) return 0;
    return (
      Math.abs((a.duration ?? 0) - track.duration) -
      Math.abs((b.duration ?? 0) - track.duration)
    );
  });

  for (const record of ranked) {
    const result = toResult(record);
    if (result) return result;
  }
  return null;
}

async function request(
  url: string,
  signal?: AbortSignal,
): Promise<LrclibRecord | LrclibRecord[] | null> {
  const response = await fetch(url, { signal, headers: { Accept: 'application/json' } });
  // 404 e a resposta normal para "nao temos essa letra".
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`LRCLIB respondeu ${response.status}`);
  return (await response.json()) as LrclibRecord | LrclibRecord[];
}
