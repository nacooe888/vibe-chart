-- Voice Notes — schema additions
-- Paste this into Supabase Dashboard → SQL Editor → New query, then run it.

-- ─────────────────────────────────────────────
-- Storage bucket for raw audio files
-- ─────────────────────────────────────────────

insert into storage.buckets (id, name, public, file_size_limit)
values ('voice-notes', 'voice-notes', false, 26214400)  -- 25 MB cap (matches OpenAI Whisper's max)
on conflict (id) do nothing;

-- RLS: each user can only touch files inside their own user_id/ folder
drop policy if exists "voice-notes-insert" on storage.objects;
drop policy if exists "voice-notes-select" on storage.objects;
drop policy if exists "voice-notes-delete" on storage.objects;

create policy "voice-notes-insert"
  on storage.objects for insert
  with check (bucket_id = 'voice-notes' and auth.uid()::text = (storage.foldername(name))[1]);

create policy "voice-notes-select"
  on storage.objects for select
  using (bucket_id = 'voice-notes' and auth.uid()::text = (storage.foldername(name))[1]);

create policy "voice-notes-delete"
  on storage.objects for delete
  using (bucket_id = 'voice-notes' and auth.uid()::text = (storage.foldername(name))[1]);


-- ─────────────────────────────────────────────
-- voice_notes table — the scratchpad layer for v1
-- (Dream and ritual tables will reference audio similarly)
-- ─────────────────────────────────────────────

create table if not exists public.voice_notes (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  created_at timestamptz default now() not null,

  -- Audio
  audio_path text not null,            -- Supabase Storage path: <user_id>/<uuid>.<ext>
  duration_seconds numeric,
  mime_type text,

  -- Transcription
  transcript text,
  transcript_status text check (transcript_status in ('pending','done','error')) default 'pending',
  transcript_error text,

  -- Astrological context snapshot (auto-stamped at save time)
  transit_snapshot jsonb,
  active_dekans   jsonb,
  moon_phase      text,

  -- Free-form
  title text,
  tags text[]
);

create index if not exists voice_notes_user_id_idx on public.voice_notes(user_id);
create index if not exists voice_notes_created_at_idx on public.voice_notes(created_at desc);

alter table public.voice_notes enable row level security;

drop policy if exists "voice_notes_select_own" on public.voice_notes;
drop policy if exists "voice_notes_insert_own" on public.voice_notes;
drop policy if exists "voice_notes_update_own" on public.voice_notes;
drop policy if exists "voice_notes_delete_own" on public.voice_notes;

create policy "voice_notes_select_own"
  on public.voice_notes for select using (auth.uid() = user_id);

create policy "voice_notes_insert_own"
  on public.voice_notes for insert with check (auth.uid() = user_id);

create policy "voice_notes_update_own"
  on public.voice_notes for update using (auth.uid() = user_id);

create policy "voice_notes_delete_own"
  on public.voice_notes for delete using (auth.uid() = user_id);
