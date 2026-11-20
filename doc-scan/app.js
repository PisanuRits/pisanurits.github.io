/* Doc Scan — สแกนเอกสารเป็น PDF */
'use strict';
const VERSION = '1.3.0';
const $ = (id) => document.getElementById(id);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ---------- settings ---------- */
const DEF = {
  autoAll: false, autoWarp: true, autoLight: true, autoFilter: true, autoShot: true,
  tokens: ['type', 'date', 'time'], project: '', ctext: '', counter: 1,
  defMode: 'doc', paper: 'a4', quality: 'bal'
};
let settings = Object.assign({}, DEF);
try { Object.assign(settings, JSON.parse(localStorage.getItem('docscan.settings') || '{}')); } catch (e) { /* first run / private mode */ }
function saveSettings() { try { localStorage.setItem('docscan.settings', JSON.stringify(settings)); } catch (e) { /* ignore */ } }

const MODE_LABEL = { doc: 'เอกสาร', card: 'บัตร', book: 'หนังสือ' };
const FILTERS = [
  { id: 'auto', label: 'Auto', bg: '#FFFFFF', ink: '#111', ink2: '#555' },
  { id: 'orig', label: 'ต้นฉบับ', bg: '#D9D3C4', ink: '#5A564E', ink2: '#9A958A' },
  { id: 'doc', label: 'เอกสาร', bg: '#FFFFFF', ink: '#111', ink2: '#555' },
  { id: 'bw', label: 'ขาวดำ', bg: '#F2F2F2', ink: '#000', ink2: '#000' },
  { id: 'color', label: 'สีสด', bg: '#F5F1E4', ink: '#1F3A8A', ink2: '#7C8DB5' }
];
const FILTER_LABEL = { auto: 'Auto', orig: 'ต้นฉบับ', doc: 'เอกสาร', bw: 'ขาวดำ', color: 'สีสด' };
const QUALITY = { high: { side: 2480, q: 0.88, f: 1 }, bal: { side: 1754, q: 0.8, f: 0.55 }, small: { side: 1240, q: 0.65, f: 0.25 } };

/* ---------- toast / sheet ---------- */
let toastT = 0;
function toast(msg, ms, action) {
  const t = $('toast'); t.innerHTML = '';
  t.appendChild(document.createTextNode(msg));
  if (action) {
    const b = document.createElement('button'); b.className = 'tact'; b.textContent = action.label;
    b.onclick = () => { t.classList.remove('on'); action.on(); };
    t.appendChild(b);
  }
  t.classList.toggle('act', !!action);
  t.classList.add('on');
  clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('on'), ms || (action ? 5000 : 2600));
}
function openSheet(title, items) {
  const s = $('sheet'); s.innerHTML = '<div class="grab"></div>';
  if (title) { const h = document.createElement('div'); h.className = 'hd'; h.textContent = title; s.appendChild(h); }
  items.forEach((it) => {
    if (it.el) { s.appendChild(it.el); return; }
    const b = document.createElement('button');
    b.className = 'btn' + (it.danger ? ' danger' : '') + (it.pri ? ' pri' : '');
    b.innerHTML = it.icon ? '<svg class="i"><use href="#' + it.icon + '"/></svg>' : '';
    b.appendChild(document.createTextNode(it.label));
    b.onclick = () => { if (!it.keep) closeSheet(); it.on && it.on(); };
    s.appendChild(b);
  });
  $('toast').classList.remove('on');
  $('mask').classList.add('on');
}
function closeSheet() { $('mask').classList.remove('on'); }
$('mask').addEventListener('click', (e) => { if (e.target === $('mask')) closeSheet(); });

/* ---------- worker ---------- */
let worker = null, wReady = false, wSeq = 0;
const wCalls = new Map();
const readyWaiters = [];
function startWorker() {
  $('loading').classList.add('on');
  worker = new Worker('worker.js');
  worker.onmessage = (e) => {
    const d = e.data;
    if (d.type === 'ready') { wReady = true; $('loading').classList.remove('on'); readyWaiters.splice(0).forEach((f) => f()); return; }
    if (d.type === 'error') { $('loading').classList.remove('on'); toast('โหลดตัวประมวลผลภาพไม่สำเร็จ ลองเปิดแอปใหม่', 5000); return; }
    const c = wCalls.get(d.id);
    if (c) { wCalls.delete(d.id); d.ok ? c.res(d.res) : c.rej(new Error(d.error)); }
  };
  worker.onerror = () => { $('loading').classList.remove('on'); };
}
function whenReady() { return wReady ? Promise.resolve() : new Promise((r) => readyWaiters.push(r)); }
function wcall(type, payload, transfer) {
  return whenReady().then(() => new Promise((res, rej) => {
    const id = ++wSeq; wCalls.set(id, { res, rej });
    worker.postMessage(Object.assign({ id, type }, payload), transfer || []);
  }));
}

/* ---------- image helpers ---------- */
function blobToImg(blob) {
  return new Promise((res, rej) => {
    const u = URL.createObjectURL(blob), im = new Image();
    im.onload = () => { res(im); setTimeout(() => URL.revokeObjectURL(u), 1000); };
    im.onerror = () => { URL.revokeObjectURL(u); rej(new Error('decode')); };
    im.src = u;
  });
}
async function decode(blob) {
  if (window.createImageBitmap) { try { return await createImageBitmap(blob); } catch (e) { /* fall back */ } }
  return blobToImg(blob);
}
function dims(src) { return { w: src.width || src.naturalWidth || src.videoWidth, h: src.height || src.naturalHeight || src.videoHeight }; }
function drawScaled(src, maxSide, sx, sy, sw, sh) {
  const d = dims(src);
  sx = sx || 0; sy = sy || 0; sw = sw || d.w; sh = sh || d.h;
  const s = Math.min(1, maxSide / Math.max(sw, sh));
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(sw * s)); c.height = Math.max(1, Math.round(sh * s));
  const x = c.getContext('2d');
  x.imageSmoothingQuality = 'high';
  x.drawImage(src, sx, sy, sw, sh, 0, 0, c.width, c.height);
  return c;
}
function canvasToBlob(c, q) { return new Promise((r) => c.toBlob(r, 'image/jpeg', q || 0.92)); }
function imageDataOf(src, maxSide) { const c = drawScaled(src, maxSide); return c.getContext('2d').getImageData(0, 0, c.width, c.height); }
function resultToCanvas(r) {
  const c = document.createElement('canvas'); c.width = r.width; c.height = r.height;
  c.getContext('2d').putImageData(new ImageData(r.data, r.width, r.height), 0, 0);
  return c;
}
function fmtSize(b) { return b >= 1048576 ? (b / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(b / 1024)) + ' KB'; }

/* ---------- session pages ---------- */
let pages = [];
let sessionMode = settings.defMode;
let sessionDocId = null, sessionSaved = false, nameEdited = false;
let pid = 0;
let sheets = {}; // sheet id -> { scale: %, orient: 'auto'|'portrait'|'landscape' }
let sid = 0;
let chain = Promise.resolve();

function procOpts(p) {
  return { quad: p.quad, rot: p.rot, fine: p.fine, filter: p.filter, autoDeskew: settings.autoWarp,
    autoLight: settings.autoLight, autoFilter: settings.autoFilter, mode: p.mode, maxSide: 3000 };
}
async function detectFor(p) {
  const im = await decode(p.src);
  const id = imageDataOf(im, 720);
  if (im.close) im.close();
  const r = await wcall('detect', { image: id }, [id.data.buffer]);
  return r.quad;
}
function processPage(p) {
  const v = ++p.ver; p.busy = true; sessionSaved = false;
  onPageChanged(p);
  chain = chain.then(async () => {
    if (v !== p.ver || !pages.includes(p)) return;
    try {
      const im = await decode(p.src);
      const id = imageDataOf(im, 3000);
      if (im.close) im.close();
      const r = await wcall('process', { image: id, opts: procOpts(p) }, [id.data.buffer]);
      if (v !== p.ver) return;
      const blob = await canvasToBlob(resultToCanvas(r), 0.92);
      if (p.outUrl) URL.revokeObjectURL(p.outUrl);
      p.out = blob; p.outUrl = URL.createObjectURL(blob); p.outW = r.width; p.outH = r.height; p.info = r.info;
    } catch (e) {
      toast('ประมวลผลภาพไม่สำเร็จ: ' + e.message);
    }
    if (v === p.ver) { p.busy = false; onPageChanged(p); }
  });
  return chain;
}
async function addSource(blob, liveQuad) {
  const im = await decode(blob);
  const d = dims(im);
  let src = blob;
  if (Math.max(d.w, d.h) > 3000 || !/jpe?g/.test(blob.type)) src = await canvasToBlob(drawScaled(im, 3000), 0.92);
  if (im.close) im.close();
  const p = { id: ++pid, mode: sessionMode, src, quad: null, detected: null, rot: 0, fine: 0, filter: 'auto',
    out: null, outUrl: null, info: null, busy: true, ver: 0, reviewed: false };
  pages.push(p);
  if (p.mode === 'card') {
    const prev = pages[pages.length - 2];
    if (prev && prev.mode === 'card' && !prev.sheet) { const id = newSheet(); prev.sheet = id; p.sheet = id; }
  }
  updateStack();
  if (settings.autoWarp) {
    try { p.detected = (await detectFor(p)) || liveQuad || null; } catch (e) { p.detected = liveQuad || null; }
    p.quad = p.detected;
  }
  processPage(p);
  return p;
}
function onPageChanged(p) {
  if (!p.busy) scheduleDraft();
  if ($('crop').classList.contains('on') && pages[ci] === p) renderCropMeta();
  if ($('export').classList.contains('on')) renderPages();
  updateStack();
}

