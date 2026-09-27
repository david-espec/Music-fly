import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detectDocument } from '../src/scan/detect.ts';
import { applyHomography, homography, orderQuad, defaultQuad } from '../src/scan/geometry.ts';
import { warpPerspective, rotateRaster, downscale } from '../src/scan/warp.ts';
import { applyFilter } from '../src/scan/filters.ts';
import { buildPdf, pageLayout } from '../src/scan/pdf.ts';
import { createRaster } from '../src/scan/types.ts';
import { syntheticPhoto } from './helpers.ts';

const W = 320;
const H = 240;
const sheet = [
  { x: 70, y: 30 },
  { x: 250, y: 45 },
  { x: 265, y: 215 },
  { x: 55, y: 200 },
];

function assertNear(quad: { x: number; y: number }[], tol: number) {
  quad.forEach((p, i) => {
    const e = Math.hypot(p.x * W - sheet[i].x, p.y * H - sheet[i].y);
    assert.ok(e < tol, `canto ${i} fora por ${e.toFixed(1)}px`);
  });
}

test('homografia leva os quatro pontos nos quatro pontos', () => {
  const to = sheet;
  const from = [
    { x: 0, y: 0 },
    { x: 1, y: 0 },
    { x: 1, y: 1 },
    { x: 0, y: 1 },
  ];
  const h = homography(from, to);
  from.forEach((p, i) => {
    const q = applyHomography(h, p);
    assert.ok(Math.abs(q.x - to[i].x) < 1e-6 && Math.abs(q.y - to[i].y) < 1e-6);
  });
});

test('orderQuad ordena cantos embaralhados', () => {
  const q = orderQuad([sheet[2], sheet[0], sheet[3], sheet[1]]);
  assert.deepEqual(q, sheet);
});

test('detecta folha clara em mesa escura', () => {
  const photo = syntheticPhoto(W, H, sheet, { bg: 60, paper: 225, text: true, noise: 8 });
  const d = detectDocument(photo);
  assert.ok(d, 'nao detectou');
  assertNear(d.quad, 4);
});

test('detecta folha branca em mesa quase branca (pelo contorno)', () => {
  const photo = syntheticPhoto(W, H, sheet, { bg: 190, paper: 240, text: true, noise: 4 });
  const d = detectDocument(photo);
  assert.ok(d, 'nao detectou');
  assertNear(d.quad, 5);
});

test('imagem lisa nao inventa folha', () => {
  const photo = syntheticPhoto(W, H, [], { bg: 128, paper: 0, noise: 6 });
  assert.equal(detectDocument(photo), null);
});

test('recorte com perspectiva devolve so papel', () => {
  const photo = syntheticPhoto(W, H, sheet, { bg: 20, paper: 230 });
  const quad = sheet.map((p) => ({ x: p.x / W, y: p.y / H })) as ReturnType<typeof defaultQuad>;
  const out = warpPerspective(photo, quad);
  assert.ok(out.width > 150 && out.height > 140);
  let dark = 0;
  // Inclusive nas bordas: o recorte nao pode trazer a mesa junto.
  for (let y = 0; y < out.height; y++) {
    for (let x = 0; x < out.width; x++) if (out.data[(y * out.width + x) * 4] < 200) dark++;
  }
  assert.equal(dark, 0, `${dark} pixels escuros`);
});

test('rotacao de 90 troca largura e altura e preserva pixels', () => {
  const r = createRaster(3, 2);
  r.data[0] = 99; // (0,0)
  const rot = rotateRaster(r, 90);
  assert.equal(rot.width, 2);
  assert.equal(rot.height, 3);
  assert.equal(rot.data[(0 * 2 + 1) * 4], 99); // vai para o canto superior direito
  assert.equal(rotateRaster(rotateRaster(rot, 270), 0).data[0], 99);
});

test('downscale respeita o lado maximo', () => {
  const r = downscale(createRaster(1000, 500), 100);
  assert.equal(r.width, 100);
  assert.equal(r.height, 50);
});

test('filtro P&B deixa papel branco e texto preto, mesmo com sombra', () => {
  const w = 200;
  const h = 200;
  const r = createRaster(w, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      // Sombra em degrade da esquerda (papel 120) para a direita (papel 230).
      const paper = 120 + (110 * x) / w;
      const text = y % 20 < 4 && x % 30 < 20;
      const v = text ? paper * 0.25 : paper;
      const i = (y * w + x) * 4;
      r.data[i] = r.data[i + 1] = r.data[i + 2] = v;
      r.data[i + 3] = 255;
    }
  }
  const out = applyFilter(r, 'pb');
  const at = (x: number, y: number) => out.data[(y * w + x) * 4];
  assert.ok(at(10, 10) > 240, 'papel na sombra deveria ficar branco');
  assert.ok(at(190, 10) > 240, 'papel iluminado deveria ficar branco');
  assert.ok(at(5, 1) < 20, 'texto na sombra deveria ficar preto');
  assert.ok(at(185, 1) < 20, 'texto iluminado deveria ficar preto');
});

test('PDF tem cabecalho, xref consistente e uma pagina por imagem', () => {
  const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xd9]);
  const pdf = buildPdf(
    [
      { jpeg, width: 100, height: 140 },
      { jpeg, width: 140, height: 100 },
    ],
    { title: 'Nota fiscal — março', pageSize: 'a4', date: new Date(2026, 0, 2) },
  );
  const text = new TextDecoder('latin1').decode(pdf);
  assert.ok(text.startsWith('%PDF-1.4'));
  assert.ok(text.trimEnd().endsWith('%%EOF'));
  assert.match(text, /\/Count 2/);
  const startxref = Number(/startxref\n(\d+)/.exec(text)![1]);
  assert.ok(text.slice(startxref).startsWith('xref'));
  // Cada entrada do xref aponta exatamente para "N 0 obj".
  const entries = [...text.slice(startxref).matchAll(/^(\d{10}) 00000 n $/gm)].map((m) => Number(m[1]));
  entries.forEach((off, i) => assert.ok(text.slice(off).startsWith(`${i + 1} 0 obj`), `obj ${i + 1}`));
  assert.equal(entries.length, 3 + 2 * 3);
});

test('layout A4 gira a pagina para imagem deitada', () => {
  const L = pageLayout({ width: 200, height: 100 }, 'a4');
  assert.ok(L.pageW > L.pageH);
  const auto = pageLayout({ width: 100, height: 200 }, 'auto');
  assert.equal(Math.round(auto.pageH), 842);
});
