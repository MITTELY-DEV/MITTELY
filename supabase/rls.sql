-- ============================================================================
-- MITTELY — rls.sql
-- Run AFTER schema.sql. Enables Row Level Security on ALL tables and
-- installs triggers + security-definer RPCs used by the app.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Enable RLS on everything
-- ---------------------------------------------------------------------------
alter table admin_users        enable row level security;
alter table licenses           enable row level security;
alter table products           enable row level security;
alter table orders             enable row level security;
alter table order_items        enable row level security;
alter table reviews            enable row level security;
alter table settings           enable row level security;
alter table submissions        enable row level security;
alter table newsletter         enable row level security;
alter table wishlist           enable row level security;
alter table coupons            enable row level security;
alter table blog_posts         enable row level security;
alter table wallets            enable row level security;
alter table wallet_transactions enable row level security;
alter table payout_requests    enable row level security;
alter table profiles           enable row level security;
alter table activity_log       enable row level security;

-- ---------------------------------------------------------------------------
-- admin_users
-- ---------------------------------------------------------------------------
drop policy if exists admin_users_select on admin_users;
create policy admin_users_select on admin_users
  for select using (is_admin());

drop policy if exists admin_users_insert on admin_users;
create policy admin_users_insert on admin_users
  for insert with check (is_admin() and lower(email) <> 'henryagyemang906@gmail.com');

drop policy if exists admin_users_delete on admin_users;
create policy admin_users_delete on admin_users
  for delete using (is_admin() and lower(email) <> 'henryagyemang906@gmail.com');

-- ---------------------------------------------------------------------------
-- licenses — readable by everyone
-- ---------------------------------------------------------------------------
drop policy if exists licenses_select on licenses;
create policy licenses_select on licenses
  for select using (true);

-- ---------------------------------------------------------------------------
-- products
-- ---------------------------------------------------------------------------
drop policy if exists products_select_published on products;
create policy products_select_published on products
  for select using (is_published = true or is_admin());

drop policy if exists products_admin_write on products;
create policy products_admin_write on products
  for all using (is_admin()) with check (is_admin());

-- ---------------------------------------------------------------------------
-- settings
-- ---------------------------------------------------------------------------
drop policy if exists settings_select on settings;
create policy settings_select on settings
  for select using (true);

drop policy if exists settings_admin_write on settings;
create policy settings_admin_write on settings
  for all using (is_admin()) with check (is_admin());

-- ---------------------------------------------------------------------------
-- reviews
-- ---------------------------------------------------------------------------
drop policy if exists reviews_select_approved on reviews;
create policy reviews_select_approved on reviews
  for select using (status = 'approved' or is_admin() or lower(email) = lower(coalesce(auth.jwt() ->> 'email','')));

drop policy if exists reviews_insert_auth on reviews;
create policy reviews_insert_auth on reviews
  for insert to authenticated with check (true);

drop policy if exists reviews_admin_write on reviews;
create policy reviews_admin_write on reviews
  for update using (is_admin()) with check (is_admin());

drop policy if exists reviews_admin_delete on reviews;
create policy reviews_admin_delete on reviews
  for delete using (is_admin());

-- Force email/name from the authenticated user on insert.
create or replace function reviews_force_identity()
returns trigger language plpgsql security definer as $$
declare
  v_email text := lower(coalesce(auth.jwt() ->> 'email',''));
  v_name  text := coalesce(auth.jwt() -> 'user_metadata' ->> 'full_name',
                           auth.jwt() -> 'user_metadata' ->> 'name',
                           v_email);
begin
  if v_email = '' then
    raise exception 'Authentication required';
  end if;
  new.email := v_email;
  new.name := coalesce(nullif(new.name,''), v_name);
  return new;
end; $$;

drop trigger if exists reviews_force_identity on reviews;
create trigger reviews_force_identity before insert on reviews
for each row execute function reviews_force_identity();

-- Log activity on insert.
create or replace function reviews_log()
returns trigger language plpgsql security definer as $$
begin
  perform log_activity(new.email, 'review', jsonb_build_object('product_id', new.product_id, 'rating', new.rating));
  return new;
end; $$;

drop trigger if exists reviews_log on reviews;
create trigger reviews_log after insert on reviews
for each row execute function reviews_log();

-- ---------------------------------------------------------------------------
-- submissions — anon insert; admin read/write
-- ---------------------------------------------------------------------------
drop policy if exists submissions_insert_anon on submissions;
create policy submissions_insert_anon on submissions
  for insert to anon, authenticated with check (true);

drop policy if exists submissions_admin_read on submissions;
create policy submissions_admin_read on submissions
  for select using (is_admin());

