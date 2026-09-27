/**
 * Gerador de PDF minimo, sem dependencias: cada pagina e uma imagem JPEG
 * embutida como esta (filtro DCTDecode), sem recompressao.
 */

export type PageSize = 'auto' | 'a4' | 'carta';

export const PAGE_SIZES: { id: PageSize; label: string }[] = [
  { id: 'auto', label: 'Automático' },
  { id: 'a4', label: 'A4' },
  { id: 'carta', label: 'Carta' },
];

export interface PdfImage {
  jpeg: Uint8Array;
  width: number;
  height: number;
}

const SIZES_PT: Record<Exclude<PageSize, 'auto'>, [number, number]> = {
  a4: [595.28, 841.89],
  carta: [612, 792],
};

/** Geometria da pagina em pontos (1/72 pol) e onde a imagem entra nela. */
export function pageLayout(img: { width: number; height: number }, size: PageSize) {
  const landscape = img.width > img.height;
  if (size === 'auto') {
    // O lado maior da imagem ocupa o lado maior de uma A4.
    const k = 841.89 / Math.max(img.width, img.height);
    const w = img.width * k;
    const h = img.height * k;
    return { pageW: w, pageH: h, x: 0, y: 0, w, h };
  }
  let [pageW, pageH] = SIZES_PT[size];
  if (landscape) [pageW, pageH] = [pageH, pageW];
  const k = Math.min(pageW / img.width, pageH / img.height);
  const w = img.width * k;
  const h = img.height * k;
  return { pageW, pageH, x: (pageW - w) / 2, y: (pageH - h) / 2, w, h };
}

/** Texto do PDF em UTF-16BE com BOM, em hexa — aceita acentos no titulo. */
function pdfText(s: string): string {
  let hex = 'FEFF';
  for (let i = 0; i < s.length; i++) hex += s.charCodeAt(i).toString(16).padStart(4, '0').toUpperCase();
  return `<${hex}>`;
}

function pdfDate(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `D:${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

const num = (n: number) => (Math.round(n * 100) / 100).toString();

export function buildPdf(images: PdfImage[], opts: { title: string; pageSize: PageSize; date?: Date }): Uint8Array {
  const enc = new TextEncoder();
  const chunks: Uint8Array[] = [];
  const offsets: number[] = [];
  let length = 0;
  const push = (part: string | Uint8Array) => {
    const bytes = typeof part === 'string' ? enc.encode(part) : part;
    chunks.push(bytes);
    length += bytes.length;
  };
  // Numeracao: 1 catalogo, 2 arvore de paginas, 3 info; depois 3 objetos por
  // pagina (pagina, conteudo, imagem).
  const startObj = (id: number) => {
    offsets[id] = length;
    push(`${id} 0 obj\n`);
  };

  push('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n');
  const pageIds = images.map((_, i) => 4 + i * 3);

  startObj(1);
  push('<< /Type /Catalog /Pages 2 0 R >>\nendobj\n');
  startObj(2);
  push(`<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${images.length} >>\nendobj\n`);
  startObj(3);
  push(
    `<< /Title ${pdfText(opts.title)} /Producer ${pdfText('Scan Fly')} /CreationDate (${pdfDate(opts.date ?? new Date())}) >>\nendobj\n`,
  );

  images.forEach((img, i) => {
    const pageId = pageIds[i];
    const contentId = pageId + 1;
    const imageId = pageId + 2;
    const L = pageLayout(img, opts.pageSize);
    const content = `q ${num(L.w)} 0 0 ${num(L.h)} ${num(L.x)} ${num(L.y)} cm /Im0 Do Q`;

    startObj(pageId);
    push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${num(L.pageW)} ${num(L.pageH)}] ` +
        `/Resources << /XObject << /Im0 ${imageId} 0 R >> >> /Contents ${contentId} 0 R >>\nendobj\n`,
    );
    startObj(contentId);
    push(`<< /Length ${content.length} >>\nstream\n${content}\nendstream\nendobj\n`);
    startObj(imageId);
    push(
      `<< /Type /XObject /Subtype /Image /Width ${img.width} /Height ${img.height} ` +
        `/ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${img.jpeg.length} >>\nstream\n`,
    );
    push(img.jpeg);
    push('\nendstream\nendobj\n');
  });

  const xrefAt = length;
  const count = offsets.length;
  let xref = `xref\n0 ${count}\n0000000000 65535 f \n`;
  for (let id = 1; id < count; id++) xref += `${String(offsets[id]).padStart(10, '0')} 00000 n \n`;
  push(xref);
  push(`trailer\n<< /Size ${count} /Root 1 0 R /Info 3 0 R >>\nstartxref\n${xrefAt}\n%%EOF\n`);

  const out = new Uint8Array(length);
  let at = 0;
  for (const c of chunks) {
    out.set(c, at);
    at += c.length;
  }
  return out;
}
