// OKC Sort Games — arcade-style learning games (public/games.html).
//
// Modes:
//   rush  — Conveyor Rush: items ride a belt; sort them before they fall off.
//           3 lives, the belt speeds up every level, combos multiply points.
//   daily — Daily Challenge: the same 10 items for everyone today (seeded by date).
//   learn — Learn Mode: 12 items, no timer, a rule explanation after each answer.
// More games (Swipe It, Bin Catcher, Photo Hunt) live in minigames.js and plug
// in through window.SortItCore below.
//
// Item data comes from game-data.js. All markup is built here: the home/menu
// screens render into #game-panel, and the full-screen game ("arena") is
// appended to <body>. Classes are prefixed "sg-" (see game.css).
(function(){
const BINS = window.GAME_BINS;
const ITEMS = window.GAME_ITEMS;
const BIN = Object.fromEntries(BINS.map(b => [b.key, b]));
const SHORT = { regular_trash:'Blue Cart', recycling:'Green Cart', bulky_pickup:'Bulky', hazardous_waste:'Hazard', not_accepted:'Not Taken' };
const COLOR = { regular_trash:'#2f80ff', recycling:'#22c55e', bulky_pickup:'#f59e0b', hazardous_waste:'#ef4444', not_accepted:'#64748b' };

const LEARN_COUNT = 12;
const DAILY_COUNT = 10;
const PER_LEVEL = 6;        // correct sorts needed to level up in Rush
const START_LIVES = 3, MAX_LIVES = 5;

const BADGES = [
  { id:'first',    icon:'🌱', name:'First Sort',      desc:'Sort your first item correctly' },
  { id:'combo10',  icon:'🔥', name:'On Fire',         desc:'Reach a 10× combo' },
  { id:'level5',   icon:'⚡', name:'Speed Demon',     desc:'Reach level 5 in Conveyor Rush' },
  { id:'perfect',  icon:'🎓', name:'Perfect Student', desc:'Get 12/12 in Learn Mode' },
  { id:'daily',    icon:'📅', name:'Daily Sorter',    desc:'Finish a Daily Challenge' },
  { id:'streak3',  icon:'🗓️', name:'Habit Builder',   desc:'Play the Daily Challenge 3 days in a row' },
  { id:'hazard10', icon:'☣️', name:'Hazard Hero',     desc:'Correctly sort 10 hazardous items' },
  { id:'score5k',  icon:'💎', name:'High Roller',     desc:'Score 5,000 points in one game' },
  { id:'swipe20',  icon:'👆', name:'Swipe Star',      desc:'Get 20 right in one Swipe It round' },
  { id:'catch300', icon:'🧺', name:'Catch Master',    desc:'Score 300 in Bin Catcher' },
  { id:'hunter',   icon:'📸', name:'Photo Hunter',    desc:'Complete a Photo Hunt mission' },
  { id:'hunter5',  icon:'🕵️', name:'Super Sleuth',    desc:'Complete 5 Photo Hunt missions' },
  { id:'found50',  icon:'🔍', name:'Collector',       desc:'Discover 50 items' },
  { id:'foundAll', icon:'👑', name:'Trash Master',    desc:`Discover all ${ITEMS.length} items` },
];

const panel = document.getElementById('game-panel');
const esc = (s) => String(s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const binTag = (k) => `<span class="sg-tag" style="background:${COLOR[k]}">${BIN[k].icon} ${esc(BIN[k].label)}</span>`;

// ---------- saved progress (per browser) ----------
const DEFAULT_SAVE = { best:{ rush:0, daily:0, learn:0, swipe:0, catch:0 }, found:[], badges:[], hazard:0, sound:true, hunt:0,
                       daily:{ date:'', best:0, streak:0 } };
let save = (function(){
  try{ return Object.assign({}, DEFAULT_SAVE, JSON.parse(localStorage.getItem('sortit.v2')) || {}); }
  catch{ return JSON.parse(JSON.stringify(DEFAULT_SAVE)); }
})();
save.best = Object.assign({}, DEFAULT_SAVE.best, save.best);
function persist(){ try{ localStorage.setItem('sortit.v2', JSON.stringify(save)); }catch{} }
const found = new Set(save.found);

// ---------- dates & seeded random (Daily Challenge) ----------
function dayKey(d = new Date()){ return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0'); }
function yesterdayKey(){ const d = new Date(); d.setDate(d.getDate() - 1); return dayKey(d); }
function seeded(str){
  let h = 1779033703 ^ str.length;
  for(let i = 0; i < str.length; i++){ h = Math.imul(h ^ str.charCodeAt(i), 3432918353); h = h << 13 | h >>> 19; }
  return function(){ h = Math.imul(h ^ h >>> 16, 2246822507); h = Math.imul(h ^ h >>> 13, 3266489909); h ^= h >>> 16; return (h >>> 0) / 4294967296; };
}
function shuffle(arr, rnd = Math.random){
  const a = arr.slice();
  for(let i = a.length - 1; i > 0; i--){ const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
// At least `perBin` items from every bin, then fill to `count`, shuffled.
function balancedDeck(count, perBin, rnd = Math.random){
  const pool = shuffle(ITEMS, rnd), deck = [];
  BINS.forEach(b => {
    for(let n = 0; n < perBin; n++){ const i = pool.findIndex(it => it.c === b.key); if(i >= 0) deck.push(pool.splice(i, 1)[0]); }
  });
  return shuffle(deck.concat(pool.slice(0, Math.max(0, count - deck.length))), rnd);
}

// ---------- sound & haptics ----------
let actx = null;
function tone(freq, at, dur, type = 'triangle', vol = 0.14, slideTo){
  if(!save.sound) return;
  try{
    actx = actx || new (window.AudioContext || window.webkitAudioContext)();
    const t = actx.currentTime + at, o = actx.createOscillator(), g = actx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if(slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g).connect(actx.destination); o.start(t); o.stop(t + dur + 0.02);
  }catch{}
}
const sfx = {
  ok(combo){ const f = 520 * Math.pow(2, Math.min(combo, 12) / 12); tone(f, 0, .1); tone(f * 1.5, .07, .14); },
  bad(){ tone(200, 0, .25, 'sawtooth', .08, 90); },
  tick(){ tone(660, 0, .08, 'square', .06); },
  go(){ tone(990, 0, .2, 'square', .07); },
  level(){ [523, 659, 784, 1047].forEach((f, i) => tone(f, i * .08, .14)); },
  over(){ [784, 659, 523, 392].forEach((f, i) => tone(f, i * .12, .2)); },
  win(){ [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, i * .09, .18)); },
  badge(){ tone(1175, 0, .12); tone(1568, .1, .25); },
};
const buzz = (p) => { try{ save.sound && navigator.vibrate && navigator.vibrate(p); }catch{} };

// ---------- read aloud (Web Speech API) ----------
function speak(text){
  try{
    if(!text || !('speechSynthesis' in window)) return;
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text.replace(/[\u{1F000}-\u{1FFFF}\u{2600}-\u{27BF}\u{FE0F}]/gu, ''));
    u.lang = 'en-US'; u.rate = 1.02; u.pitch = 1.1;
    speechSynthesis.speak(u);
  }catch{}
}
function stopSpeaking(){ try{ 'speechSynthesis' in window && speechSynthesis.cancel(); }catch{} }

// ---------- badges ----------
let earnedThisGame = [];
function award(id){
  if(save.badges.includes(id)) return;
  save.badges.push(id); persist();
  const b = BADGES.find(x => x.id === id);
  earnedThisGame.push(b);
  sfx.badge();
  toast(`🏅 ${b.icon} ${b.name} unlocked!`);
}
function discover(it){
  if(found.has(it.n)) return;
  found.add(it.n); save.found = [...found]; persist();
  if(found.size >= 50) award('found50');
  if(found.size >= ITEMS.length) award('foundAll');
}

// =====================================================================
// Home & menu pages (inside the tab)
// =====================================================================
let page = 'home', pediaSel = null;

function renderPage(){
  if(page === 'pedia') return renderPedia();
  if(page === 'badges') return renderBadges();
  const best = Math.max(...Object.values(save.best));
  const today = dayKey();
  const playedToday = save.daily.date === today;
  const streak = (save.daily.date === today || save.daily.date === yesterdayKey()) ? save.daily.streak : 0;
  const floaters = ['🥫','🍌','🔋','📦','🛞','🧃','💡','🍕'].map((e, i) =>
    `<span style="left:${[4,84,12,90,70,26,50,60][i]}%;top:${[8,12,70,62,82,86,4,40][i]}%;animation-delay:${i * .6}s">${e}</span>`).join('');
  const pill = (k) => save.best[k] ? `<span class="sg-best">🏆 ${save.best[k].toLocaleString()}</span>` : '<span class="sg-best new">NEW</span>';
  const tiles = [
    { id:'daily', icon:'📅', name:'Daily Challenge', desc: streak ? `🔥 ${streak}-day streak` : `Today's ${DAILY_COUNT} items`,
      badge: playedToday ? `<span class="sg-best">✓ ${save.daily.best.toLocaleString()}</span>` : '<span class="sg-best new">TODAY</span>', cls:'daily' },
    { id:'swipe', icon:'👆', name:'Swipe It', desc:'Recycle or not? Swipe fast!', badge: pill('swipe'), cls:'swipe' },
    { id:'catch', icon:'🧺', name:'Bin Catcher', desc:'Tilt or drag to catch', badge: pill('catch'), cls:'catch' },
    { id:'hunt',  icon:'📸', name:'Photo Hunt', desc:'AI scavenger hunt', badge: save.hunt ? `<span class="sg-best">✓ ${save.hunt}</span>` : '<span class="sg-best new">AI</span>', cls:'hunt' },
  ];
  panel.innerHTML = `
  <div class="sg">
    <div class="sg-hero">
      <div class="sg-floaters" aria-hidden="true">${floaters}</div>
      <button class="sg-sound" data-act="sound" aria-label="Toggle sound">${save.sound ? '🔊' : '🔇'}</button>
      <div class="sg-mascot" aria-hidden="true">🗑️</div>
      <h1>OKC Sort<span>GAMES</span></h1>
      <p>Six ways to play and learn where Oklahoma City's trash really goes.</p>
      <div class="sg-stats">
        <div><b>${best.toLocaleString()}</b><span>Best score</span></div>
        <div><b>${found.size}/${ITEMS.length}</b><span>Discovered</span></div>
        <div><b>${save.badges.length}/${BADGES.length}</b><span>Badges</span></div>
      </div>
    </div>
    <button class="sg-mode rush" data-mode="rush">
      <span class="ic">🏭</span>
      <span><b>Conveyor Rush ${save.best.rush ? `<span class="sg-pill">🏆 ${save.best.rush.toLocaleString()}</span>` : '<span class="sg-pill">FEATURED</span>'}</b>
      <small>Sort before it falls off the belt! 3 lives — faster every level.</small></span>
      <span class="go">▶</span>
    </button>
    <div class="sg-gamegrid">${tiles.map(t => `
      <button class="sg-game ${t.cls}" data-${t.id === 'daily' ? 'mode' : 'game'}="${t.id}">
        ${t.badge}<span class="gi">${t.icon}</span><b>${t.name}</b><small>${t.desc}</small>
      </button>`).join('')}
    </div>
    <button class="sg-mode learn" data-mode="learn">
      <span class="ic">🎓</span>
      <span><b>Learn Mode</b><small>${LEARN_COUNT} items, no timer, and a spoken tip after every answer.</small></span>
      <span class="go">▶</span>
    </button>
    <div class="sg-tiles">
      <button class="sg-tile" data-page="pedia"><span class="ti">📖</span><b>Trash-o-pedia</b><small>${found.size} of ${ITEMS.length} found</small>
        <div class="sg-meter"><i style="width:${found.size / ITEMS.length * 100}%"></i></div></button>
      <button class="sg-tile" data-page="badges"><span class="ti">🏅</span><b>Badges</b><small>${save.badges.length} of ${BADGES.length} earned</small>
        <div class="sg-meter"><i style="width:${save.badges.length / BADGES.length * 100}%"></i></div></button>
    </div>
  </div>`;
}

function renderPedia(){
  const sel = pediaSel && ITEMS.find(it => it.n === pediaSel);
  panel.innerHTML = `
  <div class="sg">
    <div class="sg-page-head"><button class="sg-back" data-page="home">← Back</button><h2>📖 Trash-o-pedia</h2></div>
    <p style="margin:0 0 10px;color:var(--sg-muted);font-size:.9rem">The 5 OKC bins. Sort items correctly in any game to unlock them here — ${found.size} of ${ITEMS.length} found.</p>
    ${BINS.map(b => `<div class="sg-binrule" style="background:${COLOR[b.key]}"><span class="bi">${b.icon}</span><span><b>${esc(b.label)} · ${esc(b.sub)}</b><small>${esc(b.blurb)}</small></span></div>`).join('')}
    ${sel ? `<div class="sg-tipbox"><b>${sel.e} ${esc(sel.n)}</b><br>${binTag(sel.c)}<br>${esc(sel.t)}</div>` : ''}
    ${BINS.map(b => {
      const items = ITEMS.filter(it => it.c === b.key);
      const n = items.filter(it => found.has(it.n)).length;
      return `<div class="sg-section-title"><span class="sg-dot" style="background:${COLOR[b.key]}"></span>${esc(b.label)} <small style="color:var(--sg-muted);font-weight:400">${n}/${items.length}</small></div>
      <div class="sg-grid">${items.map(it => found.has(it.n)
        ? `<button class="sg-cell${pediaSel === it.n ? ' sel' : ''}" data-item="${esc(it.n)}"><span class="e">${it.e}</span>${esc(it.n)}</button>`
        : `<div class="sg-cell locked"><span class="e">${it.e}</span>???</div>`).join('')}</div>`;
    }).join('')}
  </div>`;
}

function renderBadges(){
  panel.innerHTML = `
  <div class="sg">
    <div class="sg-page-head"><button class="sg-back" data-page="home">← Back</button><h2>🏅 Badges</h2></div>
    <div class="sg-badges">${BADGES.map(b => {
      const got = save.badges.includes(b.id);
      return `<div class="sg-badge ${got ? 'got' : 'locked'}"><span class="bi">${b.icon}</span><b>${esc(b.name)}</b><small>${got ? '✓ ' : ''}${esc(b.desc)}</small></div>`;
    }).join('')}</div>
  </div>`;
}

panel.addEventListener('click', (e) => {
  const t = e.target.closest('button');
  if(!t) return;
  if(t.dataset.mode) return start(t.dataset.mode);
  if(t.dataset.game){ const g = window.SortItGames && window.SortItGames[t.dataset.game]; if(g) g.start(); return; }
  if(t.dataset.page){ page = t.dataset.page; pediaSel = null; renderPage(); window.scrollTo(0, 0); return; }
  if(t.dataset.item){ pediaSel = t.dataset.item; renderPedia(); window.scrollTo({ top: 0, behavior: 'smooth' }); return; }
  if(t.dataset.act === 'sound'){ save.sound = !save.sound; persist(); renderPage(); }
});

// =====================================================================
// Arena (full-screen game)
// =====================================================================
const arena = document.createElement('div');
arena.className = 'sg-arena';
arena.hidden = true;
arena.innerHTML = `
  <div class="sg-hud">
    <button class="sg-glass sg-iconbtn" data-act="pause" aria-label="Pause">⏸</button>
    <div class="sg-glass sg-lives" aria-label="Lives"></div>
    <div class="sg-glass sg-combo" aria-label="Combo multiplier">×1</div>
    <div class="sg-glass sg-scorebox"><b>0</b><span>Level 1</span></div>
  </div>
  <div class="sg-progress"><i></i></div>
  <div class="sg-stage">
    <div class="sg-belt"><div class="sg-danger"></div></div>
    <div class="sg-belt-label">Drag the item into a bin — or tap a bin · keys 1–5</div>
  </div>
  <div class="sg-item" role="img"><span class="e"></span><span class="n"></span></div>
  <div class="sg-bins">${BINS.map((b, i) => `
    <button class="sg-bin" data-key="${b.key}" aria-label="${esc(b.label)} — ${esc(b.sub)} (key ${i + 1})">
      <span class="lid"></span>
      <span class="body"><span class="bi">${b.icon}</span><span class="bl">${SHORT[b.key]}</span><span class="bk">${i + 1}</span></span>
    </button>`).join('')}
  </div>`;
document.body.appendChild(arena);

const $a = (sel) => arena.querySelector(sel);
const itemEl = $a('.sg-item'), beltEl = $a('.sg-belt');
const canvas = document.createElement('canvas');
canvas.className = 'sg-fx';
document.body.appendChild(canvas);
const binEls = Object.fromEntries([...arena.querySelectorAll('.sg-bin')].map(b => [b.dataset.key, b]));

let G = null;     // current game state, null when no game is running
let raf = null;

function start(mode){
  earnedThisGame = [];
  const rnd = mode === 'daily' ? seeded('okc-' + dayKey()) : Math.random;
  G = {
    mode, deck: mode === 'learn' ? balancedDeck(LEARN_COUNT, 1)
             : mode === 'daily' ? balancedDeck(DAILY_COUNT, 2, rnd)
             : shuffle(ITEMS),
    index: -1, cur: null, score: 0, shown: 0, combo: 0, maxCombo: 0, correct: 0, answered: 0,
    lives: mode === 'learn' ? Infinity : START_LIVES, level: 1, misses: [],
    phase: 'countdown', paused: false, onResume: [], dragging: false,
    x: 0, y: 0, speed: 0, last: performance.now(),
  };
  closeOverlays();
  arena.hidden = false;
  document.body.classList.add('sg-lock');
  itemEl.style.opacity = '0';
  resizeFx();
  updateHud();
  loop();
  if(mode === 'learn'){ beltEl.classList.add('still'); nextItem(); }
  else { beltEl.classList.remove('still'); countdown(); }
}

// Timers that respect pause and die with the game they belong to.
function later(fn, ms){
  const g = G;
  setTimeout(function run(){
    if(G !== g) return;
    if(G.paused){ G.onResume.push(run); return; }
    fn();
  }, ms);
}

function countdown(){
  let n = 3;
  const step = () => {
    if(n > 0){ banner(String(n), ''); sfx.tick(); n--; later(step, 650); }
    else { banner('GO!', G.mode === 'daily' ? `Daily Challenge · ${dayKey()}` : 'Sort before it falls off!'); sfx.go(); later(() => { clearBanner(); nextItem(); }, 550); }
  };
  step();
}

function banner(big, small, cls = ''){
  clearBanner();
  const b = document.createElement('div');
  b.className = 'sg-banner ' + cls;
  b.innerHTML = `<b>${esc(big)}</b>${small ? `<small>${esc(small)}</small>` : ''}`;
  arena.appendChild(b);
}
function clearBanner(){ arena.querySelectorAll('.sg-banner').forEach(b => b.remove()); }

function beltDuration(){ // seconds for an item to cross the belt
  if(G.mode === 'daily') return 6;
  return Math.max(2.4, 7.5 - (G.level - 1) * 0.65);
}

function nextItem(){
  G.index++;
  if(G.mode !== 'rush' && G.index >= G.deck.length) return end();
  if(G.mode === 'rush' && G.index >= G.deck.length){ G.deck = shuffle(ITEMS); G.index = 0; }
  G.cur = G.deck[G.index];
  G.shown++;
  itemEl.querySelector('.e').textContent = G.cur.e;
  itemEl.querySelector('.n').textContent = G.cur.n;
  itemEl.setAttribute('aria-label', G.cur.n);
  itemEl.classList.remove('fly', 'back', 'drag', 'wiggle');
  itemEl.style.opacity = '1';
  Object.values(binEls).forEach(b => b.classList.remove('open', 'teach'));
  const W = arena.clientWidth, br = beltEl.getBoundingClientRect(), ih = itemEl.offsetHeight, iw = itemEl.offsetWidth;
  G.y = br.top + br.height / 2 - ih / 2;
  if(G.mode === 'learn'){ G.x = W / 2 - iw / 2; G.speed = 0; }
  else { G.x = -iw; G.speed = (W + iw) / beltDuration(); beltEl.style.setProperty('--belt-speed', (40 / G.speed) + 's'); }
  placeItem();
  G.phase = 'belt';
  updateHud();
}

function placeItem(){
  const tilt = G.dragging ? Math.max(-14, Math.min(14, G.vx / 40)) : 0;
  itemEl.style.transform = `translate(${G.x}px, ${G.y}px) rotate(${tilt}deg)`;
}

function loop(){
  cancelAnimationFrame(raf);
  const frame = (t) => {
    if(!G && !fx.length){ raf = null; return; }
    const dt = Math.min(0.05, (t - (G ? G.last : t)) / 1000);
    if(G){
      G.last = t;
      if(!G.paused && G.phase === 'belt' && !G.dragging && G.speed){
        G.x += G.speed * dt;
        placeItem();
        if(G.x > arena.clientWidth) fellOff();
      }
    }
    stepFx(dt);
    raf = requestAnimationFrame(frame);
  };
  raf = requestAnimationFrame(frame);
}

// ---------- answering ----------
function answer(key){
  if(!G || G.paused || G.phase !== 'belt') return;
  G.phase = 'resolving';
  G.dragging = false;
  const it = G.cur, ok = key === it.c;
  G.answered++;
  const target = binEls[key].getBoundingClientRect();
  const cx = target.left + target.width / 2, cy = target.top + target.height / 2;

  if(ok){
    G.correct++; G.combo++; G.maxCombo = Math.max(G.maxCombo, G.combo);
    const mult = comboMult();
    const iw = itemEl.offsetWidth, W = arena.clientWidth;
    const speedBonus = G.speed ? Math.round(100 * Math.max(0, 1 - (G.x + iw) / (W + iw))) : 0;
    const pts = (100 + speedBonus) * mult;
    G.score += pts;
    flyInto(binEls[key]);
    burst(cx, cy - 20, COLOR[key], 28);
    floatText(`+${pts}${mult > 1 ? ` ×${mult}` : ''}`, cx, target.top - 10);
    sfx.ok(G.combo); buzz(12);
    discover(it);
    award('first');
    if(it.c === 'hazardous_waste'){ save.hazard++; persist(); if(save.hazard >= 10) award('hazard10'); }
    if(G.combo >= 10) award('combo10');
    if(G.score >= 5000) award('score5k');
    if(G.combo > 1){ const c = $a('.sg-combo'); c.classList.add('bump'); setTimeout(() => c.classList.remove('bump'), 150); }
  }else{
    wrong(it, key);
  }
  updateHud();

  if(G.mode === 'learn'){ later(() => sheet(it, ok, key), ok ? 380 : 700); return; }
  if(ok && G.mode === 'rush' && G.correct % PER_LEVEL === 0){ later(levelUp, 420); return; }
  later(continueOrEnd, ok ? 480 : 1700);
}

function wrong(it, picked){
  G.combo = 0;
  G.misses.push({ it, picked });
  if(G.lives !== Infinity) G.lives--;
  sfx.bad(); buzz([40, 40, 60]);
  arena.classList.remove('shake', 'flash'); void arena.offsetWidth; arena.classList.add('shake', 'flash');
  binEls[it.c].classList.add('teach');
  if(G.mode !== 'learn'){
    chip(`<b>${picked ? '❌ Wrong bin!' : '⏰ Too slow!'} ${it.e} ${esc(it.n)} → ${BIN[it.c].icon} ${esc(BIN[it.c].label)}</b>${esc(it.t)}`, 'bad', 1650);
    // Show where it should have gone.
    later(() => flyInto(binEls[it.c]), 450);
  }else{
    itemEl.classList.remove('wiggle'); void itemEl.offsetWidth; itemEl.classList.add('wiggle');
  }
}

function fellOff(){
  if(G.phase !== 'belt') return;
  G.phase = 'resolving';
  G.answered++;
  G.x = arena.clientWidth - itemEl.offsetWidth;
  placeItem();
  wrong(G.cur, null);
  updateHud();
  later(continueOrEnd, 1700);
}

function continueOrEnd(){
  if(G.lives <= 0) return end();
  nextItem();
}

function comboMult(){ return 1 + Math.min(4, Math.floor(G.combo / 3)); }

function levelUp(){
  G.level++;
  let extra = '';
  if(G.level % 3 === 0 && G.lives < MAX_LIVES){ G.lives++; extra = ' · +1 ❤️'; }
  if(G.level >= 5) award('level5');
  sfx.level(); buzz([20, 30, 20]);
  banner(`LEVEL ${G.level}`, 'Belt speed up!' + extra, 'level');
  const W = arena.clientWidth;
  for(let i = 0; i < 5; i++) burst(W * (0.15 + i * 0.175), arena.clientHeight * 0.4, Object.values(COLOR)[i], 18);
  updateHud();
  later(() => { clearBanner(); nextItem(); }, 1300);
}

function flyInto(bin){
  const r = bin.getBoundingClientRect(), iw = itemEl.offsetWidth, ih = itemEl.offsetHeight;
  const tx = r.left + r.width / 2 - iw / 2, ty = r.top + 10 - ih / 2;
  bin.classList.add('open');
  itemEl.classList.remove('back', 'drag');
  itemEl.classList.add('fly');
  itemEl.style.transform = `translate(${tx}px, ${ty}px) scale(.2) rotate(20deg)`;
  setTimeout(() => { bin.classList.remove('open'); bin.classList.remove('gulp'); void bin.offsetWidth; bin.classList.add('gulp'); }, 300);
}

// ---------- learn-mode explanation sheet ----------
function sheet(it, ok, picked){
  closeOverlays();
  const s = document.createElement('div');
  s.className = 'sg-sheet ' + (ok ? 'ok' : 'bad');
  const last = G.index + 1 >= G.deck.length;
  s.innerHTML = `
    <div class="top"><span class="big">${it.e}</span><div>
      <h3>${ok ? ['Correct! 🎉', 'Nailed it! ✨', 'You got it! 🙌', 'Perfect! 💯'][Math.floor(Math.random() * 4)] : 'Not quite! 🤔'}</h3>
      <div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;font-size:.9rem;margin-top:2px">${esc(it.n)} goes in ${binTag(it.c)}</div>
    </div></div>
    ${!ok && picked ? `<p style="opacity:.7;margin-top:8px">You picked ${esc(BIN[picked].label)}.</p>` : ''}
    <p>💡 ${esc(it.t)}</p>
    ${'speechSynthesis' in window ? '<button class="sg-cta alt" data-act="speak">🗣️ Read it to me</button>' : ''}
    <button class="sg-cta" data-act="next">${last ? 'See my results →' : 'Next item →'}</button>`;
  arena.appendChild(s);
  s.querySelector('[data-act="next"]').focus({ preventScroll: true });
  G.speakText = `${it.n} goes in the ${BIN[it.c].label}. ${it.t}`;
  if(save.sound) speak(G.speakText);
}

// ---------- HUD ----------
function updateHud(){
  if(!G) return;
  const lives = $a('.sg-lives');
  if(G.mode === 'learn'){
    lives.textContent = `🎓 ${Math.min(G.index + 1, G.deck.length) || 1}/${G.deck.length}`;
  }else{
    const max = Math.max(START_LIVES, G.lives);
    lives.innerHTML = Array.from({ length: max }, (_, i) => `<span class="${i < G.lives ? '' : 'lost'}">❤️</span>`).join('');
  }
  const c = $a('.sg-combo'), m = comboMult();
  c.textContent = G.combo >= 3 ? `🔥×${m}` : `×${m}`;
  c.classList.toggle('hot', G.combo >= 3);
  $a('.sg-scorebox b').textContent = G.score.toLocaleString();
  $a('.sg-scorebox span').textContent = G.mode === 'rush' ? `Level ${G.level}` : G.mode === 'daily' ? `Item ${Math.min(G.index + 1, G.deck.length) || 1}/${G.deck.length}` : 'Learn';
  const pct = G.mode === 'rush' ? (G.correct % PER_LEVEL) / PER_LEVEL * 100 : G.answered / G.deck.length * 100;
  $a('.sg-progress i').style.width = pct + '%';
}

let toastTimer = null;
function toast(msg){
  document.querySelectorAll('.sg-toast').forEach(t => t.remove());
  const t = document.createElement('div');
  t.className = 'sg-toast'; t.textContent = msg;
  document.body.appendChild(t);
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.remove(), 2200);
}
function chip(html, cls, ms){
  arena.querySelectorAll('.sg-chip').forEach(c => c.remove());
  const c = document.createElement('div');
  c.className = 'sg-chip ' + cls; c.innerHTML = html;
  arena.appendChild(c);
  setTimeout(() => c.remove(), ms);
}
function floatText(text, x, y){
  const f = document.createElement('div');
  f.className = 'sg-floattext'; f.textContent = text;
  f.style.left = x + 'px'; f.style.top = y + 'px';
  arena.appendChild(f);
  setTimeout(() => f.remove(), 950);
}

// ---------- particles ----------
const fx = [];
const ctx = canvas.getContext('2d');
function resizeFx(){
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = window.innerWidth * dpr; canvas.height = window.innerHeight * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
window.addEventListener('resize', resizeFx);
resizeFx();
function burst(x, y, color, n){
  const palette = [color, '#ffffff', '#fde047'];
  for(let i = 0; i < n; i++){
    const a = Math.random() * Math.PI * 2, v = 120 + Math.random() * 320;
    fx.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 160, life: 0.7 + Math.random() * 0.5, t: 0,
              s: 3 + Math.random() * 5, c: palette[i % 3], sq: Math.random() < 0.5, r: Math.random() * 6 });
  }
  if(!raf) loop();
}
function confetti(){
  const W = window.innerWidth, colors = Object.values(COLOR).concat(['#fde047', '#f472b6']);
  for(let i = 0; i < 140; i++){
    fx.push({ x: Math.random() * W, y: -20 - Math.random() * 200, vx: (Math.random() - .5) * 80, vy: 80 + Math.random() * 160,
              life: 3 + Math.random() * 1.5, t: 0, s: 5 + Math.random() * 5, c: colors[i % colors.length], sq: true, r: Math.random() * 6, g: 60 });
  }
  if(!raf) loop();
}
function stepFx(dt){
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  for(let i = fx.length - 1; i >= 0; i--){
    const p = fx[i];
    p.t += dt;
    if(p.t >= p.life){ fx.splice(i, 1); continue; }
    p.vy += (p.g || 600) * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.r += dt * 8;
    ctx.globalAlpha = Math.max(0, 1 - p.t / p.life);
    ctx.fillStyle = p.c;
    if(p.sq){ ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.r); ctx.fillRect(-p.s / 2, -p.s / 4, p.s, p.s / 2); ctx.restore(); }
    else { ctx.beginPath(); ctx.arc(p.x, p.y, p.s / 2, 0, Math.PI * 2); ctx.fill(); }
  }
  ctx.globalAlpha = 1;
}

// ---------- drag & drop ----------
function binAt(x, y){
  for(const [k, b] of Object.entries(binEls)){
    const r = b.getBoundingClientRect();
    if(x >= r.left - 4 && x <= r.right + 4 && y >= r.top - 30 && y <= r.bottom + 10) return k;
  }
  return null;
}
let drag = null;
itemEl.addEventListener('pointerdown', (e) => {
  if(!G || G.paused || G.phase !== 'belt') return;
  e.preventDefault();
  drag = { dx: e.clientX - G.x, dy: e.clientY - G.y, beltY: G.y, px: e.clientX, over: null };
  G.dragging = true; G.vx = 0;
  itemEl.classList.add('drag'); itemEl.classList.remove('back');
  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
  window.addEventListener('pointercancel', onUp);
});
function onMove(e){
  if(!drag || !G) return;
  G.vx = (e.clientX - drag.px) * 8; drag.px = e.clientX;
  G.x = e.clientX - drag.dx; G.y = e.clientY - drag.dy;
  placeItem();
  const k = binAt(e.clientX, e.clientY);
  if(k !== drag.over){
    drag.over && binEls[drag.over].classList.remove('open');
    drag.over = k;
    k && binEls[k].classList.add('open');
  }
}
function onUp(e){
  window.removeEventListener('pointermove', onMove);
  window.removeEventListener('pointerup', onUp);
  window.removeEventListener('pointercancel', onUp);
  if(!drag || !G){ drag = null; return; }
  const k = e.type === 'pointerup' ? binAt(e.clientX, e.clientY) : null;
  const beltY = drag.beltY;
  drag.over && binEls[drag.over].classList.remove('open');
  drag = null;
  itemEl.classList.remove('drag');
  if(k){ answer(k); return; }
  G.dragging = false; G.vx = 0;
  G.y = beltY;
  itemEl.classList.add('back');
  placeItem();
  setTimeout(() => itemEl.classList.remove('back'), 260);
}

// ---------- arena buttons & keys ----------
arena.addEventListener('click', (e) => {
  const t = e.target.closest('button');
  if(!t || !G) return;
  if(t.dataset.key) return answer(t.dataset.key);
  const act = t.dataset.act;
  if(act === 'pause') return pause();
  if(act === 'resume') return resume();
  if(act === 'quit') return quit();
  if(act === 'sound'){ save.sound = !save.sound; persist(); t.textContent = save.sound ? '🔊 Sound on' : '🔇 Sound off'; return; }
  if(act === 'speak') return speak(G.speakText);
  if(act === 'next'){ stopSpeaking(); closeOverlays(); return continueOrEnd(); }
  if(act === 'again') return start(G.mode);
  if(act === 'share') return share(t);
});
document.addEventListener('keydown', (e) => {
  if(!G || arena.hidden) return;
  if(e.key === 'Escape' || e.key === 'p'){ G.paused ? resume() : (G.phase !== 'over' && pause()); return; }
  const n = parseInt(e.key, 10);
  if(n >= 1 && n <= BINS.length) answer(BINS[n - 1].key);
});
document.addEventListener('visibilitychange', () => { if(document.hidden && G && !G.paused && G.phase !== 'over') pause(); });

function closeOverlays(){ arena.querySelectorAll('.sg-sheet, .sg-overlay').forEach(o => o.remove()); }

function pause(){
  if(!G || G.paused || G.phase === 'over') return;
  G.paused = true;
  beltEl.classList.add('still');
  const o = document.createElement('div');
  o.className = 'sg-overlay';
  o.innerHTML = `<div class="sg-panel sg-glass">
    <h2>⏸ Paused</h2>
    <p style="opacity:.8;margin:0 0 6px">Score ${G.score.toLocaleString()}</p>
    <button class="sg-cta" data-act="resume">▶ Resume</button>
    <button class="sg-cta alt" data-act="sound">${save.sound ? '🔊 Sound on' : '🔇 Sound off'}</button>
    <button class="sg-cta alt" data-act="quit">Quit to menu</button>
  </div>`;
  arena.appendChild(o);
}
function resume(){
  if(!G || !G.paused) return;
  arena.querySelectorAll('.sg-overlay').forEach(o => o.remove());
  G.paused = false;
  G.last = performance.now();
  if(G.mode !== 'learn') beltEl.classList.remove('still');
  const q = G.onResume; G.onResume = [];
  q.forEach(fn => fn());
}

function quit(){
  stopSpeaking();
  G = null;
  fx.length = 0;
  arena.hidden = true;
  closeOverlays(); clearBanner();
  arena.querySelectorAll('.sg-chip, .sg-toast, .sg-floattext').forEach(x => x.remove());
  document.body.classList.remove('sg-lock');
  page = 'home';
  renderPage();
}

// ---------- results ----------
function end(){
  const g = G;
  g.phase = 'over';
  itemEl.style.opacity = '0';
  const acc = g.answered ? g.correct / g.answered : 0;

  let newBest = false;
  if(g.mode === 'daily'){
    const today = dayKey();
    if(save.daily.date !== today){
      save.daily.streak = save.daily.date === yesterdayKey() ? save.daily.streak + 1 : 1;
      save.daily.date = today; save.daily.best = 0;
    }
    if(g.score > save.daily.best){ save.daily.best = g.score; }
    award('daily');
    if(save.daily.streak >= 3) award('streak3');
  }
  if(g.mode === 'learn' && g.correct === g.deck.length) award('perfect');
  if(g.score > (save.best[g.mode] || 0)){ newBest = true; save.best[g.mode] = g.score; }
  persist();

  const stars = acc >= 0.9 ? 3 : acc >= 0.7 ? 2 : acc >= 0.4 ? 1 : 0;
  const title = g.mode === 'rush' ? (g.score >= 3000 ? 'Incredible run! 🚀' : 'Game over!')
              : g.mode === 'daily' ? 'Daily complete! 📅' : stars === 3 ? 'Class dismissed! 🎓' : 'Round complete!';
  const rank = acc >= 0.95 ? '🏆 OKC Sorting Champion' : acc >= 0.8 ? '🌟 Recycling Pro' : acc >= 0.6 ? '♻️ Green Cart Guardian' : acc >= 0.4 ? '🌱 Sorting Sprout' : '🐣 Trash Trainee';
  const seen = new Set();
  const misses = g.misses.filter(m => !seen.has(m.it.n) && seen.add(m.it.n));

  const o = document.createElement('div');
  o.className = 'sg-overlay';
  o.innerHTML = `<div class="sg-panel sg-glass">
    <h2>${title}</h2>
    <div style="opacity:.85">${rank}</div>
    <div class="sg-stars">${[0, 1, 2].map(i => `<span class="${i < stars ? 'on' : ''}" style="animation-delay:${.2 + i * .25}s">⭐</span>`).join('')}</div>
    <div class="sg-final" data-final="${g.score}">0</div>
    ${newBest ? '<div class="sg-newbest">🎉 NEW HIGH SCORE!</div>' : `<div style="opacity:.7;font-size:.9rem">Best: ${(save.best[g.mode] || 0).toLocaleString()}</div>`}
    <div class="sg-kv">
      <div class="sg-glass"><b>${g.correct}/${g.answered}</b><span>Correct</span></div>
      <div class="sg-glass"><b>${Math.round(acc * 100)}%</b><span>Accuracy</span></div>
      <div class="sg-glass"><b>${g.mode === 'rush' ? 'Lv ' + g.level : '🔥' + g.maxCombo}</b><span>${g.mode === 'rush' ? 'Reached' : 'Best combo'}</span></div>
    </div>
    ${g.mode === 'daily' ? `<div style="font-size:.9rem;opacity:.85">🔥 ${save.daily.streak}-day streak · come back tomorrow for new items!</div>` : ''}
    ${earnedThisGame.length ? `<div class="sg-earned">🏅 Badges earned: ${earnedThisGame.map(b => `<b>${b.icon} ${esc(b.name)}</b>`).join(' · ')}</div>` : ''}
    <div class="sg-btnrow" style="margin-top:6px">
      <button class="sg-cta" data-act="again">↻ Play again</button>
      <button class="sg-cta alt" data-act="share">📤 Share</button>
    </div>
    <button class="sg-cta alt" data-act="quit">Menu</button>
    ${misses.length ? `<div class="sg-review"><h3>📝 Remember these</h3><ul>${misses.map(m => `
      <li><span class="e">${m.it.e}</span><div><b>${esc(m.it.n)}</b> → ${binTag(m.it.c)}<br><small>${esc(m.it.t)}</small></div></li>`).join('')}</ul></div>`
      : g.answered ? '<div class="sg-review" style="text-align:center"><h3>💯 Flawless — no mistakes!</h3></div>' : ''}
  </div>`;
  closeOverlays();
  arena.appendChild(o);

  // Count the score up.
  const el = o.querySelector('.sg-final'), t0 = performance.now(), dur = 900;
  (function count(t){
    const k = Math.min(1, (t - t0) / dur);
    el.textContent = Math.round(g.score * (1 - Math.pow(1 - k, 3))).toLocaleString();
    if(k < 1 && G === g) requestAnimationFrame(count);
  })(t0);

  if(newBest || stars === 3){ confetti(); sfx.win(); } else sfx.over();
}

function share(btn){
  const g = G;
  const url = location.origin + location.pathname;
  const what = g.mode === 'daily' ? `the OKC Daily Challenge (${dayKey()})` : g.mode === 'rush' ? 'Conveyor Rush' : 'Learn Mode';
  const text = `I scored ${g.score.toLocaleString()} in ${what} on OKC Sort 🗑️♻️ — ${g.correct}/${g.answered} sorted right. Can you beat me?`;
  if(navigator.share){ navigator.share({ title: 'OKC Sort Games', text, url }).catch(() => {}); return; }
  try{
    navigator.clipboard.writeText(text + ' ' + url).then(() => { btn.textContent = '✓ Copied!'; }, () => { btn.textContent = 'Copy failed'; });
  }catch{ btn.textContent = 'Copy failed'; }
}

// ---------- public hooks ----------
window.SortItGames = window.SortItGames || {};
window.SortItCore = {
  BINS, ITEMS, BIN, COLOR, SHORT, save, persist, award, discover, sfx, buzz, esc, binTag, shuffle,
  burst, confetti, toast, speak, stopSpeaking,
  resetEarned(){ earnedThisGame = []; }, earned(){ return earnedThisGame.slice(); },
  home(){ stopSpeaking(); document.body.classList.remove('sg-lock'); page = 'home'; renderPage(); },
};
window.SortItGame = { stop(){
  if(G) quit();
  Object.values(window.SortItGames).forEach(g => g.stop && g.stop());
} };
renderPage();
})();
