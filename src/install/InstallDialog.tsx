import { useEffect, useRef, useState } from 'react';
import { useInstall } from './InstallContext';
import { useToast } from '../components/Toast';
import { CheckIcon, DownloadIcon } from '../components/Icons';

/**
 * Passos manuais, para quando o navegador nao oferece a caixa de instalacao.
 * O iPhone nunca oferece; no resto acontece quando o app ja foi instalado
 * antes ou o navegador ainda nao considerou a visita frequente o bastante.
 */
function manualSteps(isIOS: boolean): string[] {
  if (isIOS) {
    return [
      'Toque no botao Compartilhar, o quadrado com a seta para cima.',
      'Role a lista e escolha "Adicionar a Tela de Inicio".',
      'Confirme em "Adicionar", no canto superior direito.',
    ];
  }
  return [
    'Abra o menu do navegador, os tres pontinhos no canto.',
    'Escolha "Instalar app" ou "Adicionar a tela inicial".',
    'Confirme em "Instalar".',
  ];
}

/** Explica o que a instalacao faz e, com o aceite, executa. */
export function InstallDialog({ onClose }: { onClose: () => void }) {
  const { canPrompt, isIOS, install } = useInstall();
  const notify = useToast();
  const cancelRef = useRef<HTMLButtonElement>(null);

  const [showingSteps, setShowingSteps] = useState(false);
  const [working, setWorking] = useState(false);

  useEffect(() => {
    cancelRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const confirm = async () => {
    if (working) return;
    // Sem a caixa do navegador, o aceite vira o passo a passo manual.
    if (!canPrompt) {
      setShowingSteps(true);
      return;
    }

    setWorking(true);
    const outcome = await install();
    setWorking(false);

    if (outcome === 'aceito') {
      notify('Music Fly instalado. Procure o icone na tela inicial.', 'sucesso');
      onClose();
      return;
    }
    if (outcome === 'recusado') {
      onClose();
      return;
    }
    setShowingSteps(true);
  };

  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-labelledby="instalar-titulo">
      {/* Fundo clicavel: atalho redundante com Esc e com o botao, entao fica
          fora da arvore de acessibilidade para nao duplicar controles. */}
      <div className="overlay__backdrop" aria-hidden="true" onClick={onClose} />
      <div className="dialog dialog--install">
        <div className="install__badge" aria-hidden="true">
          <img src="./icons/icon.svg" alt="" width="52" height="52" />
        </div>

        <h2 id="instalar-titulo">
          {showingSteps ? 'Como instalar no seu aparelho' : 'Instalar o Music Fly'}
        </h2>

        {showingSteps ? (
          <>
            <p className="dialog__hint">
              Seu navegador nao abre a janela de instalacao sozinho. Sao tres toques:
            </p>
            <ol className="install__steps">
              {manualSteps(isIOS).map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
            <div className="dialog__actions">
              <button type="button" className="button button--accent" onClick={onClose}>
                Entendi
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="dialog__hint">
              O Music Fly vai virar um icone na tela inicial do seu aparelho e passa a abrir em
              janela propria, sem a barra do navegador.
            </p>

            <ul className="install__list">
              <li>
                <CheckIcon width={16} height={16} />
                Funciona sem internet, com as musicas que voce ja adicionou.
              </li>
              <li>
                <CheckIcon width={16} height={16} />
                Ocupa menos de 1 MB. Nao passa por loja de aplicativos.
              </li>
              <li>
                <CheckIcon width={16} height={16} />
                Sua biblioteca, playlists e letras continuam como estao.
              </li>
              <li>
                <CheckIcon width={16} height={16} />
                Sem anuncios, sem cadastro e sem rastreamento, como sempre.
              </li>
            </ul>

            <p className="dialog__hint">
              Para remover depois, e so apagar o icone como faria com qualquer app.
            </p>

            <div className="dialog__actions">
              <button ref={cancelRef} type="button" className="button" onClick={onClose}>
                Cancelar
              </button>
              <button
                type="button"
                className="button button--accent"
                disabled={working}
                onClick={() => void confirm()}
              >
                <DownloadIcon width={16} height={16} />
                {working ? 'Instalando...' : 'Confirmar'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
