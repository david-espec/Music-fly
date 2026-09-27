import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';

/**
 * Encaixa uma area de proporcao `aspect` (largura/altura) no espaco
 * disponivel, centralizada — como object-fit: contain, mas com uma caixa real
 * onde imagem e sobreposicoes (SVG dos cantos) dividem as mesmas coordenadas.
 */
export function Fitted({ aspect, children, className }: { aspect: number; children: ReactNode; className?: string }) {
  const outer = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ w: 0, h: 0 });
  useLayoutEffect(() => {
    const el = outer.current;
    if (!el) return;
    const measure = () => {
      const cs = getComputedStyle(el);
      const W = el.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
      const H = el.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
      if (W <= 0 || H <= 0 || !aspect) return;
      const w = Math.min(W, H * aspect);
      setBox({ w, h: w / aspect });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [aspect]);
  return (
    <div ref={outer} className={`fitted ${className ?? ''}`}>
      <div className="fitted-box" style={{ width: box.w, height: box.h }}>
        {children}
      </div>
    </div>
  );
}
