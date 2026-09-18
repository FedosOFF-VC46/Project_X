import { MOLD_UNITS } from './mold-math.js?v=mold-flow-1';

const numeric = (value) => {
  const raw = String(value ?? '').trim().replace(',', '.');
  if (!raw) return '';
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? Number(parsed.toPrecision(12)) : raw;
};
const format = (value) => typeof value === 'number' ? new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 6 }).format(value) : String(value || '—');

export function recipeSnapshot(recipe) {
  const sizes = recipe.mode === 'sizes';
  return {
    title: String(recipe.title || '').trim(), notes: String(recipe.notes || '').trim(), mode: recipe.mode,
    length: sizes ? numeric(recipe.length) : '', width: sizes ? numeric(recipe.width) : '', height: sizes ? numeric(recipe.height) : '',
    manual: sizes ? '' : numeric(recipe.manual), finish: Boolean(recipe.finish),
    thickness: sizes && recipe.finish ? numeric(recipe.thickness) : '',
    finishMl: !sizes && recipe.finish ? numeric(recipe.finishMl) : '',
    rows: recipe.rows.map((row) => ({ materialId: row.materialId, quantity: numeric(row.quantity), name: row.name, unit: row.unit })),
  };
}

export function recipeChanges(original, recipe, materials = []) {
  const current = recipeSnapshot(recipe), changes = [];
  const add = (label, before, after) => { if (before !== after) changes.push({ label, before: before || '—', after: after || '—' }); };
  add('Название', original.title, current.title);
  const modes = { sizes: 'По размерам', manual: 'Объём известен' };
  add('Способ расчёта', modes[original.mode], modes[current.mode]);
  for (const [key, label, unit] of [['length', 'Длина', 'см'], ['width', 'Ширина', 'см'], ['height', 'Высота', 'см'], ['manual', 'Объём основной заливки', 'мл'], ['thickness', 'Толщина финиша', 'мм'], ['finishMl', 'Объём финиша', 'мл']]) {
    if (original[key] !== current[key]) add(label, original[key] === '' ? '—' : `${format(original[key])} ${unit}`, current[key] === '' ? '—' : `${format(current[key])} ${unit}`);
  }
  add('Финишный слой', original.finish ? 'Добавлен' : 'Без финиша', current.finish ? 'Добавлен' : 'Без финиша');
  const ids = new Set([...original.rows, ...current.rows].map((row) => row.materialId));
  for (const id of ids) {
    const before = original.rows.filter((row) => row.materialId === id);
    const after = current.rows.filter((row) => row.materialId === id);
    const material = materials.find((row) => row.id === id) || after[0] || before[0];
    const unit = MOLD_UNITS[material.unit] || material.unit || 'ед.';
    const quantities = (rows) => rows.length ? rows.map((row) => row.quantity).sort((a, b) => String(a).localeCompare(String(b))).map((value) => `${format(value)} ${unit}`).join(' + ') : 'Не добавлен';
    add(id ? material.name || 'Материал недоступен' : 'Материал не выбран', quantities(before), quantities(after));
  }
  add('Примечание', original.notes, current.notes);
  return changes;
}
