// In-browser Whisper inference, run inside a Web Worker so transcription
// never blocks the main UI thread. The audio never leaves the device — this
// is the privacy backbone of MythOS's voice capture.
//
// Model: whisper-tiny.en (~40 MB). Downloads on first use, then caches in
// the browser via the transformers.js cache (IndexedDB). Subsequent runs
// load instantly.

import { pipeline, env } from '@xenova/transformers';

// Hugging Face hosts model weights at https://huggingface.co/<repo>/resolve/main/...
// transformers.js fetches from there by default; cache lives in IndexedDB.
env.allowLocalModels = false;
env.useBrowserCache = true;

// Lazily initialized — first message into the worker triggers model load.
let transcriber = null;

self.addEventListener('message', async (e) => {
  const { id, type, payload } = e.data || {};

  try {
    if (type === 'load') {
      await ensureLoaded();
      self.postMessage({ id, type: 'loaded' });
      return;
    }

    if (type === 'transcribe') {
      const { audioFloat32, samplingRate } = payload;
      await ensureLoaded();
      // transformers.js Whisper expects a Float32Array at 16 kHz mono.
      const result = await transcriber(audioFloat32, {
        // chunk_length_s: 30,  // default; long files get chunked automatically
        // stride_length_s: 5,
        sampling_rate: samplingRate,
      });
      const text = (result?.text || '').trim();
      self.postMessage({ id, type: 'transcribed', text });
      return;
    }

    self.postMessage({ id, type: 'error', error: `Unknown message type: ${type}` });
  } catch (err) {
    self.postMessage({ id, type: 'error', error: err?.message || String(err) });
  }
});

async function ensureLoaded() {
  if (transcriber) return;

  // Progress callback fires repeatedly during the ~40 MB model download.
  // We forward each callback to the main thread as a 'progress' event.
  transcriber = await pipeline(
    'automatic-speech-recognition',
    'Xenova/whisper-tiny.en',
    {
      progress_callback: (p) => {
        self.postMessage({ type: 'progress', payload: p });
      },
    }
  );
}
