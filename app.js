'use strict';

const TIPS = [
  'מזל טוב! 💍 אני קולולו, ואני אעזור לכם לסדר את כל המוזמנים.',
  'טיפ: תנו לכל מוזמן "קבוצה" (למשל "חברים מהצבא"). כך אני יודע מי יושב עם מי.',
  'במסך ההושבה לוחצים על מוזמן ואז על שולחן – וזהו, הוא עבר.',
  'סבא וסבתא? סמנו "גיל הזהב" ואני אשים אותם באזור שקט, רחוק מהרמקולים.',
  'יש שניים שלא מסתדרים? בכרטיס של המוזמן יש "לא להושיב ליד".',
  'לחיצה על ⏳ ליד מוזמן מחליפה את התשובה שלו: מגיע, אולי, לא מגיע.',
  'כל שינוי נשמר מיד במכשיר הזה. כדי לשמור לתמיד – "הורדת קובץ" בהגדרות.',
];

const opts = (map, cur) => Object.entries(map)
  .map(([k, v]) => `<option value="${k}" ${k === cur ? 'selected' : ''}>${v}</option>`).join('');

const App = {
  root: null,
  tab: 'guests',
  filter: { q: '', side: 'all', rsvp: 'all' },
  picked: null,
  tip: 0,

  start() {
    this.root = document.getElementById('app');
    FX.init();
    Ads.load();

    const mute = document.getElementById('muteBtn');
    const paintMute = () => { mute.textContent = Sound.muted ? '🔇' : '🔊'; };
    paintMute();
    mute.onclick = () => { Sound.setMuted(!Sound.muted); paintMute(); };
    document.getElementById('homeBtn').onclick = () => (Store.data ? this.dash() : this.login());
    document.getElementById('logoutBtn').onclick = () => this.askLogout();

    document.addEventListener('pointerdown', () => Sound.init(), { once: true });
    document.addEventListener('click', (e) => {
      if (e.target.closest('button, a, select, summary, label.check')) Sound.click();
    }, true);
    document.addEventListener('change', (e) => {
      if (e.target.type === 'checkbox') Sound.toggle(e.target.checked);
    });
    document.getElementById('modal').addEventListener('click', (e) => {
      if (e.target.id === 'modal') this.closeModal();
    });

    Store.onStatus = (s) => this.paintCloud(s);
    Store.onExternal = () => {
      FX.toast('🔄 הרשימה עודכנה מטלפון אחר', 'info');
      this.dash();
    };
    const modalOpen = () => !document.getElementById('modal').classList.contains('hidden');
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && !modalOpen() && !this.guestMode) Store.refresh().then(() => this.syncCloud());
    });
    setInterval(() => {
      if (document.visibilityState === 'visible' && !modalOpen() && !this.guestMode) this.syncCloud();
    }, 60000);
    addEventListener('online', () => {
      if (Store.data && localStorage.getItem(Store.pendKey())) Store.push();
    });

    if (!Vault.ready()) {
      this.root.innerHTML = `<div class="login fade-in"><div class="rings">💍</div>
        <p class="tagline">צריך לפתוח את האפליקציה דרך האתר (https) או דרך <b>start.cmd</b>, ולא ישירות מהקובץ.</p></div>`;
      return;
    }
    const rt = new URLSearchParams(location.search).get('r');
    if (rt && /^[0-9a-f]{32}$/.test(rt)) { this.rsvpPage(rt); return; }

    const saved = sessionStorage.getItem('kululu_code');
    if (saved) this.enter(saved, true);
    else this.login();
  },

  /* ---------- Cloud sync: personal links out, guests' answers in ---------- */
  async syncCloud() {
    if (!Cloud.on() || !Store.data || this._syncing) return;
    this._syncing = true;
    try {
      await Store.ensureInvites();
      const fresh = await Store.syncRsvps();
      if (fresh.length) {
        const yes = fresh.filter((g) => g.rsvp === 'yes').length;
        Sound.bells();
        if (yes) FX.hearts();
        FX.toast(fresh.length === 1
          ? `💌 ${U.esc(fresh[0].name)} ענה/תה: ${OPT.rsvp[fresh[0].rsvp]} ${RSVP_ICON[fresh[0].rsvp]}`
          : `💌 ${fresh.length} תשובות חדשות! (${yes} מגיעים)`, 'good');
        if (document.getElementById('modal').classList.contains('hidden')) this.dash();
        else this.chrome();
      }
    } catch (e) {
      console.warn(e.message);
    } finally {
      this._syncing = false;
    }
  },

  inviteLink(g) {
    if (!Cloud.on()) return '';
    if (!g.rt) g.rt = Vault.hex(crypto.getRandomValues(new Uint8Array(16)));
    return `${location.origin}${location.pathname}?r=${g.rt}`;
  },

  ensureTokens() {
    const d = Store.data;
    if (!Cloud.on() || !d.guests.some((g) => !g.rt)) return;
    d.guests.forEach((g) => this.inviteLink(g));
    Store.save();
    this.syncCloud();
  },

  markSent(id) {
    const g = Store.guest(id);
    if (!g) return;
    g.sentAt = new Date().toISOString();
    g.invited = true;
    this.save();
  },

  inviteText(g) {
    const w = Store.data.wedding;
    const when = [w.date ? 'ב' + U.fmtDate(w.date) : '', w.time ? 'בשעה ' + w.time : ''].filter(Boolean).join(' ');
    const where = [w.venue, w.address].filter(Boolean).join(', ');
    const link = this.inviteLink(g);
    const photo = Store.photo();
    return [
      `שלום ${g.name}! ${Ev.of(w).icon}`,
      `${Ev.inviteLine(w)} בע"ה${when ? ' ' + when : ''}.`,
      ...(where ? [`📍 ${where}`] : []),
      'נשמח מאוד לראות אותך! 🥰',
      '',
      // WhatsApp shows a preview only for the first link, so the picture goes before the RSVP link.
      ...(photo ? [`💌 ההזמנה שלנו:\n${photoUrl(photo)}`, ''] : []),
      link ? `לאישור הגעה (לוחצים – לוקח 5 שניות):\n${link}` : 'נשמח אם תאשר/י הגעה בתשובה להודעה הזאת 🙏',
    ].join('\n');
  },

  /* ---------- Guest RSVP page (opened from the personal link) ---------- */
  async rsvpPage(token) {
    this.guestMode = true;
    document.getElementById('brandSub').textContent = 'אישור הגעה';
    document.getElementById('homeBtn').onclick = null;
    this.root.innerHTML = '<div class="login fade-in"><div class="rings spin">💌</div><p class="tagline">פותחים את ההזמנה...</p></div>';
    let r = null;
    try { r = Cloud.on() ? await Cloud.rsvpGet(token) : null; } catch (e) { console.warn(e.message); }
    if (!r || !r.g) {
      this.root.innerHTML = `<div class="login fade-in"><div class="rings">🙈</div>
        <p class="tagline">לא מצאנו את ההזמנה הזאת.<br>אפשר לבקש ממי ששלח לשלוח את הקישור שוב.</p></div>`;
      return;
    }
    const ev = Ev.fromRsvp(r.c);
    document.title = ev.wedding ? `💌 ${ev.title} מתחתנים!` : `💌 ${ev.title}`;
    const pick = { a: r.a || '', k: r.k || r.n || 1, m: r.m || '' };
    const days = U.daysUntil(r.d);

    const paint = () => {
      this.root.innerHTML = `
        <div class="rsvp-page fade-in">
          <div class="rings">${ev.wedding ? '💌' : ev.e.icon}</div>
          <p class="rsvp-hello">שלום <b>${U.esc(r.g)}</b>!</p>
          <div class="couple-names"><span>${U.esc(ev.title)}</span></div>
          <p class="rsvp-sub">${ev.wedding ? 'מתחתנים בע"ה ומזמינים אותך לשמוח איתם!' : 'בע"ה – ומזמינים אותך לשמוח איתנו!'} 💖</p>
          <div class="couple-meta">${[U.fmtDate(r.d), r.t ? '🕖 ' + U.esc(r.t) : ''].filter(Boolean).join(' · ')}</div>
          ${r.v || r.h ? `<div class="couple-meta">📍 ${[U.esc(r.v), U.esc(r.h)].filter(Boolean).join(', ')}</div>` : ''}
          ${PHOTO_OK.test(r.p || '') ? `<a class="rsvp-photo" href="${photoUrl(r.p)}" target="_blank" rel="noopener"><img src="${photoUrl(r.p)}" alt="ההזמנה"></a>` : ''}
          ${days > 0 ? `<div class="countdown">עוד <b>${days}</b> ימים ${ev.e.to} בע"ה 💫</div>` : ''}
          <div class="login-card rsvp-card">
            <h3>${r.a ? 'התשובה שלך – אפשר לשנות:' : 'תגיעו? 🥰'}</h3>
            <div class="rsvp-choices">
              <button class="choice yes ${pick.a === 'yes' ? 'on' : ''}" data-a="yes"><b>✅</b>מגיעים!</button>
              <button class="choice maybe ${pick.a === 'maybe' ? 'on' : ''}" data-a="maybe"><b>🤔</b>עוד לא בטוח</button>
              <button class="choice no ${pick.a === 'no' ? 'on' : ''}" data-a="no"><b>😢</b>לא נוכל להגיע</button>
            </div>
            <div class="count-row ${pick.a === 'no' ? 'hidden' : ''}">
              <span>כמה תהיו? (כולל ילדים)</span>
              <div class="stepper">
                <button type="button" data-step="-1">−</button><b id="cnt">${pick.k}</b><button type="button" data-step="1">+</button>
              </div>
            </div>
            <label class="note-row">רוצים לכתוב משהו ${ev.wedding ? 'לזוג' : 'למשפחה'}? (לא חובה)
              <textarea id="note" rows="2" maxlength="200" placeholder="מזל טוב! ...">${U.esc(pick.m)}</textarea></label>
            <button class="btn big" id="send" ${pick.a ? '' : 'disabled'}>שליחה 💖</button>
          </div>
        </div>`;
      const card = this.root.querySelector('.rsvp-card');
      card.querySelector('#note').oninput = (e) => { pick.m = e.target.value; Sound.tick(); };
      card.onclick = async (e) => {
        const c = e.target.closest('[data-a]');
        if (c) {
          pick.a = c.dataset.a;
          if (pick.a === 'yes') Sound.correct(); else if (pick.a === 'no') Sound.wrong(); else Sound.pop();
          paint();
          return;
        }
        const s = e.target.closest('[data-step]');
        if (s) {
          pick.k = U.clamp(pick.k + +s.dataset.step, 1, 30);
          card.querySelector('#cnt').textContent = pick.k;
          Sound.tick();
          FX.pop(card.querySelector('#cnt'));
          return;
        }
        if (e.target.closest('#send') && pick.a) {
          const btn = card.querySelector('#send');
          btn.disabled = true;
          btn.textContent = 'שולחים...';
          const at = new Date().toISOString();
          try {
            await Cloud.rsvpPut(token, { a: pick.a, k: pick.a === 'no' ? 0 : pick.k, m: pick.m.trim().slice(0, 200), at });
            Object.assign(r, { a: pick.a, k: pick.k, m: pick.m, at });
            thanks();
          } catch (err) {
            console.warn(err.message);
            Sound.wrong();
            FX.shake(card);
            FX.toast('🙈 לא הצלחנו לשלוח. בדקו שיש אינטרנט ונסו שוב', 'bad');
            btn.disabled = false;
            btn.textContent = 'שליחה 💖';
          }
        }
      };
    };

    const thanks = () => {
      const msg = {
        yes: ['🎉', `יש! נתראה ב${ev.e.name}!`, `${ev.wedding ? U.esc(ev.title) + ' כבר' : 'כבר'} מחכים לך 💃🕺`],
        maybe: ['🙏', 'תודה שעדכנת!', 'כשתדעו – פשוט פותחים שוב את אותו קישור ומעדכנים.'],
        no: ['💛', 'תודה שעדכנת', 'חבל שלא תוכלו להגיע. נשמח לשמוע ממך!'],
      }[pick.a];
      this.root.innerHTML = `
        <div class="rsvp-page fade-in">
          <div class="rings">${msg[0]}</div>
          <h1 class="rsvp-thanks">${msg[1]}</h1>
          <p class="tagline">${msg[2]}</p>
          <button class="btn secondary" id="again">✏️ לשנות תשובה</button>
        </div>`;
      if (pick.a === 'yes') { Sound.win(); FX.confetti(); FX.hearts(); } else Sound.bells();
      this.root.querySelector('#again').onclick = () => paint();
    };

    paint();
  },

  /* ---------- Login ---------- */
  login() {
    this.closeModal();
    Store.data = null;
    this.chrome();
    this.root.innerHTML = `
      <div class="login fade-in">
        <div class="rings">💍</div>
        <h1><span class="hl">קולולו</span></h1>
        <p class="tagline">רשימת המוזמנים וההושבה של האירוע שלכם – חתונה, חינה, בר/בת מצווה, ברית או זבד הבת. במקום אחד, בכל טלפון.</p>
        <form class="login-card" id="loginForm" autocomplete="off">
          <label for="code">הכניסו תעודת זהות (או קוד אישי)</label>
          <div class="code-row">
            <input id="code" type="password" inputmode="numeric" placeholder="•••••••••" autofocus>
            <button type="button" class="icon-btn" id="peek" title="הצג">👁️</button>
          </div>
          <button class="btn big" type="submit">כניסה 💖</button>
          <p class="muted small">כל משפחה רואה רק את האירוע שלה. הקובץ נעול עם הקוד שלכם.</p>
        </form>
      </div>`;
    const input = this.root.querySelector('#code');
    this.root.querySelector('#peek').onclick = () => { input.type = input.type === 'password' ? 'text' : 'password'; };
    input.oninput = () => Sound.tick();
    this.root.querySelector('#loginForm').onsubmit = (e) => {
      e.preventDefault();
      const code = Store.cleanCode(input.value);
      const card = this.root.querySelector('.login-card');
      if (code.length < 4) { Sound.wrong(); FX.shake(card); FX.toast('🙈 הקוד קצר מדי (לפחות 4 תווים)', 'bad'); return; }
      if (/^\d{9}$/.test(code) && !U.isIsraeliId(code)) {
        Sound.wrong(); FX.shake(card); FX.toast('🙈 נראה שיש טעות בתעודת הזהות', 'bad'); return;
      }
      this.enter(code, false);
    };
  },

  async enter(code, silent) {
    this.root.innerHTML = '<div class="login fade-in"><div class="rings spin">💍</div><p class="tagline">פותחים את האירוע...</p></div>';
    let ok = false;
    try { ok = await Store.open(code); } catch (e) { console.error(e); }
    if (!ok) {
      if (silent) { sessionStorage.removeItem('kululu_code'); this.login(); return; }
      this.login();
      this.askCreate();
      return;
    }
    sessionStorage.setItem('kululu_code', code);
    if (!silent) { Sound.bells(); FX.hearts(); }
    this.tab = 'guests';
    this.dash();
    this.syncCloud();
  },

  askCreate() {
    this.openModal(`
      <div class="result-emoji">💌</div>
      <h2>אירוע חדש?</h2>
      <p>לא מצאנו אירוע לקוד הזה. בואו נפתח אחד!</p>
      <form id="newForm" class="form">
        ${this.eventFields({ type: 'wedding', hero: '', groom: '', bride: '' })}
        <label>תאריך<input name="date" type="date"></label>
        <div class="modal-actions">
          <button class="btn" type="submit">פותחים 🎉</button>
          <label class="btn secondary file-btn">יש לי קובץ ⬆️<input type="file" accept=".json,application/json" hidden></label>
          <button class="btn secondary" type="button" data-m="close">ביטול</button>
        </div>
      </form>`);
    const card = document.getElementById('modalCard');
    card.querySelector('[data-m="close"]').onclick = () => { this.closeModal(); this.login(); };
    this.wireEventFields(card);
    card.querySelector('#newForm').onsubmit = (e) => {
      e.preventDefault();
      const f = new FormData(e.target);
      Store.create(f.get('groom').trim(), f.get('bride').trim(), f.get('date'), f.get('type'), String(f.get('hero') || '').trim());
      sessionStorage.setItem('kululu_code', Store.code);
      this.closeModal();
      Sound.bells();
      FX.confetti();
      this.tab = 'guests';
      this.dash();
    };
    card.querySelector('input[type=file]').onchange = (e) => this.importFrom(e.target.files[0], true);
  },

  // Event type + the two sides' names (+ the child's name for bar/bat mitzvah, brit and zeved).
  eventFields(w) {
    const e = Ev.of(w);
    const types = Object.fromEntries(Object.entries(EVENTS).map(([k, v]) => [k, `${v.icon} ${v.name}`]));
    return `
      <label>איזה אירוע?<select name="type">${opts(types, EVENTS[w.type] ? w.type : 'wedding')}</select></label>
      <label class="ev-hero ${e.hero ? '' : 'hidden'}"><span>שם ${e.hero}</span><input name="hero" maxlength="30" value="${U.esc(w.hero || '')}"></label>
      <label><span class="ev-a">שם ${e.a}</span><input name="groom" required maxlength="30" value="${U.esc(w.groom)}"></label>
      <label><span class="ev-b">שם ${e.b}</span><input name="bride" required maxlength="30" value="${U.esc(w.bride)}"></label>`;
  },

  wireEventFields(root) {
    const sel = root.querySelector('select[name="type"]');
    sel.onchange = () => {
      const e = EVENTS[sel.value];
      const hero = root.querySelector('.ev-hero');
      hero.classList.toggle('hidden', !e.hero);
      hero.querySelector('span').textContent = 'שם ' + e.hero;
      root.querySelector('.ev-a').textContent = 'שם ' + e.a;
      root.querySelector('.ev-b').textContent = 'שם ' + e.b;
      Sound.pop();
    };
  },

  async importFrom(file, fresh) {
    if (!file) return;
    try {
      await Store.importFile(file);
      if (fresh) sessionStorage.setItem('kululu_code', Store.code);
      this.closeModal();
      Sound.correct();
      FX.toast('✅ הקובץ נטען!', 'good');
      this.dash();
    } catch (e) {
      console.error(e);
      Sound.wrong();
      FX.toast('🙈 לא הצלחתי לקרוא את הקובץ (אולי הוא של קוד אחר?)', 'bad');
    }
  },

  askLogout() {
    this.openModal(`
      <div class="result-emoji">🚪</div>
      <h2>לצאת?</h2>
      <p>הרשימה נשארת שמורה במכשיר. בפעם הבאה נכנסים עם אותו קוד.</p>
      <div class="modal-actions">
        <button class="btn" data-m="out">יציאה</button>
        <button class="btn secondary" data-m="close">נשארים</button>
      </div>`);
    const card = document.getElementById('modalCard');
    card.querySelector('[data-m="out"]').onclick = () => { sessionStorage.removeItem('kululu_code'); this.login(); };
    card.querySelector('[data-m="close"]').onclick = () => this.closeModal();
  },

  /* ---------- Header / shell ---------- */
  paintCloud(s) {
    const el = document.getElementById('cloudChip');
    const look = {
      saving: ['⏳ שומר...', 'saving'],
      saved: ['☁️ נשמר', 'saved'],
      offline: ['📴 נשמר בטלפון', 'offline'],
    }[s];
    el.classList.toggle('hidden', !look || !Store.data);
    if (!look) return;
    el.textContent = look[0];
    el.className = 'cloud-chip ' + look[1];
    el.title = s === 'offline' ? 'אין חיבור כרגע. השינויים שמורים בטלפון ויעלו לבד כשיחזור האינטרנט.' : 'כל שינוי נשמר אוטומטית';
  },

  chrome() {
    const w = Store.data && Store.data.wedding;
    this.paintCloud(Store.status);
    document.getElementById('logoutBtn').classList.toggle('hidden', !w);
    document.getElementById('countChip').classList.toggle('hidden', !w);
    const title = w && (Ev.isWedding(w) ? `החתונה של ${Ev.pair(w)}` : Ev.headline(w));
    document.getElementById('brandSub').textContent = w ? title : 'רשימת מוזמנים והושבה';
    document.title = w ? `קולולו – ${title} ${Ev.of(w).icon}` : 'קולולו – רשימת מוזמנים והושבה';
    if (w) document.getElementById('headCount').textContent = this.stats().coming;
  },

  save() {
    Store.save();
    this.chrome();
    const s = document.getElementById('stats');
    if (s) s.innerHTML = this.statsHtml();
  },

  stats() {
    const d = Store.data;
    const n = (f) => d.guests.filter(f).reduce((s, g) => s + Seating.seatsOf(g), 0);
    return {
      invited: n(() => true),
      coming: n((g) => g.rsvp !== 'no'),
      yes: n((g) => g.rsvp === 'yes'),
      pending: n((g) => g.rsvp === 'pending' || g.rsvp === 'maybe'),
      seated: n((g) => g.table && g.rsvp !== 'no'),
      seats: d.tables.reduce((s, t) => s + t.seats, 0),
      tables: d.tables.length,
    };
  },

  statsHtml() {
    const s = this.stats();
    const box = (icon, num, label, c) => `<div class="stat" style="--c:${c}"><span>${icon}</span><b>${num}</b><small>${label}</small></div>`;
    return box('💌', s.invited, 'הוזמנו', '#ff7eb3')
      + box('✅', s.yes, 'אישרו הגעה', '#2ee59d')
      + box('⏳', s.pending, 'עוד לא ענו', '#f7c873')
      + box('🪑', `${s.seated}/${s.coming}`, 'יש להם מקום', '#4cc9f0')
      + box('🍽️', `${s.tables}`, `שולחנות · ${s.seats} מקומות`, '#c9a7ff');
  },

  dash() {
    this.closeModal();
    this.chrome();
    const w = Store.data.wedding;
    const days = U.daysUntil(w.date);
    const ev = Ev.of(w);
    const count = days == null ? 'עוד לא קבעתם תאריך? אפשר להוסיף בהגדרות ⚙️'
      : days > 1 ? `עוד <b>${days}</b> ימים ${ev.to} בע"ה 💫`
      : days === 1 ? `מחר ${ev.the} בע"ה! 🥳`
      : days === 0 ? `היום ${ev.the}! מזל טוב! 🎉`
      : 'מזל טוב! 💖';
    const names = w.hero && ev.hero
      ? `<span>${U.esc(w.hero)}</span>`
      : `<span>${U.esc(w.groom)}</span>${w.bride ? `<b class="amp">${Ev.isWedding(w) ? '💞' : ev.icon}</b><span>${U.esc(w.bride)}</span>` : ''}`;
    this.root.innerHTML = `
      <div class="dash fade-in">
        <section class="couple">
          ${Ev.isWedding(w) ? '' : `<div class="couple-meta">${ev.icon} ${ev.name}</div>`}
          <div class="couple-names">${names}</div>
          <div class="couple-meta">${[U.fmtDate(w.date), w.time ? '🕖 ' + U.esc(w.time) : '', U.esc(w.venue)].filter(Boolean).join(' · ')}</div>
          ${w.address ? `<div class="couple-meta">📍 ${U.esc(w.address)}</div>` : ''}
          <div class="countdown">${count}</div>
        </section>
        <div class="stats" id="stats">${this.statsHtml()}</div>
        <div class="hint"><button class="hint-bot" id="mascot" title="עוד טיפ">👰</button><div id="hintText">${TIPS[this.tip]}</div></div>
        <nav class="tabs" id="tabs">
          <button data-tab="guests">👥 מוזמנים</button>
          <button data-tab="seating">🪑 הושבה</button>
          <button data-tab="share">📤 שיתוף</button>
          <button data-tab="settings">⚙️ הגדרות</button>
        </nav>
        <div id="pane"></div>
      </div>`;
    this.root.querySelector('#mascot').onclick = () => {
      this.tip = (this.tip + 1) % TIPS.length;
      const h = this.root.querySelector('#hintText');
      h.innerHTML = TIPS[this.tip];
      FX.pop(h.parentElement);
      Sound.pop();
    };
    this.root.querySelector('#tabs').onclick = (e) => {
      const b = e.target.closest('[data-tab]');
      if (b) { this.tab = b.dataset.tab; this.picked = null; this.pane(); }
    };
    this.pane();
  },

  pane() {
    this.root.querySelectorAll('#tabs [data-tab]').forEach((b) => b.classList.toggle('on', b.dataset.tab === this.tab));
    const p = document.getElementById('pane');
    p.onclick = null;
    p.ondragstart = p.ondragover = p.ondrop = null;
    p.classList.remove('fade-in');
    void p.offsetWidth;
    p.classList.add('fade-in');
    if (this.tab === 'seating') this.seating(p);
    else if (this.tab === 'share') this.share(p);
    else if (this.tab === 'settings') this.settings(p);
    else this.guests(p);
  },

  /* ---------- Guests ---------- */
  sideName(side) {
    const w = Store.data.wedding;
    const s = Ev.sides(w)[side] || 'משותף';
    return side === 'groom' ? `${s} – ${w.groom}` : side === 'bride' ? `${s} – ${w.bride}` : s;
  },

  guests(p) {
    const f = this.filter;
    p.innerHTML = `
      <div class="toolbar">
        <input id="q" class="search" type="search" placeholder="🔍 חיפוש: שם, טלפון או קבוצה" value="${U.esc(f.q)}">
        <select id="fSide"><option value="all">כל הצדדים</option>${opts(Ev.sides(Store.data.wedding), f.side)}</select>
        <select id="fRsvp"><option value="all">כל התשובות</option>${opts(OPT.rsvp, f.rsvp)}</select>
        <button class="btn" id="addGuest">➕ מוזמן חדש</button>
        ${U.canPickContacts() ? '<button class="btn secondary" id="fromContacts">📇 מאנשי הקשר</button>' : ''}
      </div>
      <div id="guestList"></div>`;
    const fc = p.querySelector('#fromContacts');
    if (fc) fc.onclick = () => this.importContacts();
    p.querySelector('#q').oninput = (e) => { f.q = e.target.value; Sound.tick(); this.guestList(); };
    p.querySelector('#fSide').onchange = (e) => { f.side = e.target.value; this.guestList(); };
    p.querySelector('#fRsvp').onchange = (e) => { f.rsvp = e.target.value; this.guestList(); };
    p.querySelector('#addGuest').onclick = () => this.guestForm(null);
    p.onclick = (e) => {
      const card = e.target.closest('[data-id]');
      if (!card) return;
      const g = Store.guest(card.dataset.id);
      if (e.target.closest('[data-sent]')) this.markSent(g.id);
      else if (e.target.closest('[data-act="edit"]')) this.guestForm(g);
      else if (e.target.closest('[data-act="rsvp"]')) {
        g.rsvp = RSVP_NEXT[g.rsvp];
        if (g.rsvp === 'no') g.table = null;
        if (g.rsvp === 'yes') { Sound.correct(); FX.burstAt(e.target); } else if (g.rsvp === 'no') Sound.wrong(); else Sound.pop();
        this.save();
        this.guestList();
        FX.toast(`${RSVP_ICON[g.rsvp]} ${U.esc(g.name)}: ${OPT.rsvp[g.rsvp]}`, g.rsvp === 'yes' ? 'good' : g.rsvp === 'no' ? 'bad' : 'info');
      }
    };
    this.guestList();
  },

  guestList() {
    const d = Store.data;
    this.ensureTokens();
    const f = this.filter;
    const q = f.q.trim().toLowerCase();
    const qd = U.digits(q);
    const list = d.guests.filter((g) => (f.side === 'all' || g.side === f.side)
      && (f.rsvp === 'all' || g.rsvp === f.rsvp)
      && (!q || g.name.toLowerCase().includes(q) || g.group.toLowerCase().includes(q) || (qd && U.digits(g.phone).includes(qd))));
    const el = document.getElementById('guestList');
    if (!d.guests.length) {
      el.innerHTML = '<div class="empty"><div>💌</div><p>עוד אין מוזמנים.<br>לחצו <b>➕ מוזמן חדש</b> כדי להוסיף את הראשון!</p></div>';
      return;
    }
    if (!list.length) { el.innerHTML = '<div class="empty"><div>🔍</div><p>לא מצאתי אף אחד כזה.</p></div>'; return; }

    el.innerHTML = ['groom', 'bride', 'both'].map((side) => {
      const gs = list.filter((g) => g.side === side)
        .sort((a, b) => (RELATION_RANK[a.relation] - RELATION_RANK[b.relation]) || a.group.localeCompare(b.group, 'he') || a.name.localeCompare(b.name, 'he'));
      if (!gs.length) return '';
      const heads = gs.reduce((s, g) => s + Seating.seatsOf(g), 0);
      return `
        <section class="side-block side-${side}">
          <h3 class="side-title">${this.sideName(side)} <span class="chip">${heads} אנשים</span></h3>
          <div class="guest-grid">
            ${gs.map((g, i) => {
              const t = g.table && Store.table(g.table);
              return `
              <div class="guest rsvp-${g.rsvp}" data-id="${g.id}" style="animation-delay:${Math.min(i, 12) * 0.03}s">
                <button class="rsvp-btn" data-act="rsvp" title="${OPT.rsvp[g.rsvp]} – לחצו להחלפה">${RSVP_ICON[g.rsvp]}</button>
                <div class="g-main">
                  <div class="g-name">${g.vip ? '⭐ ' : ''}${U.esc(g.name)}${g.count > 1 ? ` <span class="g-count">×${g.count}</span>` : ''}</div>
                  <div class="g-tags">
                    <span class="tag">${OPT.relation[g.relation]}</span>
                    ${g.group ? `<span class="tag grp">${U.esc(g.group)}</span>` : ''}
                    ${g.age === 'senior' ? '<span class="tag">👵 גיל הזהב</span>' : g.age === 'kids' ? '<span class="tag">🧒 ילדים</span>' : ''}
                    ${g.food !== 'regular' ? `<span class="tag">🍽️ ${OPT.food[g.food]}</span>` : ''}
                    ${g.accessible ? '<span class="tag">♿ נגישות</span>' : ''}
                    ${t ? `<span class="tag seat">🪑 ${U.esc(t.name)}</span>` : ''}
                    ${g.sentAt && g.rsvp === 'pending' ? '<span class="tag">📨 נשלח</span>' : ''}
                    ${g.rsvpNote ? `<span class="tag note">💬 ${U.esc(g.rsvpNote)}</span>` : ''}
                  </div>
                </div>
                <div class="g-actions">
                  ${g.phone ? `<a class="icon-btn" href="${U.telHref(g.phone)}" title="התקשרו">📞</a>
                  <a class="icon-btn wa" href="${U.waHref(g.phone, this.inviteText(g))}" target="_blank" rel="noopener" data-sent="${g.id}" title="הזמנה בוואטסאפ">💬</a>` : ''}
                  <button class="icon-btn" data-act="edit" title="עריכה">✏️</button>
                </div>
              </div>`;
            }).join('')}
          </div>
        </section>`;
    }).join('');
  },

  async importContacts() {
    let picked = [];
    try {
      picked = await navigator.contacts.select(['name', 'tel'], { multiple: true });
    } catch (e) {
      console.warn(e);
      return;
    }
    const d = Store.data;
    const have = new Set(d.guests.map((g) => U.localPhone(g.phone)).filter(Boolean));
    let added = 0;
    let dup = 0;
    for (const c of picked || []) {
      const name = ((c.name || []).find(Boolean) || '').trim().slice(0, 60);
      const tel = U.localPhone((c.tel || []).find(Boolean) || '');
      if (!name) continue;
      if (tel && have.has(tel)) { dup++; continue; }
      const g = blankGuest();
      g.name = name;
      g.phone = tel;
      d.guests.push(g);
      if (tel) have.add(tel);
      added++;
    }
    if (!added) {
      if (dup) FX.toast(`כל ${dup} אנשי הקשר כבר ברשימה 👍`, 'info');
      return;
    }
    this.save();
    Sound.correct();
    FX.hearts();
    FX.toast(`💖 נוספו ${added} מוזמנים!${dup ? ` (${dup} כבר היו)` : ''} עכשיו אפשר לערוך לכל אחד צד וקבוצה ✏️`, 'good');
    this.pane();
    this.syncCloud();
  },

  guestForm(g) {
    const isNew = !g;
    const x = isNew ? blankGuest() : JSON.parse(JSON.stringify(g));
    const d = Store.data;
    const groups = [...new Set(d.guests.map((o) => o.group.trim()).filter(Boolean))];
    const others = d.guests.filter((o) => o.id !== x.id);
    const w = d.wedding;
    const sn = Ev.sides(w);
    const sides = { groom: `${sn.groom} (${w.groom})`, bride: `${sn.bride} (${w.bride})`, both: sn.both };

    this.openModal(`
      <h2>${isNew ? '➕ מוזמן חדש' : '✏️ ' + U.esc(x.name)}</h2>
      <form id="gForm" class="form grid2" autocomplete="off">
        <label class="full">שם מלא *<input name="name" required maxlength="60" value="${U.esc(x.name)}" placeholder="למשל: דוד ושרה כהן"></label>
        <label>טלפון<div class="code-row"><input name="phone" type="tel" inputmode="tel" maxlength="20" value="${U.esc(x.phone)}" placeholder="050-0000000">${U.canPickContacts() ? '<button type="button" class="icon-btn" id="pickContact" title="מאנשי הקשר">📇</button>' : ''}</div></label>
        <label>מאיזה צד?<select name="side">${opts(sides, x.side)}</select></label>
        <label>קשר<select name="relation">${opts(OPT.relation, x.relation)}</select></label>
        <label>קבוצה (מי יושב יחד)<input name="group" list="groupList" maxlength="40" value="${U.esc(x.group)}" placeholder="למשל: חברים מהתיכון">
          <datalist id="groupList">${groups.map((s) => `<option value="${U.esc(s)}">`).join('')}</datalist></label>
        <label>כמה מקומות? (כולל בן/בת זוג)<input name="count" type="number" min="1" max="30" value="${x.count}"></label>
        <label>מתוכם ילדים<input name="kids" type="number" min="0" max="30" value="${x.kids}"></label>
        <label>אישור הגעה<select name="rsvp">${opts(OPT.rsvp, x.rsvp)}</select></label>
        <label>גיל<select name="age">${opts(OPT.age, x.age)}</select></label>
        <label>אוכל<select name="food">${opts(OPT.food, x.food)}</select></label>
        <label>איפה נוח לשבת?<select name="pref">${opts(OPT.pref, x.pref)}</select></label>
        <div class="full checks">
          <label class="check"><input type="checkbox" name="vip" ${x.vip ? 'checked' : ''}> ⭐ אורח חשוב (קרוב לזוג)</label>
          <label class="check"><input type="checkbox" name="accessible" ${x.accessible ? 'checked' : ''}> ♿ צריך נגישות</label>
          <label class="check"><input type="checkbox" name="invited" ${x.invited ? 'checked' : ''}> 💌 ההזמנה נשלחה</label>
        </div>
        <div class="full avoid">
          <span>🚫 לא להושיב ליד:</span>
          <div class="avoid-chips" id="avoidChips"></div>
          <div class="code-row">
            <input id="avoidIn" list="avoidList" placeholder="כתבו שם ובחרו מהרשימה">
            <datalist id="avoidList">${others.map((o) => `<option value="${U.esc(o.name)}">`).join('')}</datalist>
            <button type="button" class="btn small secondary" id="avoidAdd">הוסף</button>
          </div>
        </div>
        <label class="full">הערות<textarea name="notes" rows="2" maxlength="300">${U.esc(x.notes)}</textarea></label>
        <div class="full modal-actions">
          <button class="btn" type="submit">שמירה 💾</button>
          ${isNew ? '' : '<button class="btn danger" type="button" id="delGuest">מחיקה 🗑️</button>'}
          <button class="btn secondary" type="button" id="cancel">ביטול</button>
        </div>
      </form>`, true);

    const card = document.getElementById('modalCard');
    const paintAvoid = () => {
      card.querySelector('#avoidChips').innerHTML = x.avoid.map((id) => {
        const o = Store.guest(id);
        return o ? `<button type="button" class="tag avoid-tag" data-rm="${id}">${U.esc(o.name)} ✕</button>` : '';
      }).join('') || '<small class="muted">אין</small>';
    };
    paintAvoid();
    card.querySelector('#avoidChips').onclick = (e) => {
      const b = e.target.closest('[data-rm]');
      if (b) { x.avoid = x.avoid.filter((id) => id !== b.dataset.rm); paintAvoid(); }
    };
    const addAvoid = () => {
      const inp = card.querySelector('#avoidIn');
      const o = others.find((z) => z.name === inp.value.trim());
      if (!o) { Sound.wrong(); FX.shake(inp); return; }
      if (!x.avoid.includes(o.id)) x.avoid.push(o.id);
      inp.value = '';
      Sound.pop();
      paintAvoid();
    };
    card.querySelector('#avoidAdd').onclick = addAvoid;
    card.querySelector('#avoidIn').onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); addAvoid(); } };
    card.querySelector('#cancel').onclick = () => this.closeModal();

    const pc = card.querySelector('#pickContact');
    if (pc) pc.onclick = async (e) => {
      e.preventDefault();
      try {
        const [c] = await navigator.contacts.select(['name', 'tel'], { multiple: false });
        if (!c) return;
        const tel = (c.tel || []).find(Boolean);
        if (tel) card.querySelector('[name="phone"]').value = U.localPhone(tel);
        const nm = card.querySelector('[name="name"]');
        if (!nm.value.trim() && c.name && c.name[0]) nm.value = c.name[0];
        Sound.pop();
      } catch (err) {
        console.warn(err);
      }
    };

    const del = card.querySelector('#delGuest');
    if (del) del.onclick = () => {
      if (!del.dataset.sure) { del.dataset.sure = '1'; del.textContent = 'בטוח? לחצו שוב'; Sound.wrong(); return; }
      d.guests = d.guests.filter((o) => o.id !== x.id);
      d.guests.forEach((o) => { o.avoid = o.avoid.filter((id) => id !== x.id); });
      this.save();
      this.closeModal();
      FX.toast('🗑️ נמחק', 'info');
      this.pane();
    };

    card.querySelector('#gForm').onsubmit = (e) => {
      e.preventDefault();
      const f = new FormData(e.target);
      ['name', 'phone', 'side', 'relation', 'group', 'rsvp', 'age', 'food', 'pref', 'notes'].forEach((k) => { x[k] = String(f.get(k) || '').trim(); });
      x.count = U.clamp(+f.get('count') || 1, 1, 30);
      x.kids = U.clamp(+f.get('kids') || 0, 0, x.count);
      x.vip = !!f.get('vip');
      x.accessible = !!f.get('accessible');
      x.invited = !!f.get('invited');
      if (x.rsvp === 'no') x.table = null;
      if (x.table && !isNew) {
        const t = Store.table(x.table);
        const usedOthers = Seating.used(d, t.id) - Seating.seatsOf(g);
        if (usedOthers + x.count > t.seats) { x.table = null; FX.toast(`📢 אין מספיק מקום ב${U.esc(t.name)} – ${U.esc(x.name)} חוזר/ת לרשימת ההמתנה`, 'info'); }
      }
      if (isNew) d.guests.push(x);
      else Object.assign(g, x);
      // Keep "do not seat near" symmetric so both cards show it.
      d.guests.forEach((o) => {
        if (o.id === x.id) return;
        const want = x.avoid.includes(o.id);
        const has = o.avoid.includes(x.id);
        if (want && !has) o.avoid.push(x.id);
        if (!want && has) o.avoid = o.avoid.filter((id) => id !== x.id);
      });
      this.save();
      this.closeModal();
      Sound.correct();
      FX.toast(isNew ? `💖 ${U.esc(x.name)} נוסף/ה לרשימה!` : '✅ נשמר', 'good');
      if (isNew && d.guests.length === 1) FX.hearts();
      this.pane();
    };
    card.querySelector('[name="name"]').focus();
  },

  /* ---------- Seating ---------- */
  seating(p) {
    const d = Store.data;
    const waiting = d.guests.filter((g) => Seating.attending(g) && !g.table);
    const waitSeats = waiting.reduce((s, g) => s + Seating.seatsOf(g), 0);
    const chip = (g) => `<button class="chip-g side-${g.side} rsvp-${g.rsvp} ${this.picked === g.id ? 'picked' : ''}" data-gid="${g.id}" draggable="true"
        title="${U.esc(g.group || OPT.relation[g.relation])}">${g.vip ? '⭐' : ''}${g.accessible ? '♿' : ''}${U.esc(g.name)}${g.count > 1 ? ` <b>×${g.count}</b>` : ''}${g.rsvp !== 'yes' ? ' <i>?</i>' : ''}</button>`;
    const pickedG = this.picked && Store.guest(this.picked);

    p.innerHTML = `
      <div class="toolbar">
        <button class="btn" id="autoSeat">✨ הושבה אוטומטית</button>
        <button class="btn secondary" id="redoSeat">🔄 לסדר הכל מחדש</button>
        <button class="btn secondary" id="addTable">➕ שולחן</button>
        <button class="btn secondary" id="clearSeat">🧹 לפנות את כל השולחנות</button>
      </div>
      <p class="hint-line">${pickedG
        ? `👉 בחרתם את <b>${U.esc(pickedG.name)}</b>. עכשיו לחצו על שולחן (או על "מחכים לשולחן").`
        : `לחצו על מוזמן ואז על שולחן כדי להעביר אותו. במחשב אפשר גם לגרור. <span class="legend"><i class="lg groom"></i>${Ev.sides(Store.data.wedding).groom} <i class="lg bride"></i>${Ev.sides(Store.data.wedding).bride} <i class="lg both"></i>משותף · <i>?</i> = עוד לא אישר</span>`}</p>
      <div class="pool drop" data-table="">
        <h3>🙋 מחכים לשולחן <span class="chip">${waitSeats} מקומות</span></h3>
        <div class="chips">${waiting.map(chip).join('') || '<span class="muted">כולם כבר יושבים! 🎉</span>'}</div>
      </div>
      <div class="tables">
        ${d.tables.map((t, i) => {
          const people = d.guests.filter((g) => g.table === t.id);
          const used = people.reduce((s, g) => s + Seating.seatsOf(g), 0);
          const pct = Math.min(100, Math.round((100 * used) / t.seats));
          const clash = people.some((g) => Seating.clash(g, people));
          return `
          <div class="table drop zone-${t.zone} ${used >= t.seats ? 'full' : ''} ${used > t.seats ? 'over' : ''}" data-table="${t.id}" style="animation-delay:${Math.min(i, 15) * 0.03}s">
            <div class="t-head">
              <div class="t-ring" style="--p:${pct}"><span>${used}/${t.seats}</span></div>
              <div class="t-title"><b>${U.esc(t.name)}</b><small>${OPT.zone[t.zone]}</small></div>
              <button class="icon-btn small" data-tedit="${t.id}" title="עריכת שולחן">✏️</button>
            </div>
            ${clash ? '<div class="t-warn">⚠️ יש כאן שניים שביקשו לא לשבת יחד</div>' : ''}
            <div class="chips">${people.map(chip).join('') || '<span class="muted small">שולחן ריק</span>'}</div>
          </div>`;
        }).join('')}
      </div>`;

    p.querySelector('#autoSeat').onclick = () => this.autoSeat(false);
    p.querySelector('#redoSeat').onclick = (e) => this.confirmBtn(e.currentTarget, 'בטוח? הכל יזוז', () => this.autoSeat(true));
    p.querySelector('#clearSeat').onclick = (e) => this.confirmBtn(e.currentTarget, 'בטוח? לחצו שוב', () => {
      d.guests.forEach((g) => { g.table = null; });
      this.picked = null;
      this.save();
      Sound.pop();
      this.pane();
    });
    p.querySelector('#addTable').onclick = () => {
      const t = makeTables(1, d.wedding.defaultSeats || 12, d.tables.length + 1)[0];
      t.zone = 'center';
      d.tables.push(t);
      this.save();
      Sound.pop();
      this.pane();
      FX.burstAt(document.querySelector(`[data-table="${t.id}"]`));
    };

    p.onclick = (e) => {
      const edit = e.target.closest('[data-tedit]');
      if (edit) { this.tableForm(Store.table(edit.dataset.tedit)); return; }
      const c = e.target.closest('[data-gid]');
      if (c) {
        this.picked = this.picked === c.dataset.gid ? null : c.dataset.gid;
        Sound.tick();
        this.pane();
        return;
      }
      const drop = e.target.closest('.drop');
      if (drop && this.picked) this.moveTo(this.picked, drop.dataset.table || null);
    };
    p.ondragstart = (e) => {
      const c = e.target.closest('[data-gid]');
      if (!c) return;
      this.picked = c.dataset.gid;
      e.dataTransfer.setData('text/plain', c.dataset.gid);
      e.dataTransfer.effectAllowed = 'move';
    };
    p.ondragover = (e) => {
      const drop = e.target.closest('.drop');
      if (!drop) return;
      e.preventDefault();
      p.querySelectorAll('.drag-over').forEach((el) => el !== drop && el.classList.remove('drag-over'));
      drop.classList.add('drag-over');
    };
    p.ondrop = (e) => {
      const drop = e.target.closest('.drop');
      if (!drop) return;
      e.preventDefault();
      this.moveTo(e.dataTransfer.getData('text/plain') || this.picked, drop.dataset.table || null);
    };
  },

  moveTo(gid, tid) {
    const d = Store.data;
    const g = Store.guest(gid);
    if (!g) return;
    if (g.table === tid) { this.picked = null; this.pane(); return; }
    if (tid) {
      const t = Store.table(tid);
      const free = t.seats - Seating.used(d, tid);
      const el = document.querySelector(`[data-table="${tid}"]`);
      if (free < Seating.seatsOf(g)) {
        Sound.wrong();
        FX.shake(el);
        FX.toast(`🙈 אין מקום: ב${U.esc(t.name)} נשארו ${free} מקומות, ו${U.esc(g.name)} צריך/ה ${Seating.seatsOf(g)}`, 'bad');
        return;
      }
      const other = Seating.clash(g, d.guests.filter((o) => o.table === tid));
      g.table = tid;
      this.picked = null;
      this.save();
      this.pane();
      Sound.seat();
      FX.burstAt(document.querySelector(`[data-table="${tid}"]`));
      if (other) FX.toast(`⚠️ שימו לב: ${U.esc(g.name)} ו${U.esc(other.name)} ביקשו לא לשבת יחד`, 'bad');
      else FX.toast(`🪑 ${U.esc(g.name)} ← ${U.esc(t.name)}`, 'good');
    } else {
      g.table = null;
      this.picked = null;
      this.save();
      this.pane();
      Sound.pop();
    }
  },

  autoSeat(redo) {
    const d = Store.data;
    if (!d.guests.some(Seating.attending)) { Sound.wrong(); FX.toast('🙈 עוד אין מוזמנים להושיב', 'bad'); return; }
    const { placed, left } = Seating.auto(d, redo);
    this.picked = null;
    this.save();
    this.pane();
    if (left.length) {
      const need = left.reduce((s, g) => s + Seating.seatsOf(g), 0);
      Sound.pop();
      FX.toast(`הושבתי ${placed}. ל-${left.length} מוזמנים (${need} מקומות) לא היה מקום – הוסיפו שולחן ➕`, 'info');
    } else if (placed) {
      Sound.win();
      FX.confetti();
      FX.toast(`✨ הושבתי ${placed} מוזמנים! עכשיו אפשר לתקן ידנית`, 'good');
    } else FX.toast('כולם כבר יושבים 🎉', 'good');
  },

  tableForm(t) {
    const d = Store.data;
    this.openModal(`
      <h2>🍽️ ${U.esc(t.name)}</h2>
      <form id="tForm" class="form">
        <label>שם השולחן<input name="name" required maxlength="30" value="${U.esc(t.name)}"></label>
        <label>כמה מקומות?<input name="seats" type="number" min="1" max="60" value="${t.seats}"></label>
        <label>איפה הוא באולם?<select name="zone">${opts(OPT.zone, t.zone)}</select></label>
        <div class="modal-actions">
          <button class="btn" type="submit">שמירה 💾</button>
          <button class="btn danger" type="button" id="delTable">מחיקה 🗑️</button>
          <button class="btn secondary" type="button" id="cancel">ביטול</button>
        </div>
      </form>`);
    const card = document.getElementById('modalCard');
    card.querySelector('#cancel').onclick = () => this.closeModal();
    card.querySelector('#delTable').onclick = (e) => this.confirmBtn(e.currentTarget, 'בטוח? לחצו שוב', () => {
      d.guests.forEach((g) => { if (g.table === t.id) g.table = null; });
      d.tables = d.tables.filter((x) => x.id !== t.id);
      this.save();
      this.closeModal();
      this.pane();
    });
    card.querySelector('#tForm').onsubmit = (e) => {
      e.preventDefault();
      const f = new FormData(e.target);
      t.name = String(f.get('name')).trim() || t.name;
      t.seats = U.clamp(+f.get('seats') || t.seats, 1, 60);
      t.zone = f.get('zone');
      this.save();
      this.closeModal();
      Sound.correct();
      this.pane();
    };
  },

  /* ---------- Share (WhatsApp / copy / print) ---------- */
  report: 'invite',
  withPhones: false,

  reportText() {
    const d = Store.data;
    const w = d.wedding;
    const line = '━━━━━━━━━━━━';
    const n = (g) => Seating.seatsOf(g);
    const who = (g) => `• ${g.name}${n(g) > 1 ? ` (${n(g)})` : ''}${g.rsvp !== 'yes' ? ' ❔' : ''}`;
    const sum = (gs) => gs.reduce((s, g) => s + n(g), 0);
    const coming = d.guests.filter(Seating.attending);
    const head = [`${Ev.of(w).icon} *${Ev.isWedding(w) ? Ev.pair(w) : Ev.headline(w)}*`, [U.fmtDate(w.date), w.time ? '🕖 ' + w.time : '', w.venue].filter(Boolean).join(' · '), w.address ? '📍 ' + w.address : ''].filter(Boolean);
    const out = [];

    if (this.report === 'tables') {
      out.push(...head, '🪑 *סידור הושבה*', line);
      for (const t of d.tables) {
        const gs = coming.filter((g) => g.table === t.id);
        if (!gs.length) continue;
        out.push(`🍽️ *${t.name}* (${sum(gs)}/${t.seats}) · ${OPT.zone[t.zone]}`, ...gs.map(who), '');
      }
      const wait = coming.filter((g) => !g.table);
      if (wait.length) out.push(`🙋 *עוד בלי שולחן* (${sum(wait)})`, ...wait.map(who), '');
      out.push(line, `מגיעים: ${sum(coming)} · יש להם מקום: ${sum(coming.filter((g) => g.table))}`);
      if (coming.some((g) => g.rsvp !== 'yes')) out.push('❔ = עוד לא אישר/ה הגעה');
    } else if (this.report === 'guests') {
      out.push(...head, '👥 *רשימת המוזמנים*', line);
      for (const side of ['groom', 'bride', 'both']) {
        const gs = d.guests.filter((g) => g.side === side);
        if (!gs.length) continue;
        out.push(`*${this.sideName(side)}* (${sum(gs)})`);
        gs.forEach((g) => {
          const t = g.table && Store.table(g.table);
          out.push(`${RSVP_ICON[g.rsvp]} ${g.name}${n(g) > 1 ? ` (${n(g)})` : ''}${t ? ` · ${t.name}` : ''}${this.withPhones && g.phone ? ` · ${U.fmtPhone(g.phone)}` : ''}`);
        });
        out.push('');
      }
      const by = (r) => sum(d.guests.filter((g) => g.rsvp === r));
      out.push(line, `✅ מגיעים ${by('yes')} · 🤔 אולי ${by('maybe')} · ⏳ ממתינים ${by('pending')} · ❌ לא מגיעים ${by('no')}`);
    } else {
      out.push(...head, '🍽️ *לאולם – מנות לפי שולחן*', line);
      const meals = (gs) => {
        const kids = gs.reduce((s, g) => s + (+g.kids || 0), 0);
        const special = {};
        gs.forEach((g) => { if (g.food !== 'regular') special[g.food] = (special[g.food] || 0) + n(g); });
        return [kids ? `🧒 ילדים ${kids}` : '', ...Object.entries(special).map(([k, v]) => `${OPT.food[k]} ${v}`)].filter(Boolean).join(' · ');
      };
      for (const t of d.tables) {
        const gs = coming.filter((g) => g.table === t.id);
        if (!gs.length) continue;
        const m = meals(gs);
        out.push(`*${t.name}*: ${sum(gs)} מנות${m ? ` (${m})` : ''}`);
      }
      const wait = coming.filter((g) => !g.table);
      if (wait.length) out.push(`עוד בלי שולחן: ${sum(wait)}`);
      const all = meals(coming);
      out.push(line, `*סה"כ: ${sum(coming)} מנות*${all ? ` (${all})` : ''}`, `מתוכם אישרו: ${sum(coming.filter((g) => g.rsvp === 'yes'))}`);
    }
    return out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
  },

  inviteWho: 'pending',
  skipped: new Set(),

  invites(p) {
    const d = Store.data;
    this.ensureTokens();
    const open = (g) => g.rsvp === 'pending' || g.rsvp === 'maybe';
    const pool = d.guests.filter((g) => this.inviteWho === 'all' || open(g));
    const withPhone = pool.filter((g) => U.digits(g.phone).length >= 9);
    const noPhone = pool.length - withPhone.length;
    const sent = withPhone.filter((g) => g.sentAt);
    const next = withPhone.find((g) => !g.sentAt && !this.skipped.has(g.id));
    const pct = withPhone.length ? Math.round((100 * sent.length) / withPhone.length) : 0;
    const ago = (iso) => {
      const m = Math.round((Date.now() - new Date(iso)) / 60000);
      return m < 1 ? 'עכשיו' : m < 60 ? `לפני ${m} דק'` : m < 1440 ? `לפני ${Math.round(m / 60)} שע'` : `לפני ${Math.round(m / 1440)} ימים`;
    };

    p.innerHTML += `
      <div class="panel invite-panel">
        <p>${Cloud.on()
          ? 'שולחים לכל מוזמן הודעה בוואטסאפ עם <b>קישור אישי</b>. הוא לוחץ, עונה – והתשובה מופיעה כאן לבד ✨'
          : 'שולחים לכל מוזמן הודעה בוואטסאפ, והוא עונה בהודעה חוזרת.'}</p>
        <div class="toolbar seg">
          <button class="btn ${this.inviteWho === 'pending' ? '' : 'secondary'}" data-who="pending">⏳ מי שעוד לא ענה (${d.guests.filter(open).length})</button>
          <button class="btn ${this.inviteWho === 'all' ? '' : 'secondary'}" data-who="all">👥 כולם (${d.guests.length})</button>
        </div>
        <div class="send-progress"><div class="bar"><i style="width:${pct}%"></i></div><span>נשלחו ${sent.length} מתוך ${withPhone.length}</span></div>
        ${next ? `
          <div class="next-send">
            <a class="btn big wa-btn" href="${U.waHref(next.phone, this.inviteText(next))}" target="_blank" rel="noopener" data-send="${next.id}">💬 לשלוח ל${U.esc(next.name)}</a>
            <button class="btn secondary" data-skip="${next.id}">דלג ⏭️</button>
          </div>
          <p class="muted small">לוחצים → וואטסאפ נפתח עם ההודעה מוכנה → לוחצים "שלח" → חוזרים לכאן לבא בתור.</p>`
        : withPhone.length ? `
          <div class="all-sent">🎉 שלחתם לכולם!</div>
          ${sent.some(open) ? '<button class="btn secondary" id="again">🔄 סבב תזכורת – לשלוח שוב למי שעוד לא ענה</button>' : ''}`
        : '<p class="muted">אין כאן מוזמנים עם טלפון.</p>'}
        ${noPhone ? `<p class="muted small">📵 ל-${noPhone} מוזמנים אין טלפון ברשימה.</p>` : ''}
        <div class="send-list">
          ${withPhone.map((g) => `
            <div class="send-row ${g.sentAt ? 'done' : ''}">
              <span class="s-ic">${RSVP_ICON[g.rsvp]}</span>
              <span class="s-name">${U.esc(g.name)}</span>
              <span class="muted small">${g.sentAt ? '📨 ' + ago(g.sentAt) : ''}</span>
              <a class="icon-btn small wa" href="${U.waHref(g.phone, this.inviteText(g))}" target="_blank" rel="noopener" data-send="${g.id}" title="שליחה">💬</a>
            </div>`).join('')}
        </div>
      </div>`;

    p.onclick = (e) => {
      const r = e.target.closest('[data-rep]');
      if (r) { this.report = r.dataset.rep; this.pane(); return; }
      const who = e.target.closest('[data-who]');
      if (who) { this.inviteWho = who.dataset.who; this.skipped.clear(); this.pane(); return; }
      const s = e.target.closest('[data-send]');
      if (s) {
        this.markSent(s.dataset.send);
        Sound.seat();
        setTimeout(() => { if (this.tab === 'share') this.pane(); }, 400);
        return;
      }
      const sk = e.target.closest('[data-skip]');
      if (sk) { this.skipped.add(sk.dataset.skip); Sound.pop(); this.pane(); return; }
      if (e.target.closest('#again')) {
        d.guests.forEach((g) => { if (open(g)) g.sentAt = ''; });
        this.skipped.clear();
        this.save();
        Sound.pop();
        this.pane();
      }
    };
  },

  share(p) {
    const kinds = { invite: '💌 אישורי הגעה', tables: '🪑 לפי שולחנות', guests: '👥 כל המוזמנים', hall: '🍽️ לאולם (מנות)' };
    const seg = `
      <div class="toolbar seg">
        ${Object.entries(kinds).map(([k, v]) => `<button class="btn ${this.report === k ? '' : 'secondary'}" data-rep="${k}">${v}</button>`).join('')}
      </div>`;
    if (this.report === 'invite') { p.innerHTML = seg; this.invites(p); return; }
    p.innerHTML = `
      ${seg}
      ${this.report === 'guests' ? `<label class="check share-opt"><input type="checkbox" id="withPhones" ${this.withPhones ? 'checked' : ''}> 📞 להוסיף טלפונים</label>` : ''}
      <pre class="report" id="report">${U.esc(this.reportText())}</pre>
      <div class="toolbar share-actions">
        <button class="btn wa-btn" id="toWa">💬 שליחה בוואטסאפ</button>
        ${navigator.share ? '<button class="btn secondary" id="toShare">📤 שיתוף…</button>' : ''}
        <button class="btn secondary" id="toCopy">📋 העתקה</button>
        <button class="btn secondary" id="toPrint">🖨️ הדפסה</button>
      </div>`;
    p.onclick = (e) => {
      const r = e.target.closest('[data-rep]');
      if (r) { this.report = r.dataset.rep; this.pane(); }
    };
    const ph = p.querySelector('#withPhones');
    if (ph) ph.onchange = () => { this.withPhones = ph.checked; this.pane(); };
    const text = () => this.reportText();
    p.querySelector('#toWa').onclick = () => {
      window.open('https://wa.me/?text=' + encodeURIComponent(text()), '_blank', 'noopener');
    };
    const sh = p.querySelector('#toShare');
    if (sh) sh.onclick = () => navigator.share({ text: text() }).catch(() => {});
    p.querySelector('#toCopy').onclick = async () => {
      try {
        await navigator.clipboard.writeText(text());
        Sound.correct();
        FX.toast('📋 הועתק! עכשיו מדביקים בוואטסאפ', 'good');
      } catch (e) {
        Sound.wrong();
        FX.toast('🙈 לא הצלחתי להעתיק – סמנו את הטקסט והעתיקו ביד', 'bad');
      }
    };
    p.querySelector('#toPrint').onclick = () => {
      document.body.classList.add('printing');
      window.print();
      setTimeout(() => document.body.classList.remove('printing'), 500);
    };
  },

  /* ---------- Settings ---------- */
  settings(p) {
    const d = Store.data;
    const w = d.wedding;
    p.innerHTML = `
      <div class="settings">
        <section class="panel">
          <h3>${Ev.of(w).icon} האירוע</h3>
          <form id="wForm" class="form grid2">
            ${this.eventFields(w)}
            <label>תאריך<input name="date" type="date" value="${U.esc(w.date)}"></label>
            <label>שעת האירוע<input name="time" type="time" value="${U.esc(w.time)}"></label>
            <label>שם האולם (אולם / גן)<input name="venue" maxlength="60" value="${U.esc(w.venue)}"></label>
            <label>כתובת האולם<input name="address" maxlength="100" placeholder="רחוב, מספר, עיר" value="${U.esc(w.address)}"></label>
            <label>מקומות בשולחן רגיל<input name="defaultSeats" type="number" min="1" max="60" value="${w.defaultSeats}"></label>
            <label>כמה שולחנות יש באולם?<input name="tables" type="number" min="0" max="200" value="${d.tables.length}"></label>
            <div class="full modal-actions"><button class="btn" type="submit">שמירה 💾</button></div>
          </form>
        </section>

        <section class="panel">
          <h3>📁 שמירה וגיבוי</h3>
          ${Cloud.on()
            ? `<p>☁️ כל שינוי נשמר <b>לבד, באינטרנט</b>. אפשר להיכנס מכל טלפון עם אותה תעודת זהות – והרשימה שם.</p>
               <p class="muted small">אין אינטרנט? לא נורא. השינויים נשמרים בטלפון ועולים לבד כשהחיבור חוזר.</p>`
            : `<p>כל שינוי נשמר <b>במכשיר הזה</b>. כדי לראות את אותה רשימה גם בטלפון אחר:</p>
               <ol>
                 <li>לחצו <b>הורדת קובץ</b>.</li>
                 <li>מעלים את הקובץ לאתר (GitHub), ליד כל שאר הקבצים.</li>
                 <li>נכנסים מכל טלפון עם אותה תעודת זהות. 🎉</li>
               </ol>
               <p class="muted small">שם הקובץ: <span class="code">${Store.fileName()}</span></p>`}
          <p class="muted small">🔒 הרשימה נעולה – רק מי שיודע את הקוד יכול לפתוח אותה. "הורדת קובץ" = גיבוי ששמור אצלכם.</p>
          <div class="modal-actions">
            <button class="btn ${Cloud.on() ? 'secondary' : ''}" id="dl">⬇️ הורדת קובץ (גיבוי)</button>
            <label class="btn secondary file-btn">⬆️ טעינת קובץ<input type="file" accept=".json,application/json" hidden></label>
            ${Store.hasRemote ? `<button class="btn secondary" id="reload">${Cloud.on() ? '🔄 לטעון מהאינטרנט' : '☁️ לטעון מהאתר'}</button>` : ''}
          </div>
        </section>

        <section class="panel">
          <h3>🚪 יציאה</h3>
          <div class="modal-actions">
            <button class="btn secondary" id="out">יציאה</button>
            <button class="btn danger" id="forget">🗑️ למחוק מהמכשיר הזה</button>
          </div>
        </section>
      </div>`;

    this.wireEventFields(p.querySelector('#wForm'));
    p.querySelector('#wForm').onsubmit = (e) => {
      e.preventDefault();
      const f = new FormData(e.target);
      ['type', 'hero', 'groom', 'bride', 'date', 'time', 'venue', 'address'].forEach((k) => { w[k] = String(f.get(k) || '').trim(); });
      if (!EVENTS[w.type]) w.type = 'wedding';
      if (!EVENTS[w.type].hero) w.hero = '';
      w.defaultSeats = U.clamp(+f.get('defaultSeats') || 12, 1, 60);
      const want = U.clamp(+f.get('tables') || 0, 0, 200);
      if (want > d.tables.length) d.tables.push(...makeTables(want - d.tables.length, w.defaultSeats, d.tables.length + 1));
      while (d.tables.length > want) {
        const t = d.tables.pop();
        d.guests.forEach((g) => { if (g.table === t.id) g.table = null; });
      }
      this.save();
      Sound.correct();
      FX.toast('✅ נשמר', 'good');
      this.dash();
    };
    p.querySelector('#dl').onclick = async () => {
      await Store.download();
      Sound.correct();
      FX.toast('⬇️ הקובץ ירד. שמרו אותו במקום בטוח', 'good');
    };
    p.querySelector('input[type=file]').onchange = (e) => this.importFrom(e.target.files[0], false);
    const reload = p.querySelector('#reload');
    if (reload) reload.onclick = (e) => this.confirmBtn(e.currentTarget, 'השינויים במכשיר יימחקו. בטוח?', async () => {
      if (await Store.reloadRemote()) { Sound.correct(); FX.toast('☁️ נטען מהאתר', 'good'); this.dash(); }
      else { Sound.wrong(); FX.toast('🙈 לא מצאתי קובץ באתר', 'bad'); }
    });
    p.querySelector('#out').onclick = () => this.askLogout();
    p.querySelector('#forget').onclick = (e) => this.confirmBtn(e.currentTarget, 'כל הרשימה תימחק מהמכשיר. בטוח?', () => {
      Store.forgetDevice();
      sessionStorage.removeItem('kululu_code');
      FX.toast('🗑️ נמחק מהמכשיר', 'info');
      this.login();
    });
  },

  /* ---------- Small helpers ---------- */
  confirmBtn(btn, text, fn) {
    if (!btn.dataset.sure) {
      btn.dataset.sure = '1';
      btn.dataset.orig = btn.textContent;
      btn.textContent = text;
      btn.classList.add('danger');
      Sound.wrong();
      setTimeout(() => {
        if (!btn.isConnected) return;
        delete btn.dataset.sure;
        btn.textContent = btn.dataset.orig;
        btn.classList.remove('danger');
      }, 3500);
      return;
    }
    fn();
  },

  openModal(html, wide) {
    const m = document.getElementById('modal');
    const card = document.getElementById('modalCard');
    card.classList.toggle('wide', !!wide);
    card.innerHTML = html;
    m.classList.remove('hidden');
    FX.pop(card);
  },

  closeModal() {
    const m = document.getElementById('modal');
    if (m) m.classList.add('hidden');
  },
};
