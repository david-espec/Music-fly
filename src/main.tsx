import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import { App } from './App';
import { ToastProvider } from './components/Toast';
import { PlayerProvider } from './player/PlayerContext';
import { LibraryProvider } from './library/LibraryContext';
import { InstallProvider } from './install/InstallContext';
import './styles.css';

registerSW({ immediate: true });

const container = document.getElementById('root');
if (!container) throw new Error('Elemento #root nao encontrado');

createRoot(container).render(
  <StrictMode>
    <ToastProvider>
      <InstallProvider>
        <PlayerProvider>
          <LibraryProvider>
            <App />
          </LibraryProvider>
        </PlayerProvider>
      </InstallProvider>
    </ToastProvider>
  </StrictMode>,
);
