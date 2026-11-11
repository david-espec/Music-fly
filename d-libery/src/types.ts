/** Situacao de leitura de um livro da estante. */
export type ReadingStatus = 'want' | 'reading' | 'read' | 'abandoned';

export const STATUS_LABEL: Record<ReadingStatus, string> = {
  want: 'Quero ler',
  reading: 'Lendo',
  read: 'Concluído',
  abandoned: 'Abandonado',
};

export type LinkKind = 'read' | 'preview' | 'buy' | 'info';

/** Link externo do livro: leitura legal gratuita, previa, compra ou ficha. */
export interface BookLink {
  kind: LinkKind;
  label: string;
  url: string;
}

/** Dados bibliograficos, comuns a resultados de pesquisa e a livros salvos. */
export interface BookInfo {
  title: string;
  subtitle?: string;
  authors: string[];
  publisher?: string;
  year?: string;
  description?: string;
  categories: string[];
  pageCount?: number;
  isbn13?: string;
  isbn10?: string;
  language?: string;
  links: BookLink[];
}

export type Provider = 'google' | 'openlibrary';

/** Um livro encontrado numa API publica. */
export interface SearchResult extends BookInfo {
  /** Chave unica, ex.: "google:zyTCAlFPjgYC" ou "openlibrary:/works/OL123W". */
  key: string;
  provider: Provider;
  providerId: string;
  coverUrl?: string;
  /** Capa em alta, quando a API oferece. */
  coverUrlLarge?: string;
  rating?: number;
  ratingsCount?: number;
  /** Ha versao digital legal e gratuita (dominio publico ou emprestimo). */
  freeDigital?: boolean;
}

export interface ProgressEntry {
  /** ISO yyyy-mm-dd */
  date: string;
  /** Total de paginas lidas naquele momento (nao o incremento). */
  pages: number;
}

/** Um livro da sua estante. */
export interface Book extends BookInfo {
  id: string;
  /** Capa guardada no aparelho (store "covers"). */
  coverId?: string;
  /** Capa remota de reserva, caso o download para o aparelho falhe. */
  coverUrl?: string;
  /** De onde veio: API ou cadastro manual. */
  origin: 'google' | 'openlibrary' | 'manual';
  originId?: string;
  status: ReadingStatus;
  favorite: boolean;
  /** 0 = sem avaliacao; 1..5, aceita meio ponto. */
  rating: number;
  notes: string;
  startedAt?: string;
  finishedAt?: string;
  pagesRead: number;
  progress: ProgressEntry[];
  createdAt: number;
  updatedAt: number;
}

export type ThemeMode = 'system' | 'light' | 'dark';

export interface Settings {
  name: string;
  handle: string;
  avatarId?: string;
  theme: ThemeMode;
  yearlyGoal: number;
  /** Chave opcional da Google Books API (aumenta o limite de consultas). */
  googleApiKey: string;
  onboarded: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  name: 'Leitor',
  handle: '',
  theme: 'system',
  yearlyGoal: 12,
  googleApiKey: '',
  onboarded: false,
};
