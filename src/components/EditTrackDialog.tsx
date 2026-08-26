import { useEffect, useRef, useState } from 'react';
import { useLibrary } from '../library/LibraryContext';
import { Cover } from './Cover';
import { CloseIcon, TrashIcon } from './Icons';

/**
 * Corrige as informacoes de uma faixa cujas tags vieram erradas ou vazias.
 *
 * Recebe o id, e nao a faixa: a capa e trocada enquanto o dialogo esta aberto,
 * e uma copia congelada continuaria mostrando a imagem antiga.
 */
export function EditTrackDialog({ trackId, onClose }: { trackId: string; onClose: () => void }) {
  const { tracks, updateTrack, setTrackCover } = useLibrary();
  const track = tracks.find((item) => item.id === trackId);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  const [saving, setSaving] = useState(false);

  // Rotulos padrao viram campo vazio: o usuario preenche em vez de apagar.
  const [title, setTitle] = useState(track?.title ?? '');
  const [artist, setArtist] = useState(
    !track || track.artist === 'Artista desconhecido' ? '' : track.artist,
  );
  const [album, setAlbum] = useState(
    !track || track.album === 'Album desconhecido' ? '' : track.album,
  );
  const [year, setYear] = useState(track?.year ? String(track.year) : '');
  const [trackNo, setTrackNo] = useState(track?.trackNo ? String(track.trackNo) : '');

  useEffect(() => {
    titleRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  // A faixa pode ter sido apagada em outra aba enquanto o dialogo estava aberto.
  if (!track) return null;

  const save = async () => {
    if (saving || !title.trim()) return;
    setSaving(true);
    await updateTrack(track.id, {
      title,
      artist,
      album,
      year: year.trim() ? Number(year) || undefined : undefined,
      trackNo: trackNo.trim() ? Number(trackNo) || undefined : undefined,
    });
    onClose();
  };

  const showsCover = track.hasCover || track.remoteCoverUrl;

  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-label="Editar informacoes">
      <button type="button" className="overlay__backdrop" aria-label="Fechar" onClick={onClose} />
      <div className="dialog">
        <header className="dialog__header">
          <h2>Editar informacoes</h2>
          <button type="button" className="icon-button" aria-label="Fechar" onClick={onClose}>
            <CloseIcon />
          </button>
        </header>

        <div className="editcover">
          <Cover track={track} size={88} />
          <div className="editcover__actions">
            <button
              type="button"
              className="button"
              onClick={() => imageInputRef.current?.click()}
            >
              {showsCover ? 'Trocar capa' : 'Escolher capa'}
            </button>
            {track.hasCover && (
              <button
                type="button"
                className="button button--ghost"
                onClick={() => void setTrackCover(track.id, null)}
              >
                <TrashIcon width={15} height={15} />
                Remover capa
              </button>
            )}
          </div>
        </div>

        <input
          ref={imageInputRef}
          type="file"
          accept="image/*"
          hidden
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void setTrackCover(track.id, file);
            event.target.value = '';
          }}
        />

        <form
          className="editform"
          onSubmit={(event) => {
            event.preventDefault();
            void save();
          }}
        >
          <label>
            <span>Titulo</span>
            <input
              ref={titleRef}
              type="text"
              value={title}
              required
              onChange={(event) => setTitle(event.target.value)}
            />
          </label>

          <label>
            <span>Artista</span>
            <input
              type="text"
              value={artist}
              placeholder="Artista desconhecido"
              onChange={(event) => setArtist(event.target.value)}
            />
          </label>

          <label>
            <span>Album</span>
            <input
              type="text"
              value={album}
              placeholder="Album desconhecido"
              onChange={(event) => setAlbum(event.target.value)}
            />
          </label>

          <div className="editform__row">
            <label>
              <span>Ano</span>
              <input
                type="number"
                inputMode="numeric"
                min={1000}
                max={2999}
                value={year}
                placeholder="--"
                onChange={(event) => setYear(event.target.value)}
              />
            </label>
            <label>
              <span>Faixa n&ordm;</span>
              <input
                type="number"
                inputMode="numeric"
                min={1}
                max={999}
                value={trackNo}
                placeholder="--"
                onChange={(event) => setTrackNo(event.target.value)}
              />
            </label>
          </div>

          <p className="dialog__hint">
            Isto muda so o que o Music Fly mostra. O arquivo de audio no seu aparelho continua
            como esta.
          </p>

          <div className="dialog__actions">
            <button type="button" className="button" onClick={onClose}>
              Cancelar
            </button>
            <button
              type="submit"
              className="button button--accent"
              disabled={!title.trim() || saving}
            >
              Salvar
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
