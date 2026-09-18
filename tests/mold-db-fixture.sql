-- Isolated local test database only. Never run this fixture on a hosted project.
create role anon nologin;
create role authenticated nologin;
create schema auth;
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;
grant usage on schema auth to authenticated, anon;
grant execute on function auth.uid() to authenticated, anon;
create table public.materials (
  id uuid primary key, user_id uuid not null, name text not null, category text default 'material', unit text not null,
  package_cost numeric default 0, package_quantity numeric default 1,
  unit_price numeric generated always as (package_cost/package_quantity) stored,
  current_stock numeric default 0, is_active boolean default true
);
create table public.tool_models (id uuid primary key, user_id uuid not null, source_material_id uuid);
create table public.mold_calculations (
  id uuid primary key, user_id uuid not null, title text, material_id uuid, material_name_snapshot text, unit_snapshot text,
  mold_volume_ml numeric(14,3) not null check (mold_volume_ml>0),
  mold_length_cm numeric, mold_width_cm numeric, mold_height_cm numeric, base_volume_ml numeric,
  recommended_volume_ml numeric, finish_coefficient numeric, finish_volume_ml numeric,
  fill_percent numeric default 100, waste_percent numeric default 0, unit_price_snapshot numeric default 0,
  calculated_quantity numeric generated always as (mold_volume_ml*fill_percent/100*(1+waste_percent/100)) stored,
  sale_price numeric default 0, notes text
);
create table public.mold_calculation_items (
  id uuid primary key default gen_random_uuid(), user_id uuid not null,
  calculation_id uuid references public.mold_calculations on delete cascade,
  material_id uuid references public.materials on delete set null,
  material_name_snapshot text, unit_snapshot text, quantity numeric check (quantity>0), unit_price_snapshot numeric,
  total_cost numeric generated always as (quantity*unit_price_snapshot) stored
);
grant usage on schema public to authenticated;
grant select,insert,update,delete on all tables in schema public to authenticated;
do $$ declare t text; begin
  foreach t in array array['materials','tool_models','mold_calculations','mold_calculation_items'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('create policy own on public.%I to authenticated using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id)',t);
  end loop;
end $$;
