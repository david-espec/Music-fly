/**
 * Estatisticas e recomendacoes, calculadas a partir do historico local
 * (RF54 a RF58). Tudo sai das faixas em memoria: nao ha servidor por tras.
 */
import type { Track } from '../types';

export interface RankedName {
  name: string;
  seconds: number;
  plays: number;
  /** Faixa usada para desenhar a capa. */
  cover: Track;
  tracks: Track[];
}

export interface Stats {
  /** Segundos ouvidos somando toda a biblioteca (RF57). */
  totalSeconds: number;
  totalPlays: number;
  playedTracks: number;
  likedTracks: number;
  /** Mais reproduzidas (RF55). */
  topTracks: Track[];
  /** Artistas mais ouvidos (RF56). */
  topArtists: RankedName[];
  /** Albuns mais ouvidos. */
  topAlbums: RankedName[];
}

const listened = (track: Track) => track.totalSeconds ?? 0;
const plays = (track: Track) => track.playCount ?? 0;

/** Agrupa por artista ou album e ordena pelo tempo ouvido. */
function rank(tracks: Track[], by: 'artist' | 'album', limit: number): RankedName[] {
  const groups = new Map<string, RankedName>();

  for (const track of tracks) {
    // Albuns homonimos de artistas diferentes nao devem se fundir.
    const key = by === 'album' ? `${track.album} ${track.artist}` : track.artist;
    const name = by === 'album' ? track.album : track.artist;
    const group = groups.get(key);
    if (group) {
      group.seconds += listened(track);
      group.plays += plays(track);
      group.tracks.push(track);
    } else {
      groups.set(key, {
        name,
        seconds: listened(track),
        plays: plays(track),
        cover: track,
        tracks: [track],
      });
    }
  }

  return [...groups.values()]
    .filter((group) => group.seconds > 0)
    .sort((a, b) => b.seconds - a.seconds || a.name.localeCompare(b.name, 'pt-BR'))
    .slice(0, limit);
}

export function computeStats(tracks: Track[], limit = 10): Stats {
  const played = tracks.filter((track) => plays(track) > 0);

  return {
    totalSeconds: tracks.reduce((sum, track) => sum + listened(track), 0),
    totalPlays: tracks.reduce((sum, track) => sum + plays(track), 0),
    playedTracks: played.length,
    likedTracks: tracks.filter((track) => track.liked).length,
    topTracks: [...played]
      .sort(
        (a, b) =>
          plays(b) - plays(a) ||
          listened(b) - listened(a) ||
          a.title.localeCompare(b.title, 'pt-BR'),
      )
      .slice(0, limit),
    topArtists: rank(tracks, 'artist', limit),
    topAlbums: rank(tracks, 'album', limit),
  };
}

export interface Recommendation {
  key: string;
  title: string;
  reason: string;
  tracks: Track[];
}

/** Embaralha uma copia (Fisher-Yates). */
function shuffled<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

/**
 * Sugestoes baseadas no que ja foi ouvido e curtido (RF58, itens 35.1 a 35.7
 * do documento). Cada uma explica de onde veio: sem isso viram caixa-preta.
 */
export function recommend(tracks: Track[], limit = 20): Recommendation[] {
  if (tracks.length === 0) return [];

  const stats = computeStats(tracks, 3);
  const sugestoes: Recommendation[] = [];

  // 35.3 - mais do artista que voce mais ouve, tirando o que ja e batido.
  const artistaTopo = stats.topArtists[0];
  if (artistaTopo) {
    const restante = artistaTopo.tracks
      .filter((track) => plays(track) === 0)
      .slice(0, limit);
    if (restante.length > 0) {
      sugestoes.push({
        key: 'artista-topo',
        title: `Mais de ${artistaTopo.name}`,
        reason: 'o artista que voce mais ouviu',
        tracks: restante,
      });
    }
  }

  // 35.6 - o que ainda nao foi tocado nenhuma vez.
  const ineditas = tracks.filter((track) => plays(track) === 0);
  if (ineditas.length > 0) {
    sugestoes.push({
      key: 'nunca-tocadas',
      title: 'Voce ainda nao ouviu',
      reason: 'na sua biblioteca, sem nenhuma reproducao',
      tracks: shuffled(ineditas).slice(0, limit),
    });
  }

  // 35.2 - a partir das curtidas.
  const curtidas = tracks.filter((track) => track.liked);
  if (curtidas.length > 0) {
    const artistasCurtidos = new Set(curtidas.map((track) => track.artist));
    const proximas = tracks.filter(
      (track) => !track.liked && artistasCurtidos.has(track.artist),
    );
    if (proximas.length > 0) {
      sugestoes.push({
        key: 'perto-das-curtidas',
        title: 'Porque voce curtiu',
        reason: 'mesmos artistas das suas musicas curtidas',
        tracks: shuffled(proximas).slice(0, limit),
      });
    }
  }

  // 35.5 - as mais tocadas, para reouvir.
  if (stats.topTracks.length > 0) {
    sugestoes.push({
      key: 'mais-tocadas',
      title: 'Suas mais tocadas',
      reason: 'ordenadas por numero de reproducoes',
      tracks: computeStats(tracks, limit).topTracks,
    });
  }

  // 35.7 - mix pessoal: curtidas e mais ouvidas, embaralhadas.
  const base = tracks.filter((track) => track.liked || plays(track) > 0);
  if (base.length >= 3) {
    sugestoes.push({
      key: 'mix',
      title: 'Seu mix',
      reason: 'suas curtidas e mais ouvidas, em ordem aleatoria',
      tracks: shuffled(base).slice(0, limit),
    });
  }

  return sugestoes;
}
