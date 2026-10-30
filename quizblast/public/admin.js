// Admin: login, quiz library, slide editor, reports. Hash routes:
//   #/  #reports  #report/<id>  #edit/<id>
(function () {
  const { esc, media, shape, color, api, toast } = UI;
  const app = document.getElementById('app');
  const T = QB.TYPES;

  // ---------- routing ----------
  async function route() {
    const h = location.hash.replace(/^#\/?/, '');
    try {
      const me = await api('/api/me');
      if (!me.admin) return login();
      if (h.startsWith('edit/')) return editor(h.slice(5));
      if (h.startsWith('report/')) return reportPage(h.slice(7));
      if (h === 'reports') return dashboard('reports');
      return dashboard('quizzes');
    } catch (e) {
      if (e.status === 401) return login();
      app.innerHTML = `<div class="empty">${esc(e.message)}</div>`;
    }
  }
  window.addEventListener('hashchange', () => { if (!leaveEditor()) return; route(); });

  function topbar(inner) {
    return `<div class="admin-top"><a class="logo" href="#/">Quiz<b style="color:#e9a21b">Blast</b></a>${inner || '<span class="spacer"></span>'}</div>`;
  }
  const navRight = `<span class="spacer"></span><a class="btn ghost hide-sm" href="${UI.BASE}/" target="_blank">Player page ↗</a><button class="btn" id="logout">Log out</button>`;
  function wireLogout() {
    const b = app.querySelector('#logout');
    if (b) b.onclick = async () => { await api('/api/logout', { method: 'POST' }); route(); };
  }

  // ---------- login ----------
  function login() {
    document.body.className = '';
    app.innerHTML = `<div class="stage"><div class="login-wrap">
      <form class="card rise" id="f">
        <div class="logo" style="color:var(--brand);font-size:2rem;text-align:center;margin-bottom:6px">Quiz<b style="color:#e9a21b">Blast</b></div>
        <p style="text-align:center;color:var(--muted);margin-top:0">Sign in to create and host quizzes</p>
        <label class="field"><span>Admin password</span><input class="input" type="password" id="pw" autocomplete="current-password" autofocus></label>
        <button class="btn primary big" style="width:100%">Sign in</button>
        <p style="text-align:center;margin-bottom:0"><a href="${UI.BASE}/" style="color:var(--brand);font-weight:600">Joining a game? Enter a PIN here</a></p>
      </form></div></div>`;
    app.querySelector('#f').onsubmit = async (e) => {
      e.preventDefault();
      try {
        await api('/api/login', { method: 'POST', body: { password: app.querySelector('#pw').value } });
        route();
      } catch (err) { toast(err.message, 'error'); }
    };
  }

  // ---------- dashboard ----------
  async function dashboard(tab) {
    app.innerHTML = topbar(navRight) + `<div class="dash">
      <div class="dash-head"><h1>${tab === 'reports' ? 'Reports' : 'My quizzes'}</h1>
        ${tab === 'quizzes' ? `<label class="btn">Import<input type="file" id="imp" accept=".json,.csv,application/json,text/csv" hidden></label>
        <button class="btn primary" id="new">+ Create quiz</button>` : ''}</div>
      <div class="tabs"><button data-t="" class="${tab === 'quizzes' ? 'on' : ''}">Quizzes</button><button data-t="reports" class="${tab === 'reports' ? 'on' : ''}">Reports</button></div>
      <div id="list"><div class="empty">Loading…</div></div></div>`;
    wireLogout();
    app.querySelectorAll('.tabs button').forEach((b) => (b.onclick = () => (location.hash = '#' + (b.dataset.t || '/'))));
    if (tab === 'reports') return reportsList();
    app.querySelector('#new').onclick = async () => {
      const q = await api('/api/quizzes', { method: 'POST', body: { title: 'Untitled quiz' } });
      location.hash = '#edit/' + q.id;
    };
    app.querySelector('#imp').onchange = (e) => importFile(e.target.files[0]);
    const list = await api('/api/quizzes');
    const box = app.querySelector('#list');
    if (!list.length) {
      box.innerHTML = '<div class="empty"><h2>No quizzes yet</h2><p>Click “Create quiz” to make your first one.</p></div>';
      return;
    }
    box.innerHTML = `<div class="quiz-grid">${list.map((q) => `
      <div class="quiz-card">
        <div class="cover" style="${q.cover ? `background-image:url('${esc(media(q.cover))}')` : `background:${(QB.THEMES[q.theme] || QB.THEMES.violet).bg}`}"><span class="count">${q.slideCount} slides</span></div>
        <div class="body"><h3>${esc(q.title)}</h3>
          <div class="meta">Edited ${new Date(q.updatedAt).toLocaleDateString()} · ${q.timesPlayed ? `Played ${q.timesPlayed} time${q.timesPlayed === 1 ? '' : 's'}` : 'Not played yet'}</div></div>
        <div class="actions">
          <a class="btn primary" href="${UI.BASE}/host?quiz=${q.id}" target="_blank">▶ Host live</a>
          <a class="btn" href="#edit/${q.id}">Edit</a>
          <button class="btn" data-more="${q.id}" aria-label="More">⋯</button>
        </div>
      </div>`).join('')}</div>`;
    box.querySelectorAll('[data-more]').forEach((b) => (b.onclick = () => moreMenu(list.find((q) => q.id === b.dataset.more))));
  }
  function moreMenu(q) {
    modal(`<h2>${esc(q.title)}</h2>
      <div style="display:flex;flex-direction:column;gap:8px">
        <button class="btn" data-a="dup">Duplicate</button>
        <button class="btn" data-a="exp">Export as file (backup / share)</button>
        <button class="btn danger" data-a="del">Delete</button>
      </div>`, (m, close) => {
      m.querySelector('[data-a=dup]').onclick = async () => { await api(`/api/quizzes/${q.id}/duplicate`, { method: 'POST' }); close(); route(); toast('Duplicated', 'good'); };
      m.querySelector('[data-a=exp]').onclick = async () => {
        const full = await api('/api/quizzes/' + q.id);
        const { title, description, cover, theme, shuffleAnswers, slides } = full;
        download(title.replace(/[^\w -]+/g, '') + '.json', JSON.stringify({ quizblast: 1, title, description, cover, theme, shuffleAnswers, slides }, null, 2), 'application/json');
        close();
      };
      m.querySelector('[data-a=del]').onclick = async () => {
        if (!confirm(`Delete “${q.title}”? This can't be undone.`)) return;
        await api('/api/quizzes/' + q.id, { method: 'DELETE' }); close(); route();
      };
    });
  }
  async function importFile(file) {
    if (!file) return;
    const text = await file.text();
    let data;
    try {
      data = /\.csv$/i.test(file.name) || file.type === 'text/csv' ? fromCsv(text, file.name) : JSON.parse(text);
    } catch (e) {
      return toast('Could not read that file: ' + e.message, 'error');
    }
    const q = await api('/api/quizzes', { method: 'POST', body: data });
    toast('Imported “' + q.title + '”', 'good');
    location.hash = '#edit/' + q.id;
  }
  // CSV columns: Question, Answer 1..4, Time limit, Correct answer(s) e.g. "2" or "1,3"
  function fromCsv(text, name) {
    const rows = parseCsv(text).filter((r) => r.some((c) => c.trim()));
    if (rows.length && /question/i.test(rows[0][0] || '')) rows.shift();
    if (!rows.length) throw new Error('no rows found');
    const slides = rows.map((r) => {
      const answers = [r[1], r[2], r[3], r[4]].map((t) => ({ text: (t || '').trim(), correct: false }));
      const right = String(r[6] || '1').split(/[^\d]+/).map(Number).filter((n) => n >= 1 && n <= 4);
      right.forEach((n) => (answers[n - 1].correct = true));
      const limit = Number(r[5]);
      return { type: 'quiz', question: (r[0] || '').trim(), timeLimit: QB.TIME_LIMITS.includes(limit) ? limit : 20, multi: right.length > 1, answers };
    });
    return { title: name.replace(/\.csv$/i, ''), slides };
  }
  function parseCsv(text) {
    const rows = []; let row = [], cell = '', q = false;
    text = text.replace(/^﻿/, '');
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (q) {
        if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (c === '"') q = false; else cell += c;
      } else if (c === '"') q = true;
      else if (c === ',' || c === ';' || c === '\t') { row.push(cell); cell = ''; }
      else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
      else cell += c;
    }
    if (cell || row.length) { row.push(cell); rows.push(row); }
    return rows;
  }

  // ---------- reports ----------
  async function reportsList() {
    const list = await api('/api/reports');
    const box = app.querySelector('#list');
    if (!list.length) { box.innerHTML = '<div class="empty"><h2>No reports yet</h2><p>A report is saved every time a game finishes.</p></div>'; return; }
    box.innerHTML = `<div class="table-wrap"><table class="rep"><tr><th>Quiz</th><th>Played</th><th>Players</th><th>Winner</th><th></th></tr>
      ${list.map((r) => `<tr><td><a href="#report/${r.id}" style="color:var(--brand);font-weight:700">${esc(r.quizTitle)}</a></td>
        <td>${new Date(r.endedAt).toLocaleString()}</td><td>${r.playerCount}</td><td>${esc(r.winner)}</td>
        <td style="white-space:nowrap"><a class="btn small" href="${UI.BASE}/api/reports/${r.id}/csv">CSV</a> <button class="btn small" data-del="${r.id}">Delete</button></td></tr>`).join('')}</table></div>`;
    box.querySelectorAll('[data-del]').forEach((b) => (b.onclick = async () => {
      if (!confirm('Delete this report?')) return;
      await api('/api/reports/' + b.dataset.del, { method: 'DELETE' }); reportsList();
    }));
  }
  async function reportPage(id) {
    app.innerHTML = topbar(navRight) + '<div class="dash" id="rp"><div class="empty">Loading…</div></div>';
    wireLogout();
    let r;
    try { r = await api('/api/reports/' + id); } catch (e) { app.querySelector('#rp').innerHTML = `<div class="empty">${esc(e.message)}</div>`; return; }
    const qs = r.slides.map((s, i) => ({ s, i })).filter((x) => x.s.type !== 'content');
    const pct = (i) => {
      const answered = r.players.filter((p) => p.answers[i]);
      const right = answered.filter((p) => p.answers[i].correct).length;
      return r.slides[i].type === 'poll' ? '—' : r.players.length ? Math.round((right / r.players.length) * 100) + '%' : '0%';
    };
    app.querySelector('#rp').innerHTML = `
      <div class="dash-head"><h1>${esc(r.quizTitle)}</h1>
        <a class="btn" href="#reports">← All reports</a>
        <a class="btn primary" href="${UI.BASE}/api/reports/${r.id}/csv">Download CSV (Excel)</a></div>
      <p style="color:var(--muted);margin-top:-8px">${new Date(r.startedAt).toLocaleString()} · ${r.players.length} players · PIN ${esc(r.pin)}</p>
      <h3>Players</h3>
      <div class="table-wrap"><table class="rep"><tr><th>Rank</th><th>Player</th><th>Score</th><th>Correct</th></tr>
        ${r.players.map((p) => `<tr><td>${p.rank}</td><td><b>${esc(p.name)}</b></td><td>${p.score}</td><td>${p.correctCount} / ${qs.filter((x) => x.s.type !== 'poll').length}</td></tr>`).join('')}</table></div>
      <h3 style="margin-top:28px">Questions</h3>
      <div class="table-wrap"><table class="rep"><tr><th>#</th><th>Question</th><th>Correct answer</th><th>Got it right</th></tr>
        ${qs.map(({ s, i }) => `<tr><td>${i + 1}</td><td>${esc(s.question)} <small style="color:var(--muted)">(${T[s.type].label})</small></td><td>${esc(s.correctText || '—')}</td><td>${pct(i)}</td></tr>`).join('')}</table></div>
      <h3 style="margin-top:28px">Every answer</h3>
      <div class="table-wrap"><table class="rep"><tr><th>Player</th>${qs.map(({ i }) => `<th>Q${i + 1}</th>`).join('')}</tr>
        ${r.players.map((p) => `<tr><td><b>${esc(p.name)}</b></td>${qs.map(({ s, i }) => {
          const a = p.answers[i];
          if (!a) return '<td style="color:var(--muted)">—</td>';
          return `<td><span class="${a.correct === null ? '' : a.correct ? 'ok' : 'no'}">${esc(a.text)}</span><br><small style="color:var(--muted)">${a.points} pts · ${a.seconds}s</small></td>`;
        }).join('')}</tr>`).join('')}</table></div>`;
  }

  // ---------- editor ----------
  let ed = null; // { quiz, cur, dirty, saving, timer }
  function leaveEditor() {
    if (ed && ed.dirty) { saveNow(); }
    if (!location.hash.startsWith('#edit/')) { ed = null; document.removeEventListener('keydown', edKeys); }
    return true;
  }
  window.addEventListener('beforeunload', (e) => { if (ed && (ed.dirty || ed.saving)) { saveNow(); e.preventDefault(); e.returnValue = ''; } });

  async function editor(id) {
    let quiz;
    try { quiz = await api('/api/quizzes/' + id); } catch (e) { toast(e.message, 'error'); location.hash = '#/'; return; }
    ed = { quiz, cur: 0, dirty: false, saving: false, timer: null };
    UI.setTheme(quiz.theme);
    app.innerHTML = topbar(`
      <input class="title-input" id="title" maxlength="120" value="${esc(quiz.title)}" aria-label="Quiz title">
      <button class="btn" id="settings">Settings</button>
      <span class="status" id="status">✓ Saved</span>
      <span class="spacer"></span>
      <button class="btn" id="exit">Exit</button>
      <button class="btn good" id="host">▶ Host</button>
      <button class="btn primary" id="save">Save</button>`) + `
      <div class="editor">
        <div class="slides-col">
          <div class="slide-list" id="slist"></div>
          <div class="add-row"><button class="btn primary" id="add">+ Add slide</button><div id="tmenu" hidden></div></div>
        </div>
        <div class="canvas" id="canvas"></div>
        <div class="props-col" id="props"></div>
      </div>`;
    const title = app.querySelector('#title');
    title.oninput = () => { ed.quiz.title = title.value; dirty(); };
    app.querySelector('#settings').onclick = settingsModal;
    app.querySelector('#save').onclick = async () => { await saveNow(); toast('Saved', 'good'); };
    app.querySelector('#exit').onclick = async () => { await saveNow(); location.hash = '#/'; };
    app.querySelector('#host').onclick = async () => {
      await saveNow();
      const bad = ed.quiz.slides.filter((s) => QB.validateSlide(s).length).length;
      if (bad === ed.quiz.slides.length) return toast('Finish at least one slide before hosting', 'error');
      if (bad && !confirm(`${bad} unfinished slide(s) will be skipped. Host anyway?`)) return;
      window.open(`${UI.BASE}/host?quiz=${ed.quiz.id}`, '_blank');
    };
    app.querySelector('#add').onclick = toggleTypeMenu;
    document.addEventListener('keydown', edKeys);
    renderList(); renderSlide();
  }
  function edKeys(e) {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); saveNow().then(() => toast('Saved', 'good')); }
  }
  function setStatus(t) { const s = app.querySelector('#status'); if (s) s.textContent = t; }
  function dirty() {
    if (!ed) return;
    ed.dirty = true;
    setStatus('Unsaved changes…');
    clearTimeout(ed.timer);
    ed.timer = setTimeout(saveNow, 1200);
  }
  async function saveNow() {
    if (!ed || !ed.dirty) return;
    clearTimeout(ed.timer);
    const e = ed;
    e.dirty = false; e.saving = true;
    setStatus('Saving…');
    try {
      const saved = await api('/api/quizzes/' + e.quiz.id, { method: 'PUT', body: e.quiz });
      e.quiz.updatedAt = saved.updatedAt;
      if (ed === e) setStatus(e.dirty ? 'Unsaved changes…' : '✓ Saved');
    } catch (err) {
      e.dirty = true;
      setStatus('⚠ Not saved');
      toast('Save failed: ' + err.message, 'error');
    } finally { e.saving = false; }
  }
  const curSlide = () => ed.quiz.slides[ed.cur];

  function toggleTypeMenu() {
    const m = app.querySelector('#tmenu');
    if (!m.hidden) { m.hidden = true; return; }
    const icons = { quiz: '🔤', truefalse: '✔️', typeanswer: '⌨️', slider: '🎚️', puzzle: '🧩', poll: '📊', content: '🖼️' };
    m.className = 'type-menu';
    m.innerHTML = Object.entries(T).map(([k, t]) => `<button data-t="${k}"><span style="font-size:1.5rem">${icons[k]}</span>${t.label}<small>${t.hint}</small></button>`).join('');
    m.hidden = false;
    m.querySelectorAll('button').forEach((b) => (b.onclick = () => {
      m.hidden = true;
      const s = QB.newSlide(b.dataset.t);
      const prev = curSlide();
      if (prev && s.type !== 'content') { s.timeLimit = prev.timeLimit; }
      ed.quiz.slides.splice(ed.cur + 1, 0, s);
      ed.cur += 1;
      dirty(); renderList(); renderSlide();
      setTimeout(() => { const q = app.querySelector('#q'); if (q) q.focus(); }, 0);
    }));
    setTimeout(() => document.addEventListener('click', function off(e) {
      if (!e.target.closest('.add-row')) { m.hidden = true; document.removeEventListener('click', off); }
    }), 0);
  }

  function renderList() {
    const box = app.querySelector('#slist');
    if (!box) return;
    box.innerHTML = ed.quiz.slides.map((s, i) => {
      const probs = QB.validateSlide(s);
      const mini = s.answers && s.type !== 'puzzle' ? `<div class="mini">${s.answers.map((a) => `<i class="${a.correct ? 'c' : ''}"></i>`).join('')}</div>` : '';
      return `<div class="slide-item ${i === ed.cur ? 'on' : ''}" data-i="${i}" draggable="true">
        <div class="num">${i + 1}</div>
        <div class="thumb"><div class="t">${T[s.type].label}${s.type !== 'content' ? ` · ${s.timeLimit}s` : ''}</div>
          <div class="q">${esc(s.question) || '<i style="color:var(--muted)">Untitled</i>'}</div>${mini}
          ${probs.length ? `<div class="warn">⚠ ${esc(probs[0])}</div>` : ''}</div>
        <div class="ops">
          <button data-op="up" title="Move up">▲</button><button data-op="down" title="Move down">▼</button>
          <button data-op="dup" title="Duplicate">⧉</button><button data-op="del" title="Delete">🗑</button>
        </div></div>`;
    }).join('');
    box.querySelectorAll('.slide-item').forEach((el) => {
      const i = Number(el.dataset.i);
      el.onclick = (e) => {
        const op = e.target.closest('[data-op]');
        if (op) return slideOp(op.dataset.op, i);
        if (ed.cur !== i) { ed.cur = i; renderList(); renderSlide(); }
      };
      el.ondragstart = (e) => { e.dataTransfer.setData('text/plain', String(i)); e.dataTransfer.effectAllowed = 'move'; };
      el.ondragover = (e) => { e.preventDefault(); el.classList.add('drag-over'); };
      el.ondragleave = () => el.classList.remove('drag-over');
      el.ondrop = (e) => {
        e.preventDefault();
        const from = Number(e.dataTransfer.getData('text/plain'));
        if (Number.isNaN(from) || from === i) return renderList();
        moveSlide(from, i);
      };
    });
    const on = box.querySelector('.slide-item.on');
    if (on) on.scrollIntoView({ block: 'nearest' });
  }
  function moveSlide(from, to) {
    const slides = ed.quiz.slides;
    const curId = slides[ed.cur].id;
    const [s] = slides.splice(from, 1);
    slides.splice(to, 0, s);
    ed.cur = slides.findIndex((x) => x.id === curId);
    dirty(); renderList();
  }
  function slideOp(op, i) {
    const slides = ed.quiz.slides;
    if (op === 'up' && i > 0) { moveSlide(i, i - 1); }
    if (op === 'down' && i < slides.length - 1) { moveSlide(i, i + 1); }
    if (op === 'dup') {
      const c = JSON.parse(JSON.stringify(slides[i]));
      c.id = QB.uid();
      slides.splice(i + 1, 0, c);
      ed.cur = i + 1; dirty(); renderList(); renderSlide();
    }
    if (op === 'del') {
      if (slides.length === 1) return toast('A quiz needs at least one slide', 'error');
      if (slides[i].question && !confirm('Delete this slide?')) return;
      slides.splice(i, 1);
      ed.cur = Math.min(ed.cur >= i && ed.cur > 0 ? ed.cur - 1 : ed.cur, slides.length - 1);
      dirty(); renderList(); renderSlide();
    }
  }

  function renderSlide() {
    const s = curSlide();
    const c = app.querySelector('#canvas');
    const isContent = s.type === 'content';
    let answers = '';
    if (s.type === 'quiz' || s.type === 'poll' || s.type === 'truefalse') {
      answers = `<div class="ed-tiles">${s.answers.map((a, i) => {
        const filled = a.text.trim() || s.type === 'truefalse';
        return `<div class="ed-tile ${filled ? 'filled' : ''}" style="${filled ? `background:${color(i)}` : ''}">
          <div class="sw" style="background:${color(i)}">${shape(i)}</div>
          <input type="text" data-a="${i}" maxlength="120" value="${esc(a.text)}" placeholder="Add answer ${i + 1}${i >= 2 && s.type !== 'truefalse' ? ' (optional)' : ''}" ${s.type === 'truefalse' ? 'readonly' : ''}>
          ${s.type !== 'truefalse' && s.answers.length > 2 ? `<button class="rm" data-rm="${i}" title="Remove answer">✕</button>` : ''}
          ${s.type !== 'poll' ? `<button class="correct-toggle ${a.correct ? 'on' : ''}" data-c="${i}" title="Mark as correct">✓</button>` : ''}
        </div>`;
      }).join('')}</div>
      ${s.type !== 'truefalse' && s.answers.length < QB.MAX_ANSWERS ? '<div class="ed-row"><button class="btn dark" id="more">+ Add more answers</button></div>' : ''}`;
    } else if (s.type === 'typeanswer') {
      answers = `<div class="ed-panel"><h4>Accepted answers</h4>
        <p style="margin-top:-6px;color:var(--muted);font-size:.85rem">Capital letters, accents and punctuation are ignored when checking.</p>
        <div class="accepted-list">${s.accepted.map((a, i) => `<div class="r"><input class="input" data-acc="${i}" maxlength="60" value="${esc(a)}" placeholder="${i ? 'Other accepted answer' : 'Correct answer'}">
          ${s.accepted.length > 1 ? `<button class="btn" data-accrm="${i}">✕</button>` : ''}</div>`).join('')}</div>
        ${s.accepted.length < 8 ? '<button class="btn" id="accadd" style="margin-top:10px">+ Add another accepted answer</button>' : ''}</div>`;
    } else if (s.type === 'slider') {
      const f = (k, label) => `<label><span>${label}</span><input class="input" type="number" data-sl="${k}" value="${s.slider[k]}" step="any"></label>`;
      answers = `<div class="ed-panel"><h4>Slider</h4><div class="slider-grid">
        ${f('min', 'Minimum')}${f('max', 'Maximum')}${f('step', 'Step')}${f('correct', 'Correct answer')}${f('margin', 'Accept ±')}</div>
        <p style="color:var(--muted);font-size:.85rem;margin-bottom:0">Players are correct when their pick is within ± the margin of the correct answer.</p></div>`;
    } else if (s.type === 'puzzle') {
      answers = `<div class="ed-panel puzzle-ed"><h4>Items in the correct order</h4>
        <p style="margin-top:-6px;color:var(--muted);font-size:.85rem">Players see them shuffled and must tap them in this order.</p>
        ${s.answers.map((a, i) => `<div class="r"><b>${i + 1}</b><input class="input" data-a="${i}" maxlength="80" value="${esc(a.text)}" placeholder="Item ${i + 1}">
          <button class="btn small" data-pu="${i}" title="Move up" ${i === 0 ? 'disabled' : ''}>▲</button>
          ${s.answers.length > 3 ? `<button class="btn small" data-rm="${i}">✕</button>` : ''}</div>`).join('')}
        ${s.answers.length < QB.MAX_ANSWERS ? '<button class="btn" id="more">+ Add item</button>' : ''}</div>`;
    }
    c.innerHTML = `
      <textarea class="qinput" id="q" rows="1" maxlength="300" placeholder="${isContent ? 'Slide title' : 'Start typing your question'}">${esc(s.question)}</textarea>
      <div class="media-box" id="mbox">
        ${s.image ? `<img src="${esc(media(s.image))}" alt=""><div class="media-ops"><button class="btn small" id="mrep">Replace</button><button class="btn small danger" id="mdel">Remove</button></div>` : `
          <button class="plus" id="mup" title="Upload image">+</button>
          <div style="font-weight:700">Add an image</div>
          <div style="font-size:.9rem"><a href="#" id="mup2" style="color:var(--ink);font-weight:700">Upload file</a>, drag one here, paste it, or <a href="#" id="murl" style="color:var(--ink);font-weight:700">use a link</a></div>`}
        <input type="file" id="mfile" accept="image/*" hidden>
      </div>
      ${isContent ? `<textarea class="bodyinput" id="body" maxlength="1000" placeholder="Text (optional)">${esc(s.body || '')}</textarea>` : ''}
      ${answers}`;
    wireSlide(s, c);
    renderProps();
  }

  function wireSlide(s, c) {
    const q = c.querySelector('#q');
    const grow = () => { q.style.height = 'auto'; q.style.height = q.scrollHeight + 'px'; };
    grow();
    q.oninput = () => { s.question = q.value.replace(/\n/g, ' '); grow(); dirty(); renderList(); };
    const body = c.querySelector('#body');
    if (body) body.oninput = () => { s.body = body.value; dirty(); };

    c.querySelectorAll('input[data-a]').forEach((inp) => {
      inp.oninput = () => {
        const i = Number(inp.dataset.a);
        const was = !!s.answers[i].text.trim();
        s.answers[i].text = inp.value;
        dirty(); renderList();
        const tile = inp.closest('.ed-tile');
        if (tile && was !== !!inp.value.trim()) {
          tile.classList.toggle('filled', !!inp.value.trim());
          tile.style.background = inp.value.trim() ? color(i) : '';
        }
      };
    });
    c.querySelectorAll('[data-c]').forEach((b) => (b.onclick = () => {
      const i = Number(b.dataset.c);
      if (s.type === 'truefalse' || !s.multi) s.answers.forEach((a, k) => (a.correct = k === i ? (s.type === 'truefalse' ? true : !a.correct) : false));
      else s.answers[i].correct = !s.answers[i].correct;
      dirty(); renderList(); renderSlide();
    }));
    c.querySelectorAll('[data-rm]').forEach((b) => (b.onclick = () => { s.answers.splice(Number(b.dataset.rm), 1); dirty(); renderList(); renderSlide(); }));
    c.querySelectorAll('[data-pu]').forEach((b) => (b.onclick = () => {
      const i = Number(b.dataset.pu);
      [s.answers[i - 1], s.answers[i]] = [s.answers[i], s.answers[i - 1]];
      dirty(); renderList(); renderSlide();
    }));
    const more = c.querySelector('#more');
    if (more) more.onclick = () => {
      s.answers.push(s.type === 'puzzle' ? { text: '' } : { text: '', correct: false });
      dirty(); renderSlide();
      const ins = c.querySelectorAll('input[data-a]'); ins[ins.length - 1].focus();
    };
    c.querySelectorAll('[data-acc]').forEach((inp) => (inp.oninput = () => { s.accepted[Number(inp.dataset.acc)] = inp.value; dirty(); renderList(); }));
    c.querySelectorAll('[data-accrm]').forEach((b) => (b.onclick = () => { s.accepted.splice(Number(b.dataset.accrm), 1); dirty(); renderSlide(); renderList(); }));
    const accadd = c.querySelector('#accadd');
    if (accadd) accadd.onclick = () => { s.accepted.push(''); dirty(); renderSlide(); const ins = c.querySelectorAll('[data-acc]'); ins[ins.length - 1].focus(); };
    c.querySelectorAll('[data-sl]').forEach((inp) => (inp.onchange = () => {
      s.slider[inp.dataset.sl] = Number(inp.value);
      s.slider = QB.normalizeSlide(s).slider;
      dirty(); renderSlide();
    }));

    // media
    const file = c.querySelector('#mfile');
    const pick = (e) => { if (e) e.preventDefault(); file.click(); };
    ['#mup', '#mup2', '#mrep'].forEach((sel) => { const b = c.querySelector(sel); if (b) b.onclick = pick; });
    file.onchange = () => file.files[0] && uploadImage(file.files[0], (url) => { s.image = url; dirty(); renderSlide(); });
    const del = c.querySelector('#mdel');
    if (del) del.onclick = () => { s.image = ''; dirty(); renderSlide(); };
    const murl = c.querySelector('#murl');
    if (murl) murl.onclick = (e) => {
      e.preventDefault();
      const u = prompt('Paste an image link (https://…)');
      if (u && /^https?:\/\//i.test(u.trim())) { s.image = u.trim(); dirty(); renderSlide(); } else if (u) toast('That link must start with https://', 'error');
    };
    const box = c.querySelector('#mbox');
    box.ondragover = (e) => { e.preventDefault(); box.classList.add('drag'); };
    box.ondragleave = () => box.classList.remove('drag');
    box.ondrop = (e) => {
      e.preventDefault(); box.classList.remove('drag');
      const f = e.dataTransfer.files[0];
      if (f) uploadImage(f, (url) => { s.image = url; dirty(); renderSlide(); });
    };
  }
  document.addEventListener('paste', (e) => {
    if (!ed || !location.hash.startsWith('#edit/')) return;
    const item = [...(e.clipboardData || {}).items || []].find((x) => x.type.startsWith('image/'));
    if (!item) return;
    e.preventDefault();
    const s = curSlide();
    uploadImage(item.getAsFile(), (url) => { s.image = url; dirty(); renderSlide(); });
  });

  // Shrink big photos in the browser before uploading.
  async function uploadImage(file, done) {
    if (!/^image\//.test(file.type)) return toast('Please choose an image file', 'error');
    setStatus('Uploading image…');
    try {
      let dataUrl;
      if (file.type === 'image/gif' && file.size < 5 * 1024 * 1024) {
        dataUrl = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(file); });
      } else {
        const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('Could not open that image')); i.src = URL.createObjectURL(file); });
        const scale = Math.min(1, 1600 / Math.max(img.width, img.height));
        const cv = document.createElement('canvas');
        cv.width = Math.round(img.width * scale); cv.height = Math.round(img.height * scale);
        cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
        dataUrl = file.type === 'image/png' ? cv.toDataURL('image/png') : cv.toDataURL('image/jpeg', 0.86);
        if (dataUrl.length > 7.5e6) dataUrl = cv.toDataURL('image/jpeg', 0.8);
      }
      const r = await api('/api/uploads', { method: 'POST', body: { dataUrl } });
      done(r.url);
    } catch (e) {
      toast(e.message, 'error');
      setStatus(ed && ed.dirty ? 'Unsaved changes…' : '✓ Saved');
    }
  }

  function renderProps() {
    const s = curSlide();
    const p = app.querySelector('#props');
    const opt = (obj, val) => Object.entries(obj).map(([k, l]) => `<option value="${k}" ${k === val ? 'selected' : ''}>${l}</option>`).join('');
    p.innerHTML = `<h3>Slide properties</h3>
      <label class="field"><span>Slide type</span><select class="input" id="ptype">${opt(Object.fromEntries(Object.entries(T).map(([k, t]) => [k, t.label])), s.type)}</select></label>
      <p class="hint">${T[s.type].hint}</p>
      ${s.type !== 'content' ? `
        <label class="field"><span>⏱ Time limit</span><select class="input" id="ptime">${QB.TIME_LIMITS.map((t) => `<option value="${t}" ${t === s.timeLimit ? 'selected' : ''}>${t < 60 ? t + ' seconds' : t / 60 + (t === 60 ? ' minute' : ' minutes')}</option>`).join('')}</select></label>
        <button class="link" id="pall">Apply to all questions</button>` : ''}
      ${T[s.type].scored ? `<label class="field"><span>🏅 Points</span><select class="input" id="ppts">${opt(QB.POINTS, s.points)}</select></label>` : ''}
      ${s.type === 'quiz' ? `<label class="field"><span>Answer options</span><select class="input" id="pmulti">
          <option value="0" ${!s.multi ? 'selected' : ''}>Single select</option><option value="1" ${s.multi ? 'selected' : ''}>Multi-select</option></select></label>
        <p class="hint">${s.multi ? 'Players must pick every correct answer.' : 'Players pick one answer.'}</p>` : ''}
      <hr style="border:0;border-top:1px solid var(--line);margin:18px 0">
      <button class="btn" id="pdup" style="width:100%;margin-bottom:8px">Duplicate slide</button>
      <button class="btn danger" id="pdel" style="width:100%">Delete slide</button>`;
    p.querySelector('#ptype').onchange = (e) => {
      ed.quiz.slides[ed.cur] = QB.changeType(s, e.target.value);
      dirty(); renderList(); renderSlide();
    };
    const time = p.querySelector('#ptime');
    if (time) time.onchange = () => { s.timeLimit = Number(time.value); dirty(); renderList(); };
    const all = p.querySelector('#pall');
    if (all) all.onclick = () => {
      ed.quiz.slides.forEach((x) => { if (x.type !== 'content') x.timeLimit = s.timeLimit; });
      dirty(); renderList(); toast(`All questions set to ${s.timeLimit}s`, 'good');
    };
    const pts = p.querySelector('#ppts');
    if (pts) pts.onchange = () => { s.points = pts.value; dirty(); };
    const multi = p.querySelector('#pmulti');
    if (multi) multi.onchange = () => {
      s.multi = multi.value === '1';
      if (!s.multi) { let seen = false; s.answers.forEach((a) => { if (a.correct && seen) a.correct = false; if (a.correct) seen = true; }); }
      dirty(); renderList(); renderSlide();
    };
    p.querySelector('#pdup').onclick = () => slideOp('dup', ed.cur);
    p.querySelector('#pdel').onclick = () => slideOp('del', ed.cur);
  }

  function settingsModal() {
    const q = ed.quiz;
    let theme = q.theme, cover = q.cover;
    modal(`<h2>Quiz settings</h2>
      <label class="field"><span>Title</span><input class="input" id="st" maxlength="120" value="${esc(q.title)}"></label>
      <label class="field"><span>Description</span><textarea class="input" id="sd" maxlength="500" rows="3">${esc(q.description)}</textarea></label>
      <div class="field"><span style="display:block;font-weight:700;font-size:.85rem;margin-bottom:6px">Theme</span>
        <div class="theme-pick">${Object.entries(QB.THEMES).map(([k, t]) => `<button type="button" data-th="${k}" class="${k === theme ? 'on' : ''}" style="background:${t.bg}">${t.label}</button>`).join('')}</div></div>
      <div class="field" style="margin-top:14px"><span style="display:block;font-weight:700;font-size:.85rem;margin-bottom:6px">Cover image</span>
        <div id="cov" style="display:flex;gap:10px;align-items:center"></div><input type="file" id="cf" accept="image/*" hidden></div>
      <label class="check-row"><input type="checkbox" id="ssh" ${q.shuffleAnswers ? 'checked' : ''}> Shuffle answer order each game</label>
      <div class="foot"><button class="btn" data-close>Cancel</button><button class="btn primary" id="sok">Done</button></div>`, (m, close) => {
      const drawCover = () => {
        m.querySelector('#cov').innerHTML = cover
          ? `<img src="${esc(media(cover))}" style="height:70px;border-radius:6px"><button class="btn small" id="cc">Change</button><button class="btn small" id="cr">Remove</button>`
          : '<button class="btn small" id="cc">Upload cover</button>';
        m.querySelector('#cc').onclick = () => m.querySelector('#cf').click();
        const cr = m.querySelector('#cr');
        if (cr) cr.onclick = () => { cover = ''; drawCover(); };
      };
      drawCover();
      m.querySelector('#cf').onchange = (e) => e.target.files[0] && uploadImage(e.target.files[0], (url) => { cover = url; drawCover(); setStatus(ed.dirty ? 'Unsaved changes…' : '✓ Saved'); });
      m.querySelectorAll('[data-th]').forEach((b) => (b.onclick = () => {
        theme = b.dataset.th;
        m.querySelectorAll('[data-th]').forEach((x) => x.classList.toggle('on', x === b));
      }));
      m.querySelector('#sok').onclick = () => {
        q.title = m.querySelector('#st').value.trim() || 'Untitled quiz';
        q.description = m.querySelector('#sd').value;
        q.theme = theme; q.cover = cover; q.shuffleAnswers = m.querySelector('#ssh').checked;
        app.querySelector('#title').value = q.title;
        UI.setTheme(theme);
        dirty(); close();
      };
    });
  }

  // ---------- helpers ----------
  function modal(html, wire) {
    const bg = document.createElement('div');
    bg.className = 'modal-bg';
    bg.innerHTML = `<div class="modal">${html}</div>`;
    document.body.appendChild(bg);
    const close = () => bg.remove();
    bg.onclick = (e) => { if (e.target === bg || e.target.closest('[data-close]')) close(); };
    wire(bg.querySelector('.modal'), close);
  }
  function download(name, text, type) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type }));
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  route();
})();
