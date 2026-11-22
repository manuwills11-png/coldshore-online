// ColdShore Online server
// Serves the game files and runs crews, sessions, missions and the shared settlement over WebSockets.
// One player per session is the "sim host": their game runs the zombie AI and streams it to everyone else.
// The server decides everything that matters for progress: objectives, claims, rewards, upgrades, difficulty.
'use strict';
const http = require('http'), fs = require('fs'), path = require('path'), crypto = require('crypto');
const { WebSocketServer } = require('ws');

const PORT = +process.env.PORT || 8080;
const PUBLIC = path.resolve(process.env.PUBLIC_DIR || path.join(__dirname, 'public'));
const DATA = path.resolve(process.env.DATA_DIR || path.join(__dirname, 'data'));
const MAX_PLAYERS = 6;
fs.mkdirSync(DATA, { recursive: true });

/* ---------------- persistence ---------------- */
// Saves go to Supabase when SUPABASE_URL + CS_SECRET are set (free hosts have no disk), else to data/db.json.
const DBF = path.join(DATA, 'db.json');
const SB = { url: process.env.SUPABASE_URL, key: process.env.SUPABASE_KEY, secret: process.env.CS_SECRET, id: process.env.SAVE_ID || 'main' };
const useSB = !!(SB.url && SB.key && SB.secret);
let DB = { crews: {}, profiles: {} };
async function sbRpc(fn, args) {
  const r = await fetch(SB.url + '/rest/v1/rpc/' + fn, { method: 'POST', headers: { apikey: SB.key, Authorization: 'Bearer ' + SB.key, 'Content-Type': 'application/json' }, body: JSON.stringify(args) });
  if (!r.ok) throw new Error(fn + ' ' + r.status + ' ' + (await r.text()).slice(0, 200)); return r.json(); }
async function loadDB() {
  try { if (useSB) { const d = await sbRpc('cs_load', { p_secret: SB.secret, p_id: SB.id }); if (d) DB = d; console.log('loaded saves from Supabase'); }
    else DB = JSON.parse(fs.readFileSync(DBF, 'utf8')); } catch (e) { console.warn('no saves loaded:', e.message); }
  DB.crews = DB.crews || {}; DB.profiles = DB.profiles || {}; }
let saveT = null, saving = false, again = false;
function save() { if (saveT) return; saveT = setTimeout(flush, useSB ? 2500 : 800); }
async function flush() { saveT = null; if (saving) { again = true; return; } saving = true;
  try { if (useSB) await sbRpc('cs_save', { p_secret: SB.secret, p_id: SB.id, p_data: DB }); else { const tmp = DBF + '.tmp'; fs.writeFileSync(tmp, JSON.stringify(DB)); fs.renameSync(tmp, DBF); } }
  catch (e) { console.warn('save failed:', e.message); again = true; }
  saving = false; if (again) { again = false; save(); } }
for (const sig of ['SIGTERM', 'SIGINT']) process.on(sig, async () => { if (saveT) { clearTimeout(saveT); } try { await flush(); } catch (e) { } process.exit(0); });

/* ---------------- world facts (match the game's map) ---------------- */
const TOWNS = {
  'HARBOR ROW': { x: 1200, y: 2000, r: 900, ch: 1 }, 'MILLBROOK': { x: 8340, y: 5650, r: 1700, ch: 1 }, 'GREYWATER': { x: 3200, y: 950, r: 800, ch: 1 },
  'PINE RIDGE': { x: 11640, y: 2100, r: 1500, ch: 2 }, 'SEAVIEW': { x: 5340, y: 8850, r: 1500, ch: 2 }, 'HOLLIS': { x: 11640, y: 11050, r: 1200, ch: 2 },
  'FAIRHAVEN': { x: 14640, y: 8850, r: 1700, ch: 3 }, 'ASHFORD': { x: 23090, y: 5650, r: 1800, ch: 3 }, 'CALDER': { x: 23090, y: 25590, r: 2000, ch: 3 },
  'BRAMBLE': { x: 14640, y: 21590, r: 1700, ch: 3 }, 'KESTREL': { x: 8340, y: 25590, r: 1800, ch: 4 }, 'NEW HALDEN': { x: 29000, y: 19500, r: 4300, ch: 4 },
  'MARSH END': { x: 35090, y: 8850, r: 2000, ch: 4 }, 'RIDGEWAY': { x: 31090, y: 2100, r: 1500, ch: 4 }, 'GRANITE FALLS': { x: 38790, y: 25590, r: 1700, ch: 5 }
};
const BUILDINGS = {
  walls: { name: 'Walls', base: { scrap: 40, fuel: 0 } }, tower: { name: 'Watchtower', base: { scrap: 35, ammo: 20 }, need: { 3: { power: 2 } } }, workshop: { name: 'Workshop', base: { scrap: 50, fuel: 10 }, need: { 2: { power: 1 }, 4: { power: 3 } } },
  infirmary: { name: 'Infirmary', base: { scrap: 30, meds: 15 }, need: { 3: { power: 2 } } }, garage: { name: 'Garage', base: { scrap: 45, fuel: 20 } }, farm: { name: 'Farm', base: { scrap: 20, food: 20 }, need: { 2: { housing: 1 }, 4: { housing: 3 } } },
  radio: { name: 'Radio', base: { scrap: 60, fuel: 15 }, need: { 2: { power: 1 }, 4: { power: 3 } } }, power: { name: 'Power', base: { scrap: 40, fuel: 25 } }, housing: { name: 'Housing', base: { scrap: 50, food: 15 } }
};
const upCost = (b, lv) => { const c = {}; for (const k in BUILDINGS[b].base) if (BUILDINGS[b].base[k]) c[k] = Math.round(BUILDINGS[b].base[k] * Math.pow(1.75, lv)); return c; };
const upNeed = (b, lv) => { const n = BUILDINGS[b].need || {}; let r = null; for (const at in n) if (lv + 1 >= +at) r = n[at]; return r; };   // building level requirements, e.g. a level 3 tower needs power 2 for its searchlights
const settlersOf = c => 6 + 6 * (c.b.housing || 0);
const MAX_OPS = 6, MAX_SQUAD = 6;   // no rules about who goes where: anyone can run their own operation or join any squad