/* ---------- screens ---------- */
const SCREENS = ['home', 'camera', 'crop', 'export', 'settings'];
function show(name) {
  SCREENS.forEach((s) => $(s).classList.toggle('on', s === name));
  if (name !== 'home' && !(history.state && history.state.app)) history.pushState({ app: 1 }, '');
}
window.addEventListener('popstate', () => {
  const cur = SCREENS.find((s) => $(s).classList.contains('on'));
  if ($('mask').classList.contains('on')) closeSheet();
  else if (cur === 'camera') camBack();
  else if (cur === 'crop') cropBack();
  else if (cur === 'export') $('expBack').click();
  else if (cur === 'settings') goHome();
  const now = SCREENS.find((s) => $(s).classList.contains('on'));
  if (now !== 'home') history.pushState({ app: 1 }, '');
});

/* ---------- home ---------- */
const DB = {
  db: null,
  open() {
    if (this.db) return Promise.resolve(this.db);
    return new Promise((res, rej) => {
      const r = indexedDB.open('docscan', 2);
      r.onupgradeneeded = () => {
        const db = r.result;
        if (!db.objectStoreNames.contains('docs')) db.createObjectStore('docs', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('drafts')) db.createObjectStore('drafts', { keyPath: 'id' });
      };
      r.onsuccess = () => { this.db = r.result; res(this.db); };
      r.onerror = () => rej(r.error);
    });
  },
  tx(store, mode, fn) {
    return this.open().then((db) => new Promise((res, rej) => {
      const t = db.transaction(store, mode), st = t.objectStore(store);
      const out = fn(st);
      t.oncomplete = () => res(out && out.result);
      t.onerror = () => rej(t.error);
    }));
  },
  all(store) { return this.tx(store || 'docs', 'readonly', (s) => s.getAll()); },
  put(rec, store) { return this.tx(store || 'docs', 'readwrite', (s) => s.put(rec)); },
  del(id, store) { return this.tx(store || 'docs', 'readwrite', (s) => s.delete(id)); },
  clear(store) { return this.tx(store || 'docs', 'readwrite', (s) => s.clear()); }
};
if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});

/* ---------- drafts (auto-saved work in progress) ---------- */
let draftId = null, draftCreated = 0, draftT = 0, drafts = [];
const draftUrls = [];
function scheduleDraft() {
  if (!pages.length || sessionSaved) return;
  setDraftStat('pending');
  clearTimeout(draftT); draftT = setTimeout(saveDraft, 700);
}
async function saveDraft() {
  clearTimeout(draftT);
  if (!pages.length) return;
  if (!draftId) { draftId = 'r' + Date.now(); draftCreated = Date.now(); }
  const rec = { id: draftId, created: draftCreated, updated: Date.now(), name: nameEdited ? $('fname').value : '', nameEdited,
    paper: $('paper').dataset.set ? $('paper').value : '', quality: $('quality').dataset.set ? $('quality').value : '',
    sheets, pages: pages.map((p) => ({ sheet: p.sheet || null, src: p.src, out: p.busy ? null : p.out, outW: p.outW, outH: p.outH, quad: p.quad, detected: p.detected,
      rot: p.rot, fine: p.fine, filter: p.filter, mode: p.mode, info: p.info, reviewed: p.reviewed })) };
  try { await DB.put(rec, 'drafts'); setDraftStat('saved'); } catch (e) { setDraftStat('error'); }
}
function setDraftStat(st) {
  const el = $('draftStat'); if (!el) return;
  el.textContent = st === 'saved' ? '✓ บันทึกฉบับร่างแล้ว' : st === 'error' ? 'บันทึกฉบับร่างไม่สำเร็จ' : st === 'done' ? '✓ บันทึก PDF แล้ว' : 'กำลังบันทึกฉบับร่าง…';
  el.style.color = st === 'error' ? 'var(--danger)' : st === 'pending' ? 'var(--muted)' : 'var(--accent)';
}
async function deleteDraft(id) { try { await DB.del(id, 'drafts'); } catch (e) { /* ignore */ } }
function resumeDraft(d) {
  clearSession();
  draftId = d.id; draftCreated = d.created; nameEdited = !!d.nameEdited;
  pages = d.pages.map((x) => Object.assign({}, x, { id: ++pid, outUrl: x.out ? URL.createObjectURL(x.out) : null, busy: false, ver: 0 }));
  sheets = d.sheets || {};
  Object.keys(sheets).forEach((k) => { const n = Number(String(k).slice(1)); if (n > sid) sid = n; });
  sessionMode = (pages[0] && pages[0].mode) || settings.defMode;
  if (nameEdited) $('fname').value = d.name;
  if (d.paper) { $('paper').value = d.paper; $('paper').dataset.set = '1'; }
  if (d.quality) { $('quality').value = d.quality; $('quality').dataset.set = '1'; }
  pages.filter((p) => !p.out).forEach((p) => processPage(p));
  openExport();
  setDraftStat('saved');
}
function draftSheet(d) {
  openSheet('ฉบับร่าง · ' + d.pages.length + ' รูป', [
    { label: 'ทำต่อ', icon: 'i-edit', pri: true, on: () => resumeDraft(d) },
    { label: 'ลบฉบับร่าง', icon: 'i-trash', danger: true, on: () => openSheet('ลบฉบับร่างนี้?', [
      { label: 'ยืนยันลบ', icon: 'i-trash', danger: true, on: async () => { await deleteDraft(d.id); loadDocs(); toast('ลบฉบับร่างแล้ว'); } },
      { label: 'ยกเลิก' }]) }
  ]);
}
function renderDrafts() {
  draftUrls.splice(0).forEach((u) => URL.revokeObjectURL(u));
  const box = $('draftList'); box.innerHTML = '';
  $('draftSec').hidden = !drafts.length;
  drafts.forEach((d) => {
    const b = document.createElement('button'); b.className = 'doc';
    b.innerHTML = '<img alt=""><span class="t"><span class="n"></span><span class="muted" style="font-size:13px"></span></span><span class="tag" style="color:var(--accent)">ทำต่อ</span>';
    const first = d.pages[0];
    const blob = first && (first.out || first.src);
    if (blob) { const u = URL.createObjectURL(blob); draftUrls.push(u); b.querySelector('img').src = u; }
    b.querySelector('.n').textContent = d.name || ('ฉบับร่าง · ' + MODE_LABEL[(first && first.mode) || 'doc']);
    b.querySelector('.muted').textContent = d.pages.length + ' รูป · แก้ล่าสุด ' + fmtDate(d.updated);
    b.onclick = () => draftSheet(d);
    box.appendChild(b);
  });
}

let docs = [], docFilter = 'all';
const thumbUrls = new Map();
const TH_MON = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
function fmtDate(t) {
  const d = new Date(t), now = new Date();
  const hm = String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
  const day = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((day(now) - day(d)) / 86400000);
  if (diff === 0) return 'วันนี้ ' + hm;
  if (diff === 1) return 'เมื่อวาน ' + hm;
  return d.getDate() + ' ' + TH_MON[d.getMonth()] + (d.getFullYear() !== now.getFullYear() ? ' ' + (d.getFullYear() + 543) : '');
}
const VIA = { download: ['ดาวน์โหลด', 'var(--muted)'], share: ['แชร์แล้ว', 'var(--fg2)'], drive: ['Drive', 'var(--accent)'] };
async function loadDocs() {
  try { docs = (await DB.all('docs')) || []; } catch (e) { docs = []; }
  try { drafts = (await DB.all('drafts')) || []; } catch (e) { drafts = []; }
  docs.sort((a, b) => b.created - a.created);
  drafts.sort((a, b) => b.updated - a.updated);
  renderDocs(); renderDrafts();
}
function renderChips() {
  const c = $('chips'); c.innerHTML = '';
  [['all', 'ทั้งหมด'], ['doc', 'เอกสาร'], ['card', 'บัตร'], ['book', 'หนังสือ']].forEach(([k, l]) => {
    const b = document.createElement('button'); b.className = 'pill' + (docFilter === k ? ' on' : ''); b.textContent = l;
    b.onclick = () => { docFilter = k; renderChips(); renderDocs(); };
    c.appendChild(b);
  });
}
function renderDocs() {
  const q = $('q').value.trim().toLowerCase();
  const list = docs.filter((d) => (docFilter === 'all' || d.type === docFilter) && (!q || d.name.toLowerCase().includes(q)));
  $('docCount').textContent = docs.length ? docs.length + ' ไฟล์' : '';
  const box = $('docList'); box.innerHTML = '';
  if (!list.length) {
    box.innerHTML = '<div class="empty"><div class="ill"><svg class="i" style="width:30px;height:30px"><use href="#i-scan"/></svg></div>' +
      (docs.length ? '<div>ไม่พบเอกสารที่ค้นหา</div>' : '<div style="color:var(--fg2);font-weight:500">ยังไม่มีเอกสาร</div><div style="font-size:13px">กดปุ่มสแกนด้านล่างเพื่อถ่ายเอกสาร หรือ “นำเข้ารูป” จากแกลเลอรี</div>') + '</div>';
    return;
  }
  list.forEach((d) => {
    const b = document.createElement('button'); b.className = 'doc';
    let u = thumbUrls.get(d.id);
    if (!u && d.thumb) { u = URL.createObjectURL(d.thumb); thumbUrls.set(d.id, u); }
    const via = VIA[d.via] || VIA.download;
    b.innerHTML = '<img alt=""><span class="t"><span class="n"></span><span class="muted" style="font-size:13px"></span></span><span class="tag"></span>';
    if (u) b.querySelector('img').src = u;
    b.querySelector('.n').textContent = d.name;
    b.querySelector('.muted').textContent = d.pages + ' หน้า · ' + fmtSize(d.size) + ' · ' + fmtDate(d.created);
    const tg = b.querySelector('.tag'); tg.textContent = via[0]; tg.style.color = via[1];
    b.onclick = () => docSheet(d);
    box.appendChild(b);
  });
}
function docSheet(d) {
  openSheet(d.name + '.pdf', [
    { label: 'ดาวน์โหลด', icon: 'i-dl', on: () => downloadBlob(d.blob, d.name + '.pdf') },
    { label: 'แชร์ / Google Drive', icon: 'i-share', on: () => shareBlob(d.blob, d.name + '.pdf') },
    { label: 'เปลี่ยนชื่อ', icon: 'i-edit', on: () => renameSheet(d) },
    { label: 'ลบ', icon: 'i-trash', danger: true, on: () => openSheet('ลบ “' + d.name + '” ?', [
      { label: 'ยืนยันลบ', icon: 'i-trash', danger: true, on: async () => { await DB.del(d.id); loadDocs(); toast('ลบแล้ว'); } },
      { label: 'ยกเลิก' }]) }
  ]);
}
function renameSheet(d) {
  const inp = document.createElement('input'); inp.className = 'inp'; inp.value = d.name; inp.setAttribute('aria-label', 'ชื่อไฟล์ใหม่');
  openSheet('เปลี่ยนชื่อ', [{ el: inp }, { label: 'บันทึก', pri: true, on: async () => {
    const n = cleanName(inp.value); if (!n) return; d.name = n; await DB.put(d); loadDocs(); } }, { label: 'ยกเลิก' }]);
  setTimeout(() => inp.focus(), 50);
}
function goHome() { show('home'); history.replaceState(null, ''); loadDocs(); }

