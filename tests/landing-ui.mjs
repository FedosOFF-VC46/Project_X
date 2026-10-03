import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { landingScreens } from '../src/landing-screens.js';

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
    await page.locator('.lp-cost-details summary').click();
    await fits();
    await page.locator('.lp-cost-details summary').click();
    if (width === 1440 || width === 390 || width === 320) await page.locator('.lp-pricing').screenshot({ path: `${output}/pricing-${width}.png` });
    if (width === 390) {
      await page.evaluate(() => scrollTo(0, 0));
      await page.waitForTimeout(250);
      await page.screenshot({ path: `${output}/hero-mobile.png` });
      await page.screenshot({ path: `${output}/landing-mobile.png`, fullPage: true });
    }
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  for (const [section, screens] of Object.entries(landingScreens)) {
    await page.locator(`[data-demo-tab="${section}"]`).click();
    const gallery = page.locator(`[data-screen-gallery="${section}"]`);
    for (const [index, screen] of screens.entries()) {
      await gallery.locator(`[data-screen-select="${index}"]`).click();
      await gallery.locator('[data-screen-image]').evaluate(image => image.decode());
      assert.equal(await gallery.locator('[data-screen-image]').getAttribute('src'), `./assets/screens/${screen.id}.webp`);
      assert.deepEqual(await gallery.locator('[data-screen-image]').evaluate(image => [image.naturalWidth, image.naturalHeight]), [screen.width, screen.height]);
      await gallery.locator('[data-screen-open]').click();
      assert.equal(await page.locator('[data-screen-dialog]').evaluate(dialog => dialog.open), true);
      assert.equal(await page.locator('#lp-screen-title').textContent(), screen.label);
      await page.locator('[data-screen-full]').evaluate(image => image.decode());
      await fits();
      await page.locator('[data-screen-size]').click();
      assert.equal(await page.locator('[data-screen-size]').getAttribute('aria-pressed'), 'true');
      await fits();
      await page.keyboard.press('Escape');
      await page.locator('body.lp-screen-open').waitFor({ state: 'detached' });
      assert.equal(await page.locator('[data-screen-dialog]').evaluate(dialog => dialog.open), false);
      assert.equal(await gallery.locator('[data-screen-open]').evaluate(button => button === document.activeElement), true);
      assert.equal(await page.locator('body.lp-screen-open').count(), 0);
    }
    await gallery.locator('[data-screen-select="0"]').click();
    await page.locator('.lp-demo-tabs').scrollIntoViewIfNeeded();
    await page.locator('.lp-demo-stage').screenshot({ path: `${output}/showcase-${section}.png` });
  }
  // Zoom is scrollable inside its own dialog, not the mobile page.
  await page.setViewportSize({ width: 320, height: 760 });
  await page.locator('[data-demo-tab="recipe"]').click();
  await page.locator('#lp-panel-recipe [data-screen-open]').click();
  await fits();
  await page.locator('[data-screen-size]').click();
  assert.ok(await page.locator('[data-screen-scroll]').evaluate(el => el.scrollWidth > el.clientWidth));
  await page.locator('[data-screen-scroll]').evaluate(el => el.scrollTo(120, 200));
  await fits();
  await page.screenshot({ path: `${output}/screen-zoom-mobile.png` });
  await page.locator('[data-screen-close]').click();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.locator('#lp-panel-recipe [data-screen-open]').click();
  await page.mouse.click(2, 2);
  assert.equal(await page.locator('[data-screen-dialog]').evaluate(dialog => dialog.open), false);
  await page.locator('[data-demo-tab="recipe"]').focus();
  await page.keyboard.press('ArrowRight');
  assert.equal(await page.locator('[data-demo-tab="product"]').getAttribute('aria-selected'), 'true');
  await page.keyboard.press('End');
  assert.equal(await page.locator('[data-demo-tab="business"]').getAttribute('aria-selected'), 'true');
  const price = async key => Number((await page.locator(`[data-demo-${key}]`).textContent()).replace(/[^\d,.-]/g, '').replace(',', '.'));
  assert.equal(await price('price'), 1299.6);
  await page.locator('#lp-minutes').fill('120');
  assert.equal(await price('labor'), 400);
  assert.equal(await price('tools'), 49);
  assert.equal(await price('price'), 1681.2);
  await page.locator('#lp-markup').fill('250');
  await page.locator('#lp-minutes').fill('240');
  assert.equal(await price('price'), 4753);
  await page.locator('#lp-markup').fill('0');
  assert.equal(await price('price'), 1358);
  await page.locator('#lp-packaging').uncheck();
  assert.equal(await price('packaging'), 0);
  assert.equal(await price('price'), 1298);
  assert.equal(await page.locator('.lp-cost-detail-row').count(), 6);
  await page.locator('.lp-cost-details summary').click();
  assert.equal(await page.locator('.lp-cost-details').getAttribute('open'), '');
  await page.locator('[data-price-reset]').click();
  assert.equal(await price('price'), 1299.6);
  assert.equal(await page.locator('#lp-packaging').isChecked(), true);
  assert.equal(await page.locator('.lp-cost-detail-row').count(), 7);
  assert.match(await page.locator('[data-price-feedback]').textContent(), /восстановлен/);
  await page.locator('.lp-pricing').screenshot({ path: `${output}/pricing-expanded.png` });
  await page.locator('.lp-cost-details summary').click();
  await page.locator('#lp-minutes').focus();
  await page.keyboard.press('ArrowRight');
  assert.equal(await page.locator('#lp-minutes').inputValue(), '75');
  assert.equal(await price('labor'), 250);
  assert.equal(await price('tools'), 40);
  await page.locator('[data-price-reset]').click();
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
