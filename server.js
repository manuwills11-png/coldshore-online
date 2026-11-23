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

/* ---------------- story: hand-built operations (build 56) ----------------
   No random contracts any more. Twelve operations, written one by one, each built around a thing a squad has to do together:
   cover the one who is working, escort the one who is carrying, split up and act at the same moment, bait the horde away,
   build the choke point before the wave, keep the machine alive, pull a friend off a grabber. Solo players get a fair version of each. */
const OPS = [
  // ---- Chapter 1: Static ----
  { id: 'o1', ch: 1, name: 'First Light', town: 'GREYWATER', site: 'grey', tips: ['Cover the cutter', 'Escort the carrier'],
    brief: "WARDEN: Hello, Haven. You don't know me. I know you. The Greywater clinic still has a vaccine fridge with a live battery. Cut the cage, carry it home. The dead love the hum.",
    done: "WARDEN: You kept the carrier alive. Most groups drop the fridge and run. Interesting.",
    stages: [{ k: 'travel', txt: 'Get to the Greywater clinic' },
      { k: 'crack', secs: 14, cover: 1, txt: 'Cut the pharmacy cage (hold E). The torch stalls while the dead are close: one cuts, the rest cover' },
      { k: 'carry', item: 'fridge', heavy: 1, to: 'haven', txt: 'Carry the fridge to Haven. The carrier cannot shoot, and moves faster with a friend beside them' }] },
  { id: 'o2', ch: 1, name: 'Two Hands', town: 'PINE RIDGE', site: 'kcld', tips: ['Go quietly', 'Split up together', 'Guard the transmitter'],
    brief: "WARDEN: KCLD's mast reaches every radio in the county. Its breakers were wired by a paranoid man: two switches in two rooms, thrown at the same moment. Go quietly. Screamers carry.",
    done: "WARDEN: Now we can talk whenever I like. That's a gift. Say thank you.",
    stages: [{ k: 'travel', quiet: 1, txt: 'Get to KCLD quietly. If a screamer sees you, the whole hill hears it' },
      { k: 'twokey', n: 2, secs: 8, txt: 'Throw both breakers at the same moment: one of you on each switch, holding E together' },
      { k: 'hold', secs: 150, prot: 'transmitter', txt: 'Keep the transmitter alive while it boots. They will go for it, not you' },
      { k: 'extract', txt: 'Get everyone back to Haven' }] },
  { id: 'o3', ch: 1, name: 'The Flare', town: 'MILLBROOK', tips: ['Bait the horde', 'Loot fast', 'Keep the flare lit'],
    brief: "WARDEN: Millbrook's warehouse row is full of tinned food and full of the dead. You can't fight that many. You can make them look the other way.",
    done: "WARDEN: Fire and noise. You're learning how they think. So am I.",
    stages: [{ k: 'travel', txt: 'Get to the Millbrook warehouses' },
      { k: 'collect', n: 5, lure: 1, lsecs: 50, txt: 'Light the flare (hold E) to pull the horde to it, then loot the five caches while they watch it. When it burns out, they turn around' },
      { k: 'extract', txt: 'Get the food back to Haven' }] },
  // ---- Chapter 2: The Experiment ----
  { id: 'o4', ch: 2, need: { radio: 1 }, name: 'Hold the Door', town: 'SEAVIEW', tips: ['Build before you fight', 'Brutes break barricades', 'Two carry faster'],
    brief: "A family is boarded up in a Seaview house. They need two minutes to pack the kids and the old man. Their doors won't last two minutes. Build better ones.",
    done: "WARDEN: Six more mouths. Do you have the food for that? We'll see.",
    stages: [{ k: 'travel', txt: 'Find the house in Seaview' },
      { k: 'build', n: 3, txt: 'Barricade the three ways in (hold E at each marker) before the wave. Walls make them come the long way round' },
      { k: 'hold', secs: 120, brute: 1, txt: 'Hold the house while they pack. Brutes smash barricades: kill them first' },
      { k: 'carry', item: 'stretcher', heavy: 1, to: 'haven', txt: "Carry the grandfather home on the stretcher. Walk with whoever's carrying" }] },
  { id: 'o5', ch: 2, need: { radio: 1 }, name: 'Grabbers', town: 'HOLLIS', site: 'motel', grab: 1, tips: ['Never wander off', 'Shoot the grabber, not your friend', 'Pinned? Mash E'],
    brief: "WARDEN: I've been breeding something. It hides, it waits, and it holds on. It can't kill you on its own. It doesn't have to. The Route 9 motel is full of them.",
    done: "WARDEN: Nobody left behind. That's the part that keeps surprising me.",
    stages: [{ k: 'travel', txt: 'Get to the Route 9 motel. Stay close: grabbers pin anyone on their own' },
      { k: 'clear', txt: 'Clear the motel lot. If a friend is pinned, shoot it off them. If you are pinned, mash E' },
      { k: 'collect', n: 3, nest: 1, txt: 'Burn the nests in the rooms (hold E). The smoke brings more' },
      { k: 'extract', txt: 'Get everyone back to Haven' }] },
  { id: 'o6', ch: 2, need: { radio: 1 }, name: 'Lights Out', town: 'CALDER', night: true, grab: 1, tips: ['Three corners, one moment', 'The transformer is the target'],
    brief: "Calder's substation can power Haven's floodlights for a month. Three breakers in three corners of the yard, and the yard is dark. WARDEN's grabbers love the dark.",
    done: "WARDEN: Nice lights. Now I can see you too.",
    stages: [{ k: 'travel', txt: 'Get to the Calder substation in the dark' },
      { k: 'twokey', n: 3, secs: 6, txt: 'Throw the breakers together, one of you on each (fewer of you, fewer breakers)' },
      { k: 'hold', secs: 160, prot: 'transformer', txt: 'Keep the transformer alive while it spins up' },
      { k: 'extract', txt: 'Get everyone back to Haven' }] },
  // ---- Chapter 3: Signal Trace ----
  { id: 'o7', ch: 3, need: { radio: 2 }, name: 'Black Box', town: 'ASHFORD', site: 'hangar', tips: ['Cover the worker', 'Bait, then grab', 'Escort the box'],
    brief: "A Guard helicopter came down on the airfield east of Ashford. Its black box logged every radio bearing it heard on the way down. One of them is WARDEN.",
    done: "WARDEN: You took my box. Keep it. It only proves I was there.",
    stages: [{ k: 'travel', txt: 'Get to the crash on the airfield' },
      { k: 'crack', secs: 16, cover: 1, txt: 'Pry the black box out of the wreck (hold E). Cover whoever is prying' },
      { k: 'collect', n: 2, lure: 1, lsecs: 40, txt: 'Light the flare to pull the runway horde off you, then grab the two fuel cans for the drive home' },
      { k: 'carry', item: 'box', to: 'haven', txt: 'Carry the black box home. It beeps. They follow the beep' }] },
  { id: 'o8', ch: 3, need: { radio: 2 }, name: 'Choke Point', town: 'FAIRHAVEN', tips: ['Race the horde', 'Build the wall', 'Then bring the street down'],
    brief: "WARDEN's horde is walking west, toward Haven, and it has to cross Fairhaven to get there. Stop it at one street, with everything you've got. Then bring the street down on it.",
    done: "WARDEN: You broke my parade. That was a lot of work, you know.",
    stages: [{ k: 'travel', secs: 240, txt: 'Get to Fairhaven before the horde does' },
      { k: 'build', n: 4, txt: 'Barricade the street: four markers, and the wave is minutes out' },
      { k: 'hold', secs: 180, brute: 2, big: 1, txt: 'Hold the barricade against the horde' },
      { k: 'collect', n: 3, txt: 'Plant the three charges on the buildings' },
      { k: 'extract', txt: 'Get clear and get home before it blows' }] },
  { id: 'o9', ch: 3, need: { radio: 2 }, name: 'Apex', town: 'BRAMBLE', grab: 1, tips: ['Focus the Apex', 'Free pinned friends fast'],
    brief: "WARDEN: Meet my best one. He was a firefighter. He is very, very strong now, and he brought friends who hold on.",
    done: "WARDEN: You killed him. I'll make another. Will you?",
    stages: [{ k: 'travel', txt: 'Track the Apex to Bramble' },
      { k: 'clear', boss: 1, txt: 'Kill the Apex and its pack. Grabbers will try to split you up' },
      { k: 'collect', n: 3, nest: 1, txt: 'Burn the nests it was guarding' },
      { k: 'extract', txt: 'Get everyone back to Haven' }] },
  // ---- Chapter 4: WARDEN ----
  { id: 'o10', ch: 4, need: { radio: 3 }, name: 'Station Nine', town: 'GREYWATER', site: 'stn9', grab: 1, tips: ['Quiet in', 'Two cards, one moment', 'Cover the drives'],
    brief: "The bearings cross at Station Nine, under the Halden facility. The doors take two key cards turned at once. Then the servers. Then whatever WARDEN left awake down there.",
    done: "WARDEN: So now you know where I was. I'm not there any more. Come home. I'm already there.",
    stages: [{ k: 'travel', quiet: 1, txt: 'Get to Station Nine without waking the place' },
      { k: 'twokey', n: 2, secs: 10, txt: 'Turn both key cards at the same moment' },
      { k: 'hold', secs: 120, brute: 1, txt: 'Hold the lobby while the blast doors cycle' },
      { k: 'crack', secs: 18, cover: 1, txt: 'Pull the server drives (hold E). Cover whoever is pulling' },
      { k: 'extract', txt: 'Get the drives home' }] },
  { id: 'o11', ch: 4, need: { radio: 3 }, name: 'The Choir', town: 'MILLBROOK', grab: 1, tips: ['Escort the fuel', 'Wall up Haven', 'Save the generator'],
    brief: "WARDEN's last broadcast is a sound the dead can't ignore, and it's pointed at Haven. Everything in the county is coming. Fuel for the floodlights, walls on the gates, then stand.",
    done: "WARDEN: Still standing. I'm turning the broadcast off. Not for you. The batteries died.",
    stages: [{ k: 'travel', txt: 'Get to the Millbrook fuel depot' },
      { k: 'carry', item: 'drum', heavy: 1, to: 'haven', txt: "Carry the fuel drum home for Haven's floodlights" },
      { k: 'build', n: 4, at: 'haven', txt: "Barricade Haven's approaches before the choir arrives" },
      { k: 'hold', secs: 240, at: 'haven', prot: 'generator', brute: 2, big: 1, txt: 'Keep the floodlight generator alive until the broadcast stops' }] },
  { id: 'o12', ch: 4, need: { radio: 3 }, name: 'Last Drop', town: 'HARBOR ROW', site: 'lite', grab: 1, tips: ['Everything you learned'],
    brief: "WARDEN is in the lighthouse, broadcasting from the lamp room. One way up, two locks to release together, and the whole harbor of the dead between you and him.",
    done: "The lamp room is empty except for a tape recorder on a loop. The voice on it is yours, from the Greywater job. Somebody is still listening.",
    stages: [{ k: 'travel', quiet: 1, txt: 'Get to the lighthouse' },
      { k: 'build', n: 3, txt: 'Barricade the lighthouse yard' },
      { k: 'twokey', n: 2, secs: 8, txt: 'Release both door locks together' },
      { k: 'hold', secs: 150, brute: 2, big: 1, txt: 'Hold the yard while the doors grind open' },
      { k: 'clear', boss: 1, txt: "Kill WARDEN's last Apex" },
      { k: 'extract', txt: 'Get everyone home' }] },

  /* ================= ARC 2: UNDERTOW (build 57) =================
     The tape in the lamp room was your own voice. Somebody else was listening: MERCY, a voice on a hospital ship offering a cure,
     and Captain Rook of Meridian Recovery, paid to burn what Halden left behind. Each operation brings in one new thing a squad
     does together, and the later ones put them on top of each other. */
  // ---- Chapter 5: The Listener ----
  { id: 'o13', ch: 5, need: { radio: 3 }, name: 'Dead Air', town: 'RIDGEWAY', tips: ['Send a runner ahead', 'The chain drops if you are slow', 'Guard the trace'],
    brief: "The tape in the lamp room was your own voice. Somebody has been recording every word Haven says on the air. The old county repeater chain still runs through Ridgeway. Wake it up box by box, and it will tell us who has been listening.",
    done: "QUILL: Got a bearing. It's not on land. It's out past Seaview, on the water. And it just said our name.",
    stages: [{ k: 'travel', txt: 'Get to Ridgeway', say: [['QUILL', "Haven radio here. The repeaters run along the Ridgeway road, five boxes. Each one only holds a charge for about twenty seconds, so have someone waiting at the next one."]] },
      { k: 'relay', n: 5, win: 24, txt: 'Wake the five repeaters in order (hold E at each). A box only holds for 24 seconds, so send a runner ahead to the next one' },
      { k: 'hold', secs: 140, prot: 'transmitter', brute: 1, txt: 'Keep the trace transmitter alive while it listens back', say: [['QUILL', "Trace is running. It's loud. Everything in Ridgeway can hear it."]] },
      { k: 'extract', txt: 'Get everyone home' }] },
  { id: 'o14', ch: 5, need: { radio: 3 }, name: 'Mercy', town: 'SEAVIEW', spit: 1, tips: ['Light every fire', 'Never stand in the green', 'The launch will not wait'],
    brief: "The voice on the water calls itself MERCY. She runs a hospital ship, the St. Agnes, a mile off Seaview, and she says she has a cure. She only sends her launch to people who can keep a signal fire lit.",
    done: "MERCY: Antivirals. Real ones. Consider it a deposit, Haven. I'll be in touch.",
    stages: [{ k: 'travel', txt: 'Get to Seaview beach', say: [['MERCY', "Hello, Haven. I'm MERCY. I heard what you did to WARDEN. Light my fires and I'll send you something you need."]] },
      { k: 'collect', n: 4, fire: 1, txt: 'Light the four signal fires along the beach (hold E). Fire draws the dead' },
      { k: 'hold', secs: 150, txt: 'Keep the fires burning until the launch sees them. Spitters lob acid: get out of the green', say: [['MERCY', "I can see your fires. The launch is coming. So are they, I'm afraid."]] },
      { k: 'travel', at: 'shore', secs: 70, boat: 1, fail: 'The launch left without you.', txt: 'The launch is at the shoreline and only waits 70 seconds. Get to the boat' },
      { k: 'carry', item: 'medcase', to: 'haven', txt: "Carry MERCY's medicine case home. The dead can smell it" }] },
  { id: 'o15', ch: 5, need: { radio: 3 }, name: 'Rolling Thunder', town: 'MILLBROOK', spit: 1, tips: ['Stay with the truck', 'Clear the road ahead', 'It cannot take much'],
    brief: "MERCY wants the Millbrook road open to the river bridge so her people can bring a truck of supplies to Haven. Haven has a plow with a dead starter and a jammed throttle. It only crawls while someone walks at the cab and the road in front of it is clear.",
    done: "MERCY: The road is open. My truck will be with you by morning. You won't regret this. Probably.",
    stages: [{ k: 'travel', txt: 'Get to the Millbrook motor pool' },
      { k: 'escort', veh: 'plow', dest: 'far', txt: 'Walk the plow truck through Millbrook. It only moves while one of you is at the cab and nothing stands in front of it. The dead will tear at it', say: [['QUILL', "That plow is held together with tape. Don't let them chew on it."]] },
      { k: 'build', n: 3, at: 'far', txt: 'Barricade the bridge approaches before the wave hits' },
      { k: 'hold', secs: 150, at: 'far', brute: 2, big: 1, txt: 'Hold the bridge while the plow shoves the wrecks into the river' },
      { k: 'extract', txt: 'Get everyone home' }] },
  // ---- Chapter 6: Undertow ----
  { id: 'o16', ch: 6, need: { radio: 3 }, name: 'Lamplight', town: 'HARBOR ROW', site: 'lite', spit: 1, tips: ['Carriers cannot shoot', 'Cover the fuel runs', 'Then save the generator'],
    brief: "MERCY's truck never came. She says Recovery contractors burned it on the bridge road. The St. Agnes still wants to come into Harbor Row, and it can't without the lighthouse lamp. The lamp generator is bone dry, and there is fuel in every wreck along the harbor.",
    done: "The lamp turns over Harbor Row for the first time since the cordon. Out on the water, a ship's horn answers.",
    stages: [{ k: 'travel', txt: 'Get to the lighthouse' },
      { k: 'fuel', n: 6, txt: 'Fill the lamp generator: carry the fuel cans to it one at a time (E to pick up). Whoever carries cannot shoot, so the rest cover the runs', say: [['QUILL', "Every can you pour, that generator gets louder. They will come for the noise."]] },
      { k: 'hold', secs: 120, prot: 'generator', brute: 1, txt: 'Keep the generator alive while the lamp warms up' },
      { k: 'extract', txt: 'Get everyone home' }] },
  { id: 'o17', ch: 6, need: { radio: 3 }, name: 'Low Tide', town: 'MARSH END', tips: ['Stay in the bubble', 'Walk with the carrier', 'Cover the drill'],
    brief: "MERCY needs core samples from the Marsh End flats, where the bloaters went to die. The air out there is spore gas. She sent an air scrubber. It is heavy, and it only clears a few metres around it.",
    done: "MERCY: Those samples are perfect. You held together in the dark. That's very rare. I'm keeping notes.",
    stages: [{ k: 'travel', at: 'entry', txt: 'Get to the edge of the marsh' },
      { k: 'carry', item: 'scrubber', heavy: 1, gas: 1, from: 'entry', to: 'center', txt: 'Carry the scrubber into the marsh. Everyone stays inside its bubble or chokes in the gas', say: [['MERCY', "Stay close to the scrubber. Outside it, every breath is spores."]] },
      { k: 'crack', secs: 18, cover: 1, gas: 1, at: 'anchor', txt: 'Drill the core samples (hold E) inside the bubble. Cover whoever is drilling' },
      { k: 'carry', item: 'scrubber', heavy: 1, gas: 1, from: 'anchor', to: 'entry', txt: 'Carry the scrubber back out of the gas' },
      { k: 'extract', txt: 'Get the samples home' }] },
  { id: 'o18', ch: 6, need: { radio: 3 }, name: 'The Singer', town: 'FAIRHAVEN', spit: 1, tips: ['Chase it down', 'Do not stand close when it sings', 'Kill the spitters'],
    brief: "Something in Fairhaven sings, and the dead walk toward it. MERCY calls it the Matriarch: a mother bloater the size of a van. Wound it and it runs, and calls the town with it. She wants it dead, and she wants what is inside it.",
    done: "MERCY: The gland is what makes them listen. With it I can make them come, or go. Thank you, Haven. Truly.",
    stages: [{ k: 'travel', txt: 'Follow the singing to Fairhaven' },
      { k: 'hunt', ph: 3, txt: 'Hunt the Matriarch. Hurt it badly and it bursts away to a new spot and calls the dead. Follow it and finish it', say: [['MERCY', "Don't stand close when it sings. And never stand in what comes out of it."]] },
      { k: 'crack', secs: 12, cover: 1, at: 'hunt', txt: 'Cut the gland out of the carcass (hold E). Cover whoever is cutting' },
      { k: 'extract', txt: 'Get the gland home' }] },
  // ---- Chapter 7: Recovery ----
  { id: 'o19', ch: 7, need: { radio: 4 }, name: 'Whitecap', town: 'ASHFORD', spit: 1, grab: 1, tips: ['Split into pairs', 'One disarms, one covers', 'Watch the clock'],
    brief: "A new voice on the radio: Captain Rook, Meridian Recovery. His contractors burn every place survivors gather, to bury what Halden did. He has wired the Ashford school with charges, and there are families inside. He is giving you three minutes because he thinks it's funny.",
    done: "ROOK: You disarmed them. I'm almost touched. Next time I'll try something more permanent.",
    stages: [{ k: 'travel', txt: 'Get to the Ashford school', say: [['ROOK', "Haven, isn't it? Rook, Meridian Recovery. You've been carrying Halden's drives around. Three charges. The clock starts when you get there."]] },
      { k: 'defuse', n: 3, secs: 9, limit: 200, txt: 'Disarm the three charges before the clock runs out (hold E at each). A charge will not take while the dead are close to it. Split up' },
      { k: 'hold', secs: 120, brute: 1, txt: 'Hold the school yard while the families get out' },
      { k: 'extract', txt: 'Get everyone home' }] },
  { id: 'o20', ch: 7, need: { radio: 4 }, name: 'Floodgate', town: 'GRANITE FALLS', night: true, spit: 1, tips: ['One of you in every ring', 'Then run uphill'],
    brief: "Rook means to blow the Granite Falls spillway and drown the valley farms, the last real food in the county. The floodgates can be lowered by hand: three winch houses, all turning at once, in the dark.",
    done: "The water takes the low road and the farms stay dry. Rook doesn't say anything at all. That's worse.",
    stages: [{ k: 'travel', txt: 'Get to the Granite Falls floodgates in the dark' },
      { k: 'twokey', zone: 1, n: 3, secs: 75, r: 150, txt: 'Man all three winches at once: one of you inside each ring. The gates only drop while every winch is turning', say: [['ROOK', "Winches? How quaint. I'll just let the dead know where you're standing."]] },
      { k: 'travel', at: 'high', secs: 75, fail: 'The flood caught you.', txt: 'Rook blew the spillway anyway. Get to high ground before the water comes through' },
      { k: 'extract', txt: 'Get everyone home' }] },
  { id: 'o21', ch: 7, need: { radio: 4 }, name: 'Lazarus', town: 'KESTREL', grab: 1, tips: ['Quiet in', 'Cover the cutter', 'Everyone on the helicopter'],
    brief: "A Meridian helicopter came down in Kestrel, and its pilot is alive. She wants out of Rook's company, and she knows what MERCY really is. She can't walk.",
    done: "OKAFOR: MERCY isn't a doctor. She's Halden's second program. WARDEN tested which groups hold together. MERCY tests what they'll do for a cure. You've been passing both.",
    stages: [{ k: 'travel', quiet: 1, txt: 'Get to the crash quietly. Rook caged screamers around it as alarms' },
      { k: 'crack', secs: 14, cover: 1, txt: 'Cut the pilot out of the wreck (hold E). Cover whoever is cutting', say: [['OKAFOR', "I hear you. Name's Okafor. Get me out of this seat and I'll get us a ride."]] },
      { k: 'carry', item: 'stretcher', heavy: 1, to: 'lz', txt: 'Carry the pilot to the landing zone. Walk with whoever is carrying' },
      { k: 'hold', secs: 150, at: 'lz', brute: 2, big: 1, txt: 'Hold the landing zone until the helicopter arrives', say: [['OKAFOR', "Friend of mine flies medevac for anyone who pays. Two and a half minutes. Don't let them take the field."]] },
      { k: 'evac', at: 'lz', secs: 45, heli: 1, txt: 'The helicopter is down and it will not wait. Everyone aboard' }] },
  // ---- Chapter 8: St. Agnes ----
  { id: 'o22', ch: 8, need: { radio: 4 }, name: 'Dead Reckoning', town: 'NEW HALDEN', spit: 1, grab: 1, tips: ['Walk the boat to the water', 'Both cranes at once', 'Everyone in the boat'],
    brief: "The St. Agnes is anchored past the Halden breakwater, and the only boat that can reach her sits on a trailer in a city dry dock. Get the boat to the water. Rook left the city to the dead on purpose.",
    done: "OKAFOR: Boat's in the water. Tomorrow we go aboard. Bring everything you have.",
    stages: [{ k: 'travel', txt: 'Get to the Halden dry dock' },
      { k: 'escort', veh: 'boat', dest: 'shore', txt: 'Walk the boat trailer to the water. It only moves while one of you is at the tractor and the road ahead is clear', say: [['ROOK', "A boat. You're going to the St. Agnes. Oh, she'll love you."]] },
      { k: 'twokey', n: 2, secs: 10, txt: 'Work both crane controls at the same moment to lower the boat into the water' },
      { k: 'hold', secs: 120, at: 'shore', brute: 2, txt: 'Hold the slipway while the engine warms up' },
      { k: 'evac', at: 'shore', secs: 40, boat: 1, txt: 'Engine is running. Everyone into the boat' }] },
  { id: 'o23', ch: 8, need: { radio: 4 }, name: 'Burn Notice', town: 'HARBOR ROW', night: true, spit: 1, grab: 1, tips: ['Wall up first', 'One of you at every gate', 'Kill the Matriarch'],
    brief: "Rook knows you're going aboard the St. Agnes. Tonight he is sending everything he has at Haven: siren trucks herding the county's dead to your gates, and something big riding in the middle of the herd.",
    done: "ROOK: Fine. Go to your ship, Haven. I'll be waiting on the shore when you come back.",
    stages: [{ k: 'build', n: 4, at: 'haven', txt: "Barricade Haven's approaches before the sirens arrive", say: [['QUILL', "Sirens on every road in. Wall it up, now."]] },
      { k: 'twokey', zone: 1, n: 3, secs: 150, r: 170, at: 'haven', txt: 'Hold all three gates at once: one of you at each, or they pour through the empty one' },
      { k: 'hunt', ph: 2, at: 'haven', txt: 'Rook sent a Matriarch in with the herd. Kill it before it calls the county in' }] },
  { id: 'o24', ch: 8, need: { radio: 4 }, name: 'Undertow', town: 'HARBOR ROW', spit: 1, grab: 1, tips: ['Everything you learned'],
    brief: "The St. Agnes has come into Harbor Row under the lighthouse lamp. Her cargo hold is full of the dead in restraints: MERCY was never curing anyone. Her transmitter can reach every radio in the state. Use it.",
    done: "Every radio in the county plays it at once: WARDEN's logs, MERCY's notes, Rook's orders, in their own voices. Then new voices, from kitchens and cellars and roofs: Haven, this is Pine Ridge. We heard you. We're coming.",
    stages: [{ k: 'travel', quiet: 1, txt: 'Get to the pier where the St. Agnes is moored', say: [['MERCY', "Haven. You came aboard. I hoped you would. You're my best result."]] },
      { k: 'relay', n: 4, win: 20, txt: "Restore power along the pier to the ship's transmitter: four junction boxes, in order, 20 seconds between each" },
      { k: 'carry', item: 'box', to: 'shore', txt: "Carry the Station Nine drives aboard to the ship's transmitter" },
      { k: 'hold', secs: 200, at: 'shore', prot: 'transmitter', brute: 2, big: 1, txt: 'Keep the transmitter alive while it sends everything', say: [['MERCY', "If you send that, nobody comes for a cure. Nobody comes for anything. Let them come for you, then."]] },
      { k: 'hunt', ph: 3, at: 'shore', txt: 'MERCY opened the hold. Kill the thing she kept in it' },
      { k: 'extract', txt: 'Get everyone home' }] }
];
const CHN = { 1: 'Static', 2: 'The Experiment', 3: 'Signal Trace', 4: 'WARDEN', 5: 'The Listener', 6: 'Undertow', 7: 'Recovery', 8: 'St. Agnes' };
// Haven comes under attack every few operations: a fixed, built siege, not a random job
const SIEGE = { id: 'siege', name: 'Siege: Haven', town: 'HARBOR ROW', tips: ['Build first', 'Save the generator'], brief: 'Something stirred the county up. A horde is walking at Haven. Wall up and keep the generator running.',
  stages: [{ k: 'build', n: 4, at: 'haven', txt: "Barricade Haven's approaches" }, { k: 'hold', secs: 200, at: 'haven', prot: 'generator', brute: 1, txt: 'Keep the generator alive' }] };
