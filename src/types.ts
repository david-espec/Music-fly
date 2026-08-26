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

export type ViewId = 'biblioteca' | 'playlists' | 'descobrir' | 'sobre';
