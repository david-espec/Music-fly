import { useEffect, useState } from 'react';
import { estimateUsage, requestPersistence } from '../db';
import { useLibrary } from '../library/LibraryContext';
import { useToast } from '../components/Toast';
import { formatBytes, plural } from '../lib/format';
import { CheckIcon, ChevronDownIcon, DownloadIcon } from '../components/Icons';

/** Evento do Chrome para instalacao do PWA; nao esta na tipagem padrao. */
interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export function AboutView({ onBack }: { onBack: () => void }) {
  const { tracks, playlists } = useLibrary();
  const notify = useToast();

  const [usage, setUsage] = useState<{ usage: number; quota: number } | null>(null);
  const [persisted, setPersisted] = useState<boolean | null>(null);
  const [installEvent, setInstallEvent] = useState<InstallPromptEvent | null>(null);

  useEffect(() => {
    void estimateUsage().then(setUsage);
    void navigator.storage?.persisted?.().then(setPersisted);
  }, [tracks.length]);

  useEffect(() => {
    const onPrompt = (event: Event) => {
      event.preventDefault();
      setInstallEvent(event as InstallPromptEvent);
    };
    window.addEventListener('beforeinstallprompt', onPrompt);
    return () => window.removeEventListener('beforeinstallprompt', onPrompt);
  }, []);

  const install = async () => {
    if (!installEvent) return;
    await installEvent.prompt();
    const { outcome } = await installEvent.userChoice;
    if (outcome === 'accepted') notify('Music Fly instalado.', 'sucesso');
    setInstallEvent(null);
  };

  const enablePersistence = async () => {
    const granted = await requestPersistence();
    setPersisted(granted);
    notify(
      granted
        ? 'Sua biblioteca esta protegida contra limpeza automatica.'
        : 'O navegador nao concedeu armazenamento persistente.',
      granted ? 'sucesso' : 'info',
    );
  };

  const offlineCount = tracks.filter((track) => track.offline).length;

  return (
    <section className="view">
      <header className="view__header view__header--detail">
        <button
          type="button"
          className="icon-button icon-button--back"
          aria-label="Voltar para a biblioteca"
          onClick={onBack}
        >
          <ChevronDownIcon width={24} height={24} />
        </button>
        <div>
          <h1>Sobre o Music Fly</h1>
          <p className="view__subtitle">Um player que nao vende sua atencao.</p>
        </div>
      </header>

      <div className="cards">
        <article className="card">
          <h2>Sem anuncios, sem rastreamento</h2>
          <ul className="card__list">
            <li>
              <CheckIcon width={16} height={16} /> Nenhum anuncio, banner ou interrupcao.
            </li>
            <li>
              <CheckIcon width={16} height={16} /> Nenhum script de analise ou rastreador.
            </li>
            <li>
              <CheckIcon width={16} height={16} /> Nenhuma conta, nenhum cadastro.
            </li>
            <li>
              <CheckIcon width={16} height={16} /> Suas musicas nunca saem do seu dispositivo.
            </li>
          </ul>
          <p className="card__note">
            As unicas requisicoes de rede que o app faz sao para o acervo publico do Internet
            Archive, e somente quando voce usa a aba Descobrir.
          </p>
        </article>

        <article className="card">
          <h2>Seus dados</h2>
          <dl className="card__stats">
            <div>
              <dt>Musicas</dt>
              <dd>{tracks.length}</dd>
            </div>
            <div>
              <dt>Disponiveis offline</dt>
              <dd>{offlineCount}</dd>
            </div>
            <div>
              <dt>Playlists</dt>
              <dd>{playlists.length}</dd>
            </div>
            <div>
              <dt>Espaco usado</dt>
              <dd>{usage ? formatBytes(usage.usage) : '--'}</dd>
            </div>
          </dl>
          {usage && usage.quota > 0 && (
            <p className="card__note">
              Cota disponivel neste navegador: {formatBytes(usage.quota)}.
            </p>
          )}
          {persisted === false && (
            <button type="button" className="button" onClick={() => void enablePersistence()}>
              Proteger biblioteca da limpeza automatica
            </button>
          )}
          {persisted === true && (
            <p className="card__note card__note--ok">
              <CheckIcon width={14} height={14} /> Armazenamento persistente ativo.
            </p>
          )}
        </article>

        <article className="card">
          <h2>Usar offline</h2>
          <p>
            O Music Fly e um app instalavel. Depois de instalado ele abre direto da tela inicial e
            funciona sem internet: as musicas locais e tudo que voce baixou da aba Descobrir tocam
            normalmente.
          </p>
          {installEvent ? (
            <button type="button" className="button button--accent" onClick={() => void install()}>
              <DownloadIcon width={16} height={16} />
              Instalar o app
            </button>
          ) : (
            <p className="card__note">
              No Android/Chrome use o menu do navegador e escolha "Instalar app". No iPhone, use
              Compartilhar e depois "Adicionar a Tela de Inicio".
            </p>
          )}
        </article>

        <article className="card">
          <h2>De onde vem a musica</h2>
          <p>
            <strong>Biblioteca:</strong> os arquivos que voce mesmo adiciona.{' '}
            {plural(offlineCount, 'faixa esta guardada', 'faixas estao guardadas')} no dispositivo.
          </p>
          <p>
            <strong>Descobrir:</strong> o{' '}
            <a href="https://archive.org/details/audio" target="_blank" rel="noreferrer noopener">
              acervo de audio do Internet Archive
            </a>
            , com gravacoes de dominio publico e sob licencas Creative Commons. A licenca de cada
            item aparece junto das faixas; respeite os termos de cada obra.
          </p>
        </article>
      </div>
    </section>
  );
}
