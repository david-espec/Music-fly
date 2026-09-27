import { useSyncExternalStore } from 'react';
import type { PageSize } from './scan/pdf.ts';
import type { FilterId } from './scan/types.ts';

export interface Prefs {
  defaultFilter: FilterId;
  pageSize: PageSize;
  /** Qualidade do JPEG das paginas processadas. */
  quality: 'alta' | 'media' | 'baixa';
  autoCapture: boolean;
  theme: 'sistema' | 'claro' | 'escuro';
}

const DEFAULTS: Prefs = {
  defaultFilter: 'cor',
  pageSize: 'auto',
  quality: 'alta',
  autoCapture: true,
  theme: 'sistema',
};

export const QUALITY: Record<Prefs['quality'], { jpeg: number; maxSide: number; label: string }> = {
  alta: { jpeg: 0.9, maxSide: 2800, label: 'Alta' },
  media: { jpeg: 0.8, maxSide: 2000, label: 'Média' },
  baixa: { jpeg: 0.65, maxSide: 1400, label: 'Baixa' },
};

const KEY = 'scan-fly:prefs';
let current: Prefs = load();
const listeners = new Set<() => void>();

function load(): Prefs {
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') };
  } catch {
    return DEFAULTS;
  }
}

export const getPrefs = () => current;

export function setPrefs(patch: Partial<Prefs>) {
  current = { ...current, ...patch };
  try {
    localStorage.setItem(KEY, JSON.stringify(current));
  } catch {
    // Sem armazenamento (aba anonima): vale so para esta sessao.
  }
  listeners.forEach((fn) => fn());
}

export function usePrefs(): Prefs {
  return useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => void listeners.delete(fn);
    },
    () => current,
  );
}
