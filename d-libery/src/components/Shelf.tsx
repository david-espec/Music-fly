import type { Book } from '../types';
import { navigate } from '../lib/router';
import { BookCover } from './Cover';
import { IconHeartFill } from './Icons';

/** Estante: capas em fileiras, cada fileira apoiada numa prateleira. */
export function Shelf({ books, perRow = 3 }: { books: Book[]; perRow?: number }) {
  const rows: Book[][] = [];
  for (let i = 0; i < books.length; i += perRow) rows.push(books.slice(i, i + perRow));
  return (
    <div className="shelf" style={{ ['--per-row' as string]: perRow }}>
      {rows.map((row, r) => (
        <div className="shelf-row" key={r}>
          <div className="shelf-books">
            {row.map((b, i) => <ShelfBook key={b.id} book={b} delay={(r * perRow + i) * 35} />)}
          </div>
          <div className="shelf-plank" />
        </div>
      ))}
    </div>
  );
}

export function ShelfBook({ book, delay = 0 }: { book: Book; delay?: number }) {
  const pct = book.pageCount && book.status === 'reading' ? Math.round((book.pagesRead / book.pageCount) * 100) : null;
  return (
    <button className="shelf-book" style={{ animationDelay: `${Math.min(delay, 600)}ms` }}
      onClick={() => navigate(`livro/${book.id}`)} aria-label={book.title}>
      <BookCover book={book} size="fill" />
      {book.favorite && <span className="shelf-fav"><IconHeartFill size={13} /></span>}
      {pct != null && <span className="shelf-progress"><span style={{ width: `${pct}%` }} /></span>}
    </button>
  );
}

/** Fileira horizontal rolavel (tela inicial). */
export function ShelfStrip({ books }: { books: Book[] }) {
  return (
    <div className="shelf-strip">
      <div className="shelf-strip-books">
        {books.map((b, i) => <ShelfBook key={b.id} book={b} delay={i * 40} />)}
      </div>
      <div className="shelf-plank" />
    </div>
  );
}
