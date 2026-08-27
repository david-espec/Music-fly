import { useCallback, useEffect, useRef, useState } from 'react';
import type { ArchiveAlbum, Track } from '../types';
import {
  GENRES,
  SORTS,
  detailsUrlFor,
  fetchAlbumTracks,
  licenseLabel,
  searchAlbums,
} from '../lib/archive';
import { useLibrary } from '../library/LibraryContext';
import { usePlayer } from '../player/PlayerContext';
import { useToast } from '../components/Toast';
import { TrackList } from '../components/TrackList';
import { RadioPanel } from './RadioPanel';
import { plural } from '../lib/format';
import {
  ChevronDownIcon,
  CloseIcon,
  DownloadIcon,
  OfflineIcon,
  PlayIcon,
  SearchIcon,
} from '../components/Icons';

/**
 * Espera entre a ultima tecla e a busca. Diferente da biblioteca, que filtra
 * na memoria, aqui cada busca e uma requisicao ao acervo: disparar a cada
 * tecla castigaria o servidor e ainda mostraria resultados de buscas velhas.
 */
const DEBOUNCE_MS = 400;

/** Genero e ordenacao escolhidos, que viajam juntos com o termo digitado. */
type Filtros = { genre: string | null; sort: string };

type RunSearch = (term: string, page: number, filtros: Filtros) => Promise<void>;