/* ---------- camera ---------- */
let stream = null, track = null, detTimer = 0, liveQuad = null, lastQuad = null, stableSince = 0, armed = true, torchOn = false, capturing = false;
const video = $('video');
function setMode(m) {
  sessionMode = m;
  document.querySelectorAll('#modes button').forEach((b) => b.classList.toggle('on', b.dataset.m === m));
  updateHint();
}
async function openCamera() {
  show('camera');
  $('camErr').style.display = 'none';
  setMode(pages.length ? sessionMode : settings.defMode);
  $('autoShot').classList.toggle('on', settings.autoShot);
  $('autoShot').setAttribute('aria-pressed', String(settings.autoShot));
  updateStack();
  armed = true; lastQuad = null; stableSince = 0;
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { $('camErr').style.display = 'flex'; return; }
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: false,
      video: { facingMode: { ideal: 'environment' }, width: { ideal: 2560 }, height: { ideal: 1920 } } });
    video.srcObject = stream;
    await video.play().catch(() => {});
    track = stream.getVideoTracks()[0];
    const caps = track.getCapabilities ? track.getCapabilities() : {};
    $('torch').hidden = !caps.torch;
    detLoop();
  } catch (e) {
    $('camErr').style.display = 'flex';
  }
}
function closeCamera() {
  clearTimeout(detTimer); detTimer = 0;
  if (stream) stream.getTracks().forEach((t) => t.stop());
  stream = null; track = null; torchOn = false; $('torch').classList.remove('on');
  liveQuad = null; drawOverlay(null);
}
function frameData(maxSide) {
  const vw = video.videoWidth, vh = video.videoHeight;
  const s = Math.min(1, maxSide / Math.max(vw, vh));
  const c = frameData.c || (frameData.c = document.createElement('canvas'));
  c.width = Math.round(vw * s); c.height = Math.round(vh * s);
  const x = c.getContext('2d', { willReadFrequently: true });
  x.drawImage(video, 0, 0, c.width, c.height);
  return x.getImageData(0, 0, c.width, c.height);
}
function maxMove(a, b) { let m = 0; for (let i = 0; i < 4; i++) m = Math.max(m, Math.abs(a[i].x - b[i].x), Math.abs(a[i].y - b[i].y)); return m; }
async function detLoop() {
  if (!stream) return;
  if (wReady && video.videoWidth && !capturing && document.visibilityState === 'visible') {
    try {
      const id = frameData(480);
      const r = await wcall('detect', { image: id }, [id.data.buffer]);
      onLiveQuad(r.quad);
    } catch (e) { /* ignore a dropped frame */ }
  }
  if (stream) detTimer = setTimeout(detLoop, 180);
}
let missCount = 0;
function onLiveQuad(raw) {
  const now = performance.now();
  let q = raw;
  // hysteresis: ride over a couple of missed frames instead of flickering
  if (!raw) { missCount++; q = missCount <= 3 ? lastQuad : null; }
  else {
    missCount = 0;
    // smoothing: blend with the previous quad when it is close, so the frame doesn't jitter
    if (lastQuad && maxMove(raw, lastQuad) < 0.06) q = raw.map((p, i) => ({ x: lastQuad[i].x * 0.5 + p.x * 0.5, y: lastQuad[i].y * 0.5 + p.y * 0.5 }));
  }
  if (raw && lastQuad && maxMove(q, lastQuad) < 0.015) { if (!stableSince) stableSince = now; }
  else stableSince = 0;
  if (!q) armed = true;
  else if (!armed && lastShotQuad && maxMove(q, lastShotQuad) > 0.1) armed = true;
  lastQuad = q; liveQuad = q;
  drawOverlay(q);
  updateHint();
  if (q && settings.autoShot && armed && stableSince && now - stableSince > 900 && !capturing) capture();
}
let lastShotQuad = null;
function updateHint() {
  const h = $('hint');
  if (!wReady) { h.textContent = 'กำลังเตรียมตัวตรวจจับขอบ…'; return; }
  let side = '';
  if (sessionMode === 'card') side = (pages.filter((p) => p.mode === 'card').length % 2 === 0 ? 'ด้านหน้าบัตร' : 'ด้านหลังบัตร') + ' — ';
  if (!liveQuad) h.textContent = side + (sessionMode === 'book' ? 'วางหนังสือที่กางสองหน้าให้อยู่ในภาพ' : 'กำลังหาเอกสาร…');
  else if (!armed && settings.autoShot) h.innerHTML = '<svg class="i" style="width:16px;height:16px;color:var(--accent)"><use href="#i-check"/></svg>ถ่ายแล้ว — เปลี่ยนหน้าถัดไปได้เลย';
  else h.innerHTML = '<svg class="i" style="width:16px;height:16px;color:var(--accent)"><use href="#i-check"/></svg>' + side + 'พบเอกสาร — ถือนิ่งๆ สักครู่';
}
function drawOverlay(q) {
  const c = $('camOverlay'), dpr = window.devicePixelRatio || 1;
  const cw = c.clientWidth, ch = c.clientHeight;
  if (c.width !== Math.round(cw * dpr)) { c.width = Math.round(cw * dpr); c.height = Math.round(ch * dpr); }
  const x = c.getContext('2d'); x.setTransform(dpr, 0, 0, dpr, 0, 0); x.clearRect(0, 0, cw, ch);
  if (!q || !video.videoWidth) return;
  const vw = video.videoWidth, vh = video.videoHeight, s = Math.max(cw / vw, ch / vh);
  const ox = (cw - vw * s) / 2, oy = (ch - vh * s) / 2;
  const P = q.map((p) => [ox + p.x * vw * s, oy + p.y * vh * s]);
  x.beginPath(); P.forEach((p, i) => (i ? x.lineTo(p[0], p[1]) : x.moveTo(p[0], p[1]))); x.closePath();
  x.fillStyle = 'rgba(200,241,105,0.12)'; x.fill();
  x.lineWidth = 3; x.strokeStyle = '#C8F169'; x.lineJoin = 'round'; x.stroke();
  P.forEach((p) => { x.beginPath(); x.arc(p[0], p[1], 8, 0, Math.PI * 2); x.fillStyle = '#0B0C10'; x.fill(); x.stroke(); });
}
async function capture() {
  if (!video.videoWidth || capturing) return;
  capturing = true;
  const fx = $('flashFx'); fx.style.transition = 'none'; fx.style.opacity = '0.85';
  requestAnimationFrame(() => { fx.style.transition = 'opacity .35s'; fx.style.opacity = '0'; });
  if (navigator.vibrate) navigator.vibrate(30);
  const q = liveQuad ? liveQuad.map((p) => ({ x: p.x, y: p.y })) : null;
  lastShotQuad = q; armed = false;
  try {
    const c = drawScaled(video, 4096);
    const blob = await canvasToBlob(c, 0.92);
    await addSource(blob, q);
  } finally { capturing = false; updateHint(); }
}
function updateStack() {
  $('stackN').textContent = pages.length;
  $('stackN').style.display = pages.length ? 'flex' : 'none';
  const last = pages[pages.length - 1];
  const img = $('stackImg');
  if (last && last.outUrl) { img.src = last.outUrl; img.style.visibility = 'visible'; } else img.style.visibility = last ? 'visible' : 'hidden';
}
function camBack() {
  closeCamera();
  if (pages.length) openExport(); else goHome();
}
function camDone() {
  closeCamera();
  if (!pages.length) { goHome(); return; }
  if (settings.autoAll) { openExport(); return; }
  const i = pages.findIndex((p) => !p.reviewed);
  cropReturn = 'flow';
  openCrop(i < 0 ? 0 : i);
}
async function importFiles(files) {
  files = Array.from(files || []).filter((f) => /^image\//.test(f.type) || /\.(heic|heif|jpe?g|png|webp)$/i.test(f.name));
  if (!files.length) return;
  const wasCamera = $('camera').classList.contains('on');
  if (wasCamera) closeCamera();
  if (!pages.length) sessionMode = sessionMode || settings.defMode;
  toast('กำลังนำเข้า ' + files.length + ' รูป…', 1500);
  const first = pages.length;
  for (const f of files) {
    try { await addSource(f, null); } catch (e) { toast('เปิดรูป “' + f.name + '” ไม่ได้'); }
  }
  if (pages.length === first) { if (wasCamera) openCamera(); return; }
  if (settings.autoAll) openExport();
  else { cropReturn = 'flow'; openCrop(first); }
}

/* ---------- crop ---------- */
let ci = 0, cropView = 'edge', disp = null, dispFor = null, drag = null, cropReturn = 'flow', fineT = 0;
const cvs = $('cropCanvas');
async function openCrop(i) {
  ci = Math.max(0, Math.min(i, pages.length - 1));
  show('crop');
  setView('edge');
  const p = pages[ci];
  $('fine').value = p.fine; $('fineLbl').textContent = fmtAngle(p.fine);
  if (dispFor !== p.id) {
    if (disp && disp.close) disp.close();
    disp = null; drawCrop();
    disp = await decode(p.src); dispFor = p.id;
  }
  renderFilters(); renderCropMeta(); drawCrop();
}
function fmtAngle(a) { a = Number(a) || 0; return (a > 0 ? '+' : a < 0 ? '−' : '') + Math.abs(a).toFixed(1) + '°'; }
function setView(v) {
  cropView = v;
  $('vEdge').classList.toggle('on', v === 'edge'); $('vRes').classList.toggle('on', v === 'res');
  $('resultImg').style.display = v === 'res' ? 'block' : 'none';
  renderCropMeta();
}
function renderCropMeta() {
  const p = pages[ci]; if (!p) return;
  $('cropPos').textContent = 'หน้า ' + (ci + 1) + ' จาก ' + pages.length + ' · ' + MODE_LABEL[p.mode] + ' ▾';
  $('cropNext').textContent = cropReturn === 'export' ? 'เสร็จ' : (ci < pages.length - 1 ? 'ถัดไป' : 'บันทึก');
  $('busy').style.display = p.busy ? 'block' : 'none';
  if (p.outUrl && $('resultImg').getAttribute('src') !== p.outUrl) $('resultImg').src = p.outUrl;
  const parts = [];
  if (p.busy) parts.push('กำลังประมวลผล…');
  else if (p.info) {
    if (p.info.warped) parts.push('ดัดภาพตรง'); else parts.push('ไม่ Crop');
    if (Math.abs(p.info.tilt) >= 0.2) parts.push('แก้เอียง ' + Math.abs(p.info.tilt).toFixed(1) + '°');
    if (p.rot) parts.push('หมุน ' + p.rot + '°');
    if (p.fine) parts.push('มุม ' + fmtAngle(p.fine));
    if (p.info.filter !== 'orig') parts.push('ปรับแสง');
    parts.push((p.filter === 'auto' ? 'Auto→' : '') + FILTER_LABEL[p.info.filter]);
  }
  $('autoInfo').querySelector('span').textContent = parts.join(' · ');
  document.querySelectorAll('#filters .flt').forEach((b) => b.classList.toggle('on', b.dataset.f === p.filter));
}
function renderFilters() {
  const box = $('filters');
  if (!box.children.length) {
    FILTERS.forEach((f) => {
      const b = document.createElement('button'); b.className = 'flt'; b.dataset.f = f.id;
      b.innerHTML = '<span class="sw" style="background:' + f.bg + '"><i style="background:' + f.ink + '"></i><i style="background:' + f.ink2 + ';width:100%"></i><i style="background:' + f.ink2 + ';width:88%"></i><i style="background:' + f.ink2 + ';width:96%"></i></span>' + f.label;
      b.onclick = () => { const p = pages[ci]; p.filter = f.id; processPage(p); setView('res'); };
      box.appendChild(b);
    });
  }
}
function stageRect() {
  const dpr = window.devicePixelRatio || 1;
  const W = cvs.clientWidth, H = cvs.clientHeight;
  if (!disp) return null;
  const d = dims(disp), pad = 22;
  const s = Math.min((W - pad * 2) / d.w, (H - pad * 2 - 30) / d.h);
  const w = d.w * s, h = d.h * s;
  return { x: (W - w) / 2, y: (H - h) / 2 + 10, w, h, s, dpr, W, H };
}
function quadPts(p) { return p.quad || [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }]; }
function drawCrop() {
  const dpr = window.devicePixelRatio || 1, W = cvs.clientWidth, H = cvs.clientHeight;
  if (!W) return;
  if (cvs.width !== Math.round(W * dpr) || cvs.height !== Math.round(H * dpr)) { cvs.width = Math.round(W * dpr); cvs.height = Math.round(H * dpr); }
  const x = cvs.getContext('2d'); x.setTransform(dpr, 0, 0, dpr, 0, 0);
  x.fillStyle = '#15171D'; x.fillRect(0, 0, W, H);
  const r = stageRect(), p = pages[ci];
  if (!r || !p) return;
  x.drawImage(disp, r.x, r.y, r.w, r.h);
  const q = quadPts(p).map((o) => [r.x + o.x * r.w, r.y + o.y * r.h]);
  x.beginPath(); x.rect(0, 0, W, H);
  x.moveTo(q[0][0], q[0][1]); for (let i = 3; i >= 1; i--) x.lineTo(q[i][0], q[i][1]); x.closePath();
  x.fillStyle = 'rgba(11,12,16,0.55)'; x.fill('evenodd');
  x.beginPath(); q.forEach((o, i) => (i ? x.lineTo(o[0], o[1]) : x.moveTo(o[0], o[1]))); x.closePath();
  x.setLineDash(p.quad ? [] : [8, 6]); x.lineWidth = 2.5; x.strokeStyle = '#C8F169'; x.lineJoin = 'round'; x.stroke(); x.setLineDash([]);
  q.forEach((o, i) => {
    const act = drag && drag.i === i;
    x.beginPath(); x.arc(o[0], o[1], act ? 15 : 12, 0, Math.PI * 2);
    x.fillStyle = act ? '#C8F169' : '#0B0C10'; x.fill(); x.lineWidth = 3; x.strokeStyle = '#C8F169'; x.stroke();
  });
  if (drag) {
    // loupe
    const o = q[drag.i], R = 52, Z = 2.5, lx = o[0] < W / 2 ? W - R - 14 : R + 14, ly = R + 54;
    x.save(); x.beginPath(); x.arc(lx, ly, R, 0, Math.PI * 2); x.clip();
    x.fillStyle = '#1A1714'; x.fillRect(lx - R, ly - R, R * 2, R * 2);
    const d = dims(disp), sx = (o[0] - r.x) / r.s, sy = (o[1] - r.y) / r.s, half = R / (r.s * Z);
    x.drawImage(disp, sx - half, sy - half, half * 2, half * 2, lx - R, ly - R, R * 2, R * 2);
    x.strokeStyle = 'rgba(243,244,246,.6)'; x.lineWidth = 1;
    x.beginPath(); x.moveTo(lx - R, ly); x.lineTo(lx + R, ly); x.moveTo(lx, ly - R); x.lineTo(lx, ly + R); x.stroke();
    x.restore();
    x.beginPath(); x.arc(lx, ly, R, 0, Math.PI * 2); x.lineWidth = 3; x.strokeStyle = '#F3F4F6'; x.stroke();
    void d;
  }
}
cvs.addEventListener('pointerdown', (e) => {
  if (cropView !== 'edge') return;
  const p = pages[ci], r = stageRect(); if (!p || !r) return;
  const b = cvs.getBoundingClientRect(), px = e.clientX - b.left, py = e.clientY - b.top;
  let best = -1, bd = 40;
  quadPts(p).forEach((o, i) => { const d = Math.hypot(r.x + o.x * r.w - px, r.y + o.y * r.h - py); if (d < bd) { bd = d; best = i; } });
  if (best < 0) return;
  if (!p.quad) p.quad = quadPts(p).map((o) => ({ x: o.x, y: o.y }));
  drag = { i: best, id: e.pointerId };
  cvs.setPointerCapture(e.pointerId);
  drawCrop();
});
cvs.addEventListener('pointermove', (e) => {
  if (!drag || e.pointerId !== drag.id) return;
  const p = pages[ci], r = stageRect(), b = cvs.getBoundingClientRect();
  p.quad[drag.i] = { x: Math.min(1, Math.max(0, (e.clientX - b.left - r.x) / r.w)), y: Math.min(1, Math.max(0, (e.clientY - b.top - r.y) / r.h)) };
  drawCrop();
});
function endDrag(e) {
  if (!drag || e.pointerId !== drag.id) return;
  drag = null;
  const p = pages[ci];
  p.quad = CVPROC_order(p.quad);
  drawCrop(); processPage(p);
}
cvs.addEventListener('pointerup', endDrag); cvs.addEventListener('pointercancel', endDrag);
function CVPROC_order(pts) {
  const cx = pts.reduce((s, p) => s + p.x, 0) / 4, cy = pts.reduce((s, p) => s + p.y, 0) / 4;
  const s = pts.slice().sort((a, b) => Math.atan2(a.y - cy, a.x - cx) - Math.atan2(b.y - cy, b.x - cx));
  let k = 0; s.forEach((p, i) => { if (p.x + p.y < s[k].x + s[k].y) k = i; });
  return s.slice(k).concat(s.slice(0, k));
}
window.addEventListener('resize', () => { if ($('crop').classList.contains('on')) drawCrop(); });
function cropBack() {
  if (cropReturn === 'export') { openExport(); return; }
  if (ci > 0) openCrop(ci - 1); else openCamera();
}
function cropNext() {
  const p = pages[ci]; if (p) p.reviewed = true;
  if (cropReturn !== 'export' && ci < pages.length - 1) openCrop(ci + 1);
  else openExport();
}

