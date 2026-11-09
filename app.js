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

    if (!Vault.ready()) {
      this.root.innerHTML = `<div class="login fade-in"><div class="rings">💍</div>
        <p class="tagline">צריך לפתוח את האפליקציה דרך האתר (https) או דרך <b>start.cmd</b>, ולא ישירות מהקובץ.</p></div>`;
      return;
    }
    const saved = sessionStorage.getItem('kululu_code');
    if (saved) this.enter(saved, true);
    else this.login();
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
        <p class="tagline">רשימת המוזמנים וההושבה של החתונה שלכם – במקום אחד, בכל טלפון.</p>
        <form class="login-card" id="loginForm" autocomplete="off">
          <label for="code">הכניסו תעודת זהות (או קוד אישי)</label>
          <div class="code-row">
            <input id="code" type="password" inputmode="numeric" placeholder="•••••••••" autofocus>
            <button type="button" class="icon-btn" id="peek" title="הצג">👁️</button>
          </div>
          <button class="btn big" type="submit">כניסה 💖</button>
          <p class="muted small">כל זוג רואה רק את החתונה שלו. הקובץ נעול עם הקוד שלכם.</p>
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
    this.root.innerHTML = '<div class="login fade-in"><div class="rings spin">💍</div><p class="tagline">פותחים את החתונה...</p></div>';
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
  },

  askCreate() {
    this.openModal(`
      <div class="result-emoji">💌</div>
      <h2>חתונה חדשה?</h2>
      <p>לא מצאנו חתונה לקוד הזה. בואו נפתח אחת!</p>
      <form id="newForm" class="form">
        <label>שם החתן<input name="groom" required maxlength="30" placeholder="למשל: איתי"></label>
        <label>שם הכלה<input name="bride" required maxlength="30" placeholder="למשל: נועה"></label>
        <label>תאריך החתונה<input name="date" type="date"></label>
        <div class="modal-actions">
          <button class="btn" type="submit">פותחים חתונה 🎉</button>
          <label class="btn secondary file-btn">יש לי קובץ ⬆️<input type="file" accept=".json,application/json" hidden></label>
          <button class="btn secondary" type="button" data-m="close">ביטול</button>
        </div>
      </form>`);
    const card = document.getElementById('modalCard');
    card.querySelector('[data-m="close"]').onclick = () => { this.closeModal(); this.login(); };
    card.querySelector('#newForm').onsubmit = (e) => {
      e.preventDefault();
      const f = new FormData(e.target);
      Store.create(f.get('groom').trim(), f.get('bride').trim(), f.get('date'));
      sessionStorage.setItem('kululu_code', Store.code);
      this.closeModal();
      Sound.bells();
      FX.confetti();
      this.tab = 'guests';
      this.dash();
    };
    card.querySelector('input[type=file]').onchange = (e) => this.importFrom(e.target.files[0], true);
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
  chrome() {
    const w = Store.data && Store.data.wedding;
    document.getElementById('logoutBtn').classList.toggle('hidden', !w);
    document.getElementById('countChip').classList.toggle('hidden', !w);
    document.getElementById('brandSub').textContent = w ? `החתונה של ${w.groom} ו${w.bride}` : 'רשימת מוזמנים והושבה';
    document.title = w ? `קולולו – ${w.groom} ו${w.bride} 💍` : 'קולולו – רשימת מוזמנים והושבה';
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
    const count = days == null ? 'עוד לא קבעתם תאריך? אפשר להוסיף בהגדרות ⚙️'
      : days > 1 ? `עוד <b>${days}</b> ימים לחופה 💫`
      : days === 1 ? 'מחר החתונה! 🥳'
      : days === 0 ? 'היום החתונה! מזל טוב! 🎉'
      : 'מזל טוב! 💖';
    this.root.innerHTML = `
      <div class="dash fade-in">
        <section class="couple">
          <div class="couple-names"><span>${U.esc(w.groom)}</span><b class="amp">💞</b><span>${U.esc(w.bride)}</span></div>
          <div class="couple-meta">${[U.fmtDate(w.date), U.esc(w.venue)].filter(Boolean).join(' · ')}</div>
          <div class="countdown">${count}</div>
        </section>
        <div class="stats" id="stats">${this.statsHtml()}</div>
        <div class="hint"><button class="hint-bot" id="mascot" title="עוד טיפ">👰</button><div id="hintText">${TIPS[this.tip]}</div></div>
        <nav class="tabs" id="tabs">
          <button data-tab="guests">👥 מוזמנים</button>
          <button data-tab="seating">🪑 הושבה</button>
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
    else if (this.tab === 'settings') this.settings(p);
    else this.guests(p);
  },

  /* ---------- Guests ---------- */
  sideName(side) {
    const w = Store.data.wedding;
    return side === 'groom' ? `צד החתן – ${w.groom}` : side === 'bride' ? `צד הכלה – ${w.bride}` : 'משותף';
  },

  guests(p) {
    const f = this.filter;
    p.innerHTML = `
      <div class="toolbar">
        <input id="q" class="search" type="search" placeholder="🔍 חיפוש: שם, טלפון או קבוצה" value="${U.esc(f.q)}">
        <select id="fSide"><option value="all">כל הצדדים</option>${opts(OPT.side, f.side)}</select>
        <select id="fRsvp"><option value="all">כל התשובות</option>${opts(OPT.rsvp, f.rsvp)}</select>
        <button class="btn" id="addGuest">➕ מוזמן חדש</button>
      </div>
      <div id="guestList"></div>`;
    p.querySelector('#q').oninput = (e) => { f.q = e.target.value; Sound.tick(); this.guestList(); };
    p.querySelector('#fSide').onchange = (e) => { f.side = e.target.value; this.guestList(); };
    p.querySelector('#fRsvp').onchange = (e) => { f.rsvp = e.target.value; this.guestList(); };
    p.querySelector('#addGuest').onclick = () => this.guestForm(null);
    p.onclick = (e) => {
      const card = e.target.closest('[data-id]');
      if (!card) return;
      const g = Store.guest(card.dataset.id);
      if (e.target.closest('[data-act="edit"]')) this.guestForm(g);
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

    const w = d.wedding;
    const invite = (g) => `שלום ${g.name}! 💍 ${w.groom} ו${w.bride} מתחתנים${w.date ? ' ב' + U.fmtDate(w.date) : ''}${w.venue ? ', ב' + w.venue : ''}. נשמח מאוד לראות אותך! תוכל/י לאשר הגעה?`;
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
                  </div>
                </div>
                <div class="g-actions">
                  ${g.phone ? `<a class="icon-btn" href="${U.telHref(g.phone)}" title="התקשרו">📞</a>
                  <a class="icon-btn wa" href="${U.waHref(g.phone, invite(g))}" target="_blank" rel="noopener" title="הזמנה בוואטסאפ">💬</a>` : ''}
                  <button class="icon-btn" data-act="edit" title="עריכה">✏️</button>
                </div>
              </div>`;
            }).join('')}
          </div>
        </section>`;
    }).join('');
  },

  guestForm(g) {
    const isNew = !g;
    const x = isNew ? blankGuest() : JSON.parse(JSON.stringify(g));
    const d = Store.data;
    const groups = [...new Set(d.guests.map((o) => o.group.trim()).filter(Boolean))];
    const others = d.guests.filter((o) => o.id !== x.id);
    const w = d.wedding;
    const sides = { groom: `צד החתן (${w.groom})`, bride: `צד הכלה (${w.bride})`, both: 'משותף' };

    this.openModal(`
      <h2>${isNew ? '➕ מוזמן חדש' : '✏️ ' + U.esc(x.name)}</h2>
      <form id="gForm" class="form grid2" autocomplete="off">
        <label class="full">שם מלא *<input name="name" required maxlength="60" value="${U.esc(x.name)}" placeholder="למשל: דוד ושרה כהן"></label>
        <label>טלפון<input name="phone" type="tel" inputmode="tel" maxlength="20" value="${U.esc(x.phone)}" placeholder="050-0000000"></label>
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
        : 'לחצו על מוזמן ואז על שולחן כדי להעביר אותו. במחשב אפשר גם לגרור. <span class="legend"><i class="lg groom"></i>חתן <i class="lg bride"></i>כלה <i class="lg both"></i>משותף · <i>?</i> = עוד לא אישר</span>'}</p>
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

  /* ---------- Settings ---------- */
  settings(p) {
    const d = Store.data;
    const w = d.wedding;
    p.innerHTML = `
      <div class="settings">
        <section class="panel">
          <h3>💍 הזוג</h3>
          <form id="wForm" class="form grid2">
            <label>שם החתן<input name="groom" required maxlength="30" value="${U.esc(w.groom)}"></label>
            <label>שם הכלה<input name="bride" required maxlength="30" value="${U.esc(w.bride)}"></label>
            <label>תאריך<input name="date" type="date" value="${U.esc(w.date)}"></label>
            <label>מקום (אולם / גן)<input name="venue" maxlength="60" value="${U.esc(w.venue)}"></label>
            <label>מקומות בשולחן רגיל<input name="defaultSeats" type="number" min="1" max="60" value="${w.defaultSeats}"></label>
            <label>כמה שולחנות יש באולם?<input name="tables" type="number" min="0" max="200" value="${d.tables.length}"></label>
            <div class="full modal-actions"><button class="btn" type="submit">שמירה 💾</button></div>
          </form>
        </section>

        <section class="panel">
          <h3>📁 שמירה וגיבוי</h3>
          <p>כל שינוי נשמר <b>במכשיר הזה</b>. כדי לראות את אותה רשימה גם בטלפון אחר:</p>
          <ol>
            <li>לחצו <b>הורדת קובץ</b>.</li>
            <li>מעלים את הקובץ לאתר (GitHub), ליד כל שאר הקבצים.</li>
            <li>נכנסים מכל טלפון עם אותה תעודת זהות. 🎉</li>
          </ol>
          <p class="muted small">שם הקובץ: <span class="code">${Store.fileName()}</span> · הקובץ נעול – רק מי שיודע את הקוד יכול לפתוח אותו.</p>
          <div class="modal-actions">
            <button class="btn" id="dl">⬇️ הורדת קובץ</button>
            <label class="btn secondary file-btn">⬆️ טעינת קובץ<input type="file" accept=".json,application/json" hidden></label>
            ${Store.hasRemote ? '<button class="btn secondary" id="reload">☁️ לטעון מהאתר</button>' : ''}
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

    p.querySelector('#wForm').onsubmit = (e) => {
      e.preventDefault();
      const f = new FormData(e.target);
      ['groom', 'bride', 'date', 'venue'].forEach((k) => { w[k] = String(f.get(k) || '').trim(); });
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
