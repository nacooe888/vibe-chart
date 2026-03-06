-- Migration: add sky context columns to vibe_logs
-- Run in Supabase SQL Editor

ALTER TABLE public.vibe_logs
  ADD COLUMN IF NOT EXISTS transit_positions    jsonb,
  ADD COLUMN IF NOT EXISTS active_transits      jsonb,
  ADD COLUMN IF NOT EXISTS transit_peak_proximity jsonb,
  ADD COLUMN IF NOT EXISTS moon_phase           text,
  ADD COLUMN IF NOT EXISTS retrograde_planets   jsonb,
  ADD COLUMN IF NOT EXISTS dominant_sign        text,
  ADD COLUMN IF NOT EXISTS intensity_score      numeric;
