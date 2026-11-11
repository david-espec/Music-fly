import { navigate, enc } from '../lib/router';
import { rememberResult } from '../lib/search';
import { Cover } from './Cover';
import { IconCheck } from './Icons';
import type { SearchResult } from '../types';

export function ResultCard({ r, owned, onPick }: { r: SearchResult; owned?: boolean; onPick?: () => void }) {
  return (
    <button className="result-card" onClick={() => { if (onPick) onPick(); else { rememberResult(r); navigate(`resultado/${enc(r.key)}`); } }}>
      <div className="result-cover">
        <Cover title={r.title} author={r.authors[0]} src={r.coverUrl} size="fill" />
        {owned && <span className="owned-badge" title="Na sua estante"><IconCheck size={14} /></span>}
        {r.freeDigital && <span className="free-badge">Grátis</span>}
      </div>
      <b className="clamp-2">{r.title}</b>
      <span className="muted xsmall clamp-1">{r.authors.join(', ') || 'Autor desconhecido'}{r.year ? ` · ${r.year}` : ''}</span>
    </button>
  );
}
