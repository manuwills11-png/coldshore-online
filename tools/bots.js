// Test bots: two fake players that run every operation start to finish against a local server.
// usage: node tools/bots.js [ws://localhost:8790] [players=2]
'use strict';
const WebSocket = require('ws');
const URL = process.argv[2] || 'ws://localhost:8790', NP = +(process.argv[3] || 2);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
function bot(name) {
  const b = { name, pid: require('crypto').randomBytes(8).toString('hex'), q: [], st: { x: 6400, y: 3560, lv: 0, hp: 100, down: false, use: false }, ws: new WebSocket(URL), on: {} };
  b.ws.on('message', raw => { const m = JSON.parse(raw); b.q.push(m); (b.on[m.t] || []).forEach(f => f(m)); if (m.t === 'stage') b.stage = m; if (m.t === 'cargo') b.cargo = m.c; if (m.t === 'needpts') b.needpts = m; if (m.t === 'mission.end') b.end = m; if (m.t === 'crew') b.crew = m.crew; if (m.t === 'joined') { b.code = m.code; b.crew = m.crew; } if (m.t === 'host') b.host = m.pid; if (m.t === 'prog') b.prog = m; if (m.t === 'relay') b.ri = m.ri; if (m.t === 'esc') b.esc = m; if (m.t === 'err') console.log(name, 'ERR', m.m); });
  b.send = o => b.ws.send(JSON.stringify(o));
  b.ready = new Promise(r => b.ws.on('open', r));
  b.wait = async (pred, ms = 20000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { const m = b.q.find(pred); if (m) { b.q.splice(b.q.indexOf(m), 1); return m; } await sleep(20); } throw new Error(name + ' timeout'); };
  b.tick = setInterval(() => { if (b.ws.readyState === 1) b.send({ t: 'st', s: b.st }); }, 66);
  return b;
}
async function runOp(bs, mid, log) {
  const [A] = bs; for (const b of bs) { b.end = null; b.stage = null; b.needpts = null; b.ri = 0; b.esc = null; b.cargo = null; b.prog = null; b.q.length = 0; b.st.x = 6400; b.st.y = 3560; b.st.use = false; }
  A.mid = mid + Date.now(); A.send({ t: 'mission.start', mid, tier: 'normal', squad: bs.slice(1).map(b => b.pid) });
  for (const b of bs) { await b.wait(m => m.t === 'mission.load'); b.send({ t: 'loaded' }); }
  // whoever the server made host answers the points request
  let H = null; for (let i = 0; i < 200 && !H; i++) { H = bs.find(b => b.needpts); await sleep(20); }
  const np = H.needpts, c = { x: np.T.x, y: np.T.y };
  const ring = (cc, n, r) => Array.from({ length: n }, (_, i) => ({ x: Math.round(cc.x + Math.cos(i * 6.283 / n) * r), y: Math.round(cc.y + Math.sin(i * 6.283 / n) * r) }));
  const pts = { haven: { x: 6400, y: 3300 }, center: c, caches: ring(c, np.n || 0, 300), nests: ring(c, np.nests || 0, 500), keys: ring(c, np.keys || 0, 350), bars: ring(c, np.bars || 0, 250), hbars: ring({ x: 6400, y: 3300 }, np.hbars || 0, 300), lure: np.lure ? { x: c.x + 900, y: c.y } : null, item: np.item ? { x: c.x + 50, y: c.y } : null,
    relays: Array.from({ length: np.relays || 0 }, (_, i) => ({ x: c.x - 900 + i * 550, y: c.y + (i % 2 ? 200 : -200) })), cans: ring(c, np.cans || 0, 700), charges: ring(c, np.charges || 0, 450), zones: ring(c, np.zones || 0, 500), fires: ring(c, np.fires || 0, 350),
    shore: { x: c.x + 800, y: c.y + 100 }, lz: { x: c.x - 700, y: c.y + 800 }, far: { x: c.x + 1600, y: c.y }, entry: { x: c.x - 1000, y: c.y }, high: { x: c.x, y: c.y - 1400 },
    route: np.route ? Array.from({ length: 12 }, (_, i) => ({ x: c.x + i * 140, y: c.y + Math.round(Math.sin(i) * 60) })) : [], lairs: np.lairs ? Array.from({ length: np.lairs }, (_, i) => ({ x: c.x + 300 + i * 500, y: c.y })) : [] };
  H.send({ t: 'pts', pts });
  const seen = [];
  for (let guard = 0; guard < 4000; guard++) {
    if (bs.some(b => b.end)) break;
    const s = A.stage; if (!s) { await sleep(30); continue; }
    if (seen[seen.length - 1] !== s.i + ':' + s.k) { seen.push(s.i + ':' + s.k); if (process.env.V) console.log('  stage', s.i, s.k, s.txt.slice(0, 50), 'caches', (s.caches || []).length, 'lure', JSON.stringify(s.lure)); }
    const t = s.target || c;
    for (const b of bs) b.st.use = false;
    if (s.k === 'travel' || s.k === 'hold' || s.k === 'extract' || s.k === 'clear') { for (const b of bs) { b.st.x = t.x; b.st.y = t.y; } if (s.k === 'clear') H.send({ t: 'left', n: 0 }); if (s.prot) H.send({ t: 'mon', n: 0, ohp: 100 }); }
    if (s.k === 'crack') { for (const b of bs) { b.st.x = t.x; b.st.y = t.y; b.st.use = true; } H.send({ t: 'mon', n: guard % 40 < 8 ? 2 : 0 }); }   // sometimes the dead are close: the job should stall
    if (s.k === 'twokey') { (s.keys || []).forEach((k, i) => { const b = bs[i % bs.length]; b.st.x = k.x; b.st.y = k.y; b.st.use = true; }); }
    if (s.k === 'relay') { const R = s.relays, ri = A.ri || 0; bs.forEach((b, j) => { const r = R[Math.min(R.length - 1, ri + j)]; b.st.x = r.x; b.st.y = r.y; b.st.use = true; }); }
    if (s.k === 'defuse') { (s.charges || []).forEach((k, i) => { const b = bs[i % bs.length]; if (b.dk !== A.mid + s.i + ':' + i && b.busyT > Date.now()) return; b.st.x = k.x; b.st.y = k.y; b.st.use = true; }); const P_ = A.prog && A.prog.dp; if (P_) bs.forEach((b, j) => { const i = P_.findIndex((v, q) => v < 1 && q % bs.length === j) ; const k = s.charges[i >= 0 ? i : 0]; b.st.x = k.x; b.st.y = k.y; b.st.use = true; }); H.send({ t: 'mon', nk: (s.charges || []).map((_, i) => guard % 50 < 5 && i === 0 ? 2 : 0) }); }
    if (s.k === 'escort') { const E = A.esc || s.esc; for (const b of bs) { b.st.x = E.x - 60; b.st.y = E.y; } H.send({ t: 'mon', ez: guard % 60 < 6 ? 3 : 0, ohp: 100 }); }
    if (s.k === 'hunt') { if (!A.huntT) A.huntT = Date.now(); for (const b of bs) { b.st.x = t.x; b.st.y = t.y; } const el = Date.now() - A.huntT; H.send({ t: 'hunt', x: t.x + 10, y: t.y, ph: Math.min(2, Math.floor(el / 1500)), hp: 1 - el / 6000, dead: el > 5000 ? 1 : 0 }); if (el > 5000) A.huntT = 0; }
    if (s.k === 'evac') for (const b of bs) { b.st.x = t.x; b.st.y = t.y; }
    if (s.k === 'fuel') { const C = A.cargo || s.cargo; if (C && !C.pid) { A.st.x = C.x; A.st.y = C.y; await sleep(80); A.send({ t: 'cargo.grab' }); } else if (C && C.pid === A.pid) { const d = dist(A.st, t), k = Math.min(1, 500 / Math.max(1, d)); A.st.x += (t.x - A.st.x) * k; A.st.y += (t.y - A.st.y) * k; } }
    if (s.k === 'collect' || s.k === 'build') {
      if (s.lure && !A.lit) { A.st.x = s.lure.x; A.st.y = s.lure.y; A.st.use = true; const L = A.q.find(m => m.t === 'lure' && m.on); if (L) A.lit = 1; }
      else { const busy = new Set(); (s.caches || []).forEach((p, i) => { const key = A.mid + s.i + ':' + i; if ((A.done = A.done || {})[key] && Date.now() - A.done[key] < 1500) return; const b = bs.find(x => !busy.has(x)); if (!b) return; busy.add(b); b.st.x = p.x; b.st.y = p.y; b.send({ t: 'st', s: b.st }); b.send({ t: 'claim', i }); A.done[key] = Date.now(); }); } }
    if (process.env.V && guard % 50 === 0) console.log('   ..', s.k, JSON.stringify(A.prog || {}), 'lit', A.lit, 'A', A.st.x, A.st.y, A.st.use);
    if (s.k === 'carry') { const C = A.cargo || s.cargo; if (C && !C.pid) { A.st.x = C.x; A.st.y = C.y; await sleep(100); A.send({ t: 'cargo.grab' }); } else if (C && C.pid === A.pid) { const d = dist(A.st, t), k = Math.min(1, 400 / Math.max(1, d)); A.st.x += (t.x - A.st.x) * k; A.st.y += (t.y - A.st.y) * k; for (const b of bs.slice(1)) { b.st.x = A.st.x + 40; b.st.y = A.st.y; } } }
    await sleep(60);
  }
  const E = bs.map(b => b.end).find(Boolean);
  log(mid + ' -> ' + (E ? (E.win ? 'WIN' : 'FAIL ' + E.why) : 'NO END') + '  stages ' + seen.join(' > ') + (E && E.win ? '  pay ' + JSON.stringify(E.reward) : ''));
  for (const b of bs) b.lit = 0;
  await sleep(300);
  return E && E.win;
}
(async () => {
  const bs = Array.from({ length: NP }, (_, i) => bot('Bot' + (i + 1)));
  for (const b of bs) { await b.ready; b.send({ t: 'hello', pid: b.pid, name: b.name }); await b.wait(m => m.t === 'welcome'); }
  bs[0].send({ t: 'crew.create', name: 'Test Crew' }); await bs[0].wait(m => m.t === 'joined');
  for (const b of bs.slice(1)) { b.send({ t: 'crew.join', code: bs[0].code }); await b.wait(m => m.t === 'joined'); }
  const from = +(process.env.FROM || 1), to = +(process.env.TO || 24);
  if (from > 1) { bs[0].send({ t: 'test.skip', to: from }); await sleep(400); }
  const ids = Array.from({ length: to - from + 1 }, (_, i) => 'o' + (from + i));
  for (const id of ids) {
    await sleep(300); const crew = bs[0].crew; const next = crew.board.find(m => m.story);
    if (!next) { console.log('no story op on the board'); break; }
    if (next.locked) { console.log(id, 'locked: needs', JSON.stringify(next.need), '-> cheating the radio up for the test'); for (let k = 0; k < 4; k++) { bs[0].send({ t: 'upgrade', b: 'power' }); bs[0].send({ t: 'upgrade', b: 'radio' }); await sleep(150); } await sleep(400); const n2 = bs[0].crew.board.find(m => m.story); if (n2.locked) { console.log('still locked, res', JSON.stringify(bs[0].crew.res), 'b', JSON.stringify(bs[0].crew.b)); break; } }
    await runOp(bs, bs[0].crew.board.find(m => m.story).mid, console.log);
  }
  const cr = bs[0].crew; console.log('done', cr.done, 'fails', cr.fails, 'storyDone', cr.storyDone.join(','), 'board', cr.board.map(m => m.mid).join(' '));
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