/* ---------- export ---------- */
function pdfPageCount() {
  return tiles().reduce((n, t) => n + (!t.sheet && t.pages[0].mode === 'book' ? 2 : 1), 0);
}
function makeName() {
  const d = new Date(), pad = (v, l) => String(v).padStart(l || 2, '0');
  const type = MODE_LABEL[(pages[0] && pages[0].mode) || sessionMode] || 'เอกสาร';
  const parts = settings.tokens.map((t) => ({
    type, date: d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()), time: pad(d.getHours()) + pad(d.getMinutes()),
    project: settings.project || 'โครงการ', counter: pad(settings.counter, 3), text: settings.ctext || 'ข้อความ'
  }[t] || ''));
  return cleanName(parts.filter(Boolean).join('_')) || 'scan';
}
function cleanName(s) { return String(s || '').replace(/\.pdf$/i, '').replace(/[\\/:*?"<>|\n\r]+/g, '-').trim().slice(0, 120); }
function openExport() {
  if (!pages.length) { goHome(); return; }
  show('export');
  if (!nameEdited) $('fname').value = makeName();
  $('paper').value = $('paper').dataset.set ? $('paper').value : settings.paper;
  $('quality').value = $('quality').dataset.set ? $('quality').value : settings.quality;
  renderPages();
}
let estT = 0;
function pageLabel(p, k) { return (k + 1) + (p.mode === 'book' ? '–' + (k + 2) + ' · หนังสือ' : p.mode === 'card' ? ' · บัตร' : ''); }
let selecting = false;
const selIds = new Set();
function newSheet() { const id = 's' + (++sid); sheets[id] = { scale: 80, orient: 'auto' }; return id; }
/* consecutive pages sharing a sheet id form one tile (= one A4 sheet) */
function tiles() {
  const out = [];
  pages.forEach((p) => {
    const last = out[out.length - 1];
    if (p.sheet && last && last.sheet === p.sheet) last.pages.push(p);
    else out.push({ sheet: p.sheet || null, pages: [p] });
  });
  out.forEach((t) => { if (t.sheet && t.pages.length < 2) { t.pages[0].sheet = null; t.sheet = null; } });
  return out;
}
function tileKey(t) { return t.sheet || ('p' + t.pages[0].id); }
function cleanupSheets() {
  const used = new Set(pages.map((p) => p.sheet).filter(Boolean));
  Object.keys(sheets).forEach((k) => { if (!used.has(k)) delete sheets[k]; });
  tiles(); // drops 1-image sheets
}

/* ----- A4 layout for several images on one sheet (mm) ----- */
const PAPER_MM = { a4: [210, 297], letter: [215.9, 279.4] };
function itemDims(p) {
  const w = p.outW || 1000, h = p.outH || 1414;
  return { w, h, card: p.mode === 'card' };
}
function sheetLayout(ps, cfg, paperKey) {
  const base = PAPER_MM[paperKey] || PAPER_MM.a4, M = 12, G = 8, n = ps.length;
  const items = ps.map(itemDims), scale = Math.max(0.2, Math.min(1, (cfg.scale || 80) / 100));
  const oris = cfg.orient === 'portrait' ? ['p'] : cfg.orient === 'landscape' ? ['l'] : ['p', 'l'];
  let best = null;
  oris.forEach((o) => {
    const pw = o === 'p' ? base[0] : base[1], ph = o === 'p' ? base[1] : base[0];
    for (let c = 1; c <= n; c++) {
      const r = Math.ceil(n / c);
      if ((r - 1) * c >= n) continue;
      const cw = (pw - 2 * M - (c - 1) * G) / c, ch = (ph - 2 * M - (r - 1) * G) / r;
      let score = 0;
      const sizes = items.map((it) => {
        if (it.card) {
          let w = 85.6, h = 54; if (it.h > it.w) { w = 54; h = 85.6; }
          const k = Math.min(1, cw / w, ch / h);
          return { w: w * k, h: h * k };
        }
        const k = Math.min(cw / it.w, ch / it.h);
        score += it.w * k * it.h * k;
        return { w: it.w * k * scale, h: it.h * k * scale };
      });
      // tie-breaks: all-card sheets prefer portrait, stacked (front above back)
      score += (o === 'p' ? 1 : 0) + (c === 1 ? 0.5 : 0) - c * 0.01;
      if (!best || score > best.score + 1e-6) best = { score, pw, ph, c, r, sizes };
    }
  });
  // compact rows, centre everything on the page
  const { pw, ph, c, r, sizes } = best, rows = [];
  for (let i = 0; i < r; i++) rows.push(sizes.slice(i * c, i * c + c));
  const rowH = rows.map((row) => Math.max.apply(null, row.map((z) => z.h)));
  const totalH = rowH.reduce((a, b) => a + b, 0) + G * (r - 1);
  let y = (ph - totalH) / 2;
  const rects = [];
  rows.forEach((row, ri) => {
    const rw = row.reduce((a, z) => a + z.w, 0) + G * (row.length - 1);
    let x = (pw - rw) / 2;
    row.forEach((z) => { rects.push({ x, y: y + (rowH[ri] - z.h) / 2, w: z.w, h: z.h }); x += z.w + G; });
    y += rowH[ri] + G;
  });
  return { pw, ph, rects };
}
const thumbCache = new Map();
function pageThumb(p) {
  if (!p.out) return Promise.resolve(null);
  const hit = thumbCache.get(p.id);
  if (hit && hit.key === p.outUrl) return hit.pr;
  const pr = decode(p.out).then((im) => { const c = drawScaled(im, 700); if (im.close) im.close(); return c; });
  thumbCache.set(p.id, { key: p.outUrl, pr });
  return pr;
}
async function drawSheet(canvas, ps, cfg, cssW) {
  const L = sheetLayout(ps, cfg, $('paper').value === 'letter' ? 'letter' : 'a4');
  const dpr = window.devicePixelRatio || 1;
  const kk = Math.min(cssW / L.pw, (canvas.dataset.maxh ? Number(canvas.dataset.maxh) : 1e9) / L.ph);
  canvas.width = Math.round(L.pw * kk * dpr); canvas.height = Math.round(L.ph * kk * dpr);
  canvas.style.width = (L.pw * kk) + 'px'; canvas.style.height = (L.ph * kk) + 'px';
  const x = canvas.getContext('2d'); x.setTransform(dpr * kk, 0, 0, dpr * kk, 0, 0);
  x.fillStyle = '#fff'; x.fillRect(0, 0, L.pw, L.ph);
  const ims = await Promise.all(ps.map(pageThumb));
  L.rects.forEach((r, i) => {
    if (ims[i]) x.drawImage(ims[i], r.x, r.y, r.w, r.h);
    else { x.fillStyle = '#e5e7eb'; x.fillRect(r.x, r.y, r.w, r.h); }
    x.strokeStyle = 'rgba(0,0,0,.18)'; x.lineWidth = 0.4; x.strokeRect(r.x, r.y, r.w, r.h);
  });
}

function renderPages() {
  const box = $('pages'); box.innerHTML = '';
  cleanupSheets();
  const ts = tiles();
  $('pgCount').textContent = pdfPageCount() + ' หน้า';
  $('export').classList.toggle('selecting', selecting);
  let pageNo = 0;
  ts.forEach((t) => {
    const key = tileKey(t), isSheet = !!t.sheet, p0 = t.pages[0];
    const el = document.createElement('div'); el.className = 'pg' + (isSheet ? ' sheet' : ''); el.dataset.key = key;
    el.innerHTML = '<button class="th" type="button"></button><span class="lb"></span>' +
      '<button class="grip" type="button" aria-label="ลากเพื่อย้าย"><svg class="i"><use href="#i-grip"/></svg></button>' +
      '<button class="del" type="button" aria-label="ลบ"><svg class="i"><use href="#i-x"/></svg></button>' +
      '<span class="chk" aria-hidden="true"><svg class="i"><use href="#i-check"/></svg></span>';
    const th = el.querySelector('.th');
    const first = pageNo + 1;
    pageNo += !isSheet && p0.mode === 'book' ? 2 : 1;
    if (isSheet) {
      const cv = document.createElement('canvas'); th.appendChild(cv);
      requestAnimationFrame(() => { cv.dataset.maxh = String(th.clientHeight - 8); drawSheet(cv, t.pages, sheets[t.sheet], th.clientWidth - 8); });
      el.querySelector('.lb').textContent = first + ' · รวม ' + t.pages.length + ' ภาพ';
      th.setAttribute('aria-label', 'แผ่นรวม ' + t.pages.length + ' ภาพ แตะเพื่อปรับ');
    } else {
      if (p0.outUrl) { const im = document.createElement('img'); im.src = p0.outUrl; im.alt = ''; th.appendChild(im); }
      el.querySelector('.lb').textContent = pageLabel(p0, first - 1);
      th.setAttribute('aria-label', 'หน้า ' + first + ' แตะเพื่อแก้ไข');
    }
    if (t.pages.some((p) => p.busy || !p.outUrl)) { const sp = document.createElement('i'); sp.className = 'spin'; th.appendChild(sp); }
    const sel = t.pages.every((p) => selIds.has(p.id));
    el.classList.toggle('picked', selecting && sel);
    th.addEventListener('click', () => {
      if (selecting) { t.pages.forEach((p) => (sel ? selIds.delete(p.id) : selIds.add(p.id))); renderPages(); return; }
      if (isSheet) sheetPanel(t.sheet); else pageSheet(pages.indexOf(p0));
    });
    el.querySelector('.del').addEventListener('click', () => removeTile(t));
    el.querySelector('.grip').addEventListener('pointerdown', (e) => startPageDrag(e, el));
    box.appendChild(el);
  });
  if (!selecting) {
    const add = document.createElement('div'); add.className = 'pg add';
    add.innerHTML = '<button class="th" type="button" aria-label="เพิ่มหน้า"><svg class="i" style="width:22px;height:22px"><use href="#i-plus"/></svg></button><span class="lb">เพิ่มหน้า</span>';
    add.querySelector('.th').onclick = () => openSheet('เพิ่มหน้า', [
      { label: 'ถ่ายรูป', icon: 'i-scan', on: () => openCamera() },
      { label: 'นำเข้ารูป', icon: 'i-image', on: () => $('filePick').click() }]);
    box.appendChild(add);
  }
  const nSel = selIds.size;
  $('selBar').hidden = !selecting;
  $('combineBtn').hidden = selecting || pages.length < 2;
  $('selGo').disabled = nSel < 2 || nSel > 6;
  $('selGo').textContent = nSel > 6 ? 'รวมได้สูงสุด 6 ภาพ' : 'รวม ' + nSel + ' ภาพเป็นแผ่นเดียว';
  $('selHint').textContent = nSel < 2 ? 'แตะเลือกภาพที่จะรวมอย่างน้อย 2 ภาพ' : 'เลือกแล้ว ' + nSel + ' ภาพ';
  clearTimeout(estT); estT = setTimeout(updateEstimate, 150);
}
function updateEstimate() {
  const Q = QUALITY[$('quality').value] || QUALITY.bal;
  let tot = 0, ready = true;
  pages.forEach((p) => {
    if (!p.out) { ready = false; return; }
    const r = Math.min(1, Q.side / Math.max(p.outW, p.outH)) * (p.sheet ? 0.6 : 1);
    tot += p.out.size * r * r * Q.f;
  });
  $('estSize').textContent = !pages.length ? '—' : ready ? '~' + fmtSize(tot + 4000) : 'กำลังคำนวณ…';
}
function snapshot() { return { pages: pages.slice(), sheets: JSON.parse(JSON.stringify(sheets)), sh: pages.map((p) => p.sheet || null) }; }
function restore(sn) { pages = sn.pages; sheets = sn.sheets; pages.forEach((p, i) => { p.sheet = sn.sh[i]; }); sessionSaved = false; renderPages(); scheduleDraft(); }
function removeTile(t) {
  const sn = snapshot();
  const i = pages.indexOf(t.pages[0]);
  pages = pages.filter((p) => !t.pages.includes(p)); sessionSaved = false;
  if (!pages.length) { renderPages(); }
  renderPages(); scheduleDraft();
  toast((t.sheet ? 'ลบแผ่นรวมแล้ว' : 'ลบหน้า ' + (i + 1) + ' แล้ว'), 5000, { label: 'เลิกทำ', on: () => restore(sn) });
}
const MODE_HELP = { doc: 'ใช้สัดส่วนจริงของภาพ', card: 'ขนาดบัตรจริง 85.6 × 54 มม.', book: 'ตัดครึ่งเป็น 2 หน้า' };
function chooseMode(p, after) {
  openSheet('ชนิดของภาพนี้', ['doc', 'card', 'book'].map((m) => ({
    label: MODE_LABEL[m] + ' — ' + MODE_HELP[m] + (p.mode === m ? '  ✓' : ''), pri: p.mode === m,
    on: () => { if (p.mode !== m) { p.mode = m; processPage(p); } if (after) after(); } })));
}
function removePage(p) { removeTile({ sheet: null, pages: [p] }); }
function movePage(p, delta) {
  const ts = tiles(), ti = ts.findIndex((t) => t.pages.includes(p)), tj = ti + delta;
  if (ti < 0 || tj < 0 || tj >= ts.length) return;
  const [m] = ts.splice(ti, 1); ts.splice(tj, 0, m);
  pages = [].concat.apply([], ts.map((t) => t.pages)); sessionSaved = false;
  renderPages(); scheduleDraft();
}
function combine(ids) {
  const chosen = pages.filter((p) => ids.has(p.id));
  if (chosen.length < 2) return;
  const sn = snapshot();
  const at = pages.indexOf(chosen[0]);
  const rest = pages.filter((p) => !ids.has(p.id));
  const insertAt = rest.filter((p) => pages.indexOf(p) < at).length;
  const id = newSheet();
  chosen.forEach((p) => { p.sheet = id; });
  rest.splice(insertAt, 0, ...chosen);
  pages = rest; sessionSaved = false;
  selecting = false; selIds.clear();
  renderPages(); scheduleDraft();
  toast('รวม ' + chosen.length + ' ภาพเป็นแผ่นเดียวแล้ว', 4000, { label: 'เลิกทำ', on: () => restore(sn) });
}
function splitSheet(id) {
  const sn = snapshot();
  pages.forEach((p) => { if (p.sheet === id) p.sheet = null; });
  delete sheets[id]; sessionSaved = false;
  renderPages(); scheduleDraft();
  toast('แยกภาพออกจากกันแล้ว', 4000, { label: 'เลิกทำ', on: () => restore(sn) });
}
function pageSheet(i) {
  const p = pages[i]; if (!p) return;
  const ts = tiles(), ti = ts.findIndex((t) => t.pages.includes(p));
  const items = [
    { label: 'แก้ไข / ปรับภาพ', icon: 'i-edit', on: () => { cropReturn = 'export'; openCrop(pages.indexOf(p)); } },
    { label: 'หมุน 90°', icon: 'i-rot', on: () => { p.rot = (p.rot + 90) % 360; processPage(p); } },
    { label: 'ชนิด: ' + MODE_LABEL[p.mode] + ' (เปลี่ยน)', icon: 'i-doc', on: () => chooseMode(p, renderPages) }];
  if (ti < ts.length - 1) items.push({ label: 'รวมกับหน้าถัดไปเป็นแผ่นเดียว', icon: 'i-combine', on: () => combine(new Set([p.id].concat(ts[ti + 1].pages.map((q) => q.id)))) });
  if (ti > 0) items.push({ label: 'เลื่อนไปก่อนหน้า', icon: 'i-back', on: () => movePage(p, -1) });
  if (ti < ts.length - 1) items.push({ label: 'เลื่อนไปถัดไป', icon: 'i-fwd', on: () => movePage(p, 1) });
  items.push({ label: 'ลบหน้านี้', icon: 'i-trash', danger: true, on: () => removePage(p) });
  openSheet('หน้า ' + (ti + 1) + ' จาก ' + ts.length, items);
}
/* Panel for a combined sheet: live A4 preview, size %, paper orientation */
function sheetPanel(id) {
  const cfg = sheets[id]; if (!cfg) return;
  const ps = () => pages.filter((p) => p.sheet === id);
  const wrap = document.createElement('div'); wrap.className = 'spanel';
  wrap.innerHTML = '<div class="pv"><canvas></canvas></div>' +
    '<div class="r"><label for="spScale">ขนาดภาพ</label><b id="spVal"></b></div>' +
    '<input type="range" id="spScale" min="30" max="100" step="5">' +
    '<div class="r" style="margin-top:4px"><span>แนวกระดาษ</span></div>' +
    '<div class="seg2" role="group" aria-label="แนวกระดาษ"><button data-o="auto">อัตโนมัติ</button><button data-o="portrait">แนวตั้ง</button><button data-o="landscape">แนวนอน</button></div>' +
    '<p class="note"></p>';
  const cv = wrap.querySelector('canvas'), rng = wrap.querySelector('#spScale');
  rng.value = cfg.scale;
  const hasCard = ps().some((p) => p.mode === 'card'), allCard = ps().every((p) => p.mode === 'card');
  wrap.querySelector('.note').textContent = allCard ? 'บัตรใช้ขนาดเท่าของจริง (85.6 × 54 มม.)' : hasCard ? 'บัตรคงขนาดจริง ภาพอื่นปรับตาม %' : '100% = ใหญ่สุดเท่าที่พอดีพื้นที่';
  if (allCard) { rng.disabled = true; }
  const redraw = () => {
    wrap.querySelector('#spVal').textContent = allCard ? 'ขนาดจริง' : cfg.scale + '%';
    wrap.querySelectorAll('.seg2 button').forEach((b) => b.classList.toggle('on', b.dataset.o === cfg.orient));
    cv.dataset.maxh = '260'; drawSheet(cv, ps(), cfg, Math.min(300, wrap.clientWidth || 300));
  };
  rng.addEventListener('input', () => { cfg.scale = Number(rng.value); redraw(); sessionSaved = false; scheduleDraft(); });
  rng.addEventListener('change', () => renderPages());
  wrap.querySelectorAll('.seg2 button').forEach((b) => { b.onclick = () => { cfg.orient = b.dataset.o; redraw(); renderPages(); sessionSaved = false; scheduleDraft(); }; });
  const edits = ps().map((p, k) => ({ label: 'แก้ไขภาพที่ ' + (k + 1), icon: 'i-edit', on: () => { cropReturn = 'export'; openCrop(pages.indexOf(p)); } }));
  openSheet('แผ่นรวม · ' + ps().length + ' ภาพ', [{ el: wrap }].concat(edits, [
    { label: 'แยกภาพออกจากกัน', icon: 'i-combine', on: () => splitSheet(id) },
    { label: 'ลบทั้งแผ่น', icon: 'i-trash', danger: true, on: () => removeTile({ sheet: id, pages: ps() }) },
    { label: 'เสร็จ', pri: true, on: () => renderPages() }]));
  requestAnimationFrame(redraw);
}
/* Drag to reorder tiles: starts instantly from the grip; neighbours slide out of the way (FLIP). */
function startPageDrag(e, el) {
  if (selecting) return;
  e.preventDefault(); e.stopPropagation();
  const box = $('pages'), scroller = box.closest('.scroll');
  const items = () => Array.from(box.querySelectorAll('.pg[data-key]'));
  const r = el.getBoundingClientRect(), offX = e.clientX - r.left, offY = e.clientY - r.top;
  const ghost = el.cloneNode(true); ghost.classList.add('ghost');
  const gc = ghost.querySelector('canvas'), oc = el.querySelector('canvas');
  if (gc && oc) { gc.width = oc.width; gc.height = oc.height; gc.getContext('2d').drawImage(oc, 0, 0); }
  ghost.style.width = r.width + 'px'; ghost.style.left = '0px'; ghost.style.top = '0px';
  document.body.appendChild(ghost);
  el.classList.add('drag');
  if (navigator.vibrate) navigator.vibrate(12);
  let x = e.clientX, y = e.clientY, scrollT = 0;
  const place = () => { ghost.style.transform = 'translate(' + (x - offX) + 'px,' + (y - offY) + 'px) scale(1.06)'; };
  const flip = (mutate) => {
    const its = items(), before = new Map(its.map((n) => [n, n.getBoundingClientRect()]));
    mutate();
    its.forEach((n) => {
      if (n === el) return;
      const a = before.get(n), b = n.getBoundingClientRect(), dx = a.left - b.left, dy = a.top - b.top;
      if (!dx && !dy) return;
      n.style.transition = 'none'; n.style.transform = 'translate(' + dx + 'px,' + dy + 'px)';
      requestAnimationFrame(() => { n.style.transition = 'transform .18s ease'; n.style.transform = ''; });
    });
  };
  const reorder = () => {
    const its = items(); let best = null, bd = Infinity;
    its.forEach((n) => { const b = n.getBoundingClientRect(), d = Math.hypot(b.left + b.width / 2 - x, b.top + b.height / 2 - y); if (d < bd) { bd = d; best = n; } });
    if (!best || best === el) return;
    const from = its.indexOf(el), to = its.indexOf(best);
    flip(() => { if (to > from) box.insertBefore(el, best.nextSibling); else box.insertBefore(el, best); });
  };
  const autoScroll = () => {
    const b = scroller.getBoundingClientRect();
    let v = 0;
    if (y < b.top + 70) v = -Math.ceil((b.top + 70 - y) / 6);
    else if (y > b.bottom - 70) v = Math.ceil((y - (b.bottom - 70)) / 6);
    if (v) { scroller.scrollTop += v; reorder(); }
    scrollT = requestAnimationFrame(autoScroll);
  };
  const move = (ev) => { if (ev.pointerId !== e.pointerId) return; x = ev.clientX; y = ev.clientY; place(); reorder(); };
  const end = (ev) => {
    if (ev.pointerId !== e.pointerId) return;
    cancelAnimationFrame(scrollT);
    window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', end); window.removeEventListener('pointercancel', end);
    ghost.remove(); el.classList.remove('drag');
    const order = items().map((n) => n.dataset.key);
    const ts = tiles(), before = ts.map(tileKey).join();
    ts.sort((a, b) => order.indexOf(tileKey(a)) - order.indexOf(tileKey(b)));
    if (ts.map(tileKey).join() !== before) { pages = [].concat.apply([], ts.map((t) => t.pages)); sessionSaved = false; scheduleDraft(); }
    renderPages();
  };
  // listen on window: moving the tile in the DOM drops any pointer capture on the grip
  window.addEventListener('pointermove', move, { passive: false }); window.addEventListener('pointerup', end); window.addEventListener('pointercancel', end);
  place(); autoScroll();
}
async function waitPages() {
  if (pages.some((p) => p.busy || !p.out)) { toast('รอประมวลผลภาพให้เสร็จสักครู่…', 1500); await chain; await sleep(30); }
}
async function jpegBytes(blob, side, q, half) {
  const im = await decode(blob);
  const d = dims(im);
  let sx = 0, sw = d.w;
  if (half === 'L') sw = Math.floor(d.w / 2);
  if (half === 'R') { sx = Math.floor(d.w / 2); sw = d.w - sx; }
  const c = drawScaled(im, side, sx, 0, sw, d.h);
  if (im.close) im.close();
  const b = await canvasToBlob(c, q);
  return { bytes: new Uint8Array(await b.arrayBuffer()), w: c.width, h: c.height };
}
async function buildPdf() {
  await waitPages();
  const Q = QUALITY[$('quality').value] || QUALITY.bal;
  const paper = $('paper').value;
  const { jsPDF } = window.jspdf;
  let doc = null;
  const SIZES = { a4: [210, 297], letter: [215.9, 279.4] };
  const newPage = (w, h) => {
    const fmt = [w, h], ori = w > h ? 'landscape' : 'portrait';
    if (!doc) doc = new jsPDF({ unit: 'mm', format: fmt, orientation: ori, compress: true });
    else doc.addPage(fmt, ori);
  };
  const placeImage = async (blob, half) => {
    const j = await jpegBytes(blob, Q.side, Q.q, half);
    let pw, ph;
    if (paper === 'fit') { const L = 297; if (j.w >= j.h) { pw = L; ph = L * j.h / j.w; } else { ph = L; pw = L * j.w / j.h; } }
    else { const s = SIZES[paper] || SIZES.a4; if (j.w > j.h) { pw = s[1]; ph = s[0]; } else { pw = s[0]; ph = s[1]; } }
    newPage(pw, ph);
    const k = Math.min(pw / j.w, ph / j.h), iw = j.w * k, ih = j.h * k;
    doc.addImage(j.bytes, 'JPEG', (pw - iw) / 2, (ph - ih) / 2, iw, ih, undefined, 'NONE');
  };
  for (const t of tiles()) {
    const p0 = t.pages[0];
    if (!t.sheet && p0.mode !== 'card') {
      if (p0.mode === 'book') { await placeImage(p0.out, 'L'); await placeImage(p0.out, 'R'); }
      else await placeImage(p0.out);
      continue;
    }
    // combined sheet (or a lone ID card at real size)
    const cfg = t.sheet ? sheets[t.sheet] : { scale: 100, orient: 'portrait' };
    const L = sheetLayout(t.pages, cfg, paper === 'letter' ? 'letter' : 'a4');
    newPage(L.pw, L.ph);
    for (let k = 0; k < t.pages.length; k++) {
      const r = L.rects[k], side = Math.round(Math.max(600, Math.min(Q.side, Q.side * Math.max(r.w, r.h) / 250)));
      const j = await jpegBytes(t.pages[k].out, side, t.pages[k].mode === 'card' ? Math.max(Q.q, 0.85) : Q.q);
      doc.addImage(j.bytes, 'JPEG', r.x, r.y, r.w, r.h, undefined, 'NONE');
    }
  }
  return doc.output('blob');
}
function downloadBlob(blob, name) {
  const u = URL.createObjectURL(blob), a = document.createElement('a');
  a.href = u; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(u), 30000);
}
async function shareBlob(blob, name) {
  const file = new File([blob], name, { type: 'application/pdf' });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file], title: name }); return 'shared'; }
    catch (e) { if (e && e.name === 'AbortError') return 'cancel'; }
  }
  downloadBlob(blob, name);
  toast('เครื่องนี้แชร์ไฟล์ไม่ได้ จึงดาวน์โหลดให้แทน', 3500);
  return 'downloaded';
}
let exporting = false;
async function doExport(via) {
  if (exporting) return;
  exporting = true;
  const btns = ['doDownload', 'doShare', 'doDrive'].map($); btns.forEach((b) => (b.disabled = true));
  try {
    const name = cleanName($('fname').value) || makeName();
    $('fname').value = name;
    const blob = await buildPdf();
    const file = name + '.pdf';
    let res = 'downloaded';
    if (via === 'download') { downloadBlob(blob, file); toast('ดาวน์โหลดแล้ว: ' + file); }
    else {
      if (via === 'drive') toast('เลือก “Drive” ในเมนูแชร์ แล้วเลือกโฟลเดอร์', 2500);
      res = await shareBlob(blob, file);
    }
    if (res === 'cancel') return;
    // remember it on the home screen
    if (!sessionDocId) { sessionDocId = 'd' + Date.now(); settings.counter++; saveSettings(); }
    const t = await jpegBytes(pages[0].out, 240, 0.7);
    await DB.put({ id: sessionDocId, name, type: pages[0].mode, pages: pdfPageCount(), size: blob.size, created: Date.now(),
      blob, thumb: new Blob([t.bytes], { type: 'image/jpeg' }), via: res === 'shared' ? (via === 'drive' ? 'drive' : 'share') : 'download' });
    thumbUrls.delete(sessionDocId);
    sessionSaved = true;
    clearTimeout(draftT);
    if (draftId) { await deleteDraft(draftId); draftId = null; draftCreated = 0; }
    setDraftStat('done');
  } catch (e) {
    toast('สร้าง PDF ไม่สำเร็จ: ' + e.message, 4000);
  } finally {
    exporting = false; btns.forEach((b) => (b.disabled = false));
  }
}
function clearSession() {
  clearTimeout(draftT);
  pages.forEach((p) => p.outUrl && URL.revokeObjectURL(p.outUrl));
  pages = []; sheets = {}; sessionDocId = null; sessionSaved = false; nameEdited = false; dispFor = null; selecting = false; selIds.clear();
  draftId = null; draftCreated = 0;
  $('paper').dataset.set = ''; $('quality').dataset.set = '';
}
function leaveExport() {
  if (sessionSaved || !pages.length) { clearSession(); goHome(); return; }
  openSheet('ยังไม่ได้บันทึกเป็น PDF', [
    { label: 'เก็บเป็นฉบับร่าง ทำต่อภายหลัง', icon: 'i-doc', pri: true, on: async () => { await saveDraft(); clearSession(); goHome(); toast('เก็บฉบับร่างแล้ว ทำต่อได้จากหน้าแรก'); } },
    { label: 'ทิ้งหน้าที่สแกนไว้', icon: 'i-trash', danger: true, on: async () => { const id = draftId; clearSession(); if (id) await deleteDraft(id); goHome(); } },
    { label: 'กลับไปแก้ต่อ' }]);
}

