import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateDemoPrice, renderLanding } from '../src/landing.js';

test('landing example adds materials, work and wear before markup', () => {
  assert.deepEqual(calculateDemoPrice(1, 120), { materials: 425, tools: 25, labor: 200, cost: 650, extra: 780, price: 1430 });
  assert.equal(calculateDemoPrice(.25, 20).price, 600);
  assert.equal(calculateDemoPrice(4, 250).price, 4375);
  assert.equal(calculateDemoPrice(1, 0).price, 650);
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
