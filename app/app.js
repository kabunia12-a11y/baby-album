// 아기 앨범 — three back-and-forth games built from short clips the parent records with on-screen cues.
// Everything runs on the device: recording, face/hand recognition, sound level.

const $ = id => document.getElementById(id);
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

/* =============================== settings =============================== */
const settings = { name: '', mirror: true, mic: true, debug: false };
try { Object.assign(settings, JSON.parse(localStorage.getItem('baby-album-cam') || '{}')); } catch (e) {}
const saveSettings = () => { try { localStorage.setItem('baby-album-cam', JSON.stringify(settings)); } catch (e) {} };

const babyName = () => settings.name.trim() || '우리 아기';
// Korean vocative: 하늘 → 하늘아, 서아 → 서아야.
function callName() {
  const n = babyName(), c = n.charCodeAt(n.length - 1);
  if (c < 0xAC00 || c > 0xD7A3) return n + '야';
  return n + ((c - 0xAC00) % 28 ? '아' : '야');
}

/* =============================== the three games =============================== */
// Each step is one short clip. `role` is how the game uses it; `do` and `say` are the on-screen cue.
const GAP_MS = 1700;
const GAMES = {
  peek: {
    title: '까꿍 놀이', icon: '🙈', baby: ['화면 터치', '소리'],
    how: '엄마가 얼굴을 가리고 기다려요. 아기가 화면을 톡 치거나 소리를 내면 "까꿍!" 하고 나타나요.',
    tips: ['두 손으로 얼굴을 가린 채 기다리다가, "띵" 소리가 나면 손을 내려요.', '나타날 때는 크게, 활짝 웃어 주세요.'],
    steps() {
      const hide = ['엄마 어디 있지~?', '어디 갔을까~?', '엄마 없다~', '어디 있~게?', '엄마 숨었다~'];
      const show = ['까꿍!', '여기 있지!', `${callName()}, 까꿍!`, '엄마 찾았다!', '짠! 여기 있네!'];
      return hide.flatMap((h, i) => [
        { role: 'hide', i, do: '두 손으로 얼굴을 가리고 말해요', say: h, note: '말한 뒤 가린 채로 기다려요. "띵" 하면 손을 내려요.', dur: 3.6 },
        { role: 'reveal', i, do: '손을 활짝 내리며 크게 웃어요', say: show[i], dur: 2.6 },
      ]);
    },
  },
  copy: {
    title: '따라 해 봐', icon: '👏', baby: ['몸짓', '화면 터치'],
    how: '엄마가 몸짓을 보여 주고 "너도 해 봐!" 하고 기다려요. 아기가 따라 움직이면 엄마가 칭찬해요.',
    tips: ['몸짓은 크고 천천히, 화면 안에서 해 주세요.', '"해 봐!" 다음에는 기대하는 얼굴로 조용히 기다려요.'],
    steps() {
      const acts = [
        { do: '손뼉을 치며', say: '짝짝짝!' }, { do: '손을 흔들며', say: '빠이빠이~' },
        { do: '두 팔을 번쩍 올리며', say: '만세!' }, { do: '두 팔로 머리 위에 하트를 만들며', say: '사랑해~' },
      ];
      const praise = [['박수를 치며', '우와, 잘했다!'], ['엄지를 척 올리며', '최고!'], ['활짝 웃으며', '그렇지~ 잘한다!'], ['두 손을 모으며', '멋지다!']];
      return acts.flatMap((a, i) => [
        { role: 'demo', i, do: a.do + ' 크게 보여 줘요', say: a.say + ' ' + a.say, dur: 4 },
        { role: 'wait', i, do: '말한 뒤 기대하는 얼굴로 조용히 기다려요', say: `${babyName()}도 해 봐!`, dur: 4 },
        { role: 'praise', i, do: praise[i][0], say: praise[i][1], dur: 2.6 },
      ]);
    },
  },
  talk: {
    title: '이야기 주고받기', icon: '💬', baby: ['옹알이', '화면 터치'],
    how: '엄마가 묻고 귀 기울여 기다려요. 아기가 옹알이하면 엄마가 "그랬어?" 하고 대답해요.',
    tips: ['"듣는 얼굴" 차례에는 말하지 말고 눈을 맞춘 채 미소만 지어요.', '질문은 짧고 다정하게, 아기에게 하듯이.'],
    steps() {
      const listen = i => ({ role: 'listen', i, do: '말없이 듣는 얼굴로 기다려요', say: '', note: '눈을 맞추고, 고개를 살짝 기울이고, 미소', dur: 4.5 });
      return [
        { role: 'hello', i: 0, do: '손을 흔들며 반갑게', say: `${callName()}, 안녕!`, dur: 3 },
        { role: 'ask', i: 0, do: '눈을 맞추고 다정하게 물어요', say: '오늘 뭐 하고 놀았어?', dur: 3.2 },
        listen(0),
        { role: 'answer', i: 0, do: '고개를 끄덕이며', say: '그랬어?', dur: 2.6 },
        { role: 'ask', i: 1, do: '눈을 맞추고 다정하게 물어요', say: '맘마 먹었어?', dur: 3.2 },
        { role: 'answer', i: 1, do: '놀란 얼굴로', say: '우와~ 정말?', dur: 2.6 },
        { role: 'ask', i: 2, do: '눈을 맞추고 다정하게 물어요', say: '멍멍이는 뭐라고 해?', dur: 3.2 },
        listen(1),
        { role: 'answer', i: 2, do: '고개를 끄덕이며', say: '그렇구나~', dur: 2.6 },
        { role: 'ask', i: 3, do: '눈을 맞추고 다정하게 물어요', say: '엄마 좋아?', dur: 3.2 },
        { role: 'answer', i: 3, do: '활짝 웃으며', say: '엄마도 좋아!', dur: 2.6 },
        { role: 'bye', i: 0, do: '손을 흔들며', say: '안녕~ 또 놀자!', dur: 3 },
      ];
    },
  },
};
const recSeconds = id => { const s = GAMES[id].steps(); return Math.round(s.reduce((a, x) => a + x.dur, 0) + (s.length - 1) * GAP_MS / 1000 + 3); };

