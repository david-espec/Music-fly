import { useMemo } from 'react';
import { useLibrary } from '../library/LibraryContext';
import { usePlayer } from '../player/PlayerContext';
import { computeStats, recommend } from '../lib/insights';
import { CardRow } from '../components/CardRow';
import { TrackList } from '../components/TrackList';
import { Cover } from '../components/Cover';
import { formatDuration, plural } from '../lib/format';
import { PlayIcon, StatsIcon } from '../components/Icons';

/** Tempo longo em palavras: "3 h 12 min" le melhor que "3:12:40". */
function longDuration(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)} s`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return plural(minutes, 'minuto', 'minutos');
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? plural(hours, 'hora', 'horas') : `${hours} h ${rest} min`;
}

/** Estatisticas de escuta e recomendacoes (RF54 a RF58). */
export function StatsView() {
  const { tracks } = useLibrary();
  const player = usePlayer();

  const stats = useMemo(() => computeStats(tracks), [tracks]);
  // Recalcula so quando a biblioteca muda: o embaralhamento nao pode trocar
  // a cada render, senao os cartoes dancam na tela.
  const suggestions = useMemo(() => recommend(tracks), [tracks]);

  if (stats.totalPlays === 0) {
    return (
      <section className="view">
        <header className="view__header">
          <div>
            <h1>Estatisticas</h1>
            <p className="view__subtitle">O que voce mais ouve, e o que sugerimos a partir disso.</p>
          </div>
        </header>
        <div className="placeholder">
          <StatsIcon width={38} height={38} />
          <h2>Nada para mostrar ainda</h2>
          <p>
            Toque algumas musicas e esta tela passa a mostrar suas mais ouvidas, seus artistas
            preferidos e sugestoes baseadas nisso. Nada sai do seu aparelho.
          </p>
        </div>
      </section>
    );
  }

  return (
    <section className="view">
      <header className="view__header">
        <div>
          <h1>Estatisticas</h1>
          <p className="view__subtitle">Calculado a partir do seu historico, aqui no aparelho.</p>
        </div>
      </header>

      <dl className="statgrid">
        <div>
          <dt>Tempo ouvido</dt>
          <dd>{longDuration(stats.totalSeconds)}</dd>
        </div>
        <div>
          <dt>Reproducoes</dt>
          <dd>{stats.totalPlays}</dd>
        </div>
        <div>
          <dt>Musicas tocadas</dt>
          <dd>{stats.playedTracks}</dd>
        </div>
        <div>
          <dt>Curtidas</dt>
          <dd>{stats.likedTracks}</dd>
        </div>
      </dl>

      {stats.topTracks.length > 0 && (
        <section className="row">
          <header className="row__head">
            <h2>Mais tocadas</h2>
            <button
              type="button"
              className="button"
              onClick={() => player.playTracks(stats.topTracks, 0)}
            >
              <PlayIcon width={16} height={16} />
              Tocar
            </button>
          </header>
          <ol className="ranking">
            {stats.topTracks.map((track, position) => (
              <li key={track.id}>
                <span className="ranking__pos">{position + 1}</span>
                <Cover track={track} size={40} />
                <span className="ranking__info">
                  <span className="ranking__name">{track.title}</span>
                  <span className="ranking__meta">{track.artist}</span>
                </span>
                <span className="ranking__value">
                  {plural(track.playCount ?? 0, 'vez', 'vezes')}
                </span>
              </li>
            ))}
          </ol>
        </section>
      )}

      <div className="statcols">
        {stats.topArtists.length > 0 && (
          <section className="row">
            <header className="row__head">
              <h2>Artistas mais ouvidos</h2>
            </header>
            <ol className="ranking">
              {stats.topArtists.map((artist, position) => (
                <li key={artist.name}>
                  <span className="ranking__pos">{position + 1}</span>
                  <Cover track={artist.cover} size={40} className="cover--round" />
                  <span className="ranking__info">
                    <span className="ranking__name">{artist.name}</span>
                    <span className="ranking__meta">
                      {plural(artist.tracks.length, 'musica', 'musicas')}
                    </span>
                  </span>
                  <span className="ranking__value">{formatDuration(artist.seconds)}</span>
                </li>
              ))}
            </ol>
          </section>
        )}

        {stats.topAlbums.length > 0 && (
          <section className="row">
            <header className="row__head">
              <h2>Albuns mais ouvidos</h2>
            </header>
            <ol className="ranking">
              {stats.topAlbums.map((album, position) => (
                <li key={album.name}>
                  <span className="ranking__pos">{position + 1}</span>
                  <Cover track={album.cover} size={40} />
                  <span className="ranking__info">
                    <span className="ranking__name">{album.name}</span>
                    <span className="ranking__meta">{album.cover.artist}</span>
                  </span>
                  <span className="ranking__value">{formatDuration(album.seconds)}</span>
                </li>
              ))}
            </ol>
          </section>
        )}
      </div>

      {suggestions.length > 0 && (
        <>
          <header className="view__header">
            <div>
              <h2 className="listhead__title">Recomendacoes</h2>
              <p className="view__subtitle">Cada lista diz de onde veio.</p>
            </div>
          </header>

          {suggestions.map((suggestion) => (
            <CardRow
              key={suggestion.key}
              title={suggestion.title}
              action={<span className="row__reason">{suggestion.reason}</span>}
              cards={suggestion.tracks.slice(0, 12).map((track) => ({
                key: `${suggestion.key}-${track.id}`,
                title: track.title,
                subtitle: track.artist,
                cover: track,
                onPlay: () => {
                  const start = suggestion.tracks.findIndex((item) => item.id === track.id);
                  player.playTracks(suggestion.tracks, Math.max(start, 0));
                },
              }))}
            />
          ))}
        </>
      )}

      {stats.topTracks.length === 0 && <TrackList tracks={[]} emptyMessage="Sem dados ainda." />}
    </section>
  );
}
