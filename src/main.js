import { PHOTO_BUCKET } from './config.js';
import { supabase } from './supabaseClient.js';
import { initResinScene } from './scene.js';

const app = document.querySelector('#app');
const toastZone = document.querySelector('#toast-zone');
const canvas = document.querySelector('#resin-scene');
const THEME_KEY = 'resin-workshop-theme';

const state = {
  booted: false,
  loading: false,
  theme: readTheme(),
  view: 'dashboard',
  session: null,
  user: null,
  materials: [],
  products: [],
  productMaterials: [],
  calculations: [],
  calculationItems: [],
  stockMovements: [],
  productStockMovements: [],
  productBatches: [],
  moldCalculations: [],
  moldCalculationItems: [],
  photoUrls: new Map(),
  activeProductId: null,
  auth: {
    registrationOpen: false,
    confirmEmail: '',
  },
  inventory: {
    type: 'raw',
    editorOpen: false,
    editingMaterialId: null,
    productEditorOpen: false,
    editingProductId: null,
  },
  productDesigner: {
    creatorOpen: false,
  },
  calculator: {
    dialogOpen: false,
    productId: '',
    batchQuantity: 1,
    salePricePerUnit: 0,
    notes: '',
  },
  productFlow: {
    dialogOpen: false,
    productId: '',
    mode: 'sale',
  },
  moldEditor: {
    editingCalculationId: null,
  },
};

const CATEGORY_LABELS = {
  material: 'Материал',
  depreciation: 'Амортизация',
  packaging: 'Упаковка',
  overhead: 'Накладные',
};

const UNIT_LABELS = {
  g: 'г',
  ml: 'мл',
  pcs: 'шт',
};

const PRODUCT_FLOW_MODES = {
  sale: {
    value: 'sale',
    kicker: 'Продажа',
    title: 'Продать со склада',
    button: 'Списать как продажу',
    placeholder: 'Например: продажа на маркете',
    toast: 'Продажа проведена',
  },
  shipment: {
    value: 'shipment',
    kicker: 'Отправка',
    title: 'Отправить клиенту',
    button: 'Отметить отправку',
    placeholder: 'Например: отправлено, оплата позже',
    toast: 'Отправка отмечена',
  },
  return: {
    value: 'return',
    kicker: 'Возврат',
    title: 'Вернуть на склад',
    button: 'Вернуть на склад',
    placeholder: 'Например: клиент вернул заказ',
    toast: 'Возврат проведен',
  },
};

const VIEW_META = {
  dashboard: { label: 'Пульт', icon: 'layout-dashboard' },
  warehouse: { label: 'Склад', icon: 'warehouse' },
  products: { label: 'Карты изделий', icon: 'package-check' },
  calculator: { label: 'Логистика', icon: 'truck' },
  mold: { label: 'Смола', icon: 'beaker' },
  sales: { label: 'Продажи', icon: 'badge-russian-ruble' },
  history: { label: 'Журнал', icon: 'history' },
};

const VIEW_GROUPS = [
  { label: 'Навигация', items: ['dashboard'] },
  { label: 'Склад', items: ['warehouse'] },
  { label: 'Производство', items: ['products', 'mold'] },
  { label: 'Бизнес', items: ['sales', 'calculator'] },
];

const sceneController = initResinScene(canvas, state.theme);
applyTheme(state.theme, { persist: false, animate: false });
boot();

async function boot() {
  const { data } = await supabase.auth.getSession();
  setSession(data.session);

  supabase.auth.onAuthStateChange((_event, session) => {
    setSession(session);
  });
}

async function setSession(session) {
  state.session = session;
  state.user = session?.user ?? null;
  state.booted = true;

  if (state.user) {
    await loadWorkspace();
  } else {
    resetWorkspace();
    render();
  }
}

function resetWorkspace() {
  state.materials = [];
  state.products = [];
  state.productMaterials = [];
  state.calculations = [];
  state.calculationItems = [];
  state.stockMovements = [];
  state.productStockMovements = [];
  state.productBatches = [];
  state.moldCalculations = [];
  state.moldCalculationItems = [];
  state.photoUrls = new Map();
  state.activeProductId = null;
  state.moldEditor.editingCalculationId = null;
}

async function loadWorkspace() {
  if (!state.user) return;
  state.loading = true;
  render();

  const userId = state.user.id;
  const [
    materials,
    products,
    productMaterials,
    calculations,
    calculationItems,
    stockMovements,
    productStockMovements,
    productBatches,
    moldCalculations,
    moldCalculationItems,
  ] = await Promise.all([
    supabase.from('materials').select('*').eq('user_id', userId).order('created_at', { ascending: false }),
    supabase.from('products').select('*').eq('user_id', userId).order('created_at', { ascending: false }),
    supabase
      .from('product_materials')
      .select('*, materials(id, name, unit, unit_price, current_stock, category)')
      .eq('user_id', userId)
      .order('created_at', { ascending: true }),
    supabase
      .from('production_calculations')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(30),
    supabase
      .from('production_calculation_items')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(200),
    supabase
      .from('stock_movements')
      .select('*, materials(name, unit)')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(80),
    supabase
      .from('product_stock_movements')
      .select('*, products(name), product_batches(product_name_snapshot, sale_price_per_unit)')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(80),
    supabase
      .from('product_batches')
      .select('*, products(name, photo_path)')
      .eq('user_id', userId)
      .order('created_at', { ascending: false }),
    supabase
      .from('mold_calculations')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(30),
    supabase
      .from('mold_calculation_items')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: true })
      .limit(300),
  ]);

  const result = [
    materials,
    products,
    productMaterials,
    calculations,
    calculationItems,
    stockMovements,
    productStockMovements,
    productBatches,
    moldCalculations,
    moldCalculationItems,
  ];
  const failed = result.find((response) => response.error);
  if (failed) {
    showToast(toUserMessage(failed.error), 'error');
  } else {
    state.materials = materials.data ?? [];
    state.products = products.data ?? [];
    state.productMaterials = productMaterials.data ?? [];
    state.calculations = calculations.data ?? [];
    state.calculationItems = calculationItems.data ?? [];
    state.stockMovements = stockMovements.data ?? [];
    state.productStockMovements = productStockMovements.data ?? [];
    state.productBatches = productBatches.data ?? [];
    state.moldCalculations = moldCalculations.data ?? [];
    state.moldCalculationItems = moldCalculationItems.data ?? [];
    if (state.moldEditor.editingCalculationId && !state.moldCalculations.some((item) => item.id === state.moldEditor.editingCalculationId)) {
      state.moldEditor.editingCalculationId = null;
    }
    state.activeProductId = state.activeProductId || state.products[0]?.id || null;
    state.calculator.productId = state.calculator.productId || state.products[0]?.id || '';
    await hydratePhotoUrls();
  }

  state.loading = false;
  render();
}

async function hydratePhotoUrls() {
  const paths = [
    ...state.materials.map((item) => item.photo_path),
    ...state.products.map((item) => item.photo_path),
  ].filter(Boolean);

  const missing = [...new Set(paths)].filter((path) => !state.photoUrls.has(path));
  await Promise.all(
    missing.map(async (path) => {
      const { data, error } = await supabase.storage.from(PHOTO_BUCKET).createSignedUrl(path, 60 * 60);
      if (!error && data?.signedUrl) {
        state.photoUrls.set(path, data.signedUrl);
      }
    })
  );
}

function render() {
  if (!state.booted) return;
  app.innerHTML = state.user ? renderShell() : renderAuth();
  requestAnimationFrame(() => {
    enhanceSelects();
    document.querySelectorAll('.mold-form').forEach(updateMoldComposerPreview);
    syncThemeToggles();
    window.lucide?.createIcons({ attrs: { 'stroke-width': 1.8 } });
  });
}

function renderAuth() {
  return `
    <div class="auth-toolbar">
      ${renderThemeToggle()}
    </div>
    <main class="auth-layout">
      <section class="auth-copy" aria-label="О приложении">
        <div class="brand-row">
          <div class="brand-mark">RC</div>
          <div>
            <p class="eyebrow">Кабинет</p>
            <h1>Мастерская</h1>
          </div>
        </div>
      </section>

      <section class="auth-panel" aria-label="Вход в приложение">
        <div class="panel-kicker">Вход</div>
        <h2>Доступ</h2>
        <form class="stack-form" data-action="auth" novalidate>
          <label>
            Email
            <input name="email" type="email" autocomplete="email" placeholder="name@example.com" required />
          </label>
          <label>
            Пароль
            <input name="password" type="password" autocomplete="current-password" minlength="6" required />
          </label>
          <div class="button-row">
            <button class="primary-button" type="submit" name="intent" value="login">
              Войти
            </button>
            <button class="ghost-button" data-action="open-registration" type="button">
              Регистрация
            </button>
          </div>
        </form>
      </section>
    </main>
    ${state.auth.registrationOpen ? renderRegistrationPanel() : ''}
    ${state.auth.confirmEmail ? renderConfirmEmailDialog() : ''}
  `;
}

function renderThemeToggle() {
  const isLight = state.theme === 'light';
  return `
    <button class="theme-toggle ${isLight ? 'is-light' : 'is-dark'}" data-action="toggle-theme" type="button" aria-pressed="${isLight}">
      <span>Темная</span>
      <span class="theme-track"><span class="theme-thumb"></span></span>
      <span>Светлая</span>
    </button>
  `;
}

function renderRegistrationPanel() {
  return `
    <section class="registration-layer" aria-label="Регистрация">
      <button class="registration-scrim" data-action="close-registration" type="button" aria-label="Закрыть"></button>
      <div class="registration-sheet">
        <div class="sheet-head">
          <div>
            <p class="panel-kicker">Регистрация</p>
            <h2>Новый аккаунт</h2>
          </div>
          <button class="icon-button" data-action="close-registration" type="button" title="Закрыть">
            <i data-lucide="x"></i>
          </button>
        </div>
        <form class="stack-form" data-action="signup" novalidate>
          <label>
            Email
            <input name="email" type="email" autocomplete="email" placeholder="name@example.com" data-registration-email required />
          </label>
          <label>
            Пароль
            <input name="password" type="password" autocomplete="new-password" minlength="6" required />
          </label>
          <label>
            Повторите пароль
            <input name="password_confirm" type="password" autocomplete="new-password" minlength="6" required />
          </label>
          <div class="button-row">
            <button class="primary-button" type="submit">
              Создать аккаунт
            </button>
            <button class="ghost-button" data-action="close-registration" type="button">
              Назад
            </button>
          </div>
        </form>
      </div>
    </section>
  `;
}

function renderConfirmEmailDialog() {
  return `
    <section class="confirm-layer" aria-label="Подтверждение аккаунта">
      <div class="confirm-card">
        <p class="panel-kicker">Почта</p>
        <h2>Подтвердите аккаунт</h2>
        <p>Письмо отправлено на ${escapeHtml(state.auth.confirmEmail)}.</p>
        <p>Если письма нет во входящих, обязательно проверьте папку «Спам».</p>
        <button class="primary-button" data-action="close-confirm" type="button">
          Хорошо
        </button>
      </div>
    </section>
  `;
}

function renderShell() {
  const current = state.view === 'materials' ? VIEW_META.warehouse : VIEW_META[state.view] ?? VIEW_META.dashboard;
  return `
    <div class="workspace-shell">
      <aside class="sidebar">
        <div class="sidebar-brand">
          <div class="brand-mark">RC</div>
          <div>
            <div class="brand-title">Мастерская</div>
          </div>
        </div>
        <nav class="nav-list" aria-label="Главное меню">
          ${VIEW_GROUPS.map(renderNavGroup).join('')}
        </nav>
        <div class="sidebar-footer">
          <div class="user-chip">
            <div class="user-dot"></div>
            <span>${escapeHtml(state.user.email ?? 'Пользователь')}</span>
          </div>
          <button class="icon-text-button" data-action="logout" type="button">
            <i data-lucide="log-out"></i>
            Выйти
          </button>
        </div>
      </aside>

      <main class="workbench">
        <header class="topbar">
          <div>
            <h1>${current.label}</h1>
          </div>
          <div class="topbar-actions">
            ${renderThemeToggle()}
            <button class="icon-button" data-action="reload" type="button" title="Обновить данные">
              <i data-lucide="refresh-cw"></i>
            </button>
          </div>
        </header>
        ${state.loading ? '<div class="loading-line"></div>' : ''}
        ${renderCurrentView()}
      </main>
      ${state.productFlow.dialogOpen ? renderProductFlowDialog() : ''}
    </div>
  `;
}

function renderNavGroup(group) {
  return `
    <div class="nav-group">
      <div class="nav-group-title">${group.label}</div>
      ${group.items
        .map((id) => {
          const meta = VIEW_META[id];
          return `
            <button class="nav-button ${state.view === id ? 'is-active' : ''}" data-view="${id}" type="button">
              <i data-lucide="${meta.icon}"></i>
              <span>${meta.label}</span>
            </button>
          `;
        })
        .join('')}
    </div>
  `;
}

function renderCurrentView() {
  if (state.view === 'warehouse' || state.view === 'materials') return renderWarehouseView();
  if (state.view === 'products') return renderProductsView();
  if (state.view === 'calculator') return renderCalculatorView();
  if (state.view === 'mold') return renderMoldView();
  if (state.view === 'sales') return renderSalesView();
  if (state.view === 'history') return renderHistoryView();
  return renderDashboardView();
}

