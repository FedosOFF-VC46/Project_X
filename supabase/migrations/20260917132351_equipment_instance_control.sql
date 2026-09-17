-- Remove from current work without rewriting historical production costs.
alter table public.tool_models add column deleted_at timestamptz;
alter table public.tool_instances add column deleted_at timestamptz;
alter table public.tool_events drop constraint tool_events_event_type_check;
alter table public.tool_events add constraint tool_events_event_type_check check
  (event_type in ('receipt','production','extend','pause','resume','retire','rename','delete'));

-- A mold belongs to an explicit product or operation, never the common workshop set.
update public.tool_models set is_common=false where kind='mold' and is_common;
update public.tool_instances ti set label=left(tm.name,60)||' · №'||substring(ti.label from '[0-9]+$')
from public.tool_models tm where tm.id=ti.model_id and ti.label ~ '^Экземпляр[[:space:]]*№?[[:space:]]*[0-9]+$';

create or replace function public.add_tool_instances(p_model_id uuid,p_count integer,p_cost numeric,p_limit numeric,p_started_on date,p_used numeric default 0)
returns void language plpgsql security invoker set search_path='' as $$
declare
  u uuid := auth.uid(); m public.tool_models%rowtype; n integer; i integer; item public.tool_instances%rowtype; used numeric;
begin
  if u is null then raise exception 'Войдите в аккаунт'; end if;
  select * into m from public.tool_models where id=p_model_id and user_id=u and deleted_at is null for update;
  if not found or m.resource_mode is null then raise exception 'Сначала настройте инструмент'; end if;
  if p_count is null or p_count < 1 or p_count > 100 or p_cost is null or p_cost < 0 or p_limit is null or p_limit <= 0 or p_used is null or p_used < 0 or p_used > p_limit or p_started_on is null or p_started_on > current_date then
    raise exception 'Проверьте количество, цену, дату и ресурс';
  end if;
  if m.resource_mode in ('items','cycles','days') and (p_limit<>trunc(p_limit) or p_used<>trunc(p_used)) then raise exception 'Ресурс указывается целым числом'; end if;
  select count(*) into n from public.tool_instances where model_id=m.id and user_id=u;
  used := case when m.resource_mode='days' then least(p_limit,greatest(0,current_date-p_started_on)) else p_used end;
  for i in 1..p_count loop
    insert into public.tool_instances(user_id,model_id,label,resource_mode,resource_limit,used_resource,purchase_cost,charged_cost,started_on)
    values(u,m.id,left(m.name,60)||' · №'||(n+i),m.resource_mode,p_limit,case when m.resource_mode='days' then 0 else used end,p_cost,round(p_cost*used/p_limit,2),p_started_on) returning * into item;
    insert into public.tool_events(user_id,instance_id,event_type,instance_label,resource_mode,resource_amount,cost_amount,note)
    values(u,item.id,'receipt',item.label,item.resource_mode,used,item.charged_cost,'Добавлен на склад');
  end loop;
end $$;

create function public.add_tool_instance_rows(p_model_id uuid,p_instances jsonb)
returns void language plpgsql security invoker set search_path='' as $$
declare
  u uuid := auth.uid(); m public.tool_models%rowtype; r jsonb; t public.tool_instances%rowtype;
  cost numeric; lim numeric; used numeric; started date; n integer;
