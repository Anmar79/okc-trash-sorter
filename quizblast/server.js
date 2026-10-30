// QuizBlast server: admin API, static pages, and the live game over Socket.IO.
const path = require('path');
const fs = require('fs');
const http = require('http');
const crypto = require('crypto');
const express = require('express');
const { Server } = require('socket.io');
const QRCode = require('qrcode');
const { createStore } = require('./lib/store');
const { GameManager } = require('./lib/game');
const { validateSlide } = require('./public/shared');

// Settings can live in a .env file next to this one (KEY=value per line).
try {
  for (const line of fs.readFileSync(path.join(__dirname, '.env'), 'utf8').split(/\r?\n/)) {
    const m = /^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/.exec(line);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2');
  }
} catch { /* no .env file */ }

const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || '0.0.0.0';
// Mount the whole app under a sub-path, e.g. BASE_PATH=/quizblast when a web
// server proxies https://your-server/quizblast/ to this process.
const BASE = ('/' + (process.env.BASE_PATH || '').replace(/^\/+|\/+$/g, '')).replace(/^\/$/, '');
// Address players use to join (printed under the QR code). Defaults to the
// address the host screen was opened from.
const PUBLIC_URL = (process.env.PUBLIC_URL || '').replace(/\/+$/, '');
const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(__dirname, 'data'));
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin';
if (!process.env.ADMIN_PASSWORD) console.warn('WARNING: ADMIN_PASSWORD is not set, the admin password is "admin".');

const store = createStore(DATA_DIR);
seedExample();

// ---------- admin auth (signed cookie) ----------
const secretFile = path.join(DATA_DIR, 'secret.key');
if (!fs.existsSync(secretFile)) fs.writeFileSync(secretFile, crypto.randomBytes(32).toString('hex'));
const SECRET = fs.readFileSync(secretFile, 'utf8').trim();
const COOKIE = 'qb_admin';
const sign = (v) => crypto.createHmac('sha256', SECRET).update(v).digest('hex');
function makeToken() {
  const exp = String(Date.now() + 30 * 24 * 3600 * 1000);
  return exp + '.' + sign(exp + ADMIN_PASSWORD);
}
function validToken(t) {
  const [exp, sig] = String(t || '').split('.');
  if (!exp || !sig || Number(exp) < Date.now()) return false;
  const want = sign(exp + ADMIN_PASSWORD);
  return sig.length === want.length && crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(want));
}
function cookieValue(header, name) {
  const m = new RegExp('(?:^|;\\s*)' + name + '=([^;]*)').exec(header || '');
  return m ? decodeURIComponent(m[1]) : '';
}
const isAdmin = (req) => validToken(cookieValue(req.headers.cookie, COOKIE));
function requireAdmin(req, res, next) {
  if (isAdmin(req)) return next();
  res.status(401).json({ error: 'Please log in' });
}
const failedLogins = new Map();

// ---------- http ----------
const app = express();
app.disable('x-powered-by');
app.set('trust proxy', true);
const router = express.Router();
router.use(express.json({ limit: '10mb' }));

const pages = {};
function page(name) {
  return (req, res) => {
    if (!pages[name] || process.env.NODE_ENV === 'development') {
      pages[name] = fs.readFileSync(path.join(__dirname, 'views', name + '.html'), 'utf8').replace(/%BASE%/g, BASE);
    }
    res.type('html').set('Cache-Control', 'no-cache').send(pages[name]);
  };
}
router.get('/', page('play'));
router.get('/admin', page('admin'));
router.get('/host', page('host'));

router.post('/api/login', (req, res) => {
  const ip = req.ip;
  const f = failedLogins.get(ip) || { n: 0, until: 0 };
  if (f.until > Date.now()) return res.status(429).json({ error: 'Too many attempts, try again in a minute' });
  const given = crypto.createHash('sha256').update(String((req.body || {}).password || '')).digest();
  const want = crypto.createHash('sha256').update(ADMIN_PASSWORD).digest();
  if (!crypto.timingSafeEqual(given, want)) {
    f.n += 1;
    if (f.n >= 5) { f.n = 0; f.until = Date.now() + 60 * 1000; }
    failedLogins.set(ip, f);
    return res.status(401).json({ error: 'Wrong password' });
  }
  failedLogins.delete(ip);
  res.set('Set-Cookie', `${COOKIE}=${makeToken()}; Path=${BASE || '/'}; HttpOnly; SameSite=Lax; Max-Age=${30 * 24 * 3600}${req.secure ? '; Secure' : ''}`);
  res.json({ ok: true });
});
router.post('/api/logout', (req, res) => {
  res.set('Set-Cookie', `${COOKIE}=; Path=${BASE || '/'}; HttpOnly; SameSite=Lax; Max-Age=0`);
  res.json({ ok: true });
});
router.get('/api/me', (req, res) => res.json({ admin: isAdmin(req) }));

