export const RESOURCE_MODES = {
  items: { label: 'По изделиям', unit: 'изделий', one: 'изделие', icon: 'package' },
  cycles: { label: 'По заливкам', unit: 'заливок', one: 'заливку', icon: 'droplets' },
  hours: { label: 'По часам работы', unit: 'ч', one: 'час', icon: 'clock-3' },
  days: { label: 'По сроку службы', unit: 'дней', one: 'день', icon: 'calendar-days' },
};

export const TOOL_KINDS = { mold: 'Молд', hand: 'Ручной инструмент', equipment: 'Оборудование', other: 'Другое' };
export const number = (value) => Number.isFinite(Number(value)) ? Number(value) : 0;
export const round = (value, digits = 6) => Math.round((value + Number.EPSILON) * 10 ** digits) / 10 ** digits;

export function resourceUsed(instance, today = new Date()) {
  if (instance.resource_mode !== 'days') return number(instance.used_resource);
  const now = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  const start = Date.parse(`${instance.started_on}T00:00:00Z`);
  return Number.isFinite(start) ? Math.max(0, Math.floor((now - start) / 86400000)) : 0;
}

export function resourceRemaining(instance, today) {
  return Math.max(0, round(number(instance.resource_limit) - resourceUsed(instance, today)));
}

export function instanceRate(instance) {
  const credit = Math.max(0, number(instance.purchase_cost) - number(instance.charged_cost));
  if (instance.resource_mode === 'days') return number(instance.purchase_cost) / Math.max(1, number(instance.resource_limit));
  const remaining = resourceRemaining(instance);
  return remaining > 0 ? credit / remaining : 0;
}

export function effectiveToolLinks(models, links, productId, selectedIds = null) {
  return models.flatMap((model) => {
    if (model.deleted_at) return [];
    const link = links.find((row) => row.product_id === productId && row.model_id === model.id);
    const enabled = selectedIds === null ? (link ? link.enabled : model.is_common && model.kind !== 'mold') : selectedIds.includes(model.id);
    return enabled
      ? [{ model, factor: number(link?.quantity_per_item ?? 1) }]
      : [];
  });
}

export function requiredResource(model, product, quantity, factor = 1) {
  const units = number(quantity) * number(factor);
  if (model.resource_mode === 'cycles') return Math.ceil(units / Math.max(1, number(model.output_per_cycle)));
  if (model.resource_mode === 'hours') return round(units * number(product.work_hours));
  if (model.resource_mode === 'days') return round(units * number(product.work_hours) / Math.max(0.01, number(model.hours_per_day)));
  return round(units);
}

// Allocate actual wear to specific instances; never charge a purchase twice.
export function planToolUsage({ models, instances, links, product, quantity, preferences = {}, selectedIds = null, today }) {
  const groups = effectiveToolLinks(models, links, product.id, selectedIds).map(({ model, factor }) => {
    const required = requiredResource(model, product, quantity, factor);
    const candidates = instances.filter((item) => item.model_id === model.id && !item.deleted_at && item.status === 'active'
      && resourceRemaining(item, today) > 0 && (!item.started_on || item.started_on <= (today || new Date()).toISOString().slice(0, 10)))
      .sort((a, b) => {
        if (a.id === preferences[model.id]) return -1;
        if (b.id === preferences[model.id]) return 1;
        return resourceRemaining(a, today) - resourceRemaining(b, today) || a.id.localeCompare(b.id);
      });
    let shortage = required;
    const allocations = [];
    for (const instance of candidates) {
      if (shortage <= 0) break;
      const amount = model.resource_mode === 'days' ? shortage : Math.min(shortage, resourceRemaining(instance, today));
      const cost = round(Math.min(Math.max(0, number(instance.purchase_cost) - number(instance.charged_cost)), amount * instanceRate(instance)), 2);
      allocations.push({ instance_id: instance.id, model_id: model.id, amount: round(amount), cost, instance });
      shortage = Math.max(0, round(shortage - amount));
    }
    const missingTime = ['hours', 'days'].includes(model.resource_mode) && number(product.work_hours) <= 0;
    return { model, required, shortage, allocations, missingTime, configured: !!model.resource_mode };
  });
  return {
    groups,
    allocations: groups.flatMap((group) => group.allocations),
    cost: round(groups.reduce((sum, group) => sum + group.allocations.reduce((total, row) => total + row.cost, 0), 0), 2),
    ready: groups.every((group) => group.configured && !group.missingTime && group.shortage === 0),
  };
}

// Product cards keep a planning rate even when no instance is currently available.
export function estimatedToolCost(models, links, product) {
  return effectiveToolLinks(models, links, product.id).reduce((sum, { model, factor }) => {
    if (!model.resource_mode || !number(model.default_resource)) return sum;
    let usage = requiredResource(model, product, 1, factor);
    if (model.resource_mode === 'cycles') usage = factor / Math.max(1, number(model.output_per_cycle));
    return sum + usage * number(model.default_cost) / number(model.default_resource);
  }, 0);
}

export function filterInventory(items, filters, { stock, category, price }) {
  const query = (filters.query || '').trim().toLocaleLowerCase('ru-RU');
  const result = items.filter((item) => {
    const quantity = stock(item);
    const low = number(item.min_stock) > 0 && quantity > 0 && quantity <= number(item.min_stock);
    return (!query || `${item.name} ${item.description || ''} ${item.notes || ''}`.toLocaleLowerCase('ru-RU').includes(query))
      && (!filters.category || category(item) === filters.category)
      && (!filters.unit || item.unit === filters.unit)
      && (!filters.stock || (filters.stock === 'available' && quantity > 0)
        || (filters.stock === 'empty' && quantity <= 0) || (filters.stock === 'low' && low));
  });
  const compare = {
    name: (a, b) => a.name.localeCompare(b.name, 'ru'),
    stock: (a, b) => stock(a) - stock(b),
    price: (a, b) => price(a) - price(b),
    recent: (a, b) => String(b.created_at).localeCompare(String(a.created_at)),
  }[filters.sort || 'name'];
  return result.sort(compare || (() => 0));
}
