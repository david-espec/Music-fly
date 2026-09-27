import { useEffect, useState } from 'react';
import { onChange } from '../db.ts';

/** URL temporaria para exibir um Blob, liberada quando o Blob muda ou a tela sai. */
export function useBlobUrl(blob: Blob | null | undefined): string | undefined {
  const [url, setUrl] = useState<string>();
  useEffect(() => {
    if (!blob) {
      setUrl(undefined);
      return;
    }
    const u = URL.createObjectURL(blob);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [blob]);
  return url;
}

/** Carrega algo do banco e recarrega sempre que o banco mudar. */
export function useDbQuery<T>(load: () => Promise<T>, deps: unknown[]): { data: T | undefined; loading: boolean } {
  const [state, setState] = useState<{ data: T | undefined; loading: boolean }>({ data: undefined, loading: true });
  useEffect(() => {
    let alive = true;
    const run = () =>
      load().then(
        (data) => alive && setState({ data, loading: false }),
        () => alive && setState((s) => ({ ...s, loading: false })),
      );
    run();
    const off = onChange(run);
    return () => {
      alive = false;
      off();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return state;
}
