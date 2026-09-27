import { useCallback, useEffect, useRef, useState } from 'react';
import { CropEditor } from '../components/CropEditor.tsx';
import { Fitted } from '../components/Fitted.tsx';
import { IconClose, IconFlash, IconImport } from '../components/Icons.tsx';
import { toast } from '../components/Toast.tsx';
import { addPages, createDoc } from '../db.ts';
import { useBlobUrl } from '../lib/hooks.ts';
import { buildPage, preparePhoto, type Photo } from '../lib/pages.ts';
import { goBack, navigate } from '../lib/router.ts';
import { setPrefs, usePrefs } from '../prefs.ts';
import { DETECT_SIZE } from '../scan/detect.ts';
import { detectFrame } from '../scan/processor.ts';
import type { Quad } from '../scan/types.ts';

/** Tempo com a folha parada na mira antes da captura automatica. */
const HOLD_MS = 1300;
/** Quanto um canto pode tremer (fracao da imagem) e ainda contar como parado. */
const STILL = 0.025;

const cornerDelta = (a: Quad, b: Quad) => Math.max(...a.map((p, i) => Math.hypot(p.x - b[i].x, p.y - b[i].y)));

type CameraState = { kind: 'starting' } | { kind: 'live' } | { kind: 'unavailable'; reason: string };

interface ImageCaptureLike {
  takePhoto(): Promise<Blob>;
}
declare const ImageCapture: { new (track: MediaStreamTrack): ImageCaptureLike } | undefined;

