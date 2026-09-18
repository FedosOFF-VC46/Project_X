import { MOLD_UNITS, number, newRecipe, newRow, volumes, recipeFromRecord, importLegacyDraft, validateRecipe, recipeCost, recipePayload } from './mold-math.js?v=mold-flow-1';
import { createMoldMotion } from './mold-motion.js?v=mold-flow-1';

const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = (value) => Number.isFinite(value) ? new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 3 }).format(value) : 'Проверьте размеры';
const money = (value) => new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB', maximumFractionDigits: 2 }).format(value);
const unit = (value) => MOLD_UNITS[value] || value || 'ед.';
const icon = (name) => `<i data-lucide="${name}" aria-hidden="true"></i>`;
const button = (action, label, cls = '', extra = '') => `<button type="button" class="${cls}" data-mw-action="${action}" ${extra}>${label}</button>`;

export function createMoldWorkflow({ getState, getMaterials, getItems, save, refresh, enhanceSelects, closeSelects, notify }) {
  let account = null, store = { drafts: {}, activeId: null, screen: 'library' }, root = null, motion = null, events = null;
  let busy = false, timer = 0, undo = null, message = null, storageFailed = false, query = '';
  const key = () => `formula-mold-workflow-v1:${account}`;
  const draft = () => store.drafts[store.activeId];
  const materials = () => getMaterials().filter((m) => m.is_active !== false);
  function write() {
    try { localStorage.setItem(key(), JSON.stringify(store)); storageFailed = false; }
    catch { if (!storageFailed) notify('Не удалось сохранить черновик в браузере. Не закрывайте страницу до сохранения расчёта.', 'error'); storageFailed = true; }
  }
  function ensureAccount() {
    const id = getState().user?.id;
    if (account === id) return;
    account = id; busy = false; message = null; query = '';
    try { store = JSON.parse(localStorage.getItem(key()) || 'null') || { drafts: {}, activeId: null, screen: 'library' }; }
    catch { store = { drafts: {}, activeId: null, screen: 'library' }; }
    if (!store.drafts || typeof store.drafts !== 'object') store.drafts = {};
    if (!store.legacyImported) {
      for (const [legacyKey, fields] of Object.entries(getState().formDrafts || {})) {
        if (legacyKey !== `${id}|save-mold-calculation` && !legacyKey.startsWith(`${id}|save-mold-calculation|calculation_id:`)) continue;
        const recordId = legacyKey.split('calculation_id:')[1];
        const record = getState().moldCalculations.find((r) => r.id === recordId);
        const imported = importLegacyDraft(fields, record, record ? getItems(record) : []);
        store.drafts[imported.id] = imported;
      }
      store.legacyImported = true; write();
    }
    if (!draft()) store.screen = 'library';
  }
  function toast(title, detail = '', restore = null) {
    message = { title, detail }; undo = restore;
    if (!root?.isConnected) { notify(title); return; }
    const slot = root.querySelector('[data-mw-toast]');
    motion.layout(() => {
      slot.hidden = false;
      slot.innerHTML = `<span class="mw-toast-symbol">${icon('check')}</span><div role="status" aria-live="polite"><strong>${esc(title)}</strong>${detail ? `<span>${esc(detail)}</span>` : ''}</div>${restore ? button('undo', 'Вернуть') : ''}${button('dismiss', icon('x'), '', 'aria-label="Закрыть уведомление"')}`;
    }, slot);
    icons(); scheduleToast();
  }
  function scheduleToast() {
    clearTimeout(timer);
    const slot = root?.querySelector('[data-mw-toast]');
    if (slot && !slot.hidden && !slot.matches(':hover') && !slot.contains(document.activeElement)) timer = setTimeout(dismissToast, undo ? 9000 : 5500);
  }
  function dismissToast() {
    clearTimeout(timer); message = null; undo = null;
    const slot = root?.querySelector('[data-mw-toast]');
    if (slot) motion.layout(() => { const focused = slot.contains(document.activeElement); slot.hidden = true; if (focused) root.querySelector('button:not([disabled])')?.focus({ preventScroll: true }); });
  }
  function icons() { window.lucide?.createIcons({ attrs: { 'stroke-width': 1.8 } }); }
  function records() { return getState().moldCalculations; }
  function field(name, label, suffix, placeholder) {
    return `<label>${label}<span class="mw-unit"><input data-mw-field="${name}" aria-label="${label}${suffix ? ', ' + suffix : ''}" inputmode="decimal" autocomplete="off" value="${esc(draft()[name])}" placeholder="${placeholder}"/><b aria-hidden="true">${suffix}</b></span></label>`;
  }
  function library() {
    const drafts = Object.values(store.drafts);
    return `<div class="mw-library" data-mw-library><div class="mw-heading"><div><p class="mw-kicker">Библиотека</p><h2>Ваши расчёты</h2><p class="mw-sub">Сохраните состав заливки и используйте его в картах изделий.</p></div>${button('new', icon('plus') + 'Новый расчёт', 'mw-primary')}</div>
      ${drafts.length ? `<div class="mw-drafts"><p class="mw-kicker">Можно продолжить</p>${drafts.map((d) => `<div class="mw-draft"><div><strong>${esc(d.title || 'Новый расчёт')}</strong><span class="mw-sub">Черновик · шаг ${Number(d.step || 0) + 1} из 3</span></div>${button('resume', 'Продолжить', '', `data-id="${esc(d.id)}"`)}</div>`).join('')}</div>` : ''}
      ${records().length ? `<label class="mw-search">${icon('search')}<input data-mw-search value="${esc(query)}" placeholder="Найти расчёт по названию" aria-label="Найти расчёт по названию"/></label>` : ''}
      <div class="mw-library-grid">${records().map((r) => {
        const recipe = recipeFromRecord(r, getItems(r));
        const cost = recipe.rows.length ? getItems(r).reduce((sum, item) => sum + number(item.total_cost ?? number(item.quantity) * number(item.unit_price_snapshot)), 0) : number(r.material_cost_total);
        return `<article class="mw-recipe" data-mw-record data-title="${esc((r.title || '').toLocaleLowerCase('ru'))}" ${query && !(r.title || '').toLocaleLowerCase('ru').includes(query.toLocaleLowerCase('ru')) ? 'hidden' : ''}><div class="mw-recipe-top"><span class="mw-recipe-icon">${icon('beaker')}</span><strong>${fmt(volumes(recipe).total)} мл</strong></div><h3>${esc(r.title || 'Без названия')}</h3><p class="mw-sub">${recipe.rows.length} ${plural(recipe.rows.length)} · ${money(cost)}</p><div class="mw-chips">${getItems(r).slice(0, 3).map((item) => `<span>${esc(item.material_name_snapshot || getState().materials.find((m) => m.id === item.material_id)?.name || 'Материал')} · ${fmt(number(item.quantity))} ${esc(unit(item.unit_snapshot || getState().materials.find((m) => m.id === item.material_id)?.unit))}</span>`).join('')}${recipe.rows.length > 3 ? `<span>Ещё ${recipe.rows.length - 3}</span>` : ''}</div><div class="mw-recipe-actions">${button('edit', 'Открыть расчёт', '', `data-id="${esc(r.id)}"`)}${button('duplicate', icon('copy'), '', `data-id="${esc(r.id)}" aria-label="Дублировать ${esc(r.title)}" title="Дублировать расчёт"`)}</div></article>`;
      }).join('')}</div><div class="mw-empty" data-mw-empty ${records().length ? 'hidden' : ''}>${icon('beaker')}<h3>${records().length ? 'Ничего не найдено' : 'Первый расчёт начинается здесь'}</h3><p class="mw-sub">${records().length ? 'Попробуйте другое название.' : 'Задайте объём, добавьте материалы и сохраните рецепт заливки.'}</p></div></div>`;
  }
  function cube() {
    return `<div class="mw-stage"><svg data-mw-cube role="img" aria-label="Объёмная схема прямоугольной заливки"><defs>${['top', 'front', 'side'].map((face, i) => `<linearGradient id="mw-glass-${face}" x1="0" y1="0" x2="${i === 1 ? 0 : 1}" y2="1"><stop offset="0" stop-opacity="${.32 - i * .06}"/><stop offset="1" stop-opacity=".035"/></linearGradient>`).join('')}</defs><path data-hidden-edge class="mw-hidden-edge"/>${['front', 'side', 'top'].map((face) => `<path class="mw-face" data-face="${face}" fill="url(#mw-glass-${face})"/>`).join('')}<path data-axis class="mw-axis"/></svg><div class="mw-readings">${[['length', 'Длина'], ['width', 'Ширина'], ['height', 'Высота']].map(([name, label]) => `<div data-mw-reading="${name}"><span>${label}</span><strong data-mw-value="${name}">0 см</strong></div>`).join('')}</div></div>`;
  }
  function editor() {
    const d = draft();
    return `<div class="mw-editor"><div class="mw-heading"><div><p class="mw-kicker">${d.editing ? 'Редактирование расчёта' : 'Новый расчёт'}</p><h2>Одна заливка, три шага</h2></div>${button('library', icon('arrow-left') + 'К расчётам', 'mw-library-back')}</div>
      <form data-mw-form novalidate><fieldset ${busy ? 'disabled' : ''}><nav class="mw-progress" aria-label="Шаги расчёта">${['Объём', 'Материалы', 'Сохранение'].map((label, i) => button('step', `<b>${i + 1}</b><span>${label}</span>`, '', `data-step="${i}" ${d.step === i ? 'aria-current="step"' : ''}`)).join('')}</nav>
      <div data-mw-panel="0"><label>Название расчёта<input data-mw-field="title" value="${esc(d.title)}" maxlength="160" placeholder="Например, часы «Волна»" autocomplete="off"/></label><div class="mw-modes" role="group" aria-label="Способ определения объёма">${button('mode', icon('ruler') + '<strong>По размерам</strong><span>Прямоугольная заливка</span>', '', 'data-mode="sizes"')}${button('mode', icon('beaker') + '<strong>Объём известен</strong><span>Любая форма молда</span>', '', 'data-mode="manual"')}</div>
      <div class="mw-measure" data-mw-sizes><div class="mw-measure-head"><div><p class="mw-kicker">Размер заливки</p><h3>Длина × ширина × высота</h3></div><output data-mw-value="geometry" class="mw-badge">0 мл</output></div>${cube()}<div class="mw-dimensions">${field('length', 'Длина', 'см', '12')}${field('width', 'Ширина', 'см', '8')}${field('height', 'Высота', 'см', '1,5')}</div><p class="mw-sub mw-measure-note">Внутренние размеры молда. Высота — толщина основной заливки.</p></div>
      <div class="mw-manual" data-mw-manual><p class="mw-kicker">Без расчёта по размерам</p><h3>Сколько смолы нужно?</h3>${field('manual', 'Объём основной заливки', 'мл', '120')}<p class="mw-sub">Укажите известный объём, например из описания молда.</p></div>
      <label class="mw-finish-toggle" data-mw-anchor><input type="checkbox" data-mw-field="finish" ${d.finish ? 'checked' : ''} aria-controls="mw-finish-fields"/>Добавить финишный слой</label><div class="mw-finish" id="mw-finish-fields" data-mw-finish><div data-mw-thickness>${field('thickness', 'Толщина финиша', 'мм', '0,8')}</div><div data-mw-finish-ml>${field('finishMl', 'Объём финиша', 'мл', '10')}</div><output data-mw-value="finish">0 мл</output></div><div class="mw-total" data-mw-anchor><span>Всего на одну заливку</span><strong data-mw-value="volume">0 мл</strong></div></div>
      <div data-mw-panel="1"><h3 tabindex="-1">Материалы на одну заливку</h3><p class="mw-sub">Количество каждого материала задаётся в его единице учёта. Граммы и миллилитры не смешиваются.</p><div class="mw-components" data-mw-components>${d.rows.map(rowHtml).join('')}</div>${!materials().length ? `<div class="mw-empty"><p>Сначала добавьте материалы на склад.</p><button type="button" data-view="warehouse">Открыть склад</button></div>` : ''}${button('add', icon('plus') + 'Добавить материал', '', !materials().length ? 'disabled' : '')}<p class="mw-sub mw-optional">Можно сохранить только объём, а состав добавить позже.</p><div class="mw-total" data-mw-anchor><span>Стоимость материалов</span><strong data-mw-value="cost">0 ₽</strong></div></div>
      <div data-mw-panel="2"><h3 data-mw-review-title tabindex="-1"></h3><div data-mw-review></div><div class="mw-total"><span>Стоимость материалов</span><strong data-mw-value="reviewCost">0 ₽</strong></div><p class="mw-sub">Сохранение расчёта не списывает материалы со склада. Инструменты и их износ учитываются в карте изделия.</p><label>Примечание <span class="mw-sub">Необязательно</span><textarea data-mw-field="notes" rows="3" maxlength="4000" placeholder="Особенности заливки">${esc(d.notes)}</textarea></label></div>
      <div class="mw-error" data-mw-error role="alert" hidden></div><div class="mw-footer" data-mw-anchor>${button('back', 'Назад')}<span class="mw-draft-state">Черновик сохраняется</span><button type="submit" class="mw-primary" data-mw-next>К материалам ${icon('arrow-right')}</button></div></fieldset></form></div>`;
  }
  function rowHtml(row) {
    const available = materials();
    const missing = row.materialId && !available.some((m) => m.id === row.materialId);
    return `<div class="mw-component" data-mw-row="${row.key}" data-mw-anchor><label>Материал<select data-mw-row-field="materialId" aria-label="Материал"><option value="">Выбрать материал</option>${missing ? `<option value="${esc(row.materialId)}" selected>${esc(row.name)} · недоступен</option>` : ''}${available.map((m) => `<option value="${esc(m.id)}" ${m.id === row.materialId ? 'selected' : ''}>${esc(m.name)} · ${esc(unit(m.unit))}</option>`).join('')}</select><span class="mw-sub" data-mw-stock></span></label><label>Сколько нужно<span class="mw-unit"><input data-mw-row-field="quantity" aria-label="Количество материала" value="${esc(row.quantity)}" inputmode="decimal" placeholder="0"/><b data-mw-unit></b></span><span class="mw-sub" data-mw-row-cost></span></label>${button('remove', icon('x'), 'mw-remove', 'aria-label="Убрать материал из расчёта"')}</div>`;
  }
  function plural(count) { const n = count % 100; return n > 10 && n < 20 ? 'материалов' : count % 10 === 1 ? 'материал' : count % 10 >= 2 && count % 10 <= 4 ? 'материала' : 'материалов'; }
  function render() {
    ensureAccount();
    return `<section class="mold-workflow" aria-label="Расчёты заливок"><div class="mw-toast" data-mw-toast hidden></div><div data-mw-body>${store.screen === 'editor' && draft() ? editor() : library()}</div></section>`;
  }
  function rebuild(focus = true) {
    closeSelects();
    motion?.destroy();
    root.querySelector('[data-mw-body]').innerHTML = store.screen === 'editor' && draft() ? editor() : library();
    motion = createMoldMotion(root); enhanceSelects(); icons(); update();
    motion.reveal(root.querySelector('[data-mw-body]'));
    if (focus) root.querySelector(store.screen === 'editor' ? '[data-mw-field="title"]' : '[data-mw-action="new"]')?.focus({ preventScroll: true });
  }
  function review() {
    const d = draft(), v = volumes(d), list = materials();
    root.querySelector('[data-mw-review-title]').textContent = d.title;
    root.querySelector('[data-mw-review]').innerHTML = `<div class="mw-review-line"><span>Основная заливка</span><strong>${fmt(v.base)} мл</strong></div>${d.finish ? `<div class="mw-review-line"><span>Финишный слой</span><strong>${fmt(v.finish)} мл</strong></div>` : ''}<div class="mw-review-line"><span>Всего смолы</span><strong>${fmt(v.total)} мл</strong></div>${d.rows.map((r) => { const m = list.find((item) => item.id === r.materialId); return `<div class="mw-review-line"><span>${esc(m?.name || r.name)}</span><strong>${fmt(number(r.quantity))} ${esc(unit(m?.unit || r.unit))} · ${money(number(r.quantity) * number(m?.unit_price))}</strong></div>`; }).join('')}${!d.rows.length ? '<p class="mw-sub">Состав пока не добавлен.</p>' : ''}`;
  }
  function update() {
    if (!root || store.screen !== 'editor' || !draft()) return;
    const d = draft(), v = volumes(d);
    const sizes = d.mode === 'sizes';
    root.querySelectorAll('[data-mw-panel]').forEach((p) => { p.hidden = Number(p.dataset.mwPanel) !== d.step; });
    root.querySelectorAll('[data-step]').forEach((b) => { if (Number(b.dataset.step) === d.step) b.setAttribute('aria-current', 'step'); else b.removeAttribute('aria-current'); b.dataset.complete = Number(b.dataset.step) < d.step; });
    root.querySelectorAll('[data-mode]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.mode === d.mode)));
    for (const [selector, visible] of [['[data-mw-sizes]', sizes], ['[data-mw-manual]', !sizes], ['[data-mw-finish]', d.finish], ['[data-mw-thickness]', sizes], ['[data-mw-finish-ml]', !sizes]]) root.querySelector(selector).hidden = !visible;
    for (const name of ['length', 'width', 'height', 'manual', 'thickness', 'finishMl']) {
      root.querySelector(`[data-mw-field="${name}"]`).disabled = ['length', 'width', 'height'].includes(name) ? !sizes : name === 'manual' ? sizes : !d.finish || (name === 'thickness' ? !sizes : sizes);
    }
    root.querySelector('[data-mw-field="finish"]').setAttribute('aria-expanded', String(d.finish));
    for (const [name, value] of Object.entries({ geometry: fmt(v.geometry) + ' мл', volume: fmt(v.total) + ' мл', finish: fmt(v.finish) + ' мл', length: fmt(number(d.length)) + ' см', width: fmt(number(d.width)) + ' см', height: fmt(number(d.height)) + ' см', cost: money(recipeCost(d, materials())), reviewCost: money(recipeCost(d, materials())) })) motion.value(root.querySelector(`[data-mw-value="${name}"]`), value);
    root.querySelector('[data-mw-next]').innerHTML = busy ? `${icon('loader-circle')} Сохраняем…` : d.step === 2 ? `${icon('check')} ${d.editing ? 'Сохранить изменения' : 'Сохранить расчёт'}` : `${d.step === 0 ? 'К материалам' : 'Проверить расчёт'} ${icon('arrow-right')}`;
    root.querySelector('[data-mw-action="back"]').textContent = d.step ? 'Назад' : 'К расчётам';
    root.querySelector('.mw-draft-state').textContent = storageFailed ? 'Черновик только в этой вкладке' : 'Черновик сохранён';
    root.querySelectorAll('[data-mw-row]').forEach((node) => {
      const row = d.rows.find((r) => r.key === node.dataset.mwRow); if (!row) return;
      const m = materials().find((item) => item.id === row.materialId);
      node.querySelector('[data-mw-unit]').textContent = m ? unit(m.unit) : 'ед.';
      node.querySelector('[data-mw-row-cost]').textContent = m ? money(number(row.quantity) * number(m.unit_price)) : '';
      node.querySelector('[data-mw-stock]').textContent = m ? `На складе ${fmt(number(m.current_stock))} ${unit(m.unit)} · ${money(number(m.unit_price))} / ${unit(m.unit)}` : 'Выберите материал со склада';
    });
    if (d.step === 2) review();
    motion.cube([d.length, d.width, d.height]); icons();
  }
  function clearError() { root?.querySelectorAll('[aria-invalid]').forEach((n) => n.removeAttribute('aria-invalid')); const node = root?.querySelector('[data-mw-error]'); if (node) node.hidden = true; }
  function error(problem) {
    if (problem.step !== undefined) { draft().step = problem.step; update(); write(); }
    const node = root?.querySelector('[data-mw-error]'); if (!node) { notify(problem.message, 'error'); return; }
    node.textContent = problem.message; node.hidden = false; motion.reveal(node);
    const target = problem.row ? [...root.querySelectorAll('[data-mw-row]')].find((n) => n.dataset.mwRow === problem.row)?.querySelector(`[data-mw-row-field="${problem.field}"]`) : root.querySelector(`[data-mw-field="${problem.field}"]`);
    if (target) { target.setAttribute('aria-invalid', 'true'); (target.tagName === 'SELECT' ? target.nextElementSibling?.querySelector('button') : target)?.focus(); }
  }
  function goStep(step) {
    if (busy) return;
    const d = draft();
    if (step > d.step) { const issue = validateRecipe(d, materials(), step === 1 ? 0 : 1); if (issue) { error(issue); return; } }
    clearError(); closeSelects();
    motion.layout(() => { d.step = Math.max(0, Math.min(2, step)); write(); update(); }, () => root.querySelector(`[data-mw-panel="${d.step}"]`));
    const panel = root.querySelector(`[data-mw-panel="${d.step}"]`);
    (panel.querySelector('h3[tabindex]') || panel.querySelector('input'))?.focus({ preventScroll: true });
  }
  async function submit(event) {
    if (!event.target.matches('[data-mw-form]')) return;
    event.preventDefault(); if (busy) return;
    if (draft().step < 2) { goStep(draft().step + 1); return; }
    const issue = validateRecipe(draft(), materials()); if (issue) { error(issue); return; }
    const id = draft().id, owner = account, editing = draft().editing;
    busy = true; clearError(); root.querySelector('fieldset').disabled = true; root.querySelector('[data-mw-action="library"]').disabled = true; update();
    try {
      await save(recipePayload(draft()));
      // Navigation/account changes must never clear another user's draft.
      if (getState().user?.id !== owner) return;
      delete store.drafts[id]; store.activeId = null; store.screen = 'library'; write();
      await refresh();
      if (getState().user?.id === owner) toast(editing ? 'Расчёт обновлён' : 'Расчёт сохранён', 'Он доступен в картах изделий. Материалы со склада не списаны.');
    } catch (failure) {
      if (getState().user?.id === owner) error({ message: `${failure.message || 'Не удалось сохранить расчёт.'} Введённые данные сохранены в черновике. Попробуйте ещё раз.` });
    } finally {
      busy = false;
      if (root?.isConnected && draft()) { root.querySelector('fieldset').disabled = false; root.querySelector('[data-mw-action="library"]').disabled = false; update(); }
    }
  }
  function input(event) {
    const target = event.target;
    if (target.matches('[data-mw-search]')) {
      query = target.value; let count = 0;
      root.querySelectorAll('[data-mw-record]').forEach((node) => { node.hidden = !node.dataset.title.includes(query.trim().toLocaleLowerCase('ru')); if (!node.hidden) count++; });
      root.querySelector('[data-mw-empty]').hidden = count > 0; return;
    }
    if (busy || !draft()) return;
    const name = target.dataset.mwField, rowField = target.dataset.mwRowField;
    if (!name && !rowField) return;
    clearError();
    if (name) draft()[name] = target.type === 'checkbox' ? target.checked : target.value;
    if (rowField) { const row = draft().rows.find((r) => r.key === target.closest('[data-mw-row]').dataset.mwRow); row[rowField] = target.value; }
    write();
    if (name === 'finish') motion.layout(update, root.querySelector('[data-mw-finish]')); else update();
  }
  function click(event) {
    const b = event.target.closest('[data-mw-action]'); if (!b || busy || b.disabled) return;
    const action = b.dataset.mwAction; motion.press(b);
    if (action === 'dismiss') { dismissToast(); return; }
    if (action === 'undo') { const restore = undo; dismissToast(); restore?.(); return; }
    if (['library', 'new', 'edit', 'duplicate', 'resume'].includes(action)) {
      dismissToast(); clearError();
      if (action === 'library') { store.screen = 'library'; write(); rebuild(); toast('Черновик сохранён', 'Продолжить можно из библиотеки расчётов.'); return; }
      if (action === 'new') { const d = newRecipe(); store.drafts[d.id] = d; store.activeId = d.id; }
      if (action === 'resume') store.activeId = b.dataset.id;
      if (action === 'edit' || action === 'duplicate') {
        const record = records().find((r) => r.id === b.dataset.id); if (!record) return;
        let d = action === 'edit' && store.drafts[record.id] || recipeFromRecord(record, getItems(record));
        if (action === 'duplicate') d = { ...d, id: crypto.randomUUID(), editing: false, title: `${d.title} · копия`, step: 0 };
        store.drafts[d.id] = d; store.activeId = d.id;
      }
      store.screen = 'editor'; write(); rebuild();
      if (action === 'duplicate') toast('Копия готова к изменениям', 'Оригинальный расчёт останется без изменений.');
      return;
    }
    if (!draft()) return;
    if (action === 'step') goStep(Number(b.dataset.step));
    if (action === 'back') { if (draft().step) goStep(draft().step - 1); else root.querySelector('[data-mw-action="library"]').click(); }
    if (action === 'mode' && b.dataset.mode !== draft().mode) {
      clearError(); closeSelects(); motion.layout(() => { draft().mode = b.dataset.mode; write(); update(); }, () => root.querySelector(draft().mode === 'sizes' ? '[data-mw-sizes]' : '[data-mw-manual]'));
    }
    if (action === 'add') {
      const row = newRow(); draft().rows.push(row);
      motion.layout(() => { root.querySelector('[data-mw-components]').insertAdjacentHTML('beforeend', rowHtml(row)); write(); enhanceSelects(); update(); }, () => root.querySelector(`[data-mw-row="${row.key}"]`));
      root.querySelector(`[data-mw-row="${row.key}"] .select-ui-button`)?.focus({ preventScroll: true });
    }
    if (action === 'remove') {
      closeSelects(); const node = b.closest('[data-mw-row]'), d = draft(), index = d.rows.findIndex((r) => r.key === node.dataset.mwRow), row = d.rows[index];
      motion.layout(() => { d.rows.splice(index, 1); node.remove(); write(); update(); });
      root.querySelector('[data-mw-action="add"]')?.focus({ preventScroll: true });
      toast('Материал убран из расчёта', 'На складе ничего не изменилось.', () => {
        if (draft()?.id !== d.id || busy) return;
        d.rows.splice(Math.min(index, d.rows.length), 0, row);
        motion.layout(() => { const list = root.querySelector('[data-mw-components]'); const sibling = list.children[index]; if (sibling) sibling.insertAdjacentHTML('beforebegin', rowHtml(row)); else list.insertAdjacentHTML('beforeend', rowHtml(row)); write(); enhanceSelects(); update(); }, () => root.querySelector(`[data-mw-row="${row.key}"]`));
        toast('Материал возвращён');
      });
    }
  }
  function unmount() { events?.abort(); motion?.destroy(); clearTimeout(timer); root = null; }
  function mount() {
    unmount(); root = document.querySelector('.mold-workflow'); if (!root) return;
    ensureAccount(); events = new AbortController(); motion = createMoldMotion(root);
    const on = (name, fn) => root.addEventListener(name, fn, { signal: events.signal });
    on('click', click); on('input', input); on('submit', submit);
    on('focusin', (event) => { const name = event.target.dataset.mwField; if (draft()) motion.cube([draft().length, draft().width, draft().height], name || ''); root.querySelectorAll('[data-mw-reading]').forEach((n) => n.dataset.active = n.dataset.mwReading === name); if (event.target.closest('[data-mw-toast]')) clearTimeout(timer); });
    on('focusout', () => queueMicrotask(scheduleToast));
    const slot = root.querySelector('[data-mw-toast]');
    slot.addEventListener('pointerenter', () => clearTimeout(timer), { signal: events.signal });
    slot.addEventListener('pointerleave', scheduleToast, { signal: events.signal });
    update(); motion.reveal(root.querySelector('[data-mw-body]'));
    if (message) toast(message.title, message.detail, undo);
  }
  return { render, mount, unmount };
}
