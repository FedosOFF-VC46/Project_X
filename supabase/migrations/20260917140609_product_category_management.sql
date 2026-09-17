-- Keep tombstones so default sections and legacy browser entries cannot reappear.
create table public.product_categories (
  user_id uuid not null references auth.users(id) on delete cascade,
  id text not null check (length(btrim(id)) > 0),
  label text not null check (length(btrim(label)) between 1 and 120),
  created_at timestamptz not null default now(),
  deleted_at timestamptz,
  primary key (user_id, id)
);
alter table public.product_categories enable row level security;
create policy product_categories_owner on public.product_categories for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
grant select, insert, update on public.product_categories to authenticated;
create index products_active_category_idx on public.products(user_id, product_category) where is_active;

create function public.list_product_categories(p_legacy jsonb default '[]')
returns setof public.product_categories language plpgsql security invoker set search_path = '' as $$
declare u uuid := auth.uid();
begin
  if u is null then raise exception 'Войдите в аккаунт'; end if;
  insert into public.product_categories(user_id,id,label)
  select u, v.id, v.label from (values
    ('accessories','Аксессуары'),('notebooks','Блокноты'),('coasters','Подстаканники'),
    ('dishes','Блюда'),('christmas','Новогодние игрушки'),('keychains','Брелоки')
  ) as v(id,label) on conflict do nothing;
  if jsonb_typeof(p_legacy) = 'array' then
    insert into public.product_categories(user_id,id,label)
    select u, x->>'id', x->>'label' from jsonb_array_elements(p_legacy) x
    where length(btrim(x->>'id')) > 0 and length(btrim(x->>'label')) between 1 and 120
    on conflict do nothing;
  end if;
  insert into public.product_categories(user_id,id,label)
  select distinct u, p.product_category, left(p.product_category,120)
  from public.products p where p.user_id=u and p.is_active
  on conflict do nothing;
  return query select c.* from public.product_categories c where c.user_id=u order by c.created_at,c.id;
end $$;

create function public.create_product_category(p_label text)
returns text language plpgsql security invoker set search_path = '' as $$
declare u uuid := auth.uid(); new_id text := 'section-' || gen_random_uuid()::text;
begin
  if u is null then raise exception 'Войдите в аккаунт'; end if;
  if p_label is null or length(btrim(p_label)) not between 1 and 120 then raise exception 'Укажите название раздела: до 120 символов'; end if;
  perform pg_advisory_xact_lock(hashtextextended(u::text || ':categories',0));
  perform public.list_product_categories();
  if exists(select 1 from public.product_categories where user_id=u and deleted_at is null and lower(label)=lower(btrim(p_label))) then
    raise exception 'Такой раздел уже есть';
  end if;
  insert into public.product_categories(user_id,id,label) values(u,new_id,btrim(p_label));
  return new_id;
end $$;

-- Old browser tabs must not put products back into a removed section.
create function public.guard_product_category()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare removed timestamptz;
begin
  if not new.is_active then return new; end if;
  insert into public.product_categories(user_id,id,label)
    values(new.user_id,new.product_category,case new.product_category
      when 'accessories' then 'Аксессуары' when 'notebooks' then 'Блокноты' when 'coasters' then 'Подстаканники'
      when 'dishes' then 'Блюда' when 'christmas' then 'Новогодние игрушки' when 'keychains' then 'Брелоки'
      else left(new.product_category,120) end) on conflict do nothing;
  select deleted_at into removed from public.product_categories
    where user_id=new.user_id and id=new.product_category for share;
  if removed is not null then raise exception 'Этот раздел удалён. Обновите страницу и выберите другой раздел'; end if;
  return new;
end $$;
create trigger products_category_guard before insert or update of product_category,is_active on public.products
  for each row execute function public.guard_product_category();

create function public.remove_product_category(
  p_category_id text,
  p_target_id text default null,
  p_delete_products boolean default false,
  p_expected_product_ids uuid[] default '{}'
)
returns integer language plpgsql security invoker set search_path = '' as $$
declare
  u uuid := auth.uid(); actual uuid[]; expected uuid[]; affected integer;
begin
  if u is null then raise exception 'Войдите в аккаунт'; end if;
  if p_target_id = p_category_id then raise exception 'Выберите другой раздел для переноса'; end if;
  if p_target_id is not null and p_delete_products then raise exception 'Выберите перенос или удаление изделий'; end if;
  -- Same lock order for concurrent moves in opposite directions.
  perform 1 from public.product_categories where user_id=u and id in (p_category_id,p_target_id) order by id for update;
  if not exists(select 1 from public.product_categories where user_id=u and id=p_category_id and deleted_at is null) then
    raise exception 'Раздел уже удалён или не найден. Обновите страницу';
  end if;
  if p_target_id is not null and not exists(select 1 from public.product_categories where user_id=u and id=p_target_id and deleted_at is null) then
    raise exception 'Раздел для переноса больше недоступен. Обновите страницу';
  end if;
  perform 1 from public.products where user_id=u and product_category=p_category_id and is_active order by id for update;
  select coalesce(array_agg(id order by id),'{}'::uuid[]) into actual
    from public.products where user_id=u and product_category=p_category_id and is_active;
  select coalesce(array_agg(id order by id),'{}'::uuid[]) into expected from unnest(p_expected_product_ids) id;
  if actual is distinct from expected then
    raise exception 'Состав раздела изменился. Обновите страницу и проверьте список изделий перед удалением';
  end if;
  affected := cardinality(actual);
  if affected > 0 and p_target_id is null and not coalesce(p_delete_products,false) then
    raise exception 'Перенесите изделия или подтвердите их удаление вместе с разделом';
  end if;
  if p_target_id is not null then
    update public.products set product_category=p_target_id where user_id=u and id=any(actual);
  elsif affected > 0 then
    -- Preserve batches, movements, cost snapshots and sales history.
    update public.products set is_active=false where user_id=u and id=any(actual);
  end if;
  update public.product_categories set deleted_at=now() where user_id=u and id=p_category_id;
  return affected;
end $$;

revoke all on function public.list_product_categories(jsonb), public.create_product_category(text),
  public.guard_product_category(), public.remove_product_category(text,text,boolean,uuid[]) from public,anon;
grant execute on function public.list_product_categories(jsonb), public.create_product_category(text),
  public.guard_product_category(), public.remove_product_category(text,text,boolean,uuid[]) to authenticated;
