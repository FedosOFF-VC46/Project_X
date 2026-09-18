import test from 'node:test';
import assert from 'node:assert/strict';
import { newRecipe, newRow, volumes, recipeFromRecord, importLegacyDraft, validateRecipe, recipePayload, recipeCost, cuboidPoints } from '../src/mold-math.js';

test('volume modes are exclusive; finish uses mm and never consumes inactive fields', () => {
  const draft = { ...newRecipe(), title: 'Часы', length: '12', width: '8', height: '1,5', manual: '500', finish: true, thickness: '0,8', finishMl: '30' };
  assert.equal(volumes(draft).base, 144); assert.ok(Math.abs(volumes(draft).finish - 7.68) < 1e-10);
  assert.equal(volumes(draft).total, 151.68);
  draft.mode = 'manual'; assert.equal(volumes(draft).total, 530);
  draft.finish = false; assert.equal(volumes(draft).total, 500);
});
test('legacy mixed-source recipes keep their effective volumes and all rows', () => {
  const d = recipeFromRecord({ id: 'existing', title: 'Часы', mold_length_cm: 12, mold_width_cm: 8, mold_height_cm: 1.5, recommended_volume_ml: 120, finish_coefficient: .08 }, [1, 2, 3].map((n) => ({ material_id: String(n), quantity: n })));
  assert.equal(d.mode, 'manual'); assert.equal(volumes(d).base, 120); assert.equal(volumes(d).finish, 7.68); assert.equal(d.rows.length, 3);
  assert.equal(recipeFromRecord({ mold_length_cm: 12, mold_width_cm: 8, mold_height_cm: 1.5 }).mode, 'sizes');
  const mismatch = recipeFromRecord({ mold_length_cm: 12, mold_width_cm: 8, mold_height_cm: 1.5, base_volume_ml: 100 });
  assert.equal(mismatch.mode, 'manual'); assert.equal(volumes(mismatch).base, 100);
  assert.equal(volumes(recipeFromRecord({ mold_volume_ml: 120 })).total, 120);
});
test('legacy browser draft imports every component, including partial rows', () => {
  const d = importLegacyDraft({ title: 'Не закончено', mold_length_cm: '12', mold_width_cm: '8', mold_height_cm: '1.5', 'mold_material_id[]': ['one', 'two', ''], 'mold_quantity[]': ['100', '4', '1'], recommended_volume_ml: '200', finish_coefficient: '.08' });
  assert.equal(d.rows.length, 3); assert.equal(d.rows[2].quantity, '1'); assert.equal(d.mode, 'manual'); assert.equal(volumes(d).base, 200);
});
test('validation rejects incomplete rows and non-finite volumes without silently dropping them', () => {
  const d = { ...newRecipe(), title: 'Часы', mode: 'manual', manual: '100', rows: [newRow({ material_id: 'resin', quantity: 20 }), newRow()] };
  assert.equal(validateRecipe(d, [{ id: 'resin' }], 0), null);
  assert.equal(validateRecipe(d, [{ id: 'resin' }]).row, d.rows[1].key);
  d.rows.pop(); assert.equal(validateRecipe(d, [{ id: 'resin' }]), null);
  d.manual = '.00001'; assert.equal(validateRecipe(d, []).step, 0);
  d.mode = 'sizes'; d.length = '1e200'; d.width = '1e200'; d.height = '1e200'; assert.equal(validateRecipe(d, []).step, 0);
});
test('materials retain units/quantities; retries use the same id; no stock needed for recipes', () => {
  const d = { ...newRecipe(), title: 'Рецепт', mode: 'manual', manual: '120', rows: [newRow({ material_id: 'g', quantity: 140 }), newRow({ material_id: 'ml', quantity: 2 }), newRow({ material_id: 'pair', quantity: 1 })] };
  const m = [{ id: 'g', unit_price: 2.5, current_stock: 0 }, { id: 'ml', unit_price: 30 }, { id: 'pair', unit_price: 10 }];
  assert.equal(validateRecipe(d, m), null); assert.equal(recipeCost(d, m), 420);
  assert.deepEqual(recipePayload(d).p_items.map((r) => r.quantity), [140, 2, 1]);
  assert.equal(recipePayload(d).p_id, recipePayload(d).p_id);
});
test('cuboid always fits its bounded viewport, including huge and flat dimensions', () => {
  for (const dimensions of [[0, 0, 0], [1, 1, 1], [12, 8, 1.5], [1e100, 1, 1], [1, 1, 1e200]]) {
    for (const width of [160, 300, 450]) for (const [x, y] of cuboidPoints(dimensions, width, 200)) {
      assert.ok(Number.isFinite(x) && x > 0 && x < width); assert.ok(Number.isFinite(y) && y > 0 && y < 200);
    }
  }
});
