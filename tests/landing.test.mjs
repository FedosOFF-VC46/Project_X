import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { renderLanding } from '../src/landing.js';
import { calculateDemoPrice } from '../src/landing-pricing.js';
import { landingScreens } from '../src/landing-screens.js';

test('landing price is built from seven transparent cost lines with kopeck precision', () => {
  const { rows, ...result } = calculateDemoPrice();
  assert.deepEqual(result, { materials: 425, tools: 37, labor: 200, packaging: 60, minutes: 60, markup: 80, cost: 722, extra: 577.6, price: 1299.6 });
  assert.equal(rows.length, 7);
  assert.equal(rows.reduce((sum, row) => sum + row.cost, 0), result.cost);
  assert.ok(rows.every(row => row.name && row.calculation && row.cost > 0));
});
test('work time changes hourly tool wear as well as labor, but not mold wear', () => {
  const result = calculateDemoPrice({ minutes: 120 });
  assert.equal(result.labor, 400);
  assert.equal(result.tools, 49);
  assert.equal(result.rows.find(row => row.name === 'Молд').cost, 25);
  assert.equal(result.rows.find(row => row.name === 'Весы').cost, 24);
  assert.equal(result.price, 1681.2);
});
test('packaging is part of the markup base, and zero markup means selling at cost', () => {
  const result = calculateDemoPrice({ packaging: false });
  assert.equal(result.cost, 662);
  assert.equal(result.extra, 529.6);
  assert.equal(result.price, 1191.6);
  assert.equal(result.rows.length, 6);
  assert.equal(calculateDemoPrice({ markup: 0 }).price, 722);
  assert.equal(calculateDemoPrice({ minutes: 15, markup: 20, packaging: false }).price, 603.6);
  assert.equal(calculateDemoPrice({ minutes: 240, markup: 250 }).price, 4753);
});
test('invalid or extreme demo inputs stay finite and within the demonstrated range', () => {
  assert.deepEqual(calculateDemoPrice({ minutes: Infinity, markup: NaN }), calculateDemoPrice());
  assert.deepEqual(calculateDemoPrice({ minutes: -1, markup: -1 }), calculateDemoPrice({ minutes: 15, markup: 0 }));
  assert.deepEqual(calculateDemoPrice({ minutes: 1e9, markup: 1e9 }), calculateDemoPrice({ minutes: 240, markup: 250 }));
});
test('pricing distinguishes the demonstration from unsupported charges and uses a product-card icon', () => {
  const html = renderLanding();
  assert.match(html, /Сжатый пример/);
  assert.match(html, /Комиссии, налоги и доставка в этот пример не включены/);
  assert.match(html, /<details class="lp-cost-details"/);
  assert.doesNotMatch(html, /2\.4 6\.6L21|data-markup="|Ваша наценка|НЕ МАГИЯ/);
});

test('showcase uses ten real, locally hosted screenshots instead of invented UI', () => {
  const screens = Object.values(landingScreens).flat();
  assert.equal(screens.length, 10);
  assert.equal(new Set(screens.map(screen => screen.id)).size, 10);
  let bytes = 0;
  for (const screen of screens) {
    const image = readFileSync(new URL(`../assets/screens/${screen.id}.webp`, import.meta.url));
    assert.equal(image.toString('ascii', 8, 12), 'WEBP');
    assert.ok(screen.width >= 1000 && screen.height >= 900);
    assert.ok(screen.label && screen.description);
    bytes += image.length;
  }
  assert.ok(bytes < 1200000, 'screenshots should stay lightweight');
  const html = renderLanding();
  assert.equal((html.match(/data-screen-image /g) || []).length, 4);
  assert.equal((html.match(/data-screen-select=/g) || []).length, 10);
  assert.match(html, /<dialog[^>]+aria-labelledby="lp-screen-title"/);
  assert.doesNotMatch(html, /lp-mini-coaster|lp-preview-heading|lp-shipment|lp-demo-row/);
});
test('landing has working login destinations and labelled demo content, no signup form', () => {
  const html = renderLanding();
  assert.match(html, /href="#login"/);
  assert.match(html, /демонстрационные данные/);
  assert.doesNotMatch(html, /data-action="signup"|data-action="open-registration"/);
  assert.equal((html.match(/role="tab"/g) || []).length, 4);
  for (const id of ['recipe', 'product', 'stock', 'business']) {
    assert.match(html, new RegExp(`id="lp-tab-${id}"`));
    assert.match(html, new RegExp(`aria-labelledby="lp-tab-${id}"`));
  }
});
