import { useMemo, useRef, useState } from 'react';
import { takeDraft, setDraft, useApp, type NewBookInput } from '../store/AppStore';
import { useBlobUrl } from '../store/useImage';
import { goBack, navigate } from '../lib/router';
import { compressCover, downloadCover } from '../lib/image';
import { asIsbn, cleanIsbn } from '../lib/isbn';
import { lookupIsbn } from '../lib/search';
import { mergeLinks } from '../lib/links';
import { todayIso } from '../lib/format';
import { Cover } from '../components/Cover';
import { StatusPicker } from '../components/StatusPicker';
import { Stars } from '../components/Stars';
import { useToast } from '../components/Toast';
import { IconBack, IconCamera, IconCheck, IconHeart, IconHeartFill, IconImage, IconSearch, IconTrash } from '../components/Icons';
import type { BookLink, ReadingStatus } from '../types';

const GENRES = ['Ficção', 'Romance', 'Fantasia', 'Ficção científica', 'Mistério', 'Suspense', 'Terror', 'História', 'Biografia',
  'Filosofia', 'Psicologia', 'Autoajuda', 'Negócios', 'Ciência', 'Poesia', 'Clássicos', 'Infantojuvenil', 'Quadrinhos',
  'Religião', 'Política', 'Tecnologia', 'Arte', 'Culinária', 'Viagem', 'Educação'];

type CoverMode = 'keep' | 'photo' | 'remote' | 'none';
const MANUAL_LINK_LABEL = 'Versão digital (link salvo)';

