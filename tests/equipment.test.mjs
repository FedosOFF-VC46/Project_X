import test from 'node:test';
import assert from 'node:assert/strict';
import { planToolUsage, estimatedToolCost, resourceRemaining, filterInventory } from '../src/equipment-math.js';

const today = new Date('2026-09-15T12:00:00Z');
const product = { id: 'p', work_hours: 0.5 };
const model = { id: 'm', resource_mode: 'items', default_cost: 1000, default_resource: 10, output_per_cycle: 1, hours_per_day: 8 };
const link = { product_id: 'p', model_id: 'm', enabled: true, quantity_per_item: 1 };
const instance = (id, overrides = {}) => ({ id, model_id: 'm', label: id, resource_mode: 'items', resource_limit: 10, used_resource: 0, purchase_cost: 1000, charged_cost: 0, status: 'active', started_on: '2026-09-01', ...overrides });
const plan = (instances, quantity, overrides = {}) => planToolUsage({ models: [model], links: [link], product, instances, quantity, today, ...overrides });

test('a production spans two molds and retains their different costs', () => {
  const result = plan([instance('a', { used_resource: 7, charged_cost: 700 }), instance('b', { purchase_cost: 1200 })], 5);
  assert.equal(result.ready, true);
  assert.deepEqual(result.allocations.map(({ instance_id, amount, cost }) => [instance_id, amount, cost]), [['a', 3, 300], ['b', 2, 240]]);
  assert.equal(result.cost, 540);
});

test('a preferred instance is used first without consuming paused or retired ones', () => {
  const result = plan([instance('paused', { status: 'paused' }), instance('retired', { status: 'retired' }), instance('a', { used_resource: 8, charged_cost: 800 }), instance('b')], 3, { preferences: { m: 'b' } });
  assert.deepEqual(result.allocations.map(({ instance_id, amount }) => [instance_id, amount]), [['b', 3]]);
});

test('resource shortage blocks production and never invents capacity', () => {
  const result = plan([instance('a', { used_resource: 9 })], 2);
  assert.equal(result.ready, false);
  assert.equal(result.groups[0].shortage, 1);
});

test('extending a resource redistributes only the remaining purchase cost', () => {
  const result = plan([instance('a', { resource_limit: 20, used_resource: 10, charged_cost: 1000 })], 2);
  assert.equal(result.cost, 0);
  assert.equal(result.ready, true);
  const partial = plan([instance('b', { resource_limit: 20, used_resource: 5, charged_cost: 500 })], 3);
  assert.equal(partial.cost, 100);
});

test('a multi-cavity mold costs one cycle per pour, split between products', () => {
  const cycleModel = { ...model, resource_mode: 'cycles', output_per_cycle: 2 };
  const result = plan([instance('a', { resource_mode: 'cycles' })], 3, { models: [cycleModel] });
  assert.equal(result.allocations[0].amount, 2);
  assert.equal(result.cost, 200);
  assert.equal(estimatedToolCost([cycleModel], [link], product), 50);
});

test('common tools can be excluded per product and require work time', () => {
  const common = { ...model, is_common: true, resource_mode: 'hours' };
  assert.equal(plan([instance('a', { resource_mode: 'hours' })], 2, { models: [common], links: [] }).cost, 100);
  assert.equal(plan([], 2, { models: [common], links: [{ ...link, enabled: false }] }).cost, 0);
  assert.equal(plan([], 1, { models: [common], product: { ...product, work_hours: 0 } }).ready, false);
});

test('calendar lifetime uses dates, with an hourly share for cost and purchase cap', () => {
  const daysModel = { ...model, resource_mode: 'days', default_resource: 30 };
  const days = instance('a', { resource_mode: 'days', resource_limit: 30, charged_cost: 995 });
  assert.equal(resourceRemaining(days, today), 16);
  const result = plan([days], 8, { models: [daysModel] });
  assert.equal(result.allocations[0].amount, 0.5);
  assert.equal(result.cost, 5);
  assert.equal(plan([{ ...days, started_on: '2026-07-01' }], 8, { models: [daysModel] }).ready, false);
});

test('unconfigured legacy instruments block manufacturing', () => {
  assert.equal(plan([], 1, { models: [{ ...model, resource_mode: null, default_resource: null }] }).ready, false);
});

test('operation selection replaces product defaults without changing the recipe', () => {
  const before = structuredClone(link);
  assert.equal(plan([instance('a')], 1, { selectedIds: [] }).cost, 0);
  assert.equal(plan([instance('a')], 1, { links: [], selectedIds: ['m'] }).cost, 100);
  assert.equal(plan([instance('a')], 1, { links: [{ ...link, enabled: false }], selectedIds: ['m'] }).cost, 100);
  assert.deepEqual(link, before);
});

test('molds are never inherited from the common set', () => {
  assert.equal(plan([instance('a')], 1, { models: [{ ...model, kind: 'mold', is_common: true }], links: [] }).groups.length, 0);
  assert.equal(plan([instance('a')], 1, { models: [{ ...model, kind: 'mold', is_common: true }] }).groups.length, 1);
});

test('deleted models and instances cannot contribute wear or planning cost', () => {
  const deletedModel = { ...model, deleted_at: '2026-09-17' };
  assert.equal(plan([instance('a')], 1, { models: [deletedModel], selectedIds: ['m'] }).cost, 0);
  assert.equal(estimatedToolCost([deletedModel], [link], product), 0);
  const result = plan([instance('a', { deleted_at: '2026-09-17' }), instance('b')], 1);
  assert.equal(result.allocations[0].instance_id, 'b');
});

test('warehouse search combines category, unit and stock filters and does not mutate data', () => {
  const items = [
    { name: 'Смола прозрачная', category: 'material', unit: 'g', current_stock: 100, min_stock: 150, price: 3 },
    { name: 'Смола густая', category: 'material', unit: 'ml', current_stock: 0, min_stock: 10, price: 4 },
    { name: 'Коробка', category: 'packaging', unit: 'pcs', current_stock: 20, min_stock: 0, price: 50 },
  ];
  const options = { stock: (i) => i.current_stock, category: (i) => i.category, price: (i) => i.price };
  assert.deepEqual(filterInventory(items, { query: 'СМОЛА', category: 'material', unit: 'g', stock: 'low' }, options).map((i) => i.name), ['Смола прозрачная']);
  assert.equal(filterInventory(items, { stock: 'empty' }, options).length, 1);
  assert.equal(filterInventory(items, { query: 'не существует' }, options).length, 0);
  filterInventory(items, { sort: 'name' }, options);
  assert.equal(items[0].name, 'Смола прозрачная');
});
