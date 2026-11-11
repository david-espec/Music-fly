import type { Book } from '../types';

/** Minutos por pagina usados na estimativa de tempo de leitura. */
export const MIN_PER_PAGE = 1.5;

export function computeStats(books: Book[], year = new Date().getFullYear()) {
  const read = books.filter((b) => b.status === 'read');
  const reading = books.filter((b) => b.status === 'reading');
  const rated = books.filter((b) => b.rating > 0);
  const pagesRead = books.reduce((s, b) => s + (b.pagesRead || 0), 0);
  const avgRating = rated.length ? rated.reduce((s, b) => s + b.rating, 0) / rated.length : 0;
  const readThisYear = read.filter((b) => b.finishedAt?.startsWith(String(year)));

  // Generos: dos livros lidos/em leitura; se ainda nao houver, da estante toda.
  const base = read.length + reading.length ? [...read, ...reading] : books;
  const genreCount = new Map<string, number>();
  for (const b of base) {
    const g = b.categories[0] ?? 'Sem categoria';
    genreCount.set(g, (genreCount.get(g) ?? 0) + 1);
  }
  const genres = [...genreCount.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([name, count]) => ({ name, count, pct: base.length ? count / base.length : 0 }));

  const authorCount = new Map<string, number>();
  for (const b of books) for (const a of b.authors.slice(0, 1)) authorCount.set(a, (authorCount.get(a) ?? 0) + 1);
  const authors = [...authorCount.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([name, count]) => ({ name, count }));

  // Livros concluidos e paginas lidas por mes, no ano escolhido.
  const finishedByMonth = Array(12).fill(0) as number[];
  for (const b of readThisYear) finishedByMonth[Number(b.finishedAt!.slice(5, 7)) - 1]++;
  const pagesByMonth = Array(12).fill(0) as number[];
  for (const b of books) {
    let last = 0;
    for (const p of [...b.progress].sort((x, y) => x.date.localeCompare(y.date))) {
      const delta = p.pages - last;
      last = p.pages;
      if (delta > 0 && p.date.startsWith(String(year))) pagesByMonth[Number(p.date.slice(5, 7)) - 1] += delta;
    }
  }

  const durations = read
    .filter((b) => b.startedAt && b.finishedAt)
    .map((b) => (Date.parse(b.finishedAt!) - Date.parse(b.startedAt!)) / 864e5 + 1)
    .filter((d) => d > 0);
  const avgDays = durations.length ? durations.reduce((s, d) => s + d, 0) / durations.length : 0;

  return {
    total: books.length,
    readCount: read.length,
    readingCount: reading.length,
    wantCount: books.filter((b) => b.status === 'want').length,
    abandonedCount: books.filter((b) => b.status === 'abandoned').length,
    favorites: books.filter((b) => b.favorite).length,
    pagesRead,
    hours: Math.round((pagesRead * MIN_PER_PAGE) / 60),
    avgRating,
    readThisYear: readThisYear.length,
    genres,
    authors,
    finishedByMonth,
    pagesByMonth,
    avgDays,
  };
}
