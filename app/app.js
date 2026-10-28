// 아기 앨범 — camera-reactive play built from the parent's own videos.
// Everything runs on the device: video analysis, face/hand recognition, sound level.

const $ = id => document.getElementById(id);
const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = t => { t = Math.max(0, Math.round(t || 0)); return Math.floor(t / 60) + ':' + String(t % 60).padStart(2, '0'); };
const wait = ms => new Promise(r => setTimeout(r, ms));
const pickOne = a => a[Math.floor(Math.random() * a.length)];

let toastTimer;
function toast(msg, ms = 4200) { const t = $('toast'); t.textContent = msg; t.hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => (t.hidden = true), ms); }

function once(el, ev, ms = 5000) {
  return new Promise(res => {
    let done = false;
    const fin = ok => { if (done) return; done = true; el.removeEventListener(ev, on); res(ok); };
    const on = () => fin(true);
    el.addEventListener(ev, on); setTimeout(() => fin(false), ms);
  });
}
async function seekTo(v, t) {
  if (Math.abs(v.currentTime - t) < 0.02 && v.readyState >= 2) return;
  const p = once(v, 'seeked', 2500); v.currentTime = t; await p;
}

/* =============================== settings =============================== */
const settings = { minutes: 5, mirror: true, mic: true, debug: false };
try { Object.assign(settings, JSON.parse(localStorage.getItem('baby-album-cam') || '{}')); } catch (e) {}
const saveSettings = () => { try { localStorage.setItem('baby-album-cam', JSON.stringify(settings)); } catch (e) {} };

/* =============================== storage =============================== */
const store = {
  db: null, mem: { clips: new Map(), blobs: new Map() },
  async init() {
    try {
      this.db = await new Promise((res, rej) => {
        const r = indexedDB.open('baby-album-cam', 1);
        r.onupgradeneeded = () => { r.result.createObjectStore('clips', { keyPath: 'id' }); r.result.createObjectStore('blobs'); };
        r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
        setTimeout(() => rej(new Error('timeout')), 4000);
      });
      try { navigator.storage?.persist?.(); } catch (e) {}
    } catch (e) { this.db = null; $('storeWarn').hidden = false; }
  },
  tx(name, mode, fn) {
    return new Promise((res, rej) => {
      const t = this.db.transaction(name, mode); const req = fn(t.objectStore(name));
      t.oncomplete = () => res(req && req.result); t.onerror = () => rej(t.error); t.onabort = () => rej(t.error);
    });
  },
  async clips() { return this.db ? this.tx('clips', 'readonly', s => s.getAll()) : [...this.mem.clips.values()]; },
  async putClip(c) { if (!this.db) return void this.mem.clips.set(c.id, c); await this.tx('clips', 'readwrite', s => s.put(c)); },
  async delClip(id) { if (!this.db) return void this.mem.clips.delete(id); await this.tx('clips', 'readwrite', s => s.delete(id)); },
  async putBlob(k, b) { if (!this.db) return void this.mem.blobs.set(k, b); await this.tx('blobs', 'readwrite', s => s.put(b, k)); },
  async getBlob(k) { return this.db ? this.tx('blobs', 'readonly', s => s.get(k)) : this.mem.blobs.get(k); },
  async delBlob(k) { if (urls.has(k)) { URL.revokeObjectURL(urls.get(k)); urls.delete(k); } if (!this.db) return void this.mem.blobs.delete(k); await this.tx('blobs', 'readwrite', s => s.delete(k)); },
};
const urls = new Map();
async function urlFor(k) {
  if (urls.has(k)) return urls.get(k);
  const b = await store.getBlob(k); if (!b) return null;
  const u = URL.createObjectURL(b); urls.set(k, u); return u;
}

/* =============================== vision (MediaPipe, on device) =============================== */
const MP = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14';
const FACE_MODEL = 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';
const HAND_MODEL = 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';
let lastTs = 0;
const ts = () => (lastTs = Math.max(Math.round(performance.now()), lastTs + 1));
let visionP = null;
function loadVision() {
  if (!visionP) visionP = (async () => {
    // The MediaPipe wasm build logs through a global `dbg` it never defines; without it, model setup throws.
    if (typeof globalThis.dbg !== 'function') globalThis.dbg = () => {};
    const m = await import(`${MP}/vision_bundle.mjs`);
    const fs = await m.FilesetResolver.forVisionTasks(`${MP}/wasm`);
    const make = async (Cls, path, extra) => {
      let err;
      for (const delegate of ['GPU', 'CPU']) {
        try { return await Cls.createFromOptions(fs, { baseOptions: { modelAssetPath: path, delegate }, runningMode: 'VIDEO', ...extra }); }
        catch (e) { err = e; }
      }
      throw err;
    };
    const face = await make(m.FaceLandmarker, FACE_MODEL, { numFaces: 2, outputFaceBlendshapes: true, minFaceDetectionConfidence: 0.4, minFacePresenceConfidence: 0.4 });
    let hand = null;
    try { hand = await make(m.HandLandmarker, HAND_MODEL, { numHands: 2, minHandDetectionConfidence: 0.4 }); } catch (e) { console.warn('hand model unavailable', e); }
    return { face, hand };
  })().catch(e => { console.warn('vision unavailable', e); return null; });
  return visionP;
}
function readFace(res) {
  const L = res && res.faceLandmarks; if (!L || !L.length) return null;
  let best = -1, bi = 0; const boxes = [];
  L.forEach((pts, i) => {
    let x0 = 1, y0 = 1, x1 = 0, y1 = 0;
    for (const p of pts) { if (p.x < x0) x0 = p.x; if (p.x > x1) x1 = p.x; if (p.y < y0) y0 = p.y; if (p.y > y1) y1 = p.y; }
    const a = (x1 - x0) * (y1 - y0); boxes.push({ x: x0, y: y0, w: x1 - x0, h: y1 - y0 });
    if (a > best) { best = a; bi = i; }
  });
  const cats = res.faceBlendshapes?.[bi]?.categories || [];
  const g = n => (cats.find(c => c.categoryName === n) || {}).score || 0;
  return { box: boxes[bi], area: best, smile: (g('mouthSmileLeft') + g('mouthSmileRight')) / 2, jaw: g('jawOpen'), count: L.length };
}
function safeDetect(model, src) { try { return model.detectForVideo(src, ts()); } catch (e) { return null; } }

