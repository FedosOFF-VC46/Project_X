import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { calculateDemoPrice, renderLanding } from '../src/landing.js';
import { landingScreens } from '../src/landing-screens.js';

test('landing example adds materials, work and wear before markup', () => {
  assert.deepEqual(calculateDemoPrice(1, 120), { materials: 425, tools: 25, labor: 200, cost: 650, extra: 780, price: 1430 });
  assert.equal(calculateDemoPrice(.25, 20).price, 600);
  assert.equal(calculateDemoPrice(4, 250).price, 4375);
  assert.equal(calculateDemoPrice(1, 0).price, 650);
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
