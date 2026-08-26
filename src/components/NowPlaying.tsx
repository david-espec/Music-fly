import { useState } from 'react';
import { usePlayer } from '../player/PlayerContext';
import { formatDuration, plural } from '../lib/format';
import { licenseLabel, detailsUrlFor } from '../lib/archive';
import { Cover } from './Cover';
import { SeekBar } from './SeekBar';
import { PlayerControls } from './PlayerControls';
import { ChevronDownIcon, CloseIcon, QueueIcon, TrashIcon } from './Icons';

/** Tela cheia da musica atual, com a fila logo abaixo. */
export function NowPlaying({ onClose }: { onClose: () => void }) {
  const player = usePlayer();
  const [showQueue, setShowQueue] = useState(false);
  const track = player.current;

  if (!track) return null;
  const license = licenseLabel(track.license);

  return (
    <div className="nowplaying" role="dialog" aria-modal="true" aria-label="Tocando agora">
      <header className="nowplaying__header">
        <button type="button" className="icon-button" aria-label="Fechar" onClick={onClose}>
          <ChevronDownIcon width={24} height={24} />
        </button>
        <span className="nowplaying__source">
          {track.source === 'local' ? 'Da sua biblioteca' : 'Acervo livre'}
        </span>
        <button
          type="button"
          className={`icon-button ${showQueue ? 'is-active' : ''}`}
          aria-label="Fila de reproducao"
          aria-pressed={showQueue}
          onClick={() => setShowQueue((value) => !value)}
        >
          <QueueIcon width={22} height={22} />
        </button>
      </header>

      {showQueue ? (
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
                <button type="button" className="queue__play" onClick={() => player.jumpTo(position)}>
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
      ) : (
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
              {license && track.archiveId && ' · '}
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
