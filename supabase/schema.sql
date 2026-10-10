-- ============================================
-- MITTELY — Supabase Schema
-- Run in this order: schema.sql → rls.sql → storage.sql
-- ============================================

create extension if not exists "uuid-ossp";

-- ---------- Admin users ----------
create table admin_users (
  id uuid primary key default uuid_generate_v4(),
  email text unique not null
);

insert into admin_users (email) values ('henryagyemang906@gmail.com');

create or replace function is_admin() returns boolean
language sql security definer stable as $$
  select exists (select 1 from admin_users where email = auth.jwt() ->> 'email');
$$;

-- ---------- Licenses ----------
create table licenses (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  price_multiplier numeric not null,
  terms text
);

insert into licenses (name, price_multiplier, terms) values
  ('Standard', 1.0, 'Use in one end product, personal or commercial. Not for resale or redistribution.'),
  ('Extended', 3.0, 'Use in one end product sold to one client, or unlimited personal projects. Not for resale as-is.');

-- ---------- Products ----------
create table products (
  id uuid primary key default uuid_generate_v4(),
  title text not null,
  slug text unique not null,
  category text not null check (category in ('ui-kits','dashboards','landing-pages','ecommerce','portfolios','mobile-apps')),
  tech text,
  style_tags text,
  price numeric not null,
  sale_price numeric,
  rating numeric default 0,
  reviews_count int default 0,
  short_desc text,
  long_desc text,
  badge text check (badge in ('BESTSELLER','NEW')),
  image_url text,
  gallery jsonb default '[]',
  demo_url text,
  preview_embed_url text,
  whats_included jsonb default '[]',
  version text default '1.0',
  changelog text,
  is_free boolean default false,
  is_hot_sale boolean default false,
  is_black_friday boolean default false,
  is_featured boolean default false,
  is_published boolean default true,
  download_path text,
  download_count int default 0,
  sales_count int default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Seed 12 products (no reviews, those are real user submissions only)
insert into products (title, slug, category, tech, style_tags, price, short_desc, long_desc, badge, image_url, gallery, demo_url, preview_embed_url, whats_included, version, changelog, is_free, is_hot_sale, is_black_friday, is_featured, is_published, rating, reviews_count, sales_count, download_count) values
('Aster UI Kit', 'aster-ui-kit', 'ui-kits', 'Figma, HTML/CSS', 'minimal, modern', 39, 'A clean, minimal UI kit with 40+ components and 12 ready screens.', 'Aster UI Kit is a complete design system for modern products. Includes buttons, forms, cards, modals, navigation, and 12 full-page layouts ready to customise.', 'BESTSELLER', 'https://images.unsplash.com/photo-1618788372246-79faff0c3742?w=800&h=600&fit=crop', '["https://images.unsplash.com/photo-1618788372246-79faff0c3742?w=800&h=600&fit=crop","https://images.unsplash.com/photo-1551288049-bebda4e38f71?w=800&h=600&fit=crop"]', 'https://example.com/aster-demo', 'https://example.com/aster-embed', '["Figma source file","HTML/CSS starter","12 ready screens","40+ components","Documentation"]', '1.2', 'v1.2 — Added dark mode variants and 3 new screens.', false, true, false, true, true, 4.8, 0, 24, 18),
('Northstar Analytics', 'northstar-analytics', 'dashboards', 'React, TypeScript', 'data, clean', 59, 'A powerful analytics dashboard with charts, tables, and reporting widgets.', 'Northstar Analytics is a full-featured analytics dashboard template. Includes KPI cards, multi-chart views, data tables, and a reporting module.', 'NEW', 'https://images.unsplash.com/photo-1551288049-bebda4e38f71?w=800&h=600&fit=crop', '["https://images.unsplash.com/photo-1551288049-bebda4e38f71?w=800&h=600&fit=crop","https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=800&h=600&fit=crop"]', 'https://example.com/northstar-demo', 'https://example.com/northstar-embed', '["Figma source","React starter","Charts & widgets","Data tables","Report builder"]', '1.0', 'v1.0 — Initial release.', false, false, false, true, true, 4.9, 0, 12, 9),
('Lumen Landing Pages', 'lumen-landing-pages', 'landing-pages', 'HTML, CSS, JS', 'landing, marketing', 79, 'Eight conversion-optimised landing pages with A/B ready variants.', 'Lumen Landing Pages gives you eight complete landing pages engineered for conversion. Includes hero variants, feature sections, pricing, testimonials, and CTA bands.', 'BESTSELLER', 'https://images.unsplash.com/photo-1467232004584-a241de8bcf5d?w=800&h=600&fit=crop', '["https://images.unsplash.com/photo-1467232004584-a241de8bcf5d?w=800&h=600&fit=crop","https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=800&h=600&fit=crop"]', 'https://example.com/lumen-demo', 'https://example.com/lumen-embed', '["8 landing pages","Figma source","Responsive HTML/CSS","SEO ready","A/B variants"]', '2.1', 'v2.1 — New pricing section and dark theme.', false, true, false, true, true, 4.7, 0, 31, 22),
('Pulse Finance', 'pulse-finance', 'dashboards', 'Figma, HTML', 'finance, dashboard', 69, 'A finance dashboard with portfolio, transactions, and insights views.', 'Pulse Finance is a polished finance dashboard kit. Includes portfolio overview, transaction history, spending insights, and account management screens.', null, 'https://images.unsplash.com/photo-1551288049-bebda4e38f71?w=800&h=600&fit=crop', '["https://images.unsplash.com/photo-1551288049-bebda4e38f71?w=800&h=600&fit=crop"]', 'https://example.com/pulse-demo', 'https://example.com/pulse-embed', '["Figma source","HTML/CSS build","6 dashboard screens","Dark + light themes"]', '1.1', 'v1.1 — Added light theme.', false, false, false, false, true, 4.6, 0, 15, 11),
('Canvas Portfolio', 'canvas-portfolio', 'portfolios', 'Figma, HTML, CSS', 'portfolio, minimal', 49, 'A bold portfolio template for designers and creative studios.', 'Canvas Portfolio is a striking portfolio template with case study layouts, about pages, and contact forms. Perfect for freelancers and studios.', null, 'https://images.unsplash.com/photo-1517245386807-bb43f82c33c4?w=800&h=600&fit=crop', '["https://images.unsplash.com/photo-1517245386807-bb43f82c33c4?w=800&h=600&fit=crop"]', 'https://example.com/canvas-demo', 'https://example.com/canvas-embed', '["Figma source","HTML/CSS","Case study layout","About page","Contact form"]', '1.0', 'v1.0 — Initial release.', false, false, false, false, true, 4.5, 0, 18, 14),
('Morrow Shop', 'morrow-shop', 'ecommerce', 'Figma, HTML, JS', 'ecommerce, shop', 89, 'A complete ecommerce template with cart, checkout, and product pages.', 'Morrow Shop is a full ecommerce template covering the entire buying journey: product listing, product detail, cart, and checkout. Includes admin-ready order flows.', 'BESTSELLER', 'https://images.unsplash.com/photo-1441986300917-64674bd600d8?w=800&h=600&fit=crop', '["https://images.unsplash.com/photo-1441986300917-64674bd600d8?w=800&h=600&fit=crop","https://images.unsplash.com/photo-1483985988355-763728e1935b?w=800&h=600&fit=crop"]', 'https://example.com/morrow-demo', 'https://example.com/morrow-embed', '["Figma source","HTML/CSS/JS","Cart & checkout","Product detail","Order flows"]', '1.3', 'v1.3 — Improved checkout UX.', false, false, false, false, true, 4.8, 0, 42, 30),
('Sonder Launch', 'sonder-launch', 'landing-pages', 'HTML, CSS', 'launch, product', 79, 'A high-impact launch page for SaaS and hardware products.', 'Sonder Launch is a single-page launch template built to maximise signups. Includes waitlist forms, countdown, feature grid, and social proof.', null, 'https://images.unsplash.com/photo-1522542550221-31fd19575a2d?w=800&h=600&fit=crop', '["https://images.unsplash.com/photo-1522542550221-31fd19575a2d?w=800&h=600&fit=crop"]', 'https://example.com/sonder-demo', 'https://example.com/sonder-embed', '["Figma source","HTML/CSS","Waitlist form","Countdown","Feature grid"]', '1.0', 'v1.0 — Initial release.', false, false, false, false, true, 4.6, 0, 16, 12),
('Signal Admin', 'signal-admin', 'dashboards', 'Figma, HTML', 'admin, dashboard', 59, 'An admin dashboard with users, activity, and multi-chart analytics.', 'Signal Admin is a versatile admin dashboard template. Includes user management, activity feeds, settings, and a multi-chart analytics section.', null, 'https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=800&h=600&fit=crop', '["https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=800&h=600&fit=crop"]', 'https://example.com/signal-demo', 'https://example.com/signal-embed', '["Figma source","HTML/CSS","Users module","Activity feed","Multi-chart analytics"]', '1.2', 'v1.2 — Added analytics switcher.', false, false, false, false, true, 4.7, 0, 19, 15),
('Atlas Component Library', 'atlas-component-library', 'ui-kits', 'Figma', 'components, design system', 39, 'A comprehensive component library with 120+ UI elements.', 'Atlas Component Library is a designer-first component library. 120+ elements with variants, auto-layout, and documented usage.', null, 'https://images.unsplash.com/photo-1517430816045-df4b7de11d1d?w=800&h=600&fit=crop', '["https://images.unsplash.com/photo-1517430816045-df4b7de11d1d?w=800&h=600&fit=crop"]', 'https://example.com/atlas-demo', 'https://example.com/atlas-embed', '["Figma source","120+ components","Variants & auto-layout","Documentation"]', '1.1', 'v1.1 — Added form components.', false, false, false, false, true, 4.9, 0, 27, 20),
('Orbit Mobile', 'orbit-mobile', 'mobile-apps', 'Figma, SwiftUI', 'mobile, ios', 69, 'A mobile app template for iOS with onboarding, home, and profile.', 'Orbit Mobile is a complete iOS app design template. Includes onboarding, home feed, search, profile, and settings screens.', 'NEW', 'https://images.unsplash.com/photo-1512941937669-90a1b58e7e9c?w=800&h=600&fit=crop', '["https://images.unsplash.com/photo-1512941937669-90a1b58e7e9c?w=800&h=600&fit=crop"]', 'https://example.com/orbit-demo', 'https://example.com/orbit-embed', '["Figma source","SwiftUI starter","20 screens","Dark + light"]', '1.0', 'v1.0 — Initial release.', false, false, false, false, true, 4.7, 0, 11, 8),
('Studio Folio', 'studio-folio', 'portfolios', 'Figma, HTML', 'studio, portfolio', 49, 'A refined portfolio template for design studios and agencies.', 'Studio Folio is a portfolio template designed for studios and agencies. Includes project grids, case studies, team, and contact sections.', null, 'https://images.unsplash.com/photo-1499750310107-5fef28a66643?w=800&h=600&fit=crop', '["https://images.unsplash.com/photo-1499750310107-5fef28a66643?w=800&h=600&fit=crop"]', 'https://example.com/studio-demo', 'https://example.com/studio-embed', '["Figma source","HTML/CSS","Project grid","Case studies","Team page"]', '1.0', 'v1.0 — Initial release.', false, false, false, false, true, 4.6, 0, 14, 10),
('Forma Commerce', 'forma-commerce', 'ecommerce', 'Figma, HTML, JS', 'commerce, fashion', 89, 'A fashion-forward ecommerce template with editorial layouts.', 'Forma Commerce is a premium ecommerce template for fashion and lifestyle brands. Editorial layouts, product storytelling, and a smooth checkout.', 'BESTSELLER', 'https://images.unsplash.com/photo-1483985988355-763728e1935b?w=800&h=600&fit=crop', '["https://images.unsplash.com/photo-1483985988355-763728e1935b?w=800&h=600&fit=crop","https://images.unsplash.com/photo-1441986300917-64674bd600d8?w=800&h=600&fit=crop"]', 'https://example.com/forma-demo', 'https://example.com/forma-embed', '["Figma source","HTML/CSS/JS","Editorial layouts","Checkout","Product storytelling"]', '1.1', 'v1.1 — Added editorial module.', false, false, false, false, true, 4.8, 0, 35, 25);

-- ---------- Orders ----------
create table orders (
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

-- ---------- Order items ----------
create table order_items (
  id uuid primary key default uuid_generate_v4(),
  order_id uuid references orders on delete cascade,
  product_id uuid references products,
  price_paid numeric not null,
  license text default 'standard'
);

-- ---------- Reviews ----------
create table reviews (
  id uuid primary key default uuid_generate_v4(),
  product_id uuid references products on delete cascade,
  name text not null,
  email text not null,
  rating int check (rating between 1 and 5),
  comment text,
  status text default 'pending' check (status in ('pending','approved','rejected')),
  created_at timestamptz default now()
);

-- ---------- Settings ----------
create table settings (
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
  ('discord_url','');

-- ---------- Submissions ----------
create table submissions (
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

-- ---------- Newsletter ----------
create table newsletter (
  id uuid primary key default uuid_generate_v4(),
  email text unique not null,
  created_at timestamptz default now()
);

-- ---------- Wishlist ----------
create table wishlist (
  id uuid primary key default uuid_generate_v4(),
  email text not null,
  product_id uuid references products on delete cascade,
  created_at timestamptz default now(),
  unique(email, product_id)
);

-- ---------- Coupons ----------
create table coupons (
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

-- ---------- Blog posts ----------
create table blog_posts (
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

-- ---------- Profiles ----------
create table profiles (
  id uuid primary key references auth.users on delete cascade,
  email text unique not null,
  name text,
  avatar_url text,
  created_at timestamptz default now()
);

-- ---------- Activity log ----------
create table activity_log (
  id uuid primary key default uuid_generate_v4(),
  email text not null,
  event text not null check (event in ('signup','sign_in','order','download','review','wishlist')),
  meta jsonb default '{}',
  created_at timestamptz default now()
);