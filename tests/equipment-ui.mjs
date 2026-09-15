import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
import { readFile, mkdir } from 'node:fs/promises';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const output = process.env.UI_OUTPUT || '/tmp/formula-equipment-ui';
await mkdir(output, { recursive: true });
const day = new Date().toISOString().slice(0, 10);
const user = { id: 'test-user', email: 'preview@example.invalid' };
const base = { user_id: user.id, is_active: true, created_at: `${day}T12:00:00Z`, min_stock: 0 };
const materials = [
  { ...base, id: 'resin', name: 'Смола Crystal', category: 'material', unit: 'g', unit_price: 2.5, package_cost: 2500, package_quantity: 1000, current_stock: 5000 },
  { ...base, id: 'ink', name: 'Чернила океан', category: 'material', unit: 'ml', unit_price: 30, current_stock: 5, min_stock: 10 },
  { ...base, id: 'ribbon', name: 'Лента атласная', category: 'packaging', unit: 'm', unit_price: 40, current_stock: 0 },
  { ...base, id: 'legacy', name: 'Молд для часов', category: 'depreciation', unit: 'pcs', unit_price: 1800, current_stock: 2 },
];
const products = [
  { ...base, id: 'coaster', name: 'Подстаканник «Тихий океан»', product_category: 'coasters', work_hours: 0.5, markup_percent: 120, current_stock: 3 },
  { ...base, id: 'earrings', name: 'Серьги «Север»', product_category: 'accessories', work_hours: 1, markup_percent: 250, current_stock: 0 },
];
const toolModels = [
  { ...base, id: 'mold', name: 'Молд для подстаканника', kind: 'mold', resource_mode: 'items', default_resource: 10, default_cost: 1000, output_per_cycle: 1, hours_per_day: 8 },
  { ...base, id: 'scales', name: 'Весы ювелирные', kind: 'equipment', resource_mode: 'hours', default_resource: 200, default_cost: 2400, output_per_cycle: 1, hours_per_day: 8, is_common: true },
  { ...base, id: 'pending', name: 'Молд для часов', kind: 'other', resource_mode: null, default_cost: 1800, source_material_id: 'legacy' },
  { ...base, id: 'plier', name: 'Круглогубцы с силиконовыми насадками', kind: 'hand', resource_mode: 'items', default_resource: 500, default_cost: 900, output_per_cycle: 1, hours_per_day: 8 },
];
const toolInstances = [
  { ...base, id: 'mold-1', model_id: 'mold', label: 'Молд №1', resource_mode: 'items', resource_limit: 10, used_resource: 8, purchase_cost: 1000, charged_cost: 800, status: 'active', started_on: day },
  { ...base, id: 'mold-2', model_id: 'mold', label: 'Молд №2', resource_mode: 'items', resource_limit: 10, used_resource: 0, purchase_cost: 1200, charged_cost: 0, status: 'active', started_on: day },
  { ...base, id: 'scales-1', model_id: 'scales', label: 'Весы №1', resource_mode: 'hours', resource_limit: 200, used_resource: 35, purchase_cost: 2400, charged_cost: 420, status: 'active', started_on: day },
  { ...base, id: 'plier-1', model_id: 'plier', label: 'Круглогубцы №1', resource_mode: 'items', resource_limit: 500, used_resource: 500, purchase_cost: 900, charged_cost: 900, status: 'retired', started_on: day },
];
const data = { materials, products, tool_models: toolModels, tool_instances: toolInstances,
  product_tools: [{ user_id: user.id, product_id: 'coaster', model_id: 'mold', enabled: true, quantity_per_item: 1 }],
  product_materials: [{ ...base, id: 'recipe', product_id: 'coaster', material_id: 'resin', quantity_per_unit: 35, materials: materials[0] }],
  tool_events: [], production_calculations: [], production_calculation_items: [], stock_movements: [], product_stock_movements: [], product_batches: [], mold_calculations: [], mold_calculation_items: [],
};

const mockSource = `
const db = ${JSON.stringify(data)};
window.__rpcCalls = [];
class Query {
 constructor(table) { this.table = table; this.filters = []; }
 select() { return this; } order() { return this; } limit() { return this; }
 eq(key, value) { this.filters.push([key,value]); return this; }
 then(resolve) { return Promise.resolve({data:(db[this.table]||[]).filter(row=>this.filters.every(([key,value])=>row[key]===value)),error:null}).then(resolve); }
}
export const supabase = {
 auth: { getSession: async()=>({data:{session:{user:${JSON.stringify(user)}}}}), onAuthStateChange: ()=>({data:{subscription:{unsubscribe(){}}}}) },
 from: table => new Query(table),
 storage: { from:()=>({createSignedUrl:async()=>({data:null})}) },
 rpc: async(name, args) => {
  window.__rpcCalls.push({name,args});
  if(name==='save_product_tools') db.product_tools = db.product_tools.filter(row=>row.product_id!==args.p_product_id).concat(args.p_tools.map(row=>({...row,product_id:args.p_product_id,user_id:'test-user',quantity_per_item:1})));
  if(name==='save_tool_model') { const id=args.p_model_id||'new-model'; const m={id,user_id:'test-user',...args.p_data,default_resource:Number(args.p_data.resource_limit),default_cost:Number(args.p_data.purchase_cost)}; const index=db.tool_models.findIndex(row=>row.id===id); if(index>=0) db.tool_models[index]=m; else db.tool_models.push(m); return {data:id,error:null}; }
  return {data:'saved',error:null};
 }
};`;

