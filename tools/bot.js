// A scripted test player for ColdShore Online. No graphics: it speaks the protocol, walks to objectives and reports what it saw.
//   node tools/bot.js joiner <CODE> [name]     join a crew and follow the mission
//   node tools/bot.js creator [name]           create a crew (code written to stdout and $CODE_FILE), start the first story mission once someone joins,
//                                              and run the zombies itself if the server makes it the sim host
'use strict';
const WS = require('ws'), fs = require('fs');
const [, , role, a1, a2] = process.argv;
const URL = process.env.URL || 'ws://localhost:8080';
const name = (role === 'joiner' ? a2 : a1) || ('Bot' + Math.floor(Math.random() * 100));
const ws = new WS(URL);
const S = { pid: null, code: null, x: +(process.env.BX || 780), y: +(process.env.BY || 2140), lv: 0, use: false, host: false, stage: null, zs: 0, zsMax: 0, hitsIn: 0, pdmg: 0, others: {}, zombies: new Map(), nid: 1, hp: 100, down: false, started: false, end: null };
const send = o => ws.readyState === 1 && ws.send(JSON.stringify(o));
const log = (...a) => console.log('[' + name + ']', ...a);
ws.on('open', () => send({ t: 'hello', name, look: 'PF1' }));
ws.on('message', raw => {
  const m = JSON.parse(raw);
  switch (m.t) {
    case 'welcome': S.pid = m.pid; if (role === 'creator') send({ t: 'crew.create', name: 'Bot Crew' }); else send({ t: 'crew.join', code: a1 }); break;
    case 'joined': S.code = m.code; log('joined crew', m.code); if (role !== 'creator') send({ t: 'ready', v: true }); if (process.env.CODE_FILE) fs.writeFileSync(process.env.CODE_FILE, m.code); break;
    case 'crew': if (role === 'creator' && !S.started && process.env.MID && !/:/.test(process.env.MID) && !m.crew.board.find(x => x.type === process.env.MID) && (S.refr = (S.refr || 0) + 1) < 15) { send({ t: 'board.refresh' }); break; }
      if (role === 'creator' && !process.env.NOSTART && !S.started && m.crew.online.length >= 2 && !m.crew.board.find(x => x.mid === 'story:s1a') === false) { S.started = true; const want = process.env.MID || 'story:s1a', pick = m.crew.board.find(x => x.mid === want || x.type === want) || m.crew.board.find(x => !x.story); log('starting', pick && pick.name); setTimeout(() => send({ t: 'mission.start', mid: pick ? pick.mid : want, tier: 'normal' }), 1500); } break;
    case 'mission.load': log('loading', m.m.name, 'threat', m.m.threat); setTimeout(() => send({ t: 'loaded' }), 300); break;
    case 'host': S.host = m.pid === S.pid; log('host is', m.pid === S.pid ? 'me' : m.pid, m.reason || ''); break;
    case 'needpts': log('asked for points'); send({ t: 'pts', pts: { haven: { x: 6400, y: 3560 }, center: { x: 1040, y: 2100 }, caches: [{ x: 700, y: 1900 }, { x: 1000, y: 1910 }, { x: 1250, y: 1920 }], nests: [{ x: 900, y: 1950 }, { x: 1100, y: 1960 }, { x: 1300, y: 1970 }, { x: 1150, y: 2050 }] } }); break;
    case 'stage': S.stage = m; log('stage', m.k, '-', m.txt, m.target ? JSON.stringify(m.target) : ''); if (m.target && process.env.WALK !== '0') setTimeout(() => { S.x = m.target.x - 20; S.y = m.target.y + 20; S.use = m.k === 'crack'; }, +(process.env.WALK_DELAY || 2500));
      if (m.caches && process.env.CLAIM !== '0' && process.env.WALK !== '0') m.caches.forEach((c, i) => setTimeout(() => { S.x = c.x; S.y = c.y; setTimeout(() => send({ t: 'claim', i }), 400); }, 1500 + i * 1500 + (role === 'creator' ? 0 : 700)));
      break;
    case 'claimed': log('claimed', m.i, 'by', m.name, m.got + '/' + m.n, m.nest ? '(nest)' : ''); break;
    case 'zs': S.zs++; S.zsMax = Math.max(S.zsMax, m.z.length); break;
    case 'hit': S.hitsIn++; for (const [nid, dmg] of m.h) { const z = S.zombies.get(nid); if (z) { z.hp -= dmg; if (z.hp <= 0) { S.zombies.delete(nid); send({ t: 'zdead', list: [[nid, m.pid]] }); log('zombie', nid, 'killed by', m.pid); } } } break;
    case 'pdmg': S.pdmg += m.n; break;
    case 'do': log('directive', m.d.k, 'n=' + m.d.n, 'tag=' + m.d.tag); if (S.host) for (let i = 0; i < Math.min(6, m.d.n); i++) S.zombies.set(S.nid++, { x: (m.d.x === undefined ? S.x : m.d.x) + (i - 3) * 30, y: (m.d.y === undefined ? S.y : m.d.y) + 60, hp: 3 }); break;
    case 'ps': S.others[m.pid] = m.s; break;
    case 'prog': S.prog = m.v; break;
    case 'mission.end': S.end = m; log('mission end', m.win ? 'WIN' : 'FAIL', m.why || '', JSON.stringify(m.reward)); report(); setTimeout(() => process.exit(0), 1500); break;
    case 'err': log('ERR', m.m); break;
  }
});
function report() { log('report', JSON.stringify({ zsMsgs: S.zs, zsMaxZombies: S.zsMax, hitsIn: S.hitsIn, pdmg: S.pdmg, others: Object.fromEntries(Object.entries(S.others).map(([k, v]) => [k, [v.x, v.y, v.hp, v.down]])) })); }
setInterval(() => { if (!S.stage && !process.env.ALWAYS) return; send({ t: 'st', s: { x: S.x, y: S.y, lv: 0, yaw: 0, pitch: 0, hp: S.hp, down: S.down, use: S.use, w: 'pistol', drv: -1 } });
  if (S.host && S.zombies.size) send({ t: 'zs', z: [...S.zombies].map(([nid, z]) => [nid, Math.round(z.x), Math.round(z.y), 0, 1, Math.round(z.hp * 10), 0]) });
  if (S.host && process.env.KILL && S.zombies.size && Math.random() < .08) { const [nid] = S.zombies.keys().next().value !== undefined ? [S.zombies.keys().next().value] : []; S.zombies.delete(nid); send({ t: 'zdead', list: [[nid, S.pid, Math.random() < .2 ? 1 : 0]] }); }
  if (S.host && S.stage && S.stage.k === 'clear') send({ t: 'left', n: S.zombies.size });
}, 66);
setInterval(report, 10000);
setTimeout(() => { log('timeout'); report(); process.exit(1); }, +(process.env.BOT_TIMEOUT || 900000));
