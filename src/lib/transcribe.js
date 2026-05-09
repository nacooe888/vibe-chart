// Main-thread interface to the Whisper Web Worker.
// Decodes recorded audio blobs into Float32 PCM at 16 kHz, then ships them
// to the worker for in-browser transcription.

let workerInstance = null;
let nextId = 1;

function getWorker() {
  if (!workerInstance) {
    // Vite-native worker construction. The `?worker` query and `type: 'module'`
    // option together produce a properly-bundled module worker.
    workerInstance = new Worker(
      new URL('./whisperWorker.js', import.meta.url),
      { type: 'module' }
    );
  }
  return workerInstance;
}

// Decode any audio Blob (webm/opus, mp4/aac, wav, etc.) into a 16 kHz mono
// Float32Array — the format Whisper expects.
async function decodeToFloat32_16k(blob) {
  const arrayBuf = await blob.arrayBuffer();

  // Decode at the browser's native sample rate first, then resample to 16 kHz.
  const ctx = new (window.AudioContext || window.webkitAudioContext)();
  const audioBuf = await ctx.decodeAudioData(arrayBuf.slice(0));

  // Mix to mono if needed
  const channels = audioBuf.numberOfChannels;
  const monoSrc = new Float32Array(audioBuf.length);
  for (let ch = 0; ch < channels; ch++) {
    const data = audioBuf.getChannelData(ch);
    for (let i = 0; i < data.length; i++) monoSrc[i] += data[i] / channels;
  }

  // Resample to 16 kHz via OfflineAudioContext for accuracy.
  const targetRate = 16000;
  if (audioBuf.sampleRate === targetRate) {
    ctx.close();
    return { float32: monoSrc, samplingRate: targetRate, durationSec: audioBuf.duration };
  }

  const offline = new OfflineAudioContext(
    1,
    Math.ceil(audioBuf.duration * targetRate),
    targetRate
  );
  const source = offline.createBufferSource();
  const monoBuf = offline.createBuffer(1, monoSrc.length, audioBuf.sampleRate);
  monoBuf.copyToChannel(monoSrc, 0);
  source.buffer = monoBuf;
  source.connect(offline.destination);
  source.start();
  const rendered = await offline.startRendering();
  ctx.close();

  return {
    float32: rendered.getChannelData(0),
    samplingRate: targetRate,
    durationSec: audioBuf.duration,
  };
}

// Public API ----------------------------------------------------------------

// Preload the Whisper model (kicks off the ~40 MB download). Optional —
// transcribe() will load on demand otherwise. Returns a promise that resolves
// once the model is ready, with progress events forwarded to onProgress.
export function preloadWhisper(onProgress) {
  return new Promise((resolve, reject) => {
    const worker = getWorker();
    const id = nextId++;
    const handler = (e) => {
      const msg = e.data;
      if (msg.type === 'progress' && onProgress) onProgress(msg.payload);
      if (msg.id === id && msg.type === 'loaded') {
        worker.removeEventListener('message', handler);
        resolve();
      }
      if (msg.id === id && msg.type === 'error') {
        worker.removeEventListener('message', handler);
        reject(new Error(msg.error));
      }
    };
    worker.addEventListener('message', handler);
    worker.postMessage({ id, type: 'load' });
  });
}

// Transcribe an audio Blob. Returns { text, durationSec }.
export async function transcribeBlob(blob, onProgress) {
  const decoded = await decodeToFloat32_16k(blob);

  return new Promise((resolve, reject) => {
    const worker = getWorker();
    const id = nextId++;
    const handler = (e) => {
      const msg = e.data;
      if (msg.type === 'progress' && onProgress) onProgress(msg.payload);
      if (msg.id === id && msg.type === 'transcribed') {
        worker.removeEventListener('message', handler);
        resolve({ text: msg.text, durationSec: decoded.durationSec });
      }
      if (msg.id === id && msg.type === 'error') {
        worker.removeEventListener('message', handler);
        reject(new Error(msg.error));
      }
    };
    worker.addEventListener('message', handler);
    worker.postMessage({
      id,
      type: 'transcribe',
      payload: { audioFloat32: decoded.float32, samplingRate: decoded.samplingRate },
    });
  });
}
