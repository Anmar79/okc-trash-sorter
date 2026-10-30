// Live game engine. A Game is a state machine driven by the host:
//   lobby -> (intro -> question -> result -> scoreboard | content)* -> podium
// Every state change pushes a fresh "view" to the host and to each player, so
// clients just render whatever they're sent (which also makes reconnecting trivial).
const crypto = require('crypto');
const { TYPES, validateSlide, normalizeText } = require('../public/shared');

const INTRO_MS = 4000;
const MAX_PLAYERS = 500;
const FINISHED_TTL_MS = 30 * 60 * 1000;
const IDLE_TTL_MS = 3 * 60 * 60 * 1000;

const token = () => crypto.randomBytes(16).toString('hex');
function shuffled(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

class GameManager {
  constructor(io, store) {
    this.io = io;
    this.store = store;
    this.games = new Map();
    setInterval(() => this.cleanup(), 60 * 1000).unref();
  }
  create(quiz) {
    let pin;
    do pin = String(crypto.randomInt(100000, 1000000)); while (this.games.has(pin));
    const game = new Game(this, quiz, pin);
    this.games.set(pin, game);
    return game;
  }
  get(pin) {
    return this.games.get(String(pin || '').replace(/\D/g, ''));
  }
  cleanup() {
    const now = Date.now();
    for (const [pin, g] of this.games) {
      const ttl = g.phase === 'podium' ? FINISHED_TTL_MS : IDLE_TTL_MS;
      if (now - g.lastActivity > ttl) this.dispose(pin);
    }
  }
  dispose(pin) {
    const g = this.games.get(pin);
    if (!g) return;
    clearTimeout(g.timer);
    g.closed = true;
    for (const p of g.players.values()) if (p.socketId) this.io.to(p.socketId).emit('game:closed');
    if (g.hostSocketId) this.io.to(g.hostSocketId).emit('game:closed');
    this.games.delete(pin);
  }
}

class Game {
  constructor(mgr, quiz, pin) {
    this.mgr = mgr;
    this.io = mgr.io;
    this.pin = pin;
    this.hostKey = token();
    this.hostSocketId = null;
    // Play only slides that are complete; optionally shuffle answer order once per game.
    const slides = quiz.slides.filter((s) => !validateSlide(s).length).map((s) => {
      const c = JSON.parse(JSON.stringify(s));
      if (c.answers && (c.type === 'quiz' || c.type === 'poll')) {
        c.answers = c.answers.filter((a) => a.text.trim());
        if (quiz.shuffleAnswers) c.answers = shuffled(c.answers);
      }
      return c;
    });
    this.quiz = { id: quiz.id, title: quiz.title, theme: quiz.theme, cover: quiz.cover, slides };
    this.players = new Map();
    this.phase = 'lobby';
    this.index = -1;
    this.round = null;
    this.locked = false;
    this.timer = null;
    this.createdAt = new Date().toISOString();
    this.startedAt = null;
    this.lastActivity = Date.now();
    this.reportId = null;
  }

  get slide() { return this.quiz.slides[this.index]; }
  touch() { this.lastActivity = Date.now(); }

  // ---------- players ----------
  addPlayer(socket, rawName) {
    const name = String(rawName || '').replace(/\s+/g, ' ').trim().slice(0, 20);
    if (!name) return { error: 'Enter a nickname' };
    if (this.phase === 'podium') return { error: 'This game has finished' };
    if (this.locked) return { error: 'This game is locked by the host' };
    if (this.players.size >= MAX_PLAYERS) return { error: 'This game is full' };
    const lower = name.toLowerCase();
    for (const p of this.players.values()) if (p.name.toLowerCase() === lower) return { error: 'That nickname is taken, try another one' };
    const p = { id: token().slice(0, 10), token: token(), name, score: 0, streak: 0, rank: 0, lastPoints: 0, answers: {}, socketId: socket.id, connected: true };
    this.players.set(p.id, p);
    this.touch();
    this.ranks();
    this.emitHost();
    this.emitPlayer(p);
    return { player: p };
  }
  rejoinPlayer(socket, tok) {
    for (const p of this.players.values()) {
      if (p.token === tok) {
        if (p.socketId && p.socketId !== socket.id) this.io.to(p.socketId).emit('player:replaced');
        p.socketId = socket.id;
        p.connected = true;
        this.emitHost();
        this.emitPlayer(p);
        return { player: p };
      }
    }
    return { error: 'not found' };
  }
  playerLeft(socketId) {
    for (const p of this.players.values()) {
      if (p.socketId === socketId) {
        p.connected = false;
        p.socketId = null;
        // In the lobby a leaving player simply drops out.
        if (this.phase === 'lobby') this.players.delete(p.id);
        this.emitHost();
        this.maybeEndEarly();
      }
    }
  }
  kick(id) {
    const p = this.players.get(id);
    if (!p) return;
    if (p.socketId) this.io.to(p.socketId).emit('player:kicked');
    this.players.delete(id);
    this.ranks();
    this.emitHost();
    this.maybeEndEarly();
  }

  // ---------- flow ----------
  next() {
    this.touch();
    switch (this.phase) {
      case 'lobby':
        if (!this.players.size) return;
        this.startedAt = new Date().toISOString();
        return this.beginSlide(0);
      case 'intro': return this.openQuestion();
      case 'question': return this.endQuestion();
      case 'result': {
        const last = this.index >= this.quiz.slides.length - 1;
        if (last) return this.podium();
        if (TYPES[this.slide.type].scored) { this.phase = 'scoreboard'; return this.broadcast(); }
        return this.beginSlide(this.index + 1);
      }
      case 'scoreboard':
      case 'content':
        return this.beginSlide(this.index + 1);
    }
  }
  beginSlide(i) {
    clearTimeout(this.timer);
    if (i >= this.quiz.slides.length) return this.podium();
    this.index = i;
    const s = this.slide;
    this.round = { answers: new Map(), startedAt: 0, endsAt: 0 };
    if (s.type === 'puzzle') {
      const idx = s.answers.map((_, k) => k);
      let order = shuffled(idx);
      if (idx.length > 1) while (order.every((v, k) => v === k)) order = shuffled(idx);
      this.round.puzzleOrder = order;
    }
    if (s.type === 'content') {
      this.phase = 'content';
    } else {
      this.phase = 'intro';
      this.round.introEndsAt = Date.now() + INTRO_MS;
      this.timer = setTimeout(() => this.openQuestion(), INTRO_MS);
    }
    this.broadcast();
  }
  openQuestion() {
    if (this.phase !== 'intro') return;
    clearTimeout(this.timer);
    const ms = this.slide.timeLimit * 1000;
    this.phase = 'question';
    this.round.startedAt = Date.now();
    this.round.endsAt = this.round.startedAt + ms;
    this.timer = setTimeout(() => this.endQuestion(), ms + 300);
    this.broadcast();
  }
  submit(player, value) {
    if (this.phase !== 'question') return { error: 'Too late' };
    if (this.round.answers.has(player.id)) return { error: 'Already answered' };
    const s = this.slide;
    const parsed = this.parseAnswer(s, value);
    if (parsed === undefined) return { error: 'Invalid answer' };
    const ms = Math.min(Date.now() - this.round.startedAt, s.timeLimit * 1000);
    const correct = this.isCorrect(s, parsed);
    let points = 0;
    if (correct && s.points !== 'none') {
      points = Math.round(1000 * (1 - ms / (s.timeLimit * 1000) / 2));
      if (s.points === 'double') points *= 2;
    }
    this.round.answers.set(player.id, { value: parsed, ms, correct, points });
    this.touch();
    this.emitHost();
    this.emitPlayer(player);
    this.maybeEndEarly();
    return { ok: true };
  }
  maybeEndEarly() {
    if (this.phase !== 'question') return;
    const active = [...this.players.values()].filter((p) => p.connected);
    if (active.length && active.every((p) => this.round.answers.has(p.id))) {
      clearTimeout(this.timer);
      this.timer = setTimeout(() => this.endQuestion(), 600);
    }
  }
  endQuestion() {
    if (this.phase !== 'question') return;
    clearTimeout(this.timer);
    const s = this.slide;
    const scored = TYPES[s.type].scored;
    for (const p of this.players.values()) {
      const a = this.round.answers.get(p.id);
      p.lastPoints = 0;
      p.lastCorrect = a ? a.correct : false;
      if (scored) {
        if (a && a.correct) {
          p.streak += 1;
          const bonus = s.points === 'none' ? 0 : Math.min(p.streak - 1, 5) * 100;
          p.lastPoints = a.points + bonus;
          p.score += p.lastPoints;
        } else {
          p.streak = 0;
        }
      }
      p.answers[this.index] = a ? { value: a.value, correct: a.correct, points: p.lastPoints, ms: a.ms } : null;
    }
    this.ranks();
    this.phase = 'result';
    this.broadcast();
  }
  podium() {
    clearTimeout(this.timer);
    if (this.phase === 'question') this.endQuestion();
    this.phase = 'podium';
    this.ranks();
    this.saveReport();
    this.broadcast();
  }
  end() {
    if (this.phase === 'lobby') return this.mgr.dispose(this.pin);
    this.podium();
  }

  // ---------- answers ----------
  parseAnswer(s, v) {
    const n = s.answers ? s.answers.length : 0;
    const isIdx = (x) => Number.isInteger(x) && x >= 0 && x < n;
    switch (s.type) {
      case 'quiz':
        if (s.multi) {
          if (!Array.isArray(v)) return undefined;
          const set = [...new Set(v)].filter(isIdx).sort();
          return set.length ? set : undefined;
        }
        return isIdx(v) ? v : undefined;
      case 'truefalse':
      case 'poll':
        return isIdx(v) ? v : undefined;
      case 'typeanswer': {
        const t = String(v == null ? '' : v).trim().slice(0, 60);
        return t ? t : undefined;
      }
      case 'slider': {
        const x = Number(v);
        const { min, max } = s.slider;
        return Number.isFinite(x) && x >= min && x <= max ? x : undefined;
      }
      case 'puzzle': {
        if (!Array.isArray(v) || v.length !== n) return undefined;
        return new Set(v).size === n && v.every(isIdx) ? v : undefined;
      }
    }
    return undefined;
  }
  isCorrect(s, v) {
    switch (s.type) {
      case 'quiz':
        if (s.multi) {
          const right = s.answers.map((a, i) => (a.correct ? i : -1)).filter((i) => i >= 0);
          return right.length === v.length && right.every((i) => v.includes(i));
        }
        return !!s.answers[v].correct;
      case 'truefalse': return !!s.answers[v].correct;
      case 'typeanswer': return s.accepted.some((a) => a.trim() && normalizeText(a) === normalizeText(v));
      case 'slider': return Math.abs(v - s.slider.correct) <= s.slider.margin + 1e-9;
      case 'puzzle': return v.every((x, i) => x === i);
      default: return null;
    }
  }
  describe(s, v) {
    if (v == null) return '';
    switch (s.type) {
      case 'quiz': return (Array.isArray(v) ? v : [v]).map((i) => s.answers[i].text).join(' + ');
      case 'truefalse': case 'poll': return s.answers[v].text;
      case 'puzzle': return v.map((i) => s.answers[i].text).join(' → ');
      default: return String(v);
    }
  }
  correctText(s) {
    switch (s.type) {
      case 'quiz': case 'truefalse': return s.answers.filter((a) => a.correct).map((a) => a.text).join(' + ');
      case 'typeanswer': return s.accepted.filter((a) => a.trim()).join(' / ');
      case 'slider': return String(s.slider.correct) + (s.slider.margin ? ` (±${s.slider.margin})` : '');
      case 'puzzle': return s.answers.map((a) => a.text).join(' → ');
      default: return '';
    }
  }
  stats() {
    const s = this.slide;
    const answers = [...this.round.answers.values()];
    const out = { answered: answers.length, correct: answers.filter((a) => a.correct).length };
    if (s.type === 'quiz' || s.type === 'truefalse' || s.type === 'poll') {
      out.counts = s.answers.map(() => 0);
      for (const a of answers) for (const i of Array.isArray(a.value) ? a.value : [a.value]) out.counts[i]++;
    } else if (s.type === 'typeanswer') {
      const groups = new Map();
      for (const a of answers) {
        const k = normalizeText(a.value);
        const g = groups.get(k) || { text: a.value, count: 0, correct: a.correct };
        g.count++;
        groups.set(k, g);
      }
      out.groups = [...groups.values()].sort((a, b) => b.count - a.count).slice(0, 8);
    } else if (s.type === 'slider') {
      const vals = answers.map((a) => a.value);
      out.average = vals.length ? vals.reduce((x, y) => x + y, 0) / vals.length : null;
      out.values = vals.slice(0, 500);
    }
    return out;
  }

  // ---------- ranking & views ----------
  ranks() {
    const list = [...this.players.values()].sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
    list.forEach((p, i) => { p.rank = i > 0 && list[i - 1].score === p.score ? list[i - 1].rank : i + 1; });
    this.ranked = list;
    return list;
  }
  publicSlide(forHost) {
    const s = this.slide;
    if (!s) return null;
    if (forHost) return s;
    const v = { type: s.type, question: s.question, image: s.image, timeLimit: s.timeLimit, points: s.points };
    if (s.type === 'quiz' || s.type === 'truefalse' || s.type === 'poll') {
      v.answers = s.answers.map((a) => ({ text: a.text }));
      v.multi = !!s.multi;
    } else if (s.type === 'slider') {
      const { min, max, step } = s.slider;
      v.slider = { min, max, step };
    } else if (s.type === 'puzzle') {
      v.items = this.round.puzzleOrder.map((i) => ({ i, text: s.answers[i].text }));
    } else if (s.type === 'content') {
      v.body = s.body;
    }
    return v;
  }
  common() {
    return {
      phase: this.phase, pin: this.pin, index: this.index, total: this.quiz.slides.length,
      quizTitle: this.quiz.title, theme: this.quiz.theme, serverNow: Date.now(),
      endsAt: this.round ? (this.phase === 'intro' ? this.round.introEndsAt : this.round.endsAt) : 0,
      playerCount: this.players.size,
    };
  }
  hostView() {
    const v = this.common();
    v.locked = this.locked;
    v.cover = this.quiz.cover;
    v.players = [...this.players.values()].map((p) => ({ id: p.id, name: p.name, score: p.score, connected: p.connected }));
    if (this.round && this.phase !== 'lobby') {
      v.slide = this.publicSlide(true);
      v.answeredCount = this.round.answers.size;
      if (this.round.puzzleOrder) v.puzzleOrder = this.round.puzzleOrder;
      if (this.phase === 'result' || this.phase === 'scoreboard') {
        v.stats = this.stats();
        v.correctText = this.correctText(this.slide);
      }
    }
    const board = (this.ranked || []).map((p) => ({ id: p.id, name: p.name, score: p.score, rank: p.rank, lastPoints: p.lastPoints, streak: p.streak }));
    if (this.phase === 'scoreboard') v.scoreboard = board.slice(0, 5);
    if (this.phase === 'podium') { v.podium = board; v.reportId = this.reportId; }
    return v;
  }
  playerView(p) {
    const v = this.common();
    v.me = { id: p.id, name: p.name, score: p.score, rank: p.rank, streak: p.streak };
    if (this.phase === 'intro' || this.phase === 'question' || this.phase === 'content') {
      v.slide = this.publicSlide(false);
      const a = this.round.answers.get(p.id);
      v.answered = !!a;
    }
    if (this.phase === 'result' || this.phase === 'scoreboard') {
      const s = this.slide;
      const a = p.answers[this.index];
      const idx = this.ranked.indexOf(p);
      const ahead = idx > 0 ? this.ranked[idx - 1] : null;
      v.result = {
        type: s.type, scored: TYPES[s.type].scored, answered: !!a, correct: a ? a.correct : false,
        points: p.lastPoints, streak: p.streak, correctText: this.correctText(s),
        yourAnswer: a ? this.describe(s, a.value) : '',
        ahead: ahead && ahead.score > p.score ? { name: ahead.name, gap: ahead.score - p.score } : null,
      };
    }
    if (this.phase === 'podium') {
      v.podium = this.ranked.slice(0, 3).map((x) => ({ name: x.name, score: x.score, rank: x.rank }));
    }
    return v;
  }
  emitHost() {
    if (this.hostSocketId) this.io.to(this.hostSocketId).emit('host:view', this.hostView());
  }
  emitPlayer(p) {
    if (p.socketId) this.io.to(p.socketId).emit('player:view', this.playerView(p));
  }
  broadcast() {
    if (this.closed) return;
    this.emitHost();
    for (const p of this.players.values()) this.emitPlayer(p);
  }

  saveReport() {
    if (this.reportId) return;
    const slides = this.quiz.slides;
    const report = {
      quizId: this.quiz.id, quizTitle: this.quiz.title, pin: this.pin,
      startedAt: this.startedAt || this.createdAt, endedAt: new Date().toISOString(),
      slides: slides.map((s) => ({ type: s.type, question: s.question, correctText: this.correctText(s) })),
      players: this.ranked.map((p) => ({
        name: p.name, rank: p.rank, score: p.score,
        correctCount: Object.values(p.answers).filter((a) => a && a.correct).length,
        answers: slides.map((s, i) => {
          const a = p.answers[i];
          return a ? { text: this.describe(s, a.value), correct: a.correct, points: a.points, seconds: Math.round(a.ms / 100) / 10 } : null;
        }),
      })),
    };
    try {
      this.reportId = this.mgr.store.saveReport(report).id;
      if (this.quiz.id) this.mgr.store.markPlayed(this.quiz.id);
    } catch (e) {
      console.error('Could not save report', e);
    }
  }
}

module.exports = { GameManager };
