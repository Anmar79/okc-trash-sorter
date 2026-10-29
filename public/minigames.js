// Extra games for OKC Sort Games: Swipe It, Bin Catcher and Photo Hunt.
// They share sounds, badges, particles and saved progress with game.js
// through window.SortItCore, and register themselves in window.SortItGames.
(function(){
const C = window.SortItCore;
const { BINS, ITEMS, BIN, COLOR, SHORT, esc, binTag, shuffle, sfx, buzz, award, discover } = C;
const save = C.save;

// ---------------------------------------------------------------------
// Shared full-screen shell, overlays and results
// ---------------------------------------------------------------------
function shell(cls, title){
  const el = document.createElement('div');
  el.className = 'sg-arena sg-mini ' + cls;
  el.innerHTML = `
    <div class="sg-hud">
      <button class="sg-glass sg-iconbtn" data-x="pause" aria-label="Pause">⏸</button>
      <div class="sg-glass sg-mini-title">${title}</div>
      <div class="sg-glass sg-scorebox"><b data-hud="score">0</b><span data-hud="sub"></span></div>
    </div>
    <div class="sg-progress"><i data-hud="bar"></i></div>
    <div class="sg-mini-body"></div>`;
  document.body.appendChild(el);
  document.body.classList.add('sg-lock');
  C.resetEarned();
  return el;
}
const hud = (el, key, val) => { const n = el.querySelector(`[data-hud="${key}"]`); if(n) n.textContent = val; };
function overlay(el, html){
  el.querySelectorAll('.sg-overlay').forEach(o => o.remove());
  const o = document.createElement('div');
  o.className = 'sg-overlay';
  o.innerHTML = `<div class="sg-panel sg-glass">${html}</div>`;
  el.appendChild(o);
  return o;
}
function pauseMenu(el, score){
  return overlay(el, `<h2>⏸ Paused</h2><p style="opacity:.8;margin:0 0 6px">Score ${score.toLocaleString()}</p>
    <button class="sg-cta" data-x="resume">▶ Resume</button>
    <button class="sg-cta alt" data-x="quit">Quit to menu</button>`);
}
function chip(el, html, cls, ms){
  el.querySelectorAll('.sg-chip').forEach(c => c.remove());
  const c = document.createElement('div');
  c.className = 'sg-chip ' + cls; c.innerHTML = html;
  el.appendChild(c);
  setTimeout(() => c.remove(), ms);
}
function floatText(el, text, x, y){
  const f = document.createElement('div');
  f.className = 'sg-floattext'; f.textContent = text;
  f.style.left = x + 'px'; f.style.top = y + 'px';
  el.appendChild(f);
  setTimeout(() => f.remove(), 950);
}
function shake(el){ el.classList.remove('shake', 'flash'); void el.offsetWidth; el.classList.add('shake', 'flash'); }

// Results screen shared by all three games.
function results(el, o){
  const prev = save.best[o.key] || 0;
  const newBest = o.score > prev;
  if(newBest){ save.best[o.key] = o.score; C.persist(); }
  const stars = o.acc >= 0.9 ? 3 : o.acc >= 0.7 ? 2 : o.acc >= 0.4 ? 1 : 0;
  const earned = C.earned();
  const seen = new Set();
  const misses = (o.misses || []).filter(m => !seen.has(m.it.n) && seen.add(m.it.n));
  const ov = overlay(el, `
    <h2>${o.title}</h2>
    <div class="sg-stars">${[0, 1, 2].map(i => `<span class="${i < stars ? 'on' : ''}" style="animation-delay:${.2 + i * .25}s">⭐</span>`).join('')}</div>
    <div class="sg-final">${o.score.toLocaleString()}</div>
    ${newBest ? '<div class="sg-newbest">🎉 NEW HIGH SCORE!</div>' : `<div style="opacity:.7;font-size:.9rem">Best: ${prev.toLocaleString()}</div>`}
    <div class="sg-kv">${o.stats.map(([v, l]) => `<div class="sg-glass"><b>${v}</b><span>${l}</span></div>`).join('')}</div>
    ${earned.length ? `<div class="sg-earned">🏅 Badges earned: ${earned.map(b => `<b>${b.icon} ${esc(b.name)}</b>`).join(' · ')}</div>` : ''}
    <div class="sg-btnrow" style="margin-top:6px">
      <button class="sg-cta" data-x="again">↻ Play again</button>
      <button class="sg-cta alt" data-x="share">📤 Share</button>
    </div>
    <button class="sg-cta alt" data-x="quit">Menu</button>
    ${misses.length ? `<div class="sg-review"><h3>📝 Remember these</h3><ul>${misses.map(m => `
      <li><span class="e">${m.it.e}</span><div><b>${esc(m.it.n)}</b> → ${binTag(m.it.c)}<br><small>${esc(m.it.t)}</small></div></li>`).join('')}</ul></div>` : ''}`);
  if(newBest || stars === 3){ C.confetti(); sfx.win(); } else sfx.over();
  ov.querySelector('[data-x="share"]').addEventListener('click', (e) => share(e.currentTarget, o.shareText));
}
function share(btn, text){
  const url = location.origin + location.pathname;
  if(navigator.share){ navigator.share({ title: 'OKC Sort Games', text, url }).catch(() => {}); return; }
  try{ navigator.clipboard.writeText(text + ' ' + url).then(() => { btn.textContent = '✓ Copied!'; }, () => { btn.textContent = 'Copy failed'; }); }
  catch{ btn.textContent = 'Copy failed'; }
}
function close(el){ el.remove(); document.querySelectorAll('.sg-toast').forEach(t => t.remove()); C.home(); }

// =====================================================================
// 👆 Swipe It — "Recycle or not?" Swipe right to recycle, left if not.
// =====================================================================
const SwipeIt = (function(){
  const SECONDS = 45;
  let S = null;

  function deck(){
    const rec = shuffle(ITEMS.filter(i => i.c === 'recycling'));
    const non = shuffle(ITEMS.filter(i => i.c !== 'recycling'));
    const d = [];
    while(rec.length || non.length){
      d.push((Math.random() < 0.48 && rec.length) || !non.length ? rec.pop() : non.pop());
    }
    return d;
  }

  function start(){
    const el = shell('sg-swipe', '👆 Swipe It');
    el.querySelector('.sg-mini-body').innerHTML = `
      <div class="sw-zone">
        <div class="sw-side left"><span>🚫</span><b>NOT</b><small>recyclable</small></div>
        <div class="sw-side right"><span>♻️</span><b>RECYCLE</b><small>Big Green Cart</small></div>
        <div class="sw-stack"></div>
      </div>
      <div class="sw-btns">
        <button class="sw-btn no" data-sw="left" aria-label="Not recyclable">✖</button>
        <div class="sw-help">Swipe the card<br>or press ← →</div>
        <button class="sw-btn yes" data-sw="right" aria-label="Recycle">♻️</button>
      </div>`;
    S = { el, deck: deck(), i: 0, score: 0, correct: 0, answered: 0, streak: 0, best: 0, misses: [],
          time: SECONDS, paused: false, over: false, busy: false, timer: null };
    el.addEventListener('click', onClick);
    renderCards();
    update();
    S.timer = setInterval(tick, 1000);
  }

  function tick(){
    if(!S || S.paused || S.over) return;
    S.time--;
    update();
    if(S.time <= 5 && S.time > 0) sfx.tick();
    if(S.time <= 0) end();
  }

  function update(){
    hud(S.el, 'score', S.score.toLocaleString());
    hud(S.el, 'sub', `⏱ ${Math.max(0, S.time)}s · 🔥${S.streak}`);
    S.el.querySelector('[data-hud="bar"]').style.width = (S.time / SECONDS * 100) + '%';
  }

  function cardHTML(it, cls){
    return `<div class="sw-card ${cls}"><span class="e">${it.e}</span><b>${esc(it.n)}</b><small>Recyclable in OKC?</small>
      <span class="sw-stamp yes">RECYCLE</span><span class="sw-stamp no">NOPE</span></div>`;
  }
  function renderCards(){
    const stack = S.el.querySelector('.sw-stack');
    const cur = S.deck[S.i], nxt = S.deck[S.i + 1];
    stack.innerHTML = (nxt ? cardHTML(nxt, 'back') : '') + (cur ? cardHTML(cur, 'top') : '');
    const top = stack.querySelector('.top');
    if(top) bindDrag(top);
  }

  function bindDrag(card){
    let sx = 0, dx = 0, down = false;
    card.addEventListener('pointerdown', (e) => {
      if(S.paused || S.busy) return;
      down = true; sx = e.clientX; dx = 0;
      card.setPointerCapture(e.pointerId);
      card.classList.add('drag');
    });
    card.addEventListener('pointermove', (e) => {
      if(!down) return;
      dx = e.clientX - sx;
      card.style.transform = `translateX(${dx}px) rotate(${dx / 14}deg)`;
      card.style.setProperty('--yes', Math.max(0, Math.min(1, dx / 110)));
      card.style.setProperty('--no', Math.max(0, Math.min(1, -dx / 110)));
      S.el.querySelector('.sw-side.right').style.opacity = 0.35 + Math.max(0, dx) / 150;
      S.el.querySelector('.sw-side.left').style.opacity = 0.35 + Math.max(0, -dx) / 150;
    });
    const up = () => {
      if(!down) return;
      down = false;
      card.classList.remove('drag');
      S.el.querySelectorAll('.sw-side').forEach(s => s.style.opacity = '');
      if(Math.abs(dx) > 90) decide(dx > 0 ? 'right' : 'left');
      else { card.style.transform = ''; card.style.setProperty('--yes', 0); card.style.setProperty('--no', 0); }
    };
    card.addEventListener('pointerup', up);
    card.addEventListener('pointercancel', up);
  }

  function decide(dir){
    if(!S || S.paused || S.over || S.busy) return;
    const it = S.deck[S.i];
    if(!it) return;
    S.busy = true;
    const card = S.el.querySelector('.sw-card.top');
    const ok = (dir === 'right') === (it.c === 'recycling');
    S.answered++;
    card.classList.add('fly');
    card.style.setProperty(dir === 'right' ? '--yes' : '--no', 1);
    card.style.transform = `translateX(${dir === 'right' ? 140 : -140}vw) rotate(${dir === 'right' ? 35 : -35}deg)`;
    const r = card.getBoundingClientRect();
    if(ok){
      S.correct++; S.streak++; S.best = Math.max(S.best, S.streak);
      const mult = 1 + Math.min(4, Math.floor(S.streak / 4));
      const pts = 100 * mult;
      S.score += pts;
      sfx.ok(S.streak); buzz(10);
      C.burst(r.left + r.width / 2, r.top + r.height / 2, it.c === 'recycling' ? COLOR.recycling : COLOR[it.c], 22);
      floatText(S.el, `+${pts}${mult > 1 ? ' ×' + mult : ''}`, window.innerWidth / 2, r.top);
      discover(it);
      if(S.correct >= 20) award('swipe20');
    }else{
      S.streak = 0;
      S.misses.push({ it });
      sfx.bad(); buzz([40, 40, 60]); shake(S.el);
      chip(S.el, `<b>${it.c === 'recycling' ? '♻️ That one IS recyclable!' : `🚫 Not recyclable — ${BIN[it.c].icon} ${esc(BIN[it.c].label)}`}</b>${it.e} ${esc(it.t)}`, 'bad', 2200);
    }
    update();
    setTimeout(() => {
      if(!S || S.over) return;
      S.i++; S.busy = false;
      if(S.i >= S.deck.length) return end();
      renderCards();
    }, 260);
  }

  function onClick(e){
    const t = e.target.closest('button');
    if(!t || !S) return;
    if(t.dataset.sw) return decide(t.dataset.sw);
    const x = t.dataset.x;
    if(x === 'pause'){ if(!S.over){ S.paused = true; pauseMenu(S.el, S.score); } return; }
    if(x === 'resume'){ S.paused = false; S.el.querySelector('.sg-overlay').remove(); return; }
    if(x === 'quit') return stop();
    if(x === 'again'){ const el = S.el; teardown(); el.remove(); start(); }
  }
  function onKey(e){
    if(!S || S.paused || S.over) return;
    if(e.key === 'ArrowRight') decide('right');
    if(e.key === 'ArrowLeft') decide('left');
    if(e.key === 'Escape'){ S.paused = true; pauseMenu(S.el, S.score); }
  }
  document.addEventListener('keydown', onKey);
  document.addEventListener('visibilitychange', () => { if(document.hidden && S && !S.over && !S.paused){ S.paused = true; pauseMenu(S.el, S.score); } });

  function end(){
    if(S.over) return;
    S.over = true;
    clearInterval(S.timer);
    const acc = S.answered ? S.correct / S.answered : 0;
    results(S.el, {
      key: 'swipe', title: S.time <= 0 ? "⏱ Time's up!" : 'Deck cleared! 🎉', score: S.score, acc, misses: S.misses,
      stats: [[`${S.correct}/${S.answered}`, 'Correct'], [`${Math.round(acc * 100)}%`, 'Accuracy'], [`🔥${S.best}`, 'Best streak']],
      shareText: `I scored ${S.score.toLocaleString()} in Swipe It on OKC Sort ♻️ — ${S.correct} right in ${SECONDS} seconds. Can you beat me?`,
    });
  }
  function teardown(){ if(S){ clearInterval(S.timer); S = null; } }
  function stop(){ if(!S) return; const el = S.el; teardown(); close(el); }
  return { start, stop };
})();

// =====================================================================
// 🧺 Bin Catcher — items fall; move the bin (drag, arrow keys, or tilt
// the phone) to catch only the items that belong in the current bin.
// =====================================================================
const BinCatcher = (function(){
  const SWITCH_EVERY = 16;    // seconds before the target bin changes
  let K = null;

  function start(){
    const el = shell('sg-catch', '🧺 Bin Catcher');
    el.querySelector('.sg-mini-body').innerHTML = `
      <canvas class="ct-canvas"></canvas>
      <div class="ct-target"></div>
      <div class="ct-controls">
        <span class="ct-lives"></span>
        <button class="sg-glass ct-tilt" data-x="tilt">📱 Tilt: off</button>
      </div>`;
    const canvas = el.querySelector('.ct-canvas');
    K = { el, canvas, ctx: canvas.getContext('2d'), items: [], score: 0, lives: 3, streak: 0, best: 0,
          caught: 0, wrong: 0, misses: [], target: null, targetT: 0, t: 0, spawnT: 0.6,
          binX: 0, goalX: null, keys: 0, tilt: false, tiltV: 0, paused: true, over: false, last: 0, raf: 0 };
    el.addEventListener('click', onClick);
    canvas.addEventListener('pointerdown', onPoint);
    canvas.addEventListener('pointermove', onPoint);
    resize();
    K.binX = K.W / 2;
    newTarget(true);
    lives();
    K.raf = requestAnimationFrame(frame);
  }

  function resize(){
    if(!K) return;
    const r = K.canvas.getBoundingClientRect(), dpr = Math.min(2, window.devicePixelRatio || 1);
    K.W = r.width; K.H = r.height;
    K.canvas.width = r.width * dpr; K.canvas.height = r.height * dpr;
    K.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  window.addEventListener('resize', resize);

  function newTarget(first){
    const opts = BINS.map(b => b.key).filter(k => k !== K.target);
    K.target = opts[Math.floor(Math.random() * opts.length)];
    K.targetT = SWITCH_EVERY;
    const b = BIN[K.target];
    K.el.querySelector('.ct-target').innerHTML = `Catch only: <b style="background:${COLOR[K.target]}">${b.icon} ${esc(b.label)}</b>`;
    // Pause briefly and announce the new target.
    K.paused = true;
    K.items = K.items.filter(i => i.y < 0);
    const ann = document.createElement('div');
    ann.className = 'sg-banner level';
    ann.innerHTML = `<b>${b.icon}</b><small>${first ? 'Catch everything that goes in the' : 'NEW BIN! Now catch'}<br><strong>${esc(b.label)}</strong></small>`;
    K.el.appendChild(ann);
    if(!first) sfx.level();
    setTimeout(() => { ann.remove(); if(K && !K.over && !K.menu){ K.paused = false; K.last = performance.now(); } }, first ? 2000 : 1500);
  }

  function lives(){ K.el.querySelector('.ct-lives').innerHTML = [0, 1, 2].map(i => `<span class="${i < K.lives ? '' : 'lost'}">❤️</span>`).join(''); }
  function hudUpdate(){
    hud(K.el, 'score', K.score.toLocaleString());
    hud(K.el, 'sub', `🔥${K.streak} · ⏱ ${Math.ceil(K.targetT)}s`);
    K.el.querySelector('[data-hud="bar"]').style.width = (K.targetT / SWITCH_EVERY * 100) + '%';
  }

  function spawn(){
    const level = Math.min(1, K.t / 90);
    const match = Math.random() < 0.5;
    const pool = ITEMS.filter(i => match ? i.c === K.target : i.c !== K.target);
    const it = pool[Math.floor(Math.random() * pool.length)];
    K.items.push({ it, x: 30 + Math.random() * (K.W - 60), y: -40, vy: 120 + level * 200 + Math.random() * 40,
                   rot: 0, vr: (Math.random() - .5) * 3 });
    K.spawnT = 1.1 - level * 0.6 + Math.random() * 0.3;
  }

  function frame(t){
    if(!K) return;
    const dt = Math.min(0.05, (t - (K.last || t)) / 1000);
    K.last = t;
    if(!K.paused && !K.over) step(dt);
    draw();
    K.raf = requestAnimationFrame(frame);
  }

  function step(dt){
    K.t += dt;
    K.targetT -= dt;
    if(K.targetT <= 0){ newTarget(false); return; }
    K.spawnT -= dt;
    if(K.spawnT <= 0) spawn();
    // Bin movement: drag target, arrow keys, or tilt.
    const speed = 520;
    if(K.keys) K.binX += K.keys * speed * dt;
    else if(K.tilt) K.binX += K.tiltV * dt;
    else if(K.goalX !== null) K.binX += (K.goalX - K.binX) * Math.min(1, dt * 14);
    const bw = binW();
    K.binX = Math.max(bw / 2, Math.min(K.W - bw / 2, K.binX));
    const binTop = K.H - 92;
    for(let i = K.items.length - 1; i >= 0; i--){
      const p = K.items[i];
      p.y += p.vy * dt; p.rot += p.vr * dt;
      if(p.y > binTop && p.y < binTop + 40 && Math.abs(p.x - K.binX) < bw / 2 + 10){
        K.items.splice(i, 1);
        catchIt(p);
      }else if(p.y > K.H + 40){
        K.items.splice(i, 1);
        if(p.it.c === K.target) K.streak = 0;
      }
    }
    hudUpdate();
  }

  function catchIt(p){
    const rect = K.canvas.getBoundingClientRect();
    const sx = rect.left + K.binX, sy = rect.top + K.H - 100;
    if(p.it.c === K.target){
      K.caught++; K.streak++; K.best = Math.max(K.best, K.streak);
      const mult = 1 + Math.min(4, Math.floor(K.streak / 5));
      K.score += 10 * mult;
      sfx.ok(K.streak); buzz(10);
      C.burst(sx, sy, COLOR[K.target], 18);
      floatText(K.el, `+${10 * mult}`, sx, sy - 20);
      discover(p.it);
      if(K.score >= 300) award('catch300');
    }else{
      K.wrong++; K.streak = 0; K.lives--;
      K.misses.push({ it: p.it });
      lives();
      sfx.bad(); buzz([40, 40, 60]); shake(K.el);
      chip(K.el, `<b>❌ ${p.it.e} ${esc(p.it.n)} goes in ${BIN[p.it.c].icon} ${esc(BIN[p.it.c].label)}</b>${esc(p.it.t)}`, 'bad', 2200);
      if(K.lives <= 0) end();
    }
  }

  const binW = () => Math.min(120, K.W * 0.28);
  function draw(){
    const { ctx, W, H } = K;
    ctx.clearRect(0, 0, W, H);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = '40px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
    for(const p of K.items){
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot);
      ctx.shadowColor = 'rgba(0,0,0,.45)'; ctx.shadowBlur = 10; ctx.shadowOffsetY = 4;
      ctx.fillText(p.it.e, 0, 0);
      ctx.restore();
    }
    // The bin.
    const bw = binW(), bh = 78, x = K.binX - bw / 2, y = H - 88, c = COLOR[K.target];
    ctx.save();
    ctx.shadowColor = c; ctx.shadowBlur = 24;
    const g = ctx.createLinearGradient(0, y, 0, y + bh);
    g.addColorStop(0, c); g.addColorStop(1, shade(c, -0.35));
    ctx.fillStyle = g;
    roundRect(ctx, x, y, bw, bh, [6, 6, 18, 18]); ctx.fill();
    ctx.restore();
    ctx.fillStyle = shade(c, -0.45);
    roundRect(ctx, x - 6, y - 10, bw + 12, 12, [6, 6, 3, 3]); ctx.fill();
    ctx.font = '26px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
    ctx.fillText(BIN[K.target].icon, K.binX, y + 28);
    ctx.font = '600 13px Fredoka, sans-serif'; ctx.fillStyle = '#fff';
    ctx.fillText(SHORT[K.target], K.binX, y + 58);
  }
  function roundRect(ctx, x, y, w, h, r){
    ctx.beginPath();
    if(ctx.roundRect) ctx.roundRect(x, y, w, h, r);
    else ctx.rect(x, y, w, h);
  }
  function shade(hex, amt){
    const n = parseInt(hex.slice(1), 16);
    const f = (v) => Math.max(0, Math.min(255, Math.round(v + v * amt)));
    return `rgb(${f(n >> 16)},${f(n >> 8 & 255)},${f(n & 255)})`;
  }

  function onPoint(e){
    if(!K || K.tilt) return;
    const r = K.canvas.getBoundingClientRect();
    K.goalX = e.clientX - r.left;
  }
  function onKey(e){
    if(!K || K.over) return;
    if(e.type === 'keydown'){
      if(e.key === 'ArrowLeft') K.keys = -1;
      if(e.key === 'ArrowRight') K.keys = 1;
      if(e.key === 'Escape') pause();
    }else if(e.key === 'ArrowLeft' || e.key === 'ArrowRight') K.keys = 0;
  }
  document.addEventListener('keydown', onKey);
  document.addEventListener('keyup', onKey);
  function onTilt(e){ if(K && K.tilt && e.gamma != null) K.tiltV = Math.max(-40, Math.min(40, e.gamma)) * 22; }
  window.addEventListener('deviceorientation', onTilt);
  document.addEventListener('visibilitychange', () => { if(document.hidden) pause(); });

  async function toggleTilt(btn){
    if(!K.tilt && typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function'){
      try{ if(await DeviceOrientationEvent.requestPermission() !== 'granted'){ btn.textContent = '📱 Tilt blocked'; return; } }
      catch{ btn.textContent = '📱 Tilt blocked'; return; }
    }
    if(!K.tilt && !('DeviceOrientationEvent' in window)){ btn.textContent = '📱 No tilt sensor'; return; }
    K.tilt = !K.tilt;
    btn.textContent = K.tilt ? '📱 Tilt: on' : '📱 Tilt: off';
    btn.classList.toggle('on', K.tilt);
  }

  function pause(){
    if(!K || K.over || K.menu) return;
    K.menu = true; K.paused = true;
    pauseMenu(K.el, K.score);
  }
  function onClick(e){
    const t = e.target.closest('button');
    if(!t || !K) return;
    const x = t.dataset.x;
    if(x === 'pause') return pause();
    if(x === 'tilt') return toggleTilt(t);
    if(x === 'resume'){ K.menu = false; K.paused = false; K.last = performance.now(); K.el.querySelector('.sg-overlay').remove(); return; }
    if(x === 'quit') return stop();
    if(x === 'again'){ const el = K.el; teardown(); el.remove(); start(); }
  }

  function end(){
    K.over = true;
    const total = K.caught + K.wrong;
    const acc = total ? K.caught / total : 0;
    results(K.el, {
      key: 'catch', title: 'Out of lives! 🧺', score: K.score, acc, misses: K.misses,
      stats: [[K.caught, 'Caught'], [`${Math.round(acc * 100)}%`, 'Accuracy'], [`🔥${K.best}`, 'Best streak']],
      shareText: `I scored ${K.score.toLocaleString()} in Bin Catcher on OKC Sort 🧺 Can you beat me?`,
    });
  }
  function teardown(){ if(K){ cancelAnimationFrame(K.raf); K = null; } }
  function stop(){ if(!K) return; const el = K.el; teardown(); close(el); }
  return { start, stop };
})();

// =====================================================================
// 📸 Photo Hunt — AI scavenger hunt. A mission names a bin; the player
// finds a real item at home, snaps it, and the same AI photo classifier
// as the sorter (/api/classify) checks whether it belongs in that bin.
// =====================================================================
const PhotoHunt = (function(){
  let H = null;
  const SAFETY = {
    hazardous_waste: "⚠️ Safety first: don't touch or open it. Ask an adult and just snap a photo from a distance.",
    not_accepted: '⚠️ Ask an adult first — never handle medicine, fireworks or broken electronics.',
  };

  function start(){
    const el = shell('sg-hunt', '📸 Photo Hunt');
    H = { el, mission: null, busy: false };
    el.querySelector('.sg-mini-body').innerHTML = `
      <div class="ph-wrap"><div class="ph-card sg-glass"></div></div>
      <input type="file" accept="image/*" capture="environment" class="ph-cam" hidden>
      <input type="file" accept="image/*" class="ph-file" hidden>`;
    el.querySelector('[data-x="pause"]').textContent = '✕';
    el.querySelector('[data-x="pause"]').setAttribute('aria-label', 'Close');
    el.addEventListener('click', onClick);
    el.querySelectorAll('input[type=file]').forEach(i => i.addEventListener('change', (e) => { const f = e.target.files[0]; e.target.value = ''; if(f) check(f); }));
    hudUpdate();
    newMission();
  }
  function hudUpdate(){
    hud(H.el, 'score', save.hunt);
    hud(H.el, 'sub', 'Missions done');
    H.el.querySelector('[data-hud="bar"]').style.width = Math.min(100, (save.hunt % 5) / 5 * 100) + '%';
  }

  function newMission(){
    const weights = { recycling: 4, regular_trash: 4, bulky_pickup: 1, hazardous_waste: 1, not_accepted: 1 };
    const keys = Object.keys(weights).filter(k => k !== (H.mission && H.mission.key));
    let r = Math.random() * keys.reduce((a, k) => a + weights[k], 0), key = keys[0];
    for(const k of keys){ r -= weights[k]; if(r <= 0){ key = k; break; } }
    const examples = shuffle(ITEMS.filter(i => i.c === key)).slice(0, 3);
    H.mission = { key, examples };
    renderMission();
  }

  function renderMission(){
    const b = BIN[H.mission.key];
    H.el.querySelector('.ph-card').innerHTML = `
      <div class="ph-badge" style="--c:${COLOR[H.mission.key]}">${b.icon}</div>
      <div class="ph-kicker">YOUR MISSION</div>
      <h2>Find something for the<br><span style="color:${COLOR[H.mission.key]};filter:brightness(1.35)">${esc(b.label)}</span></h2>
      <p class="ph-hint">Look around your home for an item that goes here — like
        ${H.mission.examples.map(i => `${i.e} ${esc(i.n.toLowerCase())}`).join(', ')}.</p>
      ${SAFETY[H.mission.key] ? `<p class="ph-safety">${SAFETY[H.mission.key]}</p>` : ''}
      <button class="sg-cta" data-x="cam">📷 Snap it</button>
      <div class="sg-btnrow">
        <button class="sg-cta alt" data-x="file">🖼️ Choose photo</button>
        <button class="sg-cta alt" data-x="skip">🔀 New mission</button>
      </div>
      <p class="ph-ai">🤖 Our AI checks your photo using the City of OKC's rules.</p>`;
  }

  async function check(file){
    if(H.busy) return;
    H.busy = true;
    const url = URL.createObjectURL(file);
    const card = H.el.querySelector('.ph-card');
    card.innerHTML = `
      <div class="ph-scan"><img src="${url}" alt="Your photo"><i class="laser"></i><div class="grid"></div></div>
      <h2 class="ph-status">🤖 Scanning<span class="dots"></span></h2>
      <p class="ph-hint">The AI is identifying your item…</p>`;
    try{
      const blob = await resize(file);
      const base64 = await toBase64(blob);
      const res = await fetch('/api/classify', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ imageBase64: base64, mediaType: 'image/jpeg' }),
      });
      let data = {};
      try{ data = await res.json(); }catch{}
      if(!res.ok) throw new Error(data.error || 'The AI could not check that photo.');
      if(!H) return;
      showResult(url, data);
    }catch(err){
      if(!H) return;
      card.innerHTML = `
        <div class="ph-scan done"><img src="${url}" alt="Your photo"></div>
        <h2>😕 Couldn't check that photo</h2>
        <p class="ph-hint">${esc(navigator.onLine === false ? 'Photo Hunt needs an internet connection.' : (err.message || 'Something went wrong.'))}</p>
        <button class="sg-cta" data-x="retry">Try again</button>`;
    }finally{
      if(H) H.busy = false;
    }
  }

  function showResult(url, data){
    const want = H.mission.key, got = data.category;
    const ok = got === want;
    const card = H.el.querySelector('.ph-card');
    const gotBin = BIN[got];
    if(ok){
      save.hunt++; C.persist();
      award('hunter');
      if(save.hunt >= 5) award('hunter5');
      C.confetti(); sfx.win(); buzz([30, 40, 30]);
      hudUpdate();
    }else{
      sfx.bad(); buzz([40, 40, 60]);
    }
    card.innerHTML = `
      <div class="ph-scan done ${ok ? 'ok' : 'bad'}"><img src="${url}" alt="Your photo"><span class="ph-label">${esc(data.item || 'Unknown item')}</span></div>
      <h2>${ok ? '🎉 Mission complete!' : '🔍 Close — keep hunting!'}</h2>
      <p class="ph-hint">The AI sees <b>${esc(data.item || 'something')}</b>${gotBin ? `, which goes in ${binTag(got)}` : ''}.</p>
      ${data.instructions ? `<p class="ph-tip">💡 ${esc(data.instructions)}</p>` : ''}
      ${ok ? '' : `<p class="ph-hint">Your mission is the <b>${esc(BIN[want].label)}</b>. Try another item!</p>`}
      ${ok ? '<button class="sg-cta" data-x="next">Next mission →</button>'
           : '<button class="sg-cta" data-x="cam">📷 Try another item</button><button class="sg-cta alt" data-x="skip">🔀 New mission</button>'}`;
  }

  function onClick(e){
    const t = e.target.closest('button');
    if(!t || !H) return;
    const x = t.dataset.x;
    if(x === 'pause' || x === 'quit') return stop();
    if(x === 'cam') return H.el.querySelector('.ph-cam').click();
    if(x === 'file') return H.el.querySelector('.ph-file').click();
    if(x === 'skip' || x === 'next') return newMission();
    if(x === 'retry') return renderMission();
  }

  // Phone photos can be several MB: downscale + re-encode before upload.
  function resize(file, maxDim = 1280, quality = 0.82){
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file), img = new Image();
      img.onload = () => {
        let { width, height } = img;
        if(width > maxDim || height > maxDim){
          if(width > height){ height = Math.round(height * maxDim / width); width = maxDim; }
          else { width = Math.round(width * maxDim / height); height = maxDim; }
        }
        const cv = document.createElement('canvas');
        cv.width = width; cv.height = height;
        cv.getContext('2d').drawImage(img, 0, 0, width, height);
        URL.revokeObjectURL(url);
        cv.toBlob((b) => b ? resolve(b) : reject(new Error('Could not process that image.')), 'image/jpeg', quality);
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Could not read that image.')); };
      img.src = url;
    });
  }
  function toBase64(blob){
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result).split(',')[1]);
      r.onerror = reject;
      r.readAsDataURL(blob);
    });
  }

  function stop(){ if(!H) return; const el = H.el; H = null; close(el); }
  return { start, stop };
})();

Object.assign(window.SortItGames, { swipe: SwipeIt, catch: BinCatcher, hunt: PhotoHunt });
})();