function makeMotion(w = 48, h = 36) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d', { willReadFrequently: true }); let prev = null;
  return src => {
    try {
      g.drawImage(src, 0, 0, w, h); const d = g.getImageData(0, 0, w, h).data; let s = 0;
      if (prev) { for (let i = 0; i < d.length; i += 4) s += Math.abs(d[i] - prev[i]) + Math.abs(d[i + 1] - prev[i + 1]) + Math.abs(d[i + 2] - prev[i + 2]); s /= w * h * 3 * 255; }
      prev = d; return s;
    } catch (e) { return 0; }
  };
}

/* =============================== video analysis =============================== */
// Turns one album video into labelled pieces: smile / wave / talk / any, plus a calm "rest" frame to wait on.
async function audioEnergy(file, step, n) {
  try {
    if (file.size > 400 * 1024 * 1024) return null;
    const buf = await file.arrayBuffer();
    const Ctx = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    const ab = await new Promise((res, rej) => { const p = new Ctx(1, 16000, 16000).decodeAudioData(buf, res, rej); if (p && p.then) p.then(res, rej); });
    const ch = ab.getChannelData(0), sr = ab.sampleRate, out = new Array(n).fill(0);
    for (let i = 0; i < n; i++) {
      const a = Math.floor(i * step * sr), b = Math.min(ch.length, Math.floor((i + 1) * step * sr)); let s = 0, k = 0;
      for (let j = a; j < b; j += 4) { s += ch[j] * ch[j]; k++; }
      out[i] = k ? Math.sqrt(s / k) : 0;
    }
    return out;
  } catch (e) { return null; }
}

async function analyzeClip(clip, file, onProgress) {
  const v = document.createElement('video'); v.muted = true; v.playsInline = true; v.preload = 'auto';
  // Kept in the document (invisible): iOS Safari only decodes frames reliably for attached videos.
  v.setAttribute('aria-hidden', 'true');
  Object.assign(v.style, { position: 'fixed', left: '0', top: '0', width: '2px', height: '2px', opacity: '0', pointerEvents: 'none' });
  document.body.appendChild(v);
  const src = URL.createObjectURL(file); v.src = src;
  try {
    await once(v, 'loadedmetadata', 10000);
    try { await v.play(); v.pause(); } catch (e) {}
    const dur = isFinite(v.duration) && v.duration > 0 ? v.duration : 0;
    if (!dur) throw new Error('영상 길이를 읽지 못했어요');
    const step = Math.max(0.25, dur / 480), n = Math.max(1, Math.floor(dur / step));
    const V = await loadVision();
    const motion = makeMotion();
    const tc = document.createElement('canvas'); const tg = tc.getContext('2d');
    let bestThumb = null, bestArea = -1, prevWrists = [];
    const samples = [];
    for (let i = 0; i < n; i++) {
      const t = Math.min(dur - 0.05, i * step + step / 2);
      await seekTo(v, t);
      const s = { t, motion: motion(v), face: null, smile: 0, jaw: 0, hands: 0, handMove: false };
      if (V) {
        const f = readFace(safeDetect(V.face, v));
        if (f) { s.face = f.box; s.area = f.area; s.smile = f.smile; s.jaw = f.jaw; }
        if (V.hand) {
          const h = safeDetect(V.hand, v); const ws = (h?.landmarks || []).map(l => l[0]);
          s.hands = ws.length;
          s.handMove = ws.some((w, k) => prevWrists[k] && Math.hypot(w.x - prevWrists[k].x, w.y - prevWrists[k].y) > 0.035);
          prevWrists = ws;
        }
      }
      const score = (s.area || 0) * (1 + s.smile);
      if ((score > bestArea || !bestThumb) && v.videoWidth) {
        bestArea = score; const k = 240 / Math.min(v.videoWidth, v.videoHeight);
        tc.width = Math.round(v.videoWidth * k); tc.height = Math.round(v.videoHeight * k);
        try { tg.drawImage(v, 0, 0, tc.width, tc.height); bestThumb = tc.toDataURL('image/jpeg', 0.7); } catch (e) {}
      }
      samples.push(s);
      if (i % 3 === 0) { onProgress(0.05 + 0.85 * (i / n)); await wait(0); }
    }
    onProgress(0.92);
    const rms = await audioEnergy(file, step, n);
    const out = buildSegments(samples, rms, step, dur, !!V);
    return { ...out, duration: dur, thumb: bestThumb, vision: !!V };
  } finally { v.removeAttribute('src'); v.load(); v.remove(); URL.revokeObjectURL(src); }
}

