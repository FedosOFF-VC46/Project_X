-- Supabase default table grants include TRUNCATE; RLS does not protect it.
revoke all on public.product_categories from anon, authenticated;
grant select, insert, update on public.product_categories to authenticated;
