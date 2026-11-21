/* ================= v20: cast, voices, cutscenes, companions, story, title, HUD ================= */
const UIS = document.createElement('style');
UIS.textContent = `
#ui *{box-sizing:border-box}
.lb{position:fixed;left:0;right:0;height:0;background:#000;z-index:6;transition:height .7s cubic-bezier(.6,0,.2,1);pointer-events:none}
#lbT{top:0}#lbB{bottom:0}
body.cine #lbT,body.cine #lbB{height:11vh}
#sub{position:fixed;left:50%;bottom:13vh;transform:translateX(-50%);max-width:min(900px,86vw);text-align:center;z-index:8;pointer-events:none;
 font:500 clamp(15px,1.6vw,21px)/1.45 'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#f2f2ee;text-shadow:0 2px 6px #000,0 0 2px #000;opacity:0;transition:opacity .2s}
#sub.on{opacity:1}#sub b{font-weight:700;letter-spacing:.06em;margin-right:.5em;text-transform:uppercase;font-size:.82em}
#sub .rad{font-size:.7em;padding:1px 6px;border:1px solid currentColor;border-radius:3px;margin-right:6px;opacity:.85}
#choice{position:fixed;left:50%;bottom:18vh;transform:translateX(-50%);z-index:9;display:none;flex-direction:column;gap:8px;min-width:min(560px,86vw)}
#choice.on{display:flex}
#choice div{background:rgba(8,12,14,.82);border-left:3px solid #e9c46a;padding:11px 16px;color:#eee;font:15px 'Segoe UI',Roboto,Arial,sans-serif;backdrop-filter:blur(3px);cursor:pointer}
#choice div:hover{background:rgba(30,36,38,.9)}#choice div kbd{display:inline-block;min-width:22px;text-align:center;margin-right:10px;border:1px solid #888;border-radius:3px;font:12px ui-monospace,monospace;padding:1px 4px;color:#e9c46a}
#fade{position:fixed;inset:0;background:#000;opacity:0;z-index:7;pointer-events:none;transition:opacity 1s}
#tcard{position:fixed;left:0;right:0;top:40%;text-align:center;z-index:9;pointer-events:none;opacity:0;transition:opacity 1.2s;color:#e8e6df;font:300 clamp(18px,2.4vw,30px)/1.4 'Segoe UI',Roboto,Arial,sans-serif;letter-spacing:.45em;text-transform:uppercase}
#tcard small{display:block;margin-top:12px;font-size:.45em;letter-spacing:.35em;color:#a9b4b0}
#tcard.on{opacity:1}
#skip{position:fixed;right:22px;bottom:calc(11vh + 10px);z-index:8;color:#aaa;font:12px ui-monospace,monospace;opacity:0;transition:opacity .5s;pointer-events:none}
body.cine #skip{opacity:.75}
#skip kbd{border:1px solid #777;border-radius:3px;padding:0 5px;margin-right:6px}
#title{position:fixed;inset:0;z-index:10;display:none;pointer-events:none}
#title.on{display:block}
#title .vg{position:absolute;inset:0;background:radial-gradient(ellipse at 30% 50%,rgba(0,0,0,0) 0%,rgba(0,0,0,.25) 45%,rgba(0,0,0,.85) 100%),linear-gradient(90deg,rgba(0,0,0,.75) 0%,rgba(0,0,0,.15) 55%,rgba(0,0,0,0) 100%)}
#title .logo{position:absolute;left:7vw;top:16vh;color:#eef0ea;pointer-events:none}
#title .logo h1{font:200 clamp(44px,7.5vw,112px)/1 'Segoe UI',Roboto,Helvetica,Arial,sans-serif;letter-spacing:.32em;margin:0;text-shadow:0 0 40px rgba(120,180,200,.25)}
#title .logo h1 span{color:#9fd6e6}
#title .logo .tag{margin-top:14px;font:400 clamp(12px,1.1vw,15px)/1.6 'Segoe UI',Roboto,Arial,sans-serif;letter-spacing:.3em;color:#a8b4b0;text-transform:uppercase}
#title .menu{position:absolute;left:7vw;top:50vh;display:flex;flex-direction:column;gap:4px;pointer-events:auto}
#title .menu a{font:400 clamp(15px,1.4vw,19px) 'Segoe UI',Roboto,Arial,sans-serif;letter-spacing:.28em;color:#c9d1ce;text-decoration:none;padding:9px 0 9px 0;cursor:pointer;text-transform:uppercase;transition:color .15s,padding .15s;border-left:2px solid transparent}
#title .menu a:hover,#title .menu a.sel{color:#fff;padding-left:14px;border-left-color:#9fd6e6}
#title .menu a.dis{color:#55605d;pointer-events:none}
#title .press{position:absolute;left:0;right:0;bottom:16vh;text-align:center;font:400 14px 'Segoe UI',Roboto,Arial,sans-serif;letter-spacing:.5em;color:#dfe6e3;animation:pulse 2.2s infinite}
@keyframes pulse{0%,100%{opacity:.25}50%{opacity:1}}
#title .foot{position:absolute;right:3vw;bottom:3vh;font:11px ui-monospace,monospace;color:#6f7c78;text-align:right;line-height:1.7}
#title .panel{position:absolute;left:7vw;top:46vh;width:min(760px,86vw);pointer-events:auto;font:14px/1.6 'Segoe UI',Roboto,Arial,sans-serif;color:#c8d0cd}
#title .panel h3{font-weight:300;letter-spacing:.3em;text-transform:uppercase;margin:0 0 14px;color:#fff;font-size:18px}
#title .bgs{display:grid;grid-template-columns:repeat(4,1fr);gap:12px}
#title .bgc{background:rgba(10,14,16,.72);border:1px solid rgba(255,255,255,.12);padding:14px;cursor:pointer;transition:all .15s;backdrop-filter:blur(4px)}
#title .bgc:hover,#title .bgc.sel{border-color:#9fd6e6;background:rgba(20,30,34,.85);transform:translateY(-3px)}
#title .bgc b{display:block;color:#fff;letter-spacing:.14em;text-transform:uppercase;font-weight:600;font-size:13px;margin-bottom:6px}
#title .bgc small{color:#97a4a0;font-size:12px;line-height:1.45;display:block;min-height:70px}
#title .bgc .st{margin-top:8px;font:10px ui-monospace,monospace;color:#9fd6e6}
#title .btns{margin-top:16px;display:flex;gap:12px}
#title .btn{display:inline-block;border:1px solid rgba(255,255,255,.3);padding:9px 22px;letter-spacing:.25em;text-transform:uppercase;font-size:13px;color:#fff;cursor:pointer;background:rgba(0,0,0,.35)}
#title .btn:hover{border-color:#9fd6e6;background:rgba(40,60,66,.6)}
#title table{border-collapse:collapse;font-size:13px}#title td{padding:3px 18px 3px 0;color:#aab6b2}#title td:first-child{color:#fff;font-family:ui-monospace,monospace}
#pause{position:fixed;inset:0;z-index:9;display:none;background:rgba(0,0,0,.55);backdrop-filter:blur(3px)}
#pause.on{display:block}
#pause .in{position:absolute;left:7vw;top:22vh;font:14px/1.6 'Segoe UI',Roboto,Arial,sans-serif;color:#c8d0cd}
#pause h2{font:200 44px 'Segoe UI',Roboto,Arial,sans-serif;letter-spacing:.3em;margin:0 0 18px;color:#fff}
#pause a{display:block;letter-spacing:.25em;text-transform:uppercase;color:#c9d1ce;padding:7px 0;cursor:pointer;font-size:16px}
#pause a:hover{color:#fff;padding-left:10px}
#pause .obj{margin:0 0 22px;color:#e9c46a;letter-spacing:.06em}
#pause .sk{margin-top:20px;font:12px ui-monospace,monospace;color:#8b9a96;line-height:1.8}
#endc{position:fixed;inset:0;z-index:11;display:none;background:rgba(0,0,0,.82);align-items:center;justify-content:center}
#endc.on{display:flex}
#endc .in{max-width:720px;padding:20px 30px;font:16px/1.7 Georgia,'Times New Roman',serif;color:#d8d6cf;text-align:left}
#endc h2{font:200 40px 'Segoe UI',Roboto,Arial,sans-serif;letter-spacing:.3em;text-transform:uppercase;color:#fff;margin:0 0 6px}
#endc .k{font:12px ui-monospace,monospace;color:#8b9a96;margin:18px 0}
`;
document.head.appendChild(UIS);
const UI = document.createElement('div'); UI.id = 'ui';
UI.innerHTML = '<div class="lb" id="lbT"></div><div class="lb" id="lbB"></div><div id="sub"></div><div id="choice"></div><div id="fade"></div><div id="tcard"></div>' +
  '<div id="skip"><kbd>ENTER</kbd>skip</div><div id="title"></div><div id="pause"></div><div id="endc"></div>';
document.body.appendChild(UI);
const $ = id => document.getElementById(id);
const subEl = $('sub'), choiceEl = $('choice'), fadeEl = $('fade'), tcardEl = $('tcard'), titleEl = $('title'), pauseEl = $('pause'), endEl = $('endc');

/* ---------- cast & voices ---------- */
const CAST = {
  ELI: { name: 'Eli', col: '#86d4ff', g: 'm', pitch: 1.2, rate: 1.07, vi: 0 },
  REY: { name: 'Reyes', col: '#c8d78c', g: 'm', pitch: .7, rate: .93, vi: 1 },
  JUN: { name: 'June', col: '#8ff0c8', g: 'f', pitch: 1.05, rate: .98, vi: 0 },
  DAR: { name: 'Dara', col: '#ffb86b', g: 'f', pitch: .85, rate: 1.0, vi: 1 },
  SAM: { name: 'Sam', col: '#f3e38a', g: 'm', pitch: 1.08, rate: 1.0, vi: 2 },
  HART: { name: 'Col. Hart', col: '#ff8f80', g: 'm', pitch: .8, rate: 1.08, vi: 3, radio: true },
  VOS: { name: 'Dr. Voss', col: '#d6b8ff', g: 'f', pitch: .78, rate: .92, vi: 2 },
  YOU: { name: 'You', col: '#ffffff', g: 'm', pitch: 1, rate: 1.02, vi: 4 }
};
let voicesOn = true, VOICES = null, ttsOk = false;
function pickVoices() {
  try {
    const all = speechSynthesis.getVoices(); const vs = all.filter(v => /^en/i.test(v.lang)); if (!vs.length) return;
    ttsOk = true;
    const isF = v => /female|zira|samantha|victoria|karen|moira|tessa|fiona|susan|hazel|libby|sonia|aria|jenny|serena|allison|ava|kate|google us english|natasha|emma|clara/i.test(v.name);
    const fem = vs.filter(isF), mal = vs.filter(v => !isF(v));
    VOICES = {};
    for (const k in CAST) { const c = CAST[k], pool = c.g === 'f' ? (fem.length ? fem : vs) : (mal.length ? mal : vs); VOICES[k] = pool[c.vi % pool.length]; }
  } catch (e) {}
}
if (window.speechSynthesis) { pickVoices(); speechSynthesis.onvoiceschanged = pickVoices; }
let speaking = null, curSay = null, sayBusyUntil = 0;
function showSub(who, text) {
  const C = CAST[who];
  subEl.innerHTML = (C ? '<b style="color:' + C.col + '">' + (C.radio ? '<span class="rad">RADIO</span>' : '') + C.name + '</b>' : '') + esc(text);
  subEl.classList.add('on');
}
function hideSub() { subEl.classList.remove('on'); }
function say(who, text, opt) {
  opt = opt || {};
  return new Promise(res => {
    const C = CAST[who] || {}; showSub(who, text); speaking = who;
    const words = text.split(/\s+/).length, est = 0.9 + words * 0.37 / (C.rate || 1);
    let done = false, to = 0, to2 = 0;
    const fin = () => { if (done) return; done = true; clearTimeout(to); clearTimeout(to2); if (speaking === who) speaking = null; hideSub(); if (curSay && curSay.fin === fin) curSay = null; res(); };
    curSay = { fin };
    if (cine && cine.skip) { fin(); return; }
    to = setTimeout(fin, (est * 1.8 + 2) * 1000);
    sayBusyUntil = performance.now() + est * 1000;
    if (voicesOn && ttsOk && window.speechSynthesis && C.pitch) {
      try {
        const u = new SpeechSynthesisUtterance(text); const v = VOICES && VOICES[who]; if (v) u.voice = v;
        u.pitch = C.pitch; u.rate = C.rate; u.volume = opt.vol === undefined ? 1 : opt.vol;
        u.onend = () => setTimeout(fin, 160); u.onerror = () => { to2 = setTimeout(fin, est * 1000); };
        speechSynthesis.speak(u);
      } catch (e) { to2 = setTimeout(fin, est * 1000); }
    } else to2 = setTimeout(fin, est * 1000);
  });
}
function stopSpeech() { try { if (window.speechSynthesis) speechSynthesis.cancel(); } catch (e) {} if (curSay) curSay.fin(); }
let barkCd = 0;
function bark(who, text, force) {
  const n = npc(who);
  if (!force && (barkCd > 0 || speaking || performance.now() < sayBusyUntil || state !== 'play')) return false;
  if (n && (!n.party && !force)) return false;
  barkCd = 6; say(who, text); return true;
}
async function convo(lines) { for (const [w, t] of lines) { if (state !== 'play' && state !== 'cut') return; await say(w, t); } }
function radioCrackle(d) { if (!actx) return; try { audioBus(); const t = actx.currentTime; nb(t, d || .6, 'bandpass', 2600, 1.2, .12, .15, 1800, 0); click(900, .3); } catch (e) {} }