function pct(arr, p) { if (!arr.length) return 0; const s = arr.slice().sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(s.length * p))]; }
function buildSegments(samples, rms, step, dur, hadVision) {
  const n = samples.length;
  const p90 = rms ? pct(rms, 0.9) : 0;
  const loud = i => (rms && p90 > 0.004 ? rms[i] / p90 : 0);
  const mot = samples.map(s => s.motion), mMed = pct(mot, 0.5), mHi = pct(mot, 0.85);
  const labels = samples.map((s, i) => {
    if (s.face && s.smile > 0.42) return 'smile';
    if (s.handMove || (s.hands && mHi > 0 && s.motion >= mHi)) return 'wave';
    if (s.face && loud(i) > 0.55) return 'talk';
    if (s.face && s.motion <= mMed * 1.2 && loud(i) < 0.4) return 'rest';
    return null;
  });
  for (let i = 1; i < n - 1; i++) if (!labels[i] && labels[i - 1] && labels[i - 1] === labels[i + 1]) labels[i] = labels[i - 1];

  const segs = [];
  const minLen = { smile: 0.5, wave: 0.5, talk: 0.75 };
  for (let i = 0; i < n;) {
    const L = labels[i]; let j = i;
    while (j + 1 < n && labels[j + 1] === L) j++;
    if (L && L !== 'rest' && (j - i + 1) * step >= minLen[L]) {
      let s = Math.max(0, i * step - 0.4), e = Math.min(dur, (j + 1) * step + 0.6);
      if (e - s < 1.6) { const mid = (s + e) / 2; s = Math.max(0, mid - 0.8); e = Math.min(dur, s + 1.6); }
      while (e - s > 4.2) { segs.push({ label: L, start: s, end: s + 3 }); s += 3; }
      if (e - s >= 1) segs.push({ label: L, start: +s.toFixed(2), end: +e.toFixed(2) });
    }
    i = j + 1;
  }
  // Always keep some "any" pieces so every reaction has something to play.
  const overlaps = (a, b) => a.start < b.end && b.start < a.end;
  const win = Math.min(2.5, dur), anys = [];
  for (let s = 0; s + 1 <= dur; s += win) {
    const seg = { label: 'any', start: +s.toFixed(2), end: +Math.min(dur, s + win).toFixed(2) };
    const a = Math.floor(seg.start / step), b = Math.max(a + 1, Math.floor(seg.end / step));
    let sc = 0; for (let k = a; k < b && k < n; k++) sc += (samples[k].face ? 1 : 0) + loud(k) + samples[k].motion * 10;
    seg.score = sc / (b - a);
    if (!segs.some(x => overlaps(x, seg))) anys.push(seg);
  }
  anys.sort((x, y) => y.score - x.score).slice(0, Math.max(3, 8 - segs.length)).forEach(a => { delete a.score; segs.push(a); });
  segs.sort((a, b) => a.start - b.start);

  let restT = 0, best = -1;
  samples.forEach((s, i) => { const sc = (s.face ? (s.area || 0.01) : 0) * (labels[i] === 'rest' ? 2 : labels[i] === 'smile' ? 1.5 : 1); if (sc > best) { best = sc; restT = s.t; } });
  if (best <= 0) restT = Math.min(dur * 0.3, 1);

  const counts = { smile: 0, wave: 0, talk: 0, any: 0 };
  segs.forEach(s => counts[s.label]++);
  const faces = samples.filter(s => s.face).length / Math.max(1, n);
  return { segs, restT: +restT.toFixed(2), counts, faceRatio: +faces.toFixed(2), hadAudio: !!rms, hadVision };
}

/* =============================== home =============================== */
let clips = [];
const queue = []; let analyzing = false;

function renderHome() {
  clips.sort((a, b) => b.created - a.created);
  $('empty').hidden = clips.length > 0;
  $('clips').innerHTML = clips.map(c => {
    let body;
    if (c.status === 'analyzing' || c.status === 'queued') {
      body = `<div class="bar"><i style="width:${Math.round((c.progress || 0) * 100)}%"></i></div><span class="meta">${c.status === 'queued' ? '분석 대기 중' : '장면 찾는 중… ' + Math.round((c.progress || 0) * 100) + '%'}</span>`;
    } else if (c.status === 'error') {
      body = `<span class="meta">이 영상은 읽지 못했어요. ${esc(c.error || '')}</span>`;
    } else {
      const k = c.counts || {}, tags = [];
      if (k.smile) tags.push(`<span class="tag">😊 웃음 ${k.smile}</span>`);
      if (k.wave) tags.push(`<span class="tag">👋 손 ${k.wave}</span>`);
      if (k.talk) tags.push(`<span class="tag">🗣️ 말 ${k.talk}</span>`);
      if (!k.smile && !k.wave && !k.talk) tags.push(`<span class="tag warn-tag">얼굴 장면이 적어요</span>`);
      body = `<div class="tags">${tags.join('')}</div><span class="meta">${fmt(c.duration)} · 조각 ${c.segs.length}개</span>`;
    }
    return `<li class="clip" data-id="${c.id}">
      <div class="thumb">${c.thumb ? `<img src="${c.thumb}" alt="">` : '🎞️'}</div>
      <div class="info"><b>${esc(c.name)}</b>${body}</div>
      <div class="side">
        <label class="toggle"><input type="checkbox" data-act="use" ${c.use !== false ? 'checked' : ''} ${c.status !== 'ready' ? 'disabled' : ''}>사용</label>
        <button class="del" type="button" data-act="del">삭제</button>
      </div>
    </li>`;
  }).join('');
  const ready = clips.filter(c => c.status === 'ready' && c.use !== false);
  const busy = clips.some(c => c.status === 'analyzing' || c.status === 'queued');
  $('start').disabled = ready.length === 0;
  const segN = ready.reduce((a, c) => a + c.segs.length, 0);
  $('startMeta').textContent = ready.length
    ? `영상 ${ready.length}개에서 반응 조각 ${segN}개를 찾았어요. ${settings.minutes}분 동안 놀아요.${busy ? ' (분석 중인 영상은 끝나면 추가돼요)' : ''}`
    : busy ? '영상에서 장면을 찾고 있어요. 잠시만 기다려 주세요.' : '앨범에서 엄마나 가족이 나오는 영상을 골라 주세요.';
  $('minSeg').innerHTML = [3, 5, 7, 10].map(k => `<button type="button" data-n="${k}" aria-pressed="${k === settings.minutes}">${k}분</button>`).join('');
  $('optMirror').checked = settings.mirror; $('optMic').checked = settings.mic; $('optDebug').checked = settings.debug;
}
function renderClipProgress(c) {
  const li = document.querySelector(`.clip[data-id="${c.id}"]`); if (!li) return renderHome();
  const bar = li.querySelector('.bar i'), meta = li.querySelector('.meta');
  if (bar) bar.style.width = Math.round(c.progress * 100) + '%';
  if (meta) meta.textContent = '장면 찾는 중… ' + Math.round(c.progress * 100) + '%';
}

