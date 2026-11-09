'use strict';

/* ---------- Helpers ---------- */
const U = {
  pick: (arr) => arr[Math.floor(Math.random() * arr.length)],
  clamp: (v, a, b) => Math.max(a, Math.min(b, v)),
  esc: (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])),
  uid: () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
  digits: (s) => String(s ?? '').replace(/\D/g, ''),
  fmtPhone(p) {
    const d = U.digits(p);
    return d.length === 10 ? `${d.slice(0, 3)}-${d.slice(3)}` : String(p ?? '');
  },
  telHref: (p) => 'tel:' + String(p).replace(/[^\d+]/g, ''),
  waHref(p, text) {
    let d = U.digits(p);
    if (d.startsWith('0')) d = '972' + d.slice(1);
    return `https://wa.me/${d}?text=${encodeURIComponent(text)}`;
  },
  isIsraeliId(id) {
    if (!/^\d{5,9}$/.test(id)) return false;
    const s = id.padStart(9, '0');
    let sum = 0;
    for (let i = 0; i < 9; i++) {
      const d = +s[i] * ((i % 2) + 1);
      sum += d > 9 ? d - 9 : d;
    }
    return sum % 10 === 0;
  },
  daysUntil(dateStr) {
    if (!dateStr) return null;
    const t = new Date(dateStr + 'T00:00:00');
    if (isNaN(t)) return null;
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    return Math.round((t - now) / 86400000);
  },
  fmtDate(dateStr) {
    const t = new Date(dateStr + 'T00:00:00');
    return isNaN(t) ? '' : t.toLocaleDateString('he-IL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  },
};

/* ---------- Crypto (each wedding file is locked with its own code) ---------- */
const Vault = {
  enc: new TextEncoder(),
  dec: new TextDecoder(),
  ITER: 150000,

  ready: () => !!(window.crypto && crypto.subtle),
  b64(buf) {
    const a = new Uint8Array(buf);
    let s = '';
    for (let i = 0; i < a.length; i += 0x8000) s += String.fromCharCode.apply(null, a.subarray(i, i + 0x8000));
    return btoa(s);
  },
  unb64: (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0)),
  hex: (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join(''),

  base(code) {
    return crypto.subtle.importKey('raw', this.enc.encode(code), 'PBKDF2', false, ['deriveKey', 'deriveBits']);
  },
  async fileKey(code) {
    const bits = await crypto.subtle.deriveBits(
      { name: 'PBKDF2', salt: this.enc.encode('kululu-file-v1'), iterations: this.ITER, hash: 'SHA-256' },
      await this.base(code), 128);
    return this.hex(bits);
  },
  keys: new Map(),
  async aesKey(code, salt) {
    const id = code + '|' + this.b64(salt);
    if (!this.keys.has(id)) {
      this.keys.set(id, crypto.subtle.deriveKey(
        { name: 'PBKDF2', salt, iterations: this.ITER, hash: 'SHA-256' },
        await this.base(code), { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']));
    }
    return this.keys.get(id);
  },
  newSalt: () => crypto.getRandomValues(new Uint8Array(16)),
  async lock(obj, code, salt = this.newSalt()) {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const key = await this.aesKey(code, salt);
    const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, this.enc.encode(JSON.stringify(obj)));
    return { kululu: 1, salt: this.b64(salt), iv: this.b64(iv), data: this.b64(ct) };
  },
  async unlock(box, code) {
    const key = await this.aesKey(code, this.unb64(box.salt));
    const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: this.unb64(box.iv) }, key, this.unb64(box.data));
    return JSON.parse(this.dec.decode(pt));
  },
};

/* ---------- Sound (Web Audio, no files) ---------- */
const Sound = {
  ctx: null,
  master: null,
  muted: localStorage.getItem('kululu_muted') === '1',

  init() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 1;
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
    return this.ctx;
  },

  setMuted(m) {
    this.muted = m;
    localStorage.setItem('kululu_muted', m ? '1' : '0');
    if (this.master) this.master.gain.setTargetAtTime(m ? 0 : 1, this.ctx.currentTime, 0.02);
  },

  tone(freq, dur = 0.15, opt = {}) {
    const c = this.init();
    if (!c || this.muted) return;
    const { type = 'sine', vol = 0.2, delay = 0, slide = 0 } = opt;
    const t = c.currentTime + delay;
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slide) osc.frequency.exponentialRampToValueAtTime(slide, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g);
    g.connect(this.master);
    osc.start(t);
    osc.stop(t + dur + 0.05);
  },

  click() { this.tone(700, 0.06, { type: 'triangle', vol: 0.12 }); },
  pop() { this.tone(420, 0.12, { vol: 0.16, slide: 900 }); },
  tick() { this.tone(1300, 0.03, { type: 'square', vol: 0.035 }); },
  toggle(on) { this.tone(on ? 880 : 500, 0.08, { type: 'triangle', vol: 0.12 }); },
  seat() {
    this.tone(660, 0.09, { type: 'triangle', vol: 0.13 });
    this.tone(990, 0.14, { type: 'triangle', vol: 0.11, delay: 0.07 });
  },
  correct() {
    [523.25, 659.25, 783.99].forEach((f, i) => this.tone(f, 0.2, { type: 'triangle', vol: 0.17, delay: i * 0.08 }));
  },
  wrong() {
    this.tone(330, 0.28, { vol: 0.16, slide: 210 });
    this.tone(247, 0.3, { type: 'triangle', vol: 0.06, delay: 0.05, slide: 160 });
  },
  win() {
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => this.tone(f, 0.28, { type: 'triangle', vol: 0.17, delay: i * 0.12 }));
    this.tone(1318.5, 0.6, { vol: 0.12, delay: 0.5 });
    this.tone(1567.98, 0.6, { vol: 0.08, delay: 0.62 });
  },
  bells() {
    [1046.5, 1318.5, 1568, 2093, 1568, 2093].forEach((f, i) => {
      this.tone(f, 0.9, { vol: 0.09, delay: i * 0.11 });
      this.tone(f * 2.01, 0.5, { vol: 0.025, delay: i * 0.11 });
    });
  },
};