function renderDashboardView() {
  const materialValue = state.materials.reduce((sum, item) => sum + toNumber(item.current_stock) * toNumber(item.unit_price), 0);
  const lowStock = state.materials.filter((item) => toNumber(item.current_stock) <= toNumber(item.min_stock) && toNumber(item.min_stock) > 0);
  const lastCalculation = state.calculations[0];
  const pricedProducts = state.products.filter((product) => calculateProductSalePrice(product) > 0);

  return `
    <section class="dashboard-grid">
      ${renderMetric('Материалы', state.materials.length, 'layers-3')}
      ${renderMetric('Остатки', formatCurrency(materialValue), 'wallet')}
      ${renderMetric('Карты изделий', state.products.length, 'package-check')}
      ${renderMetric('Минимум', lowStock.length, 'triangle-alert')}
    </section>

    <section class="process-grid">
      ${renderProcessCard('Склад', 'Материалы, закупки, остатки', [
        `${state.materials.length} позиций`,
        `${state.products.reduce((sum, product) => sum + getProductStock(product), 0)} готово`,
      ], 'warehouse')}
      ${renderProcessCard('Производство', 'Карты изделий, молды, смола', [
        `${state.products.length} изделий`,
        `${state.calculations.length} запусков`,
      ], 'products')}
      ${renderProcessCard('Продажи', 'Цена, наценка, готовый каталог', [
        `${pricedProducts.length} с ценой`,
        averageMarkupLabel(),
      ], 'sales')}
    </section>

    <section class="two-column">
      <div class="panel">
        <div class="panel-head">
          <div>
            <p class="panel-kicker">Последний расчет</p>
            <h2>${lastCalculation ? escapeHtml(lastCalculation.product_name_snapshot) : 'Пока расчетов нет'}</h2>
          </div>
          <i data-lucide="history"></i>
        </div>
        ${
          lastCalculation
            ? `
              <div class="dense-list">
                <div><span>Партия</span><strong>${formatQty(lastCalculation.batch_quantity)} шт</strong></div>
                <div><span>Себестоимость</span><strong>${formatCurrency(lastCalculation.material_cost_total)}</strong></div>
                <div><span>Прибыль</span><strong>${formatCurrency(lastCalculation.profit_total)}</strong></div>
                <div><span>Маржа</span><strong>${formatPercent(lastCalculation.margin_percent)}</strong></div>
              </div>
            `
            : '<p class="muted">Нет данных</p>'
        }
      </div>

      <div class="panel">
        <div class="panel-head">
          <div>
            <p class="panel-kicker">Склад</p>
            <h2>Последние движения</h2>
          </div>
          <i data-lucide="activity"></i>
        </div>
        ${renderMovementRows(state.stockMovements.slice(0, 5))}
      </div>
    </section>
  `;
}

function renderProcessCard(title, subtitle, facts, view) {
  return `
    <article class="process-card">
      <div>
        <p class="panel-kicker">${title}</p>
        <h2>${subtitle}</h2>
      </div>
      <div class="process-facts">
        ${facts.map((fact) => `<span>${escapeHtml(fact)}</span>`).join('')}
      </div>
      <button class="ghost-button compact" data-view="${view}" type="button">Открыть</button>
    </article>
  `;
}

function renderMetric(label, value, iconName) {
  return `
    <article class="metric">
      <div class="metric-icon"><i data-lucide="${iconName}"></i></div>
      <span>${label}</span>
      <strong>${value}</strong>
    </article>
  `;
}

function renderWarehouseView() {
  return `
    <div class="warehouse-tabs" aria-label="Тип склада">
      <button class="warehouse-tab ${state.inventory.type === 'raw' ? 'is-active' : ''}" data-action="set-warehouse" data-warehouse="raw" type="button">
        Сырье
      </button>
      <button class="warehouse-tab ${state.inventory.type === 'products' ? 'is-active' : ''}" data-action="set-warehouse" data-warehouse="products" type="button">
        Продукция
      </button>
    </div>
    ${state.inventory.type === 'products' ? renderProductWarehouseView() : renderMaterialsView()}
  `;
}

function renderMaterialsView() {
  return `
    <section class="inventory-volume">
      <div class="inventory-head">
        <div>
          <p class="panel-kicker">Остатки</p>
          <h2>${state.materials.length ? `${state.materials.length} позиций` : 'Склад пуст'}</h2>
        </div>
        <button class="ghost-button compact" data-action="open-material-editor" type="button">Добавить товар</button>
      </div>
      ${
        state.materials.length
          ? `<div class="inventory-grid">${state.materials.map(renderMaterialItem).join('')}</div>`
          : renderInventoryEmpty()
      }
    </section>
    ${state.inventory.editorOpen ? renderMaterialEditor() : ''}
  `;
}

function renderProductWarehouseView() {
  const totalStock = state.products.reduce((sum, product) => sum + getProductStock(product), 0);
  return `
    <section class="inventory-volume">
      <div class="inventory-head">
        <div>
          <p class="panel-kicker">Готовые изделия</p>
          <h2>${state.products.length ? `${formatQty(totalStock)} шт на складе` : 'Склад пуст'}</h2>
        </div>
        <button class="ghost-button compact" data-view="products" type="button">Добавить изделие</button>
      </div>
      ${
        state.products.length
          ? `<div class="inventory-grid">${state.products.map(renderProductInventoryItem).join('')}</div>`
          : renderProductInventoryEmpty()
      }
    </section>
    ${state.inventory.productEditorOpen ? renderProductStockEditor() : ''}
  `;
}

function renderProductInventoryItem(product) {
  const photo = getPhotoUrl(product.photo_path);
  const stock = getProductStock(product);
  const minStock = toNumber(product.min_stock);
  const stockTone = minStock > 0 && stock <= minStock ? 'is-low' : '';
  const cost = calculateProductCost(product.id);
  const price = calculateProductSalePrice(product);
  return `
    <button class="material-card product-stock-card ${stockTone}" data-action="edit-product-stock" data-product-id="${product.id}" type="button">
      <div class="thumb">${photo ? `<img src="${photo}" alt="" />` : '<i data-lucide="package"></i>'}</div>
      <div class="material-main">
        <h3>${escapeHtml(product.name)}</h3>
        <p>Готовое изделие · себестоимость ${formatCurrency(cost)}</p>
      </div>
      <div class="material-card-facts">
        <span>
          <small>На складе</small>
          <strong>${formatQty(stock)} шт</strong>
        </span>
        <span>
          <small>Минимум</small>
          <strong>${formatQty(minStock)} шт</strong>
        </span>
        <span>
          <small>Цена</small>
          <strong>${formatCurrency(price)} / шт</strong>
        </span>
      </div>
    </button>
  `;
}

function renderProductInventoryEmpty() {
  return `
    <div class="inventory-empty">
      <div class="empty-orb"><i data-lucide="package"></i></div>
      <h3>Продукции пока нет</h3>
      <p>Создайте карту изделия, затем готовые остатки появятся здесь.</p>
      <button class="primary-button compact" data-view="products" type="button">Добавить изделие</button>
    </div>
  `;
}

function renderProductStockEditor() {
  const product = state.products.find((item) => item.id === state.inventory.editingProductId);
  if (!product) return '';

  const photo = getPhotoUrl(product.photo_path);
  const cost = calculateProductCost(product.id);
  const markup = getProductMarkup(product);
  const price = calculateProductSalePrice(product);
  const stock = getProductStock(product);
  return `
    <section class="material-editor-layer" aria-label="Склад продукции">
      <button class="registration-scrim" data-action="close-product-stock-editor" type="button" aria-label="Закрыть"></button>
      <div class="material-editor-sheet">
        <div class="sheet-head">
          <div>
            <p class="panel-kicker">Продукция</p>
            <h2>${escapeHtml(product.name)}</h2>
          </div>
          <button class="icon-button" data-action="close-product-stock-editor" type="button" title="Закрыть">
            <i data-lucide="x"></i>
          </button>
        </div>
        <div class="product-stock-summary">
          <div class="thumb">${photo ? `<img src="${photo}" alt="" />` : '<i data-lucide="package"></i>'}</div>
          <div>
            <strong>${formatQty(stock)} шт</strong>
            <span>готово на складе</span>
          </div>
        </div>
        <div class="material-ledger product-ledger">
          <div>
            <span>На складе</span>
            <strong>${formatQty(stock)} шт</strong>
          </div>
          <div>
            <span>Минимум</span>
            <strong>${formatQty(product.min_stock)} шт</strong>
          </div>
          <div>
            <span>Себестоимость</span>
            <strong>${formatCurrency(cost)} / шт</strong>
          </div>
          <div>
            <span>Цена продажи</span>
            <strong>${formatCurrency(price)} / шт</strong>
          </div>
          <div>
            <span>Наценка</span>
            <strong>${formatPercent(markup)}</strong>
          </div>
        </div>
        <form class="stack-form" data-action="update-product-stock" data-product-pricing-form>
          <input type="hidden" name="product_id" value="${product.id}" />
          <div class="form-grid">
            <label>Минимум на складе
              <span class="input-with-suffix">
                <input name="min_stock" type="number" step="1" min="0" value="${escapeAttr(product.min_stock ?? '')}" placeholder="3" />
                <span>шт</span>
              </span>
            </label>
            <label>Наценка к себестоимости
              <span class="input-with-suffix">
                <input name="markup_percent" data-markup-source type="number" step="0.01" min="0" value="${escapeAttr(product.markup_percent ?? 0)}" placeholder="400" />
                <span>%</span>
              </span>
            </label>
          </div>
          <div class="unit-price-preview">
            <span>Цена продажи</span>
            <strong data-product-price-preview data-cost="${escapeAttr(cost)}">${formatCurrency(price)} / шт</strong>
          </div>
          <button class="ghost-button compact" data-view="calculator" type="button">Логистика</button>
          <button class="primary-button" type="submit">Сохранить</button>
        </form>
      </div>
    </section>
  `;
}

function renderMaterialItem(material) {
  const photo = getPhotoUrl(material.photo_path);
  const stockTone = toNumber(material.min_stock) > 0 && toNumber(material.current_stock) <= toNumber(material.min_stock) ? 'is-low' : '';
  const unit = UNIT_LABELS[material.unit] ?? material.unit;
  return `
    <button class="material-card ${stockTone}" data-action="edit-material" data-material-id="${material.id}" type="button">
      <div class="thumb">${photo ? `<img src="${photo}" alt="" />` : '<i data-lucide="box"></i>'}</div>
      <div class="material-main">
        <h3>${escapeHtml(material.name)}</h3>
        <p>${CATEGORY_LABELS[material.category] ?? material.category}</p>
      </div>
      <div class="material-card-facts">
        <span>
          <small>На складе</small>
          <strong>${formatQty(material.current_stock)} ${unit}</strong>
        </span>
        <span>
          <small>Минимум</small>
          <strong>${formatQty(material.min_stock)} ${unit}</strong>
        </span>
        <span>
          <small>Цена</small>
          <strong>${formatCurrency(material.unit_price)} / ${unit}</strong>
        </span>
      </div>
    </button>
  `;
}

function renderInventoryEmpty() {
  return `
    <div class="inventory-empty">
      <div class="empty-orb"><i data-lucide="warehouse"></i></div>
      <h3>Склад пока пуст</h3>
      <p>Добавьте первый материал, чтобы видеть остатки и закупки.</p>
      <button class="primary-button compact" data-action="open-material-editor" type="button">Добавить товар</button>
    </div>
  `;
}

function renderMaterialEditor() {
  const material = state.materials.find((item) => item.id === state.inventory.editingMaterialId);
  const isEdit = Boolean(material);
  const unit = material?.unit ?? 'g';
  const unitLabel = UNIT_LABELS[unit] ?? unit;
  return `
    <section class="material-editor-layer" aria-label="${isEdit ? 'Редактирование материала' : 'Новый материал'}">
      <button class="registration-scrim" data-action="close-material-editor" type="button" aria-label="Закрыть"></button>
      <div class="material-editor-sheet">
        <div class="sheet-head">
          <div>
            <p class="panel-kicker">${isEdit ? 'Редактирование' : 'Закупка'}</p>
            <h2>${isEdit ? escapeHtml(material.name) : 'Новый товар'}</h2>
          </div>
          <button class="icon-button" data-action="close-material-editor" type="button" title="Закрыть">
            <i data-lucide="x"></i>
          </button>
        </div>
        ${
          isEdit
            ? `
              <div class="material-ledger">
                <div>
                  <span>На складе</span>
                  <strong>${formatQty(material.current_stock)} ${unitLabel}</strong>
                </div>
                <div>
                  <span>Минимум</span>
                  <strong>${formatQty(material.min_stock)} ${unitLabel}</strong>
                </div>
                <div>
                  <span>Цена за ${unitLabel}</span>
                  <strong>${formatCurrency(material.unit_price)}</strong>
                </div>
              </div>
            `
            : ''
        }
        <form class="stack-form" data-action="${isEdit ? 'update-material' : 'create-material'}" data-material-form>
          <input type="hidden" name="material_id" value="${material?.id ?? ''}" />
          <label>Название<input name="name" required value="${escapeAttr(material?.name ?? '')}" placeholder="Смола Crystal" /></label>
          <div class="form-grid">
            <label>Тип${renderSelect('category', CATEGORY_LABELS, material?.category ?? 'material')}</label>
            <label>Единица учета
              <select name="unit" data-material-unit-select>
                ${Object.entries(UNIT_LABELS)
                  .map(([value, label]) => `<option value="${value}" ${unit === value ? 'selected' : ''}>${label}</option>`)
                  .join('')}
              </select>
            </label>
          </div>
          <div class="form-grid">
            <label>Цена упаковки
              <span class="input-with-suffix">
                <input name="package_cost" data-material-price-source type="number" step="0.01" min="0" required value="${escapeAttr(material?.package_cost ?? '')}" placeholder="2500" />
                <span>₽</span>
              </span>
            </label>
            <label>Количество в упаковке
              <span class="input-with-suffix">
                <input name="package_quantity" data-material-price-source type="number" step="0.001" min="0.001" required value="${escapeAttr(material?.package_quantity ?? '')}" placeholder="1000" />
                <span data-unit-suffix>${unitLabel}</span>
              </span>
            </label>
          </div>
          <div class="unit-price-preview">
            <span data-unit-price-label>Цена за ${unitLabel}</span>
            <strong data-unit-price-value>${formatCurrency(material?.unit_price ?? 0)}</strong>
          </div>
          <div class="form-grid">
            ${
              isEdit
                ? `<label>Минимум на складе
                    <span class="input-with-suffix">
                      <input name="min_stock" type="number" step="0.001" min="0" value="${escapeAttr(material?.min_stock ?? '')}" placeholder="150" />
                      <span data-unit-suffix>${unitLabel}</span>
                    </span>
                  </label>`
                : `<label>На складе сейчас
                    <span class="input-with-suffix">
                      <input name="initial_stock" type="number" step="0.001" min="0" placeholder="1000" />
                      <span data-unit-suffix>${unitLabel}</span>
                    </span>
                  </label>
                  <label>Минимум на складе
                    <span class="input-with-suffix">
                      <input name="min_stock" type="number" step="0.001" min="0" placeholder="150" />
                      <span data-unit-suffix>${unitLabel}</span>
                    </span>
                  </label>`
            }
          </div>
          ${renderFilePicker()}
          <label>Где покупали / ссылка<input name="purchase_url" type="url" value="${escapeAttr(material?.purchase_url ?? '')}" placeholder="Ссылка на магазин" /></label>
          <label>Примечание<textarea name="notes" rows="3" placeholder="Любая полезная заметка">${escapeHtml(material?.notes ?? '')}</textarea></label>
          ${
            isEdit
              ? `
                <div class="stock-mini">
                  <p class="panel-kicker">Остаток</p>
                  <div class="form-grid">
                    <label>Действие
                      <select name="stock_mode">
                        <option value="">Без изменения</option>
                        <option value="receipt">Добавить к остатку</option>
                        <option value="adjustment">Установить остаток</option>
                      </select>
                    </label>
                    <label>Количество
                      <span class="input-with-suffix">
                        <input name="stock_quantity" type="number" step="0.001" min="0" placeholder="${formatQty(material.current_stock)}" />
                        <span data-unit-suffix>${unitLabel}</span>
                      </span>
                    </label>
                  </div>
                </div>
              `
              : ''
          }
          <button class="primary-button" type="submit">${isEdit ? 'Сохранить' : 'Добавить товар'}</button>
        </form>
      </div>
    </section>
  `;
}