$('pick').addEventListener('change', async e => {
  const files = [...e.target.files]; e.target.value = '';
  for (const f of files) {
    const id = uid();
    try { await store.putBlob('v:' + id, f); }
    catch (err) { toast('저장 공간이 부족해요. 더 짧은 영상으로 골라 주세요.'); continue; }
    const d = new Date(f.lastModified || Date.now());
    const c = { id, name: `${d.getMonth() + 1}월 ${d.getDate()}일 영상`, created: Date.now(), status: 'queued', progress: 0, use: true, segs: [] };
    clips.push(c); await store.putClip(c); queue.push(c.id);
  }
  renderHome(); runQueue();
});
async function runQueue() {
  if (analyzing) return; analyzing = true;
  while (queue.length) {
    const c = clips.find(x => x.id === queue.shift()); if (!c) continue;
    c.status = 'analyzing'; c.progress = 0.02; renderHome();
    try {
      const file = await store.getBlob('v:' + c.id);
      if (!file) throw new Error('영상 파일이 없어요');
      let last = 0;
      const r = await analyzeClip(c, file, p => { c.progress = p; const now = performance.now(); if (now - last > 250) { last = now; renderClipProgress(c); } });
      Object.assign(c, r, { status: 'ready', progress: 1 });
      if (!r.hadVision) toast('인식 모델을 불러오지 못해서 소리와 움직임으로만 장면을 나눴어요. 인터넷 연결을 확인해 주세요.');
    } catch (err) { c.status = 'error'; c.error = err.message || ''; }
    try { await store.putClip(c); } catch (e) {}
    renderHome();
  }
  analyzing = false;
}
$('clips').addEventListener('change', async e => {
  if (e.target.dataset.act !== 'use') return;
  const c = clips.find(x => x.id === e.target.closest('.clip').dataset.id);
  c.use = e.target.checked; await store.putClip(c); renderHome();
});
$('clips').addEventListener('click', async e => {
  const b = e.target.closest('[data-act="del"]'); if (!b) return;
  if (!b.classList.contains('armed')) { b.classList.add('armed'); b.textContent = '정말?'; setTimeout(() => { b.classList.remove('armed'); b.textContent = '삭제'; }, 3000); return; }
  const id = b.closest('.clip').dataset.id;
  const qi = queue.indexOf(id); if (qi >= 0) queue.splice(qi, 1);
  clips = clips.filter(x => x.id !== id);
  await store.delBlob('v:' + id); await store.delClip(id); renderHome();
});
$('minSeg').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; settings.minutes = +b.dataset.n; saveSettings(); renderHome(); });
$('optMirror').addEventListener('change', e => { settings.mirror = e.target.checked; saveSettings(); });
$('optMic').addEventListener('change', e => { settings.mic = e.target.checked; saveSettings(); });
$('optDebug').addEventListener('change', e => { settings.debug = e.target.checked; saveSettings(); });

