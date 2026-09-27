import { useSyncExternalStore } from 'react';

/**
 * Rotas por hash: o botao Voltar do celular funciona sem configurar servidor,
 * e o app segue funcionando dentro de subpastas (GitHub Pages).
 */

export type Route =
  | { name: 'library' }
  | { name: 'settings' }
  | { name: 'scan'; docId?: string }
  | { name: 'doc'; id: string }
  | { name: 'page'; docId: string; pageId: string };

export function parse(hash: string): Route {
  const parts = hash.replace(/^#\/?/, '').split('/').filter(Boolean).map(decodeURIComponent);
  if (parts[0] === 'settings') return { name: 'settings' };
  if (parts[0] === 'scan') return { name: 'scan', docId: parts[1] };
  if (parts[0] === 'doc' && parts[1] && parts[2] === 'page' && parts[3]) {
    return { name: 'page', docId: parts[1], pageId: parts[3] };
  }
  if (parts[0] === 'doc' && parts[1]) return { name: 'doc', id: parts[1] };
  return { name: 'library' };
}

export function href(r: Route): string {
  switch (r.name) {
    case 'library':
      return '#/';
    case 'settings':
      return '#/settings';
    case 'scan':
      return r.docId ? `#/scan/${encodeURIComponent(r.docId)}` : '#/scan';
    case 'doc':
      return `#/doc/${encodeURIComponent(r.id)}`;
    case 'page':
      return `#/doc/${encodeURIComponent(r.docId)}/page/${encodeURIComponent(r.pageId)}`;
  }
}

/**
 * Cada entrada do historico guarda a profundidade dentro do app. Assim o
 * "voltar" da interface sabe se ha uma tela do app antes desta ou se o app foi
 * aberto direto aqui (link, atalho) e precisa cair numa tela padrao.
 */
const depth = () => (history.state as { depth?: number } | null)?.depth ?? 0;

export function navigate(r: Route, opts: { replace?: boolean } = {}) {
  const h = href(r);
  if (opts.replace) history.replaceState({ depth: depth() }, '', h);
  else history.pushState({ depth: depth() + 1 }, '', h);
  window.dispatchEvent(new HashChangeEvent('hashchange'));
}

export function goBack(fallback: Route) {
  if (depth() > 0) history.back();
  else navigate(fallback, { replace: true });
}

const subscribe = (fn: () => void) => {
  window.addEventListener('hashchange', fn);
  return () => window.removeEventListener('hashchange', fn);
};

export function useRoute(): Route {
  const hash = useSyncExternalStore(subscribe, () => location.hash);
  return parse(hash);
}
