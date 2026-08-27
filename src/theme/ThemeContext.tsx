import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { getPref, setPref } from '../db';

export type ThemeChoice = 'sistema' | 'claro' | 'escuro';

interface ThemeValue {
  /** O que o usuario escolheu. */
  choice: ThemeChoice;
  /** O tema realmente em uso agora. */
  resolved: 'claro' | 'escuro';
  setChoice: (choice: ThemeChoice) => void;
}

const ThemeContext = createContext<ThemeValue | null>(null);

/** Tema da interface (RF60), com opcao de acompanhar o sistema. */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [choice, setChoiceState] = useState<ThemeChoice>('escuro');
  const [systemDark, setSystemDark] = useState(
    () => !window.matchMedia('(prefers-color-scheme: light)').matches,
  );
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let alive = true;
    void getPref<ThemeChoice>('theme', 'escuro').then((saved) => {
      if (!alive) return;
      setChoiceState(saved);
      setLoaded(true);
    });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    const query = window.matchMedia('(prefers-color-scheme: light)');
    const update = (event: MediaQueryListEvent) => setSystemDark(!event.matches);
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);

  const resolved: 'claro' | 'escuro' =
    choice === 'sistema' ? (systemDark ? 'escuro' : 'claro') : choice;

  // O atributo no <html> e o que a folha de estilo consulta.
  useEffect(() => {
    document.documentElement.dataset.theme = resolved;
    document.documentElement.style.colorScheme = resolved === 'claro' ? 'light' : 'dark';
    // A barra do navegador no celular acompanha o fundo da pagina.
    const meta = document.querySelector('meta[name="theme-color"]');
    meta?.setAttribute('content', resolved === 'claro' ? '#f7f7fb' : '#0e0e12');
  }, [resolved]);

  const setChoice = useCallback((next: ThemeChoice) => {
    setChoiceState(next);
    void setPref('theme', next);
  }, []);

  useEffect(() => {
    if (loaded) void setPref('theme', choice);
  }, [choice, loaded]);

  const value = useMemo<ThemeValue>(
    () => ({ choice, resolved, setChoice }),
    [choice, resolved, setChoice],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeValue {
  const context = useContext(ThemeContext);
  if (!context) throw new Error('useTheme precisa estar dentro de <ThemeProvider>');
  return context;
}