function renderProductsView() {
  const activeProduct = state.products.find((item) => item.id === state.activeProductId) ?? state.products[0];
  if (activeProduct && state.activeProductId !== activeProduct.id) state.activeProductId = activeProduct.id;

  return `
    <section class="compact-workspace">
      <div class="panel product-library-panel">
        <div class="panel-head">
          <div>
            <p class="panel-kicker">Каталог</p>
            <h2>${state.products.length ? `${state.products.length} ${pluralRu(state.products.length, ['изделие', 'изделия', 'изделий'])}` : 'Изделий нет'}</h2>
          </div>
          <button class="ghost-button compact" data-action="open-product-creator" type="button">Новое изделие</button>
        </div>
        ${
          state.products.length
            ? `<div class="product-card-grid">${state.products.map(renderProductLibraryCard).join('')}</div>`
            : renderProductLibraryEmpty()
        }
      </div>

      <div class="panel product-detail-panel">
        <div class="panel-head">
          <div>
            <p class="panel-kicker">Состав</p>
            <h2>${activeProduct ? escapeHtml(activeProduct.name) : 'Изделий пока нет'}</h2>
          </div>
          ${
            activeProduct
              ? '<i data-lucide="package-check"></i>'
              : '<i data-lucide="package-check"></i>'
          }
        </div>
        ${
          activeProduct ? renderProductDetail(activeProduct) : renderEmpty('Выберите или создайте изделие')
        }
      </div>
    </section>
    ${state.productDesigner.creatorOpen ? renderProductCreatorDialog() : ''}
  `;
}

function renderProductLibraryCard(product) {
  const photo = getPhotoUrl(product.photo_path);
  const isActive = state.activeProductId === product.id;
  const cost = calculateProductCost(product.id);
  const markup = getProductMarkup(product);
  const price = calculateProductSalePrice(product);
  const recipeCount = state.productMaterials.filter((row) => row.product_id === product.id).length;
  const stock = getProductStock(product);
  return `
    <button class="material-card product-library-card ${isActive ? 'is-active' : ''}" data-action="select-product" data-product-id="${product.id}" type="button">
      <div class="thumb">${photo ? `<img src="${photo}" alt="" />` : '<i data-lucide="package"></i>'}</div>
      <div class="material-main">
        <h3>${escapeHtml(product.name)}</h3>
        <p>${recipeCount} ${pluralRu(recipeCount, ['компонент', 'компонента', 'компонентов'])} · ${formatQty(stock)} шт</p>
      </div>
      <div class="material-card-facts">
        <span>
          <small>Себестоимость</small>
          <strong>${formatCurrency(cost)}</strong>
        </span>
        <span>
          <small>Наценка</small>
          <strong>${formatPercent(markup)}</strong>
        </span>
        <span>
          <small>Цена</small>
          <strong>${formatCurrency(price)}</strong>
        </span>
      </div>
    </button>
  `;
}

function renderProductDetail(product) {
  const photo = getPhotoUrl(product.photo_path);
  const cost = calculateProductCost(product.id);
  const markup = getProductMarkup(product);
  const price = calculateProductSalePrice(product);
  const stock = getProductStock(product);
  const recipeCount = state.productMaterials.filter((row) => row.product_id === product.id).length;
  return `
    <div class="product-detail-shell">
      <article class="product-hero-card">
        <div class="product-hero-media">
          ${photo ? `<img src="${photo}" alt="" />` : '<i data-lucide="package"></i>'}
        </div>
        <div class="product-hero-body">
          <p class="panel-kicker">Карта изделия</p>
          <h3>${escapeHtml(product.name)}</h3>
          <span>${escapeHtml(product.description || 'Фото, молд и состав изделия')}</span>
        </div>
      </article>

      <div class="product-metrics-grid">
        <div>
          <span>Себестоимость</span>
          <strong>${formatCurrency(cost)} / шт</strong>
        </div>
        <div>
          <span>Наценка</span>
          <strong>${formatPercent(markup)}</strong>
        </div>
        <div>
          <span>Цена продажи</span>
          <strong>${formatCurrency(price)} / шт</strong>
        </div>
        <div>
          <span>На складе</span>
          <strong>${formatQty(stock)} шт</strong>
        </div>
      </div>

      <div class="recipe-section-head">
        <div>
          <p class="panel-kicker">Состав</p>
          <h3>Компоненты изделия</h3>
        </div>
      </div>
      ${renderMoldApplyPanel(product)}
      ${renderRecipeTable(product.id)}
    </div>
  `;
}

function renderMoldApplyPanel(product) {
  const molds = getReusableMoldCalculations();
  if (!molds.length) {
    return `
      <div class="mold-apply-card">
        <div>
          <p class="panel-kicker">Молд из смолы</p>
          <h4>Сохраненных молдов пока нет</h4>
        </div>
        <button class="ghost-button compact" data-view="mold" type="button">Создать расчет</button>
      </div>
    `;
  }

  return `
    <form class="mold-apply-card" data-action="apply-mold-to-product">
      <input type="hidden" name="product_id" value="${product.id}" />
      <div>
        <p class="panel-kicker">Молд из смолы</p>
        <h4>Применить к изделию</h4>
      </div>
      <div class="mold-apply-controls">
        <label>
          Сохраненный молд
          <select name="mold_calculation_id" required>
            ${molds.map((mold) => `<option value="${mold.id}">${escapeHtml(formatMoldOption(mold))}</option>`).join('')}
          </select>
        </label>
        <button class="primary-button compact" type="submit">Применить</button>
      </div>
    </form>
  `;
}

function renderProductLibraryEmpty() {
  return `
    <div class="inventory-empty compact-empty">
      <div class="empty-orb"><i data-lucide="package-plus"></i></div>
      <h3>Каталог пуст</h3>
      <p>Добавьте первое изделие и примените к нему сохраненный молд.</p>
      <button class="primary-button compact" data-action="open-product-creator" type="button">Новое изделие</button>
    </div>
  `;
}

function renderProductCreatorDialog() {
  return `
    <section class="material-editor-layer" aria-label="Новое изделие">
      <button class="registration-scrim" data-action="close-product-creator" type="button" aria-label="Закрыть"></button>
      <div class="material-editor-sheet">
        <div class="sheet-head">
          <div>
            <p class="panel-kicker">Изделие</p>
            <h2>Новая карта</h2>
          </div>
          <button class="icon-button" data-action="close-product-creator" type="button" title="Закрыть">
            <i data-lucide="x"></i>
          </button>
        </div>
        <form class="stack-form" data-action="create-product">
          <label>Название<input name="name" required placeholder="Подстаканник Wave" /></label>
          <label>Наценка к себестоимости
            <span class="input-with-suffix">
              <input name="markup_percent" type="number" step="0.01" min="0" placeholder="400" />
              <span>%</span>
            </span>
          </label>
          ${renderFilePicker()}
          <label>Описание<textarea name="description" rows="3" placeholder="Размер, форма, особенности"></textarea></label>
          <button class="primary-button" type="submit">Добавить изделие</button>
        </form>
      </div>
    </section>
  `;
}

function renderProductTab(product) {
  const photo = getPhotoUrl(product.photo_path);
  return `
    <button class="product-tab ${state.activeProductId === product.id ? 'is-active' : ''}" data-action="select-product" data-product-id="${product.id}" type="button">
      <span>${photo ? `<img src="${photo}" alt="" />` : '<i data-lucide="package"></i>'}</span>
      ${escapeHtml(product.name)}
    </button>
  `;
}

function renderRecipeTable(productId) {
  const rows = state.productMaterials.filter((item) => item.product_id === productId);
  if (!rows.length) return renderEmpty('Примените сохраненный молд, чтобы собрать состав изделия');

  return `
    <div class="recipe-list">
      ${rows
        .map((row) => {
          const material = row.materials ?? state.materials.find((item) => item.id === row.material_id);
          const unit = UNIT_LABELS[material?.unit] ?? material?.unit ?? '';
          const cost = toNumber(row.quantity_per_unit) * toNumber(material?.unit_price);
          return `
            <article class="recipe-row-card">
              <div class="recipe-row-main">
                <strong>${escapeHtml(material?.name ?? 'Материал удален')}</strong>
                <span>${formatCurrency(material?.unit_price ?? 0)} / ${unit}</span>
              </div>
              <div class="recipe-row-facts">
                <span>
                  <small>Расход</small>
                  <strong>${formatQty(row.quantity_per_unit)} ${unit}</strong>
                </span>
                <span>
                  <small>Сумма</small>
                  <strong>${formatCurrency(cost)}</strong>
                </span>
              </div>
              <button class="icon-button danger recipe-delete" data-action="delete-recipe-item" data-id="${row.id}" type="button" title="Удалить">
                <i data-lucide="trash-2"></i>
              </button>
            </article>
          `;
        })
        .join('')}
    </div>
  `;
}

function renderCalculatorView() {
  const selectedProduct = state.products.find((product) => product.id === state.calculator.productId) ?? state.products[0];
  if (selectedProduct && !state.calculator.productId) state.calculator.productId = selectedProduct.id;
  if (selectedProduct && state.activeProductId !== selectedProduct.id) state.activeProductId = selectedProduct.id;
  return `
    <section class="party-ecosystem">
      <div class="panel production-picker-panel">
        <div class="panel-head">
          <div>
            <p class="panel-kicker">Готовые изделия</p>
            <h2>Что двигаем</h2>
          </div>
          <i data-lucide="package-check"></i>
        </div>
        ${
          state.products.length
            ? `<div class="production-product-list">${state.products.map(renderProductionProductCard).join('')}</div>`
            : renderEmpty('Сначала создайте изделие')
        }
      </div>

      <div class="production-main-column">
        <div class="panel production-flow-panel">
          <div class="panel-head">
            <div>
              <p class="panel-kicker">Логистика</p>
              <h2>${selectedProduct ? escapeHtml(selectedProduct.name) : 'Нет изделия'}</h2>
            </div>
            <i data-lucide="truck"></i>
          </div>
          ${selectedProduct ? renderPartyOperations(selectedProduct) : renderEmpty('Нет данных')}
        </div>

        <div class="panel production-history-panel">
          <div class="panel-head">
            <div>
              <p class="panel-kicker">Журнал</p>
              <h2>Отправки и возвраты</h2>
            </div>
            <i data-lucide="history"></i>
          </div>
          ${renderRecentProductionRows()}
        </div>
      </div>
    </section>
  `;
}

function renderProductionProductCard(product) {
  const photo = getPhotoUrl(product.photo_path);
  const isActive = state.calculator.productId === product.id || (!state.calculator.productId && state.products[0]?.id === product.id);
  const cost = calculateProductCost(product.id);
  const stock = getProductStock(product);
  const cardTone = stock > 0 ? 'has-stock' : 'is-empty';
  return `
    <button class="production-product-card ${isActive ? 'is-active' : ''} ${cardTone}" data-action="select-calculator-product" data-product-id="${product.id}" type="button">
      <div class="thumb">${photo ? `<img src="${photo}" alt="" />` : '<i data-lucide="package"></i>'}</div>
      <div class="production-product-main">
        <h3>${escapeHtml(product.name)}</h3>
        <p>${stock > 0 ? `на складе ${formatQty(stock)} шт` : 'склад пуст'}</p>
      </div>
      <div class="production-product-facts">
        <span>${formatCurrency(cost)}</span>
        <span>${formatQty(stock)} шт</span>
      </div>
    </button>
  `;
}