const opById = id => id === 'siege' ? SIEGE : OPS.find(o => o.id === id);
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
const PARK = { x0: 5900, y0: 3650, x1: 6300, y1: 4100 };
const HUSE = { meal: { cost: { food: 3 }, cd: 180 }, patch: { cost: { meds: 4 }, cd: 240, need: { infirmary: 1 } }, stores: { cost: { ammo: 20 }, cd: 120 }, medkit: { cost: { meds: 2 }, cd: 120 },
  fuelcan: { cost: { fuel: 10 }, cd: 150 }, chop: { gain: { scrap: 2 }, cd: 75 }, sort: { cd: 90 }, stack: { gain: { scrap: 2 }, cd: 90 }, harvest: { gain: { food: 3 }, cd: 120, per: 1, need: { farm: 1 } },
  eggs: { gain: { food: 2 }, cd: 150, need: { farm: 1 } }, milk: { gain: { food: 3 }, cd: 180, need: { farm: 3 } }, repair: { cost: { scrap: 8, fuel: 10 }, cd: 20 }, scrapout: { cost: { scrap: 10 }, cd: 120, need: { workshop: 1 } } };   // build 61: Haven's car park (the garage and its apron), game units
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
function chapterOf(c) { let ch = 1; for (const o of OPS) if (c.storyDone.includes(o.id)) ch = Math.max(ch, o.ch); return ch; }
function opNeedOk(c, o) { const nd = o.need || {}; return !nd.radio || (c.b.radio || 0) >= nd.radio; }
function storyNext(c) { for (const o of OPS) if (!c.storyDone.includes(o.id)) return { s: o, ok: opNeedOk(c, o), need: o.need || {} }; return null; }
// difficulty comes from where the operation sits in the story, the squad size and the tier, plus a little for experience
function threatOf(c, players, tier, op) { const ch = (op && op.ch) || chapterOf(c); return +(1 + (ch <= 4 ? .7 * (ch - 1) : 2.1 + .45 * (ch - 4)) + .45 * Math.max(0, players - 1) + Math.min(1.5, .04 * c.done) + (TIERS[tier] || TIERS.normal).bonus).toFixed(1); }
function unlockedTowns(c) { const maxCh = 1 + Math.min(4, c.b.radio); return Object.keys(TOWNS).filter(t => TOWNS[t].ch <= maxCh); }
const OPPAY = { 1: { scrap: 35, food: 20, meds: 8, ammo: 25 }, 2: { scrap: 50, food: 25, meds: 12, fuel: 20, ammo: 30 }, 3: { scrap: 65, food: 30, meds: 15, fuel: 30, ammo: 40 }, 4: { scrap: 85, food: 40, meds: 20, fuel: 40, ammo: 50 },
  5: { scrap: 100, food: 45, meds: 24, fuel: 50, ammo: 60 }, 6: { scrap: 115, food: 50, meds: 28, fuel: 60, ammo: 70 }, 7: { scrap: 130, food: 55, meds: 32, fuel: 70, ammo: 80 }, 8: { scrap: 150, food: 60, meds: 36, fuel: 80, ammo: 90 } };
