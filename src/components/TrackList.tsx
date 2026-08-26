import { useState } from 'react';
import type { Track } from '../types';
import { usePlayer } from '../player/PlayerContext';
import { useLibrary } from '../library/LibraryContext';
import { formatDuration } from '../lib/format';
import { licenseLabel } from '../lib/archive';
import { Cover } from './Cover';
import { Menu, type MenuItem } from './Menu';
import { PlaylistPicker } from './PlaylistPicker';
import {
  CloudIcon,
  DownloadIcon,
  OfflineIcon,
  PauseIcon,
  PlayIcon,
  PlusIcon,
  QueueIcon,
  TrashIcon,
} from './Icons';

interface TrackListProps {
  tracks: Track[];
  /** Acoes extras no menu, especificas da tela (ex.: tirar da playlist). */
  extraActions?: (track: Track, position: number) => MenuItem[];
  /** Faixas do acervo ainda nao salvas precisam entrar na biblioteca antes. */
  onBeforePlay?: (tracks: Track[]) => Promise<Track[]>;
  emptyMessage?: string;
}

export function TrackList({
  tracks,
  extraActions,
  onBeforePlay,
  emptyMessage = 'Nada por aqui ainda.',
}: TrackListProps) {
  const player = usePlayer();
  const library = useLibrary();
  const [pickerFor, setPickerFor] = useState<string[] | null>(null);

  if (tracks.length === 0) {
    return <p className="empty">{emptyMessage}</p>;
  }

  const play = async (position: number) => {
    const resolved = onBeforePlay ? await onBeforePlay(tracks) : tracks;
    player.playTracks(resolved, position);
  };

  const withLibrary = async (track: Track): Promise<Track> => {
    if (!onBeforePlay) return track;
    const resolved = await onBeforePlay([track]);
    return resolved[0] ?? track;
  };

  return (
    <>
      <ol className="tracks">
        {tracks.map((track, position) => {
          const isCurrent = player.current?.id === track.id;
          const progress = library.downloading[track.id];
          const isDownloading = progress !== undefined;
          const license = licenseLabel(track.license);

          const actions: MenuItem[] = [
            {
              label: 'Tocar em seguida',
              icon: <QueueIcon width={16} height={16} />,
              onSelect: () => void withLibrary(track).then((t) => player.playNextInQueue([t])),
            },
            {
              label: 'Adicionar a fila',
              icon: <PlusIcon width={16} height={16} />,
              onSelect: () => void withLibrary(track).then((t) => player.addToQueue([t])),
            },
            {
              label: 'Adicionar a playlist',
              icon: <PlusIcon width={16} height={16} />,
              onSelect: () => void withLibrary(track).then((t) => setPickerFor([t.id])),
            },
            ...(extraActions?.(track, position) ?? []),
          ];

          if (track.source === 'acervo') {
            actions.push(
              track.offline
                ? {
                    label: 'Remover download',
                    icon: <CloudIcon width={16} height={16} />,
                    onSelect: () => void library.removeOffline(track),
                  }
                : {
                    label: isDownloading ? 'Baixando...' : 'Baixar para ouvir offline',
                    icon: <DownloadIcon width={16} height={16} />,
                    disabled: isDownloading,
                    onSelect: () =>
                      void withLibrary(track).then((t) => library.downloadForOffline(t)),
                  },
            );
          }

          actions.push({
            label: 'Remover da biblioteca',
            icon: <TrashIcon width={16} height={16} />,
            danger: true,
            disabled: !library.tracks.some((item) => item.id === track.id),
            onSelect: () => void library.removeTrack(track.id),
          });

          return (
            <li key={track.id} className={`track ${isCurrent ? 'track--current' : ''}`}>
              <button
                type="button"
                className="track__play"
                aria-label={
                  isCurrent && player.isPlaying ? `Pausar ${track.title}` : `Tocar ${track.title}`
                }
                onClick={() => (isCurrent ? player.toggle() : void play(position))}
              >
                <Cover track={track} size={44} />
                <span className="track__playGlyph">
                  {isCurrent && player.isPlaying ? (
                    <PauseIcon width={18} height={18} />
                  ) : (
                    <PlayIcon width={18} height={18} />
                  )}
                </span>
              </button>

              <div className="track__info">
                <span className="track__title">{track.title}</span>
                <span className="track__meta">
                  {track.artist}
                  {track.album && track.album !== 'Album desconhecido' && ` · ${track.album}`}
                </span>
                {(license || (track.source === 'acervo' && !track.offline)) && (
                  <span className="track__badges">
                    {track.source === 'acervo' && !track.offline && (
                      <span className="badge">
                        {navigator.onLine ? <CloudIcon width={12} height={12} /> : <OfflineIcon width={12} height={12} />}
                        streaming
                      </span>
                    )}
                    {license && <span className="badge badge--license">{license}</span>}
                  </span>
                )}
              </div>

              {isDownloading ? (
                <span className="track__progress" aria-label="Baixando">
                  {Math.round(progress * 100)}%
                </span>
              ) : (
                <span className="track__duration">{formatDuration(track.duration)}</span>
              )}

              <Menu items={actions} label={`Acoes de ${track.title}`} />
            </li>
          );
        })}
      </ol>

      {pickerFor && <PlaylistPicker trackIds={pickerFor} onClose={() => setPickerFor(null)} />}
    </>
  );
}