/* =============================== live sensing (front camera + mic) =============================== */
const sensor = {
  on: false, stream: null, V: null, motion: null, ac: null, an: null, buf: null, listen: true, handlers: new Set(), frame: 0, timer: 0,
  st: {},
  reset() {
    this.st = { face: null, lastFace: 0, absent: false, faceLostAt: 0, smile: 0, smileSince: 0, wrists: [], moves: [], hands: 0, mot: 0, motAvg: 0.01,
      level: 0, floor: 0.01, loudSince: 0, lastEv: {}, events: 0 };
  },
  emit(type, force) {
    const now = performance.now(), st = this.st;
    const ref = { smile: 2500, wave: 2000, vocal: 2200, look: 1500, away: 0 }[type] ?? 1000;
    if (!force && now - (st.lastEv[type] || 0) < ref) return;
    st.lastEv[type] = now; st.lastType = type; st.events++;
    this.handlers.forEach(h => h(type));
  },
  async start(cams) {
    this.reset(); this.motion = makeMotion();
    const want = { video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } } };
    let stream = null;
    if (settings.mic) {
      try { stream = await navigator.mediaDevices.getUserMedia({ ...want, audio: { echoCancellation: true, noiseSuppression: false, autoGainControl: false } }); }
      catch (e) { stream = null; }
    }
    if (!stream) stream = await navigator.mediaDevices.getUserMedia(want);
    this.stream = stream;
    for (const c of cams) { c.srcObject = stream; c.play().catch(() => {}); }
    if (stream.getAudioTracks().length) {
      try {
        this.ac = audio.ctx();
        const src = this.ac.createMediaStreamSource(new MediaStream(stream.getAudioTracks()));
        this.an = this.ac.createAnalyser(); this.an.fftSize = 1024; this.buf = new Float32Array(1024); src.connect(this.an);
      } catch (e) { this.an = null; }
    }
    this.on = true; this.cam = cams[0]; this.loop();
  },
  stop() {
    this.on = false; clearTimeout(this.timer);
    if (this.stream) this.stream.getTracks().forEach(t => t.stop());
    this.stream = null; this.an = null;
  },
  loop() {
    if (!this.on) return;
    const now = performance.now(), st = this.st, cam = this.cam, V = this.V;
    if (cam && cam.readyState >= 2 && cam.videoWidth) {
      st.mot = this.motion(cam);
      st.motAvg = st.motAvg * 0.97 + st.mot * 0.03;
      if (V) {
        const f = readFace(safeDetect(V.face, cam));
        st.face = f;
        if (f) {
          if (st.absent && now - st.faceLostAt > 1200) this.emit('look');
          st.absent = false; st.lastFace = now; st.smile = f.smile;
          if (f.smile > 0.5) { if (!st.smileSince) st.smileSince = now; if (now - st.smileSince > 280) this.emit('smile'); }
          else st.smileSince = 0;
        } else {
          st.smile = 0; st.smileSince = 0;
          if (!st.absent && now - st.lastFace > 3000) { st.absent = true; st.faceLostAt = now; this.emit('away'); }
        }
        if (V.hand && this.frame++ % 2 === 0) {
          const h = safeDetect(V.hand, cam); const ws = (h?.landmarks || []).map(l => l[0]);
          ws.forEach((w, i) => { const p = st.wrists[i]; if (p && Math.hypot(w.x - p.x, w.y - p.y) > 0.045) st.moves.push(now); });
          st.wrists = ws; st.hands = ws.length;
        }
      }
      st.moves = st.moves.filter(t => now - t < 1200);
      const bigMove = st.mot > Math.max(0.06, st.motAvg * 3.5);
      if (st.moves.length >= 2 || (bigMove && (!V || st.face || st.hands))) { this.emit('wave'); st.moves = []; }
    }
    if (this.an) {
      this.an.getFloatTimeDomainData(this.buf);
      let s = 0; for (let i = 0; i < this.buf.length; i++) s += this.buf[i] * this.buf[i];
      const rms = Math.sqrt(s / this.buf.length); st.level = rms;
      if (rms < st.floor * 2) st.floor = Math.max(0.002, st.floor * 0.98 + rms * 0.02);
      if (this.listen && rms > Math.max(0.02, st.floor * 3.5)) { if (!st.loudSince) st.loudSince = now; if (now - st.loudSince > 150) this.emit('vocal'); }
      else st.loudSince = 0;
    }
    this.timer = setTimeout(() => this.loop(), 66);
  },
};

/* =============================== sound effects =============================== */
const audio = {
  _ctx: null,
  ctx() { if (!this._ctx) { const C = window.AudioContext || window.webkitAudioContext; this._ctx = new C(); } return this._ctx; },
  unlock() { try { const c = this.ctx(); c.resume(); const b = c.createBuffer(1, 1, 22050), s = c.createBufferSource(); s.buffer = b; s.connect(c.destination); s.start(0); } catch (e) {} },
  chime(notes = [659.25, 987.77], gap = 0.12, vol = 0.18) {
    try {
      const ac = this.ctx(), t = ac.currentTime;
      notes.forEach((f, i) => {
        const o = ac.createOscillator(), g = ac.createGain(), s = t + i * gap;
        o.type = 'sine'; o.frequency.value = f;
        g.gain.setValueAtTime(0.0001, s); g.gain.linearRampToValueAtTime(vol, s + 0.02); g.gain.exponentialRampToValueAtTime(0.001, s + 0.55);
        o.connect(g).connect(ac.destination); o.start(s); o.stop(s + 0.6);
      });
    } catch (e) {}
  },
};

/* =============================== play director =============================== */
const mv = $('mv'), stageEl = $('stage');
const G = { state: 'idle', clips: [], segs: [], clipId: null, recent: [], endAt: 0, lastAct: 0, invitedAt: 0, ending: false, wake: null, tick: 0, segToken: 0, stats: { smile: 0, wave: 0, vocal: 0, look: 0 } };
const REACT = {
  smile: ['smile', 'talk', 'any'],
  wave: ['wave', 'smile', 'any'],
  vocal: ['talk', 'smile', 'any'],
  look: ['smile', 'wave', 'talk', 'any'],
  touch: ['smile', 'wave', 'talk', 'any'],
  invite: ['talk', 'wave', 'any'],
  bye: ['wave', 'smile', 'talk', 'any'],
};
const POP = { smile: '😊', wave: '👋', vocal: '🎵', look: '👀', touch: '✨' };

