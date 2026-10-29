// "Sort It!" learning game — the "Play & Learn" tab of index.html.
// Item data comes from game-data.js. Element ids are prefixed "g-" so they
// don't collide with the photo sorter's ids on the same page.
(function(){
const BINS = window.GAME_BINS;
const ITEMS = window.GAME_ITEMS;
const BIN_BY_KEY = Object.fromEntries(BINS.map(b => [b.key, b]));
const PRACTICE_COUNT = 12;
const CLOCK_SECONDS = 60;

const $ = (id) => document.getElementById(id);
const screens = ['home','play','results','guide'];
function show(name){
  screens.forEach(s => $('g-screen-' + s).hidden = s !== name);
  window.scrollTo(0, 0);
}

// ---------- storage (best scores, sound pref) ----------
function load(key, fallback){
  try{ const v = localStorage.getItem('sortit.' + key); return v === null ? fallback : JSON.parse(v); }
  catch{ return fallback; }
}
function save(key, value){
  try{ localStorage.setItem('sortit.' + key, JSON.stringify(value)); }catch{}
}

// ---------- sound ----------
let soundOn = load('sound', true);
let audioCtx = null;
function beep(freqs, dur = 0.12){
  if(!soundOn) return;
  try{
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    freqs.forEach((f, i) => {
      const o = audioCtx.createOscillator(), g = audioCtx.createGain();
      const t = audioCtx.currentTime + i * dur;
      o.frequency.value = f; o.type = 'triangle';
      g.gain.setValueAtTime(0.15, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + dur);
      o.connect(g).connect(audioCtx.destination);
      o.start(t); o.stop(t + dur);
    });
  }catch{}
}
const sfx = {
  ok: () => beep([660, 880]),
  bad: () => beep([220, 160], 0.16),
  end: () => beep([523, 659, 784, 1047], 0.12),
};
function renderSoundBtn(){ $('g-sound-btn').textContent = soundOn ? '🔊' : '🔇'; }
$('g-sound-btn').addEventListener('click', () => { soundOn = !soundOn; save('sound', soundOn); renderSoundBtn(); });
renderSoundBtn();

// ---------- helpers ----------
function shuffle(arr){
  const a = arr.slice();
  for(let i = a.length - 1; i > 0; i--){ const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
// One of each category first so every round teaches all five bins, then fill randomly.
function buildDeck(count){
  const pool = shuffle(ITEMS);
  const deck = [];
  BINS.forEach(b => { const i = pool.findIndex(it => it.c === b.key); deck.push(pool.splice(i, 1)[0]); });
  return shuffle(deck.concat(pool.slice(0, Math.max(0, count - deck.length))));
}
function binTag(key){
  return `<span class="tag b-${key}">${BIN_BY_KEY[key].icon} ${BIN_BY_KEY[key].label}</span>`;
}
function escapeHtml(s){ return s.replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }

// ---------- bins ----------
BINS.forEach((b, i) => {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'bin b-' + b.key;
  btn.dataset.key = b.key;
  btn.setAttribute('aria-label', `${b.label} — ${b.sub} (key ${i + 1})`);
  btn.innerHTML = `<span class="bi">${b.icon}</span><span class="bl">${b.label}</span><span class="bk">${i + 1}</span>`;
  btn.addEventListener('click', () => answer(b.key));
  $('g-bins').appendChild(btn);
});
const binEls = [...$('g-bins').children];

// ---------- game state ----------
let game = null;

function startGame(mode){
  game = {
    mode,
    deck: mode === 'practice' ? buildDeck(PRACTICE_COUNT) : buildDeck(ITEMS.length),
    index: 0, score: 0, streak: 0, bestStreak: 0, correct: 0, answered: 0,
    misses: [], locked: false, timeLeft: CLOCK_SECONDS, timer: null,
  };
  $('g-bar').classList.toggle('clock', mode === 'clock');
  $('g-hud-progress-label').textContent = mode === 'practice' ? 'Item' : 'Seconds';
  show('play');
  if(mode === 'clock'){
    game.timer = setInterval(tick, 1000);
  }
  updateHud();
  nextItem();
}

function tick(){
  game.timeLeft--;
  updateHud();
  if(game.timeLeft <= 0) endGame();
}

function updateHud(){
  $('g-hud-score').textContent = game.score;
  $('g-hud-streak').textContent = game.streak;
  if(game.mode === 'practice'){
    $('g-hud-progress').textContent = `${Math.min(game.index + 1, game.deck.length)}/${game.deck.length}`;
    $('g-bar-fill').style.width = (game.answered / game.deck.length * 100) + '%';
  }else{
    $('g-hud-progress').textContent = Math.max(0, game.timeLeft);
    $('g-bar-fill').style.width = (Math.max(0, game.timeLeft) / CLOCK_SECONDS * 100) + '%';
  }
}

function nextItem(){
  if(game.index >= game.deck.length){ endGame(); return; }
  const it = game.deck[game.index];
  game.locked = false;
  $('g-feedback').hidden = true;
  binEls.forEach(b => { b.disabled = false; b.classList.remove('dim', 'over'); });
  const el = $('g-item');
  el.style.transform = '';
  el.style.opacity = '';
  el.classList.remove('pop', 'shake');
  void el.offsetWidth;
  el.classList.add('pop');
  $('g-item-emoji').textContent = it.e;
  $('g-item-name').textContent = it.n;
  el.setAttribute('aria-label', it.n);
  updateHud();
}

function answer(key){
  if(!game || game.locked) return;
  game.locked = true;
  const it = game.deck[game.index];
  const right = key === it.c;
  game.answered++;
  const el = $('g-item');

  if(right){
    game.correct++;
    game.streak++;
    game.bestStreak = Math.max(game.bestStreak, game.streak);
    game.score += 10 + Math.min(game.streak - 1, 5) * 2;
    sfx.ok();
    // Fly the item into the bin it was dropped on.
    const r1 = el.getBoundingClientRect();
    const r2 = binEls.find(b => b.dataset.key === key).getBoundingClientRect();
    el.style.transition = 'transform .35s ease-in, opacity .35s';
    el.style.transform = `translate(${r2.left + r2.width/2 - (r1.left + r1.width/2)}px, ${r2.top + r2.height/2 - (r1.top + r1.height/2)}px) scale(.2)`;
    el.style.opacity = '0';
  }else{
    game.streak = 0;
    game.misses.push({ item: it, picked: key });
    sfx.bad();
    el.style.transform = '';
    el.classList.remove('shake'); void el.offsetWidth; el.classList.add('shake');
  }
  binEls.forEach(b => { b.disabled = true; if(b.dataset.key !== it.c) b.classList.add('dim'); });
  updateHud();

  if(game.mode === 'practice'){
    const fb = $('g-feedback');
    fb.className = 'feedback ' + (right ? 'ok' : 'bad');
    $('g-fb-title').textContent = right
      ? pick(['✅ Correct!', '✅ Nice sorting!', '✅ You got it!', '✅ Exactly right!'])
      : `❌ Not quite — it goes in ${BIN_BY_KEY[it.c].label}`;
    $('g-fb-text').textContent = `${it.e} ${it.n}: ${it.t}`;
    $('g-fb-next').textContent = game.index + 1 >= game.deck.length ? 'See my results →' : 'Next item →';
    fb.hidden = false;
    $('g-fb-next').focus({ preventScroll: true });
    fb.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }else{
    toast(right ? `✅ +${10 + Math.min(game.streak - 1, 5) * 2}` : `❌ ${BIN_BY_KEY[it.c].icon} ${BIN_BY_KEY[it.c].label}`);
    setTimeout(() => {
      if(!game || game.timeLeft <= 0) return;
      game.index++;
      nextItem();
    }, right ? 450 : 1300);
  }
}
function pick(arr){ return arr[Math.floor(Math.random() * arr.length)]; }

$('g-fb-next').addEventListener('click', () => { game.index++; nextItem(); });

let toastTimer = null;
function toast(msg){
  const t = $('g-toast');
  t.textContent = msg; t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.hidden = true, 1100);
}

const RANKS = [
  { min: 100, badge: '🏆', rank: 'OKC Sorting Champion!' },
  { min: 80,  badge: '🌟', rank: 'Recycling Pro' },
  { min: 60,  badge: '♻️', rank: 'Green Cart Guardian' },
  { min: 40,  badge: '🌱', rank: 'Sorting Sprout' },
  { min: 0,   badge: '🐣', rank: 'Trash Trainee' },
];

function endGame(){
  if(!game) return;
  clearInterval(game.timer);
  const g = game;
  game = null;
  $('g-toast').hidden = true;
  sfx.end();

  const pct = g.answered ? Math.round(g.correct / g.answered * 100) : 0;
  const r = RANKS.find(r => pct >= r.min);
  $('g-res-badge').textContent = r.badge;
  $('g-res-rank').textContent = r.rank;
  $('g-res-score').textContent = g.score + ' pts';
  $('g-res-detail').textContent = `${g.correct} of ${g.answered} correct (${pct}%) · best streak ${g.bestStreak} 🔥`;

  const best = load('best', {});
  const prev = best[g.mode] || 0;
  if(g.score > prev){
    best[g.mode] = g.score; save('best', best);
    $('g-res-best').textContent = prev ? `🎉 New high score! (old best: ${prev})` : '🎉 First high score set!';
  }else{
    $('g-res-best').textContent = `High score: ${prev}`;
  }

  const list = $('g-review');
  list.innerHTML = '';
  if(g.misses.length){
    g.misses.forEach(m => {
      const li = document.createElement('li');
      li.innerHTML = `<span class="e">${m.item.e}</span><div><b>${escapeHtml(m.item.n)}</b><br>${binTag(m.item.c)}<br><span class="muted">${escapeHtml(m.item.t)}</span></div>`;
      list.appendChild(li);
    });
    $('g-review-card').querySelector('h2').textContent = '📝 Items to remember';
  }else{
    $('g-review-card').querySelector('h2').textContent = g.answered ? '💯 Perfect round — no mistakes!' : 'No items sorted this time.';
  }
  $('g-again-btn').onclick = () => startGame(g.mode);
  show('results');
  renderBest();
}

function stopGame(){
  if(!game) return;
  clearInterval(game.timer);
  game = null;
  $('g-toast').hidden = true;
  show('home');
}
$('g-quit-btn').addEventListener('click', stopGame);
window.SortItGame = { stop: stopGame };

// ---------- drag & drop (pointer events: mouse, touch, pen) ----------
(function setupDrag(){
  const el = $('g-item');
  let start = null, dragging = false, overBin = null;

  function binAt(x, y){
    const hit = document.elementFromPoint(x, y);
    return hit && hit.closest ? hit.closest('.bin') : null;
  }
  el.addEventListener('pointerdown', (e) => {
    if(!game || game.locked) return;
    start = { x: e.clientX, y: e.clientY };
    dragging = false;
    e.preventDefault();
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', cancel);
  });
  function move(e){
    const dx = e.clientX - start.x, dy = e.clientY - start.y;
    if(!dragging && Math.hypot(dx, dy) < 6) return;
    dragging = true;
    el.classList.add('dragging');
    el.classList.remove('pop');
    el.style.transform = `translate(${dx}px, ${dy}px) rotate(${Math.max(-12, Math.min(12, dx / 12))}deg)`;
    const b = binAt(e.clientX, e.clientY);
    if(b !== overBin){
      overBin && overBin.classList.remove('over');
      overBin = b;
      overBin && overBin.classList.add('over');
    }
  }
  function finish(){
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', up);
    window.removeEventListener('pointercancel', cancel);
    el.classList.remove('dragging');
    overBin && overBin.classList.remove('over');
  }
  function up(e){
    const target = dragging ? binAt(e.clientX, e.clientY) : null;
    finish();
    overBin = null;
    if(target){ answer(target.dataset.key); }
    else{ el.style.transition = 'transform .2s'; el.style.transform = ''; setTimeout(() => el.style.transition = '', 200); }
  }
  function cancel(){ finish(); overBin = null; el.style.transform = ''; }
})();

// Keyboard: 1–5 picks a bin, Enter/Space advances.
document.addEventListener('keydown', (e) => {
  if(!game) return;
  const n = parseInt(e.key, 10);
  if(n >= 1 && n <= BINS.length && !game.locked){ answer(BINS[n - 1].key); }
});

// ---------- guide ----------
(function buildGuide(){
  const wrap = $('g-guide-list');
  BINS.forEach(b => {
    const items = ITEMS.filter(it => it.c === b.key);
    const d = document.createElement('details');
    d.innerHTML = `
      <summary class="b-${b.key}"><span style="font-size:1.4rem">${b.icon}</span>
        <span>${b.label}<br><small style="font-weight:500;opacity:.9">${b.sub}</small></span>
        <span class="count">${items.length} items ▾</span></summary>
      <p class="blurb muted">${escapeHtml(b.blurb)}</p>
      <ul>${items.map(it => `<li><b>${it.e} ${escapeHtml(it.n)}</b> — <span class="muted">${escapeHtml(it.t)}</span></li>`).join('')}</ul>`;
    wrap.appendChild(d);
  });
})();

// ---------- home ----------
function renderBest(){
  const best = load('best', {});
  const parts = [];
  if(best.practice) parts.push(`🎓 Learn & Play best: ${best.practice}`);
  if(best.clock) parts.push(`⏱️ Beat the Clock best: ${best.clock}`);
  $('g-best-scores').textContent = parts.join(' · ');
}
$('g-play-practice').addEventListener('click', () => startGame('practice'));
$('g-play-clock').addEventListener('click', () => startGame('clock'));
$('g-open-guide').addEventListener('click', () => show('guide'));
$('g-guide-play').addEventListener('click', () => startGame('practice'));
$('g-guide-home').addEventListener('click', () => show('home'));
$('g-home-btn').addEventListener('click', () => show('home'));
renderBest();
})();
