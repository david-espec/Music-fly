import { useEffect, type ReactNode } from 'react';

/** Folha que sobe da base da tela (no celular) ou dialogo centralizado (no computador). */
export function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title?: string; children: ReactNode }) {
  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div className="sheet-grip" />
        {title && <h3 className="sheet-title">{title}</h3>}
        {children}
      </div>
    </div>
  );
}

export function Confirm({ open, title, text, confirmLabel = 'Confirmar', danger, onConfirm, onClose }: {
  open: boolean; title: string; text?: string; confirmLabel?: string; danger?: boolean; onConfirm: () => void; onClose: () => void;
}) {
  return (
    <Sheet open={open} onClose={onClose} title={title}>
      {text && <p className="muted">{text}</p>}
      <div className="sheet-actions">
        <button className="btn btn-ghost" onClick={onClose}>Cancelar</button>
        <button className={`btn ${danger ? 'btn-danger' : 'btn-primary'}`} onClick={() => { onConfirm(); onClose(); }}>{confirmLabel}</button>
      </div>
    </Sheet>
  );
}
