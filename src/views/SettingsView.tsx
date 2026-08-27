import { useState } from 'react';
import { useTheme, type ThemeChoice } from '../theme/ThemeContext';
import { useLibrary } from '../library/LibraryContext';
import { usePlayer } from '../player/PlayerContext';
import { useToast } from '../components/Toast';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { ChevronDownIcon, TrashIcon } from '../components/Icons';

const THEMES: { value: ThemeChoice; label: string }[] = [
  { value: 'sistema', label: 'Do sistema' },
  { value: 'claro', label: 'Claro' },
  { value: 'escuro', label: 'Escuro' },
];

/** Configuracoes do app (RF59 a RF63, item 36 do documento). */
export function SettingsView({ onBack }: { onBack: () => void }) {
  const { choice, setChoice } = useTheme();
  const { tracks, clearHistory } = useLibrary();
  const player = usePlayer();
  const notify = useToast();
  const [confirming, setConfirming] = useState<'historico' | 'cache' | null>(null);

  const comHistorico = tracks.filter((track) => (track.playCount ?? 0) > 0).length;

  /** Apaga o cache do service worker; a biblioteca fica intacta. */
  const clearCache = async () => {
    if (!('caches' in window)) {
      notify('Este navegador nao expoe o cache do app.', 'erro');
      return;
    }
    const nomes = await caches.keys();
    await Promise.all(nomes.map((nome) => caches.delete(nome)));
    notify('Cache limpo. O app se recarrega do servidor na proxima abertura.', 'sucesso');
  };

  return (
    <section className="view">
      <header className="view__header view__header--detail">
        <button
          type="button"
          className="icon-button icon-button--back"
          aria-label="Voltar"
          onClick={onBack}
        >
          <ChevronDownIcon width={24} height={24} />
        </button>
        <div>
          <h1>Configuracoes</h1>
          <p className="view__subtitle">Tudo guardado neste aparelho.</p>
        </div>
      </header>

      <div className="cards">
        <article className="card">
          <h2>Aparencia</h2>
          <p>Tema da interface (RF60).</p>
          <div className="chips" role="radiogroup" aria-label="Tema da interface">
            {THEMES.map((theme) => (
              <button
                key={theme.value}
                type="button"
                role="radio"
                aria-checked={choice === theme.value}
                className={`chip ${choice === theme.value ? 'is-active' : ''}`}
                onClick={() => setChoice(theme.value)}
              >
                {theme.label}
              </button>
            ))}
          </div>
          <p className="card__note">
            "Do sistema" acompanha a configuracao de claro ou escuro do seu aparelho.
          </p>
        </article>

        <article className="card">
          <h2>Reproducao</h2>
          <label className="switch">
            <input
              type="checkbox"
              checked={player.resumeEnabled}
              onChange={(event) => player.setResumeEnabled(event.target.checked)}
            />
            <span>
              <strong>Continuar de onde parou</strong>
              <small>
                Ao tocar uma musica interrompida no meio, ela recomeca daquele ponto em vez do
                inicio.
              </small>
            </span>
          </label>

          <label className="switch">
            <input
              type="checkbox"
              checked={player.shuffle}
              onChange={player.toggleShuffle}
            />
            <span>
              <strong>Ordem aleatoria</strong>
              <small>Vale para a proxima fila que voce comecar.</small>
            </span>
          </label>

          <label className="switch">
            <input type="checkbox" checked={player.muted} onChange={player.toggleMute} />
            <span>
              <strong>Sem som</strong>
              <small>Silencia o player sem perder o volume escolhido.</small>
            </span>
          </label>
        </article>

        <article className="card">
          <h2>Dados</h2>
          <p>
            {comHistorico > 0
              ? `${comHistorico} musica(s) com historico de reproducao.`
              : 'Nenhum historico de reproducao ainda.'}
          </p>
          <button
            type="button"
            className="button"
            disabled={comHistorico === 0}
            onClick={() => setConfirming('historico')}
          >
            <TrashIcon width={16} height={16} />
            Limpar historico
          </button>
          <p className="card__note">
            Zera contagens, tempo ouvido e pontos de retomada. Suas musicas, playlists e curtidas
            continuam.
          </p>

          <button type="button" className="button" onClick={() => setConfirming('cache')}>
            <TrashIcon width={16} height={16} />
            Limpar cache do app
          </button>
          <p className="card__note">
            Apaga so a copia do proprio app usada para abrir offline. Suas musicas nao sao
            tocadas por isto.
          </p>
        </article>

        <article className="card">
          <h2>Privacidade</h2>
          <p>
            O Music Fly nao tem contas, nao usa rastreadores e nao envia suas musicas a lugar
            nenhum. Biblioteca, playlists, curtidas, letras e historico ficam apenas neste
            navegador.
          </p>
          <p className="card__note">
            As unicas requisicoes de rede sao para o acervo do Internet Archive, na aba Descobrir,
            e para o LRCLIB, quando voce pede uma letra.
          </p>
        </article>
      </div>

      {confirming === 'historico' && (
        <ConfirmDialog
          title="Limpar historico?"
          message="As contagens de reproducao, o tempo ouvido e os pontos de retomada serao zerados. As musicas, playlists e curtidas continuam como estao."
          confirmLabel="Limpar"
          danger
          onConfirm={() => {
            void clearHistory();
            setConfirming(null);
          }}
          onCancel={() => setConfirming(null)}
        />
      )}

      {confirming === 'cache' && (
        <ConfirmDialog
          title="Limpar cache do app?"
          message="Apaga a copia do app guardada para funcionar offline. Na proxima abertura com internet ele se baixa de novo. Suas musicas nao sao afetadas."
          confirmLabel="Limpar"
          onConfirm={() => {
            void clearCache();
            setConfirming(null);
          }}
          onCancel={() => setConfirming(null)}
        />
      )}
    </section>
  );
}