/* ---------- people model ---------- */
let PGLTF = null;
assetsReady.people = false;
(function loadPeople() {
  fetch('people.json').then(r => r.json()).then(j => {
    const bin = atob(j.glb), buf = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
    new THREE.GLTFLoader().parse(buf.buffer, '', g => {
      g.scene.traverse(o => { if (o.isMesh && o.material) { o.material.vertexColors = false; o.material.side = THREE.DoubleSide; o.material.metalness = 0; } });
      PGLTF = g; assetsReady.people = true; refreshTitle();
      if (world3 && P && !npcs.length) spawnCast();
    }, e => console.warn('people model failed', e));
  }).catch(e => console.warn('people fetch failed', e));
})();
const GUNM = new THREE.MeshStandardMaterial({ color: 0x18191b, roughness: .42, metalness: .55 });
const GUNP = new THREE.MeshStandardMaterial({ color: 0x23241f, roughness: .8, metalness: .1 });
function makeGun(rifle) {
  const g = new THREE.Group(), B = (w, h, d, m, x, y, z, rz) => { const b = new THREE.Mesh(GEO.box, m); b.scale.set(w, h, d); b.position.set(x, y, z); if (rz) b.rotation.z = rz; b.castShadow = true; g.add(b); return b; };
  if (rifle) {
    B(.06, .42, .05, GUNM, .05, .13, 0); B(.022, .3, .022, GUNM, .055, .48, 0); B(.05, .24, .045, GUNP, .02, -.18, 0, .15);
    B(.09, .05, .04, GUNM, -.015, .14, 0, .25); B(.035, .07, .034, GUNP, -.04, .05, 0, -.25); B(.025, .16, .03, GUNM, .1, .1, 0);
  } else {
    B(.032, .19, .027, GUNM, .045, .08, 0); B(.1, .036, .026, GUNP, -.0, .015, 0, .3); B(.012, .03, .02, GUNM, .015, .065, 0);
  }
  const mz = new THREE.Object3D(); mz.position.set(.05, rifle ? .64 : .18, 0); g.add(mz); g.userData.muzzle = mz;
  return g;
}
let npcs = [];
const npc = ch => npcs.find(n => n.ch === ch);
function buildPerson(ch) {
  const root = new THREE.Group(), m = THREE.SkeletonUtils.clone(PGLTF.scene); root.add(m);
  const drop = [];
  m.traverse(o => { if (!o.isMesh) return; let p = o, keep = false; while (p) { if (p.name && p.name.endsWith('_' + ch)) { keep = true; break; } p = p.parent; } if (!keep) drop.push(o); });
  drop.forEach(o => o.parent && o.parent.remove(o));
  m.traverse(o => { if (o.isMesh) { o.frustumCulled = false; o.castShadow = true; o.receiveShadow = true; } });
  const mixer = new THREE.AnimationMixer(m), acts = {};
  PGLTF.animations.forEach(c => { acts[c.name] = mixer.clipAction(c); });
  for (const nm of ['Fire', 'HitReact']) if (acts[nm]) { acts[nm].setLoop(THREE.LoopOnce, 1); acts[nm].clampWhenFinished = true; }
  root.userData = { mixer, acts, cur: null, glb: true, jaw: m.getObjectByName('Jaw'), hand: m.getObjectByName('HandR'), head: m.getObjectByName('Head') };
  setAnim(root.userData, 'Idle', 1, 0); acts.Idle.time = rnd(0, 3);
  return root;
}
function spawnNPC(ch, x, y, a, armed) {
  if (!PGLTF) return null;
  const n = { ch, x, y, a: a || 0, r: 11, hp: 100, mode: 'stand', party: false, anim: 'Idle', ts: 1, m: buildPerson(ch), cd: rnd(.4, 1), seat: -1, downT: 0, stuck: 0, lx: x, ly: y,
    healCd: 0, healT: 0, target: null, fireFx: 0, goal: null, gspd: 70, revive: 0, armed: !!armed, hitT: 0, force: null };
  if (armed && n.m.userData.hand) { n.gun = makeGun(armed === 'rifle'); n.m.userData.hand.add(n.gun); }
  world3.add(n.m); npcs.push(n); return n;
}
function houseDoor(name, out) {
  const h = houses[BL[name]]; if (!h) return { x: 0, y: 0, a: 0 };
  const cx = h.x + h.w / 2, cy = h.y + h.h / 2, o = out;
  if (h.door === 'n') return { x: cx, y: h.y - o, a: -Math.PI / 2 };
  if (h.door === 's') return { x: cx, y: h.y + h.h + o, a: Math.PI / 2 };
  if (h.door === 'w') return { x: h.x - o, y: cy, a: Math.PI };
  return { x: h.x + h.w + o, y: cy, a: 0 };
}
let KCLD = null;
function spawnCast() {
  if (!PGLTF || !world3) return;
  for (const n of npcs) world3.remove(n.m); npcs = [];
  const e = houseDoor('h4', -45); spawnNPC('ELI', e.x, e.y, e.a + Math.PI, 'pistol');
  spawnNPC('REY', 2600, 745, Math.PI / 2, 'rifle');
  const j = houseDoor('clinic', -50); spawnNPC('JUN', j.x, j.y, j.a + Math.PI, 'pistol');
  const d = houseDoor('warehouse', 24); spawnNPC('DAR', d.x, d.y, d.a, 'pistol');
  for (const n of npcs) n.mode = 'stand';
  if (story && story.i > 0) restoreParty();
}
function restoreParty() { for (const ch of story.party) { const n = npc(ch); if (n) { n.party = true; n.mode = 'follow'; n.x = P.x - 40; n.y = P.y + 30; collide(n); } } }

