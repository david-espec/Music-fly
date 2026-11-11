// Gera os PNG do PWA a partir de public/icons/icon.svg usando o Chromium do Playwright.
// Uso: node scripts/generate-icons.mjs  (com o Playwright instalado local ou globalmente: NODE_PATH=$(npm root -g))
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const { chromium } = createRequire(import.meta.url)('playwright');

const dir = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'icons');
const svg = readFileSync(join(dir, 'icon.svg'), 'utf8');
const browser = await chromium.launch();
const page = await browser.newPage();
for (const size of [192, 512]) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<style>html,body{margin:0;background:transparent}svg{width:${size}px;height:${size}px;display:block}</style>${svg}`);
  await page.screenshot({ path: join(dir, `icon-${size}.png`), omitBackground: true });
  console.log('gerado', `icon-${size}.png`);
}
await browser.close();
