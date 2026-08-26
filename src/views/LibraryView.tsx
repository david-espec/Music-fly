import { useEffect, useMemo, useRef, useState, type DragEvent } from 'react';
import { useLibrary } from '../library/LibraryContext';
import { usePlayer } from '../player/PlayerContext';
import { TrackList } from '../components/TrackList';
import { formatBytes, formatDuration, normalize, plural } from '../lib/format';
import { FolderIcon, PlayIcon, SearchIcon, ShuffleIcon } from '../components/Icons';

type SortKey = 'recentes' | 'titulo' | 'artista' | 'album';
type Filter = 'todas' | 'offline' | 'streaming';

const SORTS: { key: SortKey; label: string }[] = [
  { key: 'recentes', label: 'Adicionadas' },
  { key: 'titulo', label: 'Titulo' },
  { key: 'artista', label: 'Artista' },
  { key: 'album', label: 'Album' },
];

export function LibraryView() {
  const { tracks, loading, importFiles, importProgress } = useLibrary();
  const player = usePlayer();

  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<SortKey>('recentes');
  const [filter, setFilter] = useState<Filter>('todas');
  const [dragging, setDragging] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);

  // `webkitdirectory` nao existe na tipagem de JSX; aplicamos direto no DOM.
  useEffect(() => {
    folderInputRef.current?.setAttribute('webkitdirectory', '');
  }, []);

  const visible = useMemo(() => {
    const needle = normalize(query.trim());
    const filtered = tracks.filter((track) => {
      if (filter === 'offline' && !track.offline) return false;
      if (filter === 'streaming' && track.offline) return false;
      if (!needle) return true;
      return normalize(`${track.title} ${track.artist} ${track.album}`).includes(needle);
    });

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
  }, [filter, query, sort, tracks]);

  const stats = useMemo(
    () => ({
      duration: tracks.reduce((total, track) => total + track.duration, 0),
      bytes: tracks.reduce((total, track) => total + (track.offline ? track.size ?? 0 : 0), 0),
      offline: tracks.filter((track) => track.offline).length,
    }),
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
    const start = shuffleFirst ? Math.floor(Math.random() * visible.length) : 0;
    player.playTracks(visible, start);
  };

  return (
    <section
      className={`view ${dragging ? 'view--dropping' : ''}`}
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
      <header className="view__header">
        <div>
          <h1>Sua biblioteca</h1>
          <p className="view__subtitle">
            {loading
              ? 'Abrindo...'
              : `${plural(tracks.length, 'musica', 'musicas')} · ${formatDuration(stats.duration)}` +
                (stats.bytes ? ` · ${formatBytes(stats.bytes)} offline` : '')}
          </p>
        </div>
        <div className="view__actions">
          <button
            type="button"
            className="button button--accent"
            onClick={() => fileInputRef.current?.click()}
          >
            <FolderIcon width={18} height={18} />
            Adicionar musicas
          </button>
          <button type="button" className="button" onClick={() => folderInputRef.current?.click()}>
            Pasta inteira
          </button>
        </div>
      </header>

      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept="audio/*,.mp3,.m4a,.flac,.ogg,.opus,.wav"
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

      {tracks.length > 0 && (
        <div className="toolbar">
          <label className="search">
            <SearchIcon width={18} height={18} />
            <input
              type="search"
              value={query}
              placeholder="Buscar na biblioteca"
              aria-label="Buscar na biblioteca"
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>

          <div className="chips" role="group" aria-label="Filtrar">
            {(['todas', 'offline', 'streaming'] as Filter[]).map((option) => (
              <button
                key={option}
                type="button"
                className={`chip ${filter === option ? 'is-active' : ''}`}
                aria-pressed={filter === option}
                onClick={() => setFilter(option)}
              >
                {option === 'todas'
                  ? 'Todas'
                  : option === 'offline'
                    ? `Offline (${stats.offline})`
                    : 'Streaming'}
              </button>
            ))}
          </div>

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

          <div className="toolbar__play">
            <button type="button" className="button" onClick={() => playAll(false)}>
              <PlayIcon width={16} height={16} />
              Tocar
            </button>
            <button type="button" className="button" onClick={() => playAll(true)}>
              <ShuffleIcon width={16} height={16} />
              Aleatorio
            </button>
          </div>
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
          <button
            type="button"
            className="button button--accent"
            onClick={() => fileInputRef.current?.click()}
          >
            Escolher arquivos
          </button>
        </div>
      ) : (
        <TrackList
          tracks={visible}
          emptyMessage={
            query ? `Nada encontrado para "${query}".` : 'Nenhuma musica com esse filtro.'
          }
        />
      )}
    </section>
  );
}
