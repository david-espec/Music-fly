import { useEffect, useRef, useState } from 'react';
import { setDraft, useApp } from '../store/AppStore';
import { goBack, navigate } from '../lib/router';
import { searchBooks, type SearchField } from '../lib/search';
import { ResultCard } from '../components/ResultCard';
import { IconBack, IconBarcode, IconClose, IconSearch } from '../components/Icons';
import type { SearchResult } from '../types';

const FIELDS: { id: SearchField; label: string; hint: string }[] = [
  { id: 'all', label: 'Todos', hint: 'Título, autor, ISBN…' },
  { id: 'title', label: 'Título', hint: 'Ex.: Dom Casmurro' },
  { id: 'author', label: 'Autores', hint: 'Ex.: Clarice Lispector' },
  { id: 'isbn', label: 'ISBN', hint: 'Ex.: 9788535914849' },
  { id: 'publisher', label: 'Editora', hint: 'Ex.: Companhia das Letras' },
  { id: 'subject', label: 'Categorias', hint: 'Ex.: fantasia, história' },
];

const HISTORY_KEY = 'dl-search-history';
const readHistory = (): string[] => { try { return JSON.parse(localStorage.getItem(HISTORY_KEY) ?? '[]'); } catch { return []; } };

export function SearchView({ params }: { params: URLSearchParams }) {
  const { settings, findExisting } = useApp();
  const q = params.get('q') ?? '';
  const field = (params.get('f') as SearchField) || 'all';
  const [text, setText] = useState(q);
  const [results, setResults] = useState<SearchResult[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [warn, setWarn] = useState('');
  const [history, setHistory] = useState(readHistory);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { setText(q); }, [q]);
  useEffect(() => { if (!q) inputRef.current?.focus(); }, [q]);

  useEffect(() => {
    if (!q.trim()) { setResults(null); setError(''); setWarn(''); return; }
    const ctrl = new AbortController();
    setLoading(true); setError(''); setWarn('');
    searchBooks(q, field, { apiKey: settings.googleApiKey, signal: ctrl.signal })
      .then(({ results, failed }) => {
        setResults(results);
        if (failed.length) setWarn(`Sem resposta de: ${failed.join(', ')}. Mostrando o que foi encontrado.`);
      })
      .catch((e) => { if (e.name !== 'AbortError') { setResults([]); setError(e.message); } })
      .finally(() => { if (!ctrl.signal.aborted) setLoading(false); });
    return () => ctrl.abort();
  }, [q, field, settings.googleApiKey]);

  const submit = (value = text, f = field) => {
    const v = value.trim();
    if (!v) return;
    const h = [v, ...history.filter((x) => x !== v)].slice(0, 8);
    setHistory(h);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(h));
    inputRef.current?.blur();
    navigate(`pesquisa?q=${encodeURIComponent(v)}&f=${f}`, { replace: !!q });
  };

  return (
    <div className="page">
      <form className="search-head" onSubmit={(e) => { e.preventDefault(); submit(); }}>
        <button type="button" className="icon-btn" onClick={() => goBack()} aria-label="Voltar"><IconBack /></button>
        <label className="search-box">
          <IconSearch size={19} />
          <input ref={inputRef} value={text} onChange={(e) => setText(e.target.value)} enterKeyHint="search"
            placeholder={FIELDS.find((f) => f.id === field)?.hint} aria-label="Pesquisar livros" />
          {text && <button type="button" className="clear-btn" onClick={() => { setText(''); inputRef.current?.focus(); }} aria-label="Limpar"><IconClose size={14} /></button>}
        </label>
      </form>

      <div className="chips scroll-x">
        {FIELDS.map((f) => (
          <button key={f.id} className={`chip ${f.id === field ? 'active' : ''}`}
            onClick={() => (q ? navigate(`pesquisa?q=${encodeURIComponent(q)}&f=${f.id}`, { replace: true }) : (navigate(`pesquisa?f=${f.id}`, { replace: true }), inputRef.current?.focus()))}>
            {f.label}
          </button>
        ))}
      </div>

      {!q && (
        <div className="search-idle fade-up">
          <button className="scan-banner" onClick={() => navigate('camera')}>
            <IconBarcode size={26} />
            <span><b>Está com o livro na mão?</b><small>Fotografe a capa ou o código de barras.</small></span>
          </button>
          {history.length > 0 && (
            <>
              <div className="section-head"><h2>Pesquisas recentes</h2>
                <button className="see-more" onClick={() => { setHistory([]); localStorage.removeItem(HISTORY_KEY); }}>Limpar</button></div>
              <div className="chips wrap">
                {history.map((h) => <button key={h} className="chip" onClick={() => submit(h)}>{h}</button>)}
              </div>
            </>
          )}
          <p className="muted small sources">Resultados do <b>Google Books</b> e do <b>Open Library</b>.</p>
        </div>
      )}

      {loading && (
        <div className="result-grid">
          {Array.from({ length: 6 }).map((_, i) => <div key={i} className="result-card skeleton"><div className="result-cover" /><b /><span /></div>)}
        </div>
      )}

      {!loading && warn && <p className="notice">{warn}</p>}
      {!loading && error && <p className="notice error">{error}</p>}

      {!loading && results && (
        results.length ? (
          <>
            <p className="muted small">{results.length} resultados para “{q}”</p>
            <div className="result-grid">
              {results.map((r) => <ResultCard key={r.key} r={r} owned={!!findExisting(r)} />)}
            </div>
          </>
        ) : !error && (
          <div className="empty">
            <p className="muted">Nada encontrado para “{q}”.</p>
            <button className="btn btn-soft" onClick={() => { setDraft(field === 'isbn' ? { isbn13: q } : field === 'author' ? { authors: [q] } : { title: q }); navigate('novo'); }}>Cadastrar manualmente</button>
          </div>
        )
      )}
    </div>
  );
}
