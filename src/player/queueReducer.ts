import type { Track } from '../types';

/**
 * Estado da fila. `order` guarda posicoes de `queue`; e a ordem de reproducao
 * (identidade quando o modo aleatorio esta desligado). `index` aponta para
 * `order`, nao para `queue`.
 */
export interface QueueState {
  queue: Track[];
  order: number[];
  index: number;
}

export type QueueAction =
  | { type: 'play'; tracks: Track[]; startIndex: number; shuffle: boolean }
  | { type: 'append'; tracks: Track[] }
  | { type: 'insertNext'; tracks: Track[] }
  | { type: 'removeAt'; position: number }
  | { type: 'removeById'; id: string }
  | { type: 'jumpTo'; position: number }
  | { type: 'setIndex'; index: number }
  | { type: 'setShuffle'; enabled: boolean }
  | { type: 'updateDuration'; id: string; duration: number }
  | { type: 'clear' };

export const emptyQueue: QueueState = { queue: [], order: [], index: -1 };

const identity = (length: number) => Array.from({ length }, (_, i) => i);

/** Embaralha mantendo `keepFirst` na primeira posicao (Fisher-Yates). */
export function shuffledOrder(length: number, keepFirst: number): number[] {
  const rest = identity(length).filter((i) => i !== keepFirst);
  for (let i = rest.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [rest[i], rest[j]] = [rest[j], rest[i]];
  }
  return keepFirst >= 0 ? [keepFirst, ...rest] : rest;
}

/** Remove uma posicao de `queue` e reindexa `order` em volta dela. */
function withoutPosition(state: QueueState, position: number): QueueState {
  if (position < 0 || position >= state.queue.length) return state;
  const removedAt = state.order.indexOf(position);
  const order = state.order
    .filter((value) => value !== position)
    .map((value) => (value > position ? value - 1 : value));

  let index = state.index;
  if (removedAt >= 0 && removedAt < state.index) index -= 1;
  index = Math.min(index, order.length - 1);

  return {
    queue: state.queue.filter((_, i) => i !== position),
    order,
    index: order.length === 0 ? -1 : Math.max(index, 0),
  };
}

export function queueReducer(state: QueueState, action: QueueAction): QueueState {
  switch (action.type) {
    case 'play': {
      if (action.tracks.length === 0) return emptyQueue;
      const start = Math.min(Math.max(action.startIndex, 0), action.tracks.length - 1);
      return action.shuffle
        ? { queue: action.tracks, order: shuffledOrder(action.tracks.length, start), index: 0 }
        : { queue: action.tracks, order: identity(action.tracks.length), index: start };
    }

    case 'append': {
      if (action.tracks.length === 0) return state;
      const base = state.queue.length;
      return {
        queue: [...state.queue, ...action.tracks],
        order: [...state.order, ...action.tracks.map((_, i) => base + i)],
        index: state.index < 0 ? 0 : state.index,
      };
    }

    case 'insertNext': {
      if (action.tracks.length === 0) return state;
      const base = state.queue.length;
      const added = action.tracks.map((_, i) => base + i);
      const insertAt = state.index < 0 ? 0 : state.index + 1;
      return {
        queue: [...state.queue, ...action.tracks],
        order: [...state.order.slice(0, insertAt), ...added, ...state.order.slice(insertAt)],
        index: state.index < 0 ? 0 : state.index,
      };
    }

    case 'removeAt':
      return withoutPosition(state, action.position);

    case 'removeById': {
      const position = state.queue.findIndex((track) => track.id === action.id);
      return position < 0 ? state : withoutPosition(state, position);
    }

    case 'jumpTo': {
      const target = state.order.indexOf(action.position);
      return target < 0 ? state : { ...state, index: target };
    }

    case 'setIndex':
      return action.index === state.index ? state : { ...state, index: action.index };

    case 'setShuffle': {
      if (state.order.length === 0) return state;
      const playing = state.order[state.index] ?? 0;
      return action.enabled
        ? { ...state, order: shuffledOrder(state.order.length, playing), index: 0 }
        : { ...state, order: identity(state.order.length), index: playing };
    }

    case 'updateDuration': {
      if (!state.queue.some((t) => t.id === action.id && t.duration !== action.duration)) {
        return state;
      }
      return {
        ...state,
        queue: state.queue.map((track) =>
          track.id === action.id ? { ...track, duration: action.duration } : track,
        ),
      };
    }

    case 'clear':
      return emptyQueue;

    default:
      return state;
  }
}
