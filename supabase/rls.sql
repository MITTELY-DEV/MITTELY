-- ============================================
-- MITTELY — Row Level Security, Triggers, RPCs
-- Run AFTER schema.sql
-- ============================================

-- ============ ENABLE RLS ============
alter table admin_users enable row level security;
alter table licenses enable row level security;
alter table products enable row level security;
alter table orders enable row level security;
alter table order_items enable row level security;
alter table reviews enable row level security;
alter table settings enable row level security;
alter table submissions enable row level security;
alter table newsletter enable row level security;
alter table wishlist enable row level security;
alter table coupons enable row level security;
alter table blog_posts enable row level security;
alter table profiles enable row level security;
alter table activity_log enable row level security;

-- ============ ADMIN_USERS ============
drop policy if exists admin_users_select on admin_users;
create policy admin_users_select on admin_users for select
  using (is_admin());

drop policy if exists admin_users_insert on admin_users;
create policy admin_users_insert on admin_users for insert
  with check (is_admin() and email <> 'henryagyemang906@gmail.com');

drop policy if exists admin_users_delete on admin_users;
create policy admin_users_delete on admin_users for delete
  using (is_admin() and email <> 'henryagyemang906@gmail.com');

-- ============ LICENSES ============
drop policy if exists licenses_select on licenses;
create policy licenses_select on licenses for select using (true);

drop policy if exists licenses_admin on licenses;
create policy licenses_admin on licenses for all using (is_admin()) with check (is_admin());

-- ============ PRODUCTS ============
drop policy if exists products_select on products;
create policy products_select on products for select
  using (is_published = true or is_admin());

drop policy if exists products_admin on products;
create policy products_admin on products for all
  using (is_admin()) with check (is_admin());

-- ============ SETTINGS ============
drop policy if exists settings_select on settings;
create policy settings_select on settings for select using (true);

drop policy if exists settings_update on settings;
create policy settings_update on settings for update
  using (is_admin()) with check (is_admin());

drop policy if exists settings_insert on settings;
create policy settings_insert on settings for insert
  with check (is_admin());

-- ============ REVIEWS ============
drop policy if exists reviews_select on reviews;
create policy reviews_select on reviews for select
  using (status = 'approved' or is_admin());

drop policy if exists reviews_insert on reviews;
create policy reviews_insert on reviews for insert
  with check (auth.role() = 'authenticated');

drop policy if exists reviews_update on reviews;
create policy reviews_update on reviews for update
  using (is_admin()) with check (is_admin());

drop policy if exists reviews_delete on reviews;
create policy reviews_delete on reviews for delete using (is_admin());

-- ============ SUBMISSIONS ============
drop policy if exists submissions_insert on submissions;
create policy submissions_insert on submissions for insert with check (true);

drop policy if exists submissions_select on submissions;
create policy submissions_select on submissions for select using (is_admin());

drop policy if exists submissions_update on submissions;
create policy submissions_update on submissions for update
  using (is_admin()) with check (is_admin());

-- ============ NEWSLETTER ============
drop policy if exists newsletter_insert on newsletter;
create policy newsletter_insert on newsletter for insert with check (true);

drop policy if exists newsletter_select on newsletter;
create policy newsletter_select on newsletter for select using (is_admin());

drop policy if exists newsletter_delete on newsletter;
create policy newsletter_delete on newsletter for delete using (is_admin());

-- ============ ORDERS ============
drop policy if exists orders_select on orders;
create policy orders_select on orders for select
  using (email = auth.jwt() ->> 'email' or is_admin());

-- ============ ORDER_ITEMS ============
drop policy if exists order_items_select on order_items;
create policy order_items_select on order_items for select
  using (
    exists (select 1 from orders o where o.id = order_items.order_id and (o.email = auth.jwt() ->> 'email' or is_admin()))
  );

-- ============ WISHLIST ============
drop policy if exists wishlist_select on wishlist;
create policy wishlist_select on wishlist for select
  using (email = auth.jwt() ->> 'email');

