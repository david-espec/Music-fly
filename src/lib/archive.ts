/**
 * Cliente do Internet Archive - acervo publico de audio de livre distribuicao.
 * Sem chave de API, sem cadastro e sem anuncios.
 */
import type { ArchiveAlbum, Track } from '../types';
import { uid } from './format';

const SEARCH_ENDPOINT = 'https://archive.org/advancedsearch.php';
const METADATA_ENDPOINT = 'https://archive.org/metadata';
const DOWNLOAD_ENDPOINT = 'https://archive.org/download';

/** Formatos que os navegadores tocam de forma confiavel. */
const PLAYABLE_FORMATS = new Set([
  'VBR MP3',
  'MP3',
  '128Kbps MP3',
  '64Kbps MP3',
  '256Kbps MP3',
  'Ogg Vorbis',
  'Flac',
  'WAVE',
]);

/** Prioridade de escolha quando a mesma faixa existe em varios formatos. */
const FORMAT_RANK: Record<string, number> = {
  'VBR MP3': 0,
  MP3: 1,
  '256Kbps MP3': 2,
  '128Kbps MP3': 3,
  'Ogg Vorbis': 4,
  '64Kbps MP3': 5,
  Flac: 6,
  WAVE: 7,
};

interface SearchDoc {
  identifier: string;
  title?: string | string[];
  creator?: string | string[];
  year?: string | number;
  downloads?: number;
}

interface ArchiveFile {
  name: string;
  format?: string;
  title?: string;
  track?: string | number;
  length?: string | number;
  size?: string | number;
  album?: string;
  artist?: string;
  creator?: string;
}

const first = (value: string | string[] | undefined, fallback: string): string => {
  if (Array.isArray(value)) return value[0] ?? fallback;
  return value?.trim() ? value : fallback;
};

export function coverUrlFor(identifier: string): string {
  return `https://archive.org/services/img/${encodeURIComponent(identifier)}`;
}

export function detailsUrlFor(identifier: string): string {
  return `https://archive.org/details/${encodeURIComponent(identifier)}`;
}

/**
 * "8:32" ou "512.5" (segundos) -> segundos.
 */
function parseLength(value: string | number | undefined): number {
  if (value == null) return 0;
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (value.includes(':')) {
    return value
      .split(':')
      .map((part) => Number(part) || 0)
      .reduce((acc, part) => acc * 60 + part, 0);
  }
  const seconds = Number(value);
  return Number.isFinite(seconds) ? seconds : 0;
}

export async function searchAlbums(
  query: string,
  page: number,
  signal?: AbortSignal,
): Promise<{ albums: ArchiveAlbum[]; total: number }> {
  const terms = query.trim();
  // Sem termo de busca, mostramos gravacoes populares de livre distribuicao.
  const q = terms
    ? `(${terms}) AND mediatype:(audio) AND format:(MP3)`
    : 'collection:(netlabels OR audio_music) AND mediatype:(audio) AND format:(MP3)';

  const params = new URLSearchParams({
    q,
    rows: '30',
    page: String(page),
    output: 'json',
    sort: 'downloads desc',
  });
  for (const field of ['identifier', 'title', 'creator', 'year', 'downloads']) {
    params.append('fl[]', field);
  }

  const response = await fetch(`${SEARCH_ENDPOINT}?${params}`, { signal });
  if (!response.ok) throw new Error(`Busca falhou (${response.status})`);
  const data = (await response.json()) as {
    response?: { numFound?: number; docs?: SearchDoc[] };
  };

  const docs = data.response?.docs ?? [];
  return {
    total: data.response?.numFound ?? docs.length,
    albums: docs.map((doc) => ({
      identifier: doc.identifier,
      title: first(doc.title, doc.identifier),
      creator: first(doc.creator, 'Artista desconhecido'),
      year: doc.year ? Number(doc.year) || undefined : undefined,
      downloads: doc.downloads,
      coverUrl: coverUrlFor(doc.identifier),
    })),
  };
}

/** Lista as faixas tocaveis de um item do acervo, ja como Track. */
export async function fetchAlbumTracks(
  album: ArchiveAlbum,
  signal?: AbortSignal,
): Promise<{ tracks: Track[]; license?: string }> {
  const response = await fetch(
    `${METADATA_ENDPOINT}/${encodeURIComponent(album.identifier)}`,
    { signal },
  );
  if (!response.ok) throw new Error(`Nao foi possivel abrir o album (${response.status})`);
  const data = (await response.json()) as {
    files?: ArchiveFile[];
    metadata?: { licenseurl?: string; rights?: string; title?: string; creator?: string };
  };

  const license = data.metadata?.licenseurl ?? data.metadata?.rights;

  // Agrupa por "faixa logica": o mesmo audio aparece em varios formatos, e o
  // nome sem extensao e o que os une.
  const byStem = new Map<string, ArchiveFile>();
  for (const file of data.files ?? []) {
    if (!file.format || !PLAYABLE_FORMATS.has(file.format)) continue;
    const stem = file.name.replace(/\.[^.]+$/, '');
    const current = byStem.get(stem);
    const rank = FORMAT_RANK[file.format] ?? 99;
    const currentRank = current ? FORMAT_RANK[current.format ?? ''] ?? 99 : 100;
    if (rank < currentRank) byStem.set(stem, file);
  }

  const tracks = [...byStem.values()]
    .map<Track>((file) => ({
      id: uid(),
      source: 'acervo',
      title: file.title?.trim() || file.name.replace(/\.[^.]+$/, '').replace(/_/g, ' '),
      artist: file.artist?.trim() || file.creator?.trim() || album.creator,
      album: file.album?.trim() || album.title,
      duration: parseLength(file.length),
      year: album.year,
      trackNo: file.track ? Number(file.track) || undefined : undefined,
      addedAt: Date.now(),
      size: file.size ? Number(file.size) || undefined : undefined,
      archiveId: album.identifier,
      streamUrl: `${DOWNLOAD_ENDPOINT}/${encodeURIComponent(album.identifier)}/${file.name
        .split('/')
        .map(encodeURIComponent)
        .join('/')}`,
      license,
      remoteCoverUrl: album.coverUrl,
      hasCover: false,
      hasLyrics: false,
      offline: false,
    }))
    .sort((a, b) => (a.trackNo ?? 9999) - (b.trackNo ?? 9999) || a.title.localeCompare(b.title));

  return { tracks, license };
}

/** Rotulo curto e legivel para uma URL de licenca. */
export function licenseLabel(license?: string): string | null {
  if (!license) return null;
  const match = /creativecommons\.org\/(licenses|publicdomain)\/([a-z-]+)/i.exec(license);
  if (match) {
    if (match[1] === 'publicdomain') return 'Dominio publico';
    return `CC ${match[2].toUpperCase()}`;
  }
  if (/publicdomain|public domain/i.test(license)) return 'Dominio publico';
  return 'Licenca livre';
}
