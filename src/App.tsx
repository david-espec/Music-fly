import { useEffect, useState } from 'react';
import type { ViewId } from './types';
import { usePlayer } from './player/PlayerContext';
import { LibraryView } from './views/LibraryView';
import { PlaylistsView } from './views/PlaylistsView';
import { DiscoverView } from './views/DiscoverView';
import { AboutView } from './views/AboutView';
import { PlayerBar } from './components/PlayerBar';
import { CompassIcon, InfoIcon, LibraryIcon, OfflineIcon, PlaylistIcon } from './components/Icons';

const NAV: { id: ViewId; label: string; icon: typeof LibraryIcon }[] = [
  { id: 'biblioteca', label: 'Biblioteca', icon: LibraryIcon },
  { id: 'playlists', label: 'Playlists', icon: PlaylistIcon },
  { id: 'descobrir', label: 'Descobrir', icon: CompassIcon },
  { id: 'sobre', label: 'Sobre', icon: InfoIcon },
];

/** Atalhos de teclado nao devem disparar enquanto o usuario digita. */
function isTyping(target: EventTarget | null): boolean {
  const element = target as HTMLElement | null;
  if (!element) return false;
  return (
    element.isContentEditable ||
    ['INPUT', 'TEXTAREA', 'SELECT'].includes(element.tagName)
  );
}

export function App() {
  const [view, setView] = useState<ViewId>('biblioteca');
  const [online, setOnline] = useState(navigator.onLine);
  const player = usePlayer();

  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (isTyping(event.target) || event.metaKey || event.ctrlKey || event.altKey) return;
      switch (event.key) {
        case ' ':
          event.preventDefault();
          player.toggle();
          break;
        case 'ArrowRight':
          player.seekBy(5);
          break;
        case 'ArrowLeft':
          player.seekBy(-5);
          break;
        case 'ArrowUp':
          event.preventDefault();
          player.setVolume(player.volume + 0.05);
          break;
        case 'ArrowDown':
          event.preventDefault();
          player.setVolume(player.volume - 0.05);
          break;
        case 'n':
          player.next();
          break;
        case 'p':
          player.previous();
          break;
        case 'm':
          player.toggleMute();
          break;
        case 's':
          player.toggleShuffle();
          break;
        case 'r':
          player.cycleRepeat();
          break;
        default:
          break;
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [player]);

  return (
    <div className={`app ${player.current ? 'app--playing' : ''}`}>
      <nav className="nav" aria-label="Secoes">
        <div className="nav__brand">
          <img src="./icons/icon.svg" alt="" width="32" height="32" />
          <span>Music Fly</span>
        </div>
        <ul>
          {NAV.map(({ id, label, icon: Icon }) => (
            <li key={id}>
              <button
                type="button"
                className={view === id ? 'is-active' : ''}
                aria-current={view === id ? 'page' : undefined}
                onClick={() => setView(id)}
              >
                <Icon width={22} height={22} />
                <span>{label}</span>
              </button>
            </li>
          ))}
        </ul>
        {!online && (
          <p className="nav__offline">
            <OfflineIcon width={16} height={16} />
            Modo offline
          </p>
        )}
      </nav>

      <main className="main">
        {view === 'biblioteca' && <LibraryView />}
        {view === 'playlists' && <PlaylistsView />}
        {view === 'descobrir' && <DiscoverView />}
        {view === 'sobre' && <AboutView />}
      </main>

      <PlayerBar />
    </div>
  );
}
