import { estimatedToolCost, requiredResource } from './equipment-math.js?v=instance-control-1';

const number = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 });
const fractionalMoney = new Intl.NumberFormat('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const rub = value => `${(Number.isInteger(value) ? number : fractionalMoney).format(value)} ₽`;
const roundMoney = value => Math.round((value + Number.EPSILON) * 100) / 100;
export const PRICE_DEMO_DEFAULTS = { minutes: 60, markup: 80, packaging: true };
const laborRate = 200;
const materials = [
  { name: 'Прозрачная смола', quantity: 140, unit: 'г', rate: 2.5 },
  { name: 'Пигмент', quantity: 2, unit: 'мл', rate: 30 },
  { name: 'Декоративная поталь', quantity: 1, unit: 'г', rate: 15 },
];
const packaging = { name: 'Коробка', quantity: 1, unit: 'шт', rate: 60 };
const tools = [
  { id: 'demo-mold', name: 'Молд', resource_mode: 'cycles', default_cost: 250, default_resource: 10, output_per_cycle: 1 },
  { id: 'demo-scales', name: 'Весы', resource_mode: 'hours', default_cost: 2400, default_resource: 200 },
];
const links = tools.map(tool => ({ product_id: 'demo', model_id: tool.id, enabled: true, quantity_per_item: 1 }));
const bounded = (value, fallback, min, max) => Number.isFinite(Number(value)) ? Math.min(max, Math.max(min, Number(value))) : fallback;

export function calculateDemoPrice(options = {}) {
  const minutes = bounded(options.minutes ?? PRICE_DEMO_DEFAULTS.minutes, PRICE_DEMO_DEFAULTS.minutes, 15, 240);
  const markup = bounded(options.markup ?? PRICE_DEMO_DEFAULTS.markup, PRICE_DEMO_DEFAULTS.markup, 0, 250);
  const withPackaging = options.packaging ?? PRICE_DEMO_DEFAULTS.packaging;
  const hours = minutes / 60;
  const product = { id: 'demo', work_hours: hours };
  const materialRows = materials.map(item => ({ ...item, cost: roundMoney(item.quantity * item.rate), calculation: `${number.format(item.quantity)} ${item.unit} × ${rub(item.rate)} / ${item.unit}` }));
  // Use the same planning calculation as product cards, not a separate wear formula.
  const toolRows = tools.map(tool => ({ name: tool.name, cost: roundMoney(estimatedToolCost([tool], links, product)), calculation: `${rub(tool.default_cost)} ÷ ${number.format(tool.default_resource)} ${tool.resource_mode === 'cycles' ? 'заливок' : 'ч'} × ${number.format(requiredResource(tool, product, 1))} ${tool.resource_mode === 'cycles' ? 'заливка' : 'ч'}` }));
  const rows = [...materialRows, { name: 'Работа', cost: roundMoney(hours * laborRate), calculation: `${number.format(hours)} ч × ${rub(laborRate)} / ч` }, ...toolRows];
  if (withPackaging) rows.push({ name: packaging.name, cost: packaging.rate, calculation: `1 шт × ${rub(packaging.rate)} / шт` });
  const parts = {
    materials: roundMoney(materialRows.reduce((sum, row) => sum + row.cost, 0)),
    labor: roundMoney(hours * laborRate),
    tools: roundMoney(toolRows.reduce((sum, row) => sum + row.cost, 0)),
    packaging: withPackaging ? packaging.rate : 0,
  };
  const cost = roundMoney(Object.values(parts).reduce((sum, value) => sum + value, 0));
  const extra = roundMoney(cost * markup / 100);
  return { ...parts, minutes, markup, cost, extra, price: roundMoney(cost + extra), rows };
}

const detailRows = values => values.rows.map(row => `<div class="lp-cost-detail-row"><span><b>${row.name}</b><small>${row.calculation}</small></span><strong>${rub(row.cost)}</strong></div>`).join('');
const factors = [
  ['Состав', 'Смола, красители, декор и фурнитура.'],
  ['Расход и закупка', 'Количество × цена в своей единице учёта.'],
  ['Комплектация', 'Расходники и упаковка, добавленные в состав.'],
  ['Работа', 'Время изготовления и стоимость труда.'],
  ['Ресурс инструментов', 'Цена молдов и оборудования, заливки, часы работы, срок службы.'],
  ['Наценка', 'Отдельно от затрат, поверх себестоимости.'],
];
const parts = [['materials', 'Материалы'], ['labor', 'Работа'], ['tools', 'Инструменты'], ['packaging', 'Упаковка']];

export function renderPricingDemo(symbol) {
  const values = calculateDemoPrice();
  return `<section class="lp-pricing" id="price-demo" aria-labelledby="lp-price-title"><div class="lp-container lp-pricing-grid">
    <div class="lp-pricing-copy" data-reveal><p class="lp-overline">За ценой стоят детали</p><h2 id="lp-price-title">Красиво.<br>А сколько<br><span>стоит?</span></h2><p>Не только смола и наценка. «Формула» собирает себестоимость из состава, работы и ресурса инструментов. У каждой суммы есть основание.</p>
      <dl class="lp-cost-factors">${factors.map(([name, description]) => `<div><dt>${name}</dt><dd>${description}</dd></div>`).join('')}</dl>
      <p class="lp-cost-context">Карта изделия: плановый расчёт. Изготовление: расход материалов и износ выбранных экземпляров инструментов.</p>
    </div>
    <div class="lp-calculator" data-reveal data-price-demo>
      <div class="lp-calc-top"><div><small>Сжатый пример · 1 изделие</small><h3>Изделие из смолы</h3></div><span>${symbol}</span></div>
      <p class="lp-calc-intro">Состав уже задан. Измените пару параметров и посмотрите, как меняется цена.</p>
      <div class="lp-price-controls">
        <div><label class="lp-slider-label" for="lp-minutes"><span>Время изготовления</span><output data-minutes-value for="lp-minutes">60 мин</output></label><input id="lp-minutes" class="lp-range" type="range" min="15" max="240" value="60" step="15" aria-valuetext="60 минут"/></div>
        <div><label class="lp-slider-label" for="lp-markup"><span>Наценка к себестоимости</span><output data-markup-value for="lp-markup">80%</output></label><input id="lp-markup" class="lp-range" type="range" min="0" max="250" value="80" step="5" aria-valuetext="80 процентов к себестоимости"/></div>
      </div>
      <label class="lp-packaging-choice"><input type="checkbox" id="lp-packaging" checked/><span>Упаковка в составе</span><b>60 ₽</b></label>
      <div class="lp-price-parts">${parts.map(([key, label]) => `<div><span><i class="lp-cost-dot lp-cost-${key}" aria-hidden="true"></i>${label}</span><strong data-demo-${key}>${rub(values[key])}</strong></div>`).join('')}</div>
      <div class="lp-calc-subtotal"><span>Себестоимость</span><strong data-demo-cost>${rub(values.cost)}</strong></div>
      <details class="lp-cost-details"><summary>Из чего сложилась сумма <span data-cost-count>7 статей</span><span class="lp-details-chevron" aria-hidden="true"></span></summary><div data-cost-details>${detailRows(values)}</div><p>Ставка работы в текущей версии: 200 ₽/ч. В примере износ рассчитывается для одного молда и весов; их стоимость распределена по ресурсу.</p></details>
      <div class="lp-calc-result" aria-live="polite" aria-atomic="true"><div><span>Цена в этом примере</span><strong data-demo-price>${rub(values.price)}</strong></div><div class="lp-price-result-note"><span>Себестоимость + наценка</span><span><b data-result-cost>${rub(values.cost)}</b> + <b data-demo-extra>${rub(values.extra)}</b></span></div><div class="lp-cost-bar" aria-hidden="true">${[...parts.map(([key]) => key), 'extra'].map(key => `<i class="lp-cost-${key}" data-cost-bar="${key}" style="flex-grow:${values[key] / values.price}"></i>`).join('')}</div></div>
      <div class="lp-price-footer"><span data-price-feedback role="status">Демонстрационные данные</span><button type="button" data-price-reset>Сбросить пример</button></div>
      <p class="lp-calc-note">Наценка не равна чистой прибыли. Комиссии, налоги и доставка в этот пример не включены. В кабинете расчёт строится на вашем составе и выбранных инструментах.</p>
    </div>
  </div></section>`;
}

export function mountPricingDemo(root, signal) {
  const minutes = root.querySelector('#lp-minutes');
  const markup = root.querySelector('#lp-markup');
  const packaging = root.querySelector('#lp-packaging');
  function updatePrice() {
    const values = calculateDemoPrice({ minutes: minutes.value, markup: markup.value, packaging: packaging.checked });
    root.querySelector('[data-minutes-value]').textContent = `${number.format(values.minutes)} мин`;
    root.querySelector('[data-markup-value]').textContent = `${number.format(values.markup)}%`;
    minutes.setAttribute('aria-valuetext', `${number.format(values.minutes)} минут`);
    markup.setAttribute('aria-valuetext', `${number.format(values.markup)} процентов к себестоимости`);
    for (const key of [...parts.map(([key]) => key), 'cost', 'extra', 'price']) root.querySelector(`[data-demo-${key}]`).textContent = rub(values[key]);
    root.querySelector('[data-result-cost]').textContent = rub(values.cost);
    root.querySelector('[data-cost-details]').innerHTML = detailRows(values);
    root.querySelector('[data-cost-count]').textContent = `${values.rows.length} статей`;
    root.querySelectorAll('[data-cost-bar]').forEach(bar => { bar.style.flexGrow = values[bar.dataset.costBar] / values.price; });
    [minutes, markup].forEach(input => input.style.setProperty('--range-progress', `${(input.value - input.min) / (input.max - input.min) * 100}%`));
    root.querySelector('[data-price-feedback]').textContent = 'Пример пересчитан';
  }
  [minutes, markup, packaging].forEach(input => input.addEventListener('input', updatePrice, { signal }));
  root.querySelector('[data-price-reset]').addEventListener('click', () => {
    minutes.value = PRICE_DEMO_DEFAULTS.minutes;
    markup.value = PRICE_DEMO_DEFAULTS.markup;
    packaging.checked = PRICE_DEMO_DEFAULTS.packaging;
    updatePrice();
    root.querySelector('[data-price-feedback]').textContent = 'Исходный пример восстановлен';
  }, { signal });
  updatePrice();
  root.querySelector('[data-price-feedback]').textContent = 'Демонстрационные данные';
}
