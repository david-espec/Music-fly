import { useEffect, useRef, useState, type PointerEvent as RPointerEvent } from 'react';
import { useBlobUrl } from '../lib/hooks.ts';
import { FULL_QUAD, isConvex } from '../scan/geometry.ts';
import { detectBlob } from '../scan/processor.ts';
import type { Point, Quad } from '../scan/types.ts';
import { Fitted } from './Fitted.tsx';
import { IconCheck, IconClose, IconExpand, IconMagic } from './Icons.tsx';
import { toast } from './Toast.tsx';

/** Fator de ampliacao da lupa que aparece enquanto um canto e arrastado. */
const ZOOM = 2.5;
const LOUPE = 110;

/**
 * Ajuste manual dos quatro cantos. Os cantos sao arrastaveis pelo proprio
 * ponto ou pelo meio de cada lado (que move os dois cantos juntos). Uma lupa
 * mostra o que esta sob o dedo, que de outro modo cobriria justamente o canto.
 */
export function CropEditor({
  image,
  width,
  height,
  initial,
  title = 'Ajustar recorte',
  confirmLabel = 'Confirmar',
  onConfirm,
  onCancel,
}: {
  image: Blob;
  width: number;
  height: number;
  initial: Quad;
  title?: string;
  confirmLabel?: string;
  onConfirm: (quad: Quad) => void;
  onCancel: () => void;
}) {
  const url = useBlobUrl(image);
  const [quad, setQuad] = useState<Quad>(initial);
  const [drag, setDrag] = useState<{ kind: 'corner' | 'edge'; index: number; at: Point } | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const valid = isConvex(quad);

  useEffect(() => setQuad(initial), [initial]);

  const toNorm = (e: { clientX: number; clientY: number }): Point => {
    const r = box.current!.getBoundingClientRect();
    return {
      x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)),
      y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)),
    };
  };

  const start = (kind: 'corner' | 'edge', index: number) => (e: RPointerEvent) => {
    e.preventDefault();
    (e.target as Element).setPointerCapture(e.pointerId);
    setDrag({ kind, index, at: toNorm(e) });
  };

  const move = (e: RPointerEvent) => {
    if (!drag) return;
    const p = toNorm(e);
    setQuad((q) => {
      const next = q.map((c) => ({ ...c })) as Quad;
      if (drag.kind === 'corner') next[drag.index] = p;
      else {
        const a = drag.index;
        const b = (drag.index + 1) % 4;
        const dx = p.x - drag.at.x;
        const dy = p.y - drag.at.y;
        const clamp = (v: number) => Math.min(1, Math.max(0, v));
        next[a] = { x: clamp(q[a].x + dx), y: clamp(q[a].y + dy) };
        next[b] = { x: clamp(q[b].x + dx), y: clamp(q[b].y + dy) };
      }
      return next;
    });
    setDrag((d) => d && { ...d, at: p });
  };

  const end = () => setDrag(null);

  const autoDetect = async () => {
    const d = await detectBlob(image).catch(() => null);
    if (d) setQuad(d.quad);
    else toast('Não encontrei as bordas. Ajuste os cantos à mão.');
  };

  const points = quad.map((p) => `${p.x},${p.y}`).join(' ');
  const r = box.current?.getBoundingClientRect();
  const loupeAt = drag && drag.kind === 'corner' ? quad[drag.index] : null;

  return (
    <div className="crop-editor">
      <header className="bar bar-dark">
        <button className="icon-btn" onClick={onCancel} aria-label="Cancelar">
          <IconClose />
        </button>
        <h1 className="bar-title">{title}</h1>
        <span className="icon-btn-spacer" />
      </header>

      <Fitted aspect={width / height} className="crop-stage">
        <div ref={box} className="crop-box" onPointerMove={move} onPointerUp={end} onPointerCancel={end}>
          {url && <img src={url} alt="" draggable={false} />}
          <svg viewBox="0 0 1 1" preserveAspectRatio="none" className="crop-svg">
            <defs>
              <mask id="crop-hole">
                <rect x="0" y="0" width="1" height="1" fill="white" />
                <polygon points={points} fill="black" />
              </mask>
            </defs>
            <rect x="0" y="0" width="1" height="1" className="crop-shade" mask="url(#crop-hole)" />
            <polygon points={points} className={valid ? 'crop-line' : 'crop-line invalid'} vectorEffect="non-scaling-stroke" />
          </svg>
          {quad.map((p, i) => {
            const n = quad[(i + 1) % 4];
            return (
              <div
                key={`e${i}`}
                className="crop-edge"
                style={{ left: `${((p.x + n.x) / 2) * 100}%`, top: `${((p.y + n.y) / 2) * 100}%` }}
                onPointerDown={start('edge', i)}
                aria-hidden="true"
              />
            );
          })}
          {quad.map((p, i) => (
            <div
              key={`c${i}`}
              className={`crop-handle${drag?.kind === 'corner' && drag.index === i ? ' active' : ''}`}
              style={{ left: `${p.x * 100}%`, top: `${p.y * 100}%` }}
              onPointerDown={start('corner', i)}
              role="slider"
              aria-label={['Canto superior esquerdo', 'Canto superior direito', 'Canto inferior direito', 'Canto inferior esquerdo'][i]}
              aria-valuetext={`${Math.round(p.x * 100)}%, ${Math.round(p.y * 100)}%`}
              tabIndex={0}
              onKeyDown={(e) => {
                const step = e.shiftKey ? 0.02 : 0.005;
                const d = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[
                  e.key
                ];
                if (!d) return;
                e.preventDefault();
                setQuad((q) => {
                  const next = q.slice() as Quad;
                  next[i] = {
                    x: Math.min(1, Math.max(0, q[i].x + d[0])),
                    y: Math.min(1, Math.max(0, q[i].y + d[1])),
                  };
                  return next;
                });
              }}
            />
          ))}
          {loupeAt && r && url && (
            <div
              className="loupe"
              style={{
                // A lupa fica acima do dedo; perto do topo, desce para baixo dele.
                left: `${loupeAt.x * 100}%`,
                top: loupeAt.y * r.height > LOUPE + 40 ? `calc(${loupeAt.y * 100}% - ${LOUPE + 36}px)` : `calc(${loupeAt.y * 100}% + 36px)`,
                width: LOUPE,
                height: LOUPE,
                backgroundImage: `url(${url})`,
                backgroundSize: `${r.width * ZOOM}px ${r.height * ZOOM}px`,
                backgroundPosition: `${LOUPE / 2 - loupeAt.x * r.width * ZOOM}px ${LOUPE / 2 - loupeAt.y * r.height * ZOOM}px`,
              }}
              aria-hidden="true"
            />
          )}
        </div>
      </Fitted>

      <footer className="crop-tools">
        <button className="tool-btn" onClick={() => setQuad(FULL_QUAD)}>
          <IconExpand />
          <span>Página toda</span>
        </button>
        <button className="tool-btn" onClick={autoDetect}>
          <IconMagic />
          <span>Detectar</span>
        </button>
        <button className="fab-confirm" onClick={() => valid && onConfirm(quad)} disabled={!valid} aria-label={confirmLabel}>
          <IconCheck />
        </button>
      </footer>
      {!valid && <p className="crop-warning">Os cantos se cruzaram. Arraste-os de volta para formar um quadrilátero.</p>}
    </div>
  );
}
