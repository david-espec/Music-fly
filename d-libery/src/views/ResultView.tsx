import { useEffect, useState } from 'react';
import { setDraft, useApp } from '../store/AppStore';
import { goBack, navigate } from '../lib/router';
import { cachedResult, loadDetails, resultFromKey } from '../lib/search';
import { shopLinks, mergeLinks } from '../lib/links';
import { fmtRating } from '../lib/format';
import { Cover } from '../components/Cover';
import { InfoList, LinksList, shareBook, Synopsis } from '../components/BookParts';
import { Sheet } from '../components/Dialog';
import { useToast } from '../components/Toast';
import { IconBack, IconBookmark, IconCheck, IconEdit, IconHeart, IconHeartFill, IconShare, IconStar } from '../components/Icons';
import { STATUS_LABEL, type ReadingStatus, type SearchResult } from '../types';

export function ResultView({ resultKey }: { resultKey: string }) {
  const { settings, addFromResult, findExisting } = useApp();
  const toast = useToast();
  const [r, setR] = useState<SearchResult | null>(() => cachedResult(resultKey) ?? null);
  const [loading, setLoading] = useState(true);
  const [fav, setFav] = useState(false);
  const [askStatus, setAskStatus] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      const base = cachedResult(resultKey) ?? (await resultFromKey(resultKey, settings.googleApiKey));
      if (!alive) return;
      if (!base) { setLoading(false); return; }
      setR(base);
      const full = await loadDetails(base, settings.googleApiKey);
      if (alive) { setR(full); setLoading(false); }
    })();
    return () => { alive = false; };
  }, [resultKey, settings.googleApiKey]);

  if (!r) {
    return (
      <div className="page">
        <header className="top-bar"><button className="icon-btn" onClick={() => goBack('pesquisa')} aria-label="Voltar"><IconBack /></button></header>
        {loading ? <div className="spinner center" /> : <p className="empty muted">Não foi possível abrir este livro.</p>}
      </div>
    );
  }

  const existing = findExisting(r);
  const links = mergeLinks(r.links, shopLinks(r));

  const add = async (status: ReadingStatus) => {
    setSaving(true);
    try {
      const b = await addFromResult(r, { status, favorite: fav });
      toast('Adicionado à sua estante', { label: 'Abrir', run: () => navigate(`livro/${b.id}`) });
      setAskStatus(false);
    } catch (e) {
      toast(`Erro ao salvar: ${(e as Error).message}`);
    } finally { setSaving(false); }
  };

  return (
    <div className="page detail">
      <header className="top-bar">
        <button className="icon-btn" onClick={() => goBack('pesquisa')} aria-label="Voltar"><IconBack /></button>
        <div className="top-actions">
          {!existing && (
            <button className={`icon-btn ${fav ? 'fav-on' : ''}`} onClick={() => setFav(!fav)} aria-label="Favoritar ao adicionar" aria-pressed={fav}>
              {fav ? <IconHeartFill /> : <IconHeart />}
            </button>
          )}
          <button className="icon-btn" aria-label="Compartilhar" onClick={async () => {
            const res = await shareBook(r.title, r.authors[0], r.links.find((l) => l.kind === 'info')?.url);
            if (res === 'copied') toast('Copiado para a área de transferência');
          }}><IconShare /></button>
        </div>
      </header>

      <div className="detail-hero">
        <Cover title={r.title} author={r.authors[0]} src={r.coverUrlLarge ?? r.coverUrl} fallbackSrc={r.coverUrl} size="xl" className="hero-cover" />
      </div>

      <h1 className="book-title">{r.title}</h1>
      {r.subtitle && <p className="book-subtitle">{r.subtitle}</p>}
      <p className="book-author">{r.authors.join(', ') || 'Autor desconhecido'}</p>

      <div className="meta-row">
        {r.rating ? <span className="rating-inline"><IconStar size={16} /> {fmtRating(r.rating)} {r.ratingsCount ? <span className="muted">({r.ratingsCount} avaliações)</span> : null}</span> : null}
        {r.categories[0] && <span className="tag">{r.categories[0]}</span>}
        {r.freeDigital && <span className="tag green">Versão digital gratuita</span>}
      </div>

      {loading && !r.description ? <div className="skeleton-lines"><span /><span /><span /></div> : <Synopsis text={r.description} />}

      <InfoList info={r} />
      <LinksList links={links} />
      <p className="muted xsmall source-note">Fonte: {r.provider === 'google' ? 'Google Books' : 'Open Library'}</p>

      <div className="sticky-cta">
        {existing ? (
          <button className="btn btn-primary btn-lg block" onClick={() => navigate(`livro/${existing.id}`)}>
            <IconCheck size={18} /> Na sua estante · {STATUS_LABEL[existing.status]}
          </button>
        ) : (
          <div className="cta-pair">
            <button className="btn btn-soft btn-lg" onClick={() => { setDraft({ fromResult: r, favorite: fav }); navigate('novo'); }} aria-label="Revisar antes de salvar">
              <IconEdit size={18} />
            </button>
            <button className="btn btn-primary btn-lg block" onClick={() => setAskStatus(true)} disabled={saving}>
              <IconBookmark size={18} /> Adicionar à minha biblioteca
            </button>
          </div>
        )}
      </div>

      <Sheet open={askStatus} onClose={() => setAskStatus(false)} title="Em qual estante?">
        <div className="status-options">
          {(['want', 'reading', 'read'] as ReadingStatus[]).map((s) => (
            <button key={s} className="status-option" disabled={saving} onClick={() => add(s)}>
              <b>{STATUS_LABEL[s]}</b>
              <small>{s === 'want' ? 'Lista de desejos' : s === 'reading' ? 'Começo a contar hoje' : 'Já terminei este livro'}</small>
            </button>
          ))}
        </div>
        {saving && <p className="muted small center">Salvando e guardando a capa…</p>}
      </Sheet>
    </div>
  );
}