function rewardOf(op, threat, tier, replay) {
  const k = (TIERS[tier] || TIERS.normal).pay * (1 + .12 * threat) * (replay ? .7 : 1), base = OPPAY[op.ch || 1] || OPPAY[1];
  const r = {}; for (const x in base) r[x] = Math.round(base[x] * k); return r; }
function makeBoard(c) {
  const list = [];
  const sn = storyNext(c); if (sn) list.push({ mid: 'story:' + sn.s.id, story: true, locked: !sn.ok, need: sn.need, name: sn.s.name, type: 'operation', town: sn.s.town, brief: sn.s.brief, ch: sn.s.ch, chn: CHN[sn.s.ch], num: OPS.indexOf(sn.s) + 1, night: !!sn.s.night, tips: sn.s.tips, steps: sn.s.stages.map(x => x.txt.split('.')[0]) });
  if (c.done > 0 && c.done % 4 === 3) list.push({ mid: 'siege:' + rid(3), story: false, name: SIEGE.name, type: 'siege', town: SIEGE.town, brief: SIEGE.brief, tips: SIEGE.tips, warn: 'Skipping it costs a building level.', steps: SIEGE.stages.map(x => x.txt) });
  // every finished operation stays on the board to replay, harder if you like, for supplies
  for (const o of OPS) if (c.storyDone.includes(o.id)) list.push({ mid: 'replay:' + o.id, replay: true, name: o.name, type: 'replay · chapter ' + o.ch + ' · ' + CHN[o.ch], num: OPS.indexOf(o) + 1, town: o.town, brief: o.brief, ch: o.ch, night: !!o.night, tips: o.tips });
  c.board = list; c.boardT = now(); save(); return list;
}
function opView(M) { return { id: M.id, mid: M.mid, name: M.name, type: M.type, town: M.town, tier: M.tier, threat: M.threat, stage: M.stage >= 0 && M.stages[M.stage] ? M.stages[M.stage].txt : 'Deploying', squad: [...M.squad].map(pid => (M.names[pid] || '?')), full: M.squad.size >= MAX_SQUAD, bonus: M.bonus.txt }; }
function crewView(c, room) {
  farmTick(c); crewFix(c);
  if (!c.board || c.board.some(m => !/^(story|replay|siege):/.test(m.mid || ''))) makeBoard(c);   // boards from before build 56 held random contracts
  const busy = new Set(room ? [...room.ops.values()].map(M => M.mid) : []);
  return { code: c.code, name: c.name, res: c.res, b: c.b, done: c.done, fails: c.fails, ch: chapterOf(c), storyDone: c.storyDone, settlers: settlersOf(c),
    board: (c.board || makeBoard(c)).map(m => busy.has(m.mid) ? Object.assign({}, m, { taken: true }) : m),
    costs: Object.fromEntries(Object.keys(BUILDINGS).map(b => [b, c.b[b] >= 5 ? null : upCost(b, c.b[b])])), needs: Object.fromEntries(Object.keys(BUILDINGS).map(b => [b, c.b[b] >= 5 ? null : upNeed(b, c.b[b])])), log: c.log.slice(-8),
    ops: room ? [...room.ops.values()].map(opView) : [], maxOps: MAX_OPS, parked: c.parked || [], parkMax: 6 + 2 * (c.b.garage | 0),
    online: room ? [...room.players.values()].map(p => ({ pid: p.pid, name: p.name, look: p.look, ready: p.ready, op: p.op || null, slot: p.slot | 0, wpt: p.wpt || null })) : [] };
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
  { k: 'nodown', txt: 'Bonus: nobody goes down' }, { k: 'fast', txt: 'Bonus: done inside 9 minutes', secs: 540 }, { k: 'elite', txt: 'Bonus: kill an elite', n: 1 }, { k: 'kills', txt: 'Bonus: 60 kills between you', n: 60 }, { k: 'together', txt: 'Bonus: nobody gets pinned for long and nobody bleeds out', n: 0 }
];
function startMission(room, starter, mid, tier, squadPids) {
  const c = DB.crews[room.code]; if (!c) return;
  if (room.ops.size >= MAX_OPS) return send(starter, { t: 'err', m: 'Every player is already out on an operation.' });
  if (starter.op) return send(starter, { t: 'err', m: 'You are already on an operation.' });
  const entry = (c.board || []).find(m => m.mid === mid); if (!entry) return send(starter, { t: 'err', m: 'That mission is no longer on the board.' });
  if ([...room.ops.values()].some(M => M.mid === mid)) return send(starter, { t: 'err', m: 'Another squad already took that contract.' });
  if (entry.locked) return send(starter, { t: 'err', m: 'Locked: ' + JSON.stringify(entry.need) });
  const squad = [starter, ...(squadPids || []).map(pid => room.players.get(pid)).filter(q => q && q !== starter && !q.op)].slice(0, MAX_SQUAD);
  const tierN = TIERS[tier] ? tier : 'normal', kind = mid.split(':')[0], opId = kind === 'siege' ? 'siege' : mid.split(':')[1], op = opById(opId);
  if (!op) return send(starter, { t: 'err', m: 'Unknown operation.' });
  const threat = threatOf(c, squad.length, tierN, op), T = TOWNS[op.town] || TOWNS['HARBOR ROW'];
  const bonus = BONUS[crypto.randomInt(BONUS.length)];
  const M = { id: rid(4), mid, op: op.id, story: kind === 'story' ? op.id : null, name: op.name, type: kind === 'siege' ? 'siege' : 'operation', town: op.town, site: op.site || null, grab: !!op.grab, spit: !!op.spit, tier: tierN, threat,
    night: !!op.night, seed: crypto.randomInt(1e9), T, stage: -1, stages: [], pts: {}, claims: {}, kills: {}, elites: 0, downs: 0, alarms: 0, started: now(), t: 0, tAll: 0, waveT: 0, holdT: 0, left: null, crack: 0,
    reward: rewardOf(op, threat, tierN, kind === 'replay'), brief: op.brief, done: kind === 'story' ? op.done : null, ended: false, bars: [], cargo: null, ohp: null, lureT: 0, lureHold: 0,
    squad: new Set(squad.map(q => q.pid)), names: Object.fromEntries(squad.map(q => [q.pid, q.name])), host: null, bonus };
  // copy the hand-written stages and size the ones that depend on how many of you there are
  const SQ = squad.length;
  M.stages = op.stages.map(x => Object.assign({}, x));
  for (const st of M.stages) {
    if (st.k === 'twokey') st.need = Math.max(1, Math.min(st.n || 2, SQ));
    if (st.k === 'fuel') st.n = clampN((st.n || 6) - 3 + SQ, 3, 8);
    if (st.k === 'defuse' && SQ === 1) st.limit = Math.round(st.limit * 1.25);
    if (st.k === 'relay' && SQ === 1) st.win = Math.round(st.win * 1.3);
    if (st.k === 'collect' && !st.nest && !st.lure) st.n = clampN(st.n + (SQ >= 3 ? 1 : 0), 1, 8);
    if (st.k === 'hold') st.secs = Math.round(st.secs * ((TIERS[tierN] || TIERS.normal).bonus ? 1.15 : 1));
  }
  room.ops.set(M.id, M);
  for (const p of squad) { p.op = M.id; p.loaded = false; p.down = false; p.dead = false; p.ready = false; }
  bop(room, M, { t: 'mission.load', m: publicMission(M), seed: M.seed, armory: armoryOf(starter) });
  for (const p of squad) if (p !== starter) send(p, { t: 'armory', ids: armoryOf(p) });
  M.loadTimer = setTimeout(() => goMission(room, M), 120000);
  c.log.push({ t: now(), m: squad.map(q => q.name).join(', ') + ' headed out: ' + M.name + '.' }); crewUpdate(room);
}
function armoryOf(p) { const pr = DB.profiles[p.pid]; return pr && pr.armory ? Object.keys(pr.armory) : []; }
function publicMission(M) { const op = opById(M.op) || {}; return { id: M.id, name: M.name, type: M.type, town: M.town, tier: M.tier, threat: M.threat, night: M.night, brief: M.brief, stages: M.stages.map(s => s.txt), stage: M.stage, pts: M.pts, claims: M.claims, reward: M.reward, T: M.T, bonus: M.bonus.txt, tips: op.tips || [], grab: M.grab, spit: M.spit, bars: M.bars, ch: op.ch || 0, chn: CHN[op.ch] || '', num: OPS.indexOf(op) + 1 }; }
function goMission(room, M) {
  if (!M || M.go || M.ended) return; M.go = true; clearTimeout(M.loadTimer);
  setHost(room, M, pickHost(room, M) || squadOf(room, M)[0], 'start');
  // ask the host to work out the concrete spots (it has the real map)
  const need = { n: 0, nests: 0, keys: 0, bars: 0, hbars: 0, lure: 0, item: 0 };
  for (const st of M.stages) { if (st.k === 'collect') { if (st.nest) need.nests = Math.max(need.nests, st.n); else need.n = Math.max(need.n, st.n); if (st.lure) need.lure = 1; }
    if (st.k === 'twokey') need.keys = Math.max(need.keys, st.n || 2); if (st.k === 'build') { if (st.at === 'haven') need.hbars = Math.max(need.hbars, st.n); else { need.bars = Math.max(need.bars, st.n); if (st.at) need.barsAt = st.at; } } if (st.k === 'carry') need.item = 1;
    // build 57
    if (st.k === 'collect' && st.fire) need.fires = Math.max(need.fires || 0, st.n);
    if (st.k === 'relay') need.relays = Math.max(need.relays || 0, st.n);
    if (st.k === 'fuel') need.cans = Math.max(need.cans || 0, st.n);
    if (st.k === 'defuse') need.charges = Math.max(need.charges || 0, st.n);
    if (st.k === 'twokey' && st.zone && st.at !== 'haven') need.zones = Math.max(need.zones || 0, st.n);
    if (st.k === 'twokey' && st.zone && st.at === 'haven') need.hbars = Math.max(need.hbars, st.n);
    if (st.k === 'escort') { need.route = st.dest || 'far'; }
    if (st.k === 'hunt') { need.lairs = (st.ph || 3) + 1; need.lairsAt = st.at || 'center'; }
    for (const a of [st.at, st.from, st.to, st.dest]) if (a && /^(shore|lz|far|entry|high)$/.test(a)) (need.at = need.at || []).includes(a) || need.at.push(a); }
  const h = room.players.get(M.host); if (h) send(h, Object.assign({ t: 'needpts', type: M.type, town: M.town, T: M.T, site: M.site }, need));
  M.ptsTimer = setTimeout(() => { if (!M.pts.haven) setPoints(room, M, { haven: HAVEN_PT, center: { x: M.T.x, y: M.T.y }, caches: [] }); }, 25000);
  bop(room, M, { t: 'mission.go' });
}
const HAVEN_PT = { x: 6400, y: 3560 };
const ring = (c, n, r, a0) => Array.from({ length: n }, (_, i) => ({ x: Math.round(c.x + Math.cos((a0 || 0) + i * 6.283 / n) * r), y: Math.round(c.y + Math.sin((a0 || 0) + i * 6.283 / n) * r) }));
function setPoints(room, M, pts) {
  if (!M || M.pts.haven) return; clearTimeout(M.ptsTimer);
  const center = pts.center || { x: M.T.x, y: M.T.y }, haven = pts.haven || HAVEN_PT;
  M.pts = { haven, center, caches: (pts.caches || []).slice(0, 12), nests: (pts.nests || []).slice(0, 6), keys: (pts.keys || []).slice(0, 4), bars: (pts.bars || []).slice(0, 6), hbars: (pts.hbars || []).slice(0, 6),
    lure: pts.lure || null, item: pts.item || null,
    fires: (pts.fires || []).slice(0, 8), relays: (pts.relays || []).slice(0, 8), cans: (pts.cans || []).slice(0, 10), charges: (pts.charges || []).slice(0, 6), zones: (pts.zones || []).slice(0, 4),
    route: (pts.route || []).slice(0, 200), lairs: (pts.lairs || []).slice(0, 6) };
  for (const a of ['shore', 'lz', 'far', 'entry', 'high']) if (pts[a] && isFinite(pts[a].x)) M.pts[a] = { x: Math.round(pts[a].x), y: Math.round(pts[a].y) };
  { const FB0 = { shore: [600, 0], lz: [900, 300], far: [1500, 0], entry: [-900, -300], high: [-1200, 600] }; for (const a in FB0) if (!M.pts[a]) M.pts[a] = { x: center.x + FB0[a][0], y: center.y + FB0[a][1] }; }
  // fallbacks, so a stage never ends up with nothing to do
  const most = f => Math.max(0, ...M.stages.filter(f).map(s => s.n || 2));   // only invent spots when the host could not find enough real ones
  const nk = Math.min(M.squad.size, most(s => s.k === 'twokey')), nb = most(s => s.k === 'build' && s.at !== 'haven'), nh = most(s => s.k === 'build' && s.at === 'haven');
  if (nk && M.pts.keys.length < nk) M.pts.keys = M.pts.keys.concat(ring(center, 3, 320, .4)).slice(0, Math.max(nk, M.pts.keys.length));
  if (nb && M.pts.bars.length < Math.min(nb, 2)) { const bs = M.stages.find(s => s.k === 'build' && s.at !== 'haven'); M.pts.bars = ring((bs && bs.at && M.pts[bs.at]) || center, nb, 260, .2); }
  if (nh && M.pts.hbars.length < Math.min(nh, 2)) M.pts.hbars = ring(haven, nh, 300, .2);
  if (M.stages.some(s => s.lure) && !M.pts.lure) M.pts.lure = { x: center.x + 700, y: center.y };
  if (!M.pts.item) M.pts.item = { x: center.x + 40, y: center.y + 40 };
  // build 57 fallbacks: only when the host could not find real spots
  const FB = { shore: [600, 0], lz: [900, 300], far: [1500, 0], entry: [-900, -300], high: [-1200, 600] };
  for (const a in FB) if (!M.pts[a]) M.pts[a] = { x: center.x + FB[a][0], y: center.y + FB[a][1] };
  const cnt = k => Math.max(0, ...M.stages.filter(s => s.k === k).map(s => s.n || 0));
  if (M.stages.some(s => s.fire) && M.pts.fires.length < 2) M.pts.fires = ring(center, cnt('collect'), 380, .3);
  if (cnt('relay') && M.pts.relays.length < 2) M.pts.relays = Array.from({ length: cnt('relay') }, (_, i) => ({ x: Math.round(center.x - 900 + i * 520), y: Math.round(center.y + (i % 2 ? 260 : -260)) }));
  if (cnt('fuel') && M.pts.cans.length < 2) M.pts.cans = ring(center, cnt('fuel'), 650, .5);
  if (cnt('defuse') && M.pts.charges.length < 2) M.pts.charges = ring(center, cnt('defuse'), 420, .2);
  if (M.stages.some(s => s.zone && s.at !== 'haven') && M.pts.zones.length < 2) M.pts.zones = ring(center, 3, 420, .6);
  if (M.stages.some(s => s.zone && s.at === 'haven') && M.pts.hbars.length < 3) M.pts.hbars = ring(haven, 4, 300, .2);
  const esc = M.stages.find(s => s.k === 'escort'); if (esc && M.pts.route.length < 2) M.pts.route = [{ x: center.x, y: center.y }, M.pts[esc.dest || 'far']];
  const hs = M.stages.find(s => s.k === 'hunt'); if (hs && M.pts.lairs.length < 2) { const c0 = hs.at === 'haven' ? haven : M.pts[hs.at] || center; M.pts.lairs = ring(c0, (hs.ph || 3) + 1, 520, .4); M.pts.lairs[0] = { x: c0.x + 260, y: c0.y }; }
  if (M.type === 'siege') M.pts.center = M.pts.haven;
  for (const st of M.stages) {
    if (st.k === 'collect' && !st.nest) st.n = Math.min(st.n, M.pts.caches.length || 1);
    if (st.k === 'build') st.n = Math.min(st.n, (st.at === 'haven' ? M.pts.hbars : M.pts.bars).length);
    if (st.k === 'twokey') { st.need = Math.min(st.need, stagePts(M, Object.assign({}, st, { need: 99 })).length); }
    if (st.k === 'collect' && st.fire) st.n = Math.min(st.n, M.pts.fires.length);
    if (st.k === 'relay') st.n = Math.min(st.n, M.pts.relays.length);
    if (st.k === 'fuel') st.n = Math.min(st.n, M.pts.cans.length);
    if (st.k === 'defuse') st.n = Math.min(st.n, M.pts.charges.length);
  }
  const ns = M.stages.find(s => s.nest); if (ns && !M.pts.nests.length) M.stages = M.stages.filter(s => !s.nest); else if (ns) ns.n = Math.min(ns.n, M.pts.nests.length);
  nextStage(room, M);
}
function stagePts(M, s) { if (!s) return []; if (s.k === 'collect') return s.fire ? M.pts.fires : s.nest ? M.pts.nests : M.pts.caches; if (s.k === 'build') return s.at === 'haven' ? M.pts.hbars : M.pts.bars;
  if (s.k === 'twokey') return (s.zone ? (s.at === 'haven' ? M.pts.hbars : M.pts.zones) : M.pts.keys).slice(0, s.need);
  if (s.k === 'relay') return M.pts.relays.slice(0, s.n); if (s.k === 'defuse') return M.pts.charges.slice(0, s.n); if (s.k === 'fuel') return M.pts.cans.slice(0, s.n); return []; }
