/**
 * Cliente do Internet Archive - acervo publico de audio de livre distribuicao.
 * Sem chave de API, sem cadastro e sem anuncios.
 *
 * O acervo tem milhoes de itens de audio e cobre praticamente todo genero
 * que existe: dos 78 rotacoes (samba, choro, jazz, blues, tango, classica)
 * aos netlabels de eletronica, passando por milhares de shows ao vivo. O que
 * decide o alcance da busca aqui e a consulta que montamos, entao ela e
 * deliberadamente ampla.
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
  subject?: string | string[];
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

/**
 * Generos e estilos oferecidos como atalho. A lista mistura o que o acervo
 * tem em quantidade la fora com o que faz sentido para quem fala portugues,
 * e cada item vira uma consulta por etiqueta (`subject`) no acervo.
 *
 * `termos` traz sinonimos porque a etiquetagem do acervo e feita por quem
 * envia o material: "classica" aparece como "classical", "forro" as vezes
 * como "forro" e as vezes como "baiao".
 */
export const GENRES: { id: string; label: string; termos: string[] }[] = [
  { id: 'rock', label: 'Rock', termos: ['rock'] },
  { id: 'mpb', label: 'MPB', termos: ['mpb', 'musica popular brasileira'] },
  { id: 'samba', label: 'Samba', termos: ['samba', 'pagode'] },
  { id: 'bossa', label: 'Bossa nova', termos: ['bossa nova'] },
  { id: 'forro', label: 'Forro', termos: ['forro', 'baiao', 'xote'] },
  { id: 'sertanejo', label: 'Sertanejo', termos: ['sertanejo', 'country'] },
  { id: 'funk', label: 'Funk', termos: ['funk'] },
  { id: 'axe', label: 'Axe', termos: ['axe', 'frevo', 'maracatu'] },
  { id: 'choro', label: 'Choro', termos: ['choro', 'chorinho'] },
  { id: 'pop', label: 'Pop', termos: ['pop'] },
  { id: 'hiphop', label: 'Hip hop', termos: ['hip hop', 'rap'] },
  { id: 'eletronica', label: 'Eletronica', termos: ['electronic', 'techno', 'house'] },
  { id: 'jazz', label: 'Jazz', termos: ['jazz'] },
  { id: 'blues', label: 'Blues', termos: ['blues'] },
  { id: 'classica', label: 'Classica', termos: ['classical', 'orchestra', 'symphony'] },
  { id: 'reggae', label: 'Reggae', termos: ['reggae', 'ska', 'dub'] },
  { id: 'metal', label: 'Metal', termos: ['metal', 'hardcore', 'punk'] },
  { id: 'gospel', label: 'Gospel', termos: ['gospel', 'worship', 'christian'] },
  { id: 'soul', label: 'Soul e R&B', termos: ['soul', 'rhythm and blues', 'motown'] },
  { id: 'latina', label: 'Latina', termos: ['latin', 'salsa', 'cumbia', 'tango'] },
  { id: 'africana', label: 'Africana', termos: ['afrobeat', 'african', 'highlife'] },
  { id: 'kpop', label: 'Asiatica', termos: ['k-pop', 'j-pop', 'asian'] },
  { id: 'folk', label: 'Folk', termos: ['folk', 'acoustic', 'bluegrass'] },
  { id: 'lofi', label: 'Lo-fi e chill', termos: ['lo-fi', 'chillout', 'downtempo'] },
  { id: 'ambiente', label: 'Ambiente', termos: ['ambient', 'drone', 'new age'] },
  { id: 'trilha', label: 'Trilhas', termos: ['soundtrack', 'film score', 'video game music'] },
  { id: 'infantil', label: 'Infantil', termos: ['children', 'kids', 'nursery'] },
  { id: 'aovivo', label: 'Shows ao vivo', termos: ['live concert', 'live'] },
];

