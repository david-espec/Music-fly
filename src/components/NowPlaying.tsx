import { useEffect, useState } from 'react';
import { usePlayer } from '../player/PlayerContext';
import { useLibrary } from '../library/LibraryContext';
import { formatDuration, plural } from '../lib/format';
import { licenseLabel, detailsUrlFor } from '../lib/archive';
import { Cover } from './Cover';
import { SeekBar } from './SeekBar';
import { PlayerControls } from './PlayerControls';
import { SyncedLyrics } from './SyncedLyrics';
import { ChevronDownIcon, CloseIcon, LyricsIcon, QueueIcon, TrashIcon } from './Icons';

/** Qual painel ocupa o meio da tela cheia. */
type Pane = 'capa' | 'letra' | 'fila';

/** Tela cheia da musica atual, com letra e fila logo abaixo. */
export function NowPlaying({ onClose }: { onClose: () => void }) {
  const player = usePlayer();
  const library = useLibrary();
  const [pane, setPane] = useState<Pane>('capa');
  const track = player.current;

  const { loadLyrics } = library;
  const trackId = track?.id;

  useEffect(() => {
    if (trackId && pane === 'letra') void loadLyrics(trackId);
  }, [loadLyrics, pane, trackId]);

  if (!track) return null;

  const license = licenseLabel(track.license);
  const lyricsState = library.lyricsFor(track.id);
  const lyrics = lyricsState?.status === 'pronta' ? lyricsState.lyrics : null;

  const togglePane = (target: Pane) => setPane((current) => (current === target ? 'capa' : target));

  return (
    <div className="nowplaying" role="dialog" aria-modal="true" aria-label="Tocando agora">
      <header className="nowplaying__header">
        <button type="button" className="icon-button" aria-label="Fechar" onClick={onClose}>
          <ChevronDownIcon width={24} height={24} />
        </button>
        <span className="nowplaying__source">
          {track.source === 'local' ? 'Da sua biblioteca' : 'Acervo livre'}
        </span>
        <span className="nowplaying__panes">
          <button
            type="button"
            className={`icon-button ${pane === 'letra' ? 'is-active' : ''}`}
            aria-label="Letra da musica"
            aria-pressed={pane === 'letra'}
            onClick={() => togglePane('letra')}
          >
            <LyricsIcon width={22} height={22} />
          </button>
          <button
            type="button"
            className={`icon-button ${pane === 'fila' ? 'is-active' : ''}`}
            aria-label="Fila de reproducao"
            aria-pressed={pane === 'fila'}
            onClick={() => togglePane('fila')}
          >
            <QueueIcon width={22} height={22} />
          </button>
        </span>
      </header>

      {pane === 'fila' && (
        <div className="nowplaying__queue">
          <div className="nowplaying__queueHead">
            <h2>Na fila</h2>
            <span>{plural(player.queue.length, 'musica', 'musicas')}</span>
            <button type="button" className="button button--ghost" onClick={player.clearQueue}>
              <TrashIcon width={16} height={16} />
              Limpar
            </button>
          </div>
          <ol className="queue">
            {player.queue.map((item, position) => (
              <li
                key={`${item.id}-${position}`}
                className={position === player.currentQueuePosition ? 'queue__item--current' : ''}
              >
                <button
                  type="button"
                  className="queue__play"
                  onClick={() => player.jumpTo(position)}
                >
                  <Cover track={item} size={36} />
                  <span className="queue__info">
                    <span className="queue__title">{item.title}</span>
                    <span className="queue__artist">{item.artist}</span>
                  </span>
                </button>
                <span className="queue__duration">{formatDuration(item.duration)}</span>
                <button
                  type="button"
                  className="icon-button"
                  aria-label={`Tirar ${item.title} da fila`}
                  onClick={() => player.removeFromQueue(position)}
                >
                  <CloseIcon width={18} height={18} />
                </button>
              </li>
            ))}
          </ol>
        </div>
      )}

      {pane === 'letra' && (
        <div className="nowplaying__lyrics">
          {lyricsState?.status === 'carregando' && <p className="empty">Procurando a letra...</p>}
          {lyrics && !lyrics.instrumental && lyrics.lines.length > 0 ? (
            <SyncedLyrics lines={lyrics.lines} synced={lyrics.synced} offset={lyrics.offset} />
          ) : (
            lyricsState?.status !== 'carregando' && (
              <p className="empty">
                {lyrics?.instrumental
                  ? 'Faixa instrumental.'
                  : 'Sem letra guardada. Abra a aba Letra para procurar.'}
              </p>
            )
          )}
        </div>
      )}

      {pane === 'capa' && (
        <div className="nowplaying__art">
          <Cover track={track} size={300} className="cover--hero" />
        </div>
      )}

      <div className="nowplaying__foot">
        <div className="nowplaying__titles">
          <h1>{track.title}</h1>
          <p>{track.artist}</p>
          {track.album && track.album !== 'Album desconhecido' && (
            <p className="nowplaying__album">{track.album}</p>
          )}
          {(license || track.archiveId) && (
            <p className="nowplaying__license">
              {license}
              {license && track.archiveId && ' - '}
              {track.archiveId && (
                <a href={detailsUrlFor(track.archiveId)} target="_blank" rel="noreferrer noopener">
                  ver no acervo
                </a>
              )}
            </p>
          )}
        </div>

        <SeekBar
          currentTime={player.currentTime}
          duration={player.duration}
          onSeek={player.seek}
        />
        <PlayerControls size="large" />
      </div>
    </div>
  );
}
