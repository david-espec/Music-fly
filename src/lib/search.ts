/**
 * Busca da biblioteca: todos os termos precisam casar, em qualquer ordem, e o
 * resultado sai ordenado por relevancia.
 */
import type { Track } from '../types';

/**
 * Minusculas e sem acentos, **preservando o tamanho do texto**.
 *
 * `String.normalize('NFD')` separa a letra do acento e muda os indices, o que
 * quebraria o realce (as posicoes encontradas aqui sao usadas para fatiar o
 * texto original). Normalizando caractere a caractere, cada posicao continua
 * valendo uma posicao.
 */
export function fold(text: string): string {
  let folded = '';
  for (const char of text.toLowerCase()) {
    const stripped = char.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    // Ligaduras e afins podem virar mais de um caractere; nesses casos
    // mantemos o original para nao desalinhar os indices.
    folded += stripped.length === 1 ? stripped : char;
  }
  return folded;
}

/** Quebra a busca em termos. Vazio quando nao ha o que procurar. */
export function terms(query: string): string[] {
  return fold(query)
    .split(/\s+/)
    .map((term) => term.trim())
    .filter(Boolean);
}

/** O termo comeca uma palavra dentro do texto? */
function wordStart(haystack: string, needle: string): boolean {
  let from = 0;
  for (;;) {
    const at = haystack.indexOf(needle, from);
    if (at < 0) return false;
    if (at === 0 || /[^a-z0-9]/.test(haystack[at - 1])) return true;
    from = at + 1;
  }
}

/** Quao bem um termo casa com um campo. 0 significa que nao casou. */
function scoreField(field: string, term: string): number {
  if (!field) return 0;
  if (field === term) return 100;
  if (field.startsWith(term)) return 70;
  if (wordStart(field, term)) return 50;
  if (field.includes(term)) return 25;
  return 0;
}

/** Titulo pesa mais que artista, que pesa mais que album. */
const WEIGHTS = { title: 1, artist: 0.7, album: 0.5 } as const;

export interface TrackHit {
  track: Track;
  score: number;
}

/**
 * Ordena as faixas por relevancia. Uma faixa so entra se **todos** os termos
 * casarem em algum campo: buscar "teste primeira" encontra "Primeira Musica"
 * de "Artista Teste", mas "teste xyz" nao encontra nada.
 */
export function searchTracks(tracks: Track[], query: string): TrackHit[] {
  const parts = terms(query);
  if (parts.length === 0) return tracks.map((track) => ({ track, score: 0 }));

  const whole = parts.join(' ');
  const hits: TrackHit[] = [];

  for (const track of tracks) {
    const fields = {
      title: fold(track.title),
      artist: fold(track.artist),
      album: fold(track.album),
    };

    let total = 0;
    let matchedAll = true;

    for (const term of parts) {
      const best = Math.max(
        scoreField(fields.title, term) * WEIGHTS.title,
        scoreField(fields.artist, term) * WEIGHTS.artist,
        scoreField(fields.album, term) * WEIGHTS.album,
      );
      if (best === 0) {
        matchedAll = false;
        break;
      }
      total += best;
    }
    if (!matchedAll) continue;

    // A busca inteira batendo no titulo vale mais que os termos soltos.
    if (fields.title === whole) total += 400;
    else if (fields.title.startsWith(whole)) total += 200;
    else if (fields.artist === whole) total += 150;

    hits.push({ track, score: total });
  }

  return hits.sort(
    (a, b) => b.score - a.score || a.track.title.localeCompare(b.track.title, 'pt-BR'),
  );
}

export interface GroupHit {
  key: string;
  name: string;
  tracks: Track[];
  score: number;
}

/**
 * Artistas ou albuns que casam com a busca, mesmo que nenhuma musica deles
 * case pelo titulo.
 */
export function searchGroups(
  tracks: Track[],
  query: string,
  by: 'artist' | 'album',
): GroupHit[] {
  const parts = terms(query);
  if (parts.length === 0) return [];

  const groups = new Map<string, { name: string; tracks: Track[] }>();
  for (const track of tracks) {
    // Albuns homonimos de artistas diferentes nao devem se fundir.
    const key = by === 'album' ? `${track.album} ${track.artist}` : track.artist;
    const name = by === 'album' ? track.album : track.artist;
    const group = groups.get(key);
    if (group) group.tracks.push(track);
    else groups.set(key, { name, tracks: [track] });
  }

  const whole = parts.join(' ');
  const hits: GroupHit[] = [];

  for (const [key, group] of groups) {
    const folded = fold(group.name);
    let total = 0;
    let matchedAll = true;

    for (const term of parts) {
      const score = scoreField(folded, term);
      if (score === 0) {
        matchedAll = false;
        break;
      }
      total += score;
    }
    if (!matchedAll) continue;
    if (folded === whole) total += 400;

    const ordered = [...group.tracks].sort(
      (a, b) =>
        (a.trackNo ?? 9999) - (b.trackNo ?? 9999) || a.title.localeCompare(b.title, 'pt-BR'),
    );
    hits.push({ key, name: group.name, tracks: ordered, score: total });
  }

  return hits.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name, 'pt-BR'));
}

/**
 * Trechos de `text` que casam com algum termo, como pares [inicio, fim).
 * Intervalos que se tocam sao fundidos, para o realce nao ficar picotado.
 */
export function highlightRanges(text: string, parts: string[]): [number, number][] {
  if (parts.length === 0) return [];
  const folded = fold(text);
  const found: [number, number][] = [];

  for (const term of parts) {
    let from = 0;
    for (;;) {
      const at = folded.indexOf(term, from);
      if (at < 0) break;
      found.push([at, at + term.length]);
      from = at + term.length;
    }
  }
  if (found.length === 0) return [];

  found.sort((a, b) => a[0] - b[0]);
  const merged: [number, number][] = [found[0]];
  for (const [start, end] of found.slice(1)) {
    const last = merged[merged.length - 1];
    if (start <= last[1]) last[1] = Math.max(last[1], end);
    else merged.push([start, end]);
  }
  return merged;
}
