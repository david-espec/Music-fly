// Gera icones e telas de abertura do app Android (pasta android/) com o Chromium do Playwright.
// Uso: NODE_PATH=$(npm root -g) node scripts/generate-android-assets.mjs
import { readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const { chromium } = createRequire(import.meta.url)('playwright');
const RES = join(dirname(fileURLToPath(import.meta.url)), '..', 'android', 'app', 'src', 'main', 'res');

const BOOK = (stroke) => `<g fill="none" stroke="${stroke}" stroke-width="18" stroke-linejoin="round" stroke-linecap="round">
  <path d="M96 160c50-30 110-30 160 6 50-36 110-36 160-6v222c-50-30-110-30-160 6-50-36-110-36-160-6Z"/><path d="M256 166v222"/></g>`;
const BG = `<defs><linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2a2420"/><stop offset="1" stop-color="#121014"/></linearGradient>
  <radialGradient id="glow" cx=".3" cy=".75" r=".6"><stop offset="0" stop-color="#ffc478" stop-opacity=".35"/><stop offset="1" stop-color="#ffc478" stop-opacity="0"/></radialGradient></defs>`;

const svg = {
  // icone classico (quadrado arredondado) e redondo
  legacy: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">${BG}<rect width="512" height="512" rx="112" fill="url(#bg)"/><rect width="512" height="512" rx="112" fill="url(#glow)"/>${BOOK('#f3efe9')}</svg>`,
  round: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">${BG}<circle cx="256" cy="256" r="256" fill="url(#bg)"/><circle cx="256" cy="256" r="256" fill="url(#glow)"/>${BOOK('#f3efe9')}</svg>`,
  // icone adaptativo: so o desenho, dentro da area segura (66/108 do centro)
  foreground: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-112 -112 736 736">${BOOK('#f3efe9')}</svg>`,
};

const browser = await chromium.launch();
const page = await browser.newPage();
async function render(html, w, h, path, transparent = false) {
  await page.setViewportSize({ width: w, height: h });
  await page.setContent(`<style>html,body{margin:0;background:transparent;width:${w}px;height:${h}px;overflow:hidden}svg{width:100%;height:100%;display:block}</style>${html}`);
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path, omitBackground: transparent });
}

for (const dir of readdirSync(RES)) {
  const m = dir.match(/^mipmap-(\w+)$/);
  if (!m || dir.includes('anydpi')) continue;
  const scale = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 }[m[1]];
  const s = Math.round(48 * scale), f = Math.round(108 * scale);
  await render(svg.legacy, s, s, join(RES, dir, 'ic_launcher.png'), true);
  await render(svg.round, s, s, join(RES, dir, 'ic_launcher_round.png'), true);
  await render(svg.foreground, f, f, join(RES, dir, 'ic_launcher_foreground.png'), true);
}

const splashSizes = {
  'drawable': [480, 320], 'drawable-land-mdpi': [480, 320], 'drawable-land-hdpi': [800, 480], 'drawable-land-xhdpi': [1280, 720],
  'drawable-land-xxhdpi': [1600, 960], 'drawable-land-xxxhdpi': [1920, 1280], 'drawable-port-mdpi': [320, 480],
  'drawable-port-hdpi': [480, 800], 'drawable-port-xhdpi': [720, 1280], 'drawable-port-xxhdpi': [960, 1600], 'drawable-port-xxxhdpi': [1280, 1920],
};
for (const [dir, [w, h]] of Object.entries(splashSizes)) {
  const u = Math.min(w, h) / 320;
  const html = `<div style="width:${w}px;height:${h}px;background:radial-gradient(circle at 30% 70%,rgba(255,196,120,.22),transparent 55%),linear-gradient(#1f1a17,#121014);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:${10 * u}px;color:#f3efe9;font-family:Georgia,serif">
    <svg viewBox="80 140 352 270" style="width:${70 * u}px;height:${54 * u}px">${BOOK('#f3efe9')}</svg>
    <div style="font-size:${34 * u}px;font-weight:600;letter-spacing:.5px">D Libery</div></div>`;
  await render(html, w, h, join(RES, dir, 'splash.png'));
}
await browser.close();
console.log('icones e splash gerados');