function pickSeg(kind) {
  for (const label of REACT[kind] || REACT.look) {
    const all = G.segs.filter(s => s.label === label); if (!all.length) continue;
    const fresh = all.filter(s => !G.recent.includes(s));
    const s = pickOne(fresh.length ? fresh : all);
    G.recent.push(s); if (G.recent.length > Math.min(4, Math.floor(G.segs.length / 2))) G.recent.shift();
    return s;
  }
  return G.segs.length ? pickOne(G.segs) : null;
}
async function useClip(id) {
  if (G.clipId === id && mv.src) return;
  const u = await urlFor('v:' + id); if (!u) return;
  G.clipId = id; mv.src = u;
  await once(mv, 'loadeddata', 4000);
}
async function enterWait(clipId) {
  G.state = 'wait'; G.lastAct = performance.now();
  stageEl.className = 'waiting';
  const token = G.segToken;
  const c = G.clips.find(x => x.id === clipId) || pickOne(G.clips);
  await useClip(c.id);
  if (token !== G.segToken) return; // a reaction started while the clip was loading
  mv.pause(); mv.muted = true;
  await seekTo(mv, c.restT || 0);
  if (G.state === 'wait') setTimeout(() => { sensor.listen = true; }, 500);
}
async function playSeg(seg, after, from) {
  if (!seg) return enterWait(G.clipId);
  const token = ++G.segToken;
  G.state = 'react'; sensor.listen = false; stageEl.className = 'react';
  await useClip(seg.clipId);
  if (token !== G.segToken) return;
  await seekTo(mv, from ?? seg.start);
  mv.muted = false;
  try { await mv.play(); } catch (e) { mv.muted = true; try { await mv.play(); } catch (e2) {} }
  await new Promise(res => {
    const chk = () => {
      if (token !== G.segToken) return res();
      if (mv.ended || mv.currentTime >= seg.end - 0.03 || G.state !== 'react') return res();
      requestAnimationFrame(chk);
    };
    chk();
    setTimeout(res, (seg.end - seg.start) * 1000 + 2500);
  });
  if (token !== G.segToken) return;
  mv.pause();
  if (after) return after();
  if (G.ending || performance.now() > G.endAt) return finish();
  enterWait(seg.clipId);
}
function popAt(type) {
  const e = POP[type]; if (!e) return;
  const cam = $('cam'), r = cam.getBoundingClientRect(), vis = !cam.hidden && r.width;
  const p = document.createElement('div'); p.className = 'pop'; p.textContent = e;
  p.style.left = (vis ? r.left + r.width / 2 : window.innerWidth * 0.18) + 'px';
  p.style.top = (vis ? r.top : window.innerHeight * 0.8) + 'px';
  $('pops').appendChild(p); setTimeout(() => p.remove(), 1150);
  if (vis) { cam.classList.add('hit'); setTimeout(() => cam.classList.remove('hit'), 700); }
}
function burst() {
  const x = window.innerWidth / 2, y = window.innerHeight / 2;
  for (let k = 0; k < 10; k++) {
    const st = document.createElement('div'); st.className = 'star'; st.textContent = '★';
    const a = (k / 10) * Math.PI * 2, d = 90 + Math.random() * 70;
    st.style.left = x + 'px'; st.style.top = y + 'px';
    st.style.setProperty('--dx', Math.cos(a) * d + 'px'); st.style.setProperty('--dy', Math.sin(a) * d + 'px');
    $('pops').appendChild(st); setTimeout(() => st.remove(), 950);
  }
}
function onSense(type) {
  if (G.state === 'idle' || G.state === 'setup' || G.state === 'end') return;
  if (G.stats[type] !== undefined && G.state !== 'react') G.stats[type]++;
  if (type === 'away') { if (G.state === 'wait') goSleep(); return; }
  if (G.state === 'sleep') { if (type !== 'away') wakeUp(type); return; }
  if (G.state === 'imitate') {
    if (type === 'away') return;
    // Exact copy counts at once; after a few seconds any try counts, so it never feels like failing.
    if (type === G.want || performance.now() - G.imStart > 3500) { popAt(type); imitateDone(true); }
    return;
  }
  if (G.state !== 'wait') return;
  popAt(type); audio.chime(type === 'smile' ? [784, 1046.5] : type === 'vocal' ? [523.25, 659.25] : [659.25, 880], 0.1, 0.12);
  G.lastAct = performance.now();
  playSeg(pickSeg(type));
}
// "따라 해 봐": show the start of a smile/wave piece, freeze it, and wait for the baby to copy it.
async function imitate(seg) {
  const token = ++G.segToken;
  G.state = 'imitate'; G.want = seg.label; sensor.listen = false;
  stageEl.className = 'react';
  await useClip(seg.clipId);
  if (token !== G.segToken) return;
  await seekTo(mv, seg.start);
  mv.muted = false;
  try { await mv.play(); } catch (e) {}
  await wait(Math.min(1400, (seg.end - seg.start) * 450));
  if (token !== G.segToken) return;
  mv.pause();
  G.imSeg = seg; G.imFrom = mv.currentTime; G.imStart = performance.now();
  $('play').classList.add('imitating'); stageEl.className = 'waiting';
  audio.chime([659.25, 783.99], 0.15, 0.1);
  setTimeout(() => { if (token === G.segToken) sensor.listen = true; }, 300);
  setTimeout(() => { if (token === G.segToken && G.state === 'imitate') imitateDone(false); }, 9000);
}
function imitateDone(copied) {
  $('play').classList.remove('imitating');
  const seg = G.imSeg; G.imSeg = null;
  if (copied) { G.stats.copy = (G.stats.copy || 0) + 1; burst(); audio.chime([523.25, 659.25, 783.99, 1046.5], 0.09, 0.15); }
  G.lastAct = performance.now();
  playSeg(seg, null, G.imFrom);
}
function goSleep() {
  G.state = 'sleep'; mv.pause(); stageEl.className = 'sleeping'; $('sleep').hidden = false;
  audio.chime([523.25, 392], 0.25, 0.08);
}
function wakeUp(type) {
  $('sleep').hidden = true; stageEl.className = '';
  burst(); audio.chime([523.25, 659.25, 783.99, 1046.5], 0.09, 0.15); popAt(type);
  G.lastAct = performance.now();
  playSeg(pickSeg('look'));
}
function heartbeat() {
  if (G.state === 'idle' || G.state === 'end') return;
  const now = performance.now();
  const left = Math.max(0, G.endAt - now);
  $('clock').textContent = G.state === 'setup' ? '' : fmt(left / 1000);
  if (G.state === 'wait') {
    if (now > G.endAt) return finish();
    const faceOk = !sensor.V || (sensor.st.face && !sensor.st.absent);
    if (now - G.lastAct > 12000 && now - G.invitedAt > 20000 && faceOk) {
      G.invitedAt = now; G.lastAct = now;
      const copyable = sensor.stream ? G.segs.filter(s => (s.label === 'wave' || s.label === 'smile') && s.end - s.start >= 1.5) : [];
      if (copyable.length && Math.random() < 0.7) imitate(pickOne(copyable));
      else playSeg(pickSeg('invite'));
    }
  }
  if (G.state === 'sleep' && now > G.endAt) finish();
  if (settings.debug) renderDebug();
}
function renderDebug() {
  const st = sensor.st, f = st.face;
  $('dbgText').textContent = [
    `상태 ${G.state}  모델 ${sensor.V ? 'O' : 'X'}`,
    `얼굴 ${f ? 'O ' + Math.round(f.area * 100) + '%' : 'X'}  웃음 ${(st.smile || 0).toFixed(2)}`,
    `손 ${st.hands || 0}  움직임 ${(st.mot || 0).toFixed(3)} (평균 ${(st.motAvg || 0).toFixed(3)})`,
    `소리 ${(st.level || 0).toFixed(3)} / 바닥 ${(st.floor || 0).toFixed(3)} ${sensor.listen ? '듣는 중' : '쉼'}`,
    `마지막 ${st.lastType || '-'}  반응 ${st.events || 0}회`,
  ].join('\n');
}
async function finish() {
  if (G.state === 'end' || G.ending) { if (G.state !== 'end' && G.ending) showEnd(); return; }
  G.ending = true;
  const s = pickSeg('bye');
  if (s && G.state !== 'sleep') { $('sleep').hidden = true; stageEl.className = ''; await playSeg(s, showEnd); }
  else showEnd();
}
function showEnd() {
  G.state = 'end'; G.segToken++; mv.pause(); sensor.stop(); $('play').classList.remove('imitating');
  try { G.wake?.release(); } catch (e) {} G.wake = null;
  const s = G.stats, parts = [];
  if (s.smile) parts.push(`웃음 ${s.smile}번`); if (s.wave) parts.push(`손짓 ${s.wave}번`); if (s.vocal) parts.push(`옹알이 ${s.vocal}번`); if (s.touch) parts.push(`터치 ${s.touch}번`); if (s.copy) parts.push(`따라 하기 ${s.copy}번`);
  $('endStats').textContent = parts.length ? `오늘 아기가 보낸 신호: ${parts.join(', ')}` : '';
  $('end').hidden = false; $('clock').textContent = ''; $('dbg').hidden = true;
  audio.chime([783.99, 659.25, 523.25], 0.18, 0.12);
}

