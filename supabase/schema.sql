-- ============================================================================
-- MITTELY — schema.sql
-- Run this FIRST in Supabase SQL Editor (before rls.sql and storage.sql).
-- ============================================================================

create extension if not exists "uuid-ossp";

-- ---------------------------------------------------------------------------
-- Admin users
-- ---------------------------------------------------------------------------
create table if not exists admin_users (
  id uuid primary key default uuid_generate_v4(),
  email text unique not null,
  created_at timestamptz default now()
);

insert into admin_users (email)
values ('henryagyemang906@gmail.com')
on conflict (email) do nothing;

-- is_admin(): true if the caller's JWT email is in admin_users.
create or replace function is_admin()
returns boolean
language sql
security definer
stable
as $$
  select exists (
    select 1 from admin_users
    where lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;

create or replace function is_admin_rpc()
returns boolean
language sql
security definer
stable
as $$ select is_admin(); $$;

-- ---------------------------------------------------------------------------
-- Licenses
-- ---------------------------------------------------------------------------
create table if not exists licenses (
  id uuid primary key default uuid_generate_v4(),
  name text not null unique,
  price_multiplier numeric not null default 1.0,
  terms text
);

insert into licenses (name, price_multiplier, terms) values
  ('Standard', 1.0, 'Use in one end product, personal or commercial. Not for resale or redistribution.'),
  ('Extended', 3.0, 'Use in one end product sold to one client, or unlimited personal projects. Not for resale as-is.')
on conflict (name) do nothing;

-- ---------------------------------------------------------------------------
-- Products
-- ---------------------------------------------------------------------------
create table if not exists products (
  id uuid primary key default uuid_generate_v4(),
  title text not null,
  slug text unique not null,
  category text not null check (category in ('ui-kits','dashboards','landing-pages','ecommerce','portfolios','mobile-apps')),
  tech text,
  style_tags text,
  price numeric not null default 0,
  sale_price numeric,
  rating numeric default 0,
  reviews_count int default 0,
  short_desc text,
  long_desc text,
  badge text check (badge in ('BESTSELLER','NEW')),
  image_url text,
  gallery jsonb default '[]'::jsonb,
  demo_url text,
  preview_embed_url text,
  whats_included jsonb default '[]'::jsonb,
  version text default '1.0',
  changelog text,
  is_free boolean default false,
  is_hot_sale boolean default false,
  is_black_friday boolean default false,
  is_featured boolean default false,
  is_published boolean default true,
  download_path text,
  designer_email text,
  download_count int default 0,
  sales_count int default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists products_category_idx on products(category);
create index if not exists products_published_idx on products(is_published);
create index if not exists products_featured_idx on products(is_featured);

-- Seed 12 products (no reviews).
insert into products (title, slug, category, tech, style_tags, price, sale_price, rating, reviews_count, short_desc, long_desc, badge, image_url, gallery, demo_url, whats_included, version, changelog, is_free, is_hot_sale, is_black_friday, is_featured, is_published, designer_email)
values
  ('Aster UI Kit', 'aster-ui-kit', 'ui-kits', 'HTML,CSS,Figma', 'minimal,editorial', 39, null, 0, 0,
   'A minimal, editorial-grade UI kit with 120+ components.',
   '<p>Aster is a lightweight UI kit built for modern product teams. It ships with 120+ components, dark and light themes, and Figma source files.</p>',
   'BESTSELLER',
   'https://images.unsplash.com/photo-1618788372246-79faff0c3742?w=900&q=80',
   '[]'::jsonb, 'https://example.com/aster', '["HTML + CSS files","Figma source","Design tokens","Docs"]'::jsonb, '1.2', 'v1.2 — added dark mode tokens.', false, true, false, true, true, 'henryagyemang906@gmail.com'),

  ('Northstar Analytics', 'northstar-analytics', 'dashboards', 'HTML,CSS,JavaScript', 'dark,bold', 59, null, 0, 0,
   'A production-ready analytics dashboard with 12 chart types.',
   '<p>Northstar is a modular analytics dashboard template with 12 chart types, dark mode, and RTL support.</p>',
   'NEW',
   'https://images.unsplash.com/photo-1551288049-bebda4e38f71?w=900&q=80',
   '[]'::jsonb, 'https://example.com/northstar', '["HTML + CSS + JS","Chart components","Docs"]'::jsonb, '1.0', 'Initial release.', false, false, false, true, true, 'henryagyemang906@gmail.com'),

  ('Lumen Landing Pages', 'lumen-landing-pages', 'landing-pages', 'HTML,CSS', 'minimal,pastel', 79, 59, 0, 0,
   'Five conversion-optimized landing pages ready to ship.',
   '<p>Lumen is a pack of five landing pages designed for SaaS, mobile apps, and portfolios.</p>',
   null,
   'https://images.unsplash.com/photo-1467232004584-a241de8bcf5d?w=900&q=80',
   '[]'::jsonb, 'https://example.com/lumen', '["5 HTML pages","CSS","Figma","Docs"]'::jsonb, '2.0', 'v2.0 — new hero variations.', false, true, false, true, true, 'henryagyemang906@gmail.com'),

  ('Pulse Finance', 'pulse-finance', 'dashboards', 'HTML,CSS,JavaScript', 'glassmorphism', 69, null, 0, 0,
   'A finance dashboard with realtime charts and wallet UI.',
   '<p>Pulse is a finance dashboard with realtime charts, wallet cards, and KYC flow screens.</p>',
   null,
   'https://images.unsplash.com/photo-1642790106117-e829e14a795f?w=900&q=80',
   '[]'::jsonb, 'https://example.com/pulse', '["Dashboard pages","Wallet UI","Figma"]'::jsonb, '1.1', 'v1.1 — added wallet UI.', false, false, false, false, true, 'henryagyemang906@gmail.com'),

  ('Canvas Portfolio', 'canvas-portfolio', 'portfolios', 'HTML,CSS', 'editorial,minimal', 49, null, 0, 0,
   'A bold portfolio template for designers and studios.',
   '<p>Canvas is a portfolio template with editorial layouts, case-study pages, and a CMS-friendly structure.</p>',
   null,
   'https://images.unsplash.com/photo-1522542550221-31fd19575a2d?w=900&q=80',
   '[]'::jsonb, 'https://example.com/canvas', '["5 pages","Figma","Docs"]'::jsonb, '1.0', 'Initial release.', false, false, false, false, true, 'henryagyemang906@gmail.com'),

  ('Morrow Shop', 'morrow-shop', 'ecommerce', 'HTML,CSS,JavaScript', 'bold', 89, null, 0, 0,
   'A conversion-first ecommerce template with cart and checkout.',
   '<p>Morrow is an ecommerce template with product grids, cart, checkout, and order pages.</p>',
   'BESTSELLER',
   'https://images.unsplash.com/photo-1607083206968-13611e3d76db?w=900&q=80',
   '[]'::jsonb, 'https://example.com/morrow', '["12 pages","Cart flow","Figma"]'::jsonb, '2.1', 'v2.1 — added sale badges.', false, true, false, true, true, 'henryagyemang906@gmail.com'),

  ('Sonder Launch', 'sonder-launch', 'landing-pages', 'HTML,CSS', 'minimal', 79, null, 0, 0,
   'A single, highly polished product launch page.',
   '<p>Sonder is a one-page launch site with animated hero, feature grid, and pricing.</p>',
   'NEW',
   'https://images.unsplash.com/photo-1499750310107-5fef28a66643?w=900&q=80',
   '[]'::jsonb, 'https://example.com/sonder', '["1 HTML page","CSS","Figma"]'::jsonb, '1.0', 'Initial release.', false, false, false, false, true, 'henryagyemang906@gmail.com'),

  ('Signal Admin', 'signal-admin', 'dashboards', 'HTML,CSS,JavaScript', 'dark,minimal', 59, null, 0, 0,
   'A clean admin panel with sidebar navigation and tables.',
   '<p>Signal is an admin panel template with sidebar navigation, data tables, and forms.</p>',
   null,
   'https://images.unsplash.com/photo-1551650975-87deedd944c3?w=900&q=80',
   '[]'::jsonb, 'https://example.com/signal', '["15 pages","Data tables","Figma"]'::jsonb, '1.4', 'v1.4 — improved tables.', false, false, false, false, true, 'henryagyemang906@gmail.com'),

  ('Atlas Component Library', 'atlas-component-library', 'ui-kits', 'HTML,CSS,JavaScript', 'minimal', 39, null, 0, 0,
   'A 200+ component library for design systems.',
   '<p>Atlas is a design system starter with 200+ components, tokens, and Figma variables.</p>',
   null,
   'https://images.unsplash.com/photo-1545235617-9465d2a55698?w=900&q=80',
   '[]'::jsonb, 'https://example.com/atlas', '["200+ components","Design tokens","Figma"]'::jsonb, '1.0', 'Initial release.', false, false, false, false, true, 'henryagyemang906@gmail.com'),

  ('Orbit Mobile', 'orbit-mobile', 'mobile-apps', 'HTML,CSS,JavaScript', 'bold,dark', 69, null, 0, 0,
   'A mobile app UI kit with 40+ screens.',
   '<p>Orbit is a mobile app UI kit with 40+ screens, onboarding flows, and dark mode.</p>',
   null,
   'https://images.unsplash.com/photo-1512941937669-90a1b58e7e9c?w=900&q=80',
   '[]'::jsonb, 'https://example.com/orbit', '["40+ screens","Figma","Icons"]'::jsonb, '1.0', 'Initial release.', false, false, false, false, true, 'henryagyemang906@gmail.com'),

  ('Studio Folio', 'studio-folio', 'portfolios', 'HTML,CSS', 'minimal,editorial', 49, null, 0, 0,
   'A portfolio for studios with case-study layouts.',
   '<p>Studio Folio is a studio portfolio with project indexes, case studies, and an about page.</p>',
   null,
   'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=900&q=80',
   '[]'::jsonb, 'https://example.com/studiofolio', '["6 pages","Figma","Docs"]'::jsonb, '1.0', 'Initial release.', false, false, false, false, true, 'henryagyemang906@gmail.com'),

  ('Forma Commerce', 'forma-commerce', 'ecommerce', 'HTML,CSS,JavaScript', 'minimal,pastel', 89, null, 0, 0,
   'A premium ecommerce storefront with modern checkout.',
   '<p>Forma is a premium ecommerce template with a modern cart, checkout, and order tracking.</p>',
   'NEW',
   'https://images.unsplash.com/photo-1556742049-0cfed4f6a45d?w=900&q=80',
   '[]'::jsonb, 'https://example.com/forma', '["18 pages","Cart + checkout","Figma"]'::jsonb, '1.0', 'Initial release.', false, false, false, false, true, 'henryagyemang906@gmail.com')
on conflict (slug) do nothing;

-- ---------------------------------------------------------------------------
-- Orders + items
-- ---------------------------------------------------------------------------
create table if not exists orders (
  id uuid primary key default uuid_generate_v4(),
  paystack_reference text unique not null,
  email text not null,
  name text,
  amount numeric not null,
  currency text default 'USD' check (currency in ('USD','GHS')),
  usd_amount numeric not null,
  fx_rate_used numeric default 1,
  coupon_code text,
  discount_usd numeric default 0,
  status text default 'pending' check (status in ('pending','success','failed')),
  created_at timestamptz default now()
);

create index if not exists orders_email_idx on orders(email);
create index if not exists orders_status_idx on orders(status);

create table if not exists order_items (
  id uuid primary key default uuid_generate_v4(),
  order_id uuid references orders on delete cascade,
  product_id uuid references products,
  price_paid numeric not null,
  license text default 'standard'
);

-- ---------------------------------------------------------------------------
-- Reviews
-- ---------------------------------------------------------------------------
create table if not exists reviews (
  id uuid primary key default uuid_generate_v4(),
  product_id uuid references products on delete cascade,
  name text not null,
  email text not null,
  rating int check (rating between 1 and 5),
  comment text,
  status text default 'pending' check (status in ('pending','approved','rejected')),
  created_at timestamptz default now()
);

-- ---------------------------------------------------------------------------
-- Settings
-- ---------------------------------------------------------------------------
create table if not exists settings (
  skey text primary key,
  svalue text
);

insert into settings (skey, svalue) values
  ('hot_sale_mode','off'),
  ('hot_sale_ends_at',''),
  ('black_friday_mode','off'),
  ('announcement_bar',''),
  ('hero_headline',''),
  ('fx_fallback_rate','15.50'),
  ('github_url',''),
  ('x_url',''),
  ('telegram_url',''),
  ('instagram_url',''),
  ('linkedin_url',''),
  ('youtube_url',''),
  ('discord_url','')
on conflict (skey) do nothing;

-- ---------------------------------------------------------------------------
-- Submissions
-- ---------------------------------------------------------------------------
create table if not exists submissions (
  id uuid primary key default uuid_generate_v4(),
  designer_name text,
  designer_email text,
  product_title text,
  category text,
  description text,
  demo_url text,
  portfolio_url text,
  status text default 'pending' check (status in ('pending','accepted','rejected')),
  created_at timestamptz default now()
);

-- ---------------------------------------------------------------------------
-- Newsletter
-- ---------------------------------------------------------------------------
create table if not exists newsletter (
  id uuid primary key default uuid_generate_v4(),
  email text unique not null,
  created_at timestamptz default now()
);

-- ---------------------------------------------------------------------------
-- Wishlist
-- ---------------------------------------------------------------------------
create table if not exists wishlist (
  id uuid primary key default uuid_generate_v4(),
  email text not null,
  product_id uuid references products on delete cascade,
  created_at timestamptz default now(),
  unique(email, product_id)
);

-- ---------------------------------------------------------------------------
-- Coupons
-- ---------------------------------------------------------------------------
create table if not exists coupons (
  id uuid primary key default uuid_generate_v4(),
  code text unique not null,
  type text not null check (type in ('percent','fixed')),
  value numeric not null check (value > 0),
  min_subtotal numeric default 0,
  max_uses int,
  used_count int default 0,
  expires_at timestamptz,
  is_active boolean default true,
  created_at timestamptz default now()
);

-- ---------------------------------------------------------------------------
-- Blog posts
-- ---------------------------------------------------------------------------
create table if not exists blog_posts (
  id uuid primary key default uuid_generate_v4(),
  title text not null,
  slug text unique not null,
  excerpt text,
  content text,
  cover_image text,
  tags text,
  author_name text,
  author_email text,
  status text default 'draft' check (status in ('draft','published')),
  views_count int default 0,
  meta_title text,
  meta_description text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists blog_status_idx on blog_posts(status);

-- ---------------------------------------------------------------------------
-- Wallet & payouts
-- ---------------------------------------------------------------------------
create table if not exists wallets (
  email text primary key,
  balance numeric default 0,
  updated_at timestamptz default now()
);

create table if not exists wallet_transactions (
  id uuid primary key default uuid_generate_v4(),
  email text not null,
  type text not null check (type in ('earning','payout','adjustment')),
  amount numeric not null,
  balance_after numeric not null,
  note text,
  created_at timestamptz default now()
);

create index if not exists wallet_tx_email_idx on wallet_transactions(email);

create table if not exists payout_requests (
  id uuid primary key default uuid_generate_v4(),
  email text not null,
  amount numeric not null,
  status text default 'pending' check (status in ('pending','paid','rejected')),
  note text,
  created_at timestamptz default now(),
  handled_at timestamptz
);

-- ---------------------------------------------------------------------------
-- Profiles & activity
-- ---------------------------------------------------------------------------
create table if not exists profiles (
  id uuid primary key references auth.users on delete cascade,
  email text unique not null,
  name text,
  avatar_url text,
  created_at timestamptz default now()
);

create table if not exists activity_log (
  id uuid primary key default uuid_generate_v4(),
  email text not null,
  event text not null check (event in ('signup','sign_in','order','download','review','wishlist','payout_request','payout_paid')),
  meta jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);

create index if not exists activity_email_idx on activity_log(email);
create index if not exists activity_event_idx on activity_log(event);

-- ---------------------------------------------------------------------------
-- updated_at triggers
-- ---------------------------------------------------------------------------
create or replace function touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end; $$;

drop trigger if exists products_touch on products;
create trigger products_touch before update on products
for each row execute function touch_updated_at();

drop trigger if exists blog_posts_touch on blog_posts;
create trigger blog_posts_touch before update on blog_posts
for each row execute function touch_updated_at();