drop policy if exists submissions_admin_write on submissions;
create policy submissions_admin_write on submissions
  for update using (is_admin()) with check (is_admin());

-- ---------------------------------------------------------------------------
-- newsletter — anon insert; admin read/write
-- ---------------------------------------------------------------------------
drop policy if exists newsletter_insert_anon on newsletter;
create policy newsletter_insert_anon on newsletter
  for insert to anon, authenticated with check (true);

drop policy if exists newsletter_admin_read on newsletter;
create policy newsletter_admin_read on newsletter
  for select using (is_admin());

drop policy if exists newsletter_admin_write on newsletter;
create policy newsletter_admin_write on newsletter
  for all using (is_admin()) with check (is_admin());

-- ---------------------------------------------------------------------------
-- orders + order_items — owner / admin read only; no client writes.
-- ---------------------------------------------------------------------------
drop policy if exists orders_select_own on orders;
create policy orders_select_own on orders
  for select using (
    lower(email) = lower(coalesce(auth.jwt() ->> 'email','')) or is_admin()
  );

drop policy if exists order_items_select_own on order_items;
create policy order_items_select_own on order_items
  for select using (
    exists (
      select 1 from orders o
      where o.id = order_items.order_id
        and (lower(o.email) = lower(coalesce(auth.jwt() ->> 'email','')) or is_admin())
    )
  );

-- ---------------------------------------------------------------------------
-- wishlist — own rows
-- ---------------------------------------------------------------------------
drop policy if exists wishlist_select_own on wishlist;
create policy wishlist_select_own on wishlist
  for select using (lower(email) = lower(coalesce(auth.jwt() ->> 'email','')));

drop policy if exists wishlist_insert_own on wishlist;
create policy wishlist_insert_own on wishlist
  for insert to authenticated with check (lower(email) = lower(coalesce(auth.jwt() ->> 'email','')));

drop policy if exists wishlist_delete_own on wishlist;
create policy wishlist_delete_own on wishlist
  for delete using (lower(email) = lower(coalesce(auth.jwt() ->> 'email','')));

-- Log activity on wishlist insert.
create or replace function wishlist_log()
returns trigger language plpgsql security definer as $$
begin
  perform log_activity(new.email, 'wishlist', jsonb_build_object('product_id', new.product_id));
  return new;
end; $$;

drop trigger if exists wishlist_log on wishlist;
create trigger wishlist_log after insert on wishlist
for each row execute function wishlist_log();

-- ---------------------------------------------------------------------------
-- coupons — NO client policies; admin full access
-- ---------------------------------------------------------------------------
drop policy if exists coupons_admin_all on coupons;
create policy coupons_admin_all on coupons
  for all using (is_admin()) with check (is_admin());

-- ---------------------------------------------------------------------------
-- blog_posts
-- ---------------------------------------------------------------------------
drop policy if exists blog_select_published on blog_posts;
create policy blog_select_published on blog_posts
  for select using (status = 'published' or is_admin());

drop policy if exists blog_admin_write on blog_posts;
create policy blog_admin_write on blog_posts
  for all using (is_admin()) with check (is_admin());

-- ---------------------------------------------------------------------------
-- wallets + wallet_transactions
-- ---------------------------------------------------------------------------
drop policy if exists wallets_select_own on wallets;
create policy wallets_select_own on wallets
  for select using (
    lower(email) = lower(coalesce(auth.jwt() ->> 'email','')) or is_admin()
  );

drop policy if exists wallet_tx_select_own on wallet_transactions;
create policy wallet_tx_select_own on wallet_transactions
  for select using (
    lower(email) = lower(coalesce(auth.jwt() ->> 'email','')) or is_admin()
  );

-- ---------------------------------------------------------------------------
-- payout_requests
-- ---------------------------------------------------------------------------
drop policy if exists payout_select_own on payout_requests;
create policy payout_select_own on payout_requests
  for select using (
    lower(email) = lower(coalesce(auth.jwt() ->> 'email','')) or is_admin()
  );

drop policy if exists payout_insert_own on payout_requests;
create policy payout_insert_own on payout_requests
  for insert to authenticated with check (lower(email) = lower(coalesce(auth.jwt() ->> 'email','')));

drop policy if exists payout_admin_update on payout_requests;
create policy payout_admin_update on payout_requests
  for update using (is_admin()) with check (is_admin());

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------
drop policy if exists profiles_select on profiles;
create policy profiles_select on profiles
  for select using (
    lower(email) = lower(coalesce(auth.jwt() ->> 'email','')) or is_admin()
  );