/* =============================== storage =============================== */
const store = {
  db: null, mem: { sets: new Map(), blobs: new Map() },
  async init() {
    try {
      this.db = await new Promise((res, rej) => {
        const r = indexedDB.open('baby-album-play', 1);
        r.onupgradeneeded = () => { r.result.createObjectStore('sets', { keyPath: 'id' }); r.result.createObjectStore('blobs'); };
        r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
        setTimeout(() => rej(new Error('timeout')), 4000);
      });
      try { navigator.storage?.persist?.(); } catch (e) {}
    } catch (e) { this.db = null; $('storeWarn').hidden = false; }
    // The first version kept copies of album videos; this version no longer uses them.
    try { if (!localStorage.getItem('baby-album-v2')) { indexedDB.deleteDatabase('baby-album-cam'); localStorage.setItem('baby-album-v2', '1'); } } catch (e) {}
  },
  tx(name, mode, fn) {
    return new Promise((res, rej) => {
      const t = this.db.transaction(name, mode); const req = fn(t.objectStore(name));
      t.oncomplete = () => res(req && req.result); t.onerror = () => rej(t.error); t.onabort = () => rej(t.error);
    });
  },
  async sets() { return this.db ? this.tx('sets', 'readonly', s => s.getAll()) : [...this.mem.sets.values()]; },
  async putSet(x) { if (!this.db) return void this.mem.sets.set(x.id, x); await this.tx('sets', 'readwrite', s => s.put(x)); },
  // Safari rejects File/Blob values in IndexedDB, so store raw bytes.
  // If that still fails (quota, private mode), keep the clip in memory for this session.
  async putBlob(k, b) {
    if (!this.db) { this.mem.blobs.set(k, b); return false; }
    try {
      const rec = { buf: await b.arrayBuffer(), type: b.type || 'video/mp4' };
      await this.tx('blobs', 'readwrite', s => s.put(rec, k));
      this.mem.blobs.delete(k);
      return true;
    } catch (e) {
      console.warn('blob store failed', e);
      this.mem.blobs.set(k, b);
      return false;
    }
  },
  async getBlob(k) {
    if (this.mem.blobs.has(k)) return this.mem.blobs.get(k);
    if (!this.db) return undefined;
    const v = await this.tx('blobs', 'readonly', s => s.get(k));
    return v && v.buf ? new Blob([v.buf], { type: v.type }) : v;
  },
};
const urls = new Map();
async function urlFor(k) {
  if (urls.has(k)) return urls.get(k);
  const b = await store.getBlob(k); if (!b) return null;
  const u = URL.createObjectURL(b); urls.set(k, u); return u;
}
function dropUrl(k) { if (urls.has(k)) { URL.revokeObjectURL(urls.get(k)); urls.delete(k); } }

