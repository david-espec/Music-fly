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

export type ViewId = 'inicio' | 'biblioteca' | 'letra' | 'descobrir' | 'sobre';
