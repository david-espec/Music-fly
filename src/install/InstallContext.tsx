import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

/** Evento do Chrome para instalar o app; nao esta na tipagem padrao. */
interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export type InstallOutcome = 'aceito' | 'recusado' | 'indisponivel';

interface InstallValue {
  /** O navegador ja esta rodando o app instalado. */
  installed: boolean;
  /** Da para abrir a caixa de instalacao do proprio navegador. */
  canPrompt: boolean;
  /** iPhone e iPad nao tem instalacao automatica: so pelo menu Compartilhar. */
  isIOS: boolean;
  /** Abre a caixa do navegador e espera a resposta do usuario. */
  install: () => Promise<InstallOutcome>;
}

const InstallContext = createContext<InstallValue | null>(null);

function detectStandalone(): boolean {
  if (window.matchMedia('(display-mode: standalone)').matches) return true;
  // Safari no iOS usa uma propriedade propria, fora do padrao.
  return (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

function detectIOS(): boolean {
  const ua = navigator.userAgent;
  if (/iPad|iPhone|iPod/.test(ua)) return true;
  // iPadOS recente se apresenta como Mac; o toque denuncia.
  return navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;
}

/**
 * Guarda o evento de instalacao do navegador.
 *
 * Precisa viver na raiz do app: o `beforeinstallprompt` dispara uma unica vez,
 * logo no carregamento da pagina. Um ouvinte registrado dentro de uma tela que
 * so monta depois perderia o evento.
 */
export function InstallProvider({ children }: { children: ReactNode }) {
  const promptRef = useRef<InstallPromptEvent | null>(null);
  const [canPrompt, setCanPrompt] = useState(false);
  const [installed, setInstalled] = useState(detectStandalone);
  const isIOS = useMemo(detectIOS, []);

  useEffect(() => {
    const onBeforeInstall = (event: Event) => {
      event.preventDefault();
      promptRef.current = event as InstallPromptEvent;
      setCanPrompt(true);
    };
    const onInstalled = () => {
      promptRef.current = null;
      setCanPrompt(false);
      setInstalled(true);
    };

    window.addEventListener('beforeinstallprompt', onBeforeInstall);
    window.addEventListener('appinstalled', onInstalled);

    // Instalar pelo menu do navegador tambem muda o modo de exibicao.
    const standalone = window.matchMedia('(display-mode: standalone)');
    const onDisplayChange = (event: MediaQueryListEvent) => setInstalled(event.matches);
    standalone.addEventListener('change', onDisplayChange);

    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall);
      window.removeEventListener('appinstalled', onInstalled);
      standalone.removeEventListener('change', onDisplayChange);
    };
  }, []);

  const install = useCallback(async (): Promise<InstallOutcome> => {
    const event = promptRef.current;
    if (!event) return 'indisponivel';

    await event.prompt();
    const { outcome } = await event.userChoice;
    // O evento so pode ser usado uma vez.
    promptRef.current = null;
    setCanPrompt(false);
    return outcome === 'accepted' ? 'aceito' : 'recusado';
  }, []);

  const value = useMemo<InstallValue>(
    () => ({ installed, canPrompt, isIOS, install }),
    [installed, canPrompt, isIOS, install],
  );

  return <InstallContext.Provider value={value}>{children}</InstallContext.Provider>;
}

export function useInstall(): InstallValue {
  const context = useContext(InstallContext);
  if (!context) throw new Error('useInstall precisa estar dentro de <InstallProvider>');
  return context;
}
