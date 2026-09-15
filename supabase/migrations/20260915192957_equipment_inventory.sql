-- Physical tools, per-instance resource and atomic production.
create table public.tool_models (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 160),
  kind text not null default 'mold' check (kind in ('mold','hand','equipment','other')),
  resource_mode text check (resource_mode in ('items','cycles','hours','days')),
  default_resource numeric(14,6) check (default_resource > 0),
  default_cost numeric(14,2) not null default 0 check (default_cost >= 0),
  output_per_cycle integer not null default 1 check (output_per_cycle > 0),
  hours_per_day numeric(6,2) not null default 8 check (hours_per_day > 0 and hours_per_day <= 24),
  is_common boolean not null default false,
  source_material_id uuid unique references public.materials(id),
  notes text,
  created_at timestamptz not null default now(),
  unique(id,user_id),
  check ((resource_mode is null) = (default_resource is null))
);
create index tool_models_user_idx on public.tool_models(user_id);

create table public.tool_instances (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  model_id uuid not null,
  label text not null check (length(trim(label)) between 1 and 80),
  resource_mode text not null check (resource_mode in ('items','cycles','hours','days')),
  resource_limit numeric(14,6) not null check (resource_limit > 0),
  used_resource numeric(14,6) not null default 0 check (used_resource >= 0),
  purchase_cost numeric(14,2) not null check (purchase_cost >= 0),
  charged_cost numeric(14,2) not null default 0 check (charged_cost >= 0 and charged_cost <= purchase_cost),
  status text not null default 'active' check (status in ('active','paused','retired')),
  started_on date not null default current_date,
  created_at timestamptz not null default now(),
  unique(id,user_id),
  foreign key(model_id,user_id) references public.tool_models(id,user_id),
  check (resource_mode = 'days' or used_resource <= resource_limit)
);
create index tool_instances_model_user_idx on public.tool_instances(model_id,user_id);
create index tool_instances_user_idx on public.tool_instances(user_id);

alter table public.products add constraint products_id_user_unique unique(id,user_id);
create table public.product_tools (
  user_id uuid not null references auth.users(id) on delete cascade,
  product_id uuid not null,
  model_id uuid not null,
  enabled boolean not null default true,
  quantity_per_item numeric(14,6) not null default 1 check(quantity_per_item > 0),
  primary key(product_id,model_id),
  foreign key(product_id,user_id) references public.products(id,user_id) on delete cascade,
  foreign key(model_id,user_id) references public.tool_models(id,user_id)
);
create index product_tools_user_idx on public.product_tools(user_id);
create index product_tools_model_user_idx on public.product_tools(model_id,user_id);

alter table public.production_calculations
  add column labor_cost_total numeric(14,2) not null default 0 check(labor_cost_total >= 0),
  add column tool_cost_total numeric(14,2) not null default 0 check(tool_cost_total >= 0),
  add column request_id uuid,
  add column request_payload jsonb,
  add constraint production_calculations_request_unique unique(user_id,request_id),
  add constraint production_calculations_id_user_unique unique(id,user_id);
alter table public.production_calculations
  alter column cost_per_unit set expression as ((material_cost_total + labor_cost_total + tool_cost_total) / nullif(batch_quantity,0)),
  alter column profit_total set expression as (sale_price_per_unit * batch_quantity - material_cost_total - labor_cost_total - tool_cost_total),
  alter column margin_percent set expression as (case when sale_price_per_unit * batch_quantity > 0 then
    (sale_price_per_unit * batch_quantity - material_cost_total - labor_cost_total - tool_cost_total) / (sale_price_per_unit * batch_quantity) * 100 else null end);

