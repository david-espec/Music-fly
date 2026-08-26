import { useState } from 'react';
import { useLibrary } from '../library/LibraryContext';
import { CloseIcon, PlusIcon } from './Icons';
import { plural } from '../lib/format';

interface PlaylistPickerProps {
  trackIds: string[];
  onClose: () => void;
}

/** Dialogo para jogar uma ou mais faixas numa playlist nova ou existente. */
export function PlaylistPicker({ trackIds, onClose }: PlaylistPickerProps) {
  const { playlists, addToPlaylist, createPlaylist } = useLibrary();
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);

  const create = async () => {
    if (busy) return;
    setBusy(true);
    await createPlaylist(name, trackIds);
    onClose();
  };

  const pick = async (id: string) => {
    if (busy) return;
    setBusy(true);
    await addToPlaylist(id, trackIds);
    onClose();
  };

  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-label="Adicionar a playlist">
      <button type="button" className="overlay__backdrop" aria-label="Fechar" onClick={onClose} />
      <div className="dialog">
        <header className="dialog__header">
          <h2>Adicionar a playlist</h2>
          <button type="button" className="icon-button" aria-label="Fechar" onClick={onClose}>
            <CloseIcon />
          </button>
        </header>

        <p className="dialog__hint">{plural(trackIds.length, 'musica', 'musicas')} selecionada(s).</p>

        <form
          className="dialog__create"
          onSubmit={(event) => {
            event.preventDefault();
            void create();
          }}
        >
          <input
            type="text"
            value={name}
            placeholder="Criar nova playlist..."
            aria-label="Nome da nova playlist"
            onChange={(event) => setName(event.target.value)}
          />
          <button type="submit" className="button button--accent" disabled={!name.trim() || busy}>
            <PlusIcon width={16} height={16} />
            Criar
          </button>
        </form>

        {playlists.length > 0 && (
          <ul className="dialog__list">
            {playlists.map((playlist) => (
              <li key={playlist.id}>
                <button type="button" onClick={() => void pick(playlist.id)} disabled={busy}>
                  <span>{playlist.name}</span>
                  <small>{plural(playlist.trackIds.length, 'musica', 'musicas')}</small>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