drop policy if exists wishlist_insert on wishlist;
create policy wishlist_insert on wishlist for insert
  with check (email = auth.jwt() ->> 'email');

drop policy if exists wishlist_delete on wishlist;
create policy wishlist_delete on wishlist for delete
  using (email = auth.jwt() ->> 'email');

-- ============ COUPONS ============
drop policy if exists coupons_admin on coupons;
create policy coupons_admin on coupons for all
  using (is_admin()) with check (is_admin());

-- ============ BLOG POSTS ============
drop policy if exists blog_posts_select on blog_posts;
create policy blog_posts_select on blog_posts for select
  using (status = 'published' or is_admin());

drop policy if exists blog_posts_admin on blog_posts;
create policy blog_posts_admin on blog_posts for all
  using (is_admin()) with check (is_admin());

-- ============ PROFILES ============
drop policy if exists profiles_select on profiles;
create policy profiles_select on profiles for select
  using (email = auth.jwt() ->> 'email' or is_admin());

-- ============ ACTIVITY LOG ============
drop policy if exists activity_log_select on activity_log;
create policy activity_log_select on activity_log for select
  using (email = auth.jwt() ->> 'email' or is_admin());

-- ============ TRIGGERS ============

-- (a) Reviews: force email/name from auth + log activity
create or replace function reviews_before_insert() returns trigger
language plpgsql security definer as $$
declare
  v_email text;
  v_name text;
begin
  v_email := auth.jwt() ->> 'email';
  v_name := coalesce(auth.jwt() -> 'user_metadata' ->> 'full_name', v_email);
  if v_email is not null then
    new.email := v_email;
    if new.name is null or new.name = '' then new.name := v_name; end if;
  end if;
  new.status := 'pending';
  return new;
end;
$$;

drop trigger if exists trg_reviews_before_insert on reviews;
create trigger trg_reviews_before_insert
  before insert on reviews
  for each row execute function reviews_before_insert();

create or replace function reviews_after_insert() returns trigger
language plpgsql security definer as $$
begin
  perform log_activity(new.email, 'review', jsonb_build_object('product_id', new.product_id, 'rating', new.rating));
  return new;
end;
$$;

drop trigger if exists trg_reviews_after_insert on reviews;
create trigger trg_reviews_after_insert
  after insert on reviews
  for each row execute function reviews_after_insert();

-- (b) Updated_at auto-touch
create or replace function touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_products_updated_at on products;
create trigger trg_products_updated_at
  before update on products
  for each row execute function touch_updated_at();

drop trigger if exists trg_blog_posts_updated_at on blog_posts;
create trigger trg_blog_posts_updated_at
  before update on blog_posts
  for each row execute function touch_updated_at();

-- (c) Wishlist: enforce email + log
create or replace function wishlist_before_insert() returns trigger
language plpgsql security definer as $$
declare
  v_email text;
begin
  v_email := auth.jwt() ->> 'email';
  if v_email is null then
    raise exception 'Authentication required';
  end if;
  new.email := v_email;
  return new;
end;
$$;

drop trigger if exists trg_wishlist_before_insert on wishlist;
create trigger trg_wishlist_before_insert
  before insert on wishlist
  for each row execute function wishlist_before_insert();

create or replace function wishlist_after_insert() returns trigger
language plpgsql security definer as $$
begin
  perform log_activity(new.email, 'wishlist', jsonb_build_object('product_id', new.product_id));
  return new;
end;
$$;

drop trigger if exists trg_wishlist_after_insert on wishlist;
create trigger trg_wishlist_after_insert
  after insert on wishlist
  for each row execute function wishlist_after_insert();

-- (d) handle_new_user → profiles + activity
create or replace function handle_new_user() returns trigger
language plpgsql security definer as $$
begin
  insert into profiles (id, email, name, avatar_url)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', new.email),
    new.raw_user_meta_data ->> 'avatar_url'
  )
  on conflict (id) do update set
    email = excluded.email,
    name = excluded.name,
    avatar_url = excluded.avatar_url;
  perform log_activity(new.email, 'signup', '{}'::jsonb);
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- ============ RPCs ============