/* ---------------- story ---------------- */
const STORY = [
  { id: 's1a', ch: 1, name: 'First Drop', type: 'airdrop', town: 'HARBOR ROW', brief: "WARDEN: Good morning, Harbor Row. There's a crate coming down on your street. Consider it a handshake.", done: "WARDEN: You share well. I like that in a group." },
  { id: 's1b', ch: 1, name: 'Lights On', type: 'defend', town: 'HARBOR ROW', brief: "The generator at Haven needs ten minutes of peace to warm up. The dead hear engines.", done: "Haven has power. Somewhere out there, WARDEN's radio is still on." },
  { id: 's1c', ch: 1, name: 'Harbor Sweep', type: 'clear', town: 'HARBOR ROW', brief: "Make Harbor Row ours. Clear the street.", done: "WARDEN: A clean street. Now let's see what you do with a dirty one." },
  { id: 's2a', ch: 2, need: { radio: 1 }, name: 'Cold Case', type: 'scavenge', town: 'MILLBROOK', n: 1, brief: "WARDEN: A black case, Millbrook clinic district. Do not open it.", done: "The case is cold. Not refrigerated cold. Cold like it's been somewhere." },
  { id: 's2b', ch: 2, need: { radio: 1 }, name: 'Mast', type: 'defend', town: 'PINE RIDGE', brief: "WARDEN: Hold the Pine Ridge mast while I borrow it. Five minutes.", done: "WARDEN: Thank you. You won't hear from the Pine Ridge group again. Don't worry about them." },
  { id: 's2c', ch: 2, need: { radio: 1 }, name: 'Burn It', type: 'clear', town: 'GREYWATER', brief: "WARDEN: Something is nesting under the Greywater church. Burn it out.", done: "Every nest you burn, the next horde is bigger. Someone should write that down." },
  { id: 's3a', ch: 3, need: { radio: 2, done: 6 }, name: 'Ledger', type: 'scavenge', town: 'FAIRHAVEN', n: 3, brief: "A rival crew kept notes on WARDEN. Their pages are scattered through Fairhaven.", done: "The ledger lists settlements, dates, horde sizes. Haven is on it. With a question mark." },
  { id: 's3b', ch: 3, need: { radio: 2, done: 6 }, name: 'Taken', type: 'airdrop', town: 'ASHFORD', brief: "The Ashford crew put up a flare. Get there before WARDEN's dead do.", done: "Nobody left at Ashford. Just the flare, and the crate WARDEN dropped on it." },
  { id: 's3c', ch: 3, need: { radio: 2, done: 6 }, name: 'Night Shift', type: 'defend', town: 'CALDER', night: true, secs: 360, brief: "Hold Calder through the dark. WARDEN wants to see how long you last.", done: "WARDEN: Six minutes. The Bramble group made four." },
  { id: 's4a', ch: 4, need: { radio: 3, done: 12 }, name: 'Signal Trace', type: 'scavenge', town: 'KESTREL', n: 3, brief: "Three relay boxes, three bearings. Bring them home and we'll know where WARDEN sits.", done: "The bearings cross over New Halden. The tower." },
  { id: 's4b', ch: 4, need: { radio: 3, done: 12 }, name: 'Halden Tower', type: 'clear', town: 'NEW HALDEN', brief: "Clear the street around Halden Tower. The transmitter is up there.", done: "WARDEN: You found me. Come up, then. Bring everyone." },
  { id: 's5a', ch: 5, need: { radio: 4, done: 16 }, name: 'Last Drop', type: 'siege', town: 'HARBOR ROW', secs: 420, brief: "WARDEN: One last experiment. Everything I have, against everything you built.", done: "Haven stands. The radio is quiet. For now, the county is yours." }
];
const CONTRACT_TYPES = ['scavenge', 'airdrop', 'defend', 'clear', 'convoy', 'rescue', 'hunt', 'gauntlet', 'blackout', 'demolition'];
const TYPE_TEXT = { scavenge: 'Scavenge', airdrop: 'Airdrop', defend: 'Defend', clear: 'Clear', convoy: 'Convoy', siege: 'Siege', rescue: 'Rescue', hunt: 'Hunt', gauntlet: 'Gauntlet', blackout: 'Blackout', demolition: 'Demolition' };
// contract names: a different call-sign every time
const OPA = ['Silent', 'Broken', 'Red', 'Iron', 'Long', 'Cold', 'Black', 'Last', 'Grey', 'Hollow', 'Burning', 'Salt', 'Paper', 'Ghost', 'Rusted', 'Lantern', 'Feral', 'Copper'], OPB = ['Harbor', 'Choir', 'Mile', 'Signal', 'Orchard', 'Saint', 'Engine', 'Tide', 'Ferry', 'Steeple', 'Crossing', 'Furnace', 'Garden', 'Window', 'Junction', 'Mercy', 'Static', 'Sunday'];
const opName = () => OPA[Math.floor(Math.random() * OPA.length)] + ' ' + OPB[Math.floor(Math.random() * OPB.length)];
const TIERS = { normal: { bonus: 0, pay: 1 }, hard: { bonus: 1.5, pay: 1.6 }, nightmare: { bonus: 3, pay: 2.4 } };

/* ---------------- helpers ---------------- */
const now = () => Date.now();
const rid = n => crypto.randomBytes(n).toString('hex');
const code6 = () => { const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; let s; do { s = ''; for (let i = 0; i < 6; i++) s += A[crypto.randomInt(A.length)]; } while (DB.crews[s]); return s; };
const clampN = (v, a, b) => Math.max(a, Math.min(b, v));
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
function newCrew(name) {
  return { code: code6(), name: String(name || 'Unnamed Crew').slice(0, 24), created: now(), members: {}, done: 0, fails: 0, storyDone: [], log: [],
    res: { scrap: 60, food: 30, fuel: 20, meds: 10, ammo: 40 }, b: { walls: 0, tower: 0, workshop: 0, infirmary: 0, garage: 0, farm: 0, radio: 0, power: 0, housing: 0 }, farmT: now(), board: null, boardT: 0 };
}
function crewFix(c) { for (const k in BUILDINGS) if (c.b[k] === undefined) c.b[k] = 0; return c; }
function farmTick(c) {   // Haven keeps working while you are away: the farm grows food, settlers salvage scrap, the generator burns fuel
  const hrs = (now() - (c.farmT || now())) / 3.6e6; if (hrs > .05) { const lv = c.b.farm || 0, hs = c.b.housing || 0;
    if (lv) c.res.food = Math.min(200 + 100 * lv, c.res.food + Math.floor(hrs * 6 * lv * (1 + .15 * hs)));
    if (hs) c.res.scrap = Math.min(300 + 150 * hs, c.res.scrap + Math.floor(hrs * 4 * hs));
    if (c.b.power) c.res.fuel = Math.max(0, c.res.fuel - Math.floor(hrs * c.b.power * .5)); }
  c.farmT = now(); }