function ptAt(M, a) { if (!a) return null; if (a === 'haven') return M.pts.haven; if (a === 'center') return M.pts.center; if (a === 'anchor') return M.anchor || M.pts.center; if (a === 'hunt') return M.huntPt || M.pts.center; return M.pts[a] || null; }
function stageTarget(M, s) { if (!s) return null;
  if (s.k === 'carry') return ptAt(M, s.to) || M.pts.center;
  if (s.k === 'escort') return M.esc ? { x: Math.round(M.esc.x), y: Math.round(M.esc.y) } : M.pts.center;
  if (s.k === 'hunt') return M.huntPt || ptAt(M, s.at) || M.pts.center;
  if (s.k === 'relay') { const r = M.pts.relays[Math.min(M.ri || 0, M.pts.relays.length - 1)]; return r || M.pts.center; }
  if (s.k === 'fuel') return M.pts.center;
  if (s.at && s.k !== 'twokey') return ptAt(M, s.at) || M.pts.center; if (s.town && TOWNS[s.town]) return { x: TOWNS[s.town].x, y: TOWNS[s.town].y };
  if (s.k === 'twokey') { const k = M.pts.keys.slice(0, s.need); return k.length ? { x: Math.round(k.reduce((a, p) => a + p.x, 0) / k.length), y: Math.round(k.reduce((a, p) => a + p.y, 0) / k.length) } : M.pts.center; }
  if (s.k === 'travel' || s.k === 'crack' || s.k === 'hold' || s.k === 'clear' || s.k === 'build' || s.k === 'defuse') return M.pts.center; if (s.k === 'extract') return M.pts.haven; if (s.k === 'evac') return ptAt(M, s.at) || M.pts.center; return null; }