create table public.tool_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  instance_id uuid not null,
  calculation_id uuid,
  event_type text not null check(event_type in ('receipt','production','extend','pause','resume','retire','rename')),
  instance_label text not null,
  resource_mode text not null,
  resource_amount numeric(14,6) not null default 0,
  cost_amount numeric(14,2) not null default 0 check(cost_amount >= 0),
  note text,
  created_at timestamptz not null default now(),
  foreign key(instance_id,user_id) references public.tool_instances(id,user_id),
  foreign key(calculation_id,user_id) references public.production_calculations(id,user_id),
  unique(calculation_id,instance_id)
);
create index tool_events_user_created_idx on public.tool_events(user_id,created_at desc);
create index tool_events_instance_user_idx on public.tool_events(instance_id,user_id);
create index tool_events_calculation_user_idx on public.tool_events(calculation_id,user_id);

alter table public.tool_models enable row level security;
alter table public.tool_instances enable row level security;
alter table public.product_tools enable row level security;
alter table public.tool_events enable row level security;
create policy own_tool_models on public.tool_models to authenticated using(user_id = (select auth.uid())) with check(user_id = (select auth.uid()));
create policy own_tool_instances on public.tool_instances to authenticated using(user_id = (select auth.uid())) with check(user_id = (select auth.uid()));
create policy own_product_tools on public.product_tools to authenticated using(user_id = (select auth.uid())) with check(user_id = (select auth.uid()));
create policy read_tool_events on public.tool_events for select to authenticated using(user_id = (select auth.uid()));
create policy insert_tool_events on public.tool_events for insert to authenticated with check(user_id = (select auth.uid()));
grant select,insert,update on public.tool_models,public.tool_instances to authenticated;
grant select,insert,update,delete on public.product_tools to authenticated;
grant select,insert on public.tool_events to authenticated;
revoke all on public.tool_models,public.tool_instances,public.product_tools,public.tool_events from anon;

-- Preserve legacy records and history. No resource or physical count is guessed.
insert into public.tool_models(user_id,name,kind,default_cost,source_material_id,notes)
select user_id,left(name,160),'other',round(unit_price,2),id,notes
from public.materials where category='depreciation' and is_active;
insert into public.product_tools(user_id,product_id,model_id)
select pm.user_id,pm.product_id,tm.id from public.product_materials pm
join public.tool_models tm on tm.source_material_id=pm.material_id and tm.user_id=pm.user_id;

create function public.add_tool_instances(p_model_id uuid,p_count integer,p_cost numeric,p_limit numeric,p_started_on date,p_used numeric default 0)
returns void language plpgsql security invoker set search_path='' as $$
declare
  u uuid := auth.uid(); m public.tool_models%rowtype; n integer; i integer; item public.tool_instances%rowtype; used numeric;
begin
  if u is null then raise exception 'Войдите в аккаунт'; end if;
  select * into m from public.tool_models where id=p_model_id and user_id=u for update;
  if not found or m.resource_mode is null then raise exception 'Сначала настройте инструмент'; end if;
  if p_count is null or p_count < 1 or p_count > 100 or p_cost is null or p_cost < 0 or p_limit is null or p_limit <= 0 or p_used is null or p_used < 0 or p_used > p_limit or p_started_on is null or p_started_on > current_date then
    raise exception 'Проверьте количество, цену, дату и ресурс';
  end if;
  if m.resource_mode in ('items','cycles','days') and (p_limit<>trunc(p_limit) or p_used<>trunc(p_used)) then raise exception 'Ресурс указывается целым числом'; end if;
  select count(*) into n from public.tool_instances where model_id=m.id and user_id=u;
  used := case when m.resource_mode='days' then least(p_limit,greatest(0,current_date-p_started_on)) else p_used end;
  for i in 1..p_count loop
    insert into public.tool_instances(user_id,model_id,label,resource_mode,resource_limit,used_resource,purchase_cost,charged_cost,started_on)
    values(u,m.id,'Экземпляр №'||(n+i),m.resource_mode,p_limit,case when m.resource_mode='days' then 0 else used end,p_cost,round(p_cost*used/p_limit,2),p_started_on) returning * into item;
    insert into public.tool_events(user_id,instance_id,event_type,instance_label,resource_mode,resource_amount,cost_amount,note)
    values(u,item.id,'receipt',item.label,item.resource_mode,used,item.charged_cost,'Добавлен на склад');
  end loop;
