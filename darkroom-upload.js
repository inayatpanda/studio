// studio-app/darkroom-upload.src.js
import { resizeToBase64 } from "./resize.js";
import exifr from "./vendor/exifr.esm.js";

// studio-app/core/darkroomMeta.js
function titleCase(s) {
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}
function tidyCamera(make, model) {
  const m = (make == null ? "" : String(make)).trim();
  const mod = (model == null ? "" : String(model)).trim();
  if (!m && !mod) return null;
  if (!mod) return titleCase(m);
  if (!m) return mod;
  const lowerMake = m.toLowerCase();
  const lowerModel = mod.toLowerCase();
  if (lowerModel.startsWith(lowerMake)) {
    const rest = mod.slice(m.length).trimStart();
    return rest ? `${titleCase(m)} ${rest}` : titleCase(m);
  }
  if (lowerModel.includes(lowerMake)) return mod;
  return `${titleCase(m)} ${mod}`;
}
var IMG_EXT = ["jpg", "jpeg", "png", "gif", "webp", "avif"];
var IMG_EXT_RE = new RegExp(`\\.(${IMG_EXT.join("|")})$`, "i");
function safeImageName(name, { fallbackStem = "photo", fallbackExt = "jpg" } = {}) {
  const segments = String(name == null ? "" : name).split(/[\\/]+/).filter(Boolean);
  let base = segments.length ? segments[segments.length - 1] : "";
  base = base.replace(/[^A-Za-z0-9._-]+/g, "-");
  let stem = base;
  let ext = "";
  const m = IMG_EXT_RE.exec(base);
  if (m) {
    ext = m[1].toLowerCase();
    if (ext === "jpeg") ext = "jpg";
    stem = base.slice(0, base.length - m[0].length);
  }
  stem = stem.replace(/\.{2,}/g, ".").replace(/^[.\-\s]+/, "").replace(/[.\-\s]+$/, "");
  if (!stem) stem = String(fallbackStem || "photo");
  if (!IMG_EXT.includes(ext)) {
    ext = String(fallbackExt || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
    if (ext === "jpeg") ext = "jpg";
  }
  return `${stem}.${ext}`;
}
function dedupeAgainst(names, existingNames = []) {
  const taken = /* @__PURE__ */ new Set();
  for (const e of existingNames || []) {
    const s = String(e == null ? "" : e).trim();
    if (s) taken.add(s.toLowerCase());
  }
  const out = [];
  for (const raw of names || []) {
    const name = String(raw == null ? "" : raw);
    let candidate = name;
    if (taken.has(candidate.toLowerCase())) {
      const m = /^(.*?)(\.[^.]+)$/.exec(name) || [null, name, ""];
      const stem = m[1];
      const ext = m[2] || "";
      let n = 2;
      do {
        candidate = `${stem}-${n}${ext}`;
        n++;
      } while (taken.has(candidate.toLowerCase()));
    }
    taken.add(candidate.toLowerCase());
    out.push(candidate);
  }
  return out;
}
function normaliseExif(raw) {
  const e = raw || {};
  let date = null;
  const d = e.DateTimeOriginal;
  if (d instanceof Date && !Number.isNaN(d.getTime())) date = d.toISOString();
  else if (typeof d === "number" && Number.isFinite(d)) {
    const dd = new Date(d);
    if (!Number.isNaN(dd.getTime())) date = dd.toISOString();
  } else if (typeof d === "string" && d.trim()) {
    const dd = new Date(d.trim());
    if (!Number.isNaN(dd.getTime())) date = dd.toISOString();
  }
  const camera = tidyCamera(e.Make, e.Model);
  let gps = null;
  const lat = e.GPSLatitude, lng = e.GPSLongitude;
  if (typeof lat === "number" && Number.isFinite(lat) && typeof lng === "number" && Number.isFinite(lng)) {
    gps = [lat, lng];
  }
  return { date, camera, gps };
}
var cleanStr = (s) => (s == null ? "" : String(s)).trim();
var cleanTags = (tags) => (Array.isArray(tags) ? tags : []).map((t) => cleanStr(t)).filter(Boolean).filter((t, i, a) => a.indexOf(t) === i);
function buildEntry({ exif = {}, caption = "", tags = [], album = "" } = {}) {
  const entry = {};
  const cap = cleanStr(caption);
  if (cap) entry.caption = cap;
  const tg = cleanTags(tags);
  if (tg.length) entry.tags = tg;
  const alb = cleanStr(album);
  if (alb) entry.album = alb;
  const date = cleanStr(exif.date);
  if (date) entry.date = date;
  const camera = cleanStr(exif.camera);
  if (camera) entry.camera = camera;
  if (Array.isArray(exif.gps) && exif.gps.length === 2 && typeof exif.gps[0] === "number" && Number.isFinite(exif.gps[0]) && typeof exif.gps[1] === "number" && Number.isFinite(exif.gps[1])) {
    entry.gps = [exif.gps[0], exif.gps[1]];
  }
  return entry;
}
function parseExistingMeta(content) {
  if (content == null) return {};
  const s = String(content).trim();
  if (!s) return {};
  try {
    const obj = JSON.parse(s);
    return obj && typeof obj === "object" && !Array.isArray(obj) ? obj : {};
  } catch {
    return {};
  }
}
function mergeMeta(existing, additions) {
  const out = { ...existing && typeof existing === "object" ? existing : {} };
  for (const [name, entry] of Object.entries(additions || {})) {
    if (!name) continue;
    if (entry && typeof entry === "object" && Object.keys(entry).length) out[name] = entry;
    else if (!(name in out)) out[name] = {};
  }
  return out;
}

// studio-app/darkroom-upload.src.js
var IMG_DIR = (slug) => `src/content/blog/_images/${slug}`;
var META_PATH = (slug) => `${IMG_DIR(slug)}/meta.json`;
var EXIF_PICK = ["DateTimeOriginal", "Make", "Model", "GPSLatitude", "GPSLongitude"];
var MAX_IMG_BYTES = 10 * 1024 * 1024;
var MAX_BATCH_BYTES = 40 * 1024 * 1024;
var MAX_BATCH_COUNT = 40;
var fmtMB = (b) => (b / (1024 * 1024)).toFixed(1) + " MB";
var D = null;
var photos = [];
var posts = [];
var busy = false;
var $ = (id) => document.getElementById(id);
var mkId = () => "dk-" + Math.random().toString(36).slice(2, 9);
function helmReachable() {
  if (typeof window === "undefined") return false;
  if (window.__studioRemote && window.__studioRemote.active) return true;
  if (!window.__studioConfig) return true;
  return false;
}
function helmGh() {
  const api = D && D.api;
  return {
    byok: false,
    helm: true,
    async listTree(prefix) {
      const r = await api("/repo/tree?prefix=" + encodeURIComponent(prefix || ""));
      return r && r.entries || [];
    },
    async getFile(path) {
      const r = await api("/repo/file?path=" + encodeURIComponent(path || ""));
      return r && r.file || null;
    },
    async commitMany(changes, message) {
      return await api("/repo/commit", { method: "POST", body: JSON.stringify({ changes, message }) });
    }
  };
}
function resolveGh() {
  const byok = typeof window !== "undefined" && window.__studioGh || D && D.gh;
  if (byok && byok.byok) return byok;
  if (helmReachable() && D && typeof D.api === "function") return helmGh();
  return null;
}
var esc = (s) => D && D.esc ? D.esc(s) : String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
var toast = (t) => {
  if (D && D.toast) D.toast(t);
};
async function readExif(file) {
  try {
    const raw = await exifr.parse(file, { pick: EXIF_PICK });
    return normaliseExif(raw);
  } catch {
    return { date: null, camera: null, gps: null };
  }
}
function fmtDate(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}
async function loadPosts() {
  const sel = $("dkPost");
  if (!sel) return;
  sel.innerHTML = '<option value="">Loading posts\u2026</option>';
  try {
    posts = await D.api("/posts") || [];
    if (!posts.length) {
      sel.innerHTML = '<option value="">No posts yet \u2014 create one first</option>';
      return;
    }
    sel.innerHTML = posts.map(
      (p) => `<option value="${esc(p.slug)}">${esc(p.title || p.slug)}</option>`
    ).join("");
    showDarkroomCount();
  } catch (e) {
    sel.innerHTML = '<option value="">Could not load posts</option>';
    toast(e && e.message || "Could not load posts");
  }
}
var countSeq = 0;
async function showDarkroomCount() {
  const el = $("dkCount");
  if (!el) return;
  const slug = ($("dkPost") && $("dkPost").value || "").trim();
  const gh = resolveGh();
  if (!slug) {
    el.textContent = "";
    return;
  }
  if (!gh || typeof gh.listTree !== "function") {
    el.textContent = "";
    return;
  }
  const seq = ++countSeq;
  el.textContent = "Checking existing photos\u2026";
  const names = await existingImageNames(gh, slug);
  if (seq !== countSeq) return;
  const c = names.length;
  el.textContent = c ? `${c} photo${c === 1 ? "" : "s"} already in this post's gallery` : "No photos in this post yet";
}
async function addFiles(fileList) {
  const files = [...fileList || []].filter((f) => f && /^image\//.test(f.type || ""));
  if (!files.length) return;
  toast("Reading " + files.length + " photo" + (files.length > 1 ? "s" : "") + "\u2026");
  let added = 0, skippedBig = 0, skippedCap = 0;
  let batchBytes = photos.reduce((s, p) => s + (p.bytes || 0), 0);
  for (const file of files) {
    if (photos.length >= MAX_BATCH_COUNT) {
      skippedCap++;
      continue;
    }
    try {
      const exif = await readExif(file);
      const { filename, base64, bytes, width, height } = await resizeToBase64(file);
      if (bytes > MAX_IMG_BYTES) {
        skippedBig++;
        toast("Skipped " + (file.name || "a photo") + " \u2014 too large (" + fmtMB(bytes) + ", limit " + fmtMB(MAX_IMG_BYTES) + ")");
        continue;
      }
      if (batchBytes + bytes > MAX_BATCH_BYTES) {
        skippedCap++;
        continue;
      }
      batchBytes += bytes;
      const safe = safeImageName(filename, { fallbackStem: "photo-" + (photos.length + 1) });
      photos.push({ id: mkId(), filename: safe, base64, bytes, w: width, h: height, exif, caption: "", tags: [], album: "", file });
      added++;
    } catch (err) {
      toast("Skipped " + (file.name || "a photo") + ": " + (err && err.message || err));
    }
  }
  if (added) toast("Staged " + added + " photo" + (added > 1 ? "s" : ""));
  if (skippedCap) toast("Batch full (" + MAX_BATCH_COUNT + " photos / " + fmtMB(MAX_BATCH_BYTES) + ") \u2014 commit these, then add the rest.");
  if (added || skippedBig || skippedCap) renderGrid();
}
function dedupeFilenames(existingNames = []) {
  const deduped = dedupeAgainst(photos.map((p) => p.filename), existingNames);
  photos.forEach((p, i) => {
    p.filename = deduped[i];
  });
}
async function existingImageNames(gh, slug) {
  try {
    if (!gh || typeof gh.listTree !== "function") return [];
    const entries = await gh.listTree(IMG_DIR(slug));
    return (entries || []).map((e) => (e.path || "").split("/").pop()).filter((name) => name && name.toLowerCase() !== "meta.json");
  } catch {
    return [];
  }
}
function renderGrid() {
  const grid = $("dkGrid");
  const summary = $("dkSummary");
  if (!grid) return;
  if (!photos.length) {
    grid.innerHTML = '<p class="sub" style="color:var(--faint);text-align:center;padding:1.4rem 0">No photos staged yet. Drop some above.</p>';
    if (summary) summary.textContent = "";
    $("dkBulkBar").style.display = "none";
    $("dkCommit").disabled = true;
    return;
  }
  $("dkBulkBar").style.display = "flex";
  $("dkCommit").disabled = busy;
  grid.innerHTML = photos.map((p) => {
    const meta = [fmtDate(p.exif && p.exif.date), p.exif && p.exif.camera].filter(Boolean).join(" \xB7 ");
    const chips = (p.tags || []).map(
      (t, i) => `<span class="dk-chip" data-id="${p.id}" data-i="${i}">${esc(t)}<button type="button" class="dk-chip-x" data-id="${p.id}" data-i="${i}" aria-label="Remove tag">\xD7</button></span>`
    ).join("");
    return `
    <div class="dk-cell" data-id="${p.id}">
      <div class="dk-thumb"><img src="data:image/jpeg;base64,${p.base64}" alt="" loading="lazy"/>
        <button type="button" class="dk-del" data-id="${p.id}" title="Remove from batch" aria-label="Remove from batch">\xD7</button></div>
      <div class="dk-meta">${meta ? esc(meta) : '<span style="color:var(--faint)">no EXIF \u2014 date falls back to the post</span>'}</div>
      <input class="dk-cap" data-id="${p.id}" type="text" placeholder="Caption (optional)" value="${esc(p.caption)}" />
      <div class="dk-chips" data-id="${p.id}">${chips}<input class="dk-tagin" data-id="${p.id}" type="text" placeholder="add tag\u2026" /></div>
      <input class="dk-alb" data-id="${p.id}" type="text" placeholder="Album (optional)" value="${esc(p.album)}" />
    </div>`;
  }).join("");
  wireGrid();
  if (summary) {
    const slug = $("dkPost").value || "(no post selected)";
    const albums = [...new Set(photos.map((p) => p.album).filter(Boolean))];
    summary.textContent = `${photos.length} photo${photos.length > 1 ? "s" : ""} \u2192 ${slug}` + (albums.length ? ` \xB7 album${albums.length > 1 ? "s" : ""}: ${albums.join(", ")}` : "");
  }
}
var findPhoto = (id) => photos.find((p) => p.id === id);
function wireGrid() {
  const grid = $("dkGrid");
  grid.querySelectorAll(".dk-del").forEach((b) => b.addEventListener("click", () => {
    photos = photos.filter((p) => p.id !== b.dataset.id);
    renderGrid();
  }));
  grid.querySelectorAll(".dk-cap").forEach((inp) => inp.addEventListener("input", () => {
    const p = findPhoto(inp.dataset.id);
    if (p) p.caption = inp.value;
  }));
  grid.querySelectorAll(".dk-alb").forEach((inp) => inp.addEventListener("input", () => {
    const p = findPhoto(inp.dataset.id);
    if (p) p.album = inp.value;
  }));
  grid.querySelectorAll(".dk-chip-x").forEach((b) => b.addEventListener("click", () => {
    const p = findPhoto(b.dataset.id);
    if (p) {
      p.tags.splice(Number(b.dataset.i), 1);
      renderGrid();
    }
  }));
  grid.querySelectorAll(".dk-tagin").forEach((inp) => inp.addEventListener("keydown", (e) => {
    if (e.key !== "Enter" && e.key !== ",") return;
    e.preventDefault();
    const p = findPhoto(inp.dataset.id);
    const t = inp.value.trim();
    if (p && t && !p.tags.includes(t)) {
      p.tags.push(t);
      renderGrid();
      setTimeout(() => {
        const n = $("dkGrid").querySelector(`.dk-tagin[data-id="${p.id}"]`);
        if (n) n.focus();
      }, 0);
    } else inp.value = "";
  }));
}
function bulkTags() {
  const raw = ($("dkBulkTags").value || "").split(",").map((s) => s.trim()).filter(Boolean);
  if (!raw.length) return;
  for (const p of photos) for (const t of raw) if (!p.tags.includes(t)) p.tags.push(t);
  $("dkBulkTags").value = "";
  renderGrid();
  toast("Applied tag" + (raw.length > 1 ? "s" : "") + " to all");
}
function bulkAlbum() {
  const a = ($("dkBulkAlbum").value || "").trim();
  if (!a) return;
  for (const p of photos) p.album = a;
  renderGrid();
  toast("Set album on all");
}
async function archiveOriginals(slug, btn) {
  if (!helmReachable() || !D || typeof D.api !== "function") return;
  const withFiles = photos.filter((p) => p && p.file);
  if (!withFiles.length) return;
  let archived = 0;
  for (let i = 0; i < withFiles.length; i++) {
    const p = withFiles[i];
    if (btn) btn.textContent = `Archiving original ${i + 1}/${withFiles.length}\u2026`;
    try {
      const fd = new FormData();
      fd.append("file", p.file, p.file.name || p.filename);
      const up = await D.api("/media/image/upload", { method: "POST", body: fd });
      if (up && up.id) {
        p.mediaId = up.id;
        await D.api("/media/image/" + up.id + "/resize", { method: "POST" });
        archived++;
      }
    } catch (e) {
      toast("Could not archive the original for " + (p.filename || "a photo") + " \u2014 publishing the resized copy only");
    }
  }
  if (archived) toast("Archived " + archived + " original" + (archived > 1 ? "s" : "") + " on your Helm \u2713");
}
async function commit() {
  if (busy) return;
  const slug = ($("dkPost").value || "").trim();
  if (!slug) return toast("Pick a post first");
  if (!photos.length) return toast("Stage some photos first");
  const gh = resolveGh();
  if (!gh) {
    return toast("Uploading photos needs your GitHub token (the \u201CThis device only\u201D / BYOK setup) or a connected Helm. Open Settings to connect.");
  }
  const n = photos.length;
  const albums = [...new Set(photos.map((p) => p.album).filter(Boolean))];
  const ok = confirm(
    `Commit ${n} photo${n > 1 ? "s" : ""} to \u201C${slug}\u201D` + (albums.length ? ` (album${albums.length > 1 ? "s" : ""}: ${albums.join(", ")})` : "") + `?

The resized images + an updated meta.json go straight to your repo in one commit, then the blog rebuilds.`
  );
  if (!ok) return;
  busy = true;
  renderGrid();
  const btn = $("dkCommit");
  if (btn) {
    btn.disabled = true;
    btn.textContent = "Reading meta.json\u2026";
  }
  try {
    dedupeFilenames(await existingImageNames(gh, slug));
    await archiveOriginals(slug, btn);
    const existing = await gh.getFile(META_PATH(slug));
    const merged = mergeMeta(
      parseExistingMeta(existing && existing.content),
      Object.fromEntries(photos.map((p) => [p.filename, buildEntry({ exif: p.exif, caption: p.caption, tags: p.tags, album: p.album })]))
    );
    if (btn) btn.textContent = `Committing ${n} photo${n > 1 ? "s" : ""}\u2026`;
    const changes = [
      ...photos.map((p) => ({ path: `${IMG_DIR(slug)}/${p.filename}`, base64: p.base64 })),
      { path: META_PATH(slug), content: JSON.stringify(merged, null, 2) }
    ];
    const res = await gh.commitMany(changes, `studio: add ${n} photo${n > 1 ? "s" : ""} to ${slug}`);
    toast("Committed " + n + " photo" + (n > 1 ? "s" : "") + " \u2713");
    showSuccess(slug, n, res && res.commit);
    photos = [];
    await loadPosts();
    $("dkPost").value = slug;
    showDarkroomCount();
    renderGrid();
  } catch (e) {
    if (typeof window !== "undefined" && window.showError) window.showError(e, { title: "Could not upload the photos" });
    else toast(e && e.message || "Commit failed");
  } finally {
    busy = false;
    if (btn) {
      btn.disabled = false;
      btn.textContent = "Commit photos";
    }
    renderGrid();
  }
}
function showSuccess(slug, n, commit2) {
  const el = $("dkDone");
  if (!el) return;
  const href = "/darkroom/";
  el.innerHTML = `<div class="dk-done-card">\u2713 ${n} photo${n > 1 ? "s" : ""} committed to <b>${esc(slug)}</b>` + (commit2 ? ` <code style="opacity:.7">${esc(String(commit2).slice(0, 7))}</code>` : "") + `. The blog will rebuild in a minute or two.<br><a href="${esc(href)}" target="_blank" rel="noopener" style="color:#22d3ee;text-decoration:underline">Open your blog's Darkroom \u2192</a></div>`;
  el.style.display = "block";
  clearTimeout(showSuccess._t);
  showSuccess._t = setTimeout(() => {
    el.style.display = "none";
  }, 2e4);
}
var wired = false;
function wireOnce() {
  if (wired) return;
  wired = true;
  const dz = $("dkDrop");
  const input = $("dkInput");
  if (input) input.addEventListener("change", (e) => {
    addFiles(e.target.files);
    e.target.value = "";
  });
  const cam = $("dkCamInput");
  if (cam) cam.addEventListener("change", (e) => {
    addFiles(e.target.files);
    e.target.value = "";
  });
  const camBtn = $("dkCamBtn");
  if (camBtn) camBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    cam && cam.click();
  });
  if (dz) {
    dz.addEventListener("click", () => input && input.click());
    dz.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        input && input.click();
      }
    });
    ["dragenter", "dragover"].forEach((ev) => dz.addEventListener(ev, (e) => {
      e.preventDefault();
      dz.classList.add("drag");
    }));
    ["dragleave", "drop"].forEach((ev) => dz.addEventListener(ev, (e) => {
      e.preventDefault();
      dz.classList.remove("drag");
    }));
    dz.addEventListener("drop", (e) => {
      if (e.dataTransfer && e.dataTransfer.files) addFiles(e.dataTransfer.files);
    });
  }
  const post = $("dkPost");
  if (post) post.addEventListener("change", () => {
    showDarkroomCount();
    renderGrid();
  });
  const bt = $("dkBulkTagsBtn");
  if (bt) bt.addEventListener("click", bulkTags);
  const ba = $("dkBulkAlbumBtn");
  if (ba) ba.addEventListener("click", bulkAlbum);
  const cm = $("dkCommit");
  if (cm) cm.addEventListener("click", commit);
}
function initDarkroom(deps) {
  D = deps || {};
  wireOnce();
  const warn = $("dkWarn");
  if (warn) warn.style.display = resolveGh() ? "none" : "block";
  loadPosts();
  renderGrid();
}
function darkroomAddFiles(filesOrList) {
  const list = filesOrList instanceof FileList || Array.isArray(filesOrList) ? filesOrList : [filesOrList].filter(Boolean);
  return addFiles(list);
}
if (typeof window !== "undefined") {
  window.initDarkroom = initDarkroom;
  window.__dkAddFiles = darkroomAddFiles;
}
export {
  darkroomAddFiles,
  initDarkroom
};
