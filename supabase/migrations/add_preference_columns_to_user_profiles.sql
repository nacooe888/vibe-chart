-- Migration: add onboarding preference columns to user_profiles
-- Run in Supabase SQL Editor

ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS experience_level text
    check (experience_level in ('new', 'basics', 'advanced')) default 'new',
  ADD COLUMN IF NOT EXISTS depth_preference text
    check (depth_preference in ('light', 'deep', 'adaptive')) default 'adaptive',
  ADD COLUMN IF NOT EXISTS transit_preference text
    check (transit_preference in ('soft', 'direct', 'adaptive')) default 'adaptive',
  ADD COLUMN IF NOT EXISTS has_seen_tutorial boolean default false;
