import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { MoreIcon } from './Icons';

export interface MenuItem {
  label: string;
  icon?: ReactNode;
  onSelect: () => void;
  danger?: boolean;
  disabled?: boolean;
}

interface Position {
  top: number;
  left: number;
}

const MENU_WIDTH = 224;
const MARGIN = 8;

/**
 * Menu de acoes. A lista vai para um portal em `document.body` porque as linhas
 * da lista usam `content-visibility`, cujo `contain: paint` recortaria um
 * suspenso posicionado dentro da linha.
 */
export function Menu({ items, label = 'Mais acoes' }: { items: MenuItem[]; label?: string }) {
  const [position, setPosition] = useState<Position | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const menuId = useId();
  const open = position !== null;

  const place = () => {
    const button = buttonRef.current;
    if (!button) return;
    const rect = button.getBoundingClientRect();
    const height = 12 + items.length * 40;
    const below = window.innerHeight - rect.bottom;
    setPosition({
      top: below < height + MARGIN ? Math.max(MARGIN, rect.top - height - 4) : rect.bottom + 4,
      left: Math.min(
        Math.max(MARGIN, rect.right - MENU_WIDTH),
        window.innerWidth - MENU_WIDTH - MARGIN,
      ),
    });
  };

  useLayoutEffect(() => {
    if (open) listRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (listRef.current?.contains(target) || buttonRef.current?.contains(target)) return;
      setPosition(null);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setPosition(null);
      buttonRef.current?.focus();
    };
    // Recalcular a cada scroll seria caro; fechar e o comportamento usual.
    const close = () => setPosition(null);

    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    window.addEventListener('resize', close);
    window.addEventListener('scroll', close, true);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('resize', close);
      window.removeEventListener('scroll', close, true);
    };
  }, [open]);

  return (
    <div className="menu">
      <button
        ref={buttonRef}
        type="button"
        className="icon-button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => (open ? setPosition(null) : place())}
      >
        <MoreIcon />
      </button>

      {open &&
        createPortal(
          <div
            ref={listRef}
            className="menu__list"
            id={menuId}
            role="menu"
            tabIndex={-1}
            style={{ top: position.top, left: position.left, width: MENU_WIDTH }}
          >
            {items.map((item) => (
              <button
                key={item.label}
                type="button"
                role="menuitem"
                className={`menu__item ${item.danger ? 'menu__item--danger' : ''}`}
                disabled={item.disabled}
                onClick={() => {
                  setPosition(null);
                  item.onSelect();
                }}
              >
                {item.icon}
                <span>{item.label}</span>
              </button>
            ))}
          </div>,
          document.body,
        )}
    </div>
  );
}