function stageMsg(M, s) { return { t: 'stage', i: M.stage, txt: s.txt, k: s.k, target: stageTarget(M, s), n: s.n || 0, need: s.need || 0, secs: s.secs || 0, nest: s.nest ? 1 : 0, bar: s.k === 'build' ? 1 : 0,
  caches: (s.k === 'collect' || s.k === 'build') ? stagePts(M, s).slice(0, s.n) : null, keys: s.k === 'twokey' ? stagePts(M, s) : null, claims: M.claims, quiet: s.quiet ? 1 : 0, cover: s.cover ? 1 : 0,
  lure: s.lure ? M.pts.lure : null, lureT: M.lureT, prot: s.prot || null, ohp: M.ohp, cargo: M.cargo, item: s.item || null, heavy: s.heavy ? 1 : 0, bars: M.bars,
  // build 57
  say: s.say || null, fire: s.fire ? 1 : 0, zone: s.zone ? 1 : 0, r: s.r || 0, relays: s.k === 'relay' ? stagePts(M, s) : null, ri: M.ri || 0, win: s.win || 0,
  charges: s.k === 'defuse' ? stagePts(M, s) : null, dp: M.dp || null, limit: s.limit || 0, cans: s.k === 'fuel' ? s.n : 0, fi: M.fi || 0,
  esc: s.k === 'escort' ? { veh: s.veh || 'plow', x: M.esc.x, y: M.esc.y, a: M.esc.a, dest: M.pts.route[M.pts.route.length - 1] } : null, route: s.k === 'escort' ? M.pts.route : null,
  gas: s.gas ? { x: M.pts.center.x, y: M.pts.center.y, r: 1500 } : null, anchor: s.gas ? (M.anchor || null) : null, boat: s.boat ? 1 : 0, heli: s.heli ? 1 : 0,
  hunt: s.k === 'hunt' ? { ph: s.ph || 3, lairs: M.pts.lairs, at: M.huntPt || null } : null, ch: (opById(M.op) || {}).ch || 0 }; }
function nextStage(room, M) {
  M.stage++; const s = M.stages[M.stage];
  if (!s) return endMission(room, M, true);
  M.t = 0; M.holdT = 0; M.crack = 0; M.waveT = 6; M.left = null; M.claims = {}; M.lureT = 0; M.lureHold = 0; M.jam = 0; M.ohp = s.prot ? 100 : null;
  if (s.k === 'carry') { const f = ptAt(M, s.from) || M.pts.item; M.cargo = { x: f.x, y: f.y, pid: null, item: s.item || 'crate', heavy: s.heavy ? 1 : 0 }; } else M.cargo = null;
  // build 57
  M.ri = 0; M.rT = 0; M.fi = 0; M.dp = null; M.evacIn = null; M.nk = null; M.ez = 0;
  if (s.k === 'fuel') { const c0 = M.pts.cans[0] || M.pts.item; M.cargo = { x: c0.x, y: c0.y, pid: null, item: 'can', heavy: 0 }; }
  if (s.k === 'defuse') M.dp = Array.from({ length: s.n }, () => 0);
  if (s.k === 'escort') { const r0 = M.pts.route[0] || M.pts.center, r1 = M.pts.route[1] || r0; M.esc = { x: r0.x, y: r0.y, a: Math.atan2(r1.y - r0.y, r1.x - r0.x), i: 0, moving: 0 }; M.ohp = 100; }
  if (s.k === 'hunt') { M.huntPt = M.pts.lairs[0] || ptAt(M, s.at) || M.pts.center; M.huntSeen = M.t; M.huntPh = 0; }
  const th = M.threat, elite = Math.floor(th / 2.5), grab = M.grab ? Math.max(1, Math.round(th / 2)) : 0, c = M.pts.center;
  // spawn directives for the sim host
  if (s.k === 'travel' && M.type !== 'siege') hostDo(room, M, { k: 'infest', x: c.x, y: c.y, r: Math.min(900, M.T.r * .6), n: Math.round(14 + th * 4.5), run: Math.min(.5, .05 * th), spec: th >= 2, scream: s.quiet ? 2 : 0, tag: 'town', elite: Math.max(0, elite - 1), grab });
  if (s.k === 'clear') hostDo(room, M, { k: 'horde', x: c.x, y: c.y, r: 420, n: Math.round((s.boss ? 12 : 18) + th * (s.boss ? 3.5 : 5.5)), run: Math.min(.55, .07 * th), spec: th >= 2, tag: 'clear', brute: Math.floor(th / 3), elite, boss: s.boss ? 1 : 0, grab: grab + (s.boss ? 1 : 0) });
  if (s.k === 'crack') hostDo(room, M, { k: 'wave', x: c.x, y: c.y, n: Math.round(8 + th * 2.4), run: Math.min(.55, .07 * th), spec: th >= 2.5, tag: 'wave', elite: elite ? 1 : 0, grab: Math.min(1, grab) });
  if (s.k === 'extract' && th >= 1.5) hostDo(room, M, { k: 'chase', n: Math.round(4 + th * 1.6), run: Math.min(.7, .1 * th), tag: 'wave' });
  if (s.k === 'relay' || s.k === 'defuse' || s.k === 'escort' || s.k === 'fuel') hostDo(room, M, { k: 'infest', x: c.x, y: c.y, r: 1100, n: Math.round(16 + th * 4), run: Math.min(.45, .05 * th), spec: th >= 2, tag: 'town', elite: Math.max(0, elite - 1), grab });
  if (s.k === 'hunt') { hostDo(room, M, { k: 'hunt', x: M.huntPt.x, y: M.huntPt.y, ph: s.ph || 3, lairs: M.pts.lairs }); hostDo(room, M, { k: 'horde', x: M.huntPt.x, y: M.huntPt.y, r: 380, n: Math.round(10 + th * 3), run: Math.min(.5, .06 * th), spec: true, tag: 'wave', grab }); }
  if (s.k === 'evac') waveAt(room, M, stageTarget(M, s).x, stageTarget(M, s).y, 1.3, { run: Math.min(.7, .1 * th) });
  if (s.k === 'twokey' && s.zone) for (const k of stagePts(M, s)) waveAt(room, M, k.x, k.y, .5);
  if (s.k === 'collect' && s.lure) hostDo(room, M, { k: 'horde', x: c.x, y: c.y, r: 500, n: Math.round(30 + th * 8), run: .1, spec: false, tag: 'lure', grab: 0 });   // the crowd you have to bait away
  bop(room, M, stageMsg(M, s));
}
function hostDo(room, M, d) { const h = room.players.get(M.host); if (!h) return;
  if (M.spit && d.k !== 'lure' && d.k !== 'hunt' && d.spit === undefined && d.tag !== 'lure') d.spit = d.k === 'chase' ? 0 : Math.max(1, Math.round(M.threat / (d.k === 'wave' ? 3.5 : 2.5)));   // build 57: spitters in the waves of ops that have them
  send(h, { t: 'do', d, threat: M.threat, b: (DB.crews[room.code] || {}).b }); }
