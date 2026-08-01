// studio-app/core/stt.js
var STT_PROVIDERS = {
  whisper: {
    id: "whisper",
    label: "Private transcription",
    disclosure: "Speech is transcribed on this device by a local Whisper model. Audio never leaves your browser."
  },
  webspeech: {
    id: "webspeech",
    label: "Live dictation",
    disclosure: "Words appear while you speak. This uses your browser or operating system speech service, which may send audio to the cloud."
  }
};
var STT_ENGINE_KEY = "helm.studio.stt.engine";
var STT_MAX_RECORD_MS = 5 * 60 * 1e3;
function resolveSttProvider(stored, avail) {
  const a = avail || {};
  if (stored === "webspeech" && a.webspeech) return "webspeech";
  if (a.whisper) return "whisper";
  return null;
}
var STT_TRANSITIONS = {
  idle: { prepare: "preparing", record: "recording" },
  preparing: { ready: "recording", fail: "error", cancel: "idle" },
  recording: { stop: "transcribing", cancel: "idle", fail: "error" },
  transcribing: { done: "idle", fail: "error", cancel: "idle" },
  error: { reset: "idle" }
};
var STT_STATES = Object.keys(STT_TRANSITIONS);
function sttNext(state, event) {
  const row = STT_TRANSITIONS[state];
  return row && row[event] || null;
}
function appendDictation(existing, text) {
  const base = String(existing == null ? "" : existing);
  const t = String(text == null ? "" : text).trim();
  if (!t) return base;
  if (!base) return t;
  return base + (/\s$/.test(base) ? "" : " ") + t;
}
function mergeProgress(prev, event) {
  const p = prev || { loaded: 0, total: 0 };
  const e = event || {};
  if (e.status === "done") {
    const total = p.total || p.loaded;
    return { loaded: total, total };
  }
  return {
    loaded: Math.max(p.loaded, e.loaded || 0),
    total: e.total || p.total
  };
}
function preloadPct(files) {
  let loaded = 0, total = 0;
  for (const f of files) {
    loaded += f && f.loaded || 0;
    total += f && f.total || 0;
  }
  if (!total) return 0;
  return Math.max(0, Math.min(100, Math.round(loaded / total * 100)));
}

// studio-app/stt.src.js
function whisperSupported() {
  try {
    return !!(globalThis.Worker && globalThis.WebAssembly && globalThis.MediaRecorder && navigator.mediaDevices && navigator.mediaDevices.getUserMedia && globalThis.AudioContext && globalThis.OfflineAudioContext);
  } catch (_) {
    return false;
  }
}
function parseWav(buf) {
  const dv = new DataView(buf);
  let off = 12;
  while (off + 8 <= dv.byteLength) {
    const id = String.fromCharCode(dv.getUint8(off), dv.getUint8(off + 1), dv.getUint8(off + 2), dv.getUint8(off + 3));
    const size = dv.getUint32(off + 4, true);
    if (id === "data") {
      const n = Math.floor(Math.min(size, dv.byteLength - off - 8) / 2);
      const out = new Float32Array(n);
      for (let i = 0; i < n; i++) out[i] = dv.getInt16(off + 8 + i * 2, true) / 32768;
      return out;
    }
    off += 8 + size + size % 2;
  }
  throw new Error("no data chunk");
}
async function decodeTo16kMono(arrayBuffer) {
  try {
    const probe = new AudioContext();
    const decoded = await probe.decodeAudioData(arrayBuffer.slice(0));
    await probe.close();
    const targetLen = Math.max(1, Math.ceil(decoded.duration * 16e3));
    const off = new OfflineAudioContext(1, targetLen, 16e3);
    const src = off.createBufferSource();
    src.buffer = decoded;
    src.connect(off.destination);
    src.start();
    const rendered = await off.startRendering();
    return rendered.getChannelData(0);
  } catch (_) {
    return parseWav(arrayBuffer);
  }
}
function createWhisperProvider() {
  let worker = null;
  let seq = 0;
  let epoch = 0;
  const pending = /* @__PURE__ */ new Map();
  const failAll = (message) => {
    for (const p of pending.values()) p.reject(new Error(message));
    pending.clear();
  };
  const ensureWorker = () => {
    if (worker) return worker;
    worker = new Worker(new URL("./stt-worker.js", import.meta.url), { type: "module" });
    worker.onmessage = (ev) => {
      const { id, type } = ev.data || {};
      const p = pending.get(id);
      if (!p) return;
      if (type === "progress") {
        p.files.set(ev.data.file, mergeProgress(p.files.get(ev.data.file), ev.data));
        if (p.onProgress) p.onProgress({ pct: preloadPct(p.files.values()), file: ev.data.file, status: ev.data.status });
        return;
      }
      pending.delete(id);
      if (type === "error") p.reject(new Error(ev.data.message || "Transcription failed."));
      else p.resolve(ev.data);
    };
    worker.onerror = () => {
      failAll("The dictation engine failed to start. Reload the app and try again.");
      try {
        worker.terminate();
      } catch (_) {
      }
      worker = null;
    };
    return worker;
  };
  const call = (msg, transfer, onProgress) => new Promise((resolve, reject) => {
    const id = ++seq;
    pending.set(id, { resolve, reject, onProgress, files: /* @__PURE__ */ new Map() });
    ensureWorker().postMessage({ id, ...msg }, transfer || []);
  });
  return {
    id: STT_PROVIDERS.whisper.id,
    label: STT_PROVIDERS.whisper.label,
    disclosure: STT_PROVIDERS.whisper.disclosure,
    isAvailable: whisperSupported,
    // Download + build the pipeline (one-time ~68 MB, then SW-cached).
    // onProgress({ pct, file, status }) ticks through the model files.
    preload({ onProgress } = {}) {
      return call({ type: "preload" }, [], onProgress).then(() => void 0);
    },
    // Blob (recorded audio) or ready Float32Array (16 kHz mono) → final text.
    async transcribe(input, { onProgress } = {}) {
      const myEpoch = epoch;
      let audio = input;
      if (typeof Blob !== "undefined" && input instanceof Blob) {
        audio = await decodeTo16kMono(await input.arrayBuffer());
      }
      if (myEpoch !== epoch) throw new Error("Dictation was cancelled.");
      if (!(audio instanceof Float32Array)) throw new Error("transcribe: expected a Blob or Float32Array");
      const r = await call({ type: "transcribe", audio }, [audio.buffer], onProgress);
      return r.text || "";
    },
    // Hard cancel: reject everything pending AND terminate the worker. postMessage
    // can't interrupt an in-flight asr() — only termination can — and leaving it
    // running risks a SECOND concurrent asr() on the same pipeline when the user
    // starts again (ONNX session reentrancy is unproven). The next preload/
    // transcribe spawns a fresh worker; the model reloads from the SW cache.
    // Bumping `epoch` also aborts any transcribe still in its pre-worker decode
    // phase (see transcribe()), so decode can't spawn a worker after this returns.
    cancel() {
      epoch++;
      failAll("Dictation was cancelled.");
      if (worker) {
        try {
          worker.terminate();
        } catch (_) {
        }
        worker = null;
      }
    }
  };
}
export {
  STT_ENGINE_KEY,
  STT_MAX_RECORD_MS,
  STT_PROVIDERS,
  appendDictation,
  createWhisperProvider,
  decodeTo16kMono,
  resolveSttProvider,
  sttNext,
  whisperSupported
};
