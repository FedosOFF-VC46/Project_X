import test from 'node:test';
import assert from 'node:assert/strict';
import { placeSelectPopup } from '../src/select-popup.js';

const viewport = { left: 0, top: 0, width: 1440, height: 900 };
test('a dropdown opens below when there is room', () => {
  const result = placeSelectPopup({ left: 500, top: 200, bottom: 244, width: 400 }, viewport, 240);
  assert.deepEqual(result, { left: 500, top: 252, width: 400, height: 240, placement: 'below' });
});
test('a dropdown near the bottom opens above its trigger', () => {
  const result = placeSelectPopup({ left: 500, top: 800, bottom: 844, width: 400 }, viewport, 400);
  assert.equal(result.placement, 'above');
  assert.equal(result.top + result.height, 792);
  assert.equal(result.height, 280);
});
test('long lists and oversized triggers fit a narrow visual viewport', () => {
  const view = { left: 12, top: 100, width: 320, height: 300 };
  const result = placeSelectPopup({ left: 0, top: 240, bottom: 284, width: 640 }, view, 1200);
  assert.equal(result.left, 20);
  assert.equal(result.width, 304);
  assert.ok(result.top >= 108);
  assert.ok(result.top + result.height <= 392);
  assert.ok(result.height < 180);
});
