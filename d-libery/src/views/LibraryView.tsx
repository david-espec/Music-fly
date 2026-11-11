import { useMemo, useState } from 'react';
import { useApp } from '../store/AppStore';
import { goBack, navigate } from '../lib/router';
import { norm } from '../lib/text';
import { perRowFor, useWidth } from '../lib/useWidth';
import { Shelf } from '../components/Shelf';
import { IconBack, IconSearch, IconSort } from '../components/Icons';
import type { Book } from '../types';

export const SHELVES: { id: string; label: string; test: (b: Book) => boolean }[] = [
  { id: 'all', label: 'Todos', test: () => true },
  { id: 'fav', label: 'Favoritos', test: (b) => b.favorite },
  { id: 'want', label: 'Quero ler', test: (b) => b.status === 'want' },
  { id: 'reading', label: 'Lendo', test: (b) => b.status === 'reading' },
  { id: 'read', label: 'Lidos', test: (b) => b.status === 'read' },
  { id: 'abandoned', label: 'Abandonados', test: (b) => b.status === 'abandoned' },
  { id: 'manual', label: 'Adicionados manualmente', test: (b) => b.origin === 'manual' },
];

const SORTS = {
  recent: { label: 'Recentes', fn: (a: Book, b: Book) => b.createdAt - a.createdAt },
  title: { label: 'Título', fn: (a: Book, b: Book) => a.title.localeCompare(b.title, 'pt-BR') },
  author: { label: 'Autor', fn: (a: Book, b: Book) => (a.authors[0] ?? '~').localeCompare(b.authors[0] ?? '~', 'pt-BR') },
  rating: { label: 'Avaliação', fn: (a: Book, b: Book) => b.rating - a.rating },
  updated: { label: 'Atividade', fn: (a: Book, b: Book) => b.updatedAt - a.updatedAt },
};
type SortId = keyof typeof SORTS;

export function LibraryView({ shelf }: { shelf: string }) {
  const { books } = useApp();
  const width = useWidth();
  const [sort, setSort] = useState<SortId>(() => (localStorage.getItem('dl-sort') as SortId) || 'recent');
  const [filter, setFilter] = useState('');
  const [genre, setGenre] = useState<string | null>(null);
  const current = SHELVES.find((s) => s.id === shelf) ?? SHELVES[0];

  const inShelf = useMemo(() => books.filter(current.test), [books, current]);
  const genres = useMemo(() => {
    const m = new Map<string, number>();
    for (const b of inShelf) for (const c of b.categories.slice(0, 1)) m.set(c, (m.get(c) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
  }, [inShelf]);

  const list = useMemo(() => {
    const q = norm(filter);
    return inShelf
      .filter((b) => !genre || b.categories[0] === genre)
      .filter((b) => !q || norm(`${b.title} ${b.authors.join(' ')} ${b.publisher ?? ''} ${b.isbn13 ?? ''}`).includes(q))
      .sort(SORTS[sort].fn);
  }, [inShelf, filter, sort, genre]);

  const cycleSort = () => {
    const ids = Object.keys(SORTS) as SortId[];
    const next = ids[(ids.indexOf(sort) + 1) % ids.length];
    setSort(next);
    localStorage.setItem('dl-sort', next);
  };

  return (
    <div className="page">
      <header className="top-bar">
        <button className="icon-btn" onClick={() => goBack()} aria-label="Voltar"><IconBack /></button>
        <h1 className="page-title">Minha estante</h1>
        <button className="pill-btn" onClick={cycleSort}><IconSort size={16} /> {SORTS[sort].label}</button>
      </header>

      <div className="chips scroll-x">
        {SHELVES.map((s) => {
          const n = books.filter(s.test).length;
          return (
            <button key={s.id} className={`chip ${s.id === current.id ? 'active' : ''}`} onClick={() => { setGenre(null); navigate(`estante?s=${s.id}`, { replace: true }); }}>
              {s.label} <span className="chip-count">{n}</span>
            </button>
          );
        })}
      </div>

      {inShelf.length > 6 && (
        <label className="search-box small">
          <IconSearch size={18} />
          <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filtrar nesta estante…" />
        </label>
      )}

      {genres.length > 1 && (
        <div className="chips scroll-x subtle">
          {genres.map(([g, n]) => (
            <button key={g} className={`chip small ${genre === g ? 'active' : ''}`} onClick={() => setGenre(genre === g ? null : g)}>{g} · {n}</button>
          ))}
        </div>
      )}

      {list.length ? (
        <Shelf books={list} perRow={perRowFor(Math.min(width, 1100))} />
      ) : (
        <div className="empty">
          <p className="muted">{inShelf.length ? 'Nenhum livro corresponde ao filtro.' : `Nenhum livro em “${current.label}” ainda.`}</p>
          {!inShelf.length && <button className="btn btn-soft" onClick={() => navigate('pesquisa')}>Pesquisar livros</button>}
        </div>
      )}
    </div>
  );
}
