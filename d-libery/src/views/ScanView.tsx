import { useCallback, useEffect, useRef, useState } from 'react';
import { setDraft, useApp } from '../store/AppStore';
import { useBlobUrl } from '../store/useImage';
import { goBack, navigate } from '../lib/router';
import { detectIsbn, warmBarcode } from '../lib/barcode';
import { canvasToBlob, compressCover, loadBitmap, toCanvas } from '../lib/image';
import { guessFromLines, recognizeCover, type OcrLine } from '../lib/ocr';
import { loadDetails, lookupIsbn, searchBooks } from '../lib/search';
import { Cover } from '../components/Cover';
import { useToast } from '../components/Toast';
import { IconBack, IconBarcode, IconCamera, IconCheck, IconClose, IconEdit, IconFlash, IconFlashOff, IconFlip, IconImage, IconSearch } from '../components/Icons';
import type { SearchResult } from '../types';

/** Foto escolhida na galeria antes de abrir esta tela (menu "+"). */
let pendingPhoto: Blob | null = null;
export const setPendingPhoto = (b: Blob) => { pendingPhoto = b; };

type Phase =
  | { kind: 'camera' }
  | { kind: 'nocam'; reason: string }
  | { kind: 'working'; message: string; pct?: number }
  | { kind: 'results'; candidates: SearchResult[]; lines: OcrLine[]; query: string; isbn?: string };

