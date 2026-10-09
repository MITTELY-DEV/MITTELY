-- ============================================================================
-- MITTELY — storage.sql
-- Run AFTER rls.sql. Creates storage buckets and their access policies.
-- NOTE: Bucket creation via SQL assumes the buckets don't already exist.
--       You can also create them via the Supabase dashboard.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Create buckets (idempotent)
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values
  ('product-images', 'product-images', true),
  ('blog-images',    'blog-images',    true),
  ('downloads',      'downloads',      false)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- product-images — public read, admin write
-- ---------------------------------------------------------------------------
drop policy if exists "product_images_public_read" on storage.objects;
create policy "product_images_public_read" on storage.objects
  for select using (bucket_id = 'product-images');

drop policy if exists "product_images_admin_insert" on storage.objects;
create policy "product_images_admin_insert" on storage.objects
  for insert with check (bucket_id = 'product-images' and public.is_admin());

drop policy if exists "product_images_admin_update" on storage.objects;
create policy "product_images_admin_update" on storage.objects
  for update using (bucket_id = 'product-images' and public.is_admin())
  with check (bucket_id = 'product-images' and public.is_admin());

drop policy if exists "product_images_admin_delete" on storage.objects;
create policy "product_images_admin_delete" on storage.objects
  for delete using (bucket_id = 'product-images' and public.is_admin());

-- ---------------------------------------------------------------------------
-- blog-images — public read, admin write
-- ---------------------------------------------------------------------------
drop policy if exists "blog_images_public_read" on storage.objects;
create policy "blog_images_public_read" on storage.objects
  for select using (bucket_id = 'blog-images');

drop policy if exists "blog_images_admin_insert" on storage.objects;
create policy "blog_images_admin_insert" on storage.objects
  for insert with check (bucket_id = 'blog-images' and public.is_admin());

drop policy if exists "blog_images_admin_update" on storage.objects;
create policy "blog_images_admin_update" on storage.objects
  for update using (bucket_id = 'blog-images' and public.is_admin())
  with check (bucket_id = 'blog-images' and public.is_admin());

drop policy if exists "blog_images_admin_delete" on storage.objects;
create policy "blog_images_admin_delete" on storage.objects
  for delete using (bucket_id = 'blog-images' and public.is_admin());

-- ---------------------------------------------------------------------------
-- downloads — private; NO client SELECT; only admin INSERT;
-- downloads only via signed URLs from the create-download-url Edge Function.
-- ---------------------------------------------------------------------------
drop policy if exists "downloads_admin_insert" on storage.objects;
create policy "downloads_admin_insert" on storage.objects
  for insert with check (bucket_id = 'downloads' and public.is_admin());

drop policy if exists "downloads_admin_delete" on storage.objects;
create policy "downloads_admin_delete" on storage.objects
  for delete using (bucket_id = 'downloads' and public.is_admin());