const browser = await chromium.launch({ headless: true, ...(process.env.BROWSER_PATH ? { executablePath: process.env.BROWSER_PATH } : {}) });
const context = await browser.newContext({ viewport: { width: 1440, height: 1040 }, reducedMotion: 'reduce' });
const errors = [];
const page = await context.newPage();
const screenshot = async (name) => {
  await page.waitForFunction(() => !document.documentElement.classList.contains('theme-is-shifting'));
  await page.screenshot({ path: `${output}/${name}.png`, fullPage: true, animations: 'disabled' });
};
page.on('pageerror', (error) => errors.push(error.message));
await page.route('**/src/supabaseClient.js', (route) => route.fulfill({ contentType: 'application/javascript', body: mockSource }));
await page.route('**/src/scene.js', (route) => route.fulfill({ contentType: 'application/javascript', body: 'export const initResinScene = () => ({ setTheme(){} });' }));
if (process.env.LUCIDE_FILE) await page.route('https://cdn.jsdelivr.net/npm/lucide@*/dist/umd/lucide.min.js', (route) => route.fulfill({ contentType: 'application/javascript', path: process.env.LUCIDE_FILE }));
await page.route('https://*.supabase.co/**', (route) => { errors.push('Unexpected live backend call'); return route.abort(); });

const clickSelect = async (selector, text) => {
  await page.locator(`${selector} + .select-ui [data-select-toggle]`).click();
  await page.locator('.select-ui.is-open').getByRole('option', { name: text, exact: true }).click();
};
const noOverflow = async () => {
  const result = await page.evaluate(() => ({ width: innerWidth, scroll: document.documentElement.scrollWidth,
    dialogs: [...document.querySelectorAll('.eq-sheet')].map((el) => ({ width: el.clientWidth, scroll: el.scrollWidth })) }));
  assert.ok(result.scroll <= result.width + 1, JSON.stringify(result));
  assert.ok(result.dialogs.every((el) => el.scroll <= el.width + 1), JSON.stringify(result));
};
const compactFilters = async () => {
  await page.locator('.warehouse-filter-selects .select-ui-button').first().waitFor();
  const measurements = await page.locator('.warehouse-filters').evaluate((panel) => {
    const search = panel.querySelector('input[type="search"]').getBoundingClientRect();
    const selects = panel.querySelector('.warehouse-filter-selects').getBoundingClientRect();
    const styles = getComputedStyle(panel);
    return { gap: selects.top - search.bottom, panelHeight: panel.getBoundingClientRect().height,
      contentHeight: search.height + selects.height + parseFloat(styles.rowGap) + parseFloat(styles.paddingTop) + parseFloat(styles.paddingBottom) + parseFloat(styles.borderTopWidth) + parseFloat(styles.borderBottomWidth) };
  });
  assert.ok(measurements.gap >= 0 && measurements.gap <= 16, JSON.stringify(measurements));
  assert.ok(Math.abs(measurements.panelHeight - measurements.contentHeight) <= 2, JSON.stringify(measurements));
};

