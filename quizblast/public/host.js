// Host screen: shown on the projector. Creates the game, then renders the server's host view.
(function () {
  const { esc, media, shape, color, toast, sfx } = UI;
  const app = document.getElementById('app');
  const params = new URLSearchParams(location.search);
  const quizId = params.get('quiz') || '';
  const SAVE = 'qb_host_' + quizId;
  const socket = io({ path: UI.BASE + '/socket.io' });

  let joinBase = location.origin + UI.BASE + '/';
  let view = null;
  let renderedKey = '';
  let muted = false;
  let lastTick = -1;
  let knownPlayers = new Set();

  UI.api('/api/config').then((c) => { if (c.publicUrl) { joinBase = c.publicUrl + '/'; if (view) { renderedKey = ''; render(view); } } }).catch(() => {});

  function message(html) {
    app.innerHTML = `<div class="center"><div class="logo" style="font-size:2.4rem;margin-bottom:20px">Quiz<b>Blast</b></div>${html}</div>`;
  }
  function create() {
    socket.emit('host:create', { quizId }, (r) => {
      if (r.error) {
        return message(`<div class="card"><h2>${esc(r.error)}</h2><a class="btn primary" href="${UI.BASE}/admin">Back to my quizzes</a></div>`);
      }
      try { sessionStorage.setItem(SAVE, JSON.stringify({ pin: r.pin, hostKey: r.hostKey })); } catch { /* ignore */ }
    });
  }
  socket.on('connect', () => {
    let saved = null;
    try { saved = JSON.parse(sessionStorage.getItem(SAVE) || 'null'); } catch { /* ignore */ }
    if (saved) socket.emit('host:rejoin', saved, (r) => { if (r.error) { sessionStorage.removeItem(SAVE); create(); } });
    else create();
  });
  socket.on('disconnect', () => toast('Connection lost, reconnecting…', 'error'));
  socket.on('host:view', (v) => { UI.syncClock(v.serverNow); render(v); });
  socket.on('host:replaced', () => { view = null; message('<div class="card"><h2>This game is now being hosted in another window.</h2></div>'); });
  socket.on('game:closed', () => {
    try { sessionStorage.removeItem(SAVE); } catch { /* ignore */ }
    view = null;
    message(`<div class="card"><h2>The game was closed.</h2><a class="btn primary" href="${UI.BASE}/admin">Back to my quizzes</a></div>`);
  });

  const act = (action, extra) => socket.emit('host:action', Object.assign({ action }, extra));
  const next = () => act('next');

  document.addEventListener('keydown', (e) => {
    if (!view || e.target.closest('input,textarea')) return;
    if (e.key === ' ' || e.key === 'Enter' || e.key === 'ArrowRight') {
      e.preventDefault();
      if (view.phase === 'lobby' && !view.players.length) return;
      if (view.phase !== 'podium') next();
    }
    if (e.key === 'f') toggleFullscreen();
  });
  function toggleFullscreen() {
    if (document.fullscreenElement) document.exitFullscreen();
    else document.documentElement.requestFullscreen().catch(() => {});
  }

  // ---------- rendering ----------
  function render(v) {
    view = v;
    UI.setTheme(v.theme);
    const key = v.phase + ':' + v.index;
    if (key === renderedKey) return update(v);
    renderedKey = key;
    UI.stopCountdown();
    const fn = { lobby, intro, question, result, scoreboard, content, podium }[v.phase];
    app.innerHTML = fn(v);
    wire(v);
    update(v);
  }

  function hbar(v, right) {
    return `<div class="hbar">
      <span class="logo">Quiz<b>Blast</b></span>
      <span class="count-badge">PIN ${v.pin}</span>
      ${v.index >= 0 && v.phase !== 'podium' ? `<span class="count-badge">${v.index + 1} / ${v.total}</span>` : ''}
      <span class="spacer"></span>
      ${right || ''}
      <button class="btn small" data-act="mute" title="Sound on/off">${muted ? '🔇' : '🔊'}</button>
      <button class="btn small" data-act="fs" title="Full screen (F)">⛶</button>
      ${v.phase !== 'podium' ? '<button class="btn small" data-act="end">End game</button>' : ''}
    </div>`;
  }

  function joinUrl(v) { return joinBase + '?pin=' + v.pin; }
  function lobby(v) {
    const shown = joinBase.replace(/^https?:\/\//, '').replace(/\/$/, '');
    return `${hbar(v, `<button class="btn small" data-act="lock">${v.locked ? '🔒 Locked' : '🔓 Open'}</button>`)}
      <div class="join-strip">
        <div class="card"><div class="url">Join at <b>${esc(shown)}</b></div><div style="color:var(--muted);font-weight:600;margin-top:6px">or scan the QR code with your phone camera</div></div>
        <div class="card"><div class="pin-label">Game PIN:</div><div class="pin">${v.pin.replace(/(\d{3})(\d{3})/, '$1 $2')}</div></div>
        <div class="card qr"><img alt="QR code to join" src="${UI.BASE}/api/qr?text=${encodeURIComponent(joinUrl(v))}"></div>
      </div>
      <div class="lobby-mid">
        <span class="count-badge" style="font-size:1.4em">👤 <span id="pcount">0</span></span>
        <span class="lobby-title">${esc(v.quizTitle)}</span>
        <button class="btn dark big" id="start">Start</button>
      </div>
      <div class="lobby-players" id="players"></div>`;
  }
  function intro(v) {
    const s = v.slide;
    const ms = Math.max(0, v.endsAt - UI.now());
    return `${hbar(v, '<button class="btn small" data-act="next">Skip ▸</button>')}
      <div class="intro">
        <span class="qnum pop">Question ${v.index + 1} of ${v.total}${s.points === 'double' ? ' · Double points!' : ''}</span>
        <div class="qtext rise">${esc(s.question)}</div>
        <div class="bar"><i style="animation-duration:${ms}ms"></i></div>
      </div>`;
  }
  function tilesFor(v, reveal) {
    const s = v.slide;
    if (s.type === 'quiz' || s.type === 'truefalse' || s.type === 'poll') {
      return `<div class="tiles">${s.answers.map((a, i) => `
        <div class="tile ${reveal && s.type !== 'poll' && !a.correct ? 'dim' : ''}" style="background:${color(i)}">
          ${shape(i)}<span class="txt">${esc(a.text)}</span>${reveal && a.correct ? '<span class="mark">✓</span>' : ''}</div>`).join('')}</div>`;
    }
    if (s.type === 'puzzle') {
      const order = reveal ? s.answers.map((_, i) => i) : v.puzzleOrder || [];
      return `<div class="tiles">${order.map((i, k) => `
        <div class="tile" style="background:${color(reveal ? i : k)}">${reveal ? `<span class="mark" style="color:var(--ink)">${k + 1}</span>` : shape(k)}<span class="txt">${esc(s.answers[i].text)}</span></div>`).join('')}</div>`;
    }
    return '';
  }
  function question(v) {
    const s = v.slide;
    let middle = s.image ? `<img src="${esc(media(s.image))}" alt="">` : '';
    if (!s.image && s.type === 'typeanswer') middle = '<div class="big-answer">⌨️ Type your answer on your device</div>';
    if (!s.image && s.type === 'slider') middle = `<div class="big-answer">🎚️ ${s.slider.min} … ${s.slider.max}</div>`;
    if (!s.image && s.type === 'puzzle') middle = '<div class="big-answer">🧩 Put these in the right order</div>';
    return `${hbar(v, '<button class="btn small" data-act="next">Skip ▸</button>')}
      <div class="card q-head">${esc(s.question)}</div>
      <div class="q-body">
        <div class="timer" id="timer">${s.timeLimit}</div>
        <div class="q-media">${middle}</div>
        <div class="answered-box"><div class="n" id="answered">0</div>Answers</div>
      </div>
      ${tilesFor(v, false)}`;
  }
  function result(v) {
    const s = v.slide, st = v.stats;
    let chart = '';
    if (st.counts) {
      const max = Math.max(1, ...st.counts);
      chart = `<div class="chart">${st.counts.map((c, i) => `
        <div class="col ${s.type !== 'poll' && !s.answers[i].correct ? 'dim' : ''}">
          <div class="barwrap"><div class="bar" style="background:${color(i)};height:0" data-h="${(c / max) * 100}"></div></div>
          <div class="lbl" style="background:${color(i)}">${shape(i)} ${c}${s.type !== 'poll' && s.answers[i].correct ? ' ✓' : ''}</div>
        </div>`).join('')}</div>`;
    } else if (s.type === 'typeanswer') {
      chart = `<div class="center" style="flex:0;gap:16px"><div class="big-answer pop">✓ ${esc(v.correctText)}</div></div>
        <div class="groups">${st.groups.length ? st.groups.map((g) => `<div class="g ${g.correct ? 'ok' : ''}">${esc(g.text)} · ${g.count}</div>`).join('') : '<div class="g">No answers</div>'}</div>`;
    } else if (s.type === 'slider') {
      const { min, max, correct, margin } = s.slider;
      const pct = (x) => ((x - min) / (max - min)) * 100;
      const lo = Math.max(min, correct - margin), hi = Math.min(max, correct + margin);
      chart = `<div class="center" style="flex:0"><div class="big-answer pop">✓ ${esc(v.correctText)}</div>
          ${st.average != null ? `<div style="margin-top:10px;font-weight:700">Average guess: ${Math.round(st.average * 100) / 100}</div>` : ''}</div>
        <div class="scale">
          <div class="target" style="left:${pct(lo)}%;width:${pct(hi) - pct(lo)}%"></div>
          ${st.values.map((x) => `<div class="dot" style="left:${pct(x)}%"></div>`).join('')}
          <div class="tick" style="left:0">${min}</div><div class="tick" style="left:100%">${max}</div>
        </div>`;
    } else if (s.type === 'puzzle') {
      chart = `<div class="center" style="flex:0"><div class="big-answer pop">${st.correct} of ${st.answered} got the order right</div></div>`;
    }
    return `${hbar(v, '<button class="btn dark" data-act="next">Next ▸</button>')}
      <div class="card q-head">${esc(s.question)}</div>
      ${chart}
      ${s.type === 'typeanswer' || s.type === 'slider' ? '<div style="flex:1"></div>' : tilesFor(v, true)}`;
  }
  function scoreboard(v) {
    return `${hbar(v, '<button class="btn dark" data-act="next">Next ▸</button>')}
      <div class="stage-title"><span>Scoreboard</span></div>
      <div class="board">${v.scoreboard.map((p, i) => `
        <div class="row" style="animation-delay:${i * 0.08}s"><span class="r">${p.rank}</span><span class="n">${esc(p.name)}</span>
          ${p.streak > 1 ? `<span class="streak">🔥${p.streak}</span>` : ''}
          ${p.lastPoints ? `<span class="gain">+${p.lastPoints}</span>` : ''}<span>${p.score}</span></div>`).join('') || '<div class="row">No players</div>'}</div>`;
  }
  function content(v) {
    const s = v.slide;
    return `${hbar(v, '<button class="btn dark" data-act="next">Next ▸</button>')}
      <div class="content-slide">
        <h1 class="rise">${esc(s.question)}</h1>
        ${s.image ? `<img src="${esc(media(s.image))}" alt="" class="pop">` : ''}
        ${s.body ? `<p class="rise">${esc(s.body)}</p>` : ''}
      </div>`;
  }
  function podium(v) {
    const top = v.podium;
    const place = (n) => {
      const p = top[n - 1];
      return `<div class="place p${n}">${p ? `<div class="who">${esc(p.name)}</div>` : '<div class="who">&nbsp;</div>'}
        <div class="block"><div class="medal">${n}</div>${p ? `<div class="pts">${p.score}</div>` : ''}</div></div>`;
    };
    return `${hbar(v, `${v.reportId ? `<a class="btn small" href="${UI.BASE}/admin#report/${v.reportId}" target="_blank">View report</a>` : ''}
        <a class="btn small" href="${UI.BASE}/admin">My quizzes</a>`)}
      <div class="stage-title"><span>${esc(v.quizTitle)}</span></div>
      <div class="podium">${place(2)}${place(1)}${place(3)}</div>`;
  }

  function wire(v) {
    app.querySelectorAll('[data-act]').forEach((b) => {
      b.onclick = () => {
        const a = b.dataset.act;
        if (a === 'fs') return toggleFullscreen();
        if (a === 'mute') { muted = !muted; b.textContent = muted ? '🔇' : '🔊'; return; }
        if (a === 'lock') return act('lock', { value: !view.locked });
        if (a === 'end') { if (confirm('End the game now and show the final results?')) act('end'); return; }
        act(a);
      };
    });
    const startBtn = app.querySelector('#start');
    if (startBtn) startBtn.onclick = () => (view.players.length ? next() : toast('Wait for at least one player to join', 'error'));
    if (v.phase === 'question') {
      lastTick = -1;
      UI.countdown(app.querySelector('#timer'), v.endsAt, (left) => {
        const t = app.querySelector('#timer');
        if (t) t.classList.toggle('low', left <= 5);
        if (left <= 5 && left > 0 && left !== lastTick && !muted) sfx.tick();
        lastTick = left;
      });
    }
    if (v.phase === 'result') requestAnimationFrame(() => app.querySelectorAll('.chart .bar').forEach((b) => (b.style.height = b.dataset.h + '%')));
    if (v.phase === 'podium') {
      setTimeout(() => { UI.confetti(); if (!muted) sfx.fanfare(); }, 2200);
      try { sessionStorage.removeItem(SAVE); } catch { /* ignore */ }
    }
  }

  // Cheap in-place updates that don't need a full re-render.
  function update(v) {
    const lock = app.querySelector('[data-act="lock"]');
    if (lock) lock.textContent = v.locked ? '🔒 Locked' : '🔓 Open';
    if (v.phase === 'lobby') {
      app.querySelector('#pcount').textContent = v.players.length;
      const box = app.querySelector('#players');
      box.innerHTML = v.players.length
        ? v.players.map((p) => `<span class="name" data-id="${p.id}" title="Click to remove">${esc(p.name)}</span>`).join('')
        : '<div class="lobby-empty">Waiting for players…</div>';
      box.querySelectorAll('.name').forEach((n) => { n.onclick = () => act('kick', { playerId: n.dataset.id }); });
      const ids = new Set(v.players.map((p) => p.id));
      if (!muted && [...ids].some((id) => !knownPlayers.has(id))) sfx.join();
      knownPlayers = ids;
    }
    const answered = app.querySelector('#answered');
    if (answered) answered.textContent = v.answeredCount || 0;
  }
})();