function renderPartyOperations(product) {
  const cost = calculateProductCost(product.id);
  const batches = getProductBatches(product.id);
  const availableBatches = getProductBatches(product.id, { availableOnly: true });
  const stock = getProductStock(product);
  return `
    <div class="party-stock-hero">
      <div>
        <p class="panel-kicker">Склад продукции</p>
        <h3>${formatQty(stock)} шт готово</h3>
      </div>
      <div class="party-stock-price">
        <span>Группы</span>
        <strong>${batches.length}</strong>
      </div>
    </div>

    <div class="party-action-grid">
      ${renderPartyAction('Отправить', availableBatches.length ? 'выбрать остаток' : 'нечего отправлять', 'open-product-flow', 'truck', availableBatches.length ? '' : 'is-muted', 'shipment', product.id, !availableBatches.length)}
      ${renderPartyAction('Вернуть', batches.length ? 'в выбранный остаток' : 'нет остатков', 'open-product-flow', 'undo-2', batches.length ? '' : 'is-muted', 'return', product.id, !batches.length)}
    </div>

    <div class="party-mini-metrics">
      <span><small>Себестоимость</small><b>${formatCurrency(cost)}</b></span>
      <span><small>На складе</small><b>${formatQty(stock)} шт</b></span>
      <span><small>Групп остатков</small><b>${batches.length}</b></span>
    </div>

    ${renderProductBatchShelf(product)}
  `;
}

function renderPartyAction(title, detail, action, icon, tone = '', flowMode = '', productId = '', disabled = false) {
  const flowAttr = flowMode ? ` data-flow-mode="${flowMode}"` : '';
  const productAttr = productId ? ` data-product-id="${productId}"` : '';
  return `
    <button class="party-action-card ${tone}" data-action="${action}"${flowAttr}${productAttr} type="button" ${disabled ? 'disabled' : ''}>
      <i data-lucide="${icon}"></i>
      <span>${title}</span>
      <small>${detail}</small>
    </button>
  `;
}

function renderProductionMaterialsBlock(readiness) {
  if (!readiness.items.length) {
    return `
      <div class="inventory-empty compact-empty">
        <div class="empty-orb"><i data-lucide="package-plus"></i></div>
        <h3>Состав изделия не добавлен</h3>
        <p>Откройте карту изделия и примените сохраненный молд.</p>
        <button class="ghost-button compact" data-view="products" type="button">К картам изделий</button>
      </div>
    `;
  }

  return `
    <div class="party-materials-block">
      <div class="party-block-head">
        <p class="panel-kicker">Сырье для запуска</p>
        <strong>${readiness.capacity > 0 ? 'можно запускать' : 'не хватает сырья'}</strong>
      </div>
      <div class="production-material-list">${readiness.items.map(renderProductionMaterialCard).join('')}</div>
    </div>
  `;
}

function renderProductBatchShelf(product) {
  const batches = getProductBatches(product.id);
  if (!batches.length) return '';
  return `
    <div class="party-batches-block">
      <div class="party-block-head">
        <p class="panel-kicker">Готовые остатки</p>
        <strong>${batches.length} ${pluralRu(batches.length, ['группа', 'группы', 'групп'])}</strong>
      </div>
      <div class="party-batch-list">
        ${batches.map(renderProductBatchCard).join('')}
      </div>
    </div>
  `;
}

function renderProductBatchCard(batch) {
  const remaining = toNumber(batch.remaining_quantity);
  const total = toNumber(batch.total_quantity);
  const moved = Math.max(total - remaining, 0);
  return `
    <article class="party-batch-card ${remaining > 0 ? 'is-available' : 'is-empty'}">
      <div>
        <strong>${formatDate(batch.created_at)}</strong>
        <span>${remaining > 0 ? `осталось ${formatQty(remaining)} шт` : 'остаток закрыт'}</span>
      </div>
      <div class="party-batch-facts">
        <span><small>Произвели</small><b>${formatQty(total)} шт</b></span>
        <span><small>В движении</small><b>${formatQty(moved)} шт</b></span>
        <span><small>Себестоимость</small><b>${formatCurrency(batch.cost_per_unit)}</b></span>
      </div>
    </article>
  `;
}

function renderProductionMaterialCard(item) {
  return `
    <article class="production-material-card ${item.enough ? '' : 'is-danger'}">
      <div>
        <strong>${escapeHtml(item.name)}</strong>
        <span>${item.enough ? `хватит на ${formatQty(item.availableUnits)} шт` : `не хватает ${formatQty(item.shortage)} ${item.unit}`}</span>
      </div>
      <div class="production-material-facts">
        <span>
          <small>На 1 шт</small>
          <b>${formatQty(item.requiredPerUnit)} ${item.unit}</b>
        </span>
        <span>
          <small>На складе</small>
          <b>${formatQty(item.stock)} ${item.unit}</b>
        </span>
        <span>
          <small>В себестоимости</small>
          <b>${formatCurrency(item.costPerUnit)}</b>
        </span>
      </div>
    </article>
  `;
}

function renderRecentProductionRows() {
  const productMovements = state.productStockMovements.filter(isProductionOrLogisticsMovement).slice(0, 5);
  if (!productMovements.length) return renderEmpty('Движений пока нет');
  return `
    <div class="production-history-list">
      ${productMovements
        .map(
          (item) => `
            <article class="production-history-row">
              <div>
                <strong>${escapeHtml(item.products?.name ?? 'Изделие')}</strong>
                <time>${formatDate(item.created_at)}</time>
              </div>
              <span>${productMovementShortLabel(item)}</span>
              <span>${formatSignedQty(item.quantity_delta)} шт</span>
            </article>
          `
        )
        .join('')}
    </div>
  `;
}

function isProductionOrLogisticsMovement(item) {
  return item.movement_type === 'production' || item.source_type === 'shipment' || item.source_type === 'return';
}

function renderProductFlowDialog(product) {
  const selectedProduct = product ?? state.products.find((entry) => entry.id === state.productFlow.productId);
  if (!selectedProduct) return '';
  const mode = PRODUCT_FLOW_MODES[state.productFlow.mode] ?? PRODUCT_FLOW_MODES.sale;
  const showPrice = mode.value === 'sale';
  const batches = getProductBatches(selectedProduct.id, { availableOnly: mode.value !== 'return' });
  const stock = getProductStock(selectedProduct);
  const photo = getPhotoUrl(selectedProduct.photo_path);
  const availableText = mode.value === 'return' ? `${batches.length} групп в истории` : `${formatQty(stock)} шт доступно`;
  return `
    <section class="material-editor-layer" aria-label="${mode.title}">
      <button class="registration-scrim" data-action="close-product-flow" type="button" aria-label="Закрыть"></button>
      <div class="material-editor-sheet">
        <div class="sheet-head">
          <div>
            <p class="panel-kicker">${mode.kicker}</p>
            <h2>${mode.title}</h2>
          </div>
          <button class="icon-button" data-action="close-product-flow" type="button" title="Закрыть">
            <i data-lucide="x"></i>
          </button>
        </div>
        <div class="product-stock-summary">
          <div class="thumb">${photo ? `<img src="${photo}" alt="" />` : '<i data-lucide="package"></i>'}</div>
          <div>
            <strong>${availableText}</strong>
            <span>${escapeHtml(selectedProduct.name)}</span>
          </div>
        </div>
        <form class="stack-form" data-action="product-flow-movement">
          <input type="hidden" name="movement_mode" value="${mode.value}" />
          <label>
            Остаток
            <select name="batch_id" required>
              ${batches.map((batch) => `<option value="${batch.id}">${escapeHtml(formatBatchOption(batch, { showPrice }))}</option>`).join('')}
            </select>
          </label>
          <label>Количество
            <span class="input-with-suffix">
              <input name="quantity" type="number" step="1" min="1" required placeholder="1" />
              <span>шт</span>
            </span>
          </label>
          <label>Комментарий<textarea name="comment" rows="3" placeholder="${mode.placeholder}"></textarea></label>
          <button class="primary-button" type="submit" ${!batches.length ? 'disabled' : ''}>${mode.button}</button>
        </form>
      </div>
    </section>
  `;
}

function formatBatchOption(batch, options = {}) {
  const base = `${formatDate(batch.created_at)} · осталось ${formatQty(batch.remaining_quantity)} шт`;
  return options.showPrice ? `${base} · ${formatCurrency(batch.sale_price_per_unit)}` : base;
}

function renderCalculationDialog(selectedProduct, batch, salePrice) {
  if (!selectedProduct) return '';
  return `
    <section class="material-editor-layer" aria-label="Новый запуск">
      <button class="registration-scrim" data-action="close-calculation-dialog" type="button" aria-label="Закрыть"></button>
      <div class="material-editor-sheet">
        <div class="sheet-head">
          <div>
            <p class="panel-kicker">Партия</p>
            <h2>Новый запуск</h2>
          </div>
          <button class="icon-button" data-action="close-calculation-dialog" type="button" title="Закрыть">
            <i data-lucide="x"></i>
          </button>
        </div>
        <form class="stack-form" data-action="finalize-calculation">
          <label>
            Изделие
            <select name="product_id" required>
              ${state.products.map((product) => `<option value="${product.id}" ${selectedProduct.id === product.id ? 'selected' : ''}>${escapeHtml(product.name)}</option>`).join('')}
            </select>
          </label>
          <div class="form-grid">
            <label>Сколько сделать
              <span class="input-with-suffix">
                <input name="batch_quantity" type="number" step="1" min="1" required value="${escapeAttr(batch)}" />
                <span>шт</span>
              </span>
            </label>
            <label>Цена для продажи
              <span class="input-with-suffix">
                <input name="sale_price_per_unit" type="number" step="0.01" min="0" value="${escapeAttr(salePrice)}" />
                <span>₽/шт</span>
              </span>
            </label>
          </div>
          <label>Комментарий<textarea name="notes" rows="3" placeholder="Например: запуск для маркета">${escapeHtml(state.calculator.notes)}</textarea></label>
          <div class="batch-action-strip">
            <span>Сырье спишется</span>
            <span>Изделия попадут на склад</span>
            <span>Партия сохранится</span>
          </div>
          <button class="primary-button" type="submit">Провести и списать сырье</button>
        </form>
      </div>
    </section>
  `;
}

function renderBatchEstimate(estimate) {
  return `
    <section class="estimate-grid">
      ${renderMetric('Партия', formatCurrency(estimate.costTotal), 'receipt-russian-ruble')}
      ${renderMetric('1 шт', formatCurrency(estimate.costPerUnit), 'badge-russian-ruble')}
      ${renderMetric('Выручка', formatCurrency(estimate.revenue), 'trending-up')}
      ${renderMetric('Прибыль', formatCurrency(estimate.profit), 'chart-no-axes-combined')}
    </section>
    <div class="data-table">
      <div class="table-row table-head">
        <span>Материал</span>
        <span>Нужно</span>
        <span>На складе</span>
        <span>Стоимость</span>
        <span>Статус</span>
      </div>
      ${estimate.items
        .map(
          (item) => `
            <div class="table-row ${item.enough ? '' : 'is-danger'}">
              <span>${escapeHtml(item.name)}</span>
              <span>${formatQty(item.required)} ${item.unit}</span>
              <span>${formatQty(item.stock)} ${item.unit}</span>
              <span>${formatCurrency(item.cost)}</span>
              <span>${item.enough ? 'хватает' : 'не хватает'}</span>
            </div>
          `
        )
        .join('')}
    </div>
  `;
}

function renderSalesView() {
  const pricedProducts = state.products.filter((product) => calculateProductSalePrice(product) > 0);
  const lastCalculation = state.calculations[0];

  return `
    <section class="dashboard-grid">
      ${renderMetric('Каталог', state.products.length, 'package-check')}
      ${renderMetric('С ценой', pricedProducts.length, 'badge-russian-ruble')}
      ${renderMetric('Средняя наценка', averageMarkupLabel(), 'chart-no-axes-combined')}
      ${renderMetric('Последняя прибыль', formatCurrency(lastCalculation?.profit_total ?? 0), 'trending-up')}
    </section>

    <section class="panel wide-panel">
      <div class="panel-head">
        <div>
          <p class="panel-kicker">Готовые изделия</p>
          <h2>Цены и наценка</h2>
        </div>
        <i data-lucide="badge-russian-ruble"></i>
      </div>
      <div class="sales-grid">
        ${state.products.map(renderSalesCard).join('') || renderEmpty('Пусто')}
      </div>
    </section>

    <section class="panel wide-panel">
      <div class="panel-head">
        <div>
          <p class="panel-kicker">История</p>
          <h2>Последние продажи</h2>
        </div>
        <i data-lucide="receipt"></i>
      </div>
      ${renderRecentSalesRows()}
    </section>
  `;
}

function renderSalesCard(product) {
  const cost = calculateProductCost(product.id);
  const markup = getProductMarkup(product);
  const price = calculateProductSalePrice(product);
  const profit = price - cost;
  const photo = getPhotoUrl(product.photo_path);
  const stock = getProductStock(product);
  const batches = getProductBatches(product.id, { availableOnly: true });

  return `
    <article class="sales-card">
      <div class="sales-main">
        <div class="thumb">${photo ? `<img src="${photo}" alt="" />` : '<i data-lucide="package"></i>'}</div>
        <div>
          <h3>${escapeHtml(product.name)}</h3>
          <p>${cost > 0 ? `${formatPercent(markup)} наценка` : 'Состав не применен'}</p>
        </div>
      </div>
      <div class="sales-numbers">
        <div><span>Себестоимость</span><strong>${formatCurrency(cost)}</strong></div>
        <div><span>Цена</span><strong>${formatCurrency(price)}</strong></div>
        <div><span>Прибыль</span><strong>${formatCurrency(profit)}</strong></div>
        <div><span>На складе</span><strong>${formatQty(stock)} шт</strong></div>
      </div>
      ${renderSalesBatchList(product)}
      <div class="sales-actions">
        <button class="primary-button compact" data-action="open-product-flow" data-flow-mode="sale" data-product-id="${product.id}" type="button" ${!batches.length ? 'disabled' : ''}>
          Продать
        </button>
      </div>
      <form class="sale-price-form" data-action="update-product-markup" data-product-pricing-form>
        <input type="hidden" name="product_id" value="${product.id}" />
        <label>Наценка
          <span class="input-with-suffix">
            <input name="markup_percent" data-markup-source type="number" step="0.01" min="0" value="${escapeAttr(markup)}" placeholder="400" />
            <span>%</span>
          </span>
        </label>
        <div class="price-inline-preview">
          <span>Цена</span>
          <strong data-product-price-preview data-cost="${escapeAttr(cost)}">${formatCurrency(price)}</strong>
        </div>
        <button class="ghost-button compact" type="submit">Сохранить</button>
      </form>
    </article>
  `;
}

