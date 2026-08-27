import { useMemo, useState } from 'react';
import type { Track } from '../types';
import { useLibrary } from '../library/LibraryContext';
import { usePlayer } from '../player/PlayerContext';
import { TrackList } from '../components/TrackList';
import { Cover } from '../components/Cover';
import { ConfirmDialog } from '../components/ConfirmDialog';
import type { MenuItem } from '../components/Menu';
import { formatDuration, normalize, plural } from '../lib/format';
import {
  ChevronDownIcon,
  InfoIcon,
  PlayIcon,
  PlusIcon,
  SearchIcon,
  ShuffleIcon,
  TrashIcon,
} from '../components/Icons';

type Section = 'playlists' | 'albuns' | 'artistas' | 'curtidas' | 'downloads';

/** O que esta aberto no detalhe. */
type Opened =
  | { kind: 'playlist'; id: string }
  | { kind: 'album'; key: string }
  | { kind: 'artista'; key: string }
  | { kind: 'curtidas' }
  | { kind: 'downloads' };

const SECTIONS: { key: Section; label: string }[] = [
  { key: 'playlists', label: 'Playlists' },
  { key: 'albuns', label: 'Albuns' },
  { key: 'artistas', label: 'Artistas' },
  { key: 'curtidas', label: 'Curtidas' },
  { key: 'downloads', label: 'Downloads' },
];

interface Collection {
  key: string;
  name: string;
  subtitle: string;
  tracks: Track[];
}

/** Agrupa faixas por album ou por artista, ja ordenadas para exibicao. */
function groupBy(tracks: Track[], by: 'album' | 'artista'): Collection[] {
  const groups = new Map<string, Track[]>();
  for (const track of tracks) {
    // Albuns homonimos de artistas diferentes nao devem se fundir.
    const key = by === 'album' ? `${track.album} ${track.artist}` : track.artist;
    const list = groups.get(key);
    if (list) list.push(track);
    else groups.set(key, [track]);
  }

  return [...groups.entries()]
    .map(([key, list]) => {
      const ordered = [...list].sort(
        (a, b) =>
          (a.trackNo ?? 9999) - (b.trackNo ?? 9999) || a.title.localeCompare(b.title, 'pt-BR'),
      );
      return by === 'album'
        ? {
            key,
            name: ordered[0].album,
            subtitle: `${ordered[0].artist} - ${plural(ordered.length, 'musica', 'musicas')}`,
            tracks: ordered,
          }
        : {
            key,
            name: ordered[0].artist,
            subtitle: plural(ordered.length, 'musica', 'musicas'),
            tracks: ordered,
          };
    })
    .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
}