begin
  if u is null then raise exception 'Войдите в аккаунт'; end if;
  select * into m from public.tool_models where id=p_model_id and user_id=u and deleted_at is null for update;
  if not found or m.resource_mode is null then raise exception 'Инструмент не найден или не настроен'; end if;
  if jsonb_typeof(p_instances) is distinct from 'array' or jsonb_array_length(p_instances) not between 1 and 100 then raise exception 'Добавьте от 1 до 100 экземпляров'; end if;
  select count(*) into n from public.tool_instances where model_id=m.id and user_id=u;
  for r in select value from jsonb_array_elements(p_instances) loop
    cost := (r->>'purchase_cost')::numeric; lim := (r->>'resource_limit')::numeric;
    used := (r->>'used_resource')::numeric; started := (r->>'started_on')::date;
    if cost is null or cost<0 or lim is null or lim<=0 or used is null or used<0 or used>lim or started is null or started>current_date
      or cost::text in ('NaN','Infinity','-Infinity') or lim::text in ('NaN','Infinity','-Infinity') or used::text in ('NaN','Infinity','-Infinity') then
      raise exception 'Проверьте цену, дату и износ каждого экземпляра';
    end if;
    if m.resource_mode in ('items','cycles','days') and (lim<>trunc(lim) or used<>trunc(used)) then raise exception 'Ресурс указывается целым числом'; end if;
    used := case when m.resource_mode='days' then least(lim,greatest(0,current_date-started)) else used end;
    n := n+1;
    insert into public.tool_instances(user_id,model_id,label,resource_mode,resource_limit,used_resource,purchase_cost,charged_cost,started_on)
    values(u,m.id,coalesce(nullif(trim(r->>'label'),''),left(m.name,60)||' · №'||n),m.resource_mode,lim,
      case when m.resource_mode='days' then 0 else used end,cost,round(cost*used/lim,2),started) returning * into t;
    insert into public.tool_events(user_id,instance_id,event_type,instance_label,resource_mode,resource_amount,cost_amount,note)
    values(u,t.id,'receipt',t.label,t.resource_mode,used,t.charged_cost,'Добавлен на склад');
  end loop;
end $$;

create function public.delete_tool(p_model_id uuid default null,p_instance_id uuid default null)
returns void language plpgsql security invoker set search_path='' as $$
declare u uuid := auth.uid(); mid uuid; t public.tool_instances%rowtype;
begin
  if u is null then raise exception 'Войдите в аккаунт'; end if;
  if (p_model_id is null) = (p_instance_id is null) then raise exception 'Выберите инструмент или один экземпляр'; end if;
  if p_instance_id is not null then
    select model_id into mid from public.tool_instances where id=p_instance_id and user_id=u;
  else mid := p_model_id; end if;
  -- Same lock order as receipt and production: model, then physical instances.
  perform 1 from public.tool_models where id=mid and user_id=u for update;
  if not found then raise exception 'Инструмент не найден'; end if;
  for t in select * from public.tool_instances where model_id=mid and user_id=u and deleted_at is null
    and (p_instance_id is null or id=p_instance_id) order by id for update loop
    update public.tool_instances set deleted_at=now() where id=t.id and user_id=u;
    insert into public.tool_events(user_id,instance_id,event_type,instance_label,resource_mode,note)
    values(u,t.id,'delete',t.label,t.resource_mode,'Удалён из текущего учёта без списания стоимости');
  end loop;
  if p_model_id is not null then update public.tool_models set deleted_at=coalesce(deleted_at,now()),is_common=false where id=mid and user_id=u; end if;
end $$;

create or replace function public.save_tool_model(p_model_id uuid,p_data jsonb,p_count integer default 0)
returns uuid language plpgsql security invoker set search_path='' as $$
declare
  u uuid := auth.uid(); old public.tool_models%rowtype; mid uuid; mode text := p_data->>'resource_mode'; res numeric := (p_data->>'resource_limit')::numeric;
begin
  if u is null then raise exception 'Войдите в аккаунт'; end if;
  if p_count is null or p_count<0 or p_count>100 or mode is null or res is null or res<=0 then raise exception 'Укажите ресурс и количество'; end if;
  if mode in ('items','cycles','days') and res<>trunc(res) then raise exception 'Ресурс указывается целым числом'; end if;
  if p_model_id is not null then
    select * into old from public.tool_models where id=p_model_id and user_id=u and deleted_at is null for update;
    if not found then raise exception 'Инструмент не найден'; end if;
    if old.resource_mode is distinct from mode and exists(select 1 from public.tool_instances where model_id=old.id and user_id=u) then
      raise exception 'Для другого способа учета создайте новый инструмент';
    end if;
    update public.tool_models set name=trim(p_data->>'name'),kind=p_data->>'kind',resource_mode=mode,default_resource=res,
      default_cost=(p_data->>'purchase_cost')::numeric,output_per_cycle=coalesce((p_data->>'output_per_cycle')::integer,1),
      hours_per_day=coalesce((p_data->>'hours_per_day')::numeric,8),is_common=(p_data->>'kind'<>'mold' and coalesce((p_data->>'is_common')::boolean,false)),notes=p_data->>'notes'
    where id=old.id and user_id=u returning id into mid;
  else
    insert into public.tool_models(user_id,name,kind,resource_mode,default_resource,default_cost,output_per_cycle,hours_per_day,is_common,notes)
    values(u,trim(p_data->>'name'),p_data->>'kind',mode,res,(p_data->>'purchase_cost')::numeric,coalesce((p_data->>'output_per_cycle')::integer,1),
      coalesce((p_data->>'hours_per_day')::numeric,8),(p_data->>'kind'<>'mold' and coalesce((p_data->>'is_common')::boolean,false)),p_data->>'notes') returning id into mid;
  end if;
  if p_data ? 'instances' then
    if jsonb_typeof(p_data->'instances') is distinct from 'array' or jsonb_array_length(p_data->'instances')<>p_count then raise exception 'Проверьте список экземпляров'; end if;
    if p_count>0 then perform public.add_tool_instance_rows(mid,p_data->'instances'); end if;
  elsif p_count>0 then
    perform public.add_tool_instances(mid,p_count,(p_data->>'purchase_cost')::numeric,res,(p_data->>'started_on')::date,coalesce((p_data->>'used_resource')::numeric,0));
  end if;
  return mid;
