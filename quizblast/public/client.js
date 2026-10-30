// Small helpers shared by the player, host and admin pages.
(function () {
  const BASE = window.BASE || '';
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const media = (u) => (u && u.startsWith('/uploads/') ? BASE + u : u || '');
  const shape = (i, cls) => {
    const s = QB.SHAPES[i % QB.SHAPES.length];
    return `<svg class="${cls || 'shape'}" viewBox="0 0 24 24" aria-hidden="true"><path d="${s.path}" fill="currentColor"/></svg>`;
  };
  const color = (i) => QB.SHAPES[i % QB.SHAPES.length].color;

  async function api(path, opts) {
    opts = opts || {};
    const res = await fetch(BASE + path, {
      method: opts.method || 'GET',
      headers: opts.body !== undefined ? { 'Content-Type': 'application/json' } : {},
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      credentials: 'same-origin',
    });
    let data = null;
    try { data = await res.json(); } catch { /* not json */ }
    if (!res.ok) {
      const err = new Error((data && data.error) || 'Request failed (' + res.status + ')');
      err.status = res.status;
      throw err;
    }
    return data;
  }

  function setTheme(name) {
    const t = QB.THEMES[name] || QB.THEMES.violet;
    document.documentElement.style.setProperty('--theme-bg', t.bg);
  }

  // Server clock offset so countdowns line up across devices.
  let offset = 0;
  const syncClock = (serverNow) => { if (serverNow) offset = serverNow - Date.now(); };
  const now = () => Date.now() + offset;

  // Re-render a countdown element every 200ms until endsAt.
  let tick = null;
  function countdown(el, endsAt, onTick) {
    clearInterval(tick);
    if (!el) return;
    const draw = () => {
      const left = Math.max(0, Math.ceil((endsAt - now()) / 1000));
      el.textContent = left;
      if (onTick) onTick(left);
      if (left <= 0) clearInterval(tick);
    };
    draw();
    tick = setInterval(draw, 200);
  }
  const stopCountdown = () => clearInterval(tick);

  function toast(msg, kind) {
    let box = document.getElementById('toasts');
    if (!box) {
      box = document.createElement('div');
      box.id = 'toasts';
      document.body.appendChild(box);
    }
    const t = document.createElement('div');
    t.className = 'toast ' + (kind || '');
    t.textContent = msg;
    box.appendChild(t);
    setTimeout(() => t.classList.add('out'), 2800);
    setTimeout(() => t.remove(), 3300);
  }

  function confetti() {
    const c = document.createElement('canvas');
    c.className = 'confetti';
    document.body.appendChild(c);
    const ctx = c.getContext('2d');
    const W = (c.width = innerWidth), H = (c.height = innerHeight);
    const colors = QB.SHAPES.map((s) => s.color).concat(['#ffffff', '#ffd23f']);
    const bits = Array.from({ length: 180 }, () => ({
      x: Math.random() * W, y: -20 - Math.random() * H, w: 6 + Math.random() * 8, h: 8 + Math.random() * 10,
      vy: 2 + Math.random() * 4, vx: -2 + Math.random() * 4, r: Math.random() * 6, vr: -0.2 + Math.random() * 0.4,
      c: colors[(Math.random() * colors.length) | 0],
    }));
    const start = performance.now();
    (function frame(t) {
      ctx.clearRect(0, 0, W, H);
      for (const b of bits) {
        b.x += b.vx; b.y += b.vy; b.r += b.vr;
        ctx.save(); ctx.translate(b.x, b.y); ctx.rotate(b.r); ctx.fillStyle = b.c;
        ctx.fillRect(-b.w / 2, -b.h / 2, b.w, b.h); ctx.restore();
      }
      if (t - start < 6000) requestAnimationFrame(frame);
      else c.remove();
    })(start);
  }

  // Tiny WebAudio sound effects; no audio files needed.
  let actx = null;
  function beep(freq, ms, type, vol) {
    try {
      actx = actx || new (window.AudioContext || window.webkitAudioContext)();
      const o = actx.createOscillator(), g = actx.createGain();
      o.type = type || 'sine'; o.frequency.value = freq;
      g.gain.value = vol || 0.08;
      g.gain.exponentialRampToValueAtTime(0.0001, actx.currentTime + ms / 1000);
      o.connect(g).connect(actx.destination);
      o.start(); o.stop(actx.currentTime + ms / 1000);
    } catch { /* audio not available */ }
  }
  const sfx = {
    tick: () => beep(880, 80, 'square', 0.03),
    join: () => beep(660, 120, 'triangle', 0.06),
    good: () => { beep(660, 120, 'triangle'); setTimeout(() => beep(990, 200, 'triangle'), 110); },
    bad: () => beep(180, 300, 'sawtooth', 0.05),
    fanfare: () => [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => beep(f, 260, 'triangle', 0.08), i * 150)),
  };

  window.UI = { BASE, esc, media, shape, color, api, setTheme, syncClock, now, countdown, stopCountdown, toast, confetti, sfx };
})();