function chapterOf(c) { let ch = 1; for (const s of STORY) if (c.storyDone.includes(s.id)) ch = Math.max(ch, s.ch); return ch; }
function storyNext(c) { for (const s of STORY) { if (c.storyDone.includes(s.id)) continue; const nd = s.need || {}; const ok = (!nd.radio || c.b.radio >= nd.radio) && (!nd.done || c.done >= nd.done); return { s, ok, need: nd }; } return null; }
function threatOf(c, players, tier) { return +(1 + .25 * c.done + .4 * Math.max(0, players - 1) + (TIERS[tier] || TIERS.normal).bonus).toFixed(1); }
function unlockedTowns(c) { const maxCh = 1 + Math.min(4, c.b.radio); return Object.keys(TOWNS).filter(t => TOWNS[t].ch <= maxCh); }
function rewardOf(type, threat, tier) {
  const k = (TIERS[tier] || TIERS.normal).pay * (1 + .15 * threat), base = { rescue: { meds: 12, food: 20, scrap: 15 }, hunt: { ammo: 45, scrap: 25 }, gauntlet: { fuel: 25, food: 25, scrap: 20 }, blackout: { fuel: 20, scrap: 35, ammo: 10 }, demolition: { scrap: 45, ammo: 20 }, scavenge: { scrap: 30, food: 20, meds: 6 }, airdrop: { ammo: 40, meds: 10, food: 10 }, defend: { scrap: 25, ammo: 25, fuel: 8 }, clear: { scrap: 35, ammo: 20 }, convoy: { fuel: 30, scrap: 20, food: 15 }, siege: { scrap: 60, ammo: 40, meds: 20 } }[type];
  const r = {}; for (const x in base) r[x] = Math.round(base[x] * k); return r; }
function makeBoard(c) {
  const towns = unlockedTowns(c), list = [];
  const sn = storyNext(c); if (sn) list.push({ mid: 'story:' + sn.s.id, story: true, locked: !sn.ok, need: sn.need, name: sn.s.name, type: sn.s.type, town: sn.s.town, brief: sn.s.brief, ch: sn.s.ch });
  const types = CONTRACT_TYPES.slice().sort(() => Math.random() - .5).slice(0, 6);   // six different kinds of job every time
  for (let i = 0; i < 6; i++) { const type = types[i], town = towns[Math.floor(Math.random() * towns.length)];
    list.push({ mid: 'c:' + rid(4), name: 'Op ' + opName() + ' (' + TYPE_TEXT[type] + ', ' + town[0] + town.slice(1).toLowerCase() + ')', via: [towns[Math.floor(Math.random() * towns.length)], towns[Math.floor(Math.random() * towns.length)]], type, town: type === 'convoy' && town === 'HARBOR ROW' ? 'MILLBROOK' : town, night: Math.random() < .25 }); }
  if (c.done > 0 && c.done % 5 === 4 && !list.some(m => m.type === 'siege')) list.push({ mid: 'c:' + rid(4), name: 'Siege: Haven', type: 'siege', town: 'HARBOR ROW', warn: 'Skipping it costs a building level.' });
  c.board = list; c.boardT = now(); save(); return list;
}
function opView(M) { return { id: M.id, mid: M.mid, name: M.name, type: M.type, town: M.town, tier: M.tier, threat: M.threat, stage: M.stage >= 0 && M.stages[M.stage] ? M.stages[M.stage].txt : 'Deploying', squad: [...M.squad].map(pid => (M.names[pid] || '?')), full: M.squad.size >= MAX_SQUAD, bonus: M.bonus.txt }; }
function crewView(c, room) {
  farmTick(c); crewFix(c);
  const busy = new Set(room ? [...room.ops.values()].map(M => M.mid) : []);
  return { code: c.code, name: c.name, res: c.res, b: c.b, done: c.done, fails: c.fails, ch: chapterOf(c), storyDone: c.storyDone, settlers: settlersOf(c),
    board: (c.board || makeBoard(c)).map(m => busy.has(m.mid) ? Object.assign({}, m, { taken: true }) : m),
    costs: Object.fromEntries(Object.keys(BUILDINGS).map(b => [b, c.b[b] >= 5 ? null : upCost(b, c.b[b])])), needs: Object.fromEntries(Object.keys(BUILDINGS).map(b => [b, c.b[b] >= 5 ? null : upNeed(b, c.b[b])])), log: c.log.slice(-8),
    ops: room ? [...room.ops.values()].map(opView) : [], maxOps: MAX_OPS,
    online: room ? [...room.players.values()].map(p => ({ pid: p.pid, name: p.name, look: p.look, ready: p.ready, op: p.op || null })) : [] };
}

/* ---------------- rooms / sessions ---------------- */
// A room is a crew that is online. Up to three squads can be out on operations at once; everyone else is at Haven.
const rooms = new Map();   // crew code -> room
function roomOf(code) { let r = rooms.get(code); if (!r) { r = { code, players: new Map(), ops: new Map() }; rooms.set(code, r); } return r; }
function send(p, o) { if (p.ws.readyState === 1) p.ws.send(JSON.stringify(o)); }
function bcast(room, o, except) { const s = JSON.stringify(o); for (const p of room.players.values()) if (p !== except && p.ws.readyState === 1) p.ws.send(s); }
function squadOf(room, M) { return [...M.squad].map(pid => room.players.get(pid)).filter(Boolean); }
function bop(room, M, o, except) { const s = JSON.stringify(o); for (const p of squadOf(room, M)) if (p !== except && p.ws.readyState === 1) p.ws.send(s); }   // to one squad only
function bhaven(room, o, except) { const s = JSON.stringify(o); for (const p of room.players.values()) if (!p.op && p !== except && p.ws.readyState === 1) p.ws.send(s); }   // to everyone at Haven
function crewUpdate(room) { const c = DB.crews[room.code]; if (c) bcast(room, { t: 'crew', crew: crewView(c, room) }); }
function pickHost(room, M) {   // the lowest-latency player in the squad runs the zombies
  const ps = squadOf(room, M).filter(p => p.loaded); if (!ps.length) return null; ps.sort((a, b) => (a.rtt || 999) - (b.rtt || 999)); return ps[0]; }