/* ---------- Visual effects ---------- */
const FX = {
  canvas: null,
  ctx: null,
  parts: [],
  running: false,
  colors: ['#f7c873', '#ffe9b0', '#ff8fb1', '#ff4f8b', '#ffffff', '#c9a7ff', '#ffd166'],

  init() {
    this.canvas = document.getElementById('fx');
    this.ctx = this.canvas.getContext('2d');
    const resize = () => {
      this.canvas.width = innerWidth * devicePixelRatio;
      this.canvas.height = innerHeight * devicePixelRatio;
    };
    resize();
    addEventListener('resize', resize);

    const bg = document.getElementById('bgHearts');
    bg.innerHTML = Array.from({ length: 14 }, () => {
      const s = 14 + Math.random() * 26;
      return `<i style="right:${Math.random() * 100}%;font-size:${s}px;animation-duration:${14 + Math.random() * 16}s;animation-delay:-${Math.random() * 20}s">${U.pick(['💖', '🤍', '💛', '💗', '✨'])}</i>`;
    }).join('');
  },

  spawn(n, x, y, speed, life, hearts = 0.3) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = speed * (0.4 + Math.random() * 0.8);
      const r = Math.random();
      this.parts.push({
        x, y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s - speed * 0.6,
        size: 5 + Math.random() * 6,
        color: U.pick(this.colors),
        rot: Math.random() * 6,
        vr: (Math.random() - 0.5) * 0.3,
        life: life * (0.7 + Math.random() * 0.6),
        shape: r < hearts ? 'heart' : r < hearts + 0.3 ? 'circle' : 'rect',
      });
    }
    if (!this.running) {
      this.running = true;
      requestAnimationFrame(() => this.loop());
    }
  },

  confetti() {
    this.spawn(90, innerWidth * 0.3, innerHeight * 0.35, 13, 140);
    this.spawn(90, innerWidth * 0.7, innerHeight * 0.35, 13, 140);
  },
  hearts() { this.spawn(70, innerWidth / 2, innerHeight * 0.4, 11, 130, 0.85); },

  burstAt(el) {
    if (!el) return;
    const r = el.getBoundingClientRect();
    this.spawn(22, r.left + r.width / 2, r.top + r.height / 2, 7, 55, 0.5);
  },

  loop() {
    const c = this.ctx;
    const dpr = devicePixelRatio;
    c.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.parts = this.parts.filter((p) => p.life-- > 0 && p.y < innerHeight + 50);
    for (const p of this.parts) {
      p.vy += 0.32;
      p.vx *= 0.985;
      p.x += p.vx;
      p.y += p.vy;
      p.rot += p.vr;
      c.save();
      c.translate(p.x * dpr, p.y * dpr);
      c.rotate(p.rot);
      c.globalAlpha = Math.min(1, p.life / 30);
      c.fillStyle = p.color;
      const s = p.size * dpr;
      if (p.shape === 'heart') {
        c.font = `${s * 2}px sans-serif`;
        c.fillText('♥', -s / 2, s / 2);
      } else if (p.shape === 'circle') {
        c.beginPath();
        c.arc(0, 0, s / 2, 0, Math.PI * 2);
        c.fill();
      } else {
        c.fillRect(-s / 2, -s / 4, s, s / 2);
      }
      c.restore();
    }
    if (this.parts.length) requestAnimationFrame(() => this.loop());
    else {
      this.running = false;
      c.clearRect(0, 0, this.canvas.width, this.canvas.height);
    }
  },

  restartAnim(el, cls) {
    if (!el) return;
    el.classList.remove(cls);
    void el.offsetWidth;
    el.classList.add(cls);
  },
  shake(el) { this.restartAnim(el, 'shake'); },
  pop(el) { this.restartAnim(el, 'pop'); },

  toast(msg, kind = 'info') {
    const t = document.getElementById('toast');
    t.className = 'toast ' + kind;
    t.innerHTML = msg;
    this.restartAnim(t, 'show');
    clearTimeout(this._tt);
    this._tt = setTimeout(() => t.classList.remove('show'), 2600);
  },
};

