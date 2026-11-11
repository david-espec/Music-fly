import { useEffect, useState } from 'react';
import { getImage } from '../lib/db';

/** URLs de objeto das imagens guardadas, reaproveitadas entre telas. */
const urls = new Map<string, string>();
const pending = new Map<string, Promise<string | null>>();

function load(id: string) {
  let p = pending.get(id);
  if (!p) {
    p = getImage(id).then((blob) => {
      if (!blob) return null;
      const u = URL.createObjectURL(blob);
      urls.set(id, u);
      return u;
    });
    pending.set(id, p);
  }
  return p;
}

export function useImage(id?: string) {
  const [url, setUrl] = useState<string | null>(() => (id ? urls.get(id) ?? null : null));
  useEffect(() => {
    if (!id) { setUrl(null); return; }
    const cached = urls.get(id);
    if (cached) { setUrl(cached); return; }
    let alive = true;
    load(id).then((u) => alive && setUrl(u));
    return () => { alive = false; };
  }, [id]);
  return url;
}

/** URL temporaria para um Blob ainda nao salvo (pre-visualizacao). */
export function useBlobUrl(blob?: Blob | null) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!blob) { setUrl(null); return; }
    const u = URL.createObjectURL(blob);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [blob]);
  return url;
}