/* ---------- companion AI ---------- */
function segBlocked(ax, ay, bx, by) {
  const L = Math.hypot(bx - ax, by - ay), n = Math.ceil(L / 30);
  for (let i = 1; i < n; i++) {
    const x = ax + (bx - ax) * i / n, y = ay + (by - ay) * i / n;
    const cell = colGrid ? (colGrid.get(Math.floor(x / 200) * 10000 + Math.floor(y / 200)) || NOCELL) : { w: [] };
    for (const w of cell.w) if (!w.low && x > w.x && x < w.x + w.w && y > w.y && y < w.y + w.h) return true;
  }
  return false;
}
function npcShotSound(d) {
  if (!actx) return; try {
    audioBus(); const t = actx.currentTime, k = clamp(1 - d / 1800, .12, .75);
    nb(t, .05, 'highpass', 2000, .7, .9 * k, .025, 0, .6); nb(t, .2, 'lowpass', 1200, .9, 1.2 * k, .07, 280, 1); nb(t + .004, .4, 'lowpass', 380, .7, .9 * k, .16, 0, .9);
  } catch (e) {}
}
const _nv3 = new THREE.Vector3();
function npcFire(n, z) {
  const head = Math.random() < (n.ch === 'REY' ? .35 : .2), hit = Math.random() < (n.ch === 'REY' ? .82 : .64);
  n.fireFx = .14; npcShotSound(dist(n, P)); noise = Math.max(noise, 1.0);
  const o = n.gun ? n.gun.userData.muzzle.getWorldPosition(_nv3).clone() : new THREE.Vector3(n.x * S3, 1.4, n.y * S3);
  const ex = (z.x + (hit ? 0 : rnd(-18, 18))) * S3, ez = (z.y + (hit ? 0 : rnd(-18, 18))) * S3, ey = hit ? (head ? 1.65 : 1.2) : rnd(.6, 2.2);
  const geo = new THREE.BufferGeometry().setFromPoints([o, new THREE.Vector3(ex, ey, ez)]);
  const line = new THREE.Line(geo, M.tracer); scene.add(line); tracers.push({ line, t: 0.06 });
  muzzleLight.position.copy(o);
  if (hit) {
    z.hp -= head ? 2 : 1; blood(z.x, z.y, head ? 1.7 : 1.2, head ? 8 : 5); z.state = 'chase'; z.stag = .2; z.hitT = .35;
    const dx = z.x - n.x, dy = z.y - n.y, d = Math.hypot(dx, dy) || 1; z.x += dx / d * 5; z.y += dy / d * 5;
    if (z.hp <= 0) n.kills = (n.kills || 0) + 1;
  }
}
const SEATS = [[-0.28, 0.38], [-1.05, -0.36], [-1.05, 0.38]];
function boardCar(c) {
  let k = 0;
  for (const n of npcs) if (n.party && n.mode !== 'down' && dist(n, c) < 600 && k < SEATS.length) { n.mode = 'car'; n.seat = k++; n.car = c; }
  if (k) { const n = npcs.find(q => q.mode === 'car' && q.seat === 0); if (n) bark(n.ch, pick(LINES.board[n.ch] || ['Go, go.'])); }
}
function unboardCar(c) {
  let k = 0;
  for (const n of npcs) if (n.mode === 'car' && n.car === c) {
    const side = k % 2 ? 1 : -1, back = k > 1 ? -50 : -10; k++;
    const f = { x: Math.cos(c.a), y: Math.sin(c.a) }, r = { x: -Math.sin(c.a), y: Math.cos(c.a) };
    n.x = c.x + f.x * back + r.x * side * 42; n.y = c.y + f.y * back + r.y * side * 42; collide(n); n.mode = 'follow'; n.car = null; n.seat = -1;
  }
}
function updateNPCs(dt) {
  barkCd = Math.max(0, barkCd - dt);
  const party = npcs.filter(n => n.party);
  let pi = 0;
  for (const n of npcs) {
    n.fireFx = Math.max(0, n.fireFx - dt); n.hitT = Math.max(0, n.hitT - dt); n.healCd = Math.max(0, n.healCd - dt); n.cd -= dt;
    n.moving = false;
    if (n.mode === 'script' || n.mode === 'stand') { if (n.mode === 'script') npcScriptMove(n, dt); continue; }
    if (n.mode === 'car') { if (!driving || n.car !== driving) unboardCar(n.car || driving); continue; }
    if (n.mode === 'down') {
      n.downT -= dt;
      const dp = dist(n, P);
      if (!driving && dp < 55 && keys.KeyE) { n.revive += dt / 2; if (n.revive >= 1) { n.mode = 'follow'; n.hp = 70; n.revive = 0; bark(n.ch, pick(LINES.revived[n.ch] || ['Thanks.']), true); } }
      else n.revive = Math.max(0, n.revive - dt);
      if (n.downT <= 0) { n.mode = 'follow'; n.hp = 50; }
      continue;
    }
    if (!n.party) continue;
    const idx = pi++, N = party.length, dp = dist(n, P);
    // threat
    let tz = null, td = 430;
    for (const z of zombies) { if (z.hp <= 0) continue; const d = dist(z, n); if (d < td && (z.state === 'chase' || d < 240)) { if (!segBlocked(n.x, n.y, z.x, z.y)) { td = d; tz = z; } } }
    n.target = tz;
    // left far behind: catch up out of sight
    if (dp > 1400) { const a = yaw + Math.PI + rnd(-.6, .6); n.x = P.x + Math.cos(a) * 160; n.y = P.y + Math.sin(a) * 160; collide(n); continue; }
    // June heals
    if (n.ch === 'JUN' && P.hp < 55 && n.healCd <= 0 && (!tz || td > 260) && !driving) {
      if (dp > 34) npcMove(n, P.x, P.y, 125, dt); else { n.healT += dt; n.a = Math.atan2(P.y - n.y, P.x - n.x); if (n.healT > 2.2) { const amt = bgKey === 'paramedic' ? 50 : 40; P.hp = Math.min(100, P.hp + amt); n.healT = 0; n.healCd = 50; bark('JUN', pick(LINES.heal), true); toast('June patched you up (+' + amt + ' HP)'); } }
      continue;
    } else n.healT = 0;
    const slotA = yaw + Math.PI + (idx - (N - 1) / 2) * 0.8, gx = P.x + Math.cos(slotA) * 70, gy = P.y + Math.sin(slotA) * 70;
    if (tz && dp < 560) {
      n.a = Math.atan2(tz.y - n.y, tz.x - n.x);
      if (td < 46) npcMove(n, n.x - Math.cos(n.a) * 30, n.y - Math.sin(n.a) * 30, 80, dt);
      else if (n.cd <= 0 && n.armed) { npcFire(n, tz); n.cd = rnd(.65, 1.15) * (n.ch === 'REY' ? .6 : 1); }
      n.aiming = true;
    } else {
      n.aiming = false;
      const dg = Math.hypot(gx - n.x, gy - n.y);
      if (dg > 34 && (dp > 95 || dg > 140)) npcMove(n, gx, gy, dp > 260 ? 125 : (P.sprinting ? 112 : 74), dt);
      else if (dp < 300) { const da = Math.atan2(P.y - n.y, P.x - n.x); n.a += Math.atan2(Math.sin(da - n.a), Math.cos(da - n.a)) * Math.min(1, dt * 2); }
    }
    // stuck: hop to the slot when nobody is looking
    if (n.moving) { const mv = Math.hypot(n.x - n.lx, n.y - n.ly); n.stuck = mv < 18 * dt ? n.stuck + dt : 0; } else n.stuck = 0;
    if (n.stuck > 2.5) { n.x = gx; n.y = gy; collide(n); n.stuck = 0; }
    n.lx = n.x; n.ly = n.y;
    // zombies bite companions
    for (const z of zombies) {
      if (z.hp <= 0 || z.stag > 0) continue; const d = dist(z, n);
      if (d < z.r + n.r + 8 && d < dist(z, P)) {
        z.ang = Math.atan2(n.y - z.y, n.x - z.x); z.ncd = (z.ncd || 0) - dt;
        if (z.ncd <= 0) { z.ncd = 1.4; z.atkT = .8; n.hp -= z.run ? 8 : 11; n.hitT = .35; if (n.hp <= 0) { n.mode = 'down'; n.downT = 25; n.hp = 0; bark(n.ch, pick(LINES.down[n.ch] || ["I'm down!"]), true); toast(CAST[n.ch].name + ' is down. Hold E next to them to help.'); } }
      }
      if (d < z.r + n.r && d > .01) { const p = (z.r + n.r - d); z.x += (z.x - n.x) / d * p; z.y += (z.y - n.y) / d * p; }
    }
  }
  // keep bodies apart
  for (const n of npcs) {
    if (n.mode === 'car') continue;
    if (!driving) { const dx = n.x - P.x, dy = n.y - P.y, d = Math.hypot(dx, dy), m = n.r + P.r; if (d < m && d > .01) { n.x += dx / d * (m - d); n.y += dy / d * (m - d); } }
    for (const o of npcs) { if (o === n || o.mode === 'car') continue; const dx = n.x - o.x, dy = n.y - o.y, d = Math.hypot(dx, dy), m = n.r + o.r; if (d < m && d > .01) { n.x += dx / d * (m - d) / 2; n.y += dy / d * (m - d) / 2; } }
    if (n.party || n.mode === 'script') collide(n);
  }
  ambientChatter(dt);
}
function npcMove(n, gx, gy, sp, dt) {
  const dx = gx - n.x, dy = gy - n.y, d = Math.hypot(dx, dy); if (d < 2) return true;
  const ta = Math.atan2(dy, dx); n.a += Math.atan2(Math.sin(ta - n.a), Math.cos(ta - n.a)) * Math.min(1, dt * 8);
  const s = Math.min(d, sp * dt); n.x += dx / d * s; n.y += dy / d * s; n.moving = true; n.spd = sp; collide(n); return d < 6;
}
function npcScriptMove(n, dt) {
  if (!n.goal) return;
  if (npcMove(n, n.goal.x, n.goal.y, n.goal.sp, dt) || Math.hypot(n.goal.x - n.x, n.goal.y - n.y) < 6) { const g = n.goal; n.goal = null; if (g.res) g.res(); }
}
const _sq2 = new THREE.Quaternion(), _ax = new THREE.Vector3(1, 0, 0);
function syncNPCs(dt) {
  const t = performance.now() / 1000;
  for (const n of npcs) {
    const u = n.m.userData;
    const vis = Math.abs(n.x - P.x) < 1800 && Math.abs(n.y - P.y) < 1800 || state === 'cut' || state === 'title';
    n.m.visible = vis; if (!vis) continue;
    let an = 'Idle', ts = 1;
    if (n.mode === 'car' && n.car) {
      const c = n.car, s = SEATS[n.seat] || SEATS[0], f = { x: Math.cos(c.a), y: Math.sin(c.a) }, r = { x: -Math.sin(c.a), y: Math.cos(c.a) };
      n.m.position.set(c.x * S3 + f.x * s[0] + r.x * s[1], -0.02, c.y * S3 + f.y * s[0] + r.y * s[1]); n.m.rotation.y = -c.a; an = 'Sit';
      n.x = c.x; n.y = c.y;
    } else {
      n.m.position.set(n.x * S3, 0, n.y * S3); n.m.rotation.y = -n.a;
      if (n.force) an = n.force;
      else if (n.mode === 'down') an = 'Down';
      else if (n.healT > 0) an = 'Heal';
      else if (n.hitT > 0) an = 'HitReact';
      else if (n.fireFx > 0) an = 'Fire';
      else if (n.moving) { if (n.spd > 100) { an = 'Run'; ts = 1.15; } else { an = 'Walk'; ts = n.spd / 74; } }
      else if (n.aiming) an = 'Aim';
      else if (speaking === n.ch && state === 'play') an = 'Talk';
    }
    if (an === 'Fire' && u.cur === 'Fire' && n.fireFx > .12) u.acts.Fire.reset().play();
    setAnim(u, an, ts, an === 'Fire' ? .04 : .25); u.mixer.update(dt);
    if (n.gun) n.gun.visible = n.mode !== 'car' && an !== 'Sit' && an !== 'Heal' && an !== 'Down';
    if (u.jaw && speaking === n.ch) { const a = 0.04 + 0.16 * Math.abs(Math.sin(t * 17)) * Math.abs(Math.sin(t * 5.3 + 1)); u.jaw.quaternion.multiply(_sq2.setFromAxisAngle(_ax, -a)); }
  }
}

/* ---------- cutscene engine ---------- */
let cine = null;
function wait(s) { return new Promise(res => { if (!cine || cine.skip) { res(); return; } cine.waits.push({ t: s, res }); }); }
function shot(a, b, dur, ease) { if (!cine) return Promise.resolve(); cine.shot = { a, b: b || a, dur: dur || 1, t: 0, ease: ease === undefined ? 1 : ease }; return dur ? wait(dur) : Promise.resolve(); }
function fadeTo(v, s) { fadeEl.style.transition = 'opacity ' + (s || 0) + 's'; fadeEl.style.opacity = v; return s ? wait(s) : Promise.resolve(); }
async function tcard(t, sm, s) { tcardEl.innerHTML = esc(t) + (sm ? '<small>' + esc(sm) + '</small>' : ''); tcardEl.classList.add('on'); await wait(s); tcardEl.classList.remove('on'); await wait(1.2); }
function walkTo(n, x, y, sp) { return new Promise(res => { if (!n) { res(); return; } if (cine && cine.skip) { n.x = x; n.y = y; res(); return; } n.mode = 'script'; n.goal = { x, y, sp: sp || 70, res }; }); }
function choose(opts) {
  return new Promise(res => {
    if (cine && cine.skip) { res(0); return; }
    choiceEl.innerHTML = opts.map((o, i) => '<div data-i="' + i + '"><kbd>' + (i + 1) + '</kbd>' + esc(o) + '</div>').join(''); choiceEl.classList.add('on');
    const done = i => { choiceEl.classList.remove('on'); cine && (cine.choose = null); res(i); };
    choiceEl.querySelectorAll('div').forEach(d => d.onclick = () => done(+d.dataset.i));
    cine.choose = { n: opts.length, done };
  });
}
function camAt(n, d, side, h, lh) { // camera d metres in front of npc n (side rotates around), looking at its head
  const a = n.a + (side || 0), u = d / S3;
  return [n.x + Math.cos(a) * u, n.y + Math.sin(a) * u, h || 1.62, n.x, n.y, lh || 1.58];
}
function camPlayer(look, h) { const l = look; return [P.x, P.y, h || EYE, l.x, l.y, l.h || 1.5]; }
function cineUpdate(dt) {
  if (!cine) return;
  if (cine.skip) { for (const w of cine.waits) w.res(); cine.waits = []; for (const n of npcs) if (n.goal) { n.x = n.goal.x; n.y = n.goal.y; const g = n.goal; n.goal = null; g.res && g.res(); } }
  for (let i = cine.waits.length - 1; i >= 0; i--) { const w = cine.waits[i]; w.t -= dt; if (w.t <= 0) { cine.waits.splice(i, 1); w.res(); } }
  if (cine.shot) cine.shot.t += dt;
  if (cine.tick) cine.tick(dt);
  for (const n of npcs) if (n.mode === 'script') { n.moving = false; npcScriptMove(n, dt); }
}
function applyCineCam() {
  if (!cine || !cine.shot) return;
  const s = cine.shot, k0 = clamp(s.t / s.dur, 0, 1), k = s.ease ? k0 * k0 * (3 - 2 * k0) : k0;
  const A = typeof s.a === 'function' ? s.a() : s.a, B = typeof s.b === 'function' ? s.b() : s.b;
  const L = i => A[i] + (B[i] - A[i]) * k;
  const sh = camShake * 0.25;
  camera.position.set(L(0) * S3 + rnd(-sh, sh), L(2) + rnd(-sh, sh), L(1) * S3 + rnd(-sh, sh));
  camera.lookAt(L(3) * S3, L(5), L(4) * S3);
  if (Math.abs(camera.fov - 50) > .1) { camera.fov = 50; camera.updateProjectionMatrix(); }
}
async function runCut(fn, focus) {
  if (cine) return;
  state = 'cut'; cine = { waits: [], shot: null, skip: false, tick: null };
  for (const k in keys) keys[k] = false; mouse.down = false;
  document.body.classList.add('cine'); closeNote();
  if (focus) clearZombies(focus.x, focus.y, focus.r || 650);
  if (driving) { driving.v = 0; driving.vx = driving.vy = 0; }
  try { await fn(); } catch (e) { console.warn('cutscene error', e); }
  stopSpeech(); choiceEl.classList.remove('on'); tcardEl.classList.remove('on');
  for (const n of npcs) { n.force = null; if (n.mode === 'script') { n.mode = n.party ? 'follow' : 'stand'; n.goal = null; } }
  document.body.classList.remove('cine'); fadeTo(0, .8); cine = null;
  camera.fov = 75; camera.updateProjectionMatrix();
  if (state === 'cut') state = 'play';
}
function skipCut() { if (!cine || cine.skip) return; cine.skip = true; stopSpeech(); if (cine.choose) cine.choose.done(0); fadeTo(0, 0); }
function clearZombies(x, y, r) { for (let i = zombies.length - 1; i >= 0; i--) { const z = zombies[i]; if (Math.hypot(z.x - x, z.y - y) < r) { world3.remove(z.m); zombies.splice(i, 1); } } }
function horde(n, x, y, runners) {
  const before = zombies.length;
  for (let i = 0; i < n; i++) { const a = rnd(0, 6.283), d = rnd(520, 760); spawnZombie(false); const z = zombies[zombies.length - 1]; if (zombies.length > before + i) { z.x = clamp(x + Math.cos(a) * d, 50, W - 50); z.y = clamp(y + Math.sin(a) * d, 50, H - 50); if (isWater(z.x, z.y)) { z.x = x + Math.cos(a) * 300; z.y = y - Math.abs(Math.sin(a)) * 300; } collide(z); z.state = 'chase'; if (runners && Math.random() < runners) { z.run = true; z.sp = 105; } } }
}

