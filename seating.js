'use strict';

/* ---------- Seating: who sits where ---------- */
const Seating = {
  seatsOf: (g) => Math.max(1, +g.count || 1),
  attending: (g) => g.rsvp !== 'no',
  clusterKey: (g) => g.side + '|' + (g.group.trim() || g.relation),

  used(data, tid) {
    return data.guests.reduce((s, g) => s + (g.table === tid ? this.seatsOf(g) : 0), 0);
  },

  clash(g, people) {
    return people.find((o) => o.id !== g.id && (g.avoid.includes(o.id) || o.avoid.includes(g.id)));
  },

  score(g, t, people, freeAfter) {
    const key = this.clusterKey(g);
    let s = 0;
    for (const o of people) {
      if (this.clusterKey(o) === key) { s += 50; continue; }
      const sameSide = o.side === g.side || o.side === 'both' || g.side === 'both';
      const fam = (x) => x.relation === 'family1' || x.relation === 'family2';
      if ((o.relation === 'family1' && g.relation === 'family1') || (fam(o) && fam(g) && sameSide)) { s += 15; continue; }
      s -= 6;
      if (sameSide) s += 3;
      if (o.relation === g.relation) s += 3;
      if (o.age === g.age) s += 2;
    }
    if (!people.length) s += 5;
    if (g.pref !== 'any' && g.pref === t.zone) s += 25;
    if (g.accessible && t.zone === 'exit') s += 30;
    if (g.age === 'senior' && t.zone === 'quiet') s += 10;
    if (g.age === 'senior' && t.zone === 'dance') s -= 8;
    if (g.age === 'young' && t.zone === 'dance') s += 6;
    if (g.vip && t.zone === 'dance') s += 15;
    return s - freeAfter * 0.3;
  },

  // Seats everyone who is coming (or may come) and has no table yet.
  // redo = true clears all tables first.
  auto(data, redo) {
    data.guests.forEach((g) => { if (redo || !this.attending(g)) g.table = null; });
    const tables = data.tables;
    const at = {};
    const free = {};
    for (const t of tables) {
      at[t.id] = data.guests.filter((g) => g.table === t.id);
      free[t.id] = t.seats - this.used(data, t.id);
    }

    const groups = new Map();
    for (const g of data.guests) {
      if (!this.attending(g) || g.table) continue;
      const k = this.clusterKey(g);
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(g);
    }
    const list = [...groups.values()].map((gs) => ({
      gs: gs.sort((a, b) => this.seatsOf(b) - this.seatsOf(a)),
      size: gs.reduce((s, g) => s + this.seatsOf(g), 0),
      vip: gs.some((g) => g.vip),
      rank: Math.min(...gs.map((g) => RELATION_RANK[g.relation] ?? 6)),
    }));
    list.sort((a, b) => (b.vip - a.vip) || (a.rank - b.rank) || (b.size - a.size));

    const put = (g, t) => {
      g.table = t.id;
      at[t.id].push(g);
      free[t.id] -= this.seatsOf(g);
    };
    let placed = 0;
    const left = [];

    for (const c of list) {
      // First try to keep the whole group at one table.
      let best = null;
      let bestScore = -Infinity;
      const inner = c.gs.some((g) => this.clash(g, c.gs));
      for (const t of inner ? [] : tables) {
        if (free[t.id] < c.size || c.gs.some((g) => this.clash(g, at[t.id]))) continue;
        const sc = c.gs.reduce((s, g) => s + this.score(g, t, at[t.id], free[t.id] - c.size), 0) / c.gs.length;
        if (sc > bestScore) { bestScore = sc; best = t; }
      }
      if (best) {
        c.gs.forEach((g) => put(g, best));
        placed += c.gs.length;
        continue;
      }
      // Too big (or blocked): place one by one, friends pull each other together.
      for (const g of c.gs) {
        const need = this.seatsOf(g);
        let tb = null;
        let ts = -Infinity;
        for (const t of tables) {
          if (free[t.id] < need || this.clash(g, at[t.id])) continue;
          const sc = this.score(g, t, at[t.id], free[t.id] - need);
          if (sc > ts) { ts = sc; tb = t; }
        }
        if (tb) { put(g, tb); placed++; } else left.push(g);
      }
    }
    return { placed, left };
  },
};
