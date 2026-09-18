export const MOLD_UNITS = { g: 'г', ml: 'мл', cm: 'см', m: 'м', pcs: 'шт', pair: 'пар' };
export const number = (value) => {
  const parsed = Number(String(value ?? '').replace(',', '.'));
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
};
export const positive = (value) => number(value) > 0;
const text = (value) => value == null ? '' : String(value);
export const newRow = (item = {}) => ({
  key: crypto.randomUUID(), materialId: item.material_id || '', quantity: text(item.quantity),
  name: item.material_name_snapshot || 'Материал недоступен', unit: item.unit_snapshot || '',
});
export function newRecipe() {
  return { id: crypto.randomUUID(), editing: false, title: '', mode: 'sizes', length: '', width: '', height: '',
    manual: '', finish: false, thickness: '', finishMl: '', notes: '', step: 0, rows: [] };
}
export function volumes(draft) {
  const area = number(draft.length) * number(draft.width);
  const geometry = area * number(draft.height);
  const base = draft.mode === 'manual' ? number(draft.manual) : geometry;
  const finish = !draft.finish ? 0 : draft.mode === 'manual' ? number(draft.finishMl) : area * number(draft.thickness) / 10;
  return { base, finish, total: base + finish, geometry };
}
export function recipeFromRecord(record, items = []) {
  const draft = newRecipe();
  const length = number(record.mold_length_cm), width = number(record.mold_width_cm), height = number(record.mold_height_cm);
  const geometry = length * width * height;
  const base = number(record.recommended_volume_ml) || number(record.base_volume_ml) || geometry || number(record.mold_volume_ml);
  const finish = number(record.finish_volume_ml) || length * width * number(record.finish_coefficient);
  // Old forms allowed both sources. Keep the previously effective volume, not a new interpretation.
  const mode = !positive(record.recommended_volume_ml) && geometry > 0 && Math.abs(geometry - base) < 0.000001 ? 'sizes' : 'manual';
  return { ...draft, id: record.id, editing: true, title: record.title || '', mode,
    length: text(record.mold_length_cm), width: text(record.mold_width_cm), height: text(record.mold_height_cm),
    manual: text(base || ''), finish: finish > 0,
    thickness: length * width > 0 && finish > 0 ? text(finish / (length * width) * 10) : '',
    finishMl: text(finish || ''), notes: record.notes || '', rows: items.map(newRow) };
}
export function importLegacyDraft(fields, record, items) {
  const draft = record ? recipeFromRecord(record, items) : newRecipe();
  for (const [old, current] of Object.entries({ title: 'title', mold_length_cm: 'length', mold_width_cm: 'width',
    mold_height_cm: 'height', recommended_volume_ml: 'manual', notes: 'notes' })) {
    if (fields[old] !== undefined) draft[current] = text(fields[old]);
  }
  draft.mode = positive(draft.manual) ? 'manual' : 'sizes';
  const coefficient = number(fields.finish_coefficient);
  draft.finish = coefficient > 0;
  draft.thickness = coefficient ? text(coefficient * 10) : '';
  draft.finishMl = coefficient ? text(number(draft.length) * number(draft.width) * coefficient) : '';
  const array = (value) => value == null ? [] : Array.isArray(value) ? value : [value];
  const ids = array(fields['mold_material_id[]']), amounts = array(fields['mold_quantity[]']);
  if (ids.length || amounts.length) draft.rows = Array.from({ length: Math.max(ids.length, amounts.length) }, (_, i) => newRow({ material_id: ids[i], quantity: amounts[i] }));
  return draft;
}
export function validateRecipe(draft, materials, step = 2) {
  if (!draft.title.trim()) return { step: 0, field: 'title', message: 'Назовите расчёт, чтобы легко найти его позже.' };
  const fields = draft.mode === 'sizes' ? ['length', 'width', 'height'] : ['manual'];
  for (const field of fields) if (!positive(draft[field])) return { step: 0, field, message: 'Укажите положительный размер или объём. Можно вводить дробные значения.' };
  if (draft.finish && !positive(draft[draft.mode === 'sizes' ? 'thickness' : 'finishMl'])) return { step: 0, field: draft.mode === 'sizes' ? 'thickness' : 'finishMl', message: 'Укажите толщину или объём финиша либо отключите финишный слой.' };
  const total = volumes(draft).total;
  if (!Number.isFinite(total) || total < 0.001 || total >= 1e11) return { step: 0, field: fields[0], message: 'Проверьте размеры: допустимый объём от 0,001 до 99 999 999 999 мл.' };
  if (step === 0) return null;
  for (const row of draft.rows) {
    if (!materials.some((m) => m.id === row.materialId)) return { step: 1, row: row.key, field: 'materialId', message: 'Выберите доступный материал в каждой строке или уберите ненужную строку.' };
    if (!positive(row.quantity)) return { step: 1, row: row.key, field: 'quantity', message: 'Укажите количество материала на одну заливку.' };
  }
  return null;
}
export function recipeCost(draft, materials) {
  return draft.rows.reduce((sum, row) => sum + number(row.quantity) * number(materials.find((m) => m.id === row.materialId)?.unit_price), 0);
}
export function recipePayload(draft) {
  return { p_id: draft.id, p_data: { title: draft.title.trim(), mode: draft.mode,
    length: number(draft.length), width: number(draft.width), height: number(draft.height),
    manual: number(draft.manual), finish: Boolean(draft.finish), thickness: number(draft.thickness),
    finish_ml: number(draft.finishMl), notes: draft.notes.trim() },
  p_items: draft.rows.map((row) => ({ material_id: row.materialId, quantity: number(row.quantity) })) };
}
export function cuboidPoints(dimensions, width, height) {
  const values = dimensions.map(number);
  const maximum = Math.max(...values, 1);
  const [x, y, z] = values.some(positive) ? values.map((value) => Math.max(0.025, value / maximum)) : [1, 0.67, 0.2];
  const points = [[0, 0, 0], [x, 0, 0], [x, y, 0], [0, y, 0], [0, 0, z], [x, 0, z], [x, y, z], [0, y, z]]
    .map(([a, b, c]) => [.92 * a + .62 * b, -.24 * a + .5 * b - c]);
  const xs = points.map((p) => p[0]), ys = points.map((p) => p[1]);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  const scale = Math.min(Math.max(1, width - 62) / (maxX - minX), Math.max(1, height - 66) / (maxY - minY));
  return points.map(([a, b]) => [(a - (minX + maxX) / 2) * scale + width / 2 - 5, (b - (minY + maxY) / 2) * scale + height / 2 - 5]);
}
