import { useSyncExternalStore } from 'react';

/** Aviso curto no rodape. Qualquer parte do app chama `toast()`. */

let message: { text: string; id: number } | null = null;
let timer: ReturnType<typeof setTimeout> | undefined;
const listeners = new Set<() => void>();

export function toast(text: string, ms = 2600) {
  message = { text, id: Date.now() };
  listeners.forEach((fn) => fn());
  clearTimeout(timer);
  timer = setTimeout(() => {
    message = null;
    listeners.forEach((fn) => fn());
  }, ms);
}

export function ToastHost() {
  const m = useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => void listeners.delete(fn);
    },
    () => message,
  );
  return (
    <div className="toast-host" role="status" aria-live="polite">
      {m && (
        <div className="toast" key={m.id}>
          {m.text}
        </div>
      )}
    </div>
  );
}
