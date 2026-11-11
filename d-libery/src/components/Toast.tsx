import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';

interface ToastMsg { id: number; text: string; action?: { label: string; run: () => void } }
const Ctx = createContext<(text: string, action?: ToastMsg['action']) => void>(() => {});
export const useToast = () => useContext(Ctx);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [msg, setMsg] = useState<ToastMsg | null>(null);
  const timer = useRef<number>(0);
  const show = useCallback((text: string, action?: ToastMsg['action']) => {
    clearTimeout(timer.current);
    setMsg({ id: Date.now(), text, action });
    timer.current = window.setTimeout(() => setMsg(null), action ? 5000 : 2800);
  }, []);
  return (
    <Ctx.Provider value={show}>
      {children}
      {msg && (
        <div className="toast" key={msg.id} role="status">
          <span>{msg.text}</span>
          {msg.action && <button onClick={() => { msg.action!.run(); setMsg(null); }}>{msg.action.label}</button>}
        </div>
      )}
    </Ctx.Provider>
  );
}