function setHost(room, M, p, reason) { M.host = p ? p.pid : null; bop(room, M, { t: 'host', pid: M.host, reason: reason || '' }); }

/* ---------------- missions ---------------- */
const BONUS = [
  { k: 'nodown', txt: 'Bonus: nobody goes down' }, { k: 'fast', txt: 'Bonus: done inside 9 minutes', secs: 540 }, { k: 'elite', txt: 'Bonus: kill an elite', n: 1 }, { k: 'kills', txt: 'Bonus: 60 kills between you', n: 60 }
];
function startMission(room, starter, mid, tier, squadPids) {
  const c = DB.crews[room.code]; if (!c) return;
  if (room.ops.size >= MAX_OPS) return send(starter, { t: 'err', m: 'Every player is already out on an operation.' });
  if (starter.op) return send(starter, { t: 'err', m: 'You are already on an operation.' });
  const entry = (c.board || []).find(m => m.mid === mid); if (!entry) return send(starter, { t: 'err', m: 'That mission is no longer on the board.' });
  if ([...room.ops.values()].some(M => M.mid === mid)) return send(starter, { t: 'err', m: 'Another squad already took that contract.' });
  if (entry.locked) return send(starter, { t: 'err', m: 'Locked: ' + JSON.stringify(entry.need) });
  const squad = [starter, ...(squadPids || []).map(pid => room.players.get(pid)).filter(q => q && q !== starter && !q.op)].slice(0, MAX_SQUAD);
  const tierN = TIERS[tier] ? tier : 'normal', story = entry.story ? STORY.find(s => 'story:' + s.id === mid) : null, type = entry.type;
  const threat = threatOf(c, squad.length, tierN), T = TOWNS[entry.town] || TOWNS['HARBOR ROW'];
  const bonus = BONUS[crypto.randomInt(BONUS.length)];
  const M = { id: rid(4), mid, story: story ? story.id : null, name: entry.name, type, town: entry.town, tier: tierN, threat, night: !!(entry.night || (story && story.night)), seed: crypto.randomInt(1e9),
    T, stage: -1, stages: [], pts: {}, claims: {}, kills: {}, elites: 0, downs: 0, started: now(), t: 0, tAll: 0, waveT: 0, holdT: 0, left: null, crack: 0, reward: rewardOf(type, threat, tierN), brief: story ? story.brief : entry.brief || null, done: story ? story.done : null, ended: false,
    squad: new Set(squad.map(q => q.pid)), names: Object.fromEntries(squad.map(q => [q.pid, q.name])), host: null, bonus };
  const n = clampN((story && story.n) || Math.round(3 + squad.length * 1.2 + threat * .3), 1, 12);
  const nests = clampN(Math.round(1 + threat / 2.5), 1, 5);
  // the objective chain; every mission ends with getting everyone home
  if (type === 'scavenge') M.stages = [{ k: 'travel', txt: 'Get to ' + entry.town }, { k: 'collect', n, txt: story && story.n === 1 ? 'Find the case' : 'Collect supply caches' }, { k: 'extract', txt: 'Get everyone back to Haven' }];
  if (type === 'airdrop') M.stages = [{ k: 'travel', txt: 'Reach the drop zone in ' + entry.town }, { k: 'crack', secs: 10 + Math.round(threat), txt: 'Crack the crate open (hold E at the crate)' }, { k: 'extract', txt: 'Get everyone back to Haven' }];
  if (type === 'defend' || type === 'siege') M.stages = [{ k: 'travel', txt: type === 'siege' ? 'Man the barricade at Haven' : 'Get to the point in ' + entry.town }, { k: 'hold', secs: (story && story.secs) || (type === 'siege' ? 300 : 180 + Math.round(threat * 10)), txt: 'Hold the point' }, ...(type === 'siege' ? [] : [{ k: 'extract', txt: 'Get everyone back to Haven' }])];
  if (type === 'clear') M.stages = [{ k: 'travel', txt: 'Get to ' + entry.town }, { k: 'clear', txt: 'Clear the infestation' }, { k: 'collect', n: nests, nest: 1, txt: 'Burn the nests (hold E at each)' }, { k: 'extract', txt: 'Get everyone back to Haven' }];
  if (type === 'rescue') M.stages = [{ k: 'travel', txt: 'Find the survivors in ' + entry.town }, { k: 'crack', secs: 8, txt: 'Get them out of the house (hold E at the door)' }, { k: 'hold', secs: 90 + Math.round(threat * 8), txt: 'Hold the house while they pack' }, { k: 'extract', txt: 'Get everyone back to Haven' }];
  if (type === 'hunt') M.stages = [{ k: 'travel', txt: 'Track the Apex to ' + entry.town }, { k: 'clear', boss: 1, txt: 'Kill the Apex and its pack' }, { k: 'extract', txt: 'Get everyone back to Haven' }];
  if (type === 'gauntlet') { const via = (entry.via || []).filter(v => TOWNS[v] && v !== entry.town).slice(0, 2); M.stages = [...via.map((v, i) => ({ k: 'travel', town: v, secs: 150, txt: 'Checkpoint ' + (i + 1) + ': ' + v[0] + v.slice(1).toLowerCase() + ' (against the clock)' })), { k: 'travel', secs: 150, txt: 'Final checkpoint: ' + entry.town }, { k: 'crack', secs: 6, txt: 'Unload the goods (hold E)' }, { k: 'extract', txt: 'Get everyone back to Haven' }]; }
  if (type === 'blackout') { M.night = true; M.stages = [{ k: 'travel', txt: 'Get to ' + entry.town + ' in the dark' }, { k: 'collect', n: 3, txt: 'Throw the three breakers' }, { k: 'hold', secs: 100 + Math.round(threat * 8), txt: 'Hold the transformer while it spins up' }, { k: 'extract', txt: 'Get everyone back to Haven' }]; }
  if (type === 'demolition') M.stages = [{ k: 'travel', txt: 'Get to the overpass in ' + entry.town }, { k: 'collect', n: 3, txt: 'Plant the charges' }, { k: 'extract', txt: 'Get clear and get home before it blows' }];
  if (type === 'convoy') M.stages = [{ k: 'travel', txt: 'Drive to the pickup in ' + entry.town, drive: 1 }, { k: 'crack', secs: 6, txt: 'Load the truck (hold E at the pickup)' }, { k: 'extract', txt: 'Drive the load back to Haven' }];
  room.ops.set(M.id, M);
  for (const p of squad) { p.op = M.id; p.loaded = false; p.down = false; p.dead = false; p.ready = false; }
  bop(room, M, { t: 'mission.load', m: publicMission(M), seed: M.seed, armory: armoryOf(starter) });
  for (const p of squad) if (p !== starter) send(p, { t: 'armory', ids: armoryOf(p) });
  M.loadTimer = setTimeout(() => goMission(room, M), 120000);
  c.log.push({ t: now(), m: squad.map(q => q.name).join(', ') + ' headed out: ' + M.name + '.' }); crewUpdate(room);
}
function armoryOf(p) { const pr = DB.profiles[p.pid]; return pr && pr.armory ? Object.keys(pr.armory) : []; }
function publicMission(M) { return { id: M.id, name: M.name, type: M.type, town: M.town, tier: M.tier, threat: M.threat, night: M.night, brief: M.brief, stages: M.stages.map(s => s.txt), stage: M.stage, pts: M.pts, claims: M.claims, reward: M.reward, T: M.T, bonus: M.bonus.txt }; }
function goMission(room, M) {
  if (!M || M.go || M.ended) return; M.go = true; clearTimeout(M.loadTimer);
  setHost(room, M, pickHost(room, M) || squadOf(room, M)[0], 'start');
  // ask the host to work out the concrete spots (it has the real map)
  const h = room.players.get(M.host); if (h) send(h, { t: 'needpts', type: M.type, town: M.town, T: M.T, n: (M.stages.find(s => s.k === 'collect') || {}).n || 0, nests: (M.stages.find(s => s.nest) || {}).n || 0 });
  M.ptsTimer = setTimeout(() => { if (!M.pts.haven) setPoints(room, M, { haven: HAVEN_PT, center: { x: M.T.x, y: M.T.y }, caches: [] }); }, 25000);
  bop(room, M, { t: 'mission.go' });
}
const HAVEN_PT = { x: 6400, y: 3560 };
function setPoints(room, M, pts) {
  if (!M || M.pts.haven) return; clearTimeout(M.ptsTimer);
  M.pts = { haven: pts.haven || HAVEN_PT, center: pts.center || { x: M.T.x, y: M.T.y }, caches: (pts.caches || []).slice(0, 12), nests: (pts.nests || []).slice(0, 6) };
  if (M.type === 'siege') M.pts.center = M.pts.haven;
  const coll = M.stages.find(s => s.k === 'collect' && !s.nest); if (coll) coll.n = Math.min(coll.n, M.pts.caches.length || 1);
  const ns = M.stages.find(s => s.nest); if (ns) { if (M.pts.nests.length) ns.n = Math.min(ns.n, M.pts.nests.length); else M.stages = M.stages.filter(s => !s.nest); }
  nextStage(room, M);
}
function stageTarget(M, s) { if (!s) return null; if (s.town && TOWNS[s.town]) return { x: TOWNS[s.town].x, y: TOWNS[s.town].y }; if (s.k === 'travel' || s.k === 'crack' || s.k === 'hold' || s.k === 'clear') return M.pts.center; if (s.k === 'extract') return M.pts.haven; return null; }
function stageMsg(M, s) { return { t: 'stage', i: M.stage, txt: s.txt, k: s.k, target: stageTarget(M, s), n: s.n || 0, secs: s.secs || 0, nest: s.nest ? 1 : 0, caches: s.k === 'collect' ? (s.nest ? M.pts.nests : M.pts.caches).slice(0, s.n) : null, claims: M.claims }; }
function nextStage(room, M) {
  M.stage++; const s = M.stages[M.stage];
  if (!s) return endMission(room, M, true);
  M.t = 0; M.holdT = 0; M.crack = 0; M.waveT = 0; M.left = null; M.claims = {};
  const th = M.threat, elite = Math.floor(th / 2.5);
  // spawn directives for the sim host
  if (s.k === 'travel' && M.type !== 'siege' && M.type !== 'defend') hostDo(room, M, { k: 'infest', x: M.pts.center.x, y: M.pts.center.y, r: Math.min(900, M.T.r * .6), n: Math.round(12 + th * 4.5), run: Math.min(.55, .06 * th), spec: th >= 2.5, tag: 'town', elite: Math.max(0, elite - 1) });
  if (s.k === 'clear') hostDo(room, M, { k: 'horde', x: M.pts.center.x, y: M.pts.center.y, r: 420, n: Math.round((s.boss ? 10 : 16) + th * (s.boss ? 3 : 5.5)), run: Math.min(.55, .07 * th), spec: th >= 2, tag: 'clear', brute: Math.floor(th / 3), elite, boss: s.boss ? 1 : 0 });
  if (s.k === 'crack') hostDo(room, M, { k: 'wave', x: M.pts.center.x, y: M.pts.center.y, n: Math.round(8 + th * 2.4), run: Math.min(.55, .07 * th), spec: th >= 2.5, tag: 'wave', elite: elite ? 1 : 0 });
  if (s.k === 'extract' && th >= 2) hostDo(room, M, { k: 'chase', n: Math.round(4 + th * 1.5), run: Math.min(.7, .1 * th), tag: 'wave' });   // the walk home is not free any more
  bop(room, M, stageMsg(M, s));
}
function hostDo(room, M, d) { const h = room.players.get(M.host); if (h) send(h, { t: 'do', d, threat: M.threat, b: (DB.crews[room.code] || {}).b }); }
function alivePlayers(room, M) { return squadOf(room, M).filter(p => p.loaded && !p.down && !p.dead && p.st); }
function missionTick(room, M, dt) {
  if (!M || !M.go || M.ended || M.stage < 0) return;
  const s = M.stages[M.stage], tgt = stageTarget(M, s), alive = alivePlayers(room, M), all = squadOf(room, M).filter(p => p.loaded);
  M.t += dt; M.tAll += dt;
  if (all.length && all.every(p => p.down || p.dead)) return endMission(room, M, false, 'The whole squad went down.');
  if (!squadOf(room, M).length) return endMission(room, M, false, 'Everyone left.');
  if (!all.length) return;
  const near = (r) => alive.filter(p => dist(p.st, tgt) < r);
  if (s.k === 'travel') { if (near(s.drive ? 260 : 350).length) nextStage(room, M); else if (s.secs) { bop(room, M, { t: 'prog', v: Math.min(1, M.t / s.secs), secs: Math.max(0, Math.round(s.secs - M.t)) }); if (M.t > s.secs) return endMission(room, M, false, 'Too slow. The checkpoint closed.'); } }
  else if (s.k === 'collect') { const got = Object.keys(M.claims).length; if (got >= s.n) nextStage(room, M);
    if (s.nest) { M.waveT -= dt; if (M.waveT <= 0) { const p = alive[0]; if (p) hostDo(room, M, { k: 'wave', x: p.st.x, y: p.st.y, n: Math.round(5 + M.threat * 1.6), run: Math.min(.6, .08 * M.threat), spec: true, tag: 'wave' }); M.waveT = Math.max(16, 34 - M.threat * 2); } } }
  else if (s.k === 'crack') { const at = near(90).filter(p => p.st.use); if (at.length) { M.crack += dt * Math.min(2, at.length); bop(room, M, { t: 'prog', v: Math.min(1, M.crack / s.secs) }); } if (M.crack >= s.secs) nextStage(room, M); }
  else if (s.k === 'hold') {
    const inside = near(380).length; if (inside) M.holdT += dt; else M.outT = (M.outT || 0) + dt;
    if ((M.outT || 0) > 25 && M.type === 'siege') return endMission(room, M, false, 'Haven was overrun.');
    if (inside) M.outT = 0;
    M.waveT -= dt; if (M.waveT <= 0) { const th = M.threat * (1 + M.holdT / s.secs * .8), walls = M.type === 'siege' ? (DB.crews[room.code].b.walls || 0) : 0, last = M.holdT > s.secs * .75;
      hostDo(room, M, { k: 'wave', x: tgt.x, y: tgt.y, n: Math.round((7 + th * 2.5) * (1 - .1 * walls) * (last ? 1.4 : 1)), run: Math.min(.6, .06 * th), spec: th >= 2.5, tag: 'wave', brute: th >= 5 ? 1 + (last ? 1 : 0) : 0, elite: last && th >= 3 ? 1 : 0 }); M.waveT = Math.max(12, 26 - th); }
    bop(room, M, { t: 'prog', v: Math.min(1, M.holdT / s.secs), secs: Math.max(0, Math.round(s.secs - M.holdT)) });
    if (M.holdT >= s.secs) nextStage(room, M);
  }
  else if (s.k === 'clear') { if (M.left !== null) { bop(room, M, { t: 'left', n: M.left }); if (M.left <= 0 && M.t > 4) nextStage(room, M); } }
  else if (s.k === 'extract') { if (alive.length && alive.every(p => dist(p.st, tgt) < 320)) nextStage(room, M); }
}
function bonusMet(M) { const b = M.bonus, k = Object.values(M.kills).reduce((a, x) => a + x, 0);
  return b.k === 'nodown' ? M.downs === 0 : b.k === 'fast' ? M.tAll <= b.secs : b.k === 'elite' ? M.elites >= b.n : b.k === 'kills' ? k >= b.n : false; }
