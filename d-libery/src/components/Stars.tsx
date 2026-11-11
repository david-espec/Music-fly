import { IconStar } from './Icons';

/** Estrelas de 0 a 5 com meio ponto. Toque na metade esquerda = meia estrela. */
export function Stars({ value, onChange, size = 22 }: { value: number; onChange?: (v: number) => void; size?: number }) {
  return (
    <div className={`stars ${onChange ? 'stars-edit' : ''}`} role={onChange ? 'radiogroup' : 'img'} aria-label={`Avaliação ${value} de 5`}>
      {[1, 2, 3, 4, 5].map((i) => {
        const fill = Math.max(0, Math.min(1, value - (i - 1)));
        return (
          <span key={i} className="star" style={{ width: size, height: size }}>
            <IconStar size={size} className="star-bg" />
            <span className="star-fg" style={{ width: `${fill * 100}%` }}><IconStar size={size} /></span>
            {onChange && (
              <>
                <button type="button" className="star-hit left" aria-label={`${i - 0.5} estrelas`} onClick={() => onChange(value === i - 0.5 ? 0 : i - 0.5)} />
                <button type="button" className="star-hit right" aria-label={`${i} estrelas`} onClick={() => onChange(value === i ? 0 : i)} />
              </>
            )}
          </span>
        );
      })}
    </div>
  );
}
