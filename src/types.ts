/** De onde a faixa veio. */
export type TrackSource = 'local' | 'acervo';

export type RepeatMode = 'off' | 'all' | 'one';

export interface Track {
  id: string;
  source: TrackSource;
  title: string;
  artist: string;
  album: string;
  /** Duracao em segundos. 0 quando ainda nao foi possivel determinar. */
  duration: number;
  year?: number;
  trackNo?: number;
  addedAt: number;
  /** Quando esta faixa comecou a tocar pela ultima vez. */
  lastPlayedAt?: number;

  // --- Curtidas (RF34, RF35, RF37) ---
  /** Um booleano ja garante a RN13: uma curtida por faixa, sem repetir. */
  liked?: boolean;
  likedAt?: number;

  // --- Historico e estatisticas (RF41, RF54 a RF57) ---
  /** Quantas reproducoes foram iniciadas (RN15). */
  playCount?: number;
  /** Segundos realmente ouvidos, somados entre as reproducoes. */
  totalSeconds?: number;
  /** Onde a reproducao parou, para retomar depois (RN17, RN18). */
  progressSeconds?: number;
  /** A ultima reproducao chegou ao fim. */
  completed?: boolean;

  // --- Somente faixas locais ---
  fileName?: string;
  mimeType?: string;
  size?: number;

  // --- Somente faixas do acervo livre ---
  archiveId?: string;
  streamUrl?: string;
  license?: string;
  remoteCoverUrl?: string;

  /** Ha uma capa guardada no IndexedDB para esta faixa. */
  hasCover: boolean;
  /** Quando a capa mudou. Invalida o cache de object URL na interface. */
  coverUpdatedAt?: number;
  /** Ha letra guardada no IndexedDB para esta faixa. */
  hasLyrics: boolean;
  /** O audio esta guardado no IndexedDB e toca sem internet. */
  offline: boolean;
}

export interface Playlist {
  id: string;
  name: string;
  trackIds: string[];
  createdAt: number;
  updatedAt: number;
}

export interface ArchiveAlbum {
  identifier: string;
  title: string;
  creator: string;
  year?: number;
  downloads?: number;
  coverUrl: string;
  /** Etiquetas do acervo, quase sempre o genero e o estilo. */
  tags?: string[];
}

/** Uma linha da letra. `time` e NaN quando a letra nao tem sincronia. */
export interface LyricLine {
  time: number;
  text: string;
}

export type LyricsSource = 'embutida' | 'arquivo' | 'lrclib';

export interface Lyrics {
  trackId: string;
  lines: LyricLine[];
  /** Ha marcacao de tempo utilizavel para destacar a linha atual. */
  synced: boolean;
  instrumental: boolean;
  source: LyricsSource;
  /** Ajuste manual em segundos, quando a letra esta adiantada ou atrasada. */
  offset: number;
  savedAt: number;
}

export type ViewId =
  | 'inicio'
  | 'biblioteca'
  | 'letra'
  | 'descobrir'
  | 'estatisticas'
  | 'configuracoes'
  | 'sobre';