/* ---------- Ads (same idea as Tsgreen3: adv.json, rotating) ---------- */
const ROTATE_MS = 5000;

// Used only when adv.json cannot be loaded (for example when the page is opened as a local file).
const FALLBACK_ADS = [
  { caption: 'TgSofts – אפליקציות בעברית', catchPhrase: 'קולולו – כל המוזמנים וההושבה בטלפון אחד 💍', phone: '0525914007' },
];

const Ads = {
  list: [],
  i: 0,
  timer: 0,

  async load() {
    try {
      const res = await fetch('adv.json', { cache: 'no-store' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const data = await res.json();
      const ads = (Array.isArray(data) ? data : []).filter((a) => a && a.caption);
      if (!ads.length) throw new Error('adv.json has no ads');
      this.list = ads;
    } catch (e) {
      console.warn('adv.json not loaded, using fallback ad:', e.message);
      this.list = FALLBACK_ADS;
    }
    const dots = document.getElementById('adDots');
    dots.innerHTML = this.list.length > 1
      ? this.list.map((_, k) => `<button class="dot" data-k="${k}" aria-label="פרסומת ${k + 1}"></button>`).join('') : '';
    dots.onclick = (e) => {
      const b = e.target.closest('.dot');
      if (b) this.show(+b.dataset.k);
    };
    this.show(0);
  },

  show(k) {
    this.i = (k + this.list.length) % this.list.length;
    const a = this.list[this.i];
    const card = document.getElementById('adCard');
    card.classList.remove('in');
    void card.offsetWidth;
    card.innerHTML = `
      ${a.icon ? `<div class="ad-icon">${U.esc(a.icon)}</div>` : ''}
      <div class="ad-caption">${U.esc(a.caption)}</div>
      <div class="ad-phrase">${U.esc(a.catchPhrase)}</div>
      ${a.phone ? `<a class="ad-phone" href="${U.telHref(a.phone)}">📞 <span class="ltr">${U.esc(U.fmtPhone(a.phone))}</span></a>` : ''}`;
    card.classList.add('in');
    document.querySelectorAll('.dot').forEach((d, n) => d.classList.toggle('on', n === this.i));

    const bar = document.getElementById('adBar');
    bar.style.transition = 'none';
    bar.style.width = '0%';
    void bar.offsetWidth;
    if (this.list.length > 1) {
      bar.style.transition = `width ${ROTATE_MS}ms linear`;
      bar.style.width = '100%';
      clearTimeout(this.timer);
      this.timer = setTimeout(() => this.show(this.i + 1), ROTATE_MS);
    }
  },
};
