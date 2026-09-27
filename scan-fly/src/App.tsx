import { useEffect } from 'react';
import { ToastHost } from './components/Toast.tsx';
import { useRoute } from './lib/router.ts';
import { usePrefs } from './prefs.ts';
import { DocumentView } from './views/DocumentView.tsx';
import { LibraryView } from './views/LibraryView.tsx';
import { PageView } from './views/PageView.tsx';
import { ScannerView } from './views/ScannerView.tsx';
import { SettingsView } from './views/SettingsView.tsx';

export function App() {
  const route = useRoute();
  const { theme } = usePrefs();

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'sistema') delete root.dataset.theme;
    else root.dataset.theme = theme === 'claro' ? 'light' : 'dark';
  }, [theme]);

  let view;
  switch (route.name) {
    case 'library':
      view = <LibraryView />;
      break;
    case 'settings':
      view = <SettingsView />;
      break;
    case 'scan':
      view = <ScannerView key={route.docId ?? 'novo'} docId={route.docId} />;
      break;
    case 'doc':
      view = <DocumentView id={route.id} />;
      break;
    case 'page':
      view = <PageView docId={route.docId} pageId={route.pageId} />;
      break;
  }

  return (
    <>
      {view}
      <ToastHost />
    </>
  );
}
