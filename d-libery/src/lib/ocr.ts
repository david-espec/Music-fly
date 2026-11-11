import type { SearchResult } from '../types';
import { loadBitmap, toCanvas } from './image';
import { searchBooks } from './search';
import { norm } from './text';

export interface OcrLine { text: string; height: number; confidence: number }

export interface CoverRecognition {
  lines: OcrLine[];
  /** Consultas tentadas, na ordem. */
  queries: string[];
  candidates: (SearchResult & { score: number })[];
}

type Progress = (stage: string, pct?: number) => void;

// O worker do Tesseract e caro de criar: um so, reaproveitado.
let workerP: Promise<import('tesseract.js').Worker> | null = null;
let progressCb: Progress | null = null;

async function getWorker() {
  if (!workerP) {
    workerP = (async () => {
      const { createWorker } = await import('tesseract.js');
      return createWorker(['por', 'eng'], 1, {
        logger: (m) => {
          if (!progressCb) return;
          if (m.status === 'recognizing text') progressCb('Lendo o texto da capa', m.progress);
          else if (/load|initializ/i.test(m.status)) progressCb('Preparando o leitor de texto (só na primeira vez)', m.progress);
        },
      });
    })();
    workerP.catch(() => { workerP = null; });
  }
  return workerP;
}

/**
 * Escala de cinza com contraste reforcado.
 *  - 'luma': luminancia normal (bom para texto preto/branco);
 *  - 'max': maior canal de cor (titulos coloridos, ex. vermelho sobre preto,
 *    que na luminancia ficam quase da cor do fundo).
 */
function preprocess(src: HTMLCanvasElement, mode: 'luma' | 'max') {
  const c = document.createElement('canvas');
  c.width = src.width; c.height = src.height;
  const ctx = c.getContext('2d')!;
  ctx.drawImage(src, 0, 0);
  const img = ctx.getImageData(0, 0, c.width, c.height);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    let g = mode === 'max' ? Math.max(d[i], d[i + 1], d[i + 2]) : 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    g = Math.max(0, Math.min(255, (g - 128) * 1.5 + 128));
    d[i] = d[i + 1] = d[i + 2] = g;
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

async function readLines(canvas: HTMLCanvasElement): Promise<OcrLine[]> {
  const worker = await getWorker();
  const { data } = await worker.recognize(canvas, {}, { blocks: true, text: true });
  const out: OcrLine[] = [];
  for (const b of data.blocks ?? []) for (const p of b.paragraphs) for (const l of p.lines) {
    const words = l.words.filter((w) => w.confidence >= 55 && /[\p{L}\d]{2,}/u.test(w.text));
    if (!words.length) continue;
    const text = words.map((w) => w.text).join(' ').replace(/[^\p{L}\d' :.-]/gu, '').trim();
    if (text.length < 2) continue;
    const height = Math.max(...words.map((w) => w.bbox.y1 - w.bbox.y0));
    const confidence = words.reduce((s, w) => s + w.confidence, 0) / words.length;
    out.push({ text, height, confidence });
  }
  return out;
}

const tokens = (s: string) => norm(s).split(' ').filter((t) => t.length >= 3);

/** Distancia de edicao (Levenshtein) com limite, para tolerar erros do OCR ("Saplens" ~ "Sapiens"). */
function closeEnough(a: string, b: string) {
  if (a === b) return true;
  const max = a.length >= 7 ? 2 : a.length >= 4 ? 1 : 0;
  if (!max || Math.abs(a.length - b.length) > max) return false;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[b.length] <= max;
}

/** Quanto o resultado combina com o texto lido na capa (0..1+). */
function score(r: SearchResult, ocrTokens: Set<string>) {
  const title = tokens(r.title);
  const author = tokens(r.authors.join(' '));
  if (!title.length) return 0;
  const found = (t: string) => ocrTokens.has(t) || [...ocrTokens].some((o) => closeEnough(t, o));
  const hitT = title.filter(found).length / title.length;
  const hitA = author.length ? author.filter(found).length / author.length : 0;
  return hitT + hitA * 0.6 + (r.coverUrl ? 0.05 : 0);
}

/**
 * Reconhece um livro pela foto da capa:
 *  1. le o texto com OCR (Tesseract, no proprio aparelho);
 *  2. as linhas com letras maiores costumam ser titulo e autor;
 *  3. pesquisa essas linhas no Google Books e no Open Library;
 *  4. ordena os resultados pela semelhanca com o texto lido.
 */
export async function recognizeCover(photo: Blob, opts: { apiKey?: string; onProgress?: Progress } = {}): Promise<CoverRecognition> {
  progressCb = opts.onProgress ?? null;
  try {
    opts.onProgress?.('Preparando a imagem');
    const base = toCanvas(await loadBitmap(photo), 1600);
    const pass1 = await readLines(preprocess(base, 'luma'));
    opts.onProgress?.('Lendo de novo, realçando as cores');
    const pass2 = await readLines(preprocess(base, 'max'));
    // Junta as duas leituras sem repetir linhas.
    const byText = new Map<string, OcrLine>();
    for (const l of [...pass1, ...pass2]) {
      const k = norm(l.text);
      const prev = byText.get(k);
      if (k && (!prev || l.confidence > prev.confidence)) byText.set(k, l);
    }
    const lines = [...byText.values()].sort((a, b) => b.height - a.height);

    const ocrTokens = new Set(lines.flatMap((l) => tokens(l.text)));
    const big = lines.slice(0, 3).map((l) => l.text);
    const queries = [
      big.slice(0, 2).join(' '),
      big[0],
      lines.slice(0, 6).map((l) => l.text).join(' ').split(' ').slice(0, 10).join(' '),
    ]
      .filter((q): q is string => !!q && norm(q).length >= 3)
      .filter((q, i, a) => a.indexOf(q) === i);

    const seen = new Map<string, SearchResult & { score: number }>();
    for (const q of queries) {
      opts.onProgress?.(`Procurando "${q}"`);
      try {
        const { results } = await searchBooks(q, 'all', { apiKey: opts.apiKey });
        for (const r of results) if (!seen.has(r.key)) seen.set(r.key, { ...r, score: score(r, ocrTokens) });
      } catch { /* tenta a proxima consulta */ }
      const best = Math.max(0, ...[...seen.values()].map((r) => r.score));
      if (best >= 1.2) break; // titulo e autor batem: suficiente
    }
    const candidates = [...seen.values()].filter((r) => r.score > 0.25).sort((a, b) => b.score - a.score).slice(0, 12);
    return { lines, queries, candidates };
  } finally {
    progressCb = null;
  }
}

/** Sugere titulo e autor para o cadastro manual a partir do texto lido. */
export function guessFromLines(lines: OcrLine[]) {
  const cap = (s: string) => s.toLowerCase().replace(/(^|\s)\p{L}/gu, (m) => m.toUpperCase());
  return { title: lines[0] ? cap(lines[0].text) : '', author: lines[1] ? cap(lines[1].text) : '' };
}
