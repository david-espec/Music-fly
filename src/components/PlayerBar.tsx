import { useState } from 'react';
import { usePlayer } from '../player/PlayerContext';
import { Cover } from './Cover';
import { SeekBar } from './SeekBar';
import { PlayerControls } from './PlayerControls';
import { NowPlaying } from './NowPlaying';
import { LyricsIcon, MuteIcon, VolumeIcon } from './Icons';

export function PlayerBar({ onOpenLyrics }: { onOpenLyrics: () => void }) {
  const player = usePlayer();
  const [expanded, setExpanded] = useState(false);
  const track = player.current;

  if (!track) return null;

  const aoVivo = track.source === 'radio';
  const progress =
    player.duration > 0 ? Math.min(player.currentTime / player.duration, 1) * 100 : 0;

  return (
    <>
      <div className="playerbar">
        {/* No celular a barra de busca some; esta linha mantem o progresso visivel. */}
        <span className="playerbar__line" style={{ width: `${progress}%` }} aria-hidden="true" />
        <button
          type="button"
          className="playerbar__track"
          aria-label={`Abrir ${track.title}`}
          onClick={() => setExpanded(true)}
        >
          <Cover track={track} size={48} />
          <span className="playerbar__info">
            <span className="playerbar__title">{track.title}</span>
            <span className="playerbar__artist">
              {aoVivo && !player.isLoading && <span className="live">Ao vivo</span>}
              {player.isLoading ? 'Sintonizando...' : track.artist}
            </span>
          </span>
        </button>

        <div className="playerbar__center">
          <PlayerControls />
          {!aoVivo && (
            <div className="playerbar__seek">
              <SeekBar
                currentTime={player.currentTime}
                duration={player.duration}
                onSeek={player.seek}
              />
            </div>
          )}
        </div>

        <div className="playerbar__volume">
          {!aoVivo && (
            <button
              type="button"
              className="icon-button playerbar__lyrics"
              aria-label="Ver a letra"
              title="Ver a letra"
              onClick={onOpenLyrics}
            >
              <LyricsIcon />
            </button>
          )}
          <button
            type="button"
            className="icon-button"
            aria-label={player.muted ? 'Ativar som' : 'Silenciar'}
            onClick={player.toggleMute}
          >
            {player.muted || player.volume === 0 ? <MuteIcon /> : <VolumeIcon />}
          </button>
          <input
            type="range"
            className="volume"
            min={0}
            max={1}
            step={0.01}
            value={player.muted ? 0 : player.volume}
            aria-label="Volume"
            onChange={(event) => player.setVolume(Number(event.target.value))}
          />
        </div>
      </div>

      {expanded && <NowPlaying onClose={() => setExpanded(false)} />}
    </>
  );
}
