import { useEffect, useState } from 'react';

/** Roteamento por hash (#/livro/123): funciona em qualquer hospedagem estatica e com o botao voltar. */
export interface Route { parts: string[]; params: URLSearchParams }

function parse(): Route {
  const raw = location.hash.replace(/^#\/?/, '');
  const [path, query = ''] = raw.split('?');
  return { parts: path.split('/').filter(Boolean).map(decodeURIComponent), params: new URLSearchParams(query) };
}

let depth = 0;

export function useRoute() {
  const [route, setRoute] = useState(parse);
  useEffect(() => {
    const on = () => setRoute(parse());
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return route;
}

export function navigate(to: string, opts: { replace?: boolean } = {}) {
  const hash = '#/' + to.replace(/^\/+/, '');
  if (opts.replace) {
    history.replaceState(history.state, '', hash);
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  } else {
    depth++;
    location.hash = hash;
  }
}

/** Volta uma tela; se o app foi aberto direto numa tela interna, vai para o inicio. */
export function goBack(fallback = '') {
  if (depth > 0) {
    depth--;
    history.back();
  } else navigate(fallback, { replace: true });
}

export const enc = encodeURIComponent;
