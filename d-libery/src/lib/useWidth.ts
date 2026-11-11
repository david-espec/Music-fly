import { useEffect, useState } from 'react';

export function useWidth() {
  const [w, setW] = useState(() => window.innerWidth);
  useEffect(() => {
    const on = () => setW(window.innerWidth);
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, []);
  return w;
}

/** Livros por prateleira conforme a largura da tela. */
export const perRowFor = (w: number) => (w < 400 ? 3 : w < 640 ? 4 : w < 900 ? 5 : 6);
