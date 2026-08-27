import type { ReactNode } from 'react';
import type { Track } from '../types';
import { Cover } from './Cover';
import { PlayIcon } from './Icons';

export interface Card {
  key: string;
  title: string;
  subtitle: string;
  /** Faixa usada apenas para desenhar a capa. */
  cover: Track;
  /** Selo no canto da capa, como o preco numa capa de revista. */
  stamp?: string;
  onPlay: () => void;
}

interface CardRowProps {
  title: string;
  cards: Card[];
  /** Link opcional no canto, tipo "ver tudo". */
  action?: ReactNode;
  round?: boolean;
}

/**
 * Faixa horizontal de capas, no espirito da home do YouTube. Rola na
 * horizontal dentro do proprio container para a pagina nunca rolar de lado.
 */
export function CardRow({ title, cards, action, round = false }: CardRowProps) {
  if (cards.length === 0) return null;

  return (
    <section className="row">
      <header className="row__head">
        <h2>{title}</h2>
        {action}
      </header>

      <ul className="row__scroller">
        {cards.map((card) => (
          <li key={card.key}>
            <button type="button" onClick={card.onPlay} aria-label={`Tocar ${card.title}`}>
              <span className="row__art">
                {card.stamp && <span className="stamp">{card.stamp}</span>}
                <Cover
                  track={card.cover}
                  size={148}
                  className={`cover--fill ${round ? 'cover--round' : ''}`}
                />
                <span className="row__play">
                  <PlayIcon width={20} height={20} />
                </span>
              </span>
              <span className="row__title">{card.title}</span>
              <span className="row__subtitle">{card.subtitle}</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
