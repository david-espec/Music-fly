import { useEffect, useState } from 'react';
import { useApp } from '../store/AppStore';
import { goBack, navigate } from '../lib/router';
import { fmtDate, fmtInt, todayIso } from '../lib/format';
import { BookCover } from '../components/Cover';
import { InfoList, LinksList, shareBook, Synopsis } from '../components/BookParts';
import { StatusPicker } from '../components/StatusPicker';
import { Stars } from '../components/Stars';
import { ProgressSheet } from '../components/ProgressSheet';
import { Confirm } from '../components/Dialog';
import { useToast } from '../components/Toast';
import { IconBack, IconEdit, IconHeart, IconHeartFill, IconShare, IconTrash } from '../components/Icons';

export function BookView({ id }: { id: string }) {
  const { books, updateBook, removeBook, restoreBook, toggleFavorite } = useApp();
  const toast = useToast();
  const book = books.find((b) => b.id === id);
  const [progressOpen, setProgressOpen] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const [notes, setNotes] = useState(book?.notes ?? '');
  useEffect(() => { setNotes(book?.notes ?? ''); }, [book?.notes]);

  if (!book) {
    return (
      <div className="page">
        <header className="top-bar"><button className="icon-btn" onClick={() => goBack()} aria-label="Voltar"><IconBack /></button></header>
        <p className="empty muted">Este livro não está mais na sua estante.</p>
      </div>
    );
  }

  const pct = book.pageCount ? Math.min(100, Math.round((book.pagesRead / book.pageCount) * 100)) : null;

  const del = async () => {
    const removed = await removeBook(book.id);
    goBack();
    if (removed) toast('Livro removido', { label: 'Desfazer', run: () => restoreBook(removed.book, removed.cover) });
  };

  return (
    <div className="page detail">
      <header className="top-bar">
        <button className="icon-btn" onClick={() => goBack()} aria-label="Voltar"><IconBack /></button>
        <div className="top-actions">
          <button className={`icon-btn ${book.favorite ? 'fav-on' : ''}`} onClick={() => toggleFavorite(book.id)} aria-label="Favorito" aria-pressed={book.favorite}>
            {book.favorite ? <IconHeartFill /> : <IconHeart />}
          </button>
          <button className="icon-btn" aria-label="Compartilhar" onClick={async () => {
            const r = await shareBook(book.title, book.authors[0], book.links.find((l) => l.kind === 'info')?.url);
            if (r === 'copied') toast('Copiado para a área de transferência');
          }}><IconShare /></button>
          <button className="icon-btn" onClick={() => navigate(`editar/${book.id}`)} aria-label="Editar"><IconEdit /></button>
        </div>
      </header>

      <div className="detail-hero">
        <BookCover book={book} size="xl" className="hero-cover" />
      </div>

      <h1 className="book-title">{book.title}</h1>
      {book.subtitle && <p className="book-subtitle">{book.subtitle}</p>}
      <p className="book-author">{book.authors.join(', ') || 'Autor desconhecido'}</p>

      <div className="meta-row">
        {book.categories[0] && <span className="tag">{book.categories[0]}</span>}
        {book.origin === 'manual' && <span className="tag">Cadastro manual</span>}
      </div>

      <section className="card">
        <h3 className="card-title">Status da leitura</h3>
        <StatusPicker value={book.status} onChange={(status) => updateBook(book.id, { status })} />

        {(book.status === 'reading' || book.pagesRead > 0) && (
          <button className="progress-block" onClick={() => setProgressOpen(true)}>
            <div className="progress-labels">
              <span>{pct != null ? `${pct}% lido` : `${fmtInt(book.pagesRead)} páginas lidas`}</span>
              <span className="muted small">{fmtInt(book.pagesRead)}{book.pageCount ? ` / ${fmtInt(book.pageCount)}` : ''} pág. · <u>atualizar</u></span>
            </div>
            <div className="progress big"><span style={{ width: `${pct ?? 0}%` }} /></div>
          </button>
        )}

        <div className="dates">
          <label className="field compact">
            <span>Comecei em</span>
            <input type="date" value={book.startedAt ?? ''} max={todayIso()} onChange={(e) => updateBook(book.id, { startedAt: e.target.value || undefined })} />
          </label>
          <label className="field compact">
            <span>Terminei em</span>
            <input type="date" value={book.finishedAt ?? ''} min={book.startedAt} max={todayIso()}
              onChange={(e) => updateBook(book.id, e.target.value ? { finishedAt: e.target.value, status: 'read' } : { finishedAt: undefined })} />
          </label>
        </div>
        {book.status === 'read' && book.startedAt && book.finishedAt && (
          <p className="muted small">Lido de {fmtDate(book.startedAt)} a {fmtDate(book.finishedAt)}.</p>
        )}

        <h3 className="card-title">Minha avaliação</h3>
        <Stars value={book.rating} onChange={(rating) => updateBook(book.id, { rating })} size={30} />

        <h3 className="card-title">Anotações</h3>
        <textarea className="notes" value={notes} placeholder="O que achou? Trechos favoritos, ideias…" rows={4}
          onChange={(e) => setNotes(e.target.value)}
          onBlur={() => notes !== book.notes && updateBook(book.id, { notes }).then(() => toast('Anotações salvas'))} />
      </section>

      <h3 className="section-label">Sinopse</h3>
      <Synopsis text={book.description} />

      <InfoList info={book} />
      <LinksList links={book.links} />

      <button className="btn btn-danger-ghost block" onClick={() => setConfirmDel(true)}><IconTrash size={18} /> Remover da estante</button>
      <p className="muted xsmall center">Adicionado em {new Date(book.createdAt).toLocaleDateString('pt-BR')}</p>

      <ProgressSheet book={book} open={progressOpen} onClose={() => setProgressOpen(false)} />
      <Confirm open={confirmDel} onClose={() => setConfirmDel(false)} title="Remover este livro?" danger confirmLabel="Remover"
        text={`“${book.title}” sai da sua estante, junto com suas anotações e a capa guardada.`} onConfirm={del} />
    </div>
  );
}