function renderSalesBatchList(product) {
  const batches = getProductBatches(product.id, { availableOnly: true });
  if (!batches.length) {
    return `
      <div class="sales-batches-empty">
        <span>На складе нет готовых единиц</span>
      </div>
    `;
  }

  return `
    <div class="sales-batch-list">
      ${batches
        .map(
          (batch) => `
            <div class="sales-batch-pill">
              <span>${formatDate(batch.created_at)}</span>
              <strong>${formatQty(batch.remaining_quantity)} шт</strong>
              <b>${formatCurrency(batch.sale_price_per_unit)}</b>
            </div>
          `
        )
        .join('')}
    </div>
  `;
}

function renderRecentSalesRows() {
  const sales = state.productStockMovements
    .filter((item) => item.movement_type === 'sale' && item.source_type !== 'shipment')
    .slice(0, 6);
  if (!sales.length) return renderEmpty('Продаж пока нет');

  return `
    <div class="production-history-list">
      ${sales
        .map(
          (item) => `
            <article class="production-history-row">
              <div>
                <strong>${escapeHtml(item.products?.name ?? 'Изделие')}</strong>
                <time>${formatDate(item.created_at)}</time>
              </div>
              <span>${Math.abs(toNumber(item.quantity_delta))} шт</span>
              <span>${item.product_batches?.sale_price_per_unit !== undefined ? formatCurrency(item.product_batches.sale_price_per_unit) : 'цена'}</span>
            </article>
          `
        )
        .join('')}
    </div>
  `;
}

function renderMoldView() {
  const editingCalculation = getEditingMoldCalculation();
  const editingItems = editingCalculation ? getMoldEditableItems(editingCalculation) : [];
  const componentRows = editingItems.length
    ? editingItems.map((item, index) => renderMoldComponentRow(index, item)).join('')
    : renderMoldComponentRow(0);

  return `
    <section class="mold-lab-layout">
      <div class="panel mold-composer-panel">
        <div class="panel-head">
          <div>
            <p class="panel-kicker">${editingCalculation ? 'Редактирование' : 'Молд'}</p>
            <h2>${editingCalculation ? escapeHtml(editingCalculation.title || 'Без названия') : 'Молд и состав'}</h2>
          </div>
          ${
            editingCalculation
              ? '<button class="ghost-button compact" data-action="new-mold-calculation" type="button">Новый расчет</button>'
              : '<i data-lucide="beaker"></i>'
          }
        </div>
        <form class="stack-form mold-form" data-action="save-mold-calculation">
          <input type="hidden" name="calculation_id" value="${escapeAttr(editingCalculation?.id ?? '')}" />
          <label>Что заливаем<input name="title" value="${escapeAttr(editingCalculation?.title ?? '')}" placeholder="Часы Wave" /></label>
          <div class="form-grid">
            <label>Объем молда
              <span class="input-with-suffix">
                <input name="mold_volume_ml" type="number" step="0.001" min="0.001" required value="${escapeAttr(editingCalculation?.mold_volume_ml ?? '')}" placeholder="120" data-mold-source />
                <span>мл</span>
              </span>
            </label>
            <label>Заполнение
              <span class="input-with-suffix">
                <input name="fill_percent" type="number" step="0.1" min="0.1" value="${escapeAttr(editingCalculation?.fill_percent ?? 100)}" required data-mold-source />
                <span>%</span>
              </span>
            </label>
          </div>

          <div class="mold-component-head">
            <div>
              <p class="panel-kicker">Компоненты</p>
              <h3>Материалы со склада</h3>
            </div>
            <button class="ghost-button compact" data-action="add-mold-component" type="button" ${!state.materials.length ? 'disabled' : ''}>
              <i data-lucide="plus"></i>
              Добавить
            </button>
          </div>
          <div class="mold-component-list" data-mold-component-list>
            ${state.materials.length ? componentRows : renderMoldNoMaterials()}
          </div>

          <label>Заметка<textarea name="notes" rows="3" placeholder="Например: прозрачная база, зеленый пигмент, золото">${escapeHtml(editingCalculation?.notes ?? '')}</textarea></label>
          <button class="primary-button" type="submit" ${!state.materials.length ? 'disabled' : ''}>
            <i data-lucide="save"></i>
            ${editingCalculation ? 'Сохранить изменения' : 'Сохранить расчет'}
          </button>
        </form>
      </div>

      <div class="mold-side-column">
        <div class="panel mold-summary-panel">
          <div class="panel-head">
            <div>
              <p class="panel-kicker">Итог</p>
              <h2 data-mold-cost-total>0 ₽</h2>
            </div>
            <i data-lucide="sigma"></i>
          </div>
          <div class="mold-summary-grid">
            <div>
              <span>Нужно залить</span>
              <strong data-mold-target-volume>0 мл</strong>
            </div>
            <div>
              <span>Добавлено</span>
              <strong data-mold-used-volume>0</strong>
            </div>
            <div>
              <span>Склад</span>
              <strong data-mold-stock-status>Выберите материалы</strong>
            </div>
          </div>
        </div>

        <div class="panel wide-panel mold-history-panel">
          <div class="panel-head">
            <div>
              <p class="panel-kicker">Библиотека</p>
              <h2>${state.moldCalculations.length ? `${state.moldCalculations.length} расчетов` : 'Пока пусто'}</h2>
            </div>
            <i data-lucide="archive"></i>
          </div>
          ${renderMoldRows()}
        </div>
      </div>
    </section>
  `;
}

function renderMoldNoMaterials() {
  return `
    <div class="inventory-empty mold-empty">
      <div class="empty-orb"><i data-lucide="layers-3"></i></div>
      <h3>Сырья пока нет</h3>
      <p>Добавьте смолу, пигменты или другие компоненты на склад.</p>
      <button class="primary-button compact" data-view="warehouse" type="button">Открыть склад</button>
    </div>
  `;
}

function renderMoldComponentRow(index = 0, item = null) {
  return `
    <article class="mold-component-row" data-mold-row>
      <label>
        Материал
        <select name="mold_material_id[]" data-mold-material>
          ${renderMoldMaterialOptions(item?.material_id ?? '')}
        </select>
      </label>
      <label>
        Сколько нужно
        <span class="input-with-suffix">
          <input name="mold_quantity[]" type="number" step="0.001" min="0" value="${escapeAttr(item?.quantity ?? '')}" placeholder="${index === 0 ? '100' : '0'}" data-mold-quantity />
          <span data-mold-unit>ед.</span>
        </span>
      </label>
      <div class="mold-row-result">
        <span data-mold-stock>На складе</span>
        <strong data-mold-line-cost>0 ₽</strong>
      </div>
      <button class="icon-button mold-row-remove" data-action="remove-mold-component" type="button" title="Убрать компонент">
        <i data-lucide="x"></i>
      </button>
    </article>
  `;
}

function renderMoldMaterialOptions(selectedId = '') {
  return `
    <option value="">Выбрать материал</option>
    ${state.materials
      .map((material) => {
        const unit = UNIT_LABELS[material.unit] ?? material.unit ?? 'ед.';
        return `<option value="${material.id}" data-unit="${escapeAttr(unit)}" data-price="${escapeAttr(material.unit_price ?? 0)}" data-stock="${escapeAttr(material.current_stock ?? 0)}" ${selectedId === material.id ? 'selected' : ''}>${escapeHtml(material.name)} · ${unit}</option>`;
      })
      .join('')}
  `;
}

function renderMoldRows() {
  if (!state.moldCalculations.length) return renderEmpty('Сохраненных расчетов пока нет');
  return `
    <div class="mold-history-list">
      ${state.moldCalculations
        .map(
          (item) => {
            const rows = getMoldItems(item.id);
            const cost = getMoldTotalCost(item, rows);
            return `
              <button class="mold-history-card ${state.moldEditor.editingCalculationId === item.id ? 'is-active' : ''}" data-action="edit-mold-calculation" data-calculation-id="${item.id}" type="button">
                <div class="mold-history-top">
                  <div>
                    <time>${formatDate(item.created_at)}</time>
                    <h3>${escapeHtml(item.title || 'Без названия')}</h3>
                  </div>
                  <strong>${formatCurrency(cost)}</strong>
                </div>
                <div class="mold-history-mix">
                  ${rows.length ? rows.map(renderMoldHistoryItem).join('') : renderLegacyMoldHistoryItem(item)}
                </div>
              </button>
            `;
          }
        )
        .join('')}
    </div>
  `;
}

function renderMoldHistoryItem(item) {
  const unit = UNIT_LABELS[item.unit_snapshot] ?? item.unit_snapshot ?? '';
  return `
    <span>
      <b>${escapeHtml(item.material_name_snapshot)}</b>
      ${formatQty(item.quantity)} ${unit}
    </span>
  `;
}

function renderLegacyMoldHistoryItem(item) {
  const unit = UNIT_LABELS[item.unit_snapshot] ?? item.unit_snapshot ?? '';
  return `
    <span>
      <b>${escapeHtml(item.material_name_snapshot || 'Материал')}</b>
      ${formatQty(item.calculated_quantity)} ${unit}
    </span>
  `;
}

function renderHistoryView() {
  return `
    <section class="history-grid">
      <div class="panel">
        <div class="panel-head">
          <div>
            <p class="panel-kicker">Производство</p>
            <h2>Производственные запуски</h2>
          </div>
          <i data-lucide="history"></i>
        </div>
        ${renderCalculationRows()}
      </div>
      <div class="panel">
        <div class="panel-head">
          <div>
            <p class="panel-kicker">Склад</p>
            <h2>Движения сырья</h2>
          </div>
          <i data-lucide="activity"></i>
        </div>
        ${renderMovementRows(state.stockMovements)}
      </div>
      <div class="panel">
        <div class="panel-head">
          <div>
            <p class="panel-kicker">Продукция</p>
            <h2>Движения изделий</h2>
          </div>
          <i data-lucide="package-check"></i>
        </div>
        ${renderProductMovementRows(state.productStockMovements)}
      </div>
    </section>
  `;
}

function renderCalculationRows() {
  if (!state.calculations.length) return renderEmpty('Пусто');
  return `
    <div class="timeline-list">
      ${state.calculations
        .map(
          (item) => `
            <article class="timeline-item">
              <time>${formatDate(item.created_at)}</time>
              <h3>${escapeHtml(item.product_name_snapshot)}</h3>
              <div class="timeline-metrics">
                <span>${formatQty(item.batch_quantity)} шт</span>
                <span>${formatCurrency(item.material_cost_total)}</span>
                <span>${formatCurrency(item.profit_total)} прибыль</span>
              </div>
            </article>
          `
        )
        .join('')}
    </div>
  `;
}

function renderMovementRows(rows) {
  if (!rows.length) return renderEmpty('Пусто');
  return `
    <div class="movement-list">
      ${rows
        .map((item) => {
          const sign = toNumber(item.quantity_delta) > 0 ? '+' : '';
          return `
            <article class="movement-row">
              <div>
                <strong>${escapeHtml(item.materials?.name ?? 'Материал')}</strong>
                <span>${movementLabel(item)}</span>
              </div>
              <p>${sign}${formatQty(item.quantity_delta)} ${UNIT_LABELS[item.materials?.unit] ?? item.materials?.unit ?? ''}</p>
            </article>
          `;
        })
        .join('')}
    </div>
  `;
}

function renderProductMovementRows(rows) {
  if (!rows.length) return renderEmpty('Пусто');
  return `
    <div class="movement-list">
      ${rows
        .map((item) => {
          const sign = toNumber(item.quantity_delta) > 0 ? '+' : '';
          return `
            <article class="movement-row">
              <div>
                <strong>${escapeHtml(item.products?.name ?? 'Изделие')}</strong>
                <span>${productMovementLabel(item)}</span>
              </div>
              <p>${sign}${formatQty(item.quantity_delta)} шт</p>
            </article>
          `;
        })
        .join('')}
    </div>
  `;
}

function renderSelect(name, options, selectedValue = '') {
  return `
    <select name="${name}">
      ${Object.entries(options)
        .map(([value, label]) => `<option value="${value}" ${selectedValue === value ? 'selected' : ''}>${label}</option>`)
        .join('')}
    </select>
  `;
}

function renderFilePicker() {
  return `
    <label class="file-picker">
      <span>Фото</span>
      <input name="photo" type="file" accept="image/*" data-file-picker />
      <span class="file-picker-box">
        <span class="file-picker-preview" data-file-preview></span>
        <span class="file-picker-copy">
          <span class="file-picker-title">Выбрать фото</span>
          <span class="file-picker-name" data-file-name>Файл не выбран</span>
        </span>
      </span>
    </label>
  `;
}

function renderEmpty(text) {
  return `
    <div class="empty-state">
      <i data-lucide="circle-dashed"></i>
      <span>${text}</span>
    </div>
  `;
}

