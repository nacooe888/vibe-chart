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