-- ---------------------------------------------------------------------------
-- activity_log
-- ---------------------------------------------------------------------------
drop policy if exists activity_select on activity_log;
create policy activity_select on activity_log
  for select using (
    lower(email) = lower(coalesce(auth.jwt() ->> 'email','')) or is_admin()
  );

-- ---------------------------------------------------------------------------
-- handle_new_user() — create profile + wallet + log signup
-- ---------------------------------------------------------------------------
create or replace function handle_new_user()
returns trigger language plpgsql security definer as $$
declare
  v_email text := lower(coalesce(new.email,''));
  v_name  text := coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', v_email);
  v_avatar text := coalesce(new.raw_user_meta_data ->> 'avatar_url', '');
begin
  insert into profiles (id, email, name, avatar_url)
  values (new.id, v_email, v_name, v_avatar)
  on conflict (id) do update set
    email = excluded.email,
    name = excluded.name,
    avatar_url = excluded.avatar_url;

  insert into wallets (email, balance)
  values (v_email, 0)
  on conflict (email) do nothing;

  perform log_activity(v_email, 'signup', jsonb_build_object('source','google'));
  return new;
end; $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- ---------------------------------------------------------------------------
-- RPC: log_activity
-- ---------------------------------------------------------------------------
create or replace function log_activity(p_email text, p_event text, p_meta jsonb default '{}'::jsonb)
returns void language plpgsql security definer as $$
begin
  if p_email is null or p_email = '' then return; end if;
  insert into activity_log (email, event, meta)
  values (lower(p_email), p_event, coalesce(p_meta, '{}'::jsonb));
end; $$;

-- ---------------------------------------------------------------------------
-- RPC: increment counters
-- ---------------------------------------------------------------------------
create or replace function increment_sales_count(p_id uuid)
returns void language sql security definer as $$
  update products set sales_count = coalesce(sales_count,0) + 1 where id = p_id;
$$;

create or replace function increment_download_count(p_id uuid)
returns void language sql security definer as $$
  update products set download_count = coalesce(download_count,0) + 1 where id = p_id;
$$;

create or replace function increment_reviews_count(p_id uuid)
returns void language sql security definer as $$
  update products set reviews_count = coalesce(reviews_count,0) + 1 where id = p_id;
$$;

create or replace function increment_blog_views(p_id uuid)
returns void language sql security definer as $$
  update blog_posts set views_count = coalesce(views_count,0) + 1 where id = p_id;
$$;

-- ---------------------------------------------------------------------------
-- RPC: get_site_stats
-- ---------------------------------------------------------------------------
create or replace function get_site_stats()
returns jsonb language sql security definer stable as $$
  select jsonb_build_object(
    'products',  (select count(*) from products where is_published = true),
    'downloads', (select coalesce(sum(download_count),0) from products),
    'reviews',   (select count(*) from reviews where status = 'approved'),
    'designers', (select count(distinct designer_email) from products where designer_email is not null)
  );
$$;

-- ---------------------------------------------------------------------------
-- RPC: get_fx_rate (server-side fallback; real fetch happens in the Edge Fn)
-- ---------------------------------------------------------------------------
create or replace function get_fx_rate()
returns numeric language sql security definer stable as $$
  select coalesce(
    (select nullif(svalue,'')::numeric from settings where skey = 'fx_fallback_rate'),
    15.50
  );
$$;

-- ---------------------------------------------------------------------------
-- RPC: credit_wallet
-- ---------------------------------------------------------------------------
create or replace function credit_wallet(p_email text, p_amount numeric, p_type text, p_note text)
returns numeric language plpgsql security definer as $$
declare
  v_balance numeric;
begin
  if p_email is null or p_email = '' then raise exception 'email required'; end if;
  if p_type not in ('earning','payout','adjustment') then raise exception 'invalid type'; end if;
  if p_amount is null or p_amount = 0 then raise exception 'invalid amount'; end if;

  insert into wallets (email, balance)
  values (lower(p_email), 0)
  on conflict (email) do nothing;

  select balance into v_balance from wallets where email = lower(p_email) for update;
  v_balance := coalesce(v_balance, 0) + p_amount;

  if v_balance < 0 then
    raise exception 'insufficient balance';
  end if;

  update wallets set balance = v_balance, updated_at = now() where email = lower(p_email);

  insert into wallet_transactions (email, type, amount, balance_after, note)
  values (lower(p_email), p_type, p_amount, v_balance, p_note);

  return v_balance;
end; $$;

-- ---------------------------------------------------------------------------
-- RPC: request_payout
-- ---------------------------------------------------------------------------
create or replace function request_payout(p_amount numeric)
returns jsonb language plpgsql security definer as $$
declare
  v_email text := lower(coalesce(auth.jwt() ->> 'email',''));
  v_balance numeric;
  v_min numeric := 20;