function enhanceSelects() {
  document.querySelectorAll('select:not([data-select-enhanced])').forEach((select) => {
    select.dataset.selectEnhanced = 'true';
    select.classList.add('native-select-hidden');

    const shell = document.createElement('div');
    shell.className = 'select-ui';
    shell.innerHTML = `
      <button class="select-ui-button" data-select-toggle type="button" aria-haspopup="listbox" aria-expanded="false" ${select.disabled ? 'disabled' : ''}>
        <span class="select-ui-value"></span>
        <span class="select-ui-mark" aria-hidden="true"></span>
      </button>
      <div class="select-ui-menu" role="listbox"></div>
    `;

    const menu = shell.querySelector('.select-ui-menu');
    [...select.options].forEach((option) => {
      const item = document.createElement('button');
      item.className = 'select-ui-option';
      item.type = 'button';
      item.dataset.selectOption = '';
      item.dataset.value = option.value;
      item.setAttribute('role', 'option');
      item.textContent = option.textContent;
      if (option.disabled) item.disabled = true;
      menu.appendChild(item);
    });

    select.insertAdjacentElement('afterend', shell);
    syncCustomSelect(select);
  });
}

function syncCustomSelect(select) {
  const shell = select.nextElementSibling;
  if (!shell?.classList.contains('select-ui')) return;

  const selected = select.selectedOptions?.[0] ?? select.options[0];
  const value = shell.querySelector('.select-ui-value');
  const options = shell.querySelectorAll('[data-select-option]');

  if (value) value.textContent = selected?.textContent || 'Выбрать';
  options.forEach((option) => {
    const isSelected = option.dataset.value === select.value;
    option.classList.toggle('is-selected', isSelected);
    option.setAttribute('aria-selected', String(isSelected));
  });
}

function closeCustomSelects() {
  document.querySelectorAll('.select-ui.is-open').forEach((shell) => {
    shell.classList.remove('is-open');
    shell.querySelector('[data-select-toggle]')?.setAttribute('aria-expanded', 'false');
  });
}

function updateMaterialFormPreview(form) {
  if (!form) return;
  const cost = toNumber(form.querySelector('[name="package_cost"]')?.value);
  const quantity = toNumber(form.querySelector('[name="package_quantity"]')?.value);
  const unit = form.querySelector('[name="unit"]')?.value ?? 'g';
  const unitLabel = UNIT_LABELS[unit] ?? unit;
  const price = quantity > 0 ? cost / quantity : 0;
  const label = form.querySelector('[data-unit-price-label]');
  const value = form.querySelector('[data-unit-price-value]');

  if (label) label.textContent = `Цена за ${unitLabel}`;
  if (value) value.textContent = formatCurrency(price);
}

function updateRecipeFormPreview(form) {
  if (!form) return;
  const select = form.querySelector('[name="material_id"]');
  const selected = select?.selectedOptions?.[0];
  const unit = selected?.dataset.unit || 'ед.';
  const unitPrice = toNumber(selected?.dataset.price);
  const quantity = toNumber(form.querySelector('[name="quantity_per_unit"]')?.value);
  const cost = quantity * unitPrice;

  form.querySelectorAll('[data-recipe-unit-suffix]').forEach((node) => {
    node.textContent = unit;
  });

  const unitValue = form.querySelector('[data-recipe-unit-value]');
  const priceValue = form.querySelector('[data-recipe-price-value]');
  const costValue = form.querySelector('[data-recipe-cost-value]');

  if (unitValue) unitValue.textContent = unit;
  if (priceValue) priceValue.textContent = `${formatCurrency(unitPrice)} / ${unit}`;
  if (costValue) costValue.textContent = formatCurrency(cost);
}

function updateProductPricePreview(form) {
  if (!form) return;
  const markup = toNumber(form.querySelector('[name="markup_percent"]')?.value);
  const preview = form.querySelector('[data-product-price-preview]');
  const cost = toNumber(preview?.dataset.cost);
  if (!preview) return;
  preview.textContent = `${formatCurrency(calculateSalePriceFromCost(cost, markup))}${preview.closest('.unit-price-preview') ? ' / шт' : ''}`;
}

function updateMoldComposerPreview(form) {
  if (!form) return;
  const targetVolume = toNumber(form.querySelector('[name="mold_volume_ml"]')?.value);
  const fillPercent = toNumber(form.querySelector('[name="fill_percent"]')?.value) || 100;
  const target = targetVolume * (fillPercent / 100);
  const unitTotals = new Map();
  let costTotal = 0;
  let filledRows = 0;
  let shortageRows = 0;

  form.querySelectorAll('[data-mold-row]').forEach((row) => {
    const select = row.querySelector('[data-mold-material]');
    const quantityInput = row.querySelector('[data-mold-quantity]');
    const option = select?.selectedOptions?.[0];
    const unit = option?.dataset.unit || 'ед.';
    const stock = toNumber(option?.dataset.stock);
    const unitPrice = toNumber(option?.dataset.price);
    const quantity = toNumber(quantityInput?.value);
    const cost = quantity * unitPrice;
    const hasMaterial = Boolean(select?.value);
    const hasQuantity = quantity > 0;
    const isShort = hasMaterial && hasQuantity && stock < quantity;

    row.querySelector('[data-mold-unit]').textContent = unit;
    row.querySelector('[data-mold-line-cost]').textContent = hasMaterial && hasQuantity ? formatCurrency(cost) : '0 ₽';
    row.querySelector('[data-mold-stock]').textContent = hasMaterial ? `На складе ${formatQty(stock)} ${unit}` : 'На складе';
    row.classList.toggle('is-short', isShort);

    if (hasMaterial && hasQuantity) {
      filledRows += 1;
      costTotal += cost;
      unitTotals.set(unit, (unitTotals.get(unit) ?? 0) + quantity);
      if (isShort) shortageRows += 1;
    }
  });

  const used = [...unitTotals.entries()].map(([unit, value]) => `${formatQty(value)} ${unit}`).join(' + ') || '0';
  const stockStatus = shortageRows ? `Не хватает: ${shortageRows}` : filledRows ? 'Все есть' : 'Выберите материалы';

  form.closest('.mold-lab-layout')?.querySelector('[data-mold-target-volume]')?.replaceChildren(`${formatQty(target)} мл`);
  form.closest('.mold-lab-layout')?.querySelector('[data-mold-used-volume]')?.replaceChildren(used);
  form.closest('.mold-lab-layout')?.querySelector('[data-mold-cost-total]')?.replaceChildren(formatCurrency(costTotal));
  form.closest('.mold-lab-layout')?.querySelector('[data-mold-stock-status]')?.replaceChildren(stockStatus);
}

function getMoldItems(calculationId) {
  return state.moldCalculationItems.filter((item) => item.calculation_id === calculationId);
}

function getReusableMoldCalculations() {
  return state.moldCalculations.filter((calculation) => getMoldEditableItems(calculation).length > 0);
}

function formatMoldOption(mold) {
  const items = getMoldEditableItems(mold);
  const cost = getMoldTotalCost(mold, getMoldItems(mold.id));
  return `${mold.title || 'Без названия'} · ${items.length} ${pluralRu(items.length, ['компонент', 'компонента', 'компонентов'])} · ${formatCurrency(cost)}`;
}

function getEditingMoldCalculation() {
  return state.moldCalculations.find((item) => item.id === state.moldEditor.editingCalculationId) ?? null;
}

function getMoldEditableItems(calculation) {
  const items = getMoldItems(calculation.id);
  if (items.length) return items;
  if (!calculation.material_id) return [];
  return [
    {
      material_id: calculation.material_id,
      quantity: calculation.calculated_quantity,
    },
  ];
}

function getMoldTotalCost(calculation, items = getMoldItems(calculation.id)) {
  if (items.length) return items.reduce((sum, item) => sum + toNumber(item.total_cost), 0);
  return toNumber(calculation.material_cost_total);
}

function calculateProductCost(productId) {
  return state.productMaterials
    .filter((row) => row.product_id === productId)
    .reduce((sum, row) => {
      const material = row.materials ?? state.materials.find((item) => item.id === row.material_id);
      return sum + toNumber(row.quantity_per_unit) * toNumber(material?.unit_price);
    }, 0);
}

function getProductMarkup(product) {
  return toNumber(product?.markup_percent);
}

function calculateSalePriceFromCost(cost, markupPercent) {
  if (cost <= 0) return 0;
  return Math.round(cost * (1 + markupPercent / 100) * 100) / 100;
}

function calculateProductSalePrice(product) {
  return calculateSalePriceFromCost(calculateProductCost(product.id), getProductMarkup(product));
}

function getProductBatches(productId, options = {}) {
  const batches = state.productBatches.filter((batch) => batch.product_id === productId);
  return options.availableOnly ? batches.filter((batch) => toNumber(batch.remaining_quantity) > 0) : batches;
}

function getProductStock(product) {
  const batches = getProductBatches(product.id);
  if (!batches.length) return toNumber(product.current_stock);
  return batches.reduce((sum, batch) => sum + toNumber(batch.remaining_quantity), 0);
}

function averageMarkupLabel() {
  const markups = state.products
    .map((product) => getProductMarkup(product))
    .filter((value) => value > 0 && Number.isFinite(value));
  if (!markups.length) return '0%';
  return formatPercent(markups.reduce((sum, value) => sum + value, 0) / markups.length);
}

function calculateBatch(productId, batch, salePrice) {
  const recipe = state.productMaterials.filter((row) => row.product_id === productId);
  const items = recipe.map((row) => {
    const material = row.materials ?? state.materials.find((entry) => entry.id === row.material_id);
    const required = batch * toNumber(row.quantity_per_unit);
    const stock = toNumber(material?.current_stock);
    const cost = required * toNumber(material?.unit_price);
    return {
      name: material?.name ?? 'Материал удален',
      unit: UNIT_LABELS[material?.unit] ?? material?.unit ?? '',
      required,
      stock,
      cost,
      enough: stock >= required,
    };
  });
  const costTotal = items.reduce((sum, item) => sum + item.cost, 0);
  const revenue = salePrice * batch;
  const profit = revenue - costTotal;
  const margin = revenue > 0 ? (profit / revenue) * 100 : null;
  return {
    batch,
    items,
    costTotal,
    costPerUnit: costTotal / batch,
    revenue,
    profit,
    margin,
    canProduce: recipe.length > 0 && items.every((item) => item.enough),
  };
}

function getProductionReadiness(productId) {
  const recipe = state.productMaterials.filter((row) => row.product_id === productId);
  const items = recipe.map((row) => {
    const material = row.materials ?? state.materials.find((entry) => entry.id === row.material_id);
    const requiredPerUnit = toNumber(row.quantity_per_unit);
    const stock = toNumber(material?.current_stock);
    const unitPrice = toNumber(material?.unit_price);
    const availableUnits = requiredPerUnit > 0 ? Math.floor(stock / requiredPerUnit) : 0;
    const shortage = Math.max(requiredPerUnit - stock, 0);

    return {
      name: material?.name ?? 'Материал удален',
      unit: UNIT_LABELS[material?.unit] ?? material?.unit ?? '',
      requiredPerUnit,
      stock,
      availableUnits,
      shortage,
      costPerUnit: requiredPerUnit * unitPrice,
      enough: availableUnits > 0,
    };
  });

  if (!items.length) {
    return {
      capacity: 0,
      items,
      tone: 'is-warning',
      kicker: 'Нужен состав',
      title: 'Сначала добавьте состав изделия',
      shortLabel: 'состав не добавлен',
    };
  }

  const capacity = Math.min(...items.map((item) => item.availableUnits));
  if (capacity <= 0) {
    return {
      capacity: 0,
      items,
      tone: 'is-danger',
      kicker: 'Стоп',
      title: 'Сырья не хватает даже на 1 шт',
      shortLabel: 'сырья не хватает',
    };
  }

  return {
    capacity,
    items,
    tone: 'is-ready',
    kicker: 'Готово',
    title: 'Можно запускать партию',
    shortLabel: `можно ${formatQty(capacity)} шт`,
  };
}

