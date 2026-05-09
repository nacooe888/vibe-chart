// Voice notes — Supabase Storage upload + voice_notes row management.
// Audio files live in the private `voice-notes` bucket under <user_id>/<uuid>.<ext>.

import { supabase } from './supabase';

function extFromMime(mime) {
  if (!mime) return 'webm';
  if (mime.includes('mp4'))  return 'mp4';
  if (mime.includes('mpeg')) return 'mp3';
  if (mime.includes('wav'))  return 'wav';
  if (mime.includes('ogg'))  return 'ogg';
  return 'webm';
}

// Upload an audio Blob and create a voice_notes row.
// `extras` may include: transcript, duration_seconds, transit_snapshot,
// active_dekans, moon_phase, title, tags.
export async function saveVoiceNote(userId, audioBlob, extras = {}) {
  const ext = extFromMime(audioBlob.type);
  const id = crypto.randomUUID();
  const path = `${userId}/${id}.${ext}`;

  const { error: uploadErr } = await supabase.storage
    .from('voice-notes')
    .upload(path, audioBlob, {
      contentType: audioBlob.type || 'audio/webm',
      upsert: false,
    });
  if (uploadErr) throw uploadErr;

  const { data, error } = await supabase
    .from('voice_notes')
    .insert({
      user_id: userId,
      audio_path: path,
      mime_type: audioBlob.type || null,
      transcript: extras.transcript || null,
      transcript_status: extras.transcript ? 'done' : 'pending',
      duration_seconds: extras.duration_seconds ?? null,
      transit_snapshot: extras.transit_snapshot ?? null,
      active_dekans: extras.active_dekans ?? null,
      moon_phase: extras.moon_phase ?? null,
      title: extras.title ?? null,
      tags: extras.tags ?? null,
    })
    .select()
    .single();
  if (error) throw error;

  return data;
}

// List the current user's voice notes, newest first.
export async function listVoiceNotes(userId, limit = 50) {
  const { data, error } = await supabase
    .from('voice_notes')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data || [];
}

// Get a short-lived signed URL for an audio file.
export async function getAudioUrl(audioPath, expiresInSec = 3600) {
  const { data, error } = await supabase.storage
    .from('voice-notes')
    .createSignedUrl(audioPath, expiresInSec);
  if (error) throw error;
  return data.signedUrl;
}

// Delete a voice note row + its audio file.
export async function deleteVoiceNote(noteId, audioPath) {
  // Delete the row (RLS confirms ownership).
  const { error: rowErr } = await supabase
    .from('voice_notes')
    .delete()
    .eq('id', noteId);
  if (rowErr) throw rowErr;

  // Then the audio file (also RLS-gated).
  const { error: storageErr } = await supabase.storage
    .from('voice-notes')
    .remove([audioPath]);
  if (storageErr) throw storageErr;
}
