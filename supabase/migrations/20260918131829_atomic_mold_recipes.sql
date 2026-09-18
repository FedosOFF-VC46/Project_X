-- Save the recipe and every component in one transaction. No stock movements.
create or replace function public.save_mold_recipe(p_id uuid, p_data jsonb, p_items jsonb)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  owner_id uuid := auth.uid();
  saved_id uuid;
  title_value text := btrim(p_data->>'title');
  mode_value text := p_data->>'mode';
  length_value numeric := coalesce((p_data->>'length')::numeric, 0);
  width_value numeric := coalesce((p_data->>'width')::numeric, 0);
  height_value numeric := coalesce((p_data->>'height')::numeric, 0);
  base_value numeric;
  finish_value numeric := 0;
  coefficient_value numeric;
  item jsonb;
  material public.materials%rowtype;
  quantity_value numeric;
begin
  if owner_id is null then raise exception 'Войдите в аккаунт, чтобы сохранить расчёт'; end if;
  if p_id is null or title_value is null or title_value = '' or length(title_value) > 160 then
    raise exception 'Укажите название расчёта (до 160 символов)';
  end if;
  if mode_value is null or mode_value not in ('sizes', 'manual') then raise exception 'Выберите способ определения объёма'; end if;
  if mode_value = 'sizes' then
    if length_value <= 0 or width_value <= 0 or height_value <= 0 then raise exception 'Укажите длину, ширину и высоту'; end if;
    base_value := length_value * width_value * height_value;
  else
    base_value := coalesce((p_data->>'manual')::numeric, 0);
  end if;
  if coalesce((p_data->>'finish')::boolean, false) then
    if mode_value = 'sizes' then
      coefficient_value := coalesce((p_data->>'thickness')::numeric, 0) / 10;
      finish_value := length_value * width_value * coefficient_value;
    else
      finish_value := coalesce((p_data->>'finish_ml')::numeric, 0);
    end if;
    if finish_value <= 0 then raise exception 'Укажите толщину или объём финиша'; end if;
  end if;
  if base_value <= 0 or base_value + finish_value < 0.001 or base_value + finish_value >= 100000000000 then
    raise exception 'Проверьте объём заливки: от 0,001 до 99 999 999 999 мл';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) > 200 then
    raise exception 'Некорректный список материалов (не более 200 строк)';
  end if;

  -- A client-generated ID makes retrying an interrupted create request idempotent.
  -- ON CONFLICT locks the recipe row, serializing component replacements.
  insert into public.mold_calculations as existing (
    id, user_id, title, material_id, material_name_snapshot, unit_snapshot,
    mold_volume_ml, mold_length_cm, mold_width_cm, mold_height_cm, base_volume_ml,
    recommended_volume_ml, finish_coefficient, finish_volume_ml,
    fill_percent, waste_percent, unit_price_snapshot, sale_price, notes
  ) values (
    p_id, owner_id, title_value, null, null, null,
    base_value + finish_value, nullif(length_value, 0), nullif(width_value, 0), nullif(height_value, 0), base_value,
    case when mode_value = 'manual' then base_value else null end, coefficient_value, finish_value,
    100, 0, 0, 0, nullif(btrim(p_data->>'notes'), '')
  ) on conflict (id) do update set
    title = excluded.title, material_id = null, material_name_snapshot = null, unit_snapshot = null,
    mold_volume_ml = excluded.mold_volume_ml, mold_length_cm = excluded.mold_length_cm,
    mold_width_cm = excluded.mold_width_cm, mold_height_cm = excluded.mold_height_cm,
    base_volume_ml = excluded.base_volume_ml, recommended_volume_ml = excluded.recommended_volume_ml,
    finish_coefficient = excluded.finish_coefficient, finish_volume_ml = excluded.finish_volume_ml,
    fill_percent = 100, waste_percent = 0, unit_price_snapshot = 0, sale_price = 0, notes = excluded.notes
  where existing.user_id = owner_id
  returning id into saved_id;
  if saved_id is null then raise exception 'Расчёт недоступен для изменения'; end if;

  delete from public.mold_calculation_items where calculation_id = saved_id and user_id = owner_id;
  for item in select value from jsonb_array_elements(p_items) loop
    quantity_value := coalesce((item->>'quantity')::numeric, 0);
    if quantity_value <= 0 or quantity_value >= 100000000000 then raise exception 'Укажите корректное количество материала'; end if;
    select m.* into material from public.materials m
    where m.id = (item->>'material_id')::uuid and m.user_id = owner_id and m.is_active
      and m.category <> 'depreciation'
      and not exists (select 1 from public.tool_models t where t.user_id = owner_id and t.source_material_id = m.id)
    for share of m;
    if not found then raise exception 'Один из материалов недоступен. Выберите другой материал и сохраните снова'; end if;
    insert into public.mold_calculation_items (
      user_id, calculation_id, material_id, material_name_snapshot, unit_snapshot, quantity, unit_price_snapshot
    ) values (owner_id, saved_id, material.id, material.name, material.unit, quantity_value, material.unit_price);
  end loop;
  return saved_id;
end;
$$;

revoke all on function public.save_mold_recipe(uuid, jsonb, jsonb) from public, anon;
grant execute on function public.save_mold_recipe(uuid, jsonb, jsonb) to authenticated;