end $$;

create function public.save_tool_model(p_model_id uuid,p_data jsonb,p_count integer default 0)
returns uuid language plpgsql security invoker set search_path='' as $$
declare
  u uuid := auth.uid(); old public.tool_models%rowtype; mid uuid; mode text := p_data->>'resource_mode'; res numeric := (p_data->>'resource_limit')::numeric;
begin
  if u is null then raise exception 'Войдите в аккаунт'; end if;
  if p_count is null or p_count<0 or p_count>100 or mode is null or res is null or res<=0 then raise exception 'Укажите ресурс и количество'; end if;
  if mode in ('items','cycles','days') and res<>trunc(res) then raise exception 'Ресурс указывается целым числом'; end if;
  if p_model_id is not null then
    select * into old from public.tool_models where id=p_model_id and user_id=u for update;
    if not found then raise exception 'Инструмент не найден'; end if;
    if old.resource_mode is distinct from mode and exists(select 1 from public.tool_instances where model_id=old.id and user_id=u) then
      raise exception 'Для другого способа учета создайте новый инструмент';
    end if;
    update public.tool_models set name=trim(p_data->>'name'),kind=p_data->>'kind',resource_mode=mode,default_resource=res,
      default_cost=(p_data->>'purchase_cost')::numeric,output_per_cycle=coalesce((p_data->>'output_per_cycle')::integer,1),
      hours_per_day=coalesce((p_data->>'hours_per_day')::numeric,8),is_common=coalesce((p_data->>'is_common')::boolean,false),notes=p_data->>'notes'
    where id=old.id and user_id=u returning id into mid;
  else
    insert into public.tool_models(user_id,name,kind,resource_mode,default_resource,default_cost,output_per_cycle,hours_per_day,is_common,notes)
    values(u,trim(p_data->>'name'),p_data->>'kind',mode,res,(p_data->>'purchase_cost')::numeric,coalesce((p_data->>'output_per_cycle')::integer,1),
      coalesce((p_data->>'hours_per_day')::numeric,8),coalesce((p_data->>'is_common')::boolean,false),p_data->>'notes') returning id into mid;
  end if;
  if p_count>0 then perform public.add_tool_instances(mid,p_count,(p_data->>'purchase_cost')::numeric,res,(p_data->>'started_on')::date,coalesce((p_data->>'used_resource')::numeric,0)); end if;
  return mid;
end $$;

create function public.change_tool_instance(p_instance_id uuid,p_action text,p_amount numeric default 0,p_label text default null,p_note text default '')
returns void language plpgsql security invoker set search_path='' as $$
declare u uuid := auth.uid(); t public.tool_instances%rowtype; cost numeric := 0;
begin
  if u is null then raise exception 'Войдите в аккаунт'; end if;
  select * into t from public.tool_instances where id=p_instance_id and user_id=u for update;
  if not found then raise exception 'Экземпляр не найден'; end if;
  if p_action not in ('extend','pause','resume','retire','rename') or p_action is null then raise exception 'Выберите действие'; end if;
  if p_action='extend' then
    if p_amount is null or p_amount<=0 or t.status='retired' then raise exception 'Укажите дополнительный ресурс'; end if;
    if t.resource_mode in ('items','cycles','days') and p_amount<>trunc(p_amount) then raise exception 'Укажите целое число'; end if;
    update public.tool_instances set resource_limit=resource_limit+p_amount where id=t.id and user_id=u;
  end if;
  if p_action='retire' then
    if t.status='retired' then raise exception 'Экземпляр уже списан'; end if;
    if length(trim(coalesce(p_note,'')))=0 then raise exception 'Укажите причину списания'; end if;
    cost := t.purchase_cost-t.charged_cost;
    update public.tool_instances set status='retired',charged_cost=purchase_cost where id=t.id and user_id=u;
  end if;
  if p_action='pause' then
    if t.status<>'active' then raise exception 'Экземпляр уже не в работе'; end if;
    update public.tool_instances set status='paused' where id=t.id and user_id=u;
  end if;
  if p_action='resume' then
    if t.status='active' then raise exception 'Экземпляр уже в работе'; end if;
    update public.tool_instances set status='active' where id=t.id and user_id=u;
  end if;
  update public.tool_instances set label=coalesce(nullif(trim(p_label),''),label) where id=t.id and user_id=u;
  insert into public.tool_events(user_id,instance_id,event_type,instance_label,resource_mode,resource_amount,cost_amount,note)
  values(u,t.id,p_action,coalesce(nullif(trim(p_label),''),t.label),t.resource_mode,case when p_action='extend' then p_amount else 0 end,cost,
    coalesce(nullif(p_note,''),case p_action when 'extend' then 'Ресурс продлён' when 'pause' then 'Поставлен на паузу' when 'resume' then 'Возвращён в работу' when 'rename' then 'Название изменено' else 'Списан' end));
