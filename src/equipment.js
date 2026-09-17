import { RESOURCE_MODES, TOOL_KINDS, number, round, resourceRemaining,
  effectiveToolLinks, estimatedToolCost, planToolUsage } from './equipment-math.js?v=instance-control-1';

export function createEquipmentSystem(ctx) {
  const { state, escapeHtml: esc, formatCurrency: money, formatQty: qty } = ctx;
  const ui = { dialog: null, query: '', filter: '', production: null };
  let focusedDialog = '';
  const models = () => (state.toolModels || []).filter((row) => !row.deleted_at);
  const instances = () => (state.toolInstances || []).filter((row) => !row.deleted_at && models().some((model) => model.id === row.model_id));
  const links = () => state.productTools || [];
  const modelById = (id) => models().find((row) => row.id === id);
  const modelInstances = (id) => instances().filter((row) => row.model_id === id);
  const unit = (mode) => RESOURCE_MODES[mode]?.unit || '';
  const icon = (name) => `<i data-lucide="${name}" aria-hidden="true"></i>`;
  const button = (action, label, id = '', primary = false) => `<button type="button" class="${primary ? 'primary-button' : 'ghost-button'} compact" data-eq-action="${action}" data-id="${esc(id)}">${label}</button>`;
  const date = (value) => value ? new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short' }).format(new Date(value)) : '';
  const today = () => new Date().toISOString().slice(0, 10);

  function open(type, id = '') {
    ui.dialog = { type, id };
    ctx.render();
  }

  function openProduction(id) {
    if (!state.products.some((product) => product.id === id)) return;
    if (ui.production?.productId !== id) ui.production = { productId: id, quantity: 1, notes: '', preferences: {}, selectedIds: effectiveToolLinks(models(), links(), id).map(({ model }) => model.id), step: 1, requestId: crypto.randomUUID() };
    ui.production.step = 1;
    state.inventory.productEditorOpen = false;
    state.calculator.dialogOpen = false;
    open('production', id);
  }

  function instanceTone(item) {
    if (item.status === 'retired') return 'retired';
    if (item.status === 'paused') return 'paused';
    const left = resourceRemaining(item);
    if (left === 0) return 'empty';
    return left / number(item.resource_limit) <= 0.2 ? 'low' : 'ready';
  }

  function gauge(percent, label, small = false) {
    const safe = Math.max(0, Math.min(100, percent));
    return `<div class="eq-gauge ${small ? 'eq-gauge-small' : ''}" style="--resource:${safe}%" role="img" aria-label="${esc(label)}">
      <span><b>${Math.round(safe)}<small>%</small></b>${!small ? '<em>ресурса</em>' : ''}</span></div>`;
  }

  function renderCard(model, index) {
    const all = modelInstances(model.id);
    const active = all.filter((item) => item.status !== 'retired');
    const working = active.filter((item) => instanceTone(item) === 'ready' || instanceTone(item) === 'low');
    const limit = active.reduce((sum, item) => sum + number(item.resource_limit), 0);
    const left = active.reduce((sum, item) => sum + resourceRemaining(item), 0);
    const attention = active.some((item) => ['low', 'empty'].includes(instanceTone(item)));
    const source = state.materials.find((item) => item.id === model.source_material_id);
    const count = model.resource_mode ? all.length : number(source?.current_stock);
    return `<button class="eq-card ${attention ? 'eq-needs-attention' : ''}" data-eq-action="${model.resource_mode ? 'detail' : 'model'}" data-id="${model.id}" style="--order:${Math.min(index, 10)}" type="button">
      <div class="eq-card-top"><span class="eq-icon">${icon(model.kind === 'mold' ? 'box' : 'wrench')}</span>
        <span class="eq-badge ${!model.resource_mode ? 'eq-warning' : ''}">${!model.resource_mode ? 'Настроить ресурс' : model.is_common ? 'Общий набор' : TOOL_KINDS[model.kind]}</span></div>
      <h3>${esc(model.name)}</h3><p>${qty(count)} шт ${model.resource_mode ? `· ${working.length} в работе` : '· со старого склада'}</p>
      <div class="eq-card-resource">${gauge(limit > 0 ? left / limit * 100 : 0, `${qty(left)} ${unit(model.resource_mode)} осталось`, true)}
        <div><small>${model.resource_mode ? 'Осталось на всех экземплярах' : 'Укажите срок службы'}</small><strong>${model.resource_mode ? `${qty(left)} <span>${unit(model.resource_mode)}</span>` : 'Ресурс ещё не задан'}</strong></div></div>
      <div class="eq-card-bottom"><span>${model.resource_mode ? `${money(number(model.default_cost) / number(model.default_resource))} / ${RESOURCE_MODES[model.resource_mode].one}` : 'Цена и название сохранены'}</span>${icon('arrow-up-right')}</div>
    </button>`;
  }

  function filteredModels() {
    const query = ui.query.trim().toLocaleLowerCase('ru-RU');
    return models().filter((model) => {
      if (query && !`${model.name} ${model.notes || ''}`.toLocaleLowerCase('ru-RU').includes(query)) return false;
      const list = modelInstances(model.id);
      if (ui.filter === 'attention') return !model.resource_mode || list.some((item) => ['low', 'empty', 'paused'].includes(instanceTone(item)));
      if (ui.filter === 'active') return list.some((item) => ['ready', 'low'].includes(instanceTone(item)));
      if (ui.filter === 'retired') return list.some((item) => item.status === 'retired');
      return true;
    });
  }

  function renderCards() {
    const list = filteredModels();
    return list.length ? `<div class="eq-grid">${list.map(renderCard).join('')}</div>` : `<div class="eq-empty">${icon('search')}<h3>${models().length ? 'Ничего не найдено' : 'У каждого инструмента своя история'}</h3><p>${models().length ? 'Попробуйте другое название или сбросьте фильтр.' : 'Добавьте молд или инструмент, чтобы учитывать его ресурс и стоимость работы.'}</p>${models().length ? button('reset-filter', 'Сбросить фильтры') : button('model', 'Добавить первый инструмент', '', true)}</div>`;
  }

  function renderWarehouse() {
    const active = instances().filter((row) => row.status !== 'retired');
    const attention = active.filter((row) => ['low', 'empty', 'paused'].includes(instanceTone(row))).length;
    const credit = active.reduce((sum, row) => sum + Math.max(0, number(row.purchase_cost) - number(row.charged_cost)), 0);
    return `<section class="eq-workspace">
      <header class="eq-heading"><div><p class="panel-kicker">Мастерская в деталях</p><h2>Инструменты</h2><p>Всё для работы. Каждый экземпляр под контролем.</p></div>${button('model', `${icon('plus')} Добавить инструмент`, '', true)}</header>
      <div class="eq-overview"><div><span>В мастерской</span><strong>${active.length}<small>экземпляров</small></strong></div><div><span>Требуют внимания</span><strong class="${attention ? 'eq-warning-text' : ''}">${attention}<small>экземпляров</small></strong></div><div><span>Ещё распределить в затраты</span><strong>${money(credit)}</strong></div><div class="eq-overview-art" aria-hidden="true">${icon('wrench')}<span>РЕСУРС<br>МАСТЕРСКОЙ</span></div></div>
      <div class="warehouse-filterbar"><label class="warehouse-search">${icon('search')}<input type="search" data-eq-search placeholder="Найти молд или инструмент" aria-label="Поиск инструментов" value="${esc(ui.query)}" /></label>
        <div class="eq-filter-chips" aria-label="Состояние инструментов">${Object.entries({ '': 'Все', active: 'В работе', attention: 'Внимание', retired: 'Списанные' }).map(([key, label]) => `<button type="button" class="eq-chip ${ui.filter === key ? 'is-active' : ''}" data-eq-action="filter" data-id="${key}">${label}</button>`).join('')}</div></div>
      <div data-eq-results>${renderCards()}</div></section>`;
  }

  function instanceDefaultName(index, model, name = model?.name) {
    const previous = (state.toolInstances || []).filter((row) => row.model_id === model?.id).length;
    return `${(name?.trim() || 'Инструмент').slice(0, 60)} · №${previous + index + 1}`;
  }

  function renderNewInstance(index, model) {
    return `<div class="eq-new-instance" data-eq-new-instance="${index}">
      <label class="eq-instance-name">Название экземпляра<input name="instance_label_${index}" maxlength="80" placeholder="${esc(instanceDefaultName(index, model))}" /></label>
      <div class="form-grid"><label data-eq-used-field>Уже использовано<span class="input-with-suffix"><input name="instance_used_${index}" type="number" min="0" step="1" required value="0" data-eq-instance-used /><span data-eq-resource-unit>${unit(model?.resource_mode || 'items')}</span></span></label>
      <label>Начало работы<input name="instance_started_${index}" type="date" required max="${today()}" value="${today()}" /></label></div>
      <span class="eq-instance-remaining" data-eq-instance-remaining>Новый экземпляр</span>
    </div>`;
  }

  function restoreDraftRows(form, draft = {}) {
    const list = form.querySelector('[data-eq-new-instances]');
    if (!list) return;
    const value = draft.count ?? form.elements.count?.value;
    if (value === '') return;
    const count = Number(value);
    if (!Number.isInteger(count) || count < 0 || count > 100) return;
    const model = modelById(form.elements.tool_model_id?.value);
    while (list.children.length < count) list.insertAdjacentHTML('beforeend', renderNewInstance(list.children.length, model));
    while (list.children.length > count) list.lastElementChild.remove();
  }

  function instanceRows(form) {
    return [...form.querySelectorAll('[data-eq-new-instance]')].map((row) => {
      const index = row.dataset.eqNewInstance;
      return { label: form.elements[`instance_label_${index}`].value.trim(),
        used_resource: form.elements.resource_mode.value === 'days' ? 0 : number(form.elements[`instance_used_${index}`].value),
        started_on: form.elements[`instance_started_${index}`].value,
        purchase_cost: number(form.elements.purchase_cost.value), resource_limit: number(form.elements.resource_limit.value) };
    });
  }

  function fields(model, forInstances = false) {
    const source = state.materials.find((row) => row.id === model?.source_material_id);
    const pending = !!source && !model?.resource_mode;
    const count = pending ? Math.max(0, number(source.current_stock)) : model?.resource_mode && !forInstances ? modelInstances(model.id).length : 1;
    const mode = model?.resource_mode || 'items';
    return `<div class="form-grid">
      <label>Цена одного экземпляра<span class="input-with-suffix"><input name="purchase_cost" type="number" min="0" step="0.01" required value="${model?.default_cost ?? ''}" placeholder="1000" data-eq-preview-source /><span>₽</span></span></label>
      <label>Сколько экземпляров<span class="input-with-suffix"><input name="count" type="number" min="${forInstances ? 1 : 0}" max="100" step="1" required value="${qty(count).replace(/\s/g, '')}" ${model?.resource_mode && !forInstances ? 'disabled' : ''} /><span>шт</span></span></label>
    </div>
    ${!forInstances ? `<label>Как учитывать ресурс<select name="resource_mode" data-eq-mode ${modelInstances(model?.id).length ? 'disabled' : ''}>${Object.entries(RESOURCE_MODES).map(([key, value]) => `<option value="${key}" ${mode === key ? 'selected' : ''}>${value.label}</option>`).join('')}</select></label>` : `<input type="hidden" name="resource_mode" value="${mode}" />`}
    <div class="form-grid">
      <label><span data-eq-resource-label>На сколько ${unit(mode)} хватит</span><span class="input-with-suffix"><input name="resource_limit" type="number" min="0.01" step="any" required value="${model?.default_resource || ''}" placeholder="10" data-eq-preview-source /><span data-eq-resource-unit>${unit(mode)}</span></span></label>
      <label data-eq-cycle-field ${mode !== 'cycles' ? 'hidden' : ''}>Изделий за одну заливку<span class="input-with-suffix"><input name="output_per_cycle" type="number" min="1" step="1" value="${model?.output_per_cycle || 1}" data-eq-preview-source /><span>шт</span></span></label>
      <label data-eq-days-field ${mode !== 'days' ? 'hidden' : ''}>Рабочих часов в день<span class="input-with-suffix"><input name="hours_per_day" type="number" min="0.1" max="24" step="0.1" value="${model?.hours_per_day || 8}" data-eq-preview-source /><span>ч</span></span></label>
    </div>
    ${!model?.resource_mode || forInstances ? `<section class="eq-new-instances"><div class="eq-section-heading"><h3>Состояние каждого</h3><small>Новые начинаются с нуля</small></div><div data-eq-new-instances>${Array.from({ length: Math.min(100, count) }, (_, index) => renderNewInstance(index, model)).join('')}</div></section>` : ''}
    <div class="eq-price-preview" aria-live="polite"><span>${icon('sparkles')}<span data-eq-price-label>В себестоимость одного изделия</span></span><strong data-eq-price>0 ₽</strong></div>`;
  }

  function renderModelForm(id) {
    const model = modelById(id);
    return `<form class="stack-form eq-form" data-action="eq-save-model">
      <input type="hidden" name="tool_model_id" value="${model?.id || ''}" />
      ${model && !model.resource_mode ? '<p class="eq-notice">Название и цена перенесены со склада. Укажите количество экземпляров и ресурс каждого.</p>' : ''}
      <label>Название<input name="name" required maxlength="160" value="${esc(model?.name || '')}" placeholder="Молд для подстаканника" /></label>
      <label>Тип инструмента<select name="kind">${Object.entries(TOOL_KINDS).map(([key, label]) => `<option value="${key}" ${model?.kind === key ? 'selected' : ''}>${label}</option>`).join('')}</select></label>
      ${fields(model)}
      <label class="eq-check" data-eq-common ${!model || model.kind === 'mold' ? 'hidden' : ''}><input name="is_common" type="checkbox" ${model?.is_common && model.kind !== 'mold' ? 'checked' : ''} /><span><strong>Общий набор мастерской</strong><small>Предлагать для всех изделий. При изготовлении можно убрать.</small></span></label>
      <label>Примечание<textarea name="notes" rows="2" placeholder="Марка, особенности, ссылка на покупку">${esc(model?.notes || '')}</textarea></label>
      ${model?.resource_mode ? '<p class="eq-note">Цена и ресурс здесь задают расчёт для карт изделий и новых экземпляров. Ресурс существующих меняется в их карточках.</p>' : ''}
      <button type="submit" class="primary-button">${model?.resource_mode ? 'Сохранить настройки' : 'Сохранить инструмент'}</button>
      ${model ? button('delete-model', `${icon('trash-2')} Удалить инструмент`, model.id) : ''}
    </form>`;
  }

  function renderInstance(item) {
    const left = resourceRemaining(item);
    const tone = instanceTone(item);
    const labels = { ready: 'В работе', low: 'Ресурс заканчивается', empty: 'Ресурс исчерпан', paused: 'На паузе', retired: 'Списан' };
    return `<article class="eq-instance eq-tone-${tone}"><div class="eq-instance-head"><div><h3>${esc(item.label)}</h3><span>${labels[tone]}</span></div><b>${money(item.purchase_cost)}</b></div>
      <div class="eq-progress" role="progressbar" aria-label="Остаток ресурса" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(left / number(item.resource_limit) * 100)}"><span style="width:${left / number(item.resource_limit) * 100}%"></span></div>
      <div class="eq-instance-facts"><span>Осталось <strong>${qty(left)} из ${qty(item.resource_limit)} ${unit(item.resource_mode)}</strong></span><span>В затратах <strong>${money(item.charged_cost)}</strong></span></div>
      <div class="eq-instance-actions">${button('instance', `${icon('sliders-horizontal')} Настроить`, item.id)}${tone !== 'retired' ? button('retire', `${icon('archive')} Списать`, item.id) : ''}${button('delete-instance', `${icon('trash-2')} Удалить`, item.id)}</div></article>`;
  }

  function renderDetail(model) {
    const all = modelInstances(model.id);
    const events = (state.toolEvents || []).filter((event) => (state.toolInstances || []).some((item) => item.model_id === model.id && item.id === event.instance_id)).slice(0, 12);
    return `<div class="eq-detail-intro"><div><span class="eq-badge">${TOOL_KINDS[model.kind]} · ${RESOURCE_MODES[model.resource_mode]?.label}</span><p>${esc(model.notes || 'Ресурс и история каждого экземпляра')}</p></div>${button('model', icon('settings-2') + ' Настройки', model.id)}</div>
      <div class="eq-section-heading"><h3>Экземпляры <small>${all.length}</small></h3>${button('add-instances', `${icon('plus')} Добавить`, model.id, true)}</div>
      <div class="eq-instance-list">${all.length ? all.map(renderInstance).join('') : '<p class="eq-note">Экземпляров пока нет. Добавьте инструмент, который уже есть в мастерской.</p>'}</div>
      <details class="eq-history"><summary>${icon('history')} История инструмента</summary><div>${events.length ? events.map((event) => `<div class="eq-event"><span><strong>${esc(event.note || event.event_type)}</strong><small>${esc(event.instance_label)} · ${date(event.created_at)}</small></span><span>${event.resource_amount ? `${qty(event.resource_amount)} ${unit(event.resource_mode)}<br>` : ''}<b>${money(event.cost_amount)}</b></span></div>`).join('') : '<p>История появится после первого действия.</p>'}</div></details>`;
  }

  function renderInstanceForm(item, retiring = false) {
    if (retiring) return `<form class="stack-form eq-form" data-action="eq-instance-action"><input name="tool_instance_id" type="hidden" value="${item.id}" /><input name="operation" type="hidden" value="retire" /><div class="eq-notice">${esc(item.label)} будет списан. Неучтённая стоимость ${money(Math.max(0, number(item.purchase_cost) - number(item.charged_cost)))} останется в истории как расход на списание.</div><label>Причина<textarea name="note" required rows="2" placeholder="Например: молд порвался"></textarea></label><button class="danger-button" type="submit">Списать экземпляр</button></form>`;
    return `<form class="stack-form eq-form" data-action="eq-instance-action"><input type="hidden" name="tool_instance_id" value="${item.id}" />
      <label>Название экземпляра<input name="label" maxlength="80" required value="${esc(item.label)}" /></label>
      <div class="eq-instance-summary">${gauge(resourceRemaining(item) / number(item.resource_limit) * 100, 'Остаток ресурса')}<div><span>Осталось</span><strong>${qty(resourceRemaining(item))} ${unit(item.resource_mode)}</strong><small>С ${date(item.started_on)}</small></div></div>
      <label>Действие<select name="operation"><option value="rename">Сохранить название</option>${item.status !== 'retired' ? '<option value="extend">Продлить ресурс</option>' : ''}<option value="${item.status === 'active' ? 'pause' : 'resume'}">${item.status === 'active' ? 'Поставить на паузу' : 'Вернуть в работу'}</option></select></label>
      <label data-eq-extension hidden>Добавить к ресурсу<span class="input-with-suffix"><input name="amount" type="number" min="0.01" step="any" placeholder="5" /><span>${unit(item.resource_mode)}</span></span></label>
      <label>Комментарий<textarea name="note" rows="2" placeholder="Например: проверен, можно использовать дальше"></textarea></label>
      <button class="primary-button" type="submit">Сохранить</button></form>`;
  }

  function renderProductTools(product) {
    const chosen = effectiveToolLinks(models(), links(), product.id);
    const missing = chosen.filter((entry) => !entry.model.resource_mode).length;
    return `<section class="eq-product-block"><div class="eq-section-heading"><div><p class="panel-kicker">Для изготовления</p><h3>Инструменты <small>${chosen.length}</small></h3></div>${button('product-tools', `${icon('sliders-horizontal')} Выбрать`, product.id)}</div>
      ${chosen.length ? `<div class="eq-tool-tags">${chosen.map(({ model }) => `<button type="button" class="eq-tool-tag" data-eq-action="${model.resource_mode ? 'detail' : 'model'}" data-id="${model.id}">${icon(model.kind === 'mold' ? 'box' : 'wrench')}<span>${esc(model.name)}</span>${!model.resource_mode ? '<small>настроить</small>' : ''}</button>`).join('')}</div>` : '<p class="eq-note">Добавьте молд и инструменты, которые нужны для этого изделия.</p>'}
      <div class="eq-product-cost"><span>Расчётный износ на 1 изделие</span><strong>${money(estimate(product))}</strong></div>${missing ? '<p class="eq-warning-text">У выбранных инструментов нужно настроить ресурс.</p>' : ''}</section>`;
  }

  function renderProductToolForm(productId) {
    const chosen = new Set(effectiveToolLinks(models(), links(), productId).map(({ model }) => model.id));
    return `<form class="stack-form eq-form" data-action="eq-save-product-tools"><input name="product_id" type="hidden" value="${productId}" />
      <label class="warehouse-search">${icon('search')}<input type="search" data-eq-choice-search placeholder="Найти инструмент" aria-label="Поиск инструмента в списке" /></label>
      <div class="eq-choice-list">${models().map((model) => `<label class="eq-tool-choice" data-eq-choice-name="${esc(model.name.toLocaleLowerCase('ru-RU'))}"><input type="checkbox" name="tool_ids" value="${model.id}" ${chosen.has(model.id) ? 'checked' : ''} /><span class="eq-icon">${icon(model.kind === 'mold' ? 'box' : 'wrench')}</span><span><strong>${esc(model.name)}</strong><small>${model.resource_mode ? RESOURCE_MODES[model.resource_mode].label : 'Сначала настройте ресурс'}${model.is_common ? ' · общий набор' : ''}</small></span></label>`).join('') || '<p>Добавьте инструменты на склад.</p>'}</div>
      <button type="submit" class="primary-button">Применить к изделию</button></form>`;
  }

  function estimate(product) { return estimatedToolCost(models(), links(), product); }
  function plan(product, quantity, preferences = {}, selectedIds = null) { return planToolUsage({ models: models(), instances: instances(), links: links(), product, quantity, preferences, selectedIds }); }

  function productionResult() {
    const p = ui.production;
    const product = state.products.find((item) => item.id === p.productId);
    const tools = plan(product, p.quantity, p.preferences, p.selectedIds);
    const material = ctx.calculateBatch(product.id, p.quantity, 0);
    const labor = number(product.work_hours) * 200 * p.quantity;
    const total = round(material.items.reduce((sum, item) => sum + item.cost, 0) + labor + tools.cost, 2);
    const valid = Number.isInteger(p.quantity) && p.quantity > 0;
    const ready = valid && material.canProduce && tools.ready;
    return { product, tools, material, labor, total, ready };
  }

  function renderProductionResult() {
    const { product, tools, material, labor, total, ready } = productionResult();
    const stockIssues = material.items.filter((item) => !item.enough);
    return `<div class="eq-production-checks">
      ${stockIssues.map((row) => `<p class="eq-warning-text">${esc(row.name)}: не хватает ${qty(Math.max(0, row.required - row.stock))} ${esc(row.unit)}</p>`).join('')}
      ${!material.items.length ? '<p class="eq-warning-text">Добавьте состав в карту изделия.</p>' : ''}
      ${tools.groups.map((group) => `<div class="eq-allocation"><div><strong>${esc(group.model.name)}</strong><small>${!group.configured ? 'Настройте ресурс на складе' : group.missingTime ? 'Укажите время работы в карте изделия' : group.shortage > 0 ? `Не хватает ресурса: ${qty(group.shortage)} ${unit(group.model.resource_mode)}` : group.allocations.map((row) => `${esc(row.instance.label)}: ${qty(row.amount)} ${unit(group.model.resource_mode)}`).join(' · ')}</small></div><b>${money(group.allocations.reduce((sum, row) => sum + row.cost, 0))}</b></div>`).join('')}
      <div class="eq-cost-breakdown"><span>Материалы <b>${money(material.items.reduce((sum, row) => sum + row.cost, 0))}</b></span><span>Работа <b>${money(labor)}</b></span><span>Инструменты <b>${money(tools.cost)}</b></span></div>
      <div class="eq-production-total"><div><span>Себестоимость изготовления</span><strong>${money(total)}</strong></div><span>${ui.production.quantity > 0 ? `${money(total / ui.production.quantity)} / шт` : ''}</span></div>
      <p class="eq-note">${ready ? `${qty(ui.production.quantity)} шт «${esc(product.name)}» поступят на склад после подтверждения.` : 'Проверьте количество, наличие материалов и ресурс инструментов.'}</p></div>`;
  }

  function renderProduction() {
    const p = ui.production;
    const product = state.products.find((row) => row.id === p.productId);
    if (!product) return '';
    return `<div class="eq-steps"><span class="is-active">1 <b>Количество</b></span><i></i><span class="${p.step === 2 ? 'is-active' : ''}">2 <b>Проверка</b></span></div>
      <form class="stack-form eq-form" data-action="eq-produce"><input type="hidden" name="product_id" value="${product.id}" />
      <div ${p.step !== 1 ? 'hidden' : ''}><label>Сколько изделий сделали<span class="input-with-suffix"><input name="production_quantity" type="number" min="1" max="100000" step="1" required value="${p.quantity}" /><span>шт</span></span></label><label>Комментарий<textarea name="production_notes" rows="2" placeholder="Например: для осенней коллекции">${esc(p.notes)}</textarea></label></div>
      <div ${p.step !== 2 ? 'hidden' : ''}>
        <div class="eq-production-title"><strong>${esc(product.name)}</strong><b>${qty(p.quantity)} шт</b></div>
        <section class="eq-production-tools"><div class="eq-section-heading"><h3>Что использовали</h3><span class="eq-badge" data-eq-selected-count>${p.selectedIds.length} выбрано</span></div>
          <p class="eq-note">Отметьте только нужные инструменты. Карта изделия не изменится.</p>
          <div class="eq-production-choices">${models().map((model) => `<div class="eq-production-choice" data-eq-production-choice="${model.id}">
            <label class="eq-tool-choice"><input type="checkbox" name="production_tool_${model.id}" data-eq-production-tool="${model.id}" ${p.selectedIds.includes(model.id) ? 'checked' : ''} /><span class="eq-icon">${icon(model.kind === 'mold' ? 'box' : 'wrench')}</span><span><strong>${esc(model.name)}</strong><small>${TOOL_KINDS[model.kind]}</small></span></label>
            <label class="eq-preference" ${!p.selectedIds.includes(model.id) ? 'hidden' : ''}>Какой использовать первым<select name="production_instance_${model.id}" data-eq-preference="${model.id}"><option value="">Автоматически: сначала начатые</option>${modelInstances(model.id).filter((row) => row.status === 'active' && resourceRemaining(row) > 0).map((row) => `<option value="${row.id}" ${p.preferences[model.id] === row.id ? 'selected' : ''}>${esc(row.label)} · осталось ${qty(resourceRemaining(row))} ${unit(row.resource_mode)}</option>`).join('')}</select></label>
          </div>`).join('') || '<p class="eq-note">На складе пока нет инструментов. Можно изготовить без них.</p>'}</div>
        </section><div data-eq-production-result aria-live="polite">${renderProductionResult()}</div>
      </div>
      ${p.step === 1 ? '<div class="eq-notice">На следующем шаге выберите использованные инструменты и проверьте себестоимость.</div>' : ''}
      <div class="eq-dialog-footer">${p.step === 2 ? button('production-back', 'Назад') : ''}${p.step === 1 ? button('production-next', 'Проверить изготовление ' + icon('arrow-right'), '', true) : `<button class="primary-button" type="submit" data-eq-confirm ${!productionResult().ready ? 'disabled' : ''}>${icon('check')} Подтвердить изготовление</button>`}</div></form>`;
  }

  function renderDialog() {
    if (!ui.dialog) return '';
    const { type, id } = ui.dialog;
    const model = modelById(id);
    const item = instances().find((row) => row.id === id);
    let title = '', subtitle = '', content = '';
    if (type === 'model') { title = model?.resource_mode ? 'Настройки инструмента' : model ? 'Настроим ресурс' : 'Новый инструмент'; subtitle = 'Склад мастерской'; content = renderModelForm(id); }
    if (type === 'detail' && model) { title = model.name; subtitle = 'Инструмент'; content = renderDetail(model); }
    if (type === 'add-instances' && model) { title = 'Новые экземпляры'; subtitle = model.name; content = `<form class="stack-form eq-form" data-action="eq-add-instances"><input name="tool_model_id" type="hidden" value="${id}" />${fields(model, true)}<button class="primary-button" type="submit">Добавить на склад</button></form>`; }
    if (['instance', 'retire'].includes(type) && item) { title = type === 'retire' ? 'Списать экземпляр?' : item.label; subtitle = modelById(item.model_id)?.name; content = renderInstanceForm(item, type === 'retire'); }
    if (type === 'product-tools') { title = 'Инструменты для изделия'; subtitle = state.products.find((row) => row.id === id)?.name; content = renderProductToolForm(id); }
    if (type === 'production') { title = ui.production?.step === 2 ? 'Всё готово к изготовлению?' : 'Изготовить изделие'; subtitle = 'Производство'; content = renderProduction(); }
    if (type === 'delete-model' && model || type === 'delete-instance' && item) {
      title = type === 'delete-model' ? 'Удалить инструмент?' : 'Удалить этот экземпляр?';
      subtitle = model?.name || item.label;
      content = `<form class="stack-form eq-form" data-action="eq-delete"><input type="hidden" name="${type === 'delete-model' ? 'tool_model_id' : 'tool_instance_id'}" value="${id}" />
        <p class="eq-notice">${type === 'delete-model' ? 'Инструмент и все его экземпляры исчезнут со склада и из выбора для изготовления.' : 'Со склада исчезнет только этот экземпляр. Остальные останутся.'} История изготовлений и их стоимость сохранятся. Дополнительного расхода не будет.</p>
        <div class="eq-dialog-footer">${button(type === 'delete-model' ? (model.resource_mode ? 'detail' : 'model') : 'detail', 'Отмена', model?.id || item.model_id)}<button type="submit" class="danger-button">${icon('trash-2')} Удалить</button></div></form>`;
    }
    return `<section class="material-editor-layer eq-layer" role="dialog" aria-modal="true" aria-labelledby="eq-dialog-title"><button class="registration-scrim" data-eq-action="close" type="button" aria-label="Закрыть окно"></button><div class="material-editor-sheet eq-sheet"><div class="sheet-head"><div><p class="panel-kicker">${esc(subtitle || '')}</p><h2 id="eq-dialog-title">${esc(title)}</h2></div><button class="icon-button" type="button" data-eq-action="close" aria-label="Закрыть">${icon('x')}</button></div>${content}</div></section>`;
  }

  function preview(form) {
    if (!form?.classList.contains('eq-form')) return;
    restoreDraftRows(form);
    const mode = form.elements.resource_mode?.value || 'items';
    form.querySelectorAll('[data-eq-resource-unit]').forEach((node) => { node.textContent = unit(mode); });
    const resourceLabel = form.querySelector('[data-eq-resource-label]');
    if (resourceLabel) resourceLabel.textContent = { items: 'На сколько изделий хватит', cycles: 'На сколько заливок хватит', hours: 'Ресурс в часах работы', days: 'Срок службы в днях' }[mode];
    for (const name of ['resource_limit', 'used_resource']) {
      const field = form.elements[name];
      if (field) { field.step = mode === 'hours' ? 'any' : '1'; field.min = name === 'used_resource' ? '0' : mode === 'hours' ? '0.01' : '1'; }
    }
    const cycle = form.querySelector('[data-eq-cycle-field]'); if (cycle) cycle.hidden = mode !== 'cycles';
    const days = form.querySelector('[data-eq-days-field]'); if (days) days.hidden = mode !== 'days';
    form.querySelectorAll('[data-eq-used-field]').forEach((node) => { node.hidden = mode === 'days'; });
    const common = form.querySelector('[data-eq-common]');
    if (common) { common.hidden = form.elements.kind.value === 'mold'; form.elements.is_common.disabled = common.hidden; }
    const extension = form.querySelector('[data-eq-extension]'); if (extension) { extension.hidden = form.elements.operation.value !== 'extend'; form.elements.amount.required = !extension.hidden; }
    const limit = number(form.elements.resource_limit?.value);
    const cost = number(form.elements.purchase_cost?.value);
    const model = modelById(form.elements.tool_model_id?.value);
    form.querySelectorAll('[data-eq-new-instance]').forEach((row) => {
      const index = Number(row.dataset.eqNewInstance);
      form.elements[`instance_label_${index}`].placeholder = instanceDefaultName(index, model, form.elements.name?.value || model?.name);
      const usedField = form.elements[`instance_used_${index}`];
      usedField.step = mode === 'hours' ? 'any' : '1'; usedField.max = limit || ''; usedField.disabled = mode === 'days';
      const start = form.elements[`instance_started_${index}`].value;
      const left = resourceRemaining({ resource_mode: mode, resource_limit: limit, used_resource: number(usedField.value), started_on: start });
      row.querySelector('[data-eq-instance-remaining]').textContent = limit > 0 ? `Останется ${qty(left)} из ${qty(limit)} ${unit(mode)}` : 'Укажите ресурс инструмента выше';
    });
    const output = number(form.elements.output_per_cycle?.value) || 1;
    const rate = limit > 0 ? cost / limit / (mode === 'cycles' ? output : mode === 'days' ? number(form.elements.hours_per_day?.value) || 8 : 1) : 0;
    const priceLabel = form.querySelector('[data-eq-price-label]');
    if (priceLabel) priceLabel.textContent = ['hours', 'days'].includes(mode) ? 'В себестоимость часа работы' : 'В себестоимость одного изделия';
    const price = form.querySelector('[data-eq-price]'); if (price) price.textContent = money(rate);
  }

  function afterRender() {
    document.querySelectorAll('.eq-form').forEach(preview);
    if (ui.dialog?.type === 'production' && ui.production) {
      const form = document.querySelector('[data-action="eq-produce"]');
      ui.production.quantity = number(form?.elements.production_quantity.value);
      ui.production.notes = form?.elements.production_notes.value || '';
      syncProduction(form);
    }
    const key = ui.dialog ? `${ui.dialog.type}:${ui.dialog.id}:${ui.production?.step}` : '';
    if (key !== focusedDialog && ui.dialog) {
      document.querySelector('.eq-sheet input:not([type="hidden"]), .eq-sheet button')?.focus({ preventScroll: true });
    }
    focusedDialog = key;
    document.body.classList.toggle('eq-dialog-open', !!ui.dialog);
  }

  function updateResults() {
    const target = document.querySelector('[data-eq-results]');
    if (target) { target.innerHTML = renderCards(); ctx.icons(); }
  }

  function syncProduction(form) {
    if (!form || !ui.production) return;
    ui.production.selectedIds = [...form.querySelectorAll('[data-eq-production-tool]:checked')].map((field) => field.dataset.eqProductionTool);
    form.querySelectorAll('[data-eq-preference]').forEach((field) => { ui.production.preferences[field.dataset.eqPreference] = field.value; });
    form.querySelectorAll('[data-eq-production-choice]').forEach((row) => { row.querySelector('.eq-preference').hidden = !ui.production.selectedIds.includes(row.dataset.eqProductionChoice); });
    form.querySelector('[data-eq-selected-count]').textContent = `${ui.production.selectedIds.length} выбрано`;
    form.querySelector('[data-eq-production-result]').innerHTML = renderProductionResult();
    const confirm = form.querySelector('[data-eq-confirm]'); if (confirm) confirm.disabled = !productionResult().ready;
  }

  function input(target) {
    if (target.matches('[data-eq-search]')) { ui.query = target.value; updateResults(); return true; }
    if (target.matches('[data-eq-choice-search]')) {
      target.closest('form').querySelectorAll('[data-eq-choice-name]').forEach((node) => { node.hidden = !node.dataset.eqChoiceName.includes(target.value.toLocaleLowerCase('ru-RU')); }); return true;
    }
    if (!target.closest('.eq-form')) return false;
    if (ui.production && target.name === 'production_quantity') ui.production.quantity = number(target.value);
    if (ui.production && target.name === 'production_notes') ui.production.notes = target.value;
    if ((target.dataset.eqPreference || target.dataset.eqProductionTool) && ui.production) syncProduction(target.closest('form'));
    preview(target.closest('form'));
    return false;
  }

  async function click(target) {
    const node = target.closest('[data-eq-action]');
    if (!node) return false;
    const action = node.dataset.eqAction, id = node.dataset.id;
    if (action === 'close') { ui.dialog = null; ctx.render(); }
    if (['model', 'detail', 'instance', 'retire', 'add-instances', 'product-tools', 'delete-model', 'delete-instance'].includes(action)) open(action, id);
    if (action === 'filter' || action === 'reset-filter') {
      ui.filter = action === 'filter' ? id : ''; if (action === 'reset-filter') ui.query = '';
      ctx.render();
    }
    if (action === 'produce') {
      openProduction(id);
    }
    if (action === 'production-next') {
      if (!node.closest('form').reportValidity()) return true;
      ui.production.step = 2; ctx.render();
    }
    if (action === 'production-back') { ui.production.step = 1; ctx.render(); }
    return true;
  }

  async function rpc(name, params) {
    const { data, error } = await ctx.supabase.rpc(name, params);
    if (error) throw error;
    return data;
  }

  async function submit(form) {
    const action = form.dataset.action;
    if (!action.startsWith('eq-')) return false;
    const data = new FormData(form);
    const id = data.get('tool_model_id') || null;
    if (action === 'eq-save-model') {
      const existing = modelById(id);
      const payload = Object.fromEntries(data);
      payload.resource_mode = data.get('resource_mode') || existing?.resource_mode;
      payload.is_common = payload.kind !== 'mold' && data.has('is_common');
      payload.instances = instanceRows(form);
      const savedId = await rpc('save_tool_model', { p_model_id: id, p_data: payload, p_count: existing?.resource_mode ? 0 : number(data.get('count')) });
      ui.dialog = { type: 'detail', id: savedId };
    }
    if (action === 'eq-add-instances') {
      await rpc('add_tool_instance_rows', { p_model_id: id, p_instances: instanceRows(form) });
      ui.dialog = { type: 'detail', id };
    }
    if (action === 'eq-delete') {
      const item = instances().find((row) => row.id === data.get('tool_instance_id'));
      await rpc('delete_tool', { p_model_id: id, p_instance_id: item?.id || null });
      ui.dialog = item ? { type: 'detail', id: item.model_id } : null;
    }
    if (action === 'eq-instance-action') {
      const item = instances().find((row) => row.id === data.get('tool_instance_id'));
      await rpc('change_tool_instance', { p_instance_id: item.id, p_action: data.get('operation'), p_amount: number(data.get('amount')), p_label: data.get('label') || item.label, p_note: data.get('note') || '' });
      ui.dialog = { type: 'detail', id: item.model_id };
    }
    if (action === 'eq-save-product-tools') {
      const selected = new Set(data.getAll('tool_ids'));
      await rpc('save_product_tools', { p_product_id: data.get('product_id'), p_tools: models().map((model) => ({ model_id: model.id, enabled: selected.has(model.id) })) });
      ui.dialog = null;
    }
    if (action === 'eq-produce') {
      if (ui.production?.step !== 2) { ui.production.step = 2; ctx.render(); return false; }
      const result = productionResult();
      if (!result.ready) throw new Error('Проверьте материалы и ресурс инструментов');
      await rpc('produce_selected_tools', { p_product_id: result.product.id, p_quantity: ui.production.quantity, p_selected_tools: ui.production.selectedIds,
        p_tools: result.tools.allocations.map(({ instance_id, model_id, amount }) => ({ instance_id, model_id, amount })),
        p_notes: ui.production.notes || null, p_request_id: ui.production.requestId });
      ui.dialog = null; ui.production = null;
    }
    await ctx.loadWorkspace();
    ctx.showToast(action === 'eq-produce' ? 'Изготовление сохранено. Изделия на складе' : action === 'eq-delete' ? 'Удалено из текущего учёта. История сохранена' : 'Сохранено');
    return true;
  }

  function keydown(event) {
    if (!ui.dialog) return false;
    if (event.key === 'Escape') { ui.dialog = null; ctx.render(); return true; }
    if (event.key === 'Tab') {
      const nodes = [...document.querySelectorAll('.eq-sheet button:not([disabled]), .eq-sheet input:not([disabled]):not([type="hidden"]), .eq-sheet textarea, .eq-sheet summary')].filter((node) => node.getClientRects().length);
      const first = nodes[0], last = nodes.at(-1);
      if ((event.shiftKey && document.activeElement === first) || (!event.shiftKey && document.activeElement === last)) { event.preventDefault(); (event.shiftKey ? last : first)?.focus(); }
    }
    return false;
  }

  return { renderWarehouse, renderDialog, renderProductTools, estimate, plan, click, input, submit, keydown, afterRender, openProduction, restoreDraftRows,
    reset() { ui.dialog = null; ui.production = null; ui.query = ''; ui.filter = ''; },
    productionButton(productId) { return button('produce', icon('hammer') + ' Изготовить', productId, true); },
  };
}