end $$;

create or replace function public.change_tool_instance(p_instance_id uuid,p_action text,p_amount numeric default 0,p_label text default null,p_note text default '')
returns void language plpgsql security invoker set search_path='' as $$
declare u uuid := auth.uid(); t public.tool_instances%rowtype; cost numeric := 0;
begin
  if u is null then raise exception 'Войдите в аккаунт'; end if;
  select * into t from public.tool_instances where id=p_instance_id and user_id=u and deleted_at is null for update;
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

create or replace function public.save_product_tools(p_product_id uuid,p_tools jsonb)
returns void language plpgsql security invoker set search_path='' as $$
declare u uuid := auth.uid(); r record;
begin
  if u is null then raise exception 'Войдите в аккаунт'; end if;
  perform 1 from public.products where id=p_product_id and user_id=u for update;
  if not found then raise exception 'Изделие не найдено'; end if;
  if jsonb_typeof(p_tools) is distinct from 'array' then raise exception 'Выберите инструменты'; end if;
  delete from public.product_tools where product_id=p_product_id and user_id=u;
  for r in select * from jsonb_to_recordset(p_tools) as x(model_id uuid,enabled boolean,quantity_per_item numeric) loop
    perform 1 from public.tool_models where id=r.model_id and user_id=u and deleted_at is null for share;
    if not found then raise exception 'Инструмент не найден'; end if;
    insert into public.product_tools(user_id,product_id,model_id,enabled,quantity_per_item) values(u,p_product_id,r.model_id,coalesce(r.enabled,true),coalesce(r.quantity_per_item,1));
  end loop;
end $$;

create function public.produce_selected_tools(p_product_id uuid,p_quantity numeric,p_tools jsonb,p_notes text,p_request_id uuid,p_selected_tools jsonb)
returns uuid language plpgsql security invoker set search_path='' as $$
declare
  u uuid := auth.uid(); p public.products%rowtype; old public.production_calculations%rowtype;
  cid uuid; bid uuid; r record; a record; t public.tool_instances%rowtype;
  required numeric; allocated numeric; amount numeric; used numeric; rate numeric; charge numeric;
  material_total numeric := 0; tool_total numeric := 0; labor_total numeric; total numeric; sale_price numeric; payload jsonb; selected_ids uuid[];
