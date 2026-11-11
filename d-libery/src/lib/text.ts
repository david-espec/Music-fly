/** Remove HTML (descricoes do Google Books vem com <p>, <b>, <br>...). */
export function stripHtml(html?: string) {
  if (!html) return undefined;
  const withBreaks = html.replace(/<\s*(br|\/p|\/div|\/li)\s*\/?>/gi, '\n');
  const doc = new DOMParser().parseFromString(withBreaks, 'text/html');
  return (doc.body.textContent ?? '').replace(/\n{3,}/g, '\n\n').trim() || undefined;
}

/** Minusculas, sem acentos e sem pontuacao: para comparar titulos. */
export const norm = (s = '') =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();

export const yearOf = (date?: string | number) => {
  if (date == null) return undefined;
  const m = String(date).match(/\d{4}/);
  return m ? m[0] : undefined;
};

export const uniq = <T,>(arr: T[]) => [...new Set(arr)];

/** "Fiction / Science Fiction / General" -> ["Ficção científica"] etc. */
const CATEGORY_PT: Record<string, string> = {
  fiction: 'Ficção',
  'science fiction': 'Ficção científica',
  fantasy: 'Fantasia',
  history: 'História',
  philosophy: 'Filosofia',
  biography: 'Biografia',
  'biography & autobiography': 'Biografia',
  'juvenile fiction': 'Infantojuvenil',
  'young adult fiction': 'Jovem adulto',
  'self-help': 'Autoajuda',
  psychology: 'Psicologia',
  science: 'Ciência',
  'business & economics': 'Negócios',
  business: 'Negócios',
  economics: 'Economia',
  religion: 'Religião',
  poetry: 'Poesia',
  'literary criticism': 'Crítica literária',
  'literary collections': 'Coletâneas',
  'social science': 'Ciências sociais',
  'political science': 'Política',
  computers: 'Tecnologia',
  technology: 'Tecnologia',
  'technology & engineering': 'Tecnologia',
  education: 'Educação',
  art: 'Arte',
  'comics & graphic novels': 'Quadrinhos',
  cooking: 'Culinária',
  'health & fitness': 'Saúde',
  'body, mind & spirit': 'Espiritualidade',
  'family & relationships': 'Relacionamentos',
  romance: 'Romance',
  mystery: 'Mistério',
  thriller: 'Suspense',
  horror: 'Terror',
  travel: 'Viagem',
  drama: 'Drama',
  mathematics: 'Matemática',
  medical: 'Medicina',
  law: 'Direito',
  'true crime': 'Crime real',
  humor: 'Humor',
  music: 'Música',
  nature: 'Natureza',
  'language arts & disciplines': 'Linguagem',
  'foreign language study': 'Idiomas',
  'performing arts': 'Artes cênicas',
  'sports & recreation': 'Esportes',
  classics: 'Clássicos',
  'fiction / general': 'Ficção',
  'ficção': 'Ficção',
};

export function translateCategory(raw: string) {
  const head = raw.split('/')[0].trim();
  const t = CATEGORY_PT[head.toLowerCase()];
  if (t) return t;
  return head.charAt(0).toUpperCase() + head.slice(1);
}

export function cleanCategories(raw: string[] = [], max = 3) {
  return uniq(raw.map(translateCategory).filter((c) => c.length > 1 && c.length < 40)).slice(0, max);
}