function alivePlayers(room, M) { return squadOf(room, M).filter(p => p.loaded && !p.down && !p.dead && p.st); }
function waveAt(room, M, x, y, mul, extra) { const th = M.threat; hostDo(room, M, Object.assign({ k: 'wave', x, y, n: Math.round((6 + th * 2.2) * (mul || 1)), run: Math.min(.6, .06 * th), spec: th >= 2.5, tag: 'wave', grab: M.grab && Math.random() < .5 ? 1 : 0 }, extra || {})); }
function missionTick(room, M, dt) {
  if (!M || !M.go || M.ended || M.stage < 0) return;
  const s = M.stages[M.stage], tgt = stageTarget(M, s), alive = alivePlayers(room, M), all = squadOf(room, M).filter(p => p.loaded);
  M.t += dt; M.tAll += dt;
  if (all.length && all.every(p => p.down || p.dead)) return endMission(room, M, false, 'The whole squad went down.');
  if (!squadOf(room, M).length) return endMission(room, M, false, 'Everyone left.');
  if (!all.length) return;
  const near = (r, at) => alive.filter(p => dist(p.st, at || tgt) < r);
  if (s.k === 'travel') { if (near(s.drive ? 260 : 350).length) nextStage(room, M); else if (s.secs) { bop(room, M, { t: 'prog', v: Math.min(1, M.t / s.secs), secs: Math.max(0, Math.round(s.secs - M.t)) }); if (M.t > s.secs) return endMission(room, M, false, s.fail || 'Too slow. The horde got there first.'); } }
  else if (s.k === 'collect' || s.k === 'build') { const got = Object.keys(M.claims).length; if (got >= s.n) return nextStage(room, M);
    if (s.lure && M.pts.lure) {   // the flare: someone holds E at it to light it, it burns for a while, then the horde turns round
      const atL = near(80, M.pts.lure).filter(p => p.st.use);
      if (M.lureT <= 0 && atL.length) { M.lureHold += dt; bop(room, M, { t: 'prog', v: Math.min(1, M.lureHold / 2), lure: 1 }); if (M.lureHold >= 2) { M.lureT = s.lsecs || 45; M.lureHold = 0; hostDo(room, M, { k: 'lure', on: 1, x: M.pts.lure.x, y: M.pts.lure.y }); bop(room, M, { t: 'lure', on: 1, secs: M.lureT }); } }
      else if (!atL.length) M.lureHold = 0;
      if (M.lureT > 0) { M.lureT -= dt; if (M.lureT <= 0) { M.lureT = 0; hostDo(room, M, { k: 'lure', on: 0 }); bop(room, M, { t: 'lure', on: 0 }); const p = alive[0]; if (p) waveAt(room, M, p.st.x, p.st.y, .8); } else if (Math.round(M.lureT * 4) % 4 === 0) bop(room, M, { t: 'lure', on: 1, secs: Math.round(M.lureT) }); } }
    else if (s.nest || s.fire || s.k === 'build') { M.waveT -= dt; if (M.waveT <= 0) { const p = alive[Math.floor(Math.random() * alive.length)]; if (p) waveAt(room, M, p.st.x, p.st.y, s.k === 'build' ? .6 : .8, { spec: true }); M.waveT = s.k === 'build' ? Math.max(18, 30 - M.threat * 2) : Math.max(16, 34 - M.threat * 2); } } }
  else if (s.k === 'crack') {
    const at = near(90).filter(p => p.st.use); const jam = s.cover && (M.nearZ || 0) > 0;
    if (at.length && !jam) M.crack += dt * Math.min(1.6, .8 + .4 * at.length);
    bop(room, M, { t: 'prog', v: Math.min(1, M.crack / s.secs), jam: jam && at.length ? 1 : 0 });
    M.waveT -= dt; if (M.waveT <= 0) { waveAt(room, M, tgt.x, tgt.y, .7); M.waveT = Math.max(14, 24 - M.threat * 1.5); }
    if (M.crack >= s.secs) nextStage(room, M); }
  else if (s.k === 'twokey') {   // every switch needs someone on it, holding E, at the same moment
    const keys = stagePts(M, s), manned = keys.map(k => alive.some(p => (s.zone || p.st.use) && dist(p.st, k) < (s.zone ? s.r || 150 : 75))), ok = manned.every(Boolean);
    if (ok) M.crack += dt; else M.crack = Math.max(0, M.crack - dt * .5);
    bop(room, M, { t: 'prog', v: Math.min(1, M.crack / s.secs), keys: manned.map(b => b ? 1 : 0) });
    M.waveT -= dt; if (M.waveT <= 0) { if (s.zone) { for (const k of keys) waveAt(room, M, k.x, k.y, .45, { brute: Math.random() < .25 ? 1 : 0 }); M.waveT = Math.max(14, 26 - M.threat * 1.5); } else { const k = keys[Math.floor(Math.random() * keys.length)]; if (k) waveAt(room, M, k.x, k.y, .55); M.waveT = Math.max(12, 22 - M.threat * 1.5); } }
    if (s.zone) bop(room, M, { t: 'prog', v: Math.min(1, M.crack / s.secs), secs: Math.max(0, Math.round(s.secs - M.crack)), keys: manned.map(b => b ? 1 : 0) });
    if (M.crack >= s.secs) nextStage(room, M); }
  /* ---- build 57 stages ---- */
  else if (s.k === 'relay') {   // boxes in order: each one has to be woken inside the window, or the chain drops back to the first
    const R = stagePts(M, s), cur = R[M.ri]; if (!cur) return nextStage(room, M);
    const at = alive.filter(p => p.st.use && dist(p.st, cur) < 75);
    if (at.length) M.crack += dt; else M.crack = Math.max(0, M.crack - dt);
    if (M.crack >= 2.2) { M.crack = 0; M.ri++; M.rT = s.win; if (M.ri >= R.length) { bop(room, M, { t: 'relay', ri: M.ri, win: 0, n: R.length }); return nextStage(room, M); }
      bop(room, M, { t: 'relay', ri: M.ri, win: M.rT, n: R.length, ok: 1 }); waveAt(room, M, R[M.ri].x, R[M.ri].y, .55); }
    else if (M.ri > 0) { M.rT -= dt; if (M.rT <= 0) { M.ri = 0; M.crack = 0; bop(room, M, { t: 'relay', ri: 0, win: 0, n: R.length, drop: 1 }); bop(room, M, { t: 'chat', name: '', m: 'The chain dropped. Back to the first box.' }); } }
    bop(room, M, { t: 'prog', v: Math.min(1, M.crack / 2.2), secs: Math.max(0, Math.round(M.rT)) });
    M.waveT -= dt; if (M.waveT <= 0) { const p = alive[Math.floor(Math.random() * alive.length)]; if (p) waveAt(room, M, p.st.x, p.st.y, .6); M.waveT = Math.max(15, 28 - M.threat * 1.5); } }
  else if (s.k === 'fuel') {   // cans one at a time to the generator: the carrier cannot shoot, the generator gets louder with every can
    const C = M.cargo; if (C.pid) { const q = room.players.get(C.pid); if (!q || q.op !== M.id || q.down || !q.st) { if (q && q.st) { C.x = q.st.x; C.y = q.st.y; } C.pid = null; bop(room, M, { t: 'cargo', c: C, why: q && q.down ? q.name + ' dropped the can' : '' }); } else { C.x = q.st.x; C.y = q.st.y; } }
    M.cargoT = (M.cargoT || 0) - dt; if (M.cargoT <= 0) { M.cargoT = .5; bop(room, M, { t: 'cargo', c: C }); }
    if (dist(C, M.pts.center) < 110) { M.fi++; const who = C.pid && room.players.get(C.pid); bop(room, M, { t: 'fuel', fi: M.fi, n: s.n, name: who ? who.name : '' });
      if (M.fi >= s.n) return nextStage(room, M);
      const nx = M.pts.cans[M.fi]; M.cargo = { x: nx.x, y: nx.y, pid: null, item: 'can', heavy: 0 }; bop(room, M, { t: 'cargo', c: M.cargo }); waveAt(room, M, M.pts.center.x, M.pts.center.y, .5 + .12 * M.fi); }
    M.waveT -= dt; if (M.waveT <= 0) { const p = alive[Math.floor(Math.random() * alive.length)]; if (p) waveAt(room, M, p.st.x, p.st.y, .7 + .08 * M.fi, { spec: true }); M.waveT = Math.max(13, 26 - M.threat * 1.5 - M.fi); } }
  else if (s.k === 'defuse') {   // several charges, one clock: each one needs someone holding E and nothing close to it
    const P_ = stagePts(M, s); M.limT = (M.limT || 0); const left = s.limit - M.t;
    if (left <= 0) return endMission(room, M, false, 'The charges went off.');
    P_.forEach((c, i) => { if (M.dp[i] >= s.secs) return; const at = alive.some(p => p.st.use && dist(p.st, c) < 75), jam = M.nk && M.nk[i] > 0; if (at && !jam) M.dp[i] = Math.min(s.secs, M.dp[i] + dt); });
    bop(room, M, { t: 'prog', v: M.dp.reduce((a, x) => a + x, 0) / (s.secs * P_.length), secs: Math.max(0, Math.round(left)), dp: M.dp.map(x => +(x / s.secs).toFixed(2)), jams: M.nk || null });
    if (M.dp.every(x => x >= s.secs)) return nextStage(room, M);
    M.waveT -= dt; if (M.waveT <= 0) { for (const c of P_) waveAt(room, M, c.x, c.y, .4); M.waveT = Math.max(14, 24 - M.threat * 1.2); } }
  else if (s.k === 'escort') {   // the vehicle crawls along its route while somebody walks with it and nothing stands in front of it
    const E = M.esc, R = M.pts.route, nxt = R[E.i + 1]; if (M.ohp !== null && M.ohp <= 0) return endMission(room, M, false, (s.veh === 'boat' ? 'The boat' : 'The plow') + ' was torn apart.');
    if (!nxt) return nextStage(room, M);
    const crew = alive.filter(p => dist(p.st, E) < 170).length, blocked = (M.ez || 0) >= 2, go = crew > 0 && !blocked;
    if (go) { const d = dist(E, nxt), step = Math.min(d, (s.veh === 'boat' ? 34 : 40) * dt); E.a = Math.atan2(nxt.y - E.y, nxt.x - E.x); E.x += Math.cos(E.a) * step; E.y += Math.sin(E.a) * step; if (d - step < 4) E.i++; }
    E.moving = go ? 1 : 0; E.why = go ? '' : !crew ? 'nobody' : 'blocked';
    const tot = R.length - 1; M.escT = (M.escT || 0) - dt; if (M.escT <= 0) { M.escT = .25; bop(room, M, { t: 'esc', x: Math.round(E.x), y: Math.round(E.y), a: +E.a.toFixed(2), mv: E.moving, why: E.why, v: +(E.i / Math.max(1, tot)).toFixed(3), ohp: M.ohp }); }
    M.waveT -= dt; if (M.waveT <= 0) { const ahead = R[Math.min(R.length - 1, E.i + 6)] || E; hostDo(room, M, { k: 'wave', x: ahead.x, y: ahead.y, n: Math.round(6 + M.threat * 2.2), run: Math.min(.55, .06 * M.threat), spec: M.threat >= 2.5, tag: 'wave', grab: M.grab ? 1 : 0, prot: .4, brute: Math.random() < .3 ? 1 : 0 }); M.waveT = Math.max(13, 24 - M.threat * 1.4); } }
  else if (s.k === 'hunt') {   // the host runs the boss and tells us where it is; it is done when the host says the boss is dead
    if (M.t - (M.huntSeen || 0) > 40 && M.t > 40) { M.huntSeen = M.t; hostDo(room, M, { k: 'hunt', x: M.huntPt.x, y: M.huntPt.y, ph: s.ph || 3, lairs: M.pts.lairs, from: M.huntPh || 0, again: 1 }); }
    M.waveT -= dt; if (M.waveT <= 0) { waveAt(room, M, M.huntPt.x, M.huntPt.y, .5, { spec: true }); M.waveT = Math.max(16, 30 - M.threat * 1.5); } }
  else if (s.k === 'evac') {   // the ride is here and it is not waiting: everyone still standing inside the ring before the clock runs out
    const tg = stageTarget(M, s), inR = alive.filter(p => dist(p.st, tg) < 230), left = s.secs - M.t;
    bop(room, M, { t: 'prog', v: alive.length ? inR.length / alive.length : 0, secs: Math.max(0, Math.round(left)), inn: inR.length, of: alive.length });
    if (alive.length && inR.length === alive.length) return nextStage(room, M);
    if (left <= 0) { if (!inR.length) return endMission(room, M, false, s.boat ? 'The boat left without you.' : 'The helicopter left without you.');
      const lost = alive.filter(p => !inR.includes(p)).map(p => p.name); M.bonusLost = 1; bop(room, M, { t: 'chat', name: '', m: lost.join(', ') + (lost.length > 1 ? ' were' : ' was') + ' left behind, and walked home the long way.' }); return nextStage(room, M); }
    M.waveT -= dt; if (M.waveT <= 0) { waveAt(room, M, tg.x, tg.y, .8, { run: Math.min(.7, .1 * M.threat) }); M.waveT = 10; } }
  else if (s.k === 'carry') {
    const C = M.cargo; if (C.pid) { const q = room.players.get(C.pid); if (!q || q.op !== M.id || q.down || !q.st) { if (q && q.st) { C.x = q.st.x; C.y = q.st.y; } C.pid = null; bop(room, M, { t: 'cargo', c: C, why: q && q.down ? q.name + ' dropped it' : '' }); } else { C.x = q.st.x; C.y = q.st.y; } }
    M.cargoT = (M.cargoT || 0) - dt; if (M.cargoT <= 0) { M.cargoT = .5; bop(room, M, { t: 'cargo', c: C }); }
    if (dist(C, tgt) < 240) { M.anchor = { x: Math.round(C.x), y: Math.round(C.y) }; return nextStage(room, M); }
    M.waveT -= dt; if (M.waveT <= 0) { hostDo(room, M, { k: 'chase', n: Math.round(3 + M.threat * 1.3), run: Math.min(.6, .08 * M.threat), tag: 'wave', at: { x: C.x, y: C.y }, grab: M.grab && Math.random() < .35 ? 1 : 0 }); M.waveT = Math.max(15, 26 - M.threat * 1.6); } }
  else if (s.k === 'hold') {
    const inside = near(380).length; if (inside) M.holdT += dt; else M.outT = (M.outT || 0) + dt;
    if ((M.outT || 0) > 25 && M.type === 'siege') return endMission(room, M, false, 'Haven was overrun.');
    if (inside) M.outT = 0;
    if (s.prot && M.ohp !== null && M.ohp <= 0) return endMission(room, M, false, 'The ' + s.prot + ' was destroyed.');
    M.waveT -= dt; if (M.waveT <= 0) { const th = M.threat * (1 + M.holdT / s.secs * .8), walls = M.type === 'siege' || s.at === 'haven' ? (DB.crews[room.code].b.walls || 0) : 0, last = M.holdT > s.secs * .75;
      hostDo(room, M, { k: 'wave', x: tgt.x, y: tgt.y, n: Math.round((7 + th * 2.5) * (1 - .1 * walls) * (last ? 1.4 : 1) * (s.big ? 1.35 : 1)), run: Math.min(.6, .06 * th), spec: th >= 2.5, tag: 'wave', brute: (s.brute || 0) + (th >= 5 ? 1 : 0) + (last && s.brute ? 1 : 0), elite: last && th >= 3 ? 1 : 0, grab: M.grab ? 1 : 0, prot: s.prot ? .45 : 0, bars: 1 }); M.waveT = Math.max(11, 25 - th); }
    bop(room, M, { t: 'prog', v: Math.min(1, M.holdT / s.secs), secs: Math.max(0, Math.round(s.secs - M.holdT)), ohp: M.ohp });
    if (M.holdT >= s.secs) nextStage(room, M);
  }
  else if (s.k === 'clear') { if (M.left !== null) { bop(room, M, { t: 'left', n: M.left }); if (M.left <= 0 && M.t > 4) nextStage(room, M); } }
  else if (s.k === 'extract') { if (alive.length && alive.every(p => dist(p.st, tgt) < 320)) nextStage(room, M); }
}
function bonusMet(M) { const b = M.bonus, k = Object.values(M.kills).reduce((a, x) => a + x, 0);
  return b.k === 'nodown' ? M.downs === 0 : b.k === 'fast' ? M.tAll <= b.secs : b.k === 'elite' ? M.elites >= b.n : b.k === 'kills' ? k >= b.n : b.k === 'together' ? M.downs <= 1 : false; }