/* ---------- lines ---------- */
const LINES = {
  board: { ELI: ['Shotgun!', "I'm in. Try not to hit everything this time.", 'Go, go, go!'], REY: ["I'll watch the mirrors.", 'Drive. I got the windows.'], JUN: ['Seatbelt. I mean it.', "Okay. Let's go."] },
  kill: { ELI: ['Got one!', 'Nice shot!', 'Is it bad that that felt good?'], REY: ['Target down.', 'Good kill.', 'Clean.'], JUN: ['Keep moving.', "That one's done."] },
  heal: ['Hold still. This is going to sting.', "There. You'll live. Don't make me do that again.", 'Pressure here. Good. You are fine.'],
  down: { ELI: ["I'm hit! I'm hit!", "Help! I can't get up!"], REY: ["I'm down! Watch your six!"], JUN: ["I'm hurt! Somebody!"] },
  revived: { ELI: ['Thanks. I owe you. Again.'], REY: ['Appreciated. Moving.'], JUN: ['Okay. Okay. I can walk.'] },
  horde: { ELI: ["That's a lot of them. That's a LOT of them!"], REY: ['Contacts, multiple! Fall back on me!', 'Here they come. Pick your shots!'], JUN: ['They heard us. They are coming!'] },
  crash: { ELI: ["Hey! I fix cars, I don't fix spines!", 'My whole life just flashed. It was mostly cars.'], REY: ['Easy! We need this car more than they need the road.'], JUN: ['If you break my neck I cannot treat it.'] },
  lowhp: { ELI: ['You look terrible. Like, medically.'], REY: ["You're bleeding out. Get behind me."] },
};
const CHATTER = [
  [['ELI', 'You think the fish are infected too?'], ['REY', 'I think about a lot of things, kid. Not fish.']],
  [['ELI', "When this is over I'm opening a garage somewhere with no water supply."], ['JUN', 'Everywhere has a water supply, Eli.'], ['ELI', '...Then a boat.']],
  [['REY', "Hart isn't a monster. He's a man following orders. That's worse."]],
  [['JUN', "Sam talked about you. Said you'd come even if everyone told you not to."]],
  [['ELI', 'My boss at the shop drank tap water every morning. Said bottled water was a scam.'], ['ELI', 'I keep thinking about that.']],
  [['JUN', 'Do no harm. That was the oath. Nobody wrote one for this.']],
  [['REY', 'Twelve years in uniform. Never fired at a civilian. Not starting now.']],
  [['ELI', "Do you think they know what they're doing? The zombies, I mean. Like, in there."], ['JUN', "No. And I hope I'm right."]],
];
let chatT = 70;
function ambientChatter(dt) {
  chatT -= dt; if (chatT > 0 || state !== 'play') return;
  const calm = !zombies.some(z => z.state === 'chase' && dist(z, P) < 900);
  if (!calm || speaking) { chatT = 8; return; }
  const ok = CHATTER.filter(c => c.every(([w]) => { const n = npc(w); return n && n.party && n.mode !== 'down'; }));
  chatT = rnd(65, 110);
  if (!ok.length) return;
  convo(pick(ok));
}
let lastKills = 0, hordeBark = 0, crashBark = 0, lowBark = 0, bgBark = {};
function storyBarks(dt) {
  hordeBark -= dt; crashBark -= dt; lowBark -= dt;
  const party = npcs.filter(n => n.party && n.mode !== 'down' && n.mode !== 'car' || n.mode === 'car');
  if (!party.length) return;
  const any = () => pick(party).ch;
  if (kills > lastKills) { if (Math.random() < .22) { const w = any(); bark(w, pick(LINES.kill[w] || ['Down.'])); } lastKills = kills; }
  const chasing = zombies.filter(z => z.state === 'chase' && dist(z, P) < 700).length;
  if (chasing >= 6 && hordeBark <= 0) { hordeBark = 40; const w = any(); bark(w, pick(LINES.horde[w] || ['Incoming!']), true); }
  if (P.hp < 30 && lowBark <= 0) { lowBark = 45; const w = party.find(n => n.ch === 'REY' || n.ch === 'ELI'); if (w) bark(w.ch, pick(LINES.lowhp[w.ch])); }
  if (driving && driving.lastCrash && performance.now() - driving.lastCrash < 400 && crashBark <= 0) { crashBark = 25; const w = party.find(n => n.mode === 'car'); if (w) bark(w.ch, pick(LINES.crash[w.ch] || ['Watch it!']), true); }
  if (!bgBark[bgKey]) {
    const r = npc('REY'), e = npc('ELI');
    if (bgKey === 'mechanic' && e && e.party && S.hotwire >= 2) { bgBark[bgKey] = 1; bark('ELI', "You hotwire faster than my boss did. And he did it for a living.", true); }
    if (bgKey === 'excop' && r && r.party && kills >= 8) { bgBark[bgKey] = 1; bark('REY', 'You hold that pistol like a cop. Old habits.', true); }
    if (bgKey === 'hunter' && r && r.party && elapsed > 400) { bgBark[bgKey] = 1; bark('REY', 'You move quiet. Hunter? They hunt by sound. Good instincts.', true); }
    if (bgKey === 'paramedic' && npc('JUN') && npc('JUN').party && inv.band === 0) { bgBark[bgKey] = 1; bark('JUN', 'Your field dressings are better than mine. Paramedic?', true); }
  }
}