router.get('/api/quizzes', requireAdmin, (req, res) => res.json(store.listQuizzes()));
router.post('/api/quizzes', requireAdmin, (req, res) => res.json(store.createQuiz(req.body)));
router.get('/api/quizzes/:id', requireAdmin, (req, res) => {
  const q = store.getQuiz(req.params.id);
  q ? res.json(q) : res.status(404).json({ error: 'Quiz not found' });
});
router.put('/api/quizzes/:id', requireAdmin, (req, res) => {
  const q = store.updateQuiz(req.params.id, req.body);
  q ? res.json(q) : res.status(404).json({ error: 'Quiz not found' });
});
router.delete('/api/quizzes/:id', requireAdmin, (req, res) => res.json({ ok: store.deleteQuiz(req.params.id) }));
router.post('/api/quizzes/:id/duplicate', requireAdmin, (req, res) => {
  const q = store.getQuiz(req.params.id);
  if (!q) return res.status(404).json({ error: 'Quiz not found' });
  res.json(store.createQuiz(Object.assign({}, q, { title: q.title + ' (copy)' })));
});
router.post('/api/uploads', requireAdmin, (req, res) => {
  const url = store.saveUpload((req.body || {}).dataUrl);
  url ? res.json({ url }) : res.status(400).json({ error: 'Upload a PNG, JPG, GIF or WebP image under 6 MB' });
});