/** Ordenacoes que o acervo aceita, com nome em portugues. */
export const SORTS: { id: string; label: string; param: string }[] = [
  { id: 'relevancia', label: 'Mais relevantes', param: '' },
  { id: 'populares', label: 'Mais baixados', param: 'downloads desc' },
  { id: 'novos', label: 'Mais recentes', param: 'addeddate desc' },
  { id: 'nota', label: 'Melhor avaliados', param: 'avg_rating desc' },
];

/**
 * Deixa passar so o que o acervo entende como texto de busca. O usuario
 * digita livre, e um parenteses ou dois-pontos solto derrubaria a consulta
 * inteira com erro de sintaxe em vez de simplesmente nao achar nada.
 */
function termsOf(query: string): string[] {
  return query
    .replace(/["\\+\-!(){}[\]^~*?:/]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

/** Onde cada palavra e procurada. Colecoes diferentes preenchem campos diferentes. */
const SEARCH_FIELDS = ['title', 'creator', 'subject', 'description', 'identifier'];

/**
 * Monta a consulta. A regra e alcancar o maximo de acervo possivel:
 *
 * - cada palavra digitada precisa aparecer em algum campo do item, mas nao
 *   precisa ser no mesmo: "chico construcao" acha o item cujo artista e Chico
 *   e cujo titulo e Construcao;
 * - procura tambem na etiqueta de genero e na descricao, e nao so no titulo,
 *   que era o que fazia buscar por estilo nao devolver nada;
 * - o filtro de formato aceita tudo que o navegador toca, e nao so MP3 - isso
 *   sozinho ja destrava as colecoes que so tem Ogg ou FLAC;
 * - sem termo nenhum, varre o acervo de audio inteiro em vez de duas colecoes
 *   escolhidas a dedo.
 */
export function buildQuery(query: string, genreId?: string): string {
  const formatos = [...PLAYABLE_FORMATS].map((f) => `"${f}"`).join(' OR ');
  const partes = ['mediatype:(audio)', `format:(${formatos})`];

  for (const termo of termsOf(query)) {
    partes.push(`(${SEARCH_FIELDS.map((campo) => `${campo}:(${termo})`).join(' OR ')})`);
  }

  const genero = GENRES.find((item) => item.id === genreId);
  if (genero) {
    partes.push(`subject:(${genero.termos.map((t) => `"${t}"`).join(' OR ')})`);
  }

  return partes.join(' AND ');
}

export async function searchAlbums(
  query: string,
  page: number,
  signal?: AbortSignal,
  options: { genre?: string; sort?: string } = {},
): Promise<{ albums: ArchiveAlbum[]; total: number }> {
  const params = new URLSearchParams({
    q: buildQuery(query, options.genre),
    rows: '30',
    page: String(page),
    output: 'json',
  });

  // "Mais relevantes" e a ausencia de ordenacao: quem ranqueia e o acervo.
  // Sem termo e sem genero nao ha o que ranquear - a vitrine de entrada
  // cairia num punhado de itens ao acaso -, entao ali vale o mais baixado.
  const escolhida = SORTS.find((item) => item.id === options.sort);
  const semFiltro = termsOf(query).length === 0 && !options.genre;
  const sort = escolhida?.param || (semFiltro ? 'downloads desc' : '');
  if (sort) params.append('sort[]', sort);

  for (const field of ['identifier', 'title', 'creator', 'year', 'downloads', 'subject']) {
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
      tags: normalizeTags(doc.subject),
    })),
  };
}

/** As etiquetas vem ora como lista, ora como uma string separada por virgulas. */
function normalizeTags(subject: string | string[] | undefined): string[] {
  const bruto = Array.isArray(subject) ? subject : subject ? subject.split(/[,;]/) : [];
  const vistos = new Set<string>();
  const saida: string[] = [];
  for (const item of bruto) {
    const limpo = item.trim();
    if (!limpo) continue;
    const chave = limpo.toLowerCase();
    if (vistos.has(chave)) continue;
    vistos.add(chave);
    saida.push(limpo);
  }
  return saida;
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