-- is_admin_rpc (client-callable wrapper)
create or replace function is_admin_rpc() returns boolean
language sql security definer stable as $$
  select is_admin();
$$;

-- log_activity (client-callable; email scoped to caller)
create or replace function log_activity(p_email text, p_event text, p_meta jsonb)
returns void
language plpgsql security definer as $$
declare
  v_email text;
begin
  v_email := auth.jwt() ->> 'email';
  if v_email is null then
    raise exception 'Authentication required';
  end if;
  if p_email is null or p_email <> v_email then
    raise exception 'Cannot log activity for another user';
  end if;
  insert into activity_log (email, event, meta) values (v_email, p_event, coalesce(p_meta, '{}'::jsonb));
end;
$$;

-- increment_sales_count
create or replace function increment_sales_count(p_product_id uuid)
returns void
language sql security definer as $$
  update products set sales_count = coalesce(sales_count, 0) + 1 where id = p_product_id;
$$;

-- increment_download_count
create or replace function increment_download_count(p_product_id uuid)
returns void
language sql security definer as $$
  update products set download_count = coalesce(download_count, 0) + 1 where id = p_product_id;
$$;

-- increment_reviews_count
create or replace function increment_reviews_count(p_product_id uuid)
returns void
language sql security definer as $$
  update products set reviews_count = coalesce(reviews_count, 0) + 1 where id = p_product_id;
$$;

-- increment_blog_views
create or replace function increment_blog_views(post_id uuid)
returns void
language sql security definer as $$
  update blog_posts set views_count = coalesce(views_count, 0) + 1 where id = post_id and status = 'published';
$$;

-- get_site_stats
create or replace function get_site_stats()
returns jsonb
language plpgsql security definer stable as $$
declare
  v_products int;
  v_orders int;
  v_downloads int;
begin
  select count(*) into v_products from products where is_published = true;
  select count(*) into v_orders from orders where status = 'success';
  select coalesce(sum(download_count), 0) into v_downloads from products;
  return jsonb_build_object(
    'products_count', v_products,
    'orders_count', v_orders,
    'downloads_count', v_downloads
  );
end;
$$;

-- get_fx_rate — returns the fallback rate from settings (used server-side in verify-payment)
create or replace function get_fx_rate()
returns numeric
language plpgsql security definer stable as $$
declare
  v numeric;
begin
  select svalue::numeric into v from settings where skey = 'fx_fallback_rate' limit 1;
  if v is null or v <= 0 then v := 15.50; end if;
  return v;
end;
$$;

-- admin_list_users (admin-only) — profiles + order / spend / download aggregates
create or replace function admin_list_users()
returns table (
  id uuid,
  email text,
  name text,
  avatar_url text,
  created_at timestamptz,
  orders_count int,
  total_spent_usd numeric,
  downloads_count int
)
language plpgsql security definer stable as $$
begin
  if not is_admin() then
    raise exception 'Admin only';
  end if;
  return query
  select
    p.id,
    p.email,
    p.name,
    p.avatar_url,
    p.created_at,
    coalesce((select count(*) from orders o where o.email = p.email and o.status = 'success'), 0)::int,
    coalesce((select sum(o.usd_amount) from orders o where o.email = p.email and o.status = 'success'), 0)::numeric,
    coalesce((
      select count(*) from activity_log a
      where a.email = p.email and a.event = 'download'
    ), 0)::int
  from profiles p
  order by p.created_at desc;
end;
$$;

-- ============ Grants ============
grant execute on function is_admin_rpc() to anon, authenticated;
grant execute on function log_activity(text, text, jsonb) to authenticated;
grant execute on function get_site_stats() to anon, authenticated;
grant execute on function get_fx_rate() to anon, authenticated;
grant execute on function increment_sales_count(uuid) to authenticated;
grant execute on function increment_download_count(uuid) to authenticated;
grant execute on function increment_reviews_count(uuid) to authenticated;
grant execute on function increment_blog_views(uuid) to anon, authenticated;
grant execute on function admin_list_users() to authenticated;