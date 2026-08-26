// Gera os icones PNG do PWA sem depender de bibliotecas externas.
// Uso: node scripts/generate-icons.mjs
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'icons');
const SS = 4; // supersampling para anti-aliasing

const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

/** Distancia de um ponto ao segmento AB, usada para tracos arredondados. */
function distToSegment(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : clamp01(((px - ax) * dx + (py - ay) * dy) / len2);
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

function quadPoint(p0, p1, p2, t) {
  const u = 1 - t;
  return [
    u * u * p0[0] + 2 * u * t * p1[0] + t * t * p2[0],
    u * u * p0[1] + 2 * u * t * p1[1] + t * t * p2[1],
  ];
}

/** Desenha o icone em coordenadas normalizadas (0..1) e devolve RGBA. */
function render(size) {
  const n = size * SS;
  const buf = Buffer.alloc(n * n * 4);

  const bgTop = [24, 21, 46];
  const bgBottom = [12, 12, 18];
  const accentA = [139, 92, 246]; // violeta
  const accentB = [34, 211, 238]; // ciano

  // Traco do "voo": bezier que sobe da esquerda ate a haste da nota.
  const flight = [];
  for (let i = 0; i <= 220; i++) {
    const t = i / 220;
    flight.push([quadPoint([0.14, 0.885], [0.33, 0.95], [0.56, 0.872], t), t]);
  }
  // Bandeira da nota.
  const flag = [];
  for (let i = 0; i <= 160; i++) {
    const t = i / 160;
    flag.push([quadPoint([0.615, 0.20], [0.86, 0.32], [0.70, 0.53], t), t]);
  }

  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const u = (x + 0.5) / n;
      const v = (y + 0.5) / n;
      const o = (y * n + x) * 4;

      // Fundo com cantos arredondados (raio 22%).
      const r = 0.22;
      const qx = Math.max(Math.abs(u - 0.5) - (0.5 - r), 0);
      const qy = Math.max(Math.abs(v - 0.5) - (0.5 - r), 0);
      const outside = Math.hypot(qx, qy) - r;
      const alpha = clamp01(0.5 - outside * n * 0.5 + 0.5) * (outside < 0.5 ? 1 : 0);
      if (alpha <= 0) continue;

      let color = mix(bgTop, bgBottom, clamp01(v * 1.15));
      // Brilho radial suave no canto superior esquerdo.
      const glow = clamp01(1 - Math.hypot(u - 0.22, v - 0.18) * 1.9);
      color = mix(color, accentA, glow * 0.28);

      const grad = clamp01((u - 0.1) * 0.8 + (1 - v) * 0.6);
      const ink = mix(accentB, accentA, grad);

      let cover = 0;

      // Cabeca da nota: elipse inclinada.
      const hx = u - 0.435;
      const hy = v - 0.715;
      const ang = -0.34;
      const ex = hx * Math.cos(ang) - hy * Math.sin(ang);
      const ey = hx * Math.sin(ang) + hy * Math.cos(ang);
      const ell = Math.hypot(ex / 0.155, ey / 0.115);
      cover = Math.max(cover, clamp01((1 - ell) * n * 0.06 + 0.5));

      // Haste.
      const stem = distToSegment(u, v, 0.588, 0.205, 0.588, 0.712);
      cover = Math.max(cover, clamp01((0.026 - stem) * n * 0.5 + 0.5));

      // Bandeira (espessura decrescente). A caixa delimitadora evita
      // percorrer a curva inteira para a maioria dos pixels.
      if (u > 0.54 && u < 0.94 && v > 0.12 && v < 0.61) for (const [p, t] of flag) {
        const w = 0.062 - 0.040 * t;
        const d = Math.hypot(u - p[0], v - p[1]);
        cover = Math.max(cover, clamp01((w - d) * n * 0.5 + 0.5));
        if (cover >= 1) break;
      }

      if (cover > 0) color = mix(color, ink, cover);

      // Rastro de voo: fino, semitransparente, atras da nota.
      let trail = 0;
      if (u > 0.10 && u < 0.60 && v > 0.84 && v < 0.98) for (const [p, t] of flight) {
        const w = 0.010 + 0.020 * t;
        const d = Math.hypot(u - p[0], v - p[1]);
        trail = Math.max(trail, clamp01((w - d) * n * 0.5 + 0.5) * (0.15 + 0.75 * t));
        if (trail >= 1) break;
      }
      if (trail > 0 && cover < 0.5) color = mix(color, accentB, trail * 0.85);

      buf[o] = Math.round(color[0]);
      buf[o + 1] = Math.round(color[1]);
      buf[o + 2] = Math.round(color[2]);
      buf[o + 3] = Math.round(alpha * 255);
    }
  }

  // Downsample por media de blocos SS x SS.
  const out = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let dy = 0; dy < SS; dy++) {
        for (let dx = 0; dx < SS; dx++) {
          const o = ((y * SS + dy) * n + (x * SS + dx)) * 4;
          r += buf[o]; g += buf[o + 1]; b += buf[o + 2]; a += buf[o + 3];
        }
      }
      const k = SS * SS;
      const o = (y * size + x) * 4;
      out[o] = Math.round(r / k);
      out[o + 1] = Math.round(g / k);
      out[o + 2] = Math.round(b / k);
      out[o + 3] = Math.round(a / k);
    }
  }
  return out;
}

// --- Codificacao PNG minima -------------------------------------------------
const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[i] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function toPng(rgba, size) {
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0; // filtro None
    rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 6;  // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

mkdirSync(OUT, { recursive: true });
for (const size of [192, 512, 180]) {
  const name = size === 180 ? 'apple-touch-icon.png' : `icon-${size}.png`;
  writeFileSync(join(OUT, name), toPng(render(size), size));
  console.log('gerado', name);
}

// Versao vetorial usada como favicon.
writeFileSync(
  join(OUT, 'icon.svg'),
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#18152e"/><stop offset="1" stop-color="#0c0c12"/>
    </linearGradient>
    <linearGradient id="ink" x1="0" y1="1" x2="1" y2="0">
      <stop offset="0" stop-color="#22d3ee"/><stop offset="1" stop-color="#8b5cf6"/>
    </linearGradient>
  </defs>
  <rect width="100" height="100" rx="22" fill="url(#bg)"/>
  <path d="M14 88.5 Q33 95 56 87.2" fill="none" stroke="#22d3ee" stroke-width="2.6"
        stroke-linecap="round" opacity="0.7"/>
  <path d="M61.5 20 Q86 32 70 53" fill="none" stroke="url(#ink)" stroke-width="11"
        stroke-linecap="round"/>
  <rect x="56" y="20" width="5.6" height="52" rx="2.8" fill="url(#ink)"/>
  <ellipse cx="43.5" cy="71.5" rx="15.5" ry="11.5" fill="url(#ink)"
           transform="rotate(-19 43.5 71.5)"/>
</svg>
`
);
console.log('gerado icon.svg');
