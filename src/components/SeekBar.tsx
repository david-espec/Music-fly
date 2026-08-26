import { useEffect, useState } from 'react';
import { formatDuration, formatPosition } from '../lib/format';

interface SeekBarProps {
  currentTime: number;
  duration: number;
  onSeek: (seconds: number) => void;
  showTimes?: boolean;
}

/**
 * Barra de progresso arrastavel. Enquanto o usuario arrasta, a posicao local
 * tem prioridade sobre `currentTime`, para o cursor nao pular.
 */
export function SeekBar({ currentTime, duration, onSeek, showTimes = true }: SeekBarProps) {
  const [scrubbing, setScrubbing] = useState(false);
  const [scrubValue, setScrubValue] = useState(0);

  useEffect(() => {
    if (!scrubbing) setScrubValue(currentTime);
  }, [currentTime, scrubbing]);

  const max = duration > 0 ? duration : 0;
  const value = Math.min(scrubbing ? scrubValue : currentTime, max);
  const percent = max > 0 ? (value / max) * 100 : 0;

  const commit = (seconds: number) => {
    setScrubbing(false);
    onSeek(seconds);
  };

  return (
    <div className="seek">
      {showTimes && <span className="seek__time">{formatPosition(value)}</span>}
      <div className="seek__track" style={{ ['--seek-progress' as string]: `${percent}%` }}>
        <input
          type="range"
          min={0}
          max={max || 1}
          step={0.5}
          value={value}
          disabled={max === 0}
          aria-label="Posicao da musica"
          onChange={(event) => {
            setScrubbing(true);
            setScrubValue(Number(event.target.value));
          }}
          onPointerUp={(event) => commit(Number((event.target as HTMLInputElement).value))}
          onKeyUp={(event) => commit(Number((event.target as HTMLInputElement).value))}
          onBlur={() => scrubbing && commit(scrubValue)}
        />
      </div>
      {showTimes && <span className="seek__time">{formatDuration(duration)}</span>}
    </div>
  );
}
