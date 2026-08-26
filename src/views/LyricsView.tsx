import { useEffect, useRef } from 'react';
import { usePlayer } from '../player/PlayerContext';
import { useLibrary } from '../library/LibraryContext';
import { SyncedLyrics } from '../components/SyncedLyrics';
import { Cover } from '../components/Cover';
import { CloudIcon, MusicIcon, PlusIcon, SearchIcon, TrashIcon } from '../components/Icons';

const SOURCE_LABEL = {
  embutida: 'letra gravada no arquivo',
  arquivo: 'arquivo .lrc que voce adicionou',
  lrclib: 'acervo LRCLIB',
} as const;

export function LyricsView() {
  const player = usePlayer();
  const library = useLibrary();
  const track = player.current;
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { loadLyrics } = library;
  const trackId = track?.id;

  // Ao trocar de musica, busca no banco a letra ja guardada (sem ir a rede).
  useEffect(() => {
    if (trackId) void loadLyrics(trackId);
  }, [loadLyrics, trackId]);

  if (!track) {
    return (
      <section className="view">
        <div className="placeholder">
          <MusicIcon width={40} height={40} />
          <h2>Nenhuma musica tocando</h2>
          <p>Comece a tocar algo e a letra aparece aqui, acompanhando a musica.</p>
        </div>
      </section>
    );
  }

  const state = library.lyricsFor(track.id);
  const lyrics = state?.status === 'pronta' ? state.lyrics : null;

  const adjust = (delta: number) => {
    if (!lyrics) return;
    void library.setLyricsOffset(track.id, Number((lyrics.offset + delta).toFixed(1)));
  };

  return (
    <section className="view view--lyrics">
      <header className="lyrics__head">
        <Cover track={track} size={56} />
        <div className="lyrics__headInfo">
          <h1>{track.title}</h1>
          <p>{track.artist}</p>
        </div>
        <div className="lyrics__headActions">
          <button
            type="button"
            className="button"
            onClick={() => void library.searchLyricsOnline(track)}
            disabled={state?.status === 'carregando'}
          >
            <SearchIcon width={16} height={16} />
            Procurar letra
          </button>
          <button type="button" className="button" onClick={() => fileInputRef.current?.click()}>
            <PlusIcon width={16} height={16} />
            Arquivo .lrc
          </button>
        </div>
      </header>

      <input
        ref={fileInputRef}
        type="file"
        accept=".lrc,text/plain"
        hidden
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void library.attachLrcFile(track, file);
          event.target.value = '';
        }}
      />

      {state?.status === 'carregando' && <p className="empty">Procurando a letra...</p>}

      {state?.status === 'erro' && <p className="empty empty--error">{state.message}</p>}

      {state?.status === 'ausente' && (
        <div className="placeholder">
          <MusicIcon width={36} height={36} />
          <h2>Sem letra para esta musica</h2>
          <p>
            Procure no acervo LRCLIB, ou adicione um arquivo <code>.lrc</code> se voce ja tiver um.
            Letras encontradas ficam guardadas e funcionam offline depois.
          </p>
        </div>
      )}

      {lyrics?.instrumental && (
        <div className="placeholder">
          <MusicIcon width={36} height={36} />
          <h2>Faixa instrumental</h2>
          <p>Esta gravacao nao tem letra.</p>
        </div>
      )}

      {lyrics && !lyrics.instrumental && lyrics.lines.length > 0 && (
        <>
          <SyncedLyrics lines={lyrics.lines} synced={lyrics.synced} offset={lyrics.offset} />

          <footer className="lyrics__foot">
            <span className="lyrics__source">
              <CloudIcon width={14} height={14} />
              {lyrics.synced ? 'Sincronizada' : 'Sem sincronia'} · {SOURCE_LABEL[lyrics.source]}
            </span>

            {lyrics.synced && (
              <span className="lyrics__offset">
                <span className="lyrics__offsetLabel">Sincronia</span>
                <button
                  type="button"
                  className="icon-button icon-button--small"
                  aria-label="Atrasar a letra meio segundo"
                  onClick={() => adjust(-0.5)}
                >
                  &minus;
                </button>
                <output className="lyrics__offsetValue">
                  {lyrics.offset === 0
                    ? 'no tempo'
                    : `${lyrics.offset > 0 ? '+' : '-'}${Math.abs(lyrics.offset)
                        .toFixed(1)
                        .replace('.', ',')}s`}
                </output>
                <button
                  type="button"
                  className="icon-button icon-button--small"
                  aria-label="Adiantar a letra meio segundo"
                  onClick={() => adjust(0.5)}
                >
                  +
                </button>
              </span>
            )}

            <button
              type="button"
              className="button button--ghost"
              onClick={() => void library.removeLyrics(track.id)}
            >
              <TrashIcon width={14} height={14} />
              Remover
            </button>
          </footer>
        </>
      )}
    </section>
  );
}
