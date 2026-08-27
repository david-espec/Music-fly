/**
 * Barramento minimo de eventos. Evita dependencia circular entre o motor de
 * reproducao e o estado da biblioteca.
 */
import type { Track } from '../types';

type EventMap = {
  'track-removed': string;
  'track-updated': Track;
  'duration-resolved': { id: string; duration: number };
  'track-played': string;
  /** Avanco da escuta: posicao atual e quanto foi ouvido desde o ultimo aviso. */
  'playback-progress': {
    id: string;
    position: number;
    listened: number;
    completed: boolean;
  };
};

type Handler<K extends keyof EventMap> = (payload: EventMap[K]) => void;

// O mapa e destipado por dentro; `on` e `emit` garantem os tipos na fronteira.
const listeners = new Map<keyof EventMap, Set<Handler<never>>>();

export function on<K extends keyof EventMap>(event: K, handler: Handler<K>): () => void {
  let set = listeners.get(event);
  if (!set) {
    set = new Set();
    listeners.set(event, set);
  }
  set.add(handler as Handler<never>);
  return () => {
    listeners.get(event)?.delete(handler as Handler<never>);
  };
}

export function emit<K extends keyof EventMap>(event: K, payload: EventMap[K]): void {
  const set = listeners.get(event) as Set<Handler<K>> | undefined;
  // Copia antes de percorrer: um handler pode se remover durante a emissao.
  set && [...set].forEach((handler) => handler(payload));
}