async function openPlay() {
  const ready = clips.filter(c => c.status === 'ready' && c.use !== false && c.segs.length);
  if (!ready.length) return toast('먼저 영상을 골라 주세요.');
  audio.unlock();
  G.clips = ready; G.segs = ready.flatMap(c => c.segs.map(s => ({ ...s, clipId: c.id })));
  G.recent = []; G.state = 'setup'; G.ending = false; G.clipId = null; G.stats = { smile: 0, wave: 0, vocal: 0, look: 0 };
  $('play').hidden = false; $('setup').hidden = false; $('end').hidden = true; $('sleep').hidden = true;
  $('cam').hidden = !settings.mirror; $('dbg').hidden = !settings.debug;
  stageEl.className = ''; document.body.style.overflow = 'hidden';
  setCheck('ckCam', '카메라 준비 중…'); setCheck('ckModel', '인식 모델 불러오는 중…'); setCheck('ckFace', '얼굴 찾는 중…');
  useClip(ready[0].id).then(() => seekTo(mv, ready[0].restT || 0));

  sensor.handlers.clear(); sensor.handlers.add(onSense); sensor.V = null;
  try {
    await sensor.start([$('camBig'), $('cam')]);
    setCheck('ckCam', '카메라 켜짐', 'ok');
  } catch (e) {
    setCheck('ckCam', '카메라를 쓸 수 없어요. 브라우저 설정에서 카메라를 허용하면 표정과 손짓에 반응해요. 지금은 화면 터치에만 반응해요.', 'bad');
    $('cam').hidden = true;
  }
  loadVision().then(V => {
    sensor.V = V;
    setCheck('ckModel', V ? '얼굴·손 인식 준비됨' : '인식 모델을 못 불러와서 움직임과 소리로만 반응해요', V ? 'ok' : 'bad');
  });
  clearInterval(G.tick); G.tick = setInterval(() => { heartbeat(); if (G.state === 'setup') updateSetup(); }, 200);
}
function setCheck(id, text, cls = '') { const el = $(id); el.textContent = text; el.className = cls; }
function updateSetup() {
  const f = sensor.st.face, box = $('faceBox');
  if (!sensor.V) { box.hidden = true; return; }
  if (f) {
    setCheck('ckFace', '얼굴이 보여요', 'ok');
    box.hidden = false;
    // The preview is a mirrored square crop (object-fit: cover) of the camera frame.
    const cam = $('camBig'), vw = cam.videoWidth || 1, vh = cam.videoHeight || 1, side = Math.min(vw, vh);
    const ox = (vw - side) / 2 / vw, oy = (vh - side) / 2 / vh, sx = vw / side, sy = vh / side;
    const x = (f.box.x - ox) * sx, y = (f.box.y - oy) * sy, w = f.box.w * sx, h = f.box.h * sy;
    Object.assign(box.style, { left: (1 - x - w) * 100 + '%', top: y * 100 + '%', width: w * 100 + '%', height: h * 100 + '%' });
  } else { setCheck('ckFace', '얼굴 찾는 중… 아기 얼굴이 화면 가운데 오게 해 주세요'); box.hidden = true; }
}
$('start').addEventListener('click', openPlay);
$('go').addEventListener('click', async () => {
  audio.unlock();
  // Unlock sound on the main video inside this tap so later reactions can play with sound.
  try { mv.muted = false; const p = mv.play(); if (p) await p.catch(() => {}); mv.pause(); } catch (e) {}
  try { G.wake = await navigator.wakeLock?.request('screen'); } catch (e) {}
  try { await document.documentElement.requestFullscreen?.({ navigationUI: 'hide' }); } catch (e) {}
  $('cam').srcObject = sensor.stream; $('cam').play().catch(() => {});
  $('setup').hidden = true;
  G.endAt = performance.now() + settings.minutes * 60000; G.invitedAt = performance.now();
  audio.chime([523.25, 659.25, 783.99], 0.1, 0.14);
  const first = pickSeg('look');
  if (first) playSeg(first); else enterWait(G.clips[0].id);
});
function closePlay() {
  G.state = 'idle'; G.segToken++; clearInterval(G.tick); sensor.stop(); mv.pause(); $('play').classList.remove('imitating');
  try { G.wake?.release(); } catch (e) {} G.wake = null;
  try { if (document.fullscreenElement) document.exitFullscreen(); } catch (e) {}
  $('play').hidden = true; document.body.style.overflow = ''; renderHome();
}
$('setupBack').addEventListener('click', closePlay);
$('endBack').addEventListener('click', closePlay);

