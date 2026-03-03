-- Vibe Map Database Schema
-- Run this in Supabase SQL Editor (supabase.com/dashboard → SQL Editor)

-- Create the vibe_logs table
create table if not exists public.vibe_logs (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,

  -- Entry metadata
  mode text check (mode in ('plot', 'draw')) not null,
  note text,

  -- Quantified data
  dominant_angle decimal,
  dominant_vibe text,
  intensity integer check (intensity >= 0 and intensity <= 100),
  spread integer check (spread >= 0 and spread <= 100),
  centroid jsonb,
  vibes_present text[],
  point_count integer,
  vertical_bias text check (vertical_bias in ('expansive', 'contractive', 'balanced')),
  horizontal_bias text check (horizontal_bias in ('directive', 'receptive', 'balanced')),

  -- Raw point data
  points jsonb,

  -- Future: transit data
  transits jsonb
);

-- Create index for faster user queries
create index if not exists vibe_logs_user_id_idx on public.vibe_logs(user_id);
create index if not exists vibe_logs_created_at_idx on public.vibe_logs(created_at);

-- Enable Row Level Security (RLS)
alter table public.vibe_logs enable row level security;

-- Policy: Users can only see their own logs
create policy "Users can view own logs"
  on public.vibe_logs for select
  using (auth.uid() = user_id);

-- Policy: Users can insert their own logs
create policy "Users can insert own logs"
  on public.vibe_logs for insert
  with check (auth.uid() = user_id);

-- Policy: Users can update their own logs
create policy "Users can update own logs"
  on public.vibe_logs for update
  using (auth.uid() = user_id);

-- Policy: Users can delete their own logs
create policy "Users can delete own logs"
  on public.vibe_logs for delete
  using (auth.uid() = user_id);

-- ─────────────────────────────────────────────
-- User Charts Table (natal + transit data)
-- ─────────────────────────────────────────────

create table if not exists public.user_charts (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  chart_type text check (chart_type in ('natal', 'transits')) not null,
  chart_data jsonb not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null,

  -- Each user can only have one natal chart and one transits chart
  unique(user_id, chart_type)
);

-- Create index for faster user queries
create index if not exists user_charts_user_id_idx on public.user_charts(user_id);

-- Enable Row Level Security (RLS)
alter table public.user_charts enable row level security;

-- Policy: Users can only see their own charts
create policy "Users can view own charts"
  on public.user_charts for select
  using (auth.uid() = user_id);

-- Policy: Users can insert their own charts
create policy "Users can insert own charts"
  on public.user_charts for insert
  with check (auth.uid() = user_id);

-- Policy: Users can update their own charts
create policy "Users can update own charts"
  on public.user_charts for update
  using (auth.uid() = user_id);

-- Policy: Users can delete their own charts
create policy "Users can delete own charts"
  on public.user_charts for delete
  using (auth.uid() = user_id);

-- ─────────────────────────────────────────────
-- User Profiles Table (birth info + preferences)
-- ─────────────────────────────────────────────

create table if not exists public.user_profiles (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade not null unique,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null,

  -- Birth info
  name text,
  birth_date date,
  birth_time time,
  birth_time_unknown boolean default false,
  birth_location text,

  -- Preferences
  ayanamsa text check (ayanamsa in ('fagan-allen', 'lahiri', 'raman')) default 'fagan-allen'
);

-- Create index for faster user queries
create index if not exists user_profiles_user_id_idx on public.user_profiles(user_id);

-- Enable Row Level Security (RLS)
alter table public.user_profiles enable row level security;

-- Policy: Users can only see their own profile
create policy "Users can view own profile"
  on public.user_profiles for select
  using (auth.uid() = user_id);

-- Policy: Users can insert their own profile
create policy "Users can insert own profile"
  on public.user_profiles for insert
  with check (auth.uid() = user_id);

-- Policy: Users can update their own profile
create policy "Users can update own profile"
  on public.user_profiles for update
  using (auth.uid() = user_id);

-- Policy: Users can delete their own profile
create policy "Users can delete own profile"
  on public.user_profiles for delete
  using (auth.uid() = user_id);
