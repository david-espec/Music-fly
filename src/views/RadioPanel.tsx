import { useCallback, useEffect, useRef, useState } from 'react';
import type { RadioStation } from '../types';
import { RADIO_TAGS, registerListen, searchStations, stationToTrack } from '../lib/radio';
import { usePlayer } from '../player/PlayerContext';
import { CloseIcon, OfflineIcon, PlayIcon, SearchIcon } from '../components/Icons';

/** Mesmo intervalo do acervo: cada tecla aqui tambem seria uma requisicao. */
const DEBOUNCE_MS = 400;

/**
 * Radio ao vivo, dentro da aba Descobrir.
 *
 * E o unico canto do app onde toca musica que nao esta no acervo livre nem na
 * biblioteca de quem usa: quem paga a licenca do que toca e a propria estacao.
 * Em troca, nada disso se guarda - a estacao nao entra na biblioteca, nao vai
 * para as estatisticas e nao existe offline.
 */
export function RadioPanel() {
  const player = usePlayer();

  const [query, setQuery] = useState('');
  const [tag, setTag] = useState<string | null>(null);
  const [onlyBrazil, setOnlyBrazil] = useState(true);
  const [stations, setStations] = useState<RadioStation[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tocando, setTocando] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const debounceRef = useRef<number | undefined>(undefined);
  const firstRunRef = useRef(true);

  const run = useCallback(
    async (filtros: { query: string; tag: string | null; onlyBrazil: boolean }) => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      if (!navigator.onLine) {
        setLoading(false);
        setError('A radio precisa de internet. Sua biblioteca offline continua tocando.');
        return;
      }

      setLoading(true);
      setError(null);
      try {
        const found = await searchStations(
          {
            query: filtros.query,
            tag: filtros.tag ?? undefined,
            onlyBrazil: filtros.onlyBrazil,
          },
          controller.signal,
        );
        if (controller.signal.aborted) return;
        setStations(found);
      } catch (cause) {
        if ((cause as Error).name === 'AbortError') return;
        setError('Nao foi possivel falar com o catalogo de radios. Tente de novo em instantes.');
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    const delay = firstRunRef.current ? 0 : DEBOUNCE_MS;
    firstRunRef.current = false;
    debounceRef.current = window.setTimeout(() => {
      void run({ query, tag, onlyBrazil });
    }, delay);
    return () => window.clearTimeout(debounceRef.current);
  }, [query, tag, onlyBrazil, run]);

  useEffect(() => () => abortRef.current?.abort(), []);

  const tocar = (station: RadioStation) => {
    setTocando(station.uuid);
    // Cortesia com o catalogo, que se mantem pelas escutas informadas.
    registerListen(station.uuid);
    player.playTracks([stationToTrack(station)], 0);
  };

  const estiloAtual = RADIO_TAGS.find((item) => item.id === tag);

  return (
    <>
      <p className="view__subtitle">
        Estacoes de radio ao vivo. Quem paga a licenca do que toca e a estacao, entao aqui aparece
        o que esta nas paradas. Em compensacao e ao vivo: nao da para escolher a musica, pular nem
        guardar offline.
      </p>

      <div className="inline-form">
        <label className="searchbar">
          <SearchIcon width={20} height={20} />
          <input
            type="search"
            value={query}
            placeholder="Buscar estacao pelo nome"
            aria-label="Buscar estacao de radio"
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
      </div>

      <div className="genres" role="group" aria-label="Estilo da radio">
        <button
          type="button"
          className={`chip ${tag === null ? 'is-active' : ''}`}
          aria-pressed={tag === null}
          onClick={() => setTag(null)}
        >
          Tudo
        </button>
        {RADIO_TAGS.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`chip ${tag === item.id ? 'is-active' : ''}`}
            aria-pressed={tag === item.id}
            onClick={() => setTag(tag === item.id ? null : item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>

      <label className="switch switch--inline">
        <input
          type="checkbox"
          checked={onlyBrazil}
          onChange={(event) => setOnlyBrazil(event.target.checked)}
        />
        <span>
          <strong>So estacoes do Brasil</strong>
        </span>
      </label>

      {error && <p className="empty empty--error">{error}</p>}

      {!loading && !error && stations.length === 0 && (
        <p className="empty">
          Nenhuma estacao encontrada{estiloAtual ? ` em ${estiloAtual.label}` : ''}. Tente outro
          estilo, ou desmarque "so estacoes do Brasil". Vale lembrar que so entram estacoes que
          transmitem por HTTPS: as demais o navegador se recusa a tocar dentro de um site seguro.
        </p>
      )}

      {stations.length > 0 && (
        <ul className="stations">
          {stations.map((station) => (
            <li key={station.uuid} className={tocando === station.uuid ? 'is-playing' : ''}>
              <button type="button" className="stations__play" onClick={() => tocar(station)}>
                <span className="stations__art" aria-hidden="true">
                  {station.favicon ? (
                    <img
                      src={station.favicon}
                      alt=""
                      loading="lazy"
                      decoding="async"
                      onError={(event) => {
                        event.currentTarget.style.visibility = 'hidden';
                      }}
                    />
                  ) : (
                    <PlayIcon width={18} height={18} />
                  )}
                </span>
                <span className="stations__info">
                  <span className="stations__name">{station.name}</span>
                  <span className="stations__meta">
                    {[
                      station.tags.slice(0, 3).join(', '),
                      station.country,
                      station.bitrate ? `${station.bitrate} kbps` : null,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </span>
                </span>
                {tocando === station.uuid && <span className="live">Ao vivo</span>}
              </button>
            </li>
          ))}
        </ul>
      )}

      {!navigator.onLine && (
        <div className="notice">
          <OfflineIcon width={18} height={18} />
          Sem internet nao ha radio. Sua biblioteca baixada continua tocando.
        </div>
      )}
    </>
  );
}