/* =============================== vision (MediaPipe, on device) =============================== */
const MP = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14';
const FACE_MODEL = 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';
const HAND_MODEL = 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';
let lastTs = 0;
const ts = () => (lastTs = Math.max(Math.round(performance.now()), lastTs + 1));
let visionP = null, visionMode = null;
function loadVision(only) {
  if (only && visionMode !== only) { visionP = null; visionMode = only; }
  if (!visionP) visionP = (async () => {
    // The MediaPipe wasm build logs through a global `dbg` it never defines; without it, model setup throws.
    if (typeof globalThis.dbg !== 'function') globalThis.dbg = () => {};
    const m = await import(`${MP}/vision_bundle.mjs`);
    const fs = await m.FilesetResolver.forVisionTasks(`${MP}/wasm`);
    let used = null;
    const make = async (Cls, path, extra) => {
      let err;
      for (const delegate of only ? [only] : ['GPU', 'CPU']) {
        try { const r = await Cls.createFromOptions(fs, { baseOptions: { modelAssetPath: path, delegate }, runningMode: 'VIDEO', ...extra }); used = used || delegate; return r; }
        catch (e) { err = e; }
      }
      throw err;
    };
    const face = await make(m.FaceLandmarker, FACE_MODEL, { numFaces: 2, outputFaceBlendshapes: true, minFaceDetectionConfidence: 0.4, minFacePresenceConfidence: 0.4 });
    let hand = null;
    try { hand = await make(m.HandLandmarker, HAND_MODEL, { numHands: 2, minHandDetectionConfidence: 0.4 }); } catch (e) { console.warn('hand model unavailable', e); }
    return { face, hand, delegate: used };
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

/* =============================== live sensing (front camera + mic) =============================== */
const sensor = {
  on: false, stream: null, V: null, motion: null, ac: null, an: null, buf: null, listen: false, handlers: new Set(), frame: 0, timer: 0,
  st: {},
  reset() {
    this.st = { face: null, lastFace: 0, smile: 0, smileSince: 0, wrists: [], moves: [], hands: 0, mot: 0, motAvg: 0.01,
      level: 0, floor: 0.01, loudSince: 0, lastEv: {}, events: 0 };
  },
  emit(type, force) {
    const now = performance.now(), st = this.st;
    const ref = { smile: 1500, wave: 1200, vocal: 1000 }[type] ?? 800;
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
    // Recognition reads from its own always-rendered video: phone browsers pause a muted video
    // once it is hidden, and the setup preview is hidden as soon as play starts.
    if (!this.src) {
      const v = this.src = document.createElement('video');
      v.muted = true; v.playsInline = true; v.autoplay = true; v.setAttribute('playsinline', ''); v.className = 'sensorSrc';
      document.body.appendChild(v);
    }
    this.src.srcObject = stream; this.src.play().catch(() => {});
    if (stream.getAudioTracks().length) {
      try {
        this.ac = audio.ctx();
        const src = this.ac.createMediaStreamSource(new MediaStream(stream.getAudioTracks()));
        this.an = this.ac.createAnalyser(); this.an.fftSize = 1024; this.buf = new Float32Array(1024); src.connect(this.an);
      } catch (e) { this.an = null; }
    }
    this.on = true; this.cam = this.src; this.fails = 0; this.loop();
  },
  stop() {
    this.on = false; clearTimeout(this.timer);
    if (this.stream) this.stream.getTracks().forEach(t => t.stop());
    this.stream = null; this.an = null;
    if (this.src) this.src.srcObject = null;
  },
  loop() {
    if (!this.on) return;
    const now = performance.now(), st = this.st, cam = this.cam, V = this.V;
    if (cam && cam.paused) cam.play().catch(() => {});
    if (cam && cam.readyState >= 2 && cam.videoWidth) {
      st.mot = this.motion(cam);
      st.motAvg = st.motAvg * 0.97 + st.mot * 0.03;
      if (V) {
        const raw = safeDetect(V.face, cam);
        // Some phones create the GPU model fine but then fail every frame; rebuild it on the CPU once.
        if (!raw && ++this.fails === 30 && V.delegate === 'GPU') { this.V = null; loadVision('CPU').then(nv => { if (this.on) this.V = nv; }); }
        if (raw) this.fails = 0;
        const f = readFace(raw);
        st.face = f;
        if (f) {
          st.lastFace = now; st.smile = f.smile;
          if (f.smile > 0.5) { if (!st.smileSince) st.smileSince = now; if (now - st.smileSince > 280) this.emit('smile'); }
          else st.smileSince = 0;
        } else { st.smile = 0; st.smileSince = 0; }
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
  chime(notes = [659.25, 987.77], gap = 0.12, vol = 0.18, len = 0.55) {
    try {
      const ac = this.ctx(), t = ac.currentTime;
      notes.forEach((f, i) => {
        const o = ac.createOscillator(), g = ac.createGain(), s = t + i * gap;
        o.type = 'sine'; o.frequency.value = f;
        g.gain.setValueAtTime(0.0001, s); g.gain.linearRampToValueAtTime(vol, s + 0.02); g.gain.exponentialRampToValueAtTime(0.001, s + len);
        o.connect(g).connect(ac.destination); o.start(s); o.stop(s + len + 0.05);
      });
    } catch (e) {}
  },
  beep() { this.chime([1318.5], 0, 0.22, 0.16); },
};

/* =============================== home =============================== */
let sets = new Map();
const fmtDate = t => { const d = new Date(t); return `${d.getMonth() + 1}월 ${d.getDate()}일`; };
function renderHome() {
  $('games').innerHTML = Object.entries(GAMES).map(([id, g]) => {
    const s = sets.get(id);
    return `<article class="game${s ? ' ready' : ''}" data-id="${id}">
      <div class="gIcon" aria-hidden="true">${g.icon}</div>
      <div class="gBody">
        <h2>${g.title}</h2>
        <p>${g.how}</p>
        <div class="gMeta">
          <span class="tag">아기는: ${g.baby.join(' · ')}</span>
          ${s ? `<span class="tag done">✓ ${fmtDate(s.created)} 촬영</span>` : `<span class="tag">촬영 약 ${recSeconds(id)}초</span>`}
        </div>
        <div class="gActs">
          ${s ? `<button class="btn primary" type="button" data-act="play">놀기</button><button class="btn sm ghost" type="button" data-act="rec">다시 찍기</button>`
              : `<button class="btn primary" type="button" data-act="rec">🎥 영상 찍기</button>`}
        </div>
      </div>
    </article>`;
  }).join('');
}
$('games').addEventListener('click', e => {
  const b = e.target.closest('[data-act]'); if (!b) return;
  const id = b.closest('.game').dataset.id;
  if (b.dataset.act === 'rec') openRec(id); else openPlay(id);
});

$('optName').value = settings.name;
$('optName').addEventListener('input', e => { settings.name = e.target.value; saveSettings(); });
for (const [id, key] of [['optMirror', 'mirror'], ['optMic', 'mic'], ['optDebug', 'debug']]) {
  $(id).checked = settings[key];
  $(id).addEventListener('change', e => { settings[key] = e.target.checked; saveSettings(); });
}

/* =============================== guided recording =============================== */
// Each step is recorded as its own short clip, so play can start any piece instantly without seeking.
const R = { id: null, steps: [], clips: [], stream: null, run: 0, mime: '' };
function pickMime() {
  if (!window.MediaRecorder) return null;
  for (const m of ['video/mp4;codecs=avc1,mp4a.40.2', 'video/mp4', 'video/webm;codecs=vp8,opus', 'video/webm']) {
    try { if (MediaRecorder.isTypeSupported(m)) return m; } catch (e) {}
  }
  return '';
}
async function openRec(id) {
  const g = GAMES[id];
  R.id = id; R.steps = g.steps(); R.clips = []; R.run++;
  $('rec').hidden = false; $('recIntro').hidden = false; $('recDone').hidden = true; $('cue').hidden = true; $('recStep').textContent = '';
  document.body.style.overflow = 'hidden';
  $('recIcon').textContent = g.icon; $('recTitle').textContent = g.title + ' 찍기';
  $('recLen').textContent = `조각 ${R.steps.length}개 · 약 ${recSeconds(id)}초`;
  $('recTips').innerHTML = ['폰을 눈높이에 세우고, 화면 위쪽 카메라 렌즈를 보며 말해요.', '얼굴과 손이 화면에 다 들어오게, 밝은 곳에서 찍어요.', ...g.tips, '틀려도 괜찮아요. 안내 글자만 따라 하면 돼요.']
    .map(t => `<li>${t}</li>`).join('');
  $('recErr').hidden = true; $('recStart').disabled = true;
  R.mime = pickMime();
  if (R.mime === null) return recError('이 브라우저는 촬영을 지원하지 않아요. iPhone은 Safari, 안드로이드는 Chrome에서 열어 주세요.');
  try {
    if (!R.stream) R.stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: { echoCancellation: true, noiseSuppression: true },
    });
    $('recCam').srcObject = R.stream; $('recCam').play().catch(() => {});
    $('recStart').disabled = false;
  } catch (e) {
    recError('카메라와 마이크를 쓸 수 없어요. 브라우저 설정에서 이 사이트의 카메라·마이크를 허용해 주세요.');
  }
}
function recError(msg) { $('recErr').textContent = msg; $('recErr').hidden = false; $('recStart').disabled = true; }
function closeRec() {
  R.run++;
  if (R.stream) R.stream.getTracks().forEach(t => t.stop());
  R.stream = null; $('recCam').srcObject = null;
  const pv = $('recPrev'); pv.pause(); pv.removeAttribute('src'); pv.load();
  $('rec').hidden = true; document.body.style.overflow = '';
  renderHome();
}
function cueBar(ms) {
  const i = $('cueBar'); i.style.transition = 'none'; i.style.width = '0%';
  void i.offsetWidth; i.style.transition = `width ${ms}ms linear`; i.style.width = '100%';
}
function setCue(step, { state, live = false, next = null, count = null }) {
  $('cue').hidden = false; $('cue').classList.toggle('live', live);
  $('cueState').textContent = state; $('cueState').className = 'cueState' + (live ? ' live' : '');
  $('cueCount').hidden = count == null; $('cueCount').textContent = count ?? '';
  $('cueDo').textContent = step.do;
  $('cueSay').textContent = step.say ? `“${step.say}”` : '';
  $('cueNote').textContent = step.note || '';
  $('cueNext').textContent = next ? `다음: ${next.do}${next.say ? ` “${next.say}”` : ''}` : '';
}
function recordFor(ms) {
  return new Promise((res, rej) => {
    let mr;
    try { mr = new MediaRecorder(R.stream, R.mime ? { mimeType: R.mime, videoBitsPerSecond: 2500000 } : undefined); }
    catch (e) { try { mr = new MediaRecorder(R.stream); } catch (e2) { return rej(e2); } }
    const chunks = [];
    mr.ondataavailable = e => { if (e.data && e.data.size) chunks.push(e.data); };
    mr.onstop = () => res(new Blob(chunks, { type: (mr.mimeType || R.mime || 'video/webm').split(';')[0] }));
    mr.onerror = e => rej(e.error || e);
    mr.start();
    setTimeout(() => { try { mr.stop(); } catch (e) { res(new Blob(chunks)); } }, ms);
  });
}
async function runRec() {
  const run = ++R.run, steps = R.steps;
  audio.unlock();
  $('recIntro').hidden = true; $('recDone').hidden = true; R.clips = [];
  for (let k = 3; k > 0; k--) {
    setCue(steps[0], { state: '곧 시작해요', count: k }); $('recStep').textContent = `1 / ${steps.length}`;
    cueBar(1000); audio.chime([880], 0, 0.12, 0.12);
    await wait(1000); if (run !== R.run) return;
  }
  for (let i = 0; i < steps.length; i++) {
    const s = steps[i];
    $('recStep').textContent = `${i + 1} / ${steps.length}`;
    if (i > 0) {
      // Short unrecorded pause to read the next cue; the beep marks the moment recording starts.
      setCue(s, { state: '준비하세요' }); cueBar(GAP_MS);
      await wait(GAP_MS - 380); if (run !== R.run) return;
      audio.beep(); await wait(380); if (run !== R.run) return;
    }
    setCue(s, { state: '지금!', live: true, next: steps[i + 1] }); cueBar(s.dur * 1000);
    let blob;
    try { blob = await recordFor(s.dur * 1000); }
    catch (e) { if (run === R.run) { toast('촬영 중 문제가 생겼어요. 다시 시도해 주세요.'); openRec(R.id); } return; }
    if (run !== R.run) return;
    R.clips.push(blob);
  }
  $('cue').hidden = true; $('recStep').textContent = '';
  audio.chime([523.25, 659.25, 783.99], 0.1, 0.14);
  await saveRec();
}
async function saveRec() {
  const id = R.id, out = [];
  let unsaved = 0;
  for (let i = 0; i < R.clips.length; i++) {
    const key = `${id}:${i}`; dropUrl(key);
    if (!(await store.putBlob(key, R.clips[i]))) unsaved++;
    const s = R.steps[i];
    out.push({ role: s.role, i: s.i, key, say: s.say });
  }
  const set = { id, created: Date.now(), steps: out, temp: unsaved > 0 };
  try { await store.putSet(set); } catch (e) { store.mem.sets.set(id, set); }
  sets.set(id, set);
  $('recSaved').textContent = unsaved
    ? '이 기기에 저장하지 못해서 지금만 쓸 수 있어요. 창을 닫으면 다시 찍어야 해요.'
    : `조각 ${out.length}개를 이 기기에 저장했어요. 이제 아기와 놀 수 있어요.`;
  const pv = $('recPrev'); pv.removeAttribute('src');
  $('recDone').hidden = false;
}
async function reviewRec() {
  const run = R.run, pv = $('recPrev');
  for (const b of R.clips) {
    if (run !== R.run || $('recDone').hidden) return;
    const u = URL.createObjectURL(b); pv.src = u; pv.muted = false;
    try { await pv.play(); } catch (e) {}
    await once(pv, 'ended', 8000); URL.revokeObjectURL(u);
  }
}
$('recStart').addEventListener('click', runRec);
$('recBack').addEventListener('click', closeRec);
$('recClose').addEventListener('click', () => { if (!$('cue').hidden) { toast('촬영을 멈췄어요. 저장하지 않았어요.'); openRec(R.id); } else closeRec(); });
$('recAgain').addEventListener('click', () => openRec(R.id));
$('recHome').addEventListener('click', closeRec);
$('recReview').addEventListener('click', reviewRec);
$('recPlay').addEventListener('click', () => { const id = R.id; closeRec(); openPlay(id); });

/* =============================== player: three preloaded video slots =============================== */
// A reaction has to start the instant the baby acts, so the next clips are always loaded ahead.
const P = {
  els: [...document.querySelectorAll('#stage .pv')], cur: null, endFn: null,
  async prep(key) {
    let el = this.els.find(e => e._key === key);
    if (!el) {
      el = this.els.filter(e => e !== this.cur).sort((a, b) => (a._used || 0) - (b._used || 0))[0];
      el._key = key; el._ready = (async () => { const u = await urlFor(key); if (el._key !== key || !u) return; el.src = u; el.load(); await once(el, 'loadeddata', 3000); })();
    }
    el._used = performance.now();
    return el;
  },
  async show(key, { muted = false, loop = false } = {}) {
    const el = await this.prep(key); await el._ready;
    if (this.endFn) this.endFn();
    el._holding = false; el.onended = null; el.loop = loop; el.muted = muted;
    try { el.currentTime = 0; } catch (e) {}
    try { await el.play(); } catch (e) { el.muted = true; try { await el.play(); } catch (e2) {} }
    for (const o of this.els) if (o !== el) { o.classList.remove('on'); o.pause(); }
    el.classList.add('on'); this.cur = el;
    if (loop) return;
    return new Promise(res => {
      const fin = () => { el.removeEventListener('ended', fin); clearTimeout(t); if (this.endFn === fin) this.endFn = null; res(); };
      const d = isFinite(el.duration) && el.duration ? el.duration : 6;
      const t = setTimeout(fin, d * 1000 + 1500);
      el.addEventListener('ended', fin); this.endFn = fin;
    });
  },
  // After a clip plays once with sound, keep its last moment softly looping (muted) while the baby takes a turn.
  holdTail(sec = 1.8) {
    const el = this.cur; if (!el) return;
    el.muted = true; el._holding = true;
    const from = Math.max(0, (isFinite(el.duration) ? el.duration : 0) - sec);
    const again = () => { if (this.cur !== el || !el._holding) return; try { el.currentTime = from; } catch (e) {} el.play().catch(() => {}); };
    el.onended = again; again();
  },
  stop() { if (this.endFn) this.endFn(); for (const e of this.els) { e._holding = false; e.pause(); e.classList.remove('on'); } this.cur = null; },
  clear() { this.stop(); for (const e of this.els) { e._key = null; e.removeAttribute('src'); e.load(); } },
};

/* =============================== turn-taking =============================== */
const G = { state: 'idle', id: null, set: null, run: 0, waiter: null, stats: {} };
const alive = run => run === G.run && G.state === 'play';
// Waits for one of the baby's signals (or a timeout) while the screen shows it is the baby's turn.
function babyTurn(types, ms, hint) {
  return new Promise(res => {
    $('play').classList.add('turn');
    if (hint === 'mirror') $('play').classList.add('imitating');
    else if (hint) { $('hint').textContent = hint; $('hint').hidden = false; }
    sensor.listen = types.includes('vocal');
    const done = v => {
      clearTimeout(t); if (G.waiter === w) G.waiter = null;
      $('play').classList.remove('turn', 'imitating'); $('hint').hidden = true; sensor.listen = false;
      res(v);
    };
    const w = { types, done, since: performance.now() };
    const t = setTimeout(() => done('timeout'), ms);
    G.waiter = w;
  });
}
function signal(type) {
  const w = G.waiter; if (!w || !w.types.includes(type)) return;
  if (performance.now() - w.since < 400) return; // ignore leftovers from the clip that just ended
  G.stats[type] = (G.stats[type] || 0) + 1; G.stats.turns = (G.stats.turns || 0) + 1;
  cheer(type);
  w.done(type);
}
const POP = { smile: '😊', wave: '👋', vocal: '🎵', touch: '✨' };
function cheer(type) {
  const e = POP[type] || '✨', cam = $('cam'), r = cam.getBoundingClientRect(), vis = !cam.hidden && r.width && type !== 'touch';
  const p = document.createElement('div'); p.className = 'pop'; p.textContent = e;
  p.style.left = (vis ? r.left + r.width / 2 : (G.touchX ?? window.innerWidth / 2)) + 'px';
  p.style.top = (vis ? r.top : (G.touchY ?? window.innerHeight * 0.6)) + 'px';
  $('pops').appendChild(p); setTimeout(() => p.remove(), 1150);
  if (vis) { cam.classList.add('hit'); setTimeout(() => cam.classList.remove('hit'), 700); }
  audio.chime([659.25, 880], 0.08, 0.12);
}
function burst() {
  const x = window.innerWidth / 2, y = window.innerHeight / 2;
  for (let k = 0; k < 12; k++) {
    const st = document.createElement('div'); st.className = 'star'; st.textContent = '★';
    const a = (k / 12) * Math.PI * 2, d = 90 + Math.random() * 80;
    st.style.left = x + 'px'; st.style.top = y + 'px';
    st.style.setProperty('--dx', Math.cos(a) * d + 'px'); st.style.setProperty('--dy', Math.sin(a) * d + 'px');
    $('pops').appendChild(st); setTimeout(() => st.remove(), 950);
  }
}
const byRole = (set, role) => set.steps.filter(s => s.role === role).sort((a, b) => a.i - b.i);

// 까꿍: hidden face waits → baby acts → instant "까꿍!". Same action, same result, every time.
async function gamePeek(set, run) {
  const hides = byRole(set, 'hide'), reveals = byRole(set, 'reveal');
  const rounds = Math.max(hides.length, 1) + 3;
  for (let r = 0; r < rounds; r++) {
    const h = hides[r % hides.length], v = reveals[r % reveals.length], nh = hides[(r + 1) % hides.length];
    await P.show(h.key); if (!alive(run)) return;
    P.holdTail(); P.prep(v.key); P.prep(nh.key);
    let ev = 'timeout';
    for (let n = 0; n < 3 && ev === 'timeout'; n++) {
      ev = await babyTurn(['touch', 'vocal', 'smile', 'wave'], 8000, '👆');
      if (!alive(run)) return;
      // No answer: ask again ("엄마 어디 있지~?"). After the third try, reveal anyway so the game never stalls.
      if (ev === 'timeout' && n < 2) { await P.show(h.key); if (!alive(run)) return; P.holdTail(); }
    }
    if (ev !== 'timeout') burst();
    await P.show(v.key); if (!alive(run)) return;
  }
}
// 따라 해 봐: show a gesture → "너도 해 봐!" → the baby's own face grows big → any try gets praise.
async function gameCopy(set, run) {
  const demos = byRole(set, 'demo'), waits = byRole(set, 'wait'), praises = byRole(set, 'praise');
  for (let pass = 0; pass < 2; pass++) {
    for (let i = 0; i < demos.length; i++) {
      const d = demos[i], w = waits[i % waits.length], p = praises[(i + pass) % praises.length];
      P.prep(d.key); P.prep(w.key);
      await P.show(d.key); if (!alive(run)) return;
      let ev = 'timeout';
      for (let n = 0; n < 2 && ev === 'timeout'; n++) {
        P.prep(p.key);
        await P.show(w.key); if (!alive(run)) return;
        P.holdTail(2.2);
        ev = await babyTurn(['wave', 'smile', 'touch', 'vocal'], 9000, 'mirror');
        if (!alive(run)) return;
        if (ev === 'timeout' && n === 0) { await P.show(d.key); if (!alive(run)) return; }
      }
      if (ev !== 'timeout') { burst(); audio.chime([523.25, 659.25, 783.99, 1046.5], 0.09, 0.15); await P.show(p.key); if (!alive(run)) return; }
    }
  }
}
// 이야기 주고받기: question → listening face → the baby babbles → mom answers → next question.
async function gameTalk(set, run) {
  const [hello] = byRole(set, 'hello'), asks = byRole(set, 'ask'), listens = byRole(set, 'listen'), answers = byRole(set, 'answer'), [bye] = byRole(set, 'bye');
  if (hello) { P.prep(asks[0]?.key); await P.show(hello.key); if (!alive(run)) return; }
  let ai = 0;
  for (let i = 0; i < asks.length; i++) {
    const L = listens[i % listens.length];
    P.prep(L.key);
    await P.show(asks[i].key); if (!alive(run)) return;
    let ev = 'timeout';
    for (let n = 0; n < 2 && ev === 'timeout'; n++) {
      const ans = answers[ai % answers.length]; P.prep(ans.key);
      await P.show(L.key, { muted: true, loop: true }); if (!alive(run)) return;
      ev = await babyTurn(['vocal', 'touch'], 9000, settings.mic ? '🎵' : '👆');
      if (!alive(run)) return;
      if (ev !== 'timeout') { await P.show(ans.key); ai++; if (!alive(run)) return; }
      else if (n === 0) { await P.show(asks[i].key); if (!alive(run)) return; }
    }
    if (asks[i + 1]) P.prep(asks[i + 1].key);
  }
  if (bye) await P.show(bye.key);
}
const RUNNERS = { peek: gamePeek, copy: gameCopy, talk: gameTalk };

/* =============================== play screen =============================== */
async function openPlay(id) {
  const set = sets.get(id);
  if (!set) return toast('먼저 영상을 찍어 주세요.');
  audio.unlock();
  G.id = id; G.set = set; G.state = 'setup'; G.stats = {};
  $('play').hidden = false; $('setup').hidden = false; $('end').hidden = true; $('hint').hidden = true;
  $('play').classList.remove('turn', 'imitating');
  $('cam').hidden = !settings.mirror; $('dbg').hidden = !settings.debug;
  $('gameName').textContent = GAMES[id].title; $('setupTitle').textContent = GAMES[id].title + ' — 아기 얼굴이 보이게 세워 주세요';
  document.body.style.overflow = 'hidden';
  setCheck('ckCam', '카메라 준비 중…'); setCheck('ckModel', '인식 모델 불러오는 중…'); setCheck('ckFace', '얼굴 찾는 중…');
  P.clear(); set.steps.slice(0, 3).forEach(s => P.prep(s.key));

  sensor.handlers.clear(); sensor.handlers.add(signal); sensor.V = null;
  try {
    await sensor.start([$('camBig'), $('cam')]);
    setCheck('ckCam', '카메라 켜짐', 'ok');
  } catch (e) {
    setCheck('ckCam', '카메라를 쓸 수 없어서 화면 터치에만 반응해요. 브라우저 설정에서 카메라를 허용하면 몸짓과 소리에도 반응해요.', 'bad');
    $('cam').hidden = true;
  }
  loadVision().then(V => {
    if (G.state === 'idle') return;
    sensor.V = V;
    setCheck('ckModel', V ? '얼굴·손 인식 준비됨' : '인식 모델을 못 불러와서 움직임과 소리로만 반응해요', V ? 'ok' : 'bad');
  });
  clearInterval(G.tick); G.tick = setInterval(tick, 200);
}
function setCheck(id, text, cls = '') { const el = $(id); el.textContent = text; el.className = cls; }
function tick() {
  if (G.state === 'setup') updateSetup();
  $('cam').classList.toggle('seen', !!(sensor.V && sensor.st.face));
  if (settings.debug && G.state !== 'idle') renderDebug();
}
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
function renderDebug() {
  const st = sensor.st, f = st.face;
  $('dbgText').textContent = [
    `놀이 ${G.id}  ${G.state}  ${G.waiter ? '아기 차례: ' + G.waiter.types.join(',') : ''}`,
    `모델 ${sensor.V ? 'O ' + (sensor.V.delegate || '') : 'X'}  얼굴 ${f ? 'O ' + Math.round(f.area * 100) + '%' : 'X'}  웃음 ${(st.smile || 0).toFixed(2)}`,
    `손 ${st.hands || 0}  움직임 ${(st.mot || 0).toFixed(3)} (평균 ${(st.motAvg || 0).toFixed(3)})`,
    `소리 ${(st.level || 0).toFixed(3)} / 바닥 ${(st.floor || 0).toFixed(3)} ${sensor.listen ? '듣는 중' : '쉼'}`,
    `마지막 ${st.lastType || '-'}  반응 ${G.stats.turns || 0}회`,
  ].join('\n');
}
$('go').addEventListener('click', async () => {
  audio.unlock();
  // Unlock sound on every play slot inside this tap so later reactions (triggered by the camera, not a tap) have sound.
  await Promise.allSettled(P.els.map(async el => { if (!el.getAttribute('src')) return; el.muted = false; try { await el.play(); el.pause(); } catch (e) {} }));
  try { G.wake = await navigator.wakeLock?.request('screen'); } catch (e) {}
  try { await document.documentElement.requestFullscreen?.({ navigationUI: 'hide' }); } catch (e) {}
  $('cam').srcObject = sensor.stream; $('cam').play().catch(() => {});
  $('setup').hidden = true;
  startGame();
});
async function startGame() {
  const run = ++G.run; G.state = 'play'; G.stats = {};
  audio.chime([523.25, 659.25, 783.99], 0.1, 0.14);
  await wait(500);
  try { await RUNNERS[G.id](G.set, run); } catch (e) { console.warn('game error', e); }
  if (alive(run)) showEnd();
}
function showEnd() {
  G.state = 'end'; G.run++; P.stop(); sensor.listen = false;
  if (G.waiter) G.waiter.done('abort');
  const s = G.stats, parts = [];
  if (s.touch) parts.push(`터치 ${s.touch}번`); if (s.vocal) parts.push(`옹알이 ${s.vocal}번`); if (s.wave) parts.push(`몸짓 ${s.wave}번`); if (s.smile) parts.push(`웃음 ${s.smile}번`);
  $('endStats').textContent = s.turns ? `아기가 ${s.turns}번 대답했어요 (${parts.join(', ')})` : '';
  $('end').hidden = false;
  audio.chime([783.99, 659.25, 523.25], 0.18, 0.12);
}
function closePlay() {
  G.state = 'idle'; G.run++; clearInterval(G.tick); sensor.stop(); P.clear();
  if (G.waiter) G.waiter.done('abort');
  $('play').classList.remove('turn', 'imitating');
  try { G.wake?.release(); } catch (e) {} G.wake = null;
  try { if (document.fullscreenElement) document.exitFullscreen(); } catch (e) {}
  $('play').hidden = true; document.body.style.overflow = ''; renderHome();
}
$('setupBack').addEventListener('click', closePlay);
$('endBack').addEventListener('click', closePlay);
$('endAgain').addEventListener('click', async () => {
  $('end').hidden = true;
  if (!sensor.on) { try { await sensor.start([$('camBig'), $('cam')]); } catch (e) {} loadVision().then(V => (sensor.V = V)); }
  startGame();
});

let holdTimer;
const lock = $('lock');
lock.addEventListener('pointerdown', e => {
  e.preventDefault(); lock.classList.add('holding'); $('lockTip').hidden = false;
  holdTimer = setTimeout(() => { lock.classList.remove('holding'); $('lockTip').hidden = true; closePlay(); }, 1500);
});
['pointerup', 'pointerleave', 'pointercancel'].forEach(t => lock.addEventListener(t, () => { clearTimeout(holdTimer); lock.classList.remove('holding'); setTimeout(() => ($('lockTip').hidden = true), 900); }));
lock.addEventListener('contextmenu', e => e.preventDefault());

// A tap anywhere on the picture is the baby's most reliable signal.
$('stage').addEventListener('pointerdown', e => { G.touchX = e.clientX; G.touchY = e.clientY; signal('touch'); });
$('dbg').addEventListener('click', e => {
  const b = e.target.closest('[data-ev]'); if (!b) return;
  if (b.dataset.ev === 'touch') { G.touchX = G.touchY = null; signal('touch'); } else sensor.emit(b.dataset.ev, true);
});
document.addEventListener('keydown', e => {
  if (!settings.debug || $('play').hidden) return;
  const m = { 1: 'touch', 2: 'vocal', 3: 'wave', 4: 'smile' }[e.key];
  if (m === 'touch') signal('touch'); else if (m) sensor.emit(m, true);
});
document.addEventListener('visibilitychange', async () => {
  if (document.hidden) return;
  if (G.state === 'play' && P.cur?._holding) P.cur.play().catch(() => {});
  if (G.state === 'play') { try { G.wake = await navigator.wakeLock?.request('screen'); } catch (e) {} }
});

/* =============================== boot =============================== */
(async () => {
  await store.init();
  let list = [];
  try { list = await store.sets(); } catch (e) {}
  sets = new Map(list.filter(s => !s.temp).map(s => [s.id, s]));
  renderHome();
  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
  // Warm the models in the background so play starts quickly.
  setTimeout(() => loadVision(), 1500);
})();
