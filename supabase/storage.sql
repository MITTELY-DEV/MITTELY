-- ============================================
-- MITTELY — Storage Buckets & Policies
-- Run AFTER schema.sql and rls.sql
-- ============================================

-- Create buckets
insert into storage.buckets (id, name, public)
values ('product-images', 'product-images', true)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
values ('blog-images', 'blog-images', true)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
values ('downloads', 'downloads', false)
on conflict (id) do nothing;

-- ============ PRODUCT IMAGES (public read, admin write) ============
drop policy if exists "product-images read" on storage.objects;
create policy "product-images read"
  on storage.objects for select
  using (bucket_id = 'product-images');

drop policy if exists "product-images admin insert" on storage.objects;
create policy "product-images admin insert"
  on storage.objects for insert
  with check (bucket_id = 'product-images' and is_admin());

drop policy if exists "product-images admin update" on storage.objects;
create policy "product-images admin update"
  on storage.objects for update
  using (bucket_id = 'product-images' and is_admin())
  with check (bucket_id = 'product-images' and is_admin());

drop policy if exists "product-images admin delete" on storage.objects;
create policy "product-images admin delete"
  on storage.objects for delete
  using (bucket_id = 'product-images' and is_admin());

-- ============ BLOG IMAGES (public read, admin write) ============
drop policy if exists "blog-images read" on storage.objects;
create policy "blog-images read"
  on storage.objects for select
  using (bucket_id = 'blog-images');

drop policy if exists "blog-images admin insert" on storage.objects;
create policy "blog-images admin insert"
  on storage.objects for insert
  with check (bucket_id = 'blog-images' and is_admin());

drop policy if exists "blog-images admin update" on storage.objects;
create policy "blog-images admin update"
  on storage.objects for update
  using (bucket_id = 'blog-images' and is_admin())
  with check (bucket_id = 'blog-images' and is_admin());

drop policy if exists "blog-images admin delete" on storage.objects;
create policy "blog-images admin delete"
  on storage.objects for delete
  using (bucket_id = 'blog-images' and is_admin());

-- ============ DOWNLOADS (private, admin write only) ============
-- No client SELECT policy — access ONLY via signed URLs from create-download-url edge function.
drop policy if exists "downloads admin insert" on storage.objects;
create policy "downloads admin insert"
  on storage.objects for insert
  with check (bucket_id = 'downloads' and is_admin());

drop policy if exists "downloads admin update" on storage.objects;
create policy "downloads admin update"
  on storage.objects for update
  using (bucket_id = 'downloads' and is_admin())
  with check (bucket_id = 'downloads' and is_admin());

drop policy if exists "downloads admin delete" on storage.objects;
create policy "downloads admin delete"
  on storage.objects for delete
  using (bucket_id = 'downloads' and is_admin());