begin
  if u is null then raise exception 'Войдите в аккаунт'; end if;
  if p_quantity is null or p_quantity<=0 or p_quantity<>trunc(p_quantity) or p_quantity>100000 then raise exception 'Укажите целое количество изделий'; end if;
  if p_request_id is null or jsonb_typeof(p_tools) is distinct from 'array' then raise exception 'Не удалось подготовить изготовление'; end if;
  -- A stable product lock also serializes retries and recipe/tool edits.
  select * into p from public.products where id=p_product_id and user_id=u and is_active for update;
  if not found then raise exception 'Изделие не найдено'; end if;
  payload := jsonb_build_object('product_id',p_product_id,'quantity',p_quantity,'tools',p_tools,'notes',p_notes);
  if p_selected_tools is not null then payload := payload || jsonb_build_object('selected_tools',p_selected_tools); end if;
  select * into old from public.production_calculations where user_id=u and request_id=p_request_id;
  if found then
    if old.request_payload is distinct from payload then raise exception 'Это изготовление уже сохранено. Обновите склад'; end if;
    return old.id;
  end if;
  if p_selected_tools is null then
    select coalesce(array_agg(tm.id order by tm.id),'{}'::uuid[]) into selected_ids
      from public.tool_models tm left join public.product_tools pt on pt.model_id=tm.id and pt.product_id=p.id and pt.user_id=u
      where tm.user_id=u and tm.deleted_at is null and coalesce(pt.enabled,tm.is_common and tm.kind<>'mold');
  else
    if jsonb_typeof(p_selected_tools) is distinct from 'array' then raise exception 'Выберите инструменты для изготовления'; end if;
    select coalesce(array_agg(value::uuid),'{}'::uuid[]) into selected_ids from jsonb_array_elements_text(p_selected_tools);
    if exists(select 1 from unnest(selected_ids) x group by x having count(*)>1) then raise exception 'Инструмент указан дважды'; end if;
  end if;
  perform tm.id from public.tool_models tm where tm.user_id=u and tm.id=any(selected_ids) order by tm.id for share;
  if exists(select 1 from unnest(selected_ids) x left join public.tool_models tm on tm.id=x and tm.user_id=u where tm.id is null or tm.deleted_at is not null) then
    raise exception 'Инструмент удалён или недоступен. Обновите выбор';
  end if;
  if not exists(select 1 from public.product_materials pm join public.materials m on m.id=pm.material_id and m.user_id=u where pm.product_id=p.id and pm.user_id=u and m.category<>'depreciation') then raise exception 'Добавьте состав изделия'; end if;
  if exists(select 1 from public.product_materials pm join public.materials m on m.id=pm.material_id and m.user_id=u where pm.product_id=p.id and pm.user_id=u and m.category<>'depreciation' and not m.is_active) then raise exception 'В составе есть удалённый материал'; end if;
  perform m.id from public.materials m join public.product_materials pm on pm.material_id=m.id and pm.user_id=u
    where pm.product_id=p.id and m.user_id=u and m.category<>'depreciation' order by m.id for update of m;
  perform ti.id from public.tool_instances ti where ti.user_id=u and ti.id in (select (x->>'instance_id')::uuid from jsonb_array_elements(p_tools) x) order by ti.id for update;
  if exists(select 1 from jsonb_to_recordset(p_tools) as x(instance_id uuid,model_id uuid,amount numeric)
    left join public.tool_instances ti on ti.id=x.instance_id and ti.user_id=u
    left join public.tool_models tm on tm.id=x.model_id and tm.user_id=u
    left join public.product_tools pt on pt.model_id=tm.id and pt.product_id=p.id and pt.user_id=u
    where ti.id is null or tm.id is null or ti.model_id<>tm.id or ti.status<>'active' or ti.started_on>current_date or ti.deleted_at is not null or tm.deleted_at is not null or not (tm.id=any(selected_ids)) or x.amount is null or x.amount<=0) then
    raise exception 'Проверьте выбранные экземпляры';
  end if;
  if exists(select 1 from jsonb_array_elements(p_tools) x group by x->>'instance_id' having count(*)>1) then raise exception 'Экземпляр указан дважды'; end if;
  for r in select tm.*,coalesce(pt.quantity_per_item,1) as factor from public.tool_models tm
    left join public.product_tools pt on pt.model_id=tm.id and pt.product_id=p.id and pt.user_id=u
    where tm.user_id=u and tm.id=any(selected_ids) order by tm.id loop
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

-- Keep older clients strict; only the new flow accepts an explicit operation selection.
create or replace function public.produce_with_tools(p_product_id uuid,p_quantity numeric,p_tools jsonb,p_notes text,p_request_id uuid)
returns uuid language sql security invoker set search_path='' as $$
  select public.produce_selected_tools(p_product_id,p_quantity,p_tools,p_notes,p_request_id,null);
$$;

revoke all on function public.add_tool_instance_rows(uuid,jsonb),public.delete_tool(uuid,uuid),public.produce_selected_tools(uuid,numeric,jsonb,text,uuid,jsonb) from public,anon;
grant execute on function public.add_tool_instance_rows(uuid,jsonb),public.delete_tool(uuid,uuid),public.produce_selected_tools(uuid,numeric,jsonb,text,uuid,jsonb) to authenticated;