try {
  await page.goto(process.env.APP_URL || 'http://127.0.0.1:4174/');
  await page.locator('[data-view="warehouse"]').first().click();
  await page.locator('[data-warehouse-filter="query"]').pressSequentially('Смола', { delay: 50 });
  assert.equal(await page.locator('[data-warehouse-results] .material-card').count(), 1);
  assert.equal(await page.locator('[data-warehouse-filter="query"]').inputValue(), 'Смола');
  assert.equal(await page.locator('[data-warehouse-filter="query"]').evaluate((el) => el===document.activeElement), true);
  for (const viewport of [{ width: 1470, height: 883 }, { width: 1920, height: 1080 }, { width: 2940, height: 1766 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport);
    await compactFilters();
    await noOverflow();
  }
  await page.setViewportSize({ width: 1440, height: 1040 });
  await page.locator('[data-action="reset-warehouse-filters"]').first().click();
  await clickSelect('[data-warehouse-filter="stock"]', 'Нет в наличии');
  assert.equal(await page.locator('[data-warehouse-results] .material-card').count(), 1);
  assert.match(await page.locator('[data-warehouse-results]').textContent(), /Лента/);
  await page.locator('[data-warehouse="products"]').click();
  await clickSelect('[data-warehouse-filter="category"]', 'Аксессуары');
  assert.equal(await page.locator('[data-warehouse-results] .material-card').count(), 1);
  for (const viewport of [{ width: 1470, height: 883 }, { width: 1920, height: 1080 }, { width: 2940, height: 1766 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport);
    await compactFilters();
    await noOverflow();
  }
  await page.setViewportSize({ width: 1440, height: 1040 });
  await page.locator('[data-warehouse="tools"]').click();
  assert.equal(await page.locator('.eq-card').count(), 4);
  await noOverflow();
  await screenshot('tools-desktop');
  await page.locator('[data-eq-action="filter"][data-id="attention"]').click();
  assert.equal(await page.locator('.eq-card').count(), 2);
  await page.locator('[data-eq-action="filter"][data-id=""]').click();
  await page.locator('[data-eq-action="detail"][data-id="mold"]').click();
  assert.equal(await page.locator('.eq-instance').count(), 2);
  await screenshot('instances-desktop');
  await page.locator('[data-eq-action="close"]').last().click();
  await page.locator('.eq-heading [data-eq-action="model"]').click();
  await page.locator('.eq-form [name="name"]').pressSequentially('Новый молд', { delay: 40 });
  await page.locator('.eq-form [name="purchase_cost"]').fill('1500');
  await page.locator('.eq-form [name="resource_limit"]').fill('15');
  assert.match(await page.locator('[data-eq-price]').textContent(), /100/);
  assert.equal(await page.locator('.eq-form [name="name"]').inputValue(), 'Новый молд');
  await clickSelect('.eq-form [name="resource_mode"]', 'По заливкам');
  await page.locator('[name="output_per_cycle"]').fill('2');
  assert.match(await page.locator('[data-eq-price]').textContent(), /50/);
  await noOverflow();
  await screenshot('new-tool-desktop');
  await page.locator('[data-eq-action="close"]').last().click();
  await page.locator('.eq-heading [data-eq-action="model"]').click();
  assert.equal(await page.locator('.eq-form [name="name"]').inputValue(), 'Новый молд');
  assert.equal(await page.locator('.eq-form [name="resource_mode"]').inputValue(), 'cycles');
  assert.equal(await page.locator('.eq-form [name="resource_limit"]').inputValue(), '15');
  await page.locator('[data-eq-action="close"]').last().click();
  await page.locator('[data-view="products"]').first().click();
  await page.locator('[data-eq-action="product-tools"]').click();
  assert.equal(await page.locator('[name="tool_ids"]:checked').count(), 2);
  await page.locator('[data-eq-action="close"]').last().click();
  await page.locator('[data-eq-action="produce"]').first().click();
  await page.locator('[name="production_quantity"]').fill('5');
  await page.locator('[name="production_notes"]').pressSequentially('Проверяем ввод', { delay: 40 });
  assert.equal(await page.evaluate(() => window.__rpcCalls.length), 0);
  await page.locator('[data-eq-action="close"]').last().click();
  await page.reload();
  await page.locator('[data-view="products"]').first().click();
  await page.locator('[data-eq-action="produce"]').first().click();
  assert.equal(await page.locator('[name="production_quantity"]').inputValue(), '5');
  assert.equal(await page.locator('[name="production_notes"]').inputValue(), 'Проверяем ввод');
  await page.locator('[data-eq-action="production-next"]').click();
  assert.match(await page.locator('[data-eq-production-result]').textContent(), /Молд №1.*2.*Молд №2.*3/s);
  assert.equal(await page.locator('[data-eq-confirm]').isEnabled(), true);
  await screenshot('production-desktop');
  await page.locator('[data-eq-confirm]').click();
  await page.waitForFunction(() => window.__rpcCalls.some((call)=>call.name==='produce_with_tools'));
  assert.equal((await page.evaluate(() => window.__rpcCalls.find((call)=>call.name==='produce_with_tools').args)).p_quantity, 5);

  await page.locator('[data-view="warehouse"]').first().click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('[data-warehouse="raw"]').click();
  await noOverflow();
  await screenshot('materials-mobile');
  await clickSelect('[data-warehouse-filter="unit"]', 'мл');
  assert.equal(await page.locator('[data-warehouse-results] .material-card').count(), 1);
  await page.locator('[data-warehouse="products"]').click();
  await noOverflow();
  await screenshot('products-mobile');
  await page.locator('[data-warehouse="raw"]').click();
  assert.equal(await page.locator('[data-warehouse-filter="unit"]').inputValue(), 'ml');
  await page.locator('[data-warehouse="tools"]').click();
  await noOverflow();
  await screenshot('tools-mobile');
  await page.locator('[data-eq-action="detail"][data-id="mold"]').click();
  await noOverflow();
  await screenshot('instances-mobile');
  await page.locator('[data-eq-action="close"]').last().click();
  await page.setViewportSize({ width: 1440, height: 1040 });
  await page.locator('[data-action="toggle-theme"]').first().click();
  await screenshot('tools-dark');
  await page.locator('[data-eq-action="detail"][data-id="mold"]').click();
  await screenshot('instances-dark');
  await page.locator('[data-eq-action="close"]').last().click();
  await page.locator('[data-action="toggle-theme"]').first().click();
  await screenshot('tools-light');
  assert.deepEqual(errors, []);
  console.log(`UI scenarios passed. Screenshots: ${output}`);
} finally { await browser.close(); }