end $$;

create function public.save_product_tools(p_product_id uuid,p_tools jsonb)
returns void language plpgsql security invoker set search_path='' as $$
declare u uuid := auth.uid(); r record;
begin
  if u is null then raise exception 'Войдите в аккаунт'; end if;
  perform 1 from public.products where id=p_product_id and user_id=u for update;
  if not found then raise exception 'Изделие не найдено'; end if;
  if jsonb_typeof(p_tools) is distinct from 'array' then raise exception 'Выберите инструменты'; end if;
  delete from public.product_tools where product_id=p_product_id and user_id=u;
  for r in select * from jsonb_to_recordset(p_tools) as x(model_id uuid,enabled boolean,quantity_per_item numeric) loop
    perform 1 from public.tool_models where id=r.model_id and user_id=u;
    if not found then raise exception 'Инструмент не найден'; end if;
    insert into public.product_tools(user_id,product_id,model_id,enabled,quantity_per_item) values(u,p_product_id,r.model_id,coalesce(r.enabled,true),coalesce(r.quantity_per_item,1));
  end loop;
end $$;

create function public.produce_with_tools(p_product_id uuid,p_quantity numeric,p_tools jsonb,p_notes text,p_request_id uuid)
returns uuid language plpgsql security invoker set search_path='' as $$
declare
  u uuid := auth.uid(); p public.products%rowtype; old public.production_calculations%rowtype;
  cid uuid; bid uuid; r record; a record; t public.tool_instances%rowtype;
  required numeric; allocated numeric; amount numeric; used numeric; rate numeric; charge numeric;
  material_total numeric := 0; tool_total numeric := 0; labor_total numeric; total numeric; sale_price numeric; payload jsonb;