export function BookFormView({ editId }: { editId?: string }) {
  const { books, addBook, updateBook, settings, findExisting } = useApp();
  const toast = useToast();
  const editing = editId ? books.find((b) => b.id === editId) : undefined;
  const draft = useMemo(() => (editId ? null : takeDraft()), [editId]);
  const fr = draft?.fromResult;
  const src = editing ?? { ...fr, ...draft };

  const [title, setTitle] = useState(src.title ?? '');
  const [subtitle, setSubtitle] = useState(src.subtitle ?? '');
  const [authors, setAuthors] = useState((src.authors ?? []).join(', '));
  const [publisher, setPublisher] = useState(src.publisher ?? '');
  const [year, setYear] = useState(src.year ?? '');
  const [pageCount, setPageCount] = useState(src.pageCount ? String(src.pageCount) : '');
  const [isbn, setIsbn] = useState(src.isbn13 ?? src.isbn10 ?? '');
  const [categories, setCategories] = useState((src.categories ?? []).join(', '));
  const [description, setDescription] = useState(src.description ?? '');
  const [status, setStatus] = useState<ReadingStatus>(src.status ?? 'want');
  const [favorite, setFavorite] = useState(src.favorite ?? false);
  const [rating, setRating] = useState(src.rating ?? 0);
  const [notes, setNotes] = useState(src.notes ?? '');
  const [pagesRead, setPagesRead] = useState(src.pagesRead ? String(src.pagesRead) : '');
  const [startedAt, setStartedAt] = useState(src.startedAt ?? '');
  const [finishedAt, setFinishedAt] = useState(src.finishedAt ?? '');
  const [digitalLink, setDigitalLink] = useState((src.links ?? []).find((l) => l.label === MANUAL_LINK_LABEL)?.url ?? '');

  const [photo, setPhoto] = useState<Blob | null>(draft?.photo ?? null);
  const remoteUrl = fr?.coverUrlLarge ?? fr?.coverUrl;
  const [coverMode, setCoverMode] = useState<CoverMode>(editing ? 'keep' : remoteUrl ? 'remote' : draft?.photo ? 'photo' : 'none');
  const photoUrl = useBlobUrl(photo);
  const [saving, setSaving] = useState(false);
  const [looking, setLooking] = useState(false);
  const camRef = useRef<HTMLInputElement>(null);
  const galRef = useRef<HTMLInputElement>(null);

  const onFile = async (f?: File) => {
    if (!f) return;
    try {
      setPhoto(await compressCover(f));
      setCoverMode('photo');
    } catch { toast('Não foi possível abrir a imagem'); }
  };

  /** Completa os campos vazios buscando pelo ISBN digitado. */
  const fillFromIsbn = async () => {
    const code = asIsbn(isbn);
    if (!code) { toast('ISBN inválido'); return; }
    setLooking(true);
    try {
      const [r] = await lookupIsbn(code, settings.googleApiKey);
      if (!r) { toast('Nenhum livro encontrado com esse ISBN'); return; }
      setTitle((v) => v || r.title);
      setSubtitle((v) => v || r.subtitle || '');
      setAuthors((v) => v || r.authors.join(', '));
      setPublisher((v) => v || r.publisher || '');
      setYear((v) => v || r.year || '');
      setPageCount((v) => v || (r.pageCount ? String(r.pageCount) : ''));
      setCategories((v) => v || r.categories.join(', '));
      setDescription((v) => v || r.description || '');
      if (!editing) setDraft({ fromResult: r });
      toast('Informações preenchidas pelo ISBN');
    } catch { toast('Sem conexão com as fontes de livros'); } finally { setLooking(false); }
  };

  const save = async () => {
    if (!title.trim()) { toast('Informe pelo menos o título'); return; }
    setSaving(true);
    try {
      const cleanedIsbn = cleanIsbn(isbn);
      const isbn13 = asIsbn(cleanedIsbn) ?? (cleanedIsbn.length === 13 ? cleanedIsbn : undefined);
      const baseLinks: BookLink[] = (editing?.links ?? fr?.links ?? []).filter((l) => l.label !== MANUAL_LINK_LABEL);
      const url = digitalLink.trim();
      const links = url ? mergeLinks([{ kind: 'read', label: MANUAL_LINK_LABEL, url: /^https?:\/\//.test(url) ? url : `https://${url}` }], baseLinks) : baseLinks;
      const pr = Math.max(0, Number(pagesRead) || 0);
      const fields = {
        title: title.trim(),
        subtitle: subtitle.trim() || undefined,
        authors: authors.split(/[,;]/).map((a) => a.trim()).filter(Boolean),
        publisher: publisher.trim() || undefined,
        year: year.trim() || undefined,
        pageCount: Number(pageCount) || undefined,
        isbn13,
        isbn10: isbn13 ? undefined : cleanedIsbn.length === 10 ? cleanedIsbn : undefined,
        categories: categories.split(/[,;]/).map((c) => c.trim()).filter(Boolean),
        description: description.trim() || undefined,
        links,
        status, favorite, rating, notes,
        pagesRead: pr,
        startedAt: startedAt || undefined,
        finishedAt: finishedAt || undefined,
      };

      if (editing) {
        const cover = coverMode === 'photo' && photo ? photo : coverMode === 'none' ? null : undefined;
        await updateBook(editing.id, { ...fields, ...(coverMode === 'none' ? { coverUrl: undefined } : {}) }, cover);
        toast('Alterações salvas');
        goBack();
        return;
      }

      const dup = findExisting({ isbn13, title: fields.title, authors: fields.authors });
      let coverBlob: Blob | null = null;
      let coverUrl: string | undefined;
      if (coverMode === 'photo' && photo) coverBlob = photo;
      if (coverMode === 'remote' && fr) {
        coverBlob = await downloadCover([fr.coverUrlLarge, fr.coverUrl]);
        if (!coverBlob) coverUrl = remoteUrl;
      }
      const input: NewBookInput = {
        ...fields,
        language: fr?.language,
        origin: fr ? fr.provider : 'manual',
        originId: fr?.providerId,
        coverBlob,
        coverUrl,
      };
      const book = await addBook(input);
      setDraft(null);
      toast(dup ? 'Salvo (você já tinha um livro parecido na estante)' : 'Livro salvo na sua estante');
      navigate(`livro/${book.id}`, { replace: true });
    } catch (e) {
      toast(`Erro ao salvar: ${(e as Error).message}`);
    } finally {
      setSaving(false);
    }
  };

  const previewSrc = coverMode === 'photo' ? photoUrl : coverMode === 'remote' ? remoteUrl : undefined;

  return (
    <form className="page form-page" onSubmit={(e) => { e.preventDefault(); save(); }}>
      <header className="top-bar">
        <button type="button" className="icon-btn" onClick={() => goBack()} aria-label="Voltar"><IconBack /></button>
        <h1 className="page-title">{editing ? 'Editar livro' : 'Novo livro'}</h1>
        <button type="submit" className="icon-btn" aria-label="Salvar" disabled={saving}><IconCheck /></button>
      </header>

      <div className="form-top">
        <div className="form-cover">
          {coverMode === 'keep' && editing ? (
            <Cover title={title || 'Sem título'} author={authors.split(',')[0]} coverId={editing.coverId} src={editing.coverUrl} size="fill" />
          ) : (
            <Cover key={previewSrc ?? 'none'} title={title || 'Sem título'} author={authors.split(',')[0]} src={previewSrc} size="fill" />
          )}
          <div className="cover-actions">
            <button type="button" onClick={() => camRef.current?.click()} aria-label="Tirar foto da capa"><IconCamera size={16} /></button>
            <button type="button" onClick={() => galRef.current?.click()} aria-label="Escolher imagem"><IconImage size={16} /></button>
            {coverMode !== 'none' && <button type="button" onClick={() => setCoverMode('none')} aria-label="Remover capa"><IconTrash size={16} /></button>}
          </div>
          <input ref={camRef} type="file" accept="image/*" capture="environment" hidden onChange={(e) => { onFile(e.target.files?.[0]); e.target.value = ''; }} />
          <input ref={galRef} type="file" accept="image/*" hidden onChange={(e) => { onFile(e.target.files?.[0]); e.target.value = ''; }} />
        </div>
        <div className="form-title-fields">
          <input className="input-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Título *" required aria-label="Título" />
          <input className="input-plain" value={authors} onChange={(e) => setAuthors(e.target.value)} placeholder="Autor(es), separados por vírgula" aria-label="Autores" />
          <input className="input-plain small" value={subtitle} onChange={(e) => setSubtitle(e.target.value)} placeholder="Subtítulo (opcional)" aria-label="Subtítulo" />
          {photo && remoteUrl && (
            <div className="cover-choice">
              <button type="button" className={`chip small ${coverMode === 'remote' ? 'active' : ''}`} onClick={() => setCoverMode('remote')}>Capa da internet</button>
              <button type="button" className={`chip small ${coverMode === 'photo' ? 'active' : ''}`} onClick={() => setCoverMode('photo')}>Minha foto</button>
            </div>
          )}
        </div>
      </div>

      <div className="form-rows">
        <label className="form-row"><span>Editora</span><input value={publisher} onChange={(e) => setPublisher(e.target.value)} placeholder="—" /></label>
        <label className="form-row"><span>Ano</span><input value={year} inputMode="numeric" maxLength={4} onChange={(e) => setYear(e.target.value.replace(/\D/g, ''))} placeholder="—" /></label>
        <label className="form-row"><span>Páginas</span><input value={pageCount} inputMode="numeric" onChange={(e) => setPageCount(e.target.value.replace(/\D/g, ''))} placeholder="—" /></label>
        <label className="form-row"><span>Gênero</span><input value={categories} list="genres" onChange={(e) => setCategories(e.target.value)} placeholder="Ex.: Fantasia" /></label>
        <datalist id="genres">{GENRES.map((g) => <option key={g} value={g} />)}</datalist>
        <div className="form-row">
          <span>ISBN</span>
          <input value={isbn} inputMode="numeric" onChange={(e) => setIsbn(e.target.value)} placeholder="—" aria-label="ISBN" />
          {asIsbn(isbn) && <button type="button" className="mini-btn" onClick={fillFromIsbn} disabled={looking}><IconSearch size={14} /> {looking ? '…' : 'Completar'}</button>}
        </div>
      </div>

      <h3 className="section-label">Status da leitura</h3>
      <StatusPicker value={status} onChange={(s) => {
        setStatus(s);
        if (s === 'reading' && !startedAt) setStartedAt(todayIso());
        if (s === 'read' && !finishedAt) setFinishedAt(todayIso());
      }} />

      {status !== 'want' && (
        <div className="dates">
          <label className="field compact"><span>Comecei em</span><input type="date" value={startedAt} max={todayIso()} onChange={(e) => setStartedAt(e.target.value)} /></label>
          {(status === 'read' || finishedAt) && (
            <label className="field compact"><span>Terminei em</span><input type="date" value={finishedAt} min={startedAt} max={todayIso()} onChange={(e) => setFinishedAt(e.target.value)} /></label>
          )}
          {(status === 'reading' || status === 'abandoned') && (
            <label className="field compact"><span>Páginas lidas</span><input type="number" inputMode="numeric" min={0} value={pagesRead} onChange={(e) => setPagesRead(e.target.value)} /></label>
          )}
        </div>
      )}

      <div className="rating-fav">
        <div>
          <h3 className="section-label">Avaliação</h3>
          <Stars value={rating} onChange={setRating} size={28} />
        </div>
        <button type="button" className={`fav-toggle ${favorite ? 'on' : ''}`} onClick={() => setFavorite(!favorite)} aria-pressed={favorite}>
          {favorite ? <IconHeartFill size={20} /> : <IconHeart size={20} />} Favorito
        </button>
      </div>

      <h3 className="section-label">Anotações (opcional)</h3>
      <textarea className="notes" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Escreva algo sobre este livro…" />

      <details className="more-fields">
        <summary>Sinopse e link digital</summary>
        <label className="field"><span>Sinopse</span><textarea rows={5} value={description} onChange={(e) => setDescription(e.target.value)} /></label>
        <label className="field"><span>Link para uma versão digital legal (opcional)</span>
          <input type="url" inputMode="url" value={digitalLink} onChange={(e) => setDigitalLink(e.target.value)} placeholder="https://…" /></label>
      </details>

      <button type="submit" className="btn btn-primary btn-lg block" disabled={saving}>
        {saving ? 'Salvando…' : editing ? 'Salvar alterações' : 'Salvar na biblioteca'}
      </button>
    </form>
  );
}