function endMission(room, M, win, why) {
  if (!M || M.ended) return; M.ended = true; clearTimeout(M.loadTimer); clearTimeout(M.ptsTimer);
  const c = DB.crews[room.code], players = squadOf(room, M);
  let paid = {}; const bonus = win && bonusMet(M);
  if (c) {
    if (win) { for (const k in M.reward) { const v = Math.round(M.reward[k] * (bonus ? 1.5 : 1)); c.res[k] = (c.res[k] || 0) + v; paid[k] = v; } c.done++; if (M.story && !c.storyDone.includes(M.story)) c.storyDone.push(M.story); }
    else { c.fails++; for (const k in c.res) { const loss = Math.floor(c.res[k] * .05); c.res[k] -= loss; } if (M.type === 'siege') { const ks = Object.keys(c.b).filter(k => c.b[k] > 0); if (ks.length) { const k = ks[Math.floor(Math.random() * ks.length)]; c.b[k]--; c.log.push({ t: now(), m: BUILDINGS[k].name + ' lost a level in the siege.' }); } } }
    c.log.push({ t: now(), m: (win ? 'Completed ' : 'Failed ') + M.name + ' (threat ' + M.threat + ')' + (bonus ? ' with the bonus' : '') }); if (c.log.length > 50) c.log.shift();
    c.board = (c.board || []).filter(m => m.mid !== M.mid); if (c.board.filter(m => !m.story).length < 3 || M.story) makeBoard(c, room);
  }
  const stats = {};
  for (const p of players) { const k = M.kills[p.pid] || 0, prof = DB.profiles[p.pid] || (DB.profiles[p.pid] = { name: p.name, xp: 0, kills: 0, missions: 0 }); prof.name = p.name; prof.kills += k; prof.xp += k * 10 + (win ? Math.round(200 * M.threat * (TIERS[M.tier] || TIERS.normal).pay * (bonus ? 1.5 : 1)) : 40); if (win) prof.missions++; stats[p.pid] = { name: p.name, kills: k, xp: prof.xp }; p.op = null; p.loaded = false; }
  save();
  bop(room, M, { t: 'mission.end', win, why: why || '', reward: paid, stats, done: win ? M.done : null, name: M.name, bonus: M.bonus.txt, bonusMet: !!bonus });
  for (const p of players) p.op = null;
  room.ops.delete(M.id);
  if (win) bcast(room, { t: 'chat', name: '', m: 'Squad home from ' + M.name + '.' });
  crewUpdate(room);
}

