import { useEffect, useRef, useState } from 'react';
import { useApp } from './store/AppStore';
import { navigate, useRoute } from './lib/router';
import { BottomNav, type Tab } from './components/BottomNav';
import { Sheet } from './components/Dialog';
import { IconCamera, IconEdit, IconImage, IconSearch } from './components/Icons';
import { setPendingPhoto } from './views/ScanView';
import { HomeView } from './views/HomeView';
import { LibraryView } from './views/LibraryView';
import { SearchView } from './views/SearchView';
import { ResultView } from './views/ResultView';
import { BookView } from './views/BookView';
import { BookFormView } from './views/BookFormView';
import { ScanView } from './views/ScanView';
import { StatsView } from './views/StatsView';
import { ProfileView } from './views/ProfileView';
import { WelcomeView } from './views/WelcomeView';
import { setDraft } from './store/AppStore';

function useTheme() {
  const { settings } = useApp();
  useEffect(() => {
    const mq = matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      const dark = settings.theme === 'dark' || (settings.theme === 'system' && mq.matches);
      document.documentElement.dataset.theme = dark ? 'dark' : 'light';
      document.querySelector('meta[name="theme-color"]:not([media])')?.remove();
      const m = document.createElement('meta');
      m.name = 'theme-color';
      m.content = dark ? '#121014' : '#f4f3f6';
      document.head.appendChild(m);
    };
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, [settings.theme]);
}

export function App() {
  const { ready, settings } = useApp();
  const route = useRoute();
  const [addOpen, setAddOpen] = useState(false);
  const galleryRef = useRef<HTMLInputElement>(null);
  useTheme();

  // Rola para o topo a cada troca de tela.
  const key = route.parts.join('/');
  useEffect(() => { window.scrollTo(0, 0); }, [key]);

  if (!ready) return <div className="boot"><span className="logo-word">D Libery</span></div>;
  if (!settings.onboarded) return <WelcomeView />;

  const [page, arg] = route.parts;
  let view: React.ReactNode;
  let tab: Tab = null;
  let showNav = true;
  switch (page) {
    case undefined: view = <HomeView />; tab = 'home'; break;
    case 'estante': view = <LibraryView shelf={route.params.get('s') ?? 'all'} />; tab = 'home'; break;
    case 'pesquisa': view = <SearchView params={route.params} />; tab = 'search'; break;
    case 'resultado': view = <ResultView resultKey={arg} />; showNav = false; break;
    case 'livro': view = <BookView id={arg} />; showNav = false; break;
    case 'editar': view = <BookFormView editId={arg} />; showNav = false; break;
    case 'novo': view = <BookFormView />; showNav = false; break;
    case 'camera': view = <ScanView />; showNav = false; break;
    case 'estatisticas': view = <StatsView />; tab = 'stats'; break;
    case 'perfil': view = <ProfileView />; tab = 'profile'; break;
    default: view = <HomeView />; tab = 'home';
  }

  const pick = (fn: () => void) => () => { setAddOpen(false); fn(); };

  return (
    <div className={`app ${showNav ? 'with-nav' : ''}`}>
      <main className="view" key={key}>{view}</main>
      {showNav && <BottomNav tab={tab} onAdd={() => setAddOpen(true)} />}

      <Sheet open={addOpen} onClose={() => setAddOpen(false)} title="Adicionar livro">
        <div className="add-options">
          <button className="add-option" onClick={pick(() => navigate('camera'))}>
            <span className="add-ico"><IconCamera /></span>
            <span><b>Fotografar a capa</b><small>Ou o código de barras. O app encontra o livro.</small></span>
          </button>
          <button className="add-option" onClick={() => galleryRef.current?.click()}>
            <span className="add-ico"><IconImage /></span>
            <span><b>Escolher foto da galeria</b><small>Uma foto da capa que você já tirou.</small></span>
          </button>
          <button className="add-option" onClick={pick(() => navigate('pesquisa'))}>
            <span className="add-ico"><IconSearch /></span>
            <span><b>Pesquisar na internet</b><small>Por título, autor, ISBN, editora ou categoria.</small></span>
          </button>
          <button className="add-option" onClick={pick(() => { setDraft(null); navigate('novo'); })}>
            <span className="add-ico"><IconEdit /></span>
            <span><b>Cadastrar manualmente</b><small>Preencha você mesmo as informações.</small></span>
          </button>
        </div>
        <input ref={galleryRef} type="file" accept="image/*" hidden onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (!f) return;
          setAddOpen(false);
          setPendingPhoto(f);
          navigate('camera');
        }} />
      </Sheet>
    </div>
  );
}
