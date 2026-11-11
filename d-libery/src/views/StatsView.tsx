import { useMemo, useState } from 'react';
import { useApp } from '../store/AppStore';
import { navigate } from '../lib/router';
import { computeStats, MIN_PER_PAGE } from '../lib/stats';
import { fmtInt, fmtRating, MONTHS, plural } from '../lib/format';
import { StatCard } from '../components/StatCard';
import { IconBook, IconChart, IconClock, IconNext, IconStar } from '../components/Icons';

const BAR_COLORS = ['var(--c1)', 'var(--c2)', 'var(--c3)', 'var(--c4)', 'var(--c5)', 'var(--c6)'];

function Ring({ pct }: { pct: number }) {
  const r = 42, c = 2 * Math.PI * r;
  return (
    <svg viewBox="0 0 100 100" className="ring" role="img" aria-label={`${pct}% da meta`}>
      <circle cx="50" cy="50" r={r} className="ring-bg" />
      <circle cx="50" cy="50" r={r} className="ring-fg" strokeDasharray={c} strokeDashoffset={c * (1 - Math.min(pct, 100) / 100)} />
      <text x="50" y="56" textAnchor="middle">{pct}%</text>
    </svg>
  );
}

function MonthBars({ values, unit }: { values: number[]; unit: string }) {
  const max = Math.max(1, ...values);
  const now = new Date().getMonth();
  return (
    <div className="month-bars" role="img" aria-label={`Por mês: ${values.map((v, i) => `${MONTHS[i]} ${v}`).join(', ')}`}>
      {values.map((v, i) => (
        <div key={i} className={`month ${i === now ? 'current' : ''} ${i > now ? 'future' : ''}`} title={`${MONTHS[i]}: ${v} ${unit}`}>
          <span className="month-val">{v > 0 ? fmtInt(v) : ''}</span>
          <div className="month-bar"><span style={{ height: `${(v / max) * 100}%` }} /></div>
          <span className="month-label">{MONTHS[i][0].toUpperCase()}</span>
        </div>
      ))}
    </div>
  );
}

function GenreBars({ genres }: { genres: { name: string; count: number; pct: number }[] }) {
  return (
    <div className="genre-bars">
      {genres.map((g, i) => (
        <div className="genre" key={g.name}>
          <span className="genre-name">{g.name}</span>
          <div className="genre-track"><span style={{ width: `${g.pct * 100}%`, background: BAR_COLORS[i % BAR_COLORS.length] }} /></div>
          <span className="genre-pct">{Math.round(g.pct * 100)}%</span>
        </div>
      ))}
    </div>
  );
}

export function StatsView() {
  const { books, settings } = useApp();
  const [tab, setTab] = useState<'geral' | 'tempo' | 'generos'>('geral');
  const year = new Date().getFullYear();
  const s = useMemo(() => computeStats(books, year), [books, year]);
  const goalPct = Math.round((s.readThisYear / Math.max(1, settings.yearlyGoal)) * 100);
  const genresTop = s.genres.slice(0, 4);
  const rest = s.genres.slice(4).reduce((a, g) => ({ count: a.count + g.count, pct: a.pct + g.pct }), { count: 0, pct: 0 });
  const genresShort = rest.count ? [...genresTop, { name: 'Outros', ...rest }] : genresTop;

  return (
    <div className="page">
      <header className="top-bar"><h1 className="page-title left"><IconChart size={24} /> Estatísticas</h1></header>

      <div className="segmented tabs">
        {([['geral', 'Geral'], ['tempo', 'Tempo'], ['generos', 'Gêneros']] as const).map(([id, label]) => (
          <button key={id} className={tab === id ? 'active' : ''} onClick={() => setTab(id)}>{label}</button>
        ))}
      </div>

      {books.length === 0 ? (
        <div className="empty"><p className="muted">Adicione livros à sua estante para ver suas estatísticas.</p></div>
      ) : tab === 'geral' ? (
        <div className="fade-up">
          <StatCard items={[
            { icon: <IconBook size={20} />, value: fmtInt(s.readCount), label: 'Livros lidos' },
            { icon: <IconClock size={20} />, value: `${fmtInt(s.hours)}h`, label: 'Tempo estimado' },
            { icon: <IconStar size={20} />, value: s.avgRating ? fmtRating(s.avgRating) : '–', label: 'Média' },
          ]} />

          <div className="section-head"><h2>Seu progresso</h2><button className="see-more" onClick={() => navigate('perfil')}>Meta <IconNext size={14} /></button></div>
          <div className="goal-ring">
            <Ring pct={goalPct} />
            <p>Você leu <b>{plural(s.readThisYear, 'livro', 'livros')}</b> em {year}:<br /><span className="accent">{goalPct}% da sua meta de {plural(settings.yearlyGoal, 'livro', 'livros')}</span>.</p>
          </div>

          {genresShort.length > 0 && (
            <>
              <div className="section-head"><h2>Gêneros mais lidos</h2></div>
              <GenreBars genres={genresShort} />
            </>
          )}

          <div className="mini-stats">
            <div><b>{s.readingCount}</b><span>Lendo</span></div>
            <div><b>{s.wantCount}</b><span>Quero ler</span></div>
            <div><b>{s.favorites}</b><span>Favoritos</span></div>
            <div><b>{s.abandonedCount}</b><span>Abandonados</span></div>
          </div>
        </div>
      ) : tab === 'tempo' ? (
        <div className="fade-up">
          <StatCard items={[
            { icon: <IconChart size={20} />, value: fmtInt(s.pagesRead), label: 'Páginas lidas' },
            { icon: <IconClock size={20} />, value: `${fmtInt(s.hours)}h`, label: 'Tempo estimado' },
            { icon: <IconBook size={20} />, value: s.avgDays ? `${Math.round(s.avgDays)}d` : '–', label: 'Por livro (média)' },
          ]} />
          <div className="section-head"><h2>Livros concluídos em {year}</h2></div>
          <MonthBars values={s.finishedByMonth} unit="livros" />
          <div className="section-head"><h2>Páginas lidas em {year}</h2></div>
          <MonthBars values={s.pagesByMonth} unit="páginas" />
          <p className="muted xsmall">Páginas contadas a cada atualização de progresso. Tempo estimado com {MIN_PER_PAGE} min por página.</p>
        </div>
      ) : (
        <div className="fade-up">
          <div className="section-head"><h2>Todos os gêneros</h2></div>
          <GenreBars genres={s.genres} />
          {s.authors.length > 0 && (
            <>
              <div className="section-head"><h2>Autores na sua estante</h2></div>
              <ol className="rank">
                {s.authors.map((a) => <li key={a.name}><span>{a.name}</span><b>{plural(a.count, 'livro', 'livros')}</b></li>)}
              </ol>
            </>
          )}
        </div>
      )}
    </div>
  );
}
