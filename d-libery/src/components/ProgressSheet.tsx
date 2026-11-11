import { useEffect, useState } from 'react';
import { Sheet } from './Dialog';
import { useApp } from '../store/AppStore';
import { useToast } from './Toast';
import type { Book } from '../types';

/** Atualizar a pagina em que voce parou. */
export function ProgressSheet({ book, open, onClose }: { book: Book; open: boolean; onClose: () => void }) {
  const { updateBook } = useApp();
  const toast = useToast();
  const [pages, setPages] = useState(book.pagesRead);
  const [total, setTotal] = useState(book.pageCount ?? 0);
  useEffect(() => { if (open) { setPages(book.pagesRead); setTotal(book.pageCount ?? 0); } }, [open, book]);
  const max = total || Math.max(pages, 1000);

  const save = async () => {
    const finished = total > 0 && pages >= total;
    await updateBook(book.id, { pagesRead: pages, pageCount: total || undefined, ...(finished ? { status: 'read' } : book.status === 'want' && pages > 0 ? { status: 'reading' } : {}) });
    toast(finished ? 'Leitura concluída! 🎉' : 'Progresso atualizado');
    onClose();
  };

  return (
    <Sheet open={open} onClose={onClose} title="Onde você parou?">
      <p className="muted small">{book.title}</p>
      <div className="progress-edit">
        <input type="range" min={0} max={max} value={pages} onChange={(e) => setPages(Number(e.target.value))} aria-label="Páginas lidas" />
        <div className="progress-inputs">
          <label className="field compact"><span>Página</span>
            <input type="number" inputMode="numeric" min={0} value={pages} onChange={(e) => setPages(Math.max(0, Number(e.target.value) || 0))} /></label>
          <span className="muted">de</span>
          <label className="field compact"><span>Total</span>
            <input type="number" inputMode="numeric" min={0} value={total || ''} placeholder="?" onChange={(e) => setTotal(Math.max(0, Number(e.target.value) || 0))} /></label>
        </div>
        <div className="chips">
          {[5, 10, 25, 50].map((n) => (
            <button key={n} type="button" className="chip" onClick={() => setPages((p) => (total ? Math.min(total, p + n) : p + n))}>+{n}</button>
          ))}
          {total > 0 && <button type="button" className="chip" onClick={() => setPages(total)}>Terminei</button>}
        </div>
      </div>
      <div className="sheet-actions">
        <button className="btn btn-ghost" onClick={onClose}>Cancelar</button>
        <button className="btn btn-primary" onClick={save}>Salvar</button>
      </div>
    </Sheet>
  );
}
