'use strict';

/* ---------- Options for every guest field ---------- */
const OPT = {
  side: { groom: 'צד החתן', bride: 'צד הכלה', both: 'משותף' },
  relation: {
    family1: 'משפחה קרובה',
    family2: 'משפחה מורחבת',
    friends: 'חברים',
    army: 'צבא / שירות',
    study: 'לימודים',
    work: 'עבודה',
    parents: 'חברים של ההורים',
    neighbors: 'שכנים / קהילה',
    other: 'אחר',
  },
  rsvp: { pending: 'ממתין לתשובה', yes: 'מגיע', maybe: 'אולי', no: 'לא מגיע' },
  age: { kids: 'ילדים / נוער', young: 'צעירים', adult: 'מבוגרים', senior: 'גיל הזהב' },
  food: { regular: 'רגיל', veg: 'צמחוני', vegan: 'טבעוני', gluten: 'ללא גלוטן', mehadrin: 'כשר מהדרין', other: 'אחר' },
  zone: { dance: 'ליד הרחבה', center: 'מרכז האולם', quiet: 'אזור שקט', exit: 'ליד היציאה' },
  pref: { any: 'לא משנה', dance: 'ליד הרחבה', center: 'מרכז האולם', quiet: 'אזור שקט', exit: 'ליד היציאה' },
};
const RSVP_ICON = { pending: '⏳', yes: '✅', maybe: '🤔', no: '❌' };
const RSVP_NEXT = { pending: 'yes', yes: 'maybe', maybe: 'no', no: 'pending' };
// Lower = seated first (closest people get the best tables).
const RELATION_RANK = { family1: 0, family2: 1, friends: 2, army: 2, study: 2, parents: 3, work: 4, neighbors: 5, other: 6 };

function blankGuest() {
  return {
    id: U.uid(),
    name: '',
    phone: '',
    side: 'both',
    relation: 'friends',
    group: '',
    count: 1,
    kids: 0,
    rsvp: 'pending',
    age: 'adult',
    food: 'regular',
    pref: 'any',
    accessible: false,
    vip: false,
    invited: false,
    avoid: [],
    notes: '',
    table: null,
    rt: '',
    rsvpSync: '',
    rsvpAt: '',
    rsvpNote: '',
    sentAt: '',
  };
}

function makeTables(n, seats, start = 1) {
  return Array.from({ length: n }, (_, i) => ({
    id: 't' + U.uid(),
    name: 'שולחן ' + (start + i),
    seats,
    zone: start + i <= 2 ? 'dance' : 'center',
  }));
}

function blankWedding(groom, bride, date) {
  return {
    version: 1,
    wedding: { groom, bride, date: date || '', venue: '', defaultSeats: 12 },
    tables: makeTables(10, 12),
    guests: [],
    updatedAt: new Date().toISOString(),
  };
}

function normalize(d) {
  const out = blankWedding('', '');
  out.wedding = Object.assign(out.wedding, d.wedding || {});
  out.tables = (Array.isArray(d.tables) ? d.tables : []).map((t) => ({
    id: t.id || 't' + U.uid(),
    name: t.name || 'שולחן',
    seats: U.clamp(+t.seats || 12, 1, 60),
    zone: OPT.zone[t.zone] ? t.zone : 'center',
  }));
  const tids = new Set(out.tables.map((t) => t.id));
  out.guests = (Array.isArray(d.guests) ? d.guests : []).map((g) => {
    const x = Object.assign(blankGuest(), g);
    x.count = U.clamp(+x.count || 1, 1, 30);
    x.kids = U.clamp(+x.kids || 0, 0, x.count);
    x.avoid = Array.isArray(x.avoid) ? x.avoid : [];
    if (!tids.has(x.table)) x.table = null;
    return x;
  });
  out.updatedAt = d.updatedAt || out.updatedAt;
  return out;
}

