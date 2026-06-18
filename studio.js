var __defProp = Object.defineProperty;
var __export = (target, all3) => {
  for (var name in all3)
    __defProp(target, name, { get: all3[name], enumerable: true });
};

// studio-app/seams/config.js
var KEY = "helm.studio.config.v1";
var trimSlash = (u) => (u || "").trim().replace(/\/+$/, "");
function makeConfig(ls) {
  const read = () => {
    try {
      return JSON.parse(ls.getItem(KEY)) || {};
    } catch {
      return {};
    }
  };
  return {
    all: read,
    save(patch) {
      const c = { ...read(), ...patch };
      ls.setItem(KEY, JSON.stringify(c));
      return c;
    },
    clear() {
      ls.removeItem(KEY);
    },
    getGithub() {
      const c = read();
      return { owner: c.ghOwner || "", repo: c.ghRepo || "", branch: c.ghBranch || "main", token: c.ghToken || "" };
    },
    getAi() {
      const c = read();
      return { provider: c.aiProvider || "anthropic", key: c.aiKey || "", model: c.aiModel || "" };
    },
    isConfigured() {
      const g = this.getGithub(), a = this.getAi();
      return !!(g.owner && g.repo && g.token && a.key);
    },
    // --- remote-Helm mode (phone access to the laptop's local state) ---
    // Stored under a distinct mode flag so it can't be confused with BYOK keys.
    getRemoteHelm() {
      const c = read();
      return { baseUrl: trimSlash(c.helmBaseUrl), token: c.helmToken || "" };
    },
    // True only when the user has explicitly chosen remote mode AND given a url+token.
    isRemoteHelm() {
      const c = read();
      const r = this.getRemoteHelm();
      return c.mode === "remote" && !!(r.baseUrl && r.token);
    },
    saveRemoteHelm({ baseUrl, token }) {
      return this.save({ mode: "remote", helmBaseUrl: trimSlash(baseUrl), helmToken: (token || "").trim() });
    },
    // Switch back to local/BYOK without wiping the saved tunnel details.
    useLocal() {
      return this.save({ mode: "byok" });
    },
    // Either mode counts as "ready to boot".
    isReady() {
      return this.isRemoteHelm() || this.isConfigured();
    }
  };
}
var noopLS = { getItem: () => null, setItem() {
}, removeItem() {
} };
var config = makeConfig(typeof window !== "undefined" && window.localStorage ? window.localStorage : noopLS);

// studio-app/seams/github.js
var API = "https://api.github.com";
var enc = (p) => String(p).split("/").map(encodeURIComponent).join("/");
var toB64 = (s) => {
  const bytes = new TextEncoder().encode(s);
  if (typeof btoa !== "undefined") {
    let bin = "";
    bytes.forEach((c) => bin += String.fromCharCode(c));
    return btoa(bin);
  }
  return Buffer.from(bytes).toString("base64");
};
var fromB64 = (b64) => {
  const clean = String(b64 || "").replace(/\s/g, "");
  const bin = typeof atob !== "undefined" ? atob(clean) : Buffer.from(clean, "base64").toString("binary");
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
};
function makeGithub(gh, fetchImpl = fetch) {
  const headers4 = () => ({ Authorization: `Bearer ${gh.token}`, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" });
  const repoBase = `${API}/repos/${gh.owner}/${gh.repo}`;
  const base = `${repoBase}/contents`;
  async function err(res) {
    let m = `GitHub ${res.status}`;
    try {
      const j = await res.json();
      m = j.message || m;
    } catch {
    }
    return Object.assign(new Error(m), { status: res.status });
  }
  async function gj(url, opts) {
    const res = await fetchImpl(url, { ...opts, headers: headers4() });
    if (!res.ok) throw await err(res);
    return res.json();
  }
  return {
    async getFile(path3) {
      const res = await fetchImpl(`${base}/${enc(path3)}?ref=${gh.branch}`, { headers: headers4() });
      if (res.status === 404) return null;
      if (!res.ok) throw await err(res);
      const j = await res.json();
      return { sha: j.sha, content: fromB64(j.content) };
    },
    async putFile(path3, content, message, sha) {
      const res = await fetchImpl(`${base}/${enc(path3)}`, {
        method: "PUT",
        headers: headers4(),
        body: JSON.stringify({ message, content: toB64(content), branch: gh.branch, ...sha ? { sha } : {} })
      });
      if (!res.ok) throw await err(res);
      return { commit: (await res.json()).commit?.sha };
    },
    async putBinaryB64(path3, b64, message, sha) {
      const res = await fetchImpl(`${base}/${enc(path3)}`, {
        method: "PUT",
        headers: headers4(),
        body: JSON.stringify({ message, content: String(b64).replace(/\s/g, ""), branch: gh.branch, ...sha ? { sha } : {} })
      });
      if (!res.ok) throw await err(res);
      return { commit: (await res.json()).commit?.sha };
    },
    async deleteFile(path3, message, sha) {
      const res = await fetchImpl(`${base}/${enc(path3)}`, {
        method: "DELETE",
        headers: headers4(),
        body: JSON.stringify({ message, branch: gh.branch, sha })
      });
      if (!res.ok) throw await err(res);
      return true;
    },
    async listDir(path3) {
      const res = await fetchImpl(`${base}/${enc(path3)}?ref=${gh.branch}`, { headers: headers4() });
      if (res.status === 404) return [];
      if (!res.ok) throw await err(res);
      const j = await res.json();
      return Array.isArray(j) ? j.map((e) => ({ name: e.name, path: e.path, sha: e.sha, type: e.type })) : [];
    },
    async getBinary(path3) {
      const res = await fetchImpl(`${base}/${enc(path3)}?ref=${gh.branch}`, { headers: headers4() });
      if (res.status === 404) return null;
      if (!res.ok) throw await err(res);
      const j = await res.json();
      return { base64: (j.content || "").replace(/\s/g, ""), sha: j.sha };
    },
    // List every committed file under a directory prefix in ONE recursive git-trees call.
    // Filters the tree to blobs under `prefix`. Returns [{ path, size }]. Empty if absent.
    async listTree(prefix) {
      const ref = await gj(`${repoBase}/git/ref/heads/${gh.branch}`);
      const treeSha = ref && ref.object && ref.object.sha;
      if (!treeSha) return [];
      const tree = await gj(`${repoBase}/git/trees/${treeSha}?recursive=1`);
      if (!tree || !Array.isArray(tree.tree)) return [];
      const pfx = String(prefix || "").replace(/\/+$/, "") + "/";
      return tree.tree.filter((e) => e.type === "blob" && e.path.startsWith(pfx)).map((e) => ({ path: e.path, size: e.size || 0 }));
    },
    // atomic multi-file commit via the Git Data API.
    // changes: [{ path, content?:string, base64?:string, delete?:true }]
    async commitMany(changes, message) {
      const ref = await gj(`${repoBase}/git/ref/heads/${gh.branch}`);
      const baseCommitSha = ref.object.sha;
      const baseCommit = await gj(`${repoBase}/git/commits/${baseCommitSha}`);
      const tree = [];
      for (const c of changes) {
        if (c.delete) {
          tree.push({ path: c.path, mode: "100644", type: "blob", sha: null });
          continue;
        }
        const enc2 = c.base64 != null ? "base64" : "utf-8";
        const content = c.base64 != null ? String(c.base64).replace(/\s/g, "") : c.content;
        const blob = await gj(`${repoBase}/git/blobs`, { method: "POST", body: JSON.stringify({ content, encoding: enc2 }) });
        tree.push({ path: c.path, mode: "100644", type: "blob", sha: blob.sha });
      }
      const newTree = await gj(`${repoBase}/git/trees`, { method: "POST", body: JSON.stringify({ base_tree: baseCommit.tree.sha, tree }) });
      const newCommit = await gj(`${repoBase}/git/commits`, { method: "POST", body: JSON.stringify({ message, tree: newTree.sha, parents: [baseCommitSha] }) });
      await gj(`${repoBase}/git/refs/heads/${gh.branch}`, { method: "PATCH", body: JSON.stringify({ sha: newCommit.sha }) });
      return { commit: newCommit.sha };
    }
  };
}

// server/ai/anthropic.js
var anthropic_exports = {};
__export(anthropic_exports, {
  DEFAULT_MODEL: () => DEFAULT_MODEL,
  buildText: () => buildText,
  buildVision: () => buildVision,
  capabilities: () => capabilities,
  describeImage: () => describeImage,
  generateImage: () => generateImage,
  generateText: () => generateText,
  listModels: () => listModels,
  parseModels: () => parseModels,
  parseText: () => parseText,
  readDocument: () => readDocument
});

// server/ai/_json.js
function looseJson(text2) {
  let s = String(text2 == null ? "" : text2).trim();
  try {
    return JSON.parse(s);
  } catch {
  }
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) {
    try {
      return JSON.parse(fence[1].trim());
    } catch {
      s = fence[1].trim();
    }
  }
  const start = s.search(/[{[]/);
  if (start >= 0) {
    const open = s[start], close = open === "{" ? "}" : "]";
    let depth = 0, inStr = false, esc2 = false;
    for (let i = start; i < s.length; i++) {
      const c = s[i];
      if (inStr) {
        if (esc2) esc2 = false;
        else if (c === "\\") esc2 = true;
        else if (c === '"') inStr = false;
        continue;
      }
      if (c === '"') inStr = true;
      else if (c === open) depth++;
      else if (c === close && --depth === 0) return JSON.parse(s.slice(start, i + 1));
    }
  }
  throw new Error("no parseable JSON in model output");
}

// server/ai/anthropic.js
var capabilities = { text: true, vision: true, document: true, image: false };
var DEFAULT_MODEL = "claude-opus-4-8";
var ENDPOINT = "https://api.anthropic.com/v1/messages";
var headers = (key) => ({
  "content-type": "application/json",
  "x-api-key": key,
  "anthropic-version": "2023-06-01"
});
function thinkingFor(model, effort) {
  const out = {};
  const isFable = /^claude-(fable|mythos)-/.test(model);
  if (effort) out.output_config = { effort };
  if (!isFable && effort) out.thinking = { type: "adaptive" };
  return out;
}
function buildText({ system, prompt, maxTokens, model, key, json, effort }) {
  const body = {
    model: model || DEFAULT_MODEL,
    max_tokens: maxTokens ?? 4e3,
    ...system ? { system } : {},
    messages: [{ role: "user", content: prompt }],
    ...thinkingFor(model || DEFAULT_MODEL, effort)
  };
  if (json) body.output_config = { ...body.output_config || {}, format: { type: "json_schema", schema: json } };
  return { url: ENDPOINT, headers: headers(key), body: JSON.stringify(body) };
}
function buildVision({ system, prompt, imageBase64, mimeType, maxTokens, model, key }) {
  const body = {
    model: model || DEFAULT_MODEL,
    max_tokens: maxTokens ?? 300,
    ...system ? { system } : {},
    messages: [{ role: "user", content: [
      { type: "image", source: { type: "base64", media_type: mimeType || "image/jpeg", data: imageBase64 } },
      { type: "text", text: prompt }
    ] }]
  };
  return { url: ENDPOINT, headers: headers(key), body: JSON.stringify(body) };
}
function parseText(json) {
  if (json?.stop_reason === "refusal") throw Object.assign(new Error("Anthropic declined this request (refusal)."), { code: "AI_REFUSAL" });
  const text2 = (json?.content || []).filter((b) => b.type === "text").map((b) => b.text || "").join("").trim();
  if (json?.stop_reason === "max_tokens") return text2;
  return text2;
}
async function call(built, fetchImpl = fetch) {
  const res = await fetchImpl(built.url, { method: "POST", headers: built.headers, body: built.body });
  const raw = await res.text();
  let json = null;
  try {
    json = raw ? JSON.parse(raw) : {};
  } catch {
  }
  if (!res.ok) throw Object.assign(new Error(json?.error?.message || `Anthropic API ${res.status}`), { code: "AI_HTTP", status: res.status });
  if (json === null) throw Object.assign(new Error(`Anthropic returned a non-JSON response (HTTP ${res.status}).`), { code: "AI_HTTP", status: res.status });
  return json;
}
async function readDocument({ system, instruction, fileBase64, mimeType, json, model, key, baseUrl }, fetchImpl = fetch) {
  const isPdf = mimeType === "application/pdf";
  const docBlock = isPdf ? { type: "document", source: { type: "base64", media_type: "application/pdf", data: fileBase64 } } : { type: "image", source: { type: "base64", media_type: mimeType, data: fileBase64 } };
  const body = {
    model: model || DEFAULT_MODEL,
    max_tokens: 4e3,
    ...system ? { system } : {},
    messages: [{ role: "user", content: [docBlock, { type: "text", text: instruction }] }]
  };
  if (json) body.output_config = { format: { type: "json_schema", schema: json } };
  const built = { url: ENDPOINT, headers: headers(key), body: JSON.stringify(body) };
  const raw_json = await call(built, fetchImpl);
  const text2 = parseText(raw_json);
  if (!json) return { text: text2 };
  try {
    return { text: text2, json: looseJson(text2) };
  } catch {
    throw Object.assign(new Error(`AI returned non-JSON output: ${text2.slice(0, 120)}`), { code: "AI_PARSE", text: text2 });
  }
}
async function generateImage(_opts, _fetchImpl = fetch) {
  throw Object.assign(new Error("Anthropic does not generate images"), { code: "AI_CAP", status: 400 });
}
function buildTextPromptJson(opts) {
  const hint = `

Return ONLY a JSON object conforming to this JSON Schema \u2014 no prose, no markdown fences:
${JSON.stringify(opts.json)}`;
  return buildText({ ...opts, json: void 0, prompt: `${opts.prompt || ""}${hint}` });
}
async function generateText(opts, fetchImpl) {
  if (!opts.json) return { text: parseText(await call(buildText(opts), fetchImpl)) };
  let nativeText = null;
  try {
    nativeText = parseText(await call(buildText(opts), fetchImpl));
  } catch (e) {
    if (e.status !== 400) throw e;
  }
  if (nativeText != null) {
    try {
      return { text: nativeText, json: looseJson(nativeText) };
    } catch {
    }
  }
  const text2 = parseText(await call(buildTextPromptJson(opts), fetchImpl));
  try {
    return { text: text2, json: looseJson(text2) };
  } catch {
    throw Object.assign(new Error(`AI returned non-JSON output: ${text2.slice(0, 120)}`), { code: "AI_PARSE", text: text2 });
  }
}
async function describeImage(opts, fetchImpl) {
  return { text: parseText(await call(buildVision(opts), fetchImpl)) };
}
function parseModels(json) {
  return [...new Set((json.data || []).map((m) => m.id).filter(Boolean))].sort();
}
async function listModels({ key, baseUrl } = {}, fetchImpl = fetch) {
  const url = "https://api.anthropic.com/v1/models";
  const hdrs = { "x-api-key": key, "anthropic-version": "2023-06-01" };
  const res = await fetchImpl(url, { method: "GET", headers: hdrs });
  const raw = await res.text();
  let json = null;
  try {
    json = raw ? JSON.parse(raw) : {};
  } catch {
  }
  if (!res.ok) throw Object.assign(new Error(json?.error?.message || `Anthropic API ${res.status}`), { code: "AI_HTTP", status: res.status });
  if (json === null) throw Object.assign(new Error(`Anthropic returned a non-JSON response (HTTP ${res.status}).`), { code: "AI_HTTP", status: res.status });
  return parseModels(json);
}

// server/ai/openai.js
var openai_exports = {};
__export(openai_exports, {
  DEFAULT_MODEL: () => DEFAULT_MODEL2,
  buildText: () => buildText2,
  buildVision: () => buildVision2,
  capabilities: () => capabilities2,
  describeImage: () => describeImage2,
  generateImage: () => generateImage2,
  generateText: () => generateText2,
  listModels: () => listModels2,
  parseModels: () => parseModels2,
  parseText: () => parseText2,
  readDocument: () => readDocument2
});
var capabilities2 = { text: true, vision: true, document: false, image: true };
var DEFAULT_MODEL2 = "gpt-4o";
var ENDPOINT2 = "https://api.openai.com/v1/chat/completions";
var headers2 = (key) => ({
  "content-type": "application/json",
  "Authorization": "Bearer " + key
});
function buildText2({ system, prompt, maxTokens, model, key, json, baseUrl }) {
  const body = {
    model: model || DEFAULT_MODEL2,
    messages: [
      ...system ? [{ role: "system", content: system }] : [],
      { role: "user", content: prompt }
    ],
    max_tokens: maxTokens ?? 4e3
  };
  if (json) body.response_format = { type: "json_schema", json_schema: { name: "helm_output", schema: json, strict: true } };
  return { url: ENDPOINT2, headers: headers2(key), body: JSON.stringify(body) };
}
function buildVision2({ system, prompt, imageBase64, mimeType, maxTokens, model, key, baseUrl }) {
  const body = {
    model: model || DEFAULT_MODEL2,
    messages: [
      ...system ? [{ role: "system", content: system }] : [],
      { role: "user", content: [
        { type: "text", text: prompt },
        { type: "image_url", image_url: { url: "data:" + (mimeType || "image/jpeg") + ";base64," + imageBase64 } }
      ] }
    ],
    max_tokens: maxTokens ?? 300
  };
  return { url: ENDPOINT2, headers: headers2(key), body: JSON.stringify(body) };
}
function parseText2(json) {
  if (json?.choices?.[0]?.finish_reason === "content_filter") throw Object.assign(new Error("OpenAI declined this request (content_filter)."), { code: "AI_REFUSAL" });
  return (json?.choices?.[0]?.message?.content || "").trim();
}
async function call2(built, fetchImpl = fetch) {
  const res = await fetchImpl(built.url, { method: "POST", headers: built.headers, body: built.body });
  const raw = await res.text();
  let json = null;
  try {
    json = raw ? JSON.parse(raw) : {};
  } catch {
  }
  if (!res.ok) throw Object.assign(new Error(json?.error?.message || `OpenAI API ${res.status}`), { code: "AI_HTTP", status: res.status });
  if (json === null) throw Object.assign(new Error(`OpenAI returned a non-JSON response (HTTP ${res.status}).`), { code: "AI_HTTP", status: res.status });
  return json;
}
async function readDocument2({ system, instruction, fileBase64, mimeType, json, model, key, baseUrl }, fetchImpl = fetch) {
  if (mimeType === "application/pdf") {
    throw Object.assign(new Error("OpenAI cannot read PDFs here"), { code: "AI_CAP", status: 400 });
  }
  const body = {
    model: model || DEFAULT_MODEL2,
    messages: [
      ...system ? [{ role: "system", content: system }] : [],
      { role: "user", content: [
        { type: "text", text: instruction },
        { type: "image_url", image_url: { url: "data:" + mimeType + ";base64," + fileBase64 } }
      ] }
    ],
    max_tokens: 4e3
  };
  if (json) body.response_format = { type: "json_schema", json_schema: { name: "helm_output", schema: json, strict: true } };
  const built = { url: ENDPOINT2, headers: headers2(key), body: JSON.stringify(body) };
  const raw_json = await call2(built, fetchImpl);
  const text2 = parseText2(raw_json);
  if (!json) return { text: text2 };
  try {
    return { text: text2, json: looseJson(text2) };
  } catch {
    throw Object.assign(new Error(`AI returned non-JSON output: ${text2.slice(0, 120)}`), { code: "AI_PARSE", text: text2 });
  }
}
var IMAGE_SIZES = /* @__PURE__ */ new Set(["1024x1024", "1536x1024", "1024x1536", "auto"]);
async function generateImage2({ prompt, size, model, key, baseUrl }, fetchImpl = fetch) {
  const url = "https://api.openai.com/v1/images/generations";
  const body = {
    model: model || "gpt-image-1",
    prompt,
    size: IMAGE_SIZES.has(size) ? size : "1024x1024",
    n: 1
  };
  const built = { url, headers: headers2(key), body: JSON.stringify(body) };
  const json = await call2(built, fetchImpl);
  const item = json?.data?.[0];
  if (item?.b64_json) return { base64: item.b64_json, mimeType: "image/png" };
  if (item?.url) return { url: item.url };
  throw Object.assign(new Error("OpenAI image response had no b64_json or url"), { code: "AI_PARSE" });
}
async function generateText2(opts, fetchImpl) {
  const json = await call2(buildText2(opts), fetchImpl);
  const text2 = parseText2(json);
  if (!opts.json) return { text: text2 };
  try {
    return { text: text2, json: looseJson(text2) };
  } catch {
    throw Object.assign(new Error(`AI returned non-JSON output: ${text2.slice(0, 120)}`), { code: "AI_PARSE", text: text2 });
  }
}
async function describeImage2(opts, fetchImpl) {
  return { text: parseText2(await call2(buildVision2(opts), fetchImpl)) };
}
function parseModels2(json) {
  return [...new Set((json.data || []).map((m) => m.id).filter(Boolean))].sort();
}
async function listModels2({ key, baseUrl } = {}, fetchImpl = fetch) {
  const url = "https://api.openai.com/v1/models";
  const hdrs = { "Authorization": "Bearer " + key };
  const res = await fetchImpl(url, { method: "GET", headers: hdrs });
  const raw = await res.text();
  let json = null;
  try {
    json = raw ? JSON.parse(raw) : {};
  } catch {
  }
  if (!res.ok) throw Object.assign(new Error(json?.error?.message || `OpenAI API ${res.status}`), { code: "AI_HTTP", status: res.status });
  if (json === null) throw Object.assign(new Error(`OpenAI returned a non-JSON response (HTTP ${res.status}).`), { code: "AI_HTTP", status: res.status });
  return parseModels2(json);
}

// server/ai/google.js
var google_exports = {};
__export(google_exports, {
  DEFAULT_MODEL: () => DEFAULT_MODEL3,
  buildText: () => buildText3,
  buildVision: () => buildVision3,
  capabilities: () => capabilities3,
  describeImage: () => describeImage3,
  generateImage: () => generateImage3,
  generateText: () => generateText3,
  listModels: () => listModels3,
  parseModels: () => parseModels3,
  parseText: () => parseText3,
  readDocument: () => readDocument3
});
var capabilities3 = { text: true, vision: true, document: true, image: true };
var DEFAULT_MODEL3 = "gemini-flash-latest";
var BASE = "https://generativelanguage.googleapis.com/v1beta/models";
var headers3 = () => ({ "content-type": "application/json" });
function stripAdditionalProps(schema) {
  if (!schema || typeof schema !== "object") return schema;
  if (Array.isArray(schema)) return schema.map(stripAdditionalProps);
  const out = {};
  for (const [k, v] of Object.entries(schema)) {
    if (k === "additionalProperties") continue;
    out[k] = stripAdditionalProps(v);
  }
  return out;
}
function buildText3({ system, prompt, maxTokens, model, key, json, baseUrl }) {
  const url = `${BASE}/${model || DEFAULT_MODEL3}:generateContent?key=${key}`;
  const body = {
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    ...system ? { systemInstruction: { parts: [{ text: system }] } } : {},
    generationConfig: {
      maxOutputTokens: maxTokens ?? 4e3,
      ...json ? { responseMimeType: "application/json", responseSchema: stripAdditionalProps(json) } : {}
    }
  };
  return { url, headers: headers3(), body: JSON.stringify(body) };
}
function buildVision3({ system, prompt, imageBase64, mimeType, maxTokens, model, key, baseUrl }) {
  const url = `${BASE}/${model || DEFAULT_MODEL3}:generateContent?key=${key}`;
  const body = {
    contents: [{ role: "user", parts: [
      { inlineData: { mimeType: mimeType || "image/jpeg", data: imageBase64 } },
      { text: prompt }
    ] }],
    generationConfig: { maxOutputTokens: maxTokens ?? 300 }
  };
  return { url, headers: headers3(), body: JSON.stringify(body) };
}
function parseText3(json) {
  const reason = json?.candidates?.[0]?.finishReason;
  if (reason && reason !== "STOP" && reason !== "MAX_TOKENS") {
    throw Object.assign(new Error(`Gemini declined this request (${reason}).`), { code: "AI_REFUSAL" });
  }
  return (json?.candidates?.[0]?.content?.parts || []).map((p) => p.text || "").join("").trim();
}
async function call3(built, fetchImpl = fetch) {
  const res = await fetchImpl(built.url, { method: "POST", headers: built.headers, body: built.body });
  const raw = await res.text();
  let json = null;
  try {
    json = raw ? JSON.parse(raw) : {};
  } catch {
  }
  if (!res.ok) throw Object.assign(new Error(json?.error?.message || `Gemini API ${res.status}`), { code: "AI_HTTP", status: res.status });
  if (json === null) throw Object.assign(new Error(`Gemini returned a non-JSON response (HTTP ${res.status}).`), { code: "AI_HTTP", status: res.status });
  return json;
}
async function readDocument3({ system, instruction, fileBase64, mimeType, json, model, key, baseUrl }, fetchImpl = fetch) {
  const url = `${BASE}/${model || DEFAULT_MODEL3}:generateContent?key=${key}`;
  const body = {
    contents: [{ role: "user", parts: [
      { inlineData: { mimeType, data: fileBase64 } },
      { text: instruction }
    ] }],
    ...system ? { systemInstruction: { parts: [{ text: system }] } } : {},
    generationConfig: {
      maxOutputTokens: 4e3,
      ...json ? { responseMimeType: "application/json", responseSchema: stripAdditionalProps(json) } : {}
    }
  };
  const built = { url, headers: headers3(), body: JSON.stringify(body) };
  const raw_json = await call3(built, fetchImpl);
  const text2 = parseText3(raw_json);
  if (!json) return { text: text2 };
  try {
    return { text: text2, json: looseJson(text2) };
  } catch {
    throw Object.assign(new Error(`AI returned non-JSON output: ${text2.slice(0, 120)}`), { code: "AI_PARSE", text: text2 });
  }
}
async function generateImage3({ prompt, size, model, key, baseUrl }, fetchImpl = fetch) {
  const imageModel = model || "imagen-3.0-generate-002";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${imageModel}:predict?key=${key}`;
  const body = { instances: [{ prompt }], parameters: { sampleCount: 1 } };
  const built = { url, headers: headers3(), body: JSON.stringify(body) };
  const json = await call3(built, fetchImpl);
  const b64 = json?.predictions?.[0]?.bytesBase64Encoded;
  if (!b64) throw Object.assign(new Error("Google Imagen response had no bytesBase64Encoded"), { code: "AI_PARSE" });
  return { base64: b64, mimeType: "image/png" };
}
async function generateText3(opts, fetchImpl) {
  const json = await call3(buildText3(opts), fetchImpl);
  const text2 = parseText3(json);
  if (!opts.json) return { text: text2 };
  try {
    return { text: text2, json: looseJson(text2) };
  } catch {
    throw Object.assign(new Error(`AI returned non-JSON output: ${text2.slice(0, 120)}`), { code: "AI_PARSE", text: text2 });
  }
}
async function describeImage3(opts, fetchImpl) {
  return { text: parseText3(await call3(buildVision3(opts), fetchImpl)) };
}
function parseModels3(json) {
  return [...new Set(
    (json.models || []).filter((m) => (m.supportedGenerationMethods || []).includes("generateContent")).map((m) => (m.name || "").replace(/^models\//, "")).filter(Boolean)
  )].sort();
}
async function listModels3({ key, baseUrl } = {}, fetchImpl = fetch) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${key}&pageSize=200`;
  const res = await fetchImpl(url, { method: "GET", headers: { "content-type": "application/json" } });
  const raw = await res.text();
  let json = null;
  try {
    json = raw ? JSON.parse(raw) : {};
  } catch {
  }
  if (!res.ok) throw Object.assign(new Error(json?.error?.message || `Gemini API ${res.status}`), { code: "AI_HTTP", status: res.status });
  if (json === null) throw Object.assign(new Error(`Gemini returned a non-JSON response (HTTP ${res.status}).`), { code: "AI_HTTP", status: res.status });
  return parseModels3(json);
}

// studio-app/seams/ai.js
var ADAPTERS = { anthropic: anthropic_exports, openai: openai_exports, google: google_exports };
function makeAi(cfg, fetchImpl = fetch) {
  const browserFetch = (url, opts = {}) => {
    const headers4 = { ...opts.headers || {} };
    if (String(url).includes("api.anthropic.com")) headers4["anthropic-dangerous-direct-browser-access"] = "true";
    return fetchImpl(url, { ...opts, headers: headers4 });
  };
  const pick = () => {
    const a = cfg.getAi();
    return { adapter: ADAPTERS[a.provider] || anthropic_exports, a };
  };
  return {
    async generateText({ system, prompt, maxTokens, json, effort }) {
      const { adapter, a } = pick();
      return adapter.generateText({ system, prompt, maxTokens, json, effort, model: a.model || adapter.DEFAULT_MODEL, key: a.key }, browserFetch);
    },
    async describeImage({ prompt, imageBase64, mimeType, maxTokens }) {
      const { adapter, a } = pick();
      if (!adapter.capabilities?.vision) throw Object.assign(new Error(`${a.provider} cannot read images`), { code: "AI_CAP" });
      return adapter.describeImage({ prompt, imageBase64, mimeType, maxTokens, model: a.model || adapter.DEFAULT_MODEL, key: a.key }, browserFetch);
    },
    async generateImage({ prompt, size }) {
      const { adapter, a } = pick();
      if (!adapter.capabilities?.image) throw Object.assign(new Error(`${a.provider} cannot generate images`), { code: "AI_CAP" });
      return adapter.generateImage({ prompt, size, model: a.model || adapter.DEFAULT_MODEL, key: a.key }, browserFetch);
    }
  };
}

// studio-app/seams/remote.js
var join = (base, path3) => `${base}/studio/api${path3.startsWith("/") ? "" : "/"}${path3}`;
function makeRemote(getRemoteHelm, fetchImpl) {
  const f = fetchImpl || (typeof fetch !== "undefined" ? fetch.bind(globalThis) : null);
  async function request(path3, opts = {}) {
    const { baseUrl, token } = getRemoteHelm();
    if (!baseUrl || !token) {
      const e = new Error("Remote Helm not configured");
      e.status = 0;
      throw e;
    }
    if (!f) {
      const e = new Error("fetch unavailable");
      e.status = 0;
      throw e;
    }
    let r;
    try {
      r = await f(join(baseUrl, path3), {
        ...opts,
        headers: { "Content-Type": "application/json", ...opts.headers || {}, "X-Admin-Token": token }
      });
    } catch (err) {
      const e = new Error(err && err.message ? err.message : "Network error");
      e.status = 0;
      e.cause = err;
      throw e;
    }
    const j = await r.json().catch(() => ({}));
    if (!r.ok) {
      const e = new Error(j && j.error || `HTTP ${r.status}`);
      e.status = r.status;
      e.payload = j;
      throw e;
    }
    return j;
  }
  async function test() {
    try {
      await request("/posts", { method: "GET" });
      return { ok: true };
    } catch (e) {
      if (e.status === 401) return { ok: false, reason: "auth", message: "Admin token rejected \u2014 check the token." };
      if (e.status === 0) return { ok: false, reason: "network", message: "Could not reach that URL \u2014 is Helm running and the tunnel up? (CORS/offline)" };
      return { ok: false, reason: "server", message: e.message || "Connection failed." };
    }
  }
  return { request, test };
}

// studio-app/seams/storage.js
var STORES = ["drafts", "blockdrafts", "partner", "shapes", "versions", "ideas"];
function memoryBackend() {
  const db = Object.fromEntries(STORES.map((s) => [s, /* @__PURE__ */ new Map()]));
  return {
    async get(store, id) {
      return db[store].get(id) || null;
    },
    async put(store, obj) {
      db[store].set(obj.id, obj);
      return obj;
    },
    async all(store) {
      return [...db[store].values()];
    },
    async del(store, id) {
      db[store].delete(id);
    }
  };
}
function idbBackend(name = "helm-studio") {
  const open = () => new Promise((res, rej) => {
    const r = indexedDB.open(name, 4);
    r.onupgradeneeded = () => {
      const d = r.result;
      for (const s of STORES) if (!d.objectStoreNames.contains(s)) d.createObjectStore(s, { keyPath: "id" });
    };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
  const tx = async (store, mode, fn) => {
    const d = await open();
    return new Promise((res, rej) => {
      const t = d.transaction(store, mode), os = t.objectStore(store), rq = fn(os);
      t.oncomplete = () => res(rq && rq.result);
      t.onerror = () => rej(t.error);
    });
  };
  return {
    get: (store, id) => tx(store, "readonly", (os) => os.get(id)).then((v) => v || null),
    put: (store, obj) => tx(store, "readwrite", (os) => os.put(obj)).then(() => obj),
    all: (store) => tx(store, "readonly", (os) => os.getAll()),
    del: (store, id) => tx(store, "readwrite", (os) => os.delete(id))
  };
}
function makeStorage(backend) {
  return backend;
}
var storage = makeStorage(typeof indexedDB !== "undefined" ? idbBackend() : memoryBackend());

// server/frontmatter.js
var GALLERY_START = "<!-- gallery:start -->";
var GALLERY_END = "<!-- gallery:end -->";
function parse(md) {
  const m = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/.exec(md);
  if (!m) return { data: {}, body: md };
  const data = {};
  for (const line3 of m[1].split("\n")) {
    const mm = /^(\w+):\s*(.*)$/.exec(line3);
    if (!mm) continue;
    const key = mm[1];
    const val = mm[2].trim();
    if (key === "tags") {
      const inner = val.replace(/^\[/, "").replace(/\]$/, "");
      data.tags = inner.trim() ? inner.split(",").map((s) => s.trim().replace(/^["']|["']$/g, "")).filter(Boolean) : [];
    } else if (key === "citations") {
      try {
        const arr = JSON.parse(val);
        data.citations = Array.isArray(arr) ? arr : [];
      } catch {
        data.citations = [];
      }
    } else if (key === "seriesPart") {
      const n = Number(val);
      if (Number.isFinite(n)) data.seriesPart = n;
    } else if (val === "true" || val === "false") {
      data[key] = val === "true";
    } else {
      data[key] = val.replace(/^["']|["']$/g, "").replace(/\\"/g, '"');
    }
  }
  return { data, body: m[2] };
}
var q = (s) => '"' + String(s).replace(/"/g, '\\"') + '"';
function serialise({ data, body }) {
  const lines = [];
  if (data.title != null) lines.push(`title: ${q(data.title)}`);
  if (data.description != null) lines.push(`description: ${q(data.description)}`);
  if (data.image) lines.push(`image: ${q(data.image)}`);
  if (data.date != null) lines.push(`date: ${data.date}`);
  if (data.tags != null) lines.push(`tags: [${data.tags.map(q).join(", ")}]`);
  if (Array.isArray(data.citations) && data.citations.length) {
    const clean = data.citations.filter((c) => c && c.id).map((c) => ({ id: String(c.id), text: String(c.text == null ? "" : c.text) }));
    if (clean.length) lines.push(`citations: ${JSON.stringify(clean)}`);
  }
  if (data.series != null && String(data.series).trim()) lines.push(`series: ${q(String(data.series).trim())}`);
  if (data.seriesPart != null && Number.isFinite(Number(data.seriesPart))) lines.push(`seriesPart: ${Number(data.seriesPart)}`);
  if (data.accent != null) lines.push(`accent: ${q(data.accent)}`);
  if (data.glyph != null) lines.push(`glyph: ${q(data.glyph)}`);
  if (data.theme != null && data.theme !== "dark") lines.push(`theme: ${q(data.theme)}`);
  if (data.draft === true) lines.push("draft: true");
  if (data.publishAt) lines.push(`publishAt: ${data.publishAt}`);
  return `---
${lines.join("\n")}
---

${String(body).replace(/^\n+/, "")}`;
}
function readGallery(body) {
  const s = body.indexOf(GALLERY_START);
  const e = body.indexOf(GALLERY_END);
  if (s === -1 || e === -1 || e < s) return [];
  const block = body.slice(s + GALLERY_START.length, e);
  return [...block.matchAll(/!\[[^\]]*\]\(([^)]+)\)/g)].map((m) => m[1]);
}

// server/blocks.js
var blocks_exports = {};
__export(blocks_exports, {
  blocksFromMarkdown: () => blocksFromMarkdown,
  inlineHtmlToMd: () => inlineHtmlToMd,
  inlineMdToHtml: () => inlineMdToHtml,
  rawDocFromMarkdown: () => rawDocFromMarkdown,
  renderPreviewHtml: () => renderPreviewHtml,
  serialiseBlock: () => serialiseBlock,
  serialiseBlocks: () => serialiseBlocks,
  stripDangerousMdLinks: () => stripDangerousMdLinks,
  stripUnsafeHtml: () => stripUnsafeHtml,
  validateDoc: () => validateDoc
});

// server/figures/svg.js
var PALETTE = {
  ink: "var(--ink)",
  inkDim: "var(--ink-dim)",
  teal: "var(--teal)",
  cyan: "var(--cyan)",
  violet: "var(--violet)"
};
var INK = PALETTE.ink;
var INK_DIM = PALETTE.inkDim;
var FONT = "var(--font-display), system-ui, sans-serif";
function escText(s) {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function escAttr(s) {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function el(tag, attrs2 = {}, children = []) {
  const parts = [];
  for (const [k, v] of Object.entries(attrs2)) {
    if (v === null || v === void 0) continue;
    parts.push(`${k}="${escAttr(v)}"`);
  }
  const head = parts.length ? `<${tag} ${parts.join(" ")}` : `<${tag}`;
  const kids = Array.isArray(children) ? children.join("") : children ?? "";
  if (kids === "" || kids == null) return `${head}/>`;
  return `${head}>${kids}</${tag}>`;
}
function strokeAttrs(opts = {}) {
  const { stroke = INK, width, fill = "none", ...rest } = opts;
  return {
    fill,
    stroke,
    "stroke-width": width === void 0 ? void 0 : width,
    ...rest
  };
}
function line({ x1, y1, x2, y2, stroke, width, ...rest } = {}) {
  const { fill, ...sa } = strokeAttrs({ stroke, width, ...rest });
  return el("line", { x1, y1, x2, y2, ...sa });
}
function poly(points = [], opts = {}) {
  const pts = points.map(([x, y]) => `${x},${y}`).join(" ");
  return el("polyline", { points: pts, ...strokeAttrs(opts) });
}
function path(d, opts = {}) {
  return el("path", { d, ...strokeAttrs(opts) });
}
function circle({ cx, cy, r, stroke, width, fill, ...rest } = {}) {
  return el("circle", { cx, cy, r, ...strokeAttrs({ stroke, width, fill, ...rest }) });
}
function rect({ x, y, w, h, rx, stroke, width, fill, ...rest } = {}) {
  return el("rect", {
    x,
    y,
    width: w,
    height: h,
    rx,
    ...strokeAttrs({ stroke, width, fill, ...rest })
  });
}
function arrow({ x1, y1, x2, y2, label: lbl, stroke = INK, width, size = 8, ...rest } = {}) {
  const shaft = line({ x1, y1, x2, y2, stroke, width, ...rest });
  const ang = Math.atan2(y2 - y1, x2 - x1);
  const spread = 0.5;
  const ax = x2 - size * Math.cos(ang - spread);
  const ay = y2 - size * Math.sin(ang - spread);
  const bx = x2 - size * Math.cos(ang + spread);
  const by = y2 - size * Math.sin(ang + spread);
  const round14 = (n) => Math.round(n * 100) / 100;
  const head = poly([[round14(ax), round14(ay)], [x2, y2], [round14(bx), round14(by)]], { stroke, width });
  const parts = [shaft, head];
  if (lbl != null && lbl !== "") {
    parts.push(label(lbl, round14((x1 + x2) / 2), round14((y1 + y2) / 2) - 6, { anchor: "middle" }));
  }
  return el("g", {}, parts);
}
function label(text2, x, y, opts = {}) {
  const { size = 13, anchor = "start", fill = INK, font = FONT, ...rest } = opts;
  return el("text", {
    x,
    y,
    "font-family": font,
    "font-size": size,
    "text-anchor": anchor,
    fill,
    ...rest
  }, escText(text2));
}
function leader(from = [0, 0], to = [0, 0]) {
  const [x1, y1] = from;
  const [x2, y2] = to;
  return line({ x1, y1, x2, y2, stroke: INK_DIM, width: 1 });
}
function panel({ x = 0, y = 0, w = 0, h = 0, rx = 8, label: lbl } = {}) {
  const box = rect({ x, y, w, h, rx, stroke: INK_DIM, fill: "none" });
  if (lbl == null || lbl === "") return box;
  const tag = label(lbl, x + 8, y + 18, { fill: INK_DIM, size: 12 });
  return el("g", {}, [box, tag]);
}
function drawCss(selector) {
  return [
    "@keyframes fig-draw { to { stroke-dashoffset: 0; } }",
    `${selector} {`,
    "  stroke-dasharray: 1000;",
    "  stroke-dashoffset: 1000;",
    "  animation: fig-draw 1.6s ease forwards;",
    "}",
    "@media (prefers-reduced-motion: reduce) {",
    `  ${selector} { animation: none; stroke-dashoffset: 0; }`,
    "}"
  ].join("\n");
}
function motionCss(id, framesCss) {
  return [
    `@keyframes ${id} { ${framesCss} }`,
    "@media (prefers-reduced-motion: reduce) {",
    "  * { animation: none !important; animation-play-state: paused !important; }",
    "}"
  ].join("\n");
}
function viewBox(w, h) {
  return `0 0 ${w} ${h}`;
}
function svgWrap(inner, vb, styleCss = "") {
  const openTag = '<svg viewBox="' + escAttr(vb) + '" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" role="img" fill="none">';
  const style = styleCss && String(styleCss).trim() !== "" ? `<style>${styleCss}</style>` : "";
  return `${openTag}${style}${inner}</svg>`;
}
var SAFE_IMAGE_DATA_URL = /^data:image\/(?:png|jpe?g|gif|webp|avif);base64,/i;
var STYLE_ALLOWED_PROPS = [
  "animation",
  "animation-name",
  "animation-duration",
  "animation-timing-function",
  "animation-delay",
  "animation-iteration-count",
  "animation-direction",
  "animation-fill-mode",
  "animation-play-state",
  "transform",
  "transform-origin",
  "transform-box",
  "opacity",
  "stroke-width",
  "stroke-dasharray",
  "stroke-dashoffset"
];
function cleanDeclarations(body) {
  const decls = body.split(";");
  const kept = [];
  for (const raw of decls) {
    const decl = raw.trim();
    if (decl === "") continue;
    const colon = decl.indexOf(":");
    if (colon === -1) continue;
    const prop = decl.slice(0, colon).trim().toLowerCase();
    const value = decl.slice(colon + 1);
    if (!STYLE_ALLOWED_PROPS.includes(prop)) continue;
    if (/url\s*\(/i.test(value) || /https?:|\/\//i.test(value) || /expression\s*\(/i.test(value)) continue;
    kept.push(`${prop}:${value.trim()}`);
  }
  return kept.join("; ");
}
function cleanStyle(css) {
  let out = "";
  let i = 0;
  const n = css.length;
  while (i < n) {
    while (i < n && /\s/.test(css[i])) i++;
    if (i >= n) break;
    if (css[i] === "@") {
      const braceStart2 = css.indexOf("{", i);
      if (braceStart2 === -1) {
        i = n;
        break;
      }
      const prelude = css.slice(i, braceStart2).trim();
      const keyword = (prelude.match(/^@([a-z-]+)/i) || [, ""])[1].toLowerCase();
      let depth2 = 0, j2 = braceStart2;
      for (; j2 < n; j2++) {
        if (css[j2] === "{") depth2++;
        else if (css[j2] === "}") {
          depth2--;
          if (depth2 === 0) {
            j2++;
            break;
          }
        }
      }
      const inner = css.slice(braceStart2 + 1, j2 - 1);
      if (keyword === "keyframes" || keyword === "media") {
        out += `${prelude} { ${cleanStyle(inner)} }
`;
      }
      i = j2;
      continue;
    }
    const braceStart = css.indexOf("{", i);
    if (braceStart === -1) {
      i = n;
      break;
    }
    const selector = css.slice(i, braceStart).trim();
    let depth = 0, j = braceStart;
    for (; j < n; j++) {
      if (css[j] === "{") depth++;
      else if (css[j] === "}") {
        depth--;
        if (depth === 0) {
          j++;
          break;
        }
      }
    }
    const body = css.slice(braceStart + 1, j - 1);
    const cleaned = cleanDeclarations(body);
    if (selector !== "" && cleaned !== "") {
      out += `${selector} { ${cleaned} }
`;
    }
    i = j;
  }
  return out.trim();
}
function sanitise(svg2) {
  let s = String(svg2 ?? "");
  s = s.replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, "");
  s = s.replace(/<script\b[^>]*\/\s*>/gi, "");
  s = s.replace(/<\/?script\b[^>]*>/gi, "");
  s = s.replace(/<foreignObject\b[^>]*>[\s\S]*?<\/foreignObject\s*>/gi, "");
  s = s.replace(/<foreignObject\b[^>]*\/\s*>/gi, "");
  s = s.replace(/<\/?foreignObject\b[^>]*>/gi, "");
  const SMIL = "(?:animate|set|animateTransform|animateMotion)";
  s = s.replace(new RegExp(`<(${SMIL})\\b[^>]*>[\\s\\S]*?<\\/\\1\\s*>`, "gi"), "");
  s = s.replace(new RegExp(`<${SMIL}\\b[^>]*\\/\\s*>`, "gi"), "");
  s = s.replace(new RegExp(`<\\/?${SMIL}\\b[^>]*>`, "gi"), "");
  const onAttr = /\son[a-z-]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi;
  let prev;
  do {
    prev = s;
    s = s.replace(onAttr, "");
  } while (s !== prev);
  const keepHref = (v) => v.startsWith("#") || SAFE_IMAGE_DATA_URL.test(v);
  const hrefAttr = /\s(?:xlink:)?href\s*=\s*(?:"([^"]*)"|'([^']*)')/gi;
  s = s.replace(hrefAttr, (m, dq, sq) => {
    const v = ((dq !== void 0 ? dq : sq) || "").trim();
    return keepHref(v) ? m : "";
  });
  const hrefUnquoted = /\s(?:xlink:)?href\s*=\s*([^\s">]+)/gi;
  s = s.replace(hrefUnquoted, (m, val) => {
    const v = (val || "").trim();
    return keepHref(v) ? m : "";
  });
  s = s.replace(/<style\b[^>]*>([\s\S]*?)<\/style\s*>/gi, (_, css) => {
    const cleaned = cleanStyle(css);
    return `<style>${cleaned}</style>`;
  });
  return s;
}

// server/blocks.js
var KNOWN = /* @__PURE__ */ new Set(["heading", "text", "image", "quote", "divider", "raw", "gallery", "embed", "playground", "table", "figure"]);
function decodeEntities(s) {
  return s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, " ");
}
var CITE_ID = /^[a-z][\w-]*$/;
var safeCiteId = (id) => CITE_ID.test(String(id || "")) ? String(id) : "";
function inlineHtmlToMd(html) {
  let s = String(html || "");
  s = s.replace(/<sup\b[^>]*\bclass="[^"]*\bfn-ref\b[^"]*"[^>]*>[\s\S]*?<\/sup>/gi, (m) => {
    const idm = /\bdata-fn="([^"]*)"/i.exec(m);
    const id = idm ? safeCiteId(decodeEntities(idm[1])) : "";
    return id ? `[^${id}]` : "";
  });
  s = s.replace(/<a\s+[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, (_, href, txt) => `[${txt.replace(/<[^>]+>/g, "")}](${href})`);
  s = s.replace(/<code>([\s\S]*?)<\/code>/gi, (_, t) => `\`${decodeEntities(t.replace(/<[^>]+>/g, ""))}\``);
  s = s.replace(/<(strong|b)>([\s\S]*?)<\/\1>/gi, (_, __, t) => `**${t}**`);
  s = s.replace(/<(em|i)>([\s\S]*?)<\/\1>/gi, (_, __, t) => `*${t}*`);
  s = s.replace(/<br\s*\/?>/gi, " ");
  s = s.replace(/<\/?[a-z][^>]*>/gi, "");
  s = decodeEntities(s);
  return s.replace(/[ \t]+/g, " ").trim();
}
function escAttr2(s) {
  return String(s || "").replace(/"/g, "&quot;");
}
function escHtml(s) {
  return String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
var ALIGNS = /* @__PURE__ */ new Set(["left", "center", "right"]);
function blkWidth(b) {
  const n = Number(b && b.width);
  if (!Number.isFinite(n)) return null;
  const w = Math.round(n);
  if (w >= 100 || w < 20) return null;
  return w;
}
function blkAlign(b) {
  const a = String(b && b.align || "").toLowerCase();
  return ALIGNS.has(a) ? a : "center";
}
function resizeAttrs(b) {
  const w = blkWidth(b);
  if (w == null) return "";
  return ` style="--blk-w:${w}%" data-align="${blkAlign(b)}"`;
}
function pgHtml(html) {
  return String(html || "").split("\n").filter((ln) => ln.trim() !== "").map((ln) => ln.replace(/^\s+/, (m) => m.length >= 4 ? "  " : m)).join("\n");
}
function figureClasses(b) {
  if (b.placement === "wide") return ["breakout"];
  const out = [];
  if (b.placement === "left") out.push("img-left");
  else if (b.placement === "right") out.push("img-right");
  if (b.size === "sm") out.push("img-sm");
  else if (b.size === "md") out.push("img-md");
  return out;
}
function imageFigure(b, slug) {
  const classes = figureClasses(b);
  const cls = classes.length ? ` class="${classes.join(" ")}"` : "";
  const src = b.url ? String(b.url) : `/images/posts/${slug}/${b.file}`;
  const cap = b.caption ? `<figcaption>${escHtml(b.caption)}</figcaption>` : "";
  return `<figure${cls}${resizeAttrs(b)}><img src="${escAttr2(src)}" alt="${escAttr2(b.alt)}" loading="lazy">${cap}</figure>`;
}
function figureInner(b, slug) {
  const parts = [];
  if (b.base && (b.base.file || b.base.base64 && SAFE_IMAGE_DATA_URL.test(b.base.base64))) {
    const src = b.base.file ? `/images/posts/${slug}/${b.base.file}` : b.base.base64;
    parts.push(`<img src="${escAttr2(src)}" alt="${escAttr2(b.base.alt)}" loading="lazy">`);
  }
  parts.push(sanitise(b.svg));
  if (b.caption) parts.push(`<figcaption>${escHtml(b.caption)}</figcaption>`);
  return parts.join("");
}
function figureBlock(b, slug) {
  const place = b.placement === "wide" ? "wide" : b.placement === "left" ? "left" : b.placement === "right" ? "right" : "default";
  const draw = b.animation === "draw" ? " data-draw" : "";
  const sticker = b.kind === "sticker" ? " fig--sticker" : "";
  const open = `<figure class="fig fig--${place}${sticker}"${draw}${resizeAttrs(b)}>`;
  return pgHtml(`${open}${figureInner(b, slug)}</figure>`);
}
function serialiseBlock(block, ctx = {}) {
  switch (block.type) {
    case "heading":
      return `${"#".repeat(Math.min(Math.max(block.level || 2, 2), 4))} ${(block.text || "").trim()}`;
    case "text":
      return inlineHtmlToMd(block.html);
    case "quote": {
      const body = inlineHtmlToMd(block.html != null ? block.html : block.text).replace(/\n/g, "\n> ");
      return `> ${body}${block.cite ? `
> \u2014 ${block.cite}` : ""}`;
    }
    case "divider":
      return "---";
    case "image":
      return imageFigure(block, ctx.slug || "post");
    case "figure":
      return figureBlock(block, ctx.slug || "post");
    case "raw":
      return String(block.content || "");
    case "gallery": {
      const imgs = (block.images || []).filter((im) => im && im.file).map((im) => `![${escAttr2(im.alt).replace(/[\[\]]/g, "")}](./_images/${ctx.slug || "post"}/${im.file})`);
      if (!imgs.length) return "";
      const w = blkWidth(block);
      const marker = w == null ? "" : `[[blk-gallery:w=${w},a=${blkAlign(block)}]]

`;
      return `${marker}${imgs.join("\n")}`;
    }
    case "embed": {
      const ra = resizeAttrs(block);
      if (block.provider === "youtube" && block.videoId)
        return `<div class="embed-16x9"${ra}>
  <iframe src="https://www.youtube-nocookie.com/embed/${block.videoId}" title="${escAttr2(block.title)}" loading="lazy" allowfullscreen></iframe>
</div>`;
      if (block.provider === "vimeo" && block.videoId)
        return `<div class="embed-16x9"${ra}>
  <iframe src="https://player.vimeo.com/video/${block.videoId}" title="${escAttr2(block.title)}" loading="lazy" allowfullscreen></iframe>
</div>`;
      if (block.src) return ra ? `<figure class="blk-video"${ra}><video src="${escAttr2(block.src)}" controls preload="metadata" playsinline></video></figure>` : `<video src="${escAttr2(block.src)}" controls preload="metadata" playsinline></video>`;
      return "";
    }
    case "playground": {
      const html = pgHtml(block.html), js = String(block.js || "").trim();
      const css = pgHtml(block.css || "");
      if (!html && !js && !css) return "";
      const idAttr = block.domId && /^[a-zA-Z][\w-]*$/.test(block.domId) ? ` id="${block.domId}"` : "";
      const place = block.placement === "wide" ? " breakout" : block.placement === "left" ? " img-left" : block.placement === "right" ? " img-right" : "";
      const div = `<div class="playground${place}"${idAttr}${resizeAttrs(block)}>
${html}
</div>`;
      const style = css ? `

<style>
${css}
</style>` : "";
      const script = js ? `

<script type="application/pg">
${js}
<\/script>` : "";
      return `${div}${style}${script}`;
    }
    // If header is empty the first row becomes the header row (headerless tables)
    case "table": {
      const header = Array.isArray(block.header) ? block.header : [];
      const rows = Array.isArray(block.rows) ? block.rows : [];
      if (!header.length && !rows.length) return "";
      const cols = header.length || Math.max(0, ...rows.map((r) => r.length));
      const cell = (v) => String(v == null ? "" : v).replace(/\|/g, "\\|").replace(/\n/g, " ").trim();
      const pad = (r) => {
        const a = (r || []).map(cell);
        while (a.length < cols) a.push("");
        return a.slice(0, cols);
      };
      const head = header.length ? header : rows[0] || [];
      const body = header.length ? rows : rows.slice(1);
      const line3 = (a) => `| ${pad(a).join(" | ")} |`;
      return [line3(head), `| ${Array(cols).fill("---").join(" | ")} |`, ...body.map(line3)].join("\n");
    }
    default:
      return "";
  }
}
var DANGEROUS_SCHEME = /^\s*(?:javascript|data|vbscript):/i;
function stripDangerousMdLinks(s) {
  let out = String(s == null ? "" : s);
  out = out.replace(/!\[([^\]]*)\]\(([^)]*)\)/g, (m, alt, url) => DANGEROUS_SCHEME.test(url) ? alt : m);
  out = out.replace(/\[([^\]]*)\]\(([^)]*)\)/g, (m, text2, url) => DANGEROUS_SCHEME.test(url) ? text2 : m);
  out = out.replace(/<\s*(?:javascript|data|vbscript):[^>]*>/gi, "");
  return out;
}
function citationDefText(text2) {
  return stripDangerousMdLinks(stripUnsafeHtml(String(text2 == null ? "" : text2))).replace(/[\r\n]+/g, " ").replace(/[ \t]+/g, " ").trim();
}
function appendCitationDefs(body, citations) {
  if (!Array.isArray(citations) || !citations.length) return body;
  const defs = [];
  for (const c of citations) {
    const id = safeCiteId(c && c.id);
    if (!id) continue;
    const ref = new RegExp(`\\[\\^${id}\\](?!:)`);
    if (!ref.test(body)) continue;
    defs.push(`[^${id}]: ${citationDefText(c.text)}`);
  }
  if (!defs.length) return body;
  return `${body.replace(/\n+$/, "")}

${defs.join("\n")}
`;
}
function serialiseBlocks(blocks, ctx = {}) {
  const body = blocks.map((b) => serialiseBlock(b, ctx)).filter((s) => s !== "").join("\n\n") + "\n";
  return appendCitationDefs(body, ctx.citations);
}
function renderPreviewHtml(blocks, ctx = {}) {
  const slug = ctx.slug || "post";
  const origin = ctx.siteOrigin || "https://inayatpanda.com";
  const imgSrc = (b) => b.base64 ? b.base64 : b.url ? `${origin}${b.url}` : b.src || `${origin}/images/posts/${slug}/${b.file}`;
  const placeCls = (p) => p === "wide" ? " breakout" : p === "left" ? " img-left" : p === "right" ? " img-right" : "";
  const figure = (b) => {
    const cap = b.caption ? `<figcaption>${escHtml(b.caption)}</figcaption>` : "";
    const cls = figureClasses(b).join(" ");
    return `<figure${cls ? ` class="${cls}"` : ""}${resizeAttrs(b)}><img src="${escAttr2(imgSrc(b))}" alt="${escAttr2(b.alt)}">${cap}</figure>`;
  };
  return (blocks || []).map((b) => {
    switch (b.type) {
      case "heading": {
        const lvl = Math.min(Math.max(b.level || 2, 2), 4);
        return `<h${lvl}>${escHtml(b.text || "")}</h${lvl}>`;
      }
      case "text": {
        const h = String(b.html || "").trim();
        if (!h) return "";
        return /^\s*<(p|h[1-6]|ul|ol|blockquote|figure|div|table|hr|pre)/i.test(h) ? h : `<p>${h}</p>`;
      }
      case "quote": {
        const body = String(b.html != null ? b.html : b.text || "");
        return `<blockquote>${body}${b.cite ? `<cite>\u2014 ${escHtml(b.cite)}</cite>` : ""}</blockquote>`;
      }
      case "divider":
        return "<hr>";
      case "image":
        return b.url || b.file || b.base64 || b.src ? figure(b) : "";
      case "figure": {
        if (!b.svg) return "";
        const place = b.placement === "wide" ? "wide" : b.placement === "left" ? "left" : b.placement === "right" ? "right" : "default";
        const draw = b.animation === "draw" ? " data-draw" : "";
        const sticker = b.kind === "sticker" ? " fig--sticker" : "";
        return `<figure class="fig fig--${place}${sticker}"${draw}${resizeAttrs(b)}>${figureInner(b, slug)}</figure>`;
      }
      case "raw":
        return String(b.content || "");
      case "gallery": {
        const ims = (b.images || []).filter((im) => im && (im.file || im.base64));
        if (!ims.length) return "";
        return `<div class="gallery"${resizeAttrs(b)}>${ims.map((im) => `<figure><img src="${escAttr2(im.base64 || `${origin}/images/${slug}/${im.file}`)}" alt="${escAttr2(im.alt)}">${im.alt ? `<figcaption>${escHtml(im.alt)}</figcaption>` : ""}</figure>`).join("")}</div>`;
      }
      case "embed": {
        const ra = resizeAttrs(b);
        if (b.provider === "youtube" && b.videoId) return `<div class="embed-16x9"${ra}><iframe src="https://www.youtube-nocookie.com/embed/${escAttr2(b.videoId)}" title="${escAttr2(b.title)}" loading="lazy" allowfullscreen></iframe></div>`;
        if (b.provider === "vimeo" && b.videoId) return `<div class="embed-16x9"${ra}><iframe src="https://player.vimeo.com/video/${escAttr2(b.videoId)}" title="${escAttr2(b.title)}" loading="lazy" allowfullscreen></iframe></div>`;
        if (b.src) return ra ? `<figure class="blk-video"${ra}><video src="${escAttr2(b.src)}" controls preload="metadata" playsinline></video></figure>` : `<video src="${escAttr2(b.src)}" controls preload="metadata" playsinline></video>`;
        return "";
      }
      case "playground": {
        const html = pgHtml(b.html), js = String(b.js || "").trim(), css = pgHtml(b.css || "");
        if (!html && !js && !css) return "";
        const idAttr = b.domId && /^[a-zA-Z][\w-]*$/.test(b.domId) ? ` id="${b.domId}"` : "";
        return `<div class="playground${placeCls(b.placement)}"${idAttr}${resizeAttrs(b)}>${css ? `<style>${css}</style>` : ""}${html}${js ? `<script>${js}<\/script>` : ""}</div>`;
      }
      case "table": {
        const header = Array.isArray(b.header) ? b.header : [];
        const rows = Array.isArray(b.rows) ? b.rows : [];
        if (!header.length && !rows.length) return "";
        const cols = header.length || Math.max(0, ...rows.map((r) => r.length));
        const pad = (r) => {
          const a = (r || []).map((v) => escHtml(v == null ? "" : String(v)));
          while (a.length < cols) a.push("");
          return a.slice(0, cols);
        };
        const head = header.length ? header : rows[0] || [];
        const body = header.length ? rows : rows.slice(1);
        return `<table><thead><tr>${pad(head).map((c) => `<th>${c}</th>`).join("")}</tr></thead><tbody>${body.map((r) => `<tr>${pad(r).map((c) => `<td>${c}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
      }
      default:
        return "";
    }
  }).filter((s) => s !== "").join("\n");
}
var SAFE_IMAGE_REF = /^\/images\/posts\/[A-Za-z0-9._\-\/]+$/;
var isSafeImageRef = (url) => SAFE_IMAGE_REF.test(String(url || "")) && !String(url).split("/").includes("..");
function validateDoc(doc) {
  if (!doc || !Array.isArray(doc.blocks)) throw Object.assign(new Error("block doc must have a blocks array"), { status: 400 });
  for (const b of doc.blocks) {
    if (!b || !KNOWN.has(b.type)) throw Object.assign(new Error(`unknown block type: ${b && b.type}`), { status: 400 });
    if (b.type === "image" && !b.file && !b.base64 && !b.url) throw Object.assign(new Error("image block needs file, base64 or url"), { status: 400 });
    if (b.type === "image" && b.url && !b.base64 && !isSafeImageRef(b.url))
      throw Object.assign(new Error("image reference must be a site image path under /images/posts/"), { status: 400 });
    if (b.type === "figure" && (typeof b.svg !== "string" || b.svg.trim() === "")) throw Object.assign(new Error("figure block needs a non-empty svg string"), { status: 400 });
  }
  return true;
}
function rawDocFromMarkdown(body) {
  return { version: 1, blocks: [{ id: "legacy", type: "raw", content: String(body || "") }] };
}
function inlineMdToHtml(s) {
  let out = String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  out = out.replace(/`([^`]+)`/g, (_, t) => `<code>${t}</code>`);
  out = out.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, t, u) => {
    const safe = /^\s*javascript:/i.test(u) ? "about:blank#blocked" : u;
    return `<a href="${safe.replace(/"/g, "&quot;")}">${t}</a>`;
  });
  out = out.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  out = out.replace(/(^|[^*])\*([^*\n]+)\*/g, "$1<em>$2</em>");
  return out;
}
function escHtmlInline(s) {
  return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function stripUnsafeHtml(html) {
  let s = String(html || "");
  s = s.replace(/<(script|iframe|object|embed)\b[\s\S]*?<\/\1\s*>/gi, "");
  s = s.replace(/<\/?(?:script|iframe|object|embed)\b[^>]*>/gi, "");
  s = s.replace(/\son\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, "");
  s = s.replace(/\s(?:href|src)\s*=\s*(?:"\s*javascript:[^"]*"|'\s*javascript:[^']*'|javascript:[^\s>]*)/gi, "");
  return s;
}
function blocksFromMarkdown(body) {
  const text2 = String(body || "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const lines = text2.split("\n");
  const blocks = [];
  const push = (b) => {
    blocks.push(b);
  };
  let para = [];
  const flushPara = () => {
    if (!para.length) return;
    const joined = para.join(" ").trim();
    if (joined) push({ type: "text", html: inlineMdToHtml(joined) });
    para = [];
  };
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const line3 = raw.replace(/\s+$/, "");
    const trimmed = line3.trim();
    if (trimmed === "") {
      flushPara();
      continue;
    }
    const fence = /^(\s*)(```+|~~~+)(.*)$/.exec(line3);
    if (fence) {
      flushPara();
      const marker = fence[2][0];
      const buf = [];
      i++;
      for (; i < lines.length; i++) {
        if (new RegExp("^\\s*" + marker + "{3,}\\s*$").test(lines[i])) break;
        buf.push(lines[i]);
      }
      push({ type: "raw", content: `<pre><code>${escHtmlInline(buf.join("\n"))}</code></pre>` });
      continue;
    }
    if (/^\s*</.test(line3)) {
      flushPara();
      const buf = [line3];
      while (i + 1 < lines.length && lines[i + 1].trim() !== "" && !/^(#{1,6}\s|>\s|\s*([-*+]|\d+\.)\s|\s*(```|~~~))/.test(lines[i + 1])) {
        i++;
        buf.push(lines[i]);
      }
      push({ type: "raw", content: stripUnsafeHtml(buf.join("\n")) });
      continue;
    }
    let m = /^(#{1,6})\s+(.*)$/.exec(line3);
    if (m) {
      flushPara();
      const level = Math.min(Math.max(m[1].length, 2), 4);
      push({ type: "heading", level, text: m[2].replace(/\s+#+\s*$/, "").trim() });
      continue;
    }
    if (/^(\s*)(-{3,}|\*{3,}|_{3,})\s*$/.test(line3)) {
      flushPara();
      push({ type: "divider" });
      continue;
    }
    if (/^\s*>\s?/.test(line3)) {
      flushPara();
      const qlines = [];
      while (i < lines.length && /^\s*>\s?/.test(lines[i])) {
        qlines.push(lines[i].replace(/^\s*>\s?/, ""));
        i++;
      }
      i--;
      let cite = "";
      const last = qlines[qlines.length - 1] || "";
      const cm = /^\s*(?:—|--|-)\s*(.+)$/.exec(last);
      if (cm && qlines.length > 1) {
        cite = cm[1].trim();
        qlines.pop();
      }
      const innerMd = qlines.join(" ").replace(/\s+/g, " ").trim();
      push({ type: "quote", html: inlineMdToHtml(innerMd), cite });
      continue;
    }
    if (/^\s*\|.*\|\s*$/.test(line3) && i + 1 < lines.length && /^\s*\|?[\s:|-]*-[\s:|-]*\|?\s*$/.test(lines[i + 1]) && /-/.test(lines[i + 1])) {
      flushPara();
      const splitRow = (r) => r.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.replace(/\\\|/g, "|").trim());
      const header = splitRow(line3);
      i += 2;
      const rows = [];
      while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i])) {
        rows.push(splitRow(lines[i]));
        i++;
      }
      i--;
      push({ type: "table", header, rows });
      continue;
    }
    const listItem = /^(\s*)([-*+]|\d+\.)\s+(.*)$/.exec(line3);
    if (listItem) {
      flushPara();
      const ordered = /\d/.test(listItem[2]);
      const items = [];
      while (i < lines.length) {
        const li = /^(\s*)([-*+]|\d+\.)\s+(.*)$/.exec(lines[i]);
        if (!li) {
          if (items.length && lines[i].trim() !== "" && /^\s+\S/.test(lines[i]) && !/^\s*</.test(lines[i])) {
            items[items.length - 1] += " " + lines[i].trim();
            i++;
            continue;
          }
          break;
        }
        items.push(li[3].trim());
        i++;
      }
      i--;
      const tag = ordered ? "ol" : "ul";
      const html = `<${tag}>` + items.map((it) => `<li>${inlineMdToHtml(it)}</li>`).join("") + `</${tag}>`;
      push({ type: "raw", content: stripUnsafeHtml(html) });
      continue;
    }
    para.push(trimmed);
  }
  flushPara();
  if (!blocks.length) blocks.push({ type: "text", html: "" });
  return { version: 1, blocks };
}

// studio-app/core/posts.js
var BLOG_DIR = "src/content/blog";
var postPath = (slug) => `${BLOG_DIR}/${slug}.md`;
var imgDir = (slug) => `${BLOG_DIR}/_images/${slug}`;
var blocksPath = (slug) => `${BLOG_DIR}/_blocks/${slug}.json`;
var publicImgDir = (slug) => `public/images/posts/${slug}`;
var todayISO = () => (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
function slugify(title) {
  return String(title || "").toLowerCase().trim().replace(/[^\w\s-]/g, "").replace(/\s+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "post";
}
function galleryFilename(im, i) {
  if (im.file) return im.file;
  const m = /^data:image\/(\w+);base64,/.exec(im.base64 || "");
  const ext = m ? m[1] === "jpeg" ? "jpg" : m[1] : "jpg";
  return `gallery-${i + 1}.${ext}`;
}
function makePosts(gh) {
  async function uniqueSlug(base) {
    let slug = base, n = 2;
    while (await gh.getFile(postPath(slug))) slug = `${base}-${n++}`;
    return slug;
  }
  async function getPost(slug) {
    const f = await gh.getFile(postPath(slug));
    if (!f) return null;
    const { data, body } = parse(f.content);
    const photos = (await gh.listDir(imgDir(slug))).filter((e) => e.type === "file");
    return { slug, data, body, sha: f.sha, photos };
  }
  async function setDraft(slug, draft) {
    const cur = await getPost(slug);
    if (!cur) throw Object.assign(new Error("not found"), { status: 404 });
    const md = serialise({ data: { ...cur.data, draft }, body: cur.body });
    const { commit } = await gh.putFile(postPath(slug), md, `studio: ${draft ? "take down" : "republish"} ${slug}`, cur.sha);
    return { slug, draft, commit };
  }
  async function updatePost(slug, patch) {
    const cur = await getPost(slug);
    if (!cur) throw Object.assign(new Error("not found"), { status: 404 });
    const data = { ...cur.data };
    if (patch.title != null) data.title = patch.title;
    if (patch.description != null) data.description = patch.description;
    if (patch.tags != null) data.tags = patch.tags;
    if (patch.accent != null) data.accent = patch.accent;
    if (patch.image !== void 0) {
      if (patch.image) data.image = patch.image;
      else delete data.image;
    }
    const body = patch.body != null ? patch.body : cur.body;
    const md = serialise({ data, body });
    const { commit } = await gh.putFile(postPath(slug), md, `studio: edit ${slug}`, cur.sha);
    return { slug, commit };
  }
  return {
    async getTopics() {
      const f = await gh.getFile("src/data/topics.json");
      return f ? JSON.parse(f.content) : [];
    },
    async listPosts() {
      const entries = (await gh.listDir(BLOG_DIR)).filter((e) => e.type === "file" && e.name.endsWith(".md"));
      const out = [];
      for (const e of entries) {
        const f = await gh.getFile(e.path);
        const { data, body } = parse(f.content);
        out.push({
          slug: e.name.replace(/\.md$/, ""),
          title: data.title || e.name,
          date: data.date || "",
          draft: data.draft === true,
          publishAt: data.publishAt || "",
          tags: Array.isArray(data.tags) ? data.tags : [],
          series: data.series || "",
          seriesPart: Number.isFinite(Number(data.seriesPart)) ? Number(data.seriesPart) : null,
          photoCount: readGallery(body).length
        });
      }
      return out.sort((a, b) => (b.date || "").localeCompare(a.date || ""));
    },
    getPost,
    suggestSlug(title) {
      return uniqueSlug(slugify(title || "untitled"));
    },
    // Media library: every committed post image under public/images/posts/, grouped by
    // slug, so the composer can REUSE an existing image (insert a /images/posts/... url
    // reference) instead of re-uploading. One recursive git-trees call via gh.listTree.
    async listMediaImages() {
      const PREFIX = "public/images/posts";
      const EXT = /\.(png|jpe?g|webp|gif|avif|svg)$/i;
      const entries = (await gh.listTree(PREFIX)).filter((e) => EXT.test(e.path));
      const groups = /* @__PURE__ */ new Map();
      for (const e of entries) {
        const rest = e.path.slice(PREFIX.length + 1);
        const i = rest.indexOf("/");
        if (i < 0) continue;
        const slug = rest.slice(0, i);
        const file = rest.slice(i + 1);
        if (!file || file.includes("/")) continue;
        const url = `/images/posts/${slug}/${file}`;
        if (!groups.has(slug)) groups.set(slug, []);
        groups.get(slug).push({ slug, file, url, size: e.size });
      }
      return [...groups.entries()].map(([slug, images]) => ({ slug, images: images.sort((a, b) => a.file.localeCompare(b.file)) })).sort((a, b) => a.slug.localeCompare(b.slug));
    },
    takedownPost: (slug) => setDraft(slug, true),
    republishPost: (slug) => setDraft(slug, false),
    updatePost,
    // sidecar (block JSON) → legacy (markdown). The router checks the storage draft first.
    async getPostBlocks(slug) {
      const post = await getPost(slug);
      if (!post) return null;
      const side = await gh.getFile(blocksPath(slug));
      if (side) {
        const doc = JSON.parse(side.content);
        for (const b of doc.blocks) if (b.type === "image" && b.file) b.src = `/images/posts/${slug}/${b.file}`;
        return { source: "sidecar", doc, data: post.data };
      }
      return { source: "legacy", doc: rawDocFromMarkdown(post.body), data: post.data };
    },
    async deletePost(slug) {
      const cur = await getPost(slug);
      if (!cur) throw Object.assign(new Error("not found"), { status: 404 });
      const photos = await gh.listDir(imgDir(slug));
      const sidecar = await gh.getFile(blocksPath(slug));
      const pubImgs = await gh.listDir(publicImgDir(slug));
      const changes = [
        { path: postPath(slug), delete: true },
        ...photos.map((p) => ({ path: p.path, delete: true })),
        ...sidecar ? [{ path: blocksPath(slug), delete: true }] : [],
        ...pubImgs.map((p) => ({ path: p.path, delete: true }))
      ];
      const { commit } = await gh.commitMany(changes, `studio: delete ${slug}`);
      return { deleted: slug, commit };
    },
    async duplicatePost(slug) {
      const cur = await getPost(slug);
      if (!cur) throw Object.assign(new Error("not found"), { status: 404 });
      const newSlug = await uniqueSlug(slugify(`${cur.data.title || slug}-copy`));
      const rewrite = (s) => (s || "").split(`_images/${slug}/`).join(`_images/${newSlug}/`).split(`images/posts/${slug}/`).join(`images/posts/${newSlug}/`);
      const data = { ...cur.data, title: `${cur.data.title || slug} (copy)`, date: todayISO(), draft: true };
      const changes = [{ path: postPath(newSlug), content: serialise({ data, body: rewrite(cur.body) }) }];
      const side = await gh.getFile(blocksPath(slug));
      if (side) changes.push({ path: blocksPath(newSlug), content: rewrite(side.content) });
      for (const [dir, dst] of [[imgDir(slug), imgDir(newSlug)], [publicImgDir(slug), publicImgDir(newSlug)]]) {
        for (const f of (await gh.listDir(dir)).filter((e) => e.type === "file")) {
          const bin = await gh.getBinary(f.path);
          if (bin) changes.push({ path: `${dst}/${f.name}`, base64: bin.base64 });
        }
      }
      const { commit } = await gh.commitMany(changes, `studio: duplicate ${slug} \u2192 ${newSlug}`);
      return { slug: newSlug, from: slug, url: `/blog/${newSlug}/`, commit };
    },
    async publishBlocks(slug, doc, meta24) {
      validateDoc(doc);
      const imageChanges = [];
      const storedBlocks = doc.blocks.map((b) => {
        if (b.type === "image" && b.url && !b.base64) {
          const { base64, src, file, ...ref } = b;
          return ref;
        }
        if (b.type === "image" && b.base64) {
          imageChanges.push({ path: `${publicImgDir(slug)}/${b.file}`, base64: b.base64 });
          const { base64, src, url, ...ref } = b;
          return ref;
        }
        if (b.type === "image") {
          const { src, ...ref } = b;
          return ref;
        }
        if (b.type === "gallery" && Array.isArray(b.images)) {
          const images = b.images.map((im, i) => {
            const file = galleryFilename(im || {}, i);
            if (im && im.base64) imageChanges.push({ path: `${imgDir(slug)}/${file}`, base64: im.base64 });
            return { file, alt: im && im.alt || "" };
          });
          return { ...b, images };
        }
        return b;
      });
      const storedDoc = { version: 1, blocks: storedBlocks };
      const citations = (Array.isArray(meta24.citations) ? meta24.citations : []).filter((c) => c && c.id).map((c) => ({ id: String(c.id), text: String(c.text == null ? "" : c.text) }));
      const body = serialiseBlocks(storedBlocks, { slug, citations });
      const md = serialise({ data: {
        title: meta24.title,
        description: (meta24.description || "").slice(0, 155) || meta24.title,
        date: meta24.date || todayISO(),
        tags: meta24.tags || [],
        ...meta24.series && String(meta24.series).trim() ? { series: String(meta24.series).trim() } : {},
        ...meta24.series && String(meta24.series).trim() && Number.isFinite(Number(meta24.seriesPart)) ? { seriesPart: Number(meta24.seriesPart) } : {},
        accent: meta24.accent || "#2dd4bf",
        ...meta24.image ? { image: meta24.image } : {},
        ...meta24.glyph ? { glyph: meta24.glyph } : {},
        ...meta24.theme && meta24.theme !== "dark" ? { theme: meta24.theme } : {},
        ...citations.length ? { citations } : {},
        // A scheduled post is committed as a hidden draft carrying publishAt; the site's
        // GitHub Action flips draft→false once publishAt is due. Force draft:true whenever
        // publishAt is set so a scheduled post can never go live early.
        ...meta24.draft || meta24.publishAt ? { draft: true } : {},
        ...meta24.publishAt ? { publishAt: meta24.publishAt } : {}
      }, body });
      const changes = [
        { path: postPath(slug), content: md },
        { path: blocksPath(slug), content: JSON.stringify(storedDoc, null, 2) },
        ...imageChanges
      ];
      const { commit } = await gh.commitMany(changes, meta24.publishAt ? `studio: schedule ${slug} for ${meta24.publishAt}` : `studio: publish ${slug}`);
      return { slug, url: `/blog/${slug}/`, commit };
    }
  };
}

// studio-app/core/partner.js
var partner_exports = {};
__export(partner_exports, {
  appendVersion: () => appendVersion,
  assembleContext: () => assembleContext,
  createSession: () => createSession,
  fillIntents: () => fillIntents,
  gatherContext: () => gatherContext,
  publishSession: () => publishSession,
  revertSession: () => revertSession,
  runTurn: () => runTurn
});

// server/studio.js
var studio_exports = {};
__export(studio_exports, {
  STUDIO_STYLE: () => STUDIO_STYLE,
  altText: () => altText,
  draftPost: () => draftPost,
  expandToBlog: () => expandToBlog,
  formatCitation: () => formatCitation,
  genImage: () => genImage,
  generateSticker: () => generateSticker,
  goblinMode: () => goblinMode,
  importDocument: () => importDocument,
  inventFigure: () => inventFigure,
  inventInteractive: () => inventInteractive,
  repurposeThread: () => repurposeThread,
  rewriteText: () => rewriteText,
  seoSuggest: () => seoSuggest,
  socialPack: () => socialPack,
  structureNotes: () => structureNotes,
  suggestFigure: () => suggestFigure,
  suggestInteractive: () => suggestInteractive,
  suggestLabels: () => suggestLabels,
  tweakFigure: () => tweakFigure,
  tweakInteractive: () => tweakInteractive,
  vectoriseSketch: () => vectoriseSketch
});

// server/playgrounds/index.js
var playgrounds_exports = {};
__export(playgrounds_exports, {
  buildInstance: () => buildInstance,
  esc: () => esc,
  getFamily: () => getFamily,
  getPreset: () => getPreset,
  listFamilies: () => listFamilies
});

// server/playgrounds/toggle-ab.js
var stateSchema = {
  type: "object",
  additionalProperties: false,
  required: ["label", "readouts", "caption"],
  properties: {
    label: { type: "string", title: "Button label" },
    accent: { type: "string", title: "Accent colour (hex)", default: "#22d3ee" },
    readouts: {
      type: "array",
      title: "Readout rows",
      maxItems: 6,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["label", "value"],
        properties: { label: { type: "string" }, value: { type: "string" } }
      }
    },
    caption: { type: "string", title: "One-line caption" }
  }
};
var toggle_ab_default = {
  id: "toggle-ab",
  name: "A / B toggle",
  category: "comparison",
  description: 'Two-state switch with readouts and a caption. For "this vs that" comparisons.',
  paramsSchema: {
    type: "object",
    additionalProperties: false,
    required: ["stateA", "stateB"],
    properties: {
      title: { type: "string", title: "Optional label above the toggle" },
      stateA: stateSchema,
      stateB: stateSchema
    }
  },
  presets: [
    {
      name: "Cloud vs on-device",
      params: {
        title: "Where does the data live?",
        stateA: {
          label: "On-device",
          accent: "#2dd4bf",
          caption: "The record never leaves the laptop. No round trip, nothing to intercept.",
          readouts: [{ label: "Latency", value: "instant" }, { label: "Who can read it", value: "only you" }, { label: "Offline", value: "still works" }]
        },
        stateB: {
          label: "Cloud",
          accent: "#f472b6",
          caption: "Every save is a return flight to a building you will never see.",
          readouts: [{ label: "Latency", value: "round trip" }, { label: "Who can read it", value: "you + the vendor" }, { label: "Offline", value: "broken" }]
        }
      }
    },
    {
      name: "Conservative vs operative",
      params: {
        stateA: {
          label: "Conservative",
          accent: "#2dd4bf",
          caption: "Time and physiotherapy; the body does the repair.",
          readouts: [{ label: "Risk", value: "low, but slow" }, { label: "Recovery", value: "weeks\u2013months" }, { label: "Reversible", value: "yes" }]
        },
        stateB: {
          label: "Operative",
          accent: "#818cf8",
          caption: "Faster structural fix, at the cost of an operation.",
          readouts: [{ label: "Risk", value: "surgical" }, { label: "Recovery", value: "rehab protocol" }, { label: "Reversible", value: "no" }]
        }
      }
    }
  ],
  build(params, domId) {
    const A = params.stateA || {}, B = params.stateB || {};
    const title = params.title ? `<div class="pg-ab-title">${esc(params.title)}</div>` : "";
    const html = `<div class="pg-stage">${title}<div class="pg-ab-toggle" role="group" aria-label="Choose a state"><button type="button" data-role="a" class="pg-ab-btn is-active" aria-pressed="true">${esc(A.label)}</button><button type="button" data-role="b" class="pg-ab-btn" aria-pressed="false">${esc(B.label)}</button></div><div class="pg-ab-panel" data-role="panel" aria-live="polite"><dl class="pg-ab-readouts" data-role="readouts"></dl><div class="pg-readout" data-role="caption"></div></div></div>`;
    const css = [
      `#${domId} .pg-ab-title{font-size:.9rem;color:var(--ink-dim,#9fb3c8);margin:0 0 .7rem}`,
      `#${domId} .pg-ab-toggle{display:inline-flex;gap:.4rem;border:1px solid var(--line,#23304a);border-radius:99px;padding:.25rem}`,
      `#${domId} .pg-ab-btn{appearance:none;background:transparent;border:1px solid transparent;border-radius:99px;padding:.45rem 1.1rem;color:var(--ink-dim,#9fb3c8);font:inherit;cursor:pointer;transition:.2s}`,
      `#${domId} .pg-ab-btn.is-active{border-color:var(--pg-ab-accent,#22d3ee);color:var(--pg-ab-accent,#22d3ee);background:rgba(140,160,200,.08)}`,
      `#${domId} .pg-ab-panel{margin-top:1.1rem}`,
      `#${domId} .pg-ab-readouts{margin:0;display:grid;gap:.5rem}`,
      `#${domId} .pg-ab-row{display:flex;justify-content:space-between;gap:1rem;border-bottom:1px dashed var(--line,#23304a);padding-bottom:.4rem}`,
      `#${domId} .pg-ab-row dt{color:var(--ink-faint,#717d99)}`,
      `#${domId} .pg-ab-row dd{margin:0;color:var(--pg-ab-accent,#22d3ee);font-weight:600;text-align:right}`,
      `#${domId} [data-role=caption]{margin-top:.9rem;color:var(--ink-dim,#9fb3c8)}`
    ].join("\n");
    const jsBody = `
var E=function(s){return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');};
var btnA=$('[data-role=a]'),btnB=$('[data-role=b]'),ro=$('[data-role=readouts]'),cap=$('[data-role=caption]');
if(!btnA||!btnB||!ro||!cap)return;
function render(st){
  root.style.setProperty('--pg-ab-accent', st.accent||'#22d3ee');
  ro.innerHTML=(st.readouts||[]).map(function(r){return '<div class="pg-ab-row"><dt>'+E(r.label)+'</dt><dd>'+E(r.value)+'</dd></div>';}).join('');
  cap.textContent=st.caption||'';
}
function pick(isA){
  btnA.classList.toggle('is-active',isA); btnB.classList.toggle('is-active',!isA);
  btnA.setAttribute('aria-pressed',isA?'true':'false'); btnB.setAttribute('aria-pressed',!isA?'true':'false');
  render(isA?CONFIG.stateA:CONFIG.stateB);
}
btnA.addEventListener('click',function(){pick(true);});
btnB.addEventListener('click',function(){pick(false);});
pick(true);
`;
    return { html, css, jsBody };
  }
};

// server/playgrounds/function-explorer.js
var sliderSchema = {
  type: "object",
  additionalProperties: false,
  required: ["key", "label", "min", "max", "value"],
  properties: {
    key: { type: "string", title: "Variable name (used in formulas as V.key)" },
    label: { type: "string" },
    min: { type: "number" },
    max: { type: "number" },
    value: { type: "number" },
    step: { type: "number", default: 1 },
    unit: { type: "string", default: "" }
  }
};
var function_explorer_default = {
  id: "function-explorer",
  name: "Function explorer",
  category: "quantitative",
  description: 'Sliders \u2192 a live plotted curve, a headline number, and a verdict. For "feel the relationship" explainers.',
  paramsSchema: {
    type: "object",
    additionalProperties: false,
    required: ["sliders", "output"],
    properties: {
      title: { type: "string" },
      sliders: { type: "array", minItems: 1, maxItems: 3, items: sliderSchema },
      curve: {
        type: "object",
        additionalProperties: false,
        properties: {
          xLabel: { type: "string" },
          yLabel: { type: "string" },
          yExpr: { type: "string", title: "y(t) in [0,1]; t sweeps 0\u21921; may use V.* + Math" },
          markerExpr: { type: "string", title: "marker t in [0,1]; in V.* + Math" }
        }
      },
      output: {
        type: "object",
        additionalProperties: false,
        required: ["label", "expr"],
        properties: {
          label: { type: "string" },
          expr: { type: "string", title: "headline value; V.* + Math" },
          unit: { type: "string", default: "" },
          decimals: { type: "number", default: 1 }
        }
      },
      verdict: {
        type: "object",
        additionalProperties: false,
        properties: { bands: { type: "array", items: {
          type: "object",
          additionalProperties: false,
          required: ["max", "label"],
          properties: { max: { type: "number" }, label: { type: "string" }, colour: { type: "string" } }
        } } }
      }
    }
  },
  presets: [
    {
      name: "Power curve (hollow beam)",
      params: {
        sliders: [{ key: "spread", label: "Material pushed outward", min: 0, max: 100, value: 0, step: 1, unit: "%" }],
        curve: { xLabel: "material at the edge \u2192", yLabel: "bending stiffness \u2192", yExpr: "Math.pow(t,2)", markerExpr: "V.spread/100" },
        output: { label: "relative bending stiffness", expr: "1 + 7.3*Math.pow(V.spread/100,2)", unit: "\xD7", decimals: 1 },
        verdict: { bands: [{ max: 2, label: "barely better than a solid rod", colour: "#fbbf24" }, { max: 5, label: "noticeably stiffer", colour: "#22d3ee" }, { max: 999, label: "far stiffer \u2014 same weight", colour: "#2dd4bf" }] }
      }
    },
    {
      name: "Logistic (dose\u2013response)",
      params: {
        sliders: [{ key: "dose", label: "Dose", min: 0, max: 100, value: 50, step: 1, unit: "" }],
        curve: { xLabel: "dose \u2192", yLabel: "response \u2192", yExpr: "1/(1+Math.exp(-(t-0.5)*10))", markerExpr: "V.dose/100" },
        output: { label: "response", expr: "100/(1+Math.exp(-((V.dose/100)-0.5)*10))", unit: "%", decimals: 0 },
        verdict: { bands: [{ max: 20, label: "sub-threshold", colour: "#717d99" }, { max: 80, label: "climbing fast", colour: "#22d3ee" }, { max: 100, label: "plateau", colour: "#2dd4bf" }] }
      }
    }
  ],
  build(params, domId) {
    const sliders = (params.sliders || []).slice(0, 3);
    const title = params.title ? `<div class="pg-fx-title">${esc(params.title)}</div>` : "";
    const c = params.curve || {};
    const controls = sliders.map(
      (s) => `<div class="pg-field"><label for="${domId}-${esc(s.key)}">${esc(s.label)} <b data-val="${esc(s.key)}"></b></label><input id="${domId}-${esc(s.key)}" data-key="${esc(s.key)}" data-unit="${esc(s.unit || "")}" type="range" min="${s.min}" max="${s.max}" step="${s.step || 1}" value="${s.value}"></div>`
    ).join("");
    const plot = `<svg viewBox="0 0 360 220" role="img" aria-label="${esc((c.yLabel || "value") + " against " + (c.xLabel || "input"))}" class="pg-fx-plot"><line x1="40" y1="190" x2="340" y2="190" stroke="#3a4866"/><line x1="40" y1="30" x2="40" y2="190" stroke="#3a4866"/><text x="340" y="208" fill="#717d99" font-size="10" text-anchor="end">${esc(c.xLabel || "")}</text><text x="14" y="30" fill="#717d99" font-size="10" transform="rotate(-90 14 30)" text-anchor="end">${esc(c.yLabel || "")}</text><path data-role="curve" fill="none" stroke="#22d3ee" stroke-width="2.5"/><circle data-role="dot" r="6" fill="#2dd4bf" cx="40" cy="190"/></svg>`;
    const html = `<div class="pg-stage">${title}<div class="pg-fx-grid">${plot}<div class="pg-fx-side"><div class="pg-readout">${esc(params.output.label)} <b data-role="out"></b></div><div class="pg-fx-verdict" data-role="verdict" aria-live="polite"></div></div></div><div class="pg-controls">${controls}</div></div>`;
    const css = [
      `#${domId} .pg-fx-title{font-size:.9rem;color:var(--ink-dim,#9fb3c8);margin:0 0 .7rem}`,
      `#${domId} .pg-fx-grid{display:grid;grid-template-columns:1.4fr 1fr;gap:1rem;align-items:center}`,
      `#${domId} .pg-fx-plot{width:100%;height:auto}`,
      `#${domId} .pg-controls{display:grid;gap:.9rem;margin-top:1.1rem}`,
      `#${domId} .pg-fx-verdict{margin:.6rem 0 0;font-weight:600}`,
      `#${domId} label b{color:#fff}`,
      `@media(max-width:620px){#${domId} .pg-fx-grid{grid-template-columns:1fr}}`
    ].join("\n");
    const jsBody = `
var inputs=$$('input[type=range]'),out=$('[data-role=out]'),verdict=$('[data-role=verdict]'),path=$('[data-role=curve]'),dot=$('[data-role=dot]');
if(!inputs.length)return;
var KEYS=(CONFIG.sliders||[]).map(function(s){return s.key;}).filter(function(k){return /^[A-Za-z_$][\\w$]*$/.test(k);});
function mk(expr,args){try{var pre=KEYS.map(function(k){return 'var '+k+'=V['+JSON.stringify(k)+'];';}).join('');return new Function(args.join(','),'Math',pre+'return ('+(expr||'0')+');');}catch(e){return function(){return 0;};}}
var fnY=mk((CONFIG.curve&&CONFIG.curve.yExpr)||'t',['V','t']);
var fnM=mk((CONFIG.curve&&CONFIG.curve.markerExpr)||'0',['V']);
var fnO=mk(CONFIG.output.expr,['V']);
function cl(x){return x<0?0:x>1?1:x;}
function px(t){return 40+cl(t)*300;}function py(y){return 190-cl(y)*160;}
function vars(){var V={};inputs.forEach(function(i){var k=i.getAttribute('data-key');V[k]=parseFloat(i.value);var b=$('[data-val="'+k+'"]');if(b)b.textContent=i.value+(i.getAttribute('data-unit')||'');});return V;}
function redraw(){
  var V=vars(),i;
  if(path){var d='';for(i=0;i<=60;i++){var t=i/60,y;try{y=fnY(V,t,Math);}catch(e){y=0;}d+=(i?' L':'M')+px(t).toFixed(1)+','+py(y).toFixed(1);}path.setAttribute('d',d);}
  if(dot){var mt=0;try{mt=cl(fnM(V,Math));}catch(e){}var my=0;try{my=fnY(V,mt,Math);}catch(e){}dot.setAttribute('cx',px(mt));dot.setAttribute('cy',py(my));}
  var val=0;try{val=fnO(V,Math);}catch(e){}
  if(out){var dec=CONFIG.output.decimals;dec=(dec==null?1:dec);out.textContent=(isFinite(val)?val.toFixed(dec):'\u2013')+(CONFIG.output.unit||'');}
  if(verdict&&CONFIG.verdict&&CONFIG.verdict.bands){var bs=CONFIG.verdict.bands,ch=bs[bs.length-1];for(i=0;i<bs.length;i++){if(val<=bs[i].max){ch=bs[i];break;}}verdict.textContent=ch.label;verdict.style.color=ch.colour||'#22d3ee';}
}
inputs.forEach(function(i){i.addEventListener('input',redraw);});
redraw();
`;
    return { html, css, jsBody };
  }
};

// server/playgrounds/stepper-timeline.js
var stageSchema = {
  type: "object",
  additionalProperties: false,
  required: ["label", "caption"],
  properties: {
    label: { type: "string", title: "Short stage label (shown on the marker + readout)" },
    caption: { type: "string", title: "One- or two-line caption for this stage" },
    value: { type: "number", title: "Marker position 0..1 (optional; else even spacing)" },
    detail: { type: "string", title: "Optional detail / verdict line" }
  }
};
var stepper_timeline_default = {
  id: "stepper-timeline",
  name: "Stepper timeline",
  category: "narrative",
  description: 'Step or scrub through N stages \u2014 a moving marker, a caption, and a "stage k of N" readout. For walkthroughs and timelines.',
  paramsSchema: {
    type: "object",
    additionalProperties: false,
    required: ["stages"],
    properties: {
      title: { type: "string", title: "Optional label above the timeline" },
      xLabel: { type: "string", title: "Optional label under the track" },
      stages: { type: "array", minItems: 2, maxItems: 12, items: stageSchema }
    }
  },
  presets: [
    {
      name: "Eras of an idea",
      params: {
        title: "Drilling the skull, through the ages",
        xLabel: "earlier \u2190  time  \u2192 later",
        stages: [
          { label: "Neolithic", value: 0, caption: "Holes scraped into living skulls \u2014 and the bone healed, so they survived.", detail: "Trepanation predates writing; ritual and pressure-relief both proposed." },
          { label: "Antiquity", value: 0.34, caption: "Hippocratic writers codify when to drill and when to leave well alone.", detail: "The first attempt at indications rather than instinct." },
          { label: "Renaissance", value: 0.67, caption: "Trephine instruments are engineered; anatomy is drawn from dissection.", detail: "Tooling improves faster than understanding of infection." },
          { label: "Modern", value: 1, caption: "Burr holes under imaging, asepsis, and a clear pressure rationale.", detail: "Same hole, finally for the right reason." }
        ]
      }
    },
    {
      name: "Case walkthrough",
      params: {
        title: "A shoulder, from injury to verdict",
        xLabel: "presentation  \u2192  decision",
        stages: [
          { label: "Presentation", value: 0, caption: "Fall onto an outstretched hand; the arm is held still, the contour is off.", detail: "History points before the X-ray confirms." },
          { label: "Imaging", value: 0.4, caption: "Plain films show a displaced proximal humerus in three parts.", detail: "Fracture pattern drives the next fork." },
          { label: "Options", value: 0.7, caption: "Weigh fixation against replacement against accepting the position.", detail: "Age, bone quality, and demand all pull differently." },
          { label: "Verdict", value: 1, caption: "Fix it: restore the tuberosities, protect the blood supply, rehab early.", detail: "Chosen for a younger patient with reconstructable bone." }
        ]
      }
    }
  ],
  build(params, domId) {
    const stages = (params.stages || []).slice(0, 12);
    const title = params.title ? `<div class="pg-st-title">${esc(params.title)}</div>` : "";
    const xLabel = params.xLabel ? `<div class="pg-st-xlabel">${esc(params.xLabel)}</div>` : "";
    const n = stages.length;
    const maxIdx = Math.max(0, n - 1);
    const track = `<svg viewBox="0 0 360 90" role="img" aria-label="Timeline track with a marker showing the current stage" class="pg-st-track"><line x1="30" y1="58" x2="330" y2="58" stroke="#3a4866" stroke-width="2"/><g data-role="ticks"></g><line data-role="cursor" x1="30" y1="40" x2="30" y2="76" stroke="#22d3ee" stroke-width="2.5"/><circle data-role="marker" cx="30" cy="58" r="7" fill="#2dd4bf" stroke="#04060c" stroke-width="2"/><text data-role="markerlabel" x="30" y="30" fill="#fff" font-size="12" text-anchor="middle"></text></svg>`;
    const html = `<div class="pg-stage">${title}<div class="pg-readout">stage <b data-role="idx">1</b> of <b data-role="count">${n}</b></div>` + track + xLabel + `<div class="pg-st-caption" data-role="caption" aria-live="polite"></div><div class="pg-st-detail" data-role="detail"></div><div class="pg-controls pg-st-controls"><div class="pg-st-buttons" role="group" aria-label="Step through stages"><button type="button" data-role="prev" class="pg-st-btn">\u2039 Prev</button><button type="button" data-role="next" class="pg-st-btn">Next \u203A</button></div><div class="pg-field"><label for="${domId}-scrub">Scrub stages</label><input id="${domId}-scrub" data-role="scrub" type="range" min="0" max="${maxIdx}" step="1" value="0"></div></div></div>`;
    const css = [
      `#${domId} .pg-st-title{font-size:.9rem;color:var(--ink-dim,#9fb3c8);margin:0 0 .7rem}`,
      `#${domId} .pg-st-track{width:100%;height:auto;display:block;margin:.4rem 0 .2rem}`,
      `#${domId} .pg-st-xlabel{font-size:.78rem;color:var(--ink-faint,#717d99);text-align:center;margin:.1rem 0 .6rem}`,
      `#${domId} .pg-st-caption{color:#fff;font-weight:600;margin:.4rem 0 .3rem;min-height:1.3em}`,
      `#${domId} .pg-st-detail{color:var(--ink-dim,#9fb3c8);font-size:.9rem;min-height:1.2em}`,
      `#${domId} .pg-st-controls{display:grid;grid-template-columns:auto 1fr;gap:1rem;align-items:end}`,
      `#${domId} .pg-st-buttons{display:inline-flex;gap:.4rem}`,
      `#${domId} .pg-st-btn{appearance:none;background:transparent;border:1px solid var(--line,#23304a);border-radius:8px;padding:.45rem .9rem;color:var(--ink-dim,#9fb3c8);font:inherit;cursor:pointer;transition:.2s}`,
      `#${domId} .pg-st-btn:hover{border-color:#22d3ee;color:#22d3ee}`,
      `#${domId} .pg-st-btn:disabled{opacity:.4;cursor:default}`,
      `#${domId} label b{color:#fff}`,
      `@media(max-width:620px){#${domId} .pg-st-controls{grid-template-columns:1fr}}`
    ].join("\n");
    const jsBody = `
var E=function(s){return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');};
var stages=(CONFIG.stages||[]).slice(0,12);
var n=stages.length;
if(!n)return;
var maxIdx=n-1;
var scrub=$('[data-role=scrub]'),prev=$('[data-role=prev]'),next=$('[data-role=next]');
var idxOut=$('[data-role=idx]'),cap=$('[data-role=caption]'),detail=$('[data-role=detail]');
var marker=$('[data-role=marker]'),cursor=$('[data-role=cursor]'),mlabel=$('[data-role=markerlabel]'),ticks=$('[data-role=ticks]');
function cl(x){return x<0?0:x>1?1:x;}
function posOf(i){var st=stages[i]||{};var v=(typeof st.value==='number')?st.value:(maxIdx?i/maxIdx:0);return cl(v);}
function px(t){return 30+cl(t)*300;}
if(ticks){var tk='';for(var j=0;j<n;j++){var x=px(posOf(j));tk+='<circle cx="'+x.toFixed(1)+'" cy="58" r="3" fill="#3a4866"/>';}ticks.innerHTML=tk;}
var cur=0;
function render(){
  cur=Math.max(0,Math.min(maxIdx,cur|0));
  var st=stages[cur]||{};
  var x=px(posOf(cur));
  if(marker)marker.setAttribute('cx',x.toFixed(1));
  if(cursor){cursor.setAttribute('x1',x.toFixed(1));cursor.setAttribute('x2',x.toFixed(1));}
  if(mlabel){mlabel.setAttribute('x',x.toFixed(1));mlabel.textContent=st.label||'';}
  if(idxOut)idxOut.textContent=String(cur+1);
  if(cap)cap.textContent=st.caption||'';
  if(detail)detail.textContent=st.detail||'';
  if(scrub&&parseInt(scrub.value,10)!==cur)scrub.value=String(cur);
  if(prev)prev.disabled=(cur<=0);
  if(next)next.disabled=(cur>=maxIdx);
}
function go(i){cur=i;render();}
if(scrub)scrub.addEventListener('input',function(){go(parseInt(scrub.value,10)||0);});
if(prev)prev.addEventListener('click',function(){go(cur-1);});
if(next)next.addEventListener('click',function(){go(cur+1);});
go(0);
`;
    return { html, css, jsBody };
  }
};

// server/playgrounds/scatter-sim.js
var scatter_sim_default = {
  id: "scatter-sim",
  name: "Scatter simulator",
  category: "quantitative",
  description: "A button repeatedly draws random samples, plots dots against a threshold, and counts how many cross it. For chance / rare-event explainers.",
  paramsSchema: {
    type: "object",
    additionalProperties: false,
    required: ["threshold"],
    properties: {
      title: { type: "string", title: "Optional label above the plot" },
      runLabel: { type: "string", title: "Draw-button label", default: "Run once" },
      resetLabel: { type: "string", title: "Reset-button label", default: "Reset" },
      threshold: { type: "number", title: "Threshold 0..1 (the line dots are compared against)" },
      thresholdLabel: { type: "string", title: "Label for the threshold line" },
      sampleKind: { type: "string", title: "Sample distribution", enum: ["uniform", "normal"], default: "uniform" },
      hitLabel: { type: "string", title: "Word for a crossing draw", default: "hits" },
      caption: { type: "string", title: "One-line caption under the readouts" }
    }
  },
  presets: [
    {
      name: "p-hacking (p<0.05)",
      params: {
        title: 'Keep testing and something will "work"',
        runLabel: "Run a test",
        resetLabel: "Reset",
        threshold: 0.05,
        thresholdLabel: "p = 0.05",
        sampleKind: "uniform",
        hitLabel: "significant",
        caption: "No real effect \u2014 each test is pure noise. About 1 in 20 still lands below the line."
      }
    },
    {
      name: "rare-event counter",
      params: {
        title: "How often does the rare thing happen?",
        runLabel: "Sample",
        resetLabel: "Clear",
        threshold: 0.1,
        thresholdLabel: "10% cut-off",
        sampleKind: "normal",
        hitLabel: "rare events",
        caption: "Most draws cluster mid-range; only the occasional sample dips into the tail."
      }
    }
  ],
  build(params, domId) {
    const title = params.title ? `<div class="pg-sc-title">${esc(params.title)}</div>` : "";
    const runLabel = esc(params.runLabel || "Run once");
    const resetLabel = esc(params.resetLabel || "Reset");
    const caption = params.caption ? `<div class="pg-readout pg-sc-caption" data-role="caption"></div>` : "";
    const plot = `<svg viewBox="0 0 360 220" role="img" aria-label="Scatter of random samples plotted against a threshold line" class="pg-sc-plot"><line x1="40" y1="190" x2="340" y2="190" stroke="#3a4866"/><line x1="40" y1="20" x2="40" y2="190" stroke="#3a4866"/><text x="14" y="20" fill="#717d99" font-size="10" transform="rotate(-90 14 20)" text-anchor="end">value \u2192</text><line data-role="threshold" x1="40" y1="190" x2="340" y2="190" stroke="#f472b6" stroke-width="1.6" stroke-dasharray="4 4"/><text data-role="thresholdlabel" x="340" y="0" fill="#f472b6" font-size="10" text-anchor="end"></text><g data-role="dots"></g></svg>`;
    const html = `<div class="pg-stage">${title}${plot}<div class="pg-sc-readouts"><div class="pg-readout">total <b data-role="total">0</b></div><div class="pg-readout"><b data-role="hitname"></b> <b data-role="hits">0</b></div><div class="pg-readout">smallest <b data-role="min">\u2013</b></div></div>${caption}<div class="pg-controls pg-sc-controls" role="group" aria-label="Run the simulation"><button type="button" data-role="run" class="pg-sc-btn pg-sc-run">${runLabel}</button><button type="button" data-role="reset" class="pg-sc-btn">${resetLabel}</button></div></div>`;
    const css = [
      `#${domId} .pg-sc-title{font-size:.9rem;color:var(--ink-dim,#9fb3c8);margin:0 0 .7rem}`,
      `#${domId} .pg-sc-plot{width:100%;height:auto;display:block}`,
      `#${domId} .pg-sc-readouts{display:flex;flex-wrap:wrap;gap:.6rem 1.4rem;margin:.7rem 0 .2rem}`,
      `#${domId} .pg-sc-readouts b{color:#fff}`,
      `#${domId} .pg-sc-caption{color:var(--ink-dim,#9fb3c8);margin:.2rem 0 0}`,
      `#${domId} .pg-sc-controls{display:flex;gap:.5rem;margin-top:1rem}`,
      `#${domId} .pg-sc-btn{appearance:none;background:transparent;border:1px solid var(--line,#23304a);border-radius:8px;padding:.5rem 1.1rem;color:var(--ink-dim,#9fb3c8);font:inherit;cursor:pointer;transition:.2s}`,
      `#${domId} .pg-sc-btn:hover{border-color:#22d3ee;color:#22d3ee}`,
      `#${domId} .pg-sc-run{border-color:#22d3ee;color:#22d3ee}`,
      `@media(max-width:620px){#${domId} .pg-sc-readouts{flex-direction:column;gap:.4rem}#${domId} .pg-sc-controls{flex-direction:column}}`
    ].join("\n");
    const jsBody = `
var thr=(typeof CONFIG.threshold==='number')?CONFIG.threshold:0.5;
if(thr<0)thr=0;if(thr>1)thr=1;
var kind=CONFIG.sampleKind==='normal'?'normal':'uniform';
var run=$('[data-role=run]'),reset=$('[data-role=reset]'),dots=$('[data-role=dots]');
var totalEl=$('[data-role=total]'),hitsEl=$('[data-role=hits]'),minEl=$('[data-role=min]'),hitName=$('[data-role=hitname]'),capEl=$('[data-role=caption]');
var thrLine=$('[data-role=threshold]'),thrLabel=$('[data-role=thresholdlabel]');
if(!run)return;
function cl(x){return x<0?0:x>1?1:x;}
function px(i){var col=i%26;return 50+col*11;}
function row(i){return Math.floor(i/26);}
function py(v){return 190-cl(v)*170;}
var thrY=py(thr);
if(thrLine){thrLine.setAttribute('y1',thrY.toFixed(1));thrLine.setAttribute('y2',thrY.toFixed(1));}
if(thrLabel){thrLabel.setAttribute('y',(thrY-4).toFixed(1));thrLabel.textContent=CONFIG.thresholdLabel||('threshold '+thr);}
if(hitName)hitName.textContent=CONFIG.hitLabel||'hits';
if(capEl)capEl.textContent=CONFIG.caption||'';
function draw(){
  if(kind==='normal'){var u1=Math.random()||1e-9,u2=Math.random();var z=Math.sqrt(-2*Math.log(u1))*Math.cos(2*Math.PI*u2);return cl(0.5+z/6);}
  return Math.random();
}
var total=0,hits=0,minSeen=null;
var NS='http://www.w3.org/2000/svg';
function plot(v){
  if(!dots)return;
  var i=total-1;var cx=px(i),cy=py(v),r=row(i);
  var c=document.createElementNS(NS,'circle');
  c.setAttribute('cx',(cx+(r%2?5:0)).toFixed(1));
  c.setAttribute('cy',cy.toFixed(1));
  c.setAttribute('r','3.4');
  var hit=v<=thr;
  c.setAttribute('fill',hit?'#f472b6':'#2dd4bf');
  c.setAttribute('opacity', reduced?'0.95':'0');
  dots.appendChild(c);
  if(!reduced){c.style.transition='opacity .3s';requestAnimationFrame(function(){c.setAttribute('opacity','0.95');});}
}
function once(){
  var v=draw();total++;
  if(v<=thr)hits++;
  if(minSeen==null||v<minSeen)minSeen=v;
  plot(v);
  if(totalEl)totalEl.textContent=String(total);
  if(hitsEl)hitsEl.textContent=String(hits);
  if(minEl)minEl.textContent=(minSeen==null?'\u2013':minSeen.toFixed(3));
}
run.addEventListener('click',once);
if(reset)reset.addEventListener('click',function(){
  total=0;hits=0;minSeen=null;
  if(dots)dots.innerHTML='';
  if(totalEl)totalEl.textContent='0';
  if(hitsEl)hitsEl.textContent='0';
  if(minEl)minEl.textContent='\u2013';
});
`;
    return { html, css, jsBody };
  }
};

// server/playgrounds/tappable-meter.js
var itemSchema = {
  type: "object",
  additionalProperties: false,
  required: ["label", "weight"],
  properties: {
    label: { type: "string" },
    weight: { type: "number", title: "Contribution to the meter" }
  }
};
var bandSchema = {
  type: "object",
  additionalProperties: false,
  required: ["max", "label"],
  properties: {
    max: { type: "number", title: "Upper bound (meter value 0\u2013100)" },
    label: { type: "string" },
    colour: { type: "string" }
  }
};
var tappable_meter_default = {
  id: "tappable-meter",
  name: "Tappable meter",
  category: "interactive",
  description: "Tick a set of weighted items; an SVG gauge fills or drains and shifts colour, with a live verdict. For checklists / readiness meters.",
  paramsSchema: {
    type: "object",
    additionalProperties: false,
    required: ["items", "bands"],
    properties: {
      title: { type: "string", title: "Optional label above the meter" },
      items: { type: "array", minItems: 1, maxItems: 16, items: itemSchema },
      meterLabel: { type: "string", title: "Caption under the gauge", default: "" },
      direction: {
        type: "string",
        enum: ["drain", "fill"],
        default: "fill",
        title: '"fill" = ticking raises the meter; "drain" = ticking lowers it'
      },
      runLabel: { type: "string", default: "Run all" },
      resetLabel: { type: "string", default: "Reset" },
      skipLabel: { type: "string", title: 'Optional "skip the important ones" button' },
      skipKeeps: { type: "array", title: 'Item indices that "skip" leaves unticked', items: { type: "number" } },
      bands: { type: "array", minItems: 1, items: bandSchema }
    }
  },
  presets: [
    {
      name: "Surgical checklist",
      params: {
        title: "Tick the checklist \u2014 watch the risk drain",
        direction: "drain",
        meterLabel: "residual avoidable risk",
        runLabel: "Tick everything",
        resetLabel: "Reset",
        skipLabel: 'Skip the "soft" ones',
        skipKeeps: [0, 1, 2],
        items: [
          { label: "Whole team introduced themselves by name and role", weight: 4 },
          { label: "Surgeon shared the critical/unexpected steps", weight: 4 },
          { label: "Concerns invited from anyone in the room", weight: 3 },
          { label: "Patient identity confirmed", weight: 1 },
          { label: "Site marked and confirmed", weight: 1 },
          { label: "Procedure and consent confirmed", weight: 1 },
          { label: "Anaesthetic safety check complete", weight: 1 },
          { label: "Antibiotic prophylaxis given on time", weight: 1 },
          { label: "Imaging displayed and correct", weight: 1 }
        ],
        bands: [
          { max: 10, label: "safe \u2014 the team is a team", colour: "#2dd4bf" },
          { max: 35, label: "mostly covered", colour: "#22d3ee" },
          { max: 70, label: "gaps remain", colour: "#fbbf24" },
          { max: 100, label: "high avoidable risk", colour: "#f472b6" }
        ]
      }
    },
    {
      name: "Pre-flight readiness",
      params: {
        title: "Run the pre-flight checks",
        direction: "fill",
        meterLabel: "readiness to depart",
        runLabel: "Run all checks",
        resetLabel: "Reset",
        items: [
          { label: "Flight plan filed and weather briefed", weight: 2 },
          { label: "Fuel quantity and balance confirmed", weight: 2 },
          { label: "Control surfaces free and correct", weight: 2 },
          { label: "Instruments set and cross-checked", weight: 1 },
          { label: "Flaps set for take-off", weight: 1 },
          { label: "Trim set", weight: 1 },
          { label: "Doors and harnesses secure", weight: 1 }
        ],
        bands: [
          { max: 25, label: "not ready \u2014 stay on the ground", colour: "#f472b6" },
          { max: 60, label: "incomplete", colour: "#fbbf24" },
          { max: 90, label: "nearly there", colour: "#22d3ee" },
          { max: 100, label: "cleared for take-off", colour: "#2dd4bf" }
        ]
      }
    }
  ],
  build(params, domId) {
    const items = (params.items || []).slice(0, 16);
    const title = params.title ? `<div class="pg-tm-title">${esc(params.title)}</div>` : "";
    const meterLabel = params.meterLabel || "";
    const runLabel = params.runLabel || "Run all";
    const resetLabel = params.resetLabel || "Reset";
    const hasSkip = !!params.skipLabel;
    const skipBtn = hasSkip ? `<button type="button" data-role="skip" class="pg-tm-btn">${esc(params.skipLabel)}</button>` : "";
    const rows = items.map(
      (it, i) => `<label class="pg-tm-item" for="${domId}-it${i}"><input id="${domId}-it${i}" data-role="item" data-idx="${i}" data-weight="${Number(it.weight) || 0}" type="checkbox"><span>${esc(it.label)}</span></label>`
    ).join("");
    const gauge = `<svg viewBox="0 0 220 130" role="img" aria-label="${esc(meterLabel || "meter")}" class="pg-tm-gauge"><path d="M20 120 A100 100 0 0 1 200 120" fill="none" stroke="#23304a" stroke-width="16" stroke-linecap="round"/><path data-role="arc" d="M20 120 A100 100 0 0 1 200 120" fill="none" stroke="#22d3ee" stroke-width="16" stroke-linecap="round" pathLength="100" stroke-dasharray="0 100"/><text data-role="pct" x="110" y="100" fill="#fff" font-size="34" font-weight="700" text-anchor="middle">0%</text></svg>`;
    const html = `<div class="pg-stage">${title}<div class="pg-tm-grid"><div class="pg-tm-meter">${gauge}<div class="pg-readout" data-role="verdict" aria-live="polite"></div>` + (meterLabel ? `<div class="pg-tm-caption">${esc(meterLabel)}</div>` : "") + `</div><div class="pg-tm-list" role="group" aria-label="Checklist items">${rows}</div></div><div class="pg-controls pg-tm-controls"><button type="button" data-role="run" class="pg-tm-btn">${esc(runLabel)}</button><button type="button" data-role="reset" class="pg-tm-btn">${esc(resetLabel)}</button>` + skipBtn + `</div></div>`;
    const css = [
      `#${domId} .pg-tm-title{font-size:.9rem;color:var(--ink-dim,#9fb3c8);margin:0 0 .7rem}`,
      `#${domId} .pg-tm-grid{display:grid;grid-template-columns:1fr 1.2fr;gap:1.2rem;align-items:center}`,
      `#${domId} .pg-tm-meter{text-align:center}`,
      `#${domId} .pg-tm-gauge{width:100%;max-width:260px;height:auto}`,
      `#${domId} [data-role=arc]{transition:stroke-dasharray .35s ease,stroke .35s ease}`,
      `#${domId} .pg-tm-meter .pg-readout{font-weight:600;margin-top:.3rem}`,
      `#${domId} .pg-tm-caption{color:var(--ink-faint,#717d99);font-size:.8rem;margin-top:.2rem}`,
      `#${domId} .pg-tm-list{display:grid;gap:.55rem}`,
      `#${domId} .pg-tm-item{display:flex;gap:.6rem;align-items:flex-start;color:var(--ink-dim,#9fb3c8);cursor:pointer;font-size:.92rem}`,
      `#${domId} .pg-tm-item input{margin-top:.2rem;accent-color:#22d3ee;flex:0 0 auto}`,
      `#${domId} .pg-tm-item.is-on{color:#fff}`,
      `#${domId} .pg-tm-controls{display:flex;flex-wrap:wrap;gap:.6rem;margin-top:1.1rem}`,
      `#${domId} .pg-tm-btn{appearance:none;background:rgba(140,160,200,.08);border:1px solid var(--line,#23304a);border-radius:99px;padding:.45rem 1.1rem;color:var(--ink-dim,#9fb3c8);font:inherit;cursor:pointer;transition:.2s}`,
      `#${domId} .pg-tm-btn:hover{border-color:#22d3ee;color:#22d3ee}`,
      `@media(max-width:620px){#${domId} .pg-tm-grid{grid-template-columns:1fr}}`
    ].join("\n");
    const jsBody = `
var items=$$('[data-role=item]'),arc=$('[data-role=arc]'),pct=$('[data-role=pct]'),verdict=$('[data-role=verdict]');
if(!items.length||!arc)return;
var runBtn=$('[data-role=run]'),resetBtn=$('[data-role=reset]'),skipBtn=$('[data-role=skip]');
var dir=CONFIG.direction==='drain'?'drain':'fill';
var keeps={};(CONFIG.skipKeeps||[]).forEach(function(i){keeps[i]=true;});
var total=0;items.forEach(function(c){total+=(parseFloat(c.getAttribute('data-weight'))||0);});
if(total<=0)total=1;
function bandFor(v){var bs=CONFIG.bands||[];var ch=bs[bs.length-1]||{label:'',colour:'#22d3ee'};for(var i=0;i<bs.length;i++){if(v<=bs[i].max){ch=bs[i];break;}}return ch;}
function render(){
  var ticked=0;
  items.forEach(function(c){
    var on=c.checked;var lab=c.closest?c.closest('.pg-tm-item'):c.parentNode;
    if(lab&&lab.classList)lab.classList.toggle('is-on',on);
    if(on)ticked+=(parseFloat(c.getAttribute('data-weight'))||0);
  });
  var frac=ticked/total;
  var v=dir==='drain'?(1-frac):frac;
  var pctVal=Math.round(v*100);
  var ch=bandFor(pctVal);
  arc.setAttribute('stroke-dasharray',pctVal+' 100');
  arc.setAttribute('stroke',ch.colour||'#22d3ee');
  if(pct)pct.textContent=pctVal+'%';
  if(verdict){verdict.textContent=ch.label||'';verdict.style.color=ch.colour||'#22d3ee';}
}
function setAll(on){items.forEach(function(c){c.checked=on;});render();}
function skip(){items.forEach(function(c){var idx=parseInt(c.getAttribute('data-idx'),10);c.checked=!keeps[idx];});render();}
items.forEach(function(c){c.addEventListener('change',render);});
if(runBtn)runBtn.addEventListener('click',function(){setAll(true);});
if(resetBtn)resetBtn.addEventListener('click',function(){setAll(false);});
if(skipBtn)skipBtn.addEventListener('click',skip);
setAll(false);
`;
    return { html, css, jsBody };
  }
};

// server/playgrounds/mixer.js
var inputSchema = {
  type: "object",
  additionalProperties: false,
  required: ["key", "label", "min", "max", "value"],
  properties: {
    key: { type: "string", title: "Variable name (used in formulas as V.key)" },
    label: { type: "string" },
    min: { type: "number" },
    max: { type: "number" },
    value: { type: "number" },
    step: { type: "number", default: 1 },
    unit: { type: "string", default: "" }
  }
};
var bandSchema2 = {
  type: "object",
  additionalProperties: false,
  required: ["max", "label"],
  properties: { max: { type: "number" }, label: { type: "string" }, colour: { type: "string" } }
};
var mixer_default = {
  id: "mixer",
  name: "Mixer",
  category: "quantitative",
  description: "Several sliders combine via a formula into one output \u2014 a number with a verdict, or a colour swatch + hex. For additive/compounding explainers.",
  paramsSchema: {
    type: "object",
    additionalProperties: false,
    required: ["inputs"],
    properties: {
      title: { type: "string" },
      inputs: { type: "array", minItems: 1, maxItems: 8, items: inputSchema },
      mode: { type: "string", enum: ["number", "colour"], default: "number" },
      expr: { type: "string", title: "number mode: output value in V.* + Math (e.g. the product)" },
      unit: { type: "string", default: "" },
      decimals: { type: "number", default: 0 },
      swatchExpr: { type: "string", title: "colour mode: returns a CSS colour string from V.*" },
      caption: { type: "string", title: "One-line caption under the output" },
      bands: { type: "array", title: "number mode: verdict bands", items: bandSchema2 }
    }
  },
  presets: [
    {
      name: "RGB additive mixer",
      params: {
        title: "Add red, green and blue light",
        mode: "colour",
        swatchExpr: "'rgb('+Math.round(V.r)+','+Math.round(V.g)+','+Math.round(V.b)+')'",
        caption: "Light adds. Push all three up and you reach white \u2014 not a muddier colour.",
        inputs: [
          { key: "r", label: "Red", min: 0, max: 255, value: 0, step: 1, unit: "" },
          { key: "g", label: "Green", min: 0, max: 255, value: 0, step: 1, unit: "" },
          { key: "b", label: "Blue", min: 0, max: 255, value: 0, step: 1, unit: "" }
        ]
      }
    },
    {
      name: "Drake equation",
      params: {
        title: "How many civilisations might we hear from?",
        mode: "number",
        expr: "V.R * V.fp * V.ne * V.fl * V.fi * V.fc * V.L",
        unit: " civilisations",
        decimals: 1,
        caption: "Each factor multiplies the last \u2014 small changes swing the answer by orders of magnitude.",
        inputs: [
          { key: "R", label: "Star formation rate (per year)", min: 0.1, max: 5, value: 1.5, step: 0.1, unit: "" },
          { key: "fp", label: "Fraction of stars with planets", min: 0, max: 1, value: 0.9, step: 0.01, unit: "" },
          { key: "ne", label: "Habitable planets per such star", min: 0, max: 5, value: 0.4, step: 0.1, unit: "" },
          { key: "fl", label: "Fraction that develop life", min: 0, max: 1, value: 0.3, step: 0.01, unit: "" },
          { key: "fi", label: "Fraction that become intelligent", min: 0, max: 1, value: 0.1, step: 0.01, unit: "" },
          { key: "fc", label: "Fraction that signal", min: 0, max: 1, value: 0.2, step: 0.01, unit: "" },
          { key: "L", label: "Signalling lifetime (thousand yrs)", min: 0.1, max: 1e3, value: 10, step: 0.1, unit: "" }
        ],
        bands: [
          { max: 1, label: "likely alone", colour: "#717d99" },
          { max: 10, label: "a handful of neighbours", colour: "#22d3ee" },
          { max: 1e3, label: "a busy galaxy", colour: "#2dd4bf" },
          { max: 1e12, label: "a crowded galaxy", colour: "#818cf8" }
        ]
      }
    }
  ],
  build(params, domId) {
    const inputs = (params.inputs || []).slice(0, 8);
    const mode = params.mode === "colour" ? "colour" : "number";
    const title = params.title ? `<div class="pg-mx-title">${esc(params.title)}</div>` : "";
    const caption = params.caption ? `<div class="pg-mx-caption">${esc(params.caption)}</div>` : "";
    const controls = inputs.map(
      (s) => `<div class="pg-field"><label for="${domId}-${esc(s.key)}">${esc(s.label)} <b data-val="${esc(s.key)}"></b></label><input id="${domId}-${esc(s.key)}" data-key="${esc(s.key)}" data-unit="${esc(s.unit || "")}" type="range" min="${s.min}" max="${s.max}" step="${s.step || 1}" value="${s.value}"></div>`
    ).join("");
    const outputPanel = mode === "colour" ? `<div class="pg-mx-swatch" data-role="swatch" role="img" aria-label="Mixed colour"></div><div class="pg-readout">hex <b data-role="out"></b></div>` : `<div class="pg-readout pg-mx-number"><b data-role="out"></b></div><div class="pg-mx-verdict" data-role="verdict" aria-live="polite"></div>`;
    const html = `<div class="pg-stage">${title}<div class="pg-mx-grid"><div class="pg-mx-out">${outputPanel}${caption}</div><div class="pg-controls">${controls}</div></div></div>`;
    const css = [
      `#${domId} .pg-mx-title{font-size:.9rem;color:var(--ink-dim,#9fb3c8);margin:0 0 .7rem}`,
      `#${domId} .pg-mx-grid{display:grid;grid-template-columns:1fr 1.3fr;gap:1.2rem;align-items:center}`,
      `#${domId} .pg-mx-out{text-align:center}`,
      `#${domId} .pg-mx-swatch{width:100%;min-height:120px;border-radius:12px;border:1px solid var(--line,#23304a);background:#000;transition:background .25s ease}`,
      `#${domId} .pg-mx-out .pg-readout{margin-top:.6rem}`,
      `#${domId} .pg-mx-number{font-size:1.4rem}`,
      `#${domId} .pg-mx-verdict{margin:.4rem 0 0;font-weight:600}`,
      `#${domId} .pg-mx-caption{color:var(--ink-faint,#717d99);font-size:.8rem;margin-top:.5rem}`,
      `#${domId} .pg-controls{display:grid;gap:.9rem}`,
      `#${domId} label b{color:#fff}`,
      `@media(max-width:620px){#${domId} .pg-mx-grid{grid-template-columns:1fr}}`
    ].join("\n");
    const jsBody = `
var inputs=$$('input[type=range]'),out=$('[data-role=out]'),swatch=$('[data-role=swatch]'),verdict=$('[data-role=verdict]');
if(!inputs.length)return;
var mode=CONFIG.mode==='colour'?'colour':'number';
var MKEYS=(CONFIG.inputs||[]).map(function(s){return s.key;}).filter(function(k){return /^[A-Za-z_$][\\w$]*$/.test(k);});
function mk(expr){try{var pre=MKEYS.map(function(k){return 'var '+k+'=V['+JSON.stringify(k)+'];';}).join('');return new Function('V','Math',pre+'return ('+(expr||'0')+');');}catch(e){return function(){return 0;};}}
var fnN=mk(CONFIG.expr||'0');
var fnC=mk(CONFIG.swatchExpr?('('+CONFIG.swatchExpr+')'):"'#000'");
function vars(){var V={};inputs.forEach(function(i){var k=i.getAttribute('data-key');V[k]=parseFloat(i.value);var b=$('[data-val="'+k+'"]');if(b)b.textContent=i.value+(i.getAttribute('data-unit')||'');});return V;}
function toHex(css){
  try{var d=document.createElement('span');d.style.color='';d.style.color=css;document.body.appendChild(d);
    var c=getComputedStyle(d).color;document.body.removeChild(d);
    var m=c.match(/rgba?\\(([^)]+)\\)/);if(!m)return css;
    var p=m[1].split(',');function h(n){n=Math.max(0,Math.min(255,Math.round(parseFloat(n))));var s=n.toString(16);return s.length<2?'0'+s:s;}
    return '#'+h(p[0])+h(p[1])+h(p[2]);
  }catch(e){return css;}
}
function bandFor(v){var bs=CONFIG.bands||[];if(!bs.length)return null;var ch=bs[bs.length-1];for(var i=0;i<bs.length;i++){if(v<=bs[i].max){ch=bs[i];break;}}return ch;}
function render(){
  var V=vars();
  if(mode==='colour'){
    var col='#000';try{col=fnC(V,Math);}catch(e){}
    if(swatch)swatch.style.background=col;
    if(out)out.textContent=toHex(col);
  }else{
    var val=0;try{val=fnN(V,Math);}catch(e){}
    var dec=CONFIG.decimals;dec=(dec==null?0:dec);
    if(out)out.textContent=(isFinite(val)?val.toFixed(dec):'\u2013')+(CONFIG.unit||'');
    if(verdict){var ch=bandFor(val);if(ch){verdict.textContent=ch.label||'';verdict.style.color=ch.colour||'#22d3ee';}else{verdict.textContent='';}}
  }
}
inputs.forEach(function(i){i.addEventListener('input',render);});
render();
`;
    return { html, css, jsBody };
  }
};

// server/playgrounds/stopwatch.js
var stageSchema2 = {
  type: "object",
  additionalProperties: false,
  required: ["at", "text"],
  properties: {
    at: { type: "number", title: "Modelled time (seconds) at which this line appears" },
    text: { type: "string", title: "Commentary revealed as the clock passes this mark" }
  }
};
var runSchema = {
  type: "object",
  additionalProperties: false,
  required: ["label", "seconds"],
  properties: {
    label: { type: "string", title: "Button label" },
    seconds: { type: "number", title: "Target modelled time (seconds)" },
    accent: { type: "string", title: "Accent colour (hex)", default: "#22d3ee" },
    stages: {
      type: "array",
      title: "Staged commentary",
      maxItems: 8,
      items: stageSchema2
    }
  }
};
var stopwatch_default = {
  id: "stopwatch",
  name: "Stopwatch",
  category: "narrative",
  description: 'A timed SVG stopwatch that animates to a target, emitting staged commentary at milestones. For "feel how fast/slow" pieces.',
  paramsSchema: {
    type: "object",
    additionalProperties: false,
    required: ["runs"],
    properties: {
      title: { type: "string", title: "Optional label above the stopwatch" },
      runs: { type: "array", minItems: 1, maxItems: 4, items: runSchema },
      resetLabel: { type: "string", title: "Reset button label", default: "Reset" },
      compareLine: { type: "string", title: "Optional standing caption under the clock" }
    }
  },
  presets: [
    {
      name: "The 28-second leg",
      params: {
        title: "How long did the amputation take?",
        compareLine: "Robert Liston operated for speed, in the years before anaesthesia made speed beside the point.",
        runs: [
          {
            label: "Liston, 1846",
            seconds: 28,
            accent: "#f472b6",
            stages: [
              { at: 0, text: "Knife to skin. The patient is awake, held down, and counting." },
              { at: 8, text: "Through the muscle in one circular sweep \u2014 no pause to look." },
              { at: 16, text: "The saw takes the femur; an assistant clamps the great vessels." },
              { at: 24, text: "Flap drawn over, first ligature thrown." },
              { at: 28, text: "Done. Twenty-eight seconds, and the leg is off." }
            ]
          },
          {
            label: "The modern way",
            seconds: 5400,
            accent: "#2dd4bf",
            stages: [
              { at: 0, text: "Anaesthetised, prepped, draped. Nobody is in a hurry." },
              { at: 600, text: "Tourniquet up; tissues divided in unhurried layers." },
              { at: 2400, text: "Vessels and nerves handled individually, named and tied." },
              { at: 4200, text: "Bone cut, edges smoothed, a myoplastic flap fashioned." },
              { at: 5400, text: "Closed in layers over a drain. Ninety minutes, and it will heal." }
            ]
          }
        ]
      }
    },
    {
      name: "Sprint vs marathon pace",
      params: {
        title: "A kilometre, two ways",
        compareLine: "Same distance; the clock tells two completely different stories.",
        runs: [
          {
            label: "Sprint pace",
            seconds: 150,
            accent: "#22d3ee",
            stages: [
              { at: 0, text: "Off the line at near-maximal effort." },
              { at: 60, text: "Lactate climbing; this cannot last." },
              { at: 150, text: "A kilometre in 2:30. Unsustainable, and that is the point." }
            ]
          },
          {
            label: "Marathon pace",
            seconds: 270,
            accent: "#818cf8",
            stages: [
              { at: 0, text: "Settle into a rhythm that could run for hours." },
              { at: 135, text: "Breathing easy, well inside the aerobic ceiling." },
              { at: 270, text: "A kilometre in 4:30 \u2014 repeatable forty-two times over." }
            ]
          }
        ]
      }
    }
  ],
  build(params, domId) {
    const runs = (params.runs || []).slice(0, 4);
    const title = params.title ? `<div class="pg-sw-title">${esc(params.title)}</div>` : "";
    const compare = params.compareLine ? `<div class="pg-sw-compare">${esc(params.compareLine)}</div>` : "";
    const resetLabel = params.resetLabel || "Reset";
    const buttons = runs.map(
      (r, i) => `<button type="button" data-role="run" data-idx="${i}" class="pg-sw-btn">${esc(r.label)}</button>`
    ).join("");
    const dial = `<svg viewBox="0 0 200 200" role="img" aria-label="Stopwatch dial with a sweeping hand and progress ring" class="pg-sw-dial"><circle cx="100" cy="100" r="84" fill="none" stroke="#23304a" stroke-width="3"/><circle data-role="ring" cx="100" cy="100" r="70" fill="none" stroke="#22d3ee" stroke-width="6" stroke-linecap="round" transform="rotate(-90 100 100)" stroke-dasharray="439.82" stroke-dashoffset="439.82"/><g data-role="marks"></g><line data-role="hand" x1="100" y1="100" x2="100" y2="30" stroke="#fff" stroke-width="3" stroke-linecap="round"/><circle cx="100" cy="100" r="6" fill="#fff"/><text data-role="time" x="100" y="150" fill="#fff" font-size="22" font-family="monospace" text-anchor="middle">0:00</text></svg>`;
    const html = `<div class="pg-stage">${title}<div class="pg-sw-grid">${dial}<div class="pg-sw-side"><div class="pg-readout"><b data-role="status">Ready</b></div><div class="pg-sw-log" data-role="log" aria-live="polite"></div></div></div>${compare}<div class="pg-controls pg-sw-controls" role="group" aria-label="Run the stopwatch">` + buttons + `<button type="button" data-role="reset" class="pg-sw-btn pg-sw-reset">${esc(resetLabel)}</button></div></div>`;
    const css = [
      `#${domId} .pg-sw-title{font-size:.9rem;color:var(--ink-dim,#9fb3c8);margin:0 0 .7rem}`,
      `#${domId} .pg-sw-grid{display:grid;grid-template-columns:auto 1fr;gap:1.2rem;align-items:center}`,
      `#${domId} .pg-sw-dial{width:180px;max-width:40vw;height:auto;display:block}`,
      `#${domId} .pg-sw-ring,#${domId} [data-role=ring]{transition:stroke .2s}`,
      `#${domId} .pg-sw-side{min-width:0}`,
      `#${domId} [data-role=status]{color:#fff}`,
      `#${domId} .pg-sw-log{margin-top:.7rem;display:grid;gap:.45rem}`,
      `#${domId} .pg-sw-stage{color:var(--ink-dim,#9fb3c8);font-size:.92rem;border-left:2px solid var(--line,#23304a);padding-left:.7rem;opacity:0;transform:translateY(4px);transition:opacity .3s,transform .3s}`,
      `#${domId} .pg-sw-stage.is-shown{opacity:1;transform:none;border-left-color:var(--pg-sw-accent,#22d3ee)}`,
      `#${domId} .pg-sw-compare{color:var(--ink-faint,#717d99);font-size:.85rem;margin:.9rem 0 0;text-align:center}`,
      `#${domId} .pg-sw-controls{display:flex;flex-wrap:wrap;gap:.5rem;margin-top:1.1rem}`,
      `#${domId} .pg-sw-btn{appearance:none;background:transparent;border:1px solid var(--line,#23304a);border-radius:8px;padding:.5rem 1rem;color:var(--ink-dim,#9fb3c8);font:inherit;cursor:pointer;transition:.2s}`,
      `#${domId} .pg-sw-btn:hover{border-color:#22d3ee;color:#22d3ee}`,
      `#${domId} .pg-sw-btn.is-active{border-color:var(--pg-sw-accent,#22d3ee);color:var(--pg-sw-accent,#22d3ee);background:rgba(140,160,200,.08)}`,
      `#${domId} .pg-sw-btn:disabled{opacity:.45;cursor:default}`,
      `#${domId} .pg-sw-reset{margin-left:auto}`,
      `@media(max-width:620px){#${domId} .pg-sw-grid{grid-template-columns:1fr;justify-items:center}#${domId} .pg-sw-side{width:100%}#${domId} .pg-sw-reset{margin-left:0}}`
    ].join("\n");
    const jsBody = `
var E=function(s){return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');};
var runs=(CONFIG.runs||[]).slice(0,4);
if(!runs.length)return;
var dial=$('[data-role=time]'),hand=$('[data-role=hand]'),ring=$('[data-role=ring]'),marks=$('[data-role=marks]');
var status=$('[data-role=status]'),log=$('[data-role=log]'),resetBtn=$('[data-role=reset]');
var runBtns=$$('[data-role=run]');
var CIRC=439.82;
function fmt(s){s=Math.max(0,Math.round(s));var h=Math.floor(s/3600),m=Math.floor((s%3600)/60),x=s%60;function p(n){return(n<10?'0':'')+n;}return h?(h+':'+p(m)+':'+p(x)):(m+':'+p(x));}
if(marks){var tk='';for(var k=0;k<12;k++){var a=k/12*Math.PI*2,c=Math.cos(a),sn=Math.sin(a);tk+='<line x1="'+(100+84*c).toFixed(1)+'" y1="'+(100+84*sn).toFixed(1)+'" x2="'+(100+76*c).toFixed(1)+'" y2="'+(100+76*sn).toFixed(1)+'" stroke="#3a4866" stroke-width="2"/>';}marks.innerHTML=tk;}
var raf=0,activeIdx=-1;
function cancel(){if(raf){(window.cancelAnimationFrame||function(){})(raf);raf=0;}}
function setAccent(c){root.style.setProperty('--pg-sw-accent',c||'#22d3ee');if(ring)ring.setAttribute('stroke',c||'#22d3ee');if(hand)hand.setAttribute('stroke',c||'#fff');}
function draw(frac,modelled){
  frac=frac<0?0:frac>1?1:frac;
  if(ring)ring.setAttribute('stroke-dashoffset',(CIRC*(1-frac)).toFixed(2));
  if(hand){var ang=frac*Math.PI*2,len=70,cx=100,cy=100;var ex=cx+len*Math.sin(ang),ey=cy-len*Math.cos(ang);hand.setAttribute('x2',ex.toFixed(1));hand.setAttribute('y2',ey.toFixed(1));}
  if(dial)dial.textContent=fmt(modelled);
}
function renderLog(run,shownTo){
  if(!log)return;
  var sts=(run.stages||[]);
  log.innerHTML=sts.map(function(s,i){return '<div class="pg-sw-stage'+(s.at<=shownTo?' is-shown':'')+'">'+E(s.text)+'</div>';}).join('');
}
function clearActive(){runBtns.forEach(function(b){b.classList.remove('is-active');b.disabled=false;});}
function reset(){
  cancel();activeIdx=-1;clearActive();
  setAccent('#22d3ee');draw(0,0);
  if(status)status.textContent='Ready';
  if(log)log.innerHTML='';
}
function start(idx){
  var run=runs[idx];if(!run)return;
  cancel();activeIdx=idx;
  clearActive();var btn=runBtns[idx];if(btn)btn.classList.add('is-active');
  setAccent(run.accent);
  var target=Math.max(0,Number(run.seconds)||0);
  // Map the modelled target to a short real animation: ~2s for tiny, ~5s for long.
  var realMs=Math.min(5000,Math.max(2000,Math.sqrt(target)*120));
  if(status)status.textContent='Running \u2014 '+(run.label||'');
  if(reduced){
    draw(1,target);renderLog(run,target);
    if(status)status.textContent='Done \u2014 '+fmt(target);
    return;
  }
  renderLog(run,-1);
  var t0=(window.performance&&performance.now)?performance.now():Date.now();
  function tick(now){
    var el=((window.performance&&performance.now)?now:Date.now())-t0;
    var frac=realMs?el/realMs:1;if(frac>1)frac=1;
    var modelled=frac*target;
    draw(frac,modelled);renderLog(run,modelled);
    if(frac<1){raf=(window.requestAnimationFrame||function(f){return setTimeout(function(){f(Date.now());},16);})(tick);}
    else{raf=0;if(status)status.textContent='Done \u2014 '+fmt(target);}
  }
  raf=(window.requestAnimationFrame||function(f){return setTimeout(function(){f(Date.now());},16);})(tick);
}
runBtns.forEach(function(b){b.addEventListener('click',function(){start(parseInt(b.getAttribute('data-idx'),10)||0);});});
if(resetBtn)resetBtn.addEventListener('click',reset);
reset();
`;
    return { html, css, jsBody };
  }
};

// server/playgrounds/lever-geometry.js
var rangeSchema = {
  type: "array",
  title: "Angle range [min, max] in degrees",
  minItems: 2,
  maxItems: 2,
  items: { type: "number" }
};
var bandSchema3 = {
  type: "object",
  additionalProperties: false,
  required: ["max", "label"],
  properties: {
    max: { type: "number", title: "Turning effect % up to which this band applies" },
    label: { type: "string", title: "Verdict text" },
    colour: { type: "string", title: "Verdict colour (hex)" }
  }
};
var lever_geometry_default = {
  id: "lever-geometry",
  name: "Lever geometry",
  category: "quantitative",
  description: "A pivot, an arm, and a line-of-pull \u2014 drag two angles to feel the moment arm. Turning-effect % + a banded verdict.",
  paramsSchema: {
    type: "object",
    additionalProperties: false,
    properties: {
      title: { type: "string", title: "Optional label above the diagram" },
      armLabel: { type: "string", title: "Arm slider label", default: "Arm angle" },
      pullLabel: { type: "string", title: "Pull slider label", default: "Pull angle" },
      armRange: rangeSchema,
      pullRange: rangeSchema,
      armValue: { type: "number", title: "Initial arm angle (deg)" },
      pullValue: { type: "number", title: "Initial pull angle (deg)" },
      pivot: {
        type: "object",
        additionalProperties: false,
        properties: { x: { type: "number" }, y: { type: "number" } }
      },
      length: { type: "number", title: "Arm length (SVG units)", default: 120 },
      outLabel: { type: "string", title: "Readout label", default: "turning effect" },
      bands: { type: "array", items: bandSchema3 }
    }
  },
  presets: [
    {
      name: "Rotator cuff lever",
      params: {
        title: "Why the cuff lifts the arm \u2014 and the geometry that lets it",
        armLabel: "Arm elevation",
        pullLabel: "Line of pull",
        armRange: [0, 150],
        pullRange: [0, 180],
        armValue: 20,
        pullValue: 110,
        outLabel: "lifting effect",
        bands: [
          { max: 20, label: "cannot lift \u2014 the pull runs almost along the bone, into the joint", colour: "#f472b6" },
          { max: 60, label: "some lift, but mostly compressing the joint", colour: "#fbbf24" },
          { max: 85, label: "good leverage \u2014 most of the pull turns the arm", colour: "#22d3ee" },
          { max: 100, label: "lifts cleanly \u2014 the pull is square to the bone", colour: "#2dd4bf" }
        ]
      }
    },
    {
      name: "Door hinge",
      params: {
        title: "Push near the hinge, or out at the handle?",
        armLabel: "Door angle",
        pullLabel: "Push direction",
        armRange: [0, 90],
        pullRange: [0, 180],
        armValue: 30,
        pullValue: 120,
        outLabel: "opening effect",
        bands: [
          { max: 25, label: "barely moves \u2014 you are pushing toward the hinge", colour: "#f472b6" },
          { max: 70, label: "opening, but wasting effort sideways", colour: "#fbbf24" },
          { max: 100, label: "swings open \u2014 push square to the door", colour: "#2dd4bf" }
        ]
      }
    }
  ],
  build(params, domId) {
    const title = params.title ? `<div class="pg-lv-title">${esc(params.title)}</div>` : "";
    const armLabel = params.armLabel || "Arm angle";
    const pullLabel = params.pullLabel || "Pull angle";
    const armRange = Array.isArray(params.armRange) ? params.armRange : [0, 180];
    const pullRange = Array.isArray(params.pullRange) ? params.pullRange : [0, 180];
    const armValue = params.armValue == null ? armRange[0] : params.armValue;
    const pullValue = params.pullValue == null ? Math.round((pullRange[0] + pullRange[1]) / 2) : params.pullValue;
    const outLabel = params.outLabel || "turning effect";
    const diagram = `<svg viewBox="0 0 280 260" role="img" aria-label="A pivot with an arm and a line of pull; the perpendicular moment arm is shown" class="pg-lv-svg"><line data-role="ground" x1="20" y1="220" x2="260" y2="220" stroke="#23304a" stroke-width="2"/><line data-role="moment" stroke="#818cf8" stroke-width="2" stroke-dasharray="4 4"/><line data-role="arm" stroke="#2dd4bf" stroke-width="6" stroke-linecap="round"/><line data-role="pull" stroke="#22d3ee" stroke-width="3" stroke-linecap="round" marker-end="url(#${domId}-arrow)"/><defs><marker id="${domId}-arrow" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto"><path d="M0,0 L6,3 L0,6 Z" fill="#22d3ee"/></marker></defs><circle data-role="pivot" r="6" fill="#fff" stroke="#04060c" stroke-width="2"/></svg>`;
    const html = `<div class="pg-stage">${title}<div class="pg-lv-grid">${diagram}<div class="pg-lv-side"><div class="pg-readout">${esc(outLabel)} <b data-role="out">0%</b></div><div class="pg-lv-verdict" data-role="verdict" aria-live="polite"></div></div></div><div class="pg-controls pg-lv-controls"><div class="pg-field"><label for="${domId}-arm">${esc(armLabel)} <b data-role="armval"></b></label><input id="${domId}-arm" data-role="arm-in" type="range" min="${armRange[0]}" max="${armRange[1]}" step="1" value="${armValue}"></div><div class="pg-field"><label for="${domId}-pull">${esc(pullLabel)} <b data-role="pullval"></b></label><input id="${domId}-pull" data-role="pull-in" type="range" min="${pullRange[0]}" max="${pullRange[1]}" step="1" value="${pullValue}"></div></div></div>`;
    const css = [
      `#${domId} .pg-lv-title{font-size:.9rem;color:var(--ink-dim,#9fb3c8);margin:0 0 .7rem}`,
      `#${domId} .pg-lv-grid{display:grid;grid-template-columns:1fr 1fr;gap:1rem;align-items:center}`,
      `#${domId} .pg-lv-svg{width:100%;height:auto;display:block}`,
      `#${domId} .pg-lv-side{min-width:0}`,
      `#${domId} .pg-lv-verdict{margin:.6rem 0 0;font-weight:600}`,
      `#${domId} .pg-lv-controls{display:grid;gap:.9rem;margin-top:1.1rem}`,
      `#${domId} label b{color:#fff}`,
      `@media(max-width:620px){#${domId} .pg-lv-grid{grid-template-columns:1fr}}`
    ].join("\n");
    const jsBody = `
var armIn=$('[data-role=arm-in]'),pullIn=$('[data-role=pull-in]');
var armEl=$('[data-role=arm]'),pullEl=$('[data-role=pull]'),momentEl=$('[data-role=moment]'),pivotEl=$('[data-role=pivot]');
var out=$('[data-role=out]'),verdict=$('[data-role=verdict]'),armVal=$('[data-role=armval]'),pullVal=$('[data-role=pullval]');
if(!armIn||!pullIn)return;
var P={x:140,y:170};
if(CONFIG.pivot){if(typeof CONFIG.pivot.x==='number')P.x=CONFIG.pivot.x;if(typeof CONFIG.pivot.y==='number')P.y=CONFIG.pivot.y;}
var LEN=(typeof CONFIG.length==='number'&&CONFIG.length>0)?CONFIG.length:120;
var RAD=Math.PI/180;
if(pivotEl){pivotEl.setAttribute('cx',P.x);pivotEl.setAttribute('cy',P.y);}
function tip(deg,len){return{x:P.x+Math.cos(-deg*RAD)*len,y:P.y+Math.sin(-deg*RAD)*len};}
function bands(){return (CONFIG.bands&&CONFIG.bands.length)?CONFIG.bands:[{max:100,label:'',colour:'#22d3ee'}];}
function redraw(){
  var arm=parseFloat(armIn.value)||0,pull=parseFloat(pullIn.value)||0;
  if(armVal)armVal.textContent=Math.round(arm)+'\\u00B0';
  if(pullVal)pullVal.textContent=Math.round(pull)+'\\u00B0';
  var aTip=tip(arm,LEN);
  if(armEl){armEl.setAttribute('x1',P.x);armEl.setAttribute('y1',P.y);armEl.setAttribute('x2',aTip.x.toFixed(1));armEl.setAttribute('y2',aTip.y.toFixed(1));}
  // pull vector drawn from the arm tip in the pull direction
  var pLen=70,pTip={x:aTip.x+Math.cos(-pull*RAD)*pLen,y:aTip.y+Math.sin(-pull*RAD)*pLen};
  if(pullEl){pullEl.setAttribute('x1',aTip.x.toFixed(1));pullEl.setAttribute('y1',aTip.y.toFixed(1));pullEl.setAttribute('x2',pTip.x.toFixed(1));pullEl.setAttribute('y2',pTip.y.toFixed(1));}
  // perpendicular moment arm = |length * sin(pull - arm)|, normalised to 0..100%
  var moment=Math.abs(LEN*Math.sin((pull-arm)*RAD));
  var pct=Math.round(Math.max(0,Math.min(1,moment/LEN))*100);
  // dashed perpendicular from pivot to the line of pull (foot of perpendicular)
  if(momentEl){
    var d=(pull-arm)*RAD,perp=LEN*Math.sin(d);
    var fx=aTip.x+Math.cos(-pull*RAD)*(-LEN*Math.cos(d)),fy=aTip.y+Math.sin(-pull*RAD)*(-LEN*Math.cos(d));
    momentEl.setAttribute('x1',P.x);momentEl.setAttribute('y1',P.y);momentEl.setAttribute('x2',fx.toFixed(1));momentEl.setAttribute('y2',fy.toFixed(1));
    momentEl.style.opacity=(Math.abs(perp)<2?'0':'1');
  }
  if(out)out.textContent=pct+'%';
  var bs=bands(),chosen=bs[bs.length-1];
  for(var i=0;i<bs.length;i++){if(pct<=bs[i].max){chosen=bs[i];break;}}
  if(verdict){verdict.textContent=chosen.label||'';verdict.style.color=chosen.colour||'#22d3ee';}
}
armIn.addEventListener('input',redraw);
pullIn.addEventListener('input',redraw);
redraw();
`;
    return { html, css, jsBody };
  }
};

// server/playgrounds/sortable-priority.js
var itemSchema2 = {
  type: "object",
  additionalProperties: false,
  required: ["label"],
  properties: {
    label: { type: "string", title: "Item label" },
    note: { type: "string", title: "Optional one-line note" }
  }
};
var sortable_priority_default = {
  id: "sortable-priority",
  name: "Sortable priority",
  category: "interactive",
  description: 'A reorderable list \u2014 the reader ranks a few items (drag, buttons, or keyboard) and a readout names their top pick. For reflective "what matters most" exercises.',
  paramsSchema: {
    type: "object",
    additionalProperties: false,
    required: ["items"],
    properties: {
      title: { type: "string", title: "Optional label above the list" },
      prompt: { type: "string", title: "Optional instruction line" },
      items: { type: "array", minItems: 2, maxItems: 8, items: itemSchema2 },
      readoutTemplate: { type: "string", title: "Readout text; {top} is replaced by the #1 item label" }
    }
  },
  presets: [
    {
      name: "What matters on a hard day",
      params: {
        title: "On a hard day, what matters most?",
        prompt: "Drag, or use the arrows, to put these in your order. There is no right answer.",
        readoutTemplate: "When it comes down to it, you put \u201C{top}\u201D first.",
        items: [
          { label: "Staying independent", note: "Doing things for yourself, in your own home." },
          { label: "Time with family", note: "The people who turn up, not the procedures." },
          { label: "Freedom from pain", note: "Comfort weighed against alertness." },
          { label: "Staying lucid", note: "Knowing where you are and who you are with." }
        ]
      }
    },
    {
      name: "Rank the priorities",
      params: {
        title: "Rank these priorities",
        prompt: "Reorder the list \u2014 top is most important.",
        readoutTemplate: "Your top priority right now: {top}.",
        items: [
          { label: "Speed" },
          { label: "Cost" },
          { label: "Quality" },
          { label: "Safety" }
        ]
      }
    }
  ],
  build(params, domId) {
    const items = (params.items || []).slice(0, 8);
    const title = params.title ? `<div class="pg-sp-title">${esc(params.title)}</div>` : "";
    const prompt = params.prompt ? `<div class="pg-sp-prompt">${esc(params.prompt)}</div>` : "";
    const rows = items.map(
      (it, i) => `<li class="pg-sp-row" draggable="true" tabindex="0" data-role="row" data-idx="${i}" aria-label="${esc(it.label)}, position ${i + 1} of ${items.length}. Use arrow keys to move."><span class="pg-sp-rank" data-role="rank">${i + 1}</span><span class="pg-sp-body"><span class="pg-sp-label">${esc(it.label)}</span>` + (it.note ? `<span class="pg-sp-note">${esc(it.note)}</span>` : "") + `</span><span class="pg-sp-moves"><button type="button" class="pg-sp-mv" data-role="up" aria-label="Move ${esc(it.label)} up">\u25B2</button><button type="button" class="pg-sp-mv" data-role="down" aria-label="Move ${esc(it.label)} down">\u25BC</button></span></li>`
    ).join("");
    const html = `<div class="pg-stage">${title}${prompt}<ol class="pg-sp-list" data-role="list" aria-label="Reorderable priority list">${rows}</ol><div class="pg-readout pg-sp-readout" data-role="readout" aria-live="polite"></div></div>`;
    const css = [
      `#${domId} .pg-sp-title{font-size:.9rem;color:var(--ink-dim,#9fb3c8);margin:0 0 .5rem}`,
      `#${domId} .pg-sp-prompt{color:var(--ink-faint,#717d99);font-size:.85rem;margin:0 0 .9rem}`,
      `#${domId} .pg-sp-list{list-style:none;margin:0;padding:0;display:grid;gap:.5rem}`,
      `#${domId} .pg-sp-row{display:flex;align-items:center;gap:.7rem;border:1px solid var(--line,#23304a);border-radius:10px;padding:.6rem .7rem;background:rgba(140,160,200,.05);cursor:grab}`,
      `#${domId} .pg-sp-row:focus{outline:2px solid var(--cyan,#22d3ee);outline-offset:2px}`,
      `#${domId} .pg-sp-row.is-drag{opacity:.45;cursor:grabbing}`,
      `#${domId} .pg-sp-row.is-over{border-color:var(--cyan,#22d3ee)}`,
      `#${domId} .pg-sp-rank{flex:0 0 auto;width:1.7rem;height:1.7rem;border-radius:99px;display:inline-flex;align-items:center;justify-content:center;font-weight:700;color:#04060c;background:var(--cyan,#22d3ee)}`,
      `#${domId} .pg-sp-body{flex:1 1 auto;display:flex;flex-direction:column;gap:.1rem;min-width:0}`,
      `#${domId} .pg-sp-label{color:#fff;font-weight:600}`,
      `#${domId} .pg-sp-note{color:var(--ink-faint,#717d99);font-size:.8rem}`,
      `#${domId} .pg-sp-moves{flex:0 0 auto;display:inline-flex;flex-direction:column;gap:.2rem}`,
      `#${domId} .pg-sp-mv{appearance:none;background:transparent;border:1px solid var(--line,#23304a);border-radius:6px;width:1.8rem;height:1.2rem;color:var(--ink-dim,#9fb3c8);font-size:.7rem;line-height:1;cursor:pointer;transition:.15s}`,
      `#${domId} .pg-sp-mv:hover{border-color:var(--cyan,#22d3ee);color:var(--cyan,#22d3ee)}`,
      `#${domId} .pg-sp-mv:disabled{opacity:.3;cursor:default}`,
      `#${domId} .pg-sp-readout{margin-top:1rem;color:var(--ink-dim,#9fb3c8)}`,
      `@media(max-width:620px){#${domId} .pg-sp-row{flex-wrap:wrap}#${domId} .pg-sp-moves{flex-direction:row}}`
    ].join("\n");
    const jsBody = `
var E=function(s){return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');};
var list=$('[data-role=list]'),readout=$('[data-role=readout]');
if(!list)return;
var tpl=CONFIG.readoutTemplate||'Your top pick: {top}.';
function rows(){return $$('[data-role=row]');}
function renumber(){
  var rs=rows();
  rs.forEach(function(r,i){
    var rk=r.querySelector('[data-role=rank]');if(rk)rk.textContent=String(i+1);
    var up=r.querySelector('[data-role=up]'),dn=r.querySelector('[data-role=down]');
    if(up)up.disabled=(i===0);
    if(dn)dn.disabled=(i===rs.length-1);
    var lbl=r.querySelector('.pg-sp-label');var name=lbl?lbl.textContent:'';
    r.setAttribute('aria-label',name+', position '+(i+1)+' of '+rs.length+'. Use arrow keys to move.');
  });
  if(readout){
    var first=rs[0],lbl=first&&first.querySelector('.pg-sp-label');
    var top=lbl?lbl.textContent:'';
    readout.textContent=tpl.replace('{top}',top);
  }
}
function moveUp(r){var p=r.previousElementSibling;if(p)list.insertBefore(r,p);renumber();}
function moveDown(r){var nx=r.nextElementSibling;if(nx)list.insertBefore(nx,r);renumber();}
list.addEventListener('click',function(e){
  var btn=e.target.closest&&e.target.closest('[data-role=up],[data-role=down]');
  if(!btn)return;
  var r=btn.closest('[data-role=row]');if(!r)return;
  if(btn.getAttribute('data-role')==='up')moveUp(r);else moveDown(r);
  r.focus();
});
list.addEventListener('keydown',function(e){
  var r=e.target&&e.target.closest&&e.target.closest('[data-role=row]');
  if(!r||e.target!==r)return;
  if(e.key==='ArrowUp'){e.preventDefault();moveUp(r);r.focus();}
  else if(e.key==='ArrowDown'){e.preventDefault();moveDown(r);r.focus();}
});
var dragRow=null;
list.addEventListener('dragstart',function(e){
  var r=e.target&&e.target.closest&&e.target.closest('[data-role=row]');
  if(!r)return;dragRow=r;r.classList.add('is-drag');
  if(e.dataTransfer){e.dataTransfer.effectAllowed='move';try{e.dataTransfer.setData('text/plain','x');}catch(_){}}
});
list.addEventListener('dragend',function(){
  if(dragRow)dragRow.classList.remove('is-drag');
  rows().forEach(function(r){r.classList.remove('is-over');});
  dragRow=null;renumber();
});
list.addEventListener('dragover',function(e){
  if(!dragRow)return;e.preventDefault();
  var over=e.target&&e.target.closest&&e.target.closest('[data-role=row]');
  rows().forEach(function(r){r.classList.toggle('is-over',r===over&&r!==dragRow);});
  if(!over||over===dragRow)return;
  var rs=rows();var di=rs.indexOf(dragRow),oi=rs.indexOf(over);
  if(di<oi)list.insertBefore(dragRow,over.nextElementSibling);else list.insertBefore(dragRow,over);
});
renumber();
`;
    return { html, css, jsBody };
  }
};

// server/playgrounds/quiz-reveal.js
var cardSchema = {
  type: "object",
  additionalProperties: false,
  required: ["prompt", "answer"],
  properties: {
    prompt: { type: "string", title: "The question / claim shown first" },
    answer: { type: "string", title: "The answer revealed on click" },
    detail: { type: "string", title: "Optional extra detail under the answer" }
  }
};
var quiz_reveal_default = {
  id: "quiz-reveal",
  name: "Quiz reveal",
  category: "narrative",
  description: 'Step through cards \u2014 each hides an answer behind a Reveal button, with Prev/Next and a "seen k of N" tally. For spot-the-error and test-yourself sets.',
  paramsSchema: {
    type: "object",
    additionalProperties: false,
    required: ["cards"],
    properties: {
      title: { type: "string", title: "Optional label above the cards" },
      cards: { type: "array", minItems: 1, maxItems: 20, items: cardSchema },
      revealLabel: { type: "string", title: "Reveal-button label", default: "Reveal" },
      scoreLabel: { type: "string", title: 'If set, shows a self-scored "I got it" button with this label' }
    }
  },
  presets: [
    {
      name: "Spot the error",
      params: {
        title: "Spot the error \u2014 myth or reality?",
        revealLabel: "Reveal the reality",
        cards: [
          { prompt: "A dislocated shoulder should be relocated as fast as possible, by anyone to hand.", answer: "Reality: relocate promptly, but only after assessing for fracture and neurovascular injury.", detail: "Yanking a fracture-dislocation can turn a reducible joint into a surgical one." },
          { prompt: "A normal X-ray rules out a scaphoid fracture.", answer: "Reality: early scaphoid fractures are often invisible on day-one films.", detail: "Treat the clinical suspicion; re-image or use MRI if tenderness persists." },
          { prompt: "RICE \u2014 rest, ice, compression, elevation \u2014 is the gold standard for every soft-tissue injury.", answer: "Reality: prolonged rest and icing are now questioned; early controlled loading aids recovery.", detail: "The acronym outlived much of its evidence." }
        ]
      }
    },
    {
      name: "Test yourself",
      params: {
        title: "Test yourself",
        revealLabel: "Show answer",
        scoreLabel: "I got it",
        cards: [
          { prompt: "Which nerve is most at risk in a surgical neck fracture of the humerus?", answer: "The axillary nerve.", detail: "Test the regimental badge area for sensation and deltoid for power." },
          { prompt: "What is the unhappy triad of the knee?", answer: "ACL, MCL, and medial meniscus injury.", detail: "Classically from a lateral blow to a planted, flexed knee." },
          { prompt: "Name the three-column concept used to assess thoracolumbar spine stability.", answer: "The Denis three-column model: anterior, middle, and posterior columns.", detail: "Two or more disrupted columns suggests instability." }
        ]
      }
    }
  ],
  build(params, domId) {
    const cards = (params.cards || []).slice(0, 20);
    const n = cards.length;
    const title = params.title ? `<div class="pg-qz-title">${esc(params.title)}</div>` : "";
    const revealLabel = esc(params.revealLabel || "Reveal");
    const hasScore = !!params.scoreLabel;
    const scoreLabel = esc(params.scoreLabel || "");
    const scoreBtn = hasScore ? `<button type="button" data-role="score" class="pg-qz-btn pg-qz-score">${scoreLabel}</button>` : "";
    const scoreOut = hasScore ? `<span class="pg-qz-tally">got <b data-role="gotcount">0</b>/<b data-role="seencount">0</b></span>` : `<span class="pg-qz-tally">seen <b data-role="seencount">0</b> of <b data-role="total">${n}</b></span>`;
    const html = `<div class="pg-stage">${title}<div class="pg-readout pg-qz-status"><span>card <b data-role="idx">1</b> of <b data-role="count">${n}</b></span>${scoreOut}</div><div class="pg-qz-card" data-role="card" aria-live="polite"><div class="pg-qz-prompt" data-role="prompt"></div><button type="button" data-role="reveal" class="pg-qz-btn pg-qz-reveal">${revealLabel}</button><div class="pg-qz-answer" data-role="answer" hidden><div class="pg-qz-ans-text" data-role="anstext"></div><div class="pg-qz-detail" data-role="detail"></div></div></div><div class="pg-controls pg-qz-controls"><div class="pg-qz-nav" role="group" aria-label="Step through cards"><button type="button" data-role="prev" class="pg-qz-btn">\u2039 Prev</button><button type="button" data-role="next" class="pg-qz-btn">Next \u203A</button></div>${scoreBtn}</div></div>`;
    const css = [
      `#${domId} .pg-qz-title{font-size:.9rem;color:var(--ink-dim,#9fb3c8);margin:0 0 .7rem}`,
      `#${domId} .pg-qz-status{display:flex;justify-content:space-between;gap:1rem;flex-wrap:wrap;margin-bottom:.8rem}`,
      `#${domId} .pg-qz-status b{color:#fff}`,
      `#${domId} .pg-qz-tally{color:var(--ink-faint,#717d99)}`,
      `#${domId} .pg-qz-card{border:1px solid var(--line,#23304a);border-radius:12px;padding:1.1rem;background:rgba(140,160,200,.05)}`,
      `#${domId} .pg-qz-prompt{color:#fff;font-weight:600;font-size:1.05rem;margin-bottom:.9rem}`,
      `#${domId} .pg-qz-answer{margin-top:.9rem;border-top:1px dashed var(--line,#23304a);padding-top:.9rem}`,
      `#${domId} .pg-qz-ans-text{color:var(--cyan,#22d3ee);font-weight:600}`,
      `#${domId} .pg-qz-detail{color:var(--ink-dim,#9fb3c8);font-size:.9rem;margin-top:.4rem}`,
      `#${domId} .pg-qz-btn{appearance:none;background:transparent;border:1px solid var(--line,#23304a);border-radius:8px;padding:.5rem 1.1rem;color:var(--ink-dim,#9fb3c8);font:inherit;cursor:pointer;transition:.2s}`,
      `#${domId} .pg-qz-btn:hover{border-color:var(--cyan,#22d3ee);color:var(--cyan,#22d3ee)}`,
      `#${domId} .pg-qz-btn:disabled{opacity:.4;cursor:default}`,
      `#${domId} .pg-qz-reveal{border-color:var(--cyan,#22d3ee);color:var(--cyan,#22d3ee)}`,
      `#${domId} .pg-qz-score.is-got{border-color:#2dd4bf;color:#2dd4bf}`,
      `#${domId} .pg-qz-controls{display:flex;justify-content:space-between;gap:.6rem;flex-wrap:wrap;margin-top:1rem}`,
      `#${domId} .pg-qz-nav{display:inline-flex;gap:.5rem}`,
      `@media(max-width:620px){#${domId} .pg-qz-controls{flex-direction:column}#${domId} .pg-qz-nav{justify-content:space-between}}`
    ].join("\n");
    const jsBody = `
var E=function(s){return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');};
var cards=(CONFIG.cards||[]).slice(0,20);
var n=cards.length;
if(!n)return;
var maxIdx=n-1;
var hasScore=!!CONFIG.scoreLabel;
var promptEl=$('[data-role=prompt]'),reveal=$('[data-role=reveal]'),answer=$('[data-role=answer]');
var ansText=$('[data-role=anstext]'),detail=$('[data-role=detail]');
var prev=$('[data-role=prev]'),next=$('[data-role=next]');
var idxOut=$('[data-role=idx]'),seenOut=$('[data-role=seencount]'),gotOut=$('[data-role=gotcount]');
var scoreBtn=$('[data-role=score]');
var cur=0;
var seen={},got={};
function showAnswer(yes){
  if(answer)answer.hidden=!yes;
  if(reveal)reveal.disabled=yes;
  if(yes){seen[cur]=true;}
  if(scoreBtn){scoreBtn.disabled=!yes;scoreBtn.classList.toggle('is-got',!!got[cur]);}
  updateTally();
}
function countOf(o){var c=0;for(var k in o)if(o[k])c++;return c;}
function updateTally(){
  if(seenOut)seenOut.textContent=String(countOf(seen));
  if(hasScore&&gotOut)gotOut.textContent=String(countOf(got));
}
function render(){
  cur=Math.max(0,Math.min(maxIdx,cur|0));
  var c=cards[cur]||{};
  if(promptEl)promptEl.textContent=c.prompt||'';
  if(ansText)ansText.textContent=c.answer||'';
  if(detail)detail.textContent=c.detail||'';
  if(idxOut)idxOut.textContent=String(cur+1);
  showAnswer(false);
  if(prev)prev.disabled=(cur<=0);
  if(next)next.disabled=(cur>=maxIdx);
}
function go(i){cur=i;render();}
if(reveal)reveal.addEventListener('click',function(){showAnswer(true);});
if(prev)prev.addEventListener('click',function(){go(cur-1);});
if(next)next.addEventListener('click',function(){go(cur+1);});
if(scoreBtn)scoreBtn.addEventListener('click',function(){
  if(!seen[cur])return;
  got[cur]=!got[cur];
  scoreBtn.classList.toggle('is-got',!!got[cur]);
  updateTally();
});
go(0);
`;
    return { html, css, jsBody };
  }
};

// server/playgrounds/chart-data.js
var pointSchema = {
  type: "object",
  additionalProperties: false,
  required: ["label", "value"],
  properties: {
    label: { type: "string", title: "X-axis label for this point" },
    value: { type: "number", title: "Y value" }
  }
};
var chart_data_default = {
  id: "chart-data",
  name: "Chart (data)",
  category: "quantitative",
  description: "A small dataset drawn as an SVG bar or line chart with axis labels \u2014 hover or tap a point to read its value. No external libraries.",
  paramsSchema: {
    type: "object",
    additionalProperties: false,
    required: ["data"],
    properties: {
      title: { type: "string", title: "Optional label above the chart" },
      kind: { type: "string", enum: ["bar", "line"], default: "bar" },
      xLabel: { type: "string", title: "Optional x-axis label" },
      yLabel: { type: "string", title: "Optional y-axis label" },
      unit: { type: "string", title: "Optional unit suffix on values", default: "" },
      data: { type: "array", minItems: 2, maxItems: 12, items: pointSchema }
    }
  },
  presets: [
    {
      name: "Bar chart",
      params: {
        title: "Cases by region",
        kind: "bar",
        xLabel: "Region",
        yLabel: "Cases",
        unit: "",
        data: [
          { label: "North", value: 42 },
          { label: "East", value: 58 },
          { label: "South", value: 35 },
          { label: "West", value: 64 },
          { label: "Central", value: 49 }
        ]
      }
    },
    {
      name: "Line trend",
      params: {
        title: "Range of movement over rehab",
        kind: "line",
        xLabel: "Week",
        yLabel: "Degrees",
        unit: "\xB0",
        data: [
          { label: "Wk 1", value: 40 },
          { label: "Wk 2", value: 65 },
          { label: "Wk 3", value: 90 },
          { label: "Wk 4", value: 110 },
          { label: "Wk 6", value: 135 },
          { label: "Wk 8", value: 155 }
        ]
      }
    }
  ],
  build(params, domId) {
    const kind = params.kind === "line" ? "line" : "bar";
    const title = params.title ? `<div class="pg-ch-title">${esc(params.title)}</div>` : "";
    const xLabel = params.xLabel ? `<div class="pg-ch-xlabel">${esc(params.xLabel)}</div>` : "";
    const yLabel = params.yLabel ? `<text class="pg-ch-ylabel" x="14" y="20" fill="#717d99" font-size="11" transform="rotate(-90 14 20)" text-anchor="end">${esc(params.yLabel)}</text>` : "";
    const html = `<div class="pg-stage">${title}<svg viewBox="0 0 380 230" role="img" aria-label="${esc((params.title || "Data") + " chart")}" class="pg-ch-svg"><line x1="44" y1="200" x2="364" y2="200" stroke="#3a4866"/><line x1="44" y1="14" x2="44" y2="200" stroke="#3a4866"/><g data-role="gridlabels"></g>` + yLabel + `<g data-role="plot"></g><g data-role="xticks"></g></svg>${xLabel}<div class="pg-readout pg-ch-readout" data-role="readout" aria-live="polite">Hover or tap a point to read its value.</div></div>`;
    const css = [
      `#${domId} .pg-ch-title{font-size:.9rem;color:var(--ink-dim,#9fb3c8);margin:0 0 .7rem}`,
      `#${domId} .pg-ch-svg{width:100%;height:auto;display:block}`,
      `#${domId} .pg-ch-xlabel{font-size:.78rem;color:var(--ink-faint,#717d99);text-align:center;margin:.3rem 0 0}`,
      `#${domId} .pg-ch-bar{fill:var(--cyan,#22d3ee);cursor:pointer;transition:fill .15s}`,
      `#${domId} .pg-ch-bar:hover,#${domId} .pg-ch-bar:focus{fill:#2dd4bf;outline:none}`,
      `#${domId} .pg-ch-line{fill:none;stroke:var(--cyan,#22d3ee);stroke-width:2.4}`,
      `#${domId} .pg-ch-dot{fill:#2dd4bf;stroke:#04060c;stroke-width:2;cursor:pointer;transition:r .15s}`,
      `#${domId} .pg-ch-dot:hover,#${domId} .pg-ch-dot:focus{fill:#818cf8;outline:none}`,
      `#${domId} .pg-ch-xt{fill:var(--ink-faint,#717d99);font-size:9px}`,
      `#${domId} .pg-ch-gl{fill:var(--ink-faint,#717d99);font-size:9px}`,
      `#${domId} .pg-ch-readout{margin-top:.7rem;color:var(--ink-dim,#9fb3c8)}`,
      `#${domId} .pg-ch-readout b{color:#fff}`,
      `@media(max-width:620px){#${domId} .pg-ch-xt{font-size:8px}}`
    ].join("\n");
    const jsBody = `
var E=function(s){return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');};
var data=(CONFIG.data||[]).slice(0,12).filter(function(d){return d&&typeof d.value==='number'&&isFinite(d.value);});
var n=data.length;
if(!n)return;
var kind=CONFIG.kind==='line'?'line':'bar';
var unit=CONFIG.unit||'';
var plot=$('[data-role=plot]'),xticks=$('[data-role=xticks]'),grid=$('[data-role=gridlabels]'),readout=$('[data-role=readout]');
if(!plot)return;
var NS='http://www.w3.org/2000/svg';
var x0=44,x1=364,yTop=14,yBot=200;
var vals=data.map(function(d){return d.value;});
var maxV=Math.max.apply(null,vals),minV=Math.min.apply(null,vals);
if(kind==='bar'){minV=Math.min(0,minV);}
if(maxV===minV){maxV=minV+1;}
function ny(v){return yBot-((v-minV)/(maxV-minV))*(yBot-yTop);}
function fmt(v){var r=Math.round(v*100)/100;return (r%1===0?String(r):String(r))+unit;}
function show(d){if(readout)readout.innerHTML=E(d.label)+': <b>'+E(fmt(d.value))+'</b>';}
function clear(){if(readout)readout.textContent='Hover or tap a point to read its value.';}
// y-axis gridline labels (min / mid / max)
if(grid){
  var g='';var mid=(minV+maxV)/2;
  [maxV,mid,minV].forEach(function(v){
    var y=ny(v);
    g+='<line x1="44" y1="'+y.toFixed(1)+'" x2="364" y2="'+y.toFixed(1)+'" stroke="#23304a" stroke-dasharray="2 4"/>';
    g+='<text class="pg-ch-gl" x="40" y="'+(y+3).toFixed(1)+'" text-anchor="end">'+E(fmt(v))+'</text>';
  });
  grid.innerHTML=g;
}
// x positions
var span=x1-x0;
function cx(i){return n===1?(x0+span/2):(x0+(i/(n-1))*span);}
function bandCx(i){var bw=span/n;return x0+bw*i+bw/2;}
// x tick labels
if(xticks){
  var xt='';data.forEach(function(d,i){
    var x=(kind==='bar')?bandCx(i):cx(i);
    xt+='<text class="pg-ch-xt" x="'+x.toFixed(1)+'" y="214" text-anchor="middle">'+E(d.label)+'</text>';
  });
  xticks.innerHTML=xt;
}
plot.innerHTML='';
function focusable(el,d){
  el.setAttribute('tabindex','0');
  el.setAttribute('role','img');
  el.setAttribute('aria-label',d.label+': '+fmt(d.value));
  el.addEventListener('mouseenter',function(){show(d);});
  el.addEventListener('mouseleave',clear);
  el.addEventListener('focus',function(){show(d);});
  el.addEventListener('blur',clear);
  el.addEventListener('click',function(){show(d);});
  el.addEventListener('touchstart',function(){show(d);},{passive:true});
}
if(kind==='bar'){
  var bw=span/n,zeroY=ny(Math.max(0,minV)<=0?0:minV);
  var baseY=ny(minV<0?0:minV);
  data.forEach(function(d,i){
    var bx=x0+bw*i+bw*0.18,w=bw*0.64;
    var top=ny(d.value);
    var by=Math.min(top,baseY),h=Math.abs(baseY-top);
    var rect=document.createElementNS(NS,'rect');
    rect.setAttribute('class','pg-ch-bar');
    rect.setAttribute('x',bx.toFixed(1));
    rect.setAttribute('y',by.toFixed(1));
    rect.setAttribute('width',w.toFixed(1));
    rect.setAttribute('height',Math.max(0,h).toFixed(1));
    rect.setAttribute('rx','2');
    focusable(rect,d);
    plot.appendChild(rect);
  });
}else{
  var pts=data.map(function(d,i){return cx(i).toFixed(1)+','+ny(d.value).toFixed(1);}).join(' ');
  var pl=document.createElementNS(NS,'polyline');
  pl.setAttribute('class','pg-ch-line');
  pl.setAttribute('points',pts);
  plot.appendChild(pl);
  data.forEach(function(d,i){
    var c=document.createElementNS(NS,'circle');
    c.setAttribute('class','pg-ch-dot');
    c.setAttribute('cx',cx(i).toFixed(1));
    c.setAttribute('cy',ny(d.value).toFixed(1));
    c.setAttribute('r','4.5');
    focusable(c,d);
    plot.appendChild(c);
  });
}
`;
    return { html, css, jsBody };
  }
};

// server/playgrounds/before-after.js
var before_after_default = {
  id: "before-after",
  name: "Before / after wipe",
  category: "comparison",
  description: 'A draggable wipe slider revealing a "before" state on one side and an "after" on the other. SVG/HTML snippets per side, or image URLs.',
  paramsSchema: {
    type: "object",
    additionalProperties: false,
    properties: {
      title: { type: "string", title: "Optional label above the slider" },
      beforeLabel: { type: "string", title: "Corner label for the before side", default: "Before" },
      afterLabel: { type: "string", title: "Corner label for the after side", default: "After" },
      beforeHtml: { type: "string", title: "Inline SVG/HTML for the before side" },
      afterHtml: { type: "string", title: "Inline SVG/HTML for the after side" },
      beforeImg: { type: "string", title: "Image URL for the before side (overrides beforeHtml)" },
      afterImg: { type: "string", title: "Image URL for the after side (overrides afterHtml)" }
    }
  },
  presets: [
    {
      name: "Solid vs hollow",
      params: {
        title: "Solid bar versus a hollow tube of the same outer size",
        beforeLabel: "Solid",
        afterLabel: "Hollow",
        beforeHtml: '<svg viewBox="0 0 200 200" width="100%" height="100%" preserveAspectRatio="xMidYMid meet" role="img" aria-label="A solid circular cross-section"><circle cx="100" cy="100" r="70" fill="#2dd4bf" stroke="#0c4a45" stroke-width="3"/></svg>',
        afterHtml: '<svg viewBox="0 0 200 200" width="100%" height="100%" preserveAspectRatio="xMidYMid meet" role="img" aria-label="A hollow circular cross-section"><circle cx="100" cy="100" r="70" fill="#22d3ee" stroke="#0c4a45" stroke-width="3"/><circle cx="100" cy="100" r="42" fill="#04060c"/></svg>'
      }
    },
    {
      name: "Before / after",
      params: {
        title: "Drag the handle to compare the two states",
        beforeLabel: "Before",
        afterLabel: "After",
        beforeHtml: '<svg viewBox="0 0 200 200" width="100%" height="100%" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Before panel"><rect width="200" height="200" fill="#1e293b"/><rect x="30" y="120" width="140" height="14" rx="7" fill="#475569"/><rect x="30" y="150" width="90" height="14" rx="7" fill="#475569"/></svg>',
        afterHtml: '<svg viewBox="0 0 200 200" width="100%" height="100%" preserveAspectRatio="xMidYMid meet" role="img" aria-label="After panel"><rect width="200" height="200" fill="#0f2d2a"/><rect x="30" y="120" width="140" height="14" rx="7" fill="#2dd4bf"/><rect x="30" y="150" width="90" height="14" rx="7" fill="#22d3ee"/></svg>'
      }
    }
  ],
  build(params, domId) {
    const title = params.title ? `<div class="pg-bw-title">${esc(params.title)}</div>` : "";
    const beforeLabel = params.beforeLabel || "Before";
    const afterLabel = params.afterLabel || "After";
    const beforeInner = params.beforeImg ? `<img src="${esc(params.beforeImg)}" alt="${esc(beforeLabel)}" class="pg-bw-img">` : params.beforeHtml || '<svg viewBox="0 0 200 200" width="100%" height="100%" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Before"><rect width="200" height="200" fill="#1e293b"/></svg>';
    const afterInner = params.afterImg ? `<img src="${esc(params.afterImg)}" alt="${esc(afterLabel)}" class="pg-bw-img">` : params.afterHtml || '<svg viewBox="0 0 200 200" width="100%" height="100%" preserveAspectRatio="xMidYMid meet" role="img" aria-label="After"><rect width="200" height="200" fill="#0f2d2a"/></svg>';
    const html = `<div class="pg-stage">${title}<div class="pg-bw-frame" data-role="frame"><div class="pg-bw-after">${afterInner}<span class="pg-bw-tag pg-bw-tag-r">${esc(afterLabel)}</span></div><div class="pg-bw-before" data-role="before"><div class="pg-bw-beforeinner" data-role="beforeinner">${beforeInner}<span class="pg-bw-tag pg-bw-tag-l">${esc(beforeLabel)}</span></div></div><div class="pg-bw-handle" data-role="handle" aria-hidden="true"><span class="pg-bw-grip"></span></div></div><div class="pg-controls pg-bw-controls"><div class="pg-field"><label for="${domId}-wipe">Wipe position <b data-role="pctval">50%</b></label><input id="${domId}-wipe" data-role="wipe" type="range" min="0" max="100" step="1" value="50" aria-label="Wipe position"></div></div></div>`;
    const css = [
      `#${domId} .pg-bw-title{font-size:.9rem;color:var(--ink-dim,#9fb3c8);margin:0 0 .7rem}`,
      `#${domId} .pg-bw-frame{position:relative;width:100%;aspect-ratio:16/10;border:1px solid var(--line,#23304a);border-radius:12px;overflow:hidden;background:#04060c;touch-action:none;user-select:none;cursor:ew-resize}`,
      `#${domId} .pg-bw-after,#${domId} .pg-bw-before{position:absolute;inset:0}`,
      `#${domId} .pg-bw-before{width:50%;overflow:hidden;border-right:2px solid var(--cyan,#22d3ee)}`,
      `#${domId} .pg-bw-beforeinner{position:absolute;inset:0;width:var(--pg-bw-w,100%);height:100%}`,
      `#${domId} .pg-bw-after>svg,#${domId} .pg-bw-beforeinner>svg{position:absolute;inset:0;width:100%;height:100%;display:block}`,
      `#${domId} .pg-bw-img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;display:block}`,
      `#${domId} .pg-bw-tag{position:absolute;bottom:.6rem;font-size:.75rem;letter-spacing:.04em;text-transform:uppercase;color:#fff;background:rgba(4,6,12,.7);border:1px solid var(--line,#23304a);border-radius:99px;padding:.2rem .7rem}`,
      `#${domId} .pg-bw-tag-l{left:.6rem}`,
      `#${domId} .pg-bw-tag-r{right:.6rem}`,
      `#${domId} .pg-bw-handle{position:absolute;top:0;bottom:0;left:50%;width:40px;margin-left:-20px;display:flex;align-items:center;justify-content:center;cursor:ew-resize}`,
      `#${domId} .pg-bw-handle::before{content:"";position:absolute;top:0;bottom:0;left:50%;width:2px;margin-left:-1px;background:var(--cyan,#22d3ee)}`,
      `#${domId} .pg-bw-grip{position:relative;width:34px;height:34px;border-radius:50%;background:#04060c;border:2px solid var(--cyan,#22d3ee);box-shadow:0 0 12px rgba(34,211,238,.5)}`,
      `#${domId} .pg-bw-grip::before{content:"";position:absolute;top:50%;left:50%;width:14px;height:9px;margin:-4.5px 0 0 -7px;background:linear-gradient(90deg,var(--cyan,#22d3ee) 0 35%,transparent 35% 65%,var(--cyan,#22d3ee) 65% 100%)}`,
      `#${domId} .pg-bw-controls{margin-top:1.1rem}`,
      `#${domId} label b{color:#fff}`,
      `@media(max-width:620px){#${domId} .pg-bw-frame{aspect-ratio:4/3}}`
    ].join("\n");
    const jsBody = `
var frame=$('[data-role=frame]'),before=$('[data-role=before]'),inner=$('[data-role=beforeinner]'),handle=$('[data-role=handle]'),wipe=$('[data-role=wipe]'),pctVal=$('[data-role=pctval]');
if(!frame||!before||!handle||!wipe)return;
function clamp(v){return v<0?0:(v>100?100:v);}
function set(pct){
  pct=clamp(pct);
  before.style.width=pct+'%';
  if(inner)inner.style.setProperty('--pg-bw-w', frame.clientWidth+'px');
  handle.style.left=pct+'%';
  if(pctVal)pctVal.textContent=Math.round(pct)+'%';
  if(parseFloat(wipe.value)!==pct)wipe.value=pct;
}
function fromEvent(e){
  var r=frame.getBoundingClientRect();
  var x=(e.touches&&e.touches[0]?e.touches[0].clientX:e.clientX)-r.left;
  return clamp(r.width>0?(x/r.width)*100:50);
}
var dragging=false;
function down(e){dragging=true;set(fromEvent(e));if(e.cancelable)e.preventDefault();}
function move(e){if(dragging)set(fromEvent(e));}
function up(){dragging=false;}
frame.addEventListener('pointerdown',down);
window.addEventListener('pointermove',move);
window.addEventListener('pointerup',up);
frame.addEventListener('touchstart',down,{passive:false});
window.addEventListener('touchmove',move,{passive:false});
window.addEventListener('touchend',up);
wipe.addEventListener('input',function(){set(parseFloat(wipe.value)||0);});
window.addEventListener('resize',function(){set(parseFloat(wipe.value)||50);});
set(50);
`;
    return { html, css, jsBody };
  }
};

// server/playgrounds/hotspots.js
var spotSchema = {
  type: "object",
  additionalProperties: false,
  required: ["x", "y", "label"],
  properties: {
    x: { type: "number", title: "X in viewBox coordinates" },
    y: { type: "number", title: "Y in viewBox coordinates" },
    label: { type: "string", title: "Marker label" },
    note: { type: "string", title: "Note shown when tapped" }
  }
};
var hotspots_default = {
  id: "hotspots",
  name: "Hotspots",
  category: "interactive",
  description: 'A diagram with tappable markers; tap to highlight and reveal a label + note, with an "x of n explored" tally. Default backdrop replaceable.',
  paramsSchema: {
    type: "object",
    additionalProperties: false,
    required: ["spots"],
    properties: {
      title: { type: "string", title: "Optional label above the diagram" },
      svg: { type: "string", title: "Inline SVG markup for the backdrop (optional)" },
      viewBox: { type: "string", title: "SVG viewBox", default: "0 0 400 300" },
      spots: { type: "array", minItems: 1, maxItems: 12, items: spotSchema }
    }
  },
  presets: [
    {
      name: "Labelled diagram",
      params: {
        title: "Tap each point to explore the diagram",
        viewBox: "0 0 400 300",
        spots: [
          { x: 200, y: 70, label: "Top", note: "The upper region of the shape \u2014 where load first arrives." },
          { x: 320, y: 150, label: "Right edge", note: "The right flank carries the outward thrust." },
          { x: 200, y: 230, label: "Base", note: "The base spreads the load into the foundation." },
          { x: 80, y: 150, label: "Left edge", note: "The left flank mirrors the right under symmetric load." }
        ]
      }
    },
    {
      name: "Anatomy points",
      params: {
        title: "A stylised joint \u2014 tap the labelled points",
        viewBox: "0 0 400 300",
        spots: [
          { x: 150, y: 90, label: "Head", note: "The rounded articular surface that sits in the socket." },
          { x: 250, y: 120, label: "Socket", note: "The shallow cup the head rotates within; depth aids stability." },
          { x: 130, y: 200, label: "Shaft", note: "The long bone that transmits load away from the joint." },
          { x: 280, y: 210, label: "Soft-tissue envelope", note: "Capsule and surrounding tissue that guide and restrain motion." }
        ]
      }
    }
  ],
  build(params, domId) {
    const title = params.title ? `<div class="pg-hs-title">${esc(params.title)}</div>` : "";
    const viewBox2 = params.viewBox || "0 0 400 300";
    const defaultSvg = `<rect x="40" y="40" width="320" height="220" rx="24" fill="#0d1626" stroke="#23304a" stroke-width="2"/><circle cx="200" cy="150" r="70" fill="none" stroke="#1c4f4a" stroke-width="2" stroke-dasharray="5 6"/><line x1="40" y1="150" x2="360" y2="150" stroke="#23304a" stroke-width="1"/><line x1="200" y1="40" x2="200" y2="260" stroke="#23304a" stroke-width="1"/>`;
    const backdrop = params.svg != null ? String(params.svg) : defaultSvg;
    const diagram = `<svg viewBox="${esc(viewBox2)}" role="img" aria-label="A diagram with tappable hotspots" class="pg-hs-svg" data-role="svg"><g data-role="backdrop">${backdrop}</g><g data-role="markers"></g></svg>`;
    const html = `<div class="pg-stage">${title}<div class="pg-hs-grid">${diagram}<div class="pg-hs-side"><div class="pg-hs-tally"><b data-role="explored">0</b> of <b data-role="total">0</b> explored</div><div class="pg-hs-readout" data-role="readout" aria-live="polite"><div class="pg-hs-label" data-role="label">Tap a marker</div><div class="pg-hs-note" data-role="note">Each point reveals a short note here.</div></div></div></div></div>`;
    const css = [
      `#${domId} .pg-hs-title{font-size:.9rem;color:var(--ink-dim,#9fb3c8);margin:0 0 .7rem}`,
      `#${domId} .pg-hs-grid{display:grid;grid-template-columns:1.4fr 1fr;gap:1.2rem;align-items:center}`,
      `#${domId} .pg-hs-svg{width:100%;height:auto;display:block;background:#04060c;border:1px solid var(--line,#23304a);border-radius:12px}`,
      `#${domId} .pg-hs-side{min-width:0}`,
      `#${domId} .pg-hs-tally{color:var(--ink-faint,#717d99);font-size:.85rem;margin-bottom:.7rem}`,
      `#${domId} .pg-hs-tally b{color:var(--cyan,#22d3ee)}`,
      `#${domId} .pg-hs-readout{border-left:2px solid var(--line,#23304a);padding-left:.9rem}`,
      `#${domId} .pg-hs-label{color:#fff;font-weight:600;margin-bottom:.35rem}`,
      `#${domId} .pg-hs-note{color:var(--ink-dim,#9fb3c8);font-size:.92rem;line-height:1.45}`,
      `#${domId} .pg-hs-spot{cursor:pointer}`,
      `#${domId} .pg-hs-dot{fill:#04060c;stroke:var(--cyan,#22d3ee);stroke-width:2.5;transition:fill .2s,stroke .2s}`,
      `#${domId} .pg-hs-pulse{fill:var(--cyan,#22d3ee);opacity:.35;transform-origin:center;transform-box:fill-box}`,
      `#${domId} .pg-hs-spot:not(.is-seen) .pg-hs-pulse{animation:pg-hs-pulse-${domId} 2s ease-out infinite}`,
      `#${domId} .pg-hs-spot.is-active .pg-hs-dot{fill:var(--cyan,#22d3ee);stroke:#fff}`,
      `#${domId} .pg-hs-spot.is-seen .pg-hs-dot{stroke:#2dd4bf}`,
      `@keyframes pg-hs-pulse-${domId}{0%{transform:scale(1);opacity:.45}70%{transform:scale(2.6);opacity:0}100%{opacity:0}}`,
      `@media(prefers-reduced-motion:reduce){#${domId} .pg-hs-pulse{animation:none!important}}`,
      `@media(max-width:620px){#${domId} .pg-hs-grid{grid-template-columns:1fr}}`
    ].join("\n");
    const jsBody = `
var E=function(s){return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');};
var markers=$('[data-role=markers]'),labelEl=$('[data-role=label]'),noteEl=$('[data-role=note]'),exploredEl=$('[data-role=explored]'),totalEl=$('[data-role=total]');
if(!markers)return;
var spots=Array.isArray(CONFIG.spots)?CONFIG.spots:[];
var seen={};
var NS='http://www.w3.org/2000/svg';
function mk(tag,attrs){var el=document.createElementNS(NS,tag);for(var k in attrs)el.setAttribute(k,attrs[k]);return el;}
while(markers.firstChild)markers.removeChild(markers.firstChild);
if(totalEl)totalEl.textContent=spots.length;
function tally(){if(exploredEl)exploredEl.textContent=Object.keys(seen).length;}
function activate(i,g){
  $$('.pg-hs-spot').forEach(function(s){s.classList.remove('is-active');});
  g.classList.add('is-active');g.classList.add('is-seen');
  seen[i]=true;tally();
  var sp=spots[i]||{};
  if(labelEl)labelEl.textContent=sp.label||'';
  if(noteEl)noteEl.textContent=sp.note||'';
}
spots.forEach(function(sp,i){
  var x=Number(sp.x)||0,y=Number(sp.y)||0;
  var g=mk('g',{'class':'pg-hs-spot',tabindex:'0',role:'button','aria-label':(sp.label||('Point '+(i+1)))});
  g.appendChild(mk('circle',{'class':'pg-hs-pulse',cx:x,cy:y,r:10}));
  g.appendChild(mk('circle',{'class':'pg-hs-dot',cx:x,cy:y,r:9}));
  g.addEventListener('click',function(){activate(i,g);});
  g.addEventListener('keydown',function(e){if(e.key==='Enter'||e.key===' '){e.preventDefault();activate(i,g);}});
  markers.appendChild(g);
});
tally();
`;
    return { html, css, jsBody };
  }
};

// server/playgrounds/risk-grid.js
var risk_grid_default = {
  id: "risk-grid",
  name: "Risk grid",
  category: "data",
  description: "An icon-array pictograph \u2014 \u201CX in N\u201D shown as a grid of dots, with a slider to explore the rate. For risk and proportion.",
  paramsSchema: {
    type: "object",
    additionalProperties: false,
    required: ["total", "affected"],
    properties: {
      title: { type: "string", title: "Optional label above the grid" },
      total: { type: "number", title: "Total dots", default: 100, minimum: 10, maximum: 400 },
      affected: { type: "number", title: "Starting affected count", default: 5, minimum: 0 },
      columns: { type: "number", title: "Columns", default: 10, minimum: 4, maximum: 25 },
      unit: { type: "string", title: "Unit (e.g. people, patients)", default: "people" },
      affectedColour: { type: "string", title: "Affected colour (hex)", default: "#f472b6" },
      interactive: { type: "boolean", title: "Show the slider", default: true },
      caption: { type: "string", title: "One-line caption" }
    }
  },
  presets: [
    {
      name: "Surgical-site infection",
      params: {
        title: "Surgical-site infection after a clean elective case",
        total: 100,
        affected: 2,
        columns: 10,
        unit: "operations",
        affectedColour: "#f472b6",
        interactive: true,
        caption: "Illustrative \u2014 drag to see how the picture changes with the rate."
      }
    },
    {
      name: "1 in 1000",
      params: {
        title: "A 1-in-1000 risk, drawn out",
        total: 100,
        affected: 1,
        columns: 10,
        unit: "people",
        affectedColour: "#fbbf24",
        interactive: false,
        caption: "Even small risks look different when you can see them."
      }
    }
  ],
  build(params, domId) {
    const total = Math.max(10, Math.min(400, Math.round(params.total || 100)));
    const affected = Math.max(0, Math.min(total, Math.round(params.affected ?? 5)));
    const columns = Math.max(4, Math.min(25, Math.round(params.columns || 10)));
    const unit = esc(params.unit || "people");
    const colour = /^#[0-9a-fA-F]{3,8}$/.test(params.affectedColour || "") ? params.affectedColour : "#f472b6";
    const interactive = params.interactive !== false;
    const title = params.title ? `<div class="pg-rg-title">${esc(params.title)}</div>` : "";
    const caption = params.caption ? `<div class="pg-readout" data-role="cap">${esc(params.caption)}</div>` : "";
    const slider = interactive ? `<div class="pg-row"><label style="flex:1">Affected
           <input type="range" data-role="slider" min="0" max="${total}" value="${affected}" step="1" aria-label="Affected count"></label></div>` : "";
    const html = `<div class="pg-stage">${title}<div class="pg-rg-out pg-readout" data-role="out" aria-live="polite"></div><div class="pg-rg-grid" data-role="grid" role="img"></div>` + slider + caption + `</div>`;
    const css = [
      `#${domId} .pg-rg-title{font-size:.9rem;color:var(--ink-dim,#9fb3c8);margin:0 0 .7rem}`,
      `#${domId} .pg-rg-out{margin-bottom:.8rem;font-size:1rem}`,
      `#${domId} .pg-rg-out b{color:${colour};font-weight:700}`,
      `#${domId} .pg-rg-grid{display:grid;grid-template-columns:repeat(${columns},1fr);gap:4px;max-width:min(100%,${columns * 26}px)}`,
      `#${domId} .pg-rg-cell{aspect-ratio:1;border-radius:50%;background:rgba(140,160,200,.16);transition:background .18s,transform .18s}`,
      `#${domId} .pg-rg-cell.on{background:${colour};box-shadow:0 0 8px ${colour}66}`,
      `#${domId} .pg-rg-reduce .pg-rg-cell{transition:none}`,
      `#${domId} input[type=range]{accent-color:${colour}}`
    ].join("\n");
    const jsBody = `
var grid=$('[data-role=grid]'),out=$('[data-role=out]'),slider=$('[data-role=slider]');
if(!grid||!out)return;
var total=${total},unit=${JSON.stringify(unit)};
if(reduced)root.classList.add('pg-rg-reduce');
var cells=[];
for(var i=0;i<total;i++){var c=document.createElement('span');c.className='pg-rg-cell';grid.appendChild(c);cells.push(c);}
function pct(n){var p=total?(n/total*100):0;return (p<1&&p>0?p.toFixed(1):Math.round(p));}
function paint(n){
  n=Math.max(0,Math.min(total,n));
  for(var i=0;i<total;i++)cells[i].classList.toggle('on',i<n);
  out.innerHTML='<b>'+n+'</b> in '+total+' '+unit+' \xB7 <b>'+pct(n)+'%</b>';
}
if(slider)slider.addEventListener('input',function(){paint(parseInt(slider.value,10)||0);});
paint(${affected});
`;
    return { html, css, jsBody };
  }
};

// server/playgrounds/gauge-dial.js
var gauge_dial_default = {
  id: "gauge-dial",
  name: "Gauge dial",
  category: "explorer",
  description: "A semicircular gauge with coloured zones and a needle, moved by a slider. For a single value against a scale.",
  paramsSchema: {
    type: "object",
    additionalProperties: false,
    required: ["min", "max", "value"],
    properties: {
      title: { type: "string", title: "Optional label above the gauge" },
      min: { type: "number", title: "Scale minimum", default: 0 },
      max: { type: "number", title: "Scale maximum", default: 100 },
      value: { type: "number", title: "Starting value", default: 50 },
      unit: { type: "string", title: "Unit suffix (e.g. %, mmHg)", default: "" },
      zones: {
        type: "array",
        title: "Coloured zones (low\u2192high)",
        maxItems: 6,
        items: {
          type: "object",
          additionalProperties: false,
          required: ["from", "to", "colour"],
          properties: { from: { type: "number" }, to: { type: "number" }, colour: { type: "string" }, label: { type: "string" } }
        }
      },
      caption: { type: "string", title: "One-line caption" }
    }
  },
  presets: [
    {
      name: "Risk score",
      params: {
        title: "A made-up risk score",
        min: 0,
        max: 10,
        value: 3,
        unit: "",
        zones: [{ from: 0, to: 3, colour: "#2dd4bf", label: "low" }, { from: 3, to: 7, colour: "#fbbf24", label: "watch" }, { from: 7, to: 10, colour: "#f472b6", label: "high" }],
        caption: "Drag the needle \u2014 note how the same number lands in a different zone."
      }
    },
    {
      name: "Saturation",
      params: {
        title: "Oxygen saturation",
        min: 80,
        max: 100,
        value: 97,
        unit: "%",
        zones: [{ from: 80, to: 92, colour: "#f472b6", label: "low" }, { from: 92, to: 95, colour: "#fbbf24", label: "borderline" }, { from: 95, to: 100, colour: "#2dd4bf", label: "fine" }],
        caption: "Illustrative zones, not clinical advice."
      }
    }
  ],
  build(params, domId) {
    const min = Number(params.min ?? 0), max = Number(params.max ?? 100);
    const value = Number(params.value ?? (min + max) / 2);
    const unit = esc(params.unit || "");
    const title = params.title ? `<div class="pg-gd-title">${esc(params.title)}</div>` : "";
    const caption = params.caption ? `<div class="pg-readout" data-role="cap">${esc(params.caption)}</div>` : "";
    const html = `<div class="pg-stage">${title}<svg class="pg-gd-svg" viewBox="0 0 200 120" data-role="svg" role="img" aria-label="gauge"><path d="M 16 100 A 84 84 0 0 1 184 100" fill="none" stroke="rgba(140,160,200,.18)" stroke-width="12" stroke-linecap="round"></path><g data-role="zones"></g><line data-role="needle" x1="100" y1="100" x2="100" y2="20" stroke="#e9eef8" stroke-width="3" stroke-linecap="round"></line><circle cx="100" cy="100" r="7" fill="#e9eef8"></circle></svg><div class="pg-gd-out pg-readout" data-role="out" aria-live="polite"></div><div class="pg-row"><label style="flex:1">Value
         <input type="range" data-role="slider" min="${min}" max="${max}" value="${value}" step="${max - min > 20 ? 1 : "any"}" aria-label="Value"></label></div>` + caption + `</div>`;
    const css = [
      `#${domId} .pg-gd-title{font-size:.9rem;color:var(--ink-dim,#9fb3c8);margin:0 0 .5rem}`,
      `#${domId} .pg-gd-svg{display:block;width:100%;max-width:360px;margin-inline:auto}`,
      `#${domId} .pg-gd-out{text-align:center;font-size:1.3rem;font-weight:700;margin:.2rem 0 .6rem}`,
      `#${domId} [data-role=needle]{transition:transform .25s ease}`,
      `#${domId} .pg-gd-reduce [data-role=needle]{transition:none}`
    ].join("\n");
    const jsBody = `
var svg=$('[data-role=svg]'),needle=$('[data-role=needle]'),out=$('[data-role=out]'),slider=$('[data-role=slider]'),zg=$('[data-role=zones]');
if(!svg||!needle||!out)return;
if(reduced)root.classList.add('pg-gd-reduce');
var min=${min},max=${max},unit=${JSON.stringify(unit)},span=(max-min)||1;
var cx=100,cy=100,R=84;
function ang(v){return 180-180*((v-min)/span);}           // degrees, 180=left \u2026 0=right
function pt(a,r){var t=a*Math.PI/180;return [cx+r*Math.cos(t), cy-r*Math.sin(t)];}
function arc(a0,a1,r){var p0=pt(a0,r),p1=pt(a1,r),large=Math.abs(a0-a1)>180?1:0;return 'M '+p0[0].toFixed(2)+' '+p0[1].toFixed(2)+' A '+r+' '+r+' 0 '+large+' 1 '+p1[0].toFixed(2)+' '+p1[1].toFixed(2);}
(CONFIG.zones||[]).forEach(function(z){
  var a0=ang(Math.max(min,z.from)),a1=ang(Math.min(max,z.to));
  var p=document.createElementNS('http://www.w3.org/2000/svg','path');
  p.setAttribute('d',arc(a0,a1,R)); p.setAttribute('fill','none');
  p.setAttribute('stroke',z.colour||'#22d3ee'); p.setAttribute('stroke-width','12');
  zg.appendChild(p);
});
function zoneLabel(v){var hit=null;(CONFIG.zones||[]).forEach(function(z){if(v>=z.from&&v<=z.to)hit=z;});return hit&&hit.label?hit.label:'';}
function fmt(v){return (Math.round(v*10)/10).toString();}
function set(v){
  v=Math.max(min,Math.min(max,v));
  var a=ang(v),tip=pt(a,R-14);
  needle.setAttribute('x2',tip[0].toFixed(2)); needle.setAttribute('y2',tip[1].toFixed(2));
  var lbl=zoneLabel(v);
  out.textContent=fmt(v)+unit+(lbl?(' \xB7 '+lbl):'');
}
if(slider)slider.addEventListener('input',function(){set(parseFloat(slider.value));});
set(${value});
`;
    return { html, css, jsBody };
  }
};

// server/playgrounds/flip-cards.js
var flip_cards_default = {
  id: "flip-cards",
  name: "Flip cards",
  category: "reveal",
  description: "A deck of tap-to-flip cards (prompt on the front, reveal on the back). For myths, definitions, claim\u2192verdict.",
  paramsSchema: {
    type: "object",
    additionalProperties: false,
    required: ["cards"],
    properties: {
      title: { type: "string", title: "Optional label above the deck" },
      columns: { type: "number", title: "Columns (desktop)", default: 2, minimum: 1, maximum: 4 },
      accent: { type: "string", title: "Back-face accent (hex)", default: "#22d3ee" },
      cards: {
        type: "array",
        title: "Cards",
        minItems: 1,
        maxItems: 12,
        items: {
          type: "object",
          additionalProperties: false,
          required: ["front", "back"],
          properties: {
            front: { type: "string", title: "Front (the prompt / myth / term)" },
            back: { type: "string", title: "Back (the reveal / verdict)" },
            tag: { type: "string", title: "Tiny tag on the back (e.g. Myth, True)" }
          }
        }
      }
    }
  },
  presets: [
    {
      name: "Myth-buster",
      params: {
        title: "Three things people get wrong about fractures",
        columns: 3,
        accent: "#22d3ee",
        cards: [
          { front: "\u201CIf you can move it, it isn\u2019t broken.\u201D", back: "You can often move a broken bone \u2014 the muscles still work. Movement rules nothing out.", tag: "Myth" },
          { front: "\u201CA hairline crack will heal on its own.\u201D", back: "Usually, yes \u2014 but position and load matter. Some need fixing to heal straight.", tag: "Mostly" },
          { front: "\u201COnce the cast is off, you\u2019re better.\u201D", back: "The bone is united, not finished. Stiffness and weakness take longer than the cast.", tag: "Myth" }
        ]
      }
    },
    {
      name: "Term \u2192 meaning",
      params: {
        title: "Three words surgeons use",
        columns: 3,
        accent: "#818cf8",
        cards: [
          { front: "Reduction", back: "Putting the broken ends back where they belong \u2014 closed (by hand) or open (surgery).", tag: "Term" },
          { front: "Non-union", back: "A fracture that has stopped trying to heal. Different from one that is simply slow.", tag: "Term" },
          { front: "Arthroplasty", back: "Replacing a joint surface with an implant \u2014 \u201Cplasty\u201D = reshaping.", tag: "Term" }
        ]
      }
    }
  ],
  build(params, domId) {
    const cards = Array.isArray(params.cards) ? params.cards.slice(0, 12) : [];
    const columns = Math.max(1, Math.min(4, Math.round(params.columns || 2)));
    const accent = /^#[0-9a-fA-F]{3,8}$/.test(params.accent || "") ? params.accent : "#22d3ee";
    const title = params.title ? `<div class="pg-fc-title">${esc(params.title)}</div>` : "";
    const cardsHtml = cards.map((c, i) => `<button type="button" class="pg-fc-card" data-role="card" aria-pressed="false"><span class="pg-fc-face pg-fc-front">${esc(c.front)}<span class="pg-fc-hint">tap to reveal</span></span><span class="pg-fc-face pg-fc-back">${c.tag ? `<span class="pg-fc-tag">${esc(c.tag)}</span>` : ""}<span>${esc(c.back)}</span></span></button>`).join("");
    const html = `<div class="pg-stage">${title}<div class="pg-fc-grid" data-role="grid">${cardsHtml}</div></div>`;
    const css = [
      `#${domId} .pg-fc-title{font-size:.9rem;color:var(--ink-dim,#9fb3c8);margin:0 0 .8rem}`,
      `#${domId} .pg-fc-grid{display:grid;grid-template-columns:1fr;gap:.7rem}`,
      `@media(min-width:560px){#${domId} .pg-fc-grid{grid-template-columns:repeat(${columns},1fr)}}`,
      `#${domId} .pg-fc-card{position:relative;display:block;width:100%;min-height:130px;border:0;background:transparent;padding:0;cursor:pointer;font:inherit;text-align:left;perspective:1000px}`,
      `#${domId} .pg-fc-face{position:absolute;inset:0;display:flex;flex-direction:column;justify-content:center;gap:.5rem;padding:1rem 1.1rem;border-radius:12px;border:1px solid var(--line,#23304a);backface-visibility:hidden;transition:transform .5s;line-height:1.45}`,
      `#${domId} .pg-fc-front{background:rgba(140,160,200,.06);color:var(--ink,#e9eef8);font-weight:600}`,
      `#${domId} .pg-fc-back{background:rgba(34,211,238,.06);border-color:${accent}55;color:var(--ink-dim,#cdd6e6);transform:rotateY(180deg);font-size:.92rem}`,
      `#${domId} .pg-fc-card.flipped .pg-fc-front{transform:rotateY(180deg)}`,
      `#${domId} .pg-fc-card.flipped .pg-fc-back{transform:rotateY(360deg)}`,
      `#${domId} .pg-fc-hint{font-size:.7rem;font-weight:500;color:var(--ink-faint,#8aa0b8);text-transform:uppercase;letter-spacing:.08em}`,
      `#${domId} .pg-fc-tag{align-self:flex-start;font-size:.66rem;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:${accent};border:1px solid ${accent}66;border-radius:99px;padding:.1em .6em}`,
      `#${domId}.pg-fc-reduce .pg-fc-face{transition:none}`
    ].join("\n");
    const jsBody = `
if(reduced)root.classList.add('pg-fc-reduce');
$$('[data-role=card]').forEach(function(card){
  card.addEventListener('click',function(){
    var f=card.classList.toggle('flipped');
    card.setAttribute('aria-pressed',f?'true':'false');
  });
});
`;
    return { html, css, jsBody };
  }
};

// server/playgrounds/layer-peel.js
var layer_peel_default = {
  id: "layer-peel",
  name: "Layer peel",
  category: "diagram",
  description: "Concentric layers you toggle to peel down to the core (tissue planes, scan layers, a stack of abstractions).",
  paramsSchema: {
    type: "object",
    additionalProperties: false,
    required: ["layers"],
    properties: {
      title: { type: "string", title: "Optional label above the figure" },
      layers: {
        type: "array",
        title: "Layers (outer \u2192 inner)",
        minItems: 2,
        maxItems: 6,
        items: {
          type: "object",
          additionalProperties: false,
          required: ["name", "colour"],
          properties: { name: { type: "string" }, colour: { type: "string" }, note: { type: "string", title: "Shown when this is the deepest visible layer" } }
        }
      },
      caption: { type: "string", title: "One-line caption" }
    }
  },
  presets: [
    {
      name: "Tissue planes",
      params: {
        title: "What the scalpel goes through",
        caption: "Peel a layer off to see what is underneath.",
        layers: [
          { name: "Skin", colour: "#f472b6", note: "Skin \u2014 the bit everyone sees, and the bit that scars." },
          { name: "Fat", colour: "#fbbf24", note: "Subcutaneous fat \u2014 variable, and it bleeds." },
          { name: "Muscle", colour: "#fb7185", note: "Muscle \u2014 split along its fibres where you can." },
          { name: "Bone", colour: "#e9eef8", note: "Bone \u2014 the thing we actually came for." }
        ]
      }
    },
    {
      name: "Software stack",
      params: {
        title: "The cloud is just someone else\u2019s layers",
        caption: "Each layer hides the one below \u2014 until it breaks.",
        layers: [
          { name: "Your app", colour: "#2dd4bf", note: "Your app \u2014 the only layer you actually wrote." },
          { name: "Framework", colour: "#22d3ee", note: "A framework you trusted to be boring." },
          { name: "OS", colour: "#818cf8", note: "An operating system you never think about." },
          { name: "Someone\u2019s server", colour: "#f472b6", note: "A computer in a building you will never see." }
        ]
      }
    }
  ],
  build(params, domId) {
    const layers = (Array.isArray(params.layers) ? params.layers : []).slice(0, 6);
    const title = params.title ? `<div class="pg-lp-title">${esc(params.title)}</div>` : "";
    const caption = params.caption ? `<div class="pg-lp-cap-static pg-readout">${esc(params.caption)}</div>` : "";
    const html = `<div class="pg-stage">${title}<svg class="pg-lp-svg" viewBox="0 0 260 170" data-role="svg" role="img" aria-label="layered figure"></svg><div class="pg-lp-out pg-readout" data-role="out" aria-live="polite"></div><div class="pg-lp-legend" data-role="legend" role="group" aria-label="Toggle layers"></div>` + caption + `</div>`;
    const css = [
      `#${domId} .pg-lp-title{font-size:.9rem;color:var(--ink-dim,#9fb3c8);margin:0 0 .6rem}`,
      `#${domId} .pg-lp-svg{display:block;width:100%;max-width:380px;margin-inline:auto}`,
      `#${domId} .pg-lp-rect{transition:opacity .25s}`,
      `#${domId}.pg-lp-reduce .pg-lp-rect{transition:none}`,
      `#${domId} .pg-lp-rect.off{opacity:0}`,
      `#${domId} .pg-lp-out{text-align:center;margin:.7rem 0 .2rem;min-height:1.3em}`,
      `#${domId} .pg-lp-legend{display:flex;flex-wrap:wrap;gap:.5rem;justify-content:center;margin-top:.7rem}`,
      `#${domId} .pg-lp-chip{display:inline-flex;align-items:center;gap:.4rem;border:1px solid var(--line,#23304a);background:rgba(140,160,200,.05);color:var(--ink-dim,#9fb3c8);border-radius:99px;padding:.32em .8em;font:inherit;font-size:.82rem;cursor:pointer}`,
      `#${domId} .pg-lp-chip[aria-pressed=false]{opacity:.45;text-decoration:line-through}`,
      `#${domId} .pg-lp-sw{width:12px;height:12px;border-radius:3px;flex:0 0 auto}`,
      `#${domId} .pg-lp-cap-static{text-align:center;color:var(--ink-faint,#8aa0b8);margin-top:.6rem;font-size:.85rem}`
    ].join("\n");
    const jsBody = `
var svg=$('[data-role=svg]'),legend=$('[data-role=legend]'),out=$('[data-role=out]');
if(!svg||!legend)return;
if(reduced)root.classList.add('pg-lp-reduce');
var SVGNS='http://www.w3.org/2000/svg';
var L=CONFIG.layers||[],N=L.length;
var padX=110/N,padY=66/N;
var shown=L.map(function(){return true;});
var rects=[];
L.forEach(function(layer,i){
  var x=15+i*padX,y=15+i*padY,w=230-2*i*padX,h=140-2*i*padY;
  var r=document.createElementNS(SVGNS,'rect');
  r.setAttribute('x',x.toFixed(1));r.setAttribute('y',y.toFixed(1));
  r.setAttribute('width',w.toFixed(1));r.setAttribute('height',h.toFixed(1));
  r.setAttribute('rx','14');r.setAttribute('fill',layer.colour||'#22d3ee');
  r.setAttribute('fill-opacity', i===N-1?'0.92':'0.8');
  r.setAttribute('class','pg-lp-rect');
  svg.appendChild(r);rects.push(r);
  // label near the top edge of each band
  var t=document.createElementNS(SVGNS,'text');
  t.setAttribute('x',(x+10).toFixed(1));t.setAttribute('y',(y+15).toFixed(1));
  t.setAttribute('class','pg-lp-rect');t.setAttribute('fill','#04060c');
  t.setAttribute('font-size','9');t.setAttribute('font-weight','700');
  t.textContent=layer.name||('Layer '+(i+1));
  svg.appendChild(t);rects.push(t);
});
function deepest(){var d=-1;for(var i=0;i<N;i++)if(shown[i])d=i;return d;}
function refresh(){
  for(var i=0;i<N;i++){
    rects[i*2].classList.toggle('off',!shown[i]);
    rects[i*2+1].classList.toggle('off',!shown[i]);
  }
  var d=deepest();
  out.textContent = d>=0 ? (L[d].note||('Down to: '+(L[d].name||''))) : 'All layers peeled away.';
}
L.forEach(function(layer,i){
  var b=document.createElement('button');
  b.type='button';b.className='pg-lp-chip';b.setAttribute('aria-pressed','true');
  b.innerHTML='<span class="pg-lp-sw" style="background:'+(layer.colour||'#22d3ee')+'"></span>'+
    String(layer.name||'Layer '+(i+1)).replace(/&/g,'&amp;').replace(/</g,'&lt;');
  b.addEventListener('click',function(){shown[i]=!shown[i];b.setAttribute('aria-pressed',shown[i]?'true':'false');refresh();});
  legend.appendChild(b);
});
refresh();
`;
    return { html, css, jsBody };
  }
};

// server/playgrounds/dice-roller.js
var dice_roller_default = {
  id: "dice-roller",
  name: "Dice roller",
  category: "game",
  description: "Rolls dice thousands of times and draws the distribution of totals, so the probabilities become something you can see.",
  paramsSchema: {
    type: "object",
    additionalProperties: false,
    required: ["dice", "sides"],
    properties: {
      title: { type: "string" },
      dice: { type: "number", default: 2, minimum: 1, maximum: 4 },
      sides: { type: "number", default: 6, minimum: 2, maximum: 20 },
      colour: { type: "string", default: "#22d3ee" }
    }
  },
  presets: [
    { name: "Two dice \u2014 why 7 wins", params: { title: "Two dice \u2014 why 7 wins", dice: 2, sides: 6, colour: "#22d3ee" } },
    { name: "One d20", params: { title: "One d20 \u2014 flat odds", dice: 1, sides: 20, colour: "#818cf8" } }
  ],
  build(params, domId) {
    const dice = Math.max(1, Math.min(4, Math.round(params.dice || 2)));
    const sides = Math.max(2, Math.min(20, Math.round(params.sides || 6)));
    const colour = /^#[0-9a-fA-F]{3,8}$/.test(params.colour || "") ? params.colour : "#22d3ee";
    const title = params.title ? `<div class="pg-dr-title">${esc(params.title)}</div>` : "";
    const html = `<div class="pg-stage">${title}<div class="pg-controls"><div class="pg-row"><button type="button" class="pg-dr-btn" data-role="once">Roll once</button><button type="button" class="pg-dr-btn pg-dr-batch" data-role="batch">Roll \xD71000</button><button type="button" class="pg-dr-btn pg-dr-reset" data-role="reset">Reset</button></div></div><div class="pg-readout">Last roll: <b data-role="last">\u2014</b> \xB7 Rolls so far: <b data-role="total">0</b></div><div class="pg-dr-chart" data-role="chart"></div></div>`;
    const css = [
      `#${domId} .pg-dr-title{font-weight:700;margin-bottom:.6rem;color:var(--ink,#e9eef8)}`,
      `#${domId} .pg-dr-btn{font:inherit;font-weight:600;cursor:pointer;border:1px solid ${colour}66;background:rgba(34,211,238,.08);color:var(--ink,#e9eef8);padding:.45rem .8rem;border-radius:9px;transition:background .15s,border-color .15s}`,
      `#${domId} .pg-dr-btn:hover{background:rgba(34,211,238,.16);border-color:${colour}}`,
      `#${domId} .pg-dr-batch{background:${colour}22;border-color:${colour}}`,
      `#${domId} .pg-dr-reset{background:transparent;border-color:var(--line,#23304a);color:var(--ink-dim,#cdd6e6)}`,
      `#${domId} .pg-readout{margin:.7rem 0;color:var(--ink-dim,#cdd6e6)}`,
      `#${domId} .pg-readout b{color:var(--ink,#e9eef8)}`,
      `#${domId} .pg-dr-chart{display:flex;flex-direction:column;gap:3px}`,
      `#${domId} .pg-dr-bar{display:grid;grid-template-columns:2.6rem 1fr auto;align-items:center;gap:.5rem;font-variant-numeric:tabular-nums}`,
      `#${domId} .pg-dr-sum{color:var(--ink-dim,#cdd6e6);text-align:right;font-size:.85rem}`,
      `#${domId} .pg-dr-track{position:relative;height:16px;border-radius:5px;background:rgba(140,160,200,.07);overflow:hidden}`,
      `#${domId} .pg-dr-fill{position:absolute;inset:0 auto 0 0;width:0;border-radius:5px;background:linear-gradient(90deg,${colour}88,${colour});transition:width .3s ease}`,
      `#${domId} .pg-dr-count{color:var(--ink-dim,#cdd6e6);font-size:.8rem;min-width:3.5rem;text-align:right}`,
      `#${domId}.pg-dr-reduce .pg-dr-fill{transition:none}`
    ].join("\n");
    const jsBody = `
var DICE=${dice}, SIDES=${sides};
if(reduced)root.classList.add('pg-dr-reduce');
var chart=$('[data-role=chart]'), lastEl=$('[data-role=last]'), totalEl=$('[data-role=total]');
if(!chart||!lastEl||!totalEl)return;
var onceBtn=$('[data-role=once]'), batchBtn=$('[data-role=batch]'), resetBtn=$('[data-role=reset]');
var MIN=DICE, MAX=DICE*SIDES;
var counts={}, total=0, fills={}, countEls={};
for(var s=MIN;s<=MAX;s++)counts[s]=0;

// build the bars once
for(var sum=MIN;sum<=MAX;sum++){
  var bar=document.createElement('div'); bar.className='pg-dr-bar';
  var lbl=document.createElement('div'); lbl.className='pg-dr-sum'; lbl.textContent=String(sum); bar.appendChild(lbl);
  var track=document.createElement('div'); track.className='pg-dr-track';
  var fill=document.createElement('div'); fill.className='pg-dr-fill'; track.appendChild(fill); bar.appendChild(track);
  var cnt=document.createElement('div'); cnt.className='pg-dr-count'; cnt.textContent='0'; bar.appendChild(cnt);
  chart.appendChild(bar);
  fills[sum]=fill; countEls[sum]=cnt;
}

function rollOnce(){
  var sum=0;
  for(var d=0;d<DICE;d++)sum+=Math.floor(Math.random()*SIDES)+1;
  counts[sum]++; total++;
  return sum;
}

function render(){
  var max=0;
  for(var s=MIN;s<=MAX;s++)if(counts[s]>max)max=counts[s];
  for(var s2=MIN;s2<=MAX;s2++){
    var pct=max>0?(counts[s2]/max*100):0;
    fills[s2].style.width=pct.toFixed(2)+'%';
    var c=counts[s2];
    countEls[s2].textContent=total>0?(c+' ('+(c/total*100).toFixed(1)+'%)'):'0';
  }
  totalEl.textContent=String(total);
}

if(onceBtn)onceBtn.addEventListener('click',function(){ var s=rollOnce(); lastEl.textContent=String(s); render(); });
if(batchBtn)batchBtn.addEventListener('click',function(){ var s; for(var i=0;i<1000;i++)s=rollOnce(); lastEl.textContent=String(s); render(); });
if(resetBtn)resetBtn.addEventListener('click',function(){
  for(var s=MIN;s<=MAX;s++)counts[s]=0;
  total=0; lastEl.textContent='\u2014'; render();
});

render();
`;
    return { html, css, jsBody };
  }
};

// server/playgrounds/reaction-timer.js
var reaction_timer_default = {
  id: "reaction-timer",
  name: "Reaction timer",
  category: "game",
  description: "Measures your reaction time: wait for green, then tap as fast as you can.",
  paramsSchema: {
    type: "object",
    additionalProperties: false,
    required: [],
    properties: {
      title: { type: "string" }
    }
  },
  presets: [
    { name: "Test your reflexes", params: { title: "Test your reflexes" } },
    { name: "Faster than average?", params: { title: "Are you faster than average? (~270 ms)" } }
  ],
  build(params, domId) {
    const title = params.title ? `<div class="pg-rt-title">${esc(params.title)}</div>` : "";
    const html = `<div class="pg-stage">${title}<div class="pg-rt-pad" data-role="pad" role="button" tabindex="0" aria-live="polite">Tap to start</div><div class="pg-readout pg-rt-out" data-role="out">Tap the pad and wait for green.</div></div>`;
    const css = [
      `#${domId} .pg-rt-title{font-weight:600;margin-bottom:.6rem;color:var(--ink,#e9eef8)}`,
      `#${domId} .pg-rt-pad{display:flex;align-items:center;justify-content:center;text-align:center;min-height:200px;padding:1.2rem;border-radius:14px;border:1px solid var(--line,#23304a);background:rgba(140,160,200,.08);color:var(--ink,#e9eef8);font-size:1.4rem;font-weight:700;cursor:pointer;user-select:none;transition:background .15s,border-color .15s,color .15s}`,
      `#${domId} .pg-rt-pad:focus-visible{outline:2px solid #22d3ee;outline-offset:2px}`,
      `#${domId} .pg-rt-pad.is-wait{background:rgba(251,191,36,.16);border-color:#fbbf2488;color:#fbbf24}`,
      `#${domId} .pg-rt-pad.is-go{background:rgba(45,212,191,.22);border-color:#2dd4bf;color:#2dd4bf}`,
      `#${domId} .pg-rt-pad.is-early{background:rgba(244,114,182,.16);border-color:#f472b688;color:#f472b6}`,
      `#${domId} .pg-rt-out{margin-top:.7rem;color:var(--ink-dim,#cdd6e6)}`,
      `#${domId} .pg-rt-out b{color:#22d3ee}`,
      `#${domId}.pg-rt-reduce .pg-rt-pad{transition:none}`
    ].join("\n");
    const jsBody = `
var pad=$('[data-role=pad]'); if(!pad)return;
var out=$('[data-role=out]'); if(!out)return;
if(reduced)root.classList.add('pg-rt-reduce');
var state='idle';      // 'idle' | 'waiting' | 'go'
var timer=null;        // pending green delay
var goAt=0;            // Date.now() when it turned green
var best=null;         // lowest time so far (closure var)
function clearTimer(){ if(timer){clearTimeout(timer);timer=null;} }
function setPad(cls,txt){
  pad.classList.remove('is-wait','is-go','is-early');
  if(cls)pad.classList.add(cls);
  pad.textContent=txt;
}
function bestLine(){ return best==null?'':' Best: <b>'+best+' ms</b>.'; }
function startRound(){
  clearTimer();
  state='waiting';
  setPad('is-wait','Wait for green\\u2026');
  out.innerHTML='Hold on\\u2026 don\\u2019t jump the gun.'+bestLine();
  var delay=1000+Math.floor(Math.random()*2000); // 1000\\u20133000ms
  timer=setTimeout(function(){
    timer=null;
    state='go';
    goAt=Date.now();
    setPad('is-go','TAP!');
  },delay);
}
function handle(){
  if(state==='idle'){
    startRound();
  } else if(state==='waiting'){
    // tapped during amber \\u2014 too early
    clearTimer();
    state='idle';
    setPad('is-early','Too soon \\u2014 tap to retry');
    out.innerHTML='You tapped before green.'+bestLine();
  } else if(state==='go'){
    var ms=Date.now()-goAt;
    state='idle';
    if(best==null||ms<best)best=ms;
    setPad('','Tap to go again');
    out.innerHTML='Reaction: <b>'+ms+' ms</b>.'+bestLine();
  }
}
pad.addEventListener('click',handle);
pad.addEventListener('keydown',function(e){
  if(e.key===' '||e.key==='Enter'){ e.preventDefault(); handle(); }
});
`;
    return { html, css, jsBody };
  }
};

// server/playgrounds/tip-split.js
var tip_split_default = {
  id: "tip-split",
  name: "Tip & split",
  category: "tool",
  description: "Split a bill with a tip across a group and see the cost per person live.",
  paramsSchema: {
    type: "object",
    additionalProperties: false,
    required: [],
    properties: {
      title: { type: "string" },
      bill: { type: "number", default: 60, minimum: 0, maximum: 300 },
      tipPct: { type: "number", default: 12.5, minimum: 0, maximum: 30 },
      people: { type: "number", default: 2, minimum: 1, maximum: 12 },
      currency: { type: "string", default: "\xA3" }
    }
  },
  presets: [
    { name: "Splitting dinner", params: { title: "Splitting dinner", bill: 84, tipPct: 12.5, people: 4, currency: "\xA3" } },
    { name: "Coffee round", params: { title: "Coffee round", bill: 18.5, tipPct: 0, people: 5, currency: "\xA3" } }
  ],
  build(params, domId) {
    const clamp = (v, lo, hi, d) => {
      const n = Number(v);
      return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d;
    };
    const bill = clamp(params.bill, 0, 300, 60);
    const tipPct = clamp(params.tipPct, 0, 30, 12.5);
    const people = Math.round(clamp(params.people, 1, 12, 2));
    const currency = typeof params.currency === "string" && params.currency ? params.currency.slice(0, 3) : "\xA3";
    const title = params.title ? `<div class="pg-ts-title">${esc(params.title)}</div>` : "";
    const html = `<div class="pg-stage">${title}<div class="pg-controls"><div class="pg-field"><label>Bill <b data-role="bill-val">${esc(currency)}${bill.toFixed(2)}</b></label><input type="range" data-role="bill" min="0" max="300" step="1" value="${bill}"></div><div class="pg-field"><label>Tip <b data-role="tip-val">${tipPct}%</b></label><input type="range" data-role="tip" min="0" max="30" step="0.5" value="${tipPct}"></div><div class="pg-field"><label>People <b data-role="people-val">${people}</b></label><input type="range" data-role="people" min="1" max="12" step="1" value="${people}"></div></div><div class="pg-readout"><div class="pg-ts-line"><span>Tip amount</span><b data-role="tip-amt">\u2014</b></div><div class="pg-ts-line"><span>Total</span><b data-role="total">\u2014</b></div><div class="pg-ts-line pg-ts-per"><span>Per person</span><b data-role="per">\u2014</b></div></div></div>`;
    const css = [
      `#${domId} .pg-ts-title{font-weight:600;color:#e9eef8;margin-bottom:.8rem}`,
      `#${domId} .pg-controls{display:grid;gap:.9rem;margin-bottom:1rem}`,
      `#${domId} .pg-field label{display:flex;justify-content:space-between;align-items:baseline;gap:1rem;font-size:.9rem;color:#cdd6e6;margin-bottom:.35rem}`,
      `#${domId} .pg-field label b{color:#22d3ee;font-variant-numeric:tabular-nums}`,
      `#${domId} .pg-field input[type=range]{width:100%;accent-color:#2dd4bf;cursor:pointer}`,
      `#${domId} .pg-readout{display:grid;gap:.5rem;padding:.9rem 1rem;border-radius:12px;border:1px solid #23304a;background:rgba(140,160,200,.06)}`,
      `#${domId} .pg-ts-line{display:flex;justify-content:space-between;align-items:baseline;gap:1rem}`,
      `#${domId} .pg-ts-line span{color:#cdd6e6;font-size:.9rem}`,
      `#${domId} .pg-ts-line b{color:#e9eef8;font-variant-numeric:tabular-nums}`,
      `#${domId} .pg-ts-per{padding-top:.5rem;border-top:1px solid #23304a}`,
      `#${domId} .pg-ts-per span{color:#e9eef8;font-weight:600}`,
      `#${domId} .pg-ts-per b{color:#818cf8;font-size:1.25rem;font-weight:700}`
    ].join("\n");
    const jsBody = `
var cur = CONFIG.currency && typeof CONFIG.currency === 'string' ? CONFIG.currency.slice(0,3) : '\xA3';
var billEl = $('[data-role=bill]'), tipEl = $('[data-role=tip]'), peopleEl = $('[data-role=people]');
if(!billEl || !tipEl || !peopleEl) return;
var billVal = $('[data-role=bill-val]'), tipValEl = $('[data-role=tip-val]'), peopleValEl = $('[data-role=people-val]');
var tipAmtEl = $('[data-role=tip-amt]'), totalEl = $('[data-role=total]'), perEl = $('[data-role=per]');
function money(n){ return cur + (Math.round(n*100)/100).toFixed(2); }
function recompute(){
  var bill = parseFloat(billEl.value) || 0;
  var tipPct = parseFloat(tipEl.value) || 0;
  var people = Math.max(1, Math.round(parseFloat(peopleEl.value) || 1));
  var tipAmt = bill * tipPct / 100;
  var total = bill + tipAmt;
  var per = total / people;
  if(billVal) billVal.textContent = money(bill);
  if(tipValEl) tipValEl.textContent = (Math.round(tipPct*10)/10) + '%';
  if(peopleValEl) peopleValEl.textContent = String(people);
  if(tipAmtEl) tipAmtEl.textContent = money(tipAmt);
  if(totalEl) totalEl.textContent = money(total);
  if(perEl) perEl.textContent = money(per);
}
[billEl, tipEl, peopleEl].forEach(function(el){ el.addEventListener('input', recompute); });
recompute();
`;
    return { html, css, jsBody };
  }
};

// server/playgrounds/compound-growth.js
var compound_growth_default = {
  id: "compound-growth",
  name: "Compound growth",
  category: "explorer",
  description: "See how small regular savings compound over time \u2014 drag the sliders to watch the pot grow.",
  paramsSchema: {
    type: "object",
    additionalProperties: false,
    required: [],
    properties: {
      title: { type: "string" },
      monthly: { type: "number", default: 20, minimum: 0, maximum: 500 },
      ratePct: { type: "number", default: 5, minimum: 0, maximum: 12 },
      years: { type: "number", default: 30, minimum: 1, maximum: 40 },
      currency: { type: "string", default: "\xA3" }
    }
  },
  presets: [
    { name: "A coffee a week, invested", params: { title: "A coffee a week, invested", monthly: 12, ratePct: 6, years: 30, currency: "\xA3" } },
    { name: "Tenner a month from age 20", params: { title: "Tenner a month from age 20", monthly: 10, ratePct: 5, years: 40, currency: "\xA3" } }
  ],
  build(params, domId) {
    const clamp = (v, lo, hi, d) => {
      const n = Number(v);
      return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d;
    };
    const monthly = clamp(params.monthly, 0, 500, 20);
    const ratePct = clamp(params.ratePct, 0, 12, 5);
    const years = Math.round(clamp(params.years, 1, 40, 30));
    const currency = typeof params.currency === "string" && params.currency.trim() ? params.currency.trim().slice(0, 3) : "\xA3";
    const title = params.title ? `<div class="pg-cg-title">${esc(params.title)}</div>` : "";
    const html = `<div class="pg-stage">${title}
<div class="pg-controls">
  <div class="pg-row pg-field"><label><b>Monthly saving</b> <span class="pg-readout" data-role="out-monthly"></span></label>
    <input type="range" data-role="monthly" min="0" max="500" step="5" value="${monthly}"></div>
  <div class="pg-row pg-field"><label><b>Annual return</b> <span class="pg-readout" data-role="out-rate"></span></label>
    <input type="range" data-role="rate" min="0" max="12" step="0.5" value="${ratePct}"></div>
  <div class="pg-row pg-field"><label><b>Years</b> <span class="pg-readout" data-role="out-years"></span></label>
    <input type="range" data-role="years" min="1" max="40" step="1" value="${years}"></div>
</div>
<div class="pg-cg-stats">
  <div class="pg-cg-stat pg-cg-final"><span class="pg-cg-k">Final pot</span><span class="pg-readout pg-cg-v" data-role="out-final"></span></div>
  <div class="pg-cg-stat"><span class="pg-cg-k">Total paid in</span><span class="pg-readout pg-cg-v" data-role="out-paid"></span></div>
  <div class="pg-cg-stat"><span class="pg-cg-k">Interest earned</span><span class="pg-readout pg-cg-v" data-role="out-interest"></span></div>
</div>
<svg class="pg-cg-chart" data-role="chart" viewBox="0 0 300 80" preserveAspectRatio="none" role="img" aria-label="Balance growing year by year">
  <polyline data-role="line" fill="none" stroke="#22d3ee" stroke-width="1.5" points=""></polyline>
</svg>
</div>`;
    const css = [
      `#${domId} .pg-cg-title{font-weight:600;margin-bottom:.6rem;color:var(--ink,#e9eef8)}`,
      `#${domId} .pg-controls{display:flex;flex-direction:column;gap:.7rem}`,
      `#${domId} .pg-field label{display:flex;justify-content:space-between;align-items:baseline;gap:.6rem;font-size:.9rem;color:var(--ink-dim,#cdd6e6)}`,
      `#${domId} .pg-readout{color:#2dd4bf;font-variant-numeric:tabular-nums}`,
      `#${domId} input[type=range]{width:100%;margin:.35rem 0 0;accent-color:#22d3ee}`,
      `#${domId} .pg-cg-stats{display:grid;grid-template-columns:repeat(3,1fr);gap:.6rem;margin:1rem 0 .8rem}`,
      `#${domId} .pg-cg-stat{display:flex;flex-direction:column;gap:.2rem;padding:.6rem .7rem;border-radius:10px;border:1px solid var(--line,#23304a);background:rgba(140,160,200,.05)}`,
      `#${domId} .pg-cg-k{font-size:.72rem;letter-spacing:.02em;text-transform:uppercase;color:var(--ink-dim,#9fb0c8)}`,
      `#${domId} .pg-cg-v{font-size:1rem;font-weight:600}`,
      `#${domId} .pg-cg-final .pg-cg-v{font-size:1.3rem;font-weight:700;color:#22d3ee}`,
      `#${domId} .pg-cg-final{border-color:#22d3ee55;background:rgba(34,211,238,.07)}`,
      `#${domId} .pg-cg-chart{display:block;width:100%;height:80px;border-radius:10px;border:1px solid var(--line,#23304a);background:rgba(140,160,200,.04)}`,
      `@media(max-width:460px){#${domId} .pg-cg-stats{grid-template-columns:1fr}}`
    ].join("\n");
    const jsBody = `
var mEl=$('[data-role=monthly]'), rEl=$('[data-role=rate]'), yEl=$('[data-role=years]');
if(!mEl||!rEl||!yEl)return;
var line=$('[data-role=line]');
var ccy=${JSON.stringify(currency)};
function money(n){
  var r=Math.round(n);
  return ccy+r.toLocaleString('en-GB');
}
function recompute(){
  var monthly=parseFloat(mEl.value)||0;
  var rate=parseFloat(rEl.value)||0;
  var years=Math.max(1,Math.round(parseFloat(yEl.value)||1));
  var mr=rate/100/12;
  var bal=0;
  var months=years*12;
  var pts=[], yearly=[];
  for(var i=1;i<=months;i++){
    bal=(bal+monthly)*(1+mr);
    if(i%12===0)yearly.push(bal);
  }
  var paid=monthly*months;
  var interest=bal-paid;
  $('[data-role=out-monthly]').textContent=money(monthly);
  $('[data-role=out-rate]').textContent=rate.toFixed(1)+'%';
  $('[data-role=out-years]').textContent=years+(years===1?' yr':' yrs');
  $('[data-role=out-final]').textContent=money(bal);
  $('[data-role=out-paid]').textContent=money(paid);
  $('[data-role=out-interest]').textContent=money(interest);
  if(line){
    var peak=yearly.length?yearly[yearly.length-1]:0;
    var W=300, H=80, pad=2;
    for(var j=0;j<yearly.length;j++){
      var x=yearly.length===1?W:pad+(W-2*pad)*(j/(yearly.length-1));
      var y=H-pad-(H-2*pad)*(peak>0?(yearly[j]/peak):0);
      pts.push(x.toFixed(1)+','+y.toFixed(1));
    }
    line.setAttribute('points', pts.join(' '));
  }
}
[mEl,rEl,yEl].forEach(function(el){ el.addEventListener('input', recompute); });
recompute();
`;
    return { html, css, jsBody };
  }
};

// server/playgrounds/countdown.js
var countdown_default = {
  id: "countdown",
  name: "Countdown",
  category: "data",
  description: "A live countdown to a future date, ticking down days, hours, minutes and seconds.",
  paramsSchema: {
    type: "object",
    additionalProperties: false,
    required: ["target"],
    properties: {
      title: { type: "string" },
      target: { type: "string" },
      doneText: { type: "string", default: "It\u2019s here." }
    }
  },
  presets: [
    { name: "Countdown to 2030", params: { title: "Countdown to 2030", target: "2030-01-01" } },
    { name: "New Year", params: { title: "New Year", target: "2027-01-01" } }
  ],
  build(params, domId) {
    const title = params.title ? `<div class="pg-cd-title">${esc(params.title)}</div>` : "";
    const target = esc(params.target || "");
    const doneText = esc(params.doneText || "It\u2019s here.");
    const cells = [
      ["days", "Days"],
      ["hours", "Hours"],
      ["mins", "Minutes"],
      ["secs", "Seconds"]
    ].map(([role, label2]) => `<div class="pg-cd-cell"><span class="pg-cd-num pg-readout" data-role="${role}">\u2013</span><span class="pg-cd-label">${label2}</span></div>`).join("");
    const html = `<div class="pg-stage" data-target="${target}" data-done="${doneText}">${title}<div class="pg-cd-grid" data-role="grid">${cells}</div><div class="pg-cd-done" data-role="done" hidden></div></div>`;
    const css = [
      `#${domId} .pg-cd-title{font-weight:600;margin-bottom:.8rem;color:var(--ink,#e9eef8)}`,
      `#${domId} .pg-cd-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:.6rem}`,
      `#${domId} .pg-cd-cell{display:flex;flex-direction:column;align-items:center;gap:.3rem;padding:1rem .4rem;border-radius:12px;border:1px solid var(--line,#23304a);background:rgba(140,160,200,.06)}`,
      `#${domId} .pg-cd-num{font-size:clamp(1.6rem,7vw,2.6rem);font-weight:700;line-height:1;font-variant-numeric:tabular-nums;color:#22d3ee}`,
      `#${domId} .pg-cd-label{font-size:.72rem;letter-spacing:.06em;text-transform:uppercase;color:var(--ink-dim,#cdd6e6)}`,
      `#${domId} .pg-cd-done{font-size:clamp(1.4rem,6vw,2.2rem);font-weight:700;text-align:center;padding:1.4rem .6rem;color:#2dd4bf}`
    ].join("\n");
    const jsBody = `
var stage=$('.pg-stage');if(!stage)return;
var grid=$('[data-role=grid]'),done=$('[data-role=done]');
var dEl=$('[data-role=days]'),hEl=$('[data-role=hours]'),mEl=$('[data-role=mins]'),sEl=$('[data-role=secs]');
if(!grid||!done||!dEl||!hEl||!mEl||!sEl)return;
var target=new Date(stage.getAttribute('data-target'));
var doneText=stage.getAttribute('data-done')||'It\u2019s here.';
function pad(n){return(n<10?'0':'')+n;}
function show(msg){grid.hidden=true;done.hidden=false;done.textContent=msg;}
function tick(){
  var diff=target.getTime()-Date.now();
  if(diff<=0){show(doneText);if(root._cdTimer){clearInterval(root._cdTimer);root._cdTimer=null;}return;}
  grid.hidden=false;done.hidden=true;
  var s=Math.floor(diff/1000);
  dEl.textContent=Math.floor(s/86400);
  hEl.textContent=pad(Math.floor(s/3600)%24);
  mEl.textContent=pad(Math.floor(s/60)%60);
  sEl.textContent=pad(s%60);
}
if(root._cdTimer){clearInterval(root._cdTimer);root._cdTimer=null;}
if(isNaN(target.getTime())){show('Set a target date');return;}
tick();
root._cdTimer=setInterval(tick,1000);
`;
    return { html, css, jsBody };
  }
};

// server/playgrounds/bpm-tap.js
var bpm_tap_default = {
  id: "bpm-tap",
  name: "Tap tempo",
  category: "tool",
  description: "Tap in time with a beat to estimate its tempo in beats per minute (BPM).",
  paramsSchema: {
    type: "object",
    additionalProperties: false,
    required: [],
    properties: {
      title: { type: "string" }
    }
  },
  presets: [
    { name: "Find the tempo", params: { title: "Find the tempo" } },
    { name: "Is it really 120 BPM?", params: { title: "Is it really 120 BPM?" } }
  ],
  build(params, domId) {
    const title = params.title ? `<div class="pg-bt-title">${esc(params.title)}</div>` : "";
    const html = `<div class="pg-stage">${title}<div class="pg-bt-wrap"><button type="button" class="pg-bt-tap" data-role="tap"><span class="pg-bt-dot" data-role="dot"></span><span class="pg-bt-label">Tap</span></button><div class="pg-readout pg-bt-readout"><div class="pg-bt-bpm"><b data-role="bpm">\u2014</b> <span class="pg-bt-unit">BPM</span></div><div class="pg-bt-meta" data-role="meta">Keep tapping\u2026</div></div></div><div class="pg-controls"><button type="button" class="pg-bt-reset" data-role="reset">Reset</button></div></div>`;
    const css = [
      `#${domId} .pg-bt-title{font-weight:600;margin-bottom:.7rem;color:var(--ink,#e9eef8)}`,
      `#${domId} .pg-bt-wrap{display:flex;align-items:center;gap:1.2rem;flex-wrap:wrap}`,
      `#${domId} .pg-bt-tap{position:relative;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:.5rem;width:150px;height:150px;border-radius:50%;border:1px solid #2dd4bf55;background:rgba(45,212,191,.06);color:var(--ink,#e9eef8);font:inherit;font-weight:600;cursor:pointer;-webkit-user-select:none;user-select:none;touch-action:manipulation}`,
      `#${domId} .pg-bt-tap:active{background:rgba(45,212,191,.12)}`,
      `#${domId} .pg-bt-tap:focus-visible{outline:2px solid #22d3ee;outline-offset:3px}`,
      `#${domId} .pg-bt-dot{width:46px;height:46px;border-radius:50%;background:#2dd4bf;box-shadow:0 0 0 0 #2dd4bf66;transition:transform .12s ease,box-shadow .35s ease}`,
      `#${domId} .pg-bt-dot.pulse{transform:scale(1.28);box-shadow:0 0 0 12px #2dd4bf00}`,
      `#${domId}.pg-bt-reduce .pg-bt-dot{transition:none}`,
      `#${domId}.pg-bt-reduce .pg-bt-dot.pulse{transform:none}`,
      `#${domId} .pg-bt-label{font-size:.95rem;letter-spacing:.04em}`,
      `#${domId} .pg-bt-readout{min-width:140px}`,
      `#${domId} .pg-bt-bpm{font-size:1.1rem;color:var(--ink-dim,#cdd6e6)}`,
      `#${domId} .pg-bt-bpm b{font-size:2.4rem;font-weight:800;color:#22d3ee;font-variant-numeric:tabular-nums}`,
      `#${domId} .pg-bt-unit{font-size:1rem;color:var(--ink-dim,#cdd6e6)}`,
      `#${domId} .pg-bt-meta{margin-top:.35rem;font-size:.85rem;color:var(--ink-dim,#9fb0c8)}`,
      `#${domId} .pg-controls{margin-top:1rem}`,
      `#${domId} .pg-bt-reset{border:1px solid #23304a;background:rgba(140,160,200,.06);color:var(--ink,#e9eef8);font:inherit;padding:.5rem .9rem;border-radius:9px;cursor:pointer}`,
      `#${domId} .pg-bt-reset:hover{border-color:#818cf8}`
    ].join("\n");
    const jsBody = `
var tap=$('[data-role=tap]'); if(!tap)return;
var dot=$('[data-role=dot]'), bpmEl=$('[data-role=bpm]'), meta=$('[data-role=meta]'), reset=$('[data-role=reset]');
if(reduced)root.classList.add('pg-bt-reduce');
var GAP=2000, MAX=8, last=0, gaps=[], pulseTimer=null;
function clear(){last=0;gaps=[];if(bpmEl)bpmEl.textContent='\u2014';if(meta)meta.textContent='Keep tapping\u2026';}
function pulse(){
  if(reduced||!dot)return;
  dot.classList.remove('pulse');
  void dot.offsetWidth;
  dot.classList.add('pulse');
  if(pulseTimer)clearTimeout(pulseTimer);
  pulseTimer=setTimeout(function(){dot.classList.remove('pulse');},360);
}
function onTap(){
  var now=Date.now();
  pulse();
  if(last&&(now-last)<=GAP){
    gaps.push(now-last);
    if(gaps.length>MAX)gaps.shift();
  }else{
    gaps=[];
  }
  last=now;
  if(gaps.length<1){
    if(bpmEl)bpmEl.textContent='\u2014';
    if(meta)meta.textContent='Keep tapping\u2026';
  }else{
    var sum=0;for(var i=0;i<gaps.length;i++)sum+=gaps[i];
    var avg=sum/gaps.length;
    var bpm=Math.round(60000/avg);
    if(bpmEl)bpmEl.textContent=String(bpm);
    var n=gaps.length+1;
    if(meta)meta.textContent='Averaging '+n+' tap'+(n===1?'':'s');
  }
}
tap.addEventListener('click',onTap);
if(reset)reset.addEventListener('click',clear);
clear();
`;
    return { html, css, jsBody };
  }
};

// server/playgrounds/word-stats.js
var word_stats_default = {
  id: "word-stats",
  name: "Word counter",
  category: "tool",
  description: "Type or paste text to get live word, character and sentence counts plus a reading and speaking time.",
  paramsSchema: {
    type: "object",
    additionalProperties: false,
    required: [],
    properties: {
      title: { type: "string" },
      placeholder: { type: "string", default: "Type or paste anything\u2026" },
      wpm: { type: "number", default: 200, minimum: 50, maximum: 1e3 }
    }
  },
  presets: [
    { name: "How long is your speech?", params: { title: "How long is your speech?", placeholder: "Paste your speech here\u2026", wpm: 130 } },
    { name: "Tweet length check", params: { title: "Tweet length check", placeholder: "Draft your post here\u2026", wpm: 200 } }
  ],
  build(params, domId) {
    const clamp = (v, lo, hi, d) => {
      const n = Number(v);
      return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d;
    };
    const wpm = Math.round(clamp(params.wpm, 50, 1e3, 200));
    const placeholder = typeof params.placeholder === "string" && params.placeholder ? params.placeholder.slice(0, 120) : "Type or paste anything\u2026";
    const title = params.title ? `<div class="pg-ws-title">${esc(params.title)}</div>` : "";
    const html = `<div class="pg-stage">${title}<textarea class="pg-ws-input" data-role="in" rows="5" placeholder="${esc(placeholder)}"></textarea><div class="pg-readout pg-ws-cells"><div class="pg-ws-cell"><b data-role="words">0</b><span>Words</span></div><div class="pg-ws-cell"><b data-role="chars">0</b><span>Characters</span></div><div class="pg-ws-cell"><b data-role="sentences">0</b><span>Sentences</span></div><div class="pg-ws-cell"><b data-role="reading">&lt;1 min</b><span>Reading time</span></div><div class="pg-ws-cell"><b data-role="speaking">&lt;1 min</b><span>Speaking time</span></div></div></div>`;
    const css = [
      `#${domId} .pg-ws-title{font-weight:600;color:#e9eef8;margin-bottom:.8rem}`,
      `#${domId} .pg-ws-input{display:block;width:100%;box-sizing:border-box;min-height:6.5rem;resize:vertical;padding:.7rem .8rem;margin-bottom:1rem;border-radius:12px;border:1px solid #23304a;background:rgba(140,160,200,.06);color:#e9eef8;font:inherit;line-height:1.5}`,
      `#${domId} .pg-ws-input::placeholder{color:#7e8aa3}`,
      `#${domId} .pg-ws-input:focus{outline:none;border-color:#22d3ee;box-shadow:0 0 0 3px rgba(34,211,238,.18)}`,
      `#${domId} .pg-ws-cells{display:grid;grid-template-columns:repeat(2,1fr);gap:.6rem;padding:.9rem 1rem;border-radius:12px;border:1px solid #23304a;background:rgba(140,160,200,.06)}`,
      `@media(min-width:560px){#${domId} .pg-ws-cells{grid-template-columns:repeat(5,1fr)}}`,
      `#${domId} .pg-ws-cell{display:flex;flex-direction:column;gap:.15rem;text-align:center}`,
      `#${domId} .pg-ws-cell b{color:#22d3ee;font-size:1.3rem;font-weight:700;font-variant-numeric:tabular-nums;line-height:1.1}`,
      `#${domId} .pg-ws-cell:nth-child(4) b{color:#2dd4bf}`,
      `#${domId} .pg-ws-cell:nth-child(5) b{color:#818cf8}`,
      `#${domId} .pg-ws-cell span{color:#cdd6e6;font-size:.78rem}`
    ].join("\n");
    const jsBody = `
var inEl = $('[data-role=in]');
if(!inEl) return;
var wpm = Number(CONFIG.wpm);
if(!isFinite(wpm) || wpm <= 0) wpm = 200;
var wordsEl = $('[data-role=words]'), charsEl = $('[data-role=chars]'), sentencesEl = $('[data-role=sentences]');
var readingEl = $('[data-role=reading]'), speakingEl = $('[data-role=speaking]');
function fmtMin(words, rate){
  if(rate <= 0 || words <= 0) return '<1 min';
  var m = Math.ceil(words / rate);
  if(m <= 0) return '<1 min';
  return m + ' min';
}
function recompute(){
  var text = inEl.value || '';
  var trimmed = text.trim();
  var words = trimmed ? trimmed.split(/\\s+/).filter(function(w){ return w.length > 0; }).length : 0;
  var chars = text.length;
  var sentenceMatches = text.match(/[.!?]+/g);
  var sentences = sentenceMatches ? sentenceMatches.length : 0;
  if(wordsEl) wordsEl.textContent = String(words);
  if(charsEl) charsEl.textContent = String(chars);
  if(sentencesEl) sentencesEl.textContent = String(sentences);
  if(readingEl) readingEl.textContent = fmtMin(words, wpm);
  if(speakingEl) speakingEl.textContent = fmtMin(words, 130);
}
inEl.addEventListener('input', recompute);
recompute();
`;
    return { html, css, jsBody };
  }
};

// server/playgrounds/wheel-spinner.js
var wheel_spinner_default = {
  id: "wheel-spinner",
  name: "Decision wheel",
  category: "game",
  description: "Spin a wheel of options and let it pick one at random, for when you genuinely cannot decide.",
  paramsSchema: {
    type: "object",
    additionalProperties: false,
    required: ["options"],
    properties: {
      title: { type: "string" },
      options: { type: "array", minItems: 2, maxItems: 8, items: { type: "string" } }
    }
  },
  presets: [
    { name: "What's for dinner?", params: { title: "What's for dinner?", options: ["Pizza", "Curry", "Pasta", "Tacos", "Leftovers", "Surprise me"] } },
    { name: "Yes / No / Ask again", params: { title: "Yes / No / Ask again", options: ["Yes", "No", "Ask again later"] } }
  ],
  build(params, domId) {
    const all3 = Array.isArray(params.options) ? params.options.map((o) => String(o == null ? "" : o).trim()).filter(Boolean) : [];
    const options = all3.slice(0, 8);
    while (options.length < 2) options.push("Option " + (options.length + 1));
    const title = params.title ? `<div class="pg-ws-title">${esc(params.title)}</div>` : "";
    const html = `<div class="pg-stage">${title}<div class="pg-ws-wrap"><svg class="pg-ws-svg" viewBox="0 0 200 200" role="img" aria-label="Decision wheel"><g data-role="wheel" transform="rotate(0 100 100)"></g><polygon class="pg-ws-pointer" points="100,6 92,24 108,24"></polygon><circle class="pg-ws-hub" cx="100" cy="100" r="10"></circle></svg></div><div class="pg-controls"><div class="pg-row"><button type="button" class="pg-ws-btn" data-role="spin">Spin</button></div></div><div class="pg-readout pg-ws-out" data-role="out">Give it a spin.</div></div>`;
    const css = [
      `#${domId} .pg-ws-title{font-weight:700;margin-bottom:.6rem;color:var(--ink,#e9eef8)}`,
      `#${domId} .pg-ws-wrap{display:flex;justify-content:center;margin:.2rem 0 .8rem}`,
      `#${domId} .pg-ws-svg{width:100%;max-width:260px;height:auto;overflow:visible}`,
      `#${domId} [data-role=wheel]{transform-box:view-box;transform-origin:100px 100px;transition:transform 4s cubic-bezier(.17,.67,.18,1)}`,
      `#${domId} .pg-ws-seg{stroke:#04060c;stroke-width:1}`,
      `#${domId} .pg-ws-label{fill:#04060c;font-size:9px;font-weight:700;dominant-baseline:middle}`,
      `#${domId} .pg-ws-pointer{fill:#fbbf24;stroke:#04060c;stroke-width:1}`,
      `#${domId} .pg-ws-hub{fill:#0a0f1c;stroke:#23304a;stroke-width:2}`,
      `#${domId} .pg-ws-btn{font:inherit;font-weight:600;cursor:pointer;border:1px solid #22d3ee;background:rgba(34,211,238,.14);color:var(--ink,#e9eef8);padding:.45rem 1.1rem;border-radius:9px;transition:background .15s,border-color .15s}`,
      `#${domId} .pg-ws-btn:hover{background:rgba(34,211,238,.24)}`,
      `#${domId} .pg-ws-btn[disabled]{opacity:.5;cursor:default}`,
      `#${domId} .pg-readout{margin:.6rem 0;color:var(--ink-dim,#cdd6e6)}`,
      `#${domId} .pg-ws-out b{color:var(--ink,#e9eef8)}`,
      `#${domId}.pg-ws-reduce [data-role=wheel]{transition:none}`
    ].join("\n");
    const jsBody = `
var OPTIONS=${JSON.stringify(options)};
var PALETTE=['#2dd4bf','#22d3ee','#818cf8','#f472b6','#fbbf24','#34d399','#60a5fa','#c084fc'];
if(reduced)root.classList.add('pg-ws-reduce');
var wheel=$('[data-role=wheel]'), spinBtn=$('[data-role=spin]'), out=$('[data-role=out]');
if(!wheel||!spinBtn||!out)return;
var NS='http://www.w3.org/2000/svg';
var CX=100, CY=100, R=90, N=OPTIONS.length, STEP=360/N;

// polar -> cartesian; angle 0 = top (12 o'clock), increasing clockwise
function pt(angle,radius){
  var rad=(angle-90)*Math.PI/180;
  return { x:CX+radius*Math.cos(rad), y:CY+radius*Math.sin(rad) };
}

function buildWheel(){
  while(wheel.firstChild)wheel.removeChild(wheel.firstChild);
  for(var i=0;i<N;i++){
    var a0=i*STEP, a1=(i+1)*STEP;
    var p0=pt(a0,R), p1=pt(a1,R);
    var large=(a1-a0)>180?1:0;
    var d='M '+CX+' '+CY+' L '+p0.x.toFixed(2)+' '+p0.y.toFixed(2)+
          ' A '+R+' '+R+' 0 '+large+' 1 '+p1.x.toFixed(2)+' '+p1.y.toFixed(2)+' Z';
    var seg=document.createElementNS(NS,'path');
    seg.setAttribute('class','pg-ws-seg');
    seg.setAttribute('d',d);
    seg.setAttribute('fill',PALETTE[i%PALETTE.length]);
    wheel.appendChild(seg);
    // label, rotated to sit along its wedge
    var mid=a0+STEP/2;
    var lp=pt(mid,R*0.62);
    var txt=document.createElementNS(NS,'text');
    txt.setAttribute('class','pg-ws-label');
    txt.setAttribute('x',lp.x.toFixed(2));
    txt.setAttribute('y',lp.y.toFixed(2));
    txt.setAttribute('text-anchor','middle');
    var rot=mid; if(rot>90&&rot<270)rot+=180;
    txt.setAttribute('transform','rotate('+rot.toFixed(2)+' '+lp.x.toFixed(2)+' '+lp.y.toFixed(2)+')');
    var label=OPTIONS[i];
    txt.textContent=label.length>14?label.slice(0,13)+'\u2026':label;
    wheel.appendChild(txt);
  }
}
buildWheel();

var spinning=false, current=0;

function show(i){ out.innerHTML='\u2192 <b>'+OPTIONS[i].replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')+'</b>'; }

function spin(){
  if(spinning)return;
  var win=Math.floor(Math.random()*N);
  if(reduced){ current=0; wheel.style.transform='rotate(0deg)'; show(win); return; }
  spinning=true; spinBtn.disabled=true; out.textContent='Spinning\u2026';
  // angle (clockwise) that the chosen wedge centre currently sits at; rotate to bring it to the top
  var mid=win*STEP+STEP/2;
  var turns=5+Math.floor(Math.random()*3);
  var base=current - (current%360);          // strip current full turns
  var target=base + turns*360 + (360-mid);   // land wedge centre under the top pointer
  current=target;
  // animate via the CSS transform PROPERTY so the CSS transition runs; setting the SVG
  // transform ATTRIBUTE instead would not trigger the transition (it would jump).
  wheel.style.transform='rotate('+target.toFixed(2)+'deg)';
  var done=false;
  function finish(){ if(done)return; done=true; spinning=false; spinBtn.disabled=false; show(win); }
  wheel.addEventListener('transitionend',finish,{ once:true });
  setTimeout(finish,4300); // fallback if transitionend doesn't fire
}

spinBtn.addEventListener('click',spin);
`;
    return { html, css, jsBody };
  }
};

// server/playgrounds/memory-match.js
var memory_match_default = {
  id: "memory-match",
  name: "Memory match",
  category: "game",
  description: "Flip the face-down cards two at a time to find the matching pairs in as few moves as you can.",
  paramsSchema: {
    type: "object",
    additionalProperties: false,
    required: ["symbols"],
    properties: {
      title: { type: "string" },
      symbols: { type: "array", minItems: 3, maxItems: 8, items: { type: "string" } }
    }
  },
  presets: [
    { name: "Match the emoji", params: { title: "Match the emoji", symbols: ["\u{1F680}", "\u{1F3B8}", "\u{1F355}", "\u2693", "\u{1F3B2}", "\u{1F98A}"] } },
    { name: "Planets", params: { title: "Planets", symbols: ["\u263F", "\u2640", "\u2295", "\u2642", "\u2643", "\u2644"] } }
  ],
  build(params, domId) {
    const symbols = (Array.isArray(params.symbols) ? params.symbols : []).map((s) => String(s == null ? "" : s).trim()).filter((s) => s.length > 0).slice(0, 8);
    while (symbols.length < 3) symbols.push(String(symbols.length + 1));
    const title = params.title ? `<div class="pg-mm-title">${esc(params.title)}</div>` : "";
    const pairs = symbols.length;
    const cols = pairs <= 3 ? 3 : pairs <= 4 ? 4 : pairs <= 6 ? 4 : 4;
    const html = `<div class="pg-stage">${title}<div class="pg-readout">Moves: <b data-role="moves">0</b><span class="pg-mm-win" data-role="win" hidden></span></div><div class="pg-mm-grid" data-role="grid" role="grid" aria-label="Memory cards"></div><div class="pg-controls"><div class="pg-row"><button type="button" class="pg-mm-btn" data-role="restart">Restart</button></div></div></div>`;
    const css = [
      `#${domId} .pg-mm-title{font-weight:700;margin-bottom:.6rem;color:var(--ink,#e9eef8)}`,
      `#${domId} .pg-readout{margin:.2rem 0 .8rem;color:var(--ink-dim,#cdd6e6)}`,
      `#${domId} .pg-readout b{color:var(--ink,#e9eef8);font-variant-numeric:tabular-nums}`,
      `#${domId} .pg-mm-win{margin-left:.6rem;color:#2dd4bf;font-weight:600}`,
      `#${domId} .pg-mm-grid{display:grid;grid-template-columns:repeat(${cols},1fr);gap:.55rem;max-width:30rem}`,
      `#${domId} .pg-mm-card{position:relative;aspect-ratio:1/1;border:0;padding:0;background:transparent;cursor:pointer;font:inherit;perspective:800px}`,
      `#${domId} .pg-mm-card:disabled{cursor:default}`,
      `#${domId} .pg-mm-face{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;border-radius:11px;border:1px solid var(--line,#23304a);backface-visibility:hidden;-webkit-backface-visibility:hidden;transition:transform .35s ease;font-size:clamp(1.3rem,7vw,2rem);line-height:1}`,
      `#${domId} .pg-mm-back{background:rgba(140,160,200,.07);color:#818cf8;font-weight:700}`,
      `#${domId} .pg-mm-back::after{content:"?";opacity:.55}`,
      `#${domId} .pg-mm-front{background:rgba(34,211,238,.08);border-color:#22d3ee55;color:var(--ink,#e9eef8);transform:rotateY(180deg)}`,
      `#${domId} .pg-mm-card.up .pg-mm-back{transform:rotateY(180deg)}`,
      `#${domId} .pg-mm-card.up .pg-mm-front{transform:rotateY(360deg)}`,
      `#${domId} .pg-mm-card.matched .pg-mm-front{background:rgba(45,212,191,.14);border-color:#2dd4bf;color:#2dd4bf}`,
      `#${domId} .pg-mm-card.matched{cursor:default}`,
      `#${domId}.pg-mm-reduce .pg-mm-face{transition:none}`,
      `#${domId} .pg-mm-btn{font:inherit;font-weight:600;cursor:pointer;border:1px solid var(--line,#23304a);background:transparent;color:var(--ink-dim,#cdd6e6);padding:.45rem .8rem;border-radius:9px;transition:background .15s,border-color .15s}`,
      `#${domId} .pg-mm-btn:hover{background:rgba(140,160,200,.1);border-color:#818cf8}`
    ].join("\n");
    const jsBody = `
var SYMBOLS=${JSON.stringify(symbols)};
if(reduced)root.classList.add('pg-mm-reduce');
var grid=$('[data-role=grid]'), movesEl=$('[data-role=moves]'), winEl=$('[data-role=win]'), restartBtn=$('[data-role=restart]');
if(!grid||!movesEl)return;

var FLIP_MS=reduced?260:700;
var first=null, second=null, locked=false, moves=0, matched=0, pairs=SYMBOLS.length;

function shuffle(arr){
  for(var i=arr.length-1;i>0;i--){
    var j=Math.floor(Math.random()*(i+1));
    var t=arr[i]; arr[i]=arr[j]; arr[j]=t;
  }
  return arr;
}

function makeDeck(){
  var deck=[];
  for(var i=0;i<pairs;i++){ deck.push(SYMBOLS[i]); deck.push(SYMBOLS[i]); }
  return shuffle(deck);
}

function setMoves(n){ moves=n; movesEl.textContent=String(moves); }

function deal(){
  first=null; second=null; locked=false; matched=0;
  setMoves(0);
  winEl.hidden=true; winEl.textContent='';
  grid.textContent='';
  var deck=makeDeck();
  deck.forEach(function(sym){
    var card=document.createElement('button');
    card.type='button';
    card.className='pg-mm-card';
    card.setAttribute('role','gridcell');
    card.setAttribute('aria-label','face-down card');
    card.dataset.sym=sym;

    var back=document.createElement('span');
    back.className='pg-mm-face pg-mm-back';
    back.setAttribute('aria-hidden','true');

    var front=document.createElement('span');
    front.className='pg-mm-face pg-mm-front';
    front.textContent=sym;

    card.appendChild(back);
    card.appendChild(front);
    card.addEventListener('click',function(){ onFlip(card); });
    grid.appendChild(card);
  });
}

function reveal(card){
  card.classList.add('up');
  card.setAttribute('aria-label',card.dataset.sym);
}

function onFlip(card){
  if(locked) return;
  if(card.classList.contains('matched')||card.classList.contains('up')) return;
  if(first&&second) return;

  reveal(card);

  if(!first){ first=card; return; }

  second=card;
  setMoves(moves+1);

  if(first.dataset.sym===second.dataset.sym){
    var a=first, b=second;
    a.classList.add('matched'); b.classList.add('matched');
    a.disabled=true; b.disabled=true;
    first=null; second=null;
    matched++;
    if(matched===pairs){
      winEl.textContent='You found them all in '+moves+' moves \u{1F389}';
      winEl.hidden=false;
    }
    return;
  }

  locked=true;
  var c1=first, c2=second;
  first=null; second=null;
  setTimeout(function(){
    c1.classList.remove('up'); c2.classList.remove('up');
    c1.setAttribute('aria-label','face-down card');
    c2.setAttribute('aria-label','face-down card');
    locked=false;
  },FLIP_MS);
}

if(restartBtn)restartBtn.addEventListener('click',deal);
deal();
`;
    return { html, css, jsBody };
  }
};

// server/playgrounds/star-rating.js
var star_rating_default = {
  id: "star-rating",
  name: "Star rating",
  category: "ui",
  description: "Tap to give a star rating, with a plain-English label for each level.",
  paramsSchema: {
    type: "object",
    additionalProperties: false,
    required: ["max"],
    properties: {
      title: { type: "string" },
      max: { type: "number", default: 5, minimum: 3, maximum: 10 },
      labels: { type: "array", items: { type: "string" } }
    }
  },
  presets: [
    { name: "Rate this film", params: { title: "Rate this film", max: 5, labels: ["Awful", "Meh", "Fine", "Great", "Brilliant"] } },
    { name: "How was the coffee?", params: { title: "How was the coffee?", max: 5, labels: ["Undrinkable", "Weak", "OK", "Good", "Perfect"] } }
  ],
  build(params, domId) {
    const max = Math.max(3, Math.min(10, Math.round(params.max || 5)));
    const labels = Array.isArray(params.labels) ? params.labels.slice(0, max).map((l) => esc(l)) : [];
    const title = params.title ? `<div class="pg-sr-title">${esc(params.title)}</div>` : "";
    let stars = "";
    for (let i = 1; i <= max; i++) {
      stars += `<button type="button" class="pg-sr-star" data-role="star" data-value="${i}" aria-label="Rate ${i} of ${max}" aria-pressed="false">\u2605</button>`;
    }
    const html = `<div class="pg-stage">${title}<div class="pg-sr-row" data-role="stars" role="radiogroup" aria-label="Star rating">${stars}</div><div class="pg-readout pg-sr-readout" data-role="readout" aria-live="polite">Tap to rate</div></div>`;
    const css = [
      `#${domId} .pg-sr-title{font-weight:600;color:var(--ink,#e9eef8);margin-bottom:.6rem}`,
      `#${domId} .pg-sr-row{display:flex;gap:.25rem;flex-wrap:wrap}`,
      `#${domId} .pg-sr-star{border:0;background:transparent;padding:.1rem .15rem;cursor:pointer;font-size:2rem;line-height:1;color:#3a4660;transition:color .12s,transform .12s}`,
      `#${domId} .pg-sr-star:hover,#${domId} .pg-sr-star:focus-visible{transform:scale(1.12)}`,
      `#${domId} .pg-sr-star:focus-visible{outline:2px solid #22d3ee;outline-offset:2px;border-radius:4px}`,
      `#${domId} .pg-sr-star.on{color:#fbbf24}`,
      `#${domId} .pg-sr-readout{margin-top:.7rem;font-variant-numeric:tabular-nums;color:var(--ink-dim,#cdd6e6)}`,
      `#${domId} .pg-sr-readout b{color:#fbbf24}`,
      `#${domId}.pg-sr-reduce .pg-sr-star{transition:none}`
    ].join("\n");
    const jsBody = `
if(reduced)root.classList.add('pg-sr-reduce');
var MAX=${max};
var LABELS=${JSON.stringify(labels)};
var stars=$$('[data-role=star]');
var readout=$('[data-role=readout]');
if(!stars.length||!readout)return;
var chosen=0;
function paint(n){
  stars.forEach(function(s,i){
    var on=(i+1)<=n;
    s.classList.toggle('on',on);
    s.setAttribute('aria-pressed',(i+1)<=chosen?'true':'false');
  });
}
function label(n){return (LABELS[n-1]!=null&&LABELS[n-1]!=='')?LABELS[n-1]:'';}
function show(n){
  if(n<=0){readout.textContent='Tap to rate';return;}
  var l=label(n);
  readout.innerHTML='<b>'+n+'</b> / '+MAX+(l?' \\u2014 '+l:'');
}
stars.forEach(function(s){
  var v=parseInt(s.getAttribute('data-value'),10)||0;
  function preview(){paint(v);show(v);}
  function revert(){paint(chosen);show(chosen);}
  s.addEventListener('pointerover',preview);
  s.addEventListener('focus',preview);
  s.addEventListener('mouseleave',revert);
  s.addEventListener('blur',revert);
  s.addEventListener('click',function(){chosen=v;paint(chosen);show(chosen);});
});
paint(0);show(0);
`;
    return { html, css, jsBody };
  }
};

// server/playgrounds/emoji-slider.js
var emoji_slider_default = {
  id: "emoji-slider",
  name: "Emoji scale",
  category: "explorer",
  description: "A slider that maps a 0\u2013100 value to the nearest emoji and label on a scale, for any spectrum you want to feel rather than measure.",
  paramsSchema: {
    type: "object",
    additionalProperties: false,
    required: ["stops"],
    properties: {
      title: { type: "string", title: "Optional label above the scale" },
      stops: {
        type: "array",
        title: "Scale stops (low\u2192high)",
        minItems: 2,
        maxItems: 7,
        items: {
          type: "object",
          additionalProperties: false,
          required: ["at", "emoji", "label"],
          properties: {
            at: { type: "number", title: "Position 0\u2013100", minimum: 0, maximum: 100 },
            emoji: { type: "string", title: "Emoji" },
            label: { type: "string", title: "Label" }
          }
        }
      }
    }
  },
  presets: [
    {
      name: "How spicy can you handle?",
      params: {
        title: "How spicy can you handle?",
        stops: [
          { at: 0, emoji: "\u{1F95B}", label: "Mild" },
          { at: 35, emoji: "\u{1F336}\uFE0F", label: "Warm" },
          { at: 70, emoji: "\u{1F525}", label: "Hot" },
          { at: 100, emoji: "\u{1F480}", label: "Regret" }
        ]
      }
    },
    {
      name: "Monday mood",
      params: {
        title: "Monday mood",
        stops: [
          { at: 0, emoji: "\u{1F634}", label: "Asleep" },
          { at: 50, emoji: "\u{1F610}", label: "Coping" },
          { at: 100, emoji: "\u{1F929}", label: "Unstoppable" }
        ]
      }
    }
  ],
  build(params, domId) {
    const stops = (Array.isArray(params.stops) ? params.stops : []).filter((s) => s && typeof s === "object").map((s) => ({
      at: Math.max(0, Math.min(100, Number(s.at) || 0)),
      emoji: String(s.emoji || "\u2022"),
      label: String(s.label || "")
    })).sort((a, b) => a.at - b.at).slice(0, 7);
    while (stops.length < 2) stops.push({ at: 100, emoji: "\u2022", label: "" });
    const start = stops[Math.floor((stops.length - 1) / 2)];
    const title = params.title ? `<div class="pg-es-title">${esc(params.title)}</div>` : "";
    const html = `<div class="pg-stage">${title}<div class="pg-es-readout" aria-live="polite"><div class="pg-es-emoji" data-role="emoji">${esc(start.emoji)}</div><div class="pg-es-label pg-readout" data-role="label">${esc(start.label)}</div></div><div class="pg-row"><label style="flex:1">Slide<input type="range" data-role="slider" min="0" max="100" value="${start.at}" step="1" aria-label="Scale position 0 to 100"></label></div></div>`;
    const css = [
      `#${domId} .pg-es-title{font-size:.9rem;color:var(--ink-dim,#9fb3c8);margin:0 0 .6rem}`,
      `#${domId} .pg-es-readout{text-align:center;margin:.2rem 0 .8rem}`,
      `#${domId} .pg-es-emoji{font-size:3.4rem;line-height:1;display:inline-block;transform:scale(1);transition:transform .18s ease}`,
      `#${domId} .pg-es-emoji.pg-es-pop{transform:scale(1.28)}`,
      `#${domId}.pg-es-reduce .pg-es-emoji{transition:none}`,
      `#${domId} .pg-es-label{margin-top:.4rem;font-size:1.15rem;font-weight:700;color:#22d3ee}`
    ].join("\n");
    const jsBody = `
var emoji=$('[data-role=emoji]'),label=$('[data-role=label]'),slider=$('[data-role=slider]');
if(!emoji||!label||!slider)return;
if(reduced)root.classList.add('pg-es-reduce');
var stops=${JSON.stringify(stops)};
var popTimer=null;
function nearest(v){
  var best=stops[0],bd=Math.abs(v-stops[0].at);
  for(var i=1;i<stops.length;i++){var d=Math.abs(v-stops[i].at);if(d<bd){bd=d;best=stops[i];}}
  return best;
}
var last=null;
function set(v){
  var s=nearest(v);
  if(s===last)return;
  last=s;
  emoji.textContent=s.emoji;
  label.textContent=s.label;
  if(!reduced){
    emoji.classList.remove('pg-es-pop');
    void emoji.offsetWidth;            // restart the transition
    emoji.classList.add('pg-es-pop');
    if(popTimer)clearTimeout(popTimer);
    popTimer=setTimeout(function(){emoji.classList.remove('pg-es-pop');},190);
  }
}
slider.addEventListener('input',function(){set(parseFloat(slider.value));});
last=nearest(parseFloat(slider.value));  // sync without popping on first paint
`;
    return { html, css, jsBody };
  }
};

// server/playgrounds/odometer.js
var odometer_default = {
  id: "odometer",
  name: "Counter reveal",
  category: "data",
  description: "A big number that animates up to its value \u2014 a striking way to land a single stat.",
  paramsSchema: {
    type: "object",
    additionalProperties: false,
    required: ["target"],
    properties: {
      title: { type: "string" },
      target: { type: "number" },
      prefix: { type: "string", default: "" },
      suffix: { type: "string", default: "" },
      duration: { type: "number", default: 1500, minimum: 200, maximum: 1e4 },
      caption: { type: "string" }
    }
  },
  presets: [
    { name: "Seconds in a day", params: { title: "Seconds in a day", target: 86400, suffix: " s", caption: "And we waste most of them." } },
    { name: "Heartbeats in a year", params: { title: "Heartbeats in a year", target: 36792e3, caption: "Roughly. Give or take a coffee." } }
  ],
  build(params, domId) {
    const target = Number.isFinite(params.target) ? params.target : 0;
    const prefix = typeof params.prefix === "string" ? params.prefix : "";
    const suffix = typeof params.suffix === "string" ? params.suffix : "";
    const duration = Math.max(200, Math.min(1e4, Math.round(params.duration || 1500)));
    const title = params.title ? `<div class="pg-od-title">${esc(params.title)}</div>` : "";
    const caption = params.caption ? `<div class="pg-od-caption">${esc(params.caption)}</div>` : "";
    const html = `<div class="pg-stage">${title}<div class="pg-od-num" data-role="num" aria-live="polite"><span class="pg-od-fix">${esc(prefix)}</span><span class="pg-od-val">0</span><span class="pg-od-fix">${esc(suffix)}</span></div>${caption}<div class="pg-controls"><button type="button" class="pg-od-go" data-role="go">Reveal again</button></div></div>`;
    const css = [
      `#${domId} .pg-od-title{font-size:.95rem;color:var(--ink-dim,#cdd6e6);margin-bottom:.4rem}`,
      `#${domId} .pg-od-num{display:flex;align-items:baseline;justify-content:center;gap:.05em;font-weight:800;line-height:1;letter-spacing:-.02em;font-size:clamp(2.6rem,11vw,4.6rem);font-variant-numeric:tabular-nums;background:linear-gradient(90deg,#2dd4bf,#22d3ee,#818cf8);-webkit-background-clip:text;background-clip:text;color:transparent}`,
      `#${domId} .pg-od-fix{font-size:.5em;font-weight:700;opacity:.85}`,
      `#${domId} .pg-od-caption{text-align:center;color:var(--ink-dim,#cdd6e6);margin-top:.5rem;font-size:.95rem}`,
      `#${domId} .pg-controls{display:flex;justify-content:center;margin-top:1rem}`,
      `#${domId} .pg-od-go{font:inherit;cursor:pointer;color:var(--ink,#e9eef8);background:rgba(34,211,238,.08);border:1px solid #22d3ee55;border-radius:10px;padding:.5rem .9rem;transition:background .2s,border-color .2s}`,
      `#${domId} .pg-od-go:hover{background:rgba(34,211,238,.16);border-color:#22d3ee}`
    ].join("\n");
    const jsBody = `
var TARGET=${JSON.stringify(target)};
var DURATION=${JSON.stringify(duration)};
var val=$('.pg-od-val'); if(!val)return;
var go=$('[data-role=go]');
var fmt=function(n){return Math.round(n).toLocaleString('en-GB');};
var raf=null;
function run(){
  if(raf)cancelAnimationFrame(raf);
  if(reduced){val.textContent=fmt(TARGET);return;}
  var start=null;
  function step(ts){
    if(start===null)start=ts;
    var t=Math.min(1,(ts-start)/DURATION);
    var e=1-Math.pow(1-t,3);
    val.textContent=fmt(TARGET*e);
    if(t<1){raf=requestAnimationFrame(step);}else{val.textContent=fmt(TARGET);raf=null;}
  }
  raf=requestAnimationFrame(step);
}
if(go)go.addEventListener('click',run);
run();
`;
    return { html, css, jsBody };
  }
};

// server/playgrounds/word-scramble.js
var word_scramble_default = {
  id: "word-scramble",
  name: "Word scramble",
  category: "game",
  description: "Unscramble the shuffled word from its hint \u2014 guess, reveal, or skip to the next one.",
  paramsSchema: {
    type: "object",
    additionalProperties: false,
    required: ["words"],
    properties: {
      title: { type: "string" },
      words: {
        type: "array",
        minItems: 1,
        maxItems: 12,
        items: {
          type: "object",
          additionalProperties: false,
          required: ["word", "hint"],
          properties: { word: { type: "string" }, hint: { type: "string" } }
        }
      }
    }
  },
  presets: [
    { name: "Unscramble the capitals", params: {
      title: "Unscramble the capitals",
      words: [
        { word: "PARIS", hint: "France" },
        { word: "TOKYO", hint: "Japan" },
        { word: "CAIRO", hint: "Egypt" },
        { word: "OSLO", hint: "Norway" }
      ]
    } },
    { name: "Fruit bowl", params: {
      title: "Fruit bowl",
      words: [
        { word: "BANANA", hint: "Goes brown fast" },
        { word: "CHERRY", hint: "Comes in pairs" },
        { word: "MANGO", hint: "Stone in the middle" }
      ]
    } }
  ],
  build(params, domId) {
    const words = (Array.isArray(params.words) ? params.words : []).filter((w) => w && typeof w.word === "string" && w.word.trim()).slice(0, 12).map((w) => ({ word: String(w.word), hint: String(w.hint == null ? "" : w.hint) }));
    const title = params.title ? `<div class="pg-ws-title">${esc(params.title)}</div>` : "";
    const html = `<div class="pg-stage">${title}<div class="pg-ws-scramble" data-role="scramble" aria-live="polite"></div><div class="pg-ws-hint"><span class="pg-ws-hint-label">Hint</span> <span data-role="hint"></span></div><div class="pg-row pg-ws-entry"><input type="text" class="pg-ws-input" data-role="input" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="Your answer"><button type="button" class="pg-ws-btn pg-ws-primary" data-role="check">Check</button></div><div class="pg-row pg-ws-actions"><button type="button" class="pg-ws-btn" data-role="reveal">Reveal</button><button type="button" class="pg-ws-btn" data-role="next">Next</button><span class="pg-ws-feedback" data-role="feedback" aria-live="polite"></span></div><div class="pg-readout pg-ws-readout"><span data-role="progress"></span> \xB7 Score <b data-role="score">0</b></div></div>`;
    const css = [
      `#${domId} .pg-ws-title{font-weight:600;margin-bottom:.6rem}`,
      `#${domId} .pg-ws-scramble{font-size:1.8rem;font-weight:700;letter-spacing:.35em;text-transform:uppercase;color:#22d3ee;margin:.2rem 0 .6rem;min-height:1.6em}`,
      `#${domId} .pg-ws-hint{color:var(--ink-dim,#cdd6e6);margin-bottom:.8rem}`,
      `#${domId} .pg-ws-hint-label{display:inline-block;font-size:.72rem;text-transform:uppercase;letter-spacing:.08em;color:#fbbf24;border:1px solid #fbbf2455;border-radius:6px;padding:.05rem .4rem;margin-right:.4rem}`,
      `#${domId} .pg-row{display:flex;flex-wrap:wrap;align-items:center;gap:.5rem}`,
      `#${domId} .pg-ws-entry{margin-bottom:.55rem}`,
      `#${domId} .pg-ws-input{flex:1 1 12rem;min-width:0;background:rgba(140,160,200,.06);border:1px solid var(--line,#23304a);border-radius:9px;color:var(--ink,#e9eef8);font:inherit;padding:.5rem .7rem}`,
      `#${domId} .pg-ws-input:focus{outline:none;border-color:#22d3ee;box-shadow:0 0 0 2px #22d3ee33}`,
      `#${domId} .pg-ws-btn{background:rgba(140,160,200,.06);border:1px solid var(--line,#23304a);border-radius:9px;color:var(--ink,#e9eef8);font:inherit;font-weight:600;padding:.5rem .9rem;cursor:pointer}`,
      `#${domId} .pg-ws-btn:hover{border-color:#818cf8}`,
      `#${domId} .pg-ws-primary{background:#22d3ee1a;border-color:#22d3ee66;color:#22d3ee}`,
      `#${domId} .pg-ws-actions{margin-bottom:.7rem}`,
      `#${domId} .pg-ws-feedback{font-weight:600}`,
      `#${domId} .pg-ws-feedback.ok{color:#2dd4bf}`,
      `#${domId} .pg-ws-feedback.no{color:#f472b6}`,
      `#${domId} .pg-ws-readout{color:var(--ink-dim,#cdd6e6);font-size:.85rem}`,
      `#${domId} .pg-ws-readout b{color:#fbbf24}`
    ].join("\n");
    const jsBody = `
var WORDS = ${JSON.stringify(words)};
var scrambleEl = $('[data-role=scramble]');
var hintEl = $('[data-role=hint]');
var input = $('[data-role=input]');
var checkBtn = $('[data-role=check]');
var revealBtn = $('[data-role=reveal]');
var nextBtn = $('[data-role=next]');
var feedback = $('[data-role=feedback]');
var scoreEl = $('[data-role=score]');
var progressEl = $('[data-role=progress]');
if(!scrambleEl||!input||!checkBtn||!revealBtn||!nextBtn||!WORDS.length)return;

var idx = 0;
var score = 0;
var solved = {};

function shuffle(letters){
  var a = letters.slice();
  for(var i=a.length-1;i>0;i--){
    var j=Math.floor(Math.random()*(i+1));
    var t=a[i];a[i]=a[j];a[j]=t;
  }
  return a;
}

function scramble(word){
  var letters = word.split('');
  if(letters.length<=1)return letters.join('');
  var out = shuffle(letters);
  var tries = 0;
  while(letters.length>3 && out.join('')===letters.join('') && tries<20){
    out = shuffle(letters);
    tries++;
  }
  return out.join('');
}

function setFeedback(msg, kind){
  feedback.textContent = msg || '';
  feedback.className = 'pg-ws-feedback' + (kind ? ' ' + kind : '');
}

function render(){
  var item = WORDS[idx];
  scrambleEl.textContent = scramble(item.word.toUpperCase()).split('').join(' ');
  hintEl.textContent = item.hint;
  input.value = '';
  setFeedback('');
  progressEl.textContent = 'Word ' + (idx+1) + ' of ' + WORDS.length;
}

function check(){
  var item = WORDS[idx];
  var guess = input.value.trim().toLowerCase();
  if(!guess){ setFeedback('Type a guess first.', null); return; }
  if(guess === item.word.toLowerCase()){
    if(!solved[idx]){ solved[idx]=true; score++; scoreEl.textContent=String(score); }
    setFeedback('\\u2713 correct', 'ok');
  } else {
    setFeedback('\\u2717 try again', 'no');
  }
}

function reveal(){
  setFeedback('\\u2192 ' + WORDS[idx].word.toUpperCase(), null);
}

function next(){
  idx = (idx + 1) % WORDS.length;
  render();
  input.focus();
}

checkBtn.addEventListener('click', check);
revealBtn.addEventListener('click', reveal);
nextBtn.addEventListener('click', next);
input.addEventListener('keydown', function(e){
  if(e.key === 'Enter'){ e.preventDefault(); check(); }
});

render();
`;
    return { html, css, jsBody };
  }
};

// server/playgrounds/colour-palette.js
var HEX = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
var colour_palette_default = {
  id: "colour-palette",
  name: "Colour palette",
  category: "art",
  description: "A row of colour swatches pulled from a painting; tap one to see its name and hex.",
  paramsSchema: {
    type: "object",
    additionalProperties: false,
    required: ["swatches"],
    properties: {
      title: { type: "string" },
      caption: { type: "string" },
      swatches: { type: "array", minItems: 3, maxItems: 8, items: {
        type: "object",
        additionalProperties: false,
        required: ["hex", "name"],
        properties: { hex: { type: "string" }, name: { type: "string" } }
      } }
    }
  },
  presets: [
    { name: "A Starry Night, in five colours", params: {
      title: "A Starry Night, in five colours",
      swatches: [
        { hex: "#0b1d51", name: "Night sky" },
        { hex: "#1b3b6f", name: "Deep blue" },
        { hex: "#f2c14e", name: "Star gold" },
        { hex: "#3a7ca5", name: "Cypress teal" },
        { hex: "#0a0f1c", name: "Village dark" }
      ],
      caption: "Roughly \u2014 eyeballed, not spectrometer-accurate."
    } },
    { name: "Sunset over the sea", params: {
      title: "Sunset over the sea",
      swatches: [
        { hex: "#f9a26c", name: "Glow" },
        { hex: "#f76b8a", name: "Coral" },
        { hex: "#5b3758", name: "Dusk" },
        { hex: "#1b2a4a", name: "Sea" }
      ]
    } }
  ],
  build(params, domId) {
    const swatches = (Array.isArray(params.swatches) ? params.swatches : []).filter((s) => s && HEX.test(s.hex || "")).slice(0, 8);
    const title = params.title ? `<div class="pg-cp-title">${esc(params.title)}</div>` : "";
    const caption = params.caption ? `<div class="pg-cp-caption">${esc(params.caption)}</div>` : "";
    const swatchesHtml = swatches.map((s, i) => `<button type="button" class="pg-cp-swatch" data-role="swatch" data-hex="${esc(s.hex)}" data-name="${esc(s.name)}" style="background:${esc(s.hex)}" aria-pressed="${i === 0 ? "true" : "false"}"><span class="pg-cp-sr">${esc(s.name)}</span></button>`).join("");
    const html = `<div class="pg-stage">${title}<div class="pg-cp-row" role="group">${swatchesHtml}</div><div class="pg-readout pg-cp-readout" data-role="readout" aria-live="polite"></div>${caption}</div>`;
    const css = [
      `#${domId} .pg-cp-title{font-weight:600;color:var(--ink,#e9eef8);margin-bottom:.7rem}`,
      `#${domId} .pg-cp-row{display:flex;flex-wrap:wrap;gap:.6rem}`,
      `#${domId} .pg-cp-swatch{flex:1 1 64px;min-width:56px;height:72px;border-radius:14px;border:1px solid rgba(255,255,255,.12);cursor:pointer;padding:0;outline:none;box-shadow:none;transition:outline-color .15s,box-shadow .15s,transform .15s}`,
      `#${domId} .pg-cp-swatch:hover{transform:translateY(-2px)}`,
      `#${domId} .pg-cp-swatch[aria-pressed=true]{outline:3px solid #22d3ee;outline-offset:3px;box-shadow:0 0 0 1px rgba(34,211,238,.35)}`,
      `#${domId} .pg-cp-sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0,0,0,0)}`,
      `#${domId} .pg-cp-readout{margin-top:.9rem;font-weight:600;color:var(--ink,#e9eef8);min-height:1.4em}`,
      `#${domId} .pg-cp-readout .pg-cp-hex{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;color:#22d3ee}`,
      `#${domId} .pg-cp-caption{margin-top:.6rem;font-size:.85rem;color:var(--ink-dim,#9aa6bd)}`
    ].join("\n");
    const jsBody = `
var HEX=/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
var readout=$('[data-role=readout]');
var swatches=$$('[data-role=swatch]');
if(!readout||!swatches.length)return;
function select(btn){
  var hex=btn.getAttribute('data-hex')||'';
  if(!HEX.test(hex))return;
  swatches.forEach(function(s){s.setAttribute('aria-pressed',s===btn?'true':'false');});
  var name=btn.getAttribute('data-name')||'';
  readout.innerHTML=name.replace(/[&<>]/g,function(c){return c==='&'?'&amp;':c==='<'?'&lt;':'&gt;';})+
    ' \u2014 <span class="pg-cp-hex">'+hex.toUpperCase()+'</span>';
}
swatches.forEach(function(btn){
  btn.addEventListener('click',function(){select(btn);});
});
var first=swatches.find(function(s){return s.getAttribute('aria-pressed')==='true';})||swatches[0];
select(first);
`;
    return { html, css, jsBody };
  }
};

// server/playgrounds/world-clocks.js
var world_clocks_default = {
  id: "world-clocks",
  name: "World clocks",
  category: "data",
  description: "Live local times across a handful of cities at once \u2014 handy for working out when anyone is actually awake.",
  paramsSchema: {
    type: "object",
    additionalProperties: false,
    required: ["cities"],
    properties: {
      title: { type: "string" },
      caption: { type: "string" },
      cities: { type: "array", minItems: 2, maxItems: 8, items: {
        type: "object",
        additionalProperties: false,
        required: ["name", "offset"],
        properties: {
          name: { type: "string" },
          offset: { type: "number", minimum: -12, maximum: 14 }
        }
      } }
    }
  },
  presets: [
    { name: "Around the world right now", params: {
      title: "Around the world right now",
      cities: [
        { name: "London", offset: 0 },
        { name: "New York", offset: -5 },
        { name: "Mumbai", offset: 5.5 },
        { name: "Tokyo", offset: 9 },
        { name: "Sydney", offset: 11 }
      ],
      caption: "Local times, updating every second. Offsets are from UTC and ignore daylight saving."
    } },
    { name: "When can I call home?", params: {
      title: "When can I call home?",
      cities: [
        { name: "London", offset: 0 },
        { name: "Los Angeles", offset: -8 },
        { name: "Berlin", offset: 1 }
      ],
      caption: "Find the overlap where everyone is awake before you dial."
    } }
  ],
  build(params, domId) {
    const cities = (Array.isArray(params.cities) ? params.cities : []).slice(0, 8).filter((c) => c && typeof c.name === "string").map((c) => ({ name: c.name, offset: Number(c.offset) || 0 }));
    const title = params.title ? `<div class="pg-wc-title">${esc(params.title)}</div>` : "";
    const caption = params.caption ? `<div class="pg-wc-caption">${esc(params.caption)}</div>` : "";
    const cardsHtml = cities.map((c) => `<div class="pg-wc-card" data-role="card" data-offset="${c.offset}"><div class="pg-wc-name">${esc(c.name)}</div><div class="pg-wc-time"><span class="pg-wc-hm" data-role="hm">--:--</span><span class="pg-wc-sec" data-role="sec">--</span></div><div class="pg-wc-glyph" data-role="glyph" aria-hidden="true">\xB7</div></div>`).join("");
    const html = `<div class="pg-stage">${title}<div class="pg-wc-grid">${cardsHtml}</div>${caption}</div>`;
    const css = [
      `#${domId} .pg-wc-title{font-weight:700;font-size:1.05rem;margin-bottom:.7rem;color:#e9eef8}`,
      `#${domId} .pg-wc-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:.7rem}`,
      `#${domId} .pg-wc-card{position:relative;padding:.9rem 1rem;border-radius:12px;border:1px solid #23304a;background:rgba(140,160,200,.05)}`,
      `#${domId} .pg-wc-card.is-night{background:rgba(129,140,248,.07);border-color:#818cf855}`,
      `#${domId} .pg-wc-card.is-day{background:rgba(251,191,36,.06);border-color:#fbbf2455}`,
      `#${domId} .pg-wc-name{font-weight:600;color:#cdd6e6;font-size:.9rem;letter-spacing:.01em}`,
      `#${domId} .pg-wc-time{margin-top:.35rem;display:flex;align-items:baseline;gap:.3rem;font-variant-numeric:tabular-nums}`,
      `#${domId} .pg-wc-hm{font-size:1.8rem;font-weight:700;color:#22d3ee;line-height:1}`,
      `#${domId} .pg-wc-sec{font-size:.95rem;font-weight:600;color:#2dd4bf}`,
      `#${domId} .pg-wc-glyph{position:absolute;top:.7rem;right:.85rem;font-size:1.2rem}`,
      `#${domId} .pg-wc-caption{margin-top:.8rem;font-size:.82rem;color:#9aa6bd}`
    ].join("\n");
    const jsBody = `
var cards=$$('[data-role=card]');
if(!cards.length)return;
function pad(n){return (n<10?'0':'')+n;}
function tick(){
  var now=new Date();
  var utcMs=now.getTime()+now.getTimezoneOffset()*60000;
  cards.forEach(function(card){
    var offset=parseFloat(card.getAttribute('data-offset'))||0;
    var local=new Date(utcMs+offset*3600000);
    var h=local.getHours(), m=local.getMinutes(), s=local.getSeconds();
    var hm=card.querySelector('[data-role=hm]');
    var sec=card.querySelector('[data-role=sec]');
    var glyph=card.querySelector('[data-role=glyph]');
    if(hm)hm.textContent=pad(h)+':'+pad(m);
    if(sec)sec.textContent=pad(s);
    var day=(h>=6&&h<18);
    if(glyph)glyph.textContent=day?'\u2600':'\u{1F319}';
    card.classList.toggle('is-day',day);
    card.classList.toggle('is-night',!day);
  });
}
tick();
if(root._wcTimer)clearInterval(root._wcTimer);
root._wcTimer=setInterval(tick,1000);
`;
    return { html, css, jsBody };
  }
};

// server/playgrounds/book-shelf.js
var PALETTE2 = ["#2dd4bf", "#22d3ee", "#818cf8", "#f472b6", "#fbbf24", "#34d399"];
var book_shelf_default = {
  id: "book-shelf",
  name: "Bookshelf",
  category: "reveal",
  description: "A shelf of book spines; tap a spine to reveal its title, author and a one-line note.",
  paramsSchema: {
    type: "object",
    additionalProperties: false,
    required: ["books"],
    properties: {
      title: { type: "string" },
      caption: { type: "string" },
      books: {
        type: "array",
        minItems: 2,
        maxItems: 10,
        items: {
          type: "object",
          additionalProperties: false,
          required: ["title", "author", "note"],
          properties: {
            title: { type: "string" },
            author: { type: "string" },
            note: { type: "string" },
            colour: { type: "string" }
          }
        }
      }
    }
  },
  presets: [
    {
      name: "Three that changed how I think",
      params: {
        title: "Three that changed how I think",
        books: [
          { title: "Thinking, Fast and Slow", author: "Daniel Kahneman", note: "Why your gut is confidently wrong." },
          { title: "Sapiens", author: "Yuval Noah Harari", note: "A cheeky gallop through human history." },
          { title: "The Order of Time", author: "Carlo Rovelli", note: "Time is stranger, and more local, than you think." }
        ]
      }
    },
    {
      name: "Holiday reading",
      params: {
        title: "Holiday reading",
        books: [
          { title: "The Hobbit", author: "J.R.R. Tolkien", note: "There and back again." },
          { title: "Project Hail Mary", author: "Andy Weir", note: "Science, alone, in space \u2014 and oddly heart-warming." }
        ]
      }
    }
  ],
  build(params, domId) {
    const raw = Array.isArray(params.books) ? params.books.slice(0, 10) : [];
    const books = raw.map((b, i) => {
      const colour = /^#[0-9a-fA-F]{3,8}$/.test(b && b.colour || "") ? b.colour : PALETTE2[i % PALETTE2.length];
      return { title: String(b && b.title || ""), author: String(b && b.author || ""), note: String(b && b.note || ""), colour };
    });
    const title = params.title ? `<div class="pg-bs-title">${esc(params.title)}</div>` : "";
    const caption = params.caption ? `<div class="pg-bs-caption">${esc(params.caption)}</div>` : "";
    const spines = books.map(
      (b, i) => `<button type="button" class="pg-bs-spine" data-role="spine" data-i="${i}" aria-pressed="false" style="--spine:${esc(b.colour)}"><span class="pg-bs-spine-text">${esc(b.title)}</span></button>`
    ).join("");
    const html = `<div class="pg-stage">${title}<div class="pg-bs-shelf" role="group" aria-label="Bookshelf"><div class="pg-bs-row">${spines}</div><div class="pg-bs-board" aria-hidden="true"></div></div><div class="pg-bs-detail" data-role="detail" aria-live="polite"><span class="pg-bs-prompt">Pick a book.</span></div>${caption}</div>`;
    const css = [
      `#${domId} .pg-bs-title{font-weight:700;font-size:1.05rem;margin-bottom:.7rem;color:var(--ink,#e9eef8)}`,
      `#${domId} .pg-bs-shelf{display:flex;flex-direction:column;align-items:stretch}`,
      `#${domId} .pg-bs-row{display:flex;flex-wrap:wrap;align-items:flex-end;justify-content:center;gap:.45rem;padding:0 .3rem}`,
      `#${domId} .pg-bs-board{height:10px;border-radius:0 0 6px 6px;background:linear-gradient(180deg,#3a2e22,#241b12);box-shadow:0 6px 14px rgba(0,0,0,.45);margin-top:-2px}`,
      `#${domId} .pg-bs-spine{position:relative;width:46px;height:170px;border:1px solid rgba(0,0,0,.35);border-radius:4px 4px 2px 2px;padding:.5rem .2rem;cursor:pointer;font:inherit;background:linear-gradient(90deg,rgba(255,255,255,.18),rgba(255,255,255,0) 22%,rgba(0,0,0,.12) 86%,rgba(0,0,0,.28)),var(--spine);color:#0a0d14;display:flex;align-items:flex-start;justify-content:center;transition:transform .22s ease,box-shadow .22s ease,filter .22s ease}`,
      `#${domId} .pg-bs-spine-text{writing-mode:vertical-rl;transform:rotate(180deg);font-weight:700;font-size:.8rem;line-height:1.05;letter-spacing:.01em;text-shadow:0 1px 0 rgba(255,255,255,.25);overflow:hidden;max-height:150px}`,
      `#${domId} .pg-bs-spine:hover{filter:brightness(1.08)}`,
      `#${domId} .pg-bs-spine:focus-visible{outline:2px solid #fff;outline-offset:2px}`,
      `#${domId} .pg-bs-spine.is-on{transform:translateY(-14px);box-shadow:0 14px 22px rgba(0,0,0,.5);filter:brightness(1.12)}`,
      `#${domId}.pg-bs-reduce .pg-bs-spine{transition:none}`,
      `#${domId}.pg-bs-reduce .pg-bs-spine.is-on{transform:none;outline:2px solid #fff;outline-offset:2px}`,
      `#${domId} .pg-bs-detail{margin-top:1rem;padding:.9rem 1rem;border:1px solid var(--line,#23304a);border-radius:12px;background:rgba(140,160,200,.06);min-height:64px;color:var(--ink-dim,#cdd6e6)}`,
      `#${domId} .pg-bs-prompt{color:var(--ink-dim,#9fb0c8);font-style:italic}`,
      `#${domId} .pg-bs-dt{display:block;font-weight:700;font-size:1.02rem;color:var(--ink,#e9eef8)}`,
      `#${domId} .pg-bs-da{display:block;font-size:.9rem;margin:.1rem 0 .45rem;color:var(--ink-dim,#cdd6e6)}`,
      `#${domId} .pg-bs-dn{display:block;font-size:.95rem;line-height:1.5}`,
      `#${domId} .pg-bs-caption{margin-top:.7rem;font-size:.82rem;color:var(--ink-dim,#9fb0c8)}`
    ].join("\n");
    const jsBody = `
var BOOKS = (CONFIG.books || []);
if(reduced) root.classList.add('pg-bs-reduce');
var detail = $('[data-role=detail]');
if(!detail) return;
var spines = $$('[data-role=spine]');
if(!spines.length) return;
function clear(){
  spines.forEach(function(s){ s.classList.remove('is-on'); s.setAttribute('aria-pressed','false'); });
}
function prompt(){
  detail.innerHTML = '<span class="pg-bs-prompt">Pick a book.</span>';
}
function show(b){
  detail.textContent = '';
  function row(cls, txt){ var el = document.createElement('span'); el.className = cls; el.textContent = txt; detail.appendChild(el); }
  row('pg-bs-dt', b.title || 'Untitled');
  if(b.author) row('pg-bs-da', b.author);
  if(b.note) row('pg-bs-dn', b.note);
}
spines.forEach(function(s){
  s.addEventListener('click', function(){
    var on = s.classList.contains('is-on');
    clear();
    if(on){ prompt(); return; }
    s.classList.add('is-on'); s.setAttribute('aria-pressed','true');
    var i = parseInt(s.getAttribute('data-i'), 10) || 0;
    show(BOOKS[i] || {});
  });
});
`;
    return { html, css, jsBody };
  }
};

// server/playgrounds/map-route.js
var map_route_default = {
  id: "map-route",
  name: "Journey",
  category: "diagram",
  description: "A route through a set of stops you can play through end to end or tap one at a time.",
  paramsSchema: {
    type: "object",
    additionalProperties: false,
    required: ["stops"],
    properties: {
      title: { type: "string" },
      caption: { type: "string" },
      stops: {
        type: "array",
        minItems: 2,
        maxItems: 8,
        items: {
          type: "object",
          additionalProperties: false,
          required: ["name", "x", "y"],
          properties: {
            name: { type: "string" },
            x: { type: "number", minimum: 0, maximum: 100 },
            y: { type: "number", minimum: 0, maximum: 100 },
            note: { type: "string" }
          }
        }
      }
    }
  },
  presets: [
    { name: "A weekend in Rome", params: {
      title: "A weekend in Rome",
      caption: "Four stops, comfortable shoes, no regrets.",
      stops: [
        { name: "Colosseum", x: 20, y: 70, note: "Start with the crowds, get them over with." },
        { name: "Pantheon", x: 45, y: 45, note: "Look up. The hole is the point." },
        { name: "Trevi Fountain", x: 62, y: 35, note: "Throw a coin, fight for a photo." },
        { name: "Vatican", x: 85, y: 20, note: "Wear something with sleeves." }
      ]
    } },
    { name: "The coast road", params: {
      title: "The coast road",
      caption: "One tank of fuel, the sea on your left the whole way.",
      stops: [
        { name: "Start", x: 10, y: 80, note: "Top up the tank." },
        { name: "The cliffs", x: 40, y: 50, note: "Pull over. Breathe." },
        { name: "Fishing village", x: 70, y: 60, note: "Lunch. Obviously." },
        { name: "Lighthouse", x: 92, y: 25, note: "The end of the land." }
      ]
    } }
  ],
  build(params, domId) {
    const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
    const stops = (Array.isArray(params.stops) ? params.stops : []).slice(0, 8).map((s) => ({
      name: String(s && s.name != null ? s.name : ""),
      note: String(s && s.note != null ? s.note : ""),
      x: clamp(Number(s && s.x) || 0, 0, 100),
      y: clamp(Number(s && s.y) || 0, 0, 100)
    }));
    const title = params.title ? `<div class="pg-mr-title">${esc(params.title)}</div>` : "";
    const caption = params.caption ? `<div class="pg-mr-caption">${esc(params.caption)}</div>` : "";
    const dataJson = JSON.stringify(stops);
    const html = `<div class="pg-stage">
${title}
<svg class="pg-mr-svg" data-role="svg" viewBox="0 0 100 64" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Route map"></svg>
<div class="pg-readout" data-role="readout" aria-live="polite"></div>
<div class="pg-controls"><div class="pg-row">
<button type="button" class="pg-mr-play" data-role="play">Play journey</button>
</div></div>
${caption}
</div>`;
    const css = [
      `#${domId} .pg-mr-title{font-weight:600;margin:0 0 .5rem;color:var(--ink,#e9eef8)}`,
      `#${domId} .pg-mr-svg{display:block;width:100%;height:auto;background:rgba(140,160,200,.05);border:1px solid var(--line,#23304a);border-radius:12px}`,
      `#${domId} .pg-mr-edge{fill:none;stroke:#818cf8;stroke-width:.6;stroke-dasharray:2 1.6;stroke-linecap:round;opacity:.7}`,
      `#${domId} .pg-mr-stop{cursor:pointer}`,
      `#${domId} .pg-mr-ring{fill:rgba(34,211,238,.12);stroke:#22d3ee;stroke-width:.5;transition:fill .2s,stroke .2s}`,
      `#${domId} .pg-mr-stop.is-active .pg-mr-ring{fill:rgba(45,212,191,.3);stroke:#2dd4bf}`,
      `#${domId} .pg-mr-num{fill:var(--ink,#e9eef8);font-size:2.4px;font-weight:700;text-anchor:middle;dominant-baseline:central;pointer-events:none}`,
      `#${domId} .pg-mr-lbl{fill:var(--ink-dim,#cdd6e6);font-size:2.6px;text-anchor:middle;pointer-events:none}`,
      `#${domId} .pg-mr-traveller{fill:#fbbf24;stroke:#04060c;stroke-width:.4;filter:drop-shadow(0 0 1.5px #fbbf24)}`,
      `#${domId} .pg-readout{margin:.6rem 0;min-height:2.4em;color:var(--ink-dim,#cdd6e6);font-size:.95rem}`,
      `#${domId} .pg-readout b{color:var(--ink,#e9eef8)}`,
      `#${domId} .pg-mr-play{font:inherit;cursor:pointer;padding:.45rem .9rem;border-radius:9px;border:1px solid #22d3ee66;background:rgba(34,211,238,.08);color:var(--ink,#e9eef8)}`,
      `#${domId} .pg-mr-play:hover{background:rgba(34,211,238,.16)}`,
      `#${domId} .pg-mr-play[disabled]{opacity:.5;cursor:default}`,
      `#${domId} .pg-mr-caption{margin-top:.6rem;color:var(--ink-dim,#cdd6e6);font-size:.85rem;opacity:.85}`
    ].join("\n");
    const jsBody = `
var STOPS = ${dataJson};
var svg = $('[data-role=svg]');
var play = $('[data-role=play]');
var readout = $('[data-role=readout]');
if(!svg || !readout || STOPS.length < 2) return;
var NS = 'http://www.w3.org/2000/svg';
// map params x:0-100 -> 0-100, y:0-100 -> 0-64 (y * 0.64) so it fits the viewBox.
function px(s){ return s.x; }
function py(s){ return s.y * 0.64; }

function el(name, attrs){
  var n = document.createElementNS(NS, name);
  for(var k in attrs){ if(Object.prototype.hasOwnProperty.call(attrs,k)) n.setAttribute(k, attrs[k]); }
  return n;
}

// dashed polyline through the stops in order
var pts = STOPS.map(function(s){ return px(s) + ',' + py(s); }).join(' ');
svg.appendChild(el('polyline', { points: pts, 'class': 'pg-mr-edge' }));

// stop markers + numbers + name labels
var groups = [];
STOPS.forEach(function(s, i){
  var g = el('g', { 'class': 'pg-mr-stop' });
  g.setAttribute('tabindex', '0');
  g.setAttribute('role', 'button');
  g.appendChild(el('circle', { cx: px(s), cy: py(s), r: 2.4, 'class': 'pg-mr-ring' }));
  var num = el('text', { x: px(s), y: py(s), 'class': 'pg-mr-num' });
  num.textContent = String(i + 1);
  g.appendChild(num);
  // place the name above the stop, or below if too near the top edge
  var below = py(s) < 8;
  var lbl = el('text', { x: px(s), y: py(s) + (below ? 6.4 : -3.6), 'class': 'pg-mr-lbl' });
  lbl.textContent = s.name;
  g.appendChild(lbl);
  svg.appendChild(g);
  groups.push(g);
  function select(){ arrive(i); }
  g.addEventListener('click', select);
  g.addEventListener('keydown', function(e){ if(e.key === 'Enter' || e.key === ' '){ e.preventDefault(); select(); } });
});

// traveller dot, parked at the first stop
var dot = el('circle', { cx: px(STOPS[0]), cy: py(STOPS[0]), r: 1.7, 'class': 'pg-mr-traveller' });
svg.appendChild(dot);

function moveDot(x, y){ dot.setAttribute('cx', x); dot.setAttribute('cy', y); }

function arrive(i){
  groups.forEach(function(g, j){ g.classList.toggle('is-active', j === i); });
  moveDot(px(STOPS[i]), py(STOPS[i]));
  var s = STOPS[i];
  var note = s.note ? ' \u2014 ' + s.note : '';
  readout.innerHTML = 'Stop ' + (i + 1) + ': <b>' + (s.name ? escHtml(s.name) : 'Unnamed') + '</b>' + escHtml(note);
}

function escHtml(t){ var d = document.createElement('div'); d.textContent = t == null ? '' : String(t); return d.innerHTML; }

var raf = null;
var timer = null;
var playing = false;

function cancelRun(){
  if(raf){ cancelAnimationFrame(raf); raf = null; }
  if(timer){ clearTimeout(timer); timer = null; }
}

function startPlay(){
  if(playing) return;             // ignore Play while a journey is running
  cancelRun();
  playing = true;
  if(play){ play.setAttribute('disabled', 'disabled'); }

  if(reduced){
    // reduced motion: step through stops on a short timer, no interpolation
    var i = 0;
    arrive(0);
    var tick = function(){
      i++;
      if(i >= STOPS.length){ finish(); return; }
      arrive(i);
      timer = setTimeout(tick, 500);
    };
    timer = setTimeout(tick, 500);
    return;
  }

  var seg = 0;                    // current segment index (from stop seg -> seg+1)
  var SEG_MS = 700;
  arrive(0);

  function runSeg(){
    var a = STOPS[seg], b = STOPS[seg + 1];
    var ax = px(a), ay = py(a), bx = px(b), by = py(b);
    var t0 = null;
    function frame(ts){
      if(t0 == null) t0 = ts;
      var p = Math.min(1, (ts - t0) / SEG_MS);
      moveDot(ax + (bx - ax) * p, ay + (by - ay) * p);
      if(p < 1){ raf = requestAnimationFrame(frame); return; }
      seg++;
      arrive(seg);                // landed on the next stop
      if(seg >= STOPS.length - 1){ finish(); return; }
      raf = requestAnimationFrame(runSeg);
    }
    raf = requestAnimationFrame(frame);
  }
  raf = requestAnimationFrame(runSeg);
}

function finish(){ cancelRun(); playing = false; if(play){ play.removeAttribute('disabled'); } }

if(play){ play.addEventListener('click', startPlay); }

// initial readout: first stop selected, tapping works straight away
arrive(0);
`;
    return { html, css, jsBody };
  }
};

// server/playgrounds/recipe-scaler.js
var recipe_scaler_default = {
  id: "recipe-scaler",
  name: "Recipe scaler",
  category: "tool",
  description: "Scale a recipe\u2019s ingredients up or down by dragging the servings slider.",
  paramsSchema: {
    type: "object",
    additionalProperties: false,
    required: ["ingredients"],
    properties: {
      title: { type: "string" },
      baseServings: { type: "number", default: 4, minimum: 1 },
      caption: { type: "string" },
      ingredients: { type: "array", minItems: 1, maxItems: 14, items: {
        type: "object",
        additionalProperties: false,
        required: ["name", "qty", "unit"],
        properties: {
          name: { type: "string" },
          qty: { type: "number" },
          unit: { type: "string" }
        }
      } }
    }
  },
  presets: [
    { name: "American pancakes", params: {
      title: "American pancakes",
      baseServings: 4,
      ingredients: [
        { name: "Plain flour", qty: 200, unit: "g" },
        { name: "Milk", qty: 300, unit: "ml" },
        { name: "Eggs", qty: 2, unit: "" },
        { name: "Baking powder", qty: 2, unit: "tsp" },
        { name: "Butter", qty: 30, unit: "g" }
      ]
    } },
    { name: "Negroni", params: {
      title: "Negroni",
      baseServings: 1,
      ingredients: [
        { name: "Gin", qty: 30, unit: "ml" },
        { name: "Campari", qty: 30, unit: "ml" },
        { name: "Sweet vermouth", qty: 30, unit: "ml" },
        { name: "Orange", qty: 1, unit: "slice" }
      ]
    } }
  ],
  build(params, domId) {
    const baseServings = Math.max(1, Math.round(Number(params.baseServings) || 4));
    const ingredients = (Array.isArray(params.ingredients) ? params.ingredients.slice(0, 14) : []).map((g) => ({ name: String(g && g.name != null ? g.name : ""), qty: Number(g && g.qty), unit: String(g && g.unit != null ? g.unit : "") })).filter((g) => isFinite(g.qty));
    const title = params.title ? `<div class="pg-rs-title">${esc(params.title)}</div>` : "";
    const caption = params.caption ? `<div class="pg-rs-caption">${esc(params.caption)}</div>` : "";
    const maxServings = 24;
    const start = Math.min(maxServings, Math.max(1, baseServings));
    const rows = ingredients.map((g) => `<li class="pg-rs-row" data-role="ingredient" data-qty="${g.qty}" data-unit="${esc(g.unit)}"><span class="pg-rs-name">${esc(g.name)}</span><span class="pg-rs-amt"><b class="pg-rs-num" data-role="num">${g.qty}</b>` + (g.unit ? `<span class="pg-rs-unit">${esc(g.unit)}</span>` : "") + `</span></li>`).join("");
    const html = `<div class="pg-stage">` + title + `<div class="pg-controls"><label class="pg-field"><b>Servings</b><input type="range" data-role="servings" min="1" max="${maxServings}" step="1" value="${start}"></label><div class="pg-readout">for <b data-role="count">${start}</b> serving<span data-role="plural">${start === 1 ? "" : "s"}</span></div></div><ul class="pg-rs-list" data-base="${baseServings}">${rows}</ul>` + caption + `</div>`;
    const css = [
      `#${domId} .pg-rs-title{font-weight:700;font-size:1.05rem;margin:0 0 .6rem;color:var(--ink,#e9eef8)}`,
      `#${domId} .pg-controls{display:flex;flex-direction:column;gap:.5rem;margin-bottom:.9rem}`,
      `#${domId} .pg-field{display:flex;flex-direction:column;gap:.35rem;font-size:.85rem;color:var(--ink-dim,#cdd6e6)}`,
      `#${domId} .pg-field b{font-weight:600;letter-spacing:.02em}`,
      `#${domId} input[type=range]{width:100%;accent-color:#2dd4bf;cursor:pointer}`,
      `#${domId} .pg-readout{font-size:.95rem;color:var(--ink-dim,#cdd6e6)}`,
      `#${domId} .pg-readout b{color:#22d3ee;font-size:1.15rem}`,
      `#${domId} .pg-rs-list{list-style:none;margin:0;padding:0;border-top:1px solid var(--line,#23304a)}`,
      `#${domId} .pg-rs-row{display:flex;align-items:baseline;justify-content:space-between;gap:1rem;padding:.5rem .1rem;border-bottom:1px solid var(--line,#23304a)}`,
      `#${domId} .pg-rs-name{color:var(--ink,#e9eef8)}`,
      `#${domId} .pg-rs-amt{display:flex;align-items:baseline;gap:.3rem;white-space:nowrap;font-variant-numeric:tabular-nums}`,
      `#${domId} .pg-rs-num{color:#fbbf24;font-weight:700}`,
      `#${domId} .pg-rs-unit{color:var(--ink-dim,#cdd6e6);font-size:.85rem}`,
      `#${domId} .pg-rs-caption{margin-top:.7rem;font-size:.8rem;color:var(--ink-dim,#9fb0c8)}`
    ].join("\n");
    const jsBody = `
var slider=$('[data-role=servings]');
var list=$('.pg-rs-list');
if(!slider||!list)return;
var base=parseFloat(list.getAttribute('data-base'))||1;
var countEl=$('[data-role=count]'), pluralEl=$('[data-role=plural]');
var rows=$$('[data-role=ingredient]');
function fmt(n){
  if(!isFinite(n))return '0';
  var r=Math.round(n*10)/10;
  if(Math.abs(r-Math.round(r))<1e-9)return String(Math.round(r));
  return r.toFixed(1);
}
function recompute(){
  var servings=parseInt(slider.value,10)||1;
  if(countEl)countEl.textContent=String(servings);
  if(pluralEl)pluralEl.textContent=servings===1?'':'s';
  rows.forEach(function(row){
    var qty=parseFloat(row.getAttribute('data-qty'))||0;
    var num=row.querySelector('[data-role=num]');
    if(num)num.textContent=fmt(qty*servings/base);
  });
}
slider.addEventListener('input',recompute);
recompute();
`;
    return { html, css, jsBody };
  }
};

// server/playgrounds/spectrum-scale.js
var spectrum_scale_default = {
  id: "spectrum-scale",
  name: "Spectrum scale",
  category: "explorer",
  description: "Drag a value along a horizontal colour-banded scale (the linear cousin of a gauge) \u2014 pH, spiciness, temperature, magnitude and the like.",
  paramsSchema: {
    type: "object",
    additionalProperties: false,
    required: ["min", "max", "value", "bands"],
    properties: {
      title: { type: "string" },
      min: { type: "number", default: 0 },
      max: { type: "number", default: 14 },
      value: { type: "number", default: 7 },
      unit: { type: "string", default: "" },
      bands: {
        type: "array",
        minItems: 2,
        maxItems: 7,
        items: {
          type: "object",
          additionalProperties: false,
          required: ["from", "to", "colour", "label"],
          properties: {
            from: { type: "number" },
            to: { type: "number" },
            colour: { type: "string" },
            label: { type: "string" }
          }
        }
      },
      caption: { type: "string" }
    }
  },
  presets: [
    { name: "The pH scale", params: {
      title: "The pH scale",
      min: 0,
      max: 14,
      value: 7,
      unit: "",
      bands: [
        { from: 0, to: 6, colour: "#f472b6", label: "acidic" },
        { from: 6, to: 8, colour: "#34d399", label: "neutral" },
        { from: 8, to: 14, colour: "#818cf8", label: "alkaline" }
      ],
      caption: "7 is neutral; lower is more acidic, higher more alkaline."
    } },
    { name: "How spicy? (Scoville, roughly)", params: {
      title: "How spicy? (Scoville, roughly)",
      min: 0,
      max: 100,
      value: 30,
      unit: "k SHU",
      bands: [
        { from: 0, to: 10, colour: "#2dd4bf", label: "mild" },
        { from: 10, to: 40, colour: "#fbbf24", label: "warm" },
        { from: 40, to: 70, colour: "#fb7185", label: "hot" },
        { from: 70, to: 100, colour: "#f472b6", label: "ouch" }
      ],
      caption: "Thousands of Scoville heat units \u2014 drag to taste."
    } }
  ],
  build(params, domId) {
    const min = Number.isFinite(params.min) ? params.min : 0;
    let max = Number.isFinite(params.max) ? params.max : 14;
    if (max <= min) max = min + 1;
    const span = max - min;
    const colourOk = (c) => /^#[0-9a-fA-F]{3,8}$/.test(String(c || ""));
    let bands = Array.isArray(params.bands) ? params.bands.slice(0, 7) : [];
    bands = bands.filter((b) => b && Number.isFinite(b.from) && Number.isFinite(b.to)).map((b) => ({
      from: Math.max(min, Math.min(max, Math.min(b.from, b.to))),
      to: Math.max(min, Math.min(max, Math.max(b.from, b.to))),
      colour: colourOk(b.colour) ? b.colour : "#2dd4bf",
      label: String(b.label == null ? "" : b.label)
    }));
    if (bands.length < 2) {
      bands = [
        { from: min, to: min + span / 2, colour: "#2dd4bf", label: "low" },
        { from: min + span / 2, to: max, colour: "#818cf8", label: "high" }
      ];
    }
    let value = Number.isFinite(params.value) ? params.value : min + span / 2;
    value = Math.max(min, Math.min(max, value));
    const unit = String(params.unit == null ? "" : params.unit);
    const title = params.title ? `<div class="pg-ss-title">${esc(params.title)}</div>` : "";
    const caption = params.caption ? `<p class="pg-ss-caption">${esc(params.caption)}</p>` : "";
    let step = span / 200;
    const mag = Math.pow(10, Math.floor(Math.log10(step)));
    step = mag;
    const segHtml = bands.map((b) => {
      const share = Math.max(0, (b.to - b.from) / span) * 100;
      return `<span class="pg-ss-seg" data-role="seg" style="flex:0 0 ${share}%;background:${b.colour}"><span class="pg-ss-seglabel">${esc(b.label)}</span></span>`;
    }).join("");
    const html = `<div class="pg-stage">` + title + `<div class="pg-ss-wrap"><div class="pg-ss-marker" data-role="marker"><span class="pg-ss-tri"></span></div><div class="pg-ss-bar" data-role="bar">${segHtml}</div></div><div class="pg-ss-controls pg-controls"><div class="pg-row pg-ss-scaleends"><span data-role="endmin"></span><span data-role="endmax"></span></div><input type="range" data-role="slider" aria-label="value"></div><div class="pg-readout pg-ss-readout"><span class="pg-ss-num" data-role="readval"></span><span class="pg-ss-band" data-role="readband"></span></div>` + caption + `</div>`;
    const css = [
      `#${domId} .pg-ss-title{font-weight:700;margin-bottom:.6rem;color:var(--ink,#e9eef8)}`,
      `#${domId} .pg-ss-wrap{position:relative;padding-top:18px}`,
      `#${domId} .pg-ss-bar{display:flex;width:100%;height:26px;border-radius:8px;overflow:hidden;border:1px solid var(--line,#23304a)}`,
      `#${domId} .pg-ss-seg{position:relative;display:flex;align-items:center;justify-content:center;min-width:0}`,
      `#${domId} .pg-ss-seglabel{font-size:.62rem;font-weight:700;letter-spacing:.03em;text-transform:uppercase;color:rgba(4,6,12,.78);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;padding:0 .2rem}`,
      `#${domId} .pg-ss-marker{position:absolute;top:0;left:0;transform:translateX(-50%);transition:left .18s ease;will-change:left}`,
      `#${domId} .pg-ss-tri{display:block;width:0;height:0;border-left:7px solid transparent;border-right:7px solid transparent;border-top:9px solid var(--ink,#e9eef8);filter:drop-shadow(0 1px 2px rgba(0,0,0,.6))}`,
      `#${domId} .pg-ss-controls{margin-top:.7rem}`,
      `#${domId} .pg-ss-scaleends{display:flex;justify-content:space-between;font-size:.72rem;color:var(--ink-dim,#9fb0c8);margin-bottom:.2rem}`,
      `#${domId} input[type=range][data-role=slider]{width:100%;accent-color:#22d3ee}`,
      `#${domId} .pg-ss-readout{margin-top:.7rem;display:flex;align-items:baseline;gap:.6rem;flex-wrap:wrap}`,
      `#${domId} .pg-ss-num{font-size:1.4rem;font-weight:800;color:var(--ink,#e9eef8);font-variant-numeric:tabular-nums}`,
      `#${domId} .pg-ss-band{font-size:.85rem;font-weight:700;padding:.15rem .55rem;border-radius:999px;border:1px solid currentColor}`,
      `#${domId} .pg-ss-caption{margin:.6rem 0 0;font-size:.82rem;color:var(--ink-dim,#9fb0c8)}`,
      `#${domId}.pg-ss-reduce .pg-ss-marker{transition:none}`
    ].join("\n");
    const jsBody = `
var MIN=${min}, MAX=${max}, SPAN=${span};
var UNIT=${JSON.stringify(unit)};
var BANDS=${JSON.stringify(bands)};
if(reduced)root.classList.add('pg-ss-reduce');
var slider=$('[data-role=slider]'); if(!slider)return;
var marker=$('[data-role=marker]');
var readVal=$('[data-role=readval]');
var readBand=$('[data-role=readband]');
var endMin=$('[data-role=endmin]'), endMax=$('[data-role=endmax]');
var STEP=${step};
slider.min=String(MIN); slider.max=String(MAX); slider.step=String(STEP); slider.value=String(${value});
// Decimal places to show, derived from the step size.
var DP=Math.max(0, -Math.floor(Math.log10(STEP)));
function fmt(n){ var r=Math.round(n*Math.pow(10,DP))/Math.pow(10,DP); return r.toFixed(DP); }
if(endMin)endMin.textContent=fmt(MIN)+(UNIT?(' '+UNIT):'');
if(endMax)endMax.textContent=fmt(MAX)+(UNIT?(' '+UNIT):'');
function activeBand(v){
  for(var i=0;i<BANDS.length;i++){ if(v>=BANDS[i].from && v<=BANDS[i].to) return BANDS[i]; }
  return BANDS[BANDS.length-1];
}
function update(){
  var v=parseFloat(slider.value); if(!isFinite(v))v=MIN;
  var pct=SPAN>0?((v-MIN)/SPAN)*100:0;
  pct=Math.max(0,Math.min(100,pct));
  if(marker)marker.style.left=pct+'%';
  var b=activeBand(v);
  if(readVal)readVal.textContent=fmt(v)+(UNIT?(' '+UNIT):'');
  if(readBand){ readBand.textContent=b.label; readBand.style.color=b.colour; }
}
slider.addEventListener('input',update);
update();
`;
    return { html, css, jsBody };
  }
};

// server/playgrounds/guess-slider.js
var guess_slider_default = {
  id: "guess-slider",
  name: "Guess the number",
  category: "game",
  description: "Slide to guess a value, lock it in, then reveal the true answer and how close you were.",
  paramsSchema: {
    type: "object",
    additionalProperties: false,
    required: ["question", "answer", "min", "max"],
    properties: {
      title: { type: "string", title: "Optional title above the question" },
      question: { type: "string", title: "The question to guess" },
      answer: { type: "number", title: "The true answer" },
      min: { type: "number", title: "Slider minimum" },
      max: { type: "number", title: "Slider maximum" },
      unit: { type: "string", title: 'Unit suffix (e.g. " km", "%")', default: "" },
      reveal: { type: "string", title: "Explanation shown after guessing" },
      caption: { type: "string", title: "Optional caption under the widget" }
    }
  },
  presets: [
    {
      name: "When was the first public film screening?",
      params: {
        question: "In what year did the Lumi\xE8re brothers hold the first paid public film screening?",
        answer: 1895,
        min: 1860,
        max: 1940,
        unit: "",
        reveal: "28 December 1895, in a Paris caf\xE9. People reportedly ducked at the oncoming train."
      }
    },
    {
      name: "How far is the Moon?",
      params: {
        question: "Average distance from Earth to the Moon?",
        answer: 384400,
        min: 5e4,
        max: 1e6,
        unit: " km",
        reveal: "About 384,400 km \u2014 close enough to feel near, far enough that light still takes 1.3 seconds."
      }
    }
  ],
  build(params, domId) {
    const num2 = (v, d) => Number.isFinite(Number(v)) ? Number(v) : d;
    let min = num2(params.min, 0);
    let max = num2(params.max, 100);
    if (max <= min) max = min + 1;
    const answer = Math.max(min, Math.min(max, num2(params.answer, (min + max) / 2)));
    const unit = String(params.unit == null ? "" : params.unit);
    const question = String(params.question || "Take a guess.");
    const reveal = String(params.reveal || "");
    const span = max - min;
    let step = 1;
    if (span > 2e3) step = Math.max(1, Math.round(span / 1e3));
    else if (span <= 5) step = span / 1e3 < 0.01 ? 0.01 : 0.1;
    const start = Math.round((min + max) / 2 / step) * step;
    const title = params.title ? `<div class="pg-gs-title">${esc(params.title)}</div>` : "";
    const caption = params.caption ? `<div class="pg-gs-caption">${esc(params.caption)}</div>` : "";
    const html = `<div class="pg-stage">${title}<div class="pg-gs-q">${esc(question)}</div><div class="pg-gs-readout" aria-live="polite"><span class="pg-gs-guesslabel">Your guess</span><span class="pg-readout pg-gs-guess" data-role="guess"></span></div><div class="pg-row"><label style="flex:1">Slide to guess<input type="range" data-role="slider" min="${min}" max="${max}" value="${start}" step="${step}" aria-label="Guess slider"></label></div><div class="pg-controls"><button type="button" class="pg-gs-btn" data-role="lock">Lock in my guess</button><button type="button" class="pg-gs-btn pg-gs-again" data-role="again" hidden>Guess again</button></div><div class="pg-gs-result" data-role="result" hidden></div>${caption}</div>`;
    const css = [
      `#${domId} .pg-gs-title{font-size:.9rem;color:var(--ink-dim,#9fb3c8);margin:0 0 .5rem}`,
      `#${domId} .pg-gs-q{font-size:1.05rem;font-weight:700;color:var(--ink,#e9eef8);margin:0 0 .9rem;line-height:1.35}`,
      `#${domId} .pg-gs-readout{text-align:center;margin:.2rem 0 .7rem;display:flex;flex-direction:column;gap:.15rem}`,
      `#${domId} .pg-gs-guesslabel{font-size:.78rem;letter-spacing:.04em;text-transform:uppercase;color:var(--ink-dim,#9fb3c8)}`,
      `#${domId} .pg-gs-guess{font-size:2rem;font-weight:800;color:#22d3ee;line-height:1.1}`,
      `#${domId} .pg-controls{display:flex;flex-wrap:wrap;gap:.5rem;margin-top:.3rem}`,
      `#${domId} .pg-gs-btn{font:inherit;font-weight:600;cursor:pointer;border-radius:10px;padding:.55rem 1rem;border:1px solid #2dd4bf66;background:rgba(45,212,191,.12);color:#2dd4bf;transition:background .15s,border-color .15s}`,
      `#${domId} .pg-gs-btn:hover{background:rgba(45,212,191,.2)}`,
      `#${domId} .pg-gs-again{border-color:#818cf866;background:rgba(129,140,248,.12);color:#818cf8}`,
      `#${domId} .pg-gs-again:hover{background:rgba(129,140,248,.2)}`,
      `#${domId} input[type=range]:disabled{opacity:.55;cursor:not-allowed}`,
      `#${domId} .pg-gs-result{margin-top:.9rem;padding:.85rem 1rem;border-radius:12px;border:1px solid var(--line,#23304a);background:rgba(140,160,200,.06);line-height:1.5}`,
      `#${domId} .pg-gs-verdict{font-size:1.15rem;font-weight:800;margin:0 0 .5rem}`,
      `#${domId} .pg-gs-verdict.is-spot{color:#2dd4bf}`,
      `#${domId} .pg-gs-verdict.is-close{color:#fbbf24}`,
      `#${domId} .pg-gs-verdict.is-far{color:#f472b6}`,
      `#${domId} .pg-gs-stats{display:flex;flex-wrap:wrap;gap:.4rem 1.2rem;font-size:.92rem;color:var(--ink-dim,#cdd6e6);margin:0 0 .5rem}`,
      `#${domId} .pg-gs-stats b{color:var(--ink,#e9eef8);font-weight:700}`,
      `#${domId} .pg-gs-reveal{font-size:.95rem;color:var(--ink-dim,#cdd6e6)}`,
      `#${domId} .pg-gs-caption{margin-top:.7rem;font-size:.82rem;color:var(--ink-dim,#9fb3c8)}`
    ].join("\n");
    const jsBody = `
var slider=$('[data-role=slider]'),guess=$('[data-role=guess]');
var lockBtn=$('[data-role=lock]'),againBtn=$('[data-role=again]'),result=$('[data-role=result]');
if(!slider||!guess||!lockBtn||!againBtn||!result)return;
var ANSWER=${JSON.stringify(answer)},RANGE=${JSON.stringify(max - min)},UNIT=${JSON.stringify(unit)};
var STEP=${JSON.stringify(step)},REVEAL=${JSON.stringify(reveal)};
var DECIMALS=STEP<1?(String(STEP).split('.')[1]||'').length:0;
function fmt(v){
  var n=DECIMALS>0?Number(v).toFixed(DECIMALS):Math.round(Number(v));
  // thousands separators for the integer part
  var parts=String(n).split('.');
  parts[0]=parts[0].replace(/\\B(?=(\\d{3})+(?!\\d))/g,',');
  return parts.join('.');
}
function show(v){guess.textContent=fmt(v)+UNIT;}
slider.addEventListener('input',function(){show(parseFloat(slider.value));});
show(parseFloat(slider.value));
lockBtn.addEventListener('click',function(){
  var g=parseFloat(slider.value);
  var diff=Math.abs(g-ANSWER);
  var pct=RANGE>0?diff/RANGE:0;
  var verdict,cls;
  if(pct<=0.05){verdict='Spot on!';cls='is-spot';}
  else if(pct<=0.2){verdict='Close!';cls='is-close';}
  else{verdict='Way off';cls='is-far';}
  result.innerHTML='';
  var vEl=document.createElement('div');
  vEl.className='pg-gs-verdict '+cls;
  vEl.textContent=verdict;
  result.appendChild(vEl);
  var stats=document.createElement('div');
  stats.className='pg-gs-stats';
  stats.innerHTML='<span>Answer: <b>'+fmt(ANSWER)+UNIT+'</b></span>'+
    '<span>You guessed: <b>'+fmt(g)+UNIT+'</b></span>'+
    '<span>Off by: <b>'+fmt(diff)+UNIT+'</b></span>';
  result.appendChild(stats);
  if(REVEAL){
    var rev=document.createElement('div');
    rev.className='pg-gs-reveal';
    rev.textContent=REVEAL;
    result.appendChild(rev);
  }
  result.hidden=false;
  slider.disabled=true;
  lockBtn.hidden=true;
  againBtn.hidden=false;
});
againBtn.addEventListener('click',function(){
  slider.disabled=false;
  result.hidden=true;
  result.innerHTML='';
  againBtn.hidden=true;
  lockBtn.hidden=false;
  show(parseFloat(slider.value));
});
`;
    return { html, css, jsBody };
  }
};

// server/playgrounds/bracket.js
var bracket_default = {
  id: "bracket",
  name: "Knockout bracket",
  category: "game",
  description: "A single-elimination bracket you click through, picking a winner in each matchup until one is crowned champion.",
  paramsSchema: {
    type: "object",
    additionalProperties: false,
    required: ["competitors"],
    properties: {
      title: { type: "string" },
      competitors: { type: "array", minItems: 2, maxItems: 8, items: { type: "string" } },
      caption: { type: "string" }
    }
  },
  presets: [
    { name: "Best pizza topping", params: {
      title: "Best pizza topping",
      competitors: ["Margherita", "Pepperoni", "Mushroom", "Ham & pineapple", "Four cheese", "Spicy nduja", "Veggie", "Anchovy"],
      caption: "Pick a winner in each matchup. No wrong answers \u2014 except one."
    } },
    { name: "Greatest sci-fi film", params: {
      title: "Greatest sci-fi film",
      competitors: ["Blade Runner", "2001", "Alien", "The Matrix", "Arrival", "Star Wars", "Interstellar", "Dune"],
      caption: "Eight contenders, one champion. Choose your favourites through to the final."
    } }
  ],
  build(params, domId) {
    let names = Array.isArray(params.competitors) ? params.competitors.map((s) => String(s == null ? "" : s)) : [];
    const target = names.length <= 6 ? 4 : 8;
    if (names.length > target) names = names.slice(0, target);
    while (names.length < target) names.push("TBD " + (names.length + 1));
    const title = params.title ? `<div class="pg-bk-title">${esc(params.title)}</div>` : "";
    const caption = params.caption ? `<div class="pg-bk-caption">${esc(params.caption)}</div>` : "";
    const data = JSON.stringify(names);
    const html = `<div class="pg-stage">${title}<div class="pg-bk-board" data-role="board" data-names='${esc(data)}'></div><div class="pg-bk-champ" data-role="champ" hidden></div><div class="pg-controls"><button type="button" class="pg-bk-reset" data-role="reset">Reset</button></div>${caption}</div>`;
    const css = [
      `#${domId} .pg-bk-title{font-weight:700;font-size:1.1rem;margin-bottom:.3rem;color:#e9eef8}`,
      `#${domId} .pg-bk-caption{margin-top:.7rem;font-size:.85rem;color:#9fb0c8}`,
      `#${domId} .pg-bk-board{display:flex;gap:1.1rem;align-items:stretch;overflow-x:auto;padding:.3rem .1rem .6rem}`,
      `#${domId} .pg-bk-col{display:flex;flex-direction:column;justify-content:space-around;gap:.5rem;min-width:128px;flex:0 0 auto}`,
      `#${domId} .pg-bk-colhead{font-size:.7rem;letter-spacing:.06em;text-transform:uppercase;color:#7c8aa3;margin-bottom:.1rem;text-align:center}`,
      `#${domId} .pg-bk-match{display:flex;flex-direction:column;gap:.3rem;padding:.3rem;border-radius:10px;background:rgba(140,160,200,.05);border:1px solid #23304a}`,
      `#${domId} .pg-bk-slot{display:block;width:100%;text-align:left;font:inherit;cursor:pointer;border:1px solid #2b3a57;background:rgba(140,160,200,.04);color:#cdd6e6;border-radius:8px;padding:.4rem .55rem;font-size:.85rem;line-height:1.2;transition:background .15s,border-color .15s,color .15s}`,
      `#${domId} .pg-bk-slot:hover:not(:disabled){border-color:#22d3ee;color:#e9eef8}`,
      `#${domId} .pg-bk-slot:disabled{cursor:default}`,
      `#${domId} .pg-bk-slot.empty{color:#5a6783;font-style:italic;cursor:default}`,
      `#${domId} .pg-bk-slot.won{background:rgba(45,212,191,.14);border-color:#2dd4bf;color:#eafff9;font-weight:600}`,
      `#${domId} .pg-bk-slot.lost{opacity:.4;text-decoration:line-through}`,
      `#${domId} .pg-bk-champ{margin-top:.8rem;padding:.7rem 1rem;border-radius:12px;text-align:center;font-size:1.2rem;font-weight:700;color:#04060c;background:linear-gradient(90deg,#2dd4bf,#22d3ee,#818cf8)}`,
      `#${domId} .pg-bk-reset{font:inherit;cursor:pointer;border:1px solid #2b3a57;background:rgba(140,160,200,.06);color:#cdd6e6;border-radius:8px;padding:.4rem .8rem;font-size:.85rem}`,
      `#${domId} .pg-bk-reset:hover{border-color:#818cf8;color:#e9eef8}`,
      `#${domId} .pg-controls{margin-top:.6rem}`
    ].join("\n");
    const jsBody = `
var board=$('[data-role=board]');
var champEl=$('[data-role=champ]');
var resetBtn=$('[data-role=reset]');
if(!board||!champEl||!resetBtn)return;
var names;
try{names=JSON.parse(board.getAttribute('data-names'))||[];}catch(e){names=[];}
var n=names.length;
if(n!==4&&n!==8)return;
var roundCount=Math.log2(n)+1; // round 0 = competitors

// rounds[r] is an array of slots; rounds[0]=names, deeper rounds half the length, null=unfilled.
var rounds;
function fresh(){
  rounds=[names.slice()];
  var size=n;
  while(size>1){
    size=size/2;
    var arr=[];
    for(var i=0;i<size;i++)arr.push(null);
    rounds.push(arr);
  }
}

var ROUND_NAMES={2:'Final',4:'Semis',8:'Quarters',16:'Round 1'};

function pick(r,slotIndex){
  var winner=rounds[r][slotIndex];
  if(winner==null)return;
  var nextSlot=Math.floor(slotIndex/2);
  if(rounds[r+1][nextSlot]===winner)return; // no change
  rounds[r+1][nextSlot]=winner;
  // clear any downstream picks that descended from this slot.
  var idx=nextSlot;
  for(var rr=r+1;rr<rounds.length-1;rr++){
    var nx=Math.floor(idx/2);
    rounds[rr+1][nx]=null;
    idx=nx;
  }
  render();
}

function render(){
  board.textContent='';
  for(var r=0;r<rounds.length;r++){
    var col=document.createElement('div');
    col.className='pg-bk-col';
    var slotsInRound=rounds[r].length;
    var head=document.createElement('div');
    head.className='pg-bk-colhead';
    head.textContent=r===rounds.length-1?'Champion':(ROUND_NAMES[slotsInRound]||('Round '+(r+1)));
    col.appendChild(head);
    if(r===rounds.length-1){
      // champion column: single slot, display only.
      var champWrap=document.createElement('div');
      champWrap.className='pg-bk-match';
      var cb=makeSlot(r,0,rounds[r][0]);
      champWrap.appendChild(cb);
      col.appendChild(champWrap);
      board.appendChild(col);
      continue;
    }
    for(var m=0;m<slotsInRound/2;m++){
      var match=document.createElement('div');
      match.className='pg-bk-match';
      var aI=m*2,bI=m*2+1;
      match.appendChild(makeSlot(r,aI,rounds[r][aI]));
      match.appendChild(makeSlot(r,bI,rounds[r][bI]));
      col.appendChild(match);
    }
    board.appendChild(col);
  }
  // champion banner: last round's single slot filled.
  var champ=rounds[rounds.length-1][0];
  if(champ!=null){
    champEl.textContent='\u{1F3C6} '+champ;
    champEl.hidden=false;
  }else{
    champEl.hidden=true;
    champEl.textContent='';
  }
}

function makeSlot(r,slotIndex,value){
  var btn=document.createElement('button');
  btn.type='button';
  btn.className='pg-bk-slot';
  var isChampCol=(r===rounds.length-1);
  if(value==null){
    btn.classList.add('empty');
    btn.textContent='\u2014';
    btn.disabled=true;
    return btn;
  }
  btn.textContent=value;
  // a slot is "won" if it advanced into the next round.
  if(!isChampCol){
    var nextSlot=Math.floor(slotIndex/2);
    if(rounds[r+1][nextSlot]===value){
      btn.classList.add('won');
    }else{
      // a sibling already advanced -> this one lost.
      var sibling=slotIndex%2===0?slotIndex+1:slotIndex-1;
      if(rounds[r+1][nextSlot]!=null&&rounds[r+1][nextSlot]===rounds[r][sibling]){
        btn.classList.add('lost');
      }
    }
    btn.addEventListener('click',function(){pick(r,slotIndex);});
  }else{
    btn.classList.add('won');
    btn.disabled=true;
  }
  return btn;
}

resetBtn.addEventListener('click',function(){fresh();render();});

fresh();
render();
`;
    return { html, css, jsBody };
  }
};

// server/playgrounds/chord-diagram.js
var chord_diagram_default = {
  id: "chord-diagram",
  name: "Chord shapes",
  category: "music",
  description: "Tap a chord to see where your fingers go on a guitar fretboard.",
  paramsSchema: {
    type: "object",
    additionalProperties: false,
    required: ["chords"],
    properties: {
      title: { type: "string" },
      caption: { type: "string" },
      chords: { type: "array", minItems: 2, maxItems: 10, items: {
        type: "object",
        additionalProperties: false,
        required: ["name", "frets"],
        properties: {
          name: { type: "string" },
          frets: { type: "array", minItems: 6, maxItems: 6, items: { type: "number" } }
        }
      } }
    }
  },
  presets: [
    { name: "First chords to learn", params: { title: "First chords to learn", chords: [
      { name: "C", frets: [-1, 3, 2, 0, 1, 0] },
      { name: "G", frets: [3, 2, 0, 0, 0, 3] },
      { name: "D", frets: [-1, -1, 0, 2, 3, 2] },
      { name: "Em", frets: [0, 2, 2, 0, 0, 0] },
      { name: "Am", frets: [-1, 0, 2, 2, 1, 0] }
    ], caption: "Six strings, low E on the left." } },
    { name: "Three-chord songs", params: { title: "Three chords, a thousand songs", chords: [
      { name: "G", frets: [3, 2, 0, 0, 0, 3] },
      { name: "C", frets: [-1, 3, 2, 0, 1, 0] },
      { name: "D", frets: [-1, -1, 0, 2, 3, 2] }
    ], caption: "G, C and D will get you through most campfires." } }
  ],
  build(params, domId) {
    const raw = Array.isArray(params.chords) ? params.chords.slice(0, 10) : [];
    const chords = raw.map((c) => {
      const frets = (Array.isArray(c.frets) ? c.frets : []).slice(0, 6).map((f) => {
        const n = Math.round(Number(f));
        return Number.isFinite(n) ? n : -1;
      });
      while (frets.length < 6) frets.push(-1);
      return { name: String(c && c.name != null ? c.name : "?"), frets };
    }).filter((c) => c.frets.length === 6);
    const title = params.title ? `<div class="pg-cd-title">${esc(params.title)}</div>` : "";
    const caption = params.caption ? `<div class="pg-cd-caption">${esc(params.caption)}</div>` : "";
    const btns = chords.map(
      (c, i) => `<button type="button" class="pg-cd-btn" data-role="chord" data-i="${i}" aria-pressed="${i === 0 ? "true" : "false"}">${esc(c.name)}</button>`
    ).join("");
    const html = `<div class="pg-stage">` + title + `<div class="pg-controls"><div class="pg-row pg-cd-btns">${btns}</div></div><div class="pg-cd-board"><svg data-role="svg" viewBox="0 0 200 240" role="img" aria-label="Guitar chord diagram"></svg></div><div class="pg-readout" data-role="readout"></div>` + caption + `</div>`;
    const css = [
      `#${domId} .pg-cd-title{font-weight:600;margin-bottom:.5rem}`,
      `#${domId} .pg-cd-btns{flex-wrap:wrap;gap:.4rem}`,
      `#${domId} .pg-cd-btn{font:inherit;cursor:pointer;padding:.35rem .7rem;border-radius:8px;border:1px solid var(--line,#23304a);background:rgba(140,160,200,.06);color:var(--ink-dim,#cdd6e6);font-weight:600}`,
      `#${domId} .pg-cd-btn[aria-pressed=true]{border-color:#22d3ee;background:rgba(34,211,238,.12);color:#e9eef8}`,
      `#${domId} .pg-cd-board{display:flex;justify-content:center;margin:.8rem 0}`,
      `#${domId} .pg-cd-board svg{width:200px;max-width:100%;height:auto}`,
      `#${domId} .pg-readout{text-align:center;font-weight:600;color:#22d3ee}`,
      `#${domId} .pg-cd-caption{margin-top:.4rem;text-align:center;color:var(--ink-dim,#cdd6e6);font-size:.9rem;opacity:.85}`
    ].join("\n");
    const jsBody = `
var data = ${JSON.stringify(chords)};
var svg = $('[data-role=svg]');
var readout = $('[data-role=readout]');
if(!svg || !readout || !data.length) return;
var NS = 'http://www.w3.org/2000/svg';
var STRINGS = 6;
var X0 = 30, X1 = 170, Y0 = 50, GAP = (X1 - X0) / (STRINGS - 1);
var INK = '#cdd6e6', LINE = '#3a4a66', ACCENT = '#22d3ee';

function el(name, attrs){
  var e = document.createElementNS(NS, name);
  for(var k in attrs) if(attrs.hasOwnProperty(k)) e.setAttribute(k, attrs[k]);
  return e;
}
function txt(x, y, s, attrs){
  var t = el('text', attrs || {});
  t.setAttribute('x', x); t.setAttribute('y', y);
  t.setAttribute('text-anchor', 'middle');
  t.textContent = s;
  return t;
}
function stringX(i){ return X0 + i * GAP; }

function draw(chord){
  while(svg.firstChild) svg.removeChild(svg.firstChild);
  var played = chord.frets.filter(function(f){ return f > 0; });
  var maxFret = played.length ? Math.max.apply(null, played) : 0;
  var rows = Math.max(4, maxFret);
  var rowH = (240 - Y0 - 20) / rows;

  // fret rows (horizontal)
  for(var r = 0; r <= rows; r++){
    var y = Y0 + r * rowH;
    svg.appendChild(el('line', { x1: X0, y1: y, x2: X1, y2: y, stroke: LINE, 'stroke-width': r === 0 ? 4 : 1.5 }));
  }
  // strings (vertical)
  for(var s = 0; s < STRINGS; s++){
    var x = stringX(s);
    svg.appendChild(el('line', { x1: x, y1: Y0, x2: x, y2: Y0 + rows * rowH, stroke: LINE, 'stroke-width': 1.5 }));
  }

  // markers above the nut + dots on frets
  for(var i = 0; i < STRINGS; i++){
    var f = chord.frets[i];
    var sx = stringX(i);
    if(f === -1){
      svg.appendChild(txt(sx, Y0 - 14, '\xD7', { fill: INK, 'font-size': '16', 'font-weight': '700' }));
    } else if(f === 0){
      svg.appendChild(el('circle', { cx: sx, cy: Y0 - 18, r: 6, fill: 'none', stroke: INK, 'stroke-width': 1.5 }));
    } else {
      var cy = Y0 + (f - 0.5) * rowH;
      svg.appendChild(el('circle', { cx: sx, cy: cy, r: 8, fill: ACCENT }));
    }
  }

  readout.textContent = chord.name;
}

var btns = $$('[data-role=chord]');
btns.forEach(function(b){
  b.addEventListener('click', function(){
    var idx = parseInt(b.getAttribute('data-i'), 10) || 0;
    if(!data[idx]) return;
    btns.forEach(function(o){ o.setAttribute('aria-pressed', o === b ? 'true' : 'false'); });
    draw(data[idx]);
  });
});

draw(data[0]);
`;
    return { html, css, jsBody };
  }
};

// server/playgrounds/budget-donut.js
var PALETTE3 = ["#2dd4bf", "#22d3ee", "#818cf8", "#f472b6", "#fbbf24", "#34d399"];
var budget_donut_default = {
  id: "budget-donut",
  name: "Budget split",
  category: "tool",
  description: "Split an income across categories with sliders and watch the donut and the cash amounts update live.",
  paramsSchema: {
    type: "object",
    additionalProperties: false,
    required: ["categories"],
    properties: {
      title: { type: "string" },
      income: { type: "number", default: 2e3, minimum: 0 },
      currency: { type: "string", default: "\xA3" },
      categories: { type: "array", minItems: 2, maxItems: 6, items: {
        type: "object",
        additionalProperties: false,
        required: ["name", "pct"],
        properties: {
          name: { type: "string" },
          pct: { type: "number", minimum: 0, maximum: 100 },
          colour: { type: "string" }
        }
      } },
      caption: { type: "string" }
    }
  },
  presets: [
    { name: "The 50/30/20 rule", params: {
      title: "The 50/30/20 rule",
      income: 2e3,
      currency: "\xA3",
      categories: [
        { name: "Needs", pct: 50 },
        { name: "Wants", pct: 30 },
        { name: "Savings", pct: 20 }
      ],
      caption: "A rough rule of thumb: half on needs, a third on wants, the rest saved."
    } },
    { name: "Where the salary goes", params: {
      title: "Where the salary goes",
      income: 2500,
      currency: "\xA3",
      categories: [
        { name: "Rent", pct: 35 },
        { name: "Food", pct: 15 },
        { name: "Transport", pct: 10 },
        { name: "Fun", pct: 20 },
        { name: "Savings", pct: 20 }
      ]
    } }
  ],
  build(params, domId) {
    const cats = (Array.isArray(params.categories) ? params.categories : []).slice(0, 6).map((c, i) => {
      const colour = /^#[0-9a-fA-F]{3,8}$/.test(c && c.colour || "") ? c.colour : PALETTE3[i % PALETTE3.length];
      const pct = Math.max(0, Math.min(100, Math.round(Number(c && c.pct) || 0)));
      return { name: String(c && c.name != null ? c.name : `Category ${i + 1}`), pct, colour };
    });
    const income = Math.max(0, Number(params.income) || 0);
    const currency = typeof params.currency === "string" && params.currency ? params.currency : "\xA3";
    const title = params.title ? `<div class="pg-bd-title">${esc(params.title)}</div>` : "";
    const caption = params.caption ? `<div class="pg-bd-cap">${esc(params.caption)}</div>` : "";
    const rows = cats.map((c, i) => `<div class="pg-field pg-bd-row" data-role="row" data-i="${i}" data-colour="${esc(c.colour)}"><label><b><span class="pg-bd-swatch" style="background:${esc(c.colour)}"></span>${esc(c.name)}</b><span class="pg-readout"><span data-role="pct">${c.pct}</span>% \xB7 <span data-role="cash">${currency}0</span></span></label><input type="range" min="0" max="100" step="1" value="${c.pct}" data-role="slider" aria-label="${esc(c.name)} percentage"></div>`).join("");
    const svg2 = `<svg class="pg-bd-svg" viewBox="0 0 120 120" role="img" aria-label="Budget donut chart"><circle cx="60" cy="60" r="42" class="pg-bd-track"></circle><g data-role="arcs" transform="rotate(-90 60 60)"></g><text x="60" y="56" text-anchor="middle" class="pg-bd-cx" data-role="centre-pct">100%</text><text x="60" y="72" text-anchor="middle" class="pg-bd-cs">allocated</text></svg>`;
    const html = `<div class="pg-stage">` + title + `<div class="pg-bd-wrap"><div class="pg-bd-chart">${svg2}</div><div class="pg-controls pg-bd-controls">${rows}</div></div><div class="pg-bd-foot"><span class="pg-readout">Income <b data-role="income">${currency}0</b></span><span class="pg-bd-note" data-role="note"></span></div>` + caption + `</div>`;
    const css = [
      `#${domId} .pg-bd-title{font-weight:700;font-size:1.05rem;margin-bottom:.6rem}`,
      `#${domId} .pg-bd-wrap{display:flex;flex-direction:column;gap:1rem;align-items:center}`,
      `@media(min-width:560px){#${domId} .pg-bd-wrap{flex-direction:row;align-items:flex-start}}`,
      `#${domId} .pg-bd-chart{flex:0 0 auto}`,
      `#${domId} .pg-bd-svg{width:160px;height:160px;display:block}`,
      `#${domId} .pg-bd-track{fill:none;stroke:rgba(140,160,200,.12);stroke-width:14}`,
      `#${domId} .pg-bd-seg{fill:none;stroke-width:14;transition:stroke-dasharray .35s ease}`,
      `#${domId}.pg-bd-reduce .pg-bd-seg{transition:none}`,
      `#${domId} .pg-bd-cx{fill:#e9eef8;font-size:15px;font-weight:700}`,
      `#${domId} .pg-bd-cs{fill:#9fb0cc;font-size:7px;letter-spacing:.08em;text-transform:uppercase}`,
      `#${domId} .pg-bd-controls{flex:1 1 auto;display:flex;flex-direction:column;gap:.7rem;width:100%}`,
      `#${domId} .pg-bd-row label{display:flex;justify-content:space-between;align-items:center;gap:.6rem;font-size:.9rem;margin-bottom:.25rem}`,
      `#${domId} .pg-bd-row label b{display:flex;align-items:center;gap:.45rem;font-weight:600}`,
      `#${domId} .pg-bd-swatch{display:inline-block;width:11px;height:11px;border-radius:3px;flex:0 0 auto}`,
      `#${domId} .pg-bd-row .pg-readout{color:#cdd6e6;white-space:nowrap;font-variant-numeric:tabular-nums}`,
      `#${domId} .pg-bd-row input[type=range]{width:100%}`,
      `#${domId} .pg-bd-foot{display:flex;justify-content:space-between;align-items:baseline;gap:.8rem;flex-wrap:wrap;margin-top:1rem;font-size:.92rem}`,
      `#${domId} .pg-bd-foot .pg-readout b{color:#e9eef8}`,
      `#${domId} .pg-bd-note{color:#fbbf24;font-weight:600}`,
      `#${domId} .pg-bd-note.ok{color:#2dd4bf}`,
      `#${domId} .pg-bd-cap{margin-top:.7rem;color:#9fb0cc;font-size:.85rem}`
    ].join("\n");
    const jsBody = `
if(reduced)root.classList.add('pg-bd-reduce');
var NS='http://www.w3.org/2000/svg';
var R=42, CIRC=2*Math.PI*R;
var income=Math.max(0, Number(CONFIG.income)||0);
var currency=(typeof CONFIG.currency==='string'&&CONFIG.currency)?CONFIG.currency:'\xA3';
var arcs=$('[data-role=arcs]');
var rows=$$('[data-role=row]');
var centrePct=$('[data-role=centre-pct]');
var note=$('[data-role=note]');
var incomeEl=$('[data-role=income]');
if(!arcs||!rows.length)return;
function money(n){return currency+Math.round(n).toLocaleString('en-GB');}
var segs=rows.map(function(row){
  var c=row.getAttribute('data-colour')||'#22d3ee';
  var seg=document.createElementNS(NS,'circle');
  seg.setAttribute('class','pg-bd-seg');
  seg.setAttribute('cx','60');seg.setAttribute('cy','60');seg.setAttribute('r',String(R));
  seg.setAttribute('stroke',c);
  arcs.appendChild(seg);
  return seg;
});
if(incomeEl)incomeEl.textContent=money(income);
function render(){
  var total=0, offset=0;
  rows.forEach(function(row){ total+=Number(row.querySelector('[data-role=slider]').value)||0; });
  rows.forEach(function(row,i){
    var pct=Number(row.querySelector('[data-role=slider]').value)||0;
    row.querySelector('[data-role=pct]').textContent=pct;
    row.querySelector('[data-role=cash]').textContent=money(income*pct/100);
    var len=CIRC*pct/100;
    segs[i].setAttribute('stroke-dasharray',len+' '+(CIRC-len));
    segs[i].setAttribute('stroke-dashoffset',String(-offset));
    offset+=len;
  });
  if(centrePct)centrePct.textContent=total+'%';
  if(note){
    if(total<100){ note.textContent=(100-total)+'% unallocated'; note.classList.remove('ok'); }
    else if(total>100){ note.textContent='over by '+(total-100)+'%'; note.classList.remove('ok'); }
    else { note.textContent='fully allocated'; note.classList.add('ok'); }
  }
}
rows.forEach(function(row){
  row.querySelector('[data-role=slider]').addEventListener('input',render);
});
render();
`;
    return { html, css, jsBody };
  }
};

// server/playgrounds/moon-phase.js
var moon_phase_default = {
  id: "moon-phase",
  name: "Moon phases",
  category: "explorer",
  description: "Drag through a lunar month and watch the moon wax and wane, with the phase named as you go.",
  paramsSchema: {
    type: "object",
    additionalProperties: false,
    properties: {
      title: { type: "string", title: "Optional label above the moon" },
      caption: { type: "string", title: "One-line caption" }
    }
  },
  presets: [
    { name: "A month of moons", params: {
      title: "A month of moons",
      caption: "Drag from new to full and back \u2014 the whole cycle is about 29.5 days."
    } },
    { name: "Where's the moon tonight?", params: {
      title: "Where's the moon tonight?",
      caption: "Drag to roughly where we are in the cycle."
    } }
  ],
  build(params, domId) {
    const title = params.title ? `<div class="pg-mp-title">${esc(params.title)}</div>` : "";
    const caption = params.caption ? `<div class="pg-mp-cap pg-readout" data-role="cap">${esc(params.caption)}</div>` : "";
    const html = `<div class="pg-stage">${title}<svg class="pg-mp-svg" viewBox="0 0 200 200" data-role="svg" role="img" aria-label="The Moon"><defs><clipPath id="${domId}-clip"><circle cx="100" cy="100" r="90"></circle></clipPath></defs><circle cx="100" cy="100" r="90" fill="#0a0f1c" stroke="rgba(140,160,200,.25)" stroke-width="1.5"></circle><g clip-path="url(#${domId}-clip)"><path data-role="lit" d="" fill="#e9eef8"></path></g><circle cx="100" cy="100" r="90" fill="none" stroke="rgba(140,160,200,.25)" stroke-width="1.5"></circle></svg><div class="pg-mp-out pg-readout" data-role="out" aria-live="polite"></div><div class="pg-row"><label style="flex:1">Cycle progress<input type="range" data-role="slider" min="0" max="100" value="50" step="any" aria-label="Progress through the lunar cycle"></label></div>` + caption + `</div>`;
    const css = [
      `#${domId} .pg-mp-title{font-size:.9rem;color:var(--ink-dim,#9fb3c8);margin:0 0 .5rem}`,
      `#${domId} .pg-mp-svg{display:block;width:100%;max-width:240px;margin-inline:auto}`,
      `#${domId} [data-role=lit]{transition:d .2s ease}`,
      `#${domId} .pg-mp-out{text-align:center;font-size:1.15rem;font-weight:700;margin:.5rem 0 .4rem}`,
      `#${domId} .pg-mp-out small{display:block;font-size:.78rem;font-weight:400;color:var(--ink-dim,#9fb3c8);margin-top:.15rem}`,
      `#${domId} .pg-mp-cap{text-align:center}`,
      `#${domId}.pg-mp-reduce [data-role=lit]{transition:none}`
    ].join("\n");
    const jsBody = `
var lit=$('[data-role=lit]'),out=$('[data-role=out]'),slider=$('[data-role=slider]');
if(!lit||!out||!slider)return;
if(reduced)root.classList.add('pg-mp-reduce');
var cx=100,cy=100,R=90,CYCLE=29.5;
var SVGNS='http://www.w3.org/2000/svg';
// Lit shape: combine the bright limb (a half-circle) with a half-ellipse whose
// horizontal radius follows the terminator. p in [0,1]: 0/1=new, 0.5=full.
function litPath(p){
  var k=Math.cos(p*2*Math.PI);      // +1 at new, -1 at full
  var ex=R*Math.abs(k);             // terminator ellipse horizontal radius
  var top='M '+cx+' '+(cy-R), bot=cx+' '+(cy+R);
  // waxing (p<0.5) lights the RIGHT limb; waning lights the LEFT limb.
  if(p<0.5){
    // bright right semicircle, sweep down the right side
    var limb='A '+R+' '+R+' 0 0 1 '+bot;
    // terminator edge back up to top
    var sweep=(k>=0)?0:1;           // gibbous (k<0) bulges left, crescent bulges right
    var term='A '+ex+' '+R+' 0 0 '+sweep+' '+cx+' '+(cy-R);
    return top+' '+limb+' '+term+' Z';
  } else {
    // bright left semicircle, sweep down the left side
    var limb2='A '+R+' '+R+' 0 0 0 '+bot;
    var sweep2=(k>=0)?1:0;
    var term2='A '+ex+' '+R+' 0 0 '+sweep2+' '+cx+' '+(cy-R);
    return top+' '+limb2+' '+term2+' Z';
  }
}
function phaseName(p){
  var f=((p%1)+1)%1;
  if(f<0.03||f>0.97)return 'New moon';
  if(f<0.22)return 'Waxing crescent';
  if(f<0.28)return 'First quarter';
  if(f<0.47)return 'Waxing gibbous';
  if(f<0.53)return 'Full moon';
  if(f<0.72)return 'Waning gibbous';
  if(f<0.78)return 'Last quarter';
  return 'Waning crescent';
}
function set(v){
  var p=Math.max(0,Math.min(100,v))/100;
  if(p<=0.001||p>=0.999){lit.setAttribute('d','');}
  else if(Math.abs(p-0.5)<0.002){
    // full moon: a complete disc
    lit.setAttribute('d','M '+cx+' '+(cy-R)+' A '+R+' '+R+' 0 1 1 '+cx+' '+(cy+R)+' A '+R+' '+R+' 0 1 1 '+cx+' '+(cy-R)+' Z');
  } else { lit.setAttribute('d',litPath(p)); }
  var day=Math.round(p*CYCLE*10)/10;
  out.innerHTML=phaseName(p)+'<small>Day '+day.toFixed(1)+' of '+CYCLE+'</small>';
}
slider.addEventListener('input',function(){set(parseFloat(slider.value));});
set(parseFloat(slider.value));
`;
    return { html, css, jsBody };
  }
};

// server/playgrounds/morse-code.js
var morse_code_default = {
  id: "morse-code",
  name: "Morse code",
  category: "language",
  description: "Type a message to see it spelled out in Morse, then flash it through a blinking lamp.",
  paramsSchema: {
    type: "object",
    additionalProperties: false,
    required: ["placeholder"],
    properties: {
      title: { type: "string" },
      placeholder: { type: "string", default: "Type a message\u2026" },
      caption: { type: "string" }
    }
  },
  presets: [
    { name: "Type a message", params: { title: "Morse code", placeholder: "Type a message\u2026" } },
    { name: "SOS", params: { title: "Morse code", placeholder: "Try SOS", caption: "\xB7\xB7\xB7 \u2212\u2212\u2212 \xB7\xB7\xB7  \u2014 the only Morse anyone remembers." } }
  ],
  build(params, domId) {
    const placeholder = params.placeholder ? String(params.placeholder) : "Type a message\u2026";
    const title = params.title ? `<div class="pg-mc-title">${esc(params.title)}</div>` : "";
    const caption = params.caption ? `<p class="pg-mc-caption">${esc(params.caption)}</p>` : "";
    const html = `<div class="pg-stage">` + title + `<div class="pg-controls"><div class="pg-field"><label><b>Message</b></label><input type="text" data-role="input" placeholder="${esc(placeholder)}" autocomplete="off" spellcheck="false"></div></div><div class="pg-mc-out" data-role="out" aria-live="polite"></div><div class="pg-mc-row"><button type="button" class="pg-mc-go" data-role="go">Flash it</button><span class="pg-mc-lamp" data-role="lamp" aria-hidden="true"></span></div>` + caption + `</div>`;
    const css = [
      `#${domId} .pg-mc-title{font-weight:700;font-size:1.05rem;margin-bottom:.6rem;color:#e9eef8}`,
      `#${domId} .pg-field input{width:100%;box-sizing:border-box;padding:.55rem .7rem;border-radius:10px;border:1px solid #23304a;background:rgba(140,160,200,.06);color:#e9eef8;font:inherit}`,
      `#${domId} .pg-field input:focus{outline:none;border-color:#22d3ee;box-shadow:0 0 0 2px rgba(34,211,238,.25)}`,
      `#${domId} .pg-mc-out{margin:.8rem 0;padding:.7rem .8rem;min-height:1.4rem;border-radius:10px;border:1px solid #23304a;background:rgba(34,211,238,.05);color:#22d3ee;font-size:1.25rem;line-height:1.5;letter-spacing:.06em;word-break:break-word;font-variant-numeric:tabular-nums}`,
      `#${domId} .pg-mc-out:empty::before{content:'\u2026';color:#54607a}`,
      `#${domId} .pg-mc-row{display:flex;align-items:center;gap:.8rem}`,
      `#${domId} .pg-mc-go{padding:.5rem .9rem;border-radius:10px;border:1px solid #2dd4bf66;background:rgba(45,212,191,.1);color:#2dd4bf;font:inherit;font-weight:600;cursor:pointer}`,
      `#${domId} .pg-mc-go:hover{background:rgba(45,212,191,.18)}`,
      `#${domId} .pg-mc-go:disabled{opacity:.45;cursor:default}`,
      `#${domId} .pg-mc-lamp{width:28px;height:28px;border-radius:50%;background:#1a2336;border:1px solid #2a3650;box-shadow:none;transition:background .04s,box-shadow .04s}`,
      `#${domId} .pg-mc-lamp.on{background:#fbbf24;box-shadow:0 0 14px 4px rgba(251,191,36,.7)}`,
      `#${domId}.pg-mc-reduce .pg-mc-lamp{display:none}`,
      `#${domId}.pg-mc-reduce .pg-mc-go{display:none}`,
      `#${domId} .pg-mc-caption{margin:.7rem 0 0;color:#9aa6bd;font-size:.85rem}`
    ].join("\n");
    const jsBody = `
var MORSE={
  A:'.-',B:'-...',C:'-.-.',D:'-..',E:'.',F:'..-.',G:'--.',H:'....',I:'..',J:'.---',
  K:'-.-',L:'.-..',M:'--',N:'-.',O:'---',P:'.--.',Q:'--.-',R:'.-.',S:'...',T:'-',
  U:'..-',V:'...-',W:'.--',X:'-..-',Y:'-.--',Z:'--..',
  '0':'-----','1':'.----','2':'..---','3':'...--','4':'....-',
  '5':'.....','6':'-....','7':'--...','8':'---..','9':'----.'
};
var input=$('[data-role=input]');
var out=$('[data-role=out]');
var lamp=$('[data-role=lamp]');
var go=$('[data-role=go]');
if(!input||!out)return;
if(reduced)root.classList.add('pg-mc-reduce');

// glyphs for display: dot=\xB7  dash=\u2212
function toGlyph(code){return code.replace(/\\./g,'\\u00b7').replace(/-/g,'\\u2212');}

function render(){
  var text=(input.value||'').toUpperCase();
  // split into words on runs of non-mappable chars (spaces, punctuation, unknowns)
  var words=[];var cur=[];
  for(var i=0;i<text.length;i++){
    var ch=text[i];
    if(MORSE[ch]){cur.push(MORSE[ch]);}
    else{ if(cur.length){words.push(cur);cur=[];} }
  }
  if(cur.length)words.push(cur);
  var display=words.map(function(w){return w.map(toGlyph).join(' ');}).join('  /  ');
  out.textContent=display;
  return words;
}

function clearTimers(){
  if(root._morseTimers){root._morseTimers.forEach(function(t){clearTimeout(t);});}
  root._morseTimers=[];
}
function lampOff(){ if(lamp)lamp.classList.remove('on'); }

clearTimers();
lampOff();

input.addEventListener('input',render);
render();

if(go&&lamp&&!reduced){
  go.addEventListener('click',function(){
    clearTimers();        // guard against overlapping flashes
    lampOff();
    var words=render();
    var DOT=200,DASH=600,GAP=200,LETTER=600,WORD=1400;
    var t=0;
    function flash(dur){
      root._morseTimers.push(setTimeout(function(){lamp.classList.add('on');},t));
      t+=dur;
      root._morseTimers.push(setTimeout(function(){lamp.classList.remove('on');},t));
      t+=GAP;
    }
    var any=false;
    words.forEach(function(w,wi){
      if(wi>0)t+=WORD-GAP;
      w.forEach(function(code,li){
        if(li>0)t+=LETTER-GAP;
        for(var k=0;k<code.length;k++){ flash(code[k]==='-'?DASH:DOT); any=true; }
      });
    });
    if(!any)return;
    go.disabled=true;
    root._morseTimers.push(setTimeout(function(){go.disabled=false;lampOff();},t+200));
  });
}
`;
    return { html, css, jsBody };
  }
};

// server/playgrounds/timeline-scrubber.js
var timeline_scrubber_default = {
  id: "timeline-scrubber",
  name: "Timeline",
  category: "history",
  description: "Drag along a timeline to land on each moment in turn.",
  paramsSchema: {
    type: "object",
    additionalProperties: false,
    required: ["events"],
    properties: {
      title: { type: "string" },
      caption: { type: "string" },
      events: { type: "array", minItems: 2, maxItems: 12, items: {
        type: "object",
        additionalProperties: false,
        required: ["year", "label"],
        properties: {
          year: { type: "number" },
          label: { type: "string" },
          note: { type: "string" }
        }
      } }
    }
  },
  presets: [
    { name: "A short history of flight", params: {
      title: "A short history of flight",
      events: [
        { year: 1903, label: "First powered flight", note: "The Wright brothers, 12 seconds, 37 metres." },
        { year: 1927, label: "Solo across the Atlantic", note: "Lindbergh, 33.5 hours, alone." },
        { year: 1947, label: "Breaking the sound barrier" },
        { year: 1969, label: "The Moon", note: "Apollo 11." },
        { year: 1976, label: "Concorde enters service" },
        { year: 2004, label: "First private spaceflight", note: "SpaceShipOne." }
      ]
    } },
    { name: "The personal computer", params: {
      title: "The personal computer",
      events: [
        { year: 1971, label: "The microprocessor" },
        { year: 1977, label: "Apple II" },
        { year: 1981, label: "IBM PC" },
        { year: 1984, label: "The Macintosh" },
        { year: 1991, label: "The Web goes public" },
        { year: 2007, label: "iPhone" }
      ]
    } }
  ],
  build(params, domId) {
    const events = (Array.isArray(params.events) ? params.events : []).filter((e) => e && typeof e.year === "number" && isFinite(e.year)).map((e) => ({ year: Math.round(e.year), label: String(e.label == null ? "" : e.label), note: e.note ? String(e.note) : "" })).sort((a, b) => a.year - b.year).slice(0, 12);
    const min = events.length ? events[0].year : 0;
    const max = events.length ? events[events.length - 1].year : 0;
    const span = max - min || 1;
    const title = params.title ? `<div class="pg-tl-title">${esc(params.title)}</div>` : "";
    const caption = params.caption ? `<div class="pg-tl-caption">${esc(params.caption)}</div>` : "";
    const dots = events.map((e, i) => {
      const pos = (e.year - min) / span * 100;
      return `<button type="button" class="pg-tl-dot" data-role="dot" data-index="${i}" data-year="${e.year}" style="left:${pos}%" aria-label="${esc(e.year + ": " + e.label)}"><span class="pg-tl-dot-year">${esc(String(e.year))}</span></button>`;
    }).join("");
    const html = `<div class="pg-stage">${title}<div class="pg-tl-track"><div class="pg-tl-axis"></div><div class="pg-tl-marker" data-role="marker"></div>` + dots + `</div><div class="pg-controls"><div class="pg-row pg-field"><label><b>Year</b> <span class="pg-readout" data-role="yearout">${esc(String(min))}</span></label><input type="range" data-role="slider" min="${min}" max="${max}" step="1" value="${min}"></div></div><div class="pg-readout pg-tl-readout" data-role="readout" aria-live="polite"></div>` + caption + `</div>`;
    const css = [
      `#${domId} .pg-tl-title{font-weight:700;margin-bottom:.4rem;color:var(--ink,#e9eef8)}`,
      `#${domId} .pg-tl-track{position:relative;height:64px;margin:1.4rem .6rem .6rem}`,
      `#${domId} .pg-tl-axis{position:absolute;left:0;right:0;top:50%;height:2px;transform:translateY(-50%);background:linear-gradient(90deg,#2dd4bf,#22d3ee,#818cf8);border-radius:2px;opacity:.65}`,
      `#${domId} .pg-tl-marker{position:absolute;top:50%;left:0;width:16px;height:16px;margin:-8px 0 0 -8px;border-radius:50%;background:#fbbf24;box-shadow:0 0 0 4px rgba(251,191,36,.18);transition:left .25s ease}`,
      `#${domId}.pg-tl-reduce .pg-tl-marker{transition:none}`,
      `#${domId} .pg-tl-dot{position:absolute;top:50%;transform:translate(-50%,-50%);width:13px;height:13px;padding:0;border:2px solid #0a0e18;border-radius:50%;background:#22d3ee;cursor:pointer;font:inherit}`,
      `#${domId} .pg-tl-dot:hover,#${domId} .pg-tl-dot.active{background:#818cf8}`,
      `#${domId} .pg-tl-dot-year{position:absolute;left:50%;bottom:140%;transform:translateX(-50%);font-size:.62rem;color:var(--ink-dim,#9fb0c8);white-space:nowrap;pointer-events:none}`,
      `#${domId} .pg-tl-dot.active .pg-tl-dot-year{color:#818cf8}`,
      `#${domId} input[type=range]{width:100%}`,
      `#${domId} .pg-tl-readout{margin-top:.6rem;min-height:2.6rem}`,
      `#${domId} .pg-tl-readout .yr{color:#fbbf24;font-weight:700}`,
      `#${domId} .pg-tl-readout .lab{color:var(--ink,#e9eef8);font-weight:600}`,
      `#${domId} .pg-tl-readout .note{display:block;margin-top:.2rem;color:var(--ink-dim,#9fb0c8);font-size:.92em}`,
      `#${domId} .pg-tl-caption{margin-top:.6rem;color:var(--ink-dim,#9fb0c8);font-size:.88rem}`
    ].join("\n");
    const jsBody = `
var EVENTS=${JSON.stringify(events)};
var MIN=${min},MAX=${max},SPAN=${span};
if(!EVENTS.length)return;
if(reduced)root.classList.add('pg-tl-reduce');
var slider=$('[data-role=slider]'),marker=$('[data-role=marker]'),yearout=$('[data-role=yearout]'),readout=$('[data-role=readout]');
if(!slider||!marker||!readout)return;
var dots=$$('[data-role=dot]');
function nearest(y){
  var best=0,bd=Infinity;
  for(var i=0;i<EVENTS.length;i++){var d=Math.abs(EVENTS[i].year-y);if(d<bd){bd=d;best=i;}}
  return best;
}
function render(y){
  var pos=((y-MIN)/SPAN)*100;
  marker.style.left=pos+'%';
  if(yearout)yearout.textContent=y;
  var idx=nearest(y),e=EVENTS[idx];
  var html='<span class="yr">'+e.year+'</span> <span class="lab">'+e.label.replace(/[&<>]/g,function(c){return c==='&'?'&amp;':c==='<'?'&lt;':'&gt;';})+'</span>';
  if(e.note)html+='<span class="note">'+e.note.replace(/[&<>]/g,function(c){return c==='&'?'&amp;':c==='<'?'&lt;':'&gt;';})+'</span>';
  readout.innerHTML=html;
  dots.forEach(function(d){d.classList.toggle('active',parseInt(d.getAttribute('data-index'),10)===idx);});
}
slider.addEventListener('input',function(){render(parseInt(slider.value,10));});
dots.forEach(function(d){
  d.addEventListener('click',function(){
    var y=parseInt(d.getAttribute('data-year'),10);
    slider.value=y;
    render(y);
  });
});
render(MIN);
`;
    return { html, css, jsBody };
  }
};

// server/playgrounds/higher-lower.js
var higher_lower_default = {
  id: "higher-lower",
  name: "Higher or lower",
  category: "game",
  description: "Guess whether the next thing\u2019s number is higher or lower than the one shown, and build up a streak.",
  paramsSchema: {
    type: "object",
    additionalProperties: false,
    required: ["items"],
    properties: {
      title: { type: "string" },
      unit: { type: "string", default: "" },
      caption: { type: "string" },
      items: {
        type: "array",
        minItems: 4,
        maxItems: 24,
        items: {
          type: "object",
          additionalProperties: false,
          required: ["label", "value"],
          properties: { label: { type: "string" }, value: { type: "number" } }
        }
      }
    }
  },
  presets: [
    {
      name: "Which country has more people?",
      params: {
        title: "Which country has more people?",
        unit: " m",
        caption: "Population in millions. Tie counts as correct.",
        items: [
          { label: "India", value: 1429 },
          { label: "China", value: 1426 },
          { label: "United States", value: 340 },
          { label: "Indonesia", value: 278 },
          { label: "Pakistan", value: 240 },
          { label: "Brazil", value: 216 },
          { label: "Nigeria", value: 224 },
          { label: "Japan", value: 123 },
          { label: "United Kingdom", value: 68 },
          { label: "Australia", value: 26 }
        ]
      }
    },
    {
      name: "Higher box office? ($m)",
      params: {
        title: "Which film made more at the box office?",
        unit: " $m",
        caption: "Worldwide gross, millions of US dollars.",
        items: [
          { label: "Avatar", value: 2923 },
          { label: "Avengers: Endgame", value: 2799 },
          { label: "Titanic", value: 2257 },
          { label: "Star Wars: TFA", value: 2071 },
          { label: "Jurassic World", value: 1671 },
          { label: "The Lion King (2019)", value: 1657 },
          { label: "Frozen II", value: 1453 }
        ]
      }
    }
  ],
  build(params, domId) {
    const items = (Array.isArray(params.items) ? params.items : []).filter((it) => it && typeof it.label !== "undefined" && typeof it.value === "number" && isFinite(it.value)).slice(0, 24).map((it) => ({ label: String(it.label), value: Number(it.value) }));
    const unit = typeof params.unit === "string" ? params.unit : "";
    const title = params.title ? `<div class="pg-hl-title">${esc(params.title)}</div>` : "";
    const caption = params.caption ? `<div class="pg-hl-caption">${esc(params.caption)}</div>` : "";
    const html = `<div class="pg-stage">` + title + `<div class="pg-hl-scores"><span class="pg-hl-score">Streak <b data-role="streak">0</b></span><span class="pg-hl-score">Best <b data-role="best">0</b></span></div><div class="pg-hl-board"><div class="pg-hl-panel pg-hl-left"><div class="pg-hl-label" data-role="left-label">\u2014</div><div class="pg-hl-value" data-role="left-value">\u2014</div></div><div class="pg-hl-vs">vs</div><div class="pg-hl-panel pg-hl-right"><div class="pg-hl-label" data-role="right-label">\u2014</div><div class="pg-hl-value pg-hl-hidden" data-role="right-value">?</div><div class="pg-hl-buttons" data-role="buttons"><button type="button" class="pg-hl-btn" data-role="higher">\u2191 Higher</button><button type="button" class="pg-hl-btn" data-role="lower">\u2193 Lower</button></div></div></div><div class="pg-hl-msg" data-role="msg" aria-live="polite"></div><div class="pg-hl-over" data-role="over" hidden><button type="button" class="pg-hl-again" data-role="again">Play again</button></div>` + caption + `</div>`;
    const css = [
      `#${domId} .pg-hl-title{font-weight:700;font-size:1.05rem;margin-bottom:.5rem;color:var(--ink,#e9eef8)}`,
      `#${domId} .pg-hl-scores{display:flex;gap:1rem;justify-content:center;margin-bottom:.7rem;color:var(--ink-dim,#cdd6e6);font-size:.9rem}`,
      `#${domId} .pg-hl-score b{color:#22d3ee;font-variant-numeric:tabular-nums;margin-left:.2rem}`,
      `#${domId} .pg-hl-board{display:grid;grid-template-columns:1fr auto 1fr;align-items:stretch;gap:.6rem}`,
      `#${domId} .pg-hl-panel{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:.6rem;min-height:150px;padding:1rem;border-radius:12px;border:1px solid var(--line,#23304a);background:rgba(140,160,200,.05);transition:transform .35s ease,opacity .35s ease,border-color .35s ease,background .35s ease}`,
      `#${domId} .pg-hl-left{border-color:#2dd4bf55;background:rgba(45,212,191,.06)}`,
      `#${domId} .pg-hl-label{font-weight:600;font-size:1.05rem;text-align:center;color:var(--ink,#e9eef8)}`,
      `#${domId} .pg-hl-value{font-weight:800;font-size:1.7rem;font-variant-numeric:tabular-nums;color:#fbbf24}`,
      `#${domId} .pg-hl-value.pg-hl-hidden{color:#818cf8}`,
      `#${domId} .pg-hl-vs{align-self:center;color:var(--ink-dim,#cdd6e6);font-size:.8rem;letter-spacing:.1em;text-transform:uppercase}`,
      `#${domId} .pg-hl-buttons{display:flex;flex-direction:column;gap:.4rem;width:100%;max-width:160px}`,
      `#${domId} .pg-hl-btn{font:inherit;font-weight:700;cursor:pointer;padding:.55rem .7rem;border-radius:10px;border:1px solid #818cf855;background:rgba(129,140,248,.1);color:var(--ink,#e9eef8);transition:background .2s,border-color .2s}`,
      `#${domId} .pg-hl-btn:hover{background:rgba(129,140,248,.22);border-color:#818cf8}`,
      `#${domId} .pg-hl-btn:disabled{opacity:.4;cursor:default}`,
      `#${domId} .pg-hl-msg{min-height:1.3rem;text-align:center;margin-top:.7rem;font-weight:600}`,
      `#${domId} .pg-hl-msg.ok{color:#2dd4bf}`,
      `#${domId} .pg-hl-msg.bad{color:#f472b6}`,
      `#${domId} .pg-hl-over{text-align:center;margin-top:.6rem}`,
      `#${domId} .pg-hl-over[hidden]{display:none}`,
      `#${domId} .pg-hl-again{font:inherit;font-weight:700;cursor:pointer;padding:.55rem 1.1rem;border-radius:10px;border:1px solid #22d3ee;background:rgba(34,211,238,.12);color:var(--ink,#e9eef8)}`,
      `#${domId} .pg-hl-again:hover{background:rgba(34,211,238,.24)}`,
      `#${domId} .pg-hl-caption{margin-top:.7rem;font-size:.8rem;color:var(--ink-dim,#cdd6e6);text-align:center;opacity:.8}`,
      `#${domId} .pg-hl-right.advance{transform:translateX(-12px);opacity:.6}`,
      `#${domId}.pg-hl-reduce .pg-hl-panel{transition:none}`,
      `@media(max-width:520px){#${domId} .pg-hl-board{grid-template-columns:1fr;gap:.5rem}#${domId} .pg-hl-vs{order:0}}`
    ].join("\n");
    const jsBody = `
var ITEMS = (CONFIG.items || []).filter(function(it){ return it && typeof it.value === 'number' && isFinite(it.value); });
var UNIT = typeof CONFIG.unit === 'string' ? CONFIG.unit : '';
if (ITEMS.length < 2) return;
if (reduced) root.classList.add('pg-hl-reduce');

var elLeftLabel = $('[data-role=left-label]');
var elLeftValue = $('[data-role=left-value]');
var elRightLabel = $('[data-role=right-label]');
var elRightValue = $('[data-role=right-value]');
var elStreak = $('[data-role=streak]');
var elBest = $('[data-role=best]');
var elMsg = $('[data-role=msg]');
var elOver = $('[data-role=over]');
var elButtons = $('[data-role=buttons]');
var btnHigher = $('[data-role=higher]');
var btnLower = $('[data-role=lower]');
var btnAgain = $('[data-role=again]');
var elRightPanel = root.querySelector('.pg-hl-right');
if (!elLeftValue || !elRightValue || !btnHigher || !btnLower || !btnAgain) return;

var deck = [], pos = 0, left = null, right = null, streak = 0, best = 0, locked = false;

function fmt(v){
  var n = Math.round(v * 100) / 100;
  return String(n).replace(/\\B(?=(\\d{3})+(?!\\d))/g, ',') + UNIT;
}

function shuffle(){
  var a = ITEMS.slice();
  for (var i = a.length - 1; i > 0; i--){
    var j = Math.floor(Math.random() * (i + 1));
    var t = a[i]; a[i] = a[j]; a[j] = t;
  }
  return a;
}

function nextItem(){
  if (pos >= deck.length){
    // ran out \u2014 reshuffle, avoiding an immediate repeat of the current left item
    var fresh = shuffle();
    if (left && fresh.length > 1 && fresh[0].label === left.label && fresh[0].value === left.value){
      var t = fresh[0]; fresh[0] = fresh[1]; fresh[1] = t;
    }
    deck = fresh; pos = 0;
  }
  return deck[pos++];
}

function renderLeft(){
  elLeftLabel.textContent = left.label;
  elLeftValue.textContent = fmt(left.value);
}

function renderRight(){
  elRightLabel.textContent = right.label;
  elRightValue.textContent = '?';
  elRightValue.classList.add('pg-hl-hidden');
}

function setButtons(on){
  btnHigher.disabled = !on;
  btnLower.disabled = !on;
}

function start(){
  deck = shuffle(); pos = 0;
  left = nextItem();
  right = nextItem();
  streak = 0; locked = false;
  elStreak.textContent = '0';
  elMsg.textContent = '';
  elMsg.className = 'pg-hl-msg';
  elOver.hidden = true;
  elButtons.style.display = '';
  renderLeft();
  renderRight();
  setButtons(true);
}

function gameOver(){
  locked = true;
  setButtons(false);
  elMsg.textContent = 'Game over \u2014 streak: ' + streak;
  elMsg.className = 'pg-hl-msg bad';
  elButtons.style.display = 'none';
  elOver.hidden = false;
}

function advance(){
  left = right;
  right = nextItem();
  renderLeft();
  renderRight();
  setButtons(true);
  locked = false;
}

function guess(higher){
  if (locked) return;
  locked = true;
  setButtons(false);
  // reveal
  elRightValue.textContent = fmt(right.value);
  elRightValue.classList.remove('pg-hl-hidden');
  var correct = higher ? (right.value >= left.value) : (right.value <= left.value);
  if (correct){
    streak += 1;
    if (streak > best){ best = streak; elBest.textContent = String(best); }
    elStreak.textContent = String(streak);
    elMsg.textContent = 'Correct \u2014 keep going.';
    elMsg.className = 'pg-hl-msg ok';
    var delay = reduced ? 0 : 650;
    if (!reduced) elRightPanel.classList.add('advance');
    setTimeout(function(){
      if (elRightPanel) elRightPanel.classList.remove('advance');
      advance();
    }, delay);
  } else {
    gameOver();
  }
}

btnHigher.addEventListener('click', function(){ guess(true); });
btnLower.addEventListener('click', function(){ guess(false); });
btnAgain.addEventListener('click', start);

start();
`;
    return { html, css, jsBody };
  }
};

// server/playgrounds/forecast-strip.js
var GLYPHS = {
  sun: "\u2600\uFE0F",
  partly: "\u26C5",
  cloud: "\u2601\uFE0F",
  rain: "\u{1F327}\uFE0F",
  storm: "\u26C8\uFE0F",
  snow: "\u2744\uFE0F",
  fog: "\u{1F32B}\uFE0F"
};
var WORDS = {
  sun: "Sunny",
  partly: "Partly cloudy",
  cloud: "Cloudy",
  rain: "Rain",
  storm: "Thunderstorms",
  snow: "Snow",
  fog: "Fog"
};
var forecast_strip_default = {
  id: "forecast-strip",
  name: "Forecast",
  category: "weather",
  description: "A multi-day weather strip you can tap for the detail \u2014 use it to lay out a week (or a day) at a glance.",
  paramsSchema: {
    type: "object",
    additionalProperties: false,
    required: ["unit", "days"],
    properties: {
      title: { type: "string" },
      unit: { type: "string", default: "\xB0C" },
      caption: { type: "string" },
      days: {
        type: "array",
        minItems: 3,
        maxItems: 7,
        items: {
          type: "object",
          additionalProperties: false,
          required: ["day", "condition", "high", "low"],
          properties: {
            day: { type: "string" },
            condition: { type: "string", enum: ["sun", "partly", "cloud", "rain", "storm", "snow", "fog"] },
            high: { type: "number" },
            low: { type: "number" },
            note: { type: "string" }
          }
        }
      }
    }
  },
  presets: [
    {
      name: "A British week",
      params: {
        unit: "\xB0C",
        title: "A British week",
        days: [
          { day: "Mon", condition: "cloud", high: 14, low: 8 },
          { day: "Tue", condition: "rain", high: 12, low: 7, note: "Bring a coat." },
          { day: "Wed", condition: "partly", high: 15, low: 9 },
          { day: "Thu", condition: "rain", high: 11, low: 6 },
          { day: "Fri", condition: "sun", high: 17, low: 10, note: "Briefly glorious." },
          { day: "Sat", condition: "storm", high: 13, low: 9 },
          { day: "Sun", condition: "cloud", high: 14, low: 8 }
        ]
      }
    },
    {
      name: "Four seasons in a day",
      params: {
        unit: "\xB0C",
        title: "Four seasons in a day",
        days: [
          { day: "Morning", condition: "fog", high: 6, low: 4 },
          { day: "Midday", condition: "sun", high: 18, low: 12 },
          { day: "Afternoon", condition: "storm", high: 14, low: 10 },
          { day: "Evening", condition: "snow", high: 2, low: -1 }
        ]
      }
    }
  ],
  build(params, domId) {
    const allowed = ["sun", "partly", "cloud", "rain", "storm", "snow", "fog"];
    const unit = typeof params.unit === "string" && params.unit ? params.unit : "\xB0C";
    const days = (Array.isArray(params.days) ? params.days : []).slice(0, 7).map((d) => {
      const cond = allowed.indexOf(d && d.condition) >= 0 ? d.condition : "cloud";
      return {
        day: String(d && d.day != null ? d.day : ""),
        condition: cond,
        high: Number(d && d.high),
        low: Number(d && d.low),
        note: d && d.note ? String(d.note) : ""
      };
    });
    const title = params.title ? `<div class="pg-fs-title">${esc(params.title)}</div>` : "";
    const caption = params.caption ? `<div class="pg-fs-caption">${esc(params.caption)}</div>` : "";
    const cardsHtml = days.map((d, i) => `<button type="button" class="pg-fs-card" data-role="card" data-i="${i}" aria-pressed="false"><span class="pg-fs-day">${esc(d.day)}</span><span class="pg-fs-glyph" aria-hidden="true">${GLYPHS[d.condition]}</span><span class="pg-fs-temps"><b class="pg-fs-high">${esc(String(d.high))}${esc(unit)}</b><span class="pg-fs-low">${esc(String(d.low))}${esc(unit)}</span></span></button>`).join("");
    const html = `<div class="pg-stage">${title}<div class="pg-fs-strip" data-role="strip" role="list">${cardsHtml}</div><div class="pg-readout pg-fs-detail" data-role="detail" aria-live="polite"><span class="pg-fs-hint">Tap a day for the detail.</span></div>${caption}</div>`;
    const css = [
      `#${domId} .pg-fs-title{font-weight:700;margin-bottom:.6rem;color:var(--ink,#e9eef8)}`,
      `#${domId} .pg-fs-strip{display:flex;flex-wrap:wrap;gap:.55rem;overflow-x:auto;padding-bottom:.2rem}`,
      `#${domId} .pg-fs-card{flex:1 1 84px;min-width:84px;display:flex;flex-direction:column;align-items:center;gap:.35rem;padding:.7rem .5rem;border-radius:12px;border:1px solid var(--line,#23304a);background:rgba(140,160,200,.05);color:var(--ink,#e9eef8);cursor:pointer;font:inherit;transition:border-color .18s,background .18s,transform .18s}`,
      `#${domId} .pg-fs-card:hover{border-color:#22d3ee88;background:rgba(34,211,238,.06)}`,
      `#${domId} .pg-fs-card.selected{border-color:#2dd4bf;background:rgba(45,212,191,.12);transform:translateY(-2px)}`,
      `#${domId} .pg-fs-day{font-size:.82rem;font-weight:600;letter-spacing:.02em;color:var(--ink-dim,#cdd6e6)}`,
      `#${domId} .pg-fs-glyph{font-size:1.7rem;line-height:1}`,
      `#${domId} .pg-fs-temps{display:flex;flex-direction:column;align-items:center;line-height:1.15}`,
      `#${domId} .pg-fs-high{font-size:.95rem;color:#fbbf24}`,
      `#${domId} .pg-fs-low{font-size:.8rem;color:#818cf8}`,
      `#${domId} .pg-fs-detail{margin-top:.75rem;min-height:2.4rem;padding:.65rem .8rem;border-radius:10px;border:1px solid var(--line,#23304a);background:rgba(140,160,200,.05);color:var(--ink-dim,#cdd6e6);font-size:.92rem}`,
      `#${domId} .pg-fs-detail b{color:var(--ink,#e9eef8)}`,
      `#${domId} .pg-fs-detail .pg-fs-dglyph{font-size:1.15rem}`,
      `#${domId} .pg-fs-detail .pg-fs-note{display:block;margin-top:.3rem;color:#2dd4bf}`,
      `#${domId} .pg-fs-hint{opacity:.7}`,
      `#${domId} .pg-fs-caption{margin-top:.6rem;font-size:.85rem;color:var(--ink-dim,#cdd6e6);opacity:.85}`
    ].join("\n");
    const jsBody = `
var DAYS=${JSON.stringify(days)};
var GLYPHS=${JSON.stringify(GLYPHS)};
var WORDS=${JSON.stringify(WORDS)};
var UNIT=${JSON.stringify(unit)};
var detail=$('[data-role=detail]');
var cards=$$('[data-role=card]');
if(!detail||!cards.length)return;
function pick(i){
  var d=DAYS[i];
  if(!d)return;
  cards.forEach(function(c){
    var on=Number(c.getAttribute('data-i'))===i;
    c.classList.toggle('selected',on);
    c.setAttribute('aria-pressed',on?'true':'false');
  });
  var parts='<b>'+esc(d.day)+'</b> \xB7 '+
    '<span class="pg-fs-dglyph" aria-hidden="true">'+(GLYPHS[d.condition]||'')+'</span> '+
    esc(WORDS[d.condition]||d.condition)+
    ' \xB7 high <b>'+esc(String(d.high))+esc(UNIT)+'</b>, low <b>'+esc(String(d.low))+esc(UNIT)+'</b>';
  if(d.note)parts+='<span class="pg-fs-note">'+esc(d.note)+'</span>';
  detail.innerHTML=parts;
}
function esc(s){return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}
cards.forEach(function(c){
  c.addEventListener('click',function(){pick(Number(c.getAttribute('data-i')));});
});
`;
    return { html, css, jsBody };
  }
};

// server/playgrounds/quadrant-plot.js
var quadrant_plot_default = {
  id: "quadrant-plot",
  name: "Quadrant",
  category: "tool",
  description: "Drag a marker around a 2\xD72 matrix to see which of the four quadrants something falls into.",
  paramsSchema: {
    type: "object",
    additionalProperties: false,
    required: ["xLeft", "xRight", "yTop", "yBottom", "quadrants"],
    properties: {
      title: { type: "string" },
      xLeft: { type: "string" },
      xRight: { type: "string" },
      yTop: { type: "string" },
      yBottom: { type: "string" },
      quadrants: {
        type: "object",
        additionalProperties: false,
        required: ["tl", "tr", "bl", "br"],
        properties: {
          tl: { type: "string" },
          tr: { type: "string" },
          bl: { type: "string" },
          br: { type: "string" }
        }
      },
      markerLabel: { type: "string", default: "You" },
      caption: { type: "string" }
    }
  },
  presets: [
    { name: "The Eisenhower matrix", params: {
      title: "The Eisenhower matrix",
      xLeft: "Not urgent",
      xRight: "Urgent",
      yTop: "Important",
      yBottom: "Not important",
      quadrants: { tl: "Schedule it", tr: "Do it now", bl: "Drop it", br: "Delegate it" },
      markerLabel: "This task",
      caption: "Drag your task. Where it lands is what to do with it."
    } },
    { name: "Effort vs reward", params: {
      xLeft: "Low effort",
      xRight: "High effort",
      yTop: "High reward",
      yBottom: "Low reward",
      quadrants: { tl: "Quick win", tr: "Big project", bl: "Maybe later", br: "Don\u2019t bother" },
      markerLabel: "The idea"
    } }
  ],
  build(params, domId) {
    const q2 = params.quadrants || {};
    const tl = esc(q2.tl || ""), tr = esc(q2.tr || ""), bl = esc(q2.bl || ""), br = esc(q2.br || "");
    const xLeft = esc(params.xLeft || ""), xRight = esc(params.xRight || "");
    const yTop = esc(params.yTop || ""), yBottom = esc(params.yBottom || "");
    const markerLabel = esc(params.markerLabel || "You");
    const title = params.title ? `<div class="pg-qp-title">${esc(params.title)}</div>` : "";
    const caption = params.caption ? `<div class="pg-qp-caption">${esc(params.caption)}</div>` : "";
    const html = `<div class="pg-stage">${title}
  <div class="pg-qp-frame">
    <div class="pg-qp-axlabel pg-qp-top">${yTop}</div>
    <div class="pg-qp-mid">
      <div class="pg-qp-axlabel pg-qp-left">${xLeft}</div>
      <div class="pg-qp-plot" data-role="plot">
        <div class="pg-qp-cell pg-qp-tl"><span>${tl}</span></div>
        <div class="pg-qp-cell pg-qp-tr"><span>${tr}</span></div>
        <div class="pg-qp-cell pg-qp-bl"><span>${bl}</span></div>
        <div class="pg-qp-cell pg-qp-br"><span>${br}</span></div>
        <div class="pg-qp-axis pg-qp-vx"></div>
        <div class="pg-qp-axis pg-qp-hz"></div>
        <div class="pg-qp-marker" data-role="marker" tabindex="0"><span>${markerLabel}</span></div>
      </div>
      <div class="pg-qp-axlabel pg-qp-right">${xRight}</div>
    </div>
    <div class="pg-qp-axlabel pg-qp-bottom">${yBottom}</div>
  </div>
  <div class="pg-readout pg-qp-readout">In: <b data-role="readout">\u2014</b></div>
  ${caption}</div>`;
    const css = [
      `#${domId} .pg-qp-title{font-weight:600;margin-bottom:.6rem;color:var(--ink,#e9eef8)}`,
      `#${domId} .pg-qp-frame{max-width:420px;margin:0 auto}`,
      `#${domId} .pg-qp-mid{display:flex;align-items:stretch;gap:.5rem}`,
      `#${domId} .pg-qp-axlabel{color:var(--ink-dim,#cdd6e6);font-size:.82rem;text-align:center}`,
      `#${domId} .pg-qp-top{margin-bottom:.4rem}`,
      `#${domId} .pg-qp-bottom{margin-top:.4rem}`,
      `#${domId} .pg-qp-left,#${domId} .pg-qp-right{display:flex;align-items:center;writing-mode:vertical-rl;max-width:1.4rem}`,
      `#${domId} .pg-qp-left{transform:rotate(180deg)}`,
      `#${domId} .pg-qp-plot{position:relative;flex:1;aspect-ratio:1/1;border:1px solid var(--line,#23304a);border-radius:12px;overflow:hidden;touch-action:none;cursor:crosshair}`,
      `#${domId} .pg-qp-cell{position:absolute;width:50%;height:50%;display:flex;align-items:center;justify-content:center;padding:.4rem;box-sizing:border-box;text-align:center;font-size:.78rem;font-weight:600;color:var(--ink,#e9eef8)}`,
      `#${domId} .pg-qp-cell span{opacity:.85;pointer-events:none}`,
      `#${domId} .pg-qp-tl{top:0;left:0;background:rgba(45,212,191,.07)}`,
      `#${domId} .pg-qp-tr{top:0;right:0;background:rgba(34,211,238,.07)}`,
      `#${domId} .pg-qp-bl{bottom:0;left:0;background:rgba(129,140,248,.07)}`,
      `#${domId} .pg-qp-br{bottom:0;right:0;background:rgba(244,114,182,.07)}`,
      `#${domId} .pg-qp-axis{position:absolute;background:var(--line,#3a4a68)}`,
      `#${domId} .pg-qp-vx{left:50%;top:0;bottom:0;width:1px;transform:translateX(-.5px)}`,
      `#${domId} .pg-qp-hz{top:50%;left:0;right:0;height:1px;transform:translateY(-.5px)}`,
      `#${domId} .pg-qp-marker{position:absolute;left:50%;top:50%;width:30px;height:30px;margin:-15px 0 0 -15px;border-radius:50%;background:#fbbf24;border:2px solid #04060c;box-shadow:0 0 12px rgba(251,191,36,.6);cursor:grab;touch-action:none;z-index:2}`,
      `#${domId} .pg-qp-marker:active{cursor:grabbing}`,
      `#${domId} .pg-qp-marker:focus-visible{outline:2px solid #22d3ee;outline-offset:2px}`,
      `#${domId} .pg-qp-marker span{position:absolute;left:50%;top:calc(100% + 4px);transform:translateX(-50%);white-space:nowrap;font-size:.72rem;font-weight:600;color:var(--ink,#e9eef8);text-shadow:0 1px 3px #04060c;pointer-events:none}`,
      `#${domId} .pg-qp-readout{margin-top:.7rem;text-align:center}`,
      `#${domId} .pg-qp-readout b{color:#fbbf24}`,
      `#${domId} .pg-qp-caption{margin-top:.4rem;font-size:.82rem;color:var(--ink-dim,#cdd6e6);text-align:center}`
    ].join("\n");
    const jsBody = `
var plot=$('[data-role=plot]'), marker=$('[data-role=marker]'), out=$('[data-role=readout]');
if(!plot||!marker||!out)return;
var Q=(CONFIG.quadrants||{});
var labels={tl:Q.tl||'',tr:Q.tr||'',bl:Q.bl||'',br:Q.br||''};
function clamp(v,lo,hi){return v<lo?lo:(v>hi?hi:v);}
function place(px,py){
  var r=plot.getBoundingClientRect();
  if(!r.width||!r.height)return;
  var xPct=clamp((px-r.left)/r.width*100,0,100);
  var yPct=clamp((py-r.top)/r.height*100,0,100);
  marker.style.left=xPct+'%';
  marker.style.top=yPct+'%';
  var key=(yPct<50?(xPct<50?'tl':'tr'):(xPct<50?'bl':'br'));
  out.textContent=labels[key]||'\u2014';
}
var moving=false;
function onMove(e){ if(!moving)return; e.preventDefault(); place(e.clientX,e.clientY); }
function onUp(){ moving=false; window.removeEventListener('pointermove',onMove); window.removeEventListener('pointerup',onUp); }
marker.addEventListener('pointerdown',function(e){
  e.preventDefault();
  moving=true;
  window.addEventListener('pointermove',onMove);
  window.addEventListener('pointerup',onUp);
});
plot.addEventListener('pointerdown',function(e){
  if(e.target===marker||marker.contains(e.target))return;
  place(e.clientX,e.clientY);
});
// Start centred. Exactly 50/50 fails the (<50) test on both axes -> br quadrant.
marker.style.left='50%';
marker.style.top='50%';
out.textContent=labels.br||'\u2014';
`;
    return { html, css, jsBody };
  }
};

// server/playgrounds/checklist.js
var checklist_default = {
  id: "checklist",
  name: "Checklist",
  category: "tool",
  description: "A tappable checklist that tracks your progress as you tick things off.",
  paramsSchema: {
    type: "object",
    additionalProperties: false,
    required: ["items"],
    properties: {
      title: { type: "string" },
      items: { type: "array", minItems: 2, maxItems: 16, items: { type: "string" } },
      doneText: { type: "string", default: "All done. \u{1F389}" },
      caption: { type: "string" }
    }
  },
  presets: [
    { name: "Morning routine", params: {
      title: "Morning routine",
      items: ["Make the bed", "Glass of water", "10 min stretch", "No phone for the first hour", "Plan the top 3 tasks"]
    } },
    { name: "Weekend trip packing", params: {
      title: "Weekend trip packing",
      items: ["Passport / ID", "Charger", "Toothbrush", "Something warm", "Book for the train", "Snacks"],
      caption: "Tick as you pack \u2014 nothing left behind."
    } }
  ],
  build(params, domId) {
    const items = (Array.isArray(params.items) ? params.items : []).filter((s) => typeof s === "string").slice(0, 16);
    const doneText = typeof params.doneText === "string" && params.doneText.trim() ? params.doneText : "All done. \u{1F389}";
    const total = items.length;
    const title = params.title ? `<div class="pg-ck-title">${esc(params.title)}</div>` : "";
    const caption = params.caption ? `<div class="pg-ck-caption">${esc(params.caption)}</div>` : "";
    const rows = items.map((label2, i) => `<button type="button" class="pg-ck-row" data-role="row" role="checkbox" aria-checked="false" data-i="${i}"><span class="pg-ck-box" aria-hidden="true"><svg viewBox="0 0 16 16" class="pg-ck-tick"><path d="M3 8.5l3 3 7-7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></span><span class="pg-ck-label">${esc(label2)}</span></button>`).join("");
    const html = `<div class="pg-stage">` + title + `<div class="pg-ck-list" data-role="list">${rows}</div><div class="pg-ck-bar"><span class="pg-ck-fill" data-role="fill"></span></div><div class="pg-ck-foot"><span class="pg-readout" data-role="count">0 of ${total} done</span><button type="button" class="pg-ck-reset" data-role="reset">Reset</button></div><div class="pg-ck-done" data-role="done" hidden></div>` + caption + `</div>`;
    const css = [
      `#${domId} .pg-ck-title{font-weight:700;font-size:1.05rem;color:var(--ink,#e9eef8);margin-bottom:.7rem}`,
      `#${domId} .pg-ck-list{display:flex;flex-direction:column;gap:.45rem}`,
      `#${domId} .pg-ck-row{display:flex;align-items:center;gap:.7rem;width:100%;text-align:left;font:inherit;cursor:pointer;padding:.6rem .7rem;border-radius:10px;border:1px solid var(--line,#23304a);background:rgba(140,160,200,.05);color:var(--ink,#e9eef8)}`,
      `#${domId} .pg-ck-row:hover{border-color:#2dd4bf66}`,
      `#${domId} .pg-ck-row:focus-visible{outline:2px solid #22d3ee;outline-offset:2px}`,
      `#${domId} .pg-ck-box{flex:0 0 auto;display:flex;align-items:center;justify-content:center;width:22px;height:22px;border-radius:6px;border:1.5px solid #4a5a78;color:#04060c;background:transparent}`,
      `#${domId} .pg-ck-tick{width:15px;height:15px;opacity:0;transform:scale(.6);transition:opacity .15s,transform .15s}`,
      `#${domId} .pg-ck-label{transition:color .15s}`,
      `#${domId} .pg-ck-row.done .pg-ck-box{background:#2dd4bf;border-color:#2dd4bf}`,
      `#${domId} .pg-ck-row.done .pg-ck-tick{opacity:1;transform:scale(1)}`,
      `#${domId} .pg-ck-row.done .pg-ck-label{color:var(--ink-dim,#8b97ac);text-decoration:line-through}`,
      `#${domId} .pg-ck-bar{height:8px;border-radius:99px;background:rgba(140,160,200,.12);overflow:hidden;margin:.9rem 0 .6rem}`,
      `#${domId} .pg-ck-fill{display:block;height:100%;width:0%;border-radius:99px;background:linear-gradient(90deg,#2dd4bf,#22d3ee,#818cf8);transition:width .35s ease}`,
      `#${domId} .pg-ck-foot{display:flex;align-items:center;justify-content:space-between;gap:.7rem}`,
      `#${domId} .pg-ck-reset{font:inherit;font-size:.85rem;cursor:pointer;padding:.35rem .7rem;border-radius:8px;border:1px solid var(--line,#23304a);background:transparent;color:var(--ink-dim,#cdd6e6)}`,
      `#${domId} .pg-ck-reset:hover{border-color:#f472b666;color:var(--ink,#e9eef8)}`,
      `#${domId} .pg-ck-done{margin-top:.8rem;padding:.6rem .8rem;border-radius:10px;border:1px solid #2dd4bf55;background:rgba(45,212,191,.08);color:#2dd4bf;font-weight:600}`,
      `#${domId} .pg-ck-caption{margin-top:.7rem;font-size:.85rem;color:var(--ink-dim,#8b97ac)}`,
      `#${domId}.pg-ck-reduce .pg-ck-fill,#${domId}.pg-ck-reduce .pg-ck-tick{transition:none}`
    ].join("\n");
    const jsBody = `
if(reduced)root.classList.add('pg-ck-reduce');
var rows=$$('[data-role=row]');
var total=rows.length;
if(!total)return;
var fill=$('[data-role=fill]');
var count=$('[data-role=count]');
var done=$('[data-role=done]');
var resetBtn=$('[data-role=reset]');
var doneText=${JSON.stringify(doneText)};
function refresh(){
  var n=0;
  rows.forEach(function(r){ if(r.classList.contains('done'))n++; });
  if(fill)fill.style.width=(total?Math.round(n/total*100):0)+'%';
  if(count)count.textContent=n+' of '+total+' done';
  if(done){
    if(n===total){ done.textContent=doneText; done.hidden=false; }
    else { done.hidden=true; }
  }
}
rows.forEach(function(r){
  r.addEventListener('click',function(){
    var on=r.classList.toggle('done');
    r.setAttribute('aria-checked',on?'true':'false');
    refresh();
  });
});
if(resetBtn)resetBtn.addEventListener('click',function(){
  rows.forEach(function(r){ r.classList.remove('done'); r.setAttribute('aria-checked','false'); });
  refresh();
});
refresh();
`;
    return { html, css, jsBody };
  }
};

// server/playgrounds/toggle-switches.js
var toggle_switches_default = {
  id: "toggle-switches",
  name: "Toggles",
  category: "ui",
  description: "A set of on/off switches with a live summary of how many are on.",
  paramsSchema: {
    type: "object",
    additionalProperties: false,
    required: ["switches"],
    properties: {
      title: { type: "string" },
      switches: {
        type: "array",
        minItems: 2,
        maxItems: 10,
        items: {
          type: "object",
          additionalProperties: false,
          required: ["label"],
          properties: {
            label: { type: "string" },
            on: { type: "boolean", default: false }
          }
        }
      },
      summary: { type: "string" },
      caption: { type: "string" }
    }
  },
  presets: [
    { name: "What makes a good holiday?", params: {
      title: "What makes a good holiday?",
      switches: [
        { label: "Sunshine", on: true },
        { label: "Good food", on: true },
        { label: "Wi-Fi", on: false },
        { label: "Adventure", on: false },
        { label: "Doing nothing", on: true }
      ]
    } },
    { name: "Dealbreakers", params: {
      title: "Dealbreakers",
      switches: [
        { label: "Snores", on: false },
        { label: "Likes the same films", on: true },
        { label: "Tidy", on: false },
        { label: "Good with money", on: true }
      ],
      caption: "Flip the ones that matter to you."
    } }
  ],
  build(params, domId) {
    const sw = (Array.isArray(params.switches) ? params.switches : []).filter((s) => s && typeof s.label === "string").slice(0, 10).map((s) => ({ label: s.label, on: s.on === true }));
    const total = sw.length;
    const summary = typeof params.summary === "string" && params.summary.trim() ? params.summary : "";
    const title = params.title ? `<div class="pg-ts-title">${esc(params.title)}</div>` : "";
    const caption = params.caption ? `<div class="pg-ts-caption">${esc(params.caption)}</div>` : "";
    const rows = sw.map((s, i) => `<button type="button" class="pg-ts-row${s.on ? " on" : ""}" data-role="switch" role="switch" aria-checked="${s.on ? "true" : "false"}" data-i="${i}"><span class="pg-ts-label">${esc(s.label)}</span><span class="pg-ts-track" aria-hidden="true"><span class="pg-ts-knob"></span></span></button>`).join("");
    const html = `<div class="pg-stage">` + title + `<div class="pg-ts-list" data-role="list">${rows}</div><div class="pg-ts-foot"><span class="pg-readout" data-role="count">0 of ${total} on</span></div>` + caption + `</div>`;
    const css = [
      `#${domId} .pg-ts-title{font-weight:700;font-size:1.05rem;color:var(--ink,#e9eef8);margin-bottom:.7rem}`,
      `#${domId} .pg-ts-list{display:flex;flex-direction:column;gap:.45rem}`,
      `#${domId} .pg-ts-row{display:flex;align-items:center;justify-content:space-between;gap:.9rem;width:100%;text-align:left;font:inherit;cursor:pointer;padding:.55rem .8rem;border-radius:10px;border:1px solid var(--line,#23304a);background:rgba(140,160,200,.05);color:var(--ink,#e9eef8)}`,
      `#${domId} .pg-ts-row:hover{border-color:#2dd4bf66}`,
      `#${domId} .pg-ts-row:focus-visible{outline:2px solid #22d3ee;outline-offset:2px}`,
      `#${domId} .pg-ts-row.on{border-color:#2dd4bf55;background:rgba(45,212,191,.08)}`,
      `#${domId} .pg-ts-label{flex:1 1 auto;min-width:0}`,
      `#${domId} .pg-ts-track{flex:0 0 auto;position:relative;display:inline-block;width:44px;height:24px;border-radius:99px;background:rgba(140,160,200,.18);border:1px solid #3a4865;transition:background .2s,border-color .2s}`,
      `#${domId} .pg-ts-row.on .pg-ts-track{background:linear-gradient(90deg,#2dd4bf,#22d3ee);border-color:#22d3ee}`,
      `#${domId} .pg-ts-knob{position:absolute;top:2px;left:2px;width:18px;height:18px;border-radius:50%;background:#e9eef8;box-shadow:0 1px 3px rgba(0,0,0,.4);transition:transform .2s ease}`,
      `#${domId} .pg-ts-row.on .pg-ts-knob{transform:translateX(20px)}`,
      `#${domId} .pg-ts-foot{display:flex;align-items:center;justify-content:flex-end;margin-top:.9rem}`,
      `#${domId} .pg-readout{font-variant-numeric:tabular-nums}`,
      `#${domId} .pg-ts-caption{margin-top:.7rem;font-size:.85rem;color:var(--ink-dim,#8b97ac)}`,
      `#${domId}.pg-ts-reduce .pg-ts-track,#${domId}.pg-ts-reduce .pg-ts-knob{transition:none}`
    ].join("\n");
    const jsBody = `
if(reduced)root.classList.add('pg-ts-reduce');
var rows=$$('[data-role=switch]');
var total=rows.length;
if(!total)return;
var count=$('[data-role=count]');
var tpl=${JSON.stringify(summary)};
function refresh(){
  var n=0;
  rows.forEach(function(r){ if(r.classList.contains('on'))n++; });
  if(count){
    var txt=n+' of '+total+' on';
    if(tpl){
      txt=tpl.replace(/\\{n\\}/g,n).replace(/\\{m\\}/g,total).replace(/\\bN\\b/g,n).replace(/\\bM\\b/g,total);
    }
    count.textContent=txt;
  }
}
rows.forEach(function(r){
  r.addEventListener('click',function(){
    var on=r.classList.toggle('on');
    r.setAttribute('aria-checked',on?'true':'false');
    refresh();
  });
});
refresh();
`;
    return { html, css, jsBody };
  }
};

// server/playgrounds/tabs-panel.js
var tabs_panel_default = {
  id: "tabs-panel",
  name: "Tabs",
  category: "ui",
  description: "Switch between a few short panels of text with tabs \u2014 use to compare a handful of takes on one thing.",
  paramsSchema: {
    type: "object",
    additionalProperties: false,
    required: ["tabs"],
    properties: {
      title: { type: "string" },
      caption: { type: "string" },
      tabs: { type: "array", minItems: 2, maxItems: 6, items: {
        type: "object",
        additionalProperties: false,
        required: ["label", "body"],
        properties: { label: { type: "string" }, body: { type: "string" } }
      } }
    }
  },
  presets: [
    { name: "Three ways to look at it", params: {
      title: "Three ways to look at it",
      tabs: [
        { label: "Optimist", body: "The glass is refillable." },
        { label: "Pessimist", body: "The glass is evaporating." },
        { label: "Engineer", body: "The glass is twice as big as it needs to be." }
      ]
    } },
    { name: "Tea vs coffee vs neither", params: {
      title: "Tea vs coffee vs neither",
      tabs: [
        { label: "Tea", body: "Patient, civilised, faintly smug." },
        { label: "Coffee", body: "Loud, effective, slightly anxious." },
        { label: "Neither", body: "Suspicious, but probably sleeping better than you." }
      ]
    } }
  ],
  build(params, domId) {
    const tabs = (Array.isArray(params.tabs) ? params.tabs : []).filter((t) => t && typeof t === "object").slice(0, 6);
    const title = params.title ? `<div class="pg-tp-title">${esc(params.title)}</div>` : "";
    const caption = params.caption ? `<div class="pg-tp-caption">${esc(params.caption)}</div>` : "";
    const tabsHtml = tabs.map(
      (t, i) => `<button type="button" class="pg-tp-tab${i === 0 ? " active" : ""}" data-role="tab" data-index="${i}" role="tab" aria-selected="${i === 0 ? "true" : "false"}">${esc(t.label)}</button>`
    ).join("");
    const panelsHtml = tabs.map(
      (t, i) => `<div class="pg-tp-panel${i === 0 ? " active" : ""}" data-role="panel" data-index="${i}" role="tabpanel"${i === 0 ? "" : " hidden"}>${esc(t.body)}</div>`
    ).join("");
    const html = `<div class="pg-stage">${title}<div class="pg-tp-bar" role="tablist">${tabsHtml}</div><div class="pg-tp-body">${panelsHtml}</div>${caption}</div>`;
    const css = [
      `#${domId} .pg-tp-title{font-weight:600;color:var(--ink,#e9eef8);margin-bottom:.6rem}`,
      `#${domId} .pg-tp-bar{display:flex;flex-wrap:wrap;gap:.4rem;margin-bottom:.7rem}`,
      `#${domId} .pg-tp-tab{font:inherit;cursor:pointer;padding:.4rem .8rem;border-radius:8px;border:1px solid var(--line,#23304a);background:rgba(140,160,200,.06);color:var(--ink-dim,#cdd6e6);transition:background .18s,border-color .18s,color .18s}`,
      `#${domId} .pg-tp-tab:hover{border-color:#22d3ee88;color:var(--ink,#e9eef8)}`,
      `#${domId} .pg-tp-tab.active{background:rgba(34,211,238,.12);border-color:#22d3ee;color:#22d3ee;font-weight:600}`,
      `#${domId} .pg-tp-body{border:1px solid var(--line,#23304a);border-radius:12px;padding:1rem;background:rgba(140,160,200,.04);min-height:3.2rem}`,
      `#${domId} .pg-tp-panel{color:var(--ink,#e9eef8);line-height:1.5}`,
      `#${domId} .pg-tp-panel[hidden]{display:none}`,
      `#${domId} .pg-tp-caption{margin-top:.6rem;font-size:.85rem;color:var(--ink-dim,#9fb0c8)}`
    ].join("\n");
    const jsBody = `
var tabs=$$('[data-role=tab]');
var panels=$$('[data-role=panel]');
if(!tabs.length||!panels.length)return;
function select(idx){
  tabs.forEach(function(t){
    var on=t.getAttribute('data-index')===String(idx);
    t.classList.toggle('active',on);
    t.setAttribute('aria-selected',on?'true':'false');
  });
  panels.forEach(function(p){
    var on=p.getAttribute('data-index')===String(idx);
    p.classList.toggle('active',on);
    if(on)p.removeAttribute('hidden');else p.setAttribute('hidden','');
  });
}
tabs.forEach(function(t){
  t.addEventListener('click',function(){ select(t.getAttribute('data-index')); });
});
select(0);
`;
    return { html, css, jsBody };
  }
};

// server/playgrounds/gradient-maker.js
var gradient_maker_default = {
  id: "gradient-maker",
  name: "Gradient maker",
  category: "art",
  description: "Build a CSS linear-gradient, tweak the angle live, and copy the code.",
  paramsSchema: {
    type: "object",
    additionalProperties: false,
    required: ["stops"],
    properties: {
      title: { type: "string" },
      stops: {
        type: "array",
        minItems: 2,
        maxItems: 5,
        items: { type: "string", pattern: "^#[0-9a-fA-F]{3,8}$" }
      },
      angle: { type: "number", default: 120, minimum: 0, maximum: 360 },
      caption: { type: "string" }
    }
  },
  presets: [
    { name: "Sunset", params: { title: "Sunset", stops: ["#f9a26c", "#f76b8a", "#5b3758"], angle: 120 } },
    { name: "Aurora", params: { title: "Aurora", stops: ["#2dd4bf", "#22d3ee", "#818cf8"], angle: 100 } }
  ],
  build(params, domId) {
    const hex = /^#[0-9a-fA-F]{3,8}$/;
    let stops = Array.isArray(params.stops) ? params.stops.filter((s) => hex.test(String(s))) : [];
    stops = stops.slice(0, 5);
    if (stops.length < 2) stops = ["#2dd4bf", "#818cf8"];
    let angle = Math.round(Number(params.angle));
    if (!Number.isFinite(angle)) angle = 120;
    angle = Math.max(0, Math.min(360, angle));
    const title = params.title ? `<div class="pg-gm-title">${esc(params.title)}</div>` : "";
    const caption = params.caption ? `<div class="pg-gm-caption">${esc(params.caption)}</div>` : "";
    const swatches = stops.map((s) => `<span class="pg-gm-swatch" style="background:${esc(s)}" title="${esc(s)}"></span>`).join("");
    const html = `<div class="pg-stage">${title}<div class="pg-gm-preview" data-role="preview"></div><div class="pg-gm-swatches">${swatches}</div><div class="pg-controls"><div class="pg-row"><label><b>Angle</b> <span class="pg-readout" data-role="angle-out">${angle}\xB0</span></label><input type="range" data-role="angle" min="0" max="360" step="1" value="${angle}"></div></div><div class="pg-gm-code"><code data-role="code"></code><button type="button" class="pg-gm-copy" data-role="copy">Copy</button></div>${caption}</div>`;
    const css = [
      `#${domId} .pg-gm-title{font-weight:700;font-size:1.05rem;margin-bottom:.6rem;color:var(--ink,#e9eef8)}`,
      `#${domId} .pg-gm-preview{height:170px;border-radius:14px;border:1px solid var(--line,#23304a)}`,
      `#${domId} .pg-gm-swatches{display:flex;gap:.4rem;margin:.6rem 0 .2rem}`,
      `#${domId} .pg-gm-swatch{width:26px;height:26px;border-radius:7px;border:1px solid rgba(255,255,255,.15)}`,
      `#${domId} .pg-controls{margin:.7rem 0 .6rem}`,
      `#${domId} .pg-row label{display:flex;align-items:center;gap:.5rem;color:var(--ink-dim,#cdd6e6);font-size:.9rem}`,
      `#${domId} .pg-readout{color:#22d3ee;font-variant-numeric:tabular-nums;font-weight:600}`,
      `#${domId} input[type=range]{width:100%;accent-color:#22d3ee;margin-top:.35rem}`,
      `#${domId} .pg-gm-code{display:flex;align-items:center;gap:.6rem;background:rgba(140,160,200,.06);border:1px solid var(--line,#23304a);border-radius:10px;padding:.55rem .7rem}`,
      `#${domId} .pg-gm-code code{flex:1;min-width:0;overflow-x:auto;white-space:nowrap;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:.82rem;color:var(--ink,#e9eef8)}`,
      `#${domId} .pg-gm-copy{flex:none;border:1px solid #2dd4bf66;background:rgba(45,212,191,.12);color:#2dd4bf;border-radius:8px;padding:.4rem .8rem;cursor:pointer;font:inherit;font-weight:600}`,
      `#${domId} .pg-gm-copy:hover{background:rgba(45,212,191,.2)}`,
      `#${domId} .pg-gm-copy.copied{color:#fbbf24;border-color:#fbbf2466;background:rgba(251,191,36,.12)}`,
      `#${domId} .pg-gm-caption{margin-top:.6rem;color:var(--ink-dim,#cdd6e6);font-size:.85rem}`
    ].join("\n");
    const jsBody = `
var stops=${JSON.stringify(stops)};
var preview=$('[data-role=preview]'), code=$('[data-role=code]');
var slider=$('[data-role=angle]'), out=$('[data-role=angle-out]'), copy=$('[data-role=copy]');
if(!preview||!code||!slider)return;
function gradient(deg){return 'linear-gradient('+deg+'deg, '+stops.join(', ')+')';}
function render(){
  var deg=parseInt(slider.value,10)||0;
  var g=gradient(deg);
  preview.style.background=g;
  code.textContent='background: '+g+';';
  if(out)out.textContent=deg+'\\u00B0';
}
slider.addEventListener('input',render);
if(copy){
  copy.addEventListener('click',function(){
    var text=code.textContent;
    function done(){copy.classList.add('copied');copy.textContent='Copied';setTimeout(function(){copy.classList.remove('copied');copy.textContent='Copy';},1400);}
    if(navigator.clipboard&&navigator.clipboard.writeText){navigator.clipboard.writeText(text).then(done,done);}
    else{done();}
  });
}
render();
`;
    return { html, css, jsBody };
  }
};

// server/playgrounds/colour-harmony.js
var colour_harmony_default = {
  id: "colour-harmony",
  name: "Colour harmony",
  category: "art",
  description: "Pick a hue and see colours that go with it \u2014 complementary, analogous and triadic.",
  paramsSchema: {
    type: "object",
    additionalProperties: false,
    required: ["hue"],
    properties: {
      title: { type: "string" },
      hue: { type: "number", default: 190, minimum: 0, maximum: 360 },
      caption: { type: "string" }
    }
  },
  presets: [
    { name: "Find a palette", params: { title: "Find a palette", hue: 190 } },
    { name: "Warm start", params: { title: "Warm start", hue: 25, caption: "Reds and oranges, plus what sits opposite." } }
  ],
  build(params, domId) {
    let hue = Number(params.hue);
    if (!isFinite(hue)) hue = 190;
    hue = Math.max(0, Math.min(360, Math.round(hue)));
    const title = params.title ? `<div class="pg-ch-title">${esc(params.title)}</div>` : "";
    const caption = params.caption ? `<div class="pg-ch-caption">${esc(params.caption)}</div>` : "";
    const html = `<div class="pg-stage">${title}
  <div class="pg-controls">
    <div class="pg-row">
      <label class="pg-field"><b>Hue</b>
        <input type="range" min="0" max="360" step="1" value="${hue}" data-role="hue" aria-label="Base hue">
      </label>
      <span class="pg-readout" data-role="hue-out">${hue}\xB0</span>
    </div>
  </div>
  <div class="pg-ch-base">
    <div class="pg-ch-base-swatch" data-role="base-swatch"></div>
    <div class="pg-ch-base-meta">
      <span class="pg-ch-base-label">Base</span>
      <span class="pg-ch-hex" data-role="base-hex">#000000</span>
    </div>
  </div>
  <div class="pg-ch-rows" data-role="rows"></div>
  ${caption}
</div>`;
    const css = [
      `#${domId} .pg-ch-title{font-weight:700;margin-bottom:.6rem;color:#e9eef8}`,
      `#${domId} .pg-ch-caption{margin-top:.8rem;font-size:.85rem;color:#9fb0c8}`,
      `#${domId} .pg-controls{margin-bottom:.9rem}`,
      `#${domId} .pg-row{display:flex;align-items:center;gap:.8rem}`,
      `#${domId} .pg-field{flex:1;display:flex;align-items:center;gap:.6rem;color:#cdd6e6}`,
      `#${domId} .pg-field b{font-weight:600;white-space:nowrap}`,
      `#${domId} .pg-field input[type=range]{flex:1;min-width:0}`,
      `#${domId} .pg-readout{font-variant-numeric:tabular-nums;font-weight:600;color:#22d3ee;min-width:3.2ch;text-align:right}`,
      `#${domId} .pg-ch-base{display:flex;align-items:center;gap:.8rem;margin-bottom:1rem}`,
      `#${domId} .pg-ch-base-swatch{width:64px;height:64px;border-radius:12px;border:1px solid #23304a;flex:none}`,
      `#${domId} .pg-ch-base-meta{display:flex;flex-direction:column;gap:.15rem}`,
      `#${domId} .pg-ch-base-label{font-size:.75rem;text-transform:uppercase;letter-spacing:.06em;color:#9fb0c8}`,
      `#${domId} .pg-ch-hex{font-variant-numeric:tabular-nums;font-weight:600;color:#e9eef8}`,
      `#${domId} .pg-ch-rows{display:flex;flex-direction:column;gap:.9rem}`,
      `#${domId} .pg-ch-rowname{font-size:.78rem;text-transform:uppercase;letter-spacing:.06em;color:#9fb0c8;margin-bottom:.35rem}`,
      `#${domId} .pg-ch-swatches{display:flex;gap:.6rem;flex-wrap:wrap}`,
      `#${domId} .pg-ch-sw{flex:1;min-width:96px;border-radius:10px;border:1px solid #23304a;overflow:hidden}`,
      `#${domId} .pg-ch-chip{height:54px}`,
      `#${domId} .pg-ch-swhex{display:block;padding:.3rem .4rem;font-size:.72rem;font-variant-numeric:tabular-nums;color:#cdd6e6;background:rgba(140,160,200,.06);text-align:center}`
    ].join("\n");
    const jsBody = `
var slider = $('[data-role=hue]');
if(!slider) return;
var hueOut = $('[data-role=hue-out]');
var baseSwatch = $('[data-role=base-swatch]');
var baseHex = $('[data-role=base-hex]');
var rows = $('[data-role=rows]');
var S = 70, L = 55;

function hslToHex(h, s, l){
  h = ((h % 360) + 360) % 360;
  s /= 100; l /= 100;
  var c = (1 - Math.abs(2 * l - 1)) * s;
  var x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  var m = l - c / 2;
  var r = 0, g = 0, b = 0;
  if(h < 60){ r = c; g = x; }
  else if(h < 120){ r = x; g = c; }
  else if(h < 180){ g = c; b = x; }
  else if(h < 240){ g = x; b = c; }
  else if(h < 300){ r = x; b = c; }
  else { r = c; b = x; }
  function hx(v){ var n = Math.round((v + m) * 255); return ('0' + n.toString(16)).slice(-2); }
  return '#' + hx(r) + hx(g) + hx(b);
}

function makeSwatch(h){
  var hex = hslToHex(h, S, L);
  var sw = document.createElement('div');
  sw.className = 'pg-ch-sw';
  var chip = document.createElement('div');
  chip.className = 'pg-ch-chip';
  chip.style.background = hex;
  var label = document.createElement('span');
  label.className = 'pg-ch-swhex';
  label.textContent = hex;
  sw.appendChild(chip);
  sw.appendChild(label);
  return sw;
}

function makeRow(name, hues){
  var wrap = document.createElement('div');
  var nm = document.createElement('div');
  nm.className = 'pg-ch-rowname';
  nm.textContent = name;
  var strip = document.createElement('div');
  strip.className = 'pg-ch-swatches';
  hues.forEach(function(h){ strip.appendChild(makeSwatch(h)); });
  wrap.appendChild(nm);
  wrap.appendChild(strip);
  return wrap;
}

function render(){
  var h = Number(slider.value) || 0;
  if(hueOut) hueOut.textContent = h + '\\u00B0';
  var baseHexVal = hslToHex(h, S, L);
  if(baseSwatch) baseSwatch.style.background = baseHexVal;
  if(baseHex) baseHex.textContent = baseHexVal;
  if(!rows) return;
  rows.textContent = '';
  rows.appendChild(makeRow('Complementary', [h + 180]));
  rows.appendChild(makeRow('Analogous', [h - 30, h + 30]));
  rows.appendChild(makeRow('Triadic', [h - 120, h + 120]));
}

slider.addEventListener('input', render);
render();
`;
    return { html, css, jsBody };
  }
};

// server/playgrounds/beat-sequencer.js
var beat_sequencer_default = {
  id: "beat-sequencer",
  name: "Beat sequencer",
  category: "music",
  description: "Tap cells to build a rhythm and watch a playhead run it \u2014 purely visual, no sound.",
  paramsSchema: {
    type: "object",
    additionalProperties: false,
    required: ["tracks"],
    properties: {
      title: { type: "string" },
      tracks: {
        type: "array",
        minItems: 2,
        maxItems: 5,
        items: { type: "string" },
        default: ["Kick", "Snare", "Hi-hat"]
      },
      steps: { type: "number", default: 16, minimum: 8, maximum: 16 },
      bpm: { type: "number", default: 100, minimum: 30, maximum: 240 },
      caption: { type: "string" }
    }
  },
  presets: [
    { name: "Four on the floor", params: { title: "Four on the floor", tracks: ["Kick", "Snare", "Hi-hat"], steps: 16, bpm: 120 } },
    { name: "Basic backbeat", params: { title: "Basic backbeat", tracks: ["Kick", "Snare", "Hi-hat"], steps: 16, bpm: 100 } }
  ],
  build(params, domId) {
    let tracks = Array.isArray(params.tracks) ? params.tracks.filter((t) => t != null).map((t) => String(t)) : [];
    if (tracks.length < 2) tracks = ["Kick", "Snare", "Hi-hat"];
    tracks = tracks.slice(0, 5);
    const steps = Math.max(8, Math.min(16, Math.round(params.steps || 16)));
    const bpm = Math.max(30, Math.min(240, Math.round(params.bpm || 100)));
    const title = params.title ? `<div class="pg-bs-title">${esc(params.title)}</div>` : "";
    const caption = params.caption ? `<div class="pg-bs-caption">${esc(params.caption)}</div>` : "";
    const rows = tracks.map((label2) => {
      const cells = [];
      for (let s = 0; s < steps; s++) {
        cells.push(`<button type="button" class="pg-bs-cell" data-role="cell" data-step="${s}" aria-pressed="false"></button>`);
      }
      return `<div class="pg-bs-row"><span class="pg-bs-label">${esc(label2)}</span><div class="pg-bs-cells">${cells.join("")}</div></div>`;
    }).join("");
    const html = `<div class="pg-stage">${title}<div class="pg-bs-grid" data-role="grid" style="--steps:${steps}">${rows}</div><div class="pg-controls"><div class="pg-row"><button type="button" class="pg-bs-btn" data-role="play">Play</button><span class="pg-readout pg-bs-bpm">${bpm} BPM</span></div></div>${caption}</div>`;
    const css = [
      `#${domId} .pg-bs-title{font-weight:700;font-size:1.05rem;margin-bottom:.6rem;color:#e9eef8}`,
      `#${domId} .pg-bs-grid{display:flex;flex-direction:column;gap:.4rem}`,
      `#${domId} .pg-bs-row{display:flex;align-items:center;gap:.6rem}`,
      `#${domId} .pg-bs-label{flex:0 0 4.5rem;font-size:.8rem;color:#cdd6e6;text-align:right;font-weight:600}`,
      `#${domId} .pg-bs-cells{flex:1;display:grid;grid-template-columns:repeat(var(--steps),1fr);gap:3px}`,
      `#${domId} .pg-bs-cell{aspect-ratio:1;min-width:0;border:1px solid #23304a;border-radius:5px;background:rgba(140,160,200,.06);cursor:pointer;padding:0;transition:background .15s,border-color .15s,transform .12s}`,
      `#${domId} .pg-bs-cell:hover{border-color:#2dd4bf66}`,
      `#${domId} .pg-bs-cell.on{background:#22d3ee;border-color:#22d3ee;box-shadow:0 0 8px #22d3ee55}`,
      `#${domId} .pg-bs-cell.cur{border-color:#fbbf24;background:rgba(251,191,36,.18)}`,
      `#${domId} .pg-bs-cell.on.cur{background:#fbbf24;border-color:#fbbf24;box-shadow:0 0 12px #fbbf24aa}`,
      `#${domId} .pg-bs-cell.on.cur{transform:scale(1.18)}`,
      `#${domId}.pg-bs-reduce .pg-bs-cell{transition:none}`,
      `#${domId} .pg-controls{margin-top:.8rem}`,
      `#${domId} .pg-row{display:flex;align-items:center;gap:.8rem}`,
      `#${domId} .pg-bs-btn{border:1px solid #2dd4bf;background:rgba(45,212,191,.12);color:#2dd4bf;font:inherit;font-weight:600;padding:.4rem 1.1rem;border-radius:8px;cursor:pointer}`,
      `#${domId} .pg-bs-btn:hover{background:rgba(45,212,191,.2)}`,
      `#${domId} .pg-bs-btn.playing{border-color:#f472b6;background:rgba(244,114,182,.14);color:#f472b6}`,
      `#${domId} .pg-readout{font-variant-numeric:tabular-nums;color:#94a3b8;font-size:.85rem}`,
      `#${domId} .pg-bs-caption{margin-top:.6rem;font-size:.8rem;color:#94a3b8}`
    ].join("\n");
    const jsBody = `
var STEPS=${steps}, BPM=${bpm};
if(reduced)root.classList.add('pg-bs-reduce');
var grid=$('[data-role=grid]'), btn=$('[data-role=play]');
if(!grid||!btn)return;
var cells=$$('[data-role=cell]');
cells.forEach(function(c){
  c.addEventListener('click',function(){
    var on=c.classList.toggle('on');
    c.setAttribute('aria-pressed',on?'true':'false');
  });
});
function clearTimer(){ if(root._seqTimer){clearInterval(root._seqTimer);root._seqTimer=null;} }
function clearCur(){ cells.forEach(function(c){c.classList.remove('cur');}); }
function paint(col){
  clearCur();
  cells.forEach(function(c){
    if(parseInt(c.getAttribute('data-step'),10)===col)c.classList.add('cur');
  });
}
clearTimer();
function stop(){
  clearTimer();
  clearCur();
  btn.classList.remove('playing');
  btn.textContent='Play';
}
function start(){
  clearTimer();
  var col=0;
  btn.classList.add('playing');
  btn.textContent='Stop';
  paint(col);
  root._seqTimer=setInterval(function(){
    col=(col+1)%STEPS;
    paint(col);
  }, 60000/BPM/4);
}
btn.addEventListener('click',function(){
  if(root._seqTimer)stop(); else start();
});
`;
    return { html, css, jsBody };
  }
};

// server/playgrounds/keyboard-notes.js
var keyboard_notes_default = {
  id: "keyboard-notes",
  name: "Piano keys",
  category: "music",
  description: "A one-octave keyboard that highlights a chord or scale; tap keys to explore (no sound).",
  paramsSchema: {
    type: "object",
    additionalProperties: false,
    required: ["highlight"],
    properties: {
      title: { type: "string" },
      highlight: { type: "array", maxItems: 12, items: { type: "string" } },
      label: { type: "string" },
      caption: { type: "string" }
    }
  },
  presets: [
    { name: "A C major chord", params: { title: "A C major chord", highlight: ["C", "E", "G"], label: "C major", caption: "Three notes, one happy chord. Tap any key to add your own." } },
    { name: "The C major scale", params: { title: "The C major scale", highlight: ["C", "D", "E", "F", "G", "A", "B"], label: "C major scale", caption: "All the white keys, no sharps or flats \u2014 the friendly scale." } }
  ],
  build(params, domId) {
    const WHITES = ["C", "D", "E", "F", "G", "A", "B"];
    const BLACKS = [
      { note: "C#", after: 0 },
      { note: "D#", after: 1 },
      { note: "F#", after: 3 },
      { note: "G#", after: 4 },
      { note: "A#", after: 5 }
    ];
    const known = /* @__PURE__ */ new Set([...WHITES, ...BLACKS.map((b) => b.note)]);
    const norm = (s) => String(s == null ? "" : s).trim().toUpperCase().replace("\u266F", "#");
    const highlight = (Array.isArray(params.highlight) ? params.highlight : []).map(norm).filter((n) => known.has(n));
    const hiSet = new Set(highlight);
    const title = params.title ? `<div class="pg-kb-title">${esc(params.title)}</div>` : "";
    const label2 = params.label ? `<span class="pg-kb-label" data-role="label">${esc(params.label)}</span>` : "";
    const caption = params.caption ? `<div class="pg-kb-caption">${esc(params.caption)}</div>` : "";
    const whiteHtml = WHITES.map((n) => `<button type="button" class="pg-kb-key pg-kb-white${hiSet.has(n) ? " on" : ""}" data-role="key" data-note="${esc(n)}" aria-pressed="${hiSet.has(n) ? "true" : "false"}"><span class="pg-kb-name">${esc(n)}</span></button>`).join("");
    const blackHtml = BLACKS.map((b) => {
      const left = (b.after + 1) / WHITES.length * 100;
      return `<button type="button" class="pg-kb-key pg-kb-black${hiSet.has(b.note) ? " on" : ""}" data-role="key" data-note="${esc(b.note)}" aria-pressed="${hiSet.has(b.note) ? "true" : "false"}" style="left:${left.toFixed(4)}%"><span class="pg-kb-name">${esc(b.note)}</span></button>`;
    }).join("");
    const html = `<div class="pg-stage">` + title + `<div class="pg-kb-readout"><span class="pg-kb-tag">Highlighted</span>` + label2 + `<span class="pg-kb-list" data-role="list">\u2014</span></div><div class="pg-kb-board" data-role="board"><div class="pg-kb-whites">${whiteHtml}</div><div class="pg-kb-blacks">${blackHtml}</div></div>` + caption + `</div>`;
    const css = [
      `#${domId} .pg-kb-title{font-weight:600;color:var(--ink,#e9eef8);margin-bottom:.5rem}`,
      `#${domId} .pg-kb-readout{display:flex;flex-wrap:wrap;align-items:center;gap:.45rem;margin-bottom:.7rem;font-size:.92rem}`,
      `#${domId} .pg-kb-tag{color:var(--ink-dim,#9fb0c8);text-transform:uppercase;letter-spacing:.05em;font-size:.72rem}`,
      `#${domId} .pg-kb-label{padding:.1rem .5rem;border-radius:999px;border:1px solid #2dd4bf66;background:rgba(45,212,191,.12);color:#2dd4bf;font-weight:600}`,
      `#${domId} .pg-kb-list{color:var(--ink,#e9eef8);font-weight:600;font-variant-numeric:tabular-nums}`,
      `#${domId} .pg-kb-board{position:relative;width:100%;max-width:520px;aspect-ratio:7 / 4;user-select:none}`,
      `#${domId} .pg-kb-whites{display:flex;height:100%;gap:0}`,
      `#${domId} .pg-kb-blacks{position:absolute;inset:0;pointer-events:none}`,
      `#${domId} .pg-kb-key{font:inherit;cursor:pointer;padding:0;display:flex;align-items:flex-end;justify-content:center;transition:background .12s,box-shadow .12s,color .12s}`,
      `#${domId} .pg-kb-white{flex:1 1 0;height:100%;border:1px solid #23304a;border-radius:0 0 6px 6px;background:#f3f6fb;color:#1a2436}`,
      `#${domId} .pg-kb-white+.pg-kb-white{border-left:0}`,
      `#${domId} .pg-kb-white:first-child{border-radius:0 0 6px 6px}`,
      `#${domId} .pg-kb-white .pg-kb-name{padding-bottom:.45rem;font-size:.78rem;font-weight:600;opacity:.55}`,
      `#${domId} .pg-kb-black{position:absolute;top:0;width:9%;height:62%;transform:translateX(-50%);border:1px solid #000;border-radius:0 0 5px 5px;background:#10151f;color:#cdd6e6;pointer-events:auto;box-shadow:0 2px 4px rgba(0,0,0,.5);z-index:2}`,
      `#${domId} .pg-kb-black .pg-kb-name{padding-bottom:.3rem;font-size:.62rem;font-weight:600;opacity:.5}`,
      `#${domId} .pg-kb-white.on{background:#22d3ee;color:#04060c;box-shadow:inset 0 0 0 2px #22d3ee}`,
      `#${domId} .pg-kb-black.on{background:#818cf8;color:#04060c}`,
      `#${domId} .pg-kb-white.on .pg-kb-name,#${domId} .pg-kb-black.on .pg-kb-name{opacity:.9}`,
      `#${domId} .pg-kb-key:focus-visible{outline:2px solid #fbbf24;outline-offset:1px}`,
      `#${domId} .pg-kb-caption{margin-top:.6rem;color:var(--ink-dim,#9fb0c8);font-size:.88rem}`
    ].join("\n");
    const jsBody = `
var list=$('[data-role=list]');
function refresh(){
  if(!list)return;
  var on=[];
  $$('[data-role=key].on').forEach(function(k){on.push(k.getAttribute('data-note'));});
  list.textContent=on.length?on.join('  \xB7  '):'none \u2014 tap a key';
}
$$('[data-role=key]').forEach(function(key){
  key.addEventListener('click',function(){
    var on=key.classList.toggle('on');
    key.setAttribute('aria-pressed',on?'true':'false');
    refresh();
  });
});
refresh();
`;
    return { html, css, jsBody };
  }
};

// server/playgrounds/caesar-cipher.js
var caesar_cipher_default = {
  id: "caesar-cipher",
  name: "Caesar cipher",
  category: "language",
  description: "Shift the alphabet to encode or decode a message \u2014 slide the dial and watch the text change.",
  paramsSchema: {
    type: "object",
    additionalProperties: false,
    required: [],
    properties: {
      title: { type: "string" },
      text: { type: "string", default: "" },
      shift: { type: "number", default: 3, minimum: 0, maximum: 25 },
      caption: { type: "string" }
    }
  },
  presets: [
    { name: "Shift by three (Caesar's own)", params: { text: "Veni vidi vici", shift: 3 } },
    { name: "Crack the code", params: { text: "Khoor zruog", shift: 3, caption: "Slide the shift until it reads straight." } }
  ],
  build(params, domId) {
    const text2 = typeof params.text === "string" ? params.text : "";
    const shift = Math.max(0, Math.min(25, Math.round(Number(params.shift) || 0)));
    const title = params.title ? `<div class="pg-cc-title">${esc(params.title)}</div>` : "";
    const caption = params.caption ? `<div class="pg-cc-caption">${esc(params.caption)}</div>` : "";
    const html = `<div class="pg-stage">${title}<div class="pg-controls"><div class="pg-field pg-cc-textfield"><label><b>Message</b></label><input type="text" data-role="text" value="${esc(text2)}" placeholder="Type a message\u2026" autocomplete="off" spellcheck="false"></div><div class="pg-row pg-cc-shiftrow"><label><b>Shift</b></label><input type="range" data-role="shift" min="0" max="25" step="1" value="${shift}"><span class="pg-readout" data-role="shiftval">${shift}</span></div></div><div class="pg-cc-out"><label><b>Output</b></label><output class="pg-readout pg-cc-result" data-role="out" aria-live="polite"></output></div><div class="pg-cc-hint">Decode by shifting <span data-role="dec">${(26 - shift) % 26}</span> the other way.</div>` + caption + `</div>`;
    const css = [
      `#${domId} .pg-cc-title{font-weight:700;margin-bottom:.6rem;color:#e9eef8}`,
      `#${domId} .pg-controls{display:flex;flex-direction:column;gap:.7rem}`,
      `#${domId} .pg-cc-textfield label,#${domId} .pg-cc-shiftrow label,#${domId} .pg-cc-out label{display:block;margin-bottom:.3rem;color:#cdd6e6;font-size:.9rem}`,
      `#${domId} input[type=text]{width:100%;box-sizing:border-box;padding:.55rem .7rem;border-radius:10px;border:1px solid #23304a;background:rgba(140,160,200,.06);color:#e9eef8;font:inherit}`,
      `#${domId} input[type=text]:focus{outline:none;border-color:#22d3ee}`,
      `#${domId} .pg-cc-shiftrow{display:flex;align-items:center;gap:.6rem;flex-wrap:wrap}`,
      `#${domId} .pg-cc-shiftrow label{margin:0;flex:0 0 auto}`,
      `#${domId} input[type=range]{flex:1 1 140px;accent-color:#2dd4bf;min-width:120px}`,
      `#${domId} .pg-readout{font-variant-numeric:tabular-nums;color:#2dd4bf;font-weight:700}`,
      `#${domId} .pg-cc-shiftrow .pg-readout{min-width:2ch;text-align:right}`,
      `#${domId} .pg-cc-out{margin-top:.8rem}`,
      `#${domId} .pg-cc-result{display:block;width:100%;box-sizing:border-box;padding:.6rem .7rem;border-radius:10px;border:1px solid #23304a;background:rgba(34,211,238,.06);color:#22d3ee;font-family:ui-monospace,Menlo,Consolas,monospace;font-weight:600;min-height:1.4em;white-space:pre-wrap;word-break:break-word}`,
      `#${domId} .pg-cc-hint{margin-top:.6rem;font-size:.85rem;color:#9fb0c8}`,
      `#${domId} .pg-cc-hint span{color:#fbbf24;font-weight:700}`,
      `#${domId} .pg-cc-caption{margin-top:.5rem;font-size:.85rem;color:#cdd6e6;font-style:italic}`
    ].join("\n");
    const jsBody = `
var input=$('[data-role=text]');
var slider=$('[data-role=shift]');
var shiftVal=$('[data-role=shiftval]');
var out=$('[data-role=out]');
var dec=$('[data-role=dec]');
if(!input||!slider||!out)return;
function shiftChar(ch,n){
  var c=ch.charCodeAt(0);
  if(c>=65&&c<=90)return String.fromCharCode((c-65+n)%26+65);
  if(c>=97&&c<=122)return String.fromCharCode((c-97+n)%26+97);
  return ch;
}
function render(){
  var n=((parseInt(slider.value,10)||0)%26+26)%26;
  if(shiftVal)shiftVal.textContent=n;
  if(dec)dec.textContent=(26-n)%26;
  var src=input.value;
  var res='';
  for(var i=0;i<src.length;i++)res+=shiftChar(src.charAt(i),n);
  out.textContent=res;
}
input.addEventListener('input',render);
slider.addEventListener('input',render);
render();
`;
    return { html, css, jsBody };
  }
};

// server/playgrounds/nato-phonetic.js
var nato_phonetic_default = {
  id: "nato-phonetic",
  name: "NATO alphabet",
  category: "language",
  description: "Spell anything out in the NATO phonetic alphabet \u2014 type and watch each letter become its codeword.",
  paramsSchema: {
    type: "object",
    additionalProperties: false,
    required: ["placeholder"],
    properties: {
      title: { type: "string" },
      placeholder: { type: "string", default: "Type your name\u2026" },
      caption: { type: "string" }
    }
  },
  presets: [
    { name: "Spell your name", params: { title: "Spell your name", placeholder: "Type your name\u2026", caption: "How a radio operator would read it back to you." } },
    { name: "Read out a postcode", params: { title: "Read out a postcode", placeholder: "e.g. SW1A 1AA", caption: "The clear way to dictate a postcode over a crackly line." } }
  ],
  build(params, domId) {
    const title = params.title ? `<div class="pg-nato-title">${esc(params.title)}</div>` : "";
    const caption = params.caption ? `<div class="pg-nato-caption">${esc(params.caption)}</div>` : "";
    const placeholder = esc(params.placeholder || "Type your name\u2026");
    const html = `<div class="pg-stage">${title}<div class="pg-field"><label><b>Your text</b></label><input type="text" data-role="in" placeholder="${placeholder}" autocomplete="off" spellcheck="false"></div><div class="pg-readout pg-nato-out" data-role="out" aria-live="polite"></div>` + caption + `</div>`;
    const css = [
      `#${domId} .pg-nato-title{font-weight:700;font-size:1.05rem;margin-bottom:.6rem;color:#e9eef8}`,
      `#${domId} .pg-field input{width:100%;box-sizing:border-box;padding:.6rem .75rem;border-radius:10px;border:1px solid #23304a;background:rgba(140,160,200,.06);color:#e9eef8;font:inherit}`,
      `#${domId} .pg-field input:focus{outline:none;border-color:#22d3ee}`,
      `#${domId} .pg-nato-out{display:flex;flex-wrap:wrap;gap:.4rem;margin-top:.8rem;min-height:1.5rem;align-items:flex-start}`,
      `#${domId} .pg-nato-chip{display:inline-flex;flex-direction:column;align-items:center;gap:.1rem;padding:.35rem .6rem;border-radius:9px;border:1px solid #2dd4bf55;background:rgba(45,212,191,.08);line-height:1.15}`,
      `#${domId} .pg-nato-chip .pg-nato-src{font-size:.7rem;color:#22d3ee;font-weight:700;text-transform:uppercase;letter-spacing:.05em}`,
      `#${domId} .pg-nato-chip .pg-nato-word{font-size:.95rem;color:#e9eef8;font-weight:600}`,
      `#${domId} .pg-nato-gap{flex-basis:100%;height:0}`,
      `#${domId} .pg-nato-empty{color:#94a3b8;font-style:italic}`,
      `#${domId} .pg-nato-caption{margin-top:.8rem;font-size:.85rem;color:#94a3b8}`
    ].join("\n");
    const jsBody = `
var MAP={A:'Alpha',B:'Bravo',C:'Charlie',D:'Delta',E:'Echo',F:'Foxtrot',G:'Golf',H:'Hotel',I:'India',J:'Juliett',K:'Kilo',L:'Lima',M:'Mike',N:'November',O:'Oscar',P:'Papa',Q:'Quebec',R:'Romeo',S:'Sierra',T:'Tango',U:'Uniform',V:'Victor',W:'Whiskey',X:'X-ray',Y:'Yankee',Z:'Zulu','0':'Zero','1':'One','2':'Two','3':'Three','4':'Four','5':'Five','6':'Six','7':'Seven','8':'Eight','9':'Nine'};
var input=$('[data-role=in]'), out=$('[data-role=out]');
if(!input||!out)return;
function render(){
  out.textContent='';
  var s=input.value||'';
  var any=false;
  for(var i=0;i<s.length;i++){
    var ch=s[i];
    if(ch===' '||ch==='\\t'){
      if(out.lastChild && out.lastChild.className!=='pg-nato-gap'){
        var gap=document.createElement('span');
        gap.className='pg-nato-gap';
        out.appendChild(gap);
      }
      continue;
    }
    var key=ch.toUpperCase();
    var word=MAP[key];
    if(!word)continue;
    any=true;
    var chip=document.createElement('span');
    chip.className='pg-nato-chip';
    var src=document.createElement('span');
    src.className='pg-nato-src';
    src.textContent=ch;
    var w=document.createElement('span');
    w.className='pg-nato-word';
    w.textContent=word;
    chip.appendChild(src);
    chip.appendChild(w);
    out.appendChild(chip);
  }
  if(!any){
    var e=document.createElement('span');
    e.className='pg-nato-empty';
    e.textContent='\u2026';
    out.appendChild(e);
  }
}
input.addEventListener('input',render);
render();
`;
    return { html, css, jsBody };
  }
};

// server/playgrounds/chronology-game.js
var chronology_game_default = {
  id: "chronology-game",
  name: "Put it in order",
  category: "history",
  description: "Arrange a shuffled list of events into the right chronological order, then check your answer.",
  paramsSchema: {
    type: "object",
    additionalProperties: false,
    required: ["events"],
    properties: {
      title: { type: "string" },
      caption: { type: "string" },
      events: {
        type: "array",
        minItems: 3,
        maxItems: 8,
        items: {
          type: "object",
          additionalProperties: false,
          required: ["label", "year"],
          properties: { label: { type: "string" }, year: { type: "number" } }
        }
      }
    }
  },
  presets: [
    { name: "Order these inventions", params: {
      title: "Order these inventions",
      caption: "Oldest at the top, newest at the bottom.",
      events: [
        { label: "Printing press", year: 1440 },
        { label: "Telephone", year: 1876 },
        { label: "Television", year: 1927 },
        { label: "World Wide Web", year: 1989 },
        { label: "Smartphone", year: 2007 }
      ]
    } },
    { name: "When did they happen?", params: {
      title: "When did they happen?",
      caption: "Put these moments in the order they occurred.",
      events: [
        { label: "Moon landing", year: 1969 },
        { label: "Fall of the Berlin Wall", year: 1989 },
        { label: "First heart transplant", year: 1967 },
        { label: "End of WWII", year: 1945 }
      ]
    } }
  ],
  build(params, domId) {
    const events = (Array.isArray(params.events) ? params.events : []).filter((e) => e && typeof e.label === "string" && e.label.trim() && Number.isFinite(Number(e.year))).slice(0, 8).map((e) => ({ label: String(e.label), year: Number(e.year) }));
    const title = params.title ? `<div class="pg-cg-title">${esc(params.title)}</div>` : "";
    const caption = params.caption ? `<div class="pg-cg-caption">${esc(params.caption)}</div>` : "";
    const html = `<div class="pg-stage">${title}${caption}<ol class="pg-cg-list" data-role="list" aria-live="polite"></ol><div class="pg-row pg-cg-actions"><button type="button" class="pg-cg-btn pg-cg-primary" data-role="check">Check</button><button type="button" class="pg-cg-btn" data-role="shuffle">Shuffle again</button><span class="pg-cg-feedback" data-role="feedback" aria-live="polite"></span></div></div>`;
    const css = [
      `#${domId} .pg-cg-title{font-weight:600;margin-bottom:.35rem}`,
      `#${domId} .pg-cg-caption{color:var(--ink-dim,#cdd6e6);font-size:.88rem;margin-bottom:.8rem}`,
      `#${domId} .pg-cg-list{list-style:none;margin:0 0 .85rem;padding:0;display:flex;flex-direction:column;gap:.45rem;counter-reset:cg}`,
      `#${domId} .pg-cg-item{display:flex;align-items:center;gap:.6rem;padding:.55rem .7rem;border:1px solid var(--line,#23304a);border-radius:10px;background:rgba(140,160,200,.06)}`,
      `#${domId} .pg-cg-rank{counter-increment:cg;min-width:1.4em;text-align:center;font-weight:700;color:#818cf8}`,
      `#${domId} .pg-cg-rank::before{content:counter(cg)}`,
      `#${domId} .pg-cg-label{flex:1 1 auto;min-width:0;color:var(--ink,#e9eef8);font-weight:600}`,
      `#${domId} .pg-cg-year{flex:0 0 auto;font-variant-numeric:tabular-nums;color:#fbbf24;font-weight:600;opacity:0;transition:opacity .25s}`,
      `#${domId} .pg-cg-item.revealed .pg-cg-year{opacity:1}`,
      `#${domId} .pg-cg-mark{flex:0 0 auto;width:1.3em;text-align:center;font-weight:700}`,
      `#${domId} .pg-cg-item.ok{border-color:#2dd4bf66}`,
      `#${domId} .pg-cg-item.ok .pg-cg-mark{color:#2dd4bf}`,
      `#${domId} .pg-cg-item.no{border-color:#f472b666}`,
      `#${domId} .pg-cg-item.no .pg-cg-mark{color:#f472b6}`,
      `#${domId} .pg-cg-moves{flex:0 0 auto;display:flex;flex-direction:column;gap:.2rem}`,
      `#${domId} .pg-cg-move{width:1.7em;height:1.3em;line-height:1;display:flex;align-items:center;justify-content:center;background:rgba(140,160,200,.08);border:1px solid var(--line,#23304a);border-radius:6px;color:var(--ink,#e9eef8);font:inherit;font-size:.8rem;cursor:pointer;padding:0}`,
      `#${domId} .pg-cg-move:hover:not(:disabled){border-color:#22d3ee}`,
      `#${domId} .pg-cg-move:disabled{opacity:.3;cursor:default}`,
      `#${domId} .pg-row{display:flex;flex-wrap:wrap;align-items:center;gap:.5rem}`,
      `#${domId} .pg-cg-btn{background:rgba(140,160,200,.06);border:1px solid var(--line,#23304a);border-radius:9px;color:var(--ink,#e9eef8);font:inherit;font-weight:600;padding:.5rem .9rem;cursor:pointer}`,
      `#${domId} .pg-cg-btn:hover{border-color:#818cf8}`,
      `#${domId} .pg-cg-primary{background:#22d3ee1a;border-color:#22d3ee66;color:#22d3ee}`,
      `#${domId} .pg-cg-feedback{font-weight:600}`,
      `#${domId} .pg-cg-feedback.ok{color:#2dd4bf}`,
      `#${domId} .pg-cg-feedback.no{color:#f472b6}`
    ].join("\n");
    const jsBody = `
var EVENTS = ${JSON.stringify(events)};
var listEl = $('[data-role=list]');
var checkBtn = $('[data-role=check]');
var shuffleBtn = $('[data-role=shuffle]');
var feedback = $('[data-role=feedback]');
if(!listEl||!checkBtn||!shuffleBtn||EVENTS.length<2)return;

// true chronological order = indices of EVENTS sorted by year (stable for ties)
var SORTED = EVENTS.map(function(e,i){return i;}).sort(function(a,b){
  return EVENTS[a].year - EVENTS[b].year || a - b;
});
var order = [];   // current arrangement: array of original indices
var checked = false;

function shuffle(){
  var a = EVENTS.map(function(e,i){return i;});
  for(var i=a.length-1;i>0;i--){
    var j=Math.floor(Math.random()*(i+1));
    var t=a[i];a[i]=a[j];a[j]=t;
  }
  var tries=0;
  while(a.length>1 && sameAsSorted(a) && tries<30){
    for(var k=a.length-1;k>0;k--){
      var m=Math.floor(Math.random()*(k+1));
      var s=a[k];a[k]=a[m];a[m]=s;
    }
    tries++;
  }
  return a;
}

function sameAsSorted(arr){
  for(var i=0;i<arr.length;i++){ if(arr[i]!==SORTED[i]) return false; }
  return true;
}

function setFeedback(msg, kind){
  feedback.textContent = msg || '';
  feedback.className = 'pg-cg-feedback' + (kind ? ' ' + kind : '');
}

function move(pos, dir){
  var to = pos + dir;
  if(to<0 || to>=order.length) return;
  var t = order[pos]; order[pos] = order[to]; order[to] = t;
  checked = false;
  setFeedback('');
  render();
}

function render(){
  listEl.textContent = '';
  order.forEach(function(origIdx, pos){
    var ev = EVENTS[origIdx];
    var li = document.createElement('li');
    li.className = 'pg-cg-item';

    var rank = document.createElement('span');
    rank.className = 'pg-cg-rank';
    li.appendChild(rank);

    var label = document.createElement('span');
    label.className = 'pg-cg-label';
    label.textContent = ev.label;
    li.appendChild(label);

    var year = document.createElement('span');
    year.className = 'pg-cg-year';
    year.textContent = String(ev.year);
    li.appendChild(year);

    if(checked){
      li.classList.add('revealed');
      var correct = (origIdx === SORTED[pos]);
      li.classList.add(correct ? 'ok' : 'no');
      var mark = document.createElement('span');
      mark.className = 'pg-cg-mark';
      mark.textContent = correct ? '\\u2713' : '\\u2717';
      li.appendChild(mark);
    } else {
      var moves = document.createElement('span');
      moves.className = 'pg-cg-moves';
      var up = document.createElement('button');
      up.type = 'button'; up.className = 'pg-cg-move'; up.textContent = '\\u25B2';
      up.setAttribute('aria-label', 'Move ' + ev.label + ' up');
      up.disabled = (pos === 0);
      up.addEventListener('click', function(){ move(pos, -1); });
      var down = document.createElement('button');
      down.type = 'button'; down.className = 'pg-cg-move'; down.textContent = '\\u25BC';
      down.setAttribute('aria-label', 'Move ' + ev.label + ' down');
      down.disabled = (pos === order.length - 1);
      down.addEventListener('click', function(){ move(pos, 1); });
      moves.appendChild(up); moves.appendChild(down);
      li.appendChild(moves);
    }

    listEl.appendChild(li);
  });
}

function check(){
  checked = true;
  var right = 0;
  for(var i=0;i<order.length;i++){ if(order[i]===SORTED[i]) right++; }
  render();
  if(right === order.length){
    setFeedback('\\u2713 spot on \\u2014 all in order', 'ok');
  } else {
    setFeedback(right + ' of ' + order.length + ' in the right place', 'no');
  }
}

function reset(){
  order = shuffle();
  checked = false;
  setFeedback('');
  render();
}

checkBtn.addEventListener('click', check);
shuffleBtn.addEventListener('click', reset);

reset();
`;
    return { html, css, jsBody };
  }
};

// server/playgrounds/time-since.js
var time_since_default = {
  id: "time-since",
  name: "Time since",
  category: "history",
  description: "How long ago something happened \u2014 live, down to the second.",
  paramsSchema: {
    type: "object",
    additionalProperties: false,
    required: ["event", "date"],
    properties: {
      title: { type: "string" },
      event: { type: "string" },
      date: { type: "string" },
      caption: { type: "string" }
    }
  },
  presets: [
    { name: "Since the Moon landing", params: { title: "Time since the Moon landing", event: "Apollo 11 touched down", date: "1969-07-20" } },
    { name: "Since the Web went public", params: { title: "Time since the Web went public", event: "The World Wide Web opened to all", date: "1991-08-06" } }
  ],
  build(params, domId) {
    const title = params.title ? `<div class="pg-ts-title">${esc(params.title)}</div>` : "";
    const event = esc(params.event || "");
    const date = esc(params.date || "");
    const caption = params.caption ? `<div class="pg-ts-caption">${esc(params.caption)}</div>` : "";
    const html = `<div class="pg-stage" data-date="${date}">${title}<div class="pg-ts-event">${event}</div><div class="pg-ts-date" data-role="date"></div><div class="pg-ts-elapsed" data-role="elapsed"><div class="pg-ts-cell"><span class="pg-ts-num pg-readout" data-role="years">\u2013</span><span class="pg-ts-label">Years</span></div><div class="pg-ts-cell"><span class="pg-ts-num pg-readout" data-role="days">\u2013</span><span class="pg-ts-label">Days</span></div><div class="pg-ts-cell pg-ts-clock"><span class="pg-ts-num pg-readout" data-role="clock">\u2013</span><span class="pg-ts-label">Hours \xB7 Mins \xB7 Secs</span></div></div><div class="pg-ts-msg" data-role="msg" hidden></div>${caption}</div>`;
    const css = [
      `#${domId} .pg-ts-title{font-weight:600;margin-bottom:.6rem;color:var(--ink,#e9eef8)}`,
      `#${domId} .pg-ts-event{font-size:clamp(1.1rem,4vw,1.5rem);font-weight:700;color:#22d3ee;line-height:1.2}`,
      `#${domId} .pg-ts-date{font-size:.82rem;letter-spacing:.04em;color:var(--ink-dim,#cdd6e6);margin:.25rem 0 1rem}`,
      `#${domId} .pg-ts-elapsed{display:grid;grid-template-columns:1fr 1fr;gap:.6rem}`,
      `#${domId} .pg-ts-clock{grid-column:1 / -1}`,
      `#${domId} .pg-ts-cell{display:flex;flex-direction:column;align-items:center;gap:.3rem;padding:.9rem .4rem;border-radius:12px;border:1px solid var(--line,#23304a);background:rgba(140,160,200,.06)}`,
      `#${domId} .pg-ts-num{font-size:clamp(1.5rem,7vw,2.4rem);font-weight:700;line-height:1;font-variant-numeric:tabular-nums;color:#2dd4bf}`,
      `#${domId} .pg-ts-clock .pg-ts-num{color:#818cf8;letter-spacing:.02em}`,
      `#${domId} .pg-ts-label{font-size:.7rem;letter-spacing:.06em;text-transform:uppercase;color:var(--ink-dim,#cdd6e6)}`,
      `#${domId} .pg-ts-msg{font-size:clamp(1rem,4vw,1.3rem);font-weight:600;text-align:center;padding:1.2rem .6rem;color:#fbbf24}`,
      `#${domId} .pg-ts-caption{margin-top:.9rem;font-size:.82rem;color:var(--ink-dim,#cdd6e6)}`
    ].join("\n");
    const jsBody = `
var stage=$('.pg-stage');if(!stage)return;
var elapsed=$('[data-role=elapsed]'),msg=$('[data-role=msg]'),dateEl=$('[data-role=date]');
var yEl=$('[data-role=years]'),dEl=$('[data-role=days]'),cEl=$('[data-role=clock]');
if(!elapsed||!msg||!dateEl||!yEl||!dEl||!cEl)return;
var start=new Date(stage.getAttribute('data-date'));
function pad(n){return(n<10?'0':'')+n;}
function show(m){elapsed.hidden=true;dateEl.hidden=true;msg.hidden=false;msg.textContent=m;}
if(root._tsTimer){clearInterval(root._tsTimer);root._tsTimer=null;}
if(isNaN(start.getTime())){show('That date doesn\u2019t look right.');return;}
try{
  dateEl.textContent=start.toLocaleDateString('en-GB',{day:'numeric',month:'long',year:'numeric'});
}catch(e){dateEl.textContent=stage.getAttribute('data-date');}
function tick(){
  var diff=Date.now()-start.getTime();
  if(diff<0){show('That\u2019s still in the future \u2014 check back later.');if(root._tsTimer){clearInterval(root._tsTimer);root._tsTimer=null;}return;}
  elapsed.hidden=false;dateEl.hidden=false;msg.hidden=true;
  var totalS=Math.floor(diff/1000);
  var totalDays=Math.floor(totalS/86400);
  var years=Math.floor(totalDays/365.25);
  var days=totalDays-Math.floor(years*365.25);
  yEl.textContent=years;
  dEl.textContent=days;
  cEl.textContent=pad(Math.floor(totalS/3600)%24)+':'+pad(Math.floor(totalS/60)%60)+':'+pad(totalS%60);
}
tick();
root._tsTimer=setInterval(tick,1000);
`;
    return { html, css, jsBody };
  }
};

// server/playgrounds/temp-converter.js
var temp_converter_default = {
  id: "temp-converter",
  name: "Temperature converter",
  category: "weather",
  description: "Slide a temperature and see Celsius, Fahrenheit and Kelvin at once.",
  paramsSchema: {
    type: "object",
    additionalProperties: false,
    required: [],
    properties: {
      title: { type: "string" },
      start: { type: "number", default: 20, minimum: -273.15, maximum: 1e3 },
      min: { type: "number", default: -40, minimum: -273.15, maximum: 999 },
      max: { type: "number", default: 50, minimum: -272, maximum: 1e3 },
      caption: { type: "string" }
    }
  },
  presets: [
    { name: "How hot is that?", params: { title: "How hot is that?", start: 20, min: -40, max: 50, caption: "Drag to feel the difference between \xB0C, \xB0F and Kelvin." } },
    { name: "Around freezing", params: { title: "Around freezing", start: 0, min: -20, max: 20, caption: "Water freezes at 0 \xB0C \u2014 32 \xB0F, 273.15 K." } }
  ],
  build(params, domId) {
    const num2 = (v, d) => {
      const n = Number(v);
      return Number.isFinite(n) ? n : d;
    };
    let min = num2(params.min, -40);
    let max = num2(params.max, 50);
    if (max <= min) max = min + 1;
    if (min < -273.15) min = -273.15;
    if (max < -273.15) max = -273.15;
    if (max <= min) max = min + 1;
    let start = num2(params.start, 20);
    if (start < min) start = min;
    if (start > max) start = max;
    const title = params.title ? `<div class="pg-tc-title">${esc(params.title)}</div>` : "";
    const caption = params.caption ? `<div class="pg-tc-caption">${esc(params.caption)}</div>` : "";
    const html = `<div class="pg-stage">${title}
<div class="pg-tc-readouts">
  <div class="pg-tc-cell pg-tc-c"><span class="pg-readout pg-tc-v" data-role="out-c">\u2013</span><span class="pg-tc-u">\xB0C</span></div>
  <div class="pg-tc-cell pg-tc-f"><span class="pg-readout pg-tc-v" data-role="out-f">\u2013</span><span class="pg-tc-u">\xB0F</span></div>
  <div class="pg-tc-cell pg-tc-k"><span class="pg-readout pg-tc-v" data-role="out-k">\u2013</span><span class="pg-tc-u">K</span></div>
</div>
<div class="pg-tc-desc" data-role="out-desc"></div>
<div class="pg-controls">
  <div class="pg-row pg-field"><label><b>Temperature</b> <span class="pg-readout" data-role="out-slider"></span></label>
    <input type="range" data-role="temp" min="${min}" max="${max}" step="0.5" value="${start}" aria-label="Temperature in degrees Celsius"></div>
</div>${caption}
</div>`;
    const css = [
      `#${domId} .pg-tc-title{font-weight:600;margin-bottom:.6rem;color:var(--ink,#e9eef8)}`,
      `#${domId} .pg-tc-readouts{display:grid;grid-template-columns:repeat(3,1fr);gap:.6rem;margin-bottom:.8rem}`,
      `#${domId} .pg-tc-cell{display:flex;flex-direction:column;align-items:center;gap:.15rem;padding:.8rem .5rem;border-radius:12px;border:1px solid var(--line,#23304a);background:rgba(140,160,200,.05)}`,
      `#${domId} .pg-tc-v{font-size:1.7rem;font-weight:700;line-height:1;font-variant-numeric:tabular-nums}`,
      `#${domId} .pg-tc-u{font-size:.78rem;letter-spacing:.03em;text-transform:uppercase;color:var(--ink-dim,#9fb0c8)}`,
      `#${domId} .pg-tc-c{border-color:#2dd4bf55;background:rgba(45,212,191,.07)}`,
      `#${domId} .pg-tc-c .pg-tc-v{color:#2dd4bf}`,
      `#${domId} .pg-tc-f{border-color:#fbbf2455;background:rgba(251,191,36,.07)}`,
      `#${domId} .pg-tc-f .pg-tc-v{color:#fbbf24}`,
      `#${domId} .pg-tc-k{border-color:#818cf855;background:rgba(129,140,248,.07)}`,
      `#${domId} .pg-tc-k .pg-tc-v{color:#818cf8}`,
      `#${domId} .pg-tc-desc{text-align:center;font-size:1rem;font-weight:600;margin-bottom:.9rem;min-height:1.3em;color:var(--ink,#e9eef8)}`,
      `#${domId} .pg-controls{display:flex;flex-direction:column;gap:.7rem}`,
      `#${domId} .pg-field label{display:flex;justify-content:space-between;align-items:baseline;gap:.6rem;font-size:.9rem;color:var(--ink-dim,#cdd6e6)}`,
      `#${domId} .pg-readout{color:#22d3ee;font-variant-numeric:tabular-nums}`,
      `#${domId} input[type=range]{width:100%;margin:.35rem 0 0;accent-color:#22d3ee}`,
      `#${domId} .pg-tc-caption{margin-top:.8rem;font-size:.85rem;color:var(--ink-dim,#9fb0c8)}`,
      `@media(max-width:420px){#${domId} .pg-tc-v{font-size:1.4rem}}`
    ].join("\n");
    const jsBody = `
var tEl=$('[data-role=temp]');
if(!tEl)return;
var outC=$('[data-role=out-c]'), outF=$('[data-role=out-f]'), outK=$('[data-role=out-k]');
var outSlider=$('[data-role=out-slider]'), outDesc=$('[data-role=out-desc]');
function fmt(n){
  var r=Math.round(n*10)/10;
  if(Object.is(r,-0))r=0;
  return (r.toFixed(1)).replace(/\\.0$/,'');
}
function descriptor(c){
  if(c<0)return 'Freezing';
  if(c<10)return 'Cold';
  if(c<20)return 'Mild';
  if(c<30)return 'Warm';
  return 'Hot';
}
function recompute(){
  var c=parseFloat(tEl.value);
  if(!isFinite(c))c=0;
  var f=c*9/5+32;
  var k=c+273.15;
  if(outC)outC.textContent=fmt(c);
  if(outF)outF.textContent=fmt(f);
  if(outK)outK.textContent=fmt(k);
  if(outSlider)outSlider.textContent=fmt(c)+' \xB0C';
  if(outDesc)outDesc.textContent=descriptor(c);
}
tEl.addEventListener('input', recompute);
recompute();
`;
    return { html, css, jsBody };
  }
};

// server/playgrounds/weather-scene.js
var CONDITIONS = ["sunny", "cloudy", "rainy", "stormy", "snowy"];
var LABELS = { sunny: "Sunny", cloudy: "Cloudy", rainy: "Rainy", stormy: "Stormy", snowy: "Snowy" };
var weather_scene_default = {
  id: "weather-scene",
  name: "Weather scene",
  category: "weather",
  description: "Tap to switch the weather and watch the little SVG scene change.",
  paramsSchema: {
    type: "object",
    additionalProperties: false,
    required: ["scenes"],
    properties: {
      title: { type: "string" },
      caption: { type: "string" },
      scenes: {
        type: "array",
        minItems: 2,
        maxItems: 5,
        items: { type: "string", enum: CONDITIONS }
      }
    }
  },
  presets: [
    { name: "Four kinds of British day", params: {
      title: "Four kinds of British day",
      scenes: ["sunny", "cloudy", "rainy", "stormy"],
      caption: "All four before lunch, if you are unlucky."
    } },
    { name: "Winter", params: {
      title: "Winter",
      scenes: ["snowy", "cloudy", "sunny"],
      caption: "Snow, then grey, then a brief, smug bit of sun."
    } }
  ],
  build(params, domId) {
    const seen = {};
    let scenes = (Array.isArray(params.scenes) ? params.scenes : []).filter((s) => CONDITIONS.indexOf(s) !== -1 && !seen[s] && (seen[s] = true));
    if (scenes.length < 2) scenes = ["sunny", "rainy"];
    scenes = scenes.slice(0, 5);
    const title = params.title ? `<div class="pg-ws-title">${esc(params.title)}</div>` : "";
    const caption = params.caption ? `<div class="pg-ws-caption">${esc(params.caption)}</div>` : "";
    const buttons = scenes.map((s, i) => `<button type="button" class="pg-ws-btn" data-role="btn" data-cond="${esc(s)}" aria-pressed="${i === 0 ? "true" : "false"}">${esc(LABELS[s])}</button>`).join("");
    const html = `<div class="pg-stage">` + title + `<div class="pg-ws-scene" data-role="scene" aria-live="polite"><svg viewBox="0 0 200 140" width="100%" height="100%" role="img" data-role="svg" aria-label="Weather scene"></svg></div><div class="pg-controls pg-ws-controls" role="group" aria-label="Choose the weather">${buttons}</div>` + caption + `</div>`;
    const css = [
      `#${domId} .pg-ws-title{font-weight:600;color:var(--ink,#e9eef8);margin-bottom:.6rem}`,
      `#${domId} .pg-ws-scene{border-radius:14px;border:1px solid var(--line,#23304a);background:linear-gradient(180deg,rgba(34,211,238,.07),rgba(129,140,248,.05));overflow:hidden;aspect-ratio:200/140}`,
      `#${domId} .pg-ws-scene svg{display:block}`,
      `#${domId} .pg-ws-controls{display:flex;flex-wrap:wrap;gap:.5rem;margin-top:.7rem}`,
      `#${domId} .pg-ws-btn{flex:1 1 auto;min-width:84px;padding:.5rem .8rem;border-radius:10px;border:1px solid var(--line,#23304a);background:rgba(140,160,200,.06);color:var(--ink-dim,#cdd6e6);font:inherit;font-weight:600;cursor:pointer;transition:border-color .2s,background .2s,color .2s}`,
      `#${domId} .pg-ws-btn:hover{border-color:#22d3ee88}`,
      `#${domId} .pg-ws-btn[aria-pressed=true]{background:rgba(34,211,238,.14);border-color:#22d3ee;color:var(--ink,#e9eef8)}`,
      `#${domId} .pg-ws-caption{margin-top:.6rem;color:var(--ink-dim,#cdd6e6);font-size:.92rem;opacity:.9}`,
      // animations — only active when NOT reduced (the .pg-ws-reduce class strips them)
      `@keyframes pg-ws-spin{to{transform:rotate(360deg)}}`,
      `@keyframes pg-ws-fall{from{transform:translateY(-14px);opacity:0}10%{opacity:1}to{transform:translateY(60px);opacity:0}}`,
      `@keyframes pg-ws-flash{0%,72%,100%{opacity:0}74%,82%{opacity:1}}`,
      `#${domId} .pg-ws-rays{transform-box:fill-box;transform-origin:center;animation:pg-ws-spin 28s linear infinite}`,
      `#${domId} .pg-ws-drop{animation:pg-ws-fall 1.1s linear infinite}`,
      `#${domId} .pg-ws-flake{animation:pg-ws-fall 2.6s linear infinite}`,
      `#${domId} .pg-ws-bolt{animation:pg-ws-flash 2.4s ease-in-out infinite}`,
      `#${domId}.pg-ws-reduce .pg-ws-rays,#${domId}.pg-ws-reduce .pg-ws-drop,#${domId}.pg-ws-reduce .pg-ws-flake,#${domId}.pg-ws-reduce .pg-ws-bolt{animation:none}`,
      `#${domId}.pg-ws-reduce .pg-ws-bolt{opacity:1}`
    ].join("\n");
    const jsBody = `
var NS='http://www.w3.org/2000/svg';
var LABELS=${JSON.stringify(LABELS)};
var svg=$('[data-role=svg]');
var btns=$$('[data-role=btn]');
if(!svg||!btns.length)return;
if(reduced)root.classList.add('pg-ws-reduce');

function el(name,attrs,cls){
  var n=document.createElementNS(NS,name);
  if(attrs)for(var k in attrs)n.setAttribute(k,attrs[k]);
  if(cls)n.setAttribute('class',cls);
  return n;
}
function clear(){ while(svg.firstChild)svg.removeChild(svg.firstChild); }
// a soft grey cloud centred near (cx,cy)
function cloud(cx,cy){
  var g=el('g');
  var fill='#cdd6e6';
  [[cx-22,cy+6,16],[cx,cy-6,22],[cx+24,cy+4,17],[cx+2,cy+10,30]].forEach(function(c){
    g.appendChild(el('circle',{cx:c[0],cy:c[1],r:c[2],fill:fill}));
  });
  g.appendChild(el('rect',{x:cx-30,y:cy+4,width:64,height:18,rx:9,fill:fill}));
  return g;
}

function drawSunny(){
  var g=el('g');
  var rays=el('g',{},'pg-ws-rays');
  for(var i=0;i<12;i++){
    var a=i*30*Math.PI/180;
    var x1=100+Math.cos(a)*30, y1=64+Math.sin(a)*30;
    var x2=100+Math.cos(a)*44, y2=64+Math.sin(a)*44;
    rays.appendChild(el('line',{x1:x1,y1:y1,x2:x2,y2:y2,stroke:'#fbbf24','stroke-width':3,'stroke-linecap':'round'}));
  }
  g.appendChild(rays);
  g.appendChild(el('circle',{cx:100,cy:64,r:24,fill:'#fbbf24'}));
  svg.appendChild(g);
}
function drawCloudy(){
  svg.appendChild(cloud(70,46));
  var c2=cloud(118,70); c2.setAttribute('opacity','.82');
  svg.appendChild(c2);
}
function drawRainy(){
  svg.appendChild(cloud(100,40));
  var rain=el('g');
  for(var i=0;i<7;i++){
    var x=64+i*12;
    var d=el('line',{x1:x,y1:64,x2:x-4,y2:74,stroke:'#22d3ee','stroke-width':2.5,'stroke-linecap':'round'},'pg-ws-drop');
    d.style.animationDelay=(i*0.13)+'s';
    rain.appendChild(d);
  }
  svg.appendChild(rain);
}
function drawStormy(){
  var c=cloud(100,40);
  Array.prototype.forEach.call(c.childNodes,function(n){ if(n.setAttribute)n.setAttribute('fill','#9aa6bd'); });
  svg.appendChild(c);
  var bolt=el('polygon',{points:'100,60 90,86 99,86 92,108 114,78 103,78 110,60',fill:'#fbbf24',stroke:'#fff7d6','stroke-width':1},'pg-ws-bolt');
  svg.appendChild(bolt);
}
function drawSnowy(){
  svg.appendChild(cloud(100,40));
  var snow=el('g');
  for(var i=0;i<7;i++){
    var x=64+i*12;
    var f=el('circle',{cx:x,cy:64,r:3,fill:'#e9eef8'},'pg-ws-flake');
    f.style.animationDelay=(i*0.32)+'s';
    snow.appendChild(f);
  }
  svg.appendChild(snow);
}
var DRAW={sunny:drawSunny,cloudy:drawCloudy,rainy:drawRainy,stormy:drawStormy,snowy:drawSnowy};

function show(cond){
  clear();
  (DRAW[cond]||drawSunny)();
  svg.setAttribute('aria-label',(LABELS[cond]||cond)+' weather');
  btns.forEach(function(b){
    b.setAttribute('aria-pressed', b.getAttribute('data-cond')===cond ? 'true':'false');
  });
}

btns.forEach(function(b){
  b.addEventListener('click',function(){ show(b.getAttribute('data-cond')); });
});
show(btns[0].getAttribute('data-cond'));
`;
    return { html, css, jsBody };
  }
};

// server/playgrounds/pros-cons.js
var pros_cons_default = {
  id: "pros-cons",
  name: "Pros & cons",
  category: "comparison",
  description: "Weigh a decision \u2014 tick the points that matter to you and see which side wins.",
  paramsSchema: {
    type: "object",
    additionalProperties: false,
    required: ["pros", "cons"],
    properties: {
      title: { type: "string" },
      subject: { type: "string" },
      pros: {
        type: "array",
        minItems: 1,
        maxItems: 8,
        items: { type: "string" }
      },
      cons: {
        type: "array",
        minItems: 1,
        maxItems: 8,
        items: { type: "string" }
      },
      caption: { type: "string" }
    }
  },
  presets: [
    { name: "Should I get a dog?", params: {
      title: "Should I get a dog?",
      subject: "Getting a dog",
      pros: ["Unconditional love", "Forces you outside", "Great company"],
      cons: ["Tied down", "Cost", "Hair everywhere", "Early walks"]
    } },
    { name: "Remote vs office", params: {
      title: "Remote vs office",
      subject: "Working from home",
      pros: ["No commute", "Comfort", "Focus"],
      cons: ["Lonely", "Blurred boundaries", "Fewer chance chats"],
      caption: "Tick what rings true for you."
    } }
  ],
  build(params, domId) {
    const clean = (arr) => (Array.isArray(arr) ? arr : []).filter((s) => typeof s === "string" && s.trim()).slice(0, 8);
    const pros = clean(params.pros);
    const cons = clean(params.cons);
    const title = params.title ? `<div class="pg-pc-title">${esc(params.title)}</div>` : "";
    const subject2 = params.subject ? `<div class="pg-pc-subject">${esc(params.subject)}</div>` : "";
    const caption = params.caption ? `<div class="pg-pc-caption">${esc(params.caption)}</div>` : "";
    const point = (side, label2, i) => `<button type="button" class="pg-pc-point" data-role="point" data-side="${side}" data-i="${i}" aria-pressed="false"><span class="pg-pc-tick" aria-hidden="true"></span><span class="pg-pc-label">${esc(label2)}</span></button>`;
    const prosHtml = pros.map((p, i) => point("pro", p, i)).join("");
    const consHtml = cons.map((c, i) => point("con", c, i)).join("");
    const html = `<div class="pg-stage">` + title + subject2 + `<div class="pg-pc-cols"><div class="pg-pc-col pg-pc-col-pro"><div class="pg-pc-head">Pros</div><div class="pg-pc-list">${prosHtml}</div></div><div class="pg-pc-col pg-pc-col-con"><div class="pg-pc-head">Cons</div><div class="pg-pc-list">${consHtml}</div></div></div><div class="pg-pc-balance" role="img" aria-label="Balance of ticked points"><span class="pg-pc-bar pg-pc-bar-pro" data-role="bar-pro" style="width:50%"></span><span class="pg-pc-bar pg-pc-bar-con" data-role="bar-con" style="width:50%"></span></div><div class="pg-pc-foot"><span class="pg-readout pg-pc-tally" data-role="tally">0 pros &middot; 0 cons</span><span class="pg-pc-verdict" data-role="verdict">Too close to call</span></div>` + caption + `</div>`;
    const css = [
      `#${domId} .pg-pc-title{font-weight:700;font-size:1.05rem;color:var(--ink,#e9eef8);margin-bottom:.2rem}`,
      `#${domId} .pg-pc-subject{font-size:.9rem;color:var(--ink-dim,#8b97ac);margin-bottom:.8rem}`,
      `#${domId} .pg-pc-cols{display:grid;grid-template-columns:1fr;gap:.7rem}`,
      `@media(min-width:520px){#${domId} .pg-pc-cols{grid-template-columns:1fr 1fr}}`,
      `#${domId} .pg-pc-head{font-weight:700;font-size:.78rem;letter-spacing:.06em;text-transform:uppercase;margin-bottom:.5rem}`,
      `#${domId} .pg-pc-col-pro .pg-pc-head{color:#2dd4bf}`,
      `#${domId} .pg-pc-col-con .pg-pc-head{color:#f472b6}`,
      `#${domId} .pg-pc-list{display:flex;flex-direction:column;gap:.4rem}`,
      `#${domId} .pg-pc-point{display:flex;align-items:center;gap:.6rem;width:100%;text-align:left;font:inherit;cursor:pointer;padding:.5rem .65rem;border-radius:10px;border:1px solid var(--line,#23304a);background:rgba(140,160,200,.05);color:var(--ink,#e9eef8)}`,
      `#${domId} .pg-pc-point:hover{border-color:#22d3ee66}`,
      `#${domId} .pg-pc-point:focus-visible{outline:2px solid #22d3ee;outline-offset:2px}`,
      `#${domId} .pg-pc-tick{flex:0 0 auto;width:20px;height:20px;border-radius:6px;border:1px solid #3a4865;background:rgba(140,160,200,.12);position:relative;transition:background .2s,border-color .2s}`,
      `#${domId} .pg-pc-tick::after{content:"";position:absolute;left:6px;top:2px;width:5px;height:10px;border:solid #04060c;border-width:0 2px 2px 0;transform:rotate(45deg) scale(0);opacity:0;transition:transform .15s,opacity .15s}`,
      `#${domId} .pg-pc-label{flex:1 1 auto;min-width:0}`,
      `#${domId} .pg-pc-col-pro .pg-pc-point.on{border-color:#2dd4bf66;background:rgba(45,212,191,.1)}`,
      `#${domId} .pg-pc-col-pro .pg-pc-point.on .pg-pc-tick{background:#2dd4bf;border-color:#2dd4bf}`,
      `#${domId} .pg-pc-col-con .pg-pc-point.on{border-color:#f472b666;background:rgba(244,114,182,.1)}`,
      `#${domId} .pg-pc-col-con .pg-pc-point.on .pg-pc-tick{background:#f472b6;border-color:#f472b6}`,
      `#${domId} .pg-pc-point.on .pg-pc-tick::after{transform:rotate(45deg) scale(1);opacity:1}`,
      `#${domId} .pg-pc-balance{display:flex;height:14px;margin-top:1rem;border-radius:99px;overflow:hidden;border:1px solid var(--line,#23304a);background:rgba(140,160,200,.08)}`,
      `#${domId} .pg-pc-bar{display:block;height:100%;transition:width .35s ease}`,
      `#${domId} .pg-pc-bar-pro{background:linear-gradient(90deg,#2dd4bf,#22d3ee)}`,
      `#${domId} .pg-pc-bar-con{background:linear-gradient(90deg,#818cf8,#f472b6)}`,
      `#${domId} .pg-pc-foot{display:flex;align-items:center;justify-content:space-between;gap:.8rem;margin-top:.7rem;flex-wrap:wrap}`,
      `#${domId} .pg-pc-tally{font-variant-numeric:tabular-nums;font-size:.85rem;color:var(--ink-dim,#8b97ac)}`,
      `#${domId} .pg-pc-verdict{font-weight:700;color:var(--ink,#e9eef8)}`,
      `#${domId} .pg-pc-verdict.lean-pro{color:#2dd4bf}`,
      `#${domId} .pg-pc-verdict.lean-con{color:#f472b6}`,
      `#${domId} .pg-pc-caption{margin-top:.7rem;font-size:.85rem;color:var(--ink-dim,#8b97ac)}`,
      `#${domId}.pg-pc-reduce .pg-pc-bar,#${domId}.pg-pc-reduce .pg-pc-tick,#${domId}.pg-pc-reduce .pg-pc-tick::after{transition:none}`
    ].join("\n");
    const jsBody = `
if(reduced)root.classList.add('pg-pc-reduce');
var points=$$('[data-role=point]');
if(!points.length)return;
var barPro=$('[data-role=bar-pro]');
var barCon=$('[data-role=bar-con]');
var tally=$('[data-role=tally]');
var verdict=$('[data-role=verdict]');
function refresh(){
  var p=0,c=0;
  points.forEach(function(b){
    if(!b.classList.contains('on'))return;
    if(b.getAttribute('data-side')==='pro')p++;else c++;
  });
  var sum=p+c;
  var pPct=sum?Math.round((p/sum)*100):50;
  if(barPro)barPro.style.width=pPct+'%';
  if(barCon)barCon.style.width=(sum?100-pPct:50)+'%';
  if(tally)tally.innerHTML=p+' pro'+(p===1?'':'s')+' &middot; '+c+' con'+(c===1?'':'s');
  if(verdict){
    var v='Too close to call',cls='';
    if(p>c){v='Leaning yes';cls='lean-pro';}
    else if(c>p){v='Leaning no';cls='lean-con';}
    verdict.textContent=v;
    verdict.className='pg-pc-verdict'+(cls?' '+cls:'');
  }
}
points.forEach(function(b){
  b.addEventListener('click',function(){
    var on=b.classList.toggle('on');
    b.setAttribute('aria-pressed',on?'true':'false');
    refresh();
  });
});
refresh();
`;
    return { html, css, jsBody };
  }
};

// server/playgrounds/accordion.js
var accordion_default = {
  id: "accordion",
  name: "Accordion",
  category: "reveal",
  description: "A list of expandable rows \u2014 tap a question to reveal the answer.",
  paramsSchema: {
    type: "object",
    additionalProperties: false,
    required: ["items"],
    properties: {
      title: { type: "string" },
      caption: { type: "string" },
      items: { type: "array", minItems: 2, maxItems: 10, items: {
        type: "object",
        additionalProperties: false,
        required: ["q", "a"],
        properties: { q: { type: "string" }, a: { type: "string" } }
      } }
    }
  },
  presets: [
    { name: "Common questions", params: {
      title: "Common questions",
      items: [
        { q: "Is it free?", a: "Yes \u2014 and it stays on your own machine." },
        { q: "Do I need the internet?", a: "Only to publish; everything else works offline." },
        { q: "Can I undo things?", a: "Always. Nothing is final until you publish." }
      ]
    } },
    { name: "Myth or fact", params: {
      title: "Myth or fact",
      items: [
        { q: "Goldfish have a 3-second memory", a: "Myth \u2014 they remember for months." },
        { q: "We use 10% of our brains", a: "Myth \u2014 we use all of it, just not all at once." }
      ]
    } }
  ],
  build(params, domId) {
    const items = (Array.isArray(params.items) ? params.items : []).filter((it) => it && typeof it === "object").slice(0, 10);
    const title = params.title ? `<div class="pg-ac-title">${esc(params.title)}</div>` : "";
    const caption = params.caption ? `<div class="pg-ac-caption">${esc(params.caption)}</div>` : "";
    const rowsHtml = items.map(
      (it) => `<div class="pg-ac-row" data-role="row"><button type="button" class="pg-ac-head" data-role="head" aria-expanded="false"><span class="pg-ac-q">${esc(it.q)}</span><span class="pg-ac-chev" aria-hidden="true">&#9656;</span></button><div class="pg-ac-panel" data-role="panel"><div class="pg-ac-a">${esc(it.a)}</div></div></div>`
    ).join("");
    const html = `<div class="pg-stage">${title}<div class="pg-ac-list">${rowsHtml}</div>${caption}</div>`;
    const css = [
      `#${domId} .pg-ac-title{font-weight:600;color:var(--ink,#e9eef8);margin-bottom:.6rem}`,
      `#${domId} .pg-ac-list{display:flex;flex-direction:column;gap:.5rem}`,
      `#${domId} .pg-ac-row{border:1px solid var(--line,#23304a);border-radius:12px;background:rgba(140,160,200,.04);overflow:hidden;transition:border-color .18s}`,
      `#${domId} .pg-ac-row.open{border-color:#22d3ee}`,
      `#${domId} .pg-ac-head{display:flex;align-items:center;justify-content:space-between;gap:.8rem;width:100%;font:inherit;text-align:left;cursor:pointer;border:0;background:transparent;color:var(--ink,#e9eef8);padding:.8rem 1rem}`,
      `#${domId} .pg-ac-head:hover .pg-ac-q{color:#22d3ee}`,
      `#${domId} .pg-ac-q{font-weight:600;line-height:1.4}`,
      `#${domId} .pg-ac-chev{flex:0 0 auto;color:#22d3ee;font-size:.9rem;transition:transform .25s}`,
      `#${domId} .pg-ac-row.open .pg-ac-chev{transform:rotate(90deg)}`,
      `#${domId} .pg-ac-panel{display:grid;grid-template-rows:0fr;opacity:0;transition:grid-template-rows .28s ease,opacity .28s ease}`,
      `#${domId} .pg-ac-row.open .pg-ac-panel{grid-template-rows:1fr;opacity:1}`,
      `#${domId} .pg-ac-a{min-height:0;overflow:hidden;color:var(--ink-dim,#cdd6e6);line-height:1.55;padding:0 1rem}`,
      `#${domId} .pg-ac-row.open .pg-ac-a{padding-bottom:.9rem}`,
      `#${domId}.pg-ac-reduce .pg-ac-panel{transition:none}`,
      `#${domId}.pg-ac-reduce .pg-ac-chev{transition:none}`,
      `#${domId}.pg-ac-reduce .pg-ac-row{transition:none}`,
      `#${domId} .pg-ac-caption{margin-top:.6rem;font-size:.85rem;color:var(--ink-dim,#9fb0c8)}`
    ].join("\n");
    const jsBody = `
if(reduced)root.classList.add('pg-ac-reduce');
var rows=$$('[data-role=row]');
if(!rows.length)return;
rows.forEach(function(row){
  var head=row.querySelector('[data-role=head]');
  if(!head)return;
  head.addEventListener('click',function(){
    var open=row.classList.toggle('open');
    head.setAttribute('aria-expanded',open?'true':'false');
  });
});
`;
    return { html, css, jsBody };
  }
};

// server/playgrounds/decision-tree.js
var decision_tree_default = {
  id: "decision-tree",
  name: "Decision flow",
  category: "diagram",
  description: "Answer a few questions and follow the branches to an outcome.",
  paramsSchema: {
    type: "object",
    additionalProperties: false,
    required: ["start", "nodes"],
    properties: {
      title: { type: "string" },
      caption: { type: "string" },
      start: { type: "string" },
      nodes: {
        type: "object",
        additionalProperties: {
          type: "object",
          additionalProperties: false,
          properties: {
            q: { type: "string" },
            outcome: { type: "string" },
            options: {
              type: "array",
              items: {
                type: "object",
                additionalProperties: false,
                required: ["label", "to"],
                properties: {
                  label: { type: "string" },
                  to: { type: "string" }
                }
              }
            }
          }
        }
      }
    }
  },
  presets: [
    {
      name: "Should you send that text?",
      params: {
        title: "Should you send that text?",
        start: "q1",
        nodes: {
          q1: { q: "Is it after midnight?", options: [{ label: "Yes", to: "q2" }, { label: "No", to: "q3" }] },
          q2: { q: "Have you had a drink?", options: [{ label: "Yes", to: "no" }, { label: "No", to: "q3" }] },
          q3: { q: "Would you be happy to read it aloud to them tomorrow?", options: [{ label: "Yes", to: "yes" }, { label: "No", to: "no" }] },
          yes: { outcome: "Send it. \u{1F4E8}" },
          no: { outcome: "Sleep on it. Draft it, don\u2019t send it." }
        },
        caption: "Not legal advice. Or relationship advice."
      }
    },
    {
      name: "What to cook",
      params: {
        title: "What to cook",
        start: "q1",
        nodes: {
          q1: { q: "Got more than 20 minutes?", options: [{ label: "Yes", to: "q2" }, { label: "No", to: "fast" }] },
          q2: { q: "Feeling fancy?", options: [{ label: "Yes", to: "fancy" }, { label: "No", to: "comfort" }] },
          fast: { outcome: "Beans on toast. No notes." },
          comfort: { outcome: "Pasta. Always pasta." },
          fancy: { outcome: "Attempt the risotto. Stir with intent." }
        }
      }
    }
  ],
  build(params, domId) {
    const title = params.title ? `<div class="pg-dt-title">${esc(params.title)}</div>` : "";
    const caption = params.caption ? `<div class="pg-dt-caption">${esc(params.caption)}</div>` : "";
    const nodes = params.nodes && typeof params.nodes === "object" ? params.nodes : {};
    const start = typeof params.start === "string" ? params.start : "";
    const html = `<div class="pg-stage">` + title + `<div class="pg-dt-crumbs" data-role="crumbs" aria-live="polite"></div><div class="pg-dt-card" data-role="card"></div><div class="pg-dt-actions"><button type="button" class="pg-dt-restart" data-role="restart" hidden>Start over</button></div>` + caption + `</div>`;
    const css = [
      `#${domId} .pg-dt-title{font-weight:700;font-size:1.05rem;margin-bottom:.6rem;color:var(--ink,#e9eef8)}`,
      `#${domId} .pg-dt-crumbs{display:flex;flex-wrap:wrap;gap:.35rem;margin-bottom:.7rem;min-height:1.1rem;font-size:.78rem;color:var(--ink-dim,#9fb0c8)}`,
      `#${domId} .pg-dt-crumb{display:inline-flex;align-items:center;gap:.35rem}`,
      `#${domId} .pg-dt-crumb:not(:last-child)::after{content:'\u203A';color:#5b6b88;margin-left:.35rem}`,
      `#${domId} .pg-dt-crumb b{color:#22d3ee;font-weight:600}`,
      `#${domId} .pg-dt-card{border:1px solid var(--line,#23304a);border-radius:14px;padding:1.1rem;background:rgba(140,160,200,.05)}`,
      `#${domId} .pg-dt-q{font-weight:600;font-size:1.05rem;color:var(--ink,#e9eef8);margin-bottom:.85rem}`,
      `#${domId} .pg-dt-opts{display:flex;flex-wrap:wrap;gap:.55rem}`,
      `#${domId} .pg-dt-opt{font:inherit;cursor:pointer;border:1px solid #2dd4bf66;background:rgba(45,212,191,.08);color:var(--ink,#e9eef8);padding:.5rem .9rem;border-radius:999px;transition:background .15s,border-color .15s,transform .08s}`,
      `#${domId} .pg-dt-opt:hover{background:rgba(45,212,191,.18);border-color:#2dd4bf}`,
      `#${domId} .pg-dt-opt:active{transform:translateY(1px)}`,
      `#${domId} .pg-dt-outcome{font-weight:700;font-size:1.25rem;line-height:1.35;color:#fff;text-shadow:0 0 18px rgba(129,140,248,.4)}`,
      `#${domId} .pg-dt-outcome .pg-dt-flag{display:block;font-size:.72rem;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:#818cf8;margin-bottom:.5rem}`,
      `#${domId} .pg-dt-err{color:#f472b6;font-weight:600}`,
      `#${domId} .pg-dt-actions{margin-top:.8rem}`,
      `#${domId} .pg-dt-restart{font:inherit;cursor:pointer;border:1px solid var(--line,#23304a);background:transparent;color:var(--ink-dim,#9fb0c8);padding:.4rem .8rem;border-radius:8px;transition:color .15s,border-color .15s}`,
      `#${domId} .pg-dt-restart:hover{color:#22d3ee;border-color:#22d3ee66}`
    ].join("\n");
    const jsBody = `
var NODES=${JSON.stringify(nodes)};
var START=${JSON.stringify(start)};
var card=$('[data-role=card]'),crumbs=$('[data-role=crumbs]'),restart=$('[data-role=restart]');
if(!card)return;
var current=START,path=[];

function clear(el){while(el.firstChild)el.removeChild(el.firstChild);}

function renderCrumbs(){
  clear(crumbs);
  path.forEach(function(step){
    var c=document.createElement('span');c.className='pg-dt-crumb';
    var q=document.createTextNode(step.q+' ');
    var b=document.createElement('b');b.textContent=step.label;
    c.appendChild(q);c.appendChild(b);
    crumbs.appendChild(c);
  });
}

function render(){
  clear(card);
  renderCrumbs();
  var node=NODES&&Object.prototype.hasOwnProperty.call(NODES,current)?NODES[current]:null;
  if(!node){
    var err=document.createElement('div');err.className='pg-dt-err';
    err.textContent='Dead end \u2014 that branch points nowhere.';
    card.appendChild(err);
    restart.hidden=false;
    return;
  }
  if(node.outcome!=null){
    var out=document.createElement('div');out.className='pg-dt-outcome';
    var flag=document.createElement('span');flag.className='pg-dt-flag';flag.textContent='Outcome';
    out.appendChild(flag);
    out.appendChild(document.createTextNode(String(node.outcome)));
    card.appendChild(out);
    restart.hidden=false;
    return;
  }
  var q=document.createElement('div');q.className='pg-dt-q';
  q.textContent=node.q!=null?String(node.q):'\u2026';
  card.appendChild(q);
  var opts=document.createElement('div');opts.className='pg-dt-opts';
  var list=Array.isArray(node.options)?node.options:[];
  list.forEach(function(opt){
    var b=document.createElement('button');b.type='button';b.className='pg-dt-opt';
    b.textContent=opt&&opt.label!=null?String(opt.label):'\u2026';
    b.addEventListener('click',function(){
      path.push({q:node.q!=null?String(node.q):'',label:b.textContent});
      current=opt&&opt.to!=null?String(opt.to):'';
      render();
    });
    opts.appendChild(b);
  });
  if(!list.length){
    var none=document.createElement('div');none.className='pg-dt-err';
    none.textContent='No options here \u2014 check the flow.';
    opts.appendChild(none);
  }
  card.appendChild(opts);
  restart.hidden=path.length===0;
}

restart.addEventListener('click',function(){current=START;path=[];render();});
render();
`;
    return { html, css, jsBody };
  }
};

// server/playgrounds/poll.js
var poll_default = {
  id: "poll",
  name: "Poll",
  category: "Interactive",
  description: "A question with tappable options. Tapping marks the reader's pick; optionally reveals an author-supplied distribution as bars (no live voting \u2014 there is no backend).",
  paramsSchema: {
    type: "object",
    additionalProperties: false,
    required: ["question", "options"],
    properties: {
      question: { type: "string", title: "The question shown above the options" },
      options: { type: "array", minItems: 2, maxItems: 8, title: "The options \u2014 string or {label, weight}", items: { type: "string" } },
      showResults: { type: "string", enum: ["bars", "none"], default: "none", title: "After a tap: highlight the pick only (none) or also reveal author-set bars" },
      note: { type: "string", title: "Optional caption under the poll (e.g. where the figures came from)" }
    }
  },
  presets: [
    {
      name: "Reader opinion (pick only)",
      params: {
        question: "When a shoulder dislocates for the first time, what matters most?",
        options: ["Speed of relocation", "Ruling out a fracture first", "Pain relief", "Getting an MRI"],
        showResults: "none"
      }
    },
    {
      name: "Survey result (bars)",
      params: {
        question: "Which knee injury is the commonest in contact sport?",
        options: [
          { label: "ACL tear", weight: 46 },
          { label: "MCL sprain", weight: 31 },
          { label: "Meniscal tear", weight: 18 },
          { label: "PCL tear", weight: 5 }
        ],
        showResults: "bars",
        note: "Illustrative shares \u2014 an author-authored distribution, not a live tally."
      }
    }
  ],
  build(params, domId) {
    const raw = Array.isArray(params.options) ? params.options.slice(0, 8) : [];
    const opts = raw.map((o) => {
      if (o && typeof o === "object") return { label: String(o.label || ""), weight: Number(o.weight) || 0 };
      return { label: String(o == null ? "" : o), weight: 0 };
    }).filter((o) => o.label !== "");
    const showBars = params.showResults === "bars";
    const question = params.question ? `<div class="pg-poll-q" id="${domId}-q">${esc(params.question)}</div>` : "";
    const note = params.note ? `<div class="pg-poll-note">${esc(params.note)}</div>` : "";
    let rows = "";
    opts.forEach((o, i) => {
      rows += `<button type="button" class="pg-poll-opt" role="radio" aria-checked="false" data-role="opt" data-idx="${i}"><span class="pg-poll-bar" data-role="bar" aria-hidden="true"></span><span class="pg-poll-mark" aria-hidden="true"></span><span class="pg-poll-label">${esc(o.label)}</span>` + (showBars ? `<span class="pg-poll-pct" data-role="pct" aria-hidden="true"></span>` : "") + `</button>`;
    });
    const html = `<div class="pg-stage">${question}<div class="pg-poll-list" role="radiogroup"${params.question ? ` aria-labelledby="${domId}-q"` : ' aria-label="Poll"'} data-role="list">${rows}</div><div class="pg-readout pg-poll-readout" data-role="readout" aria-live="polite">Tap an option to choose.</div>` + note + `</div>`;
    const css = [
      `#${domId} .pg-poll-q{font-weight:600;color:var(--ink,#e9eef8);font-size:1.05rem;margin:0 0 .9rem}`,
      `#${domId} .pg-poll-list{display:flex;flex-direction:column;gap:.6rem}`,
      `#${domId} .pg-poll-opt{position:relative;display:flex;align-items:center;gap:.7rem;width:100%;text-align:left;overflow:hidden;border:1px solid var(--line,#23304a);border-radius:10px;padding:.75rem .9rem;min-height:48px;background:rgba(140,160,200,.05);color:var(--ink-dim,#cdd6e6);font:inherit;cursor:pointer;transition:border-color .15s,color .15s,background .15s}`,
      `#${domId} .pg-poll-opt:hover{border-color:var(--cyan,#22d3ee);color:var(--ink,#e9eef8)}`,
      `#${domId} .pg-poll-opt:focus-visible{outline:2px solid #22d3ee;outline-offset:2px}`,
      `#${domId} .pg-poll-bar{position:absolute;inset:0 auto 0 0;width:0;background:linear-gradient(90deg,rgba(45,212,191,.22),rgba(129,140,248,.22));border-right:2px solid var(--cyan,#22d3ee);transition:width .6s cubic-bezier(.2,.7,.2,1);pointer-events:none}`,
      `#${domId} .pg-poll-mark{position:relative;flex:0 0 auto;width:18px;height:18px;border-radius:50%;border:2px solid var(--line,#3a4660);transition:border-color .15s,background .15s}`,
      `#${domId} .pg-poll-label{position:relative;flex:1 1 auto;font-weight:500}`,
      `#${domId} .pg-poll-pct{position:relative;flex:0 0 auto;font-variant-numeric:tabular-nums;color:var(--cyan,#22d3ee);font-weight:600;opacity:0;transition:opacity .3s}`,
      `#${domId} .pg-poll-opt.is-picked{border-color:var(--cyan,#22d3ee);color:var(--ink,#fff);background:rgba(34,211,238,.08)}`,
      `#${domId} .pg-poll-opt.is-picked .pg-poll-mark{border-color:var(--cyan,#22d3ee);background:radial-gradient(circle at center,var(--cyan,#22d3ee) 0 40%,transparent 42%)}`,
      `#${domId} .pg-poll-opt.is-picked .pg-poll-label::after{content:" \u2014 you chose";color:var(--teal,#2dd4bf);font-weight:600;font-size:.85em}`,
      `#${domId} .pg-poll-list.show-pct .pg-poll-pct{opacity:1}`,
      `#${domId} .pg-poll-readout{margin-top:.9rem;color:var(--ink-dim,#9fb3c8)}`,
      `#${domId} .pg-poll-readout b{color:#fff}`,
      `#${domId} .pg-poll-note{margin-top:.5rem;font-size:.82rem;color:var(--ink-faint,#717d99)}`,
      `#${domId}.pg-poll-reduce .pg-poll-bar,#${domId}.pg-poll-reduce .pg-poll-pct{transition:none}`
    ].join("\n");
    const jsBody = `
var raw=(CONFIG.options||[]).slice(0,8);
var OPTS=raw.map(function(o){
  if(o&&typeof o==='object')return {label:String(o.label||''),weight:(+o.weight)||0};
  return {label:String(o==null?'':o),weight:0};
}).filter(function(o){return o.label!=='';});
var SHOW_BARS=(CONFIG.showResults==='bars');
if(reduced)root.classList.add('pg-poll-reduce');
var list=$('[data-role=list]');
var opts=$$('[data-role=opt]');
var readout=$('[data-role=readout]');
if(!list||!opts.length)return;
// Normalise the author weights to percentages for the bars (so they need not sum to 100).
var total=0;OPTS.forEach(function(o){total+=Math.max(0,o.weight);});
function pctOf(i){if(!total)return 0;return Math.round((Math.max(0,(OPTS[i]||{}).weight)/total)*100);}
var picked=-1,revealed=false;
function paint(){
  opts.forEach(function(btn,i){
    var on=(i===picked);
    btn.classList.toggle('is-picked',on);
    btn.setAttribute('aria-checked',on?'true':'false');
    btn.tabIndex=(picked<0?(i===0?0:-1):(on?0:-1));
    if(SHOW_BARS){
      var bar=btn.querySelector('[data-role=bar]');
      var pct=btn.querySelector('[data-role=pct]');
      var p=pctOf(i);
      if(bar)bar.style.width=(revealed?p:0)+'%';
      if(pct)pct.textContent=p+'%';
    }
  });
  if(SHOW_BARS&&revealed)list.classList.add('show-pct');
}
function choose(i){
  if(i<0||i>=opts.length)return;
  picked=i;
  if(SHOW_BARS)revealed=true;
  paint();
  var lbl=(OPTS[i]||{}).label||'';
  if(SHOW_BARS){
    readout.innerHTML='You chose <b>'+lbl.replace(/&/g,'&amp;').replace(/</g,'&lt;')+'</b> ('+pctOf(i)+'% of the illustrative split).';
  }else{
    readout.innerHTML='You chose <b>'+lbl.replace(/&/g,'&amp;').replace(/</g,'&lt;')+'</b>.';
  }
}
opts.forEach(function(btn){
  var i=parseInt(btn.getAttribute('data-idx'),10)||0;
  btn.addEventListener('click',function(){choose(i);});
  btn.addEventListener('keydown',function(e){
    var k=e.key,n=opts.length,j=-1;
    if(k==='ArrowDown'||k==='ArrowRight')j=(i+1)%n;
    else if(k==='ArrowUp'||k==='ArrowLeft')j=(i-1+n)%n;
    else if(k===' '||k==='Enter'){e.preventDefault();choose(i);return;}
    if(j>=0){e.preventDefault();opts[j].focus();choose(j);}
  });
});
paint();
`;
    return { html, css, jsBody };
  }
};

// server/playgrounds/scratch-reveal.js
function stripUnsafe(html) {
  return String(html).replace(/<\s*script[\s\S]*?<\s*\/\s*script\s*>/gi, "").replace(/<\s*script\b[^>]*\/?\s*>/gi, "").replace(/<\s*(iframe|object|embed|foreignObject)\b[\s\S]*?<\s*\/\s*\1\s*>/gi, "").replace(/<\s*(iframe|object|embed)\b[^>]*\/?\s*>/gi, "").replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "").replace(/(href|src)\s*=\s*("\s*(?:javascript|data|vbscript):[^"]*"|'\s*(?:javascript|data|vbscript):[^']*'|\s*(?:javascript|data|vbscript):[^\s>]*)/gi, "");
}
var scratch_reveal_default = {
  id: "scratch-reveal",
  name: "Scratch to reveal",
  category: "Interactive",
  description: 'A scratch-off cover over hidden content \u2014 drag a finger to scratch it away and reveal the answer, with a "Reveal all" button and a reduced-motion fallback.',
  paramsSchema: {
    type: "object",
    additionalProperties: false,
    properties: {
      title: { type: "string", title: "Optional label above the scratch panel" },
      coverLabel: { type: "string", title: "Text shown on the cover", default: "Scratch here" },
      revealText: { type: "string", title: "The plain text revealed underneath" },
      revealHtml: { type: "string", title: "A small HTML snippet revealed underneath (overrides revealText)" },
      color: { type: "string", title: "Cover colour (hex)", default: "#2dd4bf" }
    }
  },
  presets: [
    {
      name: "Reveal the answer",
      params: {
        title: "Which nerve is most at risk in a surgical neck fracture?",
        coverLabel: "Scratch to reveal",
        revealText: "The axillary nerve \u2014 test the badge area and deltoid.",
        color: "#2dd4bf"
      }
    },
    {
      name: "Spoiler",
      params: {
        coverLabel: "Spoiler \u2014 scratch if you dare",
        revealHtml: "It was the <strong>scaphoid</strong> all along.",
        color: "#818cf8"
      }
    }
  ],
  build(params, domId) {
    const title = params.title ? `<div class="pg-scr-title">${esc(params.title)}</div>` : "";
    const coverLabel = esc(params.coverLabel || "Scratch here");
    const revealInner = params.revealHtml != null && String(params.revealHtml).trim() !== "" ? stripUnsafe(params.revealHtml) : esc(params.revealText || "");
    const color = /^#[0-9a-fA-F]{3,8}$/.test(String(params.color || "")) ? params.color : "#2dd4bf";
    const html = `<div class="pg-stage">${title}<div class="pg-scr-frame" data-role="frame"><div class="pg-scr-content" data-role="content">${revealInner}</div><canvas class="pg-scr-canvas" data-role="canvas" aria-hidden="true"></canvas><div class="pg-scr-hint" data-role="hint" aria-hidden="true">${coverLabel}</div></div><div class="pg-controls pg-scr-controls"><button type="button" class="pg-scr-btn" data-role="revealall">Reveal all</button><span class="pg-readout pg-scr-readout" data-role="readout" aria-live="polite">Drag to scratch.</span></div></div>`;
    const css = [
      `#${domId} .pg-scr-title{font-weight:600;color:var(--ink,#e9eef8);margin:0 0 .8rem}`,
      `#${domId} .pg-scr-frame{position:relative;width:100%;min-height:120px;border:1px solid var(--line,#23304a);border-radius:12px;overflow:hidden;background:#04060c}`,
      `#${domId} .pg-scr-content{position:relative;z-index:1;display:flex;align-items:center;justify-content:center;text-align:center;min-height:120px;padding:1.4rem 1.2rem;color:var(--cyan,#22d3ee);font-size:1.1rem;font-weight:600;line-height:1.5}`,
      `#${domId} .pg-scr-content strong{color:#fff}`,
      `#${domId} .pg-scr-canvas{position:absolute;inset:0;z-index:2;width:100%;height:100%;display:block;touch-action:none;cursor:crosshair}`,
      `#${domId} .pg-scr-hint{position:absolute;inset:0;z-index:3;display:flex;align-items:center;justify-content:center;text-align:center;padding:1rem;color:#04060c;font-weight:700;letter-spacing:.03em;text-transform:uppercase;font-size:.95rem;pointer-events:none}`,
      `#${domId} .pg-scr-frame.is-clear .pg-scr-canvas,#${domId} .pg-scr-frame.is-clear .pg-scr-hint{display:none}`,
      `#${domId} .pg-scr-controls{display:flex;align-items:center;gap:.9rem;flex-wrap:wrap;margin-top:1rem}`,
      `#${domId} .pg-scr-btn{appearance:none;background:transparent;border:1px solid var(--line,#23304a);border-radius:8px;padding:.5rem 1.1rem;min-height:44px;color:var(--ink-dim,#9fb3c8);font:inherit;cursor:pointer;transition:.2s}`,
      `#${domId} .pg-scr-btn:hover{border-color:var(--cyan,#22d3ee);color:var(--cyan,#22d3ee)}`,
      `#${domId} .pg-scr-btn:focus-visible{outline:2px solid #22d3ee;outline-offset:2px}`,
      `#${domId} .pg-scr-btn:disabled{opacity:.4;cursor:default}`,
      `#${domId} .pg-scr-readout{color:var(--ink-faint,#717d99)}`,
      // Reduced-motion / fallback: hide the cover entirely, show the content.
      `#${domId}.pg-scr-reveal .pg-scr-canvas,#${domId}.pg-scr-reveal .pg-scr-hint{display:none}`
    ].join("\n");
    const jsBody = `
var COLOR=${JSON.stringify(color)};
var frame=$('[data-role=frame]'),content=$('[data-role=content]'),canvas=$('[data-role=canvas]'),hint=$('[data-role=hint]'),btn=$('[data-role=revealall]'),readout=$('[data-role=readout]');
if(!frame||!content||!canvas)return;
var ctx=canvas.getContext&&canvas.getContext('2d');
function done(msg){
  frame.classList.add('is-clear');
  if(btn)btn.disabled=true;
  if(readout)readout.textContent=msg||'Revealed.';
}
// Reduced-motion or no 2d context \u2192 just show the content revealed.
if(reduced||!ctx){root.classList.add('pg-scr-reveal');if(btn)btn.disabled=true;if(readout)readout.textContent='Revealed.';return;}
var dpr=Math.max(1,Math.min(3,window.devicePixelRatio||1));
var W=0,H=0,radius=22;
function paintCover(){
  var r=frame.getBoundingClientRect();
  W=Math.max(1,Math.round(r.width));H=Math.max(1,Math.round(r.height));
  canvas.width=W*dpr;canvas.height=H*dpr;
  canvas.style.width=W+'px';canvas.style.height=H+'px';
  ctx.setTransform(dpr,0,0,dpr,0,0);
  ctx.globalCompositeOperation='source-over';
  ctx.fillStyle=COLOR;ctx.fillRect(0,0,W,H);
  // faint diagonal sheen so it reads as a foil cover
  ctx.globalAlpha=0.12;ctx.fillStyle='#ffffff';
  for(var x=-H;x<W;x+=14){ctx.fillRect(x,0,5,H);}
  ctx.globalAlpha=1;
  radius=Math.max(16,Math.round(Math.min(W,H)*0.10));
}
paintCover();
var scratching=false,last=null,cleared=false;
function pos(e){var r=canvas.getBoundingClientRect();return {x:e.clientX-r.left,y:e.clientY-r.top};}
function scratch(p){
  ctx.globalCompositeOperation='destination-out';
  ctx.lineWidth=radius*2;ctx.lineCap='round';ctx.lineJoin='round';
  if(last){ctx.beginPath();ctx.moveTo(last.x,last.y);ctx.lineTo(p.x,p.y);ctx.stroke();}
  ctx.beginPath();ctx.arc(p.x,p.y,radius,0,Math.PI*2);ctx.fill();
  last=p;
}
function pctCleared(){
  // sample on a coarse grid for cheapness; count fully-transparent pixels
  try{
    var step=Math.max(6,Math.round(Math.min(W,H)/24));
    var img=ctx.getImageData(0,0,canvas.width,canvas.height).data;
    var cw=canvas.width,clear=0,tot=0;
    for(var y=0;y<canvas.height;y+=step){for(var x=0;x<cw;x+=step){tot++;if(img[(y*cw+x)*4+3]===0)clear++;}}
    return tot?clear/tot:0;
  }catch(err){return 0;}
}
function maybeAutoClear(){
  if(cleared)return;
  if(pctCleared()>0.6){cleared=true;done('Revealed.');}
}
function onDown(e){if(cleared)return;scratching=true;last=null;var p=pos(e);scratch(p);if(hint)hint.style.opacity='0';if(e.cancelable)e.preventDefault();if(canvas.setPointerCapture&&e.pointerId!=null){try{canvas.setPointerCapture(e.pointerId);}catch(_){}}}
function onMove(e){if(!scratching||cleared)return;scratch(pos(e));if(e.cancelable)e.preventDefault();}
function onUp(){if(!scratching)return;scratching=false;last=null;maybeAutoClear();}
canvas.addEventListener('pointerdown',onDown);
canvas.addEventListener('pointermove',onMove);
canvas.addEventListener('pointerup',onUp);
canvas.addEventListener('pointercancel',onUp);
canvas.addEventListener('pointerleave',onUp);
if(btn)btn.addEventListener('click',function(){cleared=true;done('Revealed.');});
var rt;
window.addEventListener('resize',function(){if(cleared)return;clearTimeout(rt);rt=setTimeout(paintCover,150);});
`;
    return { html, css, jsBody };
  }
};

// server/playgrounds/swipe-carousel.js
var slideSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    title: { type: "string", title: "Slide heading" },
    text: { type: "string", title: "Slide body text" },
    emoji: { type: "string", title: "Optional emoji / single glyph shown large" }
  }
};
var swipe_carousel_default = {
  id: "swipe-carousel",
  name: "Swipeable carousel",
  category: "Interactive",
  description: "A swipeable carousel of cards with dots and prev/next \u2014 touch-swipe, tap, or arrow keys. For step-throughs, tips, and before/after-of-the-week sets.",
  paramsSchema: {
    type: "object",
    additionalProperties: false,
    required: ["slides"],
    properties: {
      title: { type: "string", title: "Optional label above the carousel" },
      slides: { type: "array", minItems: 1, maxItems: 12, title: "The cards", items: slideSchema },
      loop: { type: "boolean", default: false, title: "Wrap past the first / last slide" }
    }
  },
  presets: [
    {
      name: "Three quick tips",
      params: {
        title: "Swipe through the three checks",
        loop: false,
        slides: [
          { emoji: "\u{1F91A}", title: "Look", text: "Inspect for deformity, swelling and the position the limb is held in before you touch it." },
          { emoji: "\u{1F446}", title: "Feel", text: "Palpate bony landmarks and the joint line; note the point of maximal tenderness." },
          { emoji: "\u{1F504}", title: "Move", text: "Active first, then passive \u2014 and always check the joint above and below." }
        ]
      }
    },
    {
      name: "Card set (looping)",
      params: {
        title: "A small looping set",
        loop: true,
        slides: [
          { title: "One", text: "The first card. Swipe left to continue." },
          { title: "Two", text: "The middle card." },
          { title: "Three", text: "The last card \u2014 loops back to the first." }
        ]
      }
    }
  ],
  build(params, domId) {
    const slides = (Array.isArray(params.slides) ? params.slides : []).slice(0, 12);
    const n = slides.length;
    const loop = !!params.loop;
    const title = params.title ? `<div class="pg-car-title">${esc(params.title)}</div>` : "";
    let cards = "";
    slides.forEach((s, i) => {
      const emoji = s && s.emoji ? `<div class="pg-car-emoji" aria-hidden="true">${esc(s.emoji)}</div>` : "";
      const head = s && s.title ? `<div class="pg-car-h">${esc(s.title)}</div>` : "";
      const body = s && s.text ? `<div class="pg-car-t">${esc(s.text)}</div>` : "";
      cards += `<div class="pg-car-card" data-role="card" role="group" aria-roledescription="slide" aria-label="Slide ${i + 1} of ${n}">${emoji}${head}${body}</div>`;
    });
    let dots = "";
    for (let i = 0; i < n; i++) {
      dots += `<button type="button" class="pg-car-dot" data-role="dot" data-idx="${i}" aria-label="Go to slide ${i + 1}"></button>`;
    }
    const html = `<div class="pg-stage">${title}<div class="pg-car-viewport" data-role="viewport" aria-roledescription="carousel" tabindex="0" aria-label="Swipeable carousel; use the arrow keys"><div class="pg-car-track" data-role="track">${cards}</div></div><div class="pg-controls pg-car-controls"><button type="button" class="pg-car-nav" data-role="prev" aria-label="Previous slide">\u2039</button><div class="pg-car-dots" data-role="dots" role="tablist" aria-label="Slides">${dots}</div><button type="button" class="pg-car-nav" data-role="next" aria-label="Next slide">\u203A</button></div><div class="pg-readout pg-car-readout" data-role="readout" aria-live="polite">Slide <b data-role="idx">1</b> of <b>${n}</b></div></div>`;
    const css = [
      `#${domId} .pg-car-title{font-weight:600;color:var(--ink,#e9eef8);margin:0 0 .8rem}`,
      `#${domId} .pg-car-viewport{position:relative;overflow:hidden;border:1px solid var(--line,#23304a);border-radius:12px;background:#04060c;touch-action:pan-y;cursor:grab;user-select:none}`,
      `#${domId} .pg-car-viewport:focus-visible{outline:2px solid #22d3ee;outline-offset:2px}`,
      `#${domId} .pg-car-viewport.is-grabbing{cursor:grabbing}`,
      `#${domId} .pg-car-track{display:flex;will-change:transform;transition:transform .35s cubic-bezier(.2,.7,.2,1)}`,
      `#${domId} .pg-car-card{flex:0 0 100%;box-sizing:border-box;min-width:100%;padding:1.6rem 1.4rem;text-align:center;min-height:140px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:.55rem}`,
      `#${domId} .pg-car-emoji{font-size:2.4rem;line-height:1}`,
      `#${domId} .pg-car-h{color:#fff;font-weight:700;font-size:1.15rem}`,
      `#${domId} .pg-car-t{color:var(--ink-dim,#cdd6e6);line-height:1.55;max-width:46ch}`,
      `#${domId} .pg-car-controls{display:flex;align-items:center;justify-content:center;gap:1rem;margin-top:1rem}`,
      `#${domId} .pg-car-nav{appearance:none;flex:0 0 auto;width:44px;height:44px;border-radius:50%;border:1px solid var(--line,#23304a);background:transparent;color:var(--ink-dim,#9fb3c8);font-size:1.4rem;line-height:1;cursor:pointer;transition:.2s}`,
      `#${domId} .pg-car-nav:hover{border-color:var(--cyan,#22d3ee);color:var(--cyan,#22d3ee)}`,
      `#${domId} .pg-car-nav:focus-visible{outline:2px solid #22d3ee;outline-offset:2px}`,
      `#${domId} .pg-car-nav:disabled{opacity:.3;cursor:default}`,
      `#${domId} .pg-car-dots{display:flex;align-items:center;gap:.5rem}`,
      `#${domId} .pg-car-dot{appearance:none;width:10px;height:10px;padding:0;border-radius:50%;border:0;background:#3a4660;cursor:pointer;transition:.2s}`,
      `#${domId} .pg-car-dot:hover{background:#5a6a88}`,
      `#${domId} .pg-car-dot:focus-visible{outline:2px solid #22d3ee;outline-offset:2px}`,
      `#${domId} .pg-car-dot.is-active{background:var(--cyan,#22d3ee);transform:scale(1.25)}`,
      `#${domId} .pg-car-readout{text-align:center;margin-top:.7rem;color:var(--ink-faint,#717d99)}`,
      `#${domId} .pg-car-readout b{color:#fff}`,
      `#${domId}.pg-car-reduce .pg-car-track{transition:none}`
    ].join("\n");
    const jsBody = `
var N=${n},LOOP=${loop ? "true" : "false"};
if(N<=0)return;
if(reduced)root.classList.add('pg-car-reduce');
var viewport=$('[data-role=viewport]'),track=$('[data-role=track]');
var prev=$('[data-role=prev]'),next=$('[data-role=next]'),dots=$$('[data-role=dot]');
var idxOut=$('[data-role=idx]');
if(!viewport||!track)return;
var cur=0;
function clampIdx(i){
  if(LOOP)return (i%N+N)%N;
  return i<0?0:(i>N-1?N-1:i);
}
function render(animate){
  if(animate===false){var t=track.style.transition;track.style.transition='none';}
  track.style.transform='translateX('+(-cur*100)+'%)';
  if(animate===false){void track.offsetWidth;track.style.transition=t||'';}
  dots.forEach(function(d,i){d.classList.toggle('is-active',i===cur);d.setAttribute('aria-selected',i===cur?'true':'false');});
  if(idxOut)idxOut.textContent=String(cur+1);
  if(prev)prev.disabled=(!LOOP&&cur<=0);
  if(next)next.disabled=(!LOOP&&cur>=N-1);
}
function go(i,animate){cur=clampIdx(i);render(animate);}
if(prev)prev.addEventListener('click',function(){go(cur-1);});
if(next)next.addEventListener('click',function(){go(cur+1);});
dots.forEach(function(d){d.addEventListener('click',function(){go(parseInt(d.getAttribute('data-idx'),10)||0);});});
viewport.addEventListener('keydown',function(e){
  if(e.key==='ArrowRight'){e.preventDefault();go(cur+1);}
  else if(e.key==='ArrowLeft'){e.preventDefault();go(cur-1);}
  else if(e.key==='Home'){e.preventDefault();go(0);}
  else if(e.key==='End'){e.preventDefault();go(N-1);}
});
// Pointer-drag swipe. Horizontal drag swipes; we follow the finger then snap.
var dragging=false,startX=0,startY=0,dx=0,width=1,decided=false,horiz=false;
function onDown(e){
  dragging=true;decided=false;horiz=false;dx=0;
  startX=e.clientX;startY=e.clientY;
  width=viewport.getBoundingClientRect().width||1;
  viewport.classList.add('is-grabbing');
  if(viewport.setPointerCapture&&e.pointerId!=null){try{viewport.setPointerCapture(e.pointerId);}catch(_){}}
}
function onMove(e){
  if(!dragging)return;
  var mx=e.clientX-startX,my=e.clientY-startY;
  if(!decided){
    if(Math.abs(mx)<6&&Math.abs(my)<6)return;
    decided=true;horiz=Math.abs(mx)>Math.abs(my);
  }
  if(!horiz)return; // a vertical gesture \u2192 let the page scroll
  if(e.cancelable)e.preventDefault();
  dx=mx;
  var pct=(dx/width)*100;
  // resist dragging past the ends when not looping
  if(!LOOP&&((cur===0&&dx>0)||(cur===N-1&&dx<0)))pct*=0.35;
  var t=track.style.transition;track.style.transition='none';
  track.style.transform='translateX('+(-cur*100+pct)+'%)';
  track.style.transition=t||'';
}
function onUp(){
  if(!dragging)return;
  dragging=false;viewport.classList.remove('is-grabbing');
  if(horiz&&Math.abs(dx)>width*0.18){go(dx<0?cur+1:cur-1);}
  else{render();}
  dx=0;
}
viewport.addEventListener('pointerdown',onDown);
viewport.addEventListener('pointermove',onMove);
viewport.addEventListener('pointerup',onUp);
viewport.addEventListener('pointercancel',onUp);
window.addEventListener('resize',function(){render(false);});
render(false);
`;
    return { html, css, jsBody };
  }
};

// server/playgrounds/registry.js
var all = [
  toggle_ab_default,
  function_explorer_default,
  stepper_timeline_default,
  scatter_sim_default,
  tappable_meter_default,
  mixer_default,
  stopwatch_default,
  lever_geometry_default,
  sortable_priority_default,
  quiz_reveal_default,
  chart_data_default,
  before_after_default,
  hotspots_default,
  risk_grid_default,
  gauge_dial_default,
  flip_cards_default,
  layer_peel_default,
  dice_roller_default,
  reaction_timer_default,
  tip_split_default,
  compound_growth_default,
  countdown_default,
  bpm_tap_default,
  word_stats_default,
  wheel_spinner_default,
  memory_match_default,
  star_rating_default,
  emoji_slider_default,
  odometer_default,
  word_scramble_default,
  colour_palette_default,
  world_clocks_default,
  book_shelf_default,
  map_route_default,
  recipe_scaler_default,
  spectrum_scale_default,
  guess_slider_default,
  bracket_default,
  chord_diagram_default,
  budget_donut_default,
  moon_phase_default,
  morse_code_default,
  timeline_scrubber_default,
  higher_lower_default,
  forecast_strip_default,
  quadrant_plot_default,
  checklist_default,
  toggle_switches_default,
  tabs_panel_default,
  gradient_maker_default,
  colour_harmony_default,
  beat_sequencer_default,
  keyboard_notes_default,
  caesar_cipher_default,
  nato_phonetic_default,
  chronology_game_default,
  time_since_default,
  temp_converter_default,
  weather_scene_default,
  pros_cons_default,
  accordion_default,
  decision_tree_default,
  poll_default,
  scratch_reveal_default,
  swipe_carousel_default
];
var families = all.reduce((m, f) => {
  m[f.id] = f;
  return m;
}, {});

// server/playgrounds/index.js
function listFamilies() {
  return Object.values(families).map((f) => ({
    id: f.id,
    name: f.name,
    category: f.category,
    description: f.description,
    paramsSchema: f.paramsSchema,
    presets: (f.presets || []).map((p) => ({ name: p.name }))
  }));
}
function getFamily(id) {
  const f = families[id];
  if (!f) throw Object.assign(new Error(`Unknown playground family: ${id}`), { code: "PG_FAMILY", status: 400 });
  return f;
}
function getPreset(id, name) {
  const f = getFamily(id);
  const p = (f.presets || []).find((x) => x.name === name);
  return p ? p.params : null;
}
var SAFE_ID = /^[a-zA-Z][\w-]*$/;
function buildInstance(familyId, params = {}, domId) {
  const f = getFamily(familyId);
  const id = domId && SAFE_ID.test(domId) ? domId : `pg-${familyId}-${idHash(JSON.stringify(params))}`;
  const { html, css, jsBody } = f.build(params, id);
  const config2 = JSON.stringify({ domId: id, ...params });
  const js = [
    "(function(){",
    `var CONFIG=${config2};`,
    `var root=document.getElementById(${JSON.stringify(id)});`,
    "if(!root)return;",
    "var reduced=window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches;",
    "var $=function(s){return root.querySelector(s);};",
    "var $$=function(s){return Array.prototype.slice.call(root.querySelectorAll(s));};",
    String(jsBody || "").trim(),
    "})();"
  ].join("\n");
  return { id: "pg-" + idHash(id), type: "playground", domId: id, html, css, js };
}
function idHash(s) {
  let h = 0;
  for (let i = 0; i < String(s).length; i++) h = (h * 31 + s.charCodeAt(i)) % 1e9;
  return h.toString(36);
}
var esc = (s) => String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// server/figures/registry.js
var registry_exports = {};
__export(registry_exports, {
  build: () => build24,
  listFamilies: () => listFamilies2
});

// server/figures/labelled-diagram.js
var labelled_diagram_exports = {};
__export(labelled_diagram_exports, {
  build: () => build,
  meta: () => meta
});
var VB_W = 400;
var VB_H = 300;
var CX = VB_W / 2;
var CY = VB_H / 2;
var meta = {
  id: "labelled-diagram",
  name: "Labelled diagram",
  category: "Structure",
  description: "A central shape with leader-connected text labels pointing to anchor points.",
  paramsSchema: {
    type: "object",
    properties: {
      shape: { type: "string", enum: ["blob", "rect", "circle"], default: "blob" },
      labels: {
        type: "array",
        items: {
          type: "object",
          properties: {
            text: { type: "string" },
            anchor: { type: "array", items: { type: "number" }, minItems: 2, maxItems: 2 }
          },
          required: ["text", "anchor"]
        },
        default: []
      }
    }
  },
  presets: [
    {
      name: "Apex & base",
      params: {
        shape: "blob",
        labels: [
          { text: "apex", anchor: [200, 90] },
          { text: "base", anchor: [200, 230] }
        ]
      }
    },
    {
      name: "Quadrants",
      params: {
        shape: "circle",
        labels: [
          { text: "superior", anchor: [200, 95] },
          { text: "inferior", anchor: [200, 205] },
          { text: "medial", anchor: [130, 150] },
          { text: "lateral", anchor: [270, 150] }
        ]
      }
    }
  ]
};
function baseShape(shape) {
  const stroke = { class: "fig-stroke", width: 2 };
  if (shape === "rect") {
    return rect({ x: CX - 90, y: CY - 60, w: 180, h: 120, rx: 10, ...stroke });
  }
  if (shape === "circle") {
    return circle({ cx: CX, cy: CY, r: 75, ...stroke });
  }
  const d = [
    `M ${CX} ${CY - 78}`,
    `C ${CX + 70} ${CY - 78} ${CX + 96} ${CY - 24} ${CX + 78} ${CY + 18}`,
    `C ${CX + 60} ${CY + 60} ${CX + 24} ${CY + 80} ${CX - 18} ${CY + 74}`,
    `C ${CX - 72} ${CY + 66} ${CX - 96} ${CY + 18} ${CX - 84} ${CY - 24}`,
    `C ${CX - 74} ${CY - 60} ${CX - 40} ${CY - 78} ${CX} ${CY - 78}`,
    "Z"
  ].join(" ");
  return path(d, { class: "fig-stroke", width: 2 });
}
function labelledAnchor(text2, anchor) {
  const [ax, ay] = anchor;
  const onRight = ax >= CX;
  const lx = onRight ? Math.min(ax + 60, VB_W - 8) : Math.max(ax - 60, 8);
  const ly = ay;
  const txt = label(text2, lx, ly + 4, {
    anchor: onRight ? "start" : "end",
    size: 13
  });
  const lead = leader([lx + (onRight ? -6 : 6), ly], [ax, ay]);
  return el("g", {}, [lead, txt]);
}
function build(params = {}, opts = { animate: "draw" }) {
  const { shape = "blob", labels = [] } = params || {};
  const animate = opts && opts.animate || "draw";
  const parts = [baseShape(shape)];
  for (const l of labels) {
    if (!l) continue;
    const anchor = Array.isArray(l.anchor) ? l.anchor : [CX, CY];
    parts.push(labelledAnchor(l.text ?? "", anchor));
  }
  const styleCss = animate === "draw" ? drawCss(".fig-stroke") : "";
  const svg2 = sanitise(svgWrap(parts.join(""), viewBox(VB_W, VB_H), styleCss));
  return { svg: svg2, supportsDraw: true, motion: null };
}

// server/figures/step-flow.js
var step_flow_exports = {};
__export(step_flow_exports, {
  build: () => build2,
  meta: () => meta2
});
var NODE_W = 96;
var NODE_H = 56;
var GAP = 48;
var PAD = 24;
var meta2 = {
  id: "step-flow",
  name: "Step flow",
  category: "Process",
  description: "Numbered step nodes connected by arrows, laid out horizontally or vertically.",
  paramsSchema: {
    type: "object",
    properties: {
      orientation: { type: "string", enum: ["h", "v"], default: "h" },
      steps: {
        type: "array",
        items: {
          type: "object",
          properties: {
            title: { type: "string" },
            note: { type: "string" }
          },
          required: ["title"]
        },
        default: []
      }
    }
  },
  presets: [
    {
      name: "Reduce \u2192 Review",
      params: {
        orientation: "h",
        steps: [
          { title: "Reduce" },
          { title: "Immobilise" },
          { title: "Image" },
          { title: "Review" }
        ]
      }
    },
    {
      name: "Vertical pathway",
      params: {
        orientation: "v",
        steps: [
          { title: "Assess", note: "history + exam" },
          { title: "Investigate", note: "bloods, imaging" },
          { title: "Treat" }
        ]
      }
    }
  ]
};
function stepNode(index, step, x, y) {
  const box = rect({ x, y, w: NODE_W, h: NODE_H, rx: 8, class: "fig-stroke", width: 2 });
  const num2 = label(String(index + 1), x + 12, y + 20, { size: 12, fill: "var(--ink-dim)" });
  const title = label(step.title ?? "", x + NODE_W / 2, y + NODE_H / 2 + 5, {
    anchor: "middle",
    size: 13
  });
  const parts = [box, num2, title];
  if (step.note != null && step.note !== "") {
    parts.push(label(step.note, x + NODE_W / 2, y + NODE_H + 16, {
      anchor: "middle",
      size: 11,
      fill: "var(--ink-dim)"
    }));
  }
  return el("g", {}, parts);
}
function build2(params = {}, opts = { animate: "draw" }) {
  const { orientation = "h", steps = [] } = params || {};
  const animate = opts && opts.animate || "draw";
  const horizontal = orientation !== "v";
  const list = Array.isArray(steps) ? steps : [];
  const n = Math.max(list.length, 1);
  const parts = [];
  const pos = [];
  for (let i = 0; i < list.length; i++) {
    const x = horizontal ? PAD + i * (NODE_W + GAP) : PAD;
    const y = horizontal ? PAD : PAD + i * (NODE_H + GAP);
    pos.push([x, y]);
    parts.push(stepNode(i, list[i], x, y));
  }
  for (let i = 0; i < pos.length - 1; i++) {
    const [x, y] = pos[i];
    if (horizontal) {
      const y1 = y + NODE_H / 2;
      parts.push(arrow({ x1: x + NODE_W, y1, x2: x + NODE_W + GAP, y2: y1, width: 2, class: "fig-stroke" }));
    } else {
      const x1 = x + NODE_W / 2;
      parts.push(arrow({ x1, y1: y + NODE_H, x2: x1, y2: y + NODE_H + GAP, width: 2, class: "fig-stroke" }));
    }
  }
  const noteRoom = list.some((s) => s && s.note) ? 20 : 0;
  const W4 = horizontal ? PAD * 2 + n * NODE_W + (n - 1) * GAP : PAD * 2 + NODE_W + 70;
  const H5 = horizontal ? PAD * 2 + NODE_H + noteRoom + 8 : PAD * 2 + n * NODE_H + (n - 1) * GAP + noteRoom;
  const styleCss = animate === "draw" ? drawCss(".fig-stroke") : "";
  const svg2 = sanitise(svgWrap(parts.join(""), viewBox(W4, H5), styleCss));
  return { svg: svg2, supportsDraw: true, motion: null };
}

// server/figures/cross-section.js
var cross_section_exports = {};
__export(cross_section_exports, {
  build: () => build3,
  meta: () => meta3
});
var VB_W2 = 420;
var VB_H2 = 300;
var PAD2 = 24;
var LABEL_GAP = 16;
var meta3 = {
  id: "cross-section",
  name: "Cross-section",
  category: "Structure",
  description: "A layered cutaway: stacked bands sized by thickness, each labelled, with optional hatch fill.",
  paramsSchema: {
    type: "object",
    properties: {
      orientation: { type: "string", enum: ["v", "h"], default: "v" },
      layers: {
        type: "array",
        items: {
          type: "object",
          properties: {
            label: { type: "string" },
            thickness: { type: "number" },
            hatch: { type: "boolean" }
          },
          required: ["label"]
        },
        default: []
      }
    }
  },
  presets: [
    {
      name: "Soft-tissue to bone",
      params: {
        orientation: "v",
        layers: [
          { label: "skin" },
          { label: "fat", hatch: true },
          { label: "muscle" },
          { label: "periosteum" },
          { label: "bone" }
        ]
      }
    }
  ]
};
function hatchBand(x, y, w, h) {
  const lines = [];
  const step = 12;
  const x0Start = x - h;
  const x0End = x + w;
  for (let x0 = x0Start; x0 <= x0End; x0 += step) {
    let p1x = x0;
    let p1y = y;
    let p2x = x0 + h;
    let p2y = y + h;
    if (p1x < x) {
      p1x = x;
      p1y = y + (x - x0);
    }
    if (p2x > x + w) {
      p2x = x + w;
      p2y = y + (x + w - x0);
    }
    if (p1y > y + h || p2y < y || p1x > p2x) continue;
    const round14 = (n) => Math.round(n * 100) / 100;
    lines.push(line({
      x1: round14(p1x),
      y1: round14(p1y),
      x2: round14(p2x),
      y2: round14(p2y),
      stroke: "var(--ink-dim)",
      width: 1
    }));
  }
  return el("g", {}, lines);
}
function build3(params = {}, opts = { animate: "draw" }) {
  const { orientation = "v", layers = [] } = params || {};
  const animate = opts && opts.animate || "draw";
  const vertical = orientation !== "h";
  const list = Array.isArray(layers) ? layers.filter(Boolean) : [];
  const weights = list.map((l) => typeof l.thickness === "number" && l.thickness > 0 ? l.thickness : 1);
  const total = weights.reduce((a, b) => a + b, 0) || 1;
  const stackX = PAD2;
  const stackY = PAD2;
  const stackW = vertical ? VB_W2 - PAD2 * 2 - 110 : VB_W2 - PAD2 * 2;
  const stackH = vertical ? VB_H2 - PAD2 * 2 : VB_H2 - PAD2 * 2 - 60;
  const parts = [];
  let cursor = 0;
  for (let i = 0; i < list.length; i++) {
    const layer = list[i];
    const frac = weights[i] / total;
    let x;
    let y;
    let w;
    let h;
    if (vertical) {
      const band = frac * stackH;
      x = stackX;
      y = stackY + cursor;
      w = stackW;
      h = band;
      cursor += band;
    } else {
      const band = frac * stackW;
      x = stackX + cursor;
      y = stackY;
      w = band;
      h = stackH;
      cursor += band;
    }
    const round14 = (n) => Math.round(n * 100) / 100;
    parts.push(rect({
      x: round14(x),
      y: round14(y),
      w: round14(w),
      h: round14(h),
      class: "fig-stroke",
      width: 2
    }));
    if (layer.hatch) parts.push(hatchBand(x, y, w, h));
    if (vertical) {
      const my = y + h / 2;
      const lx = stackX + stackW + LABEL_GAP;
      parts.push(leader([stackX + stackW, my], [lx, my]));
      parts.push(label(layer.label ?? "", lx + 4, round14(my) + 4, { size: 13 }));
    } else {
      const mx = x + w / 2;
      const ly = stackY + stackH + LABEL_GAP;
      parts.push(leader([mx, stackY + stackH], [mx, ly]));
      parts.push(label(layer.label ?? "", round14(mx), round14(ly) + 14, { anchor: "middle", size: 12 }));
    }
  }
  const styleCss = animate === "draw" ? drawCss(".fig-stroke") : "";
  const svg2 = sanitise(svgWrap(parts.join(""), viewBox(VB_W2, VB_H2), styleCss));
  return { svg: svg2, supportsDraw: true, motion: null };
}

// server/figures/annotation-arrows.js
var annotation_arrows_exports = {};
__export(annotation_arrows_exports, {
  build: () => build4,
  meta: () => meta4
});
var round = (n) => Math.round(n * 100) / 100;
var meta4 = {
  id: "annotation-arrows",
  name: "Annotation arrows",
  category: "Direction",
  description: "Force / motion / highlight arrows over a base region; sizes to a viewBox so it can overlay an image.",
  paramsSchema: {
    type: "object",
    properties: {
      viewBox: {
        type: "array",
        items: { type: "number" },
        minItems: 2,
        maxItems: 2,
        default: [400, 300]
      },
      frame: { type: "boolean", default: false },
      arrows: {
        type: "array",
        items: {
          type: "object",
          properties: {
            from: { type: "array", items: { type: "number" }, minItems: 2, maxItems: 2 },
            to: { type: "array", items: { type: "number" }, minItems: 2, maxItems: 2 },
            label: { type: "string" },
            kind: { type: "string", enum: ["force", "motion", "highlight"], default: "force" }
          },
          required: ["from", "to"]
        },
        default: []
      }
    }
  },
  presets: [
    {
      name: "Pull & rotate",
      params: {
        viewBox: [400, 300],
        arrows: [
          { from: [60, 250], to: [200, 120], label: "pull", kind: "force" },
          { from: [340, 250], to: [210, 140], kind: "motion", label: "rotate" }
        ]
      }
    }
  ]
};
function arrowhead(x1, y1, x2, y2, { stroke = "var(--ink)", width, size = 8 } = {}) {
  const ang = Math.atan2(y2 - y1, x2 - x1);
  const spread = 0.5;
  const ax = x2 - size * Math.cos(ang - spread);
  const ay = y2 - size * Math.sin(ang - spread);
  const bx = x2 - size * Math.cos(ang + spread);
  const by = y2 - size * Math.sin(ang + spread);
  return poly([[round(ax), round(ay)], [round(x2), round(y2)], [round(bx), round(by)]], { stroke, width });
}
function annotated(a) {
  const [x1, y1] = Array.isArray(a.from) ? a.from : [0, 0];
  const [x2, y2] = Array.isArray(a.to) ? a.to : [0, 0];
  const kind = a.kind || "force";
  const parts = [];
  if (kind === "motion") {
    const mx = (x1 + x2) / 2;
    const my = (y1 + y2) / 2;
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len2 = Math.hypot(dx, dy) || 1;
    const bow = Math.min(len2 * 0.3, 60);
    const cx = mx - dy / len2 * bow;
    const cy = my + dx / len2 * bow;
    const d = `M ${round(x1)} ${round(y1)} Q ${round(cx)} ${round(cy)} ${round(x2)} ${round(y2)}`;
    parts.push(path(d, { class: "fig-stroke", width: 2, "stroke-dasharray": "6 5" }));
    parts.push(arrowhead(cx, cy, x2, y2, { width: 2 }));
  } else if (kind === "highlight") {
    parts.push(line({
      x1: round(x1),
      y1: round(y1),
      x2: round(x2),
      y2: round(y2),
      class: "fig-stroke",
      width: 1
    }));
    parts.push(circle({
      cx: round(x2),
      cy: round(y2),
      r: 5,
      stroke: "var(--cyan)",
      width: 2,
      class: "fig-stroke"
    }));
  } else {
    parts.push(line({
      x1: round(x1),
      y1: round(y1),
      x2: round(x2),
      y2: round(y2),
      class: "fig-stroke",
      width: 3
    }));
    parts.push(arrowhead(x1, y1, x2, y2, { width: 3 }));
  }
  if (a.label != null && a.label !== "") {
    const onLeft = x2 < x1;
    parts.push(label(a.label, round(x2 + (onLeft ? -8 : 8)), round(y2 - 8), {
      anchor: onLeft ? "end" : "start",
      size: 12
    }));
  }
  return el("g", {}, parts);
}
function build4(params = {}, opts = { animate: "draw" }) {
  const { viewBox: vb, frame: frame2 = false, arrows = [] } = params || {};
  const animate = opts && opts.animate || "draw";
  const [W4, H5] = Array.isArray(vb) && vb.length === 2 ? vb : [400, 300];
  const list = Array.isArray(arrows) ? arrows.filter(Boolean) : [];
  const parts = [];
  if (frame2) parts.push(panel({ x: 1, y: 1, w: W4 - 2, h: H5 - 2, rx: 4 }));
  for (const a of list) parts.push(annotated(a));
  const styleCss = animate === "draw" ? drawCss(".fig-stroke") : "";
  const svg2 = sanitise(svgWrap(parts.join(""), viewBox(W4, H5), styleCss));
  return { svg: svg2, supportsDraw: true, motion: null };
}

// server/figures/timeline.js
var timeline_exports = {};
__export(timeline_exports, {
  build: () => build5,
  meta: () => meta5
});
var VB_W3 = 480;
var VB_H3 = 220;
var PAD3 = 40;
var AXIS_Y = VB_H3 / 2;
var TICK = 6;
var round2 = (n) => Math.round(n * 100) / 100;
var meta5 = {
  id: "timeline",
  name: "Timeline",
  category: "Process",
  description: "A horizontal time axis with tick marks; events plotted as markers with labels alternating above and below.",
  paramsSchema: {
    type: "object",
    properties: {
      showAxis: { type: "boolean", default: true },
      events: {
        type: "array",
        items: {
          type: "object",
          properties: {
            at: { type: "number", minimum: 0, maximum: 1 },
            label: { type: "string" }
          },
          required: ["label"]
        },
        default: []
      }
    }
  },
  presets: [
    {
      name: "Fracture healing",
      params: {
        events: [
          { label: "Injury" },
          { label: "Reduction" },
          { label: "Union" },
          { label: "Remodelling" }
        ]
      }
    }
  ]
};
function build5(params = {}, opts = { animate: "draw" }) {
  const { events = [], showAxis = true } = params || {};
  const animate = opts && opts.animate || "draw";
  const list = Array.isArray(events) ? events.filter(Boolean) : [];
  const n = list.length;
  const axisX1 = PAD3;
  const axisX2 = VB_W3 - PAD3;
  const span = axisX2 - axisX1;
  const parts = [];
  if (showAxis) {
    parts.push(line({
      x1: axisX1,
      y1: AXIS_Y,
      x2: axisX2,
      y2: AXIS_Y,
      class: "fig-stroke",
      width: 2
    }));
  }
  for (let i = 0; i < n; i++) {
    const ev = list[i];
    const frac = typeof ev.at === "number" && ev.at >= 0 && ev.at <= 1 ? ev.at : n === 1 ? 0.5 : i / (n - 1);
    const x = round2(axisX1 + frac * span);
    parts.push(line({
      x1: x,
      y1: AXIS_Y - TICK,
      x2: x,
      y2: AXIS_Y + TICK,
      class: "fig-stroke",
      width: 2
    }));
    parts.push(circle({
      cx: x,
      cy: AXIS_Y,
      r: 4,
      stroke: "var(--cyan)",
      width: 2,
      fill: "none",
      class: "fig-stroke"
    }));
    const above = i % 2 === 0;
    const leaderY = above ? AXIS_Y - 22 : AXIS_Y + 22;
    parts.push(line({
      x1: x,
      y1: above ? AXIS_Y - TICK : AXIS_Y + TICK,
      x2: x,
      y2: leaderY,
      stroke: "var(--ink-dim)",
      width: 1
    }));
    const textY = above ? leaderY - 6 : leaderY + 14;
    parts.push(label(ev.label ?? "", x, textY, { anchor: "middle", size: 12 }));
  }
  const styleCss = animate === "draw" ? drawCss(".fig-stroke") : "";
  const svg2 = sanitise(svgWrap(parts.join(""), viewBox(VB_W3, VB_H3), styleCss));
  return { svg: svg2, supportsDraw: true, motion: null };
}

// server/figures/cycle.js
var cycle_exports = {};
__export(cycle_exports, {
  build: () => build6,
  meta: () => meta6
});
var VB = 360;
var CX2 = VB / 2;
var CY2 = VB / 2;
var RING = 110;
var NODE_R = 18;
var LABEL_R = RING + NODE_R + 18;
var round3 = (n) => Math.round(n * 100) / 100;
var meta6 = {
  id: "cycle",
  name: "Cycle",
  category: "Process",
  description: "A looping process: step nodes evenly around a ring, joined by curved clockwise arrows that close the loop.",
  paramsSchema: {
    type: "object",
    properties: {
      steps: {
        type: "array",
        items: {
          type: "object",
          properties: {
            title: { type: "string" }
          },
          required: ["title"]
        },
        default: []
      }
    }
  },
  presets: [
    {
      name: "Bone remodelling",
      params: {
        steps: [
          { title: "Resorption" },
          { title: "Reversal" },
          { title: "Formation" },
          { title: "Mineralisation" }
        ]
      }
    }
  ]
};
function angleAt(i, n) {
  return -Math.PI / 2 + i / n * Math.PI * 2;
}
function build6(params = {}, opts = { animate: "draw" }) {
  const { steps = [] } = params || {};
  const animate = opts && opts.animate || "draw";
  const list = Array.isArray(steps) ? steps.filter(Boolean) : [];
  const n = list.length;
  const parts = [];
  const pos = [];
  for (let i = 0; i < n; i++) {
    const a = angleAt(i, n);
    const cx = round3(CX2 + RING * Math.cos(a));
    const cy = round3(CY2 + RING * Math.sin(a));
    pos.push([cx, cy, a]);
  }
  if (n >= 2) {
    for (let i = 0; i < n; i++) {
      const a0 = angleAt(i, n);
      const a1 = angleAt(i + 1, n);
      const gap = (NODE_R + 6) / RING;
      const s = a0 + gap;
      const e = a1 - gap;
      const sx = round3(CX2 + RING * Math.cos(s));
      const sy = round3(CY2 + RING * Math.sin(s));
      const ePre = e - 0.04;
      const epx = round3(CX2 + RING * Math.cos(ePre));
      const epy = round3(CY2 + RING * Math.sin(ePre));
      const ex = round3(CX2 + RING * Math.cos(e));
      const ey = round3(CY2 + RING * Math.sin(e));
      const am = (s + e) / 2;
      const ctrlR = RING + 26;
      const cpx = round3(CX2 + ctrlR * Math.cos(am));
      const cpy = round3(CY2 + ctrlR * Math.sin(am));
      parts.push(path(`M ${sx} ${sy} Q ${cpx} ${cpy} ${epx} ${epy}`, {
        class: "fig-stroke",
        width: 2
      }));
      parts.push(arrow({
        x1: epx,
        y1: epy,
        x2: ex,
        y2: ey,
        width: 2,
        size: 9,
        class: "fig-stroke"
      }));
    }
  }
  for (let i = 0; i < n; i++) {
    const [cx, cy, a] = pos[i];
    parts.push(circle({
      cx,
      cy,
      r: NODE_R,
      stroke: "var(--cyan)",
      width: 2,
      fill: "none",
      class: "fig-stroke"
    }));
    parts.push(label(String(i + 1), cx, cy + 4, {
      anchor: "middle",
      size: 12,
      fill: "var(--ink-dim)"
    }));
    const lx = round3(CX2 + LABEL_R * Math.cos(a));
    const ly = round3(CY2 + LABEL_R * Math.sin(a));
    const cos = Math.cos(a);
    const anchor = cos > 0.2 ? "start" : cos < -0.2 ? "end" : "middle";
    parts.push(label(list[i].title ?? "", lx, ly + 4, { anchor, size: 13 }));
  }
  const styleCss = animate === "draw" ? drawCss(".fig-stroke") : "";
  const svg2 = sanitise(svgWrap(parts.join(""), viewBox(VB, VB), styleCss));
  return { svg: svg2, supportsDraw: true, motion: null };
}

// server/figures/flow-decision.js
var flow_decision_exports = {};
__export(flow_decision_exports, {
  build: () => build7,
  meta: () => meta7
});
var NODE_W2 = 120;
var NODE_H2 = 50;
var COL_GAP = 40;
var ROW_GAP = 60;
var PAD4 = 24;
var round4 = (n) => Math.round(n * 100) / 100;
var meta7 = {
  id: "flow-decision",
  name: "Flow / decision",
  category: "Process",
  description: "A static algorithm flowchart: action boxes, decision diamonds and start/end pills, auto-laid out top to bottom with labelled branches.",
  paramsSchema: {
    type: "object",
    properties: {
      nodes: {
        type: "array",
        items: {
          type: "object",
          properties: {
            id: { type: "string" },
            text: { type: "string" },
            kind: { type: "string", enum: ["start", "action", "decision", "end"], default: "action" }
          },
          required: ["id", "text"]
        },
        default: []
      },
      edges: {
        type: "array",
        items: {
          type: "object",
          properties: {
            from: { type: "string" },
            to: { type: "string" },
            label: { type: "string" }
          },
          required: ["from", "to"]
        },
        default: []
      }
    }
  },
  presets: [
    {
      name: "Fracture algorithm",
      params: {
        nodes: [
          { id: "a", text: "Fracture", kind: "start" },
          { id: "b", text: "Displaced?", kind: "decision" },
          { id: "c", text: "Reduce", kind: "action" },
          { id: "d", text: "Immobilise", kind: "action" },
          { id: "e", text: "Review", kind: "end" }
        ],
        edges: [
          { from: "a", to: "b" },
          { from: "b", to: "c", label: "yes" },
          { from: "b", to: "d", label: "no" },
          { from: "c", to: "e" },
          { from: "d", to: "e" }
        ]
      }
    }
  ]
};
function assignRows(nodes, edges) {
  const byId2 = new Map(nodes.map((nd) => [nd.id, nd]));
  const adj = new Map(nodes.map((nd) => [nd.id, []]));
  for (const e of edges) {
    if (adj.has(e.from)) adj.get(e.from).push(e.to);
  }
  const start = nodes.find((nd) => nd.kind === "start") || nodes[0];
  const row = /* @__PURE__ */ new Map();
  if (start) {
    const queue = [[start.id, 0]];
    row.set(start.id, 0);
    while (queue.length) {
      const [id, d] = queue.shift();
      for (const to of adj.get(id) || []) {
        if (!byId2.has(to)) continue;
        if (!row.has(to)) {
          row.set(to, d + 1);
          queue.push([to, d + 1]);
        }
      }
    }
  }
  let maxRow = 0;
  for (const r of row.values()) maxRow = Math.max(maxRow, r);
  for (const nd of nodes) {
    if (!row.has(nd.id)) {
      maxRow += 1;
      row.set(nd.id, maxRow);
    }
  }
  return row;
}
function nodeCentre(rowIdx, colIdx, colCount) {
  const totalW = colCount * NODE_W2 + (colCount - 1) * COL_GAP;
  const x0 = PAD4 + (totalW > 0 ? 0 : 0);
  const cx = x0 + colIdx * (NODE_W2 + COL_GAP) + NODE_W2 / 2;
  const cy = PAD4 + rowIdx * (NODE_H2 + ROW_GAP) + NODE_H2 / 2;
  return [cx, cy];
}
function nodeShape(node, cx, cy) {
  const x = cx - NODE_W2 / 2;
  const y = cy - NODE_H2 / 2;
  const kind = node.kind || "action";
  const parts = [];
  if (kind === "decision") {
    const pts = [
      [round4(cx), round4(y)],
      [round4(x + NODE_W2), round4(cy)],
      [round4(cx), round4(y + NODE_H2)],
      [round4(x), round4(cy)],
      [round4(cx), round4(y)]
    ];
    parts.push(poly(pts, { class: "fig-stroke", width: 2 }));
  } else if (kind === "start" || kind === "end") {
    parts.push(rect({
      x: round4(x),
      y: round4(y),
      w: NODE_W2,
      h: NODE_H2,
      rx: NODE_H2 / 2,
      class: "fig-stroke",
      width: 2
    }));
  } else {
    parts.push(rect({
      x: round4(x),
      y: round4(y),
      w: NODE_W2,
      h: NODE_H2,
      rx: 8,
      class: "fig-stroke",
      width: 2
    }));
  }
  parts.push(label(node.text ?? "", round4(cx), round4(cy + 4), { anchor: "middle", size: 12 }));
  return el("g", {}, parts);
}
function exitPoint(cx, cy) {
  return [cx, cy + NODE_H2 / 2];
}
function entryPoint(cx, cy) {
  return [cx, cy - NODE_H2 / 2];
}
function build7(params = {}, opts = { animate: "draw" }) {
  const { nodes = [], edges = [] } = params || {};
  const animate = opts && opts.animate || "draw";
  const nodeList = Array.isArray(nodes) ? nodes.filter((n) => n && n.id != null) : [];
  const edgeList = Array.isArray(edges) ? edges.filter(Boolean) : [];
  const rowOf = assignRows(nodeList, edgeList);
  const rows = /* @__PURE__ */ new Map();
  for (const nd of nodeList) {
    const r = rowOf.get(nd.id);
    if (!rows.has(r)) rows.set(r, []);
    rows.get(r).push(nd);
  }
  const rowKeys = [...rows.keys()].sort((a, b) => a - b);
  const maxCols = Math.max(1, ...rowKeys.map((r) => rows.get(r).length));
  const centre2 = /* @__PURE__ */ new Map();
  rowKeys.forEach((r, rowIdx) => {
    const group = rows.get(r);
    const colCount = group.length;
    const rowW = colCount * NODE_W2 + (colCount - 1) * COL_GAP;
    const fullW2 = maxCols * NODE_W2 + (maxCols - 1) * COL_GAP;
    const offset = (fullW2 - rowW) / 2;
    group.forEach((nd, colIdx) => {
      const [cx0, cy] = nodeCentre(rowIdx, colIdx, colCount);
      centre2.set(nd.id, [round4(cx0 + offset), round4(cy)]);
    });
  });
  const parts = [];
  for (const e of edgeList) {
    const a = centre2.get(e.from);
    const b = centre2.get(e.to);
    if (!a || !b) continue;
    const [, ay] = a;
    const [, by] = b;
    let p1;
    let p2;
    if (by >= ay) {
      p1 = exitPoint(a[0], a[1]);
      p2 = entryPoint(b[0], b[1]);
    } else {
      p1 = entryPoint(a[0], a[1]);
      p2 = exitPoint(b[0], b[1]);
    }
    parts.push(arrow({
      x1: round4(p1[0]),
      y1: round4(p1[1]),
      x2: round4(p2[0]),
      y2: round4(p2[1]),
      label: e.label,
      width: 2,
      class: "fig-stroke"
    }));
  }
  for (const nd of nodeList) {
    const c = centre2.get(nd.id);
    if (!c) continue;
    parts.push(nodeShape(nd, c[0], c[1]));
  }
  const fullW = maxCols * NODE_W2 + (maxCols - 1) * COL_GAP;
  const W4 = PAD4 * 2 + fullW;
  const H5 = PAD4 * 2 + rowKeys.length * NODE_H2 + Math.max(0, rowKeys.length - 1) * ROW_GAP;
  const styleCss = animate === "draw" ? drawCss(".fig-stroke") : "";
  const svg2 = sanitise(svgWrap(parts.join(""), viewBox(round4(W4), round4(H5)), styleCss));
  return { svg: svg2, supportsDraw: true, motion: null };
}

// server/figures/before-after.js
var before_after_exports = {};
__export(before_after_exports, {
  build: () => build8,
  meta: () => meta8
});
var PANEL_W = 150;
var PANEL_H = 120;
var DIVIDER = 56;
var PAD5 = 24;
var LABEL_H = 26;
var round5 = (n) => Math.round(n * 100) / 100;
var meta8 = {
  id: "before-after",
  name: "Before / after",
  category: "Compare",
  description: "Side-by-side labelled panels in a row, separated by a divider line or a right-pointing arrow.",
  paramsSchema: {
    type: "object",
    properties: {
      divider: { type: "string", enum: ["line", "arrow"], default: "arrow" },
      panels: {
        type: "array",
        items: {
          type: "object",
          properties: {
            label: { type: "string" },
            note: { type: "string" }
          },
          required: ["label"]
        },
        default: []
      }
    }
  },
  presets: [
    {
      name: "Reduction",
      params: {
        divider: "arrow",
        panels: [
          { label: "Displaced", note: "pre-reduction" },
          { label: "Reduced", note: "post-reduction" }
        ]
      }
    }
  ]
};
function build8(params = {}, opts = { animate: "draw" }) {
  const { panels = [], divider = "arrow" } = params || {};
  const animate = opts && opts.animate || "draw";
  const list = Array.isArray(panels) ? panels.filter(Boolean) : [];
  const n = Math.max(list.length, 1);
  const top = PAD5 + LABEL_H;
  const parts = [];
  for (let i = 0; i < list.length; i++) {
    const p = list[i];
    const x = PAD5 + i * (PANEL_W + DIVIDER);
    const y = top;
    parts.push(panel({ x, y, w: PANEL_W, h: PANEL_H }));
    parts.push(label(p.label ?? "", round5(x + PANEL_W / 2), y - 8, { anchor: "middle", size: 13 }));
    if (p.note != null && p.note !== "") {
      parts.push(label(p.note, round5(x + PANEL_W / 2), round5(y + PANEL_H / 2 + 4), {
        anchor: "middle",
        size: 12,
        fill: "var(--ink-dim)"
      }));
    }
    if (i < list.length - 1) {
      const cy = y + PANEL_H / 2;
      const gx1 = x + PANEL_W;
      const gx2 = gx1 + DIVIDER;
      if (divider === "line") {
        const mid = round5((gx1 + gx2) / 2);
        parts.push(line({
          x1: mid,
          y1: y + 8,
          x2: mid,
          y2: y + PANEL_H - 8,
          class: "fig-stroke",
          width: 2
        }));
      } else {
        parts.push(arrow({
          x1: round5(gx1 + 8),
          y1: cy,
          x2: round5(gx2 - 8),
          y2: cy,
          width: 2,
          class: "fig-stroke"
        }));
      }
    }
  }
  const W4 = PAD5 * 2 + n * PANEL_W + Math.max(0, n - 1) * DIVIDER;
  const H5 = PAD5 * 2 + LABEL_H + PANEL_H;
  const styleCss = animate === "draw" ? drawCss(".fig-stroke") : "";
  const svg2 = sanitise(svgWrap(parts.join(""), viewBox(W4, H5), styleCss));
  return { svg: svg2, supportsDraw: true, motion: null };
}

// server/figures/comparison-matrix.js
var comparison_matrix_exports = {};
__export(comparison_matrix_exports, {
  build: () => build9,
  meta: () => meta9
});
var CELL_W = 110;
var CELL_H = 48;
var PAD6 = 24;
var round6 = (n) => Math.round(n * 100) / 100;
var meta9 = {
  id: "comparison-matrix",
  name: "Comparison matrix",
  category: "Compare",
  description: "A comparison grid: header columns, row labels, and cells rendered as ticks, crosses or text.",
  paramsSchema: {
    type: "object",
    properties: {
      cols: {
        type: "array",
        items: { type: "string" },
        default: []
      },
      rows: {
        type: "array",
        items: {
          type: "object",
          properties: {
            label: { type: "string" },
            cells: { type: "array", items: { type: "string" } }
          },
          required: ["label"]
        },
        default: []
      }
    }
  },
  presets: [
    {
      name: "Plate vs cast",
      params: {
        cols: ["Strength", "Speed", "Cost"],
        rows: [
          { label: "Plate", cells: ["yes", "no", "no"] },
          { label: "Cast", cells: ["no", "yes", "yes"] }
        ]
      }
    }
  ]
};
function tick(cx, cy) {
  const d = `M ${round6(cx - 8)} ${round6(cy)} L ${round6(cx - 2)} ${round6(cy + 7)} L ${round6(cx + 9)} ${round6(cy - 8)}`;
  return path(d, { stroke: "var(--teal)", width: 2, class: "fig-stroke" });
}
function cross(cx, cy) {
  const s = 7;
  return el("g", {}, [
    line({
      x1: round6(cx - s),
      y1: round6(cy - s),
      x2: round6(cx + s),
      y2: round6(cy + s),
      stroke: "var(--ink-dim)",
      width: 2,
      class: "fig-stroke"
    }),
    line({
      x1: round6(cx - s),
      y1: round6(cy + s),
      x2: round6(cx + s),
      y2: round6(cy - s),
      stroke: "var(--ink-dim)",
      width: 2,
      class: "fig-stroke"
    })
  ]);
}
function build9(params = {}, opts = { animate: "draw" }) {
  const { cols = [], rows = [] } = params || {};
  const animate = opts && opts.animate || "draw";
  const colList = Array.isArray(cols) ? cols : [];
  const rowList = Array.isArray(rows) ? rows.filter(Boolean) : [];
  const nCols = colList.length + 1;
  const nRows = rowList.length + 1;
  const gridW = nCols * CELL_W;
  const gridH = nRows * CELL_H;
  const ox = PAD6;
  const oy = PAD6;
  const parts = [];
  for (let r = 0; r <= nRows; r++) {
    const y = oy + r * CELL_H;
    parts.push(line({
      x1: ox,
      y1: y,
      x2: ox + gridW,
      y2: y,
      stroke: "var(--ink-dim)",
      width: 1
    }));
  }
  for (let c = 0; c <= nCols; c++) {
    const x = ox + c * CELL_W;
    parts.push(line({
      x1: x,
      y1: oy,
      x2: x,
      y2: oy + gridH,
      stroke: "var(--ink-dim)",
      width: 1
    }));
  }
  for (let c = 0; c < colList.length; c++) {
    const cx = ox + (c + 1) * CELL_W + CELL_W / 2;
    const cy = oy + CELL_H / 2 + 4;
    parts.push(label(colList[c] ?? "", round6(cx), round6(cy), { anchor: "middle", size: 12 }));
  }
  for (let r = 0; r < rowList.length; r++) {
    const row = rowList[r];
    const ry = oy + (r + 1) * CELL_H;
    parts.push(label(row.label ?? "", round6(ox + CELL_W / 2), round6(ry + CELL_H / 2 + 4), {
      anchor: "middle",
      size: 12
    }));
    const cells = Array.isArray(row.cells) ? row.cells : [];
    for (let c = 0; c < colList.length; c++) {
      const cell = cells[c];
      const cx = ox + (c + 1) * CELL_W + CELL_W / 2;
      const cy = ry + CELL_H / 2;
      if (cell === "yes") {
        parts.push(tick(cx, cy));
      } else if (cell === "no") {
        parts.push(cross(cx, cy));
      } else if (cell != null && cell !== "") {
        parts.push(label(String(cell), round6(cx), round6(cy + 4), { anchor: "middle", size: 12 }));
      }
    }
  }
  const W4 = PAD6 * 2 + gridW;
  const H5 = PAD6 * 2 + gridH;
  const styleCss = animate === "draw" ? drawCss(".fig-stroke") : "";
  const svg2 = sanitise(svgWrap(parts.join(""), viewBox(W4, H5), styleCss));
  return { svg: svg2, supportsDraw: true, motion: null };
}

// server/figures/venn-overlap.js
var venn_overlap_exports = {};
__export(venn_overlap_exports, {
  build: () => build10,
  meta: () => meta10
});
var VB_W4 = 420;
var VB_H4 = 340;
var R = 95;
var round7 = (n) => Math.round(n * 100) / 100;
var ACCENTS = ["var(--teal)", "var(--cyan)", "var(--violet)"];
var meta10 = {
  id: "venn-overlap",
  name: "Venn overlap",
  category: "Relate",
  description: "Two or three overlapping circles (line-art) with set labels outside and optional labels in the overlap regions.",
  paramsSchema: {
    type: "object",
    properties: {
      sets: {
        type: "array",
        items: {
          type: "object",
          properties: { label: { type: "string" } },
          required: ["label"]
        },
        default: []
      },
      overlaps: {
        type: "array",
        items: {
          type: "object",
          properties: {
            between: { type: "array", items: { type: "number" } },
            label: { type: "string" }
          },
          required: ["between", "label"]
        },
        default: []
      }
    }
  },
  presets: [
    {
      name: "Symptoms",
      params: {
        sets: [{ label: "Pain" }, { label: "Swelling" }, { label: "Deformity" }],
        overlaps: [
          { between: [0, 1], label: "sprain" },
          { between: [0, 1, 2], label: "fracture" }
        ]
      }
    }
  ]
};
function centres(n) {
  const cx = VB_W4 / 2;
  if (n <= 2) {
    const cy = VB_H4 / 2;
    const dx2 = R * 0.62;
    return [[cx - dx2, cy], [cx + dx2, cy]];
  }
  const topY = VB_H4 / 2 - R * 0.42;
  const botY = VB_H4 / 2 + R * 0.72;
  const dx = R * 0.62;
  return [[cx - dx, topY], [cx + dx, topY], [cx, botY]];
}
function outwardLabel(c, vennCx, vennCy) {
  const [x, y] = c;
  const vx = x - vennCx;
  const vy = y - vennCy;
  const len2 = Math.hypot(vx, vy) || 1;
  const off = R + 22;
  return [round7(x + vx / len2 * off), round7(y + vy / len2 * off)];
}
function build10(params = {}, opts = { animate: "draw" }) {
  const { sets = [], overlaps = [] } = params || {};
  const animate = opts && opts.animate || "draw";
  let setList = Array.isArray(sets) ? sets.filter(Boolean) : [];
  if (setList.length < 2) setList = setList.concat(Array(2 - setList.length).fill({ label: "" }));
  if (setList.length > 3) setList = setList.slice(0, 3);
  const n = setList.length;
  const ov = Array.isArray(overlaps) ? overlaps.filter(Boolean) : [];
  const cs = centres(n);
  const vennCx = cs.reduce((a, c) => a + c[0], 0) / n;
  const vennCy = cs.reduce((a, c) => a + c[1], 0) / n;
  const parts = [];
  for (let i = 0; i < n; i++) {
    parts.push(circle({
      cx: round7(cs[i][0]),
      cy: round7(cs[i][1]),
      r: R,
      stroke: ACCENTS[i % ACCENTS.length],
      width: 2,
      fill: "none",
      class: "fig-stroke"
    }));
  }
  for (let i = 0; i < n; i++) {
    const [lx, ly] = outwardLabel(cs[i], vennCx, vennCy);
    parts.push(label(setList[i].label ?? "", lx, round7(ly + 4), { anchor: "middle", size: 13 }));
  }
  for (const o of ov) {
    const between = Array.isArray(o.between) ? o.between.filter((k) => k >= 0 && k < n) : [];
    if (o.label == null || o.label === "") continue;
    if (between.length === 2) {
      const [a, b] = between;
      const mx = round7((cs[a][0] + cs[b][0]) / 2);
      const my = round7((cs[a][1] + cs[b][1]) / 2);
      parts.push(label(o.label, mx, my + 4, { anchor: "middle", size: 12, fill: "var(--ink-dim)" }));
    } else if (between.length === 3 && n === 3) {
      parts.push(label(o.label, round7(vennCx), round7(vennCy + 4), {
        anchor: "middle",
        size: 12,
        fill: "var(--ink-dim)"
      }));
    }
  }
  const styleCss = animate === "draw" ? drawCss(".fig-stroke") : "";
  const svg2 = sanitise(svgWrap(parts.join(""), viewBox(VB_W4, VB_H4), styleCss));
  return { svg: svg2, supportsDraw: true, motion: null };
}

// server/figures/hierarchy.js
var hierarchy_exports = {};
__export(hierarchy_exports, {
  build: () => build11,
  meta: () => meta11
});
var NODE_W3 = 110;
var NODE_H3 = 40;
var COL_GAP2 = 28;
var ROW_GAP2 = 56;
var PAD7 = 24;
var SLOT = NODE_W3 + COL_GAP2;
var round8 = (n) => Math.round(n * 100) / 100;
var meta11 = {
  id: "hierarchy",
  name: "Hierarchy",
  category: "Relate",
  description: "A top-down tree / taxonomy: nodes auto-laid out by depth, parents centred over their children.",
  paramsSchema: {
    type: "object",
    properties: {
      root: {
        type: "object",
        properties: {
          label: { type: "string" },
          children: { type: "array" }
          // recursive: each item is the same node shape
        },
        required: ["label"]
      }
    }
  },
  presets: [
    {
      name: "Fracture taxonomy",
      params: {
        root: {
          label: "Fracture",
          children: [
            { label: "Open" },
            {
              label: "Closed",
              children: [
                { label: "Displaced" },
                { label: "Undisplaced" }
              ]
            }
          ]
        }
      }
    }
  ]
};
function layout(node, depth, state) {
  if (!node || typeof node !== "object") return null;
  const kids = Array.isArray(node.children) ? node.children.filter(Boolean) : [];
  const placed = { label: node.label ?? "", depth, children: [] };
  if (kids.length === 0) {
    placed.slot = state.next;
    state.next += 1;
  } else {
    for (const k of kids) {
      const child = layout(k, depth + 1, state);
      if (child) placed.children.push(child);
    }
    if (placed.children.length === 0) {
      placed.slot = state.next;
      state.next += 1;
    } else {
      const first = placed.children[0].slot;
      const last = placed.children[placed.children.length - 1].slot;
      placed.slot = (first + last) / 2;
    }
  }
  state.maxDepth = Math.max(state.maxDepth, depth);
  return placed;
}
function centre(node) {
  const cx = PAD7 + node.slot * SLOT + NODE_W3 / 2;
  const cy = PAD7 + node.depth * (NODE_H3 + ROW_GAP2) + NODE_H3 / 2;
  return [cx, cy];
}
function emit(node, parts) {
  const [cx, cy] = centre(node);
  for (const child of node.children) {
    const [kx, ky] = centre(child);
    parts.push(line({
      x1: round8(cx),
      y1: round8(cy + NODE_H3 / 2),
      x2: round8(kx),
      y2: round8(ky - NODE_H3 / 2),
      stroke: "var(--ink-dim)",
      width: 1
    }));
  }
  for (const child of node.children) emit(child, parts);
}
function emitNodes(node, parts) {
  const [cx, cy] = centre(node);
  const x = cx - NODE_W3 / 2;
  const y = cy - NODE_H3 / 2;
  parts.push(el("g", {}, [
    rect({ x: round8(x), y: round8(y), w: NODE_W3, h: NODE_H3, rx: 8, class: "fig-stroke", width: 2 }),
    label(node.label ?? "", round8(cx), round8(cy + 4), { anchor: "middle", size: 12 })
  ]));
  for (const child of node.children) emitNodes(child, parts);
}
function build11(params = {}, opts = { animate: "draw" }) {
  const { root } = params || {};
  const animate = opts && opts.animate || "draw";
  const state = { next: 0, maxDepth: 0 };
  const tree = layout(root || { label: "" }, 0, state);
  const leafCount = Math.max(state.next, 1);
  const parts = [];
  if (tree) {
    emit(tree, parts);
    emitNodes(tree, parts);
  }
  const W4 = PAD7 * 2 + leafCount * SLOT - COL_GAP2;
  const H5 = PAD7 * 2 + (state.maxDepth + 1) * NODE_H3 + state.maxDepth * ROW_GAP2;
  const styleCss = animate === "draw" ? drawCss(".fig-stroke") : "";
  const svg2 = sanitise(svgWrap(parts.join(""), viewBox(round8(W4), round8(H5)), styleCss));
  return { svg: svg2, supportsDraw: true, motion: null };
}

// server/figures/bar-compare.js
var bar_compare_exports = {};
__export(bar_compare_exports, {
  build: () => build12,
  meta: () => meta12
});
var PAD8 = 24;
var round9 = (n) => Math.round(n * 100) / 100;
var H_LABEL_W = 84;
var H_TRACK = 240;
var H_BAR_H = 26;
var H_GAP = 22;
var H_VALUE_W = 44;
var V_BAR_W = 56;
var V_GAP = 28;
var V_TRACK = 180;
var V_LABEL_H = 22;
var V_VALUE_H = 18;
var meta12 = {
  id: "bar-compare",
  name: "Bar compare",
  category: "Quantity",
  description: "An annotated line-art bar chart: outlined bars scaled to a max, each labelled with its name and value.",
  paramsSchema: {
    type: "object",
    properties: {
      orientation: { type: "string", enum: ["h", "v"], default: "h" },
      max: { type: "number" },
      note: { type: "string" },
      bars: {
        type: "array",
        items: {
          type: "object",
          properties: {
            label: { type: "string" },
            value: { type: "number" }
          },
          required: ["label", "value"]
        },
        default: []
      }
    }
  },
  presets: [
    {
      name: "Union rate",
      params: {
        bars: [
          { label: "Plate", value: 92 },
          { label: "Cast", value: 68 }
        ],
        note: "union rate (%)"
      }
    },
    {
      name: "Vertical counts",
      params: {
        orientation: "v",
        bars: [
          { label: "Stable", value: 14 },
          { label: "Unstable", value: 6 },
          { label: "Revised", value: 2 }
        ]
      }
    }
  ]
};
function build12(params = {}, opts = { animate: "draw" }) {
  const {
    bars = [],
    orientation = "h",
    note,
    max
  } = params || {};
  const animate = opts && opts.animate || "draw";
  const horizontal = orientation !== "v";
  const list = Array.isArray(bars) ? bars.filter(Boolean) : [];
  const n = Math.max(list.length, 1);
  const values = list.map((b) => Number(b.value) || 0);
  const scaleMax = typeof max === "number" && max > 0 ? max : Math.max(1, ...values);
  const parts = [];
  const hasNote = note != null && note !== "";
  if (horizontal) {
    const ox2 = PAD8 + H_LABEL_W;
    const oy = PAD8;
    for (let i = 0; i < list.length; i++) {
      const b = list[i];
      const v = Number(b.value) || 0;
      const w = round9(Math.max(0, v / scaleMax * H_TRACK));
      const y = oy + i * (H_BAR_H + H_GAP);
      const midY = round9(y + H_BAR_H / 2 + 4);
      parts.push(label(b.label ?? "", PAD8, midY, { size: 12, fill: "var(--ink-dim)" }));
      parts.push(rect({
        x: ox2,
        y,
        w: Math.max(w, 1),
        h: H_BAR_H,
        rx: 3,
        class: "fig-stroke",
        width: 2
      }));
      parts.push(label(String(v), round9(ox2 + w + 8), midY, { size: 12 }));
    }
    const W5 = PAD8 * 2 + H_LABEL_W + H_TRACK + H_VALUE_W;
    const H6 = PAD8 * 2 + n * H_BAR_H + (n - 1) * H_GAP + (hasNote ? 24 : 0);
    if (hasNote) {
      parts.push(label(note, PAD8, round9(H6 - PAD8 + 4), { size: 12, fill: "var(--ink-dim)" }));
    }
    const styleCss2 = animate === "draw" ? drawCss(".fig-stroke") : "";
    const svg3 = sanitise(svgWrap(parts.join(""), viewBox(W5, H6), styleCss2));
    return { svg: svg3, supportsDraw: true, motion: null };
  }
  const ox = PAD8;
  const baselineY = PAD8 + V_VALUE_H + V_TRACK;
  for (let i = 0; i < list.length; i++) {
    const b = list[i];
    const v = Number(b.value) || 0;
    const h = round9(Math.max(1, v / scaleMax * V_TRACK));
    const x = ox + i * (V_BAR_W + V_GAP);
    const y = round9(baselineY - h);
    const cx = round9(x + V_BAR_W / 2);
    parts.push(label(String(v), cx, round9(y - 6), { size: 12, anchor: "middle" }));
    parts.push(rect({
      x,
      y,
      w: V_BAR_W,
      h,
      rx: 3,
      class: "fig-stroke",
      width: 2
    }));
    parts.push(label(b.label ?? "", cx, round9(baselineY + 16), {
      size: 12,
      anchor: "middle",
      fill: "var(--ink-dim)"
    }));
  }
  const axisW = n * V_BAR_W + (n - 1) * V_GAP;
  parts.push(line({
    x1: ox,
    y1: baselineY,
    x2: ox + axisW,
    y2: baselineY,
    stroke: "var(--ink-dim)",
    width: 1
  }));
  const W4 = PAD8 * 2 + axisW;
  const H5 = baselineY + V_LABEL_H + PAD8 + (hasNote ? 24 : 0);
  if (hasNote) {
    parts.push(label(note, PAD8, round9(H5 - PAD8 + 4), { size: 12, fill: "var(--ink-dim)" }));
  }
  const styleCss = animate === "draw" ? drawCss(".fig-stroke") : "";
  const svg2 = sanitise(svgWrap(parts.join(""), viewBox(W4, H5), styleCss));
  return { svg: svg2, supportsDraw: true, motion: null };
}

// server/figures/part-to-whole.js
var part_to_whole_exports = {};
__export(part_to_whole_exports, {
  build: () => build13,
  meta: () => meta13
});
var round10 = (n) => Math.round(n * 100) / 100;
var COLOURS = ["var(--teal)", "var(--cyan)", "var(--violet)", "var(--ink)"];
var colourAt = (i) => COLOURS[i % COLOURS.length];
var VB_W5 = 420;
var VB_H5 = 300;
var meta13 = {
  id: "part-to-whole",
  name: "Part to whole",
  category: "Quantity",
  description: "Proportions of a whole as a donut, a stacked bar or a waffle grid, with a percentage legend.",
  paramsSchema: {
    type: "object",
    properties: {
      style: { type: "string", enum: ["donut", "stacked", "waffle"], default: "donut" },
      segments: {
        type: "array",
        items: {
          type: "object",
          properties: {
            label: { type: "string" },
            value: { type: "number" }
          },
          required: ["label", "value"]
        },
        default: []
      }
    }
  },
  presets: [
    {
      name: "Outcomes (waffle)",
      params: {
        segments: [
          { label: "Union", value: 7 },
          { label: "Delayed", value: 1 }
        ],
        style: "waffle"
      }
    },
    {
      name: "Outcomes (donut)",
      params: {
        segments: [
          { label: "Union", value: 7 },
          { label: "Delayed", value: 1 }
        ],
        style: "donut"
      }
    }
  ]
};
function normalise(segments) {
  const list = (Array.isArray(segments) ? segments : []).filter(Boolean).map((s) => ({ label: s.label ?? "", value: Math.max(0, Number(s.value) || 0) }));
  const total = list.reduce((acc, s) => acc + s.value, 0) || 1;
  return list.map((s, i) => ({
    ...s,
    frac: s.value / total,
    pct: Math.round(s.value / total * 100),
    colour: colourAt(i)
  }));
}
function ringPoint(cx, cy, r, angle) {
  return [round10(cx + r * Math.cos(angle)), round10(cy + r * Math.sin(angle))];
}
function legend(segs, x, y) {
  const out = [];
  const lineH = 22;
  for (let i = 0; i < segs.length; i++) {
    const s = segs[i];
    const ly = y + i * lineH;
    out.push(line({
      x1: x,
      y1: ly,
      x2: x + 18,
      y2: ly,
      stroke: s.colour,
      width: 3,
      class: "fig-stroke"
    }));
    out.push(label(`${s.label} ${s.pct}%`, x + 26, round10(ly + 4), { size: 12 }));
  }
  return out;
}
function buildDonut(segs) {
  const cx = 150;
  const cy = VB_H5 / 2;
  const r = 78;
  const parts = [];
  parts.push(circle({
    cx,
    cy,
    r,
    stroke: "var(--ink-dim)",
    width: 12
  }));
  let start = -Math.PI / 2;
  for (let i = 0; i < segs.length; i++) {
    const s = segs[i];
    const sweep = s.frac * Math.PI * 2;
    const end = start + sweep;
    const [x1, y1] = ringPoint(cx, cy, r, start);
    const [x2, y2] = ringPoint(cx, cy, r, end);
    const largeArc = sweep > Math.PI ? 1 : 0;
    const d = `M ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2}`;
    parts.push(path(d, {
      stroke: s.colour,
      width: 12,
      class: "fig-stroke",
      "stroke-linecap": "butt"
    }));
    start = end;
  }
  parts.push(...legend(segs, 280, cy - segs.length * 11));
  return parts;
}
function buildStacked(segs) {
  const x0 = 40;
  const y0 = 70;
  const barW = 340;
  const barH = 44;
  const parts = [];
  parts.push(rect({
    x: x0,
    y: y0,
    w: barW,
    h: barH,
    rx: 4,
    class: "fig-stroke",
    width: 2
  }));
  let cx = x0;
  for (let i = 0; i < segs.length; i++) {
    const s = segs[i];
    const w = round10(s.frac * barW);
    parts.push(line({
      x1: round10(cx),
      y1: y0 + 6,
      x2: round10(cx + w),
      y2: y0 + 6,
      stroke: s.colour,
      width: 4,
      class: "fig-stroke"
    }));
    if (i < segs.length - 1) {
      parts.push(line({
        x1: round10(cx + w),
        y1: y0,
        x2: round10(cx + w),
        y2: y0 + barH,
        stroke: "var(--ink-dim)",
        width: 1
      }));
    }
    cx += w;
  }
  parts.push(...legend(segs, x0, y0 + barH + 36));
  return parts;
}
function buildWaffle(segs) {
  const cols = 10;
  const rows = 10;
  const total = cols * rows;
  const cell = 22;
  const x0 = 40;
  const y0 = 30;
  const parts = [];
  const counts = segs.map((s) => Math.floor(s.frac * total));
  let assigned = counts.reduce((a, b) => a + b, 0);
  const rema = segs.map((s, i) => ({ i, rem: s.frac * total - counts[i] })).sort((a, b) => b.rem - a.rem);
  let k = 0;
  while (assigned < total && segs.length > 0) {
    counts[rema[k % rema.length].i] += 1;
    assigned += 1;
    k += 1;
  }
  const cellColour = [];
  for (let i = 0; i < segs.length; i++) {
    for (let c = 0; c < counts[i]; c++) cellColour.push(segs[i].colour);
  }
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const idx = r * cols + c;
      const x = x0 + c * cell;
      const y = y0 + r * cell;
      const colour = cellColour[idx] || "var(--ink-dim)";
      parts.push(rect({
        x,
        y,
        w: cell - 4,
        h: cell - 4,
        rx: 2,
        stroke: colour,
        width: 2,
        class: "fig-stroke"
      }));
    }
  }
  parts.push(...legend(segs, x0 + cols * cell + 16, y0 + 8));
  return parts;
}
function build13(params = {}, opts = { animate: "draw" }) {
  const { segments = [], style = "donut" } = params || {};
  const animate = opts && opts.animate || "draw";
  const segs = normalise(segments);
  let parts;
  if (style === "stacked") parts = buildStacked(segs);
  else if (style === "waffle") parts = buildWaffle(segs);
  else parts = buildDonut(segs);
  const styleCss = animate === "draw" ? drawCss(".fig-stroke") : "";
  const svg2 = sanitise(svgWrap(parts.join(""), viewBox(VB_W5, VB_H5), styleCss));
  return { svg: svg2, supportsDraw: true, motion: null };
}

// server/figures/range-scale.js
var range_scale_exports = {};
__export(range_scale_exports, {
  build: () => build14,
  meta: () => meta14
});
var VB_W6 = 480;
var VB_H6 = 180;
var AX_X0 = 48;
var AX_X1 = 432;
var AX_Y = 110;
var round11 = (n) => Math.round(n * 100) / 100;
var meta14 = {
  id: "range-scale",
  name: "Range scale",
  category: "Quantity",
  description: "A labelled horizontal scale with ticks, shaded bands and value markers.",
  paramsSchema: {
    type: "object",
    properties: {
      min: { type: "number", default: 0 },
      max: { type: "number", default: 100 },
      unit: { type: "string" },
      markers: {
        type: "array",
        items: {
          type: "object",
          properties: {
            value: { type: "number" },
            label: { type: "string" }
          },
          required: ["value"]
        },
        default: []
      },
      bands: {
        type: "array",
        items: {
          type: "object",
          properties: {
            from: { type: "number" },
            to: { type: "number" },
            label: { type: "string" }
          },
          required: ["from", "to"]
        },
        default: []
      }
    }
  },
  presets: [
    {
      name: "Range of motion",
      params: {
        min: 0,
        max: 180,
        unit: "\xB0",
        bands: [{ from: 0, to: 30, label: "normal" }],
        markers: [{ value: 45, label: "this patient" }]
      }
    }
  ]
};
function build14(params = {}, opts = { animate: "draw" }) {
  const {
    min = 0,
    max = 100,
    unit = "",
    markers = [],
    bands = []
  } = params || {};
  const animate = opts && opts.animate || "draw";
  const lo = Number(min) || 0;
  const hi = (Number(max) || 0) > lo ? Number(max) : lo + 1;
  const span = hi - lo;
  const u = unit == null ? "" : String(unit);
  const xOf = (v) => round11(AX_X0 + (Number(v) - lo) / span * (AX_X1 - AX_X0));
  const parts = [];
  const bandList = Array.isArray(bands) ? bands.filter(Boolean) : [];
  for (const b of bandList) {
    const bx1 = xOf(b.from);
    const bx2 = xOf(b.to);
    const by = AX_Y - 26;
    const d = `M ${bx1} ${round11(by + 8)} L ${bx1} ${by} L ${bx2} ${by} L ${bx2} ${round11(by + 8)}`;
    parts.push(path(d, { stroke: "var(--ink-dim)", width: 1.5 }));
    if (b.label != null && b.label !== "") {
      parts.push(label(b.label, round11((bx1 + bx2) / 2), round11(by - 6), {
        anchor: "middle",
        size: 11,
        fill: "var(--ink-dim)"
      }));
    }
  }
  parts.push(line({
    x1: AX_X0,
    y1: AX_Y,
    x2: AX_X1,
    y2: AX_Y,
    class: "fig-stroke",
    width: 2
  }));
  const TICKS = 4;
  for (let i = 0; i <= TICKS; i++) {
    const v = lo + span * i / TICKS;
    const tx = xOf(v);
    parts.push(line({
      x1: tx,
      y1: AX_Y,
      x2: tx,
      y2: AX_Y + 8,
      stroke: "var(--ink-dim)",
      width: 1
    }));
    const txt = `${Math.round(v * 10) / 10}${u}`;
    parts.push(label(txt, tx, AX_Y + 24, { anchor: "middle", size: 11, fill: "var(--ink-dim)" }));
  }
  const markerList = Array.isArray(markers) ? markers.filter(Boolean) : [];
  for (const m of markerList) {
    const mx = xOf(m.value);
    const top = AX_Y - 14;
    const d = `M ${round11(mx - 6)} ${top} L ${round11(mx + 6)} ${top} L ${mx} ${AX_Y} Z`;
    parts.push(path(d, { stroke: "var(--teal)", width: 2, class: "fig-stroke" }));
    if (m.label != null && m.label !== "") {
      parts.push(label(m.label, mx, round11(top - 6), { anchor: "middle", size: 12 }));
    }
  }
  const styleCss = animate === "draw" ? drawCss(".fig-stroke") : "";
  const svg2 = sanitise(svgWrap(parts.join(""), viewBox(VB_W6, VB_H6), styleCss));
  return { svg: svg2, supportsDraw: true, motion: null };
}

// server/figures/small-multiples.js
var small_multiples_exports = {};
__export(small_multiples_exports, {
  build: () => build15,
  meta: () => meta15
});
var PAD9 = 24;
var CELL_W2 = 130;
var CELL_H2 = 100;
var GAP2 = 18;
var round12 = (n) => Math.round(n * 100) / 100;
var meta15 = {
  id: "small-multiples",
  name: "Small multiples",
  category: "Variation",
  description: "A grid of mini-figures: small bordered panels each with a label and a variant-driven mini-glyph.",
  paramsSchema: {
    type: "object",
    properties: {
      cols: { type: "number", default: 3 },
      items: {
        type: "array",
        items: {
          type: "object",
          properties: {
            label: { type: "string" },
            variant: { type: "number" }
          },
          required: ["label"]
        },
        default: []
      }
    }
  },
  presets: [
    {
      name: "Stages",
      params: {
        cols: 3,
        items: [
          { label: "Stage 1", variant: 1 },
          { label: "Stage 2", variant: 2 },
          { label: "Stage 3", variant: 3 }
        ]
      }
    }
  ]
};
function glyph(variant, cx, cy) {
  const v = Math.max(1, Math.min(5, Math.round(Number(variant) || 1)));
  const out = [];
  const r = 5;
  const step = 16;
  const startX = cx - (v - 1) * step / 2;
  for (let i = 0; i < v; i++) {
    out.push(circle({
      cx: round12(startX + i * step),
      cy,
      r,
      stroke: "var(--teal)",
      width: 2,
      class: "fig-stroke"
    }));
  }
  return out;
}
function build15(params = {}, opts = { animate: "draw" }) {
  const { cols = 3, items = [] } = params || {};
  const animate = opts && opts.animate || "draw";
  const list = Array.isArray(items) ? items.filter(Boolean) : [];
  const nCols = Math.max(1, Math.round(Number(cols) || 3));
  const n = Math.max(list.length, 1);
  const nRows = Math.max(1, Math.ceil(list.length / nCols) || 1);
  const parts = [];
  for (let i = 0; i < list.length; i++) {
    const it = list[i];
    const col = i % nCols;
    const row = Math.floor(i / nCols);
    const x = PAD9 + col * (CELL_W2 + GAP2);
    const y = PAD9 + row * (CELL_H2 + GAP2);
    const cx = round12(x + CELL_W2 / 2);
    parts.push(panel({ x, y, w: CELL_W2, h: CELL_H2 }));
    parts.push(...glyph(it.variant, cx, round12(y + CELL_H2 * 0.42)));
    parts.push(label(it.label ?? "", cx, round12(y + CELL_H2 - 18), { anchor: "middle", size: 12 }));
  }
  const usedCols = Math.min(nCols, n);
  const W4 = PAD9 * 2 + usedCols * CELL_W2 + (usedCols - 1) * GAP2;
  const H5 = PAD9 * 2 + nRows * CELL_H2 + (nRows - 1) * GAP2;
  const styleCss = animate === "draw" ? drawCss(".fig-stroke") : "";
  const svg2 = sanitise(svgWrap(parts.join(""), viewBox(W4, H5), styleCss));
  return { svg: svg2, supportsDraw: true, motion: null };
}

// server/figures/pulse.js
var pulse_exports = {};
__export(pulse_exports, {
  build: () => build16,
  meta: () => meta16
});
var meta16 = {
  id: "pulse",
  name: "Pulse",
  category: "Motion",
  description: "A subject that rhythmically expands and contracts (heartbeat-style loop).",
  paramsSchema: {
    type: "object",
    properties: {
      shape: { type: "string", enum: ["circle", "heart"], default: "circle" },
      rate: { type: "number", default: 1.2, description: "Seconds per pulse cycle." },
      amplitude: { type: "number", default: 1.15, description: "Peak scale factor." }
    }
  },
  presets: [
    { name: "Steady pulse", params: { shape: "circle", rate: 1.2, amplitude: 1.15 } },
    { name: "Heartbeat", params: { shape: "heart", rate: 1, amplitude: 1.2 } }
  ]
};
function heart() {
  const d = "M120 156 C 92 132 72 116 72 96 C 72 80 84 70 98 70 C 109 70 116 77 120 84 C 124 77 131 70 142 70 C 156 70 168 80 168 96 C 168 116 148 132 120 156 Z";
  return path(d, { stroke: "var(--teal)", width: 3, fill: "none" });
}
function build16(params = {}, opts = { animate: "motion" }) {
  const { shape = "circle", rate = 1.2, amplitude = 1.15 } = params || {};
  const animate = opts && opts.animate || "motion";
  const subject2 = shape === "heart" ? heart() : circle({ cx: 120, cy: 120, r: 46, stroke: "var(--cyan)", width: 3, fill: "none" });
  const subjectEl = el("g", { class: "fig-pulse" }, subject2);
  const inner = subjectEl;
  let styleCss = "";
  if (animate !== "none") {
    const frames = `0%,100%{transform:scale(1)} 50%{transform:scale(${amplitude})}`;
    styleCss = `${motionCss("pulse", frames)}
.fig-pulse { transform-origin: center; transform-box: fill-box; animation: pulse ${rate}s ease-in-out infinite; }`;
  }
  const svg2 = sanitise(svgWrap(inner, viewBox(240, 240), styleCss));
  return { svg: svg2, supportsDraw: false, motion: "pulse" };
}

// server/figures/rotate.js
var rotate_exports = {};
__export(rotate_exports, {
  build: () => build17,
  meta: () => meta17
});
var CX3 = 120;
var CY3 = 120;
var meta17 = {
  id: "rotate",
  name: "Rotate",
  category: "Motion",
  description: "An object (gear, ring or arrow) rotating continuously about its centre.",
  paramsSchema: {
    type: "object",
    properties: {
      object: { type: "string", enum: ["gear", "ring", "arrow"], default: "gear" },
      speed: { type: "number", default: 4, description: "Seconds per full revolution." },
      dir: { type: "string", enum: ["cw", "ccw"], default: "cw" }
    }
  },
  presets: [
    { name: "Turning gear", params: { object: "gear", speed: 4, dir: "cw" } },
    { name: "Ticked ring", params: { object: "ring", speed: 6, dir: "ccw" } },
    { name: "Sweep arrow", params: { object: "arrow", speed: 3, dir: "cw" } }
  ]
};
function gear() {
  const parts = [];
  const rOuter = 52;
  const rInner = 36;
  const teeth = 12;
  for (let i = 0; i < teeth; i++) {
    const a = i / teeth * Math.PI * 2;
    const x1 = CX3 + rInner * Math.cos(a);
    const y1 = CY3 + rInner * Math.sin(a);
    const x2 = CX3 + rOuter * Math.cos(a);
    const y2 = CY3 + rOuter * Math.sin(a);
    parts.push(line({ x1, y1, x2, y2, stroke: "var(--cyan)", width: 3 }));
  }
  parts.push(circle({ cx: CX3, cy: CY3, r: rInner, stroke: "var(--cyan)", width: 3, fill: "none" }));
  parts.push(circle({ cx: CX3, cy: CY3, r: 12, stroke: "var(--teal)", width: 3, fill: "none" }));
  return parts;
}
function ring() {
  const parts = [];
  const r = 52;
  parts.push(circle({ cx: CX3, cy: CY3, r, stroke: "var(--cyan)", width: 3, fill: "none" }));
  const ticks = 8;
  for (let i = 0; i < ticks; i++) {
    const a = i / ticks * Math.PI * 2;
    const x1 = CX3 + (r - 10) * Math.cos(a);
    const y1 = CY3 + (r - 10) * Math.sin(a);
    const x2 = CX3 + r * Math.cos(a);
    const y2 = CY3 + r * Math.sin(a);
    parts.push(line({ x1, y1, x2, y2, stroke: "var(--teal)", width: 3 }));
  }
  return parts;
}
function arrowObj() {
  const parts = [];
  parts.push(circle({ cx: CX3, cy: CY3, r: 8, stroke: "var(--teal)", width: 3, fill: "none" }));
  parts.push(line({ x1: CX3, y1: CY3, x2: CX3 + 54, y2: CY3, stroke: "var(--cyan)", width: 3 }));
  parts.push(poly([[CX3 + 44, CY3 - 8], [CX3 + 54, CY3], [CX3 + 44, CY3 + 8]], {
    stroke: "var(--cyan)",
    width: 3
  }));
  return parts;
}
function build17(params = {}, opts = { animate: "motion" }) {
  const { object = "gear", speed = 4, dir = "cw" } = params || {};
  const animate = opts && opts.animate || "motion";
  let shape;
  if (object === "ring") shape = ring();
  else if (object === "arrow") shape = arrowObj();
  else shape = gear();
  const inner = el("g", { class: "fig-spin" }, shape.join(""));
  let styleCss = "";
  if (animate !== "none") {
    const deg = dir === "ccw" ? "-360deg" : "360deg";
    const frames = `to { transform: rotate(${deg}) }`;
    styleCss = `${motionCss("rotate", frames)}
.fig-spin { transform-origin: center; transform-box: fill-box; animation: rotate ${speed}s linear infinite; }`;
  }
  const svg2 = sanitise(svgWrap(inner, viewBox(240, 240), styleCss));
  return { svg: svg2, supportsDraw: false, motion: "rotate" };
}

// server/figures/oscillate.js
var oscillate_exports = {};
__export(oscillate_exports, {
  build: () => build18,
  meta: () => meta18
});
var DEFAULT_PIVOT = [120, 190];
var ARM_LEN = 110;
var meta18 = {
  id: "oscillate",
  name: "Oscillate",
  category: "Motion",
  description: "A lever or limb swinging back and forth about a fixed pivot.",
  paramsSchema: {
    type: "object",
    properties: {
      arc: { type: "number", default: 25, description: "Half-swing in degrees." },
      period: { type: "number", default: 2, description: "Seconds per full swing cycle." },
      pivot: {
        type: "array",
        items: { type: "number" },
        default: DEFAULT_PIVOT,
        description: "Pivot point [x, y] (defaults to the lever base)."
      }
    }
  },
  presets: [
    { name: "Pendulum", params: { arc: 25, period: 2, pivot: [120, 190] } },
    { name: "Wide swing", params: { arc: 40, period: 1.4, pivot: [120, 60] } }
  ]
};
function build18(params = {}, opts = { animate: "motion" }) {
  const { arc: arc2 = 25, period = 2 } = params || {};
  const pivot = Array.isArray(params && params.pivot) && params.pivot.length === 2 ? params.pivot : DEFAULT_PIVOT;
  const [px, py] = pivot;
  const animate = opts && opts.animate || "motion";
  const dir = py > 120 ? -1 : 1;
  const tipX = px;
  const tipY = py + dir * ARM_LEN;
  const arm = line({ x1: px, y1: py, x2: tipX, y2: tipY, stroke: "var(--cyan)", width: 4 });
  const bob = circle({ cx: tipX, cy: tipY, r: 12, stroke: "var(--cyan)", width: 3, fill: "none" });
  const swing = el("g", { class: "fig-swing" }, [arm, bob].join(""));
  const pivotDot = circle({ cx: px, cy: py, r: 5, stroke: "var(--teal)", width: 3, fill: "none" });
  const inner = [swing, pivotDot].join("");
  let styleCss = "";
  if (animate !== "none") {
    const frames = `0%,100%{transform:rotate(${-arc2}deg)} 50%{transform:rotate(${arc2}deg)}`;
    styleCss = `${motionCss("oscillate", frames)}
.fig-swing { transform-box: fill-box; transform-origin: ${px}px ${py}px; animation: oscillate ${period}s ease-in-out infinite; }`;
  }
  const svg2 = sanitise(svgWrap(inner, viewBox(240, 240), styleCss));
  return { svg: svg2, supportsDraw: false, motion: "oscillate" };
}

// server/figures/flow.js
var flow_exports = {};
__export(flow_exports, {
  build: () => build19,
  meta: () => meta19
});
var DEFAULT_PATH = "M20 90 C 110 30, 250 150, 340 90";
var meta19 = {
  id: "flow",
  name: "Flow",
  category: "Motion",
  description: "Marching dashes travelling along a path to suggest directional flow.",
  paramsSchema: {
    type: "object",
    properties: {
      speed: { type: "number", default: 1.2, description: "Seconds per dash march cycle." },
      path: { type: "string", default: DEFAULT_PATH, description: "SVG path `d` to flow along." }
    }
  },
  presets: [
    { name: "Gentle current", params: { speed: 1.2, path: DEFAULT_PATH } },
    { name: "Fast stream", params: { speed: 0.7, path: "M20 90 L 340 90" } }
  ]
};
function build19(params = {}, opts = { animate: "motion" }) {
  const { speed = 1.2 } = params || {};
  const d = params && typeof params.path === "string" && params.path.trim() !== "" ? params.path : DEFAULT_PATH;
  const animate = opts && opts.animate || "motion";
  const guide = path(d, { stroke: "var(--ink-dim)", width: 1.5, fill: "none" });
  const dashes = path(d, { stroke: "var(--cyan)", width: 3, fill: "none", class: "fig-flow" });
  const dotA = circle({ cx: 90, cy: 64, r: 4, stroke: "var(--teal)", width: 2, fill: "none" });
  const dotB = circle({ cx: 270, cy: 116, r: 4, stroke: "var(--teal)", width: 2, fill: "none" });
  const inner = [guide, dashes, dotA, dotB].join("");
  let styleCss = "";
  if (animate !== "none") {
    const frames = "to { stroke-dashoffset: -18 }";
    styleCss = `${motionCss("flow", frames)}
.fig-flow { stroke-dasharray: 10 8; animation: flow ${speed}s linear infinite; }`;
  } else {
    styleCss = ".fig-flow { stroke-dasharray: 10 8; }";
  }
  const svg2 = sanitise(svgWrap(inner, viewBox(360, 180), styleCss));
  return { svg: svg2, supportsDraw: false, motion: "flow" };
}

// server/figures/wave.js
var wave_exports = {};
__export(wave_exports, {
  build: () => build20,
  meta: () => meta20
});
var W = 360;
var H = 180;
var MID = H / 2;
var meta20 = {
  id: "wave",
  name: "Wave",
  category: "Motion",
  description: "A sine-like wave/trace sweeping across the canvas on a travelling loop.",
  paramsSchema: {
    type: "object",
    properties: {
      amplitude: { type: "number", default: 30, description: "Peak height of the wave (px)." },
      wavelength: { type: "number", default: 90, description: "Horizontal length of one wave cycle (px)." },
      speed: { type: "number", default: 2, description: "Seconds per travelled wavelength." }
    }
  },
  presets: [
    { name: "Rolling wave", params: { amplitude: 30, wavelength: 90, speed: 2 } },
    { name: "Quick ripple", params: { amplitude: 18, wavelength: 60, speed: 1.1 } }
  ]
};
function wavePath(amplitude, wavelength) {
  const startX = -wavelength;
  const endX = W + wavelength;
  const half = wavelength / 2;
  const k = half * 0.55;
  let d = `M${startX} ${MID}`;
  let x = startX;
  let up = true;
  while (x < endX) {
    const nx = x + half;
    const peakY = up ? MID - amplitude : MID + amplitude;
    d += ` C ${x + k} ${peakY}, ${nx - k} ${peakY}, ${nx} ${MID}`;
    x = nx;
    up = !up;
  }
  return d;
}
function build20(params = {}, opts = { animate: "motion" }) {
  const {
    amplitude = 30,
    wavelength = 90,
    speed = 2
  } = params || {};
  const animate = opts && opts.animate || "motion";
  const d = wavePath(amplitude, wavelength);
  const wave = path(d, { stroke: "var(--cyan)", width: 3, fill: "none", class: "fig-wave" });
  const inner = el("g", { class: "fig-wave-wrap" }, wave);
  let styleCss = "";
  if (animate !== "none") {
    const frames = `to { transform: translateX(-${wavelength}px) }`;
    styleCss = `${motionCss("wave", frames)}
.fig-wave { animation: wave ${speed}s linear infinite; }`;
  }
  const svg2 = sanitise(svgWrap(inner, viewBox(W, H), styleCss));
  return { svg: svg2, supportsDraw: false, motion: "wave" };
}

// server/figures/fill.js
var fill_exports = {};
__export(fill_exports, {
  build: () => build21,
  meta: () => meta21
});
var W2 = 200;
var H2 = 260;
var INNER = {
  x: 56,
  y: 40,
  w: 88,
  h: 180
};
var clamp01 = (n) => Math.max(0, Math.min(1, Number.isFinite(n) ? n : 0));
var meta21 = {
  id: "fill",
  name: "Fill",
  category: "Motion",
  description: "A level rising and falling inside a container on a loop.",
  paramsSchema: {
    type: "object",
    properties: {
      from: { type: "number", default: 0, description: "Starting fill level, 0..1." },
      to: { type: "number", default: 0.8, description: "Peak fill level, 0..1." },
      period: { type: "number", default: 2.4, description: "Seconds per full fill cycle." },
      container: {
        type: "string",
        enum: ["beaker", "bar"],
        default: "beaker",
        description: "Container style."
      }
    }
  },
  presets: [
    { name: "Filling beaker", params: { from: 0, to: 0.8, period: 2.4, container: "beaker" } },
    { name: "Rising bar", params: { from: 0.1, to: 0.9, period: 2, container: "bar" } }
  ]
};
function beaker() {
  const d = "M64 36 L52 224 Q52 236 64 236 L136 236 Q148 236 148 224 L136 36";
  const body = path(d, { stroke: "var(--ink)", width: 3, fill: "none" });
  const lip = path("M58 36 L142 36", { stroke: "var(--ink-dim)", width: 2, fill: "none" });
  return el("g", {}, [lip, body]);
}
function bar() {
  return rect({
    x: 60,
    y: 32,
    w: 80,
    h: 196,
    rx: 10,
    stroke: "var(--ink)",
    width: 3,
    fill: "none"
  });
}
function build21(params = {}, opts = { animate: "motion" }) {
  const {
    from = 0,
    to = 0.8,
    period = 2.4,
    container = "beaker"
  } = params || {};
  const animate = opts && opts.animate || "motion";
  const f = clamp01(from);
  const t = clamp01(to);
  const outline = container === "bar" ? bar() : beaker();
  const region = rect({
    x: INNER.x,
    y: INNER.y,
    w: INNER.w,
    h: INNER.h,
    stroke: "var(--teal)",
    width: 0,
    fill: "var(--cyan)",
    class: "fig-fill"
  });
  const inner = el("g", {}, [outline, region]);
  let styleCss = "";
  if (animate !== "none") {
    const frames = `0%,100%{transform:scaleY(${f})} 50%{transform:scaleY(${t})}`;
    styleCss = `${motionCss("fill", frames)}
.fig-fill { transform-origin: bottom; transform-box: fill-box; opacity: 0.5; animation: fill ${period}s ease-in-out infinite; }`;
  } else {
    styleCss = `.fig-fill { transform-origin: bottom; transform-box: fill-box; opacity: 0.5; transform: scaleY(${t}); }`;
  }
  const svg2 = sanitise(svgWrap(inner, viewBox(W2, H2), styleCss));
  return { svg: svg2, supportsDraw: false, motion: "fill" };
}

// server/figures/morph.js
var morph_exports = {};
__export(morph_exports, {
  build: () => build22,
  meta: () => meta22
});
var W3 = 320;
var H3 = 220;
var DEF_FROM = { dx: -36, dy: -28, rotate: -22 };
var DEF_TO = { dx: 0, dy: 0, rotate: 0 };
var num = (v, d) => Number.isFinite(v) ? v : d;
function pose(p = {}, def) {
  return {
    dx: num(p && p.dx, def.dx),
    dy: num(p && p.dy, def.dy),
    rotate: num(p && p.rotate, def.rotate)
  };
}
var meta22 = {
  id: "morph",
  name: "Morph",
  category: "Motion",
  description: "A subject transitioning between two states (displaced <-> reduced), looping.",
  paramsSchema: {
    type: "object",
    properties: {
      labelA: { type: "string", default: "A", description: "Label for the starting (from) state." },
      labelB: { type: "string", default: "B", description: "Label for the end (to) state." },
      period: { type: "number", default: 3, description: "Seconds per full A<->B cycle." },
      from: {
        type: "object",
        description: "Starting pose {dx,dy,rotate}.",
        properties: {
          dx: { type: "number" },
          dy: { type: "number" },
          rotate: { type: "number" }
        }
      },
      to: {
        type: "object",
        description: "End pose {dx,dy,rotate}.",
        properties: {
          dx: { type: "number" },
          dy: { type: "number" },
          rotate: { type: "number" }
        }
      }
    }
  },
  presets: [
    { name: "Displaced to reduced", params: { labelA: "Displaced", labelB: "Reduced", period: 3 } }
  ]
};
function reference() {
  const r = rect({
    x: 132,
    y: 92,
    w: 56,
    h: 36,
    rx: 4,
    stroke: "var(--ink-dim)",
    width: 1.5,
    fill: "none"
  });
  return el("g", {}, r);
}
function subject() {
  const body = rect({
    x: 132,
    y: 92,
    w: 56,
    h: 36,
    rx: 4,
    stroke: "var(--teal)",
    width: 3,
    fill: "none"
  });
  const tick2 = path("M160 92 L160 128", { stroke: "var(--cyan)", width: 2, fill: "none" });
  return el("g", { class: "fig-morph" }, [body, tick2]);
}
function build22(params = {}, opts = { animate: "motion" }) {
  const {
    labelA = "A",
    labelB = "B",
    period = 3
  } = params || {};
  const from = pose(params && params.from, DEF_FROM);
  const to = pose(params && params.to, DEF_TO);
  const animate = opts && opts.animate || "motion";
  const labA = label(labelA, 160 + from.dx, 84 + from.dy, { anchor: "middle", fill: "var(--ink-dim)" });
  const labB = label(labelB, 160 + to.dx, 152 + to.dy, { anchor: "middle", fill: "var(--ink-dim)" });
  const inner = el("g", {}, [reference(), subject(), labA, labB]);
  let styleCss = "";
  if (animate !== "none") {
    const fromT = `translate(${from.dx}px,${from.dy}px) rotate(${from.rotate}deg)`;
    const toT = `translate(${to.dx}px,${to.dy}px) rotate(${to.rotate}deg)`;
    const frames = `0%,40%{transform: ${fromT}} 60%,100%{transform: ${toT}}`;
    styleCss = `${motionCss("morph", frames)}
.fig-morph { transform-box: fill-box; transform-origin: center; animation: morph ${period}s ease-in-out infinite; }`;
  } else {
    styleCss = `.fig-morph { transform-box: fill-box; transform-origin: center; transform: translate(${from.dx}px,${from.dy}px) rotate(${from.rotate}deg); }`;
  }
  const svg2 = sanitise(svgWrap(inner, viewBox(W3, H3), styleCss));
  return { svg: svg2, supportsDraw: false, motion: "morph" };
}

// server/figures/stages.js
var stages_exports = {};
__export(stages_exports, {
  build: () => build23,
  meta: () => meta23
});
var CELL = 150;
var PAD10 = 20;
var H4 = 150;
var PANEL_W2 = 120;
var PANEL_H2 = 70;
var PANEL_Y = 40;
var meta23 = {
  id: "stages",
  name: "Stages",
  category: "Motion",
  description: "Advance through N stages over time \u2014 a staggered, looping reveal.",
  paramsSchema: {
    type: "object",
    properties: {
      stages: {
        type: "array",
        description: "Ordered stages, each { label }.",
        items: {
          type: "object",
          properties: { label: { type: "string" } }
        }
      },
      period: { type: "number", default: 1, description: "Seconds each stage holds before the next lights up." },
      loop: { type: "boolean", default: true, description: "Whether the sequence repeats." }
    }
  },
  presets: [
    {
      name: "Fracture healing",
      params: {
        stages: [
          { label: "Haematoma" },
          { label: "Soft callus" },
          { label: "Hard callus" },
          { label: "Remodelling" }
        ]
      }
    }
  ]
};
function build23(params = {}, opts = { animate: "motion" }) {
  const stages = Array.isArray(params && params.stages) && params.stages.length ? params.stages : meta23.presets[0].params.stages;
  const period = Number.isFinite(params && params.period) ? params.period : 1;
  const loop = params && params.loop === false ? false : true;
  const animate = opts && opts.animate || "motion";
  const n = stages.length;
  const W4 = PAD10 * 2 + n * CELL;
  const total = n * period;
  const iter = loop ? "infinite" : "1";
  const els = [];
  stages.forEach((stage, i) => {
    const cx = PAD10 + i * CELL + CELL / 2;
    const px = cx - PANEL_W2 / 2;
    const panel2 = rect({
      x: px,
      y: PANEL_Y,
      w: PANEL_W2,
      h: PANEL_H2,
      rx: 8,
      stroke: "var(--teal)",
      width: 2,
      fill: "none"
    });
    const marker = circle({
      cx,
      cy: PANEL_Y + PANEL_H2 / 2 - 6,
      r: 8,
      stroke: "var(--cyan)",
      width: 2,
      fill: "none"
    });
    const text2 = label(stage.label, cx, PANEL_Y + PANEL_H2 + 22, {
      anchor: "middle",
      size: 13,
      fill: "var(--ink)"
    });
    const connectors = [];
    if (i < n - 1) {
      const nx = PAD10 + (i + 1) * CELL + CELL / 2;
      connectors.push(line({
        x1: px + PANEL_W2,
        y1: PANEL_Y + PANEL_H2 / 2,
        x2: nx - PANEL_W2 / 2,
        y2: PANEL_Y + PANEL_H2 / 2,
        stroke: "var(--ink-dim)",
        width: 1.5
      }));
    }
    const cls = animate !== "none" ? `fig-stage fig-stage-${i}` : "fig-stage";
    els.push(el("g", { class: cls }, [panel2, marker, text2, ...connectors]));
  });
  const inner = els.join("");
  let styleCss = "";
  if (animate !== "none") {
    const slot = (100 / n).toFixed(4);
    const on = (slot * 0.9).toFixed(4);
    const frames = `0%{opacity:0.18} ${on}%,${slot}%{opacity:1} ${(Number(slot) + 1e-3).toFixed(4)}%,100%{opacity:0.18}`;
    const rules = [".fig-stage { opacity: 0.18; }"];
    rules.push(`.fig-stage { animation: stages-in ${total}s steps(1,end) ${iter}; }`);
    stages.forEach((_, i) => {
      const delay = (i * period).toFixed(4);
      rules.push(`.fig-stage-${i} { animation-delay: ${delay}s; }`);
    });
    styleCss = `${motionCss("stages-in", frames)}
${rules.join("\n")}`;
  }
  const svg2 = sanitise(svgWrap(inner, viewBox(W4, H4), styleCss));
  return { svg: svg2, supportsDraw: false, motion: "stages" };
}

// server/figures/registry.js
var FAMILIES = [
  labelled_diagram_exports,
  step_flow_exports,
  cross_section_exports,
  annotation_arrows_exports,
  timeline_exports,
  cycle_exports,
  flow_decision_exports,
  before_after_exports,
  comparison_matrix_exports,
  venn_overlap_exports,
  hierarchy_exports,
  bar_compare_exports,
  part_to_whole_exports,
  range_scale_exports,
  small_multiples_exports,
  pulse_exports,
  rotate_exports,
  oscillate_exports,
  flow_exports,
  wave_exports,
  fill_exports,
  morph_exports,
  stages_exports
];
var byId = new Map(FAMILIES.map((mod) => [mod.meta.id, mod]));
function listFamilies2() {
  return FAMILIES.map((mod) => mod.meta);
}
function build24(id, params, opts) {
  const mod = byId.get(id);
  if (!mod) throw new Error(`Unknown figure family: ${id}`);
  return mod.build(params, opts);
}

// server/studio.js
var STYLE = `You write short social posts and blog articles for Mr Inayat Panda, an FRCS (Tr & Orth) trauma & orthopaedic surgeon with a subspecialty interest in shoulder surgery, who also builds clinical software. He writes across orthopaedics, medicine, the arts, history, and technology.

VOICE \u2014 follow exactly:
- Measured, intelligent, precise. Confident without bravado.
- Occasionally witty or wry; never goofy, never cringe.
- Plain and direct. State things and let them stand.
- NEVER hype. No "game-changer", "revolutionary", "thrilled to announce", "humbled", "passion", "world-class", "\u{1F680}", excessive emojis, or LinkedIn-influencer cadence.
- No false modesty ("I was lucky enough to\u2026") and no exaggeration.
- A real point of view is welcome; empty positivity is not.
- British spelling.

FORMAT for a social post:
- 1 short hook line, then 2\u20135 tight sentences or a few short lines.
- At most a couple of relevant hashtags, only if they genuinely fit. Often none.
- No "link in bio", no engagement-bait questions unless the topic truly invites one.
- Length: punchy. A LinkedIn post is ~60\u2013150 words; an Instagram caption can be shorter.`;
var TONES = {
  professional: "Tone: professional and measured \u2014 the default house voice.",
  wry: "Tone: a touch wry and dry-humoured, still precise. Never goofy.",
  plain: "Tone: plain and spare. Short words, no flourish.",
  playful: "Tone: a little playful and warm, but never hype or cringe."
};
var LENGTHS = { short: "40\u201380 words.", medium: "80\u2013150 words.", long: "150\u2013250 words." };
var tone = (t) => TONES[t] || TONES.professional;
var len = (l) => LENGTHS[l] || LENGTHS.medium;
async function draftPost({ idea, platform = "linkedin", extra = "", tone: toneKey = "professional", length = "medium", provider } = {}, ai) {
  const user = `Platform: ${platform}.
${tone(toneKey)}
Length: ${len(length)}
Raw idea / topic from Inayat:
"""${idea}"""
${extra ? `Extra context: ${extra}
` : ""}
Write ONE finished post in his voice for this platform. Then, on a new line after a literal "---HOOKS---" separator, give 2 alternative opening hook lines (one per line), each a different angle. Do not number them. No preamble, no commentary.`;
  const { text: text2 } = await ai.generateText({ provider, system: STYLE, prompt: user, maxTokens: 900 });
  const [post, hookBlock = ""] = String(text2).split("---HOOKS---");
  const hooks = hookBlock.split("\n").map((h) => h.replace(/^[-*\d.\s]+/, "").trim()).filter(Boolean).slice(0, 3);
  return { post: post.trim(), hooks };
}
async function expandToBlog({ idea, post = "", provider } = {}, ai) {
  const schema = {
    type: "object",
    additionalProperties: false,
    properties: { title: { type: "string" }, description: { type: "string" }, tags: { type: "array", items: { type: "string" } }, body: { type: "string" } },
    required: ["title", "description", "tags", "body"]
  };
  const user = `Inayat wants a longer blog article on this topic, in his voice.
Topic / seed:
"""${idea}"""
${post ? `He already drafted this short post on it:
"""${post}"""
` : ""}
Write a blog article (500\u2013900 words) in clean Markdown for the "body" field. Use a few "## " subheadings. Measured and substantive, not padded. British spelling. No front-matter, no H1 in the body. "description" is a one-sentence card summary; "tags" are lower-case topic tags.`;
  const { json } = await ai.generateText({ provider, system: STYLE, prompt: user, maxTokens: 2500, json: schema, effort: "medium" });
  return json;
}
async function socialPack({ source, platforms = ["linkedin", "instagram", "x"], tone: toneKey = "professional", url = "", provider } = {}, ai) {
  const allowed = platforms.filter((p) => ["linkedin", "instagram", "x"].includes(p));
  const props = {};
  allowed.forEach((p) => {
    props[p] = { type: "string" };
  });
  const schema = { type: "object", additionalProperties: false, properties: props, required: allowed };
  const link = String(url || "").trim();
  const linkNote = link ? `
A link to the full article WILL be appended automatically, so do NOT write any URL yourself.
- linkedin: leave room; end on a line that invites reading the full piece.
- instagram: end naturally; do not mention a URL (Instagram can't link captions).
- x: keep it tight \u2014 keep the post itself \u2264 250 characters so the link fits.` : "";
  const user = `${tone(toneKey)}
From this source material, write ONE optimised post per requested platform, each in his voice.
- linkedin: ~80\u2013150 words, a strong first line, at most a couple of hashtags if they fit.
- instagram: shorter, caption-style; a hook line then a few tight lines.
- x: \u2264 280 characters, punchy, no thread.${linkNote}
Source material:
"""${source}"""`;
  const { json } = await ai.generateText({ provider, system: STYLE, prompt: user, maxTokens: 1200, json: schema });
  if (!link) return json;
  const out = { ...json };
  if (out.linkedin) out.linkedin = `${out.linkedin.trim()}

Full article \u2192 ${link}`;
  if (out.x) out.x = `${out.x.trim()} ${link}`;
  if (out.instagram) out.instagram = `${out.instagram.trim()}

Full article \u2014 link in bio \u{1F517}`;
  return out;
}
async function repurposeThread({ source, format = "x-thread", provider } = {}, ai) {
  const src = String(source || "").trim();
  if (src.length < 3) throw Object.assign(new Error("Give me some source text to repurpose."), { status: 400 });
  const fmt = format === "li-carousel" ? "li-carousel" : "x-thread";
  const schema = {
    type: "object",
    additionalProperties: false,
    properties: { parts: { type: "array", items: { type: "string" } } },
    required: ["parts"]
  };
  const guide = fmt === "li-carousel" ? `Produce a LinkedIn CAROUSEL: 5\u20138 slides. Each "parts" entry is the text for ONE slide.
- Slide 1 is the hook/cover: a strong title line, very few words.
- Each middle slide makes ONE point in a sentence or two \u2014 short enough to read on a phone-sized card.
- The final slide is a quiet close or takeaway. Do NOT write "swipe", "link in bio", slide numbers, or hashtags inside the slides.` : `Produce an X (Twitter) THREAD: 4\u20138 tweets. Each "parts" entry is ONE tweet.
- Number each tweet "n/" at the start (1/, 2/, \u2026). Keep every tweet \u2264 270 characters including the number.
- Tweet 1 is the hook and must stand alone. Each subsequent tweet advances one idea.
- No "link in bio". At most one or two hashtags in the whole thread, only if they truly fit \u2014 usually none.`;
  const user = `Repurpose the source below into his voice.
${guide}
Do not invent clinical facts, statistics or studies \u2014 use only what the source supports. British spelling.
Source material:
"""${src}"""`;
  const { json } = await ai.generateText({ provider, system: STYLE, prompt: user, maxTokens: 1600, json: schema });
  const parts = (Array.isArray(json && json.parts) ? json.parts : []).map((p) => String(p == null ? "" : p).trim()).filter(Boolean);
  if (!parts.length) throw Object.assign(new Error("No parts came back \u2014 try again."), { code: "AI_REFUSAL", status: 422 });
  return { format: fmt, parts };
}
var GOBLIN_SYSTEM = `You are the GOBLIN \u2014 a feral, gleeful idea-gremlin who lives in the margins of Mr Inayat Panda's notebook. He is a trauma & orthopaedic surgeon (shoulder interest) who writes a witty, evidence-led blog spanning surgery, trauma, bones, medicine, clinical software, history, the arts and technology. When he is staring at a blank page, you HURL ideas at him to break the spell.

YOUR JOB \u2014 chaos with a point:
- Throw unexpected, provocative, FUN angles. Wild metaphors. Contrarian takes. "Explain X like Y" mashups. Absurd framings. "The unhinged version of\u2026". "What nobody tells you about\u2026". Pick fights with received wisdom. Make him laugh, then make him think.
- Be SPECIFIC and weird, never generic. "5 things about fractures" is a crime; "Why a healing fracture is basically a building site with a useless project manager" is the job.
- Range WIDELY \u2014 surgery, the operating theatre, bone biology, trauma, the history of medicine, the tools, the software he builds, the absurdities of the NHS, the body as machine. Surprise him.

LICENCE \u2014 you are OFF the house leash:
- You ARE allowed to be cheeky, dramatic, irreverent, gleefully over-the-top. This is brainstorming, not the finished post.
- These are SPARKS \u2014 rough provocations to write FROM, not copy to publish. Don't hedge, don't be tasteful, don't sand off the edges.

THE ONE LINE YOU DO NOT CROSS:
- Never invent clinical facts, statistics, studies or outcomes and present them as true. Absurd metaphors, hypotheticals and "imagine if" framings are encouraged; a fabricated number stated as fact is not. If a hook leans on a claim, frame it as a provocation/question, not a fact.
- British spelling, always.`;
async function goblinMode({ topic = "", seed, provider } = {}, ai) {
  const t = String(topic || "").trim();
  const schema = {
    type: "object",
    additionalProperties: false,
    properties: { ideas: { type: "array", items: {
      type: "object",
      additionalProperties: false,
      properties: { hook: { type: "string" }, angle: { type: "string" } },
      required: ["hook", "angle"]
    } } },
    required: ["ideas"]
  };
  const spice = seed == null || seed === "" ? Math.random().toString(36).slice(2, 8) : String(seed).slice(0, 40);
  const user = `${t ? `Riff CHAOTICALLY on this topic: """${t}""". Stay roughly in its orbit but come at it from angles he'd never expect.` : `No topic given \u2014 go FULLY FERAL across his whole territory (surgery, trauma, bones, medicine, the theatre, clinical software, the history of medicine, the body-as-machine, the absurdities of the job). Range wide; surprise him.`}

Hurl EXACTLY 5 ideas. Each idea is:
- "hook": a punchy, provocative title/opening line (a few words to a short sentence) \u2014 the kind that makes him stop scrolling.
- "angle": ONE line saying what the post actually does / the unexpected take it runs with.

Make all 5 genuinely DIFFERENT from each other \u2014 different shapes (a contrarian take, a wild metaphor, an "explain like\u2026", an absurd framing, a "what nobody admits"). No two should rhyme. Be specific and a little unhinged.

(chaos seed: ${spice} \u2014 let it send you somewhere new.)`;
  const { json } = await ai.generateText({ provider, system: GOBLIN_SYSTEM, prompt: user, maxTokens: 1100, json: schema, temperature: 1 });
  const ideas = (Array.isArray(json && json.ideas) ? json.ideas : []).map((i) => ({ hook: String(i && i.hook || "").trim(), angle: String(i && i.angle || "").trim() })).filter((i) => i.hook || i.angle).slice(0, 6);
  if (!ideas.length) throw Object.assign(new Error("The goblin came up empty \u2014 give it a poke (try again)."), { code: "AI_REFUSAL", status: 422 });
  return { ideas };
}
async function structureNotes({ notes, provider } = {}, ai) {
  const schema = {
    type: "object",
    additionalProperties: false,
    properties: { blocks: { type: "array", items: {
      type: "object",
      additionalProperties: false,
      properties: { type: { type: "string", enum: ["heading", "text", "quote"] }, level: { type: "integer" }, text: { type: "string" } },
      required: ["type", "text"]
    } } },
    required: ["blocks"]
  };
  const user = `Turn these rough notes into a structured set of blocks for a blog post, in his voice.
Use 'heading' (level 2 or 3), 'text' (a paragraph; inline markdown **bold** *italic* [text](url) allowed), and 'quote' blocks. Don't invent facts; structure what's there.
Notes:
"""${notes}"""`;
  const { json } = await ai.generateText({ provider, system: STYLE, prompt: user, maxTokens: 2500, json: schema, effort: "medium" });
  const src = Array.isArray(json?.blocks) ? json.blocks : [];
  const blocks = src.map((b, i) => {
    const id = `gen-${Date.now()}-${i}`;
    if (b.type === "heading") return { id, type: "heading", level: b.level === 3 ? 3 : 2, text: String(b.text || "") };
    if (b.type === "quote") return { id, type: "quote", html: String(b.text || "") };
    return { id, type: "text", html: String(b.text || "") };
  });
  const doc = { version: 1, blocks };
  try {
    validateDoc(doc);
  } catch (e) {
    throw Object.assign(new Error(`AI produced an invalid block doc: ${e.message}`), { code: "AI_STRUCTURE", status: 502 });
  }
  return doc;
}
async function altText({ imageBase64, mimeType = "image/jpeg", provider } = {}, ai) {
  const { text: text2 } = await ai.describeImage({
    provider,
    imageBase64,
    mimeType,
    maxTokens: 120,
    prompt: 'Write a single concise alt-text sentence (max 140 characters) describing this image factually for a blog. Do not start with "image of" or "photo of". British spelling. Return only the sentence.'
  });
  return { alt: String(text2 || "").trim().replace(/^["']|["']$/g, "").slice(0, 200) };
}
var REWRITE_ACTIONS = {
  rewrite: "Rewrite this passage more clearly and naturally, keeping the meaning and roughly the same length.",
  tighten: "Tighten this passage: cut filler, hedging and redundancy while keeping every real point. Shorter is better.",
  wittier: "Make this passage a touch wittier and drier, in keeping with the established voice \u2014 never add hype, never change the facts.",
  british: "Correct this passage to British spelling and idiom. Change nothing else.",
  expand: "Expand this passage by one or two sentences with a concrete example or specific detail. Do not pad or add hype.",
  simplify: "Rewrite this passage so a patient with no medical training understands it, without dumbing down or losing the facts."
};
async function rewriteText({ text: text2, action = "rewrite", provider } = {}, ai) {
  const t = String(text2 || "").trim();
  if (t.length < 2) throw Object.assign(new Error("Select some text to rewrite."), { status: 400 });
  const instr = REWRITE_ACTIONS[action] || REWRITE_ACTIONS.rewrite;
  const user = `${instr}

Return ONLY the rewritten passage \u2014 no preamble, no surrounding quotes, no markdown fences, no explanation. Preserve any inline emphasis (**bold**, *italic*) and links if present.

PASSAGE:
${t}`;
  const { text: out } = await ai.generateText({ provider, system: STYLE, prompt: user, maxTokens: 900 });
  return { text: String(out || "").trim().replace(/^["']|["']$/g, "") };
}
async function seoSuggest({ title = "", body = "", provider } = {}, ai) {
  const schema = {
    type: "object",
    additionalProperties: false,
    properties: { description: { type: "string" }, tags: { type: "array", items: { type: "string" } } },
    required: ["description", "tags"]
  };
  const user = `For this blog post, write a one-sentence meta description (max ~160 characters) and up to 6 lower-case topical tags. British spelling. Measured, not clickbait.
Title: ${title}
Body:
"""${String(body).slice(0, 4e3)}"""`;
  const { json } = await ai.generateText({ provider, system: STYLE, prompt: user, maxTokens: 400, json: schema });
  return { description: String(json.description || ""), tags: (json.tags || []).map((x) => String(x).toLowerCase().trim()).filter(Boolean).slice(0, 6) };
}
var CITATION_STYLES = {
  vancouver: 'Vancouver (numbered, UK medical standard): "Surname AB, Surname CD. Article title. Abbreviated Journal. Year;Volume(Issue):Pages." List up to six authors then ", et al". Include "doi: 10.xxxx/..." at the end if a DOI is present.',
  ama: 'AMA: similar to Vancouver but the journal title is italicised in print; here, plain text: "Surname AB, Surname CD. Article title. Journal. Year;Volume(Issue):Pages. doi:..."',
  harvard: `Harvard (author\u2013date): "Surname, A.B. and Surname, C.D. (Year) 'Article title', Journal, Volume(Issue), pp. Pages."`
};
var CITATION_SYSTEM = `You are a meticulous medical librarian. You reformat a single bibliographic reference into a requested citation style. You output ONLY the one formatted reference string \u2014 no preamble, no numbering, no surrounding quotes, no commentary.

Absolute rules:
- NEVER invent or guess any detail. Use ONLY what is present in the input. If a field (author, year, journal, volume, pages, DOI) is missing, simply omit it \u2014 do not fabricate it, do not write "n.d." or placeholders.
- Do not "correct" facts (do not change a year, a title, or an author you are unsure about).
- British spelling.
- Normalise author initials, punctuation, and spacing to the requested style; that is the only transformation you perform on the substance.`;
async function formatCitation({ raw, style = "vancouver", provider } = {}, ai) {
  const input = String(raw || "").trim();
  if (input.length < 4) throw Object.assign(new Error("Give me a reference to tidy."), { status: 400 });
  const styleKey = String(style || "vancouver").toLowerCase();
  const styleNote = CITATION_STYLES[styleKey] || CITATION_STYLES.vancouver;
  const schema = {
    type: "object",
    additionalProperties: false,
    properties: { text: { type: "string" } },
    required: ["text"]
  };
  const user = `Reformat the reference below into ${styleKey.toUpperCase()} style.
Style guide: ${styleNote}

Return JSON {"text": "<the one formatted reference>"}. Use ONLY the details present below; omit anything missing. Do not invent authors, years, journals, volumes, pages or DOIs.

REFERENCE (messy, as given):
"""${input}"""`;
  const { json } = await ai.generateText({ provider, system: CITATION_SYSTEM, prompt: user, maxTokens: 400, json: schema });
  const text2 = String(json && json.text || "").trim().replace(/^["']|["']$/g, "").replace(/\s+/g, " ");
  if (!text2) throw Object.assign(new Error("Could not format that reference."), { code: "AI_REFUSAL", status: 422 });
  return { text: text2 };
}
async function importDocument({ fileBase64, mimeType, provider } = {}, ai) {
  const schema = {
    type: "object",
    additionalProperties: false,
    properties: { blocks: { type: "array", items: {
      type: "object",
      additionalProperties: false,
      properties: {
        type: { type: "string", enum: ["heading", "text", "quote", "table"] },
        level: { type: "integer" },
        text: { type: "string" },
        header: { type: "array", items: { type: "string" } },
        rows: { type: "array", items: { type: "array", items: { type: "string" } } }
      },
      required: ["type"]
    } } },
    required: ["blocks"]
  };
  const { json } = await ai.readDocument({
    system: "Extract this document into clean blocks. British spelling. Do not invent content \u2014 only what is in the document.",
    instruction: "Extract the document into a structured list of blocks (headings, paragraphs as text, quotes, tables). Preserve order. Do not invent content.",
    fileBase64,
    mimeType,
    json: schema,
    provider
  });
  const src = Array.isArray(json?.blocks) ? json.blocks : [];
  let i = 0;
  const blocks = src.map((b) => {
    const id = `imp-${i++}`;
    if (b.type === "heading") return { id, type: "heading", level: b.level === 3 ? 3 : 2, text: String(b.text || "") };
    if (b.type === "quote") return { id, type: "quote", html: String(b.text || "") };
    if (b.type === "table") return {
      id,
      type: "table",
      header: Array.isArray(b.header) ? b.header.map((h) => String(h ?? "")) : [],
      rows: Array.isArray(b.rows) ? b.rows.map((r) => Array.isArray(r) ? r.map((c) => String(c ?? "")) : []) : []
    };
    return { id, type: "text", html: String(b.text || "") };
  });
  const doc = { version: 1, blocks };
  validateDoc(doc);
  return doc;
}
async function genImage({ prompt, size, provider } = {}, ai) {
  const r = await ai.generateImage({ provider, prompt, size });
  if (r && r.url) return { url: r.url };
  return { base64: r.base64, mimeType: r.mimeType };
}
async function suggestInteractive({ description, provider } = {}, ai) {
  const fams = listFamilies();
  const catalogue = fams.map((f) => `- ${f.id} [${f.category}]: ${f.name} \u2014 ${f.description}`).join("\n");
  const pickSchema = {
    type: "object",
    additionalProperties: false,
    required: ["familyId"],
    properties: { familyId: { type: "string", enum: fams.map((f) => f.id) }, reason: { type: "string" } }
  };
  const pick = await ai.generateText({
    provider,
    maxTokens: 800,
    json: pickSchema,
    system: "You match a desired interactive widget to the single best template family id from a fixed catalogue. Reply only as the JSON schema requires.",
    prompt: `Template families:
${catalogue}

The author wants an interactive that: "${String(description).slice(0, 600)}".
Pick the single best familyId.`
  });
  const familyId = pick.json && pick.json.familyId && fams.some((f) => f.id === pick.json.familyId) ? pick.json.familyId : fams[0].id;
  const fam = getFamily(familyId);
  const filled = await ai.generateText({
    provider,
    maxTokens: 3e3,
    effort: "medium",
    json: fam.paramsSchema,
    system: "You produce the JSON params object for an interactive teaching widget, valid against the provided JSON schema. British spelling. Labels/captions concise, accurate, never hype. Choose sensible numbers and ranges. Do not invent clinical facts. IMPORTANT for any formula/expression field: refer to a slider/input value as V.<key> (e.g. V.r, not bare r), use Math.* for functions, and curve y-expressions use the sweep variable t in the range 0..1.",
    prompt: `Template: ${fam.name} \u2014 ${fam.description}
The author wants: "${String(description).slice(0, 600)}".
Return the params object that best realises this with the ${fam.name} template.`
  });
  const params = filled && filled.json || {};
  const block = buildInstance(familyId, params);
  return { familyId, params, reason: pick.json && pick.json.reason, block };
}
async function tweakInteractive({ familyId, params = {}, instruction, provider } = {}, ai) {
  const fam = getFamily(familyId);
  if (!fam) throw Object.assign(new Error("Unknown interactive family: " + familyId), { status: 400 });
  const instr = String(instruction || "").trim();
  if (instr.length < 2) throw Object.assign(new Error("Tell me what to change."), { status: 400 });
  const filled = await ai.generateText({
    provider,
    maxTokens: 3e3,
    effort: "medium",
    json: fam.paramsSchema,
    system: "You edit the JSON params of an interactive teaching widget. Return the COMPLETE updated params object, valid against the schema \u2014 preserve everything the author did NOT ask to change. British spelling, concise labels, never hype, no invented clinical facts. For any formula/expression field: refer to a slider/input value as V.<key> (e.g. V.r), use Math.* for functions, and curve y-expressions use the sweep variable t in 0..1.",
    prompt: `Template: ${fam.name} \u2014 ${fam.description}
Current params:
${JSON.stringify(params).slice(0, 4e3)}

Apply this change: "${instr.slice(0, 600)}".
Return the full updated params object.`
  });
  const next = filled && filled.json || params;
  const block = buildInstance(familyId, next);
  return { familyId, params: next, block };
}
async function suggestFigure({ description, animate = "draw", provider } = {}, ai) {
  const fams = listFamilies2();
  const catalogue = fams.map((f) => `- ${f.id} [${f.category}]: ${f.name} \u2014 ${f.description}
    params: ${JSON.stringify(f.paramsSchema).slice(0, 400)}`).join("\n");
  const pickSchema = {
    type: "object",
    additionalProperties: false,
    required: ["familyId"],
    properties: { familyId: { type: "string", enum: fams.map((f) => f.id) }, reason: { type: "string" } }
  };
  const pick = await ai.generateText({
    provider,
    maxTokens: 800,
    json: pickSchema,
    system: "You match a desired diagram to the single best figure family id from a fixed catalogue of parametric SVG line-art families. Reply only as the JSON schema requires.",
    prompt: `Figure families:
${catalogue}

The author wants a figure that: "${String(description).slice(0, 600)}".
Pick the single best familyId.`
  });
  const familyId = pick.json && pick.json.familyId && fams.some((f) => f.id === pick.json.familyId) ? pick.json.familyId : fams[0].id;
  const fam = fams.find((f) => f.id === familyId);
  const filled = await ai.generateText({
    provider,
    maxTokens: 3e3,
    effort: "medium",
    json: fam.paramsSchema,
    system: "You produce the JSON params object for a clean, minimal SVG figure (line-art diagram), valid against the provided JSON schema. British spelling. Labels/captions concise, accurate, never hype. Do not invent clinical facts or specific statistics \u2014 keep any numbers clearly illustrative. Keep it minimal and uncluttered.",
    prompt: `Figure family: ${fam.name} \u2014 ${fam.description}
The author wants: "${String(description).slice(0, 600)}".
Return the params object that best realises this with the ${fam.name} family.`
  });
  const params = filled && filled.json || {};
  const { svg: svg2 } = build24(familyId, params, { animate });
  return { familyId, params, block: { type: "figure", svg: svg2, animation: animate } };
}
async function tweakFigure({ familyId, params = {}, instruction, animate = "draw", provider } = {}, ai) {
  const fams = listFamilies2();
  const fam = fams.find((f) => f.id === familyId);
  if (!fam) throw Object.assign(new Error("Unknown figure family: " + familyId), { status: 400 });
  const instr = String(instruction || "").trim();
  if (instr.length < 2) throw Object.assign(new Error("Tell me what to change."), { status: 400 });
  const filled = await ai.generateText({
    provider,
    maxTokens: 3e3,
    effort: "medium",
    json: fam.paramsSchema,
    system: "You edit the JSON params of an SVG figure (line-art diagram). Return the COMPLETE updated params object, valid against the schema \u2014 preserve everything the author did NOT ask to change. British spelling, concise accurate labels, never hype, no invented clinical facts. Keep it minimal and uncluttered.",
    prompt: `Figure family: ${fam.name} \u2014 ${fam.description}
Current params:
${JSON.stringify(params).slice(0, 4e3)}

Apply this change: "${instr.slice(0, 600)}".
Return the full updated params object.`
  });
  const updatedParams = filled && filled.json || params;
  const { svg: svg2 } = build24(familyId, updatedParams, { animate });
  return { familyId, params: updatedParams, block: { type: "figure", svg: svg2, animation: animate } };
}
async function inventInteractive({ description, provider } = {}, ai) {
  const desc = String(description || "").trim();
  if (desc.length < 4) throw Object.assign(new Error("Describe the interactive you want"), { status: 400 });
  const domId = "pg-" + Math.random().toString(36).slice(2, 9);
  const schema = {
    type: "object",
    additionalProperties: false,
    required: ["title", "html", "js"],
    properties: {
      title: { type: "string" },
      html: { type: "string" },
      css: { type: "string" },
      js: { type: "string" },
      notes: { type: "string" }
    }
  };
  const system = `You invent a small, self-contained interactive teaching widget ("playground") for a dark-themed orthopaedic / medicine / history / technology blog. Output HTML, optional CSS, and JS that bring one idea to life \u2014 a slider, a toggle, a small simulation, an animated SVG diagram.

HARD RULES \u2014 the widget must run first time with no console errors:
- Vanilla JS only. No external libraries, no <script src>, no fetch/network, no localStorage/cookies. Entirely self-contained.
- Your HTML is placed inside <div class="playground" id="${domId}">\u2026</div>. Do NOT repeat that wrapper. Scope every DOM lookup to it: write your JS as (function(){ const root = document.getElementById('${domId}'); if(!root) return; /* root.querySelector(...) */ })(); \u2014 never use document-wide selectors and never use inline on* attributes (they are stripped).
- Use the host classes where natural: .pg-stage (main visual area), .pg-controls, .pg-row, .pg-field, .pg-readout (live numbers), <label><b>\u2026</b></label>; sliders are <input type="range">.
- Dark theme is already applied (near-black background, light text). Do not set a page background. Use the site accents teal #2dd4bf, cyan #22d3ee, violet #818cf8 for highlights.
- Honour reduced motion: gate any continuous animation behind window.matchMedia('(prefers-reduced-motion: reduce)').
- British spelling; concise, accurate labels; never hype. Do NOT invent clinical facts or specific statistics \u2014 keep numbers clearly illustrative.
Return ONLY the JSON the schema requires; put a one-line plain-language summary in "notes".`;
  const r = await ai.generateText({
    provider,
    maxTokens: 14e3,
    effort: "medium",
    json: schema,
    system,
    prompt: `Invent an interactive that: "${desc.slice(0, 800)}". Keep it focused and compact so the whole thing fits comfortably \u2014 a tight, working widget beats an elaborate one.`
  });
  const out = r && r.json || {};
  let jsError = null;
  try {
    if (String(out.js || "").trim()) new Function(String(out.js));
  } catch (e) {
    jsError = e.message;
  }
  return {
    block: { domId, title: out.title || "Interactive", html: out.html || "", css: out.css || "", js: out.js || "" },
    notes: out.notes || "",
    jsError
  };
}
async function inventFigure({ description, animate = "draw", provider } = {}, ai) {
  const desc = String(description || "").trim();
  if (desc.length < 4) throw Object.assign(new Error("Describe the figure you want"), { status: 400 });
  const wantsAnim = animate && animate !== "none";
  const schema = {
    type: "object",
    additionalProperties: false,
    required: ["svg", "title"],
    properties: {
      svg: { type: "string" },
      title: { type: "string" },
      notes: { type: "string" }
    }
  };
  const system = `You draw a single, self-contained inline <svg> line-art figure for a dark-themed orthopaedic / medicine / history / technology blog. Clean, minimal, NYT-style schematic line art.

HARD RULES \u2014 the figure must render safely and inherit the site theme:
- Return ONE <svg>\u2026</svg> element only. Use a viewBox and set NO width/height pixel attributes on the <svg> (it scales to its container).
- Colour ONLY via the site's CSS theme variables: var(--ink) (primary line/text), var(--ink-dim) (secondary/faint), var(--teal), var(--cyan), var(--violet) for accents. NEVER use hex codes, rgb(), or named colours.
- Minimal and clean: prefer strokes over fills; use fill="none" on shapes where a stroke suffices. Thin, confident lines. No clutter, no drop-shadows, no gradients.
- ${wantsAnim ? "If animated, use ONLY inlined CSS inside a single <style> element: @keyframes plus transform / opacity / stroke-dashoffset / animation. Include a @media (prefers-reduced-motion: reduce) guard that disables motion (snap to the final/drawn state)." : "Static figure: do not animate."}
- NEVER use <script>, <foreignObject>, on* event handlers, external references, url(), or remote links. Entirely self-contained.
- British spelling on any labels. Schematic only \u2014 do NOT invent clinical facts or specific statistics; keep any numbers clearly illustrative.
Return ONLY the JSON the schema requires; put a one-line plain-language summary in "notes".`;
  const r = await ai.generateText({
    provider,
    maxTokens: 8e3,
    effort: "medium",
    json: schema,
    system,
    prompt: `Draw a figure that: "${desc.slice(0, 800)}". Keep it focused and compact \u2014 a tight, legible diagram beats an elaborate one.`
  });
  const out = r && r.json || {};
  const cleanSvg = sanitise(String(out.svg || ""));
  return {
    block: { type: "figure", kind: "invent", svg: cleanSvg, title: out.title || "Figure", animation: animate },
    notes: out.notes || ""
  };
}
async function generateSticker({ description, genre = "", provider } = {}, ai) {
  const desc = String(description || "").trim();
  if (desc.length < 3) throw Object.assign(new Error("Describe the sticker you want"), { status: 400 });
  const g = String(genre || "").trim();
  const schema = {
    type: "object",
    additionalProperties: false,
    required: ["svg", "title"],
    properties: {
      svg: { type: "string" },
      title: { type: "string" },
      notes: { type: "string" }
    }
  };
  const system = `You design a single, self-contained inline <svg> RETRO / VINTAGE DIE-CUT STICKER \u2014 the kind a traveller slaps on a suitcase or a notebook. Playful, bold, characterful. It will be dropped onto a dark-themed blog and may be placed over a photo, so it must read on its own at any size.

HARD RULES \u2014 the sticker must render safely:
- Return ONE <svg>\u2026</svg> element only. Use a viewBox (e.g. "0 0 120 120") and set NO width/height pixel attributes on the <svg> (it scales to its container).
- Die-cut look: a BOLD dark outline (around stroke-width 5) on the main silhouette, and an offset pale "sticker border" ring just outside it. Confident, chunky shapes \u2014 not thin line-art.
- COLOUR IS ENCOURAGED here (a sticker is decorative): use a warm, slightly faded RETRO palette \u2014 tomato red, mustard gold, teal, navy, cream/off-white paper, warm brown. Use plain hex codes or named colours freely. Do NOT use CSS theme variables (this is a sticker, not a figure).
- Keep it self-contained and FLAT: no gradients, no filters, no drop-shadow elements, no clip-paths referencing external ids, no <image>, no <use> of external refs.
- Static only: do NOT animate, do NOT include a <style> or <script>.
- NEVER use <script>, <foreignObject>, on* event handlers, external references, url(), or remote links. Entirely self-contained.
- Any words on the sticker must use British spelling, be short and punchy (e.g. "NEW!", "VISITED"), and use a generic serif/sans font-family on <text> \u2014 never a web-font url(). Do NOT invent clinical facts, statistics or studies.
${g ? `- Genre to lean into: ${g}.
` : ""}Return ONLY the JSON the schema requires; put a one-line plain-language summary in "notes".`;
  const r = await ai.generateText({
    provider,
    maxTokens: 6e3,
    effort: "medium",
    json: schema,
    system,
    prompt: `Design a retro die-cut sticker that: "${desc.slice(0, 600)}".${g ? ` Genre: ${g}.` : ""} Keep it one bold, legible motif \u2014 a tight sticker beats a busy one.`
  });
  const out = r && r.json || {};
  const cleanSvg = sanitise(String(out.svg || ""));
  return {
    block: { type: "figure", kind: "sticker", svg: cleanSvg, title: out.title || "Sticker", animation: "none" },
    notes: out.notes || ""
  };
}
async function vectoriseSketch({ image, mimeType = "image/png", animate = "draw", provider } = {}, ai) {
  const raw = String(image || "");
  if (!raw) throw Object.assign(new Error("Provide an image to trace"), { status: 400 });
  const m = /^data:([^;]+);base64,(.*)$/s.exec(raw);
  const fileBase64 = m ? m[2] : raw;
  if (m) mimeType = mimeType || m[1];
  const wantsAnim = animate && animate !== "none";
  const schema = {
    type: "object",
    additionalProperties: false,
    required: ["svg", "title"],
    properties: {
      svg: { type: "string" },
      title: { type: "string" },
      notes: { type: "string" }
    }
  };
  const system = `You trace the provided sketch/photo into a clean, minimal NYT-style line-art inline <svg> for a dark-themed orthopaedic / medicine / history / technology blog. Schematic, confident line work \u2014 not a literal pixel copy.

HARD RULES \u2014 the figure must render safely and inherit the site theme:
- Return ONE <svg>\u2026</svg> element only. Use a viewBox and set NO width/height pixel attributes on the <svg> (it scales to its container).
- Colour ONLY via the site's CSS theme variables: var(--ink) (primary line/text), var(--ink-dim) (secondary/faint), var(--teal), var(--cyan), var(--violet) for accents. NEVER use hex codes, rgb(), or named colours.
- Minimal and clean: prefer strokes over fills; use fill="none" on shapes where a stroke suffices. Thin, confident lines. No clutter, no drop-shadows, no gradients.
- ${wantsAnim ? "If animated, use ONLY inlined CSS inside a single <style> element: @keyframes plus transform / opacity / stroke-dashoffset / animation. Include a @media (prefers-reduced-motion: reduce) guard that disables motion (snap to the final/drawn state)." : "Static figure: do not animate."}
- NEVER use <script>, <foreignObject>, on* event handlers, external references, url(), or remote links. Entirely self-contained.
- British spelling on any labels. Schematic only \u2014 trace ONLY what is present in the image; do NOT invent anatomy, structures, or detail not visible in it.
Return ONLY the JSON the schema requires; put a one-line plain-language summary in "notes".`;
  const { json: out = {} } = await ai.readDocument({
    provider,
    fileBase64,
    mimeType,
    json: schema,
    system,
    instruction: "Trace the provided sketch/photo into a clean, minimal NYT-style line-art inline SVG, following the rules exactly."
  });
  const cleanSvg = sanitise(String(out.svg || ""));
  return {
    block: { type: "figure", kind: "traced", svg: cleanSvg, title: out.title || "Traced", animation: animate },
    notes: out.notes || ""
  };
}
async function suggestLabels({ description = "", svg: svg2 = "", provider } = {}, ai) {
  const schema = {
    type: "object",
    additionalProperties: false,
    required: ["labels"],
    properties: { labels: { type: "array", items: {
      type: "object",
      additionalProperties: false,
      required: ["text"],
      properties: { text: { type: "string" } }
    } } }
  };
  const system = `You suggest short candidate labels a reader might want annotated on a diagram (e.g. anatomical part names, key features). British spelling. Suggest only plausible, well-known labels for the subject \u2014 never invent clinical facts, specific measurements, or details you cannot be confident about. Keep each label to a few words. Return ONLY the JSON the schema requires.`;
  const user = `Suggest up to 8 candidate labels for this figure.
Description: "${String(description).slice(0, 600)}"${svg2 ? `
Figure SVG (context):
${String(svg2).slice(0, 2e3)}` : ""}`;
  const r = await ai.generateText({ provider, system, prompt: user, maxTokens: 500, json: schema });
  const src = Array.isArray(r?.json?.labels) ? r.json.labels : [];
  const labels = src.map((l) => ({ text: String((l && l.text) ?? l ?? "").trim() })).filter((l) => l.text).slice(0, 8);
  return { labels };
}
var STUDIO_STYLE = STYLE;

// server/prepublish.js
var prepublish_exports = {};
__export(prepublish_exports, {
  __probeUrl: () => __probeUrl,
  checkDoc: () => checkDoc,
  classifyLinks: () => classifyLinks,
  collectLinks: () => collectLinks,
  isBlockedHost: () => isBlockedHost,
  lintDoc: () => lintDoc,
  readingLevel: () => readingLevel
});
function isIP(s) {
  const h = String(s || "");
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(h)) return 4;
  if (h.includes(":") && /^[0-9a-f:]+$/i.test(h)) return 6;
  return 0;
}
function jsSyntaxError(js) {
  const src = String(js || "").trim();
  if (!src) return null;
  try {
    new Function(src);
    return null;
  } catch (e) {
    return e.message;
  }
}
function leadingWidth(ln) {
  let w = 0;
  for (const ch of ln) {
    if (ch === " ") w++;
    else if (ch === "	") w += 4;
    else break;
  }
  return w;
}
function rawHtmlRisks(content) {
  const out = [];
  const text2 = String(content || "");
  if (!/<\w/.test(text2)) return out;
  const lines = text2.split("\n");
  if (lines.some((ln, i) => i > 0 && i < lines.length - 1 && ln.trim() === ""))
    out.push("contains a blank line \u2014 markdown cuts the HTML block off there, so the rest of the post renders as escaped text");
  if (lines.some((ln) => ln.trim() && leadingWidth(ln) >= 4))
    out.push("has a line indented 4+ spaces \u2014 markdown turns it into a code block");
  return out;
}
function rawHtmlUnsafe(content) {
  const s = String(content || "");
  if (/<script\b/i.test(s)) return "a <script> tag";
  if (/<(?:iframe|object|embed)\b/i.test(s)) return "an <iframe>, <object> or <embed> element";
  if (/\son\w+\s*=/i.test(s)) return "an inline event handler (on\u2026=)";
  if (/javascript:/i.test(s)) return "a javascript: URL";
  return null;
}
var PLACEHOLDER_HREF = /href\s*=\s*["'](\s*|#|#TODO[^"']*)["']/i;
function plainText(html) {
  return String(html || "").replace(/<[^>]*>/g, " ").replace(/&[a-z#0-9]+;/gi, " ");
}
function countSyllables(word) {
  word = word.toLowerCase().replace(/[^a-z]/g, "");
  if (word.length <= 3) return word ? 1 : 0;
  word = word.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, "").replace(/^y/, "");
  const m = word.match(/[aeiouy]{1,2}/g);
  return m ? m.length : 1;
}
function readingLevel(text2) {
  const body = String(text2 || "");
  const words = body.match(/[A-Za-z0-9'’-]+/g) || [];
  const wordCount = words.length;
  const sentences = body.match(/[^.!?]+[.!?]+/g) || (body.trim() ? [body] : []);
  const sentCount = Math.max(1, sentences.length);
  const syllables = words.reduce((n, w) => n + countSyllables(w), 0);
  const avgSentLen = wordCount ? wordCount / sentCount : 0;
  const flesch = wordCount ? Math.max(0, Math.min(100, 206.835 - 1.015 * avgSentLen - 84.6 * (syllables / wordCount))) : 0;
  let band = "Plain, easy to read";
  if (flesch < 30) band = "Very dense";
  else if (flesch < 50) band = "Dense \u2014 consider shorter sentences";
  else if (flesch < 60) band = "Fairly readable";
  return { wordCount, flesch: Math.round(flesch), band };
}
var AME_TO_BRE = {
  color: "colour",
  colors: "colours",
  colored: "coloured",
  coloring: "colouring",
  honor: "honour",
  honors: "honours",
  favor: "favour",
  favorite: "favourite",
  behavior: "behaviour",
  behaviors: "behaviours",
  neighbor: "neighbour",
  flavor: "flavour",
  labor: "labour",
  humor: "humour",
  rumor: "rumour",
  tumor: "tumour",
  optimize: "optimise",
  optimized: "optimised",
  optimizing: "optimising",
  optimization: "optimisation",
  organize: "organise",
  organized: "organised",
  organization: "organisation",
  recognize: "recognise",
  recognized: "recognised",
  realize: "realise",
  realized: "realised",
  analyze: "analyse",
  analyzed: "analysed",
  analyzing: "analysing",
  center: "centre",
  centers: "centres",
  centered: "centred",
  fiber: "fibre",
  liter: "litre",
  meter: "metre",
  theater: "theatre",
  defense: "defence",
  offense: "offence",
  license: "licence",
  practice: "practise",
  catalog: "catalogue",
  dialog: "dialogue",
  gray: "grey",
  mold: "mould",
  traveled: "travelled",
  traveling: "travelling",
  canceled: "cancelled",
  modeling: "modelling",
  jewelry: "jewellery",
  aluminum: "aluminium",
  anesthesia: "anaesthesia",
  pediatric: "paediatric",
  orthopedic: "orthopaedic",
  orthopedics: "orthopaedics",
  esophagus: "oesophagus",
  edema: "oedema",
  fetal: "foetal",
  hemoglobin: "haemoglobin"
};
var AME_RE = new RegExp("\\b(" + Object.keys(AME_TO_BRE).join("|") + ")\\b", "gi");
function findAmericanisms(text2) {
  const found = /* @__PURE__ */ new Map();
  let m;
  AME_RE.lastIndex = 0;
  while (m = AME_RE.exec(text2)) {
    const hit = m[1].toLowerCase();
    const bre = AME_TO_BRE[hit];
    if (bre && !found.has(hit)) found.set(hit, `${hit}\u2192${bre}`);
  }
  return [...found.values()];
}
function collectHeadingLevels(blocks) {
  const levels = [];
  for (const b of blocks) {
    if (b.type === "heading") {
      levels.push(Math.min(Math.max(b.level || 2, 2), 6));
      continue;
    }
    if (b.type === "text" && b.html) {
      const re = /<h([1-6])[\s>]/gi;
      let m;
      while (m = re.exec(b.html)) levels.push(Number(m[1]));
    }
  }
  return levels;
}
function headingHierarchyWarnings(blocks) {
  const out = [];
  const levels = collectHeadingLevels(blocks);
  let prev = 1;
  let seenH2 = false;
  for (const lvl of levels) {
    if (lvl === 1) {
      out.push("A body heading is an H1 \u2014 the post title is already the H1. Use H2 for top-level sections.");
      continue;
    }
    if (lvl === 2) seenH2 = true;
    else if (lvl >= 3 && !seenH2) {
      out.push(`An H${lvl} appears before any H2 \u2014 start sections with H2.`);
    }
    if (lvl > prev + 1) out.push(`Heading level jumps from H${prev} to H${lvl} \u2014 don\u2019t skip levels (use H${prev + 1} next).`);
    prev = lvl;
  }
  return [...new Set(out)];
}
function collectLinks(blocks) {
  const hrefs = /* @__PURE__ */ new Set();
  const re = /href\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s">]+))/gi;
  for (const b of blocks) {
    const html = b.type === "text" ? b.html : b.type === "raw" ? b.content : "";
    if (!html) continue;
    let m;
    while (m = re.exec(String(html))) {
      const v = (m[1] ?? m[2] ?? m[3] ?? "").trim();
      if (!v || v.startsWith("#") || /^mailto:/i.test(v) || /^javascript:/i.test(v)) continue;
      hrefs.add(v);
    }
  }
  return [...hrefs];
}
function classifyLinks(links) {
  const internal = [], external = [];
  for (const u of links) {
    const m = /^\/blog\/([^/?#]+)\/?/.exec(u);
    if (m) internal.push({ url: u, slug: m[1] });
    else if (/^https?:\/\//i.test(u)) external.push(u);
  }
  return { internal, external };
}
function figureSvgRisk(svg2) {
  const s = String(svg2 || "");
  if (/<script\b/i.test(s)) return "a <script> tag";
  if (/<foreignObject\b/i.test(s)) return "a <foreignObject> element";
  if (/<(?:animate|set|animateTransform|animateMotion)\b/i.test(s)) return "a SMIL animation element (animate/set/\u2026)";
  if (/\son[a-z-]+\s*=/i.test(s)) return "an inline event handler (on\u2026=)";
  if (/(?:xlink:)?href\s*=\s*["']?\s*(?:https?:|\/\/)/i.test(s)) return "an external link (href)";
  const dataHref = /(?:xlink:)?href\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s">]+))/gi;
  let m;
  while (m = dataHref.exec(s)) {
    const v = ((m[1] !== void 0 ? m[1] : m[2] !== void 0 ? m[2] : m[3]) || "").trim();
    if (/^data:/i.test(v) && !SAFE_IMAGE_DATA_URL.test(v)) return "an unsafe data: link (href)";
  }
  return null;
}
function checkDoc({ doc, meta: meta24 = {}, slug = "post", knownSlugs = null } = {}) {
  const errors = [], warnings = [];
  const polish = [];
  const blocks = doc && Array.isArray(doc.blocks) ? doc.blocks : [];
  if (!String(meta24.title || "").trim()) errors.push({ message: "Title is required." });
  const desc = String(meta24.description || "").trim();
  if (!desc) warnings.push({ message: "No description \u2014 search results and share cards will fall back to the first line of the post." });
  else if (desc.length > 155) warnings.push({ message: `Description is ${desc.length} characters \u2014 it will be trimmed to 155 in the post\u2019s metadata.` });
  if (meta24.date && !/^\d{4}-\d{2}-\d{2}$/.test(String(meta24.date))) warnings.push({ message: `Date \u201C${meta24.date}\u201D isn\u2019t in YYYY-MM-DD form.` });
  const topics = (meta24.tags || []).filter((t) => t && t !== "interactive");
  if (!topics.length) warnings.push({ message: "No topic selected \u2014 the post won\u2019t appear under any topic on the Writing page." });
  if (!blocks.length) errors.push({ message: "The post has no content blocks." });
  let hasText = false;
  blocks.forEach((b, i) => {
    switch (b.type) {
      case "text":
        if (String(b.html || "").replace(/<[^>]*>/g, "").trim()) hasText = true;
        break;
      case "image":
        if (!b.file && !b.base64 && !b.src) errors.push({ message: "Image block has no image.", blockIndex: i });
        else if (!String(b.alt || "").trim()) warnings.push({ message: "Image has no alt text (hurts accessibility and SEO).", blockIndex: i });
        break;
      case "gallery":
        if ((b.images || []).some((im) => im && !String(im.alt || "").trim()))
          warnings.push({ message: "A gallery image has no alt text.", blockIndex: i });
        break;
      case "playground": {
        const err = jsSyntaxError(b.js);
        if (err) errors.push({ message: `Playground script won\u2019t run \u2014 syntax error: ${err}`, blockIndex: i });
        if (!String(b.html || "").trim() && !String(b.js || "").trim() && !String(b.css || "").trim())
          warnings.push({ message: "Playground is empty.", blockIndex: i });
        if (b.domId && !/^[a-zA-Z][\w-]*$/.test(b.domId))
          warnings.push({ message: `Playground id \u201C${b.domId}\u201D is invalid and will be ignored.`, blockIndex: i });
        break;
      }
      case "figure": {
        const svg2 = String(b.svg || "");
        if (!svg2.trim()) {
          errors.push({ message: "Figure block has no SVG.", blockIndex: i });
          break;
        }
        const risk = figureSvgRisk(svg2);
        if (risk) errors.push({ message: `Figure SVG is unsafe \u2014 it contains ${risk}.`, blockIndex: i });
        if (!/<svg[\s>]/i.test(svg2) || !/<\/svg\s*>/i.test(svg2))
          errors.push({ message: "Figure SVG looks malformed (missing an <svg> \u2026 </svg> wrapper).", blockIndex: i });
        if (!String(b.alt || "").trim())
          warnings.push({ message: "Figure has no alt text (hurts accessibility and SEO).", blockIndex: i });
        if (/#[0-9a-f]{3,8}\b/i.test(svg2))
          warnings.push({ message: "Figure SVG uses a # hex colour \u2014 it won\u2019t follow the site theme. Use CSS variables (e.g. var(--ink)) instead.", blockIndex: i });
        break;
      }
      case "raw": {
        const c = String(b.content || "");
        const unsafe = rawHtmlUnsafe(c);
        if (unsafe) errors.push({ message: `Raw HTML block is unsafe \u2014 it contains ${unsafe}. This would run on the live site. Remove it (or use a Playground block, which sanitises for you).`, blockIndex: i });
        for (const r of rawHtmlRisks(c))
          warnings.push({ message: `Raw HTML block ${r}. Tip: a Playground block sanitises this for you.`, blockIndex: i });
        const scriptRe = /<script[^>]*>([\s\S]*?)<\/script>/gi;
        let sm;
        while (sm = scriptRe.exec(c)) {
          const err = jsSyntaxError(sm[1]);
          if (err) errors.push({ message: `Script in raw block won\u2019t run \u2014 syntax error: ${err}`, blockIndex: i });
        }
        break;
      }
    }
    const html = b.html != null ? String(b.html) : b.type === "raw" ? String(b.content || "") : "";
    if (html && PLACEHOLDER_HREF.test(html))
      warnings.push({ message: "A link has an empty or placeholder (#) href.", blockIndex: i });
  });
  if (blocks.length && !hasText) warnings.push({ message: "The post has no body text." });
  try {
    const md = serialiseBlocks(blocks, { slug });
    const re = /<div class="playground[^"]*"[^>]*>\n([\s\S]*?)\n<\/div>/g;
    let m;
    while (m = re.exec(md)) {
      if (/\n[ \t]*\n/.test(m[1]))
        errors.push({ message: "A playground\u2019s HTML still contains a blank line in the published markdown \u2014 it will break. Remove blank lines from the HTML." });
    }
  } catch {
  }
  const bodyText = blocks.map((b) => b.type === "text" ? plainText(b.html) : b.type === "heading" ? b.text || "" : b.type === "quote" ? b.text || "" : "").join(" ");
  const headingIssues = headingHierarchyWarnings(blocks);
  polish.push({
    group: "Heading structure",
    level: headingIssues.length ? "amber" : "green",
    items: headingIssues.length ? headingIssues : ["Headings are well-nested (H2 \u2192 H3 \u2192 H4, no skips)."]
  });
  const altGaps = [];
  blocks.forEach((b, i) => {
    if (b.type === "image" && (b.file || b.base64 || b.src) && !String(b.alt || "").trim()) altGaps.push(`Image (block ${i + 1}) has no alt text.`);
    if (b.type === "figure" && String(b.svg || "").trim() && !String(b.alt || "").trim()) altGaps.push(`Figure (block ${i + 1}) has no alt text.`);
    if (b.type === "gallery") (b.images || []).forEach((im, j) => {
      if (im && !String(im.alt || "").trim()) altGaps.push(`Gallery image ${j + 1} (block ${i + 1}) has no alt text.`);
    });
  });
  polish.push({
    group: "Image alt text",
    level: altGaps.length ? "amber" : "green",
    items: altGaps.length ? altGaps : ["Every image, gallery image and figure has alt text."]
  });
  const rl = readingLevel(bodyText);
  polish.push({
    group: "Reading level",
    level: rl.flesch < 50 && rl.wordCount > 60 ? "amber" : "green",
    items: [`Flesch ${rl.flesch} \u2014 ${rl.band}. ${rl.wordCount.toLocaleString()} words.`]
  });
  const ame = findAmericanisms(bodyText);
  polish.push({
    group: "British spelling",
    level: ame.length ? "amber" : "green",
    items: ame.length ? [`${ame.length} possible Americanism${ame.length > 1 ? "s" : ""}: ${ame.join(", ")}`] : ["No American spellings detected."]
  });
  const links = collectLinks(blocks);
  const { internal, external } = classifyLinks(links);
  if (Array.isArray(knownSlugs)) {
    const known = new Set(knownSlugs);
    const bad = internal.filter((l) => l.slug !== slug && !known.has(l.slug)).map((l) => l.url);
    polish.push({
      group: "Internal links",
      level: bad.length ? "amber" : "green",
      items: bad.length ? bad.map((u) => `${u} \u2014 no post with that slug.`) : [`${internal.length} internal link${internal.length === 1 ? "" : "s"} checked \u2014 all resolve.`]
    });
  } else if (internal.length) {
    polish.push({ group: "Internal links", level: "green", items: [`${internal.length} internal link${internal.length === 1 ? "" : "s"} found (run the link check to validate).`] });
  }
  const externalCount = external.length;
  const amberGroups = polish.filter((p) => p.level === "amber").length;
  const score = Math.max(0, 100 - amberGroups * 8);
  return { ok: errors.length === 0, errors, warnings, polish, score, externalLinks: external, externalCount, internalLinks: internal.map((l) => l.url) };
}
function isBlockedHost(hostname) {
  if (!hostname) return true;
  let h = String(hostname).trim().toLowerCase();
  if (h.startsWith("[") && h.endsWith("]")) h = h.slice(1, -1);
  if (h === "localhost" || h.endsWith(".localhost")) return true;
  const kind = isIP(h);
  if (kind === 4) {
    const o = h.split(".").map((n) => Number(n));
    if (o.length !== 4 || o.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return true;
    if (o[0] === 127) return true;
    if (o[0] === 0) return true;
    if (o[0] === 10) return true;
    if (o[0] === 192 && o[1] === 168) return true;
    if (o[0] === 172 && o[1] >= 16 && o[1] <= 31) return true;
    if (o[0] === 169 && o[1] === 254) return true;
    return false;
  }
  if (kind === 6) {
    if (h === "::1" || h === "::") return true;
    if (h.startsWith("fe80:")) return true;
    if (h.startsWith("fc") || h.startsWith("fd")) return true;
    return false;
  }
  return false;
}
async function probeUrl(url, { fetchImpl = fetch, timeoutMs = 6e3 } = {}) {
  let u;
  try {
    u = new URL(url);
  } catch {
    return { url, ok: false, error: "blocked (invalid URL)" };
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") {
    return { url, ok: false, error: `blocked (unsupported scheme ${u.protocol})` };
  }
  if (isBlockedHost(u.hostname)) {
    return { url, ok: false, error: "blocked (internal/loopback host)" };
  }
  const tryOnce = async (method) => {
    const ctrl = AbortSignal.timeout(timeoutMs);
    const res = await fetchImpl(url, { method, redirect: "manual", signal: ctrl, headers: { "User-Agent": "helm-studio-linkcheck" } });
    return res.status;
  };
  try {
    let status;
    try {
      status = await tryOnce("HEAD");
    } catch {
      status = await tryOnce("GET");
    }
    if (status >= 300 && status < 400) return { url, ok: true, status };
    if (status >= 400 && status !== 404) {
      try {
        status = await tryOnce("GET");
      } catch {
      }
    }
    return { url, ok: status < 400, status };
  } catch (e) {
    return { url, ok: false, error: e && e.name === "TimeoutError" ? "timed out" : e && e.message || "unreachable" };
  }
}
async function lintDoc({ doc, meta: meta24 = {}, slug = "post", knownSlugs = null } = {}, deps = {}) {
  const base = checkDoc({ doc, meta: meta24, slug, knownSlugs });
  const cap = deps.cap || 25;
  const urls = (base.externalLinks || []).slice(0, cap);
  let externalResults = [];
  if (urls.length) {
    externalResults = await Promise.all(urls.map((u) => probeUrl(u, { fetchImpl: deps.fetchImpl, timeoutMs: deps.timeoutMs })));
  }
  const broken = externalResults.filter((r) => !r.ok);
  const extGroup = {
    group: "External links",
    level: broken.length ? "amber" : "green",
    items: broken.length ? broken.map((r) => `${r.url} \u2014 ${r.status ? "HTTP " + r.status : r.error || "unreachable"}`) : [urls.length ? `${urls.length} external link${urls.length === 1 ? "" : "s"} reachable.` : "No external links to check."]
  };
  const polish = [...base.polish, extGroup];
  const amberGroups = polish.filter((p) => p.level === "amber").length;
  const score = Math.max(0, 100 - amberGroups * 8);
  return { ...base, polish, score, externalResults, externalChecked: urls.length };
}
var __probeUrl = probeUrl;

// studio-app/core/partner.js
var rid = () => "p-" + (globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : Math.random().toString(36).slice(2));
function createSession() {
  return { sessionId: rid(), history: [], doc: { version: 0, blocks: [] }, meta: {}, versions: [], updatedAt: null };
}
function appendVersion(session, doc, meta24) {
  const version = session.versions.length + 1;
  const entry = { version, doc: { ...doc, version }, meta: { ...meta24 } };
  session.versions.push(entry);
  session.doc = entry.doc;
  session.meta = entry.meta;
  return session;
}
function revertSession(session, version) {
  const entry = (session.versions || []).find((v) => v.version === version);
  if (!entry) throw Object.assign(new Error("version not found"), { status: 404 });
  session.doc = { ...entry.doc };
  session.meta = { ...entry.meta };
  return session;
}
function assembleContext({ style, voicePosts = [], index = [] }) {
  const exemplars = voicePosts.map((p, i) => `--- VOICE EXAMPLE ${i + 1}: "${p.title}" ---
${(p.body || "").slice(0, 1800)}`).join("\n\n");
  const catalogue = index.map((p) => `- "${p.title}" [${(p.tags || []).join(", ")}] ${p.date || ""}`).join("\n");
  return [
    style,
    `You are the writer's conversational writing partner for their blog. Each turn you return JSON {reply, doc, meta}:`,
    `- reply: a short, plain chat message (what you did / a question back).`,
    `- doc: the WHOLE post as a block document {version, blocks[]}. Block types: heading{level,text}, text{html}, image{alt,caption} (or {_intent:"generate",brief}), quote{html,cite}, divider, gallery, embed, table, playground (or {type:"playground",_intent:"interactive",brief}). Always return the complete, updated document.`,
    `- meta: {title, tags (topic slugs), description}.`,
    `Write in the house voice. Be concise and accurate; never invent clinical facts or statistics. British spelling.`,
    voicePosts.length ? `Match the voice of these examples:
${exemplars}` : "",
    index.length ? `The blog already contains (don't repeat these; you may suggest follow-ups or link them):
${catalogue}` : ""
  ].filter(Boolean).join("\n\n");
}
async function gatherContext(posts, style) {
  const index = await posts.listPosts();
  const voicePosts = [];
  for (const p of index.slice(0, 2)) {
    const full = await posts.getPost(p.slug);
    if (full) voicePosts.push({ title: full.data.title, body: full.body });
  }
  return assembleContext({ style, voicePosts, index: index.map((p) => ({ title: p.title, tags: p.tags, date: p.date })) });
}
async function fillIntents(doc, meta24, { ai, engines = {} } = {}) {
  const E = { suggestInteractive, genImage, seoSuggest, ...engines };
  const blocks = [];
  for (const b of doc.blocks || []) {
    try {
      if (b.type === "playground" && b._intent === "interactive") {
        const r = await E.suggestInteractive({ description: b.brief || "an interactive" }, ai);
        const blk = r && r.block || {};
        blocks.push({ type: "playground", html: blk.html || "", css: blk.css || "", js: blk.js || "", domId: blk.domId, placement: b.placement || "standard" });
        continue;
      }
      if (b.type === "image" && b._intent === "generate") {
        const r = await E.genImage({ prompt: b.brief || "illustration", size: "1024x1024" }, ai);
        blocks.push({ type: "image", base64: r.base64, file: r.file || "gen.jpg", alt: b.alt || "", caption: b.caption || "", placement: b.placement || "standard", size: b.size || "lg" });
        continue;
      }
    } catch {
      blocks.push({ type: "text", html: `<em>[Couldn't build: ${b.brief || b.type}. Edit me.]</em>` });
      continue;
    }
    blocks.push(b);
  }
  const filledDoc = { ...doc, blocks };
  let nextMeta = { ...meta24 };
  if (!nextMeta.description || !(nextMeta.tags && nextMeta.tags.length)) {
    try {
      const seo = await E.seoSuggest({ title: nextMeta.title || "", body: serialiseBlocks(blocks, { slug: "partner" }) }, ai);
      const j = seo && seo.json || {};
      if (!nextMeta.description && j.description) nextMeta.description = j.description;
      if (!(nextMeta.tags && nextMeta.tags.length) && j.tags) nextMeta.tags = j.tags;
    } catch {
    }
  }
  return { doc: filledDoc, meta: nextMeta };
}
async function runTurn({ session, message }, deps = {}) {
  const ai = deps.ai;
  const render = deps.render || ((doc) => renderPreviewHtml(doc.blocks || [], { slug: "partner" }));
  const fill = deps.fill || ((doc, meta24) => fillIntents(doc, meta24, { ai }));
  const context = deps.context || "";
  session = session || createSession();
  session.history.push({ role: "user", content: message });
  const prompt = [
    "Conversation so far:",
    session.history.map((m) => `${m.role.toUpperCase()}: ${m.content}`).join("\n"),
    "Current document (JSON):",
    JSON.stringify(session.doc),
    "Current meta (JSON):",
    JSON.stringify(session.meta),
    "Respond with the JSON {reply, doc, meta} for the updated post."
  ].join("\n\n");
  const ask = async () => {
    const { text: text2 } = await ai.generateText({ system: context, prompt, maxTokens: 16e3, effort: "medium" });
    return looseJson(text2);
  };
  const attempt = async () => {
    const out = await ask();
    const rawDoc = out.doc || { blocks: [] };
    const meta24 = { ...session.meta, ...out.meta || {} };
    const filled = await fill(rawDoc, meta24);
    const doc = filled.doc || rawDoc;
    validateDoc(doc);
    return { reply: out.reply || "", doc, meta: filled.meta || meta24 };
  };
  let result = null;
  try {
    result = await attempt();
  } catch {
    try {
      result = await attempt();
    } catch {
      session.history.push({ role: "assistant", content: "I had trouble updating the draft \u2014 left it as it was. Try rephrasing?" });
      return { session, reply: session.history.at(-1).content, doc: session.doc, meta: session.meta, html: render(session.doc), version: session.versions.length };
    }
  }
  appendVersion(session, result.doc, result.meta);
  session.history.push({ role: "assistant", content: result.reply });
  return { session, reply: result.reply, doc: session.doc, meta: session.meta, html: render(session.doc), version: session.versions.length };
}
async function publishSession(session, posts) {
  const check = checkDoc({ doc: session.doc, meta: session.meta, slug: "partner" });
  if (!check.ok) return { ok: false, errors: check.errors, warnings: check.warnings };
  const slug = await posts.suggestSlug(session.meta.title || "untitled");
  const r = await posts.publishBlocks(slug, session.doc, { ...session.meta, draft: false });
  return { ok: true, slug, url: r.url, commit: r.commit, warnings: check.warnings };
}

// studio-app/core/siteConfig.js
var PATH = "src/data/site.json";
async function getSiteConfig(gh) {
  const f = await gh.getFile(PATH);
  if (!f) return { data: {}, sha: null };
  return { data: JSON.parse(f.content), sha: f.sha };
}
async function putSiteConfig(gh, data, sha) {
  return gh.putFile(PATH, JSON.stringify(data, null, 2) + "\n", "studio: update site settings", sha || void 0);
}

// studio-app/router.js
function makeRouter(deps) {
  const { posts, partner, ai, storage: storage2, studio, playgrounds, figures, stencils, stickers, blocks, prepublish, templates: templates2, config: config2, gh } = deps;
  let _ctx = null;
  const ctx = async () => _ctx ||= await partner.gatherContext(posts, studio.STUDIO_STYLE || studio.STYLE || "");
  const notFound = (p) => {
    throw Object.assign(new Error("not found: " + p), { status: 404 });
  };
  const qp = (path3) => {
    const i = path3.indexOf("?");
    return i < 0 ? {} : Object.fromEntries(new URLSearchParams(path3.slice(i + 1)));
  };
  const clean = (path3) => {
    const i = path3.indexOf("?");
    return i < 0 ? path3 : path3.slice(0, i);
  };
  async function api(rawPath, opts = {}) {
    const method = (opts.method || "GET").toUpperCase();
    const body = opts.body && typeof opts.body === "string" ? JSON.parse(opts.body) : opts.body || {};
    const query = qp(rawPath);
    const seg = clean(rawPath).replace(/^\/+|\/+$/g, "").split("/");
    const [a, b, c, d] = seg;
    if (a === "playgrounds" && !b) return playgrounds.listFamilies();
    if (a === "playgrounds" && c === "preset") return { params: playgrounds.getPreset(b, d) };
    if (a === "playgrounds" && b === "build") return { block: playgrounds.buildInstance(body.familyId, body.params || {}, body.domId) };
    if (a === "playgrounds" && b === "suggest") return studio.suggestInteractive({ description: body.description }, ai);
    if (a === "playgrounds" && b === "tweak") return studio.tweakInteractive({ familyId: body.familyId, params: body.params || {}, instruction: body.instruction }, ai);
    if (a === "playgrounds" && b === "invent") return studio.inventInteractive({ description: body.description }, ai);
    if (a === "figures" && !b) return { families: figures.listFamilies() };
    if (a === "figures" && b === "stencils") return { stencils: stencils.listStencils() };
    if (a === "figures" && b === "stickers") return { stickers: stickers.listStickers() };
    if (a === "figures" && (b === "sticker" || clean(rawPath) === "/figures/sticker"))
      return studio.generateSticker({ description: body.description, genre: body.genre }, ai);
    if (a === "figures" && b === "build") {
      const animate = body.animate || "draw";
      const { svg: svg2 } = figures.build(body.familyId, body.params || {}, { animate });
      return { block: { type: "figure", svg: svg2, animation: animate } };
    }
    if (a === "figures" && b === "suggest") return studio.suggestFigure({ description: body.description, animate: body.animate || "draw" }, ai);
    if (a === "figures" && b === "tweak") return studio.tweakFigure({ familyId: body.familyId, params: body.params || {}, instruction: body.instruction, animate: body.animate || "draw" }, ai);
    if (a === "figures" && (b === "invent" || clean(rawPath) === "/figures/invent"))
      return studio.inventFigure({ description: body.description, animate: body.animate || "draw" }, ai);
    if (a === "figures" && (b === "vectorise" || clean(rawPath) === "/figures/vectorise"))
      return studio.vectoriseSketch({ image: body.image, mimeType: body.mimeType, animate: body.animate || "draw" }, ai);
    if (a === "figures" && b === "label-suggest") return studio.suggestLabels({ description: body.description, svg: body.svg }, ai);
    if (a === "citations" && b === "format") return studio.formatCitation({ raw: body.raw, style: body.style || "vancouver" }, ai);
    if (a === "goblin") return studio.goblinMode({ topic: body.topic, seed: body.seed }, ai);
    if (a === "social" && b === "repurpose") return studio.repurposeThread({ source: body.source, format: body.format }, ai);
    if (a === "ai") {
      if (b === "draft") return studio.draftPost(body, ai);
      if (b === "social-pack") return studio.socialPack(body, ai);
      if (b === "structure") return studio.structureNotes(body, ai);
      if (b === "alt-text") return studio.altText(body, ai);
      if (b === "seo") return studio.seoSuggest(body, ai);
      if (b === "rewrite") return studio.rewriteText(body, ai);
      if (b === "generate-image") return studio.genImage(body, ai);
      if (b === "read-document") return studio.importDocument(body, ai);
    }
    if (a === "posts" && c === "preview") return { html: blocks.renderPreviewHtml(body.doc?.blocks || [], { slug: b }) };
    if (a === "posts" && c === "check") {
      let knownSlugs = null;
      try {
        knownSlugs = (await posts.listPosts()).map((p) => p.slug);
      } catch {
      }
      return prepublish.checkDoc({ doc: body.doc, meta: body.meta, slug: b, knownSlugs });
    }
    if (a === "posts" && (b === "lint" || c === "lint")) {
      const slug = b === "lint" ? body.slug || "post" : b;
      let knownSlugs = null;
      try {
        knownSlugs = (await posts.listPosts()).map((p) => p.slug);
      } catch {
      }
      const res = prepublish.checkDoc({ doc: body.doc, meta: body.meta, slug, knownSlugs });
      const note = res.externalCount || 0 ? `${res.externalCount} external link${res.externalCount === 1 ? "" : "s"} \u2014 reachability is only checked in your local Helm.` : "No external links to check.";
      return { ...res, polish: [...res.polish, { group: "External links", level: "green", items: [note] }], externalChecked: 0, externalSkipped: true };
    }
    if (a === "md-to-blocks") return blocks.blocksFromMarkdown(body.markdown || "");
    if (a === "media" && b === "images") return { groups: await posts.listMediaImages() };
    if (a === "video") {
      throw Object.assign(
        new Error("Video rendering runs in your local Helm (npm start), not the hosted Studio."),
        { status: 503, code: "VIDEO_LOCAL_ONLY" }
      );
    }
    if (a === "posts" && !b && method === "GET") return posts.listPosts();
    if (a === "topics") return posts.getTopics();
    if (a === "slug") return posts.suggestSlug(query.title || "untitled");
    if (a === "templates") return templates2.list();
    if (a === "posts" && b && !c && method === "GET") return posts.getPost(b);
    if (a === "posts" && b && !c && method === "PUT") return posts.updatePost(b, body || {});
    if (a === "posts" && c === "blocks" && method === "GET") {
      const draft = await storage2.get("blockdrafts", b);
      if (draft) {
        let publishedAt = null;
        try {
          const p = await posts.getPost(b);
          publishedAt = p && p.data ? p.data.date : null;
        } catch {
        }
        return { source: "draft", doc: draft.doc, data: draft.meta || {}, draftSavedAt: draft.savedAt || null, publishedAt };
      }
      const r = await posts.getPostBlocks(b);
      return r || notFound(rawPath);
    }
    if (a === "posts" && c === "blocks" && method === "PUT") {
      await storage2.put("blockdrafts", { id: b, doc: body.doc, meta: body.meta, savedAt: (/* @__PURE__ */ new Date()).toISOString() });
      return { slug: b, saved: true };
    }
    if (a === "posts" && c === "blocks" && method === "DELETE") {
      await storage2.del("blockdrafts", b);
      return { slug: b, discarded: true };
    }
    if (a === "posts" && c === "publish") {
      const r = await posts.publishBlocks(b, body.doc, body.meta || {});
      await storage2.del("blockdrafts", b);
      return r;
    }
    const sortVersions = (list) => list.slice().sort((x, y) => (y.seq || 0) - (x.seq || 0) || (y.ts || "").localeCompare(x.ts || ""));
    if (a === "posts" && c === "versions" && method === "GET") {
      return { versions: sortVersions((await storage2.all("versions")).filter((v) => v.slug === b)) };
    }
    if (a === "posts" && c === "versions" && method === "POST") {
      const existing = (await storage2.all("versions")).filter((v) => v.slug === b);
      const seq = existing.reduce((mx, v) => Math.max(mx, v.seq || 0), 0) + 1;
      const ts = (/* @__PURE__ */ new Date()).toISOString();
      const id = "v-" + b + "-" + (globalThis.crypto?.randomUUID?.() || Date.now() + "-" + seq);
      const rec = { id, slug: b, ts, seq, label: body.label || "Snapshot", doc: body.doc, meta: body.meta || {} };
      await storage2.put("versions", rec);
      for (const old of sortVersions([...existing, rec]).slice(20)) await storage2.del("versions", old.id);
      return rec;
    }
    if (a === "posts" && c === "republish") return posts.republishPost(b);
    if (a === "posts" && c === "takedown") return posts.takedownPost(b);
    if (a === "posts" && c === "duplicate") return posts.duplicatePost(b);
    if (a === "posts" && b && !c && method === "DELETE") return posts.deletePost(b);
    if (a === "posts" && c === "photos" && method === "GET") return [];
    if (a === "expand") {
      const article = await studio.expandToBlog({ idea: body.idea, post: body.post }, ai);
      const slug = await posts.suggestSlug(article.title || "untitled");
      const doc = blocks.rawDocFromMarkdown(article.body || "");
      const r = await posts.publishBlocks(slug, doc, { title: article.title, description: article.description, tags: article.tags || [], draft: true });
      return { slug, title: article.title, draft: true, url: r.url, commit: r.commit, note: "Saved as a draft \u2014 review and publish from Posts" };
    }
    if (a === "partner" && b === "turn") {
      const session = body.sessionId ? await storage2.get("partner", body.sessionId) : null;
      const out = await partner.runTurn({ session, message: body.message }, { ai, context: await ctx() });
      out.session.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
      await storage2.put("partner", { id: out.session.sessionId, ...out.session });
      return { sessionId: out.session.sessionId, reply: out.reply, doc: out.doc, meta: out.meta, html: out.html, version: out.version };
    }
    if (a === "partner" && b && c === "revert") {
      const s = await storage2.get("partner", b);
      partner.revertSession(s, body.version);
      await storage2.put("partner", { id: s.sessionId, ...s });
      return s;
    }
    if (a === "partner" && b && c === "publish") {
      const s = await storage2.get("partner", b);
      return partner.publishSession(s, posts);
    }
    if (a === "partner" && b && !c && method === "GET") return await storage2.get("partner", b) || notFound(rawPath);
    if (a === "ideas" && !b && method === "GET") return (await storage2.all("ideas")).sort((x, y) => (y.createdAt || y.id || "").localeCompare(x.createdAt || x.id || ""));
    if (a === "ideas" && !b && method === "POST") {
      const id = "i-" + (globalThis.crypto?.randomUUID?.() || Date.now());
      const rec = { id, text: String(body.text || "").trim(), tags: Array.isArray(body.tags) ? body.tags : [], createdAt: body.createdAt || (/* @__PURE__ */ new Date()).toISOString() };
      await storage2.put("ideas", rec);
      return rec;
    }
    if (a === "ideas" && b && method === "PUT") {
      const cur = await storage2.get("ideas", b) || { id: b };
      const rec = { ...cur, ...body, id: b };
      if (rec.text != null) rec.text = String(rec.text).trim();
      if (!Array.isArray(rec.tags)) rec.tags = [];
      await storage2.put("ideas", rec);
      return rec;
    }
    if (a === "ideas" && b && method === "DELETE") {
      await storage2.del("ideas", b);
      return { deleted: b };
    }
    if (a === "drafts" && !b && method === "GET") return (await storage2.all("drafts")).sort((x, y) => (y.id || "").localeCompare(x.id || ""));
    if (a === "drafts" && !b && method === "POST") {
      const id = "d-" + (globalThis.crypto?.randomUUID?.() || Date.now());
      const rec = { id, ...body };
      await storage2.put("drafts", rec);
      return rec;
    }
    if (a === "drafts" && b && method === "PUT") {
      const rec = { id: b, ...body };
      await storage2.put("drafts", rec);
      return rec;
    }
    if (a === "drafts" && b && method === "DELETE") {
      await storage2.del("drafts", b);
      return { deleted: b };
    }
    if (a === "figures" && b === "shapes" && !c && method === "GET") return { shapes: (await storage2.all("shapes")).sort((x, y) => (y.id || "").localeCompare(x.id || "")) };
    if (a === "figures" && b === "shapes" && !c && method === "POST") {
      const id = "s-" + (globalThis.crypto?.randomUUID?.() || Date.now());
      const rec = { id, name: body.name || "Shape", viewBox: body.viewBox, strokes: body.strokes };
      await storage2.put("shapes", rec);
      return rec;
    }
    if (a === "figures" && b === "shapes" && c && method === "DELETE") {
      await storage2.del("shapes", c);
      return { deleted: c };
    }
    if (a === "settings" && b === "ai" && c === "models") return [];
    if (a === "settings" && b === "ai" && method === "GET") {
      const ai_ = config2.getAi();
      return { default: ai_.provider, providers: { [ai_.provider]: { configured: !!ai_.key, model: ai_.model } } };
    }
    if (a === "settings" && b === "ai" && method === "PUT") {
      const patch = {};
      if (body.default) patch.aiProvider = body.default;
      const p = body.providers && body.default && body.providers[body.default];
      if (p?.apiKey) patch.aiKey = p.apiKey;
      if (p?.model) patch.aiModel = p.model;
      config2.save(patch);
      return { ok: true };
    }
    if (a === "settings" && b === "site") {
      if (method === "PUT") {
        const { commit } = await putSiteConfig(gh, body.data, body.sha);
        return { ok: true, commit };
      }
      return getSiteConfig(gh);
    }
    return notFound(rawPath);
  }
  return { api };
}

// server/figures/stencils.js
var stencils_exports = {};
__export(stencils_exports, {
  listStencils: () => listStencils
});
var round13 = (n) => Math.round(n * 100) / 100;
function ring2(points) {
  const pts = points.map(([x, y]) => [round13(x), round13(y)]);
  if (pts.length) pts.push([pts[0][0], pts[0][1]]);
  return pts;
}
function arc(cx, cy, rx, ry, a0, a1, n = 18) {
  const out = [];
  for (let i = 0; i <= n; i++) {
    const t = a0 + (a1 - a0) * i / n;
    out.push([round13(cx + rx * Math.cos(t)), round13(cy + ry * Math.sin(t))]);
  }
  return out;
}
var TAU = Math.PI * 2;
function genericStencils() {
  return [
    {
      id: "arrow",
      name: "Arrow",
      category: "Generic",
      viewBox: [120, 60],
      strokes: [
        [[6, 30], [114, 30]],
        // shaft
        [[92, 12], [114, 30], [92, 48]]
        // head
      ]
    },
    {
      id: "double-arrow",
      name: "Double arrow",
      category: "Generic",
      viewBox: [120, 60],
      strokes: [
        [[6, 30], [114, 30]],
        // shaft
        [[28, 12], [6, 30], [28, 48]],
        // left head
        [[92, 12], [114, 30], [92, 48]]
        // right head
      ]
    },
    {
      id: "line",
      name: "Line",
      category: "Generic",
      viewBox: [120, 20],
      strokes: [
        [[6, 10], [114, 10]]
      ]
    },
    {
      id: "circle",
      name: "Circle",
      category: "Generic",
      viewBox: [100, 100],
      strokes: [
        arc(50, 50, 44, 44, 0, TAU, 36)
      ]
    },
    {
      id: "square",
      name: "Square",
      category: "Generic",
      viewBox: [100, 100],
      strokes: [
        ring2([[8, 8], [92, 8], [92, 92], [8, 92]])
      ]
    },
    {
      id: "brace",
      name: "Curly brace",
      category: "Generic",
      viewBox: [40, 120],
      strokes: [
        // a single { polyline: top curl → mid pinch → bottom curl
        [[32, 6], [18, 12], [18, 52], [6, 60], [18, 68], [18, 108], [32, 114]]
      ]
    },
    {
      id: "bracket",
      name: "Bracket",
      category: "Generic",
      viewBox: [40, 120],
      strokes: [
        [[30, 6], [10, 6], [10, 114], [30, 114]]
      ]
    },
    {
      id: "plus-cross",
      name: "Plus / cross",
      category: "Generic",
      viewBox: [80, 80],
      strokes: [
        [[40, 8], [40, 72]],
        // vertical
        [[8, 40], [72, 40]]
        // horizontal
      ]
    }
  ];
}
function clinicalStencils() {
  return [
    {
      // Long bone: two parallel shafts joined by rounded ends (top + bottom).
      id: "long-bone",
      name: "Long bone",
      category: "Clinical",
      viewBox: [80, 200],
      strokes: [
        // left shaft + rounded top end curving across to the right shaft
        [
          [26, 28],
          [26, 172],
          ...arc(40, 176, 14, 16, Math.PI, TAU, 10).slice(1),
          // bottom rounded end (left→right)
          [54, 28],
          ...arc(40, 24, 14, 16, 0, -Math.PI, 10).slice(1)
          // top rounded end (right→left)
        ]
      ]
    },
    {
      // Joint: two opposing condyle curves facing each other across a gap.
      id: "joint",
      name: "Joint",
      category: "Clinical",
      viewBox: [120, 120],
      strokes: [
        // upper bone end: shaft sides + a convex (downward) condyle
        [[40, 8], [40, 40], ...arc(60, 40, 30, 18, Math.PI, TAU, 14).slice(1), [80, 8]],
        // lower bone end: shaft sides + a concave (upward) socket
        [[40, 112], [40, 78], ...arc(60, 78, 30, 16, Math.PI, 0, 14).slice(1), [80, 112]]
      ]
    },
    {
      // Vertebra: rounded body + a posterior arch with spinous + transverse spikes.
      id: "vertebra",
      name: "Vertebra",
      category: "Clinical",
      viewBox: [120, 100],
      strokes: [
        ring2([[24, 18], [96, 18], [100, 50], [96, 70], [24, 70], [20, 50]]),
        // body (rounded box)
        arc(60, 78, 26, 16, Math.PI, TAU, 16),
        // posterior arch (down)
        [[60, 90], [60, 96]],
        // spinous process
        [[34, 78], [16, 84]],
        // left transverse
        [[86, 78], [104, 84]]
        // right transverse
      ]
    },
    {
      // Screw: round head, straight shaft, a few angled thread ticks.
      id: "screw",
      name: "Screw",
      category: "Clinical",
      viewBox: [60, 160],
      strokes: [
        ring2([[14, 8], [46, 8], [40, 24], [20, 24]]),
        // head (trapezoid)
        [[26, 24], [26, 132], [30, 144], [34, 132], [34, 24]],
        // shaft → pointed tip
        [[26, 44], [34, 38]],
        // thread ticks
        [[26, 62], [34, 56]],
        [[26, 80], [34, 74]],
        [[26, 98], [34, 92]],
        [[26, 116], [34, 110]]
      ]
    },
    {
      // Plate: rounded bar with 4 screw holes (small rings) along it.
      id: "plate",
      name: "Plate",
      category: "Clinical",
      viewBox: [200, 50],
      strokes: [
        ring2([
          ...arc(20, 25, 16, 18, Math.PI / 2, 3 * Math.PI / 2, 8),
          // rounded left end
          [180, 7],
          ...arc(180, 25, 16, 18, -Math.PI / 2, Math.PI / 2, 8),
          // rounded right end
          [20, 43]
        ]),
        arc(40, 25, 7, 7, 0, TAU, 12),
        // hole 1
        arc(80, 25, 7, 7, 0, TAU, 12),
        // hole 2
        arc(120, 25, 7, 7, 0, TAU, 12),
        // hole 3
        arc(160, 25, 7, 7, 0, TAU, 12)
        // hole 4
      ]
    }
  ];
}
function listStencils() {
  return [...genericStencils(), ...clinicalStencils()];
}

// server/figures/stickers.js
var stickers_exports = {};
__export(stickers_exports, {
  STICKER_GENRES: () => STICKER_GENRES,
  STICKER_GENRE_IDS: () => STICKER_GENRE_IDS,
  STICKER_GENRE_LABELS: () => STICKER_GENRE_LABELS,
  getSticker: () => getSticker,
  listStickers: () => listStickers
});

// server/figures/stickers/_style.js
var RETRO = {
  ink: "#1c1a17",
  // near-black outline / linework
  paper: "#fbf3e0",
  // warm off-white (sticker border + paper)
  cream: "#f5e8cf",
  red: "#e4572e",
  // tomato red
  orange: "#f08a24",
  gold: "#f4c145",
  teal: "#2dab9a",
  blue: "#3d7ea6",
  navy: "#2b4257",
  pink: "#e98ab0",
  green: "#5a9e57",
  brown: "#9a6b3f",
  plum: "#7a5ea6"
};
var OUT = 5;
var LINE = 3;
function escText2(s) {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function escAttr3(s) {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function svg(viewBox2, inner) {
  const vb = Array.isArray(viewBox2) ? `0 0 ${viewBox2[0]} ${viewBox2[1]}` : String(viewBox2);
  const kids = Array.isArray(inner) ? inner.join("") : inner ?? "";
  return `<svg viewBox="${escAttr3(vb)}" xmlns="http://www.w3.org/2000/svg" role="img">${kids}</svg>`;
}
function attrs(map) {
  const parts = [];
  for (const [k, v] of Object.entries(map)) {
    if (v === null || v === void 0) continue;
    parts.push(`${k}="${escAttr3(v)}"`);
  }
  return parts.join(" ");
}
function path2(d, { fill = "none", stroke = RETRO.ink, width = LINE, ...rest } = {}) {
  return `<path ${attrs({ d, fill, stroke, "stroke-width": width, ...rest })}/>`;
}
function circle2({ cx, cy, r, fill = "none", stroke = RETRO.ink, width = LINE, ...rest } = {}) {
  return `<circle ${attrs({ cx, cy, r, fill, stroke, "stroke-width": width, ...rest })}/>`;
}
function ellipse({ cx, cy, rx, ry, fill = "none", stroke = RETRO.ink, width = LINE, ...rest } = {}) {
  return `<ellipse ${attrs({ cx, cy, rx, ry, fill, stroke, "stroke-width": width, ...rest })}/>`;
}
function rect2({ x, y, w, h, rx, fill = "none", stroke = RETRO.ink, width = LINE, ...rest } = {}) {
  return `<rect ${attrs({ x, y, width: w, height: h, rx, fill, stroke, "stroke-width": width, ...rest })}/>`;
}
function line2({ x1, y1, x2, y2, stroke = RETRO.ink, width = LINE, ...rest } = {}) {
  return `<line ${attrs({ x1, y1, x2, y2, stroke, "stroke-width": width, ...rest })}/>`;
}
function text(str, x, y, { size = 13, anchor = "middle", fill = RETRO.ink, weight = 700, font = "Georgia, serif", ...rest } = {}) {
  return `<text ${attrs({ x, y, "text-anchor": anchor, "font-family": font, "font-weight": weight, "font-size": size, fill, ...rest })}>${escText2(str)}</text>`;
}
function disc(cx, cy, r, fill) {
  return circle2({ cx, cy, r: r + 6, fill: RETRO.paper, stroke: RETRO.ink, width: OUT }) + circle2({ cx, cy, r, fill, stroke: RETRO.ink, width: LINE });
}
function scallop(cx, cy, r, n) {
  const pts = [];
  const steps = n * 2;
  for (let i = 0; i <= steps; i++) {
    const a = i / steps * Math.PI * 2 - Math.PI / 2;
    const rad = i % 2 === 0 ? r : r - 9;
    pts.push([cx + rad * Math.cos(a), cy + rad * Math.sin(a)]);
  }
  const round14 = (n2) => Math.round(n2 * 10) / 10;
  return "M" + pts.map(([x, y]) => `${round14(x)} ${round14(y)}`).join(" L") + " Z";
}
function frame(inner, opts = {}) {
  const {
    viewBox: vb = [120, 120],
    badge = false,
    ring: ring3 = false,
    rx = 14,
    pad = 6
  } = opts;
  const [w, h] = Array.isArray(vb) ? vb : (() => {
    const p = String(vb).trim().split(/\s+/);
    return [Number(p[2]), Number(p[3])];
  })();
  const kids = Array.isArray(inner) ? inner.join("") : inner ?? "";
  let back = "";
  if (badge) {
    const cx = opts.cx ?? w / 2;
    const cy = opts.cy ?? h / 2;
    const r = opts.r ?? Math.min(w, h) / 2 - 8;
    const fill = opts.fill ?? RETRO.teal;
    back = disc(cx, cy, r, fill);
  } else if (ring3) {
    back = rect2({ x: pad, y: pad, w: w - pad * 2, h: h - pad * 2, rx, fill: RETRO.paper, stroke: RETRO.ink, width: OUT });
  }
  return svg(vb, back + kids);
}
function mkSticker(id, name, inner, opts = {}) {
  const { viewBox: viewBox2 = [120, 120], frame: useFrame = false, ...frameOpts } = opts;
  const wantFrame = useFrame || frameOpts.badge || frameOpts.ring;
  const out = wantFrame ? frame(inner, { viewBox: viewBox2, ...frameOpts }) : svg(viewBox2, inner);
  assertClean(id, out);
  return { id, name, svg: out };
}
function assertClean(id, out) {
  const head = out.slice(0, out.indexOf(">") + 1);
  if (/\swidth=|\sheight=/.test(head)) {
    throw new Error(`sticker "${id}": root <svg> must not set pixel width/height`);
  }
  if (/<script|<foreignObject|\son\w+\s*=|href|url\s*\(|xlink|<animate|<set\b/i.test(out)) {
    throw new Error(`sticker "${id}": svg contains an unsafe construct (script/href/url/xlink/SMIL/on*)`);
  }
  if (sanitise(out) !== out) {
    throw new Error(`sticker "${id}": svg is altered by sanitise() \u2014 it is not self-contained/clean`);
  }
}

// server/figures/stickers/travel.js
var travel_default = {
  genre: "travel",
  label: "Travel",
  stickers: [
    mkSticker("passport-stamp", "Passport stamp", [
      // wonky double-ring rubber-stamp look
      `<circle cx="60" cy="60" r="50" fill="none" stroke="${RETRO.red}" stroke-width="${OUT}"/>`,
      `<circle cx="60" cy="60" r="40" fill="none" stroke="${RETRO.red}" stroke-width="${LINE}"/>`,
      `<path d="M40 52 L60 36 L80 52 L72 52 L72 70 L48 70 L48 52 Z" fill="${RETRO.red}"/>`,
      `<text x="60" y="92" text-anchor="middle" font-family="Georgia, serif" font-weight="700" font-size="13" fill="${RETRO.red}" letter-spacing="2">ARRIVED</text>`
    ].join(""), { viewBox: [120, 120] }),
    mkSticker("vintage-suitcase", "Vintage suitcase", [
      `<rect x="22" y="14" width="22" height="12" rx="5" fill="none" stroke="${RETRO.ink}" stroke-width="${OUT}"/>`,
      `<rect x="14" y="26" width="92" height="62" rx="8" fill="${RETRO.brown}" stroke="${RETRO.ink}" stroke-width="${OUT}"/>`,
      `<rect x="14" y="44" width="92" height="10" fill="${RETRO.gold}" stroke="${RETRO.ink}" stroke-width="${LINE}"/>`,
      `<rect x="44" y="36" width="32" height="20" rx="3" fill="${RETRO.cream}" stroke="${RETRO.ink}" stroke-width="${LINE}"/>`,
      `<circle cx="34" cy="70" r="4" fill="${RETRO.gold}" stroke="${RETRO.ink}" stroke-width="2"/>`,
      `<circle cx="86" cy="70" r="4" fill="${RETRO.gold}" stroke="${RETRO.ink}" stroke-width="2"/>`
    ].join(""), { viewBox: [120, 100] }),
    mkSticker("paper-plane", "Paper plane", [
      `<path d="M14 40 L106 18 L66 96 L56 64 Z" fill="${RETRO.paper}" stroke="${RETRO.ink}" stroke-width="${OUT}" stroke-linejoin="round"/>`,
      `<path d="M14 40 L56 64 L106 18" fill="${RETRO.blue}" stroke="${RETRO.ink}" stroke-width="${LINE}" stroke-linejoin="round"/>`,
      `<path d="M22 56 q24 14 50 20" fill="none" stroke="${RETRO.teal}" stroke-width="${LINE}" stroke-dasharray="4 6" stroke-linecap="round"/>`
    ].join(""), { viewBox: [120, 110] }),
    mkSticker("compass-rose", "Compass rose", [
      disc(60, 60, 46, RETRO.navy),
      `<path d="M60 18 L70 60 L60 102 L50 60 Z" fill="${RETRO.gold}" stroke="${RETRO.ink}" stroke-width="${LINE}" stroke-linejoin="round"/>`,
      `<path d="M18 60 L60 50 L102 60 L60 70 Z" fill="${RETRO.paper}" stroke="${RETRO.ink}" stroke-width="${LINE}" stroke-linejoin="round"/>`,
      `<path d="M60 60 L60 18 L50 60 Z" fill="${RETRO.red}"/>`,
      `<circle cx="60" cy="60" r="7" fill="${RETRO.gold}" stroke="${RETRO.ink}" stroke-width="2"/>`
    ].join(""), { viewBox: [120, 120] }),
    mkSticker("hot-air-balloon", "Hot-air balloon", [
      `<path d="M60 12 C28 12 22 44 22 58 C22 80 44 92 60 96 C76 92 98 80 98 58 C98 44 92 12 60 12 Z" fill="${RETRO.red}" stroke="${RETRO.ink}" stroke-width="${OUT}" stroke-linejoin="round"/>`,
      `<path d="M48 14 C40 32 40 78 52 95" fill="none" stroke="${RETRO.ink}" stroke-width="${LINE}"/>`,
      `<path d="M72 14 C80 32 80 78 68 95" fill="none" stroke="${RETRO.ink}" stroke-width="${LINE}"/>`,
      `<path d="M60 12 C56 36 56 72 60 96" fill="none" stroke="${RETRO.ink}" stroke-width="${LINE}"/>`,
      `<path d="M48 95 q12 8 24 0" fill="${RETRO.gold}" stroke="${RETRO.ink}" stroke-width="${LINE}"/>`,
      `<line x1="52" y1="98" x2="50" y2="110" stroke="${RETRO.ink}" stroke-width="2"/>`,
      `<line x1="68" y1="98" x2="70" y2="110" stroke="${RETRO.ink}" stroke-width="2"/>`,
      `<rect x="48" y="108" width="24" height="14" rx="2" fill="${RETRO.brown}" stroke="${RETRO.ink}" stroke-width="${OUT}"/>`
    ].join(""), { viewBox: [120, 124] }),
    mkSticker("ships-anchor", "Anchor", [
      `<circle cx="60" cy="22" r="11" fill="none" stroke="${RETRO.ink}" stroke-width="${OUT}"/>`,
      `<line x1="60" y1="33" x2="60" y2="96" stroke="${RETRO.ink}" stroke-width="${OUT}"/>`,
      `<line x1="36" y1="46" x2="84" y2="46" stroke="${RETRO.ink}" stroke-width="${OUT}"/>`,
      `<path d="M22 70 q0 30 38 32 q38 -2 38 -32" fill="none" stroke="${RETRO.ink}" stroke-width="${OUT}" stroke-linecap="round"/>`,
      `<path d="M22 70 l-8 8 l16 4 z" fill="${RETRO.navy}" stroke="${RETRO.ink}" stroke-width="2"/>`,
      `<path d="M98 70 l8 8 l-16 4 z" fill="${RETRO.navy}" stroke="${RETRO.ink}" stroke-width="2"/>`
    ].join(""), { viewBox: [120, 120] }),
    mkSticker("palm-beach", "Palm beach", [
      disc(60, 60, 46, RETRO.blue),
      `<path d="M18 86 q42 -16 84 0 v18 h-84 z" fill="${RETRO.gold}" stroke="${RETRO.ink}" stroke-width="${LINE}"/>`,
      `<path d="M70 32 q2 30 -2 56" fill="none" stroke="${RETRO.brown}" stroke-width="${OUT}" stroke-linecap="round"/>`,
      `<path d="M70 32 q-24 -8 -34 4" fill="${RETRO.green}" stroke="${RETRO.ink}" stroke-width="2"/>`,
      `<path d="M70 32 q24 -8 34 4" fill="${RETRO.green}" stroke="${RETRO.ink}" stroke-width="2"/>`,
      `<path d="M70 32 q-14 -18 -30 -16" fill="${RETRO.green}" stroke="${RETRO.ink}" stroke-width="2"/>`,
      `<path d="M70 32 q14 -18 30 -16" fill="${RETRO.green}" stroke="${RETRO.ink}" stroke-width="2"/>`,
      `<circle cx="38" cy="40" r="9" fill="${RETRO.gold}" stroke="${RETRO.ink}" stroke-width="2"/>`
    ].join(""), { viewBox: [120, 120] }),
    mkSticker("mountain-peak", "Mountain peak", [
      disc(60, 60, 46, RETRO.teal),
      `<path d="M18 92 L46 44 L62 70 L78 38 L102 92 Z" fill="${RETRO.navy}" stroke="${RETRO.ink}" stroke-width="${OUT}" stroke-linejoin="round"/>`,
      `<path d="M40 52 L46 44 L54 56 L48 60 L44 54 Z" fill="${RETRO.paper}"/>`,
      `<path d="M70 50 L78 38 L88 56 L80 58 L74 52 Z" fill="${RETRO.paper}"/>`,
      `<circle cx="40" cy="34" r="8" fill="${RETRO.gold}" stroke="${RETRO.ink}" stroke-width="2"/>`
    ].join(""), { viewBox: [120, 120] }),
    mkSticker("retro-camera", "Retro camera", [
      `<rect x="14" y="36" width="92" height="64" rx="8" fill="${RETRO.navy}" stroke="${RETRO.ink}" stroke-width="${OUT}"/>`,
      `<path d="M40 36 l8 -12 h24 l8 12 z" fill="${RETRO.navy}" stroke="${RETRO.ink}" stroke-width="${OUT}" stroke-linejoin="round"/>`,
      `<circle cx="60" cy="68" r="20" fill="${RETRO.gold}" stroke="${RETRO.ink}" stroke-width="${OUT}"/>`,
      `<circle cx="60" cy="68" r="10" fill="${RETRO.teal}" stroke="${RETRO.ink}" stroke-width="${LINE}"/>`,
      `<circle cx="92" cy="48" r="5" fill="${RETRO.red}" stroke="${RETRO.ink}" stroke-width="2"/>`,
      `<rect x="22" y="44" width="14" height="8" rx="2" fill="${RETRO.paper}" stroke="${RETRO.ink}" stroke-width="2"/>`
    ].join(""), { viewBox: [120, 110] }),
    mkSticker("map-pin", "Map pin", [
      `<path d="M60 14 C36 14 22 32 22 52 C22 78 60 110 60 110 C60 110 98 78 98 52 C98 32 84 14 60 14 Z" fill="${RETRO.red}" stroke="${RETRO.ink}" stroke-width="${OUT}" stroke-linejoin="round"/>`,
      `<circle cx="60" cy="50" r="16" fill="${RETRO.paper}" stroke="${RETRO.ink}" stroke-width="${LINE}"/>`,
      `<circle cx="60" cy="50" r="6" fill="${RETRO.gold}" stroke="${RETRO.ink}" stroke-width="2"/>`
    ].join(""), { viewBox: [120, 120] }),
    mkSticker("globe-trotter", "Globe", [
      disc(60, 60, 46, RETRO.blue),
      `<ellipse cx="60" cy="60" rx="20" ry="46" fill="none" stroke="${RETRO.paper}" stroke-width="${LINE}"/>`,
      `<line x1="14" y1="60" x2="106" y2="60" stroke="${RETRO.paper}" stroke-width="${LINE}"/>`,
      `<path d="M36 40 q14 8 36 2 q10 8 26 6" fill="none" stroke="${RETRO.paper}" stroke-width="2"/>`,
      `<path d="M34 84 q18 -6 30 0 q12 6 24 -2" fill="none" stroke="${RETRO.paper}" stroke-width="2"/>`,
      `<path d="M40 50 q14 4 30 -2 l-2 14 q-16 6 -28 -2 z" fill="${RETRO.green}" stroke="${RETRO.ink}" stroke-width="2"/>`
    ].join(""), { viewBox: [120, 120] }),
    mkSticker("camping-tent", "Camping tent", [
      `<path d="M14 100 L60 24 L106 100 Z" fill="${RETRO.orange}" stroke="${RETRO.ink}" stroke-width="${OUT}" stroke-linejoin="round"/>`,
      `<path d="M60 24 L60 100" stroke="${RETRO.ink}" stroke-width="${LINE}"/>`,
      `<path d="M60 100 L48 60 L60 44 L72 60 Z" fill="${RETRO.navy}" stroke="${RETRO.ink}" stroke-width="${LINE}" stroke-linejoin="round"/>`,
      `<line x1="60" y1="24" x2="60" y2="14" stroke="${RETRO.ink}" stroke-width="2"/>`,
      `<path d="M60 14 l12 5 -12 5 z" fill="${RETRO.red}" stroke="${RETRO.ink}" stroke-width="2"/>`,
      `<line x1="10" y1="100" x2="110" y2="100" stroke="${RETRO.ink}" stroke-width="${OUT}" stroke-linecap="round"/>`
    ].join(""), { viewBox: [120, 112] }),
    mkSticker("travel-postcard", "Postcard", [
      `<rect x="12" y="24" width="96" height="72" rx="5" fill="${RETRO.paper}" stroke="${RETRO.ink}" stroke-width="${OUT}"/>`,
      `<line x1="60" y1="30" x2="60" y2="90" stroke="${RETRO.ink}" stroke-width="2"/>`,
      `<rect x="78" y="32" width="22" height="16" rx="2" fill="${RETRO.cream}" stroke="${RETRO.ink}" stroke-width="2"/>`,
      `<path d="M82 36 l6 5 6 -5" fill="none" stroke="${RETRO.ink}" stroke-width="2"/>`,
      `<line x1="68" y1="58" x2="100" y2="58" stroke="${RETRO.ink}" stroke-width="2"/>`,
      `<line x1="68" y1="68" x2="100" y2="68" stroke="${RETRO.ink}" stroke-width="2"/>`,
      `<line x1="68" y1="78" x2="92" y2="78" stroke="${RETRO.ink}" stroke-width="2"/>`,
      `<path d="M20 78 L34 52 L42 66 L50 48 L52 78 Z" fill="${RETRO.teal}" stroke="${RETRO.ink}" stroke-width="2" stroke-linejoin="round"/>`,
      `<circle cx="46" cy="40" r="5" fill="${RETRO.gold}" stroke="${RETRO.ink}" stroke-width="2"/>`
    ].join(""), { viewBox: [120, 110] })
  ]
};

// server/figures/stickers/monuments.js
var monuments_default = {
  genre: "monuments",
  label: "Monuments",
  stickers: [
    mkSticker("classical-column", "Classical column", [
      `<rect x="14" y="108" width="62" height="14" rx="2" fill="${RETRO.cream}" stroke="${RETRO.ink}" stroke-width="${OUT}"/>`,
      `<rect x="22" y="30" width="46" height="78" fill="${RETRO.paper}" stroke="${RETRO.ink}" stroke-width="${OUT}"/>`,
      `<line x1="33" y1="34" x2="33" y2="104" stroke="${RETRO.ink}" stroke-width="${LINE}"/>`,
      `<line x1="45" y1="34" x2="45" y2="104" stroke="${RETRO.ink}" stroke-width="${LINE}"/>`,
      `<line x1="57" y1="34" x2="57" y2="104" stroke="${RETRO.ink}" stroke-width="${LINE}"/>`,
      `<rect x="12" y="14" width="66" height="16" rx="3" fill="${RETRO.cream}" stroke="${RETRO.ink}" stroke-width="${OUT}"/>`,
      `<path d="M22 30 q-8 0 -8 -8 M68 30 q8 0 8 -8" fill="none" stroke="${RETRO.ink}" stroke-width="${LINE}"/>`
    ].join(""), { viewBox: [90, 130] }),
    mkSticker("roman-arch", "Roman arch", [
      `<path d="M16 110 L16 50 A44 44 0 0 1 104 50 L104 110" fill="${RETRO.paper}" stroke="${RETRO.ink}" stroke-width="${OUT}" stroke-linejoin="round"/>`,
      `<path d="M40 110 L40 56 A20 20 0 0 1 80 56 L80 110 Z" fill="${RETRO.navy}" stroke="${RETRO.ink}" stroke-width="${LINE}"/>`,
      `<rect x="10" y="106" width="100" height="10" rx="2" fill="${RETRO.cream}" stroke="${RETRO.ink}" stroke-width="${OUT}"/>`,
      `<path d="M60 14 l6 12 -12 0 z" fill="${RETRO.gold}" stroke="${RETRO.ink}" stroke-width="2"/>`
    ].join(""), { viewBox: [120, 120] }),
    mkSticker("obelisk", "Obelisk", [
      `<rect x="22" y="112" width="36" height="12" rx="2" fill="${RETRO.cream}" stroke="${RETRO.ink}" stroke-width="${OUT}"/>`,
      `<path d="M40 14 L54 30 L52 112 L28 112 L26 30 Z" fill="${RETRO.gold}" stroke="${RETRO.ink}" stroke-width="${OUT}" stroke-linejoin="round"/>`,
      `<path d="M40 14 L54 30 L40 30 Z" fill="${RETRO.orange}" stroke="${RETRO.ink}" stroke-width="2"/>`,
      `<line x1="40" y1="34" x2="40" y2="106" stroke="${RETRO.ink}" stroke-width="${LINE}" stroke-dasharray="3 7"/>`
    ].join(""), { viewBox: [80, 130] }),
    mkSticker("landmark-badge", "Landmark badge", [
      disc(60, 60, 46, RETRO.teal),
      // a little hill + flag
      `<path d="M24 84 q20 -34 36 -34 q16 0 36 34 Z" fill="${RETRO.green}" stroke="${RETRO.ink}" stroke-width="${LINE}" stroke-linejoin="round"/>`,
      `<line x1="60" y1="50" x2="60" y2="30" stroke="${RETRO.ink}" stroke-width="${LINE}"/>`,
      `<path d="M60 30 l16 6 -16 6 z" fill="${RETRO.red}" stroke="${RETRO.ink}" stroke-width="2"/>`,
      `<text x="60" y="100" text-anchor="middle" font-family="Georgia, serif" font-weight="700" font-size="11" fill="${RETRO.paper}" letter-spacing="1">VISITED</text>`
    ].join(""), { viewBox: [120, 120] }),
    mkSticker("pyramid-sun", "Pyramid & sun", [
      `<circle cx="84" cy="34" r="16" fill="${RETRO.gold}" stroke="${RETRO.ink}" stroke-width="${OUT}"/>`,
      `<path d="M22 104 L60 38 L98 104 Z" fill="${RETRO.orange}" stroke="${RETRO.ink}" stroke-width="${OUT}" stroke-linejoin="round"/>`,
      `<path d="M60 38 L40 104 L60 104 Z" fill="${RETRO.gold}"/>`,
      `<line x1="60" y1="38" x2="60" y2="104" stroke="${RETRO.ink}" stroke-width="${LINE}"/>`,
      `<line x1="12" y1="104" x2="108" y2="104" stroke="${RETRO.ink}" stroke-width="${OUT}" stroke-linecap="round"/>`
    ].join(""), { viewBox: [120, 116] }),
    mkSticker("iron-tower", "Iron tower", [
      `<path d="M44 18 L48 50 L36 96 L24 116 L96 116 L84 96 L72 50 L76 18 Z" fill="${RETRO.brown}" stroke="${RETRO.ink}" stroke-width="${OUT}" stroke-linejoin="round"/>`,
      `<path d="M40 62 L80 62 L88 84 L32 84 Z" fill="none" stroke="${RETRO.ink}" stroke-width="${LINE}"/>`,
      `<line x1="48" y1="50" x2="72" y2="50" stroke="${RETRO.ink}" stroke-width="${LINE}"/>`,
      `<path d="M36 96 L60 84 L84 96" fill="none" stroke="${RETRO.ink}" stroke-width="${LINE}"/>`,
      `<line x1="60" y1="18" x2="60" y2="116" stroke="${RETRO.ink}" stroke-width="2"/>`,
      `<rect x="50" y="14" width="20" height="6" fill="${RETRO.gold}" stroke="${RETRO.ink}" stroke-width="2"/>`
    ].join(""), { viewBox: [120, 124] }),
    mkSticker("clock-tower", "Clock tower", [
      `<rect x="38" y="40" width="44" height="84" fill="${RETRO.cream}" stroke="${RETRO.ink}" stroke-width="${OUT}"/>`,
      `<path d="M34 40 L60 12 L86 40 Z" fill="${RETRO.green}" stroke="${RETRO.ink}" stroke-width="${OUT}" stroke-linejoin="round"/>`,
      `<circle cx="60" cy="62" r="15" fill="${RETRO.paper}" stroke="${RETRO.ink}" stroke-width="${LINE}"/>`,
      `<line x1="60" y1="62" x2="60" y2="52" stroke="${RETRO.ink}" stroke-width="2"/>`,
      `<line x1="60" y1="62" x2="68" y2="66" stroke="${RETRO.ink}" stroke-width="2"/>`,
      `<rect x="50" y="92" width="20" height="32" rx="9" fill="${RETRO.navy}" stroke="${RETRO.ink}" stroke-width="${LINE}"/>`,
      `<line x1="60" y1="12" x2="60" y2="4" stroke="${RETRO.ink}" stroke-width="2"/>`
    ].join(""), { viewBox: [120, 130] }),
    mkSticker("leaning-tower", "Leaning tower", [
      `<path d="M46 116 L52 22 L74 24 L70 116 Z" fill="${RETRO.paper}" stroke="${RETRO.ink}" stroke-width="${OUT}" stroke-linejoin="round"/>`,
      `<line x1="50" y1="42" x2="72" y2="44" stroke="${RETRO.ink}" stroke-width="2"/>`,
      `<line x1="49" y1="60" x2="71" y2="62" stroke="${RETRO.ink}" stroke-width="2"/>`,
      `<line x1="48" y1="78" x2="70" y2="80" stroke="${RETRO.ink}" stroke-width="2"/>`,
      `<line x1="47" y1="96" x2="70" y2="98" stroke="${RETRO.ink}" stroke-width="2"/>`,
      `<path d="M50 22 L52 14 L72 16 L74 24 Z" fill="${RETRO.teal}" stroke="${RETRO.ink}" stroke-width="${LINE}" stroke-linejoin="round"/>`,
      `<rect x="38" y="116" width="40" height="8" rx="2" fill="${RETRO.cream}" stroke="${RETRO.ink}" stroke-width="${OUT}"/>`
    ].join(""), { viewBox: [110, 130] }),
    mkSticker("domed-palace", "Domed palace", [
      `<rect x="20" y="74" width="80" height="46" fill="${RETRO.paper}" stroke="${RETRO.ink}" stroke-width="${OUT}"/>`,
      `<path d="M40 74 a20 26 0 0 1 40 0 Z" fill="${RETRO.cream}" stroke="${RETRO.ink}" stroke-width="${OUT}" stroke-linejoin="round"/>`,
      `<line x1="60" y1="48" x2="60" y2="36" stroke="${RETRO.ink}" stroke-width="2"/>`,
      `<circle cx="60" cy="32" r="5" fill="${RETRO.gold}" stroke="${RETRO.ink}" stroke-width="2"/>`,
      `<path d="M50 120 L50 96 a10 12 0 0 1 20 0 L70 120 Z" fill="${RETRO.teal}" stroke="${RETRO.ink}" stroke-width="${LINE}"/>`,
      `<path d="M22 74 a6 14 0 0 1 12 0 Z" fill="${RETRO.cream}" stroke="${RETRO.ink}" stroke-width="2"/>`,
      `<path d="M86 74 a6 14 0 0 1 12 0 Z" fill="${RETRO.cream}" stroke="${RETRO.ink}" stroke-width="2"/>`
    ].join(""), { viewBox: [120, 124] }),
    mkSticker("liberty-torch", "Liberty torch", [
      `<path d="M52 116 L48 60 L72 60 L68 116 Z" fill="${RETRO.teal}" stroke="${RETRO.ink}" stroke-width="${OUT}" stroke-linejoin="round"/>`,
      `<rect x="44" y="50" width="32" height="12" rx="3" fill="${RETRO.teal}" stroke="${RETRO.ink}" stroke-width="${LINE}"/>`,
      `<path d="M52 50 L56 30 L64 30 L68 50 Z" fill="${RETRO.cream}" stroke="${RETRO.ink}" stroke-width="${LINE}" stroke-linejoin="round"/>`,
      `<path d="M60 30 C50 18 56 8 60 4 C64 8 70 18 60 30 Z" fill="${RETRO.gold}" stroke="${RETRO.ink}" stroke-width="${LINE}" stroke-linejoin="round"/>`,
      `<line x1="40" y1="116" x2="80" y2="116" stroke="${RETRO.ink}" stroke-width="${OUT}" stroke-linecap="round"/>`
    ].join(""), { viewBox: [120, 124] }),
    mkSticker("stone-trilithon", "Stonehenge", [
      `<rect x="22" y="48" width="20" height="68" rx="3" fill="${RETRO.cream}" stroke="${RETRO.ink}" stroke-width="${OUT}"/>`,
      `<rect x="78" y="48" width="20" height="68" rx="3" fill="${RETRO.cream}" stroke="${RETRO.ink}" stroke-width="${OUT}"/>`,
      `<rect x="14" y="28" width="92" height="22" rx="3" fill="${RETRO.brown}" stroke="${RETRO.ink}" stroke-width="${OUT}"/>`,
      `<line x1="32" y1="56" x2="30" y2="108" stroke="${RETRO.ink}" stroke-width="2"/>`,
      `<line x1="88" y1="56" x2="90" y2="108" stroke="${RETRO.ink}" stroke-width="2"/>`,
      `<line x1="10" y1="116" x2="110" y2="116" stroke="${RETRO.ink}" stroke-width="${OUT}" stroke-linecap="round"/>`,
      `<circle cx="92" cy="18" r="9" fill="${RETRO.gold}" stroke="${RETRO.ink}" stroke-width="2"/>`
    ].join(""), { viewBox: [120, 122] }),
    mkSticker("tiered-pagoda", "Pagoda temple", [
      `<rect x="48" y="98" width="24" height="22" fill="${RETRO.cream}" stroke="${RETRO.ink}" stroke-width="${OUT}"/>`,
      `<path d="M28 98 q32 -14 64 0 q-6 -12 -16 -16 H44 q-10 4 -16 16 Z" fill="${RETRO.red}" stroke="${RETRO.ink}" stroke-width="${OUT}" stroke-linejoin="round"/>`,
      `<path d="M34 70 q26 -12 52 0 q-6 -12 -14 -16 H48 q-8 4 -14 16 Z" fill="${RETRO.orange}" stroke="${RETRO.ink}" stroke-width="${OUT}" stroke-linejoin="round"/>`,
      `<path d="M40 44 q20 -10 40 0 q-5 -12 -12 -18 H52 q-7 6 -12 18 Z" fill="${RETRO.red}" stroke="${RETRO.ink}" stroke-width="${OUT}" stroke-linejoin="round"/>`,
      `<line x1="60" y1="26" x2="60" y2="14" stroke="${RETRO.ink}" stroke-width="2"/>`,
      `<circle cx="60" cy="11" r="5" fill="${RETRO.gold}" stroke="${RETRO.ink}" stroke-width="2"/>`,
      `<line x1="14" y1="120" x2="106" y2="120" stroke="${RETRO.ink}" stroke-width="${OUT}" stroke-linecap="round"/>`
    ].join(""), { viewBox: [120, 126] })
  ]
};

// server/figures/stickers/science.js
var science_default = {
  genre: "science",
  label: "Science",
  stickers: [
    mkSticker("atom", "Atom", [
      `<ellipse cx="60" cy="60" rx="48" ry="20" fill="none" stroke="${RETRO.blue}" stroke-width="${OUT}"/>`,
      `<ellipse cx="60" cy="60" rx="48" ry="20" fill="none" stroke="${RETRO.teal}" stroke-width="${LINE}" transform="rotate(60 60 60)"/>`,
      `<ellipse cx="60" cy="60" rx="48" ry="20" fill="none" stroke="${RETRO.red}" stroke-width="${LINE}" transform="rotate(-60 60 60)"/>`,
      `<circle cx="60" cy="60" r="9" fill="${RETRO.gold}" stroke="${RETRO.ink}" stroke-width="${LINE}"/>`
    ].join(""), { viewBox: [120, 120] }),
    mkSticker("beaker", "Beaker / flask", [
      `<path d="M40 16 L40 48 L18 100 a8 8 0 0 0 7 12 L75 112 a8 8 0 0 0 7 -12 L60 48 L60 16 Z" fill="${RETRO.paper}" stroke="${RETRO.ink}" stroke-width="${OUT}" stroke-linejoin="round"/>`,
      `<path d="M28 78 L72 78 L80 96 a8 8 0 0 1 -7 12 L25 108 a8 8 0 0 1 -7 -12 Z" fill="${RETRO.teal}" stroke="${RETRO.ink}" stroke-width="${LINE}" stroke-linejoin="round"/>`,
      `<rect x="36" y="10" width="28" height="8" rx="3" fill="${RETRO.gold}" stroke="${RETRO.ink}" stroke-width="2"/>`,
      `<circle cx="40" cy="92" r="3" fill="${RETRO.paper}"/>`,
      `<circle cx="56" cy="98" r="2.5" fill="${RETRO.paper}"/>`
    ].join(""), { viewBox: [100, 120] }),
    mkSticker("dna", "DNA helix", [
      `<path d="M24 14 C 64 40 16 64 56 90 C 64 96 64 110 60 120" fill="none" stroke="${RETRO.red}" stroke-width="${OUT}" stroke-linecap="round"/>`,
      `<path d="M56 14 C 16 40 64 64 24 90 C 16 96 16 110 20 120" fill="none" stroke="${RETRO.blue}" stroke-width="${OUT}" stroke-linecap="round"/>`,
      `<line x1="30" y1="28" x2="50" y2="28" stroke="${RETRO.gold}" stroke-width="${LINE}"/>`,
      `<line x1="26" y1="50" x2="54" y2="50" stroke="${RETRO.teal}" stroke-width="${LINE}"/>`,
      `<line x1="30" y1="72" x2="50" y2="72" stroke="${RETRO.gold}" stroke-width="${LINE}"/>`,
      `<line x1="28" y1="98" x2="52" y2="98" stroke="${RETRO.teal}" stroke-width="${LINE}"/>`
    ].join(""), { viewBox: [80, 130] }),
    mkSticker("rocket", "Rocket", [
      `<path d="M45 12 C 66 32 66 64 60 86 L30 86 C 24 64 24 32 45 12 Z" fill="${RETRO.paper}" stroke="${RETRO.ink}" stroke-width="${OUT}" stroke-linejoin="round"/>`,
      `<circle cx="45" cy="44" r="9" fill="${RETRO.blue}" stroke="${RETRO.ink}" stroke-width="${LINE}"/>`,
      `<path d="M30 86 L16 104 L30 96 Z" fill="${RETRO.red}" stroke="${RETRO.ink}" stroke-width="${LINE}" stroke-linejoin="round"/>`,
      `<path d="M60 86 L74 104 L60 96 Z" fill="${RETRO.red}" stroke="${RETRO.ink}" stroke-width="${LINE}" stroke-linejoin="round"/>`,
      `<path d="M38 96 L52 96 L46 122 Z" fill="${RETRO.orange}" stroke="${RETRO.ink}" stroke-width="${LINE}" stroke-linejoin="round"/>`
    ].join(""), { viewBox: [90, 130] }),
    mkSticker("microscope", "Microscope", [
      `<rect x="24" y="100" width="72" height="12" rx="5" fill="${RETRO.navy}" stroke="${RETRO.ink}" stroke-width="${OUT}"/>`,
      `<path d="M52 28 C 30 38 26 70 38 92 L52 86 C 44 70 46 46 60 40 Z" fill="${RETRO.teal}" stroke="${RETRO.ink}" stroke-width="${OUT}" stroke-linejoin="round"/>`,
      `<rect x="48" y="20" width="22" height="16" rx="5" fill="${RETRO.gold}" stroke="${RETRO.ink}" stroke-width="${LINE}"/>`,
      `<rect x="56" y="36" width="8" height="40" fill="${RETRO.cream}" stroke="${RETRO.ink}" stroke-width="2"/>`,
      `<rect x="42" y="88" width="40" height="8" fill="${RETRO.red}" stroke="${RETRO.ink}" stroke-width="${LINE}"/>`,
      `<circle cx="60" cy="92" r="4" fill="${RETRO.paper}" stroke="${RETRO.ink}" stroke-width="2"/>`
    ].join(""), { viewBox: [120, 120] }),
    mkSticker("magnet", "Horseshoe magnet", [
      `<path d="M30 96 L30 56 a30 30 0 0 1 60 0 L90 96 L66 96 L66 56 a6 6 0 0 0 -12 0 L54 96 Z" fill="${RETRO.red}" stroke="${RETRO.ink}" stroke-width="${OUT}" stroke-linejoin="round"/>`,
      `<rect x="28" y="96" width="26" height="16" fill="${RETRO.cream}" stroke="${RETRO.ink}" stroke-width="${LINE}"/>`,
      `<rect x="66" y="96" width="26" height="16" fill="${RETRO.cream}" stroke="${RETRO.ink}" stroke-width="${LINE}"/>`,
      `<path d="M16 40 l10 6 -10 6" fill="none" stroke="${RETRO.blue}" stroke-width="${LINE}" stroke-linecap="round" stroke-linejoin="round"/>`,
      `<path d="M104 40 l-10 6 10 6" fill="none" stroke="${RETRO.blue}" stroke-width="${LINE}" stroke-linecap="round" stroke-linejoin="round"/>`
    ].join(""), { viewBox: [120, 120] }),
    mkSticker("lightbulb", "Bright idea", [
      `<path d="M60 14 C 32 14 22 44 38 66 C 46 76 46 84 46 92 L74 92 C 74 84 74 76 82 66 C 98 44 88 14 60 14 Z" fill="${RETRO.gold}" stroke="${RETRO.ink}" stroke-width="${OUT}" stroke-linejoin="round"/>`,
      `<rect x="46" y="92" width="28" height="10" fill="${RETRO.cream}" stroke="${RETRO.ink}" stroke-width="${LINE}"/>`,
      `<rect x="48" y="102" width="24" height="8" fill="${RETRO.brown}" stroke="${RETRO.ink}" stroke-width="2"/>`,
      `<path d="M54 58 L60 40 L66 58 L60 70 Z" fill="${RETRO.red}" stroke="${RETRO.ink}" stroke-width="2" stroke-linejoin="round"/>`,
      `<line x1="20" y1="34" x2="30" y2="40" stroke="${RETRO.orange}" stroke-width="${LINE}" stroke-linecap="round"/>`,
      `<line x1="100" y1="34" x2="90" y2="40" stroke="${RETRO.orange}" stroke-width="${LINE}" stroke-linecap="round"/>`,
      `<line x1="60" y1="6" x2="60" y2="14" stroke="${RETRO.orange}" stroke-width="${LINE}" stroke-linecap="round"/>`
    ].join(""), { viewBox: [120, 120] }),
    mkSticker("gear", "Cog wheel", [
      `<path d="M60 8 l8 12 16 -4 4 16 14 6 -6 14 6 14 -14 6 -4 16 -16 -4 -8 12 -8 -12 -16 4 -4 -16 -14 -6 6 -14 -6 -14 14 -6 4 -16 16 4 Z" fill="${RETRO.teal}" stroke="${RETRO.ink}" stroke-width="${OUT}" stroke-linejoin="round"/>`,
      `<circle cx="60" cy="60" r="20" fill="${RETRO.cream}" stroke="${RETRO.ink}" stroke-width="${LINE}"/>`,
      `<circle cx="60" cy="60" r="8" fill="${RETRO.gold}" stroke="${RETRO.ink}" stroke-width="2"/>`
    ].join(""), { viewBox: [120, 120] }),
    mkSticker("telescope", "Telescope", [
      `<path d="M16 78 L84 30 L98 48 L34 100 Z" fill="${RETRO.navy}" stroke="${RETRO.ink}" stroke-width="${OUT}" stroke-linejoin="round"/>`,
      `<path d="M80 26 L102 42 L96 52 L74 36 Z" fill="${RETRO.gold}" stroke="${RETRO.ink}" stroke-width="${LINE}" stroke-linejoin="round"/>`,
      `<rect x="44" y="56" width="14" height="10" fill="${RETRO.red}" stroke="${RETRO.ink}" stroke-width="2" transform="rotate(-35 51 61)"/>`,
      `<path d="M40 96 L34 116 M48 100 L62 114" fill="none" stroke="${RETRO.ink}" stroke-width="${OUT}" stroke-linecap="round"/>`,
      `<circle cx="100" cy="18" r="3" fill="${RETRO.gold}"/>`,
      `<circle cx="88" cy="12" r="2" fill="${RETRO.gold}"/>`
    ].join(""), { viewBox: [120, 120] }),
    mkSticker("molecule", "Benzene ring", [
      `<path d="M60 16 L96 38 L96 82 L60 104 L24 82 L24 38 Z" fill="${RETRO.cream}" stroke="${RETRO.ink}" stroke-width="${OUT}" stroke-linejoin="round"/>`,
      `<circle cx="60" cy="60" r="20" fill="none" stroke="${RETRO.teal}" stroke-width="${LINE}"/>`,
      `<circle cx="60" cy="16" r="7" fill="${RETRO.red}" stroke="${RETRO.ink}" stroke-width="2"/>`,
      `<circle cx="96" cy="38" r="7" fill="${RETRO.blue}" stroke="${RETRO.ink}" stroke-width="2"/>`,
      `<circle cx="96" cy="82" r="7" fill="${RETRO.gold}" stroke="${RETRO.ink}" stroke-width="2"/>`,
      `<circle cx="60" cy="104" r="7" fill="${RETRO.red}" stroke="${RETRO.ink}" stroke-width="2"/>`,
      `<circle cx="24" cy="82" r="7" fill="${RETRO.blue}" stroke="${RETRO.ink}" stroke-width="2"/>`,
      `<circle cx="24" cy="38" r="7" fill="${RETRO.gold}" stroke="${RETRO.ink}" stroke-width="2"/>`
    ].join(""), { viewBox: [120, 120] }),
    mkSticker("prism", "Prism + light", [
      `<path d="M58 18 L98 92 L18 92 Z" fill="${RETRO.navy}" stroke="${RETRO.ink}" stroke-width="${OUT}" stroke-linejoin="round"/>`,
      `<line x1="6" y1="52" x2="50" y2="56" stroke="${RETRO.paper}" stroke-width="${LINE}" stroke-linecap="round"/>`,
      `<line x1="60" y1="58" x2="112" y2="44" stroke="${RETRO.red}" stroke-width="2" stroke-linecap="round"/>`,
      `<line x1="60" y1="60" x2="112" y2="54" stroke="${RETRO.orange}" stroke-width="2" stroke-linecap="round"/>`,
      `<line x1="60" y1="62" x2="112" y2="64" stroke="${RETRO.gold}" stroke-width="2" stroke-linecap="round"/>`,
      `<line x1="60" y1="64" x2="112" y2="74" stroke="${RETRO.teal}" stroke-width="2" stroke-linecap="round"/>`,
      `<line x1="60" y1="66" x2="112" y2="84" stroke="${RETRO.blue}" stroke-width="2" stroke-linecap="round"/>`
    ].join(""), { viewBox: [120, 120] }),
    mkSticker("magnifier", "Magnifying glass", [
      `<circle cx="50" cy="48" r="34" fill="${RETRO.cream}" stroke="${RETRO.ink}" stroke-width="${OUT}"/>`,
      `<circle cx="50" cy="48" r="24" fill="${RETRO.blue}" stroke="${RETRO.ink}" stroke-width="${LINE}"/>`,
      `<path d="M40 38 a16 16 0 0 1 14 -6" fill="none" stroke="${RETRO.paper}" stroke-width="${LINE}" stroke-linecap="round"/>`,
      `<rect x="72" y="74" width="16" height="40" rx="7" fill="${RETRO.brown}" stroke="${RETRO.ink}" stroke-width="${OUT}" transform="rotate(-45 80 94)"/>`
    ].join(""), { viewBox: [120, 120] })
  ]
};

// server/figures/stickers/paintings.js
var paintings_default = {
  genre: "paintings",
  label: "Art",
  stickers: [
    mkSticker("palette", "Artist palette", [
      `<path d="M58 12 C 18 12 8 48 18 70 C 26 88 50 92 56 78 C 60 68 74 70 74 82 C 74 98 110 86 110 52 C 110 26 92 12 58 12 Z" fill="${RETRO.cream}" stroke="${RETRO.ink}" stroke-width="${OUT}" stroke-linejoin="round"/>`,
      `<circle cx="40" cy="34" r="7" fill="${RETRO.red}" stroke="${RETRO.ink}" stroke-width="2"/>`,
      `<circle cx="64" cy="28" r="7" fill="${RETRO.gold}" stroke="${RETRO.ink}" stroke-width="2"/>`,
      `<circle cx="86" cy="36" r="7" fill="${RETRO.teal}" stroke="${RETRO.ink}" stroke-width="2"/>`,
      `<circle cx="90" cy="60" r="7" fill="${RETRO.plum}" stroke="${RETRO.ink}" stroke-width="2"/>`,
      `<circle cx="36" cy="58" r="7" fill="${RETRO.blue}" stroke="${RETRO.ink}" stroke-width="2"/>`
    ].join(""), { viewBox: [120, 110] }),
    mkSticker("framed-canvas", "Framed canvas", [
      `<rect x="14" y="12" width="92" height="86" rx="4" fill="${RETRO.gold}" stroke="${RETRO.ink}" stroke-width="${OUT}"/>`,
      `<rect x="26" y="24" width="68" height="62" fill="${RETRO.paper}" stroke="${RETRO.ink}" stroke-width="${LINE}"/>`,
      `<path d="M26 70 q16 -30 30 -16 q12 12 24 -6 l14 0 0 24 Z" fill="${RETRO.green}" stroke="${RETRO.ink}" stroke-width="2" stroke-linejoin="round"/>`,
      `<circle cx="74" cy="36" r="6" fill="${RETRO.orange}" stroke="${RETRO.ink}" stroke-width="2"/>`
    ].join(""), { viewBox: [120, 110] }),
    mkSticker("paintbrush", "Paintbrush", [
      `<rect x="32" y="14" width="16" height="60" rx="6" fill="${RETRO.brown}" stroke="${RETRO.ink}" stroke-width="${OUT}"/>`,
      `<rect x="30" y="70" width="20" height="14" fill="${RETRO.gold}" stroke="${RETRO.ink}" stroke-width="${LINE}"/>`,
      `<path d="M30 84 L50 84 L46 116 a14 14 0 0 1 -12 0 Z" fill="${RETRO.red}" stroke="${RETRO.ink}" stroke-width="${OUT}" stroke-linejoin="round"/>`,
      `<path d="M38 116 q2 8 2 12 M40 116 q-1 8 -3 12" fill="none" stroke="${RETRO.red}" stroke-width="${LINE}" stroke-linecap="round"/>`
    ].join(""), { viewBox: [80, 130] }),
    mkSticker("easel", "Easel + canvas", [
      `<path d="M30 102 L46 22 L74 22 L90 102 M60 22 L60 110" fill="none" stroke="${RETRO.brown}" stroke-width="${OUT}" stroke-linecap="round" stroke-linejoin="round"/>`,
      `<rect x="30" y="20" width="60" height="50" rx="3" fill="${RETRO.paper}" stroke="${RETRO.ink}" stroke-width="${OUT}"/>`,
      `<path d="M34 60 q14 -26 26 -12 q10 12 22 -8 l4 0 0 20 Z" fill="${RETRO.teal}" stroke="${RETRO.ink}" stroke-width="2" stroke-linejoin="round"/>`,
      `<circle cx="50" cy="34" r="6" fill="${RETRO.gold}" stroke="${RETRO.ink}" stroke-width="2"/>`,
      `<line x1="36" y1="84" x2="84" y2="84" stroke="${RETRO.brown}" stroke-width="${LINE}" stroke-linecap="round"/>`
    ].join(""), { viewBox: [120, 120] }),
    mkSticker("gold-frame", "Ornate frame", [
      `<rect x="14" y="14" width="92" height="92" rx="4" fill="${RETRO.gold}" stroke="${RETRO.ink}" stroke-width="${OUT}"/>`,
      `<rect x="26" y="26" width="68" height="68" fill="${RETRO.brown}" stroke="${RETRO.ink}" stroke-width="${LINE}"/>`,
      `<rect x="34" y="34" width="52" height="52" fill="${RETRO.navy}" stroke="${RETRO.ink}" stroke-width="2"/>`,
      `<circle cx="14" cy="14" r="7" fill="${RETRO.gold}" stroke="${RETRO.ink}" stroke-width="2"/>`,
      `<circle cx="106" cy="14" r="7" fill="${RETRO.gold}" stroke="${RETRO.ink}" stroke-width="2"/>`,
      `<circle cx="14" cy="106" r="7" fill="${RETRO.gold}" stroke="${RETRO.ink}" stroke-width="2"/>`,
      `<circle cx="106" cy="106" r="7" fill="${RETRO.gold}" stroke="${RETRO.ink}" stroke-width="2"/>`
    ].join(""), { viewBox: [120, 120] }),
    mkSticker("brush-jar", "Brush jar", [
      `<path d="M30 54 L90 54 L84 108 a6 6 0 0 1 -6 6 L42 114 a6 6 0 0 1 -6 -6 Z" fill="${RETRO.teal}" stroke="${RETRO.ink}" stroke-width="${OUT}" stroke-linejoin="round"/>`,
      `<path d="M30 54 L90 54 L88 70 L32 70 Z" fill="${RETRO.paper}" stroke="${RETRO.ink}" stroke-width="${LINE}" stroke-linejoin="round"/>`,
      `<line x1="50" y1="54" x2="44" y2="10" stroke="${RETRO.brown}" stroke-width="${OUT}" stroke-linecap="round"/>`,
      `<line x1="44" y1="10" x2="44" y2="4" stroke="${RETRO.red}" stroke-width="6" stroke-linecap="round"/>`,
      `<line x1="64" y1="54" x2="68" y2="14" stroke="${RETRO.brown}" stroke-width="${OUT}" stroke-linecap="round"/>`,
      `<line x1="68" y1="14" x2="69" y2="8" stroke="${RETRO.gold}" stroke-width="6" stroke-linecap="round"/>`,
      `<line x1="76" y1="54" x2="82" y2="20" stroke="${RETRO.brown}" stroke-width="${OUT}" stroke-linecap="round"/>`,
      `<line x1="82" y1="20" x2="83" y2="14" stroke="${RETRO.plum}" stroke-width="6" stroke-linecap="round"/>`
    ].join(""), { viewBox: [120, 120] }),
    mkSticker("swatch-strip", "Colour swatches", [
      `<rect x="22" y="20" width="76" height="84" rx="6" fill="${RETRO.paper}" stroke="${RETRO.ink}" stroke-width="${OUT}"/>`,
      `<rect x="32" y="28" width="56" height="14" fill="${RETRO.red}" stroke="${RETRO.ink}" stroke-width="2"/>`,
      `<rect x="32" y="46" width="56" height="14" fill="${RETRO.gold}" stroke="${RETRO.ink}" stroke-width="2"/>`,
      `<rect x="32" y="64" width="56" height="14" fill="${RETRO.teal}" stroke="${RETRO.ink}" stroke-width="2"/>`,
      `<rect x="32" y="82" width="56" height="14" fill="${RETRO.plum}" stroke="${RETRO.ink}" stroke-width="2"/>`
    ].join(""), { viewBox: [120, 120] }),
    mkSticker("ink-quill", "Ink pot + quill", [
      `<path d="M34 70 L86 70 L82 106 a6 6 0 0 1 -6 6 L44 112 a6 6 0 0 1 -6 -6 Z" fill="${RETRO.navy}" stroke="${RETRO.ink}" stroke-width="${OUT}" stroke-linejoin="round"/>`,
      `<rect x="44" y="60" width="32" height="12" rx="3" fill="${RETRO.cream}" stroke="${RETRO.ink}" stroke-width="${LINE}"/>`,
      `<path d="M62 62 C 78 40 96 22 108 12 C 96 30 86 50 76 66 Z" fill="${RETRO.red}" stroke="${RETRO.ink}" stroke-width="${OUT}" stroke-linejoin="round"/>`,
      `<line x1="92" y1="34" x2="78" y2="52" stroke="${RETRO.ink}" stroke-width="2"/>`
    ].join(""), { viewBox: [120, 120] }),
    mkSticker("paint-splat", "Paint splat", [
      `<path d="M60 16 C 78 18 86 34 80 50 C 96 48 110 60 100 76 C 110 88 98 106 82 98 C 84 114 66 118 58 104 C 46 116 28 108 34 92 C 18 94 14 74 30 68 C 16 56 28 38 44 46 C 42 28 50 16 60 16 Z" fill="${RETRO.red}" stroke="${RETRO.ink}" stroke-width="${OUT}" stroke-linejoin="round"/>`,
      `<circle cx="60" cy="62" r="14" fill="${RETRO.gold}" stroke="${RETRO.ink}" stroke-width="2"/>`,
      `<circle cx="100" cy="30" r="5" fill="${RETRO.red}" stroke="${RETRO.ink}" stroke-width="2"/>`,
      `<circle cx="22" cy="100" r="4" fill="${RETRO.red}" stroke="${RETRO.ink}" stroke-width="2"/>`
    ].join(""), { viewBox: [120, 120] }),
    mkSticker("spotlight-art", "Gallery spotlight", [
      `<path d="M16 8 L40 8 L92 110 L68 110 Z" fill="${RETRO.gold}" stroke="${RETRO.ink}" stroke-width="2" stroke-linejoin="round" opacity="0.85"/>`,
      `<rect x="6" y="6" width="22" height="14" rx="4" fill="${RETRO.navy}" stroke="${RETRO.ink}" stroke-width="${OUT}"/>`,
      `<rect x="56" y="48" width="52" height="56" rx="3" fill="${RETRO.brown}" stroke="${RETRO.ink}" stroke-width="${OUT}"/>`,
      `<rect x="66" y="58" width="32" height="36" fill="${RETRO.paper}" stroke="${RETRO.ink}" stroke-width="${LINE}"/>`,
      `<path d="M66 84 q8 -18 16 -8 q6 8 16 -6 l0 24 Z" fill="${RETRO.teal}" stroke="${RETRO.ink}" stroke-width="2" stroke-linejoin="round"/>`
    ].join(""), { viewBox: [120, 120] }),
    mkSticker("pencil", "Charcoal pencil", [
      `<rect x="36" y="14" width="22" height="68" fill="${RETRO.gold}" stroke="${RETRO.ink}" stroke-width="${OUT}" transform="rotate(20 47 48)"/>`,
      `<path d="M55 92 L70 102 L78 84 Z" fill="${RETRO.cream}" stroke="${RETRO.ink}" stroke-width="${LINE}" stroke-linejoin="round"/>`,
      `<path d="M70 102 L78 84 L80 93 Z" fill="${RETRO.ink}"/>`,
      `<rect x="34" y="12" width="22" height="10" fill="${RETRO.red}" stroke="${RETRO.ink}" stroke-width="2" transform="rotate(20 45 17)"/>`
    ].join(""), { viewBox: [120, 120] }),
    mkSticker("watercolour-blobs", "Watercolour blobs", [
      `<path d="M40 30 C 58 28 60 50 46 56 C 30 62 20 44 28 36 C 31 32 35 31 40 30 Z" fill="${RETRO.teal}" stroke="${RETRO.ink}" stroke-width="${OUT}" stroke-linejoin="round"/>`,
      `<path d="M82 38 C 100 38 102 60 86 64 C 70 68 62 50 70 42 C 73 39 78 38 82 38 Z" fill="${RETRO.red}" stroke="${RETRO.ink}" stroke-width="${OUT}" stroke-linejoin="round"/>`,
      `<path d="M60 76 C 80 74 84 98 66 102 C 48 106 38 86 48 78 C 51 76 56 76 60 76 Z" fill="${RETRO.gold}" stroke="${RETRO.ink}" stroke-width="${OUT}" stroke-linejoin="round"/>`,
      `<circle cx="36" cy="42" r="4" fill="${RETRO.paper}"/>`,
      `<circle cx="78" cy="50" r="4" fill="${RETRO.paper}"/>`
    ].join(""), { viewBox: [120, 120] })
  ]
};

// server/figures/stickers/flora-fauna.js
var flora_fauna_default = {
  genre: "flora-fauna",
  label: "Flora & fauna",
  stickers: [
    mkSticker("leaf", "Leaf", [
      `<path d="M20 100 C 20 40 60 16 92 16 C 92 76 52 100 20 100 Z" fill="${RETRO.green}" stroke="${RETRO.ink}" stroke-width="${OUT}" stroke-linejoin="round"/>`,
      `<path d="M28 92 C 48 60 72 36 88 22" fill="none" stroke="${RETRO.ink}" stroke-width="${LINE}" stroke-linecap="round"/>`,
      `<path d="M52 64 l16 -6 M44 76 l16 -8 M62 50 l14 -4" fill="none" stroke="${RETRO.ink}" stroke-width="2" stroke-linecap="round"/>`
    ].join(""), { viewBox: [110, 120] }),
    mkSticker("bird", "Bird", [
      `<path d="M18 64 C 18 36 44 26 64 30 C 80 32 92 24 100 16 C 98 30 96 38 88 44 C 100 46 108 56 108 68 C 86 72 50 84 30 80 C 20 78 18 70 18 64 Z" fill="${RETRO.blue}" stroke="${RETRO.ink}" stroke-width="${OUT}" stroke-linejoin="round"/>`,
      `<path d="M48 50 q18 -8 34 0 q-12 12 -34 0 Z" fill="${RETRO.teal}" stroke="${RETRO.ink}" stroke-width="${LINE}" stroke-linejoin="round"/>`,
      `<circle cx="34" cy="52" r="3.5" fill="${RETRO.ink}"/>`,
      `<path d="M18 56 l-12 2 12 4 Z" fill="${RETRO.gold}" stroke="${RETRO.ink}" stroke-width="2" stroke-linejoin="round"/>`
    ].join(""), { viewBox: [120, 100] }),
    mkSticker("paw", "Paw print", [
      `<path d="M30 64 C 30 50 80 50 80 64 C 80 86 64 96 55 96 C 46 96 30 86 30 64 Z" fill="${RETRO.brown}" stroke="${RETRO.ink}" stroke-width="${OUT}" stroke-linejoin="round"/>`,
      `<ellipse cx="28" cy="40" rx="9" ry="12" fill="${RETRO.brown}" stroke="${RETRO.ink}" stroke-width="${LINE}"/>`,
      `<ellipse cx="46" cy="26" rx="9" ry="12" fill="${RETRO.brown}" stroke="${RETRO.ink}" stroke-width="${LINE}"/>`,
      `<ellipse cx="66" cy="26" rx="9" ry="12" fill="${RETRO.brown}" stroke="${RETRO.ink}" stroke-width="${LINE}"/>`,
      `<ellipse cx="84" cy="40" rx="9" ry="12" fill="${RETRO.brown}" stroke="${RETRO.ink}" stroke-width="${LINE}"/>`
    ].join(""), { viewBox: [110, 110] }),
    mkSticker("flower", "Flower", [
      `<line x1="55" y1="60" x2="55" y2="112" stroke="${RETRO.green}" stroke-width="${OUT}" stroke-linecap="round"/>`,
      `<path d="M55 92 q-22 -4 -26 -20 q20 -2 26 14 Z" fill="${RETRO.green}" stroke="${RETRO.ink}" stroke-width="2" stroke-linejoin="round"/>`,
      ...[0, 72, 144, 216, 288].map((a) => `<ellipse cx="55" cy="32" rx="12" ry="20" fill="${RETRO.pink}" stroke="${RETRO.ink}" stroke-width="${LINE}" transform="rotate(${a} 55 48)"/>`),
      `<circle cx="55" cy="48" r="11" fill="${RETRO.gold}" stroke="${RETRO.ink}" stroke-width="${LINE}"/>`
    ].join(""), { viewBox: [110, 120] }),
    mkSticker("cat-face", "Cat face", [
      `<path d="M24 36 L40 56 L80 56 L96 36 L92 72 C 92 96 70 104 60 104 C 50 104 28 96 28 72 Z" fill="${RETRO.gold}" stroke="${RETRO.ink}" stroke-width="${OUT}" stroke-linejoin="round"/>`,
      `<path d="M24 36 L34 60 L46 54 Z" fill="${RETRO.pink}" stroke="${RETRO.ink}" stroke-width="2" stroke-linejoin="round"/>`,
      `<path d="M96 36 L86 60 L74 54 Z" fill="${RETRO.pink}" stroke="${RETRO.ink}" stroke-width="2" stroke-linejoin="round"/>`,
      `<circle cx="46" cy="70" r="5" fill="${RETRO.ink}"/>`,
      `<circle cx="74" cy="70" r="5" fill="${RETRO.ink}"/>`,
      `<path d="M60 80 l-6 6 l6 4 l6 -4 Z" fill="${RETRO.pink}" stroke="${RETRO.ink}" stroke-width="2" stroke-linejoin="round"/>`,
      `<path d="M60 90 v6 M40 84 l-18 -2 M40 90 l-18 6 M80 84 l18 -2 M80 90 l18 6" fill="none" stroke="${RETRO.ink}" stroke-width="2" stroke-linecap="round"/>`
    ].join(""), { viewBox: [120, 120] }),
    mkSticker("dog-face", "Dog face", [
      `<path d="M26 30 C 18 30 16 58 26 70 L34 56 Z" fill="${RETRO.brown}" stroke="${RETRO.ink}" stroke-width="${OUT}" stroke-linejoin="round"/>`,
      `<path d="M94 30 C 102 30 104 58 94 70 L86 56 Z" fill="${RETRO.brown}" stroke="${RETRO.ink}" stroke-width="${OUT}" stroke-linejoin="round"/>`,
      `<path d="M34 46 C 34 30 86 30 86 46 C 92 60 88 96 60 100 C 32 96 28 60 34 46 Z" fill="${RETRO.gold}" stroke="${RETRO.ink}" stroke-width="${OUT}" stroke-linejoin="round"/>`,
      `<circle cx="46" cy="64" r="5" fill="${RETRO.ink}"/>`,
      `<circle cx="74" cy="64" r="5" fill="${RETRO.ink}"/>`,
      `<ellipse cx="60" cy="80" rx="9" ry="7" fill="${RETRO.ink}"/>`,
      `<path d="M60 87 v8 M60 95 q-12 4 -16 -4 M60 95 q12 4 16 -4" fill="none" stroke="${RETRO.ink}" stroke-width="2.5" stroke-linecap="round"/>`
    ].join(""), { viewBox: [120, 120] }),
    mkSticker("fish", "Fish", [
      `<path d="M12 60 C 36 28 84 28 100 60 C 84 92 36 92 12 60 Z" fill="${RETRO.teal}" stroke="${RETRO.ink}" stroke-width="${OUT}" stroke-linejoin="round"/>`,
      `<path d="M100 60 L120 42 L116 60 L120 78 Z" fill="${RETRO.blue}" stroke="${RETRO.ink}" stroke-width="${LINE}" stroke-linejoin="round"/>`,
      `<path d="M54 34 q14 -16 24 -8 q-2 12 -16 18 Z" fill="${RETRO.blue}" stroke="${RETRO.ink}" stroke-width="2" stroke-linejoin="round"/>`,
      `<circle cx="34" cy="56" r="6" fill="${RETRO.paper}" stroke="${RETRO.ink}" stroke-width="2"/>`,
      `<circle cx="34" cy="56" r="2.5" fill="${RETRO.ink}"/>`,
      `<path d="M58 60 q14 -10 28 0 q-14 10 -28 0 Z M64 60 q10 -7 20 0 q-10 7 -20 0 Z" fill="${RETRO.gold}" stroke="${RETRO.ink}" stroke-width="2" stroke-linejoin="round"/>`
    ].join(""), { viewBox: [120, 120] }),
    mkSticker("butterfly", "Butterfly", [
      `<path d="M58 60 C 30 28 8 30 14 56 C 18 78 44 78 58 64 Z" fill="${RETRO.orange}" stroke="${RETRO.ink}" stroke-width="${OUT}" stroke-linejoin="round"/>`,
      `<path d="M62 60 C 90 28 112 30 106 56 C 102 78 76 78 62 64 Z" fill="${RETRO.orange}" stroke="${RETRO.ink}" stroke-width="${OUT}" stroke-linejoin="round"/>`,
      `<path d="M58 62 C 36 84 20 96 24 104 C 40 102 54 86 58 70 Z" fill="${RETRO.gold}" stroke="${RETRO.ink}" stroke-width="${OUT}" stroke-linejoin="round"/>`,
      `<path d="M62 62 C 84 84 100 96 96 104 C 80 102 66 86 62 70 Z" fill="${RETRO.gold}" stroke="${RETRO.ink}" stroke-width="${OUT}" stroke-linejoin="round"/>`,
      `<circle cx="32" cy="50" r="4" fill="${RETRO.paper}"/>`,
      `<circle cx="88" cy="50" r="4" fill="${RETRO.paper}"/>`,
      `<path d="M60 50 L60 86" fill="none" stroke="${RETRO.ink}" stroke-width="${OUT}" stroke-linecap="round"/>`,
      `<path d="M60 50 l-8 -14 M60 50 l8 -14" fill="none" stroke="${RETRO.ink}" stroke-width="2.5" stroke-linecap="round"/>`
    ].join(""), { viewBox: [120, 120] }),
    mkSticker("toadstool", "Toadstool", [
      `<path d="M44 64 L40 104 C 40 110 80 110 80 104 L76 64 Z" fill="${RETRO.cream}" stroke="${RETRO.ink}" stroke-width="${OUT}" stroke-linejoin="round"/>`,
      `<path d="M14 64 C 14 30 106 30 106 64 C 106 70 14 70 14 64 Z" fill="${RETRO.red}" stroke="${RETRO.ink}" stroke-width="${OUT}" stroke-linejoin="round"/>`,
      `<circle cx="38" cy="50" r="6" fill="${RETRO.paper}"/>`,
      `<circle cx="60" cy="44" r="7" fill="${RETRO.paper}"/>`,
      `<circle cx="82" cy="50" r="6" fill="${RETRO.paper}"/>`,
      `<circle cx="52" cy="80" r="3" fill="${RETRO.brown}"/>`,
      `<circle cx="68" cy="88" r="3" fill="${RETRO.brown}"/>`
    ].join(""), { viewBox: [120, 120] }),
    mkSticker("cactus", "Cactus", [
      `<path d="M34 100 L86 100 L82 70 L38 70 Z" fill="${RETRO.brown}" stroke="${RETRO.ink}" stroke-width="${OUT}" stroke-linejoin="round"/>`,
      `<path d="M34 80 L86 80" fill="none" stroke="${RETRO.ink}" stroke-width="2"/>`,
      `<path d="M50 70 L50 28 C 50 18 70 18 70 28 L70 70 Z" fill="${RETRO.green}" stroke="${RETRO.ink}" stroke-width="${OUT}" stroke-linejoin="round"/>`,
      `<path d="M50 54 C 36 54 30 44 30 32 C 38 32 42 40 50 42 Z" fill="${RETRO.green}" stroke="${RETRO.ink}" stroke-width="${LINE}" stroke-linejoin="round"/>`,
      `<path d="M70 50 C 84 50 90 40 90 28 C 82 28 78 36 70 38 Z" fill="${RETRO.green}" stroke="${RETRO.ink}" stroke-width="${LINE}" stroke-linejoin="round"/>`,
      `<circle cx="60" cy="24" r="6" fill="${RETRO.pink}" stroke="${RETRO.ink}" stroke-width="2"/>`
    ].join(""), { viewBox: [120, 120] }),
    mkSticker("sunflower", "Sunflower", [
      `<line x1="60" y1="74" x2="60" y2="114" stroke="${RETRO.green}" stroke-width="${OUT}" stroke-linecap="round"/>`,
      `<path d="M60 96 q-22 -2 -28 -18 q22 -4 28 12 Z" fill="${RETRO.green}" stroke="${RETRO.ink}" stroke-width="2" stroke-linejoin="round"/>`,
      ...Array.from({ length: 12 }, (_, i) => i * 30).map((a) => `<ellipse cx="60" cy="20" rx="9" ry="18" fill="${RETRO.gold}" stroke="${RETRO.ink}" stroke-width="2" transform="rotate(${a} 60 50)"/>`),
      `<circle cx="60" cy="50" r="18" fill="${RETRO.brown}" stroke="${RETRO.ink}" stroke-width="${LINE}"/>`,
      `<path d="M52 44 l4 4 M62 44 l4 4 M54 54 l4 4 M64 54 l4 4" fill="none" stroke="${RETRO.ink}" stroke-width="2" stroke-linecap="round"/>`
    ].join(""), { viewBox: [120, 120] }),
    mkSticker("pine-tree", "Pine tree", [
      `<rect x="52" y="92" width="16" height="20" rx="2" fill="${RETRO.brown}" stroke="${RETRO.ink}" stroke-width="${OUT}"/>`,
      `<path d="M60 14 L92 54 L72 54 L96 90 L24 90 L48 54 L28 54 Z" fill="${RETRO.green}" stroke="${RETRO.ink}" stroke-width="${OUT}" stroke-linejoin="round"/>`,
      `<path d="M40 70 L80 70 M48 54 L72 54" fill="none" stroke="${RETRO.ink}" stroke-width="2"/>`,
      `<circle cx="60" cy="10" r="6" fill="${RETRO.gold}" stroke="${RETRO.ink}" stroke-width="2"/>`
    ].join(""), { viewBox: [120, 120] }),
    mkSticker("snail", "Snail", [
      `<path d="M20 96 L80 96 C 96 96 96 80 80 80 L40 80" fill="none" stroke="${RETRO.ink}" stroke-width="${OUT}" stroke-linecap="round"/>`,
      `<path d="M16 96 C 6 96 6 70 16 64 C 30 56 56 64 56 84 C 56 98 36 102 30 92 C 26 84 36 78 42 84 C 44 88 40 90 40 88" fill="${RETRO.gold}" stroke="${RETRO.ink}" stroke-width="${OUT}" stroke-linejoin="round" stroke-linecap="round"/>`,
      `<path d="M80 80 C 90 80 96 70 96 58 C 96 52 88 50 88 56" fill="${RETRO.teal}" stroke="${RETRO.ink}" stroke-width="${LINE}" stroke-linecap="round"/>`,
      `<path d="M92 44 l2 -10 M86 46 l-4 -10" fill="none" stroke="${RETRO.ink}" stroke-width="2.5" stroke-linecap="round"/>`,
      `<circle cx="94" cy="32" r="3" fill="${RETRO.ink}"/>`,
      `<circle cx="82" cy="34" r="3" fill="${RETRO.ink}"/>`
    ].join(""), { viewBox: [120, 120] }),
    mkSticker("ladybird", "Ladybird", [
      `<path d="M20 80 C 20 44 100 44 100 80 C 100 98 20 98 20 80 Z" fill="${RETRO.red}" stroke="${RETRO.ink}" stroke-width="${OUT}" stroke-linejoin="round"/>`,
      `<path d="M40 50 C 40 42 80 42 80 50 C 80 58 40 58 40 50 Z" fill="${RETRO.ink}"/>`,
      `<line x1="60" y1="50" x2="60" y2="96" stroke="${RETRO.ink}" stroke-width="${LINE}"/>`,
      `<circle cx="40" cy="66" r="6" fill="${RETRO.ink}"/>`,
      `<circle cx="80" cy="66" r="6" fill="${RETRO.ink}"/>`,
      `<circle cx="36" cy="84" r="5" fill="${RETRO.ink}"/>`,
      `<circle cx="84" cy="84" r="5" fill="${RETRO.ink}"/>`,
      `<path d="M52 42 l-6 -12 M68 42 l6 -12" fill="none" stroke="${RETRO.ink}" stroke-width="2.5" stroke-linecap="round"/>`
    ].join(""), { viewBox: [120, 120] })
  ]
};

// server/figures/stickers/general.js
var general_default = {
  genre: "general",
  label: "General",
  stickers: [
    mkSticker("starburst", "Star burst", [
      `<path d="M60 8 67 38 92 22 78 48 110 50 82 64 100 90 70 78 60 110 50 78 20 90 38 64 10 50 42 48 28 22 53 38 Z" fill="${RETRO.gold}" stroke="${RETRO.ink}" stroke-width="${OUT}" stroke-linejoin="round"/>`,
      `<circle cx="60" cy="58" r="20" fill="${RETRO.red}" stroke="${RETRO.ink}" stroke-width="${LINE}"/>`,
      `<text x="60" y="64" text-anchor="middle" font-family="Georgia, serif" font-weight="700" font-size="16" fill="${RETRO.paper}">WOW</text>`
    ].join(""), { viewBox: [120, 120] }),
    mkSticker("new-badge", '"NEW!" badge', [
      // scalloped seal
      `<path d="${scallop(60, 60, 50, 12)}" fill="${RETRO.red}" stroke="${RETRO.ink}" stroke-width="${OUT}" stroke-linejoin="round"/>`,
      `<circle cx="60" cy="60" r="36" fill="none" stroke="${RETRO.paper}" stroke-width="${LINE}"/>`,
      `<text x="60" y="68" text-anchor="middle" font-family="Georgia, serif" font-weight="800" font-size="24" fill="${RETRO.paper}" letter-spacing="1">NEW!</text>`
    ].join(""), { viewBox: [120, 120] }),
    mkSticker("speech-bubble", "Speech bubble", [
      `<path d="M16 18 L104 18 a8 8 0 0 1 8 8 L112 70 a8 8 0 0 1 -8 8 L52 78 L30 98 L34 78 L16 78 a8 8 0 0 1 -8 -8 L8 26 a8 8 0 0 1 8 -8 Z" fill="${RETRO.teal}" stroke="${RETRO.ink}" stroke-width="${OUT}" stroke-linejoin="round"/>`,
      `<circle cx="40" cy="48" r="5" fill="${RETRO.paper}"/>`,
      `<circle cx="60" cy="48" r="5" fill="${RETRO.paper}"/>`,
      `<circle cx="80" cy="48" r="5" fill="${RETRO.paper}"/>`
    ].join(""), { viewBox: [120, 110] }),
    mkSticker("arrow-banner", "Arrow", [
      `<path d="M10 26 L86 26 L86 12 L122 40 L86 68 L86 54 L10 54 Z" fill="${RETRO.orange}" stroke="${RETRO.ink}" stroke-width="${OUT}" stroke-linejoin="round"/>`,
      `<line x1="22" y1="40" x2="78" y2="40" stroke="${RETRO.paper}" stroke-width="${LINE}" stroke-dasharray="4 6" stroke-linecap="round"/>`
    ].join(""), { viewBox: [130, 80] }),
    mkSticker("heart", "Heart", [
      `<path d="M60 96 C 8 60 14 20 40 20 C 52 20 60 30 60 38 C 60 30 68 20 80 20 C 106 20 112 60 60 96 Z" fill="${RETRO.red}" stroke="${RETRO.ink}" stroke-width="${OUT}" stroke-linejoin="round"/>`,
      `<path d="M34 36 q6 -8 14 -6" fill="none" stroke="${RETRO.paper}" stroke-width="${LINE}" stroke-linecap="round"/>`
    ].join(""), { viewBox: [120, 110] }),
    mkSticker("thumbs-up", "Thumbs up", [
      `<path d="M14 56 L36 56 L36 104 L14 104 Z" fill="${RETRO.blue}" stroke="${RETRO.ink}" stroke-width="${OUT}" stroke-linejoin="round"/>`,
      `<path d="M36 56 L52 56 L56 28 C 58 14 76 16 76 30 L74 52 L98 52 C 108 52 110 62 104 70 C 110 76 106 86 98 86 C 104 92 100 102 90 102 L46 102 L36 96 Z" fill="${RETRO.gold}" stroke="${RETRO.ink}" stroke-width="${OUT}" stroke-linejoin="round"/>`,
      `<path d="M76 68 L96 68 M76 86 L92 86" fill="none" stroke="${RETRO.ink}" stroke-width="2"/>`
    ].join(""), { viewBox: [120, 120] }),
    mkSticker("lightning", "Lightning bolt", [
      `<path d="M68 8 L28 64 L56 64 L44 112 L92 48 L62 48 Z" fill="${RETRO.gold}" stroke="${RETRO.ink}" stroke-width="${OUT}" stroke-linejoin="round"/>`,
      `<path d="M62 24 L44 56 L60 56" fill="none" stroke="${RETRO.orange}" stroke-width="${LINE}" stroke-linejoin="round"/>`
    ].join(""), { viewBox: [120, 120] }),
    mkSticker("smiley-sun", "Smiley sun", [
      ...Array.from({ length: 12 }, (_, i) => i * 30).map((a) => `<path d="M60 6 L66 22 L54 22 Z" fill="${RETRO.gold}" stroke="${RETRO.ink}" stroke-width="2" stroke-linejoin="round" transform="rotate(${a} 60 60)"/>`),
      `<circle cx="60" cy="60" r="34" fill="${RETRO.gold}" stroke="${RETRO.ink}" stroke-width="${OUT}"/>`,
      `<circle cx="48" cy="54" r="4.5" fill="${RETRO.ink}"/>`,
      `<circle cx="72" cy="54" r="4.5" fill="${RETRO.ink}"/>`,
      `<path d="M44 70 q16 16 32 0" fill="none" stroke="${RETRO.ink}" stroke-width="${LINE}" stroke-linecap="round"/>`
    ].join(""), { viewBox: [120, 120] }),
    mkSticker("rosette", "Award rosette", [
      ...Array.from({ length: 12 }, (_, i) => i * 30).map((a) => `<ellipse cx="60" cy="20" rx="10" ry="16" fill="${RETRO.red}" stroke="${RETRO.ink}" stroke-width="2" transform="rotate(${a} 60 48)"/>`),
      `<path d="M44 60 L34 110 L48 100 L54 112 L62 76 Z" fill="${RETRO.blue}" stroke="${RETRO.ink}" stroke-width="${LINE}" stroke-linejoin="round"/>`,
      `<path d="M76 60 L86 110 L72 100 L66 112 L58 76 Z" fill="${RETRO.blue}" stroke="${RETRO.ink}" stroke-width="${LINE}" stroke-linejoin="round"/>`,
      `<circle cx="60" cy="48" r="22" fill="${RETRO.gold}" stroke="${RETRO.ink}" stroke-width="${OUT}"/>`,
      `<path d="M60 36 L64 46 L74 46 L66 52 L69 62 L60 56 L51 62 L54 52 L46 46 L56 46 Z" fill="${RETRO.red}" stroke="${RETRO.ink}" stroke-width="2" stroke-linejoin="round"/>`
    ].join(""), { viewBox: [120, 120] }),
    mkSticker("gift-box", "Gift box", [
      `<rect x="22" y="46" width="76" height="58" rx="4" fill="${RETRO.red}" stroke="${RETRO.ink}" stroke-width="${OUT}"/>`,
      `<rect x="16" y="34" width="88" height="18" rx="3" fill="${RETRO.orange}" stroke="${RETRO.ink}" stroke-width="${OUT}"/>`,
      `<rect x="50" y="34" width="20" height="70" fill="${RETRO.gold}" stroke="${RETRO.ink}" stroke-width="${LINE}"/>`,
      `<path d="M50 34 C 30 14 18 30 50 32 M70 34 C 90 14 102 30 70 32" fill="${RETRO.gold}" stroke="${RETRO.ink}" stroke-width="${LINE}" stroke-linejoin="round"/>`
    ].join(""), { viewBox: [120, 120] }),
    mkSticker("target", "Bullseye", [
      `<circle cx="60" cy="60" r="50" fill="${RETRO.red}" stroke="${RETRO.ink}" stroke-width="${OUT}"/>`,
      `<circle cx="60" cy="60" r="36" fill="${RETRO.paper}" stroke="${RETRO.ink}" stroke-width="${LINE}"/>`,
      `<circle cx="60" cy="60" r="22" fill="${RETRO.red}" stroke="${RETRO.ink}" stroke-width="${LINE}"/>`,
      `<circle cx="60" cy="60" r="9" fill="${RETRO.gold}" stroke="${RETRO.ink}" stroke-width="2"/>`
    ].join(""), { viewBox: [120, 120] }),
    mkSticker("crown", "Crown", [
      `<path d="M16 88 L24 36 L46 64 L60 26 L74 64 L96 36 L104 88 Z" fill="${RETRO.gold}" stroke="${RETRO.ink}" stroke-width="${OUT}" stroke-linejoin="round"/>`,
      `<rect x="16" y="88" width="88" height="16" rx="3" fill="${RETRO.orange}" stroke="${RETRO.ink}" stroke-width="${OUT}"/>`,
      `<circle cx="24" cy="34" r="5" fill="${RETRO.red}" stroke="${RETRO.ink}" stroke-width="2"/>`,
      `<circle cx="60" cy="24" r="5" fill="${RETRO.red}" stroke="${RETRO.ink}" stroke-width="2"/>`,
      `<circle cx="96" cy="34" r="5" fill="${RETRO.red}" stroke="${RETRO.ink}" stroke-width="2"/>`,
      `<circle cx="42" cy="96" r="4" fill="${RETRO.teal}"/>`,
      `<circle cx="60" cy="96" r="4" fill="${RETRO.teal}"/>`,
      `<circle cx="78" cy="96" r="4" fill="${RETRO.teal}"/>`
    ].join(""), { viewBox: [120, 120] }),
    mkSticker("padlock", "Padlock", [
      `<path d="M40 56 L40 40 C 40 16 80 16 80 40 L80 56" fill="none" stroke="${RETRO.ink}" stroke-width="${OUT}" stroke-linecap="round"/>`,
      `<rect x="26" y="54" width="68" height="56" rx="8" fill="${RETRO.gold}" stroke="${RETRO.ink}" stroke-width="${OUT}"/>`,
      `<circle cx="60" cy="78" r="8" fill="${RETRO.brown}" stroke="${RETRO.ink}" stroke-width="${LINE}"/>`,
      `<path d="M60 86 L60 98" fill="none" stroke="${RETRO.ink}" stroke-width="${OUT}" stroke-linecap="round"/>`
    ].join(""), { viewBox: [120, 120] }),
    mkSticker("sparkle", "Sparkle", [
      `<path d="M60 8 C 64 44 76 56 112 60 C 76 64 64 76 60 112 C 56 76 44 64 8 60 C 44 56 56 44 60 8 Z" fill="${RETRO.gold}" stroke="${RETRO.ink}" stroke-width="${OUT}" stroke-linejoin="round"/>`,
      `<path d="M24 20 C 26 32 30 36 42 38 C 30 40 26 44 24 56 C 22 44 18 40 6 38 C 18 36 22 32 24 20 Z" fill="${RETRO.teal}" stroke="${RETRO.ink}" stroke-width="2" stroke-linejoin="round"/>`,
      `<path d="M96 70 C 98 80 100 82 110 84 C 100 86 98 88 96 98 C 94 88 92 86 82 84 C 92 82 94 80 96 70 Z" fill="${RETRO.pink}" stroke="${RETRO.ink}" stroke-width="2" stroke-linejoin="round"/>`
    ].join(""), { viewBox: [120, 120] })
  ]
};

// server/figures/stickers/food-drink.js
var food_drink_default = {
  genre: "food-drink",
  label: "Food & drink",
  stickers: [
    mkSticker("coffee-cup", "Coffee cup", [
      // takeaway cup: tapered body, lid, rising steam
      path2("M44 26 q16 6 32 0", { stroke: RETRO.brown, width: LINE, fill: "none", "stroke-linecap": "round" }),
      path2("M50 18 q10 4 20 0", { stroke: RETRO.brown, width: LINE, fill: "none", "stroke-linecap": "round" }),
      rect2({ x: 34, y: 34, w: 52, h: 14, rx: 4, fill: RETRO.red, stroke: RETRO.ink, width: OUT }),
      path2("M38 48 L46 100 H74 L82 48 Z", { fill: RETRO.cream, stroke: RETRO.ink, width: OUT, "stroke-linejoin": "round" }),
      rect2({ x: 43, y: 64, w: 34, h: 18, rx: 3, fill: RETRO.brown, stroke: RETRO.ink, width: LINE })
    ].join(""), { viewBox: [120, 120] }),
    mkSticker("hamburger", "Hamburger", [
      // stacked bun, lettuce, patty
      path2("M18 44 q42 -34 84 0 Z", { fill: RETRO.gold, stroke: RETRO.ink, width: OUT, "stroke-linejoin": "round" }),
      circle2({ cx: 42, cy: 30, r: 2.4, fill: RETRO.cream }),
      circle2({ cx: 60, cy: 24, r: 2.4, fill: RETRO.cream }),
      circle2({ cx: 78, cy: 30, r: 2.4, fill: RETRO.cream }),
      path2("M16 46 q44 16 88 0 V52 q-44 16 -88 0 Z", { fill: RETRO.green, stroke: RETRO.ink, width: LINE, "stroke-linejoin": "round" }),
      rect2({ x: 18, y: 54, w: 84, h: 16, rx: 6, fill: RETRO.brown, stroke: RETRO.ink, width: OUT }),
      path2("M18 74 q42 24 84 0 V78 a8 8 0 0 1 -8 8 H26 a8 8 0 0 1 -8 -8 Z", { fill: RETRO.gold, stroke: RETRO.ink, width: OUT, "stroke-linejoin": "round" })
    ].join(""), { viewBox: [120, 110] }),
    mkSticker("pizza-slice", "Pizza slice", [
      // triangular slice, crust, pepperoni
      path2("M60 14 L102 96 H18 Z", { fill: RETRO.gold, stroke: RETRO.ink, width: OUT, "stroke-linejoin": "round" }),
      path2("M18 96 H102 L96 86 q-36 14 -72 0 Z", { fill: RETRO.brown, stroke: RETRO.ink, width: LINE, "stroke-linejoin": "round" }),
      circle2({ cx: 60, cy: 56, r: 7, fill: RETRO.red, stroke: RETRO.ink, width: LINE }),
      circle2({ cx: 44, cy: 76, r: 6, fill: RETRO.red, stroke: RETRO.ink, width: LINE }),
      circle2({ cx: 76, cy: 76, r: 6, fill: RETRO.red, stroke: RETRO.ink, width: LINE }),
      circle2({ cx: 60, cy: 32, r: 4, fill: RETRO.red, stroke: RETRO.ink, width: LINE })
    ].join(""), { viewBox: [120, 110] }),
    mkSticker("ice-cream-cone", "Ice cream cone", [
      // two scoops on a waffle cone
      path2("M44 70 L60 110 L76 70 Z", { fill: RETRO.gold, stroke: RETRO.ink, width: OUT, "stroke-linejoin": "round" }),
      line2({ x1: 50, y1: 74, x2: 60, y2: 96, stroke: RETRO.brown, width: 2 }),
      line2({ x1: 70, y1: 74, x2: 60, y2: 96, stroke: RETRO.brown, width: 2 }),
      circle2({ cx: 60, cy: 60, r: 22, fill: RETRO.pink, stroke: RETRO.ink, width: OUT }),
      circle2({ cx: 60, cy: 34, r: 18, fill: RETRO.cream, stroke: RETRO.ink, width: OUT }),
      circle2({ cx: 60, cy: 20, r: 5, fill: RETRO.red, stroke: RETRO.ink, width: LINE })
    ].join(""), { viewBox: [120, 120] }),
    mkSticker("cupcake", "Cupcake", [
      // wrapper + swirl frosting + cherry
      path2("M34 64 L42 102 H78 L86 64 Z", { fill: RETRO.paper, stroke: RETRO.ink, width: OUT, "stroke-linejoin": "round" }),
      line2({ x1: 50, y1: 66, x2: 54, y2: 100, stroke: RETRO.ink, width: 2 }),
      line2({ x1: 60, y1: 66, x2: 60, y2: 100, stroke: RETRO.ink, width: 2 }),
      line2({ x1: 70, y1: 66, x2: 66, y2: 100, stroke: RETRO.ink, width: 2 }),
      path2("M30 64 q4 -22 30 -22 q26 0 30 22 Z", { fill: RETRO.teal, stroke: RETRO.ink, width: OUT, "stroke-linejoin": "round" }),
      path2("M40 46 q6 -16 20 -16 q14 0 20 16", { fill: RETRO.teal, stroke: RETRO.ink, width: LINE, "stroke-linejoin": "round" }),
      circle2({ cx: 60, cy: 26, r: 6, fill: RETRO.red, stroke: RETRO.ink, width: LINE })
    ].join(""), { viewBox: [120, 120] }),
    mkSticker("ring-donut", "Ring donut", [
      // glazed donut with sprinkles
      circle2({ cx: 60, cy: 60, r: 44, fill: RETRO.brown, stroke: RETRO.ink, width: OUT }),
      path2("M60 16 a44 44 0 0 1 30 76 a30 30 0 0 0 -30 -52 a30 30 0 0 0 -30 22 a44 44 0 0 1 30 -46 Z", { fill: RETRO.pink, stroke: RETRO.ink, width: LINE, "stroke-linejoin": "round" }),
      circle2({ cx: 60, cy: 60, r: 16, fill: RETRO.paper, stroke: RETRO.ink, width: OUT }),
      line2({ x1: 50, y1: 30, x2: 56, y2: 36, stroke: RETRO.gold, width: 3, "stroke-linecap": "round" }),
      line2({ x1: 78, y1: 40, x2: 82, y2: 48, stroke: RETRO.teal, width: 3, "stroke-linecap": "round" }),
      line2({ x1: 36, y1: 56, x2: 42, y2: 60, stroke: RETRO.red, width: 3, "stroke-linecap": "round" }),
      line2({ x1: 84, y1: 70, x2: 88, y2: 76, stroke: RETRO.gold, width: 3, "stroke-linecap": "round" })
    ].join(""), { viewBox: [120, 120] }),
    mkSticker("taco", "Taco", [
      // folded shell with fillings
      path2("M16 86 q44 -86 88 0 Z", { fill: RETRO.gold, stroke: RETRO.ink, width: OUT, "stroke-linejoin": "round" }),
      path2("M22 70 q38 -36 76 0", { fill: "none", stroke: RETRO.brown, width: LINE }),
      path2("M28 74 q32 14 64 0 q-6 12 -32 12 q-26 0 -32 -12 Z", { fill: RETRO.green, stroke: RETRO.ink, width: LINE, "stroke-linejoin": "round" }),
      circle2({ cx: 44, cy: 78, r: 5, fill: RETRO.red, stroke: RETRO.ink, width: 2 }),
      circle2({ cx: 60, cy: 80, r: 5, fill: RETRO.red, stroke: RETRO.ink, width: 2 }),
      circle2({ cx: 76, cy: 78, r: 5, fill: RETRO.red, stroke: RETRO.ink, width: 2 })
    ].join(""), { viewBox: [120, 100] }),
    mkSticker("sushi-nigiri", "Sushi nigiri", [
      // rice base, salmon on top, nori band
      ellipse({ cx: 60, cy: 78, rx: 42, ry: 18, fill: RETRO.paper, stroke: RETRO.ink, width: OUT }),
      path2("M20 64 q40 -26 80 0 q4 8 -2 14 q-38 -22 -76 0 q-6 -6 -2 -14 Z", { fill: RETRO.orange, stroke: RETRO.ink, width: OUT, "stroke-linejoin": "round" }),
      path2("M30 58 q30 -16 60 0", { fill: "none", stroke: RETRO.cream, width: 2 }),
      path2("M42 60 q18 -12 36 0", { fill: "none", stroke: RETRO.cream, width: 2 }),
      rect2({ x: 50, y: 66, w: 20, h: 26, rx: 2, fill: RETRO.navy, stroke: RETRO.ink, width: LINE })
    ].join(""), { viewBox: [120, 110] }),
    mkSticker("fried-egg", "Fried egg", [
      // wobbly white with golden yolk
      path2("M30 40 q-18 8 -10 28 q-16 14 4 26 q-4 20 18 18 q14 16 32 4 q22 8 26 -12 q18 -10 6 -28 q12 -18 -8 -26 q-2 -22 -24 -16 q-18 -12 -34 2 q-12 -4 -10 4 Z", { fill: RETRO.paper, stroke: RETRO.ink, width: OUT, "stroke-linejoin": "round" }),
      circle2({ cx: 62, cy: 60, r: 20, fill: RETRO.gold, stroke: RETRO.ink, width: OUT }),
      circle2({ cx: 55, cy: 53, r: 5, fill: RETRO.cream })
    ].join(""), { viewBox: [120, 120] }),
    mkSticker("beer-mug", "Beer mug", [
      // foamy head, amber body, handle
      path2("M34 38 q6 -14 26 -10 q20 -4 26 10 q-26 8 -52 0 Z", { fill: RETRO.cream, stroke: RETRO.ink, width: OUT, "stroke-linejoin": "round" }),
      rect2({ x: 34, y: 38, w: 52, h: 62, rx: 6, fill: RETRO.gold, stroke: RETRO.ink, width: OUT }),
      path2("M86 50 h14 a8 8 0 0 1 8 8 v20 a8 8 0 0 1 -8 8 h-14", { fill: "none", stroke: RETRO.ink, width: OUT }),
      circle2({ cx: 48, cy: 60, r: 3, fill: RETRO.paper }),
      circle2({ cx: 64, cy: 72, r: 3, fill: RETRO.paper }),
      circle2({ cx: 56, cy: 86, r: 3, fill: RETRO.paper })
    ].join(""), { viewBox: [120, 120] }),
    mkSticker("wine-glass", "Wine glass", [
      // bowl of red, stem, base
      path2("M38 22 q22 36 44 0 q0 30 -22 36 q-22 -6 -22 -36 Z", { fill: RETRO.plum, stroke: RETRO.ink, width: OUT, "stroke-linejoin": "round" }),
      path2("M40 30 q20 16 40 0", { fill: "none", stroke: RETRO.ink, width: LINE }),
      line2({ x1: 60, y1: 58, x2: 60, y2: 96, stroke: RETRO.ink, width: OUT }),
      path2("M40 100 q20 -8 40 0", { fill: "none", stroke: RETRO.ink, width: OUT, "stroke-linecap": "round" })
    ].join(""), { viewBox: [120, 120] }),
    mkSticker("cocktail-umbrella", "Cocktail", [
      // martini glass, cherry, paper umbrella
      path2("M24 30 H96 L60 70 Z", { fill: RETRO.teal, stroke: RETRO.ink, width: OUT, "stroke-linejoin": "round" }),
      line2({ x1: 60, y1: 70, x2: 60, y2: 98, stroke: RETRO.ink, width: OUT }),
      path2("M42 100 q18 -8 36 0", { fill: "none", stroke: RETRO.ink, width: OUT, "stroke-linecap": "round" }),
      circle2({ cx: 50, cy: 60, r: 6, fill: RETRO.red, stroke: RETRO.ink, width: 2 }),
      line2({ x1: 78, y1: 18, x2: 70, y2: 56, stroke: RETRO.brown, width: 2 }),
      path2("M58 18 q14 -16 28 0 q-14 6 -28 0 Z", { fill: RETRO.pink, stroke: RETRO.ink, width: LINE, "stroke-linejoin": "round" }),
      line2({ x1: 58, y1: 18, x2: 86, y2: 18, stroke: RETRO.ink, width: 2 })
    ].join(""), { viewBox: [120, 120] }),
    mkSticker("cherries", "Cherries", [
      // two cherries on stems with a leaf
      path2("M62 18 q-22 18 -34 50", { fill: "none", stroke: RETRO.brown, width: LINE, "stroke-linecap": "round" }),
      path2("M62 18 q14 22 22 48", { fill: "none", stroke: RETRO.brown, width: LINE, "stroke-linecap": "round" }),
      path2("M62 18 q24 -12 38 6 q-22 8 -38 -6 Z", { fill: RETRO.green, stroke: RETRO.ink, width: LINE, "stroke-linejoin": "round" }),
      circle2({ cx: 40, cy: 80, r: 18, fill: RETRO.red, stroke: RETRO.ink, width: OUT }),
      circle2({ cx: 82, cy: 84, r: 16, fill: RETRO.red, stroke: RETRO.ink, width: OUT }),
      circle2({ cx: 34, cy: 74, r: 4, fill: RETRO.cream }),
      circle2({ cx: 77, cy: 79, r: 3.6, fill: RETRO.cream })
    ].join(""), { viewBox: [120, 120] }),
    mkSticker("croissant", "Croissant", [
      // crescent pastry with score lines
      path2("M22 78 q-6 -28 22 -34 q34 -8 54 12 q12 14 0 26 q-10 -18 -30 -16 q14 6 16 22 q-18 4 -28 -10 q4 16 -8 18 q-16 0 -10 -18 q-8 4 -16 0 Z", { fill: RETRO.gold, stroke: RETRO.ink, width: OUT, "stroke-linejoin": "round" }),
      path2("M40 56 q14 6 20 18", { fill: "none", stroke: RETRO.brown, width: 2 }),
      path2("M58 50 q14 6 18 16", { fill: "none", stroke: RETRO.brown, width: 2 })
    ].join(""), { viewBox: [120, 110] })
  ]
};

// server/figures/stickers/sport-games.js
var sport_games_default = {
  genre: "sport-games",
  label: "Sport & games",
  stickers: [
    mkSticker("soccer-ball", "Football", [
      circle2({ cx: 60, cy: 60, r: 44, fill: RETRO.paper, stroke: RETRO.ink, width: OUT }),
      // central pentagon
      path2("M60 38 L77 51 L70 72 L50 72 L43 51 Z", { fill: RETRO.ink }),
      // spokes out to the rim
      line2({ x1: 60, y1: 38, x2: 60, y2: 18, stroke: RETRO.ink, width: LINE }),
      line2({ x1: 77, y1: 51, x2: 96, y2: 44, stroke: RETRO.ink, width: LINE }),
      line2({ x1: 70, y1: 72, x2: 84, y2: 92, stroke: RETRO.ink, width: LINE }),
      line2({ x1: 50, y1: 72, x2: 36, y2: 92, stroke: RETRO.ink, width: LINE }),
      line2({ x1: 43, y1: 51, x2: 24, y2: 44, stroke: RETRO.ink, width: LINE })
    ].join(""), { viewBox: [120, 120] }),
    mkSticker("basketball", "Basketball", [
      circle2({ cx: 60, cy: 60, r: 44, fill: RETRO.orange, stroke: RETRO.ink, width: OUT }),
      line2({ x1: 16, y1: 60, x2: 104, y2: 60, stroke: RETRO.ink, width: LINE }),
      line2({ x1: 60, y1: 16, x2: 60, y2: 104, stroke: RETRO.ink, width: LINE }),
      path2("M28 28 Q60 52 28 92", { fill: "none", stroke: RETRO.ink, width: LINE }),
      path2("M92 28 Q60 52 92 92", { fill: "none", stroke: RETRO.ink, width: LINE })
    ].join(""), { viewBox: [120, 120] }),
    mkSticker("tennis-racket", "Tennis racket", [
      // handle
      rect2({ x: 70, y: 78, w: 10, h: 30, rx: 4, fill: RETRO.brown, stroke: RETRO.ink, width: OUT, transform: "rotate(-30 75 93)" }),
      // head
      ellipse({ cx: 50, cy: 48, rx: 28, ry: 34, fill: RETRO.gold, stroke: RETRO.ink, width: OUT }),
      ellipse({ cx: 50, cy: 48, rx: 19, ry: 25, fill: RETRO.paper, stroke: RETRO.ink, width: LINE }),
      // strings
      line2({ x1: 36, y1: 28, x2: 36, y2: 68, stroke: RETRO.ink, width: 2 }),
      line2({ x1: 50, y1: 24, x2: 50, y2: 72, stroke: RETRO.ink, width: 2 }),
      line2({ x1: 64, y1: 28, x2: 64, y2: 68, stroke: RETRO.ink, width: 2 }),
      line2({ x1: 32, y1: 38, x2: 68, y2: 38, stroke: RETRO.ink, width: 2 }),
      line2({ x1: 31, y1: 48, x2: 69, y2: 48, stroke: RETRO.ink, width: 2 }),
      line2({ x1: 32, y1: 58, x2: 68, y2: 58, stroke: RETRO.ink, width: 2 }),
      // ball
      circle2({ cx: 92, cy: 30, r: 11, fill: RETRO.green, stroke: RETRO.ink, width: LINE }),
      path2("M83 26 Q92 32 101 26", { fill: "none", stroke: RETRO.paper, width: 2 })
    ].join(""), { viewBox: [120, 120] }),
    mkSticker("trophy-cup", "Trophy cup", [
      // handles
      path2("M34 38 Q16 40 26 60 Q32 66 42 62", { fill: "none", stroke: RETRO.ink, width: OUT }),
      path2("M86 38 Q104 40 94 60 Q88 66 78 62", { fill: "none", stroke: RETRO.ink, width: OUT }),
      // bowl
      path2("M30 30 H90 V44 Q90 78 60 84 Q30 78 30 44 Z", { fill: RETRO.gold, stroke: RETRO.ink, width: OUT, "stroke-linejoin": "round" }),
      // stem + base
      rect2({ x: 54, y: 84, w: 12, h: 14, fill: RETRO.gold, stroke: RETRO.ink, width: LINE }),
      rect2({ x: 40, y: 98, w: 40, h: 10, rx: 3, fill: RETRO.brown, stroke: RETRO.ink, width: OUT }),
      // star badge
      path2("M60 44 L64 54 L75 54 L66 61 L70 72 L60 65 L50 72 L54 61 L45 54 L56 54 Z", { fill: RETRO.red, stroke: RETRO.ink, width: 2, "stroke-linejoin": "round" })
    ].join(""), { viewBox: [120, 120] }),
    mkSticker("medal-ribbon", "Medal", [
      // ribbon tails
      path2("M44 14 L40 64 L60 52 L80 64 L76 14 Z", { fill: RETRO.red, stroke: RETRO.ink, width: OUT, "stroke-linejoin": "round" }),
      line2({ x1: 60, y1: 22, x2: 60, y2: 52, stroke: RETRO.paper, width: 3 }),
      // medal
      disc(60, 82, 24, RETRO.gold),
      text("1", 60, 90, { size: 24, fill: RETRO.ink })
    ].join(""), { viewBox: [120, 120] }),
    mkSticker("dumbbell", "Dumbbell", [
      rect2({ x: 44, y: 52, w: 32, h: 16, rx: 4, fill: RETRO.navy, stroke: RETRO.ink, width: OUT }),
      rect2({ x: 16, y: 38, w: 16, h: 44, rx: 5, fill: RETRO.red, stroke: RETRO.ink, width: OUT }),
      rect2({ x: 32, y: 46, w: 12, h: 28, rx: 4, fill: RETRO.orange, stroke: RETRO.ink, width: LINE }),
      rect2({ x: 88, y: 38, w: 16, h: 44, rx: 5, fill: RETRO.red, stroke: RETRO.ink, width: OUT }),
      rect2({ x: 76, y: 46, w: 12, h: 28, rx: 4, fill: RETRO.orange, stroke: RETRO.ink, width: LINE })
    ].join(""), { viewBox: [120, 120] }),
    mkSticker("dice-pair", "Dice", [
      // back die
      rect2({ x: 56, y: 22, w: 44, h: 44, rx: 9, fill: RETRO.red, stroke: RETRO.ink, width: OUT, transform: "rotate(12 78 44)" }),
      // front die
      rect2({ x: 22, y: 54, w: 46, h: 46, rx: 9, fill: RETRO.paper, stroke: RETRO.ink, width: OUT }),
      // pips (5)
      circle2({ cx: 33, cy: 65, r: 4, fill: RETRO.ink, stroke: "none", width: 0 }),
      circle2({ cx: 57, cy: 65, r: 4, fill: RETRO.ink, stroke: "none", width: 0 }),
      circle2({ cx: 45, cy: 77, r: 4, fill: RETRO.ink, stroke: "none", width: 0 }),
      circle2({ cx: 33, cy: 89, r: 4, fill: RETRO.ink, stroke: "none", width: 0 }),
      circle2({ cx: 57, cy: 89, r: 4, fill: RETRO.ink, stroke: "none", width: 0 })
    ].join(""), { viewBox: [120, 120] }),
    mkSticker("game-controller", "Controller", [
      path2("M28 44 H92 Q108 44 108 64 Q108 92 92 92 Q80 92 76 80 H44 Q40 92 28 92 Q12 92 12 64 Q12 44 28 44 Z", { fill: RETRO.navy, stroke: RETRO.ink, width: OUT, "stroke-linejoin": "round" }),
      // d-pad
      path2("M30 58 H38 V66 H46 V74 H38 V82 H30 V74 H22 V66 H30 Z", { fill: RETRO.paper, stroke: RETRO.ink, width: 2, "stroke-linejoin": "round" }),
      // buttons
      circle2({ cx: 84, cy: 60, r: 6, fill: RETRO.red, stroke: RETRO.ink, width: 2 }),
      circle2({ cx: 98, cy: 70, r: 6, fill: RETRO.gold, stroke: RETRO.ink, width: 2 }),
      circle2({ cx: 70, cy: 70, r: 6, fill: RETRO.teal, stroke: RETRO.ink, width: 2 }),
      circle2({ cx: 84, cy: 80, r: 6, fill: RETRO.green, stroke: RETRO.ink, width: 2 })
    ].join(""), { viewBox: [120, 120] }),
    mkSticker("chess-knight", "Chess knight", [
      // base
      rect2({ x: 32, y: 96, w: 56, h: 12, rx: 4, fill: RETRO.navy, stroke: RETRO.ink, width: OUT }),
      rect2({ x: 40, y: 86, w: 40, h: 12, rx: 3, fill: RETRO.navy, stroke: RETRO.ink, width: LINE }),
      // horse head
      path2("M44 86 Q36 64 44 48 Q40 40 46 30 L54 38 Q64 28 80 34 Q92 42 90 64 Q88 78 80 86 Z", { fill: RETRO.cream, stroke: RETRO.ink, width: OUT, "stroke-linejoin": "round" }),
      // mane
      path2("M46 30 Q40 44 44 60", { fill: "none", stroke: RETRO.ink, width: LINE }),
      // eye
      circle2({ cx: 64, cy: 48, r: 3, fill: RETRO.ink, stroke: "none", width: 0 })
    ].join(""), { viewBox: [120, 120] }),
    mkSticker("dartboard", "Dartboard", [
      circle2({ cx: 60, cy: 60, r: 46, fill: RETRO.green, stroke: RETRO.ink, width: OUT }),
      circle2({ cx: 60, cy: 60, r: 34, fill: RETRO.cream, stroke: RETRO.ink, width: LINE }),
      circle2({ cx: 60, cy: 60, r: 22, fill: RETRO.red, stroke: RETRO.ink, width: LINE }),
      circle2({ cx: 60, cy: 60, r: 10, fill: RETRO.gold, stroke: RETRO.ink, width: LINE }),
      circle2({ cx: 60, cy: 60, r: 4, fill: RETRO.navy, stroke: RETRO.ink, width: 2 }),
      line2({ x1: 60, y1: 14, x2: 60, y2: 106, stroke: RETRO.ink, width: 2 }),
      line2({ x1: 14, y1: 60, x2: 106, y2: 60, stroke: RETRO.ink, width: 2 })
    ].join(""), { viewBox: [120, 120] }),
    mkSticker("bowling", "Bowling", [
      // pin
      path2("M52 16 Q44 26 48 40 Q40 56 44 84 Q44 98 58 98 Q72 98 72 84 Q76 56 68 40 Q72 26 64 16 Q58 12 52 16 Z", { fill: RETRO.paper, stroke: RETRO.ink, width: OUT, "stroke-linejoin": "round" }),
      rect2({ x: 47, y: 32, w: 22, h: 6, rx: 3, fill: RETRO.red, stroke: RETRO.ink, width: 2 }),
      // ball
      circle2({ cx: 92, cy: 84, r: 22, fill: RETRO.navy, stroke: RETRO.ink, width: OUT }),
      circle2({ cx: 86, cy: 78, r: 3, fill: RETRO.paper, stroke: RETRO.ink, width: 1.5 }),
      circle2({ cx: 96, cy: 76, r: 3, fill: RETRO.paper, stroke: RETRO.ink, width: 1.5 }),
      circle2({ cx: 91, cy: 86, r: 3, fill: RETRO.paper, stroke: RETRO.ink, width: 1.5 })
    ].join(""), { viewBox: [120, 120] }),
    mkSticker("skateboard", "Skateboard", [
      path2("M14 56 Q14 70 30 70 H90 Q106 70 106 56 Q106 52 96 52 H24 Q14 52 14 56 Z", { fill: RETRO.orange, stroke: RETRO.ink, width: OUT, "stroke-linejoin": "round" }),
      line2({ x1: 34, y1: 70, x2: 34, y2: 80, stroke: RETRO.ink, width: OUT }),
      line2({ x1: 86, y1: 70, x2: 86, y2: 80, stroke: RETRO.ink, width: OUT }),
      circle2({ cx: 30, cy: 86, r: 8, fill: RETRO.gold, stroke: RETRO.ink, width: LINE }),
      circle2({ cx: 90, cy: 86, r: 8, fill: RETRO.gold, stroke: RETRO.ink, width: LINE }),
      line2({ x1: 26, y1: 58, x2: 94, y2: 58, stroke: RETRO.ink, width: 2, "stroke-dasharray": "4 5" })
    ].join(""), { viewBox: [120, 120] }),
    mkSticker("baseball-bat", "Baseball", [
      // bat
      path2("M30 96 L40 86 Q70 56 96 30 Q102 24 96 18 Q90 12 84 18 Q58 44 28 74 L18 84 Z", { fill: RETRO.brown, stroke: RETRO.ink, width: OUT, "stroke-linejoin": "round" }),
      line2({ x1: 24, y1: 80, x2: 34, y2: 90, stroke: RETRO.ink, width: 2 }),
      // ball
      circle2({ cx: 38, cy: 36, r: 16, fill: RETRO.paper, stroke: RETRO.ink, width: OUT }),
      path2("M28 28 Q34 36 28 44", { fill: "none", stroke: RETRO.red, width: 2 }),
      path2("M48 28 Q42 36 48 44", { fill: "none", stroke: RETRO.red, width: 2 })
    ].join(""), { viewBox: [120, 120] }),
    mkSticker("whistle", "Whistle", [
      // body
      path2("M24 50 H64 Q86 50 86 70 Q86 92 62 92 Q38 92 30 72 H24 Q16 72 16 62 V60 Q16 50 24 50 Z", { fill: RETRO.red, stroke: RETRO.ink, width: OUT, "stroke-linejoin": "round" }),
      // mouthpiece + ring
      rect2({ x: 64, y: 40, w: 16, h: 12, rx: 3, fill: RETRO.gold, stroke: RETRO.ink, width: LINE }),
      circle2({ cx: 84, cy: 36, r: 8, fill: "none", stroke: RETRO.ink, width: OUT }),
      // pea + airhole
      circle2({ cx: 50, cy: 70, r: 7, fill: RETRO.paper, stroke: RETRO.ink, width: LINE }),
      line2({ x1: 30, y1: 54, x2: 60, y2: 54, stroke: RETRO.ink, width: 2 })
    ].join(""), { viewBox: [120, 110] })
  ]
};

// server/figures/stickers/music.js
var music_default = {
  genre: "music",
  label: "Music",
  stickers: [
    mkSticker("electric-guitar", "Electric guitar", [
      // angled body, neck, headstock
      path2("M28 92 q-12 -14 0 -28 q-10 -16 8 -22 q18 -8 30 6 L96 18 V30 L66 56 q8 16 -8 26 q-14 10 -30 -10 q-10 6 0 0 Z", { fill: RETRO.red, stroke: RETRO.ink, width: OUT, "stroke-linejoin": "round" }),
      rect2({ x: 60, y: 26, w: 42, h: 8, rx: 3, fill: RETRO.brown, stroke: RETRO.ink, width: LINE, transform: "rotate(-32 60 26)" }),
      circle2({ cx: 42, cy: 64, r: 7, fill: RETRO.gold, stroke: RETRO.ink, width: LINE }),
      line2({ x1: 30, y1: 78, x2: 50, y2: 86, stroke: RETRO.ink, width: 2 }),
      line2({ x1: 34, y1: 72, x2: 54, y2: 80, stroke: RETRO.ink, width: 2 })
    ].join(""), { viewBox: [120, 110] }),
    mkSticker("vinyl-record", "Vinyl record", [
      // black disc, label, grooves
      circle2({ cx: 60, cy: 60, r: 48, fill: RETRO.ink, stroke: RETRO.ink, width: OUT }),
      circle2({ cx: 60, cy: 60, r: 40, fill: "none", stroke: RETRO.navy, width: 2 }),
      circle2({ cx: 60, cy: 60, r: 32, fill: "none", stroke: RETRO.navy, width: 2 }),
      circle2({ cx: 60, cy: 60, r: 18, fill: RETRO.red, stroke: RETRO.ink, width: LINE }),
      circle2({ cx: 60, cy: 60, r: 4, fill: RETRO.paper, stroke: RETRO.ink, width: 2 })
    ].join(""), { viewBox: [120, 120] }),
    mkSticker("headphones", "Headphones", [
      // arched band + two cups
      path2("M24 70 V58 a36 36 0 0 1 72 0 V70", { fill: "none", stroke: RETRO.ink, width: OUT, "stroke-linecap": "round" }),
      rect2({ x: 16, y: 62, w: 18, h: 32, rx: 8, fill: RETRO.teal, stroke: RETRO.ink, width: OUT }),
      rect2({ x: 86, y: 62, w: 18, h: 32, rx: 8, fill: RETRO.teal, stroke: RETRO.ink, width: OUT }),
      circle2({ cx: 25, cy: 78, r: 4, fill: RETRO.gold }),
      circle2({ cx: 95, cy: 78, r: 4, fill: RETRO.gold })
    ].join(""), { viewBox: [120, 110] }),
    mkSticker("eighth-note", "Eighth note", [
      // single quaver
      ellipse({ cx: 44, cy: 86, rx: 18, ry: 13, fill: RETRO.navy, stroke: RETRO.ink, width: OUT, transform: "rotate(-20 44 86)" }),
      line2({ x1: 60, y1: 80, x2: 60, y2: 22, stroke: RETRO.ink, width: OUT, "stroke-linecap": "round" }),
      path2("M60 22 q22 6 18 30 q6 -22 -18 -42 Z", { fill: RETRO.navy, stroke: RETRO.ink, width: LINE, "stroke-linejoin": "round" })
    ].join(""), { viewBox: [120, 120] }),
    mkSticker("cassette-tape", "Cassette tape", [
      // shell, label, two reels
      rect2({ x: 14, y: 28, w: 92, h: 64, rx: 8, fill: RETRO.orange, stroke: RETRO.ink, width: OUT }),
      rect2({ x: 26, y: 36, w: 68, h: 18, rx: 3, fill: RETRO.paper, stroke: RETRO.ink, width: LINE }),
      rect2({ x: 30, y: 62, w: 60, h: 22, rx: 4, fill: RETRO.cream, stroke: RETRO.ink, width: LINE }),
      circle2({ cx: 44, cy: 73, r: 7, fill: RETRO.ink, stroke: RETRO.ink, width: 2 }),
      circle2({ cx: 76, cy: 73, r: 7, fill: RETRO.ink, stroke: RETRO.ink, width: 2 }),
      circle2({ cx: 44, cy: 73, r: 2.5, fill: RETRO.paper }),
      circle2({ cx: 76, cy: 73, r: 2.5, fill: RETRO.paper })
    ].join(""), { viewBox: [120, 120] }),
    mkSticker("retro-microphone", "Microphone", [
      // round mic head, grille, stand
      circle2({ cx: 60, cy: 40, r: 26, fill: RETRO.navy, stroke: RETRO.ink, width: OUT }),
      line2({ x1: 44, y1: 30, x2: 76, y2: 30, stroke: RETRO.gold, width: 2 }),
      line2({ x1: 42, y1: 40, x2: 78, y2: 40, stroke: RETRO.gold, width: 2 }),
      line2({ x1: 44, y1: 50, x2: 76, y2: 50, stroke: RETRO.gold, width: 2 }),
      rect2({ x: 50, y: 64, w: 20, h: 14, rx: 3, fill: RETRO.red, stroke: RETRO.ink, width: LINE }),
      line2({ x1: 60, y1: 78, x2: 60, y2: 100, stroke: RETRO.ink, width: OUT }),
      path2("M40 102 q20 -8 40 0", { fill: "none", stroke: RETRO.ink, width: OUT, "stroke-linecap": "round" })
    ].join(""), { viewBox: [120, 120] }),
    mkSticker("piano-keys", "Piano keys", [
      // white keys with black keys on top
      rect2({ x: 16, y: 30, w: 88, h: 60, rx: 6, fill: RETRO.paper, stroke: RETRO.ink, width: OUT }),
      line2({ x1: 38, y1: 32, x2: 38, y2: 88, stroke: RETRO.ink, width: 2 }),
      line2({ x1: 60, y1: 32, x2: 60, y2: 88, stroke: RETRO.ink, width: 2 }),
      line2({ x1: 82, y1: 32, x2: 82, y2: 88, stroke: RETRO.ink, width: 2 }),
      rect2({ x: 31, y: 30, w: 12, h: 36, rx: 2, fill: RETRO.ink, stroke: RETRO.ink, width: 2 }),
      rect2({ x: 53, y: 30, w: 12, h: 36, rx: 2, fill: RETRO.ink, stroke: RETRO.ink, width: 2 }),
      rect2({ x: 75, y: 30, w: 12, h: 36, rx: 2, fill: RETRO.ink, stroke: RETRO.ink, width: 2 })
    ].join(""), { viewBox: [120, 120] }),
    mkSticker("boombox", "Boombox", [
      // twin speakers, handle, deck
      path2("M40 24 h40", { fill: "none", stroke: RETRO.ink, width: OUT, "stroke-linecap": "round" }),
      rect2({ x: 14, y: 30, w: 92, h: 60, rx: 8, fill: RETRO.red, stroke: RETRO.ink, width: OUT }),
      circle2({ cx: 38, cy: 60, r: 16, fill: RETRO.cream, stroke: RETRO.ink, width: LINE }),
      circle2({ cx: 38, cy: 60, r: 6, fill: RETRO.navy, stroke: RETRO.ink, width: 2 }),
      circle2({ cx: 82, cy: 60, r: 16, fill: RETRO.cream, stroke: RETRO.ink, width: LINE }),
      circle2({ cx: 82, cy: 60, r: 6, fill: RETRO.navy, stroke: RETRO.ink, width: 2 }),
      rect2({ x: 52, y: 40, w: 16, h: 8, rx: 2, fill: RETRO.gold, stroke: RETRO.ink, width: 2 })
    ].join(""), { viewBox: [120, 110] }),
    mkSticker("trumpet", "Trumpet", [
      // bell, tubing, valves
      path2("M16 60 L52 48 V72 Z", { fill: RETRO.gold, stroke: RETRO.ink, width: OUT, "stroke-linejoin": "round" }),
      rect2({ x: 50, y: 50, w: 44, h: 20, rx: 6, fill: RETRO.gold, stroke: RETRO.ink, width: OUT }),
      circle2({ cx: 100, cy: 60, r: 10, fill: RETRO.gold, stroke: RETRO.ink, width: OUT }),
      line2({ x1: 62, y1: 50, x2: 62, y2: 34, stroke: RETRO.ink, width: LINE }),
      line2({ x1: 74, y1: 50, x2: 74, y2: 34, stroke: RETRO.ink, width: LINE }),
      line2({ x1: 86, y1: 50, x2: 86, y2: 34, stroke: RETRO.ink, width: LINE }),
      circle2({ cx: 62, cy: 32, r: 4, fill: RETRO.red, stroke: RETRO.ink, width: 2 }),
      circle2({ cx: 74, cy: 32, r: 4, fill: RETRO.red, stroke: RETRO.ink, width: 2 }),
      circle2({ cx: 86, cy: 32, r: 4, fill: RETRO.red, stroke: RETRO.ink, width: 2 })
    ].join(""), { viewBox: [120, 100] }),
    mkSticker("snare-drum", "Snare drum", [
      // cylinder with lugs and crossed sticks
      ellipse({ cx: 60, cy: 40, rx: 40, ry: 16, fill: RETRO.paper, stroke: RETRO.ink, width: OUT }),
      path2("M20 40 V72 a40 16 0 0 0 80 0 V40", { fill: RETRO.red, stroke: RETRO.ink, width: OUT, "stroke-linejoin": "round" }),
      line2({ x1: 32, y1: 50, x2: 32, y2: 70, stroke: RETRO.gold, width: LINE }),
      line2({ x1: 60, y1: 56, x2: 60, y2: 76, stroke: RETRO.gold, width: LINE }),
      line2({ x1: 88, y1: 50, x2: 88, y2: 70, stroke: RETRO.gold, width: LINE }),
      line2({ x1: 30, y1: 18, x2: 70, y2: 44, stroke: RETRO.brown, width: OUT, "stroke-linecap": "round" }),
      line2({ x1: 90, y1: 18, x2: 50, y2: 44, stroke: RETRO.brown, width: OUT, "stroke-linecap": "round" })
    ].join(""), { viewBox: [120, 100] }),
    mkSticker("speaker-waves", "Speaker", [
      // speaker box emitting sound waves
      path2("M24 46 H42 L62 28 V92 L42 74 H24 Z", { fill: RETRO.navy, stroke: RETRO.ink, width: OUT, "stroke-linejoin": "round" }),
      path2("M74 44 q12 16 0 32", { fill: "none", stroke: RETRO.teal, width: OUT, "stroke-linecap": "round" }),
      path2("M86 34 q22 26 0 52", { fill: "none", stroke: RETRO.gold, width: OUT, "stroke-linecap": "round" })
    ].join(""), { viewBox: [120, 120] }),
    mkSticker("treble-clef", "Treble clef", [
      // stylised G-clef on a badge
      disc(60, 60, 48, RETRO.cream),
      path2("M64 24 q-20 6 -20 30 q0 22 18 28 q22 8 22 -14 q0 -16 -18 -16 q-12 0 -12 12 q0 8 8 10", { fill: "none", stroke: RETRO.plum, width: OUT, "stroke-linecap": "round", "stroke-linejoin": "round" }),
      line2({ x1: 64, y1: 24, x2: 60, y2: 88, stroke: RETRO.plum, width: OUT, "stroke-linecap": "round" }),
      circle2({ cx: 56, cy: 92, r: 6, fill: RETRO.plum, stroke: RETRO.ink, width: 2 })
    ].join(""), { viewBox: [120, 120] })
  ]
};

// server/figures/stickers/medical-anatomy.js
var medical_anatomy_default = {
  genre: "medical-anatomy",
  label: "Medical & anatomy",
  stickers: [
    mkSticker("long-bone", "Long bone", [
      // classic dog-bone femur silhouette, knobbly ends
      `<path d="M28 30 a14 14 0 0 1 22 6 a14 14 0 0 1 22 -2 l0 0 q-2 14 -16 18 L66 86 q14 4 16 18 a14 14 0 0 1 -22 -2 a14 14 0 0 1 -22 6 q-12 -8 -2 -20 q-12 -2 -10 -16 q-12 -10 0 -20 q-4 -12 8 -16 Z" fill="${RETRO.cream}" stroke="${RETRO.ink}" stroke-width="${OUT}" stroke-linejoin="round"/>`,
      `<path d="M48 44 L60 76" fill="none" stroke="${RETRO.ink}" stroke-width="2" stroke-linecap="round"/>`
    ].join(""), { viewBox: [120, 120] }),
    mkSticker("vertebra", "Vertebra", [
      disc(60, 60, 46, RETRO.gold),
      // top-down vertebra: round body + wing-like transverse processes + spinous tip
      `<ellipse cx="60" cy="78" rx="26" ry="16" fill="${RETRO.cream}" stroke="${RETRO.ink}" stroke-width="${OUT}"/>`,
      `<circle cx="60" cy="50" r="14" fill="${RETRO.paper}" stroke="${RETRO.ink}" stroke-width="${OUT}"/>`,
      `<path d="M40 56 q-22 -6 -26 6 q16 6 26 0 Z" fill="${RETRO.cream}" stroke="${RETRO.ink}" stroke-width="${LINE}" stroke-linejoin="round"/>`,
      `<path d="M80 56 q22 -6 26 6 q-16 6 -26 0 Z" fill="${RETRO.cream}" stroke="${RETRO.ink}" stroke-width="${LINE}" stroke-linejoin="round"/>`,
      `<path d="M60 36 l8 -14 -16 0 Z" fill="${RETRO.cream}" stroke="${RETRO.ink}" stroke-width="${LINE}" stroke-linejoin="round"/>`
    ].join(""), { viewBox: [120, 120] }),
    mkSticker("knee-joint", "Knee joint", [
      // stylised hinge joint: femur above, tibia below, round kneecap
      `<path d="M40 14 q-6 30 0 42 q4 8 14 8 q14 0 14 -10 l0 -40 Z" fill="${RETRO.cream}" stroke="${RETRO.ink}" stroke-width="${OUT}" stroke-linejoin="round"/>`,
      `<path d="M44 70 q-4 22 2 36 l28 0 q4 -20 -2 -36 q-6 6 -14 6 q-8 0 -14 -6 Z" fill="${RETRO.cream}" stroke="${RETRO.ink}" stroke-width="${OUT}" stroke-linejoin="round"/>`,
      `<circle cx="42" cy="58" r="11" fill="${RETRO.orange}" stroke="${RETRO.ink}" stroke-width="${OUT}"/>`,
      `<path d="M58 50 l8 8 M58 58 l8 8" fill="none" stroke="${RETRO.ink}" stroke-width="2" stroke-linecap="round"/>`
    ].join(""), { viewBox: [120, 120] }),
    mkSticker("ribcage", "Ribcage", [
      // friendly front-on ribcage: central sternum + paired curved ribs
      `<rect x="54" y="22" width="12" height="64" rx="5" fill="${RETRO.cream}" stroke="${RETRO.ink}" stroke-width="${OUT}"/>`,
      `<path d="M54 32 q-30 4 -32 26" fill="none" stroke="${RETRO.ink}" stroke-width="${LINE}" stroke-linecap="round"/>`,
      `<path d="M54 46 q-28 4 -30 24" fill="none" stroke="${RETRO.ink}" stroke-width="${LINE}" stroke-linecap="round"/>`,
      `<path d="M54 60 q-24 4 -26 22" fill="none" stroke="${RETRO.ink}" stroke-width="${LINE}" stroke-linecap="round"/>`,
      `<path d="M54 74 q-18 4 -20 18" fill="none" stroke="${RETRO.ink}" stroke-width="${LINE}" stroke-linecap="round"/>`,
      `<path d="M66 32 q30 4 32 26" fill="none" stroke="${RETRO.ink}" stroke-width="${LINE}" stroke-linecap="round"/>`,
      `<path d="M66 46 q28 4 30 24" fill="none" stroke="${RETRO.ink}" stroke-width="${LINE}" stroke-linecap="round"/>`,
      `<path d="M66 60 q24 4 26 22" fill="none" stroke="${RETRO.ink}" stroke-width="${LINE}" stroke-linecap="round"/>`,
      `<path d="M66 74 q18 4 20 18" fill="none" stroke="${RETRO.ink}" stroke-width="${LINE}" stroke-linecap="round"/>`
    ].join(""), { viewBox: [120, 110] }),
    mkSticker("skull-anatomical", "Skull", [
      // clean anatomical skull, friendly not spooky
      `<path d="M60 16 C32 16 22 40 22 58 q0 16 12 22 l0 14 q0 6 8 6 l36 0 q8 0 8 -6 l0 -14 q12 -6 12 -22 C98 40 88 16 60 16 Z" fill="${RETRO.paper}" stroke="${RETRO.ink}" stroke-width="${OUT}" stroke-linejoin="round"/>`,
      `<circle cx="44" cy="54" r="9" fill="${RETRO.navy}" stroke="${RETRO.ink}" stroke-width="${LINE}"/>`,
      `<circle cx="76" cy="54" r="9" fill="${RETRO.navy}" stroke="${RETRO.ink}" stroke-width="${LINE}"/>`,
      `<path d="M60 64 l-6 12 12 0 Z" fill="${RETRO.ink}"/>`,
      `<line x1="48" y1="92" x2="48" y2="104" stroke="${RETRO.ink}" stroke-width="2"/>`,
      `<line x1="60" y1="92" x2="60" y2="106" stroke="${RETRO.ink}" stroke-width="2"/>`,
      `<line x1="72" y1="92" x2="72" y2="104" stroke="${RETRO.ink}" stroke-width="2"/>`
    ].join(""), { viewBox: [120, 116] }),
    mkSticker("stethoscope", "Stethoscope", [
      `<path d="M34 20 q-6 40 8 54 q14 14 28 0 q14 -14 8 -54" fill="none" stroke="${RETRO.navy}" stroke-width="${OUT}" stroke-linecap="round"/>`,
      `<circle cx="34" cy="18" r="5" fill="${RETRO.gold}" stroke="${RETRO.ink}" stroke-width="2"/>`,
      `<circle cx="86" cy="18" r="5" fill="${RETRO.gold}" stroke="${RETRO.ink}" stroke-width="2"/>`,
      `<path d="M60 80 q0 18 18 22" fill="none" stroke="${RETRO.navy}" stroke-width="${OUT}" stroke-linecap="round"/>`,
      `<circle cx="82" cy="104" r="14" fill="${RETRO.teal}" stroke="${RETRO.ink}" stroke-width="${OUT}"/>`,
      `<circle cx="82" cy="104" r="6" fill="${RETRO.paper}" stroke="${RETRO.ink}" stroke-width="2"/>`
    ].join(""), { viewBox: [120, 124] }),
    mkSticker("syringe", "Syringe", [
      `<rect x="30" y="38" width="48" height="20" rx="4" fill="${RETRO.cream}" stroke="${RETRO.ink}" stroke-width="${OUT}" transform="rotate(-45 54 48)"/>`,
      `<line x1="40" y1="24" x2="68" y2="52" stroke="${RETRO.ink}" stroke-width="2"/>`,
      `<line x1="48" y1="32" x2="60" y2="44" stroke="${RETRO.teal}" stroke-width="${LINE}"/>`,
      `<rect x="22" y="20" width="16" height="10" rx="2" fill="${RETRO.red}" stroke="${RETRO.ink}" stroke-width="${LINE}" transform="rotate(-45 30 25)"/>`,
      `<line x1="74" y1="58" x2="100" y2="84" stroke="${RETRO.ink}" stroke-width="${OUT}" stroke-linecap="round"/>`,
      `<line x1="100" y1="84" x2="106" y2="90" stroke="${RETRO.ink}" stroke-width="2" stroke-linecap="round"/>`
    ].join(""), { viewBox: [120, 110] }),
    mkSticker("pill-capsule", "Pill capsule", [
      // tilted two-tone capsule
      `<rect x="22" y="46" width="76" height="36" rx="18" fill="${RETRO.paper}" stroke="${RETRO.ink}" stroke-width="${OUT}" transform="rotate(-30 60 64)"/>`,
      `<path d="M60 28 a18 18 0 0 0 -16 9 l-22 38 a18 18 0 0 0 32 18 Z" fill="${RETRO.red}" stroke="${RETRO.ink}" stroke-width="${LINE}"/>`,
      `<circle cx="70" cy="48" r="3" fill="${RETRO.paper}"/>`
    ].join(""), { viewBox: [120, 120] }),
    mkSticker("sticking-plaster", "Plaster", [
      `<rect x="22" y="46" width="76" height="28" rx="14" fill="${RETRO.gold}" stroke="${RETRO.ink}" stroke-width="${OUT}" transform="rotate(-20 60 60)"/>`,
      `<rect x="46" y="40" width="28" height="40" rx="5" fill="${RETRO.cream}" stroke="${RETRO.ink}" stroke-width="${LINE}" transform="rotate(-20 60 60)"/>`,
      `<circle cx="50" cy="52" r="2.5" fill="${RETRO.ink}"/>`,
      `<circle cx="60" cy="60" r="2.5" fill="${RETRO.ink}"/>`,
      `<circle cx="70" cy="68" r="2.5" fill="${RETRO.ink}"/>`,
      `<circle cx="68" cy="50" r="2.5" fill="${RETRO.ink}"/>`,
      `<circle cx="52" cy="70" r="2.5" fill="${RETRO.ink}"/>`
    ].join(""), { viewBox: [120, 120] }),
    mkSticker("first-aid-cross", "First aid", [
      disc(60, 60, 46, RETRO.red),
      `<path d="M48 28 h24 v20 h20 v24 h-20 v20 h-24 v-20 h-20 v-24 h20 Z" fill="${RETRO.paper}" stroke="${RETRO.ink}" stroke-width="${OUT}" stroke-linejoin="round"/>`
    ].join(""), { viewBox: [120, 120] }),
    mkSticker("brain", "Brain", [
      // friendly stylised brain with folds
      `<path d="M34 50 q-14 4 -10 18 q-8 10 4 18 q0 12 16 12 q8 8 16 0 q8 8 16 0 q16 0 16 -12 q12 -8 4 -18 q4 -14 -10 -18 q-4 -14 -18 -10 q-8 -6 -16 2 q-12 -6 -18 8 Z" fill="${RETRO.pink}" stroke="${RETRO.ink}" stroke-width="${OUT}" stroke-linejoin="round"/>`,
      `<path d="M60 36 q0 30 0 60" fill="none" stroke="${RETRO.ink}" stroke-width="2"/>`,
      `<path d="M44 52 q8 4 4 12 M76 52 q-8 4 -4 12 M40 76 q10 -2 12 6 M80 76 q-10 -2 -12 6" fill="none" stroke="${RETRO.ink}" stroke-width="2" stroke-linecap="round"/>`
    ].join(""), { viewBox: [120, 116] }),
    mkSticker("tooth", "Tooth", [
      `<path d="M40 22 q20 -10 40 0 q12 8 8 28 q-3 16 -8 34 q-4 14 -10 0 q-4 -16 -10 -16 q-6 0 -10 16 q-6 14 -10 0 q-5 -18 -8 -34 q-4 -20 8 -28 Z" fill="${RETRO.paper}" stroke="${RETRO.ink}" stroke-width="${OUT}" stroke-linejoin="round"/>`,
      `<path d="M46 36 q14 -6 28 0" fill="none" stroke="${RETRO.ink}" stroke-width="2" stroke-linecap="round"/>`,
      `<path d="M70 40 q4 8 0 22" fill="none" stroke="${RETRO.gold}" stroke-width="${LINE}" stroke-linecap="round"/>`
    ].join(""), { viewBox: [120, 116] }),
    mkSticker("plaster-cast", "Plaster cast", [
      // forearm cast with toe-end + sling-style bands, plus a doodle signature mark
      `<path d="M40 16 q40 0 44 24 q4 28 -4 58 q-4 14 -20 14 q-16 0 -20 -14 q-8 -30 -4 -58 q4 -22 4 -24 Z" fill="${RETRO.paper}" stroke="${RETRO.ink}" stroke-width="${OUT}" stroke-linejoin="round"/>`,
      `<path d="M38 40 q26 6 48 0 M38 60 q26 6 48 0 M40 80 q24 6 44 0" fill="none" stroke="${RETRO.ink}" stroke-width="2"/>`,
      `<path d="M44 22 q16 -8 32 0" fill="${RETRO.cream}" stroke="${RETRO.ink}" stroke-width="${LINE}"/>`,
      `<path d="M52 70 q6 4 12 0" fill="none" stroke="${RETRO.blue}" stroke-width="2" stroke-linecap="round"/>`
    ].join(""), { viewBox: [120, 120] }),
    mkSticker("crutch", "Crutch", [
      // underarm crutch
      `<path d="M44 16 q16 -6 32 0 l0 8 q-16 -6 -32 0 Z" fill="${RETRO.gold}" stroke="${RETRO.ink}" stroke-width="${OUT}" stroke-linejoin="round"/>`,
      `<line x1="50" y1="22" x2="56" y2="62" stroke="${RETRO.brown}" stroke-width="${OUT}" stroke-linecap="round"/>`,
      `<line x1="70" y1="22" x2="64" y2="62" stroke="${RETRO.brown}" stroke-width="${OUT}" stroke-linecap="round"/>`,
      `<rect x="48" y="40" width="24" height="9" rx="4" fill="${RETRO.cream}" stroke="${RETRO.ink}" stroke-width="${LINE}"/>`,
      `<line x1="60" y1="62" x2="60" y2="100" stroke="${RETRO.brown}" stroke-width="${OUT}" stroke-linecap="round"/>`,
      `<circle cx="60" cy="106" r="6" fill="${RETRO.navy}" stroke="${RETRO.ink}" stroke-width="${LINE}"/>`
    ].join(""), { viewBox: [120, 120] })
  ]
};

// server/figures/stickers/space.js
var space_default = {
  genre: "space",
  label: "Space",
  stickers: [
    mkSticker("rocket-launch", "Lift-off", [
      `<path d="M60 10 C44 26 38 50 38 76 H82 C82 50 76 26 60 10 Z" fill="${RETRO.paper}" stroke="${RETRO.ink}" stroke-width="${OUT}" stroke-linejoin="round"/>`,
      `<circle cx="60" cy="44" r="11" fill="${RETRO.blue}" stroke="${RETRO.ink}" stroke-width="${LINE}"/>`,
      `<path d="M38 64 L20 86 L40 78 Z" fill="${RETRO.red}" stroke="${RETRO.ink}" stroke-width="${LINE}" stroke-linejoin="round"/>`,
      `<path d="M82 64 L100 86 L80 78 Z" fill="${RETRO.red}" stroke="${RETRO.ink}" stroke-width="${LINE}" stroke-linejoin="round"/>`,
      `<path d="M50 76 H70 L64 100 L60 92 L56 100 Z" fill="${RETRO.orange}" stroke="${RETRO.ink}" stroke-width="${LINE}" stroke-linejoin="round"/>`,
      `<path d="M56 100 L60 116 L64 100" fill="${RETRO.gold}" stroke="${RETRO.ink}" stroke-width="2"/>`
    ].join(""), { viewBox: [120, 120] }),
    mkSticker("ringed-planet", "Saturn", [
      disc(60, 60, 46, RETRO.navy),
      `<ellipse cx="60" cy="60" rx="60" ry="18" fill="none" stroke="${RETRO.gold}" stroke-width="${OUT}" transform="rotate(-18 60 60)"/>`,
      `<circle cx="60" cy="60" r="26" fill="${RETRO.orange}" stroke="${RETRO.ink}" stroke-width="${OUT}"/>`,
      `<path d="M40 54 q20 8 40 0" fill="none" stroke="${RETRO.gold}" stroke-width="2"/>`,
      `<path d="M44 68 q16 6 32 0" fill="none" stroke="${RETRO.gold}" stroke-width="2"/>`
    ].join(""), { viewBox: [120, 120] }),
    mkSticker("five-point-star", "Star", [
      `<path d="M60 12 L73 46 L110 48 L80 70 L91 106 L60 84 L29 106 L40 70 L10 48 L47 46 Z" fill="${RETRO.gold}" stroke="${RETRO.ink}" stroke-width="${OUT}" stroke-linejoin="round"/>`,
      `<path d="M60 32 L67 50 L60 62 L53 50 Z" fill="${RETRO.orange}"/>`
    ].join(""), { viewBox: [120, 118] }),
    mkSticker("crescent-moon", "Crescent moon", [
      disc(60, 60, 46, RETRO.navy),
      `<path d="M74 24 A40 40 0 1 0 74 96 A30 30 0 1 1 74 24 Z" fill="${RETRO.gold}" stroke="${RETRO.ink}" stroke-width="${OUT}" stroke-linejoin="round"/>`,
      `<circle cx="54" cy="44" r="4" fill="${RETRO.cream}"/>`,
      `<circle cx="50" cy="70" r="3" fill="${RETRO.cream}"/>`
    ].join(""), { viewBox: [120, 120] }),
    mkSticker("flying-saucer", "UFO", [
      `<ellipse cx="60" cy="40" rx="20" ry="14" fill="${RETRO.teal}" stroke="${RETRO.ink}" stroke-width="${OUT}"/>`,
      `<ellipse cx="60" cy="56" rx="48" ry="18" fill="${RETRO.blue}" stroke="${RETRO.ink}" stroke-width="${OUT}"/>`,
      `<circle cx="40" cy="58" r="4" fill="${RETRO.gold}" stroke="${RETRO.ink}" stroke-width="2"/>`,
      `<circle cx="60" cy="62" r="4" fill="${RETRO.gold}" stroke="${RETRO.ink}" stroke-width="2"/>`,
      `<circle cx="80" cy="58" r="4" fill="${RETRO.gold}" stroke="${RETRO.ink}" stroke-width="2"/>`,
      `<path d="M48 72 L40 108 H80 L72 72" fill="${RETRO.gold}" stroke="${RETRO.ink}" stroke-width="2" opacity="0.85" stroke-linejoin="round"/>`
    ].join(""), { viewBox: [120, 116] }),
    mkSticker("astronaut-helmet", "Helmet", [
      `<circle cx="60" cy="60" r="48" fill="${RETRO.paper}" stroke="${RETRO.ink}" stroke-width="${OUT}"/>`,
      `<path d="M28 54 a32 26 0 0 1 64 0 v18 a32 22 0 0 1 -64 0 Z" fill="${RETRO.navy}" stroke="${RETRO.ink}" stroke-width="${OUT}"/>`,
      `<path d="M40 50 q14 -14 30 -6" fill="none" stroke="${RETRO.teal}" stroke-width="${LINE}" stroke-linecap="round"/>`,
      `<rect x="14" y="52" width="10" height="20" rx="3" fill="${RETRO.gold}" stroke="${RETRO.ink}" stroke-width="2"/>`,
      `<rect x="96" y="52" width="10" height="20" rx="3" fill="${RETRO.gold}" stroke="${RETRO.ink}" stroke-width="2"/>`
    ].join(""), { viewBox: [120, 120] }),
    mkSticker("comet", "Comet", [
      `<path d="M12 104 Q52 64 92 28" fill="none" stroke="${RETRO.teal}" stroke-width="${OUT}" stroke-linecap="round"/>`,
      `<path d="M20 96 Q56 68 88 40" fill="none" stroke="${RETRO.gold}" stroke-width="${LINE}" stroke-linecap="round"/>`,
      `<circle cx="92" cy="28" r="16" fill="${RETRO.orange}" stroke="${RETRO.ink}" stroke-width="${OUT}"/>`,
      `<circle cx="88" cy="24" r="5" fill="${RETRO.gold}"/>`
    ].join(""), { viewBox: [120, 116] }),
    mkSticker("shooting-star", "Shooting star", [
      // curved motion trail sweeping up from lower-left to the star at upper-right
      `<path d="M10 108 Q40 88 64 56" fill="none" stroke="${RETRO.teal}" stroke-width="${OUT}" stroke-linecap="round"/>`,
      `<path d="M22 104 Q46 86 66 60" fill="none" stroke="${RETRO.gold}" stroke-width="${LINE}" stroke-linecap="round"/>`,
      // the star itself, up and to the right
      `<path d="M82 14 L90 38 L116 40 L96 56 L103 82 L82 67 L61 82 L68 56 L48 40 L74 38 Z" fill="${RETRO.gold}" stroke="${RETRO.ink}" stroke-width="${OUT}" stroke-linejoin="round"/>`,
      `<path d="M82 30 L86 42 L82 50 L78 42 Z" fill="${RETRO.orange}"/>`,
      // sparkles trailing along the path
      `<path d="M40 80 l3 7 7 3 -7 3 -3 7 -3 -7 -7 -3 7 -3 z" fill="${RETRO.gold}" stroke="${RETRO.ink}" stroke-width="2" stroke-linejoin="round"/>`,
      `<circle cx="22" cy="96" r="3" fill="${RETRO.paper}" stroke="${RETRO.ink}" stroke-width="2"/>`
    ].join(""), { viewBox: [120, 120] }),
    mkSticker("satellite", "Satellite", [
      `<rect x="46" y="44" width="28" height="32" rx="4" fill="${RETRO.navy}" stroke="${RETRO.ink}" stroke-width="${OUT}"/>`,
      `<rect x="10" y="48" width="30" height="24" rx="3" fill="${RETRO.blue}" stroke="${RETRO.ink}" stroke-width="${LINE}"/>`,
      `<rect x="80" y="48" width="30" height="24" rx="3" fill="${RETRO.blue}" stroke="${RETRO.ink}" stroke-width="${LINE}"/>`,
      `<line x1="25" y1="48" x2="25" y2="72" stroke="${RETRO.ink}" stroke-width="2"/>`,
      `<line x1="95" y1="48" x2="95" y2="72" stroke="${RETRO.ink}" stroke-width="2"/>`,
      `<path d="M60 44 q-2 -22 18 -30" fill="none" stroke="${RETRO.ink}" stroke-width="${LINE}"/>`,
      `<circle cx="80" cy="12" r="7" fill="${RETRO.gold}" stroke="${RETRO.ink}" stroke-width="2"/>`
    ].join(""), { viewBox: [120, 96] }),
    mkSticker("friendly-alien", "Alien", [
      `<path d="M60 14 C32 14 24 40 30 64 C34 84 46 102 60 102 C74 102 86 84 90 64 C96 40 88 14 60 14 Z" fill="${RETRO.green}" stroke="${RETRO.ink}" stroke-width="${OUT}" stroke-linejoin="round"/>`,
      `<ellipse cx="46" cy="56" rx="9" ry="14" fill="${RETRO.ink}"/>`,
      `<ellipse cx="74" cy="56" rx="9" ry="14" fill="${RETRO.ink}"/>`,
      `<circle cx="48" cy="52" r="3" fill="${RETRO.paper}"/>`,
      `<circle cx="76" cy="52" r="3" fill="${RETRO.paper}"/>`,
      `<path d="M50 82 q10 8 20 0" fill="none" stroke="${RETRO.ink}" stroke-width="${LINE}" stroke-linecap="round"/>`,
      `<line x1="48" y1="14" x2="42" y2="2" stroke="${RETRO.ink}" stroke-width="${LINE}"/>`,
      `<line x1="72" y1="14" x2="78" y2="2" stroke="${RETRO.ink}" stroke-width="${LINE}"/>`,
      `<circle cx="42" cy="2" r="4" fill="${RETRO.gold}" stroke="${RETRO.ink}" stroke-width="2"/>`,
      `<circle cx="78" cy="2" r="4" fill="${RETRO.gold}" stroke="${RETRO.ink}" stroke-width="2"/>`
    ].join(""), { viewBox: [120, 112] }),
    mkSticker("spiral-galaxy", "Galaxy", [
      disc(60, 60, 46, RETRO.plum),
      `<path d="M60 60 q24 -8 30 14 q4 24 -24 26 q-30 0 -34 -28 q-2 -32 32 -36 q34 -2 38 30" fill="none" stroke="${RETRO.pink}" stroke-width="${OUT}" stroke-linecap="round"/>`,
      `<path d="M60 60 q-22 8 -28 -12" fill="none" stroke="${RETRO.gold}" stroke-width="${LINE}" stroke-linecap="round"/>`,
      `<circle cx="60" cy="60" r="8" fill="${RETRO.gold}" stroke="${RETRO.ink}" stroke-width="2"/>`,
      `<circle cx="30" cy="40" r="2" fill="${RETRO.paper}"/>`,
      `<circle cx="92" cy="80" r="2" fill="${RETRO.paper}"/>`
    ].join(""), { viewBox: [120, 120] }),
    mkSticker("blazing-sun", "Blazing sun", [
      `<circle cx="60" cy="60" r="30" fill="${RETRO.gold}" stroke="${RETRO.ink}" stroke-width="${OUT}"/>`,
      `<circle cx="60" cy="60" r="18" fill="${RETRO.orange}" stroke="${RETRO.ink}" stroke-width="${LINE}"/>`,
      `<path d="M60 6 L66 26 H54 Z" fill="${RETRO.gold}" stroke="${RETRO.ink}" stroke-width="2" stroke-linejoin="round"/>`,
      `<path d="M60 114 L66 94 H54 Z" fill="${RETRO.gold}" stroke="${RETRO.ink}" stroke-width="2" stroke-linejoin="round"/>`,
      `<path d="M6 60 L26 54 V66 Z" fill="${RETRO.gold}" stroke="${RETRO.ink}" stroke-width="2" stroke-linejoin="round"/>`,
      `<path d="M114 60 L94 54 V66 Z" fill="${RETRO.gold}" stroke="${RETRO.ink}" stroke-width="2" stroke-linejoin="round"/>`,
      `<path d="M22 22 L40 34 L34 40 Z" fill="${RETRO.gold}" stroke="${RETRO.ink}" stroke-width="2" stroke-linejoin="round"/>`,
      `<path d="M98 22 L80 34 L86 40 Z" fill="${RETRO.gold}" stroke="${RETRO.ink}" stroke-width="2" stroke-linejoin="round"/>`,
      `<path d="M22 98 L40 86 L34 80 Z" fill="${RETRO.gold}" stroke="${RETRO.ink}" stroke-width="2" stroke-linejoin="round"/>`,
      `<path d="M98 98 L80 86 L86 80 Z" fill="${RETRO.gold}" stroke="${RETRO.ink}" stroke-width="2" stroke-linejoin="round"/>`
    ].join(""), { viewBox: [120, 120] })
  ]
};

// server/figures/stickers/weather-nature.js
var weather_nature_default = {
  genre: "weather-nature",
  label: "Weather & nature",
  stickers: [
    mkSticker("sunny-rays", "Sunshine", [
      `<circle cx="60" cy="60" r="26" fill="${RETRO.gold}" stroke="${RETRO.ink}" stroke-width="${OUT}"/>`,
      `<line x1="60" y1="8" x2="60" y2="26" stroke="${RETRO.orange}" stroke-width="${OUT}" stroke-linecap="round"/>`,
      `<line x1="60" y1="94" x2="60" y2="112" stroke="${RETRO.orange}" stroke-width="${OUT}" stroke-linecap="round"/>`,
      `<line x1="8" y1="60" x2="26" y2="60" stroke="${RETRO.orange}" stroke-width="${OUT}" stroke-linecap="round"/>`,
      `<line x1="94" y1="60" x2="112" y2="60" stroke="${RETRO.orange}" stroke-width="${OUT}" stroke-linecap="round"/>`,
      `<line x1="23" y1="23" x2="36" y2="36" stroke="${RETRO.orange}" stroke-width="${OUT}" stroke-linecap="round"/>`,
      `<line x1="97" y1="23" x2="84" y2="36" stroke="${RETRO.orange}" stroke-width="${OUT}" stroke-linecap="round"/>`,
      `<line x1="23" y1="97" x2="36" y2="84" stroke="${RETRO.orange}" stroke-width="${OUT}" stroke-linecap="round"/>`,
      `<line x1="97" y1="97" x2="84" y2="84" stroke="${RETRO.orange}" stroke-width="${OUT}" stroke-linecap="round"/>`,
      `<path d="M48 64 q12 12 24 0" fill="none" stroke="${RETRO.ink}" stroke-width="${LINE}" stroke-linecap="round"/>`
    ].join(""), { viewBox: [120, 120] }),
    mkSticker("fluffy-cloud", "Cloud", [
      `<path d="M30 78 a20 20 0 0 1 4 -39 a26 26 0 0 1 50 -4 a18 18 0 0 1 6 43 Z" fill="${RETRO.paper}" stroke="${RETRO.ink}" stroke-width="${OUT}" stroke-linejoin="round"/>`,
      `<path d="M40 58 q14 -8 30 -2" fill="none" stroke="${RETRO.blue}" stroke-width="2" stroke-linecap="round"/>`
    ].join(""), { viewBox: [120, 96] }),
    mkSticker("rain-cloud", "Rain cloud", [
      `<path d="M30 56 a18 18 0 0 1 4 -35 a24 24 0 0 1 46 -4 a16 16 0 0 1 5 39 Z" fill="${RETRO.navy}" stroke="${RETRO.ink}" stroke-width="${OUT}" stroke-linejoin="round"/>`,
      `<line x1="40" y1="64" x2="34" y2="86" stroke="${RETRO.blue}" stroke-width="${OUT}" stroke-linecap="round"/>`,
      `<line x1="58" y1="66" x2="52" y2="92" stroke="${RETRO.teal}" stroke-width="${OUT}" stroke-linecap="round"/>`,
      `<line x1="76" y1="64" x2="70" y2="86" stroke="${RETRO.blue}" stroke-width="${OUT}" stroke-linecap="round"/>`
    ].join(""), { viewBox: [120, 100] }),
    mkSticker("snowflake", "Snowflake", [
      disc(60, 60, 46, RETRO.blue),
      `<line x1="60" y1="18" x2="60" y2="102" stroke="${RETRO.paper}" stroke-width="${OUT}" stroke-linecap="round"/>`,
      `<line x1="24" y1="39" x2="96" y2="81" stroke="${RETRO.paper}" stroke-width="${OUT}" stroke-linecap="round"/>`,
      `<line x1="24" y1="81" x2="96" y2="39" stroke="${RETRO.paper}" stroke-width="${OUT}" stroke-linecap="round"/>`,
      `<path d="M60 30 l-8 8 m8 -8 l8 8" fill="none" stroke="${RETRO.paper}" stroke-width="${LINE}" stroke-linecap="round"/>`,
      `<path d="M60 90 l-8 -8 m8 8 l8 -8" fill="none" stroke="${RETRO.paper}" stroke-width="${LINE}" stroke-linecap="round"/>`,
      `<circle cx="60" cy="60" r="6" fill="${RETRO.cream}" stroke="${RETRO.ink}" stroke-width="2"/>`
    ].join(""), { viewBox: [120, 120] }),
    mkSticker("rainbow-arc", "Rainbow", [
      `<path d="M14 96 a46 46 0 0 1 92 0" fill="none" stroke="${RETRO.red}" stroke-width="8" stroke-linecap="round"/>`,
      `<path d="M24 96 a36 36 0 0 1 72 0" fill="none" stroke="${RETRO.gold}" stroke-width="8" stroke-linecap="round"/>`,
      `<path d="M34 96 a26 26 0 0 1 52 0" fill="none" stroke="${RETRO.green}" stroke-width="8" stroke-linecap="round"/>`,
      `<path d="M44 96 a16 16 0 0 1 32 0" fill="none" stroke="${RETRO.blue}" stroke-width="8" stroke-linecap="round"/>`,
      `<path d="M14 96 a46 46 0 0 1 92 0" fill="none" stroke="${RETRO.ink}" stroke-width="2"/>`,
      `<path d="M44 96 a16 16 0 0 1 32 0" fill="none" stroke="${RETRO.ink}" stroke-width="2"/>`
    ].join(""), { viewBox: [120, 104] }),
    mkSticker("lightning-cloud", "Storm bolt", [
      `<path d="M28 50 a18 18 0 0 1 4 -35 a24 24 0 0 1 46 -4 a16 16 0 0 1 5 39 Z" fill="${RETRO.navy}" stroke="${RETRO.ink}" stroke-width="${OUT}" stroke-linejoin="round"/>`,
      `<path d="M58 56 L42 86 H56 L48 110 L78 72 H62 L72 56 Z" fill="${RETRO.gold}" stroke="${RETRO.ink}" stroke-width="${LINE}" stroke-linejoin="round"/>`
    ].join(""), { viewBox: [120, 118] }),
    mkSticker("sunset-hill", "Sunset", [
      disc(60, 60, 46, RETRO.orange),
      `<circle cx="60" cy="52" r="18" fill="${RETRO.gold}" stroke="${RETRO.ink}" stroke-width="${LINE}"/>`,
      `<line x1="30" y1="46" x2="90" y2="46" stroke="${RETRO.orange}" stroke-width="2"/>`,
      `<line x1="34" y1="54" x2="86" y2="54" stroke="${RETRO.orange}" stroke-width="2"/>`,
      `<path d="M16 84 q24 -22 44 -6 q22 16 44 -2 v30 h-88 z" fill="${RETRO.green}" stroke="${RETRO.ink}" stroke-width="${OUT}" stroke-linejoin="round"/>`
    ].join(""), { viewBox: [120, 120] }),
    mkSticker("snow-mountain", "Mountain", [
      `<path d="M10 102 L44 30 L66 72 L80 48 L110 102 Z" fill="${RETRO.navy}" stroke="${RETRO.ink}" stroke-width="${OUT}" stroke-linejoin="round"/>`,
      `<path d="M36 46 L44 30 L54 50 L46 56 L40 50 Z" fill="${RETRO.paper}" stroke="${RETRO.ink}" stroke-width="2" stroke-linejoin="round"/>`,
      `<path d="M73 60 L80 48 L90 66 L82 64 Z" fill="${RETRO.paper}" stroke="${RETRO.ink}" stroke-width="2" stroke-linejoin="round"/>`,
      `<circle cx="92" cy="30" r="11" fill="${RETRO.gold}" stroke="${RETRO.ink}" stroke-width="2"/>`
    ].join(""), { viewBox: [120, 112] }),
    mkSticker("ocean-wave", "Wave", [
      disc(60, 60, 46, RETRO.teal),
      `<path d="M18 70 C30 46 48 44 56 60 C62 72 78 72 84 58 C90 46 100 48 102 60 C92 56 88 66 80 70 C70 76 58 70 56 62 C52 50 38 52 32 66 C28 76 22 74 18 70 Z" fill="${RETRO.blue}" stroke="${RETRO.ink}" stroke-width="${OUT}" stroke-linejoin="round"/>`,
      `<path d="M24 80 q18 -6 36 0 q18 6 36 0" fill="none" stroke="${RETRO.paper}" stroke-width="${LINE}" stroke-linecap="round"/>`
    ].join(""), { viewBox: [120, 120] }),
    mkSticker("campfire", "Campfire", [
      `<path d="M60 16 C46 34 50 46 58 54 C50 52 46 44 46 38 C36 50 38 78 60 88 C82 78 84 50 74 38 C74 46 70 52 62 54 C70 46 74 34 60 16 Z" fill="${RETRO.orange}" stroke="${RETRO.ink}" stroke-width="${OUT}" stroke-linejoin="round"/>`,
      `<path d="M56 50 q4 -14 8 -18 q6 12 0 24 q-6 -2 -8 -6 z" fill="${RETRO.gold}"/>`,
      `<path d="M24 100 L96 84" stroke="${RETRO.brown}" stroke-width="${OUT}" stroke-linecap="round"/>`,
      `<path d="M96 100 L24 84" stroke="${RETRO.brown}" stroke-width="${OUT}" stroke-linecap="round"/>`
    ].join(""), { viewBox: [120, 112] }),
    mkSticker("umbrella-rain", "Umbrella", [
      `<path d="M16 56 a44 44 0 0 1 88 0 Z" fill="${RETRO.red}" stroke="${RETRO.ink}" stroke-width="${OUT}" stroke-linejoin="round"/>`,
      `<path d="M16 56 q14 -10 22 0 q14 -10 22 0 q14 -10 22 0 q14 -10 22 0" fill="none" stroke="${RETRO.ink}" stroke-width="2"/>`,
      `<line x1="60" y1="56" x2="60" y2="98" stroke="${RETRO.ink}" stroke-width="${OUT}"/>`,
      `<path d="M60 98 q0 12 -12 12" fill="none" stroke="${RETRO.ink}" stroke-width="${OUT}" stroke-linecap="round"/>`,
      `<line x1="30" y1="76" x2="26" y2="92" stroke="${RETRO.blue}" stroke-width="${LINE}" stroke-linecap="round"/>`,
      `<line x1="92" y1="76" x2="88" y2="92" stroke="${RETRO.blue}" stroke-width="${LINE}" stroke-linecap="round"/>`
    ].join(""), { viewBox: [120, 116] }),
    mkSticker("moon-stars", "Night sky", [
      disc(60, 60, 46, RETRO.plum),
      `<path d="M70 32 A32 32 0 1 0 70 88 A24 24 0 1 1 70 32 Z" fill="${RETRO.gold}" stroke="${RETRO.ink}" stroke-width="${OUT}" stroke-linejoin="round"/>`,
      `<path d="M38 38 L41 46 L49 46 L43 51 L45 59 L38 54 L31 59 L33 51 L27 46 L35 46 Z" fill="${RETRO.cream}" stroke="${RETRO.ink}" stroke-width="2" stroke-linejoin="round"/>`,
      `<circle cx="40" cy="78" r="3" fill="${RETRO.cream}"/>`,
      `<circle cx="78" cy="92" r="2" fill="${RETRO.cream}"/>`
    ].join(""), { viewBox: [120, 120] }),
    mkSticker("tornado", "Tornado", [
      `<path d="M16 22 H104 M22 38 H98 M30 54 H88 M40 70 H76 M48 86 H66" fill="none" stroke="${RETRO.navy}" stroke-width="${OUT}" stroke-linecap="round"/>`,
      `<path d="M16 22 Q60 30 104 22 Q74 46 98 38 Q56 50 88 54 Q52 64 76 70 Q50 78 66 86 L56 104" fill="none" stroke="${RETRO.ink}" stroke-width="${LINE}" stroke-linecap="round" stroke-linejoin="round"/>`,
      `<path d="M56 86 L52 104 L60 100 Z" fill="${RETRO.brown}" stroke="${RETRO.ink}" stroke-width="2"/>`
    ].join(""), { viewBox: [120, 112] }),
    mkSticker("autumn-leaf", "Autumn leaf", [
      `<path d="M60 12 C30 30 22 64 30 96 C58 86 90 70 96 36 C82 44 70 42 60 12 Z" fill="${RETRO.orange}" stroke="${RETRO.ink}" stroke-width="${OUT}" stroke-linejoin="round"/>`,
      `<path d="M52 88 Q56 52 80 34" fill="none" stroke="${RETRO.brown}" stroke-width="${LINE}" stroke-linecap="round"/>`,
      `<path d="M60 64 L74 54 M56 76 L66 70 M64 50 L78 44" fill="none" stroke="${RETRO.red}" stroke-width="2" stroke-linecap="round"/>`,
      `<path d="M30 96 L24 110" stroke="${RETRO.brown}" stroke-width="${LINE}" stroke-linecap="round"/>`
    ].join(""), { viewBox: [120, 116] })
  ]
};

// server/figures/stickers/tech.js
var tech_default = {
  genre: "tech",
  label: "Tech",
  stickers: [
    mkSticker("floppy-disk", "Floppy disk", [
      rect2({ x: 18, y: 18, w: 84, h: 84, rx: 8, fill: RETRO.navy, stroke: RETRO.ink, width: OUT }),
      // metal shutter
      rect2({ x: 38, y: 18, w: 44, h: 30, fill: RETRO.cream, stroke: RETRO.ink, width: LINE }),
      rect2({ x: 62, y: 22, w: 12, h: 22, rx: 2, fill: RETRO.navy, stroke: RETRO.ink, width: 2 }),
      // label
      rect2({ x: 30, y: 56, w: 60, h: 38, rx: 3, fill: RETRO.paper, stroke: RETRO.ink, width: LINE }),
      line2({ x1: 36, y1: 66, x2: 84, y2: 66, stroke: RETRO.ink, width: 2 }),
      line2({ x1: 36, y1: 74, x2: 84, y2: 74, stroke: RETRO.ink, width: 2 }),
      line2({ x1: 36, y1: 82, x2: 72, y2: 82, stroke: RETRO.ink, width: 2 })
    ].join(""), { viewBox: [120, 120] }),
    mkSticker("crt-monitor", "Computer", [
      rect2({ x: 14, y: 18, w: 92, h: 68, rx: 8, fill: RETRO.cream, stroke: RETRO.ink, width: OUT }),
      // screen
      rect2({ x: 24, y: 26, w: 72, h: 52, rx: 4, fill: RETRO.teal, stroke: RETRO.ink, width: LINE }),
      line2({ x1: 34, y1: 40, x2: 64, y2: 40, stroke: RETRO.paper, width: 2 }),
      line2({ x1: 34, y1: 50, x2: 78, y2: 50, stroke: RETRO.paper, width: 2 }),
      line2({ x1: 34, y1: 60, x2: 56, y2: 60, stroke: RETRO.paper, width: 2 }),
      // stand
      rect2({ x: 50, y: 86, w: 20, h: 12, fill: RETRO.navy, stroke: RETRO.ink, width: LINE }),
      rect2({ x: 36, y: 98, w: 48, h: 10, rx: 3, fill: RETRO.navy, stroke: RETRO.ink, width: OUT })
    ].join(""), { viewBox: [120, 120] }),
    mkSticker("smartphone", "Smartphone", [
      rect2({ x: 36, y: 10, w: 48, h: 100, rx: 12, fill: RETRO.navy, stroke: RETRO.ink, width: OUT }),
      rect2({ x: 44, y: 22, w: 32, h: 68, rx: 3, fill: RETRO.teal, stroke: RETRO.ink, width: LINE }),
      circle2({ cx: 60, cy: 100, r: 5, fill: RETRO.cream, stroke: RETRO.ink, width: 2 }),
      line2({ x1: 52, y1: 16, x2: 68, y2: 16, stroke: RETRO.cream, width: 3 }),
      circle2({ cx: 60, cy: 50, r: 9, fill: RETRO.gold, stroke: RETRO.ink, width: 2 })
    ].join(""), { viewBox: [120, 120] }),
    mkSticker("wifi-signal", "Wi-Fi", [
      disc(60, 60, 46, RETRO.blue),
      circle2({ cx: 60, cy: 78, r: 6, fill: RETRO.paper, stroke: RETRO.ink, width: 2 }),
      path2("M40 56 Q60 40 80 56", { fill: "none", stroke: RETRO.paper, width: OUT, "stroke-linecap": "round" }),
      path2("M30 44 Q60 22 90 44", { fill: "none", stroke: RETRO.paper, width: OUT, "stroke-linecap": "round" })
    ].join(""), { viewBox: [120, 120] }),
    mkSticker("robot-head", "Robot", [
      // antenna
      line2({ x1: 60, y1: 22, x2: 60, y2: 12, stroke: RETRO.ink, width: OUT }),
      circle2({ cx: 60, cy: 10, r: 6, fill: RETRO.red, stroke: RETRO.ink, width: 2 }),
      // head
      rect2({ x: 24, y: 24, w: 72, h: 64, rx: 12, fill: RETRO.teal, stroke: RETRO.ink, width: OUT }),
      // eyes
      circle2({ cx: 46, cy: 50, r: 9, fill: RETRO.paper, stroke: RETRO.ink, width: LINE }),
      circle2({ cx: 46, cy: 50, r: 4, fill: RETRO.ink, stroke: "none", width: 0 }),
      circle2({ cx: 74, cy: 50, r: 9, fill: RETRO.paper, stroke: RETRO.ink, width: LINE }),
      circle2({ cx: 74, cy: 50, r: 4, fill: RETRO.ink, stroke: "none", width: 0 }),
      // mouth
      rect2({ x: 42, y: 68, w: 36, h: 10, rx: 3, fill: RETRO.gold, stroke: RETRO.ink, width: LINE }),
      line2({ x1: 52, y1: 68, x2: 52, y2: 78, stroke: RETRO.ink, width: 2 }),
      line2({ x1: 62, y1: 68, x2: 62, y2: 78, stroke: RETRO.ink, width: 2 }),
      line2({ x1: 72, y1: 68, x2: 72, y2: 78, stroke: RETRO.ink, width: 2 })
    ].join(""), { viewBox: [120, 110] }),
    mkSticker("usb-stick", "USB stick", [
      // metal connector
      rect2({ x: 18, y: 46, w: 24, h: 24, fill: RETRO.cream, stroke: RETRO.ink, width: OUT }),
      rect2({ x: 24, y: 52, w: 5, h: 5, fill: RETRO.ink, stroke: "none", width: 0 }),
      rect2({ x: 24, y: 60, w: 5, h: 5, fill: RETRO.ink, stroke: "none", width: 0 }),
      // body
      rect2({ x: 42, y: 38, w: 60, h: 40, rx: 8, fill: RETRO.red, stroke: RETRO.ink, width: OUT }),
      // cap groove + indicator
      line2({ x1: 56, y1: 38, x2: 56, y2: 78, stroke: RETRO.ink, width: LINE }),
      circle2({ cx: 84, cy: 58, r: 5, fill: RETRO.gold, stroke: RETRO.ink, width: 2 })
    ].join(""), { viewBox: [120, 110] }),
    mkSticker("microchip", "Microchip", [
      rect2({ x: 34, y: 34, w: 52, h: 52, rx: 6, fill: RETRO.navy, stroke: RETRO.ink, width: OUT }),
      rect2({ x: 46, y: 46, w: 28, h: 28, rx: 3, fill: RETRO.teal, stroke: RETRO.ink, width: LINE }),
      circle2({ cx: 60, cy: 60, r: 6, fill: RETRO.gold, stroke: RETRO.ink, width: 2 }),
      // pins
      line2({ x1: 44, y1: 34, x2: 44, y2: 20, stroke: RETRO.ink, width: LINE }),
      line2({ x1: 60, y1: 34, x2: 60, y2: 20, stroke: RETRO.ink, width: LINE }),
      line2({ x1: 76, y1: 34, x2: 76, y2: 20, stroke: RETRO.ink, width: LINE }),
      line2({ x1: 44, y1: 86, x2: 44, y2: 100, stroke: RETRO.ink, width: LINE }),
      line2({ x1: 60, y1: 86, x2: 60, y2: 100, stroke: RETRO.ink, width: LINE }),
      line2({ x1: 76, y1: 86, x2: 76, y2: 100, stroke: RETRO.ink, width: LINE }),
      line2({ x1: 34, y1: 44, x2: 20, y2: 44, stroke: RETRO.ink, width: LINE }),
      line2({ x1: 34, y1: 60, x2: 20, y2: 60, stroke: RETRO.ink, width: LINE }),
      line2({ x1: 34, y1: 76, x2: 20, y2: 76, stroke: RETRO.ink, width: LINE }),
      line2({ x1: 86, y1: 44, x2: 100, y2: 44, stroke: RETRO.ink, width: LINE }),
      line2({ x1: 86, y1: 60, x2: 100, y2: 60, stroke: RETRO.ink, width: LINE }),
      line2({ x1: 86, y1: 76, x2: 100, y2: 76, stroke: RETRO.ink, width: LINE })
    ].join(""), { viewBox: [120, 120] }),
    mkSticker("gear-cog", "Settings", [
      disc(60, 60, 42, RETRO.orange),
      // teeth
      path2("M60 14 L66 26 H54 Z", { fill: RETRO.orange, stroke: RETRO.ink, width: LINE, "stroke-linejoin": "round" }),
      path2("M60 106 L54 94 H66 Z", { fill: RETRO.orange, stroke: RETRO.ink, width: LINE, "stroke-linejoin": "round" }),
      path2("M14 60 L26 54 V66 Z", { fill: RETRO.orange, stroke: RETRO.ink, width: LINE, "stroke-linejoin": "round" }),
      path2("M106 60 L94 66 V54 Z", { fill: RETRO.orange, stroke: RETRO.ink, width: LINE, "stroke-linejoin": "round" }),
      path2("M27 27 L40 32 L32 40 Z", { fill: RETRO.orange, stroke: RETRO.ink, width: LINE, "stroke-linejoin": "round" }),
      path2("M93 93 L80 88 L88 80 Z", { fill: RETRO.orange, stroke: RETRO.ink, width: LINE, "stroke-linejoin": "round" }),
      path2("M93 27 L88 40 L80 32 Z", { fill: RETRO.orange, stroke: RETRO.ink, width: LINE, "stroke-linejoin": "round" }),
      path2("M27 93 L32 80 L40 88 Z", { fill: RETRO.orange, stroke: RETRO.ink, width: LINE, "stroke-linejoin": "round" }),
      circle2({ cx: 60, cy: 60, r: 16, fill: RETRO.cream, stroke: RETRO.ink, width: LINE })
    ].join(""), { viewBox: [120, 120] }),
    mkSticker("cloud", "Cloud sync", [
      path2("M30 84 Q12 84 14 66 Q16 52 32 52 Q34 32 56 32 Q78 32 80 52 Q104 50 104 70 Q104 84 88 84 Z", { fill: RETRO.blue, stroke: RETRO.ink, width: OUT, "stroke-linejoin": "round" }),
      // up arrow
      path2("M59 76 V58 M59 58 L50 66 M59 58 L68 66", { fill: "none", stroke: RETRO.paper, width: LINE, "stroke-linecap": "round", "stroke-linejoin": "round" })
    ].join(""), { viewBox: [120, 110] }),
    mkSticker("battery", "Battery", [
      rect2({ x: 16, y: 38, w: 80, h: 44, rx: 6, fill: RETRO.cream, stroke: RETRO.ink, width: OUT }),
      rect2({ x: 96, y: 50, w: 10, h: 20, rx: 3, fill: RETRO.ink, stroke: "none", width: 0 }),
      // charge cells
      rect2({ x: 24, y: 46, w: 16, h: 28, rx: 2, fill: RETRO.green, stroke: RETRO.ink, width: 2 }),
      rect2({ x: 44, y: 46, w: 16, h: 28, rx: 2, fill: RETRO.green, stroke: RETRO.ink, width: 2 }),
      rect2({ x: 64, y: 46, w: 16, h: 28, rx: 2, fill: RETRO.green, stroke: RETRO.ink, width: 2 })
    ].join(""), { viewBox: [120, 120] }),
    mkSticker("camera-aperture", "Camera lens", [
      circle2({ cx: 60, cy: 60, r: 44, fill: RETRO.navy, stroke: RETRO.ink, width: OUT }),
      circle2({ cx: 60, cy: 60, r: 30, fill: RETRO.cream, stroke: RETRO.ink, width: LINE }),
      // aperture blades
      path2("M60 30 L78 42 L60 60 Z", { fill: RETRO.teal, stroke: RETRO.ink, width: 2, "stroke-linejoin": "round" }),
      path2("M86 54 L84 76 L60 60 Z", { fill: RETRO.gold, stroke: RETRO.ink, width: 2, "stroke-linejoin": "round" }),
      path2("M72 84 L50 88 L60 60 Z", { fill: RETRO.red, stroke: RETRO.ink, width: 2, "stroke-linejoin": "round" }),
      path2("M38 78 L30 58 L60 60 Z", { fill: RETRO.orange, stroke: RETRO.ink, width: 2, "stroke-linejoin": "round" }),
      path2("M34 48 L52 34 L60 60 Z", { fill: RETRO.pink, stroke: RETRO.ink, width: 2, "stroke-linejoin": "round" })
    ].join(""), { viewBox: [120, 120] }),
    mkSticker("joystick", "Joystick", [
      // base
      ellipse({ cx: 60, cy: 92, rx: 40, ry: 14, fill: RETRO.navy, stroke: RETRO.ink, width: OUT }),
      rect2({ x: 28, y: 76, w: 64, h: 16, fill: RETRO.navy, stroke: RETRO.ink, width: LINE }),
      // shaft
      rect2({ x: 54, y: 40, w: 12, h: 42, fill: RETRO.cream, stroke: RETRO.ink, width: LINE }),
      // ball top
      circle2({ cx: 60, cy: 34, r: 16, fill: RETRO.red, stroke: RETRO.ink, width: OUT }),
      // button
      circle2({ cx: 80, cy: 80, r: 6, fill: RETRO.gold, stroke: RETRO.ink, width: 2 })
    ].join(""), { viewBox: [120, 120] }),
    mkSticker("satellite-dish", "Satellite dish", [
      // dish
      path2("M22 30 Q86 26 96 90 Q40 96 22 30 Z", { fill: RETRO.cream, stroke: RETRO.ink, width: OUT, "stroke-linejoin": "round" }),
      // feed arm + horn
      line2({ x1: 58, y1: 58, x2: 78, y2: 30, stroke: RETRO.ink, width: LINE }),
      circle2({ cx: 78, cy: 30, r: 7, fill: RETRO.red, stroke: RETRO.ink, width: LINE }),
      // mast
      line2({ x1: 50, y1: 86, x2: 60, y2: 108, stroke: RETRO.ink, width: OUT }),
      rect2({ x: 44, y: 104, w: 32, h: 8, rx: 3, fill: RETRO.navy, stroke: RETRO.ink, width: LINE }),
      // signal arcs
      path2("M86 22 Q96 26 98 38", { fill: "none", stroke: RETRO.teal, width: 2, "stroke-linecap": "round" }),
      path2("M82 14 Q102 20 104 44", { fill: "none", stroke: RETRO.teal, width: 2, "stroke-linecap": "round" })
    ].join(""), { viewBox: [120, 120] }),
    mkSticker("terminal", "Terminal", [
      rect2({ x: 14, y: 22, w: 92, h: 76, rx: 8, fill: RETRO.navy, stroke: RETRO.ink, width: OUT }),
      // title bar
      rect2({ x: 14, y: 22, w: 92, h: 16, fill: RETRO.ink, stroke: "none", width: 0 }),
      circle2({ cx: 26, cy: 30, r: 3, fill: RETRO.red, stroke: "none", width: 0 }),
      circle2({ cx: 38, cy: 30, r: 3, fill: RETRO.gold, stroke: "none", width: 0 }),
      circle2({ cx: 50, cy: 30, r: 3, fill: RETRO.green, stroke: "none", width: 0 }),
      // prompt + cursor
      path2("M26 58 L36 66 L26 74", { fill: "none", stroke: RETRO.teal, width: LINE, "stroke-linecap": "round", "stroke-linejoin": "round" }),
      line2({ x1: 42, y1: 74, x2: 60, y2: 74, stroke: RETRO.teal, width: LINE, "stroke-linecap": "round" }),
      rect2({ x: 68, y: 60, w: 10, h: 16, fill: RETRO.paper, stroke: "none", width: 0 })
    ].join(""), { viewBox: [120, 120] })
  ]
};

// server/figures/stickers/emotions-reactions.js
var emotions_reactions_default = {
  genre: "emotions-reactions",
  label: "Emotions & reactions",
  stickers: [
    mkSticker("grin-face", "Big grin", [
      disc(60, 60, 46, RETRO.gold),
      `<circle cx="44" cy="50" r="6" fill="${RETRO.ink}"/>`,
      `<circle cx="76" cy="50" r="6" fill="${RETRO.ink}"/>`,
      `<path d="M36 70 q24 30 48 0 z" fill="${RETRO.red}" stroke="${RETRO.ink}" stroke-width="${LINE}" stroke-linejoin="round"/>`,
      `<path d="M36 70 h48" stroke="${RETRO.ink}" stroke-width="${LINE}" stroke-linecap="round"/>`
    ].join(""), { viewBox: [120, 120] }),
    mkSticker("sad-face", "Sad face", [
      disc(60, 60, 46, RETRO.blue),
      `<circle cx="44" cy="52" r="6" fill="${RETRO.ink}"/>`,
      `<circle cx="76" cy="52" r="6" fill="${RETRO.ink}"/>`,
      `<path d="M40 84 q20 -22 40 0" fill="none" stroke="${RETRO.ink}" stroke-width="${OUT}" stroke-linecap="round"/>`,
      `<path d="M82 56 q4 10 0 18 q-7 -6 0 -18 z" fill="${RETRO.paper}" stroke="${RETRO.ink}" stroke-width="2"/>`
    ].join(""), { viewBox: [120, 120] }),
    mkSticker("angry-face", "Angry", [
      disc(60, 60, 46, RETRO.red),
      // furrowed brows angled down toward the centre
      `<path d="M34 44 L52 54" fill="none" stroke="${RETRO.ink}" stroke-width="${OUT}" stroke-linecap="round"/>`,
      `<path d="M86 44 L68 54" fill="none" stroke="${RETRO.ink}" stroke-width="${OUT}" stroke-linecap="round"/>`,
      `<circle cx="46" cy="60" r="5" fill="${RETRO.ink}"/>`,
      `<circle cx="74" cy="60" r="5" fill="${RETRO.ink}"/>`,
      // frown
      `<path d="M40 88 q20 -18 40 0" fill="none" stroke="${RETRO.ink}" stroke-width="${OUT}" stroke-linecap="round"/>`
    ].join(""), { viewBox: [120, 120] }),
    mkSticker("broken-heart", "Broken heart", [
      `<path d="M60 102 C18 74 14 44 30 30 C44 18 58 26 60 40 C62 26 76 18 90 30 C106 44 102 74 60 102 Z" fill="${RETRO.pink}" stroke="${RETRO.ink}" stroke-width="${OUT}" stroke-linejoin="round"/>`,
      `<path d="M60 32 L52 50 L66 60 L54 74 L60 100" fill="none" stroke="${RETRO.ink}" stroke-width="${LINE}" stroke-linejoin="round"/>`
    ].join(""), { viewBox: [120, 120] }),
    mkSticker("star-struck", "Star-struck", [
      disc(60, 60, 46, RETRO.gold),
      `<path d="M44 38 l5 11 12 1 -9 8 3 12 -11 -7 -11 7 3 -12 -9 -8 12 -1 z" fill="${RETRO.orange}" stroke="${RETRO.ink}" stroke-width="2" stroke-linejoin="round"/>`,
      `<path d="M76 38 l5 11 12 1 -9 8 3 12 -11 -7 -11 7 3 -12 -9 -8 12 -1 z" fill="${RETRO.orange}" stroke="${RETRO.ink}" stroke-width="2" stroke-linejoin="round"/>`,
      `<path d="M38 76 q22 24 44 0 z" fill="${RETRO.red}" stroke="${RETRO.ink}" stroke-width="${LINE}" stroke-linejoin="round"/>`
    ].join(""), { viewBox: [120, 120] }),
    mkSticker("surprised-face", "Surprised", [
      disc(60, 60, 46, RETRO.gold),
      // raised brows arching high above the eyes
      `<path d="M36 42 q10 -8 20 -2" fill="none" stroke="${RETRO.ink}" stroke-width="${LINE}" stroke-linecap="round"/>`,
      `<path d="M64 40 q10 -6 20 2" fill="none" stroke="${RETRO.ink}" stroke-width="${LINE}" stroke-linecap="round"/>`,
      `<circle cx="46" cy="58" r="6" fill="${RETRO.ink}"/>`,
      `<circle cx="74" cy="58" r="6" fill="${RETRO.ink}"/>`,
      // open round mouth
      `<circle cx="60" cy="82" r="12" fill="${RETRO.red}" stroke="${RETRO.ink}" stroke-width="${LINE}"/>`
    ].join(""), { viewBox: [120, 120] }),
    mkSticker("thumbs-down", "Thumbs down", [
      `<rect x="20" y="18" width="20" height="46" rx="5" fill="${RETRO.brown}" stroke="${RETRO.ink}" stroke-width="${OUT}"/>`,
      `<path d="M40 60 q0 16 10 28 q6 8 10 4 q4 -4 0 -16 l-3 -12 h26 q10 0 8 -12 l-6 -26 q-2 -10 -14 -10 H40 Z" fill="${RETRO.teal}" stroke="${RETRO.ink}" stroke-width="${OUT}" stroke-linejoin="round"/>`,
      `<path d="M62 56 h22" stroke="${RETRO.ink}" stroke-width="2"/>`,
      `<path d="M60 42 h22" stroke="${RETRO.ink}" stroke-width="2"/>`
    ].join(""), { viewBox: [120, 120] }),
    mkSticker("ok-hand", "OK hand", [
      `<circle cx="48" cy="68" r="22" fill="none" stroke="${RETRO.gold}" stroke-width="14"/>`,
      `<circle cx="48" cy="68" r="22" fill="none" stroke="${RETRO.ink}" stroke-width="2"/>`,
      `<circle cx="48" cy="68" r="13" fill="none" stroke="${RETRO.ink}" stroke-width="2"/>`,
      `<path d="M66 56 q14 -22 22 -28" fill="none" stroke="${RETRO.gold}" stroke-width="13" stroke-linecap="round"/>`,
      `<path d="M76 50 q12 -16 18 -22" fill="none" stroke="${RETRO.gold}" stroke-width="11" stroke-linecap="round"/>`,
      `<path d="M84 50 q10 -12 14 -16" fill="none" stroke="${RETRO.gold}" stroke-width="9" stroke-linecap="round"/>`
    ].join(""), { viewBox: [120, 120] }),
    mkSticker("waving-hand", "Waving hand", [
      `<path d="M40 102 q-12 -22 -10 -44 l4 -34 q1 -8 8 -8 q7 0 7 8 v22 l3 -30 q1 -8 8 -8 q7 0 7 8 l1 30 l4 -26 q1 -8 8 -7 q7 1 6 9 l-3 28 l8 -16 q4 -7 10 -3 q6 4 2 11 l-12 30 q-6 22 -14 30 z" fill="${RETRO.gold}" stroke="${RETRO.ink}" stroke-width="${OUT}" stroke-linejoin="round"/>`,
      `<path d="M82 22 q12 -4 18 4" fill="none" stroke="${RETRO.teal}" stroke-width="${LINE}" stroke-linecap="round"/>`,
      `<path d="M86 12 q14 -2 20 8" fill="none" stroke="${RETRO.teal}" stroke-width="${LINE}" stroke-linecap="round"/>`
    ].join(""), { viewBox: [120, 120] }),
    mkSticker("peace-sign", "Peace sign", [
      `<path d="M38 110 q-8 -26 -6 -46 l-4 -30 q-1 -9 7 -10 q8 -1 9 8 l4 26 l2 -2 l6 -40 q1 -9 9 -8 q8 1 7 10 l-4 36 l4 1 l8 -24 q3 -8 10 -5 q8 3 5 11 l-12 38 q-4 24 -8 35 z" fill="${RETRO.gold}" stroke="${RETRO.ink}" stroke-width="${OUT}" stroke-linejoin="round"/>`
    ].join(""), { viewBox: [120, 120] }),
    mkSticker("hundred-mark", "Hundred", [
      `<text x="60" y="74" text-anchor="middle" font-family="Georgia, serif" font-weight="700" font-size="48" fill="${RETRO.red}" stroke="${RETRO.ink}" stroke-width="2">100</text>`,
      `<line x1="20" y1="92" x2="100" y2="92" stroke="${RETRO.red}" stroke-width="${OUT}" stroke-linecap="round"/>`,
      `<line x1="24" y1="100" x2="96" y2="100" stroke="${RETRO.red}" stroke-width="${LINE}" stroke-linecap="round"/>`
    ].join(""), { viewBox: [120, 120] }),
    mkSticker("laughing-tears", "Laughing tears", [
      disc(60, 60, 46, RETRO.gold),
      `<path d="M34 44 q10 8 18 4" fill="none" stroke="${RETRO.ink}" stroke-width="${LINE}" stroke-linecap="round"/>`,
      `<path d="M86 44 q-10 8 -18 4" fill="none" stroke="${RETRO.ink}" stroke-width="${LINE}" stroke-linecap="round"/>`,
      `<path d="M34 66 q26 32 52 0 z" fill="${RETRO.red}" stroke="${RETRO.ink}" stroke-width="${LINE}" stroke-linejoin="round"/>`,
      `<path d="M28 56 q-6 14 -2 22 q8 -4 6 -18 z" fill="${RETRO.blue}" stroke="${RETRO.ink}" stroke-width="2"/>`,
      `<path d="M92 56 q6 14 2 22 q-8 -4 -6 -18 z" fill="${RETRO.blue}" stroke="${RETRO.ink}" stroke-width="2"/>`
    ].join(""), { viewBox: [120, 120] }),
    mkSticker("cool-shades", "Cool shades", [
      disc(60, 60, 46, RETRO.gold),
      `<path d="M30 48 h60 l-2 6 q-2 4 -8 4 H40 q-6 0 -8 -4 z" fill="${RETRO.navy}"/>`,
      `<rect x="30" y="50" width="26" height="18" rx="6" fill="${RETRO.ink}"/>`,
      `<rect x="64" y="50" width="26" height="18" rx="6" fill="${RETRO.ink}"/>`,
      `<line x1="56" y1="54" x2="64" y2="54" stroke="${RETRO.ink}" stroke-width="${LINE}"/>`,
      `<path d="M40 82 q20 14 40 0" fill="none" stroke="${RETRO.ink}" stroke-width="${OUT}" stroke-linecap="round"/>`
    ].join(""), { viewBox: [120, 120] }),
    mkSticker("sleepy-zzz", "Sleepy face", [
      disc(60, 60, 46, RETRO.plum),
      `<path d="M34 52 q8 -6 16 0" fill="none" stroke="${RETRO.ink}" stroke-width="${LINE}" stroke-linecap="round"/>`,
      `<path d="M58 54 q8 -6 16 0" fill="none" stroke="${RETRO.ink}" stroke-width="${LINE}" stroke-linecap="round"/>`,
      `<circle cx="48" cy="76" r="6" fill="${RETRO.pink}"/>`,
      `<circle cx="72" cy="76" r="6" fill="${RETRO.pink}"/>`,
      `<text x="86" y="40" text-anchor="middle" font-family="Georgia, serif" font-weight="700" font-size="20" fill="${RETRO.paper}" stroke="${RETRO.ink}" stroke-width="1">z</text>`,
      `<text x="98" y="26" text-anchor="middle" font-family="Georgia, serif" font-weight="700" font-size="14" fill="${RETRO.paper}" stroke="${RETRO.ink}" stroke-width="1">z</text>`
    ].join(""), { viewBox: [120, 120] })
  ]
};

// server/figures/stickers/transport.js
var wheel = (cx, cy, r = 12) => `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${RETRO.ink}" stroke="${RETRO.ink}" stroke-width="${LINE}"/><circle cx="${cx}" cy="${cy}" r="${r - 6}" fill="${RETRO.paper}" stroke="${RETRO.ink}" stroke-width="2"/>`;
var transport_default = {
  genre: "transport",
  label: "Transport",
  stickers: [
    mkSticker("classic-car", "Classic car", [
      `<path d="M12 78 L20 78 Q24 56 40 54 L52 42 Q56 38 64 38 H82 Q92 38 96 50 L100 54 Q112 56 112 70 V78 Z" fill="${RETRO.red}" stroke="${RETRO.ink}" stroke-width="${OUT}" stroke-linejoin="round"/>`,
      `<path d="M54 44 H80 Q86 44 88 52 H56 Z" fill="${RETRO.cream}" stroke="${RETRO.ink}" stroke-width="2"/>`,
      `<line x1="70" y1="44" x2="70" y2="52" stroke="${RETRO.ink}" stroke-width="2"/>`,
      `<rect x="100" y="58" width="10" height="7" rx="2" fill="${RETRO.gold}" stroke="${RETRO.ink}" stroke-width="2"/>`,
      wheel(38, 80, 13),
      wheel(90, 80, 13)
    ].join(""), { viewBox: [120, 100] }),
    mkSticker("double-decker-bus", "Double-decker bus", [
      `<rect x="14" y="20" width="92" height="68" rx="8" fill="${RETRO.red}" stroke="${RETRO.ink}" stroke-width="${OUT}"/>`,
      `<line x1="14" y1="54" x2="106" y2="54" stroke="${RETRO.ink}" stroke-width="${LINE}"/>`,
      `<rect x="24" y="28" width="18" height="16" rx="2" fill="${RETRO.cream}" stroke="${RETRO.ink}" stroke-width="2"/>`,
      `<rect x="48" y="28" width="18" height="16" rx="2" fill="${RETRO.cream}" stroke="${RETRO.ink}" stroke-width="2"/>`,
      `<rect x="72" y="28" width="18" height="16" rx="2" fill="${RETRO.cream}" stroke="${RETRO.ink}" stroke-width="2"/>`,
      `<rect x="24" y="62" width="18" height="16" rx="2" fill="${RETRO.cream}" stroke="${RETRO.ink}" stroke-width="2"/>`,
      `<rect x="48" y="62" width="18" height="16" rx="2" fill="${RETRO.cream}" stroke="${RETRO.ink}" stroke-width="2"/>`,
      `<rect x="78" y="60" width="20" height="22" rx="2" fill="${RETRO.navy}" stroke="${RETRO.ink}" stroke-width="2"/>`,
      wheel(38, 92, 11),
      wheel(84, 92, 11)
    ].join(""), { viewBox: [120, 108] }),
    mkSticker("bicycle", "Bicycle", [
      `<circle cx="32" cy="74" r="22" fill="none" stroke="${RETRO.ink}" stroke-width="${OUT}"/>`,
      `<circle cx="92" cy="74" r="22" fill="none" stroke="${RETRO.ink}" stroke-width="${OUT}"/>`,
      `<path d="M32 74 L56 74 L72 44 L92 74 M56 74 L72 44 M56 74 L66 46" fill="none" stroke="${RETRO.teal}" stroke-width="${LINE}" stroke-linejoin="round"/>`,
      `<line x1="62" y1="36" x2="80" y2="36" stroke="${RETRO.ink}" stroke-width="${LINE}" stroke-linecap="round"/>`,
      `<path d="M48 44 h14" stroke="${RETRO.ink}" stroke-width="${LINE}" stroke-linecap="round"/>`,
      `<circle cx="56" cy="74" r="5" fill="${RETRO.gold}" stroke="${RETRO.ink}" stroke-width="2"/>`
    ].join(""), { viewBox: [120, 104] }),
    mkSticker("motorbike", "Motorbike", [
      `<circle cx="30" cy="76" r="20" fill="none" stroke="${RETRO.ink}" stroke-width="${OUT}"/>`,
      `<circle cx="92" cy="76" r="20" fill="none" stroke="${RETRO.ink}" stroke-width="${OUT}"/>`,
      `<path d="M30 76 L52 76 L66 56 H86 L92 76" fill="none" stroke="${RETRO.ink}" stroke-width="${LINE}" stroke-linejoin="round"/>`,
      `<path d="M50 58 q12 -4 26 0 q-2 8 -12 8 h-2 q-10 0 -12 -8 z" fill="${RETRO.red}" stroke="${RETRO.ink}" stroke-width="${LINE}"/>`,
      `<path d="M40 56 h18" stroke="${RETRO.ink}" stroke-width="${LINE}" stroke-linecap="round"/>`,
      `<path d="M86 56 l8 -8" stroke="${RETRO.ink}" stroke-width="${LINE}" stroke-linecap="round"/>`
    ].join(""), { viewBox: [120, 104] }),
    mkSticker("steam-engine", "Steam engine", [
      `<rect x="14" y="48" width="88" height="40" rx="4" fill="${RETRO.green}" stroke="${RETRO.ink}" stroke-width="${OUT}"/>`,
      `<rect x="66" y="28" width="36" height="22" rx="4" fill="${RETRO.green}" stroke="${RETRO.ink}" stroke-width="${OUT}"/>`,
      `<rect x="76" y="34" width="18" height="12" rx="2" fill="${RETRO.cream}" stroke="${RETRO.ink}" stroke-width="2"/>`,
      `<rect x="22" y="20" width="14" height="14" fill="${RETRO.navy}" stroke="${RETRO.ink}" stroke-width="${LINE}"/>`,
      `<path d="M29 20 q-6 -12 6 -18" fill="none" stroke="${RETRO.paper}" stroke-width="${LINE}" stroke-linecap="round"/>`,
      `<circle cx="36" cy="80" r="8" fill="${RETRO.gold}" stroke="${RETRO.ink}" stroke-width="${LINE}"/>`,
      wheel(34, 92, 11),
      wheel(80, 92, 11)
    ].join(""), { viewBox: [120, 108] }),
    mkSticker("tram", "Tram", [
      `<rect x="22" y="24" width="76" height="64" rx="10" fill="${RETRO.teal}" stroke="${RETRO.ink}" stroke-width="${OUT}"/>`,
      `<rect x="30" y="34" width="60" height="22" rx="3" fill="${RETRO.cream}" stroke="${RETRO.ink}" stroke-width="2"/>`,
      `<line x1="60" y1="34" x2="60" y2="56" stroke="${RETRO.ink}" stroke-width="2"/>`,
      `<circle cx="42" cy="72" r="5" fill="${RETRO.gold}" stroke="${RETRO.ink}" stroke-width="2"/>`,
      `<circle cx="78" cy="72" r="5" fill="${RETRO.gold}" stroke="${RETRO.ink}" stroke-width="2"/>`,
      `<line x1="60" y1="24" x2="60" y2="10" stroke="${RETRO.ink}" stroke-width="${LINE}"/>`,
      `<line x1="40" y1="10" x2="80" y2="10" stroke="${RETRO.ink}" stroke-width="2"/>`,
      wheel(40, 92, 9),
      wheel(80, 92, 9)
    ].join(""), { viewBox: [120, 108] }),
    mkSticker("sailboat", "Sailboat", [
      `<path d="M16 84 H104 L92 102 H28 Z" fill="${RETRO.navy}" stroke="${RETRO.ink}" stroke-width="${OUT}" stroke-linejoin="round"/>`,
      `<line x1="60" y1="14" x2="60" y2="84" stroke="${RETRO.ink}" stroke-width="${OUT}" stroke-linecap="round"/>`,
      `<path d="M58 18 L24 78 H58 Z" fill="${RETRO.red}" stroke="${RETRO.ink}" stroke-width="${LINE}" stroke-linejoin="round"/>`,
      `<path d="M64 26 L94 78 H64 Z" fill="${RETRO.gold}" stroke="${RETRO.ink}" stroke-width="${LINE}" stroke-linejoin="round"/>`,
      `<path d="M16 96 q12 8 24 0 q12 -8 24 0 q12 8 24 0 q12 -8 16 0" fill="none" stroke="${RETRO.teal}" stroke-width="2" stroke-linecap="round"/>`
    ].join(""), { viewBox: [120, 110] }),
    mkSticker("helicopter", "Helicopter", [
      `<path d="M30 60 Q30 44 56 44 H78 Q98 44 100 64 Q100 78 84 80 H44 Q30 78 30 60 Z" fill="${RETRO.orange}" stroke="${RETRO.ink}" stroke-width="${OUT}" stroke-linejoin="round"/>`,
      `<path d="M98 62 H114 V70 H100 Z" fill="${RETRO.orange}" stroke="${RETRO.ink}" stroke-width="${LINE}" stroke-linejoin="round"/>`,
      `<circle cx="54" cy="62" r="11" fill="${RETRO.cream}" stroke="${RETRO.ink}" stroke-width="${LINE}"/>`,
      `<line x1="56" y1="44" x2="56" y2="26" stroke="${RETRO.ink}" stroke-width="${LINE}"/>`,
      `<line x1="18" y1="24" x2="100" y2="24" stroke="${RETRO.ink}" stroke-width="${OUT}" stroke-linecap="round"/>`,
      `<line x1="110" y1="58" x2="118" y2="74" stroke="${RETRO.ink}" stroke-width="${LINE}" stroke-linecap="round"/>`,
      `<path d="M44 80 H86 M50 80 v8 M80 80 v8 M46 88 H84" fill="none" stroke="${RETRO.ink}" stroke-width="${LINE}" stroke-linecap="round"/>`
    ].join(""), { viewBox: [120, 100] }),
    mkSticker("vintage-scooter", "Vintage scooter", [
      `<circle cx="30" cy="80" r="16" fill="none" stroke="${RETRO.ink}" stroke-width="${OUT}"/>`,
      `<circle cx="94" cy="80" r="16" fill="none" stroke="${RETRO.ink}" stroke-width="${OUT}"/>`,
      `<path d="M30 80 Q34 50 56 50 Q74 50 78 64 Q82 80 94 80 Q88 56 78 50 L74 30 H64" fill="${RETRO.teal}" stroke="${RETRO.ink}" stroke-width="${OUT}" stroke-linejoin="round"/>`,
      `<path d="M62 30 h16" stroke="${RETRO.ink}" stroke-width="${LINE}" stroke-linecap="round"/>`,
      `<rect x="50" y="42" width="22" height="9" rx="4" fill="${RETRO.cream}" stroke="${RETRO.ink}" stroke-width="2"/>`
    ].join(""), { viewBox: [120, 104] }),
    mkSticker("delivery-truck", "Delivery truck", [
      `<rect x="12" y="42" width="58" height="44" rx="4" fill="${RETRO.gold}" stroke="${RETRO.ink}" stroke-width="${OUT}"/>`,
      `<path d="M70 54 H92 L106 70 V86 H70 Z" fill="${RETRO.red}" stroke="${RETRO.ink}" stroke-width="${OUT}" stroke-linejoin="round"/>`,
      `<rect x="76" y="58" width="16" height="12" rx="2" fill="${RETRO.cream}" stroke="${RETRO.ink}" stroke-width="2"/>`,
      `<rect x="22" y="52" width="38" height="14" rx="2" fill="${RETRO.cream}" stroke="${RETRO.ink}" stroke-width="2"/>`,
      wheel(34, 90, 12),
      wheel(90, 90, 12)
    ].join(""), { viewBox: [120, 108] }),
    mkSticker("taxi-cab", "Taxi", [
      `<path d="M10 80 L18 80 Q22 58 38 56 L50 44 Q54 40 62 40 H80 Q90 40 94 52 L98 56 Q110 58 110 72 V80 Z" fill="${RETRO.gold}" stroke="${RETRO.ink}" stroke-width="${OUT}" stroke-linejoin="round"/>`,
      `<path d="M52 46 H78 Q84 46 86 54 H54 Z" fill="${RETRO.cream}" stroke="${RETRO.ink}" stroke-width="2"/>`,
      `<rect x="48" y="28" width="24" height="12" rx="2" fill="${RETRO.cream}" stroke="${RETRO.ink}" stroke-width="${LINE}"/>`,
      `<text x="60" y="38" text-anchor="middle" font-family="Georgia, serif" font-weight="700" font-size="9" fill="${RETRO.ink}">TAXI</text>`,
      `<rect x="22" y="64" width="76" height="8" fill="${RETRO.ink}"/>`,
      `<rect x="26" y="65" width="8" height="6" fill="${RETRO.paper}"/>`,
      `<rect x="42" y="65" width="8" height="6" fill="${RETRO.paper}"/>`,
      `<rect x="58" y="65" width="8" height="6" fill="${RETRO.paper}"/>`,
      wheel(38, 82, 13),
      wheel(88, 82, 13)
    ].join(""), { viewBox: [120, 100] }),
    mkSticker("tractor", "Tractor", [
      `<circle cx="36" cy="80" r="24" fill="${RETRO.ink}" stroke="${RETRO.ink}" stroke-width="2"/>`,
      `<circle cx="36" cy="80" r="13" fill="${RETRO.gold}" stroke="${RETRO.ink}" stroke-width="${LINE}"/>`,
      `<circle cx="92" cy="86" r="14" fill="${RETRO.ink}" stroke="${RETRO.ink}" stroke-width="2"/>`,
      `<circle cx="92" cy="86" r="7" fill="${RETRO.gold}" stroke="${RETRO.ink}" stroke-width="2"/>`,
      `<path d="M60 56 H88 Q96 56 98 70 V82 H72 L66 70 H60 Z" fill="${RETRO.green}" stroke="${RETRO.ink}" stroke-width="${OUT}" stroke-linejoin="round"/>`,
      `<rect x="58" y="36" width="22" height="22" rx="2" fill="${RETRO.green}" stroke="${RETRO.ink}" stroke-width="${OUT}"/>`,
      `<rect x="62" y="40" width="14" height="12" rx="2" fill="${RETRO.cream}" stroke="${RETRO.ink}" stroke-width="2"/>`,
      `<rect x="50" y="30" width="8" height="10" fill="${RETRO.navy}" stroke="${RETRO.ink}" stroke-width="2"/>`
    ].join(""), { viewBox: [120, 108] }),
    mkSticker("submarine", "Submarine", [
      `<ellipse cx="58" cy="64" rx="48" ry="24" fill="${RETRO.gold}" stroke="${RETRO.ink}" stroke-width="${OUT}"/>`,
      `<rect x="50" y="26" width="20" height="20" rx="4" fill="${RETRO.gold}" stroke="${RETRO.ink}" stroke-width="${OUT}"/>`,
      `<line x1="60" y1="26" x2="60" y2="12" stroke="${RETRO.ink}" stroke-width="${LINE}" stroke-linecap="round"/>`,
      `<path d="M60 12 h10" stroke="${RETRO.ink}" stroke-width="${LINE}" stroke-linecap="round"/>`,
      `<circle cx="40" cy="64" r="8" fill="${RETRO.cream}" stroke="${RETRO.ink}" stroke-width="${LINE}"/>`,
      `<circle cx="66" cy="64" r="8" fill="${RETRO.cream}" stroke="${RETRO.ink}" stroke-width="${LINE}"/>`,
      `<path d="M106 50 l12 -8 v44 l-12 -8 z" fill="${RETRO.red}" stroke="${RETRO.ink}" stroke-width="${LINE}" stroke-linejoin="round"/>`
    ].join(""), { viewBox: [120, 108] }),
    mkSticker("hot-rod", "Hot rod", [
      `<path d="M8 80 L16 80 Q18 64 34 62 L48 50 Q52 46 60 46 H78 Q92 46 96 60 L110 64 Q116 66 116 76 V80 Z" fill="${RETRO.red}" stroke="${RETRO.ink}" stroke-width="${OUT}" stroke-linejoin="round"/>`,
      `<path d="M52 52 H76 Q82 52 84 60 H54 Z" fill="${RETRO.navy}" stroke="${RETRO.ink}" stroke-width="2"/>`,
      `<path d="M96 54 q14 -2 14 -10 q-10 -2 -16 4 z" fill="${RETRO.orange}" stroke="${RETRO.ink}" stroke-width="2" stroke-linejoin="round"/>`,
      `<rect x="22" y="40" width="6" height="14" fill="${RETRO.ink}"/>`,
      `<rect x="32" y="38" width="6" height="16" fill="${RETRO.ink}"/>`,
      wheel(34, 82, 14),
      wheel(94, 82, 16)
    ].join(""), { viewBox: [120, 100] })
  ]
};

// server/figures/stickers/history.js
var history_default = {
  genre: "history",
  label: "History",
  stickers: [
    mkSticker("ancient-scroll", "Scroll", [
      `<rect x="28" y="30" width="64" height="56" fill="${RETRO.paper}" stroke="${RETRO.ink}" stroke-width="${LINE}"/>`,
      `<path d="M28 30 q-14 0 -14 12 q0 12 14 12 Z" fill="${RETRO.cream}" stroke="${RETRO.ink}" stroke-width="${OUT}"/>`,
      `<path d="M92 30 q14 0 14 12 q0 12 -14 12 Z" fill="${RETRO.cream}" stroke="${RETRO.ink}" stroke-width="${OUT}"/>`,
      `<path d="M28 86 q-14 0 -14 12 q0 12 14 12 Z" fill="${RETRO.cream}" stroke="${RETRO.ink}" stroke-width="${OUT}"/>`,
      `<path d="M92 86 q14 0 14 12 q0 12 -14 12 Z" fill="${RETRO.cream}" stroke="${RETRO.ink}" stroke-width="${OUT}"/>`,
      `<rect x="14" y="86" width="92" height="12" fill="${RETRO.cream}" stroke="${RETRO.ink}" stroke-width="${OUT}"/>`,
      `<rect x="14" y="30" width="92" height="12" fill="${RETRO.cream}" stroke="${RETRO.ink}" stroke-width="${OUT}"/>`,
      `<line x1="40" y1="54" x2="80" y2="54" stroke="${RETRO.ink}" stroke-width="2"/>`,
      `<line x1="40" y1="64" x2="80" y2="64" stroke="${RETRO.ink}" stroke-width="2"/>`,
      `<line x1="40" y1="74" x2="68" y2="74" stroke="${RETRO.ink}" stroke-width="2"/>`
    ].join(""), { viewBox: [120, 128] }),
    mkSticker("hourglass", "Hourglass", [
      `<rect x="28" y="14" width="64" height="10" rx="3" fill="${RETRO.brown}" stroke="${RETRO.ink}" stroke-width="${OUT}"/>`,
      `<rect x="28" y="96" width="64" height="10" rx="3" fill="${RETRO.brown}" stroke="${RETRO.ink}" stroke-width="${OUT}"/>`,
      `<path d="M36 24 L84 24 L64 60 L84 96 L36 96 L56 60 Z" fill="${RETRO.paper}" stroke="${RETRO.ink}" stroke-width="${OUT}" stroke-linejoin="round"/>`,
      `<path d="M44 30 L76 30 L62 56 L58 56 Z" fill="${RETRO.gold}"/>`,
      `<path d="M52 86 L68 86 L64 70 L56 70 Z" fill="${RETRO.gold}"/>`,
      `<line x1="60" y1="58" x2="60" y2="74" stroke="${RETRO.gold}" stroke-width="2"/>`
    ].join(""), { viewBox: [120, 120] }),
    mkSticker("sundial", "Sundial", [
      disc(60, 70, 42, RETRO.cream),
      `<path d="M60 70 L60 30 L78 70 Z" fill="${RETRO.navy}" stroke="${RETRO.ink}" stroke-width="${LINE}" stroke-linejoin="round"/>`,
      `<line x1="60" y1="36" x2="60" y2="30" stroke="${RETRO.ink}" stroke-width="2"/>`,
      `<line x1="60" y1="100" x2="60" y2="106" stroke="${RETRO.ink}" stroke-width="2"/>`,
      `<line x1="26" y1="70" x2="20" y2="70" stroke="${RETRO.ink}" stroke-width="2"/>`,
      `<line x1="94" y1="70" x2="100" y2="70" stroke="${RETRO.ink}" stroke-width="2"/>`,
      `<line x1="36" y1="46" x2="32" y2="42" stroke="${RETRO.ink}" stroke-width="2"/>`,
      `<line x1="84" y1="46" x2="88" y2="42" stroke="${RETRO.ink}" stroke-width="2"/>`,
      `<circle cx="60" cy="70" r="5" fill="${RETRO.gold}" stroke="${RETRO.ink}" stroke-width="2"/>`
    ].join(""), { viewBox: [120, 120] }),
    mkSticker("royal-crown", "Royal crown", [
      `<path d="M22 84 L22 44 L40 60 L60 32 L80 60 L98 44 L98 84 Z" fill="${RETRO.gold}" stroke="${RETRO.ink}" stroke-width="${OUT}" stroke-linejoin="round"/>`,
      `<rect x="22" y="84" width="76" height="14" rx="3" fill="${RETRO.gold}" stroke="${RETRO.ink}" stroke-width="${OUT}"/>`,
      `<circle cx="22" cy="42" r="6" fill="${RETRO.red}" stroke="${RETRO.ink}" stroke-width="2"/>`,
      `<circle cx="60" cy="30" r="6" fill="${RETRO.red}" stroke="${RETRO.ink}" stroke-width="2"/>`,
      `<circle cx="98" cy="42" r="6" fill="${RETRO.red}" stroke="${RETRO.ink}" stroke-width="2"/>`,
      `<circle cx="60" cy="91" r="5" fill="${RETRO.teal}" stroke="${RETRO.ink}" stroke-width="2"/>`,
      `<circle cx="40" cy="91" r="4" fill="${RETRO.plum}" stroke="${RETRO.ink}" stroke-width="2"/>`,
      `<circle cx="80" cy="91" r="4" fill="${RETRO.plum}" stroke="${RETRO.ink}" stroke-width="2"/>`
    ].join(""), { viewBox: [120, 112] }),
    mkSticker("sword-shield", "Sword & shield", [
      `<path d="M30 24 q30 -8 60 0 q4 40 -30 70 q-34 -30 -30 -70 Z" fill="${RETRO.navy}" stroke="${RETRO.ink}" stroke-width="${OUT}" stroke-linejoin="round"/>`,
      `<line x1="60" y1="30" x2="60" y2="86" stroke="${RETRO.gold}" stroke-width="${LINE}"/>`,
      `<line x1="38" y1="52" x2="82" y2="52" stroke="${RETRO.gold}" stroke-width="${LINE}"/>`,
      `<line x1="92" y1="18" x2="64" y2="46" stroke="${RETRO.ink}" stroke-width="${OUT}" stroke-linecap="round"/>`,
      `<path d="M92 18 l8 -4 -4 8 Z" fill="${RETRO.gold}" stroke="${RETRO.ink}" stroke-width="2"/>`,
      `<line x1="58" y1="40" x2="74" y2="56" stroke="${RETRO.brown}" stroke-width="${OUT}" stroke-linecap="round"/>`
    ].join(""), { viewBox: [120, 104] }),
    mkSticker("knight-helmet", "Knight helmet", [
      `<path d="M30 30 q30 -16 60 0 q6 40 -6 60 l-48 0 q-12 -20 -6 -60 Z" fill="${RETRO.blue}" stroke="${RETRO.ink}" stroke-width="${OUT}" stroke-linejoin="round"/>`,
      `<rect x="34" y="44" width="52" height="8" rx="3" fill="${RETRO.ink}"/>`,
      `<line x1="44" y1="56" x2="44" y2="84" stroke="${RETRO.ink}" stroke-width="${LINE}"/>`,
      `<line x1="54" y1="56" x2="54" y2="84" stroke="${RETRO.ink}" stroke-width="${LINE}"/>`,
      `<line x1="64" y1="56" x2="64" y2="84" stroke="${RETRO.ink}" stroke-width="${LINE}"/>`,
      `<line x1="74" y1="56" x2="74" y2="84" stroke="${RETRO.ink}" stroke-width="${LINE}"/>`,
      `<path d="M58 30 q4 -16 14 -20 q-2 14 -8 20 Z" fill="${RETRO.red}" stroke="${RETRO.ink}" stroke-width="2" stroke-linejoin="round"/>`
    ].join(""), { viewBox: [120, 100] }),
    mkSticker("greek-amphora", "Amphora", [
      `<path d="M44 24 L76 24 L74 36 q22 12 18 38 q-4 30 -32 30 q-28 0 -32 -30 q-4 -26 18 -38 Z" fill="${RETRO.orange}" stroke="${RETRO.ink}" stroke-width="${OUT}" stroke-linejoin="round"/>`,
      `<path d="M44 30 q-16 4 -14 18 q2 8 12 6" fill="none" stroke="${RETRO.ink}" stroke-width="${LINE}" stroke-linecap="round"/>`,
      `<path d="M76 30 q16 4 14 18 q-2 8 -12 6" fill="none" stroke="${RETRO.ink}" stroke-width="${LINE}" stroke-linecap="round"/>`,
      `<line x1="36" y1="58" x2="84" y2="58" stroke="${RETRO.ink}" stroke-width="2"/>`,
      `<line x1="34" y1="72" x2="86" y2="72" stroke="${RETRO.ink}" stroke-width="2"/>`,
      `<path d="M48 64 l6 -6 6 6 6 -6 6 6" fill="none" stroke="${RETRO.navy}" stroke-width="2"/>`,
      `<rect x="42" y="18" width="36" height="8" rx="2" fill="${RETRO.orange}" stroke="${RETRO.ink}" stroke-width="${LINE}"/>`
    ].join(""), { viewBox: [120, 120] }),
    mkSticker("ammonite-fossil", "Ammonite", [
      disc(60, 60, 46, RETRO.cream),
      `<path d="M60 60 m0 -2 a2 2 0 1 1 -2 2 a8 8 0 1 0 8 -8 a16 16 0 1 0 16 16 a26 26 0 1 0 -26 26 a36 36 0 1 0 36 -36" fill="none" stroke="${RETRO.brown}" stroke-width="${OUT}" stroke-linecap="round"/>`,
      `<line x1="60" y1="60" x2="38" y2="42" stroke="${RETRO.brown}" stroke-width="2"/>`,
      `<line x1="60" y1="60" x2="84" y2="52" stroke="${RETRO.brown}" stroke-width="2"/>`,
      `<line x1="60" y1="60" x2="80" y2="84" stroke="${RETRO.brown}" stroke-width="2"/>`
    ].join(""), { viewBox: [120, 120] }),
    mkSticker("gramophone", "Gramophone", [
      `<path d="M50 70 L40 30 q40 -22 56 8 Z" fill="${RETRO.gold}" stroke="${RETRO.ink}" stroke-width="${OUT}" stroke-linejoin="round"/>`,
      `<ellipse cx="68" cy="28" rx="30" ry="12" fill="${RETRO.gold}" stroke="${RETRO.ink}" stroke-width="${OUT}" transform="rotate(20 68 28)"/>`,
      `<line x1="50" y1="70" x2="46" y2="92" stroke="${RETRO.brown}" stroke-width="${OUT}" stroke-linecap="round"/>`,
      `<rect x="26" y="90" width="56" height="14" rx="4" fill="${RETRO.brown}" stroke="${RETRO.ink}" stroke-width="${OUT}"/>`,
      `<circle cx="54" cy="97" r="14" fill="${RETRO.navy}" stroke="${RETRO.ink}" stroke-width="${LINE}"/>`,
      `<circle cx="54" cy="97" r="3" fill="${RETRO.paper}"/>`
    ].join(""), { viewBox: [120, 116] }),
    mkSticker("typewriter", "Typewriter", [
      `<rect x="22" y="58" width="76" height="34" rx="5" fill="${RETRO.navy}" stroke="${RETRO.ink}" stroke-width="${OUT}"/>`,
      `<rect x="34" y="22" width="52" height="22" rx="3" fill="${RETRO.paper}" stroke="${RETRO.ink}" stroke-width="${OUT}"/>`,
      `<line x1="34" y1="22" x2="34" y2="14" stroke="${RETRO.ink}" stroke-width="2"/>`,
      `<line x1="86" y1="22" x2="86" y2="14" stroke="${RETRO.ink}" stroke-width="2"/>`,
      `<rect x="40" y="44" width="40" height="14" rx="2" fill="${RETRO.red}" stroke="${RETRO.ink}" stroke-width="${LINE}"/>`,
      `<circle cx="34" cy="76" r="4" fill="${RETRO.cream}" stroke="${RETRO.ink}" stroke-width="2"/>`,
      `<circle cx="46" cy="76" r="4" fill="${RETRO.cream}" stroke="${RETRO.ink}" stroke-width="2"/>`,
      `<circle cx="58" cy="76" r="4" fill="${RETRO.cream}" stroke="${RETRO.ink}" stroke-width="2"/>`,
      `<circle cx="70" cy="76" r="4" fill="${RETRO.cream}" stroke="${RETRO.ink}" stroke-width="2"/>`,
      `<rect x="40" y="84" width="40" height="6" rx="3" fill="${RETRO.cream}" stroke="${RETRO.ink}" stroke-width="2"/>`
    ].join(""), { viewBox: [120, 100] }),
    mkSticker("quill-inkpot", "Quill & ink", [
      `<path d="M88 16 q-40 14 -56 56 q-2 6 4 4 q40 -22 54 -56 q2 -6 -2 -4 Z" fill="${RETRO.teal}" stroke="${RETRO.ink}" stroke-width="${OUT}" stroke-linejoin="round"/>`,
      `<path d="M52 60 q14 -22 34 -40" fill="none" stroke="${RETRO.ink}" stroke-width="2"/>`,
      `<line x1="40" y1="72" x2="34" y2="84" stroke="${RETRO.ink}" stroke-width="${LINE}" stroke-linecap="round"/>`,
      `<path d="M24 78 L60 78 L56 104 L28 104 Z" fill="${RETRO.navy}" stroke="${RETRO.ink}" stroke-width="${OUT}" stroke-linejoin="round"/>`,
      `<ellipse cx="42" cy="78" rx="18" ry="6" fill="${RETRO.blue}" stroke="${RETRO.ink}" stroke-width="${LINE}"/>`
    ].join(""), { viewBox: [120, 116] }),
    mkSticker("treasure-chest", "Treasure chest", [
      `<rect x="20" y="54" width="80" height="46" rx="4" fill="${RETRO.brown}" stroke="${RETRO.ink}" stroke-width="${OUT}"/>`,
      `<path d="M20 54 q0 -24 40 -24 q40 0 40 24 Z" fill="${RETRO.brown}" stroke="${RETRO.ink}" stroke-width="${OUT}" stroke-linejoin="round"/>`,
      `<line x1="20" y1="54" x2="100" y2="54" stroke="${RETRO.ink}" stroke-width="${LINE}"/>`,
      `<rect x="34" y="40" width="8" height="60" fill="${RETRO.gold}" stroke="${RETRO.ink}" stroke-width="2"/>`,
      `<rect x="78" y="40" width="8" height="60" fill="${RETRO.gold}" stroke="${RETRO.ink}" stroke-width="2"/>`,
      `<rect x="52" y="60" width="16" height="18" rx="2" fill="${RETRO.gold}" stroke="${RETRO.ink}" stroke-width="${LINE}"/>`,
      `<circle cx="60" cy="67" r="3" fill="${RETRO.ink}"/>`,
      `<circle cx="44" cy="42" r="5" fill="${RETRO.gold}" stroke="${RETRO.ink}" stroke-width="2"/>`,
      `<circle cx="76" cy="42" r="5" fill="${RETRO.gold}" stroke="${RETRO.ink}" stroke-width="2"/>`
    ].join(""), { viewBox: [120, 110] })
  ]
};

// server/figures/stickers.js
var MODULES = [
  travel_default,
  monuments_default,
  science_default,
  paintings_default,
  flora_fauna_default,
  general_default,
  food_drink_default,
  sport_games_default,
  music_default,
  medical_anatomy_default,
  space_default,
  weather_nature_default,
  tech_default,
  emotions_reactions_default,
  transport_default,
  history_default
];
var STICKER_GENRE_IDS = MODULES.map((m) => m.genre);
var STICKER_GENRE_LABELS = Object.fromEntries(MODULES.map((m) => [m.genre, m.label]));
var STICKER_GENRES = ["travel", "monuments", "science", "paintings", "flora-fauna", "general"];
function listStickers() {
  const out = [];
  const seen = /* @__PURE__ */ new Set();
  for (const mod of MODULES) {
    const list = Array.isArray(mod && mod.stickers) ? mod.stickers : [];
    for (const s of list) {
      if (!s || !s.id || seen.has(s.id)) continue;
      seen.add(s.id);
      out.push({
        id: s.id,
        name: s.name,
        genre: mod.genre,
        viewBox: viewBoxOf(s.svg),
        svg: s.svg
      });
    }
  }
  return out;
}
function getSticker(id) {
  return listStickers().find((s) => s.id === id) || null;
}
function viewBoxOf(svg2) {
  const m = /viewBox="0 0 ([\d.]+) ([\d.]+)"/.exec(String(svg2 || ""));
  return m ? [Number(m[1]), Number(m[2])] : [120, 120];
}

// server/templates/blank.json
var blank_default = {
  id: "blank",
  name: "Blank",
  description: "An empty canvas.",
  doc: {
    version: 1,
    blocks: [
      { id: "t1", type: "text", html: "" }
    ]
  }
};

// server/templates/case-discussion.json
var case_discussion_default = {
  id: "case-discussion",
  name: "Case discussion",
  description: "De-identified case for discussion: what happened, the decision, what you'd weigh up.",
  doc: {
    version: 1,
    blocks: [
      { id: "t1", type: "heading", level: 2, text: "The case" },
      { id: "t2", type: "text", html: "Set the scene in two or three sentences. No identifiers \u2014 age range and sex only if they change the decision." },
      { id: "t3", type: "heading", level: 3, text: "What was found" },
      { id: "t4", type: "text", html: "Examination and imaging in plain terms. Add annotated images via a gallery block if a picture carries the point." },
      { id: "t5", type: "heading", level: 3, text: "The decision" },
      { id: "t6", type: "text", html: "What was done, and the reasoning. Name the real fork in the road \u2014 the option you did not take and why." },
      { id: "t7", type: "heading", level: 3, text: "What I'd weigh up" },
      { id: "t8", type: "text", html: "The trade-offs a reader should sit with. Where would a reasonable surgeon disagree?" },
      { id: "t9", type: "divider" },
      { id: "t10", type: "text", html: "Outcome at follow-up, and the one thing this case taught." }
    ]
  }
};

// server/templates/clinical-case.json
var clinical_case_default = {
  id: "clinical-case",
  name: "Clinical Case",
  description: "De-identified teaching case: presentation, imaging, management, outcome.",
  doc: {
    version: 1,
    blocks: [
      { id: "t1", type: "heading", level: 2, text: "Case" },
      { id: "t2", type: "heading", level: 3, text: "Presentation" },
      { id: "t3", type: "text", html: "Describe the presentation \u2014 no identifiers. Age range and sex only if relevant to the clinical point." },
      { id: "t4", type: "heading", level: 3, text: "Imaging" },
      { id: "t5", type: "text", html: "Summarise the key imaging findings. Add annotated images via the gallery block if useful." },
      { id: "t6", type: "heading", level: 3, text: "Management" },
      { id: "t7", type: "text", html: "What was done and why \u2014 technique, decision rationale, any intra-operative findings." },
      { id: "t8", type: "heading", level: 3, text: "Outcome" },
      { id: "t9", type: "text", html: "Result at follow-up. What the case illustrates or teaches." }
    ]
  }
};

// server/templates/essay.json
var essay_default = {
  id: "essay",
  name: "Essay",
  description: "A structured argument or reflection with subheadings and a closing.",
  doc: {
    version: 1,
    blocks: [
      { id: "t1", type: "heading", level: 2, text: "Working title" },
      { id: "t2", type: "text", html: "Open with the central idea, plainly. One or two sentences is enough." },
      { id: "t3", type: "heading", level: 3, text: "First point" },
      { id: "t4", type: "text", html: "State the point. Add evidence or a concrete example." },
      { id: "t5", type: "heading", level: 3, text: "Second point" },
      { id: "t6", type: "text", html: "State the point. Keep it distinct from the first." },
      { id: "t7", type: "divider" },
      { id: "t8", type: "text", html: "Close with what follows from the argument \u2014 a practical implication, an open question, or a clear position." }
    ]
  }
};

// server/templates/evidence-review.json
var evidence_review_default = {
  id: "evidence-review",
  name: "Evidence review",
  description: "Walk through the evidence on a question: what it says, how good it is, what to do.",
  doc: {
    version: 1,
    blocks: [
      { id: "t1", type: "heading", level: 2, text: "The question" },
      { id: "t2", type: "text", html: "State the clinical question in one line. Why it matters, and to whom." },
      { id: "t3", type: "heading", level: 3, text: "What the evidence says" },
      { id: "t4", type: "text", html: "Summarise the key findings. Cite the primary papers with the references manager rather than naming them inline." },
      { id: "t5", type: "heading", level: 3, text: "How good is it?" },
      { id: "t6", type: "text", html: "Study type, sample size, follow-up, bias. Be honest about where the evidence is thin or conflicted." },
      { id: "t7", type: "quote", html: "Pull out the single most quotable result or effect size." },
      { id: "t8", type: "heading", level: 3, text: "What I'd take from it" },
      { id: "t9", type: "text", html: "The practical bottom line. What changes, what stays the same, and what is still unknown." }
    ]
  }
};

// server/templates/interactive.json
var interactive_default = {
  id: "interactive",
  name: "Interactive",
  description: "Post with an embedded interactive playground (SVG, canvas, or controls).",
  doc: {
    version: 1,
    blocks: [
      { id: "t1", type: "text", html: "Describe what the interactive below demonstrates. One or two sentences." },
      { id: "t2", type: "raw", content: '<div class="playground">\n  <!-- Put SVG/canvas + controls here. No blank lines inside this block; keep indent under 4 spaces. -->\n</div>\n<script type="application/pg">\n  // Playground script runs after each view transition.\n  // Access elements via document.querySelector inside .playground.\n<\/script>' },
      { id: "t3", type: "text", html: "Explain the key point the playground illustrates, or note how to interact with it." }
    ]
  }
};

// server/templates/photo-story.json
var photo_story_default = {
  id: "photo-story",
  name: "Photo Story",
  description: "Photo-led post: brief intro, gallery, then a short caption or reflection.",
  doc: {
    version: 1,
    blocks: [
      { id: "t1", type: "text", html: "Brief intro \u2014 one sentence on what the photos are about." },
      { id: "t2", type: "gallery", images: [] },
      { id: "t3", type: "text", html: "What the images show or why they matter. Keep it short." }
    ]
  }
};

// server/templates/technique-explainer.json
var technique_explainer_default = {
  id: "technique-explainer",
  name: "Technique explainer",
  description: "Explain a technique step by step: when, the steps, the pitfalls, the tips.",
  doc: {
    version: 1,
    blocks: [
      { id: "t1", type: "heading", level: 2, text: "The technique" },
      { id: "t2", type: "text", html: "What it is and when you'd reach for it. One paragraph." },
      { id: "t3", type: "heading", level: 3, text: "Before you start" },
      { id: "t4", type: "text", html: "Setup, positioning, kit. The things that make the rest go smoothly." },
      { id: "t5", type: "heading", level: 3, text: "The steps" },
      { id: "t6", type: "text", html: "Walk through it in order. Add a figure block for any step a diagram explains faster than words." },
      { id: "t7", type: "heading", level: 3, text: "Pitfalls" },
      { id: "t8", type: "text", html: "Where it goes wrong, and how you'd recover. The honest failure modes." },
      { id: "t9", type: "heading", level: 3, text: "Tips" },
      { id: "t10", type: "text", html: "The small things that separate a tidy result from a rough one." }
    ]
  }
};

// server/templates/travel-note.json
var travel_note_default = {
  id: "travel-note",
  name: "Travel Note",
  description: "A short note from a place \u2014 brief lead, photos, and a reflection.",
  doc: {
    version: 1,
    blocks: [
      { id: "t1", type: "heading", level: 2, text: "Place and date" },
      { id: "t2", type: "text", html: "Set the scene in a sentence or two. Where, when, why." },
      { id: "t3", type: "gallery", images: [] },
      { id: "t4", type: "text", html: "What stood out. One specific detail beats a list of everything." },
      { id: "t5", type: "gallery", images: [] }
    ]
  }
};

// studio-app/core/templates.js
var all2 = [blank_default, case_discussion_default, clinical_case_default, essay_default, evidence_review_default, interactive_default, photo_story_default, technique_explainer_default, travel_note_default];
all2.sort((a, b) => {
  if (a.id === "blank") return -1;
  if (b.id === "blank") return 1;
  return (a.name || "").localeCompare(b.name || "");
});
var templates = { list: () => all2 };

// studio-app/app.js
function buildApi() {
  const gh = makeGithub(config.getGithub());
  const ai = makeAi(config);
  const posts = makePosts(gh);
  const router = makeRouter({ posts, partner: partner_exports, ai, storage, studio: studio_exports, playgrounds: playgrounds_exports, figures: registry_exports, stencils: stencils_exports, stickers: stickers_exports, blocks: blocks_exports, prepublish: prepublish_exports, templates, config, gh });
  return router.api;
}
var remote = makeRemote(() => config.getRemoteHelm());
function refreshRemote() {
  if (typeof window === "undefined") return;
  window.__studioRemote = { active: config.isRemoteHelm(), request: remote.request, test: remote.test };
}
function refresh() {
  if (typeof window === "undefined") return;
  window.__studioApi = buildApi();
  window.__studioApiReady = true;
  refreshRemote();
}
function renderOnboarding() {
  if (typeof document === "undefined" || document.getElementById("byok-overlay")) return;
  const c = config.all();
  const r = config.getRemoteHelm();
  const startMode = config.isRemoteHelm() ? "remote" : "byok";
  const ov = document.createElement("div");
  ov.id = "byok-overlay";
  ov.innerHTML = `
  <style>
    #byok-overlay{position:fixed;inset:0;z-index:9999;background:#04060c;display:grid;place-items:center;padding:1rem;
      font:15px/1.5 'Inter',system-ui,sans-serif;color:#f4f7fd;-webkit-backdrop-filter:blur(8px);backdrop-filter:blur(8px)}
    #byok-overlay .bc{width:min(440px,94vw);max-height:94vh;overflow:auto;background:linear-gradient(180deg,#0f1730,#0b1120);border:1px solid rgba(140,160,200,.18);
      border-radius:18px;padding:1.4rem 1.5rem;box-shadow:0 24px 70px rgba(0,0,0,.6)}
    #byok-overlay h2{font:700 1.25rem 'Space Grotesk',system-ui;margin:0 0 .2rem}
    #byok-overlay h2 b{background:linear-gradient(120deg,#2dd4bf,#22d3ee 55%,#818cf8);-webkit-background-clip:text;background-clip:text;color:transparent}
    #byok-overlay p{color:#aebbd2;font-size:.86rem;margin:.1rem 0 1rem}
    #byok-overlay label{display:block;font:600 .68rem 'Space Grotesk',system-ui;letter-spacing:.08em;text-transform:uppercase;color:#aebbd2;margin:.7rem 0 .25rem}
    #byok-overlay input,#byok-overlay select{width:100%;background:#080c16;border:1px solid rgba(140,160,200,.18);border-radius:10px;color:#f4f7fd;padding:.6em .7em;font:inherit}
    #byok-overlay input:focus,#byok-overlay select:focus{outline:none;border-color:#22d3ee;box-shadow:0 0 0 3px rgba(34,211,238,.22)}
    #byok-overlay .row{display:flex;gap:.5rem}#byok-overlay .row>*{flex:1}
    #byok-overlay button{width:100%;margin-top:1.1rem;border:0;border-radius:12px;padding:.8em;font:700 1rem 'Space Grotesk',system-ui;
      color:#042018;background:linear-gradient(95deg,#2dd4bf,#22d3ee);cursor:pointer}
    #byok-overlay button.ghost{margin-top:.6rem;background:transparent;border:1px solid rgba(140,160,200,.3);color:#aebbd2}
    #byok-overlay .hint{font-size:.74rem;color:#6f7e98;margin-top:.6rem}
    #byok-overlay .msg{font-size:.8rem;margin-top:.6rem;min-height:1em}
    #byok-overlay .modes{display:flex;gap:.5rem;margin:.2rem 0 1rem}
    #byok-overlay .modes button{flex:1;margin:0;padding:.65em .4em;font:700 .82rem 'Space Grotesk',system-ui;border-radius:12px;cursor:pointer;
      background:#080c16;border:1px solid rgba(140,160,200,.22);color:#aebbd2}
    #byok-overlay .modes button[aria-pressed="true"]{background:linear-gradient(95deg,rgba(45,212,191,.18),rgba(34,211,238,.16));border-color:#22d3ee;color:#f4f7fd}
    #byok-overlay [data-pane]{display:none}#byok-overlay [data-pane].on{display:block}
  </style>
  <div class="bc">
    <h2>Set up your <b>Studio</b></h2>
    <p>Choose how this device works. You can switch any time in Settings.</p>
    <div class="modes" role="group" aria-label="Connection mode">
      <button type="button" id="mode-byok" data-mode="byok" aria-pressed="${startMode === "byok"}">This device only<br><span style="font-weight:400;font-size:.72rem;opacity:.8">bring your own keys</span></button>
      <button type="button" id="mode-remote" data-mode="remote" aria-pressed="${startMode === "remote"}">Connect to my&nbsp;Helm<br><span style="font-weight:400;font-size:.72rem;opacity:.8">use the laptop's state</span></button>
    </div>

    <div data-pane="byok" class="${startMode === "byok" ? "on" : ""}">
      <p style="margin-top:-.4rem">Your keys are stored only in this browser \u2014 never on a server. They go straight to GitHub and your AI provider.</p>
      <label>GitHub owner / repo</label>
      <div class="row"><input id="byok-owner" placeholder="owner" value="${c.ghOwner || ""}"><input id="byok-repo" placeholder="repo" value="${c.ghRepo || ""}"></div>
      <label>Branch</label><input id="byok-branch" placeholder="main" value="${c.ghBranch || "main"}">
      <label>GitHub token (fine-grained, contents: read & write)</label><input id="byok-token" type="password" placeholder="github_pat_\u2026" value="${c.ghToken || ""}">
      <label>AI provider</label>
      <select id="byok-prov">
        <option value="anthropic"${(c.aiProvider || "anthropic") === "anthropic" ? " selected" : ""}>Anthropic (Claude)</option>
        <option value="openai"${c.aiProvider === "openai" ? " selected" : ""}>OpenAI</option>
        <option value="google"${c.aiProvider === "google" ? " selected" : ""}>Google (Gemini)</option>
      </select>
      <label>AI key</label><input id="byok-key" type="password" placeholder="sk-\u2026" value="${c.aiKey || ""}">
      <button id="byok-save">Save &amp; start</button>
      <div class="msg" id="byok-msg"></div>
    </div>

    <div data-pane="remote" class="${startMode === "remote" ? "on" : ""}">
      <p style="margin-top:-.4rem">Run <b>npm&nbsp;run&nbsp;tunnel</b> on your laptop, paste the printed URL below, and your phone edits the laptop's real Studio \u2014 drafts, queue, posts. Keys stay on the laptop.</p>
      <label>Helm URL (your tunnel)</label><input id="helm-url" inputmode="url" autocapitalize="off" autocomplete="off" placeholder="https://helm-xxxx.trycloudflare.com" value="${r.baseUrl || ""}">
      <div class="hint" style="margin:.35rem 0 0">Only paste your own Helm/tunnel URL \u2014 the admin token is sent to it.</div>
      <label>Admin token</label><input id="helm-token" type="password" autocomplete="off" placeholder="from config/config.json" value="${r.token || ""}">
      <button class="ghost" id="helm-test" style="margin-top:.9rem">Test connection</button>
      <button id="helm-save">Connect &amp; start</button>
      <div class="msg" id="helm-msg"></div>
    </div>
    <div class="hint">You can change these any time in Settings.</div>
  </div>`;
  document.body.appendChild(ov);
  const $ = (id) => document.getElementById(id);
  const v = (id) => ($(id).value || "").trim();
  const setMode = (m) => {
    $("mode-byok").setAttribute("aria-pressed", String(m === "byok"));
    $("mode-remote").setAttribute("aria-pressed", String(m === "remote"));
    ov.querySelectorAll("[data-pane]").forEach((el2) => el2.classList.toggle("on", el2.dataset.pane === m));
  };
  $("mode-byok").addEventListener("click", () => setMode("byok"));
  $("mode-remote").addEventListener("click", () => setMode("remote"));
  $("byok-save").addEventListener("click", () => {
    const msg = $("byok-msg");
    if (!v("byok-owner") || !v("byok-repo") || !v("byok-token") || !v("byok-key")) {
      msg.textContent = "Fill in repo, GitHub token and AI key.";
      msg.style.color = "#f472b6";
      return;
    }
    config.save({ mode: "byok", ghOwner: v("byok-owner"), ghRepo: v("byok-repo"), ghBranch: v("byok-branch") || "main", ghToken: v("byok-token"), aiProvider: v("byok-prov"), aiKey: v("byok-key") });
    refresh();
    msg.textContent = "Saved. Loading\u2026";
    msg.style.color = "#2dd4bf";
    setTimeout(() => location.reload(), 400);
  });
  $("helm-test").addEventListener("click", async () => {
    const msg = $("helm-msg");
    if (!v("helm-url") || !v("helm-token")) {
      msg.textContent = "Enter the Helm URL and admin token.";
      msg.style.color = "#f472b6";
      return;
    }
    msg.textContent = "Testing\u2026";
    msg.style.color = "#aebbd2";
    const probe = makeRemote(() => ({ baseUrl: v("helm-url").replace(/\/+$/, ""), token: v("helm-token") }));
    const res = await probe.test();
    if (res.ok) {
      msg.textContent = "Connected to your Helm \u2713";
      msg.style.color = "#2dd4bf";
    } else {
      msg.textContent = res.message || "Connection failed.";
      msg.style.color = "#f472b6";
    }
  });
  $("helm-save").addEventListener("click", async () => {
    const msg = $("helm-msg");
    if (!v("helm-url") || !v("helm-token")) {
      msg.textContent = "Enter the Helm URL and admin token.";
      msg.style.color = "#f472b6";
      return;
    }
    msg.textContent = "Connecting\u2026";
    msg.style.color = "#aebbd2";
    const probe = makeRemote(() => ({ baseUrl: v("helm-url").replace(/\/+$/, ""), token: v("helm-token") }));
    const res = await probe.test();
    if (!res.ok) {
      msg.textContent = res.message || "Connection failed.";
      msg.style.color = "#f472b6";
      return;
    }
    config.saveRemoteHelm({ baseUrl: v("helm-url"), token: v("helm-token") });
    refresh();
    msg.textContent = "Connected \u2713 Loading\u2026";
    msg.style.color = "#2dd4bf";
    setTimeout(() => location.reload(), 400);
  });
  setMode(startMode);
}
if (typeof window !== "undefined") {
  window.__studioConfig = config;
  window.__studioRefresh = refresh;
  window.__studioOnboard = renderOnboarding;
  window.__studioMakeRemote = makeRemote;
  refresh();
}
export {
  buildApi,
  refresh,
  refreshRemote,
  renderOnboarding
};
