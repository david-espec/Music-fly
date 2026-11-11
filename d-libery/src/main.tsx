import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import { App } from './App';
import { AppProvider } from './store/AppStore';
import { ToastProvider } from './components/Toast';
import './styles.css';

import { isNative } from './lib/native';

// No APK os arquivos ja estao dentro do app; o service worker so serve para a versao web.
if (import.meta.env.PROD && !isNative()) registerSW({ immediate: true });

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppProvider>
      <ToastProvider>
        <App />
      </ToastProvider>
    </AppProvider>
  </StrictMode>,
);
