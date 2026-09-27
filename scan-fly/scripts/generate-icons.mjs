// Gera os PNGs do PWA a partir das mesmas formas do icon.svg, sem dependencias.
// Uso: npm run icons
import { deflateSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'icons');
const SS = 4; // supersampling para suavizar as bordas

const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);

/** Retangulo arredondado em coordenadas do viewBox 512. */
function inRoundRect(x, y, x0, y0, w, h, r) {
  if (x < x0 || y < y0 || x > x0 + w || y > y0 + h) return false;
  const cx = Math.min(Math.max(x, x0 + r), x0 + w - r);
  const cy = Math.min(Math.max(y, y0 + r), y0 + h - r);
  return (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
}

function distToSegment(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

const brackets = [
  [92, 168, 92, 92], [92, 92, 168, 92],
  [344, 92, 420, 92], [420, 92, 420, 168],
  [420, 344, 420, 420], [420, 420, 344, 420],
  [168, 420, 92, 420], [92, 420, 92, 344],
];

/** Cor do ponto (x, y) do viewBox, ou null fora do icone. */
function shade(x, y, maskable) {
  if (!maskable && !inRoundRect(x, y, 0, 0, 512, 512, 112)) return null;
  let c = mix(hex('#3b82f6'), hex('#1d4ed8'), y / 512);
  if (brackets.some(([ax, ay, bx, by]) => distToSegment(x, y, ax, ay, bx, by) <= 13)) c = mix(c, [255, 255, 255], 0.9);
  // Folha: corpo com a dobra cortada no canto superior direito.
  const inPage = inRoundRect(x, y, 144, 128, 208, 272, 16) && !(x > 300 && y < 180 && x - 300 > y - 128);
  if (inPage) {
    c = [255, 255, 255];
    if (x >= 300 && y <= 180 && x - 300 <= y - 128) c = hex('#bfdbfe');
    for (const [rx, ry, rw] of [[182, 212, 148], [182, 300, 148], [182, 340, 96]]) {
      if (inRoundRect(x, y, rx, ry, rw, 16, 8)) c = hex('#93c5fd');
    }
  }
  if (inRoundRect(x, y, 112, 252, 288, 20, 10)) c = hex('#22d3ee');
  return c;
}

function render(size, maskable = false) {
  const px = Buffer.alloc(size * size * 4);
  // Na versao "maskable" o desenho encolhe para a zona segura (80% central).
  const scale = maskable ? 0.8 : 1;
  const off = (512 * (1 - scale)) / 2;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const u = ((x + (sx + 0.5) / SS) / size) * 512;
          const v = ((y + (sy + 0.5) / SS) / size) * 512;
          let c = shade((u - off) / scale, (v - off) / scale, false);
          if (!c && maskable) c = hex('#1d4ed8');
          if (!c) continue;
          r += c[0]; g += c[1]; b += c[2]; a += 255;
        }
      }
      const n = SS * SS;
      const i = (y * size + x) * 4;
      const cover = a / n / 255;
      px[i] = cover ? r / n / cover : 0;
      px[i + 1] = cover ? g / n / cover : 0;
      px[i + 2] = cover ? b / n / cover : 0;
      px[i + 3] = a / n;
    }
  }
  return png(size, px);
}

function crc32(buf) {
  let c = ~0;
  for (const byte of buf) {
    c ^= byte;
    for (let k = 0; k < 8; k++) c = c & 1 ? (c >>> 1) ^ 0xedb88320 : c >>> 1;
  }
  return ~c >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}

function png(size, rgba) {
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

writeFileSync(join(OUT, 'icon-192.png'), render(192));
writeFileSync(join(OUT, 'icon-512.png'), render(512));
writeFileSync(join(OUT, 'icon-maskable-512.png'), render(512, true));
writeFileSync(join(OUT, 'apple-touch-icon.png'), render(180, true));
console.log('Icones gerados em', OUT);