/* ---------- story ---------- */
let story = { i: 0, party: [], timer: null, hold: 0, crystal: false };
const STAGES = [
  { t: "Find whoever is signalling from a house on Hollow Road", at: () => houseDoor('h4', 70), r: 190 },
  { t: 'Get a car running and drive. Eli spotted a sedan by the highway', at: () => cars[1], r: 0 },
  { t: 'Drive east to Cordon Checkpoint Bravo', at: () => ({ x: 2620, y: 840 }), r: 280 },
  { t: 'Hold Checkpoint Bravo with Reyes', at: () => ({ x: 2620, y: 840 }), r: 0 },
  { t: 'Search Greywater Clinic for anyone who knew Sam', at: () => houseDoor('clinic', 70), r: 170 },
  { t: 'Find Dara at the Harbor Union warehouse', at: () => houseDoor('warehouse', 70), r: 210 },
  { t: 'Drive to KCLD Radio in Pine Ridge and pull the transmitter crystal', at: () => KCLD, r: 130 },
  { t: 'Bring the crystal back to Dara at the harbor', at: () => houseDoor('warehouse', 70), r: 210 },
  { t: 'Reach Halden Station Nine in the north-east hills', at: () => ({ x: 3960, y: 665 }), r: 230 },
  { t: "Find the server room in Halden's main lab", at: () => notes.find(n => n.id === 'drive'), r: 0 },
  { t: 'Reach the dock beacon before Operation Whitecap', at: () => EVAC, r: 170 },
  { t: 'Decide who gets the drive', at: () => EVAC, r: 0 }
];
function objTarget() { const s = STAGES[story.i]; if (!s) return null; const a = s.at(); return a ? { x: a.x, y: a.y, text: s.t } : null; }
function setStage(i) { story.i = i; const s = STAGES[i]; if (s && state !== 'title') { objFlash = 4; beep(660, .12, 'triangle', .04); setTimeout(() => beep(990, .16, 'triangle', .04), 120); } }
let objFlash = 0;
function joinParty(ch) { const n = npc(ch); if (!n) return; n.party = true; n.mode = 'follow'; if (!story.party.includes(ch)) story.party.push(ch); toast(CAST[ch].name + ' joined you.'); }
function storyUpdate2(dt) {
  storyBarks(dt);
  objFlash = Math.max(0, objFlash - dt);
  if (story.timer) { story.timer.t -= dt; if (story.timer.t <= 0) { const cb = story.timer.cb; story.timer = null; cb(); return; } }
  const s = STAGES[story.i]; if (!s || cine) return;
  const a = s.at(); const near = a && s.r && dist(P, a) < s.r;
  switch (story.i) {
    case 0: if (near) cutEli(); break;
    case 1: if (driving) { setStage(2); setTimeout(() => bark('ELI', "Bravo's straight east on the highway. Can't miss it. Big fence, lots of floodlights.", true), 1500); } break;
    case 2: if (near) cutReyes(); break;
    case 4: if (near && !driving) cutJune(); break;
    case 5: if (near && !driving) cutDara1(); break;
    case 6: if (near) cutRadio(); break;
    case 7: if (near && !driving) cutDara2(); break;
    case 8: if (near) cutGate(); break;
    case 10: if (near) cutFinale(); break;
  }
  if (story.i === 1 && P.target && P.target.type === 'hot' && keys.KeyE && !story.eliHot) { story.eliHot = 1; bark('ELI', 'Red to red, brown to the starter. No, the other brown. Yeah.', true); }
}
function eliHelps() { const e = npc('ELI'); return e && e.party && e.mode !== 'down' && dist(e, P) < 160; }
function storyNoteHook(n) {
  if (n.id === 'drive' && story.i === 9) setTimeout(cutDrive, 50);
}
// ---- cold open ----
async function runIntro() {
  const car = cars[0]; car.state = 'ready'; car.hp = 0; car.fuel = 0;
  const z0 = (() => { spawnZombie(true, 330, 1420); return zombies[zombies.length - 1]; })();
  await runCut(async () => {
    fadeTo(1, 0); hideSub();
    let ct = 0, phase = 0; const ys = 2830, ye = 1520, T1 = 6.2;
    car.x = 330; car.y = ys; car.a = -Math.PI / 2;
    if (z0) { z0.x = 334; z0.y = 1440; z0.ang = Math.PI / 2; z0.state = 'wander'; z0.pause = true; z0.wt = 1e9; z0.feed = false; }
    cine.tick = dt => {
      if (phase === 1) { ct += dt; const k = Math.min(1, ct / T1); car.y = ys + (ye - ys) * k; car.v = (ye - ys) / T1; }
      if (phase === 2) { ct += dt; const k = Math.min(1, ct / .7); car.x = 330 + 110 * k * k; car.y = ye - 158 * k; car.a = -Math.PI / 2 + .55 * k; }
    };
    await tcard('Calder County, Oregon', 'Day six of the quarantine', 3.4);
    shot([-120, 2950, 16, 330, 1900, 2], [40, 2700, 11, 330, 1700, 1.5], 9, 1);
    fadeTo(0, 2.5);
    radioCrackle(1);
    await say('HART', 'This is Colonel Hart, Calder County Cordon. The county is under federal quarantine. Remain in your homes. Do not approach the cordon line.');
    radioCrackle(.4);
    phase = 1; ct = 0;
    const follow = () => [car.x - 8, car.y + 150, 2.3, car.x, car.y - 260, 1.1];
    shot(follow, follow, 3.2);
    const vm = say('SAM', "Hey, it's me. If you get this, do not come to the county. Please. They told us it was a ventilation fault at work. It isn't. I'm leaving something for you at the clinic in Greywater...");
    await wait(3.2);
    const inside = () => { const f = { x: Math.cos(car.a), y: Math.sin(car.a) }, r = { x: -Math.sin(car.a), y: Math.cos(car.a) }; return [car.x - f.x * 5.6 - r.x * 7.6, car.y - f.y * 5.6 - r.y * 7.6, 1.13, car.x + f.x * 300, car.y + f.y * 300, 1.0]; };
    shot(inside, inside, 3.2, 0);
    await wait(Math.max(0, T1 - 3.2 - .2));
    phase = 2; ct = 0; stopSpeech();
    try { if (actx) { audioBus(); const t = actx.currentTime; nb(t, .3, 'lowpass', 900, 1, .8, .1, 0, .5); } } catch (e) {}
    await wait(.65);
    crashFx(14, car.x, car.y); camShake = .6; fadeTo(1, 0.05);
    try { if (actx) { const o = actx.createOscillator(), g = actx.createGain(); o.frequency.value = 3800; o.type = 'sine'; g.gain.setValueAtTime(.05, actx.currentTime); g.gain.exponentialRampToValueAtTime(.0005, actx.currentTime + 5); o.connect(g); g.connect(master || actx.destination); o.start(); o.stop(actx.currentTime + 5); } } catch (e) {}
    phase = 3; cine.tick = null; car.v = 0; car.x = 440; car.y = 1362; car.a = -Math.PI / 2 + .55;
    await wait(2.4);
    P.x = 372; P.y = 1440; collide(P); yaw = -Math.PI / 2 - .3; pitch = .25;
    shot([P.x, P.y, .5, P.x + 60, P.y - 120, 1.2], [P.x, P.y, EYE, P.x + Math.cos(yaw) * 100, P.y + Math.sin(yaw) * 100, EYE + .1], 3);
    fadeTo(0, 2.4); await wait(3);
    await vm;
  });
  if (z0) { z0.x = 334; z0.y = 1300; z0.pause = false; z0.wt = 0; z0.stag = 2.5; z0.state = 'chase'; }
  pitch = 0;
  toast('Kill it. Aim for the head.');
  setTimeout(() => { if (story.i === 0) { toast("A light is flashing in a window on Hollow Road."); objFlash = 4; } }, 6000);
}
// ---- Eli ----
async function cutEli() {
  const e = npc('ELI'), d = houseDoor('h4', 32), o = houseDoor('h4', 120);
  await runCut(async () => {
    P.x = o.x; P.y = o.y; yaw = Math.atan2(d.y - o.y, d.x - o.x);
    if (e) { e.x = d.x - Math.cos(d.a) * 40; e.y = d.y - Math.sin(d.a) * 40; e.a = d.a; }
    shot(camPlayer({ x: d.x, y: d.y, h: 1.55 }), camPlayer({ x: d.x, y: d.y, h: 1.5 }, 1.68), 3);
    if (e) { e.force = 'Aim'; walkTo(e, d.x, d.y, 60); }
    await wait(1.2);
    await say('ELI', "Whoa, whoa! Don't shoot! You're not one of them. You're... talking. Okay. Okay.");
    if (e) { e.force = 'Talk'; e.a = Math.atan2(P.y - e.y, P.x - e.x); }
    shot(camAt(e, 1.6, .35), camAt(e, 1.35, .25), 6);
    await say('ELI', "I'm Eli. I fix cars at Marsh Auto. Fixed. I saw your crash from the window. That was a really bad crash.");
    const bgl = { mechanic: "Wait, you're a mechanic? Thank God. Somebody who knows what a starter motor is.", paramedic: "You're a paramedic? Good. Stay close. I'm bad with blood. Which is a problem now.", excop: "You're a cop? Were. Okay. Just... please don't arrest me. I took the batteries from the hardware store.", hunter: "You can track? Good. They hunt by sound. Out there, quiet keeps you alive." };
    await say('ELI', bgl[bgKey] || bgl.mechanic);
    if (e) e.force = 'Idle';
    const c = await choose(["I'm looking for my sibling. Sam. Sam works for Halden.", 'I need a car. Now.']);
    await say('YOU', c === 0 ? "I'm looking for my sibling. Sam. Sam works for Halden." : 'I need a car. Now.');
    if (e) e.force = 'Talk';
    shot(camAt(e, 2.2, -.5, 1.6), camAt(e, 2.0, -.4, 1.6), 9);
    if (c === 0) await say('ELI', "Halden? The lab up north? Their trucks came through every night. Nobody who went near that checkpoint came back.");
    else await say('ELI', "Yeah. Everybody does. Most of them are stalled with the doors open and something eating the driver.");
    await say('ELI', "The cordon's east, at Checkpoint Bravo. There's a sedan by the highway. If we get it running, I'm coming with you. Anything's better than this house.");
    if (e) e.force = null;
  }, d);
  joinParty('ELI'); setStage(1);
}
// ---- Reyes ----
async function cutReyes() {
  if (driving) { driving.v = 0; exitCar(); }
  const r = npc('REY'); const spot = { x: 2600, y: 745 };
  await runCut(async () => {
    const pp = { x: 2560, y: 840 }; P.x = pp.x; P.y = pp.y; yaw = Math.atan2(spot.y - pp.y, spot.x - pp.x);
    restoreParty(); const e = npc('ELI'); if (e) { e.x = pp.x - 40; e.y = pp.y + 35; e.a = yaw; }
    if (r) { r.x = spot.x + 30; r.y = spot.y - 20; r.a = Math.atan2(pp.y - r.y, pp.x - r.x); r.force = 'Aim'; }
    shot(camPlayer({ x: r.x, y: r.y, h: 1.5 }), camPlayer({ x: r.x, y: r.y, h: 1.55 }, 1.7), 4);
    await wait(.8);
    await say('REY', 'Hands where I can see them. ...You drove in? Into the cordon? Hell of a time for a road trip.');
    r.force = 'Talk';
    shot(camAt(r, 1.7, .4), camAt(r, 1.45, .3), 8);
    await say('REY', 'Sergeant Luis Reyes. Used to be Cordon. They ordered us to fire on anyone crossing the line. Sick or not. I said no.');
    if (e) { e.force = 'Talk'; shot(camAt(e, 1.5, .3), camAt(e, 1.4, .2), 3); }
    await say('ELI', 'So you are a deserter.');
    shot(camAt(r, 1.5, -.3), camAt(r, 1.4, -.2), 4); if (e) e.force = null;
    await say('REY', "I'm a conscience. Different paperwork.");
    r.force = 'Idle';
    const c = await choose(['My sibling worked at Halden. Station Nine.', 'Come with us. We could use the rifle.']);
    await say('YOU', c === 0 ? 'My sibling worked at Halden. Station Nine.' : 'Come with us. We could use the rifle.');
    r.force = 'Talk';
    if (c === 0) await say('REY', "Halden. Their convoys came through here every night. Biological samples, the manifest said. Loaded going north. Empty coming back.");
    else await say('REY', "The rifle comes with me attached. I'll think about it.");
    shot(camAt(r, 3.2, -.9, 1.7), camAt(r, 3.6, -1.1, 1.9), 5);
    try { groan(500, 0); groan(600, 2); } catch (er) {}
    r.force = 'Aim';
    await say('REY', "Hear that? The generator draws them. Here they come. Hold this line with me for sixty seconds, then we roll.");
    r.force = null;
  }, spot);
  joinParty('REY'); setStage(3);
  horde(13, 2620, 820, .2);
  story.timer = { t: 60, label: 'HOLD THE CHECKPOINT', cb: async () => { setStage(4); await convo([['REY', "That's the last of them. Alright. I'm with you."], ['REY', "Greywater Clinic is just south. If anyone knows where your sibling went, it's the nurse who stayed."]]); } };
}
// ---- June ----
async function cutJune() {
  const j = npc('JUN'), d = houseDoor('clinic', 28), o = houseDoor('clinic', 110);
  await runCut(async () => {
    P.x = o.x; P.y = o.y; yaw = Math.atan2(d.y - o.y, d.x - o.x); restoreParty();
    if (j) { j.x = d.x - Math.cos(d.a) * 40; j.y = d.y - Math.sin(d.a) * 40; j.a = d.a; j.force = 'Aim'; }
    shot(camPlayer({ x: d.x, y: d.y, h: 1.5 }), camPlayer({ x: d.x, y: d.y, h: 1.5 }, 1.68), 3);
    walkTo(j, d.x, d.y, 55); await wait(1);
    await say('JUN', 'Stop right there. Are any of you bitten? Show me your hands. All of you.');
    j.force = 'Talk'; j.a = Math.atan2(P.y - j.y, P.x - j.x);
    shot(camAt(j, 1.5, .35), camAt(j, 1.3, .25), 7);
    await say('JUN', "Okay. I'm June. June Park. I'm a nurse. When they evacuated the staff, I stayed. Someone had to.");
    j.force = 'Idle';
    const c = await choose(["I'm looking for Sam. A Halden tech.", 'Why did you stay?']);
    await say('YOU', c === 0 ? "I'm looking for Sam. A Halden tech." : 'Why did you stay?');
    j.force = 'Talk';
    if (c === 1) await say('JUN', 'Two hundred patients and forty beds. You do not get to leave that. Even when the patients stop being patients.');
    await say('JUN', "Sam was here three days ago. Brought me water filters. Asked me to hold onto something for family. You have Sam's eyes.");
    shot(camAt(j, 2.4, -.6, 1.6), camAt(j, 2.2, -.5, 1.6), 8);
    await say('JUN', "Sam's badge, and a note. Sam said if family came, go to Dara at the Harbor Union.");
    const r = npc('REY'); if (r) { r.force = 'Talk'; shot(camAt(r, 1.6, .3), camAt(r, 1.5, .2), 4); }
    await say('REY', 'Dara Okoye. Runs the docks. Tough as the pilings.');
    if (r) r.force = null;
    shot(camAt(j, 1.5, .2), camAt(j, 1.4, .15), 4);
    await say('JUN', "I'm coming with you. You are going to need someone who can stitch.");
    j.force = null;
  }, d);
  joinParty('JUN'); setStage(5);
  const b = notes.find(n => n.id === 'badge'); if (b) setTimeout(() => { if (state === 'play') readNote(b); }, 400);
}
// ---- Dara ----
async function cutDara1() {
  const da = npc('DAR'), d = houseDoor('warehouse', 24), o = houseDoor('warehouse', 120);
  await runCut(async () => {
    P.x = o.x; P.y = o.y; yaw = Math.atan2(d.y - o.y, d.x - o.x); restoreParty();
    if (da) { da.x = d.x; da.y = d.y; da.a = Math.atan2(P.y - da.y, P.x - da.x); da.force = 'Idle'; }
    shot(camPlayer({ x: d.x, y: d.y, h: 1.5 }), camPlayer({ x: d.x, y: d.y, h: 1.55 }, 1.7), 3);
    await say('DAR', "That's far enough. Reyes? Luis Reyes, in my harbor? Last time I saw you, you had a rifle pointed at my boats.");
    const r = npc('REY'); if (r) { r.force = 'Talk'; shot(camAt(r, 1.5, .3), camAt(r, 1.4, .2), 3); }
    await say('REY', 'Orders, Dara. I stopped taking them.');
    if (r) r.force = null; da.force = 'Talk';
    shot(camAt(da, 1.6, .4), camAt(da, 1.4, .3), 10);
    await say('DAR', "And you must be Sam's sibling. Same stubborn face. Sam came through here. Swore they'd bring proof. Halden's dosing records. Proof the water was poisoned on purpose.");
    await say('DAR', "With that proof, we broadcast from the lighthouse to every network on the coast. But my transmitter is dead. The crystal cracked.");
    da.force = 'Idle';
    const c = await choose(['Where do I find a new one?', 'Why should I trust you?']);
    await say('YOU', c === 0 ? 'Where do I find a new one?' : 'Why should I trust you?');
    da.force = 'Talk';
    if (c === 1) await say('DAR', "Because I'm the only one here who wants everybody to know what happened. Hart wants it quiet. Halden wants it buried.");
    shot(camAt(da, 2.6, -.6, 1.65), camAt(da, 2.3, -.5, 1.65), 8);
    await say('DAR', "KCLD Radio, up in Pine Ridge. Their broadcast room will have a spare. It's a long drive east. Bring it back and the Union is yours.");
    da.force = null;
  }, d);
  setStage(6);
}
async function cutRadio() {
  if (driving) { driving.v = 0; exitCar(); }
  await runCut(async () => {
    restoreParty();
    shot([KCLD.x - 300, KCLD.y + 260, 3, KCLD.x, KCLD.y, 14], [KCLD.x - 220, KCLD.y + 200, 2, KCLD.x, KCLD.y, 22], 5);
    radioCrackle(.8); await wait(.6);
    story.crystal = true; toast('Picked up: transmitter crystal');
    await say('HART', "Unidentified party at KCLD. This is Colonel Hart. We know who you are, and we know what Sam took. Bring the drive to the dock at Station Nine and I'll put you and Sam on the last boat out.");
    radioCrackle(.5);
    await say('VOS', "Colonel, you are on an open channel. This is Dr. Ines Voss, Halden Biomedical. Your sibling is ill. Exposed. I have the only treatment. Bring me the drive and Sam lives. That is not a threat. It is chemistry.");
    radioCrackle(.3);
    const r = npc('REY'), j = npc('JUN'), e = npc('ELI');
    if (r) { r.force = 'Talk'; shot(camAt(r, 1.7, .4), camAt(r, 1.5, .3), 3); await say('REY', "That's the woman who signed the order."); r.force = null; }
    if (j) { j.force = 'Talk'; shot(camAt(j, 1.6, -.3), camAt(j, 1.5, -.2), 3); await say('JUN', "She might not be lying. About the treatment."); j.force = null; }
    if (e) { e.force = 'Talk'; shot(camAt(e, 1.6, .3), camAt(e, 1.5, .2), 3); await say('ELI', "Great. Everybody's lying except the zombies."); e.force = null; }
  }, KCLD);
  setStage(7); horde(12, KCLD.x, KCLD.y, .3);
}
async function cutDara2() {
  const da = npc('DAR'), d = houseDoor('warehouse', 24), o = houseDoor('warehouse', 120);
  await runCut(async () => {
    P.x = o.x; P.y = o.y; yaw = Math.atan2(d.y - o.y, d.x - o.x); restoreParty();
    da.x = d.x; da.y = d.y; da.a = Math.atan2(P.y - da.y, P.x - da.x); da.force = 'Talk';
    shot(camAt(da, 1.7, .4), camAt(da, 1.45, .3), 9);
    await say('DAR', "You actually did it. With this, the lighthouse can talk to the whole coast.");
    await say('DAR', "All we need now is what Sam took. Station Nine, up in the north-east hills. Sam's badge will open the gate. Halden's men wear gray vests. They shoot first.");
    da.force = 'Idle';
    const c = await choose(["When I have it, it comes to you.", "I'll decide what happens to it."]);
    await say('YOU', c === 0 ? 'When I have it, it comes to you.' : "I'll decide what happens to it.");
    da.force = 'Talk'; await say('DAR', c === 0 ? "Then the truth has a chance. Go." : "Fair. Just remember who poisoned the water."); da.force = null;
  }, d);
  story.daraTrust = 1; setStage(8);
}
async function cutGate() {
  if (driving) { driving.v = 0; exitCar(); }
  await runCut(async () => {
    restoreParty();
    shot([3900, 760, 2.5, 4100, 450, 4], [3930, 700, 2.2, 4250, 420, 5], 6);
    const r = npc('REY'); if (r) { r.force = 'Talk'; }
    await say('REY', "Station Nine. Halden private security. Stay low. Sam's badge should open the inner gate.");
    const e = npc('ELI'); if (e) { e.force = 'Talk'; if (r) r.force = null; shot(camAt(e, 1.6, .3), camAt(e, 1.5, .2), 3); await say('ELI', 'Lights are still on. Who keeps the lights on during an apocalypse?'); e.force = null; }
    const j = npc('JUN'); if (j) { j.force = 'Talk'; shot(camAt(j, 1.6, -.3), camAt(j, 1.5, -.2), 3); await say('JUN', 'People who never meant to leave.'); j.force = null; }
  }, { x: 3960, y: 665, r: 400 });
  setStage(9); horde(8, 4300, 600, .4);
}
async function cutDrive() {
  await runCut(async () => {
    const dn = notes.find(n => n.id === 'drive');
    shot([dn.x - 40, dn.y + 30, 1.3, dn.x, dn.y, .6], [dn.x - 30, dn.y + 20, 1.1, dn.x, dn.y, .5], 9);
    await say('SAM', "If you're hearing this, you found it. I'm sorry. I should never have called you. I'm at the dock, by the beacon. Wait for me. Please.");
    try { if (actx) { audioBus(); for (let i = 0; i < 6; i++) setTimeout(() => beep(i % 2 ? 620 : 880, .35, 'square', .05), i * 420); } } catch (e) {}
    radioCrackle(.8);
    await say('HART', 'All units, all units. Operation Whitecap is a go. Ignition in three minutes. Clear the corridor.');
    const r = npc('REY'); if (r) { r.force = 'Talk'; shot(camAt(r, 1.6, .3), camAt(r, 1.5, .2), 3); await say('REY', "Whitecap's the firebombing. Three minutes. Move!"); r.force = null; }
  });
  setStage(10); horde(10, P.x, P.y, .5);
  story.timer = { t: 180, label: 'OPERATION WHITECAP', cb: () => end(false, 'whitecap') };
}
async function cutFinale() {
  story.timer = null;
  if (driving) { driving.v = 0; exitCar(); }
  const ex = EVAC;
  for (const ch of ['SAM', 'VOS']) if (!npc(ch)) spawnNPC(ch, ex.x + 60, ex.y, Math.PI, null);
  const s = npc('SAM'), v = npc('VOS'), da = npc('DAR');
  await runCut(async () => {
    P.x = ex.x - 120; P.y = ex.y + 10; collide(P); yaw = 0; restoreParty();
    s.x = ex.x + 90; s.y = ex.y; s.a = Math.PI; s.mode = 'script';
    v.x = ex.x + 40; v.y = ex.y + 90; v.a = Math.atan2(P.y - v.y, P.x - v.x); v.mode = 'script';
    if (da) { da.x = ex.x + 30; da.y = ex.y - 90; da.a = Math.atan2(P.y - da.y, P.x - da.x); da.mode = 'script'; }
    shot([ex.x - 200, ex.y + 160, 3, ex.x + 60, ex.y, 1.4], [ex.x - 160, ex.y + 100, 2.2, ex.x + 60, ex.y, 1.4], 4);
    walkTo(s, ex.x - 50, ex.y, 110); await wait(1.5);
    s.force = 'Talk'; s.a = Math.PI; shot(camAt(s, 1.5, .3), camAt(s, 1.3, .2), 9);
    await say('SAM', "You came. Of course you came. I told you not to. You never listen. I missed that.");
    await say('SAM', "Everyone wants the drive. And they're all here.");
    v.force = 'Talk'; s.force = 'Idle'; shot(camAt(v, 1.8, .4), camAt(v, 1.6, .3), 8);
    await say('VOS', "Give me the drive and I give Sam the treatment. Tonight. The rest of this was never going to be fixed by a radio broadcast.");
    v.force = 'Idle';
    if (da) { da.force = 'Talk'; shot(camAt(da, 1.8, -.4), camAt(da, 1.6, -.3), 8); await say('DAR', "Give it to the Union. We broadcast from the lighthouse. Every network, every coast. They don't get to bury this."); da.force = 'Idle'; }
    radioCrackle(.6); shot([ex.x - 200, ex.y + 160, 4, ex.x, ex.y, 1.4], [ex.x - 230, ex.y + 200, 5, ex.x, ex.y, 1.4], 7);
    await say('HART', "Last boat leaves in ninety seconds. Hand the drive to my people on the dock and everyone here gets a seat. Halden's dealt with later. Quietly.");
    const r = npc('REY'); if (r) { r.force = 'Talk'; shot(camAt(r, 1.6, .3), camAt(r, 1.4, .2), 3); await say('REY', "Your call. I'll stand with you either way."); r.force = null; }
    s.force = 'Idle'; shot(camAt(s, 1.6, -.2), camAt(s, 1.5, -.15), 30);
    setStage(11);
    const c = await choose(['Give it to Colonel Hart. Order. Everyone gets out.', 'Give it to Dara. The truth, whatever it costs.', "Give it to Voss. Sam's cure, and silence."]);
    story.ending = ['cordon', 'union', 'halden'][c];
    const lines = [["YOU", "Hart gets it. We all get out."], ['YOU', 'Dara. Broadcast everything.'], ['YOU', 'Voss. Save Sam.']][c];
    await say(lines[0], lines[1]);
    s.force = 'Talk';
    await say('SAM', ['Okay. Okay. Let us go home.', "Then let's make it count.", "...Thank you. I'm sorry it had to be this."][c]);
    await fadeTo(1, 2.5);
  });
  end(true, story.ending);
}