export function ScanView() {
  const { settings, findExisting } = useApp();
  const toast = useToast();
  const videoRef = useRef<HTMLVideoElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scanning = useRef(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const nativeCamRef = useRef<HTMLInputElement>(null);
  const [phase, setPhase] = useState<Phase>(() => (pendingPhoto ? { kind: 'working', message: 'Preparando a imagem' } : { kind: 'camera' }));
  const [photo, setPhoto] = useState<Blob | null>(null);
  const [facing, setFacing] = useState<'environment' | 'user'>('environment');
  const [torch, setTorch] = useState<boolean | null>(null);
  const [opening, setOpening] = useState(true);
  const [query, setQuery] = useState('');
  const [picking, setPicking] = useState<string | null>(null);
  const photoUrl = useBlobUrl(photo);

  const stopCamera = useCallback(() => {
    scanning.current = false;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  // ---- Encontrou um ISBN no codigo de barras -------------------------------
  const handleIsbn = useCallback(async (isbn: string, sourcePhoto: Blob | null) => {
    stopCamera();
    navigator.vibrate?.(60);
    setPhase({ kind: 'working', message: `Código ${isbn} lido. Procurando o livro…` });
    try {
      const results = await lookupIsbn(isbn, settings.googleApiKey);
      setPhase({ kind: 'results', candidates: results.slice(0, 6), lines: [], query: isbn, isbn });
    } catch {
      setPhase({ kind: 'results', candidates: [], lines: [], query: isbn, isbn });
    }
    if (sourcePhoto) setPhoto(sourcePhoto);
  }, [settings.googleApiKey, stopCamera]);

  // ---- Foto da capa: codigo de barras primeiro, depois OCR ----------------
  const processPhoto = useCallback(async (blob: Blob) => {
    stopCamera();
    const small = await compressCover(blob).catch(() => blob);
    setPhoto(small);
    setPhase({ kind: 'working', message: 'Procurando código de barras' });
    try {
      const bmp = await loadBitmap(blob);
      const isbn = await detectIsbn(toCanvas(bmp, 1600));
      if (isbn) return handleIsbn(isbn, null);
    } catch { /* segue para o OCR */ }
    try {
      const rec = await recognizeCover(small, {
        apiKey: settings.googleApiKey,
        onProgress: (message, pct) => setPhase({ kind: 'working', message, pct }),
      });
      setQuery(rec.queries[0] ?? '');
      setPhase({ kind: 'results', candidates: rec.candidates, lines: rec.lines, query: rec.queries[0] ?? '' });
    } catch (e) {
      console.error(e);
      setPhase({ kind: 'results', candidates: [], lines: [], query: '' });
      toast('Não consegui ler a capa. Você pode pesquisar ou cadastrar manualmente.');
    }
  }, [handleIsbn, settings.googleApiKey, stopCamera, toast]);

  // Foto vinda da galeria pelo menu "+".
  useEffect(() => {
    if (pendingPhoto) {
      const p = pendingPhoto;
      pendingPhoto = null;
      processPhoto(p);
    }
  }, [processPhoto]);

  // ---- Camera ao vivo ------------------------------------------------------
  useEffect(() => {
    if (phase.kind !== 'camera') return;
    let cancelled = false;
    setOpening(true);
    (async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setPhase({ kind: 'nocam', reason: window.isSecureContext ? 'Este navegador não dá acesso à câmera.' : 'A câmera só funciona em conexão segura (https).' });
        return;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: facing }, width: { ideal: 1920 }, height: { ideal: 1080 } },
          audio: false,
        });
        if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = stream;
        const v = videoRef.current!;
        v.srcObject = stream;
        await v.play().catch(() => {});
        setOpening(false);
        const track = stream.getVideoTracks()[0];
        const caps = (track.getCapabilities?.() ?? {}) as { torch?: boolean };
        setTorch(caps.torch ? false : null);
        warmBarcode();
        // Leitura continua do codigo de barras enquanto a camera esta aberta.
        scanning.current = true;
        const loop = async () => {
          if (!scanning.current || cancelled) return;
          if (v.readyState >= 2) {
            const isbn = await detectIsbn(v);
            if (isbn && scanning.current) { handleIsbn(isbn, null); return; }
          }
          setTimeout(loop, 450);
        };
        setTimeout(loop, 600);
      } catch (e) {
        const name = (e as DOMException).name;
        setPhase({
          kind: 'nocam',
          reason: name === 'NotAllowedError' ? 'O acesso à câmera foi negado. Libere nas configurações do navegador ou use as opções abaixo.'
            : name === 'NotFoundError' ? 'Nenhuma câmera encontrada neste aparelho.'
            : 'Não foi possível abrir a câmera.',
        });
      }
    })();
    return () => { cancelled = true; stopCamera(); };
  }, [phase.kind, facing, handleIsbn, stopCamera]);

  const toggleTorch = async () => {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track || torch == null) return;
    try {
      await track.applyConstraints({ advanced: [{ torch: !torch } as MediaTrackConstraintSet] });
      setTorch(!torch);
    } catch { setTorch(null); }
  };

  /** Captura o quadro recortado na moldura da capa. */
  const capture = async () => {
    const v = videoRef.current;
    const f = frameRef.current;
    if (!v || !f || v.readyState < 2) return;
    const vr = v.getBoundingClientRect();
    const fr = f.getBoundingClientRect();
    const scale = Math.max(vr.width / v.videoWidth, vr.height / v.videoHeight);
    const offX = (vr.width - v.videoWidth * scale) / 2;
    const offY = (vr.height - v.videoHeight * scale) / 2;
    const margin = 0.04;
    const x = (fr.left - vr.left - offX) / scale / v.videoWidth - margin;
    const y = (fr.top - vr.top - offY) / scale / v.videoHeight - margin;
    const w = fr.width / scale / v.videoWidth + margin * 2;
    const h = fr.height / scale / v.videoHeight + margin * 2;
    const crop = { x: Math.max(0, x), y: Math.max(0, y), w: Math.min(1 - Math.max(0, x), w), h: Math.min(1 - Math.max(0, y), h) };
    const blob = await canvasToBlob(toCanvas(v, 1800, crop), 'image/jpeg', 0.92);
    processPhoto(blob);
  };

  const retake = () => { setPhoto(null); setPhase({ kind: 'camera' }); };

  const pick = async (r: SearchResult) => {
    setPicking(r.key);
    const full = await loadDetails(r, settings.googleApiKey).catch(() => r);
    setDraft({ fromResult: full, photo: photo ?? undefined });
    navigate('novo', { replace: true });
  };

  const manual = (lines: OcrLine[], isbn?: string) => {
    const g = guessFromLines(lines);
    setDraft({ photo: photo ?? undefined, title: g.title, authors: g.author ? [g.author] : [], isbn13: isbn });
    navigate('novo', { replace: true });
  };

  const research = async (e: React.FormEvent) => {
    e.preventDefault();
    if (phase.kind !== 'results' || !query.trim()) return;
    const prev = phase;
    setPhase({ kind: 'working', message: `Procurando "${query}"` });
    try {
      const { results } = await searchBooks(query, 'all', { apiKey: settings.googleApiKey });
      setPhase({ ...prev, candidates: results.slice(0, 12), query });
    } catch (err) {
      toast((err as Error).message);
      setPhase(prev);
    }
  };

  const onFile = (f?: File) => { if (f) processPhoto(f); };

  // ---------------------------------------------------------------------------
  if (phase.kind === 'camera') {
    return (
      <div className="scan">
        <video ref={videoRef} className="scan-video" playsInline muted autoPlay />
        <div className="scan-shade" />
        <div className="scan-top">
          <button className="scan-btn" onClick={() => goBack()} aria-label="Fechar"><IconClose /></button>
          {torch != null && (
            <button className="scan-btn" onClick={toggleTorch} aria-label="Lanterna" aria-pressed={torch}>{torch ? <IconFlash /> : <IconFlashOff />}</button>
          )}
        </div>
        <div className="scan-frame" ref={frameRef}><i /><i /><i /><i /><div className="scan-laser" /></div>
        <p className="scan-hint">{opening ? 'Abrindo a câmera…' : 'Enquadre a capa e toque no botão — ou aponte para o código de barras'}</p>
        <div className="scan-bottom">
          <button className="scan-btn" onClick={() => fileRef.current?.click()} aria-label="Galeria"><IconImage /></button>
          <button className="shutter" onClick={capture} aria-label="Fotografar capa" disabled={opening} />
          <button className="scan-btn" onClick={() => setFacing((f) => (f === 'environment' ? 'user' : 'environment'))} aria-label="Trocar câmera"><IconFlip /></button>
        </div>
        <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => { onFile(e.target.files?.[0]); e.target.value = ''; }} />
      </div>
    );
  }

  if (phase.kind === 'nocam') {
    return (
      <div className="page">
        <header className="top-bar"><button className="icon-btn" onClick={() => goBack()} aria-label="Voltar"><IconBack /></button><h1 className="page-title">Adicionar pela câmera</h1><span /></header>
        <div className="empty-hero">
          <IconCamera size={42} />
          <p className="muted">{phase.reason}</p>
          <div className="row-buttons col">
            <button className="btn btn-primary" onClick={() => nativeCamRef.current?.click()}><IconCamera size={18} /> Abrir câmera do aparelho</button>
            <button className="btn btn-soft" onClick={() => fileRef.current?.click()}><IconImage size={18} /> Escolher da galeria</button>
            <button className="btn btn-ghost" onClick={() => setPhase({ kind: 'camera' })}>Tentar de novo</button>
          </div>
        </div>
        <input ref={nativeCamRef} type="file" accept="image/*" capture="environment" hidden onChange={(e) => { onFile(e.target.files?.[0]); e.target.value = ''; }} />
        <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => { onFile(e.target.files?.[0]); e.target.value = ''; }} />
      </div>
    );
  }

  if (phase.kind === 'working') {
    return (
      <div className="scan-working">
        <div className="scan-photo">
          {photoUrl ? <img src={photoUrl} alt="Foto da capa" /> : <IconBarcode size={56} />}
          <div className="scan-sweep" />
        </div>
        <p className="working-msg">{phase.message}</p>
        {phase.pct != null && <div className="progress thin"><span style={{ width: `${Math.round(phase.pct * 100)}%` }} /></div>}
        <button className="btn btn-ghost" onClick={retake}>Cancelar</button>
      </div>
    );
  }

  // results
  const [best, ...others] = phase.candidates;
  return (
    <div className="page scan-results">
      <header className="top-bar">
        <button className="icon-btn" onClick={() => goBack()} aria-label="Fechar"><IconClose /></button>
        <h1 className="page-title">{best ? 'É este livro?' : 'Livro não identificado'}</h1>
        <button className="icon-btn" onClick={retake} aria-label="Tirar outra foto"><IconCamera /></button>
      </header>

      {best ? (
        <button className="match-card fade-up" onClick={() => pick(best)} disabled={!!picking}>
          <div className="match-covers">
            {photoUrl && <img src={photoUrl} className="match-photo" alt="Sua foto" />}
            <Cover title={best.title} author={best.authors[0]} src={best.coverUrl} size="md" />
          </div>
          <div className="match-info">
            <b>{best.title}</b>
            <span className="muted small">{best.authors.join(', ')}</span>
            <span className="muted xsmall">{[best.publisher, best.year].filter(Boolean).join(' · ')}</span>
            {findExisting(best) && <span className="tag">Já está na sua estante</span>}
            <span className="btn btn-primary"><IconCheck size={16} /> {picking === best.key ? 'Abrindo…' : 'Sim, é este'}</span>
          </div>
        </button>
      ) : (
        <div className="empty-hero">
          {photoUrl && <img src={photoUrl} className="nomatch-photo" alt="Sua foto" />}
          <p className="muted">
            {phase.isbn ? `Não encontrei o ISBN ${phase.isbn} nas bases públicas.` : 'Não encontrei este livro automaticamente.'} Você pode
            pesquisar com outras palavras ou cadastrá-lo usando a foto como capa.
          </p>
        </div>
      )}

      {others.length > 0 && (
        <>
          <h3 className="section-label">Outras possibilidades</h3>
          <div className="result-list">
            {others.map((r) => (
              <button key={r.key} className="result-line" onClick={() => pick(r)} disabled={!!picking}>
                <Cover title={r.title} author={r.authors[0]} src={r.coverUrl} size="xs" />
                <span><b className="clamp-1">{r.title}</b><small className="muted">{r.authors.join(', ')}{r.year ? ` · ${r.year}` : ''}</small></span>
              </button>
            ))}
          </div>
        </>
      )}

      <form className="research" onSubmit={research}>
        <label className="search-box">
          <IconSearch size={18} />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Título ou autor que aparece na capa" aria-label="Pesquisar com outro texto" />
        </label>
        <button className="btn btn-soft" type="submit">Pesquisar</button>
      </form>

      {phase.lines.length > 0 && (
        <details className="ocr-text">
          <summary>Texto lido na capa</summary>
          <p>{phase.lines.map((l) => l.text).join(' · ')}</p>
        </details>
      )}

      <button className="btn btn-primary btn-lg block" onClick={() => manual(phase.lines, phase.isbn)}>
        <IconEdit size={18} /> {best ? 'Nenhum destes — cadastrar manualmente' : 'Cadastrar manualmente com esta foto'}
      </button>
      <button className="btn btn-ghost block" onClick={retake}>Tirar outra foto</button>
    </div>
  );
}
