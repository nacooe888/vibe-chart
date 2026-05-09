// Reusable voice recorder. Uses the browser MediaRecorder API for capture
// and the in-browser Whisper worker for transcription. Audio never leaves
// the device until the user explicitly saves the note.
//
// Props:
//   onSave({ blob, transcript, durationSec })  — called when user taps save
//   onCancel()                                  — called when user discards
//   autoLoadModel?: boolean                     — preload Whisper on mount

import { useEffect, useRef, useState } from 'react';
import { preloadWhisper, transcribeBlob } from '../lib/transcribe';

const STATE = {
  IDLE: 'idle',
  REQUESTING_MIC: 'requesting_mic',
  RECORDING: 'recording',
  TRANSCRIBING: 'transcribing',
  REVIEW: 'review',
  ERROR: 'error',
};

export default function VoiceRecorder({ onSave, onCancel, autoLoadModel = false }) {
  const [state, setState] = useState(STATE.IDLE);
  const [error, setError] = useState(null);
  const [elapsedSec, setElapsedSec] = useState(0);
  const [modelProgress, setModelProgress] = useState(null); // { status, progress, file }
  const [transcript, setTranscript] = useState('');
  const [blob, setBlob] = useState(null);
  const [durationSec, setDurationSec] = useState(0);

  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);
  const streamRef = useRef(null);
  const tickRef = useRef(null);
  const startedAtRef = useRef(0);

  useEffect(() => {
    if (autoLoadModel) {
      preloadWhisper((p) => setModelProgress(p)).catch(() => {});
    }
    return () => {
      // cleanup on unmount
      stopMicStream();
      if (tickRef.current) clearInterval(tickRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function stopMicStream() {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
  }

  async function startRecording() {
    setError(null);
    setState(STATE.REQUESTING_MIC);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      // Pick a mime type the browser actually supports.
      const candidates = [
        'audio/webm;codecs=opus',
        'audio/webm',
        'audio/mp4',
        'audio/ogg;codecs=opus',
      ];
      const mimeType = candidates.find(t => window.MediaRecorder?.isTypeSupported?.(t)) || '';
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      mediaRecorderRef.current = recorder;
      chunksRef.current = [];

      recorder.addEventListener('dataavailable', (e) => {
        if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
      });

      recorder.addEventListener('stop', async () => {
        const finalBlob = new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' });
        const recordedSec = (Date.now() - startedAtRef.current) / 1000;
        setBlob(finalBlob);
        setDurationSec(recordedSec);
        stopMicStream();
        setState(STATE.TRANSCRIBING);
        try {
          const result = await transcribeBlob(finalBlob, (p) => setModelProgress(p));
          setTranscript(result.text);
          if (result.durationSec) setDurationSec(result.durationSec);
          setState(STATE.REVIEW);
        } catch (err) {
          setError(`transcription failed: ${err?.message || err}`);
          setState(STATE.ERROR);
        }
      });

      startedAtRef.current = Date.now();
      recorder.start();
      setElapsedSec(0);
      tickRef.current = setInterval(() => {
        setElapsedSec((Date.now() - startedAtRef.current) / 1000);
      }, 200);
      setState(STATE.RECORDING);
    } catch (err) {
      setError(err?.message || 'microphone unavailable');
      setState(STATE.ERROR);
      stopMicStream();
    }
  }

  function stopRecording() {
    if (tickRef.current) { clearInterval(tickRef.current); tickRef.current = null; }
    const r = mediaRecorderRef.current;
    if (r && r.state === 'recording') r.stop();
  }

  function discard() {
    setBlob(null);
    setTranscript('');
    setDurationSec(0);
    setElapsedSec(0);
    setError(null);
    setModelProgress(null);
    setState(STATE.IDLE);
    if (onCancel) onCancel();
  }

  function save() {
    if (!blob) return;
    onSave({ blob, transcript, durationSec });
    setBlob(null);
    setTranscript('');
    setDurationSec(0);
    setElapsedSec(0);
    setModelProgress(null);
    setState(STATE.IDLE);
  }

  // ── Render ───────────────────────────────────────────────────────────────
  const baseStyle = {
    fontFamily: "'Cormorant Garamond', serif",
    color: 'white',
    background: 'rgba(255,255,255,0.02)',
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: 16,
    padding: '20px 18px',
  };

  if (state === STATE.IDLE) {
    return (
      <div style={baseStyle}>
        <button
          onClick={startRecording}
          style={recordButtonStyle}
        >
          ● record
        </button>
        <div style={{ marginTop: 10, fontSize: 11, color: 'rgba(255,255,255,0.4)', fontStyle: 'italic', textAlign: 'center', letterSpacing: '0.04em' }}>
          your voice never leaves the device — transcription runs on your phone
        </div>
      </div>
    );
  }

  if (state === STATE.REQUESTING_MIC) {
    return <div style={{ ...baseStyle, textAlign: 'center', color: 'rgba(255,255,255,0.55)', fontStyle: 'italic' }}>requesting microphone…</div>;
  }

  if (state === STATE.RECORDING) {
    return (
      <div style={baseStyle}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
          <div style={{ fontSize: 13, color: 'rgba(255,127,127,0.85)', letterSpacing: '0.18em', textTransform: 'uppercase' }}>
            ● recording
          </div>
          <div style={{ fontSize: 24, color: 'rgba(255,255,255,0.85)', fontVariantNumeric: 'tabular-nums' }}>
            {formatDuration(elapsedSec)}
          </div>
        </div>
        <button onClick={stopRecording} style={{ ...recordButtonStyle, marginTop: 16, background: 'rgba(255,127,127,0.15)', borderColor: 'rgba(255,127,127,0.35)' }}>
          ■ stop
        </button>
      </div>
    );
  }

  if (state === STATE.TRANSCRIBING) {
    const pct = modelProgress?.progress ? Math.round(modelProgress.progress) : null;
    const status = modelProgress?.status;
    let label = 'transcribing…';
    if (status === 'progress' && pct != null) label = `loading model… ${pct}%`;
    if (status === 'download') label = 'downloading model…';
    if (status === 'ready') label = 'transcribing…';
    return (
      <div style={{ ...baseStyle, textAlign: 'center' }}>
        <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.55)', fontStyle: 'italic', animation: 'pulse 1.5s ease-in-out infinite' }}>
          {label}
        </div>
        {pct != null && (
          <div style={{ marginTop: 12, height: 3, background: 'rgba(255,255,255,0.06)', borderRadius: 99, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${pct}%`, background: 'rgba(196,159,255,0.7)', transition: 'width 0.2s' }} />
          </div>
        )}
        {modelProgress?.file && (
          <div style={{ marginTop: 8, fontSize: 10, color: 'rgba(255,255,255,0.3)' }}>{modelProgress.file}</div>
        )}
      </div>
    );
  }

  if (state === STATE.REVIEW) {
    return (
      <div style={baseStyle}>
        <div style={{ fontSize: 11, letterSpacing: '0.22em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.45)', marginBottom: 10 }}>
          review · {formatDuration(durationSec)}
        </div>
        {blob && <audio controls src={URL.createObjectURL(blob)} style={{ width: '100%', marginBottom: 14 }} />}
        <textarea
          value={transcript}
          onChange={e => setTranscript(e.target.value)}
          placeholder="(no speech detected — you can type instead)"
          style={{
            width: '100%',
            minHeight: 120,
            padding: '12px 14px',
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: 10,
            color: 'white',
            fontFamily: "'Cormorant Garamond', serif",
            fontSize: 16,
            lineHeight: 1.6,
            resize: 'vertical',
            boxSizing: 'border-box',
          }}
        />
        <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
          <button onClick={discard} style={{ ...secondaryButtonStyle }}>
            discard
          </button>
          <button onClick={save} style={{ ...primaryButtonStyle }}>
            save note
          </button>
        </div>
      </div>
    );
  }

  if (state === STATE.ERROR) {
    return (
      <div style={baseStyle}>
        <div style={{ color: '#FF7F9B', fontSize: 13, fontStyle: 'italic', marginBottom: 12 }}>
          {error}
        </div>
        <button onClick={discard} style={secondaryButtonStyle}>start over</button>
      </div>
    );
  }

  return null;
}

function formatDuration(sec) {
  const s = Math.floor(sec || 0);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, '0')}`;
}

const recordButtonStyle = {
  width: '100%',
  padding: '16px 18px',
  borderRadius: 99,
  border: '1px solid rgba(196,159,255,0.4)',
  background: 'rgba(196,159,255,0.12)',
  color: 'white',
  fontFamily: "'Cormorant Garamond', serif",
  fontSize: 16,
  letterSpacing: '0.16em',
  textTransform: 'uppercase',
  cursor: 'pointer',
};

const primaryButtonStyle = {
  flex: 1,
  padding: '12px 18px',
  borderRadius: 99,
  border: '1px solid rgba(196,159,255,0.5)',
  background: 'rgba(196,159,255,0.18)',
  color: 'white',
  fontFamily: "'Cormorant Garamond', serif",
  fontSize: 13,
  letterSpacing: '0.16em',
  textTransform: 'uppercase',
  cursor: 'pointer',
};

const secondaryButtonStyle = {
  flex: 1,
  padding: '12px 18px',
  borderRadius: 99,
  border: '1px solid rgba(255,255,255,0.12)',
  background: 'transparent',
  color: 'rgba(255,255,255,0.6)',
  fontFamily: "'Cormorant Garamond', serif",
  fontSize: 13,
  letterSpacing: '0.16em',
  textTransform: 'uppercase',
  cursor: 'pointer',
};
