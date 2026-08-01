// studio-app/stt-worker.src.js
var STT_BASE = new URL("./", self.location.href).pathname;
var STT_VENDOR_PATH = STT_BASE + "vendor/stt/";
var STT_MODEL_PATH = STT_BASE + "models/";
var STT_MODEL_PRIMARY = "onnx-community/whisper-tiny.en";
var STT_MODEL_FALLBACK = "Xenova/whisper-tiny.en";
var _asrLoading = null;
var _inflight = /* @__PURE__ */ new Map();
var _rawFetch = self.fetch.bind(self);
self.fetch = (input, init) => {
  const url = typeof input === "string" ? input : input && input.url || "";
  if (!url.includes(STT_MODEL_PATH) && !url.includes(STT_VENDOR_PATH)) return _rawFetch(input, init);
  if (!_inflight.has(url)) {
    _inflight.set(url, _rawFetch(input, init).then(async (r) => ({
      buf: await r.arrayBuffer(),
      status: r.status,
      statusText: r.statusText,
      headers: r.headers
    })).catch((e) => {
      _inflight.delete(url);
      throw e;
    }));
  }
  return _inflight.get(url).then(({ buf, status, statusText, headers }) => new Response(buf, { status, statusText, headers }));
};
async function loadPipeline(post) {
  const { pipeline, env } = await import(
    /* staged, never bundled */
    STT_VENDOR_PATH + "transformers.min.js"
  );
  env.allowRemoteModels = false;
  env.allowLocalModels = true;
  env.localModelPath = STT_MODEL_PATH;
  env.useBrowserCache = false;
  env.backends.onnx.wasm.wasmPaths = STT_VENDOR_PATH;
  env.backends.onnx.wasm.numThreads = 1;
  const opts = {
    dtype: "q8",
    device: "wasm",
    session_options: { graphOptimizationLevel: "basic" },
    // REQUIRED (see header)
    progress_callback: (p) => {
      if (p && p.file) post({ type: "progress", status: p.status || "", file: p.file, loaded: p.loaded || 0, total: p.total || 0 });
    }
  };
  try {
    return await pipeline("automatic-speech-recognition", STT_MODEL_PRIMARY, opts);
  } catch (primaryErr) {
    try {
      return await pipeline("automatic-speech-recognition", STT_MODEL_FALLBACK, opts);
    } catch (_fallbackErr) {
      throw primaryErr;
    }
  }
}
function ensureAsr(post) {
  if (!_asrLoading) {
    _asrLoading = loadPipeline(post).then((asr) => {
      _inflight.clear();
      return asr;
    }).catch((e) => {
      _inflight.clear();
      _asrLoading = null;
      throw e;
    });
  }
  return _asrLoading;
}
function friendly(e) {
  const raw = String(e && e.message || e || "unknown error");
  if (/fetch|network|404|Failed to load|not found/i.test(raw)) {
    return "The dictation model could not be loaded. Check your connection and try again.";
  }
  if (/memory|allocat/i.test(raw)) {
    return "The device ran out of memory while transcribing. Try a shorter recording.";
  }
  return "Transcription failed on this device. Try again.";
}
self.onmessage = async (ev) => {
  const { id, type, audio } = ev.data || {};
  const post = (m) => self.postMessage({ id, ...m });
  try {
    if (type === "preload") {
      await ensureAsr(post);
      post({ type: "ready" });
      return;
    }
    if (type === "transcribe") {
      if (!(audio instanceof Float32Array)) throw new Error("transcribe: expected Float32Array audio");
      const asr = await ensureAsr(post);
      const out = await asr(audio, { chunk_length_s: 30, stride_length_s: 5, return_timestamps: true });
      post({ type: "result", text: (out && out.text ? String(out.text) : "").trim() });
      return;
    }
    post({ type: "error", message: "Unknown dictation request.", detail: `unknown message type: ${type}` });
  } catch (e) {
    post({ type: "error", message: friendly(e), detail: String(e && e.message || e) });
  }
};
