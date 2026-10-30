// Player page: join with PIN + nickname, then render whatever the server sends.
(function () {
  const { esc, media, shape, color, toast, sfx } = UI;
  const app = document.getElementById('app');
  const socket = io({ path: UI.BASE + '/socket.io' });
  const SAVE = 'qb_player';

  let saved = null;
  try { saved = JSON.parse(localStorage.getItem(SAVE) || 'null'); } catch { /* ignore */ }
  const urlPin = (new URLSearchParams(location.search).get('pin') || '').replace(/\D/g, '');
  let joinPin = '';
  let view = null;
  let renderedKey = '';
  let lastResultKey = '';
  let picked = []; // multi-select / puzzle working state

  const remember = (v) => {
    saved = v;
    try { v ? localStorage.setItem(SAVE, JSON.stringify(v)) : localStorage.removeItem(SAVE); } catch { /* ignore */ }
  };

  // ---------- joining ----------
  function pinScreen(error) {
    view = null; renderedKey = '';
    app.innerHTML = `
      <div class="center">
        <div class="logo pop" style="font-size:2.4rem;margin-bottom:24px">Quiz<b>Blast</b></div>
        <form class="card join-card rise" id="f">
          <input class="input" id="pin" inputmode="numeric" autocomplete="off" maxlength="7" placeholder="Game PIN" value="${esc(urlPin)}" aria-label="Game PIN">
          <button class="btn dark big" type="submit">Enter</button>
        </form>
      </div>`;
    const input = app.querySelector('#pin');
    input.focus();
    app.querySelector('#f').onsubmit = (e) => {
      e.preventDefault();
      const pin = input.value.replace(/\D/g, '');
      if (pin.length < 6) return toast('Enter the 6-digit game PIN', 'error');
      checkPin(pin);
    };
    if (error) toast(error, 'error');
  }
  function checkPin(pin) {
    socket.emit('pin:check', { pin }, (r) => {
      if (r.error) return pinScreen(r.error);
      joinPin = r.pin;
      UI.setTheme(r.theme);
      nameScreen(r.title);
    });
  }
  function nameScreen(title) {
    app.innerHTML = `
      <div class="center">
        <div class="logo" style="font-size:2rem;margin-bottom:8px">Quiz<b>Blast</b></div>
        <div style="margin-bottom:20px;font-weight:700;opacity:.9">${esc(title)}</div>
        <form class="card join-card rise" id="f">
          <input class="input" id="name" maxlength="20" autocomplete="off" placeholder="Nickname" aria-label="Nickname">
          <button class="btn dark big" type="submit">OK, go!</button>
        </form>
        <button class="btn ghost" id="back" style="color:#fff;margin-top:12px">Use a different PIN</button>
      </div>`;
    const input = app.querySelector('#name');
    input.focus();
    app.querySelector('#back').onclick = () => { history.replaceState(null, '', location.pathname); pinScreen(); };
    app.querySelector('#f').onsubmit = (e) => {
      e.preventDefault();
      const name = input.value.trim();
      if (!name) return toast('Enter a nickname', 'error');
      socket.emit('player:join', { pin: joinPin, name }, (r) => {
        if (r.error) return toast(r.error, 'error');
        remember({ pin: r.pin, token: r.token });
        history.replaceState(null, '', location.pathname);
      });
    };
  }
  function start() {
    if (saved && (!urlPin || urlPin === saved.pin)) {
      socket.emit('player:rejoin', saved, (r) => {
        if (r.error) { remember(null); urlPin ? checkPin(urlPin) : pinScreen(); }
      });
    } else if (urlPin) {
      checkPin(urlPin);
    } else {
      pinScreen();
    }
  }

  let started = false;
  socket.on('connect', () => {
    if (!started) { started = true; return start(); }
    if (view && saved) socket.emit('player:rejoin', saved, (r) => { if (r.error) { remember(null); pinScreen('The game has ended'); } });
  });
  socket.on('player:view', (v) => { UI.syncClock(v.serverNow); render(v); });
  socket.on('player:kicked', () => { remember(null); pinScreen('You were removed from the game by the host'); });
  socket.on('player:replaced', () => { view = null; app.innerHTML = '<div class="center"><h2>This game is open in another tab or device.</h2></div>'; });
  socket.on('game:closed', () => { remember(null); pinScreen('The host closed the game'); });

  // ---------- game views ----------
  function topbar(v) {
    return `<div class="topbar"><span>${v.index >= 0 && v.phase !== 'podium' ? `${v.index + 1} of ${v.total}` : esc(v.quizTitle)}</span>
      <span>${esc(v.me.name)}</span><span class="score">${v.me.score}</span></div>`;
  }
  function render(v) {
    view = v;
    UI.setTheme(v.theme);
    const key = [v.phase, v.index, v.answered ? 1 : 0].join(':');
    if (key === renderedKey) {
      const s = app.querySelector('.topbar .score');
      if (s) s.textContent = v.me.score;
      return;
    }
    renderedKey = key;
    picked = [];
    UI.stopCountdown();
    const body = ({ lobby, intro, question, content, result, scoreboard: result, podium })[v.phase](v);
    app.innerHTML = topbar(v) + body;
    if (v.phase === 'question' && !v.answered) wireQuestion(v);
    if (v.phase === 'podium' && v.me.rank <= 3) { UI.confetti(); sfx.fanfare(); }
    if (v.phase === 'podium') app.querySelector('#again').onclick = () => { remember(null); pinScreen(); };
  }
  const lobby = (v) => `
    <div class="center">
      <h1 class="pop">You're in!</h1>
      <h2>See your nickname on screen?</h2>
      <div class="pill" style="font-size:1.4rem;margin-top:18px">${esc(v.me.name)}</div>
      <div class="waiting-dots" style="margin-top:30px"><span></span><span></span><span></span></div>
    </div>`;
  const intro = (v) => `
    <div class="center">
      <div class="pill">Question ${v.index + 1}</div>
      <h1 class="pop" style="max-width:20em">${esc(v.slide.question)}</h1>
      ${v.slide.points === 'double' ? '<div class="pill" style="background:#ffd23f;color:#1d1a2b">Double points!</div>' : ''}
      <h2 style="margin-top:20px">Get ready…</h2>
    </div>`;
  const content = (v) => `
    <div class="center">
      <h1>${esc(v.slide.question)}</h1>
      <h2 style="opacity:.85">Look at the main screen</h2>
    </div>`;
  function question(v) {
    const s = v.slide;
    if (v.answered) {
      return `<div class="center"><h1 class="pop">Answer sent!</h1><h2>Waiting for everyone else…</h2>
        <div class="waiting-dots" style="margin-top:24px"><span></span><span></span><span></span></div></div>`;
    }
    let inner = '';
    if (s.type === 'quiz' || s.type === 'truefalse' || s.type === 'poll') {
      inner = `<div class="tiles${s.type === 'truefalse' ? ' one-col' : ''}" id="opts">${s.answers.map((a, i) => `
          <button class="tile" data-i="${i}" style="background:${color(i)}">${shape(i)}<span class="txt">${esc(a.text)}</span>${s.multi ? '<span class="check"></span>' : ''}</button>`).join('')}</div>
        ${s.multi ? '<button class="btn dark big" id="send">Submit</button>' : ''}`;
    } else if (s.type === 'typeanswer') {
      inner = `<form id="f" class="card" style="display:flex;flex-direction:column;gap:12px">
          <input class="input" id="t" maxlength="60" autocomplete="off" placeholder="Type your answer" style="font-size:1.3rem;text-align:center">
          <button class="btn dark big">Submit</button></form>`;
    } else if (s.type === 'slider') {
      const mid = s.slider.min + Math.round((s.slider.max - s.slider.min) / 2 / s.slider.step) * s.slider.step;
      inner = `<div class="slider-box"><div class="val" id="val">${fmt(mid)}</div>
          <input type="range" id="rng" min="${s.slider.min}" max="${s.slider.max}" step="${s.slider.step}" value="${mid}">
          <div class="ends"><span>${fmt(s.slider.min)}</span><span>${fmt(s.slider.max)}</span></div></div>
        <button class="btn dark big" id="send">Submit</button>`;
    } else if (s.type === 'puzzle') {
      inner = `<div style="font-weight:700;text-align:center">Tap the items in the right order</div>
        <div class="puzzle-picked" id="picked"></div>
        <div class="puzzle-list" id="items">${s.items.map((it, k) => `
          <button class="puzzle-item" data-i="${it.i}" style="background:${color(k)}">${shape(k)}<span>${esc(it.text)}</span></button>`).join('')}</div>
        <div style="display:flex;gap:10px"><button class="btn" id="undo" style="flex:1">Undo</button><button class="btn dark big" id="send" style="flex:2" disabled>Submit</button></div>`;
    }
    return `<div class="q-text">${esc(s.question)}${s.multi ? '<div style="font-size:.85rem;opacity:.85;margin-top:4px">Select all correct answers</div>' : ''}</div>
      <div class="answer-area">${inner}</div>`;
  }
  const fmt = (n) => String(Math.round(n * 100) / 100);

  function send(value) {
    socket.emit('player:answer', value, (r) => {
      if (r && r.error) toast(r.error, 'error');
    });
  }
  function wireQuestion(v) {
    const s = v.slide;
    if (s.type === 'quiz' || s.type === 'truefalse' || s.type === 'poll') {
      app.querySelectorAll('#opts .tile').forEach((b) => {
        b.onclick = () => {
          const i = Number(b.dataset.i);
          if (!s.multi) return send(i);
          picked = picked.includes(i) ? picked.filter((x) => x !== i) : picked.concat(i);
          b.classList.toggle('selected', picked.includes(i));
        };
      });
      const sendBtn = app.querySelector('#send');
      if (sendBtn) sendBtn.onclick = () => (picked.length ? send(picked) : toast('Pick at least one answer', 'error'));
    } else if (s.type === 'typeanswer') {
      const t = app.querySelector('#t');
      t.focus();
      app.querySelector('#f').onsubmit = (e) => { e.preventDefault(); if (t.value.trim()) send(t.value.trim()); };
    } else if (s.type === 'slider') {
      const r = app.querySelector('#rng'), val = app.querySelector('#val');
      r.oninput = () => (val.textContent = fmt(Number(r.value)));
      app.querySelector('#send').onclick = () => send(Number(r.value));
    } else if (s.type === 'puzzle') {
      const draw = () => {
        app.querySelector('#picked').innerHTML = picked.length
          ? picked.map((i, k) => `<div class="row"><span class="num" style="width:24px;height:24px;border-radius:50%;background:var(--brand);color:#fff;display:grid;place-items:center">${k + 1}</span>${esc(s.items.find((x) => x.i === i).text)}</div>`).join('')
          : '<div style="color:var(--muted);text-align:center;padding:10px">Your order shows up here</div>';
        app.querySelectorAll('#items .puzzle-item').forEach((b) => b.classList.toggle('used', picked.includes(Number(b.dataset.i))));
        app.querySelector('#send').disabled = picked.length !== s.items.length;
      };
      app.querySelectorAll('#items .puzzle-item').forEach((b) => {
        b.onclick = () => { const i = Number(b.dataset.i); if (!picked.includes(i)) { picked.push(i); draw(); } };
      });
      app.querySelector('#undo').onclick = () => { picked.pop(); draw(); };
      app.querySelector('#send').onclick = () => send(picked);
      draw();
    }
  }
  function result(v) {
    const r = v.result;
    const rk = v.index + ':' + v.phase;
    let cls, title, icon;
    if (!r.scored) { cls = 'neutral'; title = r.answered ? 'Thanks for your answer!' : 'No answer'; icon = ''; }
    else if (!r.answered) { cls = 'wrong'; title = "Time's up"; icon = '!'; }
    else if (r.correct) { cls = 'correct'; title = 'Correct'; icon = '✓'; }
    else { cls = 'wrong'; title = 'Incorrect'; icon = '✗'; }
    if (rk !== lastResultKey && v.phase === 'result') {
      lastResultKey = rk;
      if (r.scored) (r.correct ? sfx.good : sfx.bad)();
    }
    const rankLine = v.me.rank === 1 ? "You're in 1st place!" : r.ahead ? `You're ${r.ahead.gap} points behind ${esc(r.ahead.name)}` : `You're in place ${v.me.rank}`;
    return `
      <div class="result-banner ${cls} pop">
        <div class="big">${title}</div>
        ${icon ? `<div class="icon">${icon}</div>` : ''}
        ${r.scored && r.answered && r.correct && r.streak > 1 ? `<div class="pill">🔥 Answer streak ${r.streak}</div>` : ''}
        ${r.scored ? `<div class="pill" style="font-size:1.4rem">+ ${r.points}</div>` : ''}
      </div>
      <div class="center">
        ${r.scored && !r.correct && r.correctText ? `<h2>Correct answer: ${esc(r.correctText)}</h2>` : ''}
        ${r.answered && r.type !== 'quiz' && r.type !== 'truefalse' && r.type !== 'poll' ? `<div style="opacity:.85">You answered: ${esc(r.yourAnswer)}</div>` : ''}
        ${r.scored ? `<h2 style="margin-top:14px">${rankLine}</h2>` : ''}
      </div>`;
  }
  function podium(v) {
    const medal = ['🥇', '🥈', '🥉'];
    return `
      <div class="center">
        <div style="font-size:4rem" class="pop">${v.me.rank <= 3 ? medal[v.me.rank - 1] : '🎉'}</div>
        <h1>${v.me.rank <= 3 ? `You finished #${v.me.rank}!` : `You finished in place ${v.me.rank}`}</h1>
        <div class="pill" style="font-size:1.3rem">${v.me.score} points</div>
        <div class="card" style="margin-top:20px;width:100%;max-width:360px;text-align:left">
          ${v.podium.map((p) => `<div style="display:flex;justify-content:space-between;padding:6px 0;font-weight:700"><span>${medal[p.rank - 1] || p.rank} ${esc(p.name)}</span><span>${p.score}</span></div>`).join('')}
        </div>
        <button class="btn dark big" id="again" style="margin-top:20px">Join another game</button>
      </div>`;
  }
})();