/* ---------------- http: static files ---------------- */
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.glb': 'model/gltf-binary', '.css': 'text/css', '.md': 'text/markdown', '.ogg': 'audio/ogg', '.mp3': 'audio/mpeg', '.wav': 'audio/wav' };
const server = http.createServer((req, res) => {
  const u = decodeURIComponent((req.url || '/').split('?')[0]);
  if (u === '/healthz') { res.writeHead(200, { 'content-type': 'text/plain' }); return res.end('ok'); }
  if (u === '/api/stats') { res.writeHead(200, { 'content-type': 'application/json' }); return res.end(JSON.stringify({ crews: Object.keys(DB.crews).length, rooms: rooms.size, online: [...rooms.values()].reduce((a, r) => a + r.players.size, 0), ops: [...rooms.values()].reduce((a, r) => a + r.ops.size, 0) })); }
  let f = path.join(PUBLIC, u === '/' ? 'index.html' : u);
  if (!f.startsWith(PUBLIC)) { res.writeHead(403); return res.end(); }
  fs.stat(f, (e, st) => {
    if (e || !st.isFile()) { res.writeHead(404); return res.end('not found'); }
    const ext = path.extname(f).toLowerCase(), gz = /\.(json|js|html)$/.test(ext) && /gzip/.test(req.headers['accept-encoding'] || '') && fs.existsSync(f + '.gz');
    res.writeHead(200, { 'content-type': MIME[ext] || 'application/octet-stream', 'cache-control': ext === '.html' ? 'no-cache' : 'public, max-age=3600', ...(gz ? { 'content-encoding': 'gzip' } : {}) });
    fs.createReadStream(gz ? f + '.gz' : f).pipe(res);
  });
});