document.addEventListener('click', async (event) => {
  const selectToggle = event.target.closest('[data-select-toggle]');
  if (selectToggle) {
    const shell = selectToggle.closest('.select-ui');
    const willOpen = !shell?.classList.contains('is-open');
    closeCustomSelects();
    if (shell && willOpen) {
      shell.classList.add('is-open');
      selectToggle.setAttribute('aria-expanded', 'true');
    }
    return;
  }

  const selectOption = event.target.closest('[data-select-option]');
  if (selectOption) {
    const shell = selectOption.closest('.select-ui');
    const select = shell?.previousElementSibling;
    if (select instanceof HTMLSelectElement && !selectOption.hasAttribute('disabled')) {
      select.value = selectOption.dataset.value ?? '';
      syncCustomSelect(select);
      select.dispatchEvent(new Event('input', { bubbles: true }));
      select.dispatchEvent(new Event('change', { bubbles: true }));
    }
    closeCustomSelects();
    return;
  }

  if (!event.target.closest('.select-ui')) closeCustomSelects();

  const viewButton = event.target.closest('[data-view]');
  if (viewButton) {
    state.view = viewButton.dataset.view;
    render();
    return;
  }

  const actionButton = event.target.closest('[data-action]');
  if (!actionButton) return;

  const { action } = actionButton.dataset;
  if (action === 'logout') {
    await supabase.auth.signOut();
    showToast('Вы вышли из приложения');
  }
  if (action === 'reload') {
    await loadWorkspace();
    showToast('Данные обновлены');
  }
  if (action === 'toggle-theme') {
    state.theme = state.theme === 'dark' ? 'light' : 'dark';
    applyTheme(state.theme, { animate: true });
    syncThemeToggles();
  }
  if (action === 'set-warehouse') {
    state.inventory.type = actionButton.dataset.warehouse === 'products' ? 'products' : 'raw';
    state.inventory.editorOpen = false;
    state.inventory.editingMaterialId = null;
    state.inventory.productEditorOpen = false;
    state.inventory.editingProductId = null;
    render();
  }
  if (action === 'open-material-editor') {
    state.inventory.editorOpen = true;
    state.inventory.editingMaterialId = null;
    render();
  }
  if (action === 'edit-material') {
    state.inventory.editorOpen = true;
    state.inventory.editingMaterialId = actionButton.dataset.materialId;
    render();
  }
  if (action === 'close-material-editor') {
    state.inventory.editorOpen = false;
    state.inventory.editingMaterialId = null;
    render();
  }
  if (action === 'edit-product-stock') {
    state.inventory.productEditorOpen = true;
    state.inventory.editingProductId = actionButton.dataset.productId;
    render();
  }
  if (action === 'close-product-stock-editor') {
    state.inventory.productEditorOpen = false;
    state.inventory.editingProductId = null;
    render();
  }
  if (action === 'open-product-creator') {
    state.productDesigner.creatorOpen = true;
    render();
  }
  if (action === 'close-product-creator') {
    state.productDesigner.creatorOpen = false;
    render();
  }
  if (action === 'open-calculation-dialog') {
    state.calculator.dialogOpen = true;
    render();
  }
  if (action === 'close-calculation-dialog') {
    state.calculator.dialogOpen = false;
    render();
  }
  if (action === 'open-product-flow') {
    state.productFlow.dialogOpen = true;
    state.productFlow.mode = actionButton.dataset.flowMode || 'sale';
    state.productFlow.productId = actionButton.dataset.productId || state.calculator.productId || state.activeProductId || '';
    render();
  }
  if (action === 'close-product-flow') {
    state.productFlow.dialogOpen = false;
    render();
  }
  if (action === 'add-mold-component') {
    const form = actionButton.closest('form');
    form?.querySelector('[data-mold-component-list]')?.insertAdjacentHTML('beforeend', renderMoldComponentRow(Date.now()));
    requestAnimationFrame(() => {
      enhanceSelects();
      updateMoldComposerPreview(form);
      window.lucide?.createIcons({ attrs: { 'stroke-width': 1.8 } });
    });
  }
  if (action === 'remove-mold-component') {
    const form = actionButton.closest('form');
    const rows = form?.querySelectorAll('[data-mold-row]');
    if (rows && rows.length > 1) {
      actionButton.closest('[data-mold-row]')?.remove();
    } else {
      const row = actionButton.closest('[data-mold-row]');
      const select = row?.querySelector('[data-mold-material]');
      const input = row?.querySelector('[data-mold-quantity]');
      if (select) select.value = '';
      if (input) input.value = '';
      if (select) syncCustomSelect(select);
    }
    updateMoldComposerPreview(form);
  }
  if (action === 'edit-mold-calculation') {
    state.moldEditor.editingCalculationId = actionButton.dataset.calculationId ?? null;
    render();
  }
  if (action === 'new-mold-calculation') {
    state.moldEditor.editingCalculationId = null;
    render();
  }
  if (action === 'open-registration') {
    state.auth.registrationOpen = true;
    state.auth.confirmEmail = '';
    render();
    requestAnimationFrame(() => document.querySelector('[data-registration-email]')?.focus());
  }
  if (action === 'close-registration') {
    state.auth.registrationOpen = false;
    render();
  }
  if (action === 'close-confirm') {
    state.auth.confirmEmail = '';
    render();
  }
  if (action === 'select-product') {
    state.activeProductId = actionButton.dataset.productId;
    render();
  }
  if (action === 'select-calculator-product') {
    state.calculator.productId = actionButton.dataset.productId;
    state.activeProductId = actionButton.dataset.productId;
    render();
  }
  if (action === 'delete-recipe-item') {
    await deleteRecipeItem(actionButton.dataset.id);
  }
});

document.addEventListener('input', (event) => {
  const target = event.target;
  if (!(target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement)) return;
  if (target.matches('[data-file-picker]')) {
    const label = target.closest('.file-picker');
    const name = label?.querySelector('[data-file-name]');
    const box = label?.querySelector('.file-picker-box');
    const preview = label?.querySelector('[data-file-preview]');
    const file = target.files?.[0];
    if (name) name.textContent = file ? compactFileName(file.name) : 'Файл не выбран';
    box?.classList.toggle('is-selected', Boolean(file));
    if (preview) {
      if (preview.dataset.previewUrl) URL.revokeObjectURL(preview.dataset.previewUrl);
      preview.style.backgroundImage = '';
      preview.dataset.previewUrl = '';
      if (file?.type.startsWith('image/')) {
        const url = URL.createObjectURL(file);
        preview.dataset.previewUrl = url;
        preview.style.backgroundImage = `url("${url}")`;
      }
    }
  }
  if (target.matches('[data-material-unit-select]')) {
    const unitLabel = UNIT_LABELS[target.value] ?? target.value;
    target.closest('form')?.querySelectorAll('[data-unit-suffix]').forEach((node) => {
      node.textContent = unitLabel;
    });
    updateMaterialFormPreview(target.closest('form'));
  }
  if (target.matches('[data-material-price-source]')) {
    updateMaterialFormPreview(target.closest('form'));
  }
  if (target.matches('[data-recipe-material], [data-recipe-source]')) {
    updateRecipeFormPreview(target.closest('form'));
  }
  if (target.matches('[data-markup-source]')) {
    updateProductPricePreview(target.closest('form'));
  }
  if (target.matches('[data-mold-material], [data-mold-source], [data-mold-quantity]')) {
    updateMoldComposerPreview(target.closest('form'));
  }
});

document.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape') return;
  const openedSelect = document.querySelector('.select-ui.is-open');
  if (openedSelect) {
    closeCustomSelects();
    return;
  }
  if (state.productFlow.dialogOpen) {
    state.productFlow.dialogOpen = false;
    render();
    return;
  }
  if (state.calculator.dialogOpen) {
    state.calculator.dialogOpen = false;
    render();
    return;
  }
  if (state.productDesigner.creatorOpen) {
    state.productDesigner.creatorOpen = false;
    render();
    return;
  }
  if (state.inventory.productEditorOpen) {
    state.inventory.productEditorOpen = false;
    state.inventory.editingProductId = null;
    render();
    return;
  }
  if (state.inventory.editorOpen) {
    state.inventory.editorOpen = false;
    state.inventory.editingMaterialId = null;
    render();
    return;
  }
  if (state.auth.registrationOpen) {
    state.auth.registrationOpen = false;
    render();
  }
});

document.addEventListener('submit', async (event) => {
  const form = event.target.closest('form[data-action]');
  if (!form) return;
  event.preventDefault();

  const action = form.dataset.action;

  try {
    setBusy(form, true);
    if (action === 'auth') await handleAuth(form);
    if (action === 'signup') await handleSignup(form);
    if (action === 'create-material') await createMaterial(form);
    if (action === 'update-material') await updateMaterial(form);
    if (action === 'update-product-stock') await updateProductStock(form);
    if (action === 'stock-movement') await createStockMovement(form);
    if (action === 'create-product') await createProduct(form);
    if (action === 'apply-mold-to-product') await applyMoldToProduct(form);
    if (action === 'update-product-markup') await updateProductMarkup(form);
    if (action === 'finalize-calculation') await finalizeCalculation(form);
    if (action === 'product-flow-movement') await createProductFlowMovement(form);
    if (action === 'save-mold-calculation') await saveMoldCalculation(form);
  } catch (error) {
    console.warn('Form action failed:', error);
    showToast(toUserMessage(error), 'error');
  } finally {
    setBusy(form, false);
  }
});

async function handleAuth(form) {
  const formData = new FormData(form);
  const email = String(formData.get('email') ?? '').trim();
  const password = String(formData.get('password') ?? '');
  if (!email) throw new Error('Email не указан');
  if (!password) throw new Error('Пароль не указан');
  if (password.length < 6) throw new Error('Короткий пароль');

  const response = await supabase.auth.signInWithPassword({ email, password });

  if (response.error) throw response.error;
  showToast('Вход выполнен');
}

async function handleSignup(form) {
  const formData = new FormData(form);
  const email = String(formData.get('email') ?? '').trim();
  const password = String(formData.get('password') ?? '');
  const passwordConfirm = String(formData.get('password_confirm') ?? '');

  if (!email) throw new Error('Email не указан');
  if (!password) throw new Error('Пароль не указан');
  if (password.length < 6) throw new Error('Короткий пароль');
  if (password !== passwordConfirm) throw new Error('Пароли не совпадают');

  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: getAuthRedirectUrl(),
      data: { display_name: email },
    },
  });
  if (error) throw error;

  state.auth.registrationOpen = false;
  state.auth.confirmEmail = email;
  form.reset();
  render();
}

async function createMaterial(form) {
  const data = new FormData(form);
  const userId = requireUserId();
  const packageCost = toNumber(data.get('package_cost'));
  const packageQuantity = toNumber(data.get('package_quantity'));
  const initialStock = toNumber(data.get('initial_stock'));
  const file = data.get('photo');
  const photoPath = file instanceof File && file.size ? await uploadPhoto(file, 'materials') : null;

  const { data: material, error } = await supabase
    .from('materials')
    .insert({
      user_id: userId,
      name: String(data.get('name')).trim(),
      category: String(data.get('category')),
      unit: String(data.get('unit')),
      package_cost: packageCost,
      package_quantity: packageQuantity,
      min_stock: toNumber(data.get('min_stock')),
      photo_path: photoPath,
      purchase_url: optionalString(data.get('purchase_url')),
      notes: optionalString(data.get('notes')),
    })
    .select()
    .single();
  if (error) throw error;

  if (initialStock > 0) {
    await insertStockMovement({
      materialId: material.id,
      type: 'receipt',
      sourceType: 'initial',
      quantityDelta: initialStock,
      unitCost: packageCost / packageQuantity,
      comment: 'Стартовый остаток',
    });
  }

  form.reset();
  state.inventory.editorOpen = false;
  state.inventory.editingMaterialId = null;
  await loadWorkspace();
  showToast('Материал добавлен');
}

async function updateMaterial(form) {
  const data = new FormData(form);
  const materialId = String(data.get('material_id'));
  const material = state.materials.find((entry) => entry.id === materialId);
  if (!material) throw new Error('Материал не найден');

  const packageCost = toNumber(data.get('package_cost'));
  const packageQuantity = toNumber(data.get('package_quantity'));
  const file = data.get('photo');
  const nextPhotoPath = file instanceof File && file.size ? await uploadPhoto(file, 'materials') : material.photo_path;

  const { error } = await supabase
    .from('materials')
    .update({
      name: String(data.get('name')).trim(),
      category: String(data.get('category')),
      unit: String(data.get('unit')),
      package_cost: packageCost,
      package_quantity: packageQuantity,
      min_stock: toNumber(data.get('min_stock')),
      photo_path: nextPhotoPath,
      purchase_url: optionalString(data.get('purchase_url')),
      notes: optionalString(data.get('notes')),
    })
    .eq('id', materialId)
    .eq('user_id', requireUserId());
  if (error) throw error;

  const stockMode = String(data.get('stock_mode') ?? '');
  const stockQuantityRaw = String(data.get('stock_quantity') ?? '').trim();
  if (stockMode && stockQuantityRaw) {
    const quantity = toNumber(stockQuantityRaw);
    const quantityDelta = stockMode === 'adjustment' ? quantity - toNumber(material.current_stock) : quantity;
    if (quantityDelta !== 0) {
      await insertStockMovement({
        materialId,
        type: stockMode === 'adjustment' ? 'adjustment' : 'receipt',
        sourceType: stockMode === 'adjustment' ? 'correction' : 'manual',
        quantityDelta,
        unitCost: packageQuantity > 0 ? packageCost / packageQuantity : toNumber(material.unit_price),
        comment: stockMode === 'adjustment' ? 'Ручная корректировка остатка' : 'Пополнение склада',
      });
    }
  }

  state.inventory.editorOpen = false;
  state.inventory.editingMaterialId = null;
  await loadWorkspace();
  showToast('Товар обновлен');
}

async function createStockMovement(form) {
  const data = new FormData(form);
  const materialId = String(data.get('material_id'));
  const mode = String(data.get('mode'));
  const quantity = toNumber(data.get('quantity'));
  const material = state.materials.find((entry) => entry.id === materialId);
  if (!material) throw new Error('Материал не найден');

  const quantityDelta = mode === 'adjustment' ? quantity - toNumber(material.current_stock) : quantity;
  if (quantityDelta === 0) throw new Error('Остаток не изменился');

  await insertStockMovement({
    materialId,
    type: mode === 'adjustment' ? 'adjustment' : 'receipt',
    sourceType: mode === 'adjustment' ? 'correction' : 'manual',
    quantityDelta,
    unitCost: toNumber(material.unit_price),
    comment: mode === 'adjustment' ? 'Ручная корректировка остатка' : 'Пополнение склада',
  });

  form.reset();
  await loadWorkspace();
  showToast(mode === 'adjustment' ? 'Остаток скорректирован' : 'Приход проведен');
}

async function insertStockMovement({ materialId, type, sourceType, quantityDelta, unitCost, comment }) {
  const { error } = await supabase.from('stock_movements').insert({
    user_id: requireUserId(),
    material_id: materialId,
    movement_type: type,
    source_type: sourceType,
    quantity_delta: quantityDelta,
    unit_cost: unitCost,
    comment,
  });
  if (error) throw error;
}

async function updateProductStock(form) {
  const data = new FormData(form);
  const productId = String(data.get('product_id'));
  const product = state.products.find((entry) => entry.id === productId);
  if (!product) throw new Error('Изделие не найдено');

  const markup = toNumber(data.get('markup_percent'));
  const price = calculateSalePriceFromCost(calculateProductCost(productId), markup);
  const { error } = await supabase
    .from('products')
    .update({
      min_stock: toNumber(data.get('min_stock')),
      markup_percent: markup,
      default_sale_price: price,
    })
    .eq('id', productId)
    .eq('user_id', requireUserId());
  if (error) throw error;

  state.inventory.productEditorOpen = false;
  state.inventory.editingProductId = null;
  await loadWorkspace();
  showToast('Склад продукции обновлен');
}