export function DiscoverView() {
  const { saveArchiveTracks, downloadForOffline } = useLibrary();
  const player = usePlayer();
  const notify = useToast();

  /*
   * Acervo e radio nao viram duas abas na barra de baixo: cinco ja e o que
   * cabe num celular estreito. Como as duas respondem a mesma pergunta - "o
   * que eu ouco agora?" -, dividem a Descobrir.
   */
  const [aba, setAba] = useState<'acervo' | 'radio'>('acervo');
  const [query, setQuery] = useState('');
  const [genre, setGenre] = useState<string | null>(null);
  const [sort, setSort] = useState(SORTS[0].id);
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
  const debounceRef = useRef<number | undefined>(undefined);
  /** A primeira carga nao espera; so as digitacoes seguintes. */
  const firstRunRef = useRef(true);
  // Refs para o ouvinte de 'online', que e registrado uma unica vez.
  const runSearchRef = useRef<RunSearch | null>(null);
  const submittedRef = useRef('');
  const filtrosRef = useRef<Filtros>({ genre: null, sort: SORTS[0].id });

  useEffect(() => {
    const goOffline = () => setOnline(false);
    const goOnline = () => {
      setOnline(true);
      // A internet voltou: refaz a busca que havia falhado.
      setAlbums((current) => {
        if (current.length === 0) {
          void runSearchRef.current?.(submittedRef.current, 1, filtrosRef.current);
        }
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
    async (term: string, targetPage: number, filtros: Filtros) => {
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
        const result = await searchAlbums(term, targetPage, controller.signal, {
          genre: filtros.genre ?? undefined,
          sort: filtros.sort,
        });
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

  useEffect(() => {
    filtrosRef.current = { genre, sort };
  }, [genre, sort]);

  /*
   * Busca enquanto o usuario digita, agrupando as teclas em uma requisicao so.
   * Trocar de genero ou de ordenacao entra pelo mesmo caminho: e um clique,
   * nao uma digitacao, mas refazer a busca e exatamente a mesma coisa.
   */
  useEffect(() => {
    const delay = firstRunRef.current ? 0 : DEBOUNCE_MS;
    firstRunRef.current = false;

    debounceRef.current = window.setTimeout(() => {
      setSubmitted(query);
      void runSearch(query, 1, { genre, sort });
    }, delay);

    return () => window.clearTimeout(debounceRef.current);
  }, [query, genre, sort, runSearch]);

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

  const generoAtual = GENRES.find((item) => item.id === genre);
  const resumo = submitted
    ? `Resultados para "${submitted}"${generoAtual ? ` em ${generoAtual.label}` : ''}`
    : generoAtual
      ? generoAtual.label
      : 'Populares no acervo';

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
            {openAlbum.tags && openAlbum.tags.length > 0 && (
              <p className="view__subtitle">{openAlbum.tags.slice(0, 6).join(' · ')}</p>
            )}
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
            {aba === 'acervo'
              ? 'Acervo publico do Internet Archive: milhoes de gravacoes de livre distribuicao, de todo genero e de todo canto, sem anuncios e sem cadastro.'
              : 'Radio ao vivo, do catalogo aberto do Radio Browser.'}
          </p>
        </div>
      </header>

      <div className="segmented" role="tablist" aria-label="Onde procurar">
        <button
          type="button"
          role="tab"
          aria-selected={aba === 'acervo'}
          className={aba === 'acervo' ? 'is-active' : ''}
          onClick={() => setAba('acervo')}
        >
          Acervo
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={aba === 'radio'}
          className={aba === 'radio' ? 'is-active' : ''}
          onClick={() => setAba('radio')}
        >
          Radio ao vivo
        </button>
      </div>

      {aba === 'radio' && <RadioPanel />}

      {aba === 'acervo' && (
        <>
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
          // Enter nao espera o intervalo: busca agora e fecha o teclado.
          window.clearTimeout(debounceRef.current);
          setSubmitted(query);
          void runSearch(query, 1, { genre, sort });
          (event.currentTarget.querySelector('input') as HTMLInputElement | null)?.blur();
        }}
      >
        <label className="searchbar">
          <SearchIcon width={20} height={20} />
          <input
            type="search"
            value={query}
            placeholder="Buscar artista, album ou genero"
            aria-label="Buscar no acervo livre"
            onChange={(event) => setQuery(event.target.value)}
          />
          {loading && <span className="spinner" aria-hidden="true" />}
          {query && !loading && (
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
      </form>

      {/*
        Os generos sao atalhos de busca, nao categorias fechadas: cada um vira
        uma consulta por etiqueta no acervo. Quem nao achar o estilo aqui pode
        digitar o nome dele na busca, que o campo de etiqueta e procurado do
        mesmo jeito.
      */}
      <div className="genres" role="group" aria-label="Genero musical">
        <button
          type="button"
          className={`chip ${genre === null ? 'is-active' : ''}`}
          aria-pressed={genre === null}
          onClick={() => setGenre(null)}
        >
          Tudo
        </button>
        {GENRES.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`chip ${genre === item.id ? 'is-active' : ''}`}
            aria-pressed={genre === item.id}
            onClick={() => setGenre(genre === item.id ? null : item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>

      <label className="sortpicker">
        <span>Ordenar por</span>
        <select value={sort} onChange={(event) => setSort(event.target.value)}>
          {SORTS.map((item) => (
            <option key={item.id} value={item.id}>
              {item.label}
            </option>
          ))}
        </select>
      </label>

      {error && <p className="empty empty--error">{error}</p>}

      {albums.length > 0 && (
        <>
          <p className="view__subtitle results__summary">
            {resumo} · {total.toLocaleString('pt-BR')} itens
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

      {!loading && !error && albums.length === 0 && (
        <p className="empty">
          Nada encontrado{submitted ? ` para "${submitted}"` : ''}
          {generoAtual ? ` em ${generoAtual.label}` : ''}. Duas coisas ajudam: procurar pelo nome
          do artista em vez do nome da musica, porque o acervo cataloga por album e por show; e
          lembrar que aqui so entra musica de livre distribuicao. Artista de gravadora depende de
          licenca e nao esta neste acervo - para ouvir esses, importe na Biblioteca os arquivos
          que voce ja tem.
        </p>
      )}

      {!loading && albums.length > 0 && albums.length < total && (
        <div className="view__more">
          <button type="button" className="button" onClick={() => void runSearch(submitted, page + 1, { genre, sort })}>
            Carregar mais
          </button>
        </div>
      )}
        </>
      )}
    </section>
  );
}
