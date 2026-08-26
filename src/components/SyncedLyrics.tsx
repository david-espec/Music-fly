import { useCallback, useEffect, useRef, useState } from 'react';
import type { LyricLine } from '../types';
import { usePlayer } from '../player/PlayerContext';
import { activeLineIndex } from '../lib/lrc';

interface SyncedLyricsProps {
  lines: LyricLine[];
  /** Ha marcacao de tempo: da para destacar e rolar junto com a musica. */
  synced: boolean;
  /** Ajuste manual, em segundos. Positivo adianta a letra. */
  offset: number;
  /** Rolagem automatica desligada em espacos apertados (ex.: o mini player). */
  autoScroll?: boolean;
}

/** Quanto tempo a rolagem automatica espera depois que o usuario rola na mao. */
const MANUAL_SCROLL_PAUSE = 5000;

export function SyncedLyrics({ lines, synced, offset, autoScroll = true }: SyncedLyricsProps) {
  const player = usePlayer();
  const { getCurrentTime, isPlaying, seek } = player;

  const containerRef = useRef<HTMLDivElement>(null);
  const lineRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const lastManualScroll = useRef(0);
  const [active, setActive] = useState(-1);

  // O destaque acompanha o audio quadro a quadro, mas so re-renderiza quando a
  // linha muda de fato.
  useEffect(() => {
    if (!synced || lines.length === 0) {
      setActive(-1);
      return;
    }

    let frame = 0;
    let current = -1;

    const tick = () => {
      const index = activeLineIndex(lines, getCurrentTime() + offset);
      if (index !== current) {
        current = index;
        setActive(index);
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [getCurrentTime, lines, offset, synced]);

  // Enquanto pausado o laco acima segue rodando barato; ao voltar a tocar o
  // destaque ja esta correto. Aqui so recentralizamos ao trocar de linha.
  useEffect(() => {
    if (!autoScroll || !synced || active < 0) return;
    if (Date.now() - lastManualScroll.current < MANUAL_SCROLL_PAUSE) return;

    const element = lineRefs.current[active];
    const container = containerRef.current;
    if (!element || !container) return;

    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    container.scrollTo({
      top: element.offsetTop - container.clientHeight / 2 + element.clientHeight / 2,
      behavior: reduceMotion ? 'auto' : 'smooth',
    });
  }, [active, autoScroll, synced]);

  const noteManualScroll = useCallback(() => {
    lastManualScroll.current = Date.now();
  }, []);

  if (lines.length === 0) return null;

  return (
    <div
      className={`lyrics ${synced ? 'lyrics--synced' : 'lyrics--plain'}`}
      ref={containerRef}
      onWheel={noteManualScroll}
      onTouchMove={noteManualScroll}
    >
      {lines.map((line, index) => {
        const state =
          !synced || active < 0
            ? ''
            : index === active
              ? 'is-active'
              : index < active
                ? 'is-past'
                : 'is-future';

        return (
          <button
            key={`${index}-${line.time}`}
            type="button"
            ref={(node) => {
              lineRefs.current[index] = node;
            }}
            className={`lyrics__line ${state}`}
            // Sem sincronia nao ha para onde pular: vira texto simples.
            disabled={!synced || !Number.isFinite(line.time)}
            aria-current={synced && index === active ? 'true' : undefined}
            onClick={() => {
              if (!Number.isFinite(line.time)) return;
              noteManualScroll();
              lastManualScroll.current = 0;
              seek(Math.max(0, line.time - offset));
              if (!isPlaying) player.toggle();
            }}
          >
            {line.text || ' '}
          </button>
        );
      })}
    </div>
  );
}