/* ---------- KCLD prop ---------- */
function pickKCLD() {
  let best = null;
  for (let r = 0; r < 900 && !best; r += 40) for (let a = 0; a < 6.28 && !best; a += .5) {
    const x = 11760 + Math.cos(a) * r, y = 1700 + Math.sin(a) * r;
    if (houses.some(h => x > h.x - 140 && x < h.x + h.w + 140 && y > h.y - 140 && y < h.y + h.h + 140)) continue;
    if (roads.some(rd => x > rd.x - 60 && x < rd.x + rd.w + 60 && y > rd.y - 60 && y < rd.y + rd.h + 60)) continue;
    best = { x, y };
  }
  KCLD = best || { x: 11760, y: 1700 };
  trees = trees.filter(t => t.wreck || Math.hypot(t.x - KCLD.x, t.y - KCLD.y) > 260);
}
function kcldMesh() {
  const g = new THREE.Group(), mm = new THREE.MeshStandardMaterial({ color: 0x8a8f92, roughness: .5, metalness: .7 }), red = new THREE.MeshStandardMaterial({ color: 0xff2020, emissive: 0xff1010, emissiveIntensity: 3 });
  const Hh = 34, legs = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
  for (let i = 0; i < 4; i++) { const [a, b] = legs[i], [c, d] = legs[(i + 1) % 4];
    for (let k = 0; k < 10; k++) { const z0 = k / 10 * Hh, z1 = (k + 1) / 10 * Hh, w0 = 1.6 * (1 - z0 / Hh * .8), w1 = 1.6 * (1 - z1 / Hh * .8);
      const seg = (x0, y0, h0, x1, y1, h1, r) => { const v0 = new THREE.Vector3(x0, h0, y0), v1 = new THREE.Vector3(x1, h1, y1), L = v0.distanceTo(v1), m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, L, 5), mm); m.position.copy(v0).add(v1).multiplyScalar(.5); m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), v1.clone().sub(v0).normalize()); g.add(m); };
      seg(a * w0, b * w0, z0, a * w1, b * w1, z1, .06); seg(a * w0, b * w0, z0, c * w1, d * w1, z1, .025); seg(a * w1, b * w1, z1, c * w1, d * w1, z1, .025);
    } }
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(.25, 10, 8), red); lamp.position.y = Hh + .3; g.add(lamp); g.userData.lamp = lamp;
  const shed = new THREE.Mesh(GEO.box, M.concrete || mm); shed.scale.set(5, 3, 4); shed.position.set(4.5, 1.5, 0); shed.castShadow = shed.receiveShadow = true; g.add(shed);
  try { const sign = new THREE.Mesh(new THREE.PlaneGeometry(3.6, .9), labelMat('KCLD 1340 AM', '#1d2b3a', '#f2e6c0', 512, 128, 64)); sign.position.set(4.5, 2.6, 2.02); g.add(sign); } catch (e) {}
  g.position.set(KCLD.x * S3, 0, KCLD.y * S3); world3.add(g); KCLD.g = g;
  walls.push({ x: KCLD.x + 40, y: KCLD.y - 40, w: 100, h: 80 });
}

