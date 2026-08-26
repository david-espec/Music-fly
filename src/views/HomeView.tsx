import { useEffect, useMemo, useRef, useState, type DragEvent } from 'react';
import { useLibrary } from '../library/LibraryContext';
import { usePlayer } from '../player/PlayerContext';
import { TrackList } from '../components/TrackList';
import { formatDuration, normalize, plural } from '../lib/format';
import { CloseIcon, FolderIcon, PlayIcon, SearchIcon, ShuffleIcon } from '../components/Icons';

type SortKey = 'recentes' | 'titulo' | 'artista' | 'album';

const SORTS: { key: SortKey; label: string }[] = [
  { key: 'recentes', label: 'Adicionadas' },
  { key: 'titulo', label: 'Titulo' },
  { key: 'artista', label: 'Artista' },
  { key: 'album', label: 'Album' },
];

export function HomeView() {
  const { tracks, loading, importFiles, importProgress } = useLibrary();
  const player = usePlayer();

  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<SortKey>('recentes');
  const [dragging, setDragging] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);

  // `webkitdirectory` nao existe na tipagem de JSX; aplicamos direto no DOM.
  useEffect(() => {
    folderInputRef.current?.setAttribute('webkitdirectory', '');
  }, []);

  const visible = useMemo(() => {
    const needle = normalize(query.trim());
    const filtered = needle
      ? tracks.filter((track) =>
          normalize(`${track.title} ${track.artist} ${track.album}`).includes(needle),
        )
      : tracks;

    const sorted = [...filtered];
    switch (sort) {
      case 'titulo':
        sorted.sort((a, b) => a.title.localeCompare(b.title, 'pt-BR'));
        break;
      case 'artista':
        sorted.sort(
          (a, b) =>
            a.artist.localeCompare(b.artist, 'pt-BR') || a.title.localeCompare(b.title, 'pt-BR'),
        );
        break;
      case 'album':
        sorted.sort(
          (a, b) =>
            a.album.localeCompare(b.album, 'pt-BR') ||
            (a.trackNo ?? 0) - (b.trackNo ?? 0) ||
            a.title.localeCompare(b.title, 'pt-BR'),
        );
        break;
      default:
        // Lotes mais recentes primeiro; dentro do lote, a ordem do album.
        sorted.sort(
          (a, b) =>
            b.addedAt - a.addedAt ||
            (a.trackNo ?? 0) - (b.trackNo ?? 0) ||
            a.title.localeCompare(b.title, 'pt-BR'),
        );
    }
    return sorted;
  }, [query, sort, tracks]);

  const totalDuration = useMemo(
    () => tracks.reduce((total, track) => total + track.duration, 0),
    [tracks],
  );

  const handleFiles = (list: FileList | null) => {
    if (!list || list.length === 0) return;
    void importFiles([...list]);
  };

  const onDrop = (event: DragEvent<HTMLElement>) => {
    event.preventDefault();
    setDragging(false);
    handleFiles(event.dataTransfer.files);
  };

  const playAll = (shuffleFirst: boolean) => {
    if (visible.length === 0) return;
    player.playTracks(visible, shuffleFirst ? Math.floor(Math.random() * visible.length) : 0);
  };

  return (
    <section
      className={`view view--home ${dragging ? 'view--dropping' : ''}`}
      onDragOver={(event) => {
        event.preventDefault();
        setDragging(true);
      }}
      onDragLeave={(event) => {
        if (event.currentTarget.contains(event.relatedTarget as Node)) return;
        setDragging(false);
      }}
      onDrop={onDrop}
    >
      <div className="topbar">
        <label className="searchbar">
          <SearchIcon width={20} height={20} />
          <input
            type="search"
            value={query}
            placeholder="Buscar musica, artista ou album"
            aria-label="Buscar musica, artista ou album"
            onChange={(event) => setQuery(event.target.value)}
          />
          {query && (
            <button
              type="button"
              className="searchbar__clear"
              aria-label="Limpar busca"
              onClick={() => setQuery('')}
            >
              <CloseIcon width={16} height={16} />
            </button>
          )}
        </label>

        <button
          type="button"
          className="button button--accent topbar__add"
          onClick={() => fileInputRef.current?.click()}
        >
          <FolderIcon width={18} height={18} />
          <span>Adicionar</span>
        </button>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept="audio/*,.mp3,.m4a,.flac,.ogg,.opus,.wav,.lrc"
        hidden
        onChange={(event) => {
          handleFiles(event.target.files);
          event.target.value = '';
        }}
      />
      <input
        ref={folderInputRef}
        type="file"
        multiple
        hidden
        onChange={(event) => {
          handleFiles(event.target.files);
          event.target.value = '';
        }}
      />

      {importProgress && (
        <div className="progress" role="status">
          <div
            className="progress__bar"
            style={{ width: `${(importProgress.done / importProgress.total) * 100}%` }}
          />
          <span>
            Importando {importProgress.done + 1} de {importProgress.total}:{' '}
            {importProgress.currentName}
          </span>
        </div>
      )}

      {tracks.length === 0 && !loading ? (
        <div className="dropzone">
          <FolderIcon width={40} height={40} />
          <h2>Arraste suas musicas para ca</h2>
          <p>
            Os arquivos ficam guardados no seu proprio dispositivo. Nada e enviado para nenhum
            servidor, e tudo continua tocando sem internet.
          </p>
          <div className="dropzone__actions">
            <button
              type="button"
              className="button button--accent"
              onClick={() => fileInputRef.current?.click()}
            >
              Escolher arquivos
            </button>
            <button
              type="button"
              className="button"
              onClick={() => folderInputRef.current?.click()}
            >
              Pasta inteira
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="listhead">
            <div>
              <h1>{query ? 'Resultados' : 'Suas musicas'}</h1>
              <p className="view__subtitle">
                {loading
                  ? 'Abrindo...'
                  : query
                    ? plural(visible.length, 'resultado', 'resultados')
                    : `${plural(tracks.length, 'musica', 'musicas')} · ${formatDuration(totalDuration)}`}
              </p>
            </div>

            <div className="listhead__actions">
              <button
                type="button"
                className="button button--accent"
                disabled={visible.length === 0}
                onClick={() => playAll(false)}
              >
                <PlayIcon width={16} height={16} />
                Tocar
              </button>
              <button
                type="button"
                className="button"
                disabled={visible.length === 0}
                onClick={() => playAll(true)}
              >
                <ShuffleIcon width={16} height={16} />
                Aleatorio
              </button>
              <label className="select">
                <span className="visually-hidden">Ordenar por</span>
                <select value={sort} onChange={(event) => setSort(event.target.value as SortKey)}>
                  {SORTS.map((option) => (
                    <option key={option.key} value={option.key}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </div>

          <TrackList
            tracks={visible}
            emptyMessage={
              query ? `Nada encontrado para "${query}".` : 'Nenhuma musica na biblioteca ainda.'
            }
          />
        </>
      )}
    </section>
  );
}
