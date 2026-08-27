import { useEffect, useMemo, useRef, useState, type DragEvent } from 'react';
import type { Track } from '../types';
import { useLibrary } from '../library/LibraryContext';
import { usePlayer } from '../player/PlayerContext';
import { TrackList } from '../components/TrackList';
import { CardRow, type Card } from '../components/CardRow';
import { formatDuration, plural } from '../lib/format';
import { searchGroups, searchPlaylists, searchTracks, terms } from '../lib/search';
import {
  CloseIcon,
  DownloadIcon,
  FolderIcon,
  PlayIcon,
  SearchIcon,
  ShuffleIcon,
} from '../components/Icons';
import { useInstall } from '../install/InstallContext';
import { InstallDialog } from '../install/InstallDialog';

type SortKey = 'recentes' | 'titulo' | 'artista' | 'album';

const SORTS: { key: SortKey; label: string }[] = [
  { key: 'recentes', label: 'Adicionadas' },
  { key: 'titulo', label: 'Titulo' },
  { key: 'artista', label: 'Artista' },
  { key: 'album', label: 'Album' },
];

/** Quantos cartoes cabem numa faixa horizontal antes de virar excesso. */
const ROW_LIMIT = 12;

export function HomeView() {
  const { tracks, playlists, loading, importFiles, importProgress } = useLibrary();
  const player = usePlayer();

  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<SortKey>('recentes');
  const [dragging, setDragging] = useState(false);
  const [showInstall, setShowInstall] = useState(false);
  const { installed } = useInstall();

  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);

  // `webkitdirectory` nao existe na tipagem de JSX; aplicamos direto no DOM.
  useEffect(() => {
    folderInputRef.current?.setAttribute('webkitdirectory', '');
  }, []);

  /** Termos da busca, usados no ranking e no realce. */
  const queryTerms = useMemo(() => terms(query), [query]);
  const searching = queryTerms.length > 0;

  /** Artistas e albuns cujo nome casa com a busca. */
  const artistHits = useMemo(
    () => (searching ? searchGroups(tracks, query, 'artist').slice(0, ROW_LIMIT) : []),
    [query, searching, tracks],
  );
  const albumHits = useMemo(
    () => (searching ? searchGroups(tracks, query, 'album').slice(0, ROW_LIMIT) : []),
    [query, searching, tracks],
  );
  /** RF46: playlists tambem entram nos resultados. */
  const playlistHits = useMemo(
    () => (searching ? searchPlaylists(playlists, query).slice(0, ROW_LIMIT) : []),
    [playlists, query, searching],
  );
  const trackById = useMemo(() => new Map(tracks.map((t) => [t.id, t])), [tracks]);

  const visible = useMemo(() => {
    // Com busca ativa, quem manda e a relevancia, nao a ordenacao escolhida.
    if (searching) {
      return searchTracks(tracks, query).map((hit) => hit.track);
    }

    const sorted = [...tracks];
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
  }, [query, searching, sort, tracks]);

  /** Ultimas faixas ouvidas, da mais recente para a mais antiga. */
  const recentlyPlayed = useMemo<Card[]>(
    () =>
      tracks
        .filter((track) => track.lastPlayedAt)
        .sort((a, b) => (b.lastPlayedAt ?? 0) - (a.lastPlayedAt ?? 0))
        .slice(0, ROW_LIMIT)
        .map((track) => ({
          key: track.id,
          title: track.title,
          subtitle: track.artist,
          cover: track,
          // Continua dali com o resto do historico na fila.
          onPlay: () => player.playTracks([track], 0),
        })),
    [player, tracks],
  );

  /** Albuns adicionados por ultimo, um cartao por album. */
  const recentAlbums = useMemo<Card[]>(() => {
    const groups = new Map<string, Track[]>();
    for (const track of tracks) {
      const key = `${track.album} ${track.artist}`;
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
        return {
          key,
          addedAt: Math.max(...list.map((track) => track.addedAt)),
          tracks: ordered,
        };
      })
      .sort((a, b) => b.addedAt - a.addedAt)
      .slice(0, ROW_LIMIT)
      .map(({ key, tracks: albumTracks }) => ({
        key,
        title: albumTracks[0].album,
        subtitle: `${albumTracks[0].artist} - ${plural(albumTracks.length, 'musica', 'musicas')}`,
        cover: albumTracks[0],
        onPlay: () => player.playTracks(albumTracks, 0),
      }));
  }, [player, tracks]);

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
          className="button topbar__add"
          // No celular o rotulo e escondido por CSS; sem isto o botao ficaria
          // sem nome nenhum para leitores de tela.
          aria-label="Adicionar musicas"
          onClick={() => fileInputRef.current?.click()}
        >
          <FolderIcon width={18} height={18} />
          <span>Adicionar</span>
        </button>

        {/* Some depois de instalado: nao ha o que baixar de novo. */}
        {!installed && (
          <button
            type="button"
            className="button button--accent topbar__install"
            aria-label="Baixar app"
            onClick={() => setShowInstall(true)}
          >
            <DownloadIcon width={18} height={18} />
            <span>Baixar app</span>
          </button>
        )}
      </div>

      {showInstall && <InstallDialog onClose={() => setShowInstall(false)} />}

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
          <h2>Comece adicionando suas musicas</h2>
          <p>
            Escolha arquivos do aparelho ou arraste-os para ca. Eles ficam guardados no seu proprio
            dispositivo, nada e enviado para nenhum servidor, e tudo continua tocando sem internet.
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
          <p className="dropzone__hint">
            Formatos aceitos: MP3, FLAC, M4A, OGG, WAV. Arquivos <code>.lrc</code> na mesma selecao
            viram a letra sincronizada das musicas de mesmo nome.
          </p>
        </div>
      ) : (
        <>
          {/* Durante a busca as secoes de descoberta saem da frente. */}
          {!searching && (
            <>
              <CardRow title="Continuar ouvindo" cards={recentlyPlayed} />
              <CardRow title="Adicionadas recentemente" cards={recentAlbums} />
            </>
          )}

          <div className="listhead">
            <div>
              <h2 className="listhead__title">{searching ? 'Musicas' : 'Todas as musicas'}</h2>
              <p className="view__subtitle">
                {loading
                  ? 'Abrindo...'
                  : searching
                    ? `${plural(visible.length, 'resultado', 'resultados')} para "${query.trim()}"`
                    : `${plural(tracks.length, 'musica', 'musicas')} - ${formatDuration(totalDuration)}`}
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
              {!searching && (
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
              )}
            </div>
          </div>

          <TrackList
            tracks={visible}
            highlight={queryTerms}
            emptyMessage={
              searching
                ? `Nenhuma musica com "${query.trim()}".`
                : 'Nenhuma musica na biblioteca ainda.'
            }
          />

          {/* Artistas e albuns cujo nome casa, mesmo sem musica correspondente. */}
          {searching && (
            <>
              <CardRow
                title="Artistas"
                round
                cards={artistHits.map((hit) => ({
                  key: hit.key,
                  title: hit.name,
                  subtitle: plural(hit.tracks.length, 'musica', 'musicas'),
                  cover: hit.tracks[0],
                  onPlay: () => player.playTracks(hit.tracks, 0),
                }))}
              />
              <CardRow
                title="Albuns"
                cards={albumHits.map((hit) => ({
                  key: hit.key,
                  title: hit.name,
                  subtitle: `${hit.tracks[0].artist} - ${plural(hit.tracks.length, 'musica', 'musicas')}`,
                  cover: hit.tracks[0],
                  onPlay: () => player.playTracks(hit.tracks, 0),
                }))}
              />

              <CardRow
                title="Playlists"
                cards={playlistHits.flatMap((hit) => {
                  const faixas = hit.playlist.trackIds
                    .map((id) => trackById.get(id))
                    .filter((t) => t !== undefined);
                  // Sem faixas nao ha capa para desenhar o cartao.
                  if (faixas.length === 0) return [];
                  return [{
                    key: hit.playlist.id,
                    title: hit.playlist.name,
                    subtitle: plural(faixas.length, 'musica', 'musicas'),
                    cover: faixas[0],
                    onPlay: () => player.playTracks(faixas, 0),
                  }];
                })}
              />

              {visible.length === 0 &&
                artistHits.length === 0 &&
                albumHits.length === 0 &&
                playlistHits.length === 0 && (
                  <p className="empty">
                    Nada encontrado para "{query.trim()}". Tente outra palavra, ou parte dela.
                  </p>
                )}
            </>
          )}
        </>
      )}
    </section>
  );
}