router.get('/api/reports', requireAdmin, (req, res) => res.json(store.listReports()));
router.get('/api/reports/:id', requireAdmin, (req, res) => {
  const r = store.getReport(req.params.id);
  r ? res.json(r) : res.status(404).json({ error: 'Report not found' });
});
router.delete('/api/reports/:id', requireAdmin, (req, res) => res.json({ ok: store.deleteReport(req.params.id) }));
router.get('/api/reports/:id/csv', requireAdmin, (req, res) => {
  const r = store.getReport(req.params.id);
  if (!r) return res.status(404).send('Report not found');
  const cell = (v) => {
    let s = String(v == null ? '' : v);
    if (/^[=+\-@]/.test(s)) s = "'" + s; // stop spreadsheet formula injection
    return '"' + s.replace(/"/g, '""') + '"';
  };
  const head = ['Rank', 'Player', 'Score', 'Correct'].concat(r.slides.map((s, i) => `Q${i + 1}: ${s.question}`));
  const rows = r.players.map((p) => [p.rank, p.name, p.score, p.correctCount].concat(
    p.answers.map((a, i) => (r.slides[i].type === 'content' ? '' : a ? `${a.text} (${a.correct === null ? 'poll' : a.correct ? '✓' : '✗'} ${a.points} pts, ${a.seconds}s)` : 'no answer'))));
  const csv = '﻿' + [head].concat(rows).map((row) => row.map(cell).join(',')).join('\r\n');
  const name = (r.quizTitle || 'report').replace(/[^\w -]+/g, '').trim() || 'report';
  res.set('Content-Disposition', `attachment; filename="${name} ${r.endedAt.slice(0, 10)}.csv"`).type('text/csv').send(csv);
});

router.get('/api/qr', async (req, res) => {
  const text = String(req.query.text || '').slice(0, 500);
  if (!/^https?:\/\//.test(text)) return res.status(400).send('Bad url');
  const svg = await QRCode.toString(text, { type: 'svg', margin: 1, errorCorrectionLevel: 'M', color: { dark: '#111111', light: '#ffffff' } });
  res.type('image/svg+xml').set('Cache-Control', 'public, max-age=86400').send(svg);
});
router.get('/api/config', (req, res) => res.json({ publicUrl: PUBLIC_URL }));
router.get('/healthz', (req, res) => res.json({ ok: true, games: games.games.size }));

router.use('/uploads', express.static(store.dirs.uploads, { maxAge: '30d', fallthrough: false }));
router.use(express.static(path.join(__dirname, 'public'), { maxAge: '1h' }));

app.use(BASE || '/', router);
if (BASE) app.get('/', (req, res) => res.redirect(BASE + '/'));

// ---------- realtime ----------
const server = http.createServer(app);
const io = new Server(server, { path: BASE + '/socket.io', maxHttpBufferSize: 1e5 });
const games = new GameManager(io, store);

io.on('connection', (socket) => {
  const admin = validToken(cookieValue(socket.handshake.headers.cookie, COOKIE));
  const reply = (ack, v) => typeof ack === 'function' && ack(v);
  const hosted = () => {
    const g = socket.data.pin && games.get(socket.data.pin);
    return g && socket.data.role === 'host' && g.hostSocketId === socket.id ? g : null;
  };
  const playing = () => {
    const g = socket.data.pin && games.get(socket.data.pin);
    const p = g && g.players.get(socket.data.playerId);
    return p && p.socketId === socket.id ? { g, p } : null;
  };
  const attachHost = (g) => {
    if (g.hostSocketId && g.hostSocketId !== socket.id) io.to(g.hostSocketId).emit('host:replaced');
    g.hostSocketId = socket.id;
    socket.data.pin = g.pin;
    socket.data.role = 'host';
    g.emitHost();
  };

  socket.on('host:create', (msg, ack) => {
    if (!admin) return reply(ack, { error: 'Please log in to host a game' });
    const quiz = store.getQuiz((msg || {}).quizId);
    if (!quiz) return reply(ack, { error: 'Quiz not found' });
    if (!quiz.slides.some((s) => !validateSlide(s).length)) return reply(ack, { error: 'This quiz has no finished questions yet' });
    const g = games.create(quiz);
    attachHost(g);
    reply(ack, { pin: g.pin, hostKey: g.hostKey });
  });
  socket.on('host:rejoin', (msg, ack) => {
    const g = games.get((msg || {}).pin);
    if (!g || g.hostKey !== (msg || {}).hostKey) return reply(ack, { error: 'Game not found' });
    attachHost(g);
    reply(ack, { pin: g.pin });
  });
  socket.on('host:action', (msg) => {
    const g = hosted();
    if (!g || !msg) return;
    switch (msg.action) {
      case 'next': return g.next();
      case 'kick': return g.kick(msg.playerId);
      case 'lock': g.locked = !!msg.value; return g.emitHost();
      case 'end': return g.end();
    }
  });

  socket.on('pin:check', (msg, ack) => {
    const g = games.get((msg || {}).pin);
    if (!g) return reply(ack, { error: "We couldn't find a game with that PIN" });
    if (g.phase === 'podium') return reply(ack, { error: 'That game has finished' });
    if (g.locked) return reply(ack, { error: 'This game is locked by the host' });
    reply(ack, { ok: true, pin: g.pin, title: g.quiz.title, theme: g.quiz.theme });
  });
  socket.on('player:join', (msg, ack) => {
    const g = games.get((msg || {}).pin);
    if (!g) return reply(ack, { error: "We couldn't find a game with that PIN" });
    const r = g.addPlayer(socket, msg.name);
    if (r.error) return reply(ack, r);
    socket.data.pin = g.pin;
    socket.data.playerId = r.player.id;
    socket.data.role = 'player';
    reply(ack, { pin: g.pin, token: r.player.token });
    g.emitPlayer(r.player);
  });
  socket.on('player:rejoin', (msg, ack) => {
    const g = games.get((msg || {}).pin);
    if (!g) return reply(ack, { error: 'gone' });
    const r = g.rejoinPlayer(socket, String((msg || {}).token || ''));
    if (r.error) return reply(ack, r);
    socket.data.pin = g.pin;
    socket.data.playerId = r.player.id;
    socket.data.role = 'player';
    reply(ack, { pin: g.pin });
  });
  socket.on('player:answer', (value, ack) => {
    const c = playing();
    if (!c) return reply(ack, { error: 'Not in a game' });
    reply(ack, c.g.submit(c.p, value));
  });
  socket.on('player:leave', () => {
    const c = playing();
    if (c) c.g.kick(c.p.id);
  });

  socket.on('disconnect', () => {
    const g = socket.data.pin && games.get(socket.data.pin);
    if (!g) return;
    if (socket.data.role === 'player') g.playerLeft(socket.id);
    else if (g.hostSocketId === socket.id) g.hostSocketId = null;
  });
});

server.listen(PORT, HOST, () => {
  console.log(`QuizBlast running on http://localhost:${PORT}${BASE}/`);
  console.log(`  Admin:   http://localhost:${PORT}${BASE}/admin`);
  console.log(`  Players: http://localhost:${PORT}${BASE}/`);
});

function seedExample() {
  if (store.listQuizzes().length) return;
  const q = (question, answers, right, extra) => Object.assign({
    type: 'quiz', question, timeLimit: 20, points: 'standard',
    answers: answers.map((text, i) => ({ text, correct: i === right })),
  }, extra);
  store.createQuiz({
    title: 'Minute to Win It Party Game',
    description: 'A sample quiz showing every question type. Edit it or make your own.',
    theme: 'violet',
    slides: [
      { type: 'content', question: 'Welcome to the party quiz!', body: 'Answer fast for more points. Get answers right in a row for a streak bonus.' },
      q('How many days are in a leap year?', ['365', '366', '364', '367'], 1),
      q('Which planet is known as the Red Planet?', ['Venus', 'Jupiter', 'Mars', 'Mercury'], 2),
      { type: 'truefalse', question: 'A day on Venus is longer than a year on Venus.', timeLimit: 20, answers: [{ text: 'True', correct: true }, { text: 'False' }] },
      { type: 'typeanswer', question: 'What is the capital city of Oklahoma?', timeLimit: 30, accepted: ['Oklahoma City', 'OKC'] },
      { type: 'slider', question: 'In what year did Oklahoma become a state?', timeLimit: 30, slider: { min: 1850, max: 1950, step: 1, correct: 1907, margin: 2 } },
      { type: 'puzzle', question: 'Put these planets in order, closest to the Sun first.', timeLimit: 45, answers: [{ text: 'Mercury' }, { text: 'Venus' }, { text: 'Earth' }, { text: 'Mars' }] },
      q('What comes next: 2, 4, 8, 16, ...?', ['24', '30', '32', '64'], 2, { points: 'double' }),
      { type: 'poll', question: 'Which party game should we play next?', timeLimit: 20, answers: [{ text: 'Charades' }, { text: 'Trivia' }, { text: 'Pictionary' }, { text: 'Karaoke' }] },
    ],
  });
}
