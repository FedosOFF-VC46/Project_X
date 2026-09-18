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
  products: [{ ...base, id: 'product', name: 'Часы', product_category: 'coasters', work_hours: 1, current_stock: 0, markup_percent: 120 }], product_materials: [{ ...base, id: 'applied', product_id: 'product', material_id: 'ink', quantity_per_unit: 2, materials: materials[1] }], tool_models: [], tool_instances: [], product_tools: [], tool_events: [] };
const mock = `
const db = JSON.parse(sessionStorage.getItem('mold-ui-db') || 'null') || ${JSON.stringify(data)};
window.__db = db; window.__calls = []; window.__deleteCalls = [];
let user = ${JSON.stringify(user)};
window.__account = (id) => {user={...user,id}; window.__auth?.('SIGNED_IN',{user});};
class Query {
 constructor(table) { this.table=table; this.filters=[]; }
 select(){return this;} order(){return this;} limit(){return this;} range(){return this;} eq(k,v){this.filters.push([k,v]);return this;}
 delete(){this.deleting=true;return this;}
 async then(resolve,reject){
  try {
   const rows=(db[this.table]||[]).filter(r=>this.filters.every(([k,v])=>r[k]===v));
   if(this.deleting){
    if(this.table!=='mold_calculations'||!this.filters.some(([k,v])=>k==='id'&&v)||!this.filters.some(([k,v])=>k==='user_id'&&v===user.id))throw Error('Unsafe deletion');
    window.__deleteCalls.push({table:this.table,filters:this.filters});
    await new Promise(r=>setTimeout(r,250));
    if(window.__deleteFail)return resolve({error:{message:'Тест: нет соединения'}});
    if(window.__deleteEmpty)return resolve({data:[],error:null});
    const ids=rows.map(r=>r.id);
    db.mold_calculations=db.mold_calculations.filter(r=>!ids.includes(r.id));
    db.mold_calculation_items=db.mold_calculation_items.filter(r=>!ids.includes(r.calculation_id));
    sessionStorage.setItem('mold-ui-db',JSON.stringify(db));
   }
   return resolve({data:rows,error:null});
  }catch(error){return reject(error);}
 }
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
page.on('dialog', (dialog) => dialog.accept());
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
  assert.match(await page.locator('.mw-changes').textContent(),/140 г.*145 г/);
  await action('cancel-leave').click();
  assert.equal(await page.locator('[data-mw-row-field="quantity"]').first().inputValue(),'145');
  await page.locator('[data-mw-row-field="quantity"]').first().fill('140');
  await action('library').click();
  assert.equal(await page.locator('.mw-leave-dialog').count(),0,'reverting edits should not prompt');
  assert.equal(await page.locator('.mw-draft').count(),0,'opening a saved recipe must not create a draft');
  await action('edit').click();
  await page.locator('[data-mw-next]').click();
  await page.locator('[data-mw-row-field="quantity"]').first().fill('145');
  await action('library').click(); await action('discard-leave').click();
  assert.equal(await page.locator('.mw-draft').count(),0);
  assert.equal(await page.evaluate(()=>window.__db.mold_calculation_items[0].quantity),140);
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
  assert.equal(await page.locator('.mw-leave-dialog').isVisible(),true,'navigation must ask before losing changes');
  await action('cancel-leave').click();
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
  assert.equal(await page.locator('.mw-draft').count(),0,'saved and discarded edits must not leave drafts');
  await action('duplicate').last().click();
  assert.equal(await field('title').inputValue(),'Новые часы · копия');
  await action('library').click(); await action('discard-leave').click();
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

  await action('library').click(); await action('discard-leave').click();
  await page.locator('[data-mw-search]').fill('');
  await action('edit').first().click();
  await field('title').fill('Часы обновлены');
  await page.locator('[data-view="products"]').first().click();
  assert.equal(await page.locator('.mw-leave-dialog').isVisible(),true);
  await page.keyboard.press('Escape');
  assert.equal(await field('title').inputValue(),'Часы обновлены');
  await page.locator('[data-view="products"]').first().click();
  await page.setViewportSize({width:320,height:640}); await fits();
  await page.locator('.mw-leave-dialog').screenshot({path:`${output}/unsaved-changes-mobile.png`});
  await page.evaluate(()=>{window.__fail=true;});
  await action('save-leave').click();
  await page.locator('[data-mw-leave-error]:not([hidden])').waitFor();
  assert.equal(await page.locator('.mw-leave-dialog').isVisible(),true,'failed save must not navigate');
  assert.equal(await page.evaluate(()=>window.__db.mold_calculations[0].title),'Часы «Морская волна»');
  await page.evaluate(()=>{window.__fail=false;});
  await action('save-leave').evaluate(n=>{n.click();n.click();});
  await page.locator('[name="mold_calculation_id"]').waitFor({state:'attached'});
  assert.match(await page.locator('[name="mold_calculation_id"]').textContent(),/Часы обновлены/);
  assert.equal(await page.evaluate(()=>window.__calls.length),4,'save-and-leave must be single flight');
  await page.locator('[data-view="mold"]').first().click();
  assert.equal(await page.locator('.mw-draft').count(),0);
  await action('edit').last().click();
  await field('manual').fill('');
  await action('library').click(); await action('save-leave').click();
  assert.equal(await page.locator('[data-mw-error]').isVisible(),true,'invalid changes must keep the editor open');
  await field('manual').fill('120');
  await action('library').click();
  assert.equal(await page.locator('.mw-leave-dialog').count(),0);
  await page.setViewportSize({width:1470,height:1000});
  await page.locator('[data-mw-action="edit"]:not([data-id="old"])').click();
  await page.locator('[data-mw-action="step"][data-step="2"]').click();
  await field('notes').fill('Проверка сохранения перед выходом в библиотеку');
  await action('library').click();
  await action('save-leave').click();
  await page.locator('[data-mw-library]').waitFor();
  assert.equal(await page.locator('.mw-leave-dialog').count(),0);
  assert.equal(await page.locator('.mw-draft').count(),0);
  assert.equal(await page.evaluate(()=>window.__db.mold_calculations.find(r=>r.id!=='old').notes),'Проверка сохранения перед выходом в библиотеку');
  await action('new').click(); await action('library').click();
  assert.equal(await page.locator('.mw-draft').count(),0,'empty new forms should not leave drafts either');
  await page.locator('[data-mw-action="edit"][data-id="old"]').click();
  await field('title').fill('Не сохранять эту правку');
  await page.locator('[data-view="warehouse"]').first().click();
  await action('discard-leave').click();
  assert.equal(await page.locator('[data-view="warehouse"].is-active').count(),1);
  await page.locator('[data-view="mold"]').first().click();
  assert.equal(await page.locator('.mw-draft').count(),0);
  assert.equal(await page.evaluate(()=>window.__db.mold_calculations.find(r=>r.id==='old').title),'Часы обновлены');

  // Recover old browser drafts: unchanged copies are pruned, real edits remain available.
  await page.evaluate(() => {
    const key='formula-mold-workflow-v1:mold-test-user', store=JSON.parse(localStorage.getItem(key));
    const record=window.__db.mold_calculations.find(r=>r.id==='old');
    const draft={id:'old',editing:true,title:record.title,mode:'manual',manual:'120',length:'12',width:'8',height:'1.5',finish:true,finishMl:'7.68',thickness:'0.8',notes:'',step:1,
      rows:window.__db.mold_calculation_items.filter(r=>r.calculation_id==='old').map(r=>({key:r.id,materialId:r.material_id,quantity:String(r.quantity),name:r.material_name_snapshot,unit:r.unit_snapshot}))};
    store.drafts={old:{...draft,rows:draft.rows.map((r,i)=>({...r,quantity:i===0?'145':r.quantity}))},copy:{...draft,id:'copy',editing:false,title:'Копия'},animation:{...draft,id:'animation',editing:false,title:'Анимация'}};
    const clean=window.__db.mold_calculations.find(r=>r.id!=='old');
    store.drafts[clean.id]={...draft,id:clean.id,title:clean.title,mode:'sizes',notes:clean.notes,rows:draft.rows.map(r=>({...r}))};
    store.screen='library';store.activeId=null;localStorage.setItem(key,JSON.stringify(store));
  });
  await page.reload(); await page.locator('[data-view="mold"]').first().click();
  assert.equal(await page.locator('.mw-draft').count(),3,'unchanged legacy edit drafts should disappear automatically');
  await page.locator('[data-mw-search]').fill('');
  const dialog = page.locator('.mw-delete-dialog');
  const removeOld = action('delete-recipe').filter({ has: page.locator('svg') }).locator('xpath=self::*[@data-id="old"]');
  const drafts = () => page.evaluate(() => JSON.parse(localStorage.getItem('formula-mold-workflow-v1:mold-test-user')).drafts);
  const draftCount = await page.locator('.mw-draft').count();
  const animationDraft = action('delete-draft').last();
  await animationDraft.click();
  assert.equal(await page.locator('#mw-delete-title').textContent(),'Удалить черновик?');
  assert.equal(await action('cancel-delete').evaluate(n=>n===document.activeElement),true);
  await action('cancel-delete').click();
  assert.equal(await page.locator('.mw-draft').count(),draftCount);
  await animationDraft.click();
  await page.setViewportSize({width:320,height:640}); await fits();
  await dialog.screenshot({path:`${output}/delete-draft-mobile.png`});
  await action('confirm-delete').click();
  assert.equal(await page.locator('.mw-draft').count(),draftCount-1);
  assert.equal(await page.evaluate(()=>window.__deleteCalls.length),0,'draft removal must not write the database');
  assert.equal(await page.evaluate(()=>window.__db.mold_calculations.length),2);
  await fits(); await screenshot('library-delete-mobile');
  await page.reload(); await page.locator('[data-view="mold"]').first().click();
  assert.equal(await page.locator('.mw-draft').count(),draftCount-1,'deleted draft must not return on reload');

  await action('delete-draft').locator('xpath=self::*[@data-id="old"]').click();
  assert.match(await page.locator('#mw-delete-description').textContent(),/Сам сохранённый расчёт останется/);
  await action('confirm-delete').click();
  assert.equal((await drafts()).old,undefined);
  await action('edit').locator('xpath=self::*[@data-id="old"]').click();
  await page.locator('[data-mw-next]').click();
  assert.equal(await page.locator('[data-mw-row-field="quantity"]').first().inputValue(),'140','discarding an edit draft preserves the saved recipe');
  await action('library').click();
  assert.equal(await page.locator('.mw-draft [data-id="old"]').count(),0,'just reopening must not create a draft');
  // Seed a recoverable edit to verify saved deletion also removes its draft.
  await action('edit').locator('xpath=self::*[@data-id="old"]').click();
  await field('title').fill('Черновик часов');
  await page.evaluate(() => {
    const key='formula-mold-workflow-v1:mold-test-user',store=JSON.parse(localStorage.getItem(key));
    store.screen='library';store.activeId=null;localStorage.setItem(key,JSON.stringify(store));
  });
  await page.reload(); await page.locator('[data-view="mold"]').first().click();
  const protectedData = await page.evaluate(()=>JSON.stringify([window.__db.materials,window.__db.product_materials,window.__db.products]));
  const remainingDrafts = Object.keys(await drafts()).filter(id=>id!=='old').sort();
  await removeOld.click();
  assert.match(await page.locator('#mw-delete-description').textContent(),/Черновик этого расчёта тоже/);
  await page.keyboard.press('Escape');
  assert.equal(await dialog.count(),0);
  assert.equal(await removeOld.evaluate(n=>n===document.activeElement),true);
  assert.equal(await page.evaluate(()=>window.__deleteCalls.length),0);
  await removeOld.click();
  await page.keyboard.press('Tab');
  assert.equal(await action('confirm-delete').evaluate(n=>n===document.activeElement),true);
  await page.keyboard.press('Tab');
  assert.equal(await dialog.evaluate(n=>n.contains(document.activeElement)),true,'focus must remain in confirmation');
  await dialog.screenshot({path:`${output}/delete-confirm-mobile-light.png`}); await fits();
  await action('cancel-delete').click();
  await page.setViewportSize({width:1470,height:1000});
  await page.locator('[data-action="toggle-theme"]').first().click();
  await removeOld.click();
  await dialog.screenshot({path:`${output}/delete-confirm-desktop-dark.png`});
  await page.evaluate(()=>{window.__deleteFail=true;});
  await action('confirm-delete').click();
  await page.locator('[data-mw-delete-error]:not([hidden])').waitFor();
  assert.equal(await page.locator('[data-mw-record]').count(),2);
  assert.ok((await drafts()).old,'failed delete must preserve the draft');
  await page.evaluate(()=>{window.__deleteFail=false;window.__deleteEmpty=true;});
  await action('confirm-delete').click();
  await page.locator('[data-mw-delete-error]:not([hidden])').waitFor();
  assert.match(await page.locator('[data-mw-delete-error]').textContent(),/недоступен/);
  assert.equal(await page.locator('[data-mw-record]').count(),2,'zero affected rows must not show false success');
  await page.evaluate(()=>{window.__deleteEmpty=false;});
  await action('confirm-delete').evaluate(n=>{n.click();n.click();});
  assert.equal(await action('confirm-delete').isDisabled(),true);
  await page.keyboard.press('Escape');
  assert.equal(await dialog.isVisible(),true,'cannot dismiss a pending operation');
  await dialog.waitFor({state:'detached'});
  assert.equal(await page.locator('[data-mw-record]').count(),1);
  assert.equal(await page.evaluate(()=>window.__deleteCalls.length),3,'double click must send only one request');
  assert.deepEqual(await page.evaluate(()=>window.__deleteCalls[2]),{table:'mold_calculations',filters:[['id','old'],['user_id',user.id]]});
  assert.deepEqual(Object.keys(await drafts()).sort(),remainingDrafts);
  assert.equal(await page.evaluate(()=>window.__db.mold_calculation_items.filter(r=>r.calculation_id==='old').length),0);
  assert.equal(await page.evaluate(()=>JSON.stringify([window.__db.materials,window.__db.product_materials,window.__db.products])),protectedData,'deletion must preserve stock and existing products');
  await page.locator('[data-view="products"]').first().click();
  assert.equal(await page.locator('[name="mold_calculation_id"] option[value="old"]').count(),0);
  await page.locator('[data-view="mold"]').first().click();
  await page.reload(); await page.locator('[data-view="mold"]').first().click();
  assert.equal(await page.locator('[data-mw-record]').count(),1,'deleted calculation must not return on reload');
  assert.equal((await drafts()).old,undefined,'removed edit draft must not resurrect a deleted calculation');
  await page.locator('[data-mw-search]').fill('Новые');
  await action('delete-recipe').click(); await action('confirm-delete').click();
  await dialog.waitFor({state:'detached'});
  assert.equal(await page.locator('[data-mw-record]').count(),0);
  assert.equal(await page.locator('[data-mw-empty]').isVisible(),true);
  assert.equal(await action('new').isVisible(),true,'can create a calculation after deleting the last one');
  assert.equal(await page.locator('.mw-draft').count(),1,'unrelated copy draft is preserved');
  await page.evaluate(()=>window.__account('another-user')); await page.locator('[data-view="mold"]').first().click();
  assert.equal(await page.locator('.mw-draft').count(),0,'drafts must be scoped to the account');
  assert.deepEqual(errors,[]); console.log('Mold workflow UI passed, screenshots: '+output);
} finally { await browser.close(); }
