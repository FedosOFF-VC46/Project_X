import { createRequire } from 'node:module';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { screenshotBackend } from './fixtures/landing-workspace.mjs';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const sharp = require(process.env.SHARP_MODULE || 'sharp');
const output = fileURLToPath(new URL('../assets/screens/', import.meta.url));
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.BROWSER_PATH || '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser', headless: true });
try {
  const context = await browser.newContext({ viewport: { width: 1840, height: 1200 }, deviceScaleFactor: 1.5, reducedMotion: 'reduce', locale: 'ru-RU', timezoneId: 'Europe/Moscow' });
  await context.addInitScript(() => localStorage.setItem('resin-workshop-theme', 'dark'));
  await context.route('**/src/supabaseClient.js*', route => route.fulfill({ contentType: 'text/javascript', body: screenshotBackend() }));
  await context.route('**/src/scene.js*', route => route.fulfill({ contentType: 'text/javascript', body: 'export function initResinScene(){return {setTheme(){},destroy(){}}}' }));
  const errors = [];
  await context.route('https://*.supabase.co/**', route => { errors.push('Unexpected live backend access'); return route.abort(); });
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(process.env.APP_URL || 'http://127.0.0.1:4174/');
  await page.locator('.workspace-shell').waitFor();
  await page.waitForFunction(() => window.lucide);
  await page.evaluate(() => document.fonts.ready);
  const nav = async (view) => {
    await page.locator(`[data-view="${view}"]`).first().click();
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(150);
  };
  async function capture(name, selector = '.workbench', height = 900, anchor = null, end = null) {
    if (process.argv[2] && process.argv[2] !== name) return;
    await page.locator(selector).waitFor();
    await page.evaluate(() => { document.activeElement?.blur(); window.scrollTo(0, 0); });
    await page.waitForTimeout(150);
    const bounds = await page.locator(selector).boundingBox();
    const start = anchor ? (await page.locator(anchor).boundingBox()).y - 8 : bounds.y;
    const bottom = end ? (await page.locator(end).boundingBox()).y - 12 : bounds.y + bounds.height;
    const clip = { x: bounds.x, y: start, width: bounds.width, height: Math.min(height, bottom - start) };
    // Capture existing application pixels. No alternate markup, CSS or UI restyling.
    const png = await page.screenshot({ clip, animations: 'disabled', fullPage: true });
    const info = await sharp(png).webp({ quality: 94, effort: 6 }).toFile(`${output}/${name}.webp`);
    console.log(`${name}: ${info.width}x${info.height}, ${Math.round(info.size / 1024)} KB`);
  }
  await nav('mold');
  await page.locator('[data-mw-library]').waitFor();
  assert.equal(await page.locator('[data-mw-record]').count(), 3);
  await capture('resin-library', '.workbench', 760);
  await page.locator('[data-mw-action="edit"]').first().click();
  await capture('resin-volume', '.mw-editor', Infinity);
  await page.locator('[data-mw-next]').click();
  assert.equal(await page.locator('[data-mw-row]').count(), 3);
  await capture('resin-materials', '.mw-editor', Infinity);
  await page.locator('[data-mw-action="library"]').click();
  await nav('products');
  await page.locator('[data-action="select-product"][data-product-id="wave"]').click();
  await capture('product-card', '.workbench', Infinity, null, '.product-detail-panel .recipe-section-head');
  await capture('product-composition', '.product-detail-panel', Infinity, '.product-detail-panel .recipe-section-head', '.product-detail-panel .eq-product-block');
  await nav('warehouse');
  await capture('stock-materials', '.workbench', 920);
  await page.locator('[data-warehouse="products"]').click();
  await capture('stock-products', '.workbench', 850);
  await page.locator('[data-warehouse="tools"]').click();
  await capture('stock-tools', '.workbench', 850);
  await nav('sales');
  await capture('business-sales', '.workbench', Infinity, null, '.sales-card:nth-child(3)');
  await nav('calculator');
  await capture('business-logistics', '.workbench', 1040);
  assert.deepEqual(errors, []);
  console.log('Captured real application views. Demo backend only; no live records were read or changed.');
} finally { await browser.close(); }
