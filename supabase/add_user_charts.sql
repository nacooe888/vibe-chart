-- Run this in Supabase SQL Editor to add the user_charts table
-- (Run this if you already have the vibe_logs table from the original schema)

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
