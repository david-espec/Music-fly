/** Remove tudo que nao for digito ou X. */
export const cleanIsbn = (s: string) => s.replace(/[^0-9Xx]/g, '').toUpperCase();

export function isValidIsbn13(s: string) {
  if (!/^\d{13}$/.test(s)) return false;
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += Number(s[i]) * (i % 2 ? 3 : 1);
  return (10 - (sum % 10)) % 10 === Number(s[12]);
}

export function isValidIsbn10(s: string) {
  if (!/^\d{9}[\dX]$/.test(s)) return false;
  let sum = 0;
  for (let i = 0; i < 10; i++) sum += (s[i] === 'X' ? 10 : Number(s[i])) * (10 - i);
  return sum % 11 === 0;
}

export function isbn10to13(s: string) {
  const core = '978' + s.slice(0, 9);
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += Number(core[i]) * (i % 2 ? 3 : 1);
  return core + ((10 - (sum % 10)) % 10);
}

/** Se o texto for um ISBN valido, devolve-o normalizado em 13 digitos. */
export function asIsbn(text: string): string | null {
  const c = cleanIsbn(text);
  if (isValidIsbn13(c)) return c;
  if (isValidIsbn10(c)) return isbn10to13(c);
  return null;
}

/** Codigos EAN-13 de livros comecam com 978 ou 979 ("Bookland"). */
export const isBookEan = (s: string) => /^97[89]\d{10}$/.test(s) && isValidIsbn13(s);