/* ---------- settings ---------- */
const TOGGLES = [
  ['autoAll', 'ใช้ Auto กับทุกหน้า', 'ถ่ายเสร็จข้ามไปหน้าบันทึกได้เลย (แก้ทีละหน้าได้ภายหลัง)'],
  ['autoWarp', 'ดัดภาพตรงและแก้เอียง', 'หาขอบกระดาษ ให้ภาพแบนราบเหมือนเครื่องสแกน'],
  ['autoLight', 'ปรับแสงและลบเงา', 'เกลี่ยแสง แก้สีเหลืองจากไฟบ้าน'],
  ['autoFilter', 'เลือกฟิลเตอร์อัตโนมัติ', 'ขาวดำ หรือสีสดเมื่อมีตราประทับ/ลายเซ็นสี'],
  ['autoShot', 'ถ่ายอัตโนมัติเมื่อพบเอกสาร', 'ถือนิ่งประมาณ 1 วินาที']
];
const TOKEN_LABEL = { type: 'ประเภท', date: 'ปีเดือนวัน', time: 'เวลา', project: 'ชื่อโครงการ', counter: 'ลำดับที่', text: 'ข้อความ' };
function renderSettings() {
  const tg = $('toggles'); tg.innerHTML = '';
  TOGGLES.forEach(([k, l, s]) => {
    const b = document.createElement('button'); b.className = 'tg'; b.setAttribute('aria-pressed', String(!!settings[k]));
    b.innerHTML = '<span class="tx"><b></b><small></small></span><span class="sw2"></span>';
    b.querySelector('b').textContent = l; b.querySelector('small').textContent = s;
    if (k === 'autoAll') b.querySelector('b').style.fontWeight = '600';
    b.onclick = () => { settings[k] = !settings[k]; saveSettings(); b.setAttribute('aria-pressed', String(settings[k])); };
    tg.appendChild(b);
  });
  const tk = $('tokens'); tk.innerHTML = '';
  settings.tokens.forEach((t, i) => {
    if (i) { const s = document.createElement('span'); s.className = 'sep'; s.textContent = '_'; tk.appendChild(s); }
    const b = document.createElement('button'); b.setAttribute('aria-label', 'ลบ ' + TOKEN_LABEL[t]);
    b.innerHTML = '<span></span><svg class="i" style="width:14px;height:14px"><use href="#i-x"/></svg>';
    b.firstChild.textContent = TOKEN_LABEL[t];
    b.onclick = () => { if (settings.tokens.length <= 1) { toast('ต้องมีอย่างน้อย 1 ส่วน'); return; } settings.tokens.splice(i, 1); saveSettings(); renderSettings(); };
    tk.appendChild(b);
  });
  const at = $('addTokens'); at.innerHTML = '';
  Object.keys(TOKEN_LABEL).filter((t) => !settings.tokens.includes(t)).forEach((t) => {
    const b = document.createElement('button'); b.className = 'addt'; b.textContent = '+ ' + TOKEN_LABEL[t];
    b.onclick = () => { settings.tokens.push(t); saveSettings(); renderSettings(); };
    at.appendChild(b);
  });
  $('projWrap').hidden = !settings.tokens.includes('project');
  $('textWrap').hidden = !settings.tokens.includes('text');
  $('proj').value = settings.project; $('ctext').value = settings.ctext;
  $('defMode').value = settings.defMode; $('defPaper').value = settings.paper; $('defQuality').value = settings.quality;
  $('namePreview').textContent = makeName() + '.pdf';
  $('ver').textContent = VERSION;
}

