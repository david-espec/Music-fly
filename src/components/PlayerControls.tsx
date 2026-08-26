import { usePlayer } from '../player/PlayerContext';
import {
  NextIcon,
  PauseIcon,
  PlayIcon,
  PrevIcon,
  RepeatIcon,
  RepeatOneIcon,
  ShuffleIcon,
} from './Icons';

const REPEAT_LABEL = {
  off: 'Repetir: desligado',
  all: 'Repetir: fila inteira',
  one: 'Repetir: uma musica',
} as const;

export function PlayerControls({ size = 'compact' }: { size?: 'compact' | 'large' }) {
  const player = usePlayer();
  const disabled = !player.current;
  const big = size === 'large';

  return (
    <div className={`controls ${big ? 'controls--large' : ''}`}>
      <button
        type="button"
        className={`icon-button ${player.shuffle ? 'is-active' : ''}`}
        aria-label="Ordem aleatoria"
        aria-pressed={player.shuffle}
        onClick={player.toggleShuffle}
      >
        <ShuffleIcon width={big ? 22 : 18} height={big ? 22 : 18} />
      </button>

      <button
        type="button"
        className="icon-button"
        aria-label="Musica anterior"
        disabled={disabled}
        onClick={player.previous}
      >
        <PrevIcon width={big ? 30 : 22} height={big ? 30 : 22} />
      </button>

      <button
        type="button"
        className="play-button"
        aria-label={player.isPlaying ? 'Pausar' : 'Tocar'}
        disabled={disabled}
        onClick={player.toggle}
      >
        {player.isPlaying ? (
          <PauseIcon width={big ? 30 : 22} height={big ? 30 : 22} />
        ) : (
          <PlayIcon width={big ? 30 : 22} height={big ? 30 : 22} />
        )}
      </button>

      <button
        type="button"
        className="icon-button"
        aria-label="Proxima musica"
        disabled={disabled}
        onClick={player.next}
      >
        <NextIcon width={big ? 30 : 22} height={big ? 30 : 22} />
      </button>

      <button
        type="button"
        className={`icon-button ${player.repeat !== 'off' ? 'is-active' : ''}`}
        aria-label={REPEAT_LABEL[player.repeat]}
        title={REPEAT_LABEL[player.repeat]}
        onClick={player.cycleRepeat}
      >
        {player.repeat === 'one' ? (
          <RepeatOneIcon width={big ? 22 : 18} height={big ? 22 : 18} />
        ) : (
          <RepeatIcon width={big ? 22 : 18} height={big ? 22 : 18} />
        )}
      </button>
    </div>
  );
}