/* ---------- Cloud: Firestore REST, one document per wedding ---------- */
const Cloud = {
  on: () => !!(window.CLOUD && CLOUD.apiKey && CLOUD.projectId),
  root() { return `projects/${encodeURIComponent(CLOUD.projectId)}/databases/(default)/documents`; },
  docUrl(path, mask) {
    let u = `https://firestore.googleapis.com/v1/${this.root()}/${path}?key=${encodeURIComponent(CLOUD.apiKey)}`;
    if (mask) u += mask.map((f) => '&updateMask.fieldPaths=' + f).join('');
    return u;
  },
  url(key) { return this.docUrl('weddings/' + key); },

  enc(obj) {
    const fields = {};
    for (const [k, v] of Object.entries(obj)) {
      fields[k] = Number.isInteger(v) ? { integerValue: String(v) } : { stringValue: String(v ?? '') };
    }
    return { fields };
  },
  dec(fields = {}) {
    const out = {};
    for (const [k, v] of Object.entries(fields)) out[k] = 'integerValue' in v ? +v.integerValue : v.stringValue;
    return out;
  },

  // RSVP: one small document per guest, the id is a random token that only that guest's link carries.
  async rsvpGet(token) {
    const r = await fetch(this.docUrl('rsvps/' + token), { cache: 'no-store' });
    if (r.status === 404) return null;
    if (!r.ok) throw new Error('rsvp get ' + r.status);
    return this.dec((await r.json()).fields);
  },
  async rsvpPut(token, obj) {
    const r = await fetch(this.docUrl('rsvps/' + token, Object.keys(obj)), {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(this.enc(obj)),
    });
    if (!r.ok) throw new Error('rsvp put ' + r.status);
  },
  async rsvpBatch(tokens) {
    const out = {};
    for (let i = 0; i < tokens.length; i += 100) {
      const part = tokens.slice(i, i + 100);
      const r = await fetch(`https://firestore.googleapis.com/v1/${this.root()}:batchGet?key=${encodeURIComponent(CLOUD.apiKey)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ documents: part.map((t) => `projects/${CLOUD.projectId}/databases/(default)/documents/rsvps/${t}`) }),
      });
      if (!r.ok) throw new Error('rsvp batch ' + r.status);
      for (const item of await r.json()) {
        if (item.found) out[item.found.name.split('/').pop()] = this.dec(item.found.fields);
      }
    }
    return out;
  },
  async get(key) {
    const r = await fetch(this.url(key), { cache: 'no-store' });
    if (r.status === 404) return null;
    if (!r.ok) throw new Error('cloud get ' + r.status);
    const j = await r.json();
    return j.fields && j.fields.box ? JSON.parse(j.fields.box.stringValue) : null;
  },
  async put(key, box, updatedAt) {
    const r = await fetch(this.url(key), {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields: { box: { stringValue: JSON.stringify(box) }, updatedAt: { stringValue: updatedAt } } }),
    });
    if (!r.ok) throw new Error('cloud put ' + r.status);
  },
};

/* ---------- Store: one wedding per code ---------- */
const Store = {
  code: null,
  key: null,
  data: null,
  hasRemote: false,
  salt: null,
  status: 'local',
  onStatus: null,
  onExternal: null,
  _timer: 0,
  _busy: false,

  cleanCode(code) {
    const c = String(code || '').trim().replace(/[\s-]/g, '');
    return /^\d+$/.test(c) && c.length < 9 && c.length >= 5 ? c.padStart(9, '0') : c;
  },
  lsKey() { return 'kululu_w_' + this.key; },
  fileName() { return `w-${this.key}.json`; },

  pendKey() { return 'kululu_pending_' + this.key; },
  setStatus(s) {
    this.status = s;
    if (this.onStatus) this.onStatus(s);
  },

  async unbox(j) {
    if (!j) return null;
    if (!j.kululu) return j;
    const d = await Vault.unlock(j, this.code);
    if (!this.salt) this.salt = Vault.unb64(j.salt);
    return d;
  },

  // Cloud first; a static w-*.json next to the app is the fallback (also used for the demo).
  async fetchRemote() {
    if (Cloud.on()) {
      try {
        const box = await Cloud.get(this.key);
        if (box) return await this.unbox(box);
      } catch (e) {
        console.warn(e.message);
        this.setStatus('offline');
      }
    }
    try {
      const r = await fetch(this.fileName(), { cache: 'no-store' });
      if (!r.ok) return null;
      return await this.unbox(await r.json());
    } catch (e) {
      return null;
    }
  },

  // Returns true when a wedding was found for this code (in the cloud, on this device or on the site).
  async open(code) {
    this.code = code;
    this.salt = null;
    this.key = await Vault.fileKey(code);
    let local = null;
    try { local = JSON.parse(localStorage.getItem(this.lsKey())); } catch (e) { local = null; }
    const remote = await this.fetchRemote();
    this.hasRemote = !!remote;
    const pick = local && remote
      ? (String(local.updatedAt) >= String(remote.updatedAt) ? local : remote)
      : local || remote;
    if (!pick) return false;
    this.data = normalize(pick);
    localStorage.setItem(this.lsKey(), JSON.stringify(this.data));
    if (Cloud.on()) {
      if (pick === local && (localStorage.getItem(this.pendKey()) || !remote || local.updatedAt !== remote.updatedAt)) this.push();
      else if (this.status !== 'offline') this.setStatus('saved');
    } else this.setStatus('local');
    return true;
  },

  create(groom, bride, date) {
    this.data = blankWedding(groom, bride, date);
    this.save();
  },

  save() {
    this.data.updatedAt = new Date().toISOString();
    localStorage.setItem(this.lsKey(), JSON.stringify(this.data));
    if (!Cloud.on()) return;
    localStorage.setItem(this.pendKey(), '1');
    this.setStatus('saving');
    clearTimeout(this._timer);
    this._timer = setTimeout(() => this.push(), 700);
  },

  async push() {
    if (!Cloud.on() || !this.data) return;
    if (this._busy) { clearTimeout(this._timer); this._timer = setTimeout(() => this.push(), 400); return; }
    this._busy = true;
    const key = this.key;
    const snap = this.data.updatedAt;
    this.setStatus('saving');
    try {
      if (!this.salt) this.salt = Vault.newSalt();
      const box = await Vault.lock(this.data, this.code, this.salt);
      await Cloud.put(key, box, snap);
      if (key === this.key && this.data.updatedAt === snap) {
        localStorage.removeItem(this.pendKey());
        this.hasRemote = true;
        this.setStatus('saved');
      }
    } catch (e) {
      console.warn(e.message);
      this.setStatus('offline');
      clearTimeout(this._timer);
      this._timer = setTimeout(() => this.push(), 10000);
    } finally {
      this._busy = false;
    }
  },

  // When the app comes back to the screen, take a newer version saved from another phone.
  async refresh() {
    if (!Cloud.on() || !this.data || this._busy || localStorage.getItem(this.pendKey())) return;
    try {
      const box = await Cloud.get(this.key);
      const remote = box && await this.unbox(box);
      if (remote && String(remote.updatedAt) > String(this.data.updatedAt)) {
        this.data = normalize(remote);
        localStorage.setItem(this.lsKey(), JSON.stringify(this.data));
        if (this.onExternal) this.onExternal();
      }
      this.setStatus('saved');
    } catch (e) {
      this.setStatus('offline');
    }
  },

  async reloadRemote() {
    const remote = await this.fetchRemote();
    if (!remote) return false;
    this.data = normalize(remote);
    localStorage.setItem(this.lsKey(), JSON.stringify(this.data));
    localStorage.removeItem(this.pendKey());
    return true;
  },

  async download() {
    const box = await Vault.lock(this.data, this.code);
    const blob = new Blob([JSON.stringify(box)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = this.fileName();
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  },

  async importFile(file) {
    const j = JSON.parse(await file.text());
    const d = j && j.kululu ? await Vault.unlock(j, this.code) : j;
    if (!d || !Array.isArray(d.guests)) throw new Error('not a Kululu file');
    this.data = normalize(d);
    this.save();
  },

  // Gives every guest a personal RSVP link and keeps the invite details (name, couple, date) up to date in the cloud.
  async ensureInvites() {
    if (!Cloud.on() || !this.data) return;
    const w = this.data.wedding;
    let dirty = false;
    const jobs = [];
    for (const g of this.data.guests) {
      if (!g.rt) { g.rt = Vault.hex(crypto.getRandomValues(new Uint8Array(16))); dirty = true; }
      const info = { g: g.name, c: `${w.groom} ו${w.bride}`, d: w.date || '', v: w.venue || '', n: Seating.seatsOf(g) };
      const sig = JSON.stringify(info);
      if (g.rsvpSync !== sig) jobs.push([g, info, sig]);
    }
    if (dirty) this.save();
    let done = 0;
    for (const [g, info, sig] of jobs) {
      try {
        await Cloud.rsvpPut(g.rt, info);
        g.rsvpSync = sig;
        done++;
      } catch (e) {
        console.warn(e.message);
        break;
      }
    }
    if (done) this.save();
  },

  // Pulls guests' answers from their RSVP pages into the list. Returns the guests that answered since last time.
  async syncRsvps() {
    if (!Cloud.on() || !this.data) return [];
    const gs = this.data.guests.filter((g) => g.rt);
    if (!gs.length) return [];
    const docs = await Cloud.rsvpBatch(gs.map((g) => g.rt));
    const fresh = [];
    for (const g of gs) {
      const r = docs[g.rt];
      if (!r || !r.at || !OPT.rsvp[r.a] || r.at <= (g.rsvpAt || '')) continue;
      g.rsvp = r.a;
      if (r.a !== 'no' && r.k > 0) g.count = U.clamp(r.k, 1, 30);
      g.kids = Math.min(g.kids, g.count);
      g.rsvpNote = String(r.m || '').slice(0, 200);
      g.rsvpAt = r.at;
      if (g.rsvp === 'no') g.table = null;
      const t = g.table && this.table(g.table);
      if (t && Seating.used(this.data, t.id) > t.seats) g.table = null;
      fresh.push(g);
    }
    if (fresh.length) this.save();
    return fresh;
  },

  forgetDevice() {
    localStorage.removeItem(this.lsKey());
    localStorage.removeItem(this.pendKey());
  },

  guest(id) { return this.data.guests.find((g) => g.id === id); },
  table(id) { return this.data.tables.find((t) => t.id === id); },
};