/* ---------------- websocket protocol ---------------- */
const wss = new WebSocketServer({ server, maxPayload: 256 * 1024 });
wss.on('connection', ws => {
  const p = { ws, pid: null, name: 'Survivor', look: 'PM1', room: null, ready: false, inMission: false, loaded: false, st: null, rtt: 0, msgN: 0, msgT: now() };
  ws.on('message', raw => {
    // basic flood guard
    const t0 = now(); if (t0 - p.msgT > 1000) { p.msgT = t0; p.msgN = 0; } if (++p.msgN > 400) return;
    let m; try { m = JSON.parse(raw); } catch (e) { return; }
    handle(p, m);
  });
  ws.on('close', () => leave(p));
  ws.on('pong', () => { p.rtt = now() - (p.pingT || now()); });
});
setInterval(() => { for (const ws of wss.clients) ws.ping(); for (const r of rooms.values()) for (const p of r.players.values()) p.pingT = now(); }, 5000);

function opOf(p) { return p.room && p.op ? p.room.ops.get(p.op) || null : null; }
function dropFromOp(room, p, why) {
  const M = room.ops.get(p.op); p.op = null; p.loaded = false; if (!M) return;
  M.squad.delete(p.pid); bop(room, M, { t: 'left.player', pid: p.pid, name: p.name });
  if (!M.squad.size) return endMission(room, M, false, why || 'Everyone left.');
  if (M.host === p.pid) setHost(room, M, pickHost(room, M), 'migrate');
}
function leave(p) {
  const room = p.room; if (!room) return;
  if (p.op) dropFromOp(room, p);
  room.players.delete(p.pid); p.room = null;
  const c = DB.crews[room.code]; if (c && c.members[p.pid]) c.members[p.pid].last = now();
  bcast(room, { t: 'left.player', pid: p.pid, name: p.name });
  if (!room.players.size) { for (const M of room.ops.values()) endMission(room, M, false, 'Everyone left.'); rooms.delete(room.code); } else crewUpdate(room);
  save();
}
function joinRoom(p, c) {
  if (p.room) leave(p);
  crewFix(c); const room = roomOf(c.code);
  if (room.players.size >= MAX_PLAYERS) return send(p, { t: 'err', m: 'That crew already has ' + MAX_PLAYERS + ' players online.' });
  if (room.players.has(p.pid)) { const old = room.players.get(p.pid); if (old.op) dropFromOp(room, old); try { old.ws.close(); } catch (e) { } room.players.delete(p.pid); }
  room.players.set(p.pid, p); p.room = room; p.ready = false; p.op = null;
  c.members[p.pid] = { name: p.name, joined: (c.members[p.pid] || {}).joined || now(), last: now() }; save();
  send(p, { t: 'joined', code: c.code, crew: crewView(c, room), you: p.pid, armory: armoryOf(p) });
  bcast(room, { t: 'join.player', pid: p.pid, name: p.name, look: p.look }, p);
  crewUpdate(room);
  const run = [...room.ops.values()].find(M => M.go && !M.ended && M.squad.size < MAX_SQUAD); if (run) send(p, { t: 'mission.busy', name: run.name, m: publicMission(run) });
}
function joinOp(room, p, M) {
  if (!M || M.ended || p.op) return; if (M.squad.size >= MAX_SQUAD) return send(p, { t: 'err', m: 'That squad is full.' });
  M.squad.add(p.pid); M.names[p.pid] = p.name; p.op = M.id; p.loaded = false; p.down = false; p.ready = false;
  send(p, { t: 'mission.load', m: publicMission(M), seed: M.seed, armory: armoryOf(p) }); crewUpdate(room);
}
const ARMS = new Set(['shotgun', 'rifle', 'smg', 'hunting', 'machete', 'revolver', 'sawnoff', 'ak', 'lmg', 'crossbow', 'katana', 'axe', 'bat', 'sledge', 'scar', 'g36', 'mp5sd', 'uzi', 'svd', 'm14', 'spas']);
function handle(p, m) {
  const room = p.room, M = opOf(p);
  switch (m.t) {
    case 'hello': {
      p.pid = /^[a-f0-9]{16}$/.test(m.pid || '') ? m.pid : rid(8); p.name = String(m.name || 'Survivor').replace(/[<>]/g, '').slice(0, 18) || 'Survivor'; p.look = /^P[MF]\d$/.test(m.look) ? m.look : 'PM1';
      const prof = DB.profiles[p.pid]; send(p, { t: 'welcome', pid: p.pid, profile: prof || null, crews: Object.values(DB.crews).filter(c => c.members[p.pid]).map(c => ({ code: c.code, name: c.name, done: c.done })) }); return; }
    case 'crew.create': { if (!p.pid) return; const c = newCrew(m.name); DB.crews[c.code] = c; makeBoard(c); save(); joinRoom(p, c); return; }
    case 'crew.join': { if (!p.pid) return; const c = DB.crews[String(m.code || '').toUpperCase().trim()]; if (!c) return send(p, { t: 'err', m: 'No crew with that code.' }); joinRoom(p, c); return; }
    case 'crew.leave': leave(p); send(p, { t: 'left' }); return;
    case 'chat': if (room) bcast(room, { t: 'chat', pid: p.pid, name: p.name, m: String(m.m || '').slice(0, 200) }); return;
  }
  if (!room) return;
  const c = DB.crews[room.code];
  switch (m.t) {
    case 'ready': p.ready = !!m.v; crewUpdate(room); return;
    case 'board.refresh': if (!room.ops.size) { makeBoard(c); crewUpdate(room); } return;
    case 'upgrade': { const b = m.b; if (!BUILDINGS[b] || c.b[b] >= 5) return; const nd = upNeed(b, c.b[b]); if (nd) for (const k in nd) if ((c.b[k] || 0) < nd[k]) return send(p, { t: 'err', m: BUILDINGS[b].name + ' level ' + (c.b[b] + 1) + ' needs ' + BUILDINGS[k].name + ' level ' + nd[k] + '.' });
      const cost = upCost(b, c.b[b]); for (const k in cost) if ((c.res[k] || 0) < cost[k]) return send(p, { t: 'err', m: 'Not enough ' + k + '.' });
      for (const k in cost) c.res[k] -= cost[k]; c.b[b]++; c.log.push({ t: now(), m: p.name + ' upgraded ' + BUILDINGS[b].name + ' to level ' + c.b[b] + '.' }); if (b === 'radio') makeBoard(c); save();
      bcast(room, { t: 'built', b, lv: c.b[b], by: p.name }); crewUpdate(room); return; }
    // the old one-button flow: you plus everyone at Haven who said they are ready
    case 'mission.start': if (!p.op) { const ready = [...room.players.values()].filter(q => q !== p && !q.op && q.ready).map(q => q.pid); startMission(room, p, m.mid, m.tier, m.solo ? [] : (m.squad || ready)); } return;
    case 'mission.join': if (!p.op) { const run = m.id ? room.ops.get(m.id) : [...room.ops.values()].find(X => !X.ended && X.squad.size < MAX_SQUAD); joinOp(room, p, run); } return;
    case 'mission.abort': if (M) { if (M.squad.size > 1) { dropFromOp(room, p); send(p, { t: 'mission.end', win: false, why: 'You pulled out. Your squad is still out there.', reward: {}, stats: {}, name: M.name, solo: 1 }); crewUpdate(room); } else endMission(room, M, false, p.name + ' called it off.'); } return;
    case 'loaded': if (M) { p.loaded = true; if (squadOf(room, M).every(q => q.loaded)) goMission(room, M); if (M.go) { send(p, { t: 'mission.go' }); send(p, { t: 'host', pid: M.host }); if (M.stage >= 0) send(p, stageMsg(M, M.stages[M.stage])); } } return;
    case 'pts': if (M && p.pid === M.host) setPoints(room, M, m.pts || {}); return;
    case 'st': {   // player state, ~15 Hz: squads only see their own squad, everyone at Haven sees each other
      const s = m.s; if (!s || !isFinite(s.x) || !isFinite(s.y)) return; if (s.down && !p.down && M) M.downs++; p.st = s; p.down = !!s.down;
      if (M) bop(room, M, { t: 'ps', pid: p.pid, s }, p); else bhaven(room, { t: 'ps', pid: p.pid, s }, p); return; }
    case 'shot': if (M) bop(room, M, { t: 'shot', pid: p.pid, a: m.a, b: m.b, w: m.w }, p); else bhaven(room, { t: 'shot', pid: p.pid, a: m.a, b: m.b, w: m.w }, p); return;
    case 'zs': if (M && p.pid === M.host) bop(room, M, { t: 'zs', z: m.z, tm: m.tm }, p); return;
    case 'hit': if (M) { const h = room.players.get(M.host); if (h && h !== p) send(h, { t: 'hit', pid: p.pid, h: m.h }); } return;
    case 'zdead': if (M && p.pid === M.host) { for (const [nid, by, el] of (m.list || [])) { if (by) M.kills[by] = (M.kills[by] || 0) + 1; if (el) M.elites++; } bop(room, M, { t: 'zdead', list: m.list }, p); } return;
    case 'pdmg': if (M && p.pid === M.host) { for (const [pid, n] of (m.list || [])) { const q = room.players.get(pid); if (q && q.op === M.id) send(q, { t: 'pdmg', n }); } } return;
    case 'spawnreq': if (M) { const h = room.players.get(M.host); if (h && h !== p) send(h, { t: 'spawnreq', list: (m.list || []).slice(0, 12) }); } return;
    case 'left': if (M && p.pid === M.host) M.left = m.n | 0; return;
    case 'claim': { if (!M) return; const s = M.stages[M.stage]; if (!s || s.k !== 'collect') return; const pts = s.nest ? M.pts.nests : M.pts.caches; const i = m.i | 0, pt = pts[i]; if (!pt || M.claims[i] || i >= s.n) return; if (!p.st || dist(p.st, pt) > 90) return;
      M.claims[i] = p.pid; bop(room, M, { t: 'claimed', i, pid: p.pid, name: p.name, got: Object.keys(M.claims).length, n: s.n, nest: s.nest ? 1 : 0 }); return; }
    case 'revive': if (M) { const q = room.players.get(m.pid); if (q && q.op === M.id && q.down && p.st && q.st && dist(p.st, q.st) < 80) { send(q, { t: 'revived', by: p.name }); bop(room, M, { t: 'chat', name: '', m: p.name + ' picked up ' + q.name + '.' }); } } return;
    case 'car': if (M) bop(room, M, { t: 'car', pid: p.pid, c: m.c }, p); else bhaven(room, { t: 'car', pid: p.pid, c: m.c }, p); return;
    case 'ping': { if (!isFinite(m.x) || !isFinite(m.y)) return; const o = { t: 'ping', pid: p.pid, name: p.name, x: Math.round(m.x), y: Math.round(m.y) }; if (M) bop(room, M, o, p); else bhaven(room, o, p); return; }
    case 'give': { const q = room.players.get(m.to); if (!q || q === p || (q.op || null) !== (p.op || null) || !p.st || !q.st || dist(p.st, q.st) > 140) return; const k = m.pack || {}, pack = {};
      if (k.band) pack.band = 1; if (k.ammo > 0) { pack.ammo = Math.min(120, k.ammo | 0); pack.k = ['ammo', 'shells', 'rifleammo', 'huntammo', 'bolts'].includes(k.k) ? k.k : 'ammo'; } send(q, { t: 'given', name: p.name, pack }); return; }
    case 'armory': { const id = String(m.id || ''); if (!ARMS.has(id)) return; const prof = DB.profiles[p.pid] || (DB.profiles[p.pid] = { name: p.name, xp: 0, kills: 0, missions: 0 }); prof.armory = prof.armory || {}; if (!prof.armory[id]) { prof.armory[id] = now(); save(); bcast(room, { t: 'chat', name: '', m: p.name + ' found a ' + String(m.name || id).slice(0, 30) + '.' }); } return; }
  }
}
let last = now();
setInterval(() => { const t = now(), dt = (t - last) / 1000; last = t; for (const r of rooms.values()) for (const M of [...r.ops.values()]) missionTick(r, M, dt); }, 250);

loadDB().then(() => server.listen(PORT, () => console.log('ColdShore Online on :' + PORT + '  public=' + PUBLIC + '  saves=' + (useSB ? 'supabase' : DBF))));
module.exports = { server };