/* ---------- title screen, music ---------- */
let music = null;
function startMusic() {
  if (!actx || music) return;
  try {
    audioBus(); const out = actx.createGain(); out.gain.value = 0; out.connect(master); out.gain.linearRampToValueAtTime(.16, actx.currentTime + 4);
    const lp = actx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 700; lp.connect(out);
    const lfo = actx.createOscillator(), lg = actx.createGain(); lfo.frequency.value = .07; lg.gain.value = 300; lfo.connect(lg); lg.connect(lp.frequency); lfo.start();
    const chords = [[45, 52, 57, 60], [41, 48, 53, 57], [43, 50, 55, 59], [40, 47, 52, 55]], oscs = [];
    for (let i = 0; i < 8; i++) { const o = actx.createOscillator(), g = actx.createGain(); o.type = i % 2 ? 'sawtooth' : 'triangle'; o.detune.value = (i % 2 ? 7 : -7); g.gain.value = .05; o.connect(g); g.connect(lp); o.start(); oscs.push(o); }
    let ci = 0; const setCh = () => { const c = chords[ci++ % chords.length], t = actx.currentTime; oscs.forEach((o, i) => o.frequency.setTargetAtTime(440 * Math.pow(2, (c[i % 4] - (i < 4 ? 69 : 57)) / 12), t, 1.2)); };
    setCh(); const iv = setInterval(setCh, 9000);
    const bell = setInterval(() => { if (!music) return; const t = actx.currentTime, o = actx.createOscillator(), g = actx.createGain(); o.type = 'sine'; o.frequency.value = 440 * Math.pow(2, (pick([69, 72, 74, 76, 79, 81]) - 69) / 12); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(.05, t + .02); g.gain.exponentialRampToValueAtTime(.0005, t + 4); o.connect(g); g.connect(out); g.connect(verbSend); o.start(t); o.stop(t + 4.2); }, 2600);
    music = { out, stop() { const t = actx.currentTime; out.gain.cancelScheduledValues(t); out.gain.setValueAtTime(out.gain.value, t); out.gain.linearRampToValueAtTime(0, t + 2.5); clearInterval(iv); clearInterval(bell); setTimeout(() => { oscs.forEach(o => { try { o.stop(); } catch (e) {} }); lfo.stop(); }, 2700); } };
  } catch (e) {}
}
function stopMusic() { if (music) { music.stop(); music = null; } }
let titleMode = 'press', titleShot = 0, titleT = 0, attractBuilt = false;
const TSHOTS = [
  [[2050, 2650, 9, 2290, 2745, 6], [2120, 2560, 8, 2290, 2745, 7]],
  [[330, 2300, 3.2, 330, 1300, 1.5], [330, 1900, 3.0, 330, 900, 1.6]],
  [[2480, 1150, 6, 2800, 900, 2], [2560, 1080, 5, 3100, 860, 2]],
  [[600, 2420, 14, 900, 2150, 1], [760, 2380, 12, 1100, 2150, 1]],
  [[4000, 1250, 18, 4400, 500, 4], [4150, 1200, 15, 4400, 450, 4]]
];
function titleTick(dt) {
  if (!attractBuilt) return;
  titleT += dt;
  if (!cine || !cine.shot || titleT > 13) { titleT = 0; const s = TSHOTS[titleShot++ % TSHOTS.length]; if (!cine) cine = { waits: [], shot: null, skip: false, title: true }; cine.shot = { a: s[0], b: s[1], dur: 13, t: 0, ease: 0 }; fadeTo(0, 1.5); }
  if (titleT > 11.6 && fadeEl.style.opacity !== '1') fadeTo(1, 1.2);
}
function buildAttract() {
  if (attractBuilt || !(assetsReady.kit && assetsReady.trees && assetsReady.car)) return;
  attractBuilt = true; newGame('mechanic', true);
}
function refreshTitle() { if (state === 'boot' || state === 'title') renderTitle(); }
function renderTitle() {
  const ready = assetsReady.kit && assetsReady.trees && assetsReady.car && assetsReady.people;
  const nRdy = ['kit', 'trees', 'car', 'people'].filter(k => assetsReady[k]).length;
  let h = '<div class="vg"></div><div class="logo"><h1>COLD<span>SHORE</span></h1><div class="tag">Calder County is quarantined. Your sibling is still inside.</div></div>';
  if (titleMode === 'press') h += '<div class="press">PRESS ANY KEY</div>';
  else if (titleMode === 'main') {
    h += '<div class="menu">' + [['new', 'New Game', !ready], ['controls', 'Controls'], ['settings', 'Settings'], ['credits', 'Credits']].map(([k, t, dis]) => '<a data-m="' + k + '" class="' + (dis ? 'dis' : '') + '">' + t + '</a>').join('') + '</div>';
    if (!ready) h += '<div class="foot">Loading assets ' + nRdy + '/4&hellip;</div>';
  } else if (titleMode === 'bg') {
    h += '<div class="panel"><h3>Who were you before?</h3><div class="bgs">' + BGKEYS.map((k, i) => { const b = BGS[k]; return '<div class="bgc" data-k="' + k + '"><b>' + (i + 1) + '. ' + b.name + '</b><small>' + b.desc + '</small><div class="st">' + ({ mechanic: 'HOTWIRE ++  FUEL USE -20%', paramedic: 'HEALING ++  BANDAGES +', excop: 'FIREARMS ++  AMMO +', hunter: 'STEALTH ++  FORAGE +' }[k] || '') + '</div></div>'; }).join('') + '</div><div class="btns"><span class="btn" data-m="back">Back</span></div></div>';
  } else if (titleMode === 'controls') {
    h += '<div class="panel"><h3>Controls</h3><table>' + [['WASD', 'Move'], ['Shift', 'Sprint (louder)'], ['Mouse', 'Look  /  click to shoot'], ['R', 'Reload'], ['E', 'Interact, hotwire (hold), enter or exit car, help a downed friend (hold)'], ['V', 'Shove'], ['F', 'Flashlight'], ['1 / 2', 'Craft bandage / ammo'], ['H', 'Use bandage'], ['M', 'County map'], ['J', 'Journal'], ['Space', 'Handbrake'], ['Enter', 'Skip cutscene'], ['Esc', 'Pause']].map(r => '<tr><td>' + r[0] + '</td><td>' + r[1] + '</td></tr>').join('') + '</table><div class="btns"><span class="btn" data-m="back">Back</span></div></div>';
  } else if (titleMode === 'settings') {
    h += '<div class="panel"><h3>Settings</h3><table><tr><td>Graphics</td><td>' + ['Low', 'Medium', 'High'].map((q, i) => '<span class="btn" data-q="' + i + '" style="padding:4px 12px;margin-right:6px;' + (quality === i ? 'border-color:#9fd6e6' : '') + '">' + q + '</span>').join('') + '</td></tr><tr><td>Voices</td><td><span class="btn" data-v="1" style="padding:4px 12px">' + (voicesOn ? 'On' : 'Off') + '</span> ' + (ttsOk ? '' : '<small>(no speech voices on this device: subtitles only)</small>') + '</td></tr></table><div class="btns"><span class="btn" data-m="back">Back</span></div></div>';
  } else if (titleMode === 'credits') {
    h += '<div class="panel"><h3>Credits</h3><p>ColdShore prototype. Characters, zombies, vehicles, buildings, trees and animation built procedurally in Blender. Engine: three.js. Voices: your browser&#39;s speech engine.</p><div class="btns"><span class="btn" data-m="back">Back</span></div></div>';
  }
  h += '<div class="foot" style="bottom:3vh;left:3vw;right:auto;text-align:left">PROTOTYPE BUILD 20</div>';
  titleEl.innerHTML = h; titleEl.classList.add('on');
  titleEl.querySelectorAll('[data-m]').forEach(a => a.onclick = () => titleAction(a.dataset.m));
  titleEl.querySelectorAll('[data-k]').forEach(a => a.onclick = () => startGame(a.dataset.k));
  titleEl.querySelectorAll('[data-q]').forEach(a => a.onclick = () => { setQuality(+a.dataset.q); renderTitle(); });
  titleEl.querySelectorAll('[data-v]').forEach(a => a.onclick = () => { voicesOn = !voicesOn; renderTitle(); });
}
function titleAction(m) { beep(520, .04, 'triangle', .03); if (m === 'new') titleMode = 'bg'; else if (m === 'back') titleMode = 'main'; else titleMode = m; renderTitle(); }
function showTitle() {
  state = attractBuilt ? 'title' : 'boot'; ov.classList.add('hide'); endEl.classList.remove('on'); pauseEl.classList.remove('on');
  try { document.exitPointerLock(); } catch (e) {}
  titleMode = actx ? 'main' : 'press'; renderTitle(); fadeTo(0, 1);
  if (actx) startMusic(); buildAttract();
}
async function startGame(k) {
  if (!(assetsReady.kit && assetsReady.trees && assetsReady.car && assetsReady.people)) return;
  beep(700, .08, 'triangle', .04); stopMusic();
  await new Promise(r => { fadeTo(1, .8); setTimeout(r, 850); });
  titleEl.classList.remove('on'); cine = null;
  initAudio(); newGame(k, false);
  lock();
  runIntro();
}
setInterval(() => { if (state === 'boot' || state === 'title') { buildAttract(); if (titleMode === 'main') { const ready = assetsReady.kit && assetsReady.trees && assetsReady.car && assetsReady.people; const btn = titleEl.querySelector('[data-m=new]'); if (btn && ready === btn.classList.contains('dis')) renderTitle(); } } }, 600);
function titleKey(e) {
  if (titleMode === 'press') { initAudio(); startMusic(); titleMode = 'main'; renderTitle(); return; }
  if (titleMode === 'bg') { const i = parseInt(e.key, 10); if (i >= 1 && i <= BGKEYS.length) startGame(BGKEYS[i - 1]); if (e.code === 'Escape' || e.code === 'Backspace') titleAction('back'); return; }
  if (titleMode !== 'main' && (e.code === 'Escape' || e.code === 'Backspace')) titleAction('back');
  if (titleMode === 'main' && e.code === 'Enter') titleAction('new');
}
addEventListener('mousedown', () => { if ((state === 'boot' || state === 'title') && titleMode === 'press') { initAudio(); startMusic(); titleMode = 'main'; renderTitle(); } });

/* ---------- pause & map ---------- */
let mapOpen = false;
function renderPause() {
  const o = objTarget();
  pauseEl.innerHTML = '<div class="in"><h2>PAUSED</h2>' + (o ? '<div class="obj">' + esc(o.text) + '</div>' : '') +
    '<a data-p="resume">Resume</a><a data-p="map">County map</a><a data-p="journal">Journal</a><a data-p="q">Graphics: ' + ['Low', 'Medium', 'High'][quality] + '</a><a data-p="v">Voices: ' + (voicesOn ? 'On' : 'Off') + '</a><a data-p="quit">Quit to title</a>' +
    '<div class="sk">' + BG.name.toUpperCase() + ' &nbsp; Firearms ' + Math.floor(S.firearms) + ' &middot; Hotwire ' + Math.floor(S.hotwire) + ' &middot; Medic ' + Math.floor(S.medic) + ' &middot; Forage ' + Math.floor(S.forage) + '<br>Kills ' + kills + ' &middot; Notes ' + readIds.size + '/' + notes.length + ' &middot; Party: ' + (story.party.map(c => CAST[c].name).join(', ') || 'none') + '</div></div>';
  pauseEl.querySelectorAll('[data-p]').forEach(a => a.onclick = ev => {
    ev.stopPropagation(); const p = a.dataset.p;
    if (p === 'resume') { pauseEl.classList.remove('on'); lock(); }
    if (p === 'map') { pauseEl.classList.remove('on'); mapOpen = true; }
    if (p === 'journal') { pauseEl.classList.remove('on'); openJournal(); }
    if (p === 'q') { setQuality((quality + 1) % 3); renderPause(); }
    if (p === 'v') { voicesOn = !voicesOn; if (!voicesOn) stopSpeech(); renderPause(); }
    if (p === 'quit') { stopSpeech(); showTitle(); }
  });
}
function pauseTick() {
  const want = state === 'play' && wasLocked && !locked && !lockFailed && !reading && !mapOpen;
  if (want && !pauseEl.classList.contains('on')) { renderPause(); pauseEl.classList.add('on'); }
  if (!want && pauseEl.classList.contains('on')) pauseEl.classList.remove('on');
}
function drawBigMap() {
  const pad = 40, k = Math.min((VW - pad * 2) / W, (VH - pad * 2) / H), ox = (VW - W * k) / 2, oy = (VH - H * k) / 2;
  ctx.fillStyle = 'rgba(4,7,8,.94)'; ctx.fillRect(0, 0, VW, VH);
  ctx.fillStyle = '#1b2b22'; ctx.fillRect(ox, oy, W * k, H * k);
  ctx.fillStyle = '#0f2230'; ctx.fillRect(ox, oy + HL * k, BAYX * k, (H - HL) * k);
  ctx.fillStyle = '#3a3d40'; roads.forEach(r => ctx.fillRect(ox + r.x * k, oy + r.y * k, Math.max(1.5, r.w * k), Math.max(1.5, r.h * k)));
  ctx.fillStyle = '#7a6f62'; houses.forEach(h => ctx.fillRect(ox + h.x * k, oy + h.y * k, Math.max(1, h.w * k), Math.max(1, h.h * k)));
  ctx.font = '600 12px Segoe UI,Roboto,Arial,sans-serif'; ctx.textAlign = 'center'; ctx.fillStyle = 'rgba(235,225,190,.9)';
  TOWNS.forEach(t => ctx.fillText(t.n, ox + t.x * k, oy + t.y * k - 10));
  [['MAPLE HOLLOW', 900, 700], ['GREYWATER', 3100, 500], ['HARBOR ROW', 1300, 1750], ['STATION NINE', 4350, 230], ['CHECKPOINT BRAVO', 2620, 740], ['KCLD RADIO', KCLD ? KCLD.x : 0, KCLD ? KCLD.y - 120 : 0]].forEach(l => ctx.fillText(l[0], ox + l[1] * k, oy + l[2] * k));
  cars.forEach(c => { ctx.fillStyle = c.state === 'ready' && c.hp > 0 ? '#6fd3b0' : '#5a6a66'; ctx.fillRect(ox + c.x * k - 2, oy + c.y * k - 2, 4, 4); });
  const o = objTarget(); if (o) { ctx.strokeStyle = '#e9c46a'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(ox + o.x * k, oy + o.y * k, 8 + Math.sin(performance.now() / 200) * 2, 0, 6.283); ctx.stroke(); ctx.fillStyle = '#e9c46a'; ctx.fillText(o.text, ox + o.x * k, oy + o.y * k + 24); }
  npcs.forEach(n => { if (!n.party) return; ctx.fillStyle = CAST[n.ch].col; ctx.beginPath(); ctx.arc(ox + n.x * k, oy + n.y * k, 3, 0, 6.283); ctx.fill(); });
  ctx.save(); ctx.translate(ox + P.x * k, oy + P.y * k); ctx.rotate(driving ? driving.a : yaw); ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.moveTo(9, 0); ctx.lineTo(-5, -5); ctx.lineTo(-5, 5); ctx.closePath(); ctx.fill(); ctx.restore();
  ctx.textAlign = 'left'; ctx.fillStyle = '#dfe6e3'; ctx.font = '300 22px Segoe UI,Roboto,Arial,sans-serif'; ctx.fillText('CALDER COUNTY', ox + 12, oy + 30);
  ctx.font = '12px ui-monospace,monospace'; ctx.fillStyle = '#8b9a96'; ctx.fillText('[M] close', ox + 12, oy + 50);
}

