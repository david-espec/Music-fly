import { useState } from 'react';
import { useImage } from '../store/useImage';
import type { Book } from '../types';

/** Capa gerada quando o livro nao tem imagem: cor estavel derivada do titulo. */
function Placeholder({ title, author }: { title: string; author?: string }) {
  let h = 0;
  for (const ch of title) h = (h * 31 + ch.charCodeAt(0)) % 360;
  return (
    <div className="cover-ph" style={{ ['--h' as string]: h }}>
      <span className="cover-ph-title">{title}</span>
      {author && <span className="cover-ph-author">{author}</span>}
    </div>
  );
}

interface Props {
  title: string;
  author?: string;
  coverId?: string;
  src?: string | null;
  fallbackSrc?: string;
  className?: string;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl' | 'fill';
}

export function Cover({ title, author, coverId, src, fallbackSrc, className = '', size = 'md' }: Props) {
  const stored = useImage(coverId);
  const [failed, setFailed] = useState(0);
  const candidates = [stored, src, fallbackSrc].filter(Boolean) as string[];
  const url = candidates[failed];
  return (
    <div className={`cover cover-${size} ${className}`}>
      {url ? (
        <img src={url} alt={`Capa de ${title}`} loading="lazy" draggable={false}
          onError={() => setFailed((f) => f + 1)}
          onLoad={(e) => { if ((e.currentTarget.naturalWidth || 2) < 2) setFailed((f) => f + 1); }} />
      ) : (
        <Placeholder title={title} author={author} />
      )}
    </div>
  );
}

export const BookCover = ({ book, size, className }: { book: Book; size?: Props['size']; className?: string }) => (
  <Cover title={book.title} author={book.authors[0]} coverId={book.coverId} src={book.coverUrl} size={size} className={className} />
);