begin
  if u is null then raise exception 'Войдите в аккаунт'; end if;
  if p_quantity is null or p_quantity<=0 or p_quantity<>trunc(p_quantity) or p_quantity>100000 then raise exception 'Укажите целое количество изделий'; end if;
  if p_request_id is null or jsonb_typeof(p_tools) is distinct from 'array' then raise exception 'Не удалось подготовить изготовление'; end if;
  -- A stable product lock also serializes retries and recipe/tool edits.
  select * into p from public.products where id=p_product_id and user_id=u and is_active for update;
  if not found then raise exception 'Изделие не найдено'; end if;
  payload := jsonb_build_object('product_id',p_product_id,'quantity',p_quantity,'tools',p_tools,'notes',p_notes);
  select * into old from public.production_calculations where user_id=u and request_id=p_request_id;
  if found then
    if old.request_payload is distinct from payload then raise exception 'Это изготовление уже сохранено. Обновите склад'; end if;
    return old.id;
  end if;
  if not exists(select 1 from public.product_materials pm join public.materials m on m.id=pm.material_id and m.user_id=u where pm.product_id=p.id and pm.user_id=u and m.category<>'depreciation') then raise exception 'Добавьте состав изделия'; end if;
  if exists(select 1 from public.product_materials pm join public.materials m on m.id=pm.material_id and m.user_id=u where pm.product_id=p.id and pm.user_id=u and m.category<>'depreciation' and not m.is_active) then raise exception 'В составе есть удалённый материал'; end if;
  perform m.id from public.materials m join public.product_materials pm on pm.material_id=m.id and pm.user_id=u
    where pm.product_id=p.id and m.user_id=u and m.category<>'depreciation' order by m.id for update of m;
  perform tm.id from public.tool_models tm left join public.product_tools pt on pt.model_id=tm.id and pt.product_id=p.id and pt.user_id=u
    where tm.user_id=u and coalesce(pt.enabled,tm.is_common) order by tm.id for share of tm;
  perform ti.id from public.tool_instances ti where ti.user_id=u and ti.id in (select (x->>'instance_id')::uuid from jsonb_array_elements(p_tools) x) order by ti.id for update;
  if exists(select 1 from jsonb_to_recordset(p_tools) as x(instance_id uuid,model_id uuid,amount numeric)
    left join public.tool_instances ti on ti.id=x.instance_id and ti.user_id=u
    left join public.tool_models tm on tm.id=x.model_id and tm.user_id=u
    left join public.product_tools pt on pt.model_id=tm.id and pt.product_id=p.id and pt.user_id=u
    where ti.id is null or tm.id is null or ti.model_id<>tm.id or ti.status<>'active' or ti.started_on>current_date or not coalesce(pt.enabled,tm.is_common) or x.amount is null or x.amount<=0) then
    raise exception 'Проверьте выбранные экземпляры';
  end if;
  if exists(select 1 from jsonb_array_elements(p_tools) x group by x->>'instance_id' having count(*)>1) then raise exception 'Экземпляр указан дважды'; end if;
  for r in select tm.*,coalesce(pt.quantity_per_item,1) as factor from public.tool_models tm
    left join public.product_tools pt on pt.model_id=tm.id and pt.product_id=p.id and pt.user_id=u
    where tm.user_id=u and coalesce(pt.enabled,tm.is_common) order by tm.id loop
    if r.resource_mode is null then raise exception 'Настройте ресурс: %',r.name; end if;
    if r.resource_mode in ('hours','days') and coalesce(p.work_hours,0)<=0 then raise exception 'Укажите время работы в карте изделия'; end if;
    required := round(case r.resource_mode
      when 'items' then p_quantity*r.factor when 'cycles' then ceil(p_quantity*r.factor/r.output_per_cycle)
      when 'hours' then p_quantity*r.factor*p.work_hours when 'days' then p_quantity*r.factor*p.work_hours/r.hours_per_day end,6);
    select coalesce(sum(x.amount),0) into allocated from jsonb_to_recordset(p_tools) as x(model_id uuid,amount numeric) where x.model_id=r.id;
    if abs(allocated-required)>0.000001 then raise exception 'Ресурс инструмента изменился. Проверьте: %',r.name; end if;
  end loop;
  labor_total := round(coalesce(p.work_hours,0)*200*p_quantity,2);
  insert into public.production_calculations(user_id,product_id,product_name_snapshot,batch_quantity,sale_price_per_unit,material_cost_total,labor_cost_total,tool_cost_total,notes,request_id,request_payload)
  values(u,p.id,p.name,p_quantity,0,0,labor_total,0,p_notes,p_request_id,payload) returning id into cid;
  for r in select pm.*,m.name,m.category,m.unit,m.unit_price,m.current_stock from public.product_materials pm
    join public.materials m on m.id=pm.material_id and m.user_id=u where pm.product_id=p.id and pm.user_id=u and m.category<>'depreciation' order by m.id loop
    amount := round(p_quantity*r.quantity_per_unit,3);
    if amount<=0 then raise exception 'Расход слишком мал для единицы учета: %',r.name; end if;
    if r.current_stock<amount then raise exception 'Недостаточно материала: %',r.name; end if;
    material_total := material_total + amount*r.unit_price;
    insert into public.production_calculation_items(user_id,calculation_id,material_id,material_name_snapshot,category_snapshot,unit_snapshot,quantity_per_unit_snapshot,waste_percent_snapshot,total_quantity,unit_price_snapshot)
    values(u,cid,r.material_id,r.name,r.category,r.unit,r.quantity_per_unit,0,amount,r.unit_price);
    insert into public.stock_movements(user_id,material_id,movement_type,source_type,source_id,quantity_delta,unit_cost,comment)
    values(u,r.material_id,'writeoff','calculation',cid,-amount,r.unit_price,'Изготовление: '||p.name);
  end loop;
  for a in select * from jsonb_to_recordset(p_tools) as x(instance_id uuid,model_id uuid,amount numeric) order by instance_id loop
    select * into t from public.tool_instances where id=a.instance_id and user_id=u;
    if t.resource_mode in ('items','cycles') and a.amount<>trunc(a.amount) then raise exception 'Изделия и заливки учитываются целыми'; end if;
    used := case when t.resource_mode='days' then greatest(0,current_date-t.started_on) else t.used_resource end;
    if used>=t.resource_limit or (t.resource_mode<>'days' and used+a.amount>t.resource_limit) then raise exception 'Ресурс исчерпан: %',t.label; end if;
    rate := case when t.resource_mode='days' then t.purchase_cost/t.resource_limit else (t.purchase_cost-t.charged_cost)/(t.resource_limit-t.used_resource) end;
    charge := round(least(t.purchase_cost-t.charged_cost,a.amount*rate),2);
    update public.tool_instances set used_resource=used_resource+a.amount,charged_cost=charged_cost+charge where id=t.id and user_id=u;
    insert into public.tool_events(user_id,instance_id,calculation_id,event_type,instance_label,resource_mode,resource_amount,cost_amount,note)
    values(u,t.id,cid,'production',t.label,t.resource_mode,a.amount,charge,'Изготовлено '||p_quantity||' шт: '||p.name);
    tool_total := tool_total+charge;
  end loop;
  material_total:=round(material_total,2);
  total := material_total+labor_total+tool_total;
  sale_price := round(total/p_quantity*(1+coalesce(p.markup_percent,0)/100),2);
  update public.production_calculations set material_cost_total=material_total,tool_cost_total=tool_total,sale_price_per_unit=sale_price where id=cid and user_id=u;
  insert into public.product_batches(user_id,product_id,calculation_id,product_name_snapshot,total_quantity,remaining_quantity,cost_per_unit,sale_price_per_unit,notes)
  values(u,p.id,cid,p.name,p_quantity,p_quantity,round(total/p_quantity,2),sale_price,p_notes) returning id into bid;
  insert into public.product_stock_movements(user_id,product_id,batch_id,movement_type,source_type,source_id,quantity_delta,comment)
  values(u,p.id,bid,'production','calculation',cid,p_quantity,'Изготовление с учетом инструментов');
  return cid;
end $$;

-- Old clients cannot bypass resource accounting after the upgrade.
create or replace function public.finalize_production_calculation(p_product_id uuid,p_batch_quantity numeric,p_sale_price_per_unit numeric default 0,p_notes text default null)
returns uuid language plpgsql security invoker set search_path='' as $$
begin
  return public.produce_with_tools(p_product_id,p_batch_quantity,'[]'::jsonb,p_notes,gen_random_uuid());
end $$;

revoke all on function public.add_tool_instances(uuid,integer,numeric,numeric,date,numeric), public.save_tool_model(uuid,jsonb,integer), public.change_tool_instance(uuid,text,numeric,text,text), public.save_product_tools(uuid,jsonb), public.produce_with_tools(uuid,numeric,jsonb,text,uuid), public.finalize_production_calculation(uuid,numeric,numeric,text) from public,anon;
grant execute on function public.add_tool_instances(uuid,integer,numeric,numeric,date,numeric), public.save_tool_model(uuid,jsonb,integer), public.change_tool_instance(uuid,text,numeric,text,text), public.save_product_tools(uuid,jsonb), public.produce_with_tools(uuid,numeric,jsonb,text,uuid), public.finalize_production_calculation(uuid,numeric,numeric,text) to authenticated;
