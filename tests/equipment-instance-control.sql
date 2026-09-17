-- Isolated account, actual authenticated RLS, no persistent test records.
begin;
insert into auth.users(id,email) values(gen_random_uuid(),'formula-control-'||gen_random_uuid()||'@example.invalid');
select set_config('request.jwt.claim.sub',id::text,true) from auth.users where email like 'formula-control-%@example.invalid' order by created_at desc nulls first limit 1;
set local role authenticated;
do $$
declare
  u uuid:=auth.uid(); mid uuid; other uuid; a uuid; b uuid; c uuid; pid uuid; mat uuid; cid uuid; req uuid:=gen_random_uuid();
  payload jsonb; rows_before integer; failed boolean;
begin
  insert into public.materials(user_id,name,unit,package_cost,package_quantity) values(u,'Тест: смола','g',1000,500) returning id into mat;
  insert into public.stock_movements(user_id,material_id,movement_type,source_type,quantity_delta) values(u,mat,'receipt','manual',1000);
  insert into public.products(user_id,name,work_hours,markup_percent) values(u,'Тест: изделие',0.5,20) returning id into pid;
  insert into public.product_materials(user_id,product_id,material_id,quantity_per_unit) values(u,pid,mat,35);
  payload:=jsonb_build_array(
    jsonb_build_object('purchase_cost',1000,'resource_limit',10,'used_resource',4,'started_on',current_date-7),
    jsonb_build_object('purchase_cost',1000,'resource_limit',10,'used_resource',0,'started_on',current_date),
    jsonb_build_object('purchase_cost',1000,'resource_limit',10,'used_resource',0,'started_on',current_date,'label','Для синей смолы'));
  mid:=public.save_tool_model(null,jsonb_build_object('name','Молд для часов','kind','mold','resource_mode','cycles','resource_limit',10,'purchase_cost',1000,'is_common',true,'instances',payload),3);
  assert (select not is_common from public.tool_models where id=mid),'mold became common';
  assert (select count(*)=3 and sum(used_resource)=4 and sum(charged_cost)=400 from public.tool_instances where model_id=mid),'individual wear not saved';
  select id into a from public.tool_instances where model_id=mid and label='Молд для часов · №1';
  select id into b from public.tool_instances where model_id=mid and label='Молд для часов · №2';
  select id into c from public.tool_instances where model_id=mid and label='Для синей смолы';
  assert a is not null and b is not null and c is not null,'descriptive/custom names';
  assert (select started_on=current_date-7 from public.tool_instances where id=a),'individual date';
  failed:=false;
  begin
    perform public.add_tool_instance_rows(mid,payload || jsonb_build_array(jsonb_build_object('purchase_cost',1000,'resource_limit',10,'used_resource',11,'started_on',current_date)));
  exception when others then failed:=true; end;
  assert failed and (select count(*)=3 from public.tool_instances where model_id=mid),'invalid row did not roll back whole addition';
  other:=public.save_tool_model(null,jsonb_build_object('name','Другой молд','kind','mold','resource_mode','items','resource_limit',10,'purchase_cost',500,'started_on',current_date),1);
  perform public.save_product_tools(pid,jsonb_build_array(jsonb_build_object('model_id',mid),jsonb_build_object('model_id',other)));
  payload:=jsonb_build_array(jsonb_build_object('instance_id',a,'model_id',mid,'amount',1));
  cid:=public.produce_selected_tools(pid,1,payload,'Выбран один молд',req,jsonb_build_array(mid));
  assert (select tool_cost_total=100 from public.production_calculations where id=cid),'selected cost';
  assert (select used_resource=5 from public.tool_instances where id=a),'selected wear';
  assert (select sum(used_resource)=0 from public.tool_instances where model_id=other),'unselected mold consumed';
  assert (select count(*)=2 from public.product_tools where product_id=pid and enabled),'product defaults mutated';
  assert public.produce_selected_tools(pid,1,payload,'Выбран один молд',req,jsonb_build_array(mid))=cid,'retry';
  assert (select used_resource=5 from public.tool_instances where id=a),'retry consumed wear';
  failed:=false;
  begin perform public.produce_selected_tools(pid,1,payload,'Выбран один молд',req,'[]'); exception when others then failed:=true; end;
  assert failed,'request selection mismatch';
  perform public.produce_selected_tools(pid,1,'[]',null,gen_random_uuid(),'[]');
  assert (select used_resource=5 from public.tool_instances where id=a),'empty selection consumed wear';
  failed:=false;
  begin perform public.produce_selected_tools(pid,1,'[]',null,gen_random_uuid(),jsonb_build_array(mid)); exception when others then failed:=true; end;
  assert failed,'selected tool missing allocation';
  failed:=false;
  begin perform public.produce_selected_tools(pid,1,payload,null,gen_random_uuid(),'[]'); exception when others then failed:=true; end;
  assert failed,'allocation for unselected tool accepted';
  failed:=false;
  begin perform public.produce_selected_tools(pid,1,payload,null,gen_random_uuid(),jsonb_build_array(mid,mid)); exception when others then failed:=true; end;
  assert failed,'duplicate model accepted';
  perform public.delete_tool(null,b);
  assert (select deleted_at is not null and charged_cost=0 from public.tool_instances where id=b),'delete adds expense';
  assert (select count(*)=2 from public.tool_instances where model_id=mid and deleted_at is null),'deleted siblings';
  select count(*) into rows_before from public.tool_events where instance_id=b;
  perform public.delete_tool(null,b);
  assert (select count(*)=rows_before from public.tool_events where instance_id=b),'delete retry duplicated event';
  failed:=false;
  begin perform public.change_tool_instance(b,'resume'); exception when others then failed:=true; end;
  assert failed,'deleted instance restored through old action';
  perform public.delete_tool(mid,null);
  assert (select deleted_at is not null from public.tool_models where id=mid),'model remains visible';
  assert not exists(select 1 from public.tool_instances where model_id=mid and deleted_at is null),'model instances remain active';
  assert (select tool_cost_total=100 from public.production_calculations where id=cid),'history cost changed';
  assert (select count(*)=1 and sum(cost_amount)=100 from public.tool_events where calculation_id=cid),'history lost';
  assert (select sum(cost_amount)=0 from public.tool_events where event_type='delete' and user_id=u),'deletion charged expense';
  failed:=false;
  begin perform public.produce_selected_tools(pid,1,payload,null,gen_random_uuid(),jsonb_build_array(mid)); exception when others then failed:=true; end;
  assert failed,'deleted model used for production';
  failed:=false;
  begin perform public.add_tool_instance_rows(mid,payload); exception when others then failed:=true; end;
  assert failed,'deleted model received instances';
  -- Historical retry must still work after deletion.
  assert public.produce_selected_tools(pid,1,payload,'Выбран один молд',req,jsonb_build_array(mid))=cid,'historical retry after deletion';
  perform set_config('request.jwt.claim.sub',gen_random_uuid()::text,true);
  failed:=false;
  begin perform public.delete_tool(other,null); exception when others then failed:=true; end;
  assert failed,'cross-account deletion';
  failed:=false;
  begin perform public.add_tool_instance_rows(other,payload); exception when others then failed:=true; end;
  assert failed,'cross-account receipt';
  perform set_config('request.jwt.claim.sub',u::text,true);
  assert (select deleted_at is null from public.tool_models where id=other),'foreign deletion modified model';
end $$;
reset role;
rollback;
select 'Instance controls passed; all fixtures rolled back' as result;