async function insertProductStockMovement({ productId, type, sourceType, quantityDelta, comment }) {
  const { error } = await supabase.from('product_stock_movements').insert({
    user_id: requireUserId(),
    product_id: productId,
    movement_type: type,
    source_type: sourceType,
    quantity_delta: quantityDelta,
    comment,
  });
  if (error) throw error;
}

async function createProduct(form) {
  const data = new FormData(form);
  const file = data.get('photo');
  const photoPath = file instanceof File && file.size ? await uploadPhoto(file, 'products') : null;
  const markup = toNumber(data.get('markup_percent'));

  const { data: product, error } = await supabase
    .from('products')
    .insert({
      user_id: requireUserId(),
      name: String(data.get('name')).trim(),
      markup_percent: markup,
      default_sale_price: 0,
      photo_path: photoPath,
      description: optionalString(data.get('description')),
    })
    .select()
    .single();
  if (error) throw error;

  state.activeProductId = product.id;
  state.calculator.productId = product.id;
  state.productDesigner.creatorOpen = false;
  form.reset();
  await loadWorkspace();
  showToast('Изделие добавлено');
}

async function applyMoldToProduct(form) {
  const data = new FormData(form);
  const productId = String(data.get('product_id'));
  const moldId = String(data.get('mold_calculation_id'));
  const product = state.products.find((entry) => entry.id === productId);
  const mold = state.moldCalculations.find((entry) => entry.id === moldId);
  const items = mold ? getMoldEditableItems(mold) : [];

  if (!product) throw new Error('Изделие не найдено');
  if (!mold) throw new Error('Расчет не найден');
  if (!items.length) throw new Error('В расчете нет компонентов');

  for (const item of items) {
    const materialId = item.material_id;
    const quantity = toNumber(item.quantity);
    const existing = state.productMaterials.find((row) => row.product_id === productId && row.material_id === materialId);

    if (existing) {
      const { error } = await supabase
        .from('product_materials')
        .update({
          quantity_per_unit: quantity,
          waste_percent: 0,
          notes: `Из расчета: ${mold.title || 'молд'}`,
        })
        .eq('id', existing.id)
        .eq('user_id', requireUserId());
      if (error) throw error;
    } else {
      const { error } = await supabase.from('product_materials').insert({
        user_id: requireUserId(),
        product_id: productId,
        material_id: materialId,
        quantity_per_unit: quantity,
        waste_percent: 0,
        notes: `Из расчета: ${mold.title || 'молд'}`,
      });
      if (error) throw error;
    }
  }

  await loadWorkspace();
  await syncProductSalePrice(productId);
  await loadWorkspace();
  showToast('Расчет применен к изделию');
}

async function deleteRecipeItem(id) {
  const row = state.productMaterials.find((item) => item.id === id);
  const { error } = await supabase.from('product_materials').delete().eq('id', id).eq('user_id', requireUserId());
  if (error) throw error;
  await loadWorkspace();
  if (row?.product_id) {
    await syncProductSalePrice(row.product_id);
    await loadWorkspace();
  }
  showToast('Компонент удален');
}

async function syncProductSalePrice(productId) {
  const product = state.products.find((entry) => entry.id === productId);
  if (!product) return;

  const price = calculateProductSalePrice(product);
  const { error } = await supabase
    .from('products')
    .update({ default_sale_price: price })
    .eq('id', productId)
    .eq('user_id', requireUserId());
  if (error) throw error;
}

async function updateProductMarkup(form) {
  const data = new FormData(form);
  const productId = String(data.get('product_id'));
  const markup = toNumber(data.get('markup_percent'));
  const price = calculateSalePriceFromCost(calculateProductCost(productId), markup);
  const { error } = await supabase
    .from('products')
    .update({ markup_percent: markup, default_sale_price: price })
    .eq('id', productId)
    .eq('user_id', requireUserId());
  if (error) throw error;
  await loadWorkspace();
  showToast('Наценка сохранена');
}

async function finalizeCalculation(form) {
  const data = new FormData(form);
  const productId = String(data.get('product_id'));
  const batch = toNumber(data.get('batch_quantity'));
  const salePrice = toNumber(data.get('sale_price_per_unit'));
  const estimate = calculateBatch(productId, batch, salePrice);

  if (!estimate.canProduce) throw new Error('Недостаточно материалов для списания');

  const { data: calculationId, error } = await supabase.rpc('finalize_production_calculation', {
    p_product_id: productId,
    p_batch_quantity: batch,
    p_sale_price_per_unit: salePrice,
    p_notes: optionalString(data.get('notes')),
  });
  if (error) throw error;

  state.calculator.notes = '';
  state.calculator.dialogOpen = false;
  await loadWorkspace();
  showToast(`Партия проведена. Расчет ${String(calculationId).slice(0, 8)}`);
}

async function createProductFlowMovement(form) {
  const data = new FormData(form);
  const batchId = String(data.get('batch_id'));
  const modeKey = String(data.get('movement_mode') ?? 'sale');
  const mode = PRODUCT_FLOW_MODES[modeKey] ?? PRODUCT_FLOW_MODES.sale;
  const batch = state.productBatches.find((entry) => entry.id === batchId);
  const quantity = toNumber(data.get('quantity'));

  if (!batch) throw new Error('Партия не найдена');
  if (quantity <= 0) throw new Error('Укажите количество');

  const isOutgoing = mode.value === 'sale' || mode.value === 'shipment';
  if (isOutgoing && quantity > toNumber(batch.remaining_quantity)) throw new Error('В этом остатке нет такого количества');

  const { error } = await supabase.rpc('create_product_batch_movement', {
    p_batch_id: batchId,
    p_mode: mode.value,
    p_quantity: quantity,
    p_comment: optionalString(data.get('comment')) || mode.title,
  });
  if (error) throw error;

  state.productFlow.dialogOpen = false;
  await loadWorkspace();
  showToast(mode.toast);
}

async function saveMoldCalculation(form) {
  const data = new FormData(form);
  const calculationId = optionalString(data.get('calculation_id'));
  const materialIds = data.getAll('mold_material_id[]').map((value) => String(value));
  const quantities = data.getAll('mold_quantity[]').map(toNumber);
  const items = materialIds
    .map((materialId, index) => {
      const material = state.materials.find((entry) => entry.id === materialId);
      const quantity = quantities[index] ?? 0;
      if (!materialId && quantity <= 0) return null;
      if (!material) throw new Error('Выберите материал');
      if (quantity <= 0) throw new Error('Укажите количество компонента');
      return {
        user_id: requireUserId(),
        material_id: material.id,
        material_name_snapshot: material.name,
        unit_snapshot: material.unit,
        quantity,
        unit_price_snapshot: toNumber(material.unit_price),
      };
    })
    .filter(Boolean);

  if (!items.length) throw new Error('Добавьте хотя бы один компонент');

  const payload = {
    title: optionalString(data.get('title')),
    material_id: null,
    material_name_snapshot: null,
    unit_snapshot: null,
    mold_volume_ml: toNumber(data.get('mold_volume_ml')),
    fill_percent: toNumber(data.get('fill_percent')) || 100,
    waste_percent: 0,
    unit_price_snapshot: 0,
    sale_price: 0,
    notes: optionalString(data.get('notes')),
  };

  let savedCalculationId = calculationId;
  if (calculationId) {
    const { error } = await supabase
      .from('mold_calculations')
      .update(payload)
      .eq('id', calculationId)
      .eq('user_id', requireUserId());
    if (error) throw error;

    const { error: deleteError } = await supabase
      .from('mold_calculation_items')
      .delete()
      .eq('calculation_id', calculationId)
      .eq('user_id', requireUserId());
    if (deleteError) throw deleteError;
  } else {
    const { data: calculation, error } = await supabase
      .from('mold_calculations')
      .insert({
        user_id: requireUserId(),
        ...payload,
      })
      .select('id')
      .single();
    if (error) throw error;
    savedCalculationId = calculation.id;
  }

  const rows = items.map((item) => ({ ...item, calculation_id: savedCalculationId }));
  const { error: itemsError } = await supabase.from('mold_calculation_items').insert(rows);
  if (itemsError) throw itemsError;

  if (!calculationId) form.reset();
  state.moldEditor.editingCalculationId = null;
  await loadWorkspace();
  showToast(calculationId ? 'Расчет молда обновлен' : 'Расчет молда сохранен');
}

async function uploadPhoto(file, folder) {
  const userId = requireUserId();
  const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg';
  const safeName = `${crypto.randomUUID?.() ?? Date.now()}.${ext}`;
  const path = `${userId}/${folder}/${safeName}`;
  const { error } = await supabase.storage.from(PHOTO_BUCKET).upload(path, file, {
    cacheControl: '3600',
    upsert: true,
  });
  if (error) throw error;
  return path;
}

function setBusy(form, busy) {
  form.toggleAttribute('aria-busy', busy);
  form.querySelectorAll('button').forEach((node) => {
    node.disabled = busy;
  });
}

function requireUserId() {
  if (!state.user?.id) throw new Error('Нужно войти в аккаунт');
  return state.user.id;
}

function getPhotoUrl(path) {
  if (!path) return '';
  return state.photoUrls.get(path) ?? '';
}

function movementLabel(item) {
  const created = formatDate(item.created_at);
  if (item.movement_type === 'receipt') return `приход · ${created}`;
  if (item.movement_type === 'writeoff') return `списание · ${created}`;
  return `корректировка · ${created}`;
}

function productMovementLabel(item) {
  const created = formatDate(item.created_at);
  return `${productMovementShortLabel(item)} · ${created}`;
}

function productMovementShortLabel(item) {
  if (item.source_type === 'shipment') return 'отправка';
  if (item.source_type === 'return') return 'возврат';
  if (item.movement_type === 'production') return 'производство';
  if (item.movement_type === 'receipt') return 'приход';
  if (item.movement_type === 'sale') return 'продажа';
  return 'корректировка';
}

function showToast(message, type = 'ok') {
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  toastZone.appendChild(toast);
  setTimeout(() => toast.remove(), 4200);
}

function getAuthRedirectUrl() {
  return `${window.location.origin}${window.location.pathname}`;
}

function readTheme() {
  const saved = localStorage.getItem(THEME_KEY);
  if (saved === 'light' || saved === 'dark') return saved;
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

function applyTheme(theme, options = {}) {
  const { persist = true, animate = false } = options;
  const root = document.documentElement;

  if (animate) {
    root.classList.remove('theme-is-shifting');
    void root.offsetWidth;
    root.classList.add('theme-is-shifting');
    window.setTimeout(() => root.classList.remove('theme-is-shifting'), 760);
  }

  root.dataset.theme = theme;
  if (persist) localStorage.setItem(THEME_KEY, theme);
  sceneController?.setTheme(theme);
}

function syncThemeToggles() {
  const isLight = state.theme === 'light';
  document.querySelectorAll('.theme-toggle').forEach((button) => {
    button.classList.toggle('is-light', isLight);
    button.classList.toggle('is-dark', !isLight);
    button.setAttribute('aria-pressed', String(isLight));
  });
}

function toUserMessage(error) {
  const message = String(error?.message ?? error ?? '').toLowerCase();
  if (!message) return 'Не получилось';
  if (message.includes('email not confirmed') || message.includes('not confirmed')) return 'Проверьте почту';
  if (message.includes('user already registered') || message.includes('already registered')) return 'Аккаунт уже есть';
  if (message.includes('signup disabled') || message.includes('signups not allowed')) return 'Регистрация закрыта';
  if (message.includes('invalid email') || message.includes('validate email')) return 'Проверьте email';
  if (message.includes('email rate limit') || message.includes('over email send rate limit')) return 'Письмо уже отправлено';
  if (message.includes('password should be at least') || message.includes('weak password')) return 'Короткий пароль';
  if (message.includes('invalid login') || message.includes('invalid credentials')) return 'Проверьте вход';
  if (message.includes('email') && message.includes('already')) return 'Email уже занят';
  if (message.includes('rate limit') || message.includes('too many')) return 'Попробуйте позже';
  if (message.includes('network') || message.includes('fetch')) return 'Нет связи';
  if (message.includes('storage') || message.includes('bucket') || message.includes('upload')) return 'Фото не загрузилось';
  if (message.includes('insufficient') || message.includes('negative stock') || message.includes('not enough')) return 'Недостаточно остатка';
  return error?.message && !/[a-z]{3,}/i.test(error.message) ? error.message : 'Не получилось';
}

function toNumber(value) {
  const number = Number(value ?? 0);
  return Number.isFinite(number) ? number : 0;
}

function optionalString(value) {
  const text = String(value ?? '').trim();
  return text || null;
}

function compactFileName(name) {
  const clean = String(name ?? '').trim();
  if (clean.length <= 28) return clean;
  const dot = clean.lastIndexOf('.');
  const ext = dot > -1 ? clean.slice(dot) : '';
  return `${clean.slice(0, 18)}...${ext.slice(0, 8)}`;
}

function formatCurrency(value) {
  return new Intl.NumberFormat('ru-RU', {
    style: 'currency',
    currency: 'RUB',
    maximumFractionDigits: 0,
  }).format(toNumber(value));
}

function formatQty(value) {
  return new Intl.NumberFormat('ru-RU', {
    maximumFractionDigits: 3,
  }).format(toNumber(value));
}

function formatSignedQty(value) {
  const numeric = toNumber(value);
  return `${numeric > 0 ? '+' : ''}${formatQty(numeric)}`;
}

function pluralRu(count, forms) {
  const value = Math.abs(Number(count)) % 100;
  const last = value % 10;
  if (value > 10 && value < 20) return forms[2];
  if (last > 1 && last < 5) return forms[1];
  if (last === 1) return forms[0];
  return forms[2];
}

function formatPercent(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return '0%';
  return `${new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 1 }).format(toNumber(value))}%`;
}

function formatDate(value) {
  return new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function escapeAttr(value) {
  return escapeHtml(value);
}
