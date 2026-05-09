// Voice notes scratchpad — minimal tab to validate the end-to-end pipeline.
// Will be replaced/absorbed by the Dream tracker tab on day 3, but for now
// it lets us record, transcribe, save, list, play back, and delete.

import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import VoiceRecorder from './VoiceRecorder';
import { saveVoiceNote, listVoiceNotes, getAudioUrl, deleteVoiceNote } from '../lib/voiceStorage';

export default function VoiceNotesTab() {
  const { user } = useAuth();
  const [notes, setNotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showRecorder, setShowRecorder] = useState(false);

  useEffect(() => {
    if (!user) return;
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  async function refresh() {
    try {
      setLoading(true);
      const list = await listVoiceNotes(user.id);
      setNotes(list);
      setError(null);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleSave({ blob, transcript, durationSec }) {
    try {
      await saveVoiceNote(user.id, blob, {
        transcript,
        duration_seconds: durationSec,
      });
      setShowRecorder(false);
      await refresh();
    } catch (e) {
      setError(e.message);
    }
  }

  async function handleDelete(note) {
    if (!confirm('delete this voice note?')) return;
    try {
      await deleteVoiceNote(note.id, note.audio_path);
      await refresh();
    } catch (e) {
      setError(e.message);
    }
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: 'radial-gradient(ellipse at 40% 35%, rgba(196,159,255,0.1) 0%, transparent 55%), #050510',
      fontFamily: "'Cormorant Garamond', serif",
      color: 'white',
      padding: '36px 20px 96px',
    }}>
      <div style={{ maxWidth: 520, margin: '0 auto' }}>
        <div style={{ textAlign: 'center', marginBottom: 26 }}>
          <div style={{ fontSize: 11, letterSpacing: '0.34em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.5)', marginBottom: 10 }}>
            on-device transcription
          </div>
          <h1 style={{ fontWeight: 300, fontSize: 40, margin: 0, letterSpacing: '0.06em' }}>voice</h1>
          <div style={{ width: 36, height: 1, background: 'rgba(255,255,255,0.1)', margin: '15px auto 0' }} />
        </div>

        {showRecorder ? (
          <VoiceRecorder
            onSave={handleSave}
            onCancel={() => setShowRecorder(false)}
          />
        ) : (
          <button
            onClick={() => setShowRecorder(true)}
            style={{
              width: '100%',
              padding: '14px 18px',
              borderRadius: 99,
              border: '1px solid rgba(196,159,255,0.4)',
              background: 'rgba(196,159,255,0.12)',
              color: 'white',
              fontFamily: "'Cormorant Garamond', serif",
              fontSize: 14,
              letterSpacing: '0.16em',
              textTransform: 'uppercase',
              cursor: 'pointer',
            }}
          >
            ● new voice note
          </button>
        )}

        {error && (
          <div style={{ marginTop: 16, padding: '12px 16px', background: 'rgba(255,127,127,0.08)', border: '1px solid rgba(255,127,127,0.25)', borderRadius: 10, color: '#FF7F9B', fontSize: 13, fontStyle: 'italic' }}>
            {error}
          </div>
        )}

        <div style={{ marginTop: 28 }}>
          {loading && (
            <div style={{ textAlign: 'center', padding: '40px 20px', color: 'rgba(255,255,255,0.4)', fontStyle: 'italic' }}>
              loading…
            </div>
          )}

          {!loading && notes.length === 0 && !showRecorder && (
            <div style={{ textAlign: 'center', padding: '40px 20px', color: 'rgba(255,255,255,0.4)', fontStyle: 'italic', fontSize: 13 }}>
              no voice notes yet
            </div>
          )}

          {notes.map(n => <NoteRow key={n.id} note={n} onDelete={() => handleDelete(n)} />)}
        </div>
      </div>
    </div>
  );
}

function NoteRow({ note, onDelete }) {
  const [audioUrl, setAudioUrl] = useState(null);
  const [showAudio, setShowAudio] = useState(false);

  async function loadAudio() {
    if (audioUrl) { setShowAudio(s => !s); return; }
    try {
      const url = await getAudioUrl(note.audio_path);
      setAudioUrl(url);
      setShowAudio(true);
    } catch (e) {
      // fall through
    }
  }

  return (
    <div style={{
      marginBottom: 10,
      padding: '14px 16px',
      borderRadius: 12,
      background: 'rgba(255,255,255,0.02)',
      border: '1px solid rgba(255,255,255,0.06)',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, marginBottom: 8 }}>
        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', letterSpacing: '0.1em' }}>
          {new Date(note.created_at).toLocaleString()}
          {note.duration_seconds ? ` · ${Math.round(note.duration_seconds)}s` : ''}
        </div>
        <button onClick={onDelete} style={{ background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.3)', fontFamily: "'Cormorant Garamond', serif", fontSize: 11, cursor: 'pointer' }}>
          delete
        </button>
      </div>
      {note.transcript ? (
        <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.78)', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
          {note.transcript}
        </div>
      ) : (
        <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.35)', fontStyle: 'italic' }}>
          (no transcript)
        </div>
      )}
      <button onClick={loadAudio} style={{ marginTop: 10, padding: '6px 12px', borderRadius: 99, border: '1px solid rgba(255,255,255,0.1)', background: 'transparent', color: 'rgba(255,255,255,0.6)', fontFamily: "'Cormorant Garamond', serif", fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase', cursor: 'pointer' }}>
        {showAudio ? 'hide audio' : 'play audio'}
      </button>
      {showAudio && audioUrl && (
        <audio controls src={audioUrl} style={{ width: '100%', marginTop: 10 }} />
      )}
    </div>
  );
}
