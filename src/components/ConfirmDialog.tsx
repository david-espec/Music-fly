import { useEffect, useRef } from 'react';

interface ConfirmDialogProps {
  title: string;
  message: string;
  /** Rotulo do botao que confirma. Diga o que vai acontecer, nao "OK". */
  confirmLabel: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/** Confirmacao para acoes que nao dao para desfazer. */
export function ConfirmDialog({
  title,
  message,
  confirmLabel,
  danger = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const cancelRef = useRef<HTMLButtonElement>(null);

  // O foco comeca em Cancelar: um Enter distraido nao apaga nada.
  useEffect(() => {
    cancelRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCancel();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onCancel]);

  return (
    <div className="overlay" role="alertdialog" aria-modal="true" aria-label={title}>
      <button type="button" className="overlay__backdrop" aria-label="Cancelar" onClick={onCancel} />
      <div className="dialog dialog--narrow">
        <h2>{title}</h2>
        <p className="dialog__hint">{message}</p>
        <div className="dialog__actions">
          <button ref={cancelRef} type="button" className="button" onClick={onCancel}>
            Cancelar
          </button>
          <button
            type="button"
            className={`button ${danger ? 'button--danger' : 'button--accent'}`}
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
