import { renderScreenGallery, renderScreenDialog, mountScreenGalleries } from './landing-screens.js?v=screens-1';

const money = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 });
const qty = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 });
const rub = (value) => `${money.format(value)} ₽`;

export function calculateDemoPrice(hours = 1, markup = 120) {
  const labor = Math.round(Math.max(0, Number(hours) || 0) * 200);
  const cost = 425 + 25 + labor;
  const extra = Math.round(cost * Math.max(0, Number(markup) || 0) / 100);
  return { materials: 425, tools: 25, labor, cost, extra, price: cost + extra };
}

function icon(name) {
  const paths = {
    arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
    down: '<path d="M12 4v16M6 14l6 6 6-6"/>',
    check: '<path d="m5 12 4 4 10-10"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    recipe: '<path d="M8 3v13a4 4 0 0 0 8 0V3M6 3h12M8 10h8"/>',
    box: '<path d="m12 3 9 5-9 5-9-5 9-5ZM3 8v9l9 5 9-5V8M12 13v9M7 5.8l9 5"/>',
    chart: '<path d="M4 4v16h16M8 15l4-5 4 2 4-7"/>',
    spark: '<path d="m12 3 2.4 6.6L21 12l-6.6 2.4L12 21l-2.4-6.6L3 12l6.6-2.4L12 3Z"/>',
  };
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.arrow}</svg>`;
}

const demos = [
  { id: 'recipe', name: 'Смола', icon: 'recipe', caption: '01 / От идеи к составу', title: 'Одна удачная формула.\nМного красивых вещей.', text: 'Сохраните объём заливки и состав. Применяйте расчёт к новым изделиям, меняйте цвет и добавляйте детали, не начиная каждый раз с нуля.' },
  { id: 'product', name: 'Изделия', icon: 'spark', caption: '02 / От состава к цене', title: 'Знайте цену\nсвоей работы.', text: 'Материалы, время и износ инструментов складываются в себестоимость. Вы выбираете наценку, а не угадываете итоговую цену.' },
  { id: 'stock', name: 'Склад', icon: 'box', caption: '03 / От изготовления к порядку', title: 'Всё на своём месте.\nДаже мелочи.', text: 'Смола, пигменты, фурнитура, готовые изделия и инструменты. Видно, что осталось, чего не хватает и какой ресурс ещё есть у молда.' },
  { id: 'business', name: 'Бизнес', icon: 'chart', caption: '04 / От мастерской к клиенту', title: 'Отправлено\nне значит продано.', text: 'Продажи отдельно, логистика отдельно. Учитывайте отправки и возвраты, не смешивая движение изделий с полученной выручкой.' },
];

export function renderLanding() {
  return `<div class="landing" data-landing>
    <a class="lp-skip" href="#landing-main">Перейти к содержимому</a>
    <header class="lp-header lp-container">
      <a class="lp-brand" href="#top" aria-label="Формула, на главную"><img src="./assets/logo-dark.svg" width="42" height="42" alt=""/><span>Формула<span class="lp-brand-dot">.</span></span></a>
      <nav class="lp-nav" aria-label="О продукте"><a href="#possibilities">Возможности</a><a href="#price-demo">Ваша цена</a><a href="#workflow">Как это работает</a></nav>
      <a class="lp-button lp-button-small lp-button-outline" href="#login">Войти ${icon('arrow')}</a>
    </header>
    <main id="landing-main">
      <section class="lp-hero lp-container" id="top" aria-labelledby="lp-title">
        <div class="lp-hero-copy">
          <p class="lp-overline lp-enter"><span class="lp-live-dot"></span> Пространство для вашего дела</p>
          <h1 id="lp-title" class="lp-enter">Вы создаёте.<br><span>Формула</span><br>считает.</h1>
          <p class="lp-hero-description lp-enter">От первой капли смолы до готового изделия.<br>Состав, себестоимость, склад и продажи<br class="lp-desktop-break"> в одной красивой системе.</p>
          <div class="lp-hero-actions lp-enter"><a class="lp-button" href="#login">Войти в Формулу ${icon('arrow')}</a><a class="lp-text-link" href="#possibilities">Посмотреть внутри ${icon('down')}</a></div>
          <p class="lp-availability lp-enter">Для мастеров, которые превращают творчество в дело.</p>
        </div>
        <div class="lp-hero-art lp-enter" data-hero-art>
          <div class="lp-art-grid" aria-hidden="true"></div><div class="lp-orbit lp-orbit-one" aria-hidden="true"></div><div class="lp-orbit lp-orbit-two" aria-hidden="true"></div>
          <span class="lp-art-index" aria-hidden="true">F / 001<br>ОТ ИДЕИ К ЦЕННОСТИ</span>
          <div class="lp-sculpture" data-sculpture aria-hidden="true"><div class="lp-sculpture-fallback"><i></i><i></i><i></i></div><canvas data-landing-canvas></canvas></div>
          <div class="lp-float-card lp-float-recipe"><span class="lp-mini-icon">${icon('recipe')}</span><div><small>Состав сохранён</small><strong>Ваша идеальная заливка</strong></div><span class="lp-tiny-check">${icon('check')}</span></div>
          <div class="lp-float-card lp-float-price"><span class="lp-overline">Цена без догадок</span><strong>1 430 <span>₽</span></strong><div class="lp-price-bars" aria-hidden="true"><i></i><i></i><i></i></div><small>Материалы + работа + износ + наценка</small></div>
          <div class="lp-art-bottom"><button class="lp-assembly-toggle" type="button" data-assembly-toggle aria-pressed="false">${icon('box')}<span>Собрать форму</span></button><button class="lp-motion-toggle" type="button" data-motion-toggle aria-pressed="false" aria-label="Остановить анимации"><span data-motion-symbol aria-hidden="true">Ⅱ</span><span data-motion-label>Анимации</span></button></div>
        </div>
        <div class="lp-hero-foot"><span>Меньше рутины. Больше мастерства.</span><a href="#possibilities" aria-label="Посмотреть возможности">${icon('down')}</a><span>СДЕЛАНО ДЛЯ ТЕХ, КТО СОЗДАЁТ</span></div>
      </section>

      <section class="lp-manifesto lp-container" data-reveal aria-label="Для вашей мастерской">
        <p class="lp-overline">Пусть всё сложится</p><h2>Вдохновение не живёт<br>в таблицах.<span> А порядок может.</span></h2>
        <div class="lp-manifesto-bottom"><p>Выбирайте оттенок, а не формулу в ячейке.<br>«Формула» связывает повседневные задачи мастерской,<br class="lp-desktop-break"> чтобы вы могли сосредоточиться на самом интересном.</p><div class="lp-formula-sign" aria-label="Состав, работа, наценка, результат"><span>c</span><i>+</i><span>v</span><i>+</i><span>m</span><i>=</i><strong>W</strong></div></div>
      </section>

      <section class="lp-showcase lp-container" id="possibilities" aria-labelledby="lp-features-title">
        <div class="lp-section-head" data-reveal><div><p class="lp-overline">Внутри Формулы</p><h2 id="lp-features-title">Вся мастерская.<br><span>В одном ритме.</span></h2></div><p>Не макеты. Настоящие экраны приложения.<br>Переключайте разделы и рассматривайте детали.</p></div>
        <div class="lp-demo-tabs" role="tablist" aria-label="Разделы приложения" data-reveal>${demos.map((item, i) => `<button type="button" role="tab" id="lp-tab-${item.id}" aria-controls="lp-panel-${item.id}" aria-selected="${i === 0}" tabindex="${i === 0 ? 0 : -1}" data-demo-tab="${item.id}">${icon(item.icon)}<span>${item.name}</span><small>0${i + 1}</small></button>`).join('')}</div>
        <div class="lp-demo-stage" data-reveal>${demos.map((item, i) => `<div class="lp-demo-panel" id="lp-panel-${item.id}" role="tabpanel" aria-labelledby="lp-tab-${item.id}" tabindex="0" ${i ? 'hidden' : ''}>
          <div class="lp-demo-explainer"><div><span class="lp-overline">${item.caption}</span><h3>${item.title.replace('\n', '<br>')}</h3></div><div><p>${item.text}</p><a class="lp-text-link" href="#login">В своё пространство ${icon('arrow')}</a></div></div>
          ${renderScreenGallery(item.id)}
        </div>`).join('')}</div>
      </section>

      <section class="lp-pricing" id="price-demo" aria-labelledby="lp-price-title"><div class="lp-container lp-pricing-grid">
        <div class="lp-pricing-copy" data-reveal><p class="lp-overline">Почувствуйте разницу</p><h2 id="lp-price-title">Красиво.<br>А сколько<br><span>стоит?</span></h2><p>Ваше время тоже имеет цену.<br>Подвигайте ползунки: из чего складывается стоимость, видно сразу.</p><span class="lp-pricing-stamp">НЕ МАГИЯ.<br>ВАША ФОРМУЛА.</span></div>
        <div class="lp-calculator" data-reveal><div class="lp-calc-top"><div><small>Попробуйте на примере</small><h3>Подстаканник «Волна»</h3></div><span>${icon('spark')}</span></div>
          <div class="lp-calc-fixed"><span>Материалы <b>425 ₽</b></span><span>Износ молда <b>25 ₽</b></span></div>
          <label class="lp-slider-label" for="lp-hours"><span>Ваше время <small>200 ₽ / час</small></span><output data-hours-value for="lp-hours">1 ч</output></label><input id="lp-hours" class="lp-range" type="range" min="0.25" max="4" value="1" step="0.25" aria-valuetext="1 час"/>
          <label class="lp-slider-label" for="lp-markup"><span>Ваша наценка</span><output data-markup-value for="lp-markup">120%</output></label><input id="lp-markup" class="lp-range" type="range" min="0" max="250" value="120" step="10" aria-valuetext="120 процентов"/>
          <div class="lp-segments" aria-label="Варианты наценки"><button type="button" data-markup="20" aria-pressed="false">×1,2</button><button type="button" data-markup="120" aria-pressed="true">×2,2</button><button type="button" data-markup="250" aria-pressed="false">×3,5</button></div>
          <div class="lp-calc-breakdown"><span>Себестоимость <b data-demo-cost>650 ₽</b></span><span>В том числе работа <b data-demo-labor>200 ₽</b></span><span>Наценка <b data-demo-extra>780 ₽</b></span></div>
          <div class="lp-calc-result" aria-live="polite" aria-atomic="true"><span>Цена вашего изделия</span><strong data-demo-price>1 430 ₽</strong></div><p class="lp-calc-note">Это пример расчёта, не тариф сервиса. В кабинете используются ваши материалы и данные.</p>
        </div>
      </div></section>

      <section class="lp-workflow lp-container" id="workflow" aria-labelledby="lp-flow-title">
        <div class="lp-section-head" data-reveal><div><p class="lp-overline">От первой идеи до продажи</p><h2 id="lp-flow-title">Не шесть таблиц.<br><span>Одна история.</span></h2></div><p>Данные не нужно собирать заново<br>на каждом следующем шаге.</p></div>
        <div class="lp-flow-line" aria-hidden="true"><span></span></div><ol class="lp-flow-steps">
          <li data-reveal><span class="lp-step-number">01</span><span class="lp-step-icon">${icon('recipe')}</span><h3>Сохраните состав</h3><p>Объём, материалы и пропорции для вашей заливки.</p></li>
          <li data-reveal><span class="lp-step-number">02</span><span class="lp-step-icon">${icon('spark')}</span><h3>Создайте изделие</h3><p>Примените расчёт, добавьте детали, работу и наценку.</p></li>
          <li data-reveal><span class="lp-step-number">03</span><span class="lp-step-icon">${icon('box')}</span><h3>Изготовьте</h3><p>Спишите материалы и учтите готовые изделия на складе.</p></li>
          <li data-reveal><span class="lp-step-number">04</span><span class="lp-step-icon">${icon('chart')}</span><h3>Ведите своё дело</h3><p>Продажи, отправки и возвраты в связанных разделах.</p></li>
        </ol>
        <div class="lp-detail-strip" data-reveal><span>${icon('check')} Повторяйте удачные изделия</span><span>${icon('check')} Учитывайте износ инструментов</span><span>${icon('check')} Выгружайте расчёты в Excel</span></div>
      </section>

      <section class="lp-finale lp-container" aria-labelledby="lp-finale-title" data-reveal><div class="lp-finale-orbits" aria-hidden="true"><i></i><i></i><i></i></div><img src="./assets/logo-dark.svg" width="64" height="64" alt=""/><p class="lp-overline">Больше пространства для творчества</p><h2 id="lp-finale-title">Ваш талант.<br>Ваша <span>Формула.</span></h2><p>Когда всё учтено, можно просто создавать.</p><a class="lp-button" href="#login">Войти в своё пространство ${icon('arrow')}</a><small>Вход для существующих пользователей. Регистрация пока закрыта.</small></section>
    </main>
    <footer class="lp-footer lp-container"><a class="lp-brand" href="#top"><img src="./assets/logo-dark.svg" width="32" height="32" alt=""/><span>Формула.</span></a><p>Состав. Порядок. Ценность.</p><a href="#login">Вход в кабинет ${icon('arrow')}</a></footer>
    ${renderScreenDialog()}
  </div>`;
}

export function mountLanding(root) {
  const abort = new AbortController();
  const { signal } = abort;
  const destroyScreens = mountScreenGalleries(root, signal);
  const media = matchMedia('(prefers-reduced-motion: reduce)');
  let disposed = false, scene = null, paused = media.matches, assembled = false;
  const motion = root.querySelector('[data-motion-toggle]');
  const updateMotion = () => {
    root.classList.toggle('lp-paused', paused);
    motion.setAttribute('aria-pressed', String(paused));
    motion.setAttribute('aria-label', paused ? 'Включить анимации' : 'Остановить анимации');
    motion.disabled = media.matches;
    if (media.matches) motion.setAttribute('aria-label', 'Анимация отключена в настройках устройства');
    motion.querySelector('[data-motion-symbol]').textContent = paused ? '▷' : 'Ⅱ';
    motion.querySelector('[data-motion-label]').textContent = media.matches ? 'Без анимации' : paused ? 'На паузе' : 'Анимации';
    scene?.setPaused(paused || media.matches);
    if (paused) root.querySelectorAll('[data-reveal]').forEach((el) => el.classList.add('is-visible'));
  };
  updateMotion();
  motion.addEventListener('click', () => { paused = !paused; updateMotion(); }, { signal });
  media.addEventListener('change', () => { paused = media.matches; updateMotion(); }, { signal });
  root.querySelector('[data-assembly-toggle]').addEventListener('click', (event) => {
    assembled = !assembled;
    const button = event.currentTarget;
    button.setAttribute('aria-pressed', String(assembled));
    button.querySelector('span').textContent = assembled ? 'Показать слои' : 'Собрать форму';
    root.querySelector('[data-sculpture]').classList.toggle('is-assembled', assembled);
    scene?.setAssembled(assembled);
  }, { signal });

  const observer = new IntersectionObserver((entries) => {
    entries.forEach(({ target, isIntersecting }) => {
      if (isIntersecting) { target.classList.add('is-visible'); observer.unobserve(target); }
    });
  }, { threshold: .08 });
  root.querySelectorAll('[data-reveal]').forEach((el) => observer.observe(el));
  root.classList.add('lp-enhanced');

  const tabs = [...root.querySelectorAll('[data-demo-tab]')];
  function selectTab(tab) {
    tabs.forEach((el) => {
      const selected = el === tab;
      el.setAttribute('aria-selected', String(selected)); el.tabIndex = selected ? 0 : -1;
      root.querySelector(`#${el.getAttribute('aria-controls')}`).hidden = !selected;
    });
  }
  tabs.forEach((tab, index) => {
    tab.addEventListener('click', () => selectTab(tab), { signal });
    tab.addEventListener('keydown', (event) => {
      const next = { ArrowRight: (index + 1) % tabs.length, ArrowLeft: (index - 1 + tabs.length) % tabs.length, Home: 0, End: tabs.length - 1 }[event.key];
      if (next === undefined) return;
      event.preventDefault(); selectTab(tabs[next]); tabs[next].focus();
    }, { signal });
  });

  const hours = root.querySelector('#lp-hours'), markup = root.querySelector('#lp-markup');
  function updatePrice() {
    const values = calculateDemoPrice(hours.value, markup.value);
    root.querySelector('[data-hours-value]').textContent = `${qty.format(hours.value)} ч`;
    root.querySelector('[data-markup-value]').textContent = `${markup.value}%`;
    hours.setAttribute('aria-valuetext', `${qty.format(hours.value)} ч`);
    markup.setAttribute('aria-valuetext', `${markup.value}%`);
    for (const key of ['cost', 'labor', 'extra', 'price']) root.querySelector(`[data-demo-${key}]`).textContent = rub(values[key]);
    [hours, markup].forEach((input) => input.style.setProperty('--range-progress', `${(input.value - input.min) / (input.max - input.min) * 100}%`));
    root.querySelectorAll('[data-markup]').forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.markup === markup.value)));
  }
  [hours, markup].forEach((input) => input.addEventListener('input', updatePrice, { signal }));
  root.querySelectorAll('[data-markup]').forEach((button) => button.addEventListener('click', () => { markup.value = button.dataset.markup; updatePrice(); }, { signal }));
  updatePrice();

  root.querySelectorAll('a[href^="#"]:not([href="#login"])').forEach((link) => {
    link.addEventListener('click', (event) => {
      const target = root.querySelector(link.getAttribute('href'));
      if (!target) return;
      event.preventDefault();
      target.scrollIntoView({ behavior: paused || media.matches ? 'instant' : 'smooth', block: 'start' });
      target.setAttribute('tabindex', '-1'); target.focus({ preventScroll: true });
    }, { signal });
  });

  // The page and its demos stay usable while the optional GPU scene loads.
  import('./landing-scene.js?v=landing-1').then(({ createLandingScene }) => {
    if (disposed) return;
    scene = createLandingScene(root.querySelector('[data-landing-canvas]'), paused || media.matches);
    scene.setAssembled(assembled);
  }).catch(() => { root.querySelector('[data-sculpture]').dataset.renderer = 'fallback'; });
  return { destroy() { disposed = true; destroyScreens(); abort.abort(); observer.disconnect(); scene?.destroy(); } };
}
