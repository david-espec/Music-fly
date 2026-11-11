import { useMemo, useState } from 'react';
import { useApp } from '../store/AppStore';
import { navigate } from '../lib/router';
import { computeStats } from '../lib/stats';
import { fmtInt, fmtRating } from '../lib/format';
import { BookCover } from '../components/Cover';
import { ShelfStrip } from '../components/Shelf';
import { StatCard } from '../components/StatCard';
import { ProgressSheet } from '../components/ProgressSheet';
import { IconBook, IconCamera, IconChart, IconNext, IconPlus, IconSearch, IconSettings, IconTrophy } from '../components/Icons';
import type { Book } from '../types';

function ReadingCard({ book }: { book: Book }) {
  const [open, setOpen] = useState(false);
  const pct = book.pageCount ? Math.round((book.pagesRead / book.pageCount) * 100) : null;
  return (
    <div className="reading-card">
      <button className="reading-main" onClick={() => navigate(`livro/${book.id}`)}>
        <BookCover book={book} size="sm" />
        <div className="reading-info">
          <b className="clamp-2">{book.title}</b>
          <span className="muted small">{book.authors[0] ?? 'Autor desconhecido'}</span>
          <div className="progress-row">
            <div className="progress"><span style={{ width: `${pct ?? 0}%` }} /></div>
            <span className="muted xsmall">{pct != null ? `${pct}%` : `p. ${book.pagesRead}`}</span>
          </div>
        </div>
      </button>
      <button className="round-btn dark" onClick={() => setOpen(true)} aria-label="Atualizar progresso"><IconPlus size={18} /></button>
      <ProgressSheet book={book} open={open} onClose={() => setOpen(false)} />
    </div>
  );
}

function Section({ title, to, children }: { title: string; to?: string; children: React.ReactNode }) {
  return (
    <section className="section">
      <div className="section-head">
        <h2>{title}</h2>
        {to && <button className="see-more" onClick={() => navigate(to)}>Ver mais <IconNext size={14} /></button>}
      </div>
      {children}
    </section>
  );
}

export function HomeView() {
  const { books, settings } = useApp();
  const s = useMemo(() => computeStats(books), [books]);
  const reading = books.filter((b) => b.status === 'reading').sort((a, b) => b.updatedAt - a.updatedAt);
  const recent = books.filter((b) => b.status !== 'want').slice(0, 12);
  const want = books.filter((b) => b.status === 'want').slice(0, 12);
  const favs = books.filter((b) => b.favorite).slice(0, 12);
  const goalPct = Math.min(100, Math.round((s.readThisYear / Math.max(1, settings.yearlyGoal)) * 100));

  return (
    <div className="page">
      <header className="top-bar">
        <div className="brand"><IconBook size={30} strokeWidth={1.4} /><span className="logo-word">D Libery</span></div>
        <button className="icon-btn" onClick={() => navigate('perfil')} aria-label="Configurações"><IconSettings /></button>
      </header>

      <button className="search-fake" onClick={() => navigate('pesquisa')}>
        <IconSearch size={20} /> <span>Pesquisar livros…</span>
      </button>

      <StatCard items={[
        { icon: <IconBook size={20} />, value: fmtInt(s.total), label: s.total === 1 ? 'Livro' : 'Livros' },
        { icon: <IconChart size={20} />, value: fmtInt(s.pagesRead), label: 'Páginas lidas' },
        { icon: <IconTrophy size={20} />, value: s.avgRating ? fmtRating(s.avgRating) : '–', label: 'Avaliação média' },
      ]} />

      {books.length === 0 ? (
        <div className="empty-hero fade-up">
          <div className="empty-shelf" aria-hidden="true"><span /><span /><span /><span /></div>
          <h2 className="serif">Sua estante está esperando</h2>
          <p className="muted">Fotografe a capa de um livro ou pesquise pelo título para começar sua coleção.</p>
          <div className="row-buttons">
            <button className="btn btn-primary" onClick={() => navigate('camera')}><IconCamera size={18} /> Fotografar capa</button>
            <button className="btn btn-soft" onClick={() => navigate('pesquisa')}><IconSearch size={18} /> Pesquisar</button>
          </div>
        </div>
      ) : (
        <>
          {reading.length > 0 && (
            <Section title="Lendo agora" to="estante?s=reading">
              <div className="reading-list">{reading.slice(0, 3).map((b) => <ReadingCard key={b.id} book={b} />)}</div>
            </Section>
          )}

          {recent.length > 0 && (
            <Section title="Sua biblioteca" to="estante"><ShelfStrip books={recent} /></Section>
          )}

          {favs.length > 0 && (
            <Section title="Favoritos" to="estante?s=fav"><ShelfStrip books={favs} /></Section>
          )}

          {want.length > 0 && (
            <Section title="Quero ler" to="estante?s=want"><ShelfStrip books={want} /></Section>
          )}

          <Section title={`Meta de ${new Date().getFullYear()}`} to="estatisticas">
            <button className="goal-card" onClick={() => navigate('estatisticas')}>
              <div className="goal-text">
                <b>{s.readThisYear} de {settings.yearlyGoal} livros</b>
                <span className="muted small">{goalPct >= 100 ? 'Meta batida! 🎉' : `Faltam ${settings.yearlyGoal - s.readThisYear} para a sua meta`}</span>
              </div>
              <div className="progress big"><span style={{ width: `${goalPct}%` }} /></div>
            </button>
          </Section>
        </>
      )}
    </div>
  );
}