function endMission(room, M, win, why) {
  if (!M || M.ended) return; M.ended = true; clearTimeout(M.loadTimer); clearTimeout(M.ptsTimer);
  const c = DB.crews[room.code], players = squadOf(room, M);
  let paid = {}; const bonus = win && !M.bonusLost && bonusMet(M);
  if (c) {
    if (win) { for (const k in M.reward) { const v = Math.round(M.reward[k] * (bonus ? 1.5 : 1)); c.res[k] = (c.res[k] || 0) + v; paid[k] = v; } c.done++; if (M.story && !c.storyDone.includes(M.story)) c.storyDone.push(M.story); }
    else { c.fails++; for (const k in c.res) { const loss = Math.floor(c.res[k] * .05); c.res[k] -= loss; } if (M.type === 'siege') { const ks = Object.keys(c.b).filter(k => c.b[k] > 0); if (ks.length) { const k = ks[Math.floor(Math.random() * ks.length)]; c.b[k]--; c.log.push({ t: now(), m: BUILDINGS[k].name + ' lost a level in the siege.' }); } } }
    c.log.push({ t: now(), m: (win ? 'Completed ' : 'Failed ') + M.name + ' (threat ' + M.threat + ')' + (bonus ? ' with the bonus' : '') }); if (c.log.length > 50) c.log.shift();
    makeBoard(c);
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
  { const used = new Set([...room.players.values()].map(q => q.slot)); let sl = 0; while (used.has(sl)) sl++; p.slot = sl; }   // build 58: a colour slot per player
  room.players.set(p.pid, p); p.room = room; p.ready = false; p.op = null; p.wpt = null;
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
const ARMS = new Set(['shotgun', 'rifle', 'smg', 'hunting', 'machete', 'revolver', 'sawnoff', 'ak', 'lmg', 'crossbow', 'katana', 'axe', 'bat', 'sledge', 'scar', 'g36', 'mp5sd', 'uzi', 'svd', 'm14', 'spas', 'm1911', 'glock', 'p226', 'usp', 'skorpion', 'mp5', 'mx4', 'mp7', 'hk53', 'ar15', 'qbz', 'r870', 'model7', 'galil', 'psg1']);
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
    case 'test.skip': if (process.env.CS_TEST === '1') { const n = Math.max(1, Math.min(OPS.length + 1, m.to | 0)); c.storyDone = OPS.slice(0, n - 1).map(o => o.id); c.done = n - 1; for (const k in c.res) c.res[k] += 5000; c.b.power = Math.max(c.b.power, 3); c.b.radio = Math.max(c.b.radio, 4); makeBoard(c); crewUpdate(room); } return;
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
    case 'claim': { if (!M) return; const s = M.stages[M.stage]; if (!s || (s.k !== 'collect' && s.k !== 'build')) return; const pts = stagePts(M, s); const i = m.i | 0, pt = pts[i]; if (!pt || M.claims[i] || i >= s.n) return; if (!p.st || dist(p.st, pt) > 90) return;
      if (s.lure && M.lureT <= 0 && M.pts.lure && dist(p.st, M.pts.lure) > 400) { /* looting while the horde is not baited is allowed: it is just much harder */ }
      M.claims[i] = p.pid; let bar = null; if (s.k === 'build') { bar = { i: M.bars.length, x: pt.x, y: pt.y, cx: stageTarget(M, s).x, cy: stageTarget(M, s).y }; M.bars.push(bar); }
      bop(room, M, { t: 'claimed', i, pid: p.pid, name: p.name, got: Object.keys(M.claims).length, n: s.n, nest: s.nest ? 1 : 0, fire: s.fire ? 1 : 0, bar }); return; }
    // build 56: co-op mechanics
    case 'mon': if (M && p.pid === M.host) { if (m.n !== undefined) M.nearZ = m.n | 0; if (m.ez !== undefined) M.ez = m.ez | 0; if (Array.isArray(m.nk)) M.nk = m.nk.slice(0, 6).map(x => x | 0); if (m.ohp !== undefined && M.ohp !== null) M.ohp = Math.max(0, Math.min(M.ohp, +m.ohp || 0)); } return;
    case 'cargo.grab': { if (!M || !M.cargo || M.cargo.pid || !p.st || p.down) return; if (dist(p.st, M.cargo) > 90) return; M.cargo.pid = p.pid; bop(room, M, { t: 'cargo', c: M.cargo, why: p.name + ' picked it up' }); return; }
    case 'cargo.drop': { if (!M || !M.cargo || M.cargo.pid !== p.pid) return; if (p.st) { M.cargo.x = p.st.x; M.cargo.y = p.st.y; } M.cargo.pid = null; bop(room, M, { t: 'cargo', c: M.cargo, why: p.name + ' put it down' }); return; }
    case 'alarm': { if (!M || p.pid !== M.host) return; const s = M.stages[M.stage]; if (!s || !s.quiet || (M.alarmT && now() - M.alarmT < 20000)) return; M.alarmT = now(); M.alarms++;
      const x = +m.x, y = +m.y; if (isFinite(x) && isFinite(y)) waveAt(room, M, x, y, 1.6, { run: Math.min(.7, .1 * M.threat), spec: true }); bop(room, M, { t: 'chat', name: '', m: 'A screamer went off. Everything on the hill heard it.' }); return; }
    case 'pin': if (M && p.pid === M.host) { const q = room.players.get(m.pid); if (q && q.op === M.id) send(q, { t: 'pin', on: m.on ? 1 : 0, nid: m.nid | 0 }); bop(room, M, { t: 'pinned', pid: m.pid, on: m.on ? 1 : 0 }, p); } return;
    // build 57: the hunted boss, and spitter acid everyone has to see
    case 'hunt': if (M && p.pid === M.host) { const s = M.stages[M.stage]; if (!s || s.k !== 'hunt') return; M.huntSeen = M.t;
      if (isFinite(m.x) && isFinite(m.y)) M.huntPt = { x: Math.round(m.x), y: Math.round(m.y) }; if (m.ph !== undefined) M.huntPh = m.ph | 0;
      bop(room, M, { t: 'huntp', x: M.huntPt.x, y: M.huntPt.y, ph: M.huntPh, hp: +m.hp || 0, flee: m.flee ? 1 : 0, sing: m.sing ? 1 : 0 }, p);
      if (m.dead) { M.elites++; bop(room, M, { t: 'chat', name: '', m: 'It is down. It is finally down.' }); nextStage(room, M); } return; }
    case 'acid': if (M && p.pid === M.host && isFinite(m.x) && isFinite(m.y)) bop(room, M, { t: 'acid', x: Math.round(m.x), y: Math.round(m.y), r: Math.min(140, +m.r || 55), d: Math.min(12, +m.d || 7), x0: isFinite(m.x0) ? Math.round(m.x0) : undefined, y0: isFinite(m.y0) ? Math.round(m.y0) : undefined, g: m.g === 2 ? 2 : m.g ? 1 : 0 }, p); return;
    case 'bk': if (M && p.pid === M.host) { const i = m.i | 0; M.bars = M.bars.filter(b => b.i !== i); bop(room, M, { t: 'bk', i }, p); } return;
    case 'revive': if (M) { const q = room.players.get(m.pid); if (q && q.op === M.id && q.down && p.st && q.st && dist(p.st, q.st) < 80) { send(q, { t: 'revived', by: p.name }); bop(room, M, { t: 'chat', name: '', m: p.name + ' picked up ' + q.name + '.' }); } } return;
    case 'car': if (M) bop(room, M, { t: 'car', pid: p.pid, c: m.c }, p); else bhaven(room, { t: 'car', pid: p.pid, c: m.c }, p); return;
    case 'ping': { if (!isFinite(m.x) || !isFinite(m.y)) return; const o = { t: 'ping', pid: p.pid, name: p.name, x: Math.round(m.x), y: Math.round(m.y) }; if (M) bop(room, M, o, p); else bhaven(room, o, p); return; }
    case 'wpt': { if (m.clear || !isFinite(m.x) || !isFinite(m.y)) p.wpt = null; else p.wpt = { x: Math.round(m.x), y: Math.round(m.y), label: m.label ? String(m.label).slice(0, 40) : null }; crewUpdate(room); return; }
    // build 61: Haven's car park. A vehicle left inside the lot stays there for the whole crew, across sessions
    case 'park': { const c = DB.crews[room.code]; if (!c) return; const x = +m.x, y = +m.y, kind = String(m.kind || '');
      if (!isFinite(x) || !isFinite(y) || x < PARK.x0 || x > PARK.x1 || y < PARK.y0 || y > PARK.y1 || !/^Car_[a-z0-9]+$/.test(kind)) return;
      c.parked = c.parked || []; let e = m.id ? c.parked.find(q => q.id === m.id) : null;
      if (!e) { const max = 6 + 2 * (c.b.garage | 0); if (c.parked.length >= max) { send(p, { t: 'chat', name: '', m: 'The car park is full (' + max + ' spaces). A bigger garage makes room for more.' }); return; }
        c.parkN = (c.parkN | 0) + 1; e = { id: 'pk' + c.parkN }; c.parked.push(e); }
      Object.assign(e, { kind, x: Math.round(x), y: Math.round(y), a: Math.round((+m.a || 0) * 1000) / 1000, col: Math.max(0, Math.min(0xffffff, +m.col | 0)), fuel: Math.round(clampN(+m.fuel || 50, 0, 100)), hp: Math.round(clampN(+m.hp || 100, 1, 100)), by: p.name });
      save(); crewUpdate(room); return; }
    // build 62: things in Haven that spend or earn crew supplies. The server keeps the stores and everyone's cooldowns
    case 'huse': { const c = DB.crews[room.code], k = String(m.k || ''), A = HUSE[k], id = m.id | 0, no = (why, cd) => send(p, { t: 'hused', id, ok: 0, why, cd });
      if (!c || !A) return no('Nothing to do here.'); if (p.op) return no('Not while you are out on an operation.');
      if (p.st && (p.st.x < 5150 || p.st.x > 7650 || p.st.y < 2860 || p.st.y > 4360)) return no('Only inside Haven.');
      for (const b in A.need || {}) if ((c.b[b] | 0) < A.need[b]) return no('Needs ' + b + ' level ' + A.need[b] + '. Build it at the command table.');
      room.hcd = room.hcd || new Map(); const key = p.name + '|' + k + (A.per ? ':' + (m.i | 0) : ''), t0 = room.hcd.get(key) || 0;
      if (now() < t0) return no('Not yet.', Math.ceil((t0 - now()) / 1000));
      for (const r in A.cost || {}) if ((c.res[r] | 0) < A.cost[r]) return no('The crew is short of ' + r + ' (' + (c.res[r] | 0) + ' of ' + A.cost[r] + ').');
      for (const r in A.cost || {}) c.res[r] -= A.cost[r]; for (const r in A.gain || {}) c.res[r] = (c.res[r] | 0) + A.gain[r];
      room.hcd.set(key, now() + A.cd * 1000); send(p, { t: 'hused', id, ok: 1, cd: A.cd }); if (A.cost || A.gain) { save(); crewUpdate(room); } return; }
    case 'unpark': { const c = DB.crews[room.code]; if (!c || !c.parked) return; const i = c.parked.findIndex(q => q.id === m.id); if (i < 0) return; c.parked.splice(i, 1); save(); crewUpdate(room); return; }
    case 'give': { const id = m.id | 0, no = why => send(p, { t: 'gave', id, ok: 0, why }); const q = room.players.get(m.to);
      if (!q || q === p) return no('They are not online.'); if ((q.op || null) !== (p.op || null)) return no('They are not with you.'); if (!p.st || !q.st || dist(p.st, q.st) > 160) return no('Stand closer to them.');
      const k = m.pack || {}, pack = {};
      if (k.band > 0) pack.band = Math.min(20, k.band | 0); if (k.ammo > 0) { pack.ammo = Math.min(400, k.ammo | 0); pack.k = ['ammo', 'shells', 'rifleammo', 'huntammo', 'bolts'].includes(k.k) ? k.k : 'ammo'; } if (k.gun && typeof k.gun.id === 'string' && (ARMS.has(k.gun.id) || ['pistol', 'smg', 'shotgun', 'rifle', 'hunting', 'machete'].includes(k.gun.id))) pack.gun = { id: k.gun.id, mag: Math.max(0, Math.min(150, k.gun.mag | 0)), ammo: Math.max(0, Math.min(400, k.gun.ammo | 0)) };
      if (k.items && typeof k.items === 'object') { const it = {}; for (const key of ['scrap', 'cloth', 'fuel', 'pipe', 'molo', 'bottle']) { const n = k.items[key] | 0; if (n > 0) it[key] = Math.min(99, n); } if (Object.keys(it).length) pack.items = it; }
      if (!Object.keys(pack).length) return no('Nothing to give.');
      if (pack.gun) { const pr = DB.profiles[p.pid]; if (pr && pr.armory && pr.armory[pack.gun.id]) { delete pr.armory[pack.gun.id]; save(); } }   // a gun you hand over leaves your armory too
      send(q, { t: 'given', name: p.name, pid: p.pid, pack }); send(p, { t: 'gave', id, ok: 1, name: q.name, pack }); return; }
    case 'armory': { const id = String(m.id || ''); if (!ARMS.has(id)) return; const prof = DB.profiles[p.pid] || (DB.profiles[p.pid] = { name: p.name, xp: 0, kills: 0, missions: 0 }); prof.armory = prof.armory || {}; if (!prof.armory[id]) { prof.armory[id] = now(); save(); bcast(room, { t: 'chat', name: '', m: p.name + ' found a ' + String(m.name || id).slice(0, 30) + '.' }); } return; }
  }
}
let last = now();
const TSCALE = Math.min(20, +process.env.CS_TSCALE || 1);   // tests only: run mission clocks faster
setInterval(() => { const t = now(), dt = (t - last) / 1000 * TSCALE; last = t; for (const r of rooms.values()) for (const M of [...r.ops.values()]) missionTick(r, M, dt); }, 250);

loadDB().then(() => server.listen(PORT, () => console.log('ColdShore Online on :' + PORT + '  public=' + PUBLIC + '  saves=' + (useSB ? 'supabase' : DBF))));
module.exports = { server };
