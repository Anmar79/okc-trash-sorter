// File-based storage: one JSON file per quiz and per game report under DATA_DIR.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { normalizeQuiz } = require('../public/shared');

const ID_RE = /^[a-f0-9]{12}$/;

function createStore(dataDir) {
  const dirs = {
    quizzes: path.join(dataDir, 'quizzes'),
    reports: path.join(dataDir, 'reports'),
    uploads: path.join(dataDir, 'uploads'),
  };
  Object.values(dirs).forEach((d) => fs.mkdirSync(d, { recursive: true }));

  const newId = () => crypto.randomBytes(6).toString('hex');
  const file = (kind, id) => {
    if (!ID_RE.test(id || '')) return null;
    return path.join(dirs[kind], id + '.json');
  };
  const read = (kind, id) => {
    const f = file(kind, id);
    if (!f || !fs.existsSync(f)) return null;
    try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; }
  };
  const write = (kind, id, obj) => {
    const f = file(kind, id);
    const tmp = f + '.' + process.pid + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(obj, null, 1));
    fs.renameSync(tmp, f);
  };
  const remove = (kind, id) => {
    const f = file(kind, id);
    if (!f || !fs.existsSync(f)) return false;
    fs.unlinkSync(f);
    return true;
  };
  const all = (kind) =>
    fs.readdirSync(dirs[kind])
      .filter((n) => n.endsWith('.json'))
      .map((n) => read(kind, n.slice(0, -5)))
      .filter(Boolean);

  return {
    dirs,
    listQuizzes() {
      return all('quizzes')
        .map((q) => ({
          id: q.id, title: q.title, description: q.description, cover: q.cover || (q.slides.find((s) => s.image) || {}).image || '',
          theme: q.theme, slideCount: q.slides.length, updatedAt: q.updatedAt, createdAt: q.createdAt, timesPlayed: q.timesPlayed || 0,
        }))
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    },
    getQuiz: (id) => read('quizzes', id),
    createQuiz(raw) {
      const now = new Date().toISOString();
      const q = Object.assign(normalizeQuiz(raw), { id: newId(), createdAt: now, updatedAt: now, timesPlayed: 0 });
      write('quizzes', q.id, q);
      return q;
    },
    updateQuiz(id, raw) {
      const old = read('quizzes', id);
      if (!old) return null;
      const q = Object.assign(normalizeQuiz(raw), {
        id, createdAt: old.createdAt, updatedAt: new Date().toISOString(), timesPlayed: old.timesPlayed || 0,
      });
      write('quizzes', id, q);
      return q;
    },
    markPlayed(id) {
      const q = read('quizzes', id);
      if (q) { q.timesPlayed = (q.timesPlayed || 0) + 1; write('quizzes', id, q); }
    },
    deleteQuiz: (id) => remove('quizzes', id),

    listReports() {
      return all('reports')
        .map((r) => ({ id: r.id, quizId: r.quizId, quizTitle: r.quizTitle, startedAt: r.startedAt, endedAt: r.endedAt, playerCount: r.players.length, winner: (r.players[0] || {}).name || '' }))
        .sort((a, b) => b.endedAt.localeCompare(a.endedAt));
    },
    getReport: (id) => read('reports', id),
    saveReport(report) {
      report.id = newId();
      write('reports', report.id, report);
      return report;
    },
    deleteReport: (id) => remove('reports', id),

    saveUpload(dataUrl) {
      const m = /^data:image\/(png|jpeg|gif|webp);base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl || '');
      if (!m) return null;
      const buf = Buffer.from(m[2], 'base64');
      if (!buf.length || buf.length > 6 * 1024 * 1024) return null;
      const name = crypto.randomBytes(8).toString('hex') + '.' + (m[1] === 'jpeg' ? 'jpg' : m[1]);
      fs.writeFileSync(path.join(dirs.uploads, name), buf);
      return '/uploads/' + name;
    },
  };
}

module.exports = { createStore };
