import { useEffect, useState } from 'react';
import type { Track } from '../types';
import { getCoverUrl } from '../db';
import { MusicIcon } from './Icons';

/** Cor estavel derivada do texto, usada quando nao ha capa. */
function hueFor(text: string): number {
  let hash = 0;
  for (let i = 0; i < text.length; i++) hash = (hash * 31 + text.charCodeAt(i)) % 360;
  return hash;
}

interface CoverProps {
  track: Pick<Track, 'id' | 'album' | 'title' | 'hasCover' | 'remoteCoverUrl'>;
  size?: number;
  className?: string;
}

export function Cover({ track, size = 48, className = '' }: CoverProps) {
  const [src, setSrc] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  const { id, hasCover, remoteCoverUrl } = track;

  useEffect(() => {
    let alive = true;
    setFailed(false);
    setSrc(null);
    void (async () => {
      // A capa guardada localmente sempre vence: funciona offline e nao pisca.
      if (hasCover) {
        const url = await getCoverUrl(id);
        if (!alive) return;
        if (url) {
          setSrc(url);
          return;
        }
      }
      if (alive && remoteCoverUrl) setSrc(remoteCoverUrl);
    })();
    return () => {
      alive = false;
    };
  }, [id, hasCover, remoteCoverUrl]);

  const hue = hueFor(track.album || track.title || track.id);
  const style = {
    width: size,
    height: size,
    background: `linear-gradient(140deg, hsl(${hue} 55% 34%), hsl(${(hue + 48) % 360} 60% 20%))`,
  };

  return (
    <div className={`cover ${className}`} style={style}>
      {src && !failed ? (
        <img
          src={src}
          alt=""
          loading="lazy"
          decoding="async"
          onError={() => setFailed(true)}
        />
      ) : (
        <MusicIcon width={size * 0.42} height={size * 0.42} className="cover__glyph" />
      )}
    </div>
  );
}
