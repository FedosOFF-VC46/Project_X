import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const output = process.env.UI_OUTPUT || '/tmp/formula-landing-ui';
const baseURL = process.env.APP_URL || 'http://127.0.0.1:4174/';
await mkdir(output, { recursive: true });
const mock = `
window.__reads=0; window.__signups=0; window.__signins=0;
let session=sessionStorage.getItem('test-session')?{user:{id:'landing-ui',email:'test@example.invalid'}}:null;
let callback=()=>{};
class Query {
 select(){return this;} eq(){return this;} order(){return this;} limit(){return this;} range(){return this;}
 then(resolve){return Promise.resolve(resolve({data:[],error:null}));}
}
export const supabase={
 auth:{
  getSession:async()=>({data:{session}}),onAuthStateChange(cb){callback=cb;return {data:{subscription:{unsubscribe(){}}}};},
  async signInWithPassword(){window.__signins++;await new Promise(r=>setTimeout(r,180));if(window.__failLogin)return {error:{message:'Invalid login credentials'}};session={user:{id:'landing-ui',email:'test@example.invalid'}};sessionStorage.setItem('test-session','1');callback('SIGNED_IN',session);return {data:{session},error:null};},
  async signOut(){session=null;sessionStorage.removeItem('test-session');callback('SIGNED_OUT',null);return {error:null};},
  async signUp(){window.__signups++;throw Error('Registration must not be called');}
 },
 from(){window.__reads++;return new Query();},
 rpc:async()=>({data:[],error:null}),storage:{from:()=>({createSignedUrl:async()=>({data:null})})}
};`;
const browser = await chromium.launch({ executablePath: process.env.BROWSER_PATH || '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser', headless: true, args: ['--enable-unsafe-swiftshader'] });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
const errors = [];
await context.route('**/src/supabaseClient.js*', (route) => route.fulfill({ contentType: 'text/javascript', body: mock }));
await context.route('https://*.supabase.co/**', (route) => { errors.push('Unexpected real backend call'); return route.abort(); });
const page = await context.newPage();
page.on('pageerror', error => errors.push(error.message));
async function fits() {
  const result = await page.evaluate(() => ({ viewport: innerWidth, width: document.documentElement.scrollWidth,
    outside: [...document.querySelectorAll('.landing a,.landing button,.landing input,.landing h1,.landing h2,.landing h3,.lp-app-preview,.lp-calculator,.auth-panel')]
      .filter(el => el.getClientRects().length && !el.closest('[hidden]') && !el.classList.contains('lp-skip'))
      .filter(el => { const r=el.getBoundingClientRect();return r.left < -1 || r.right > innerWidth + 1; }).map(el => el.className || el.tagName) }));
  assert.ok(result.width <= result.viewport + 1, `Horizontal overflow: ${JSON.stringify(result)}`);
  assert.deepEqual(result.outside, []);
}
try {
  await page.goto(baseURL);
  await page.locator('.lp-hero h1').waitFor();
  await page.waitForFunction(() => document.querySelector('[data-sculpture]')?.dataset.renderer);
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: `${output}/hero-desktop.png` });
  await page.screenshot({ path: `${output}/landing-desktop.png`, fullPage: true });
  assert.equal(await page.locator('[data-sculpture]').getAttribute('data-renderer'), 'webgl');
  assert.equal(await page.locator('[data-motion-toggle]').getAttribute('aria-pressed'), 'true');
  await page.locator('[data-assembly-toggle]').click();
  assert.equal(await page.locator('[data-assembly-toggle]').getAttribute('aria-pressed'), 'true');
  await page.locator('[data-assembly-toggle]').click();
  assert.equal(await page.locator('form[data-action="auth"],form[data-action="signup"]').count(), 0);
  assert.equal(await page.evaluate(() => window.__reads), 0);
  for (const width of [1920, 1440, 1024, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 1000 });
    await fits();
    for (const id of ['recipe', 'product', 'stock', 'business']) {
      await page.locator(`[data-demo-tab="${id}"]`).click();
      assert.equal(await page.locator(`#lp-panel-${id}`).isVisible(), true);
      await fits();
    }
    await page.locator('[data-demo-tab="recipe"]').click();
    if (width === 390) {
      await page.evaluate(() => scrollTo(0, 0));
      await page.waitForTimeout(250);
      await page.screenshot({ path: `${output}/hero-mobile.png` });
      await page.screenshot({ path: `${output}/landing-mobile.png`, fullPage: true });
    }
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.locator('[data-demo-tab="recipe"]').focus();
  await page.keyboard.press('ArrowRight');
  assert.equal(await page.locator('[data-demo-tab="product"]').getAttribute('aria-selected'), 'true');
  await page.keyboard.press('End');
  assert.equal(await page.locator('[data-demo-tab="business"]').getAttribute('aria-selected'), 'true');
  await page.locator('[data-markup="250"]').click();
  assert.match(await page.locator('[data-demo-price]').textContent(), /2\s*275/);
  await page.locator('#lp-hours').fill('4');
  assert.match(await page.locator('[data-demo-price]').textContent(), /4\s*375/);
  await page.locator('#lp-markup').fill('0');
  assert.match(await page.locator('[data-demo-price]').textContent(), /1\s*250/);
  assert.equal(await page.evaluate(() => window.__reads), 0, 'demo must not load user data');
  await page.locator('.lp-header a[href="#login"]').click();
  await page.locator('form[data-action="auth"]').waitFor();
  assert.equal(await page.locator('[data-action="open-registration"],form[data-action="signup"],.registration-layer').count(), 0);
  await page.screenshot({ path: `${output}/auth-desktop.png` });
  await page.goBack(); await page.locator('.landing').waitFor();
  await page.goForward(); await page.locator('form[data-action="auth"]').waitFor();
  await page.reload(); await page.locator('form[data-action="auth"]').waitFor();
  for (const width of [1440, 768, 390, 320]) { await page.setViewportSize({ width, height: 1000 }); await fits(); }
  await page.screenshot({ path: `${output}/auth-mobile.png` });
  await page.locator('[data-action="toggle-theme"]').click();
  await fits();
  await page.evaluate(() => { window.__failLogin=true; });
  await page.locator('input[name="email"]').fill('test@example.invalid');
  await page.locator('input[name="password"]').fill('fake-password');
  await page.locator('form[data-action="auth"] button[type="submit"]').click();
  await page.locator('[data-auth-error]:not([hidden])').waitFor();
  assert.equal(await page.locator('input[name="email"]').inputValue(), 'test@example.invalid');
  assert.equal(await page.locator('form[data-action="auth"] button[type="submit"]').isEnabled(), true);
  // Check both UI and handler gates without contacting a real auth service.
  await page.evaluate(() => {
    const b=document.createElement('button');b.dataset.action='open-registration';document.body.append(b);b.click();b.remove();
    const f=document.createElement('form');f.dataset.action='signup';document.body.append(f);f.requestSubmit();f.remove();
  });
  assert.equal(await page.evaluate(() => window.__signups), 0);
  assert.equal(await page.locator('.registration-layer').count(), 0);
  await page.evaluate(() => { window.__failLogin=false; });
  await page.locator('form[data-action="auth"] button[type="submit"]').click();
  await page.locator('.workspace-shell').waitFor();
  assert.equal(await page.locator('.landing').count(), 0);
  assert.equal(await page.evaluate(() => location.hash), '');
  await page.reload(); await page.locator('.workspace-shell').waitFor();
  assert.equal(await page.locator('.landing').count(), 0);
  await page.locator('[data-action="logout"]').click();
  await page.locator('.landing').waitFor();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.reload(); await page.locator('.landing').waitFor();
  await page.locator('[data-sculpture][data-renderer="webgl"]').waitFor();
  await page.locator('[data-motion-toggle]').click();
  assert.equal(await page.locator('.landing.lp-paused').count(), 1);
  await page.locator('[data-motion-toggle]').click();
  assert.equal(await page.locator('.landing.lp-paused').count(), 0);
  // A graphics failure must only remove decoration, never content or login.
  const fallback = await context.newPage();
  fallback.on('pageerror', error => errors.push(error.message));
  await fallback.addInitScript(() => {
    const original=HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext=function(type,...args){if(type.startsWith('webgl'))return null;return original.call(this,type,...args);};
  });
  await fallback.goto(baseURL); await fallback.locator('[data-sculpture][data-renderer="fallback"]').waitFor();
  await fallback.locator('.lp-header a[href="#login"]').click(); await fallback.locator('form[data-action="auth"]').waitFor();
  await fallback.close();
  assert.deepEqual(errors, []);
  console.log('PASS: responsive landing, real WebGL + fallback, all demos, pricing, keyboard tabs, motion, anonymous privacy, login/back/reload/logout, disabled signup.');
  console.log(`Screenshots: ${output}`);
} catch (error) {
  await page.screenshot({ path: `${output}/failure.png`, fullPage: true });
  console.error('Browser errors:', errors);
  throw error;
} finally {
  await browser.close();
}
