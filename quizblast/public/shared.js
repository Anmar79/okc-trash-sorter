// Quiz model shared by the server (require) and the browser (window.QB).
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.QB = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const TYPES = {
    quiz: { label: 'Quiz', hint: 'Multiple choice, one or more right answers', scored: true },
    truefalse: { label: 'True or false', hint: 'Two options', scored: true },
    typeanswer: { label: 'Type answer', hint: 'Players type the answer', scored: true },
    slider: { label: 'Slider', hint: 'Pick a number on a scale', scored: true },
    puzzle: { label: 'Puzzle', hint: 'Put the items in the right order', scored: true },
    poll: { label: 'Poll', hint: 'Collect opinions, no points', scored: false },
    content: { label: 'Content slide', hint: 'Title, text and image, no answers', scored: false },
  };
  const TIME_LIMITS = [5, 10, 20, 30, 45, 60, 90, 120, 240];
  const POINTS = { standard: 'Standard', double: 'Double points', none: 'No points' };
  const THEMES = {
    violet: { label: 'Violet', bg: 'linear-gradient(135deg,#3b1d8f 0%,#6a2bd9 55%,#9b4dff 100%)' },
    ocean: { label: 'Ocean', bg: 'linear-gradient(135deg,#06306b 0%,#0b63c4 55%,#1fb5e8 100%)' },
    forest: { label: 'Forest', bg: 'linear-gradient(135deg,#0d3b2a 0%,#13704b 55%,#36b37e 100%)' },
    sunset: { label: 'Sunset', bg: 'linear-gradient(135deg,#7a1f3d 0%,#d9475b 55%,#ff9a3c 100%)' },
    midnight: { label: 'Midnight', bg: 'linear-gradient(135deg,#0b0f1e 0%,#1b2340 60%,#2d3a66 100%)' },
  };
  // Answer tiles: an original shape + color per slot.
  const SHAPES = [
    { name: 'star', color: '#e2384d', path: 'M12 2l2.9 6.6 7.1.6-5.4 4.7 1.6 7L12 17.3 5.8 20.9l1.6-7L2 9.2l7.1-.6z' },
    { name: 'heart', color: '#2b74de', path: 'M12 21s-7.5-4.6-9.6-9.2C.9 8.4 3 4.5 6.7 4.5c2.1 0 3.6 1.1 5.3 3 1.7-1.9 3.2-3 5.3-3 3.7 0 5.8 3.9 4.3 7.3C19.5 16.4 12 21 12 21z' },
    { name: 'moon', color: '#d99a0b', path: 'M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5z' },
    { name: 'bolt', color: '#1f9d55', path: 'M13 2L4 14h7l-1 8 9-12h-7z' },
    { name: 'hexagon', color: '#8a3fd1', path: 'M12 2l8.66 5v10L12 22l-8.66-5V7z' },
    { name: 'drop', color: '#0f9a9a', path: 'M12 2s7 7.6 7 12.5A7 7 0 0 1 5 14.5C5 9.6 12 2 12 2z' },
  ];
  const MAX_ANSWERS = 6;

  function uid() {
    return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
  }
  function str(v, max) {
    return (typeof v === 'string' ? v : v == null ? '' : String(v)).slice(0, max);
  }
  function num(v, def) {
    const n = Number(v);
    return Number.isFinite(n) ? n : def;
  }
  function mediaUrl(v) {
    const s = str(v, 2000).trim();
    return /^(https?:\/\/|\/uploads\/)/i.test(s) ? s : '';
  }

  function newSlide(type) {
    const s = { id: uid(), type: type || 'quiz', question: '', image: '', timeLimit: 20, points: 'standard' };
    return changeType(s, s.type);
  }

  // Switch a slide's type, keeping whatever content still makes sense.
  function changeType(slide, type) {
    const s = Object.assign({}, slide, { type });
    const prev = Array.isArray(slide.answers) ? slide.answers : [];
    delete s.answers; delete s.multi; delete s.accepted; delete s.slider; delete s.body;
    if (type === 'quiz' || type === 'poll') {
      const a = prev.filter((x) => x && x.text !== undefined).map((x) => ({ text: x.text, correct: type === 'quiz' && !!x.correct }));
      while (a.length < 4) a.push({ text: '', correct: false });
      s.answers = a.slice(0, MAX_ANSWERS);
      if (type === 'quiz') s.multi = !!slide.multi;
    } else if (type === 'truefalse') {
      const trueRight = prev.length ? !!(prev[0] && prev[0].correct) : true;
      s.answers = [{ text: 'True', correct: trueRight }, { text: 'False', correct: !trueRight }];
    } else if (type === 'typeanswer') {
      const right = prev.filter((x) => x && x.correct && x.text).map((x) => x.text);
      s.accepted = slide.accepted && slide.accepted.length ? slide.accepted.slice() : right.length ? right : [''];
    } else if (type === 'slider') {
      s.slider = Object.assign({ min: 0, max: 100, step: 1, correct: 50, margin: 0 }, slide.slider || {});
    } else if (type === 'puzzle') {
      const a = prev.filter((x) => x && x.text !== undefined).map((x) => ({ text: x.text }));
      while (a.length < 4) a.push({ text: '' });
      s.answers = a.slice(0, MAX_ANSWERS);
    } else if (type === 'content') {
      s.body = slide.body || '';
    }
    if (!TYPES[type].scored) s.points = 'none';
    else if (s.points === 'none' && !TYPES[slide.type]?.scored) s.points = 'standard';
    return s;
  }

  function normalizeSlide(raw) {
    raw = raw && typeof raw === 'object' ? raw : {};
    const type = TYPES[raw.type] ? raw.type : 'quiz';
    const s = {
      id: /^[a-z0-9]{4,24}$/i.test(raw.id || '') ? raw.id : uid(),
      type,
      question: str(raw.question, 300),
      image: mediaUrl(raw.image),
      timeLimit: TIME_LIMITS.includes(Number(raw.timeLimit)) ? Number(raw.timeLimit) : 20,
      points: POINTS[raw.points] ? raw.points : 'standard',
    };
    if (!TYPES[type].scored) s.points = 'none';
    const answers = Array.isArray(raw.answers) ? raw.answers.slice(0, MAX_ANSWERS) : [];
    if (type === 'quiz' || type === 'poll') {
      s.answers = answers.map((a) => ({ text: str(a && a.text, 120), correct: type === 'quiz' && !!(a && a.correct) }));
      while (s.answers.length < 2) s.answers.push({ text: '', correct: false });
      if (type === 'quiz') s.multi = !!raw.multi;
    } else if (type === 'truefalse') {
      const trueRight = answers.length ? !!(answers[0] && answers[0].correct) : true;
      s.answers = [{ text: 'True', correct: trueRight }, { text: 'False', correct: !trueRight }];
    } else if (type === 'typeanswer') {
      const acc = Array.isArray(raw.accepted) ? raw.accepted : [];
      s.accepted = acc.slice(0, 8).map((a) => str(a, 60));
      if (!s.accepted.length) s.accepted = [''];
    } else if (type === 'slider') {
      const r = raw.slider || {};
      let min = num(r.min, 0), max = num(r.max, 100);
      if (max <= min) max = min + 1;
      const step = Math.max(0.01, Math.min(num(r.step, 1), max - min));
      const correct = Math.min(max, Math.max(min, num(r.correct, min)));
      const margin = Math.max(0, num(r.margin, 0));
      s.slider = { min, max, step, correct, margin };
    } else if (type === 'puzzle') {
      s.answers = answers.map((a) => ({ text: str(a && a.text, 80) }));
      while (s.answers.length < 3) s.answers.push({ text: '' });
    } else if (type === 'content') {
      s.body = str(raw.body, 1000);
    }
    return s;
  }

  function normalizeQuiz(raw) {
    raw = raw && typeof raw === 'object' ? raw : {};
    const slides = Array.isArray(raw.slides) ? raw.slides.slice(0, 200).map(normalizeSlide) : [];
    return {
      title: str(raw.title, 120).trim() || 'Untitled quiz',
      description: str(raw.description, 500),
      cover: mediaUrl(raw.cover),
      theme: THEMES[raw.theme] ? raw.theme : 'violet',
      shuffleAnswers: !!raw.shuffleAnswers,
      slides: slides.length ? slides : [newSlide('quiz')],
    };
  }

  // Problems that stop a slide from being played. Empty array = ready.
  function validateSlide(s) {
    const p = [];
    if (!s.question.trim()) p.push(s.type === 'content' ? 'Add a title' : 'Add a question');
    if (s.type === 'quiz' || s.type === 'poll' || s.type === 'puzzle') {
      const filled = s.answers.filter((a) => a.text.trim());
      if (filled.length < 2) p.push('Add at least 2 answers');
      if (s.type === 'puzzle' && filled.length !== s.answers.length) p.push('Fill in or remove empty puzzle items');
      if (s.type === 'quiz' && !s.answers.some((a) => a.text.trim() && a.correct)) p.push('Mark the correct answer');
    } else if (s.type === 'typeanswer') {
      if (!s.accepted.some((a) => a.trim())) p.push('Add the correct answer');
    }
    return p;
  }

  function normalizeText(s) {
    return String(s || '')
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
  }

  return { TYPES, TIME_LIMITS, POINTS, THEMES, SHAPES, MAX_ANSWERS, uid, newSlide, changeType, normalizeSlide, normalizeQuiz, validateSlide, normalizeText };
});