let holdTimer;
const lock = $('lock');
lock.addEventListener('pointerdown', e => {
  e.preventDefault(); lock.classList.add('holding'); $('lockTip').hidden = false;
  holdTimer = setTimeout(() => { lock.classList.remove('holding'); $('lockTip').hidden = true; closePlay(); }, 1500);
});
['pointerup', 'pointerleave', 'pointercancel'].forEach(t => lock.addEventListener(t, () => { clearTimeout(holdTimer); lock.classList.remove('holding'); setTimeout(() => ($('lockTip').hidden = true), 900); }));
lock.addEventListener('contextmenu', e => e.preventDefault());

// Touching the screen is also a signal: it keeps the play contingent even without a camera.
let lastTouch = 0;
stageEl.addEventListener('pointerdown', e => {
  const now = performance.now(); if (now - lastTouch < 1500) return; lastTouch = now;
  if (G.state === 'wait' || G.state === 'sleep' || G.state === 'imitate') { G.stats.touch = (G.stats.touch || 0) + 1; onSense('touch'); }
});
$('dbg').addEventListener('click', e => {
  const b = e.target.closest('[data-ev]'); if (!b) return;
  if (b.dataset.ev === 'copy') {
    if (G.state !== 'wait') return;
    const pool = G.segs.filter(s => s.label === 'wave' || s.label === 'smile');
    return void imitate(pickOne(pool.length ? pool : G.segs));
  }
  sensor.emit(b.dataset.ev, true);
});
document.addEventListener('keydown', e => {
  if (!settings.debug || $('play').hidden) return;
  const m = { 1: 'smile', 2: 'wave', 3: 'vocal', 4: 'look', 5: 'away' }[e.key]; if (m) sensor.emit(m, true);
});
document.addEventListener('visibilitychange', async () => {
  if (document.hidden) { if (G.state === 'react' || G.state === 'wait') mv.pause(); }
  else if (G.state !== 'idle' && G.state !== 'end') { try { G.wake = await navigator.wakeLock?.request('screen'); } catch (e) {} }
});

/* =============================== boot =============================== */
(async () => {
  await store.init();
  try { clips = await store.clips(); } catch (e) { clips = []; }
  for (const c of clips) if (c.status === 'analyzing' || c.status === 'queued') { c.status = 'queued'; queue.push(c.id); }
  renderHome(); runQueue();
  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
  // Warm the models in the background so the first analysis starts quickly.
  setTimeout(() => loadVision(), 800);
})();