export function LibraryView({ onOpenAbout }: { onOpenAbout: () => void }) {
  const library = useLibrary();
  const player = usePlayer();
  const { tracks, playlists } = library;

  const [section, setSection] = useState<Section>('playlists');
  const [opened, setOpened] = useState<Opened | null>(null);
  const [newName, setNewName] = useState('');
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [filter, setFilter] = useState('');
  const [removingPlaylist, setRemovingPlaylist] = useState<string | null>(null);

  const byId = useMemo(() => new Map(tracks.map((track) => [track.id, track])), [tracks]);
  const albums = useMemo(() => groupBy(tracks, 'album'), [tracks]);
  /** RF37: musicas curtidas, das mais recentes para as mais antigas. */
  const liked = useMemo(
    () => tracks.filter((t) => t.liked).sort((a, b) => (b.likedAt ?? 0) - (a.likedAt ?? 0)),
    [tracks],
  );
  /** RF48: o que toca sem internet. */
  const offline = useMemo(
    () => tracks.filter((t) => t.offline).sort((a, b) => b.addedAt - a.addedAt),
    [tracks],
  );
  const artists = useMemo(() => groupBy(tracks, 'artista'), [tracks]);

  // --- Detalhe de uma playlist, album ou artista -----------------------------

  if (opened) {
    const playlist =
      opened.kind === 'playlist' ? playlists.find((item) => item.id === opened.id) : undefined;
    const collection =
      opened.kind === 'album'
        ? albums.find((item) => item.key === opened.key)
        : opened.kind === 'artista'
          ? artists.find((item) => item.key === opened.key)
          : undefined;

    // Faixas apagadas somem da playlist; a ordem salva e mantida.
    const detailTracks =
      opened.kind === 'curtidas'
        ? liked
        : opened.kind === 'downloads'
          ? offline
          : playlist
            ? playlist.trackIds.map((id) => byId.get(id)).filter((track) => track !== undefined)
            : (collection?.tracks ?? []);

    const name =
      opened.kind === 'curtidas'
        ? 'Musicas curtidas'
        : opened.kind === 'downloads'
          ? 'Disponiveis offline'
          : (playlist?.name ?? collection?.name ?? '');
    const total = detailTracks.reduce((sum, track) => sum + track.duration, 0);

    const extraActions = playlist
      ? (_track: Track, position: number): MenuItem[] => [
          {
            label: 'Mover para cima',
            disabled: position === 0,
            onSelect: () => void library.movePlaylistTrack(playlist.id, position, position - 1),
          },
          {
            label: 'Mover para baixo',
            disabled: position === detailTracks.length - 1,
            onSelect: () => void library.movePlaylistTrack(playlist.id, position, position + 1),
          },
          {
            label: 'Tirar da playlist',
            onSelect: () => void library.removeFromPlaylist(playlist.id, detailTracks[position].id),
          },
        ]
      : undefined;

    return (
      <section className="view">
        <header className="view__header view__header--detail">
          <button
            type="button"
            className="icon-button icon-button--back"
            aria-label="Voltar para a biblioteca"
            onClick={() => setOpened(null)}
          >
            <ChevronDownIcon width={24} height={24} />
          </button>
          <div>
            <h1>{name}</h1>
            <p className="view__subtitle">
              {plural(detailTracks.length, 'musica', 'musicas')} - {formatDuration(total)}
            </p>
          </div>
          <div className="view__actions">
            <button
              type="button"
              className="button button--accent"
              disabled={detailTracks.length === 0}
              onClick={() => player.playTracks(detailTracks, 0)}
            >
              <PlayIcon width={16} height={16} />
              Tocar
            </button>
            <button
              type="button"
              className="button"
              disabled={detailTracks.length === 0}
              onClick={() =>
                player.playTracks(detailTracks, Math.floor(Math.random() * detailTracks.length))
              }
            >
              <ShuffleIcon width={16} height={16} />
              Aleatorio
            </button>
          </div>
        </header>

        <TrackList
          tracks={detailTracks}
          extraActions={extraActions}
          emptyMessage={
            opened.kind === 'curtidas'
              ? 'Nenhuma musica curtida ainda. Toque no coracao de uma faixa.'
              : opened.kind === 'downloads'
                ? 'Nenhuma musica guardada para ouvir offline.'
                : playlist
                  ? 'Playlist vazia. Use o menu de uma musica para adiciona-la aqui.'
                  : 'Nada por aqui.'
          }
        />
      </section>
    );
  }

  // --- Lista da biblioteca ---------------------------------------------------

  const needle = normalize(filter.trim());
  const items = (section === 'albuns' ? albums : artists).filter(
    (item) => !needle || normalize(`${item.name} ${item.subtitle}`).includes(needle),
  );

  return (
    <section className="view">
      <header className="view__header">
        <div>
          <h1>Sua biblioteca</h1>
          <p className="view__subtitle">
            {plural(playlists.length, 'playlist', 'playlists')},{' '}
            {plural(albums.length, 'album', 'albuns')},{' '}
            {plural(artists.length, 'artista', 'artistas')},{' '}
            {plural(liked.length, 'curtida', 'curtidas')} e{' '}
            {offline.length} offline
          </p>
        </div>
        <button
          type="button"
          className="icon-button"
          aria-label="Sobre e privacidade"
          title="Sobre e privacidade"
          onClick={onOpenAbout}
        >
          <InfoIcon width={22} height={22} />
        </button>
      </header>

      <div className="chips" role="tablist" aria-label="Secoes da biblioteca">
        {SECTIONS.map((item) => (
          <button
            key={item.key}
            type="button"
            role="tab"
            aria-selected={section === item.key}
            className={`chip ${section === item.key ? 'is-active' : ''}`}
            onClick={() => setSection(item.key)}
          >
            {item.label}
          </button>
        ))}
      </div>

      {section === 'playlists' ? (
        <>
          <form
            className="inline-form"
            onSubmit={(event) => {
              event.preventDefault();
              void library.createPlaylist(newName).then((playlist) => {
                setNewName('');
                setOpened({ kind: 'playlist', id: playlist.id });
              });
            }}
          >
            <input
              type="text"
              value={newName}
              placeholder="Nome da nova playlist"
              aria-label="Nome da nova playlist"
              onChange={(event) => setNewName(event.target.value)}
            />
            <button type="submit" className="button button--accent" disabled={!newName.trim()}>
              <PlusIcon width={16} height={16} />
              Criar
            </button>
          </form>

          {playlists.length === 0 ? (
            <p className="empty">
              Nenhuma playlist ainda. Crie uma acima e adicione musicas pelo menu de cada faixa.
            </p>
          ) : (
            <ul className="playlists">
              {playlists.map((playlist) => {
                const first = playlist.trackIds
                  .map((id) => byId.get(id))
                  .find((track) => track !== undefined);
                return (
                  <li key={playlist.id} className="playlists__item">
                    <button
                      type="button"
                      className="playlists__open"
                      onClick={() => setOpened({ kind: 'playlist', id: playlist.id })}
                    >
                      {first ? (
                        <Cover track={first} size={56} />
                      ) : (
                        <span className="cover cover--empty" style={{ width: 56, height: 56 }} />
                      )}
                      <span className="playlists__info">
                        <span className="playlists__name">{playlist.name}</span>
                        <span className="playlists__count">
                          {plural(playlist.trackIds.length, 'musica', 'musicas')}
                        </span>
                      </span>
                    </button>

                    {renamingId === playlist.id ? (
                      <form
                        className="playlists__rename"
                        onSubmit={(event) => {
                          event.preventDefault();
                          void library.renamePlaylist(playlist.id, renameValue);
                          setRenamingId(null);
                        }}
                      >
                        <input
                          type="text"
                          value={renameValue}
                          aria-label="Novo nome"
                          autoFocus
                          onChange={(event) => setRenameValue(event.target.value)}
                          onBlur={() => setRenamingId(null)}
                        />
                      </form>
                    ) : (
                      <button
                        type="button"
                        className="button button--ghost"
                        onClick={() => {
                          setRenamingId(playlist.id);
                          setRenameValue(playlist.name);
                        }}
                      >
                        Renomear
                      </button>
                    )}

                    <button
                      type="button"
                      className="icon-button icon-button--danger"
                      aria-label={`Apagar playlist ${playlist.name}`}
                      onClick={() => setRemovingPlaylist(playlist.id)}
                    >
                      <TrashIcon width={18} height={18} />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      ) : section === 'curtidas' || section === 'downloads' ? (
        <TrackList
          tracks={section === 'curtidas' ? liked : offline}
          emptyMessage={
            section === 'curtidas'
              ? 'Nenhuma musica curtida ainda. Toque no coracao de uma faixa na aba Inicio.'
              : 'Nenhuma musica guardada para ouvir offline.'
          }
        />
      ) : (
        <>
          <label className="search search--filter">
            <SearchIcon width={18} height={18} />
            <input
              type="search"
              value={filter}
              placeholder={section === 'albuns' ? 'Filtrar albuns' : 'Filtrar artistas'}
              aria-label={section === 'albuns' ? 'Filtrar albuns' : 'Filtrar artistas'}
              onChange={(event) => setFilter(event.target.value)}
            />
          </label>

          {items.length === 0 ? (
            <p className="empty">
              {tracks.length === 0
                ? 'Adicione musicas na aba Inicio para montar sua biblioteca.'
                : 'Nada encontrado com esse filtro.'}
            </p>
          ) : (
            <ul className="collections">
              {items.map((item) => (
                <li key={item.key}>
                  <button
                    type="button"
                    onClick={() =>
                      setOpened(
                        section === 'albuns'
                          ? { kind: 'album', key: item.key }
                          : { kind: 'artista', key: item.key },
                      )
                    }
                  >
                    <Cover
                      track={item.tracks[0]}
                      size={132}
                      className={`cover--fill ${section === 'artistas' ? 'cover--round' : ''}`}
                    />
                    <span className="collections__name">{item.name}</span>
                    <span className="collections__meta">{item.subtitle}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      {removingPlaylist &&
        (() => {
          const playlist = playlists.find((item) => item.id === removingPlaylist);
          if (!playlist) return null;
          return (
            <ConfirmDialog
              title="Apagar playlist?"
              message={`A playlist "${playlist.name}" sera apagada. As musicas continuam na sua biblioteca.`}
              confirmLabel="Apagar"
              danger
              onConfirm={() => {
                void library.removePlaylist(playlist.id);
                setRemovingPlaylist(null);
              }}
              onCancel={() => setRemovingPlaylist(null)}
            />
          );
        })()}
    </section>
  );
}
