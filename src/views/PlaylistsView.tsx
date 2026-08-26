import { useMemo, useState } from 'react';
import { useLibrary } from '../library/LibraryContext';
import { usePlayer } from '../player/PlayerContext';
import { TrackList } from '../components/TrackList';
import { Cover } from '../components/Cover';
import { formatDuration, plural } from '../lib/format';
import type { MenuItem } from '../components/Menu';
import type { Track } from '../types';
import { ChevronDownIcon, PlayIcon, PlusIcon, ShuffleIcon, TrashIcon } from '../components/Icons';

export function PlaylistsView() {
  const { playlists, tracks, createPlaylist, removePlaylist, renamePlaylist, removeFromPlaylist, movePlaylistTrack } =
    useLibrary();
  const player = usePlayer();

  const [openId, setOpenId] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');

  const byId = useMemo(() => new Map(tracks.map((track) => [track.id, track])), [tracks]);
  const open = playlists.find((playlist) => playlist.id === openId) ?? null;

  // Faixas apagadas da biblioteca somem da playlist; a ordem salva e mantida.
  const openTracks = useMemo(
    () => (open ? open.trackIds.map((id) => byId.get(id)).filter((t) => t !== undefined) : []),
    [byId, open],
  );

  const create = async () => {
    const playlist = await createPlaylist(newName);
    setNewName('');
    setOpenId(playlist.id);
  };

  if (open) {
    const total = openTracks.reduce((sum, track) => sum + track.duration, 0);

    const extraActions = (_track: Track, position: number): MenuItem[] => [
      {
        label: 'Mover para cima',
        disabled: position === 0,
        onSelect: () => void movePlaylistTrack(open.id, position, position - 1),
      },
      {
        label: 'Mover para baixo',
        disabled: position === openTracks.length - 1,
        onSelect: () => void movePlaylistTrack(open.id, position, position + 1),
      },
      {
        label: 'Tirar da playlist',
        onSelect: () => void removeFromPlaylist(open.id, openTracks[position].id),
      },
    ];

    return (
      <section className="view">
        <header className="view__header view__header--detail">
          <button
            type="button"
            className="icon-button icon-button--back"
            aria-label="Voltar as playlists"
            onClick={() => setOpenId(null)}
          >
            <ChevronDownIcon width={24} height={24} />
          </button>
          <div>
            <h1>{open.name}</h1>
            <p className="view__subtitle">
              {plural(openTracks.length, 'musica', 'musicas')} · {formatDuration(total)}
            </p>
          </div>
          <div className="view__actions">
            <button
              type="button"
              className="button button--accent"
              disabled={openTracks.length === 0}
              onClick={() => player.playTracks(openTracks, 0)}
            >
              <PlayIcon width={16} height={16} />
              Tocar
            </button>
            <button
              type="button"
              className="button"
              disabled={openTracks.length === 0}
              onClick={() =>
                player.playTracks(openTracks, Math.floor(Math.random() * openTracks.length))
              }
            >
              <ShuffleIcon width={16} height={16} />
              Aleatorio
            </button>
          </div>
        </header>

        <TrackList
          tracks={openTracks}
          extraActions={extraActions}
          emptyMessage="Playlist vazia. Use o menu de uma musica para adiciona-la aqui."
        />
      </section>
    );
  }

  return (
    <section className="view">
      <header className="view__header">
        <div>
          <h1>Playlists</h1>
          <p className="view__subtitle">{plural(playlists.length, 'playlist', 'playlists')}</p>
        </div>
      </header>

      <form
        className="inline-form"
        onSubmit={(event) => {
          event.preventDefault();
          void create();
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
            const first = playlist.trackIds.map((id) => byId.get(id)).find((t) => t !== undefined);
            return (
              <li key={playlist.id} className="playlists__item">
                <button type="button" className="playlists__open" onClick={() => setOpenId(playlist.id)}>
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
                      void renamePlaylist(playlist.id, renameValue);
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
                  onClick={() => void removePlaylist(playlist.id)}
                >
                  <TrashIcon width={18} height={18} />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