/* ---------- wiring ---------- */
$('toSettings').onclick = () => { renderSettings(); show('settings'); };
$('setBack').onclick = goHome;
$('fabScan').onclick = () => { if (!pages.length) sessionMode = settings.defMode; openCamera(); };
$('navImport').onclick = () => { if (!pages.length) sessionMode = settings.defMode; $('filePick').click(); };
$('q').addEventListener('input', renderDocs);
$('filePick').addEventListener('change', (e) => { const f = e.target.files; importFiles(f); e.target.value = ''; });
$('fileCam').addEventListener('change', (e) => { const f = e.target.files; importFiles(f); e.target.value = ''; });
$('sysCam').onclick = () => $('fileCam').click();
$('camClose').onclick = camBack;
$('shutter').onclick = () => capture();
$('camDone').onclick = camDone;
$('stack').onclick = () => { if (pages.length) { closeCamera(); openExport(); } };
$('autoShot').onclick = () => {
  settings.autoShot = !settings.autoShot; saveSettings();
  $('autoShot').classList.toggle('on', settings.autoShot); $('autoShot').setAttribute('aria-pressed', String(settings.autoShot));
  toast(settings.autoShot ? 'เปิดถ่ายอัตโนมัติ' : 'ปิดถ่ายอัตโนมัติ — กดปุ่มชัตเตอร์เอง', 1600); updateHint();
};
$('torch').onclick = async () => {
  if (!track) return;
  try { torchOn = !torchOn; await track.applyConstraints({ advanced: [{ torch: torchOn }] }); $('torch').classList.toggle('on', torchOn); }
  catch (e) { torchOn = false; toast('เปิดแฟลชไม่ได้'); }
};
document.querySelectorAll('#modes button').forEach((b) => {
  b.onclick = () => { if (b.dataset.m === 'import') $('filePick').click(); else setMode(b.dataset.m); };
});
$('cropBack').onclick = cropBack;
$('cropPos').onclick = () => { const p = pages[ci]; if (p) chooseMode(p, renderCropMeta); };
$('cropNext').onclick = cropNext;
$('vEdge').onclick = () => setView('edge');
$('vRes').onclick = () => setView('res');
$('resultImg').onclick = () => { const p = pages[ci]; if (p && p.outUrl) { $('viewerImg').src = p.outUrl; $('viewer').classList.add('on'); } };
$('viewer').onclick = () => $('viewer').classList.remove('on');
$('tAuto').onclick = async () => {
  const p = pages[ci];
  if (!p.detected) { try { p.detected = await detectFor(p); } catch (e) { /* none */ } }
  p.quad = p.detected ? p.detected.map((o) => ({ x: o.x, y: o.y })) : null;
  p.fine = 0; $('fine').value = 0; $('fineLbl').textContent = fmtAngle(0);
  p.filter = 'auto';
  processPage(p); drawCrop(); setView('res');
};
$('tRot').onclick = () => { const p = pages[ci]; p.rot = (p.rot + 90) % 360; processPage(p); setView('res'); };
$('tDetect').onclick = async () => {
  const p = pages[ci]; $('busy').style.display = 'block';
  let q = null; try { q = await detectFor(p); } catch (e) { /* none */ }
  if (q) { p.detected = q; p.quad = q.map((o) => ({ x: o.x, y: o.y })); toast('พบขอบเอกสาร'); }
  else toast('หาขอบไม่พบ ลองลากมุมเอง หรือใช้ “ไม่ Crop”', 3000);
  setView('edge'); drawCrop(); processPage(p);
};
$('tNoCrop').onclick = () => { const p = pages[ci]; p.quad = null; setView('edge'); drawCrop(); processPage(p); toast('ใช้ทั้งภาพ ไม่ตัดขอบ (ยังแก้เอียงให้อัตโนมัติ)', 2400); };
$('fine').addEventListener('input', (e) => {
  const p = pages[ci]; p.fine = Number(e.target.value); $('fineLbl').textContent = fmtAngle(p.fine);
  clearTimeout(fineT); fineT = setTimeout(() => { processPage(p); if (cropView !== 'res') setView('res'); }, 350);
});
$('expBack').onclick = () => { const i = pages.findIndex((p) => !p.reviewed); cropReturn = 'flow'; openCrop(i < 0 ? pages.length - 1 : i); };
$('expHome').onclick = leaveExport;
$('fname').addEventListener('input', () => { nameEdited = true; scheduleDraft(); });
$('fnameEdit').onclick = () => { const f = $('fname'); f.focus(); f.select(); };
$('paper').addEventListener('change', () => { $('paper').dataset.set = '1'; scheduleDraft(); });
$('quality').addEventListener('change', () => { $('quality').dataset.set = '1'; updateEstimate(); scheduleDraft(); });
$('combineBtn').onclick = () => { selecting = true; selIds.clear(); renderPages(); };
$('selCancel').onclick = () => { selecting = false; selIds.clear(); renderPages(); };
$('selGo').onclick = () => combine(new Set(selIds));
$('doDownload').onclick = () => doExport('download');
$('doShare').onclick = () => doExport('share');
$('doDrive').onclick = () => doExport('drive');
$('proj').addEventListener('input', (e) => { settings.project = e.target.value; saveSettings(); $('namePreview').textContent = makeName() + '.pdf'; });
$('ctext').addEventListener('input', (e) => { settings.ctext = e.target.value; saveSettings(); $('namePreview').textContent = makeName() + '.pdf'; });
$('defMode').addEventListener('change', (e) => { settings.defMode = e.target.value; saveSettings(); renderSettings(); });
$('defPaper').addEventListener('change', (e) => { settings.paper = e.target.value; saveSettings(); });
$('defQuality').addEventListener('change', (e) => { settings.quality = e.target.value; saveSettings(); });
$('clearAll').onclick = () => openSheet('ลบเอกสารทั้งหมดในเครื่อง?', [
  { label: 'ยืนยันลบทั้งหมด', icon: 'i-trash', danger: true, on: async () => { await DB.clear(); docs = []; toast('ลบแล้ว'); } },
  { label: 'ยกเลิก' }]);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden' && pages.length && !sessionSaved) saveDraft();
  if (document.visibilityState === 'hidden' && $('camera').classList.contains('on')) closeCamera();
  else if (document.visibilityState === 'visible' && $('camera').classList.contains('on') && !stream) openCamera();
});

/* ---------- boot ---------- */
renderChips();
loadDocs();
startWorker();
if ('serviceWorker' in navigator && location.protocol === 'https:') {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}
window.__docscan = { pages: () => pages, settings: () => settings, VERSION };