export function ScannerView({ docId: initialDocId }: { docId?: string }) {
  const prefs = usePrefs();
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const [camera, setCamera] = useState<CameraState>({ kind: 'starting' });
  const [aspect, setAspect] = useState(3 / 4);
  const [liveQuad, setLiveQuad] = useState<Quad | null>(null);
  const [hold, setHold] = useState(0);
  const [review, setReview] = useState<Photo | null>(null);
  const [capturing, setCapturing] = useState(false);
  const [torch, setTorch] = useState<boolean | null>(null);
  const [pending, setPending] = useState(0);
  const [added, setAdded] = useState(0);
  const [lastThumb, setLastThumb] = useState<Blob | null>(null);
  const [flash, setFlash] = useState(0);
  const thumbUrl = useBlobUrl(lastThumb);

  const docId = useRef(initialDocId);
  const queue = useRef(Promise.resolve());
  const fileInput = useRef<HTMLInputElement>(null);
  const shotInput = useRef<HTMLInputElement>(null);

  // --- Camera -------------------------------------------------------------
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setCamera({ kind: 'unavailable', reason: 'Este navegador não dá acesso à câmera.' });
        return;
      }
      try {
        const s = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: { facingMode: { ideal: 'environment' }, width: { ideal: 3840 }, height: { ideal: 2160 } },
        });
        if (cancelled) {
          s.getTracks().forEach((t) => t.stop());
          return;
        }
        stream.current = s;
        const v = video.current!;
        v.srcObject = s;
        await v.play().catch(() => undefined);
        const caps = (s.getVideoTracks()[0].getCapabilities?.() ?? {}) as { torch?: boolean };
        setTorch(caps.torch ? false : null);
        setCamera({ kind: 'live' });
      } catch (e) {
        const name = (e as DOMException)?.name;
        setCamera({
          kind: 'unavailable',
          reason:
            name === 'NotAllowedError'
              ? 'O acesso à câmera foi negado. Libere nas permissões do navegador ou use as opções abaixo.'
              : name === 'NotFoundError'
                ? 'Nenhuma câmera encontrada neste aparelho.'
                : 'Não foi possível abrir a câmera.',
        });
      }
    })();
    return () => {
      cancelled = true;
      stream.current?.getTracks().forEach((t) => t.stop());
      stream.current = null;
    };
  }, []);

  const toggleTorch = async () => {
    const track = stream.current?.getVideoTracks()[0];
    if (!track || torch === null) return;
    try {
      await track.applyConstraints({ advanced: [{ torch: !torch } as MediaTrackConstraintSet] });
      setTorch(!torch);
    } catch {
      toast('Não consegui ligar a lanterna.');
    }
  };

  // --- Paginas --------------------------------------------------------------
  const ensureDoc = async () => {
    if (!docId.current) docId.current = (await createDoc()).id;
    return docId.current;
  };

  /** Processa em fila, uma por vez: a camera continua livre enquanto isso. */
  const enqueue = useCallback((photo: Photo, quad?: Quad) => {
    setPending((n) => n + 1);
    queue.current = queue.current
      .then(async () => {
        const id = await ensureDoc();
        const page = await buildPage(id, photo, { quad });
        await addPages(id, [page]);
        setAdded((n) => n + 1);
        setLastThumb(page.thumb);
      })
      .catch((e) => {
        console.error(e);
        toast('Falha ao processar uma página.');
      })
      .finally(() => setPending((n) => n - 1));
  }, []);

  const finish = async () => {
    await queue.current;
    if (docId.current) navigate({ name: 'doc', id: docId.current }, { replace: true });
    else goBack({ name: 'library' });
  };

  // --- Captura ------------------------------------------------------------
  const grab = async (): Promise<Blob> => {
    const track = stream.current?.getVideoTracks()[0];
    if (track && typeof ImageCapture !== 'undefined') {
      try {
        return await Promise.race([
          new ImageCapture(track).takePhoto(),
          new Promise<never>((_, rej) => setTimeout(() => rej(new Error('timeout')), 4000)),
        ]);
      } catch {
        // Cai para o quadro do video.
      }
    }
    const v = video.current!;
    const c = document.createElement('canvas');
    c.width = v.videoWidth;
    c.height = v.videoHeight;
    c.getContext('2d')!.drawImage(v, 0, 0);
    return new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('Quadro vazio'))), 'image/jpeg', 0.95));
  };

  const armed = useRef(true);
  const lastCaptured = useRef<Quad | null>(null);

  const capture = useCallback(
    async (auto: boolean) => {
      if (capturing) return;
      setCapturing(true);
      setFlash((n) => n + 1);
      const seen = liveQuad;
      try {
        const photo = await preparePhoto(await grab());
        // Se a foto grande nao achou borda mas a previa achou, fica com a da previa.
        if (!photo.detected && seen) photo.quad = seen;
        if (auto) {
          armed.current = false;
          lastCaptured.current = seen;
          enqueue(photo);
          toast('Página capturada');
        } else setReview(photo);
      } catch (e) {
        console.error(e);
        toast('Não consegui tirar a foto.');
      } finally {
        setCapturing(false);
        setHold(0);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [capturing, liveQuad, enqueue],
  );

  // --- Deteccao ao vivo ----------------------------------------------------
  const captureRef = useRef(capture);
  captureRef.current = capture;
  const autoRef = useRef(prefs.autoCapture);
  autoRef.current = prefs.autoCapture;
  const paused = review !== null || capturing;
  const pausedRef = useRef(paused);
  pausedRef.current = paused;

  useEffect(() => {
    if (camera.kind !== 'live') return;
    const v = video.current!;
    const small = document.createElement('canvas');
    const ctx = small.getContext('2d', { willReadFrequently: true })!;
    let busy = false;
    let stop = false;
    let prev: Quad | null = null;
    let stillSince = 0;

    const tick = async () => {
      if (stop) return;
      if (!busy && !pausedRef.current && v.videoWidth) {
        busy = true;
        setAspect(v.videoWidth / v.videoHeight);
        const k = DETECT_SIZE / Math.max(v.videoWidth, v.videoHeight);
        small.width = Math.round(v.videoWidth * k);
        small.height = Math.round(v.videoHeight * k);
        ctx.drawImage(v, 0, 0, small.width, small.height);
        try {
          const d = await detectFrame(ctx.getImageData(0, 0, small.width, small.height));
          if (stop) return;
          const now = performance.now();
          if (d && d.score > 0.45) {
            // Suaviza o tremor da mira sem atrasar demais o movimento.
            const q = prev && cornerDelta(prev, d.quad) < 0.08
              ? (d.quad.map((p, i) => ({ x: prev![i].x * 0.4 + p.x * 0.6, y: prev![i].y * 0.4 + p.y * 0.6 })) as Quad)
              : d.quad;
            if (!prev || cornerDelta(prev, q) > STILL) stillSince = now;
            if (!armed.current && (!lastCaptured.current || cornerDelta(lastCaptured.current, q) > 0.1)) {
              armed.current = true;
            }
            prev = q;
            setLiveQuad(q);
            const progress = Math.min(1, (now - stillSince) / HOLD_MS);
            setHold(autoRef.current && armed.current ? progress : 0);
            if (progress >= 1 && autoRef.current && armed.current) captureRef.current(true);
          } else {
            prev = null;
            armed.current = true;
            setLiveQuad(null);
            setHold(0);
          }
        } catch {
          // Quadro perdido: tenta no proximo.
        } finally {
          busy = false;
        }
      }
      setTimeout(tick, 90);
    };
    tick();
    return () => {
      stop = true;
    };
  }, [camera.kind]);

  // --- Importacao ------------------------------------------------------------
  const importFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    const list = Array.from(files).filter((f) => f.type.startsWith('image/'));
    if (!list.length) {
      toast('Escolha arquivos de imagem.');
      return;
    }
    toast(list.length === 1 ? 'Importando imagem…' : `Importando ${list.length} imagens…`);
    for (const f of list) {
      try {
        enqueue(await preparePhoto(f));
      } catch {
        toast(`Não consegui abrir ${f.name}.`);
      }
    }
    await queue.current;
    await finish();
  };

  const nativeShot = async (files: FileList | null) => {
    const f = files?.[0];
    if (!f) return;
    try {
      setReview(await preparePhoto(f));
    } catch {
      toast('Não consegui abrir a foto.');
    }
  };

  const count = added + pending;
  const ring = 2 * Math.PI * 34;

  return (
    <div className="scanner">
      <header className="bar bar-dark scanner-bar">
        <button className="icon-btn" onClick={() => (count ? finish() : goBack({ name: 'library' }))} aria-label="Fechar">
          <IconClose />
        </button>
        <button
          className={`chip ${prefs.autoCapture ? 'chip-on' : ''}`}
          onClick={() => setPrefs({ autoCapture: !prefs.autoCapture })}
          aria-pressed={prefs.autoCapture}
        >
          Captura automática {prefs.autoCapture ? 'ligada' : 'desligada'}
        </button>
        {torch !== null ? (
          <button className={`icon-btn ${torch ? 'on' : ''}`} onClick={toggleTorch} aria-label="Lanterna" aria-pressed={torch}>
            <IconFlash />
          </button>
        ) : (
          <span className="icon-btn-spacer" />
        )}
      </header>

      <div className="scanner-stage">
        {camera.kind === 'unavailable' ? (
          <div className="camera-off">
            <p>{camera.reason}</p>
            <button className="btn btn-primary" onClick={() => shotInput.current?.click()}>
              Tirar foto com o app da câmera
            </button>
            <button className="btn" onClick={() => fileInput.current?.click()}>
              Escolher imagens
            </button>
          </div>
        ) : (
          <Fitted aspect={aspect} className="video-fit">
            <video ref={video} playsInline muted autoPlay className="scanner-video" />
            <svg viewBox="0 0 1 1" preserveAspectRatio="none" className="scanner-overlay">
              {liveQuad && (
                <polygon
                  points={liveQuad.map((p) => `${p.x},${p.y}`).join(' ')}
                  className={hold > 0 ? 'live-quad holding' : 'live-quad'}
                  vectorEffect="non-scaling-stroke"
                />
              )}
            </svg>
            <div key={flash} className={flash ? 'shutter-flash' : undefined} />
            {camera.kind === 'starting' && <p className="scanner-hint">Abrindo a câmera…</p>}
            {camera.kind === 'live' && (
              <p className="scanner-hint">
                {liveQuad
                  ? prefs.autoCapture && hold > 0
                    ? 'Segure firme…'
                    : 'Documento encontrado'
                  : 'Enquadre o documento sobre um fundo contrastante'}
              </p>
            )}
          </Fitted>
        )}
        {/* Mantem o <video> montado para o efeito da camera achar o elemento. */}
        {camera.kind === 'unavailable' && <video ref={video} hidden />}
      </div>

      <footer className="scanner-controls">
        <button className="thumb-btn" onClick={finish} disabled={!count} aria-label={`Concluir com ${count} páginas`}>
          {thumbUrl ? <img src={thumbUrl} alt="" /> : <span className="thumb-empty" />}
          {count > 0 && <span className="badge">{count}</span>}
        </button>

        <button
          className="shutter"
          onClick={() => (camera.kind === 'live' ? capture(false) : shotInput.current?.click())}
          disabled={capturing}
          aria-label="Capturar"
        >
          <svg viewBox="0 0 80 80" aria-hidden="true">
            <circle cx="40" cy="40" r="34" className="shutter-track" />
            <circle
              cx="40"
              cy="40"
              r="34"
              className="shutter-progress"
              strokeDasharray={ring}
              strokeDashoffset={ring * (1 - hold)}
            />
          </svg>
          <span className="shutter-core" />
        </button>

        <div className="scanner-side">
          <button className="icon-btn" onClick={() => fileInput.current?.click()} aria-label="Importar imagens">
            <IconImport />
          </button>
          {count > 0 && (
            <button className="done-btn" onClick={finish}>
              {pending ? 'Processando…' : 'Concluir'}
            </button>
          )}
        </div>
      </footer>

      {review && (
        <div className="overlay-layer">
          <CropEditor
            image={review.blob}
            width={review.width}
            height={review.height}
            initial={review.quad}
            title={added ? `Página ${added + pending + 1}` : 'Ajustar recorte'}
            onCancel={() => setReview(null)}
            onConfirm={(quad) => {
              enqueue(review, quad);
              setReview(null);
            }}
          />
        </div>
      )}

      <input ref={fileInput} type="file" accept="image/*" multiple hidden onChange={(e) => importFiles(e.target.files)} />
      <input
        ref={shotInput}
        type="file"
        accept="image/*"
        capture="environment"
        hidden
        onChange={(e) => {
          nativeShot(e.target.files);
          e.target.value = '';
        }}
      />
    </div>
  );
}
