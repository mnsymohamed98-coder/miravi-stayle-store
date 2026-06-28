-- Miravi STAYLE Supabase setup
-- Run this file once in Supabase SQL Editor.

create extension if not exists pgcrypto;

create table if not exists public.products (
  id text primary key,
  name text not null,
  category text default 'عام',
  price numeric default 0,
  stock integer default 0,
  status text default 'available' check (status in ('available', 'limited', 'unavailable')),
  image text default '',
  description text default '',
  is_featured boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.orders (
  id text primary key,
  product_id text references public.products(id) on delete set null,
  product_name text not null,
  quantity integer default 1,
  unit_price numeric default 0,
  total numeric default 0,
  customer_name text not null,
  customer_phone text not null,
  area text not null,
  address text not null,
  size text default '',
  color text default '',
  notes text default '',
  status text default 'new' check (status in ('new', 'confirmed', 'preparing', 'out_for_delivery', 'delivered', 'cancelled')),
  admin_note text default '',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.products enable row level security;
alter table public.orders enable row level security;

-- The application server uses SUPABASE_SERVICE_ROLE_KEY, which bypasses RLS.
-- These read policies are optional and safe for public catalogue display if you later use anon key directly.
drop policy if exists "public can read available products" on public.products;
create policy "public can read available products"
  on public.products for select
  using (status <> 'unavailable');

-- Public storage bucket for product images.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'product-images',
  'product-images',
  true,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  public = true,
  file_size_limit = 10485760,
  allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp'];
