import { useCallback, useEffect, useRef, useState } from 'react';
import type { ArchiveAlbum, Track } from '../types';
import { fetchAlbumTracks, licenseLabel, searchAlbums, detailsUrlFor } from '../lib/archive';
import { useLibrary } from '../library/LibraryContext';
import { usePlayer } from '../player/PlayerContext';
import { useToast } from '../components/Toast';
import { TrackList } from '../components/TrackList';
import { plural } from '../lib/format';
import {
  ChevronDownIcon,
  DownloadIcon,
  OfflineIcon,
  PlayIcon,
  SearchIcon,
} from '../components/Icons';

export function DiscoverView() {
  const { saveArchiveTracks, downloadForOffline } = useLibrary();
  const player = usePlayer();
  const notify = useToast();

  const [query, setQuery] = useState('');
  const [submitted, setSubmitted] = useState('');
  const [albums, setAlbums] = useState<ArchiveAlbum[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [online, setOnline] = useState(navigator.onLine);

  const [openAlbum, setOpenAlbum] = useState<ArchiveAlbum | null>(null);
  const [albumTracks, setAlbumTracks] = useState<Track[]>([]);
  const [albumLoading, setAlbumLoading] = useState(false);
  const [albumLicense, setAlbumLicense] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  // Refs para o ouvinte de 'online', que e registrado uma unica vez.
  const runSearchRef = useRef<((term: string, page: number) => Promise<void>) | null>(null);
  const submittedRef = useRef('');

  useEffect(() => {
    const goOffline = () => setOnline(false);
    const goOnline = () => {
      setOnline(true);
      // A internet voltou: refaz a busca que havia falhado.
      setAlbums((current) => {
        if (current.length === 0) void runSearchRef.current?.(submittedRef.current, 1);
        return current;
      });
    };
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, []);

  const runSearch = useCallback(
    async (term: string, targetPage: number) => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      // Sem rede, o fetch so falharia depois do timeout do service worker.
      if (!navigator.onLine) {
        setLoading(false);
        setError(
          'Voce esta offline. A descoberta precisa de internet, mas sua biblioteca continua tocando.',
        );
        return;
      }

      setLoading(true);
      setError(null);
      try {
        const result = await searchAlbums(term, targetPage, controller.signal);
        if (controller.signal.aborted) return;
        setAlbums((current) =>
          targetPage === 1 ? result.albums : [...current, ...result.albums],
        );
        setTotal(result.total);
        setPage(targetPage);
      } catch (cause) {
        if ((cause as Error).name === 'AbortError') return;
        setError(
          navigator.onLine
            ? 'Nao foi possivel falar com o acervo. Tente de novo em instantes.'
            : 'Voce esta offline. A descoberta precisa de internet, mas sua biblioteca continua tocando.',
        );
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    runSearchRef.current = runSearch;
  }, [runSearch]);

  useEffect(() => {
    submittedRef.current = submitted;
  }, [submitted]);

  // Carrega uma selecao inicial na primeira visita.
  useEffect(() => {
    void runSearch('', 1);
  }, [runSearch]);

  useEffect(() => () => abortRef.current?.abort(), []);

  const openAlbumDetails = async (album: ArchiveAlbum) => {
    setOpenAlbum(album);
    setAlbumTracks([]);
    setAlbumLicense(null);
    setAlbumLoading(true);
    try {
      const { tracks, license } = await fetchAlbumTracks(album);
      setAlbumTracks(tracks);
      setAlbumLicense(licenseLabel(license));
      if (tracks.length === 0) notify('Esse item nao tem faixas tocaveis.', 'erro');
    } catch {
      notify('Nao foi possivel abrir esse album.', 'erro');
    } finally {
      setAlbumLoading(false);
    }
  };

  /**
   * Persiste as faixas do album e passa a exibir as versoes ja salvas: reabrir
   * o mesmo album gera ids novos, e sem essa troca o progresso de download
   * ficaria preso a uma faixa que a lista nao mostra mais.
   */
  const resolveTracks = useCallback(
    async (list: Track[]) => {
      const saved = await saveArchiveTracks(list);
      if (saved.length === albumTracks.length) setAlbumTracks(saved);
      return saved;
    },
    [albumTracks.length, saveArchiveTracks],
  );

  const downloadAlbum = async () => {
    const saved = await resolveTracks(albumTracks);
    notify(`Baixando ${plural(saved.length, 'musica', 'musicas')}...`);
    for (const track of saved) {
      if (!track.offline) await downloadForOffline(track);
    }
  };

  if (openAlbum) {
    return (
      <section className="view">
        <header className="view__header view__header--detail">
          <button
            type="button"
            className="icon-button icon-button--back"
            aria-label="Voltar para a busca"
            onClick={() => setOpenAlbum(null)}
          >
            <ChevronDownIcon width={24} height={24} />
          </button>
          <div>
            <h1>{openAlbum.title}</h1>
            <p className="view__subtitle">
              {openAlbum.creator}
              {openAlbum.year ? ` · ${openAlbum.year}` : ''}
              {albumLicense ? ` · ${albumLicense}` : ''}
            </p>
            <p className="view__subtitle">
              <a href={detailsUrlFor(openAlbum.identifier)} target="_blank" rel="noreferrer noopener">
                Ver a pagina original no acervo
              </a>
            </p>
          </div>
          <div className="view__actions">
            <button
              type="button"
              className="button button--accent"
              disabled={albumTracks.length === 0}
              onClick={() => {
                void resolveTracks(albumTracks).then((saved) => player.playTracks(saved, 0));
              }}
            >
              <PlayIcon width={16} height={16} />
              Tocar album
            </button>
            <button
              type="button"
              className="button"
              disabled={albumTracks.length === 0}
              onClick={() => void downloadAlbum()}
            >
              <DownloadIcon width={16} height={16} />
              Baixar tudo
            </button>
          </div>
        </header>

        {albumLoading ? (
          <p className="empty">Carregando faixas...</p>
        ) : (
          <TrackList
            tracks={albumTracks}
            onBeforePlay={resolveTracks}
            emptyMessage="Nenhuma faixa tocavel neste item."
          />
        )}
      </section>
    );
  }

  return (
    <section className="view">
      <header className="view__header">
        <div>
          <h1>Descobrir</h1>
          <p className="view__subtitle">
            Acervo publico do Internet Archive: musica de livre distribuicao, sem anuncios e sem
            cadastro.
          </p>
        </div>
      </header>

      {!online && (
        <div className="notice">
          <OfflineIcon width={18} height={18} />
          Voce esta offline. A descoberta volta assim que a internet voltar; sua biblioteca offline
          continua tocando normalmente.
        </div>
      )}

      <form
        className="inline-form"
        onSubmit={(event) => {
          event.preventDefault();
          setSubmitted(query);
          void runSearch(query, 1);
        }}
      >
        <label className="search search--grow">
          <SearchIcon width={18} height={18} />
          <input
            type="search"
            value={query}
            placeholder="Buscar artista, album ou genero"
            aria-label="Buscar no acervo livre"
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <button type="submit" className="button button--accent" disabled={loading}>
          Buscar
        </button>
      </form>

      {error && <p className="empty empty--error">{error}</p>}

      {albums.length > 0 && (
        <>
          <p className="view__subtitle">
            {submitted ? `Resultados para "${submitted}"` : 'Populares no acervo'} ·{' '}
            {total.toLocaleString('pt-BR')} itens
          </p>
          <ul className="albums">
            {albums.map((album) => (
              <li key={album.identifier}>
                <button type="button" onClick={() => void openAlbumDetails(album)}>
                  <img
                    className="albums__art"
                    src={album.coverUrl}
                    alt=""
                    loading="lazy"
                    decoding="async"
                    onError={(event) => {
                      event.currentTarget.style.visibility = 'hidden';
                    }}
                  />
                  <span className="albums__title">{album.title}</span>
                  <span className="albums__creator">{album.creator}</span>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}

      {loading && <p className="empty">Buscando...</p>}

      {!loading && albums.length > 0 && albums.length < total && (
        <div className="view__more">
          <button type="button" className="button" onClick={() => void runSearch(submitted, page + 1)}>
            Carregar mais
          </button>
        </div>
      )}
    </section>
  );
}
