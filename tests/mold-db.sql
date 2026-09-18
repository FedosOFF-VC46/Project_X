-- Run against the isolated fixture after applying atomic_mold_recipes.sql.
begin;
insert into public.materials (id,user_id,name,unit,package_cost,package_quantity) values
 ('10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','Resin','g',2500,1000),
 ('10000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000001','Ink','ml',30,1),
 ('10000000-0000-4000-8000-000000000003','20000000-0000-4000-8000-000000000001','Pair','pair',15,1),
 ('10000000-0000-4000-8000-000000000004','20000000-0000-4000-8000-000000000002','Other user','g',999,1);
set local role authenticated;
select set_config('request.jwt.claim.sub','20000000-0000-4000-8000-000000000001',true);
do $$
declare
  recipe uuid := '30000000-0000-4000-8000-000000000001';
  data jsonb := '{"title":"Three materials","mode":"sizes","length":12,"width":8,"height":1.5,"manual":999,"finish":true,"thickness":0.8}';
  items jsonb := '[{"material_id":"10000000-0000-4000-8000-000000000001","quantity":140},{"material_id":"10000000-0000-4000-8000-000000000002","quantity":2},{"material_id":"10000000-0000-4000-8000-000000000003","quantity":1}]';
  failed boolean;
begin
  perform public.save_mold_recipe(recipe,data,items);
  assert (select mold_volume_ml=151.680 from public.mold_calculations where id=recipe), 'dimension/finish math';
  assert (select recommended_volume_ml is null from public.mold_calculations where id=recipe), 'inactive manual source';
  assert (select count(*)=3 from public.mold_calculation_items where calculation_id=recipe), 'all three materials';
  assert (select sum(total_cost)=425 from public.mold_calculation_items where calculation_id=recipe), 'server cost snapshots';
  assert (select sum(current_stock)=0 from public.materials), 'saving must not move stock';
  perform public.save_mold_recipe(recipe,data,items);
  assert (select count(*)=1 from public.mold_calculations), 'retry does not duplicate parent';
  assert (select count(*)=3 from public.mold_calculation_items), 'retry does not duplicate children';

  failed := false;
  begin
    perform public.save_mold_recipe(recipe,data || '{"title":"Must roll back"}',items || '[{"material_id":"10000000-0000-4000-8000-000000000004","quantity":1}]');
  exception when others then failed := true; end;
  assert failed, 'foreign material must fail';
  assert (select title='Three materials' from public.mold_calculations where id=recipe), 'failed save rolls back parent';
  assert (select count(*)=3 from public.mold_calculation_items where calculation_id=recipe), 'failed save restores all prior children';

  failed := false;
  begin
    perform public.save_mold_recipe(recipe,data,'[{"material_id":"10000000-0000-4000-8000-000000000001","quantity":0}]');
  exception when others then failed := true; end;
  assert failed, 'zero quantity must fail';
  assert (select count(*)=3 from public.mold_calculation_items where calculation_id=recipe), 'invalid quantity rollback';

  perform public.save_mold_recipe(recipe,data || '{"mode":"manual","manual":120,"finish_ml":7.68}',items);
  assert (select mold_volume_ml=127.680 and finish_coefficient is null from public.mold_calculations where id=recipe), 'manual finish volume';
  perform public.save_mold_recipe(recipe,data || '{"mode":"manual","manual":120,"finish":false}', '[]');
  assert (select mold_volume_ml=120 and finish_volume_ml=0 from public.mold_calculations where id=recipe), 'disabled finish is ignored';
  assert (select count(*)=0 from public.mold_calculation_items where calculation_id=recipe), 'volume-only recipe is allowed';
  perform public.save_mold_recipe(recipe,data,items);
  perform public.save_mold_recipe('30000000-0000-4000-8000-000000000002',data,items);

  perform set_config('request.jwt.claim.sub','20000000-0000-4000-8000-000000000002',true);
  failed := false;
  begin perform public.save_mold_recipe(recipe,data,'[]'); exception when others then failed := true; end;
  assert failed, 'cannot overwrite another user recipe';
  assert (select count(*)=0 from public.mold_calculations), 'cannot read another user recipe';
  delete from public.mold_calculations where id=recipe;
  assert not found, 'cannot delete another user recipe';
  perform set_config('request.jwt.claim.sub','20000000-0000-4000-8000-000000000001',true);
  assert (select count(*)=3 from public.mold_calculation_items where calculation_id=recipe), 'unauthorized deletion preserves ingredients';
  delete from public.mold_calculations where id=recipe and user_id=auth.uid();
  assert found, 'owner can delete own recipe';
  assert (select count(*)=0 from public.mold_calculation_items where calculation_id=recipe), 'recipe deletion cascades to its ingredients';
  assert (select count(*)=1 from public.mold_calculations), 'deletion preserves other recipes';
  assert (select count(*)=3 from public.mold_calculation_items), 'deletion preserves other recipe ingredients';
  assert (select count(*)=3 and sum(current_stock)=0 from public.materials), 'recipe deletion preserves warehouse materials';
  perform set_config('request.jwt.claim.sub','',true);
  failed := false;
  begin perform public.save_mold_recipe(gen_random_uuid(),data,'[]'); exception when others then failed := true; end;
  assert failed, 'missing auth rejected';
end $$;
reset role;
do $$ begin
  assert not has_function_privilege('anon','public.save_mold_recipe(uuid,jsonb,jsonb)','execute'), 'anonymous execution revoked';
  assert not (select prosecdef from pg_proc where oid='public.save_mold_recipe(uuid,jsonb,jsonb)'::regprocedure), 'function cannot bypass RLS';
end $$;
rollback;
