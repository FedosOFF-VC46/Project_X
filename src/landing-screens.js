// Captured from the application by tests/capture-landing-screens.mjs.
// Only the data is synthetic; the displayed interface is not recreated.
export const landingScreens = {
  recipe: [
    { id: 'resin-library', label: 'Библиотека', width: 2217, height: 1140, description: 'Сохранённые расчёты: объём, материалы, стоимость и быстрый доступ к редактированию.' },
    { id: 'resin-volume', label: 'Объём и размеры', width: 1320, height: 1688, description: 'Первый шаг расчёта: размеры заливки, 3D-схема и выбор способа расчёта объёма.' },
    { id: 'resin-materials', label: 'Состав заливки', width: 1320, height: 1520, description: 'Второй шаг: материалы со склада, нужное количество и стоимость каждого компонента.' },
  ],
  product: [
    { id: 'product-card', label: 'Карта и цена', width: 2217, height: 927, description: 'Каталог и карта изделия: материалы, работа, износ инструмента, наценка и итоговая цена.' },
    { id: 'product-composition', label: 'Материалы изделия', width: 1443, height: 1191, description: 'Сохранённая основа из смолы и дополнительные материалы для конкретного изделия.' },
  ],
  stock: [
    { id: 'stock-materials', label: 'Материалы', width: 2217, height: 1380, description: 'Остатки сырья с поиском и фильтрами. Материалы с низким остатком выделены в списке.' },
    { id: 'stock-products', label: 'Продукция', width: 2217, height: 1275, description: 'Готовые изделия на складе: количество, себестоимость и цена продажи.' },
    { id: 'stock-tools', label: 'Инструменты', width: 2217, height: 1275, description: 'Инструменты и молды: отдельные экземпляры, оставшийся ресурс и стоимость использования.' },
  ],
  business: [
    { id: 'business-sales', label: 'Продажи', width: 2217, height: 1073, description: 'Цены, наценка и прибыль по изделиям. Продажа проводится из готового остатка на складе.' },
    { id: 'business-logistics', label: 'Логистика', width: 2217, height: 1560, description: 'Отправки и возвраты отдельно от продаж: готовые остатки и история движения изделий.' },
  ],
};

const source = screen => `./assets/screens/${screen.id}.webp`;
const expandIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M9 4H4v5m11-5h5v5M4 15v5h5m11-5v5h-5"/></svg>';

export function renderScreenGallery(section) {
  const screens = landingScreens[section], first = screens[0];
  return `<figure class="lp-app-preview" data-screen-gallery="${section}">
    <div class="lp-screen-toolbar"><div class="lp-screen-options" role="group" aria-label="Экраны раздела">${screens.map((screen, index) => `<button type="button" data-screen-select="${index}" aria-pressed="${index === 0}" aria-controls="lp-shot-${section}">${screen.label}</button>`).join('')}</div><span class="lp-screen-count" data-screen-count>01 / 0${screens.length}</span></div>
    <button class="lp-screen-image" type="button" data-screen-open aria-haspopup="dialog" aria-label="Увеличить экран: ${first.label}">
      <img id="lp-shot-${section}" data-screen-image src="${source(first)}" width="${first.width}" height="${first.height}" alt="${first.description}" loading="lazy" decoding="async"/>
      <span class="lp-screen-zoom">${expandIcon} Рассмотреть экран</span>
    </button>
    <figcaption class="lp-screen-caption"><p data-screen-description aria-live="polite">${first.description}</p><span>Реальный интерфейс · демонстрационные данные</span></figcaption>
  </figure>`;
}

export function renderScreenDialog() {
  return `<dialog class="lp-screen-dialog" data-screen-dialog aria-labelledby="lp-screen-title" aria-describedby="lp-screen-note">
    <header class="lp-screen-dialog-head"><div><p class="lp-overline">Внутри Формулы</p><h2 id="lp-screen-title"></h2></div><div class="lp-screen-dialog-actions"><button type="button" data-screen-size aria-pressed="false">${expandIcon}<span>Увеличить</span></button><button type="button" data-screen-close aria-label="Закрыть просмотр" autofocus><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="m6 6 12 12M6 18 18 6"/></svg></button></div></header>
    <div class="lp-screen-scroll" data-screen-scroll tabindex="0" role="region" aria-label="Снимок экрана, область прокрутки"><img data-screen-full alt=""/></div>
    <p id="lp-screen-note">Снимок реального приложения с демонстрационными данными. Нажмите «Увеличить», чтобы прочитать детали.</p>
  </dialog>`;
}

export function mountScreenGalleries(root, signal) {
  const dialog = root.querySelector('[data-screen-dialog]');
  const full = dialog.querySelector('[data-screen-full]');
  const scroller = dialog.querySelector('[data-screen-scroll]');
  const size = dialog.querySelector('[data-screen-size]');
  let opener = null;
  function setZoom(zoomed) {
    dialog.classList.toggle('is-zoomed', zoomed);
    size.setAttribute('aria-pressed', String(zoomed));
    size.querySelector('span').textContent = zoomed ? 'Вписать' : 'Увеличить';
    scroller.scrollTo(0, 0);
  }
  function cleanUp() {
    document.body.classList.remove('lp-screen-open');
    if (opener?.isConnected) opener.focus({ preventScroll: true });
  }
  root.querySelectorAll('[data-screen-gallery]').forEach(gallery => {
    const screens = landingScreens[gallery.dataset.screenGallery];
    const image = gallery.querySelector('[data-screen-image]');
    const open = gallery.querySelector('[data-screen-open]');
    let selected = 0;
    gallery.querySelectorAll('[data-screen-select]').forEach(button => {
      button.addEventListener('click', () => {
        selected = Number(button.dataset.screenSelect);
        const screen = screens[selected];
        gallery.querySelectorAll('[data-screen-select]').forEach(option => option.setAttribute('aria-pressed', String(option === button)));
        image.src = source(screen);
        image.alt = screen.description;
        image.width = screen.width;
        image.height = screen.height;
        open.setAttribute('aria-label', `Увеличить экран: ${screen.label}`);
        gallery.querySelector('[data-screen-description]').textContent = screen.description;
        gallery.querySelector('[data-screen-count]').textContent = `0${selected + 1} / 0${screens.length}`;
        if (!root.classList.contains('lp-paused')) image.animate([{ opacity: .2 }, { opacity: 1 }], { duration: 300, easing: 'ease-out' });
      }, { signal });
    });
    open.addEventListener('click', () => {
      const screen = screens[selected];
      opener = open;
      full.src = source(screen);
      full.alt = screen.description;
      full.width = screen.width;
      full.height = screen.height;
      dialog.querySelector('#lp-screen-title').textContent = screen.label;
      setZoom(false);
      document.body.classList.add('lp-screen-open');
      dialog.showModal();
    }, { signal });
  });
  size.addEventListener('click', () => setZoom(!dialog.classList.contains('is-zoomed')), { signal });
  dialog.querySelector('[data-screen-close]').addEventListener('click', () => dialog.close(), { signal });
  dialog.addEventListener('click', event => {
    const rect = dialog.getBoundingClientRect();
    if (event.target === dialog && (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom)) dialog.close();
  }, { signal });
  dialog.addEventListener('close', cleanUp, { signal });
  return () => { if (dialog.open) dialog.close(); cleanUp(); };
}
