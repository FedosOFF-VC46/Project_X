import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const output = process.env.UI_OUTPUT || '/tmp/formula-mold-ui';
await mkdir(output, { recursive: true });
const user = { id: 'mold-test-user', email: 'test@example.invalid' };
const base = { user_id: user.id, is_active: true, created_at: '2026-09-18T10:00:00Z' };
const materials = [
  { ...base, id: 'resin', name: 'Смола Crystal', unit: 'g', category: 'material', unit_price: 2.5, current_stock: 0 },
  { ...base, id: 'ink', name: 'Чернила «Морская волна»', unit: 'ml', category: 'material', unit_price: 30, current_stock: 5 },
  { ...base, id: 'pair', name: 'Швензы', unit: 'pair', category: 'material', unit_price: 15, current_stock: 3 },
  { ...base, id: 'tool', name: 'Молд-инструмент', unit: 'pcs', category: 'depreciation', unit_price: 100, current_stock: 1 },
];
const items = ['resin', 'ink', 'pair'].map((id, i) => ({ ...base, id: `item-${i}`, calculation_id: 'old', material_id: id, material_name_snapshot: materials[i].name, unit_snapshot: materials[i].unit, quantity: [140, 2, 1][i], unit_price_snapshot: materials[i].unit_price, total_cost: [350, 60, 15][i] }));
const data = { materials, mold_calculations: [{ ...base, id: 'old', title: 'Часы «Морская волна»', mold_length_cm: 12, mold_width_cm: 8, mold_height_cm: 1.5, recommended_volume_ml: 120, finish_coefficient: .08 }], mold_calculation_items: items,
  products: [{ ...base, id: 'product', name: 'Часы', product_category: 'coasters', work_hours: 1, current_stock: 0, markup_percent: 120 }], product_materials: [], tool_models: [], tool_instances: [], product_tools: [], tool_events: [] };
