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

  -- Sky context snapshot (populated automatically at save time)
  transit_positions    jsonb,
  active_transits      jsonb,
  transit_peak_proximity jsonb,
  moon_phase           text,
  retrograde_planets   jsonb,
  dominant_sign        text,
  intensity_score      numeric
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
  ayanamsa text check (ayanamsa in ('fagan-allen', 'lahiri', 'raman')) default 'fagan-allen',
  experience_level text check (experience_level in ('new', 'basics', 'advanced')) default 'new',
  depth_preference text check (depth_preference in ('light', 'deep', 'adaptive')) default 'adaptive',
  transit_preference text check (transit_preference in ('soft', 'direct', 'adaptive')) default 'adaptive',
  has_seen_tutorial boolean default false
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

-- ─────────────────────────────────────────────
-- Reflections Table (transit cycle journal)
-- ─────────────────────────────────────────────

create table if not exists public.reflections (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,

  -- What transit they're reflecting on
  transit_name text not null,          -- e.g. "Neptune trine natal Ascendant"
  transit_planet text,                 -- e.g. "Neptune" (for cycle queries)
  natal_planet text,                   -- e.g. "Ascendant" (for cycle queries)
  aspect_type text,                    -- e.g. "trine", "conjunct", "square"

  -- Context at time of reflection
  vibe text,                           -- what vibe they were transmitting
  reflecting_on_year text,             -- the past occurrence year they chose

  -- The reflection itself
  body text not null,

  -- Sky snapshot for future cycle analysis
  transit_positions jsonb
);

create index if not exists reflections_user_id_idx on public.reflections(user_id);
create index if not exists reflections_transit_name_idx on public.reflections(transit_name);
create index if not exists reflections_transit_planet_idx on public.reflections(transit_planet);
create index if not exists reflections_created_at_idx on public.reflections(created_at);

alter table public.reflections enable row level security;

create policy "Users can view own reflections"
  on public.reflections for select
  using (auth.uid() = user_id);

create policy "Users can insert own reflections"
  on public.reflections for insert
  with check (auth.uid() = user_id);

create policy "Users can update own reflections"
  on public.reflections for update
  using (auth.uid() = user_id);

create policy "Users can delete own reflections"
  on public.reflections for delete
  using (auth.uid() = user_id);

-- ─────────────────────────────────────────────
-- API Usage Table (rate limiting — 50 calls/day)
-- ─────────────────────────────────────────────

create table if not exists public.api_usage (
  user_id    uuid references auth.users(id) on delete cascade not null,
  date       date not null,
  call_count integer not null default 0,
  primary key (user_id, date)
);

create index if not exists api_usage_user_id_idx on public.api_usage(user_id);

-- Enable RLS — service role bypasses it for writes; users can read their own row
alter table public.api_usage enable row level security;

create policy "Users can view own usage"
  on public.api_usage for select
  using (auth.uid() = user_id);

-- ─────────────────────────────────────────────
-- Atomic increment — called server-side only
-- Inserts (user_id, date, 1) or increments existing count; returns new total.
-- ─────────────────────────────────────────────

create or replace function public.increment_api_usage(p_user_id uuid, p_date date)
returns integer
language plpgsql
security definer
as $$
declare
  v_count integer;
begin
  insert into public.api_usage (user_id, date, call_count)
  values (p_user_id, p_date, 1)
  on conflict (user_id, date) do update
    set call_count = api_usage.call_count + 1
  returning call_count into v_count;

  return v_count;
end;
$$;
