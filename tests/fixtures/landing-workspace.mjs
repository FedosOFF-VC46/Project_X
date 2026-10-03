// Public, synthetic examples only. These records never enter a real workspace.
export const user = { id: 'public-screenshot-demo', email: 'demo@example.invalid' };
const base = { user_id: user.id, is_active: true, created_at: '2026-10-01T10:00:00Z', min_stock: 0 };
const materials = [
  { ...base, id: 'resin', name: 'Прозрачная смола', category: 'material', unit: 'g', unit_price: 2.5, current_stock: 4500, min_stock: 500, package_cost: 2500, package_quantity: 1000 },
  { ...base, id: 'mint', name: 'Пигмент «Мята»', category: 'material', unit: 'ml', unit_price: 30, current_stock: 18, min_stock: 5, package_cost: 900, package_quantity: 30 },
  { ...base, id: 'gold', name: 'Золотая поталь', category: 'material', unit: 'g', unit_price: 15, current_stock: 10, min_stock: 2, package_cost: 150, package_quantity: 10 },
  { ...base, id: 'blue', name: 'Пигмент «Океан»', category: 'material', unit: 'ml', unit_price: 30, current_stock: 4, min_stock: 5, package_cost: 900, package_quantity: 30 },
  { ...base, id: 'hooks', name: 'Швензы серебристые', category: 'material', unit: 'pair', unit_price: 35, current_stock: 12, package_cost: 350, package_quantity: 10 },
  { ...base, id: 'box', name: 'Подарочная коробка', category: 'packaging', unit: 'pcs', unit_price: 60, current_stock: 8, package_cost: 600, package_quantity: 10 },
];
const products = [
  { ...base, id: 'wave', name: 'Подстаканник «Волна»', description: 'Прозрачная смола, мятный пигмент и золотая поталь. 12 × 8 см.', product_category: 'coasters', work_hours: 1, markup_percent: 120, current_stock: 3 },
  { ...base, id: 'ocean', name: 'Подстаканник «Океан»', description: 'Глубокий синий оттенок. Та же основа, другой характер.', product_category: 'coasters', work_hours: 1, markup_percent: 120, current_stock: 5 },
  { ...base, id: 'clock', name: 'Часы «Тишина»', description: 'Настенные часы с мягким мятным оттенком.', product_category: 'accessories', work_hours: 2, markup_percent: 120, current_stock: 1 },
];
const recipes = [
  { ...base, id: 'wave-recipe', title: 'Основа «Волна»', mold_length_cm: 12, mold_width_cm: 8, mold_height_cm: 1.25, base_volume_ml: 120, mold_volume_ml: 120, finish_volume_ml: 0, notes: 'Мятный пигмент и золотая поталь.' },
  { ...base, id: 'ocean-recipe', title: 'Основа «Океан»', recommended_volume_ml: 120, base_volume_ml: 120, mold_volume_ml: 120, finish_volume_ml: 0, notes: '' },
  { ...base, id: 'clock-recipe', title: 'Часы «Тишина»', recommended_volume_ml: 500, base_volume_ml: 500, mold_volume_ml: 500, finish_volume_ml: 0, notes: '' },
];
const ingredients = [['resin', 140], ['mint', 2], ['gold', 1]];
const moldItems = recipes.flatMap((recipe, index) => ingredients.map(([id, amount]) => {
  const material = materials.find(row => row.id === (id === 'mint' && index === 1 ? 'blue' : id));
  const quantity = index === 2 ? amount * 4 : amount;
  return { ...base, id: `${recipe.id}-${id}`, calculation_id: recipe.id, material_id: material.id, quantity, material_name_snapshot: material.name, unit_snapshot: material.unit, unit_price_snapshot: material.unit_price, total_cost: quantity * material.unit_price };
}));
const batches = products.map((product, index) => ({ ...base, id: `batch-${product.id}`, product_id: product.id, product_name_snapshot: product.name, total_quantity: [6, 5, 1][index], remaining_quantity: product.current_stock, cost_per_unit: [650, 650, 2100][index], sale_price_per_unit: [1430, 1430, 4620][index], products: { name: product.name } }));
const movement = (id, type, quantity, source, created, notes) => ({ ...base, id, product_id: 'wave', batch_id: 'batch-wave', movement_type: type, source_type: source, quantity_delta: -quantity, unit_price: 1430, total_amount: source === 'sale' ? 1430 * quantity : 0, total_price: source === 'sale' ? 1430 * quantity : 0, created_at: created, notes, products: { name: products[0].name }, product_batches: { product_name_snapshot: products[0].name, sale_price_per_unit: 1430 } });
export const workspace = {
  materials, products, mold_calculations: recipes, mold_calculation_items: moldItems, product_batches: batches,
  product_materials: products.flatMap((product, index) => moldItems.filter(row => row.calculation_id === recipes[index].id).map(row => ({ ...base, id: `link-${row.id}`, product_id: product.id, material_id: row.material_id, quantity_per_unit: row.quantity, materials: materials.find(m => m.id === row.material_id) }))),
  tool_models: [
    { ...base, id: 'mold', name: 'Молд «Волна»', kind: 'mold', resource_mode: 'cycles', default_resource: 10, default_cost: 250, output_per_cycle: 1, hours_per_day: 8 },
    { ...base, id: 'scales', name: 'Весы ювелирные', kind: 'equipment', resource_mode: 'hours', default_resource: 200, default_cost: 2400, output_per_cycle: 1, hours_per_day: 8 },
    { ...base, id: 'pliers', name: 'Круглогубцы', kind: 'hand', resource_mode: 'items', default_resource: 500, default_cost: 900, output_per_cycle: 1, hours_per_day: 8 },
  ],
  tool_instances: [
    { ...base, id: 'mold-1', model_id: 'mold', label: 'Молд «Волна» · №1', resource_mode: 'cycles', resource_limit: 10, used_resource: 2, purchase_cost: 250, charged_cost: 50, status: 'active', started_on: '2026-09-20' },
    { ...base, id: 'mold-2', model_id: 'mold', label: 'Молд «Волна» · №2', resource_mode: 'cycles', resource_limit: 10, used_resource: 0, purchase_cost: 250, charged_cost: 0, status: 'active', started_on: '2026-10-01' },
    { ...base, id: 'scales-1', model_id: 'scales', label: 'Весы ювелирные · №1', resource_mode: 'hours', resource_limit: 200, used_resource: 35, purchase_cost: 2400, charged_cost: 420, status: 'active', started_on: '2026-09-20' },
    { ...base, id: 'pliers-1', model_id: 'pliers', label: 'Круглогубцы · №1', resource_mode: 'items', resource_limit: 500, used_resource: 70, purchase_cost: 900, charged_cost: 126, status: 'active', started_on: '2026-09-20' },
  ],
  product_tools: products.slice(0, 2).map(product => ({ user_id: user.id, product_id: product.id, model_id: 'mold', enabled: true, quantity_per_item: 1 })),
  product_stock_movements: [movement('shipping', 'shipment', 2, 'shipment', '2026-10-02T12:00:00Z', 'Отправлено клиенту'), movement('sale', 'sale', 1, 'sale', '2026-10-01T16:00:00Z', 'Продажа на маркете')],
  production_calculations: [{ ...base, id: 'calculation', product_id: 'wave', batch_quantity: 1, cost_total: 650, profit_total: 780, revenue_total: 1430 }],
  production_calculation_items: [], stock_movements: [], tool_events: [],
};

export function screenshotBackend() {
  return `
    const data=${JSON.stringify(workspace)};
    class Query {
      constructor(table){this.table=table;this.filters=[];}
      select(){return this;} order(){return this;} limit(){return this;} range(){return this;}
      eq(key,value){this.filters.push([key,value]);return this;}
      then(resolve){return Promise.resolve({data:(data[this.table]||[]).filter(row=>this.filters.every(([key,value])=>row[key]===value)),error:null}).then(resolve);}
    }
    export const supabase={
      auth:{getSession:async()=>({data:{session:{user:${JSON.stringify(user)}}}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})},
      from:table=>new Query(table),
      storage:{from:()=>({createSignedUrl:async()=>({data:null})})},
      rpc:async(name)=>{if(name!=='list_product_categories')throw Error('Writes forbidden during screenshots');return {data:[{id:'accessories',label:'Аксессуары'},{id:'notebooks',label:'Блокноты'},{id:'coasters',label:'Подстаканники'},{id:'dishes',label:'Блюда'},{id:'christmas',label:'Новогодние игрушки'},{id:'keychains',label:'Брелоки'}],error:null};}
    };`;
}