begin
  if v_email = '' then return jsonb_build_object('ok', false, 'reason', 'auth_required'); end if;
  if p_amount is null or p_amount < v_min then
    return jsonb_build_object('ok', false, 'reason', 'min_20');
  end if;

  insert into wallets (email, balance)
  values (v_email, 0)
  on conflict (email) do nothing;

  select balance into v_balance from wallets where email = v_email for update;
  if coalesce(v_balance,0) < p_amount then
    return jsonb_build_object('ok', false, 'reason', 'insufficient_balance');
  end if;

  perform credit_wallet(v_email, -p_amount, 'payout', 'Payout request escrow');

  insert into payout_requests (email, amount, status)
  values (v_email, p_amount, 'pending');

  perform log_activity(v_email, 'payout_request', jsonb_build_object('amount', p_amount));
  return jsonb_build_object('ok', true);
end; $$;

-- ---------------------------------------------------------------------------
-- RPC: admin_list_users
-- ---------------------------------------------------------------------------
create or replace function admin_list_users(p_search text default null, p_limit int default 20, p_offset int default 0)
returns table (
  id uuid, email text, name text, avatar_url text,
  orders_count int, total_spent numeric, downloads int, wallet_balance numeric
) language sql security definer stable as $$
  select
    p.id, p.email, p.name, p.avatar_url,
    coalesce((select count(*)::int from orders o where lower(o.email) = lower(p.email) and o.status = 'success'), 0),
    coalesce((select sum(o.usd_amount) from orders o where lower(o.email) = lower(p.email) and o.status = 'success'), 0),
    coalesce((select sum(pr.download_count) from products pr where lower(pr.designer_email) = lower(p.email)), 0),
    coalesce((select w.balance from wallets w where lower(w.email) = lower(p.email)), 0)
  from profiles p
  where is_admin()
    and (p_search is null or p_search = '' or p.email ilike '%' || p_search || '%' or coalesce(p.name,'') ilike '%' || p_search || '%')
  order by p.created_at desc
  limit greatest(p_limit,1) offset greatest(p_offset,0);
$$;

-- ---------------------------------------------------------------------------
-- RPC: admin_handle_payout
-- ---------------------------------------------------------------------------
create or replace function admin_handle_payout(p_id uuid, p_action text, p_note text default null)
returns jsonb language plpgsql security definer as $$
declare
  v_row payout_requests;
begin
  if not is_admin() then return jsonb_build_object('ok', false, 'reason', 'forbidden'); end if;
  if p_action not in ('paid','rejected') then return jsonb_build_object('ok', false, 'reason', 'bad_action'); end if;

  select * into v_row from payout_requests where id = p_id for update;
  if v_row is null then return jsonb_build_object('ok', false, 'reason', 'not_found'); end if;
  if v_row.status <> 'pending' then return jsonb_build_object('ok', false, 'reason', 'already_handled'); end if;

  if p_action = 'paid' then
    update payout_requests set status = 'paid', handled_at = now(), note = p_note where id = p_id;
    perform log_activity(v_row.email, 'payout_paid', jsonb_build_object('amount', v_row.amount));
  else
    update payout_requests set status = 'rejected', handled_at = now(), note = p_note where id = p_id;
    -- Refund the held amount.
    perform credit_wallet(v_row.email, v_row.amount, 'adjustment', 'Payout rejected: ' || coalesce(p_note,''));
  end if;

  return jsonb_build_object('ok', true);
end; $$;

-- ---------------------------------------------------------------------------
-- RPC: admin_stats
-- ---------------------------------------------------------------------------
create or replace function admin_stats()
returns jsonb language sql security definer stable as $$
  select jsonb_build_object(
    'revenue_today', coalesce((select sum(usd_amount) from orders where status = 'success' and created_at::date = current_date), 0),
    'revenue_7d',    coalesce((select sum(usd_amount) from orders where status = 'success' and created_at >= now() - interval '7 days'), 0),
    'revenue_30d',   coalesce((select sum(usd_amount) from orders where status = 'success' and created_at >= now() - interval '30 days'), 0),
    'revenue_all',   coalesce((select sum(usd_amount) from orders where status = 'success'), 0),
    'orders_count',  (select count(*) from orders),
    'downloads_count', (select coalesce(sum(download_count),0) from products),
    'pending_reviews', (select count(*) from reviews where status = 'pending'),
    'pending_submissions', (select count(*) from submissions where status = 'pending'),
    'pending_payouts', (select count(*) from payout_requests where status = 'pending')
  ) where is_admin();
$$;