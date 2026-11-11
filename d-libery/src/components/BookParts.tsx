import { useState, type ReactNode } from 'react';
import { IconBarcode, IconCalendar, IconDown, IconExternal, IconPages, IconPublisher, IconTag } from './Icons';
import type { BookInfo, BookLink } from '../types';

export function Synopsis({ text }: { text?: string }) {
  const [open, setOpen] = useState(false);
  if (!text) return <p className="muted small">Sem sinopse disponível.</p>;
  const long = text.length > 280;
  return (
    <div className="synopsis">
      <p className={!open && long ? 'clamp-5' : ''}>{text}</p>
      {long && (
        <button className="see-more center" onClick={() => setOpen(!open)}>
          {open ? 'Ver menos' : 'Ver mais'} <IconDown size={14} style={{ transform: open ? 'rotate(180deg)' : undefined }} />
        </button>
      )}
    </div>
  );
}

export function InfoList({ info }: { info: Partial<BookInfo> }) {
  const rows: [ReactNode, string, string | undefined][] = [
    [<IconPublisher size={17} />, 'Editora', info.publisher],
    [<IconCalendar size={17} />, 'Ano', info.year],
    [<IconPages size={17} />, 'Páginas', info.pageCount ? String(info.pageCount) : undefined],
    [<IconTag size={17} />, 'Categoria', info.categories?.join(', ') || undefined],
    [<IconBarcode size={17} />, 'ISBN', info.isbn13 ?? info.isbn10],
    [<IconTag size={17} />, 'Idioma', info.language ? langName(info.language) : undefined],
  ];
  const visible = rows.filter((r) => r[2]);
  if (!visible.length) return null;
  return (
    <dl className="info-list">
      {visible.map(([icon, label, value]) => (
        <div key={label} className="info-row"><dt>{icon}{label}</dt><dd>{value}</dd></div>
      ))}
    </dl>
  );
}

function langName(code: string) {
  try {
    const short = code.length === 3 ? ({ por: 'pt', eng: 'en', spa: 'es', fre: 'fr', ger: 'de', ita: 'it' } as Record<string, string>)[code] ?? code : code;
    return new Intl.DisplayNames(['pt-BR'], { type: 'language' }).of(short) ?? code;
  } catch { return code; }
}

const KIND_TITLE: Record<BookLink['kind'], string> = {
  read: 'Ler gratuitamente (versão legal)',
  preview: 'Prévia',
  info: 'Mais informações',
  buy: 'Onde encontrar e comprar',
};

export function LinksList({ links }: { links: BookLink[] }) {
  if (!links.length) return null;
  const groups = (['read', 'preview', 'buy', 'info'] as const).map((k) => [k, links.filter((l) => l.kind === k)] as const).filter(([, l]) => l.length);
  return (
    <div className="links">
      {groups.map(([kind, ls]) => (
        <div key={kind} className="link-group">
          <h4>{KIND_TITLE[kind]}</h4>
          {ls.map((l) => (
            <a key={l.url} href={l.url} target="_blank" rel="noopener noreferrer" className={`link-row ${kind}`}>
              <span>{l.label}</span><IconExternal size={16} />
            </a>
          ))}
        </div>
      ))}
    </div>
  );
}

export async function shareBook(title: string, author?: string, url?: string) {
  const text = `${title}${author ? ` — ${author}` : ''}`;
  if (navigator.share) {
    try { await navigator.share({ title, text, url }); return true; } catch { return false; }
  }
  await navigator.clipboard?.writeText(url ? `${text}\n${url}` : text);
  return 'copied' as const;
}