const mock = `
const db = JSON.parse(sessionStorage.getItem('mold-ui-db') || 'null') || ${JSON.stringify(data)};
window.__db = db; window.__calls = [];
let user = ${JSON.stringify(user)};
window.__account = (id) => {user={...user,id}; window.__auth?.('SIGNED_IN',{user});};
class Query {
 constructor(table) { this.table=table; this.filters=[]; }
 select(){return this;} order(){return this;} limit(){return this;} range(){return this;} eq(k,v){this.filters.push([k,v]);return this;}
 then(resolve){return Promise.resolve({data:(db[this.table]||[]).filter(r=>this.filters.every(([k,v])=>r[k]===v)),error:null}).then(resolve);}
}
export const supabase = {
 auth:{getSession:async()=>({data:{session:{user}}}),onAuthStateChange:(cb)=>{window.__auth=cb;return {data:{subscription:{unsubscribe(){}}}};}},
 from:table=>new Query(table),storage:{from:()=>({createSignedUrl:async()=>({data:null})})},
 rpc:async(name,args)=>{
  if(name==='list_product_categories')return {data:[{id:'coasters',label:'Подстаканники'}],error:null};
  window.__calls.push({name,args});
  if(name!=='save_mold_recipe')throw Error('Unexpected write: '+name);
  await new Promise(resolve=>setTimeout(resolve,150));
  if(window.__fail)return {error:{message:'Тест: нет соединения'}};
  const d=args.p_data,base=d.mode==='sizes'?d.length*d.width*d.height:d.manual;
  const finish=!d.finish?0:d.mode==='sizes'?d.length*d.width*d.thickness/10:d.finish_ml;
  const record={user_id:user.id,id:args.p_id,title:d.title,mold_length_cm:d.length,mold_width_cm:d.width,mold_height_cm:d.height,base_volume_ml:base,recommended_volume_ml:d.mode==='manual'?base:null,finish_volume_ml:finish,finish_coefficient:d.mode==='sizes'&&d.finish?d.thickness/10:null,mold_volume_ml:base+finish,notes:d.notes,created_at:new Date().toISOString()};
  db.mold_calculations=db.mold_calculations.filter(r=>r.id!==args.p_id).concat(record);
  db.mold_calculation_items=db.mold_calculation_items.filter(r=>r.calculation_id!==args.p_id).concat(args.p_items.map((row,i)=>{const m=db.materials.find(r=>r.id===row.material_id);return {...row,id:'new-'+i,user_id:user.id,calculation_id:args.p_id,material_name_snapshot:m.name,unit_snapshot:m.unit,unit_price_snapshot:m.unit_price,total_cost:row.quantity*m.unit_price};}));
  sessionStorage.setItem('mold-ui-db',JSON.stringify(db)); return {data:args.p_id,error:null};
 }
};`;
const browser = await chromium.launch({ executablePath: process.env.BROWSER_PATH || '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser', headless: true });
const context = await browser.newContext({ viewport: { width: 1470, height: 1000 }, reducedMotion: 'reduce' });
const page = await context.newPage(), errors = [];
page.on('pageerror', (error) => errors.push(error.message));
await context.route('**/src/supabaseClient.js*', (route) => route.fulfill({ contentType: 'text/javascript', body: mock }));
await context.route('**/src/scene.js*', (route) => route.fulfill({ contentType: 'text/javascript', body: 'export function initResinScene(){return {setTheme(){},destroy(){}}}' }));
await context.route('https://*.supabase.co/**', (route) => { errors.push('Unexpected real database call'); return route.abort(); });
const action = (name) => page.locator(`[data-mw-action="${name}"]`);
const field = (name) => page.locator(`[data-mw-field="${name}"]`);
const select = async (index, value) => {
  const row = page.locator('[data-mw-row]').nth(index);
  await row.locator('[data-select-toggle]').click();
  await page.locator(`.select-ui-menu.is-floating [data-select-option][data-value="${value}"]`).click();
};
async function screenshot(name) { await page.locator('.mold-workflow').screenshot({ path: `${output}/${name}.png`, animations: 'disabled' }); }
async function fits() {
  const overflow = await page.locator('.mold-workflow').evaluate((root) => [...root.querySelectorAll('input,.mw-stage,.mw-component,button,.mw-recipe')].filter((n) => n.getClientRects().length && !n.closest('[hidden]')).map((n) => ({tag:n.tagName,cls:n.className,r:n.getBoundingClientRect()})).filter(({r})=>r.left<0||r.right>innerWidth+1).map(n=>({tag:n.tag,cls:n.cls,right:n.r.right})));
  assert.deepEqual(overflow, []);
}
try {
  await page.goto(process.env.APP_URL || 'http://127.0.0.1:4174/');
  await page.locator('[data-view="mold"]').first().click();
  await page.locator('[data-mw-library]').waitFor();
  assert.equal(await page.locator('[data-mw-record]').count(), 1);
  await action('edit').click();
  assert.equal(await page.locator('[data-mode="manual"]').getAttribute('aria-pressed'), 'true');
  assert.equal(await field('manual').inputValue(), '120');
  assert.equal(await field('length').isDisabled(), true);
  assert.equal(await field('finishMl').inputValue(), '7.68');
  await page.locator('[data-mw-next]').click();
  assert.equal(await page.locator('[data-mw-row]').count(), 3);
  assert.equal(await page.locator('[data-mw-row-field="materialId"] option[value="tool"]').count(), 0);
  await page.locator('[data-mw-row-field="quantity"]').first().fill('145');
  await action('library').click();
  await action('new').click();
  await field('title').pressSequentially('Новые часы', { delay: 25 });
  assert.equal(await field('title').evaluate(n=>n===document.activeElement), true);
  await field('length').fill('12'); await field('width').fill('8'); await field('height').fill('1,5');
  assert.equal(await page.locator('[data-mw-value="geometry"]').textContent(), '144 мл');
  await field('finish').check(); await field('thickness').fill('0,8');
  assert.equal(await page.locator('[data-mw-value="volume"]').textContent(), '151,68 мл');
  await screenshot('dimensions-desktop'); await fits();
  await page.locator('[data-mode="manual"]').click();
  assert.equal(await field('length').isDisabled(), true); assert.equal(await field('manual').isDisabled(), false);
  await field('manual').fill('200'); await field('finishMl').fill('10');
  await page.locator('[data-mode="sizes"]').click();
  assert.equal(await field('manual').isDisabled(), true); assert.equal(await field('height').inputValue(), '1,5');
  await page.locator('[data-view="warehouse"]').first().click();
  await page.locator('[data-view="mold"]').first().click();
  assert.equal(await field('title').inputValue(), 'Новые часы');
  await page.reload(); await page.locator('[data-view="mold"]').first().click();
  assert.equal(await field('width').inputValue(), '8');
  for (const width of [1920, 1024, 390, 320]) {
    await page.setViewportSize({width,height:1000}); await fits(); await screenshot(`dimensions-${width}`);
  }
  await page.locator('[data-action="toggle-theme"]').first().click();
  await screenshot('dimensions-other-theme-320'); await fits();
  await page.setViewportSize({width:1470,height:1000});
  await field('length').fill('99999999'); await field('width').fill('99999999'); await field('height').fill('99999999');
  await fits(); await page.locator('[data-mw-next]').click();
  assert.equal(await page.locator('[data-mw-error]').isVisible(), true);
  await field('length').fill('12'); await field('width').fill('8'); await field('height').fill('1.5');
  await page.locator('[data-mw-next]').click();
  for (const [index,id,quantity] of [[0,'resin','140'],[1,'ink','2'],[2,'pair','1']]) {
    await action('add').click(); await select(index,id); await page.locator('[data-mw-row-field="quantity"]').nth(index).fill(quantity);
  }
  assert.match(await page.locator('[data-mw-value="cost"]').textContent(), /425/);
  await action('remove').nth(1).click(); assert.equal(await page.locator('[data-mw-row]').count(),2);
  await action('undo').click(); assert.equal(await page.locator('[data-mw-row]').count(),3);
  assert.equal(await page.locator('[data-mw-row-field="materialId"]').nth(1).inputValue(),'ink');
  await screenshot('materials-desktop');
  await action('add').click(); await page.locator('[data-mw-next]').click();
  assert.equal(await page.locator('[data-mw-error]').isVisible(),true);
  await action('remove').last().click();
  await page.locator('[data-mw-next]').click(); await field('notes').fill('Синий пигмент, тонкий финиш');
  await screenshot('review-desktop');
  assert.equal(await page.evaluate(()=>window.__calls.length),0,'typing and moving steps must not write the database');
  await page.evaluate(()=>{window.__fail=true;}); await page.locator('[data-mw-next]').click();
  await page.locator('[data-mw-error]:not([hidden])').waitFor();
  assert.equal(await field('notes').inputValue(),'Синий пигмент, тонкий финиш');
  assert.equal(await page.evaluate(()=>window.__db.mold_calculations.length),1);
  await page.evaluate(()=>{window.__fail=false;}); await page.locator('[data-mw-next]').click();
  await page.locator('[data-mw-library]').waitFor();
  assert.equal(await page.locator('[data-mw-record]').count(),2);
  const calls = await page.evaluate(()=>window.__calls);
  assert.equal(calls[0].args.p_id,calls[1].args.p_id); assert.equal(calls[1].args.p_items.length,3);
  assert.deepEqual(await page.evaluate(()=>window.__db.materials.map(m=>m.current_stock)),[0,5,3,1]);
  assert.equal(await page.locator('.mw-draft').count(),1,'editing another recipe must preserve the previous draft');
  await action('duplicate').last().click();
  assert.equal(await field('title').inputValue(),'Новые часы · копия');
  await action('library').click();
  await action('edit').last().click();
  assert.equal(await field('title').inputValue(),'Новые часы');
  assert.equal(await field('manual').isDisabled(),true);
  await page.locator('[data-mw-next]').click(); assert.equal(await page.locator('[data-mw-row]').count(),3);
  await page.setViewportSize({width:390,height:844}); await fits(); await screenshot('materials-mobile');
  await action('library').click(); await screenshot('library-mobile'); await fits();
  await page.setViewportSize({width:1470,height:1000}); await screenshot('library-desktop');
  await page.locator('[data-mw-search]').fill('нет такого'); assert.equal(await page.locator('[data-mw-empty]').isVisible(),true);
  await page.locator('[data-mw-search]').fill('Новые'); assert.equal(await page.locator('[data-mw-record]:not([hidden])').count(),1);
  await page.locator('[data-view="products"]').first().click();
  assert.match(await page.locator('[name="mold_calculation_id"]').textContent(), /Новые часы · 3 компонента/);
  await page.locator('[data-view="mold"]').first().click();
  await page.emulateMedia({reducedMotion:'no-preference'});
  await action('new').click(); await field('title').fill('Анимация');
  await field('length').fill('12'); await field('width').fill('8'); await field('height').fill('1.5');
  await page.waitForTimeout(450);
  const before=await page.locator('[data-face="top"]').getAttribute('d');
  await field('height').fill('15'); await page.waitForTimeout(200);
  const during=await page.locator('[data-face="top"]').getAttribute('d');
  await page.waitForTimeout(350); const after=await page.locator('[data-face="top"]').getAttribute('d');
  assert.notEqual(before,during); assert.notEqual(during,after);
  await page.emulateMedia({reducedMotion:'reduce'}); await field('height').fill('5');
  assert.equal(await page.locator('.mold-workflow').evaluate(n=>n.getAnimations({subtree:true}).length),0);
  await page.evaluate(()=>window.__account('another-user')); await page.locator('[data-view="mold"]').first().click();
  assert.equal(await page.locator('.mw-draft').count(),0,'drafts must be scoped to the account');
  assert.deepEqual(errors,[]); console.log('Mold workflow UI passed, screenshots: '+output);
} finally { await browser.close(); }