/* ---------- HUD v2 ---------- */
const _pv = new THREE.Vector3();
function rrect(x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
function font(sz, wt) { ctx.font = (wt || 400) + ' ' + sz + 'px "Segoe UI",Roboto,Helvetica,Arial,sans-serif'; }
function drawHUD2() {
  const o = objTarget();
  // objective panel
  if (o) {
    const x = 22, y = 20, w = Math.min(430, VW * .4);
    const g = ctx.createLinearGradient(x, 0, x + w, 0); g.addColorStop(0, 'rgba(0,0,0,.55)'); g.addColorStop(1, 'rgba(0,0,0,0)'); ctx.fillStyle = g; ctx.fillRect(x, y, w, 52);
    ctx.fillStyle = objFlash > 0 ? '#ffe08a' : '#e9c46a'; ctx.fillRect(x, y, 3, 52);
    font(10, 700); ctx.textAlign = 'left'; ctx.fillStyle = objFlash > 0 && Math.sin(objFlash * 10) > 0 ? '#fff' : '#e9c46a'; ctx.fillText(objFlash > 0 ? 'NEW OBJECTIVE' : 'OBJECTIVE', x + 14, y + 17);
    font(14, 500); ctx.fillStyle = '#f1f1ec'; ctx.fillText(o.text.length > 64 ? o.text.slice(0, 62) + '…' : o.text, x + 14, y + 37);
    font(11, 400); ctx.fillStyle = '#a9b4b0'; ctx.fillText(Math.round(dist(P, o) * S3) + ' m', x + 14, y + 51 + 0);
  }
  // timer
  if (story.timer) { const t = Math.max(0, story.timer.t), m = Math.floor(t / 60), s = String(Math.floor(t % 60)).padStart(2, '0'); font(11, 700); ctx.textAlign = 'center'; ctx.fillStyle = '#ff8f80'; ctx.fillText(story.timer.label, VW / 2, 74); font(30, 300); ctx.fillStyle = t < 20 ? '#ff5c4a' : '#fff'; ctx.fillText(m + ':' + s, VW / 2, 104); }
  // compass
  const cw = Math.min(520, VW * .42), cx0 = VW / 2 - cw / 2, cy0 = 18;
  camera.getWorldDirection(_pv); const head = Math.atan2(_pv.z, _pv.x), FOVc = 1.9;
  const cg = ctx.createLinearGradient(cx0, 0, cx0 + cw, 0); cg.addColorStop(0, 'rgba(0,0,0,0)'); cg.addColorStop(.15, 'rgba(0,0,0,.45)'); cg.addColorStop(.85, 'rgba(0,0,0,.45)'); cg.addColorStop(1, 'rgba(0,0,0,0)'); ctx.fillStyle = cg; ctx.fillRect(cx0, cy0, cw, 26);
  const cpos = a => { let d = Math.atan2(Math.sin(a - head), Math.cos(a - head)); return Math.abs(d) > FOVc / 2 ? null : VW / 2 + d / (FOVc / 2) * cw / 2; };
  ctx.textAlign = 'center';
  for (let i = 0; i < 24; i++) { const a = i / 24 * 6.2832 - Math.PI / 2, x = cpos(a); if (x === null) continue; const card = i % 6 === 0, lbl = ['N', 'E', 'S', 'W'][i / 6]; const al = 1 - Math.abs(x - VW / 2) / (cw / 2); ctx.globalAlpha = al; if (card) { font(13, 700); ctx.fillStyle = lbl === 'N' ? '#ff7b6b' : '#fff'; ctx.fillText(lbl, x, cy0 + 18); } else { ctx.fillStyle = '#cfd6d3'; ctx.fillRect(x - .5, cy0 + (i % 3 === 0 ? 7 : 10), 1, i % 3 === 0 ? 10 : 6); } }
  ctx.globalAlpha = 1;
  if (o) { const a = Math.atan2(o.y - P.y, o.x - P.x), x = cpos(a); if (x !== null) { ctx.fillStyle = '#e9c46a'; ctx.beginPath(); ctx.moveTo(x, cy0 + 26); ctx.lineTo(x - 5, cy0 + 33); ctx.lineTo(x + 5, cy0 + 33); ctx.fill(); } }
  npcs.forEach(n => { if (!n.party || n.mode === 'car') return; const x = cpos(Math.atan2(n.y - P.y, n.x - P.x)); if (x === null) return; ctx.fillStyle = CAST[n.ch].col; ctx.fillRect(x - 2, cy0 + 1, 4, 4); });
  // world marker
  if (o && !mapOpen) {
    _pv.set(o.x * S3, 2.2, o.y * S3).project(camera);
    let sx = (_pv.x * .5 + .5) * VW, sy = (-_pv.y * .5 + .5) * VH; const behind = _pv.z > 1;
    if (behind) { sx = VW - sx; sy = VH - 60; }
    sx = clamp(sx, 40, VW - 40); sy = clamp(sy, 60, VH - 60);
    const dm = Math.round(dist(P, o) * S3);
    if (dm > 8) { ctx.save(); ctx.translate(sx, sy); ctx.rotate(Math.PI / 4); ctx.strokeStyle = '#e9c46a'; ctx.lineWidth = 2; ctx.strokeRect(-6, -6, 12, 12); ctx.fillStyle = 'rgba(233,196,106,.35)'; ctx.fillRect(-4, -4, 8, 8); ctx.restore(); font(11, 600); ctx.fillStyle = '#f1e2b8'; ctx.textAlign = 'center'; ctx.fillText(dm + ' m', sx, sy + 22); }
  }
  // downed / speaking markers over companions
  for (const n of npcs) {
    if (!n.party || n.mode === 'car') continue;
    _pv.set(n.x * S3, 2.15, n.y * S3).project(camera); if (_pv.z > 1) continue;
    const sx = (_pv.x * .5 + .5) * VW, sy = (-_pv.y * .5 + .5) * VH, d = dist(n, P);
    if (n.mode === 'down') { font(11, 700); ctx.textAlign = 'center'; ctx.fillStyle = '#ff6a5a'; ctx.fillText('DOWN', sx, sy - 6); if (d < 55) { ctx.fillStyle = '#fff'; ctx.fillText('Hold E: help ' + CAST[n.ch].name, sx, sy + 10); bar(sx - 40, sy + 16, 80, 5, n.revive, '#6fd3b0'); } }
    else if (d < 700 && d > 60) { font(10, 600); ctx.textAlign = 'center'; ctx.fillStyle = CAST[n.ch].col; ctx.globalAlpha = .75; ctx.fillText(CAST[n.ch].name.toUpperCase(), sx, sy); ctx.globalAlpha = 1; }
  }
  // health block
  const hx = 22, hy = VH - 64;
  font(10, 700); ctx.textAlign = 'left'; ctx.fillStyle = '#cfd6d3'; ctx.fillText('HEALTH', hx, hy - 6);
  for (let i = 0; i < 10; i++) { const f = clamp(P.hp / 10 - i, 0, 1); ctx.fillStyle = 'rgba(255,255,255,.12)'; ctx.fillRect(hx + i * 23, hy, 20, 8); ctx.fillStyle = P.hp > 35 ? '#e8ece9' : '#ff4b3e'; ctx.fillRect(hx + i * 23, hy, 20 * f, 8); }
  font(11, 400); ctx.fillStyle = '#a9b4b0';
  ctx.fillText('Bandages ' + inv.band + '    Cloth ' + inv.cloth + '    Scrap ' + inv.scrap + '    Fuel ' + inv.fuel, hx, hy + 26);
  font(10, 400); ctx.fillStyle = '#6f7c78'; ctx.fillText('[H] bandage  [1] craft bandage  [2] craft ammo  [M] map  [J] journal', hx, hy + 42);
  // party
  let py = hy - 30;
  for (const n of npcs.filter(q => q.party).reverse()) {
    py -= 30; const C = CAST[n.ch];
    ctx.fillStyle = 'rgba(0,0,0,.4)'; ctx.fillRect(hx, py, 170, 24); ctx.fillStyle = C.col; ctx.fillRect(hx, py, 3, 24);
    font(12, 600); ctx.fillStyle = speaking === n.ch ? '#fff' : '#e3e7e4'; ctx.fillText(C.name.toUpperCase() + (speaking === n.ch ? '  ))' : ''), hx + 10, py + 15);
    font(9, 600); ctx.fillStyle = '#8b9a96'; ctx.textAlign = 'right';
    ctx.fillText(n.mode === 'down' ? 'DOWN' : n.mode === 'car' ? 'IN CAR' : n.healT > 0 ? 'HEALING' : n.target ? 'FIGHTING' : 'FOLLOWING', hx + 164, py + 10);
    ctx.textAlign = 'left'; ctx.fillStyle = 'rgba(255,255,255,.15)'; ctx.fillRect(hx + 100, py + 15, 64, 3); ctx.fillStyle = n.hp > 35 ? C.col : '#ff4b3e'; ctx.fillRect(hx + 100, py + 15, 64 * n.hp / 100, 3);
  }
  // ammo block
  if (!driving) {
    const ax = VW - 24, ay = VH - 34; ctx.textAlign = 'right';
    font(40, 300); ctx.fillStyle = P.mag ? '#f1f1ec' : '#ff5c4a'; ctx.fillText(String(P.mag), ax - 64, ay);
    font(18, 300); ctx.fillStyle = '#a9b4b0'; ctx.fillText('/ ' + P.ammo, ax, ay);
    font(10, 700); ctx.fillStyle = '#8b9a96'; ctx.fillText(P.rl > 0 ? 'RELOADING' : P.mag === 0 && P.ammo === 0 ? 'NO AMMO  -  MELEE' : 'G17  9MM', ax, ay - 42);
  }
  if (noise > 0.3 && !driving) { font(10, 700); ctx.textAlign = 'center'; ctx.fillStyle = '#ff7b6b'; ctx.fillText('YOU ARE LOUD', VW / 2, VH / 2 + 46); }
}
function keycap(msg, y) {
  const m = msg.match(/^(Hold )?([A-Z]):\s*(.*)$/);
  font(14, 500); ctx.textAlign = 'left';
  if (!m) { ctx.textAlign = 'center'; ctx.fillStyle = '#fff'; ctx.fillText(msg, VW / 2, y); return; }
  const label = (m[1] ? 'Hold ' : '') + m[3], tw = ctx.measureText(label).width, w = tw + 40, x = VW / 2 - w / 2;
  ctx.fillStyle = 'rgba(0,0,0,.5)'; rrect(x - 6, y - 18, w + 12, 28, 4); ctx.fill();
  ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; rrect(x, y - 13, 20, 18, 3); ctx.stroke(); font(11, 700); ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.fillText(m[2], x + 10, y + 1);
  font(14, 500); ctx.textAlign = 'left'; ctx.fillText(label, x + 28, y + 1);
}
window.__cs2 = { story: () => story, npcs: () => npcs.map(n => ({ ch: n.ch, x: n.x, y: n.y, mode: n.mode, party: n.party, hp: n.hp, anim: n.m.userData.cur })), setStage: i => setStage(i), runCut: n => ({ eli: cutEli, reyes: cutReyes, june: cutJune, dara: cutDara1, radio: cutRadio, dara2: cutDara2, gate: cutGate, drive: cutDrive, finale: cutFinale, intro: runIntro })[n](), skip: skipCut, tp: (x, y) => { P.x = x; P.y = y; }, join: ch => joinParty(ch), cine: () => !!cine, kcld: () => KCLD, startGame: k => startGame(k), title: () => ({ state, titleMode, attractBuilt }) };
