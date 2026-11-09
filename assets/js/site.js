// 우참판 landing — interactions. Shares its shaders with the showreel engine (reel/).
import { makeGL } from './lib/gl.js';
import { MARBLE_FS, FIRE_FS } from './lib/shaders.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const lerp = (a, b, t) => a + (b - a) * t;
const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;
const CHAPTERS = [
  { t: 0, n: 'IGNITION', ko: '점화' }, { t: 4, n: 'THE SEAL', ko: '낙관' }, { t: 8, n: 'NO.9', ko: '근내지방도' },
  { t: 12, n: 'THE PLATE', ko: '플레이팅' }, { t: 16, n: 'THE GRILL', ko: '굽기' }, { t: 20, n: 'THE TABLE', ko: '한 상' },
  { t: 26, n: 'THE ROOMS', ko: '서래마을' }, { t: 29.85, n: 'WOOCHAMPAN', ko: '우참판' },
];
const pad = n => String(n).padStart(2, '0');

// ------------------------------------------------------------ loader
const loaded = () => document.body.classList.add('is-loaded');
Promise.race([document.fonts.ready, new Promise(r => setTimeout(r, 1600))]).then(() => setTimeout(loaded, REDUCED ? 0 : 650));

// ------------------------------------------------------------ split text
$$('[data-split]').forEach(el => {
  let i = 0;
  const walk = node => {
    [...node.childNodes].forEach(n => {
      if (n.nodeType === 3) {
        const frag = document.createDocumentFragment();
        n.textContent.split(/(\s+)/).forEach(part => {
          if (!part) return;
          if (/^\s+$/.test(part)) { frag.append(part); return; }
          const w = document.createElement('span'); w.className = 'w';
          const s = document.createElement('span'); s.textContent = part; s.style.setProperty('--i', i++);
          w.append(s); frag.append(w);
        });
        n.replaceWith(frag);
      } else if (n.nodeType === 1 && n.tagName !== 'BR') walk(n);
    });
  };
  walk(el);
});

// ------------------------------------------------------------ reveal on scroll
const io = new IntersectionObserver(es => es.forEach(e => {
  if (e.isIntersecting) { e.target.classList.add('is-in'); io.unobserve(e.target); }
}), { threshold: .18, rootMargin: '0px 0px -6% 0px' });
$$('[data-reveal], [data-split], [data-stamp], .plate, .visit__map, .mcard').forEach((el, k) => {
  if (el.matches('[data-reveal]')) {
    const sib = el.parentElement ? [...el.parentElement.children].filter(c => c.matches('[data-reveal]')) : [];
    el.style.setProperty('--d', `${Math.max(0, sib.indexOf(el)) * 0.08}s`);
  }
  io.observe(el);
});

// ------------------------------------------------------------ counters
const cio = new IntersectionObserver(es => es.forEach(e => {
  if (!e.isIntersecting) return; cio.unobserve(e.target);
  const el = e.target, to = +el.dataset.count, from = +(el.dataset.countFrom || 0), dec = +(el.dataset.decimals || 0);
  if (REDUCED) return;
  const t0 = performance.now(), dur = 1600;
  const step = now => { const p = clamp((now - t0) / dur), k = 1 - (1 - p) ** 4; el.textContent = (from + (to - from) * k).toFixed(dec); if (p < 1) requestAnimationFrame(step); };
  requestAnimationFrame(step);
}), { threshold: .6 });
$$('[data-count]').forEach(el => cio.observe(el));

// ------------------------------------------------------------ nav
const nav = $('[data-nav]');
let lastY = scrollY;
addEventListener('scroll', () => {
  const y = scrollY;
  nav.classList.toggle('is-solid', y > 40);
  nav.classList.toggle('is-hidden', y > 600 && y > lastY + 4 && !nav.classList.contains('is-menu'));
  if (y < lastY - 4) nav.classList.remove('is-hidden');
  lastY = y;
}, { passive: true });
$('[data-burger]').addEventListener('click', e => {
  const open = nav.classList.toggle('is-menu'); e.currentTarget.setAttribute('aria-expanded', open);
  document.body.style.overflow = open ? 'hidden' : '';
});
$$('.nav__links a').forEach(a => a.addEventListener('click', () => { nav.classList.remove('is-menu'); document.body.style.overflow = ''; }));
const secIO = new IntersectionObserver(es => es.forEach(e => {
  if (!e.isIntersecting) return;
  $$('.nav__links a').forEach(a => a.classList.toggle('is-active', a.getAttribute('href') === '#' + e.target.id));
}), { rootMargin: '-45% 0px -50% 0px' });
['story', 'grade', 'grill', 'menu', 'rooms', 'visit', 'reel'].forEach(id => { const s = document.getElementById(id); if (s) secIO.observe(s); });

// ------------------------------------------------------------ hero: variable weight + HUD synced to the reel
const wLine = $('[data-weight]');
if (wLine) {
  if (REDUCED) wLine.style.setProperty('--w', 900);
  else {
    const t0 = performance.now() + 700;
    const step = now => { const p = clamp((now - t0) / 1800), k = p < .5 ? 4 * p ** 3 : 1 - (-2 * p + 2) ** 3 / 2; wLine.style.setProperty('--w', Math.round(100 + 800 * k)); if (p < 1) requestAnimationFrame(step); };
    wLine.style.setProperty('--w', 100); requestAnimationFrame(step);
  }
}
const hv = $('[data-hero-video]'), tcEl = $('[data-tc]'), chEl = $('[data-chapter]'), bar = $('[data-tc-bar]');
if (hv) {
  if (REDUCED) { hv.removeAttribute('autoplay'); hv.pause(); }
  const tick = () => {
    const t = hv.currentTime || 0, fr = Math.floor(t * 60);
    tcEl.textContent = `TC 00:00:${pad(Math.floor(fr / 60))}:${pad(fr % 60)}`;
    let i = 0; CHAPTERS.forEach((c, k) => { if (t >= c.t) i = k; });
    chEl.textContent = `${pad(i + 1)} / 08 — ${CHAPTERS[i].n}`;
    bar.style.transform = `scaleX(${hv.duration ? t / hv.duration : 0})`;
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

// ------------------------------------------------------------ modal player
const modal = $('[data-modal]'), mv = $('[data-modal-video]');
function openReel(t = 0) {
  if (!modal.open) modal.showModal();
  const go = () => { mv.currentTime = t; mv.muted = false; mv.play().catch(() => {}); };
  if (mv.readyState >= 1) go(); else { mv.preload = 'auto'; mv.load(); mv.addEventListener('loadedmetadata', go, { once: true }); }
}
document.addEventListener('click', e => { const b = e.target.closest('[data-play-reel]'); if (b) openReel(+b.dataset.playReel || 0); });
$('[data-close]').addEventListener('click', () => modal.close());
modal.addEventListener('click', e => { if (e.target === modal || e.target.classList.contains('modal__inner')) modal.close(); });
modal.addEventListener('close', () => mv.pause());

// chapters
const chList = $('[data-chapters]');
CHAPTERS.forEach((c, i) => {
  const li = document.createElement('li');
  li.innerHTML = `<button data-play-reel="${c.t}"><img src="assets/media/ch-${i + 1}.jpg" alt="" width="640" height="360" loading="lazy" decoding="async"><span class="mono">${pad(i + 1)} · 00:${pad(Math.floor(c.t))}</span><b>${c.ko} <small class="mono">${c.n}</small></b></button>`;
  chList.append(li);
});

// ------------------------------------------------------------ open / closed (Asia/Seoul)
function seoulNow() { return new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Seoul' })); }
function openStatus() {
  const d = seoulNow(), day = d.getDay(), m = d.getHours() * 60 + d.getMinutes();
  const wk = day >= 1 && day <= 5;
  const S = wk ? { o: 690, b0: 870, b1: 1020, c: 1320, lo: 1260 } : { o: 690, b0: 900, b1: 1020, c: 1290, lo: 1230 };
  const hm = x => `${pad(Math.floor(x / 60))}:${pad(x % 60)}`;
  if (m < S.o) return { open: false, short: `오픈 ${hm(S.o)}`, long: `오늘 ${hm(S.o)} 오픈` };
  if (m < S.b0) return { open: true, short: `영업 중 · ~${hm(S.b0)}`, long: `지금 영업 중 · 브레이크 ${hm(S.b0)}` };
  if (m < S.b1) return { open: false, short: `브레이크 · ${hm(S.b1)} 오픈`, long: `브레이크 타임 · ${hm(S.b1)} 디너 오픈` };
  if (m < S.c) return { open: true, short: `영업 중 · ~${hm(S.c)}`, long: `지금 영업 중 · 라스트오더 ${hm(S.lo)}` };
  return { open: false, short: '영업 종료 · 11:30 오픈', long: '오늘 영업 종료 · 내일 11:30 오픈 · 연중무휴' };
}
function paintStatus() {
  const s = openStatus();
  $$('[data-open-status]').forEach(el => { el.textContent = s.short; el.classList.toggle('is-open', s.open); });
  $$('[data-open-status-long]').forEach(el => { el.textContent = s.long; el.classList.toggle('is-open', s.open); });
  const day = seoulNow().getDay();
  $$('.hours tr').forEach(tr => tr.classList.toggle('is-today', tr.dataset.days.split(',').includes(String(day))));
}
paintStatus(); setInterval(paintStatus, 60000);

// ------------------------------------------------------------ scroll-progress helper
function progressOf(el) {
  const r = el.getBoundingClientRect(); const total = r.height - innerHeight;
  return clamp(-r.top / Math.max(1, total));
}
const visible = new Set();
const vio = new IntersectionObserver(es => es.forEach(e => e.isIntersecting ? visible.add(e.target) : visible.delete(e.target)), { rootMargin: '100px' });

// ------------------------------------------------------------ 1++ No.9 marbling scale (WebGL)
const scale = $('[data-marble-scale]');
if (scale) {
  const cvs = $('canvas', scale);
  const g = makeGL(cvs, { alpha: true, premultipliedAlpha: true });
  if (!g) { cvs.style.background = 'repeating-linear-gradient(90deg,#9b1b20 0 10%,transparent 10% 11.1%)'; }
  else {
    const prog = g.program(MARBLE_FS);
    let hover = 8, weights = Array(9).fill(1), dpr = Math.min(devicePixelRatio || 1, 1.25), t0 = performance.now(), lastDraw = 0, dirty = true;
    const target = () => weights.map((w, i) => (i === hover ? 2.6 : 1));
    const resize = () => { const r = cvs.getBoundingClientRect(); cvs.width = Math.round(r.width * dpr); cvs.height = Math.round(r.height * dpr); };
    resize(); addEventListener('resize', () => { resize(); dirty = true; });
    const pick = x => { const r = cvs.getBoundingClientRect(); const tot = weights.reduce((a, b) => a + b, 0); let acc = 0; const fx = (x - r.left) / r.width * tot; for (let i = 0; i < 9; i++) { acc += weights[i]; if (fx < acc) return i; } return 8; };
    cvs.addEventListener('pointermove', e => { hover = pick(e.clientX); });
    cvs.addEventListener('pointerdown', e => { hover = pick(e.clientX); });
    cvs.addEventListener('pointerleave', () => { hover = 8; });
    vio.observe(scale);
    new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) dirty = true; })).observe(scale);
    const labels = $$('.grade__labels span', scale);
    const draw = now => {
      requestAnimationFrame(draw);
      if (!visible.has(scale) || now - lastDraw < 30) return;
      const tg = target();
      const moving = weights.some((w, i) => Math.abs(w - tg[i]) > .004);
      if (!moving && !dirty) return;
      lastDraw = now; dirty = false;
      weights = weights.map((w, i) => lerp(w, tg[i], REDUCED ? 1 : .16));
      const W = cvs.width, H = cvs.height, gap = 10 * dpr, tot = weights.reduce((a, b) => a + b, 0), usable = W - gap * 8;
      let x = 0; const rects = [], dens = new Float32Array(9);
      weights.forEach((w, i) => { const ww = usable * w / tot; rects.push([x, 0, ww, H]); x += ww + gap; dens[i] = i / 8 * .95; });
      $('.grade__labels', scale).style.gridTemplateColumns = weights.map(w => `${w}fr`).join(' ');
      const r = new Float32Array(36); rects.forEach((q, i) => r.set(q, i * 4));
      prog.draw({ uRes: [W, H], uTime: (now - t0) / 1000, uZoom: 1, uBurn: 0, uCook: 0, uDens: .9, uMode: 1, uAlpha: 1, uSeed: 3, uOff: [.2, .1], uRects: { type: '4fv', v: r }, uRD: { type: '1fv', v: dens } }, { clear: true });
    };
    requestAnimationFrame(draw);
  }
}

// ------------------------------------------------------------ grill: fire shader + scroll-driven sear sequence
const grill = $('[data-grill]');
if (grill) {
  const fcv = $('[data-fire]', grill), frames = $$('.grill__frames img', grill), steps = $$('.grill__steps li', grill), gbar = $('[data-grill-bar]', grill);
  const g = makeGL(fcv, { alpha: false });
  let fp = null, dpr = Math.min(devicePixelRatio || 1, 1), t0 = performance.now(), last = 0;
  if (g) { fp = g.program(FIRE_FS); const rs = () => { fcv.width = Math.round(innerWidth * dpr * .5); fcv.height = Math.round(innerHeight * dpr * .5); }; rs(); addEventListener('resize', rs); }
  else fcv.style.background = 'radial-gradient(60% 60% at 50% 60%, #ff7a2a, #7a1a06 60%, #120604)';
  vio.observe(grill);
  const loop = now => {
    requestAnimationFrame(loop);
    if (!visible.has(grill)) return;
    const p = progressOf(grill);
    const a = clamp((p - .28) / .12), b = clamp((p - .6) / .12);
    frames[0].style.opacity = 1;
    frames[1].style.opacity = a * (1 - b);
    frames[2].style.opacity = b;
    frames.forEach((f, i) => f.style.setProperty('--s', 1 + .08 * p + (i === 2 ? .06 * (1 - b) : 0)));
    const k = p < .34 ? 0 : p < .66 ? 1 : 2;
    steps.forEach((s, i) => s.classList.toggle('is-on', i === k));
    gbar.style.transform = `scaleY(${p})`;
    if (fp && now - last > 33) { last = now; fp.draw({ uRes: [fcv.width, fcv.height], uTime: (now - t0) / 1000, uIntensity: 1, uHeight: .5, uBed: 0, uMode: 1, uAlpha: 1 }); }
  };
  requestAnimationFrame(loop);
}

// ------------------------------------------------------------ 자염: salt grains drifting down
const salt = $('[data-salt]');
if (salt && !REDUCED) {
  const c = salt.getContext('2d'); let W = 0, H = 0; const dpr = Math.min(devicePixelRatio || 1, 2);
  const rs = () => { W = salt.width = salt.offsetWidth * dpr; H = salt.height = salt.offsetHeight * dpr; };
  rs(); addEventListener('resize', rs);
  const P = Array.from({ length: 420 }, (_, i) => ({ x: Math.random(), y: Math.random(), s: .6 + Math.random() * 2.2, v: .02 + Math.random() * .06, ph: Math.random() * 6.28 }));
  vio.observe(salt.parentElement);
  let prev = performance.now();
  const loop = now => {
    requestAnimationFrame(loop); const dt = Math.min(.05, (now - prev) / 1000); prev = now;
    if (!visible.has(salt.parentElement)) return;
    c.clearRect(0, 0, W, H);
    for (const p of P) {
      p.y += p.v * dt; p.x += Math.sin(now / 1000 + p.ph) * .0004; if (p.y > 1.02) { p.y = -.02; p.x = Math.random(); }
      const tw = .45 + .55 * Math.max(0, Math.sin(now / 180 + p.ph * 7));
      c.fillStyle = `rgba(255,250,240,${.25 + .6 * tw})`;
      const s = p.s * dpr; c.fillRect(p.x * W, p.y * H, s, s);
      if (tw > .97) { c.fillStyle = 'rgba(255,240,220,.18)'; c.beginPath(); c.arc(p.x * W, p.y * H, s * 5, 0, 7); c.fill(); }
    }
  };
  requestAnimationFrame(loop);
}

// ------------------------------------------------------------ rooms: lattice doors slide open with scroll
const rooms = $('[data-rooms]');
if (rooms) {
  const st = $('.rooms__sticky', rooms);
  const upd = () => { const p = progressOf(rooms); const k = clamp((p - .12) / .55); const e = k < .5 ? 4 * k ** 3 : 1 - (-2 * k + 2) ** 3 / 2; st.style.setProperty('--open', REDUCED ? 1 : e); };
  addEventListener('scroll', upd, { passive: true }); upd();
}

// ------------------------------------------------------------ plate: slow turn with scroll
const plate = $('[data-plate]');
if (plate && !REDUCED) {
  const img = $('img', plate);
  addEventListener('scroll', () => {
    const r = plate.getBoundingClientRect(); const p = clamp(1 - (r.top + r.height) / (innerHeight + r.height));
    img.style.setProperty('--rot', `${lerp(-6, 6, p)}deg`); img.style.setProperty('--sc', lerp(1.04, 1, Math.abs(p - .5) * 2) + '');
  }, { passive: true });
}

// ------------------------------------------------------------ map: generated street network (same idea as the reel)
const mapG = $('.map__roads');
if (mapG) {
  let seed = 11; const R = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const cx = 470, cy = 330, out = [];
  const fam = (ang, sp) => {
    const dx = Math.cos(ang), dy = Math.sin(ang), nx = -dy, ny = dx;
    for (let off = -700; off < 700; off += sp * (.7 + R() * .8)) {
      let d = '', n = 0;
      for (let s = -900; s <= 900; s += 30) {
        const b = Math.sin(s * .003 + off * .01) * 14, x = cx + dx * s + nx * (off + b), y = cy + dy * s + ny * (off + b);
        if (R() < .05 && n > 2) { out.push({ d, len: n * 30, major: false, dist: Math.hypot(x - cx, y - cy) }); d = ''; n = 0; continue; }
        d += (n ? 'L' : 'M') + x.toFixed(1) + ' ' + y.toFixed(1); n++;
      }
      if (n > 1) out.push({ d, len: n * 30, major: false, dist: Math.abs(off) });
    }
  };
  fam(.42, 64); fam(.42 + Math.PI / 2 + .12, 74);
  for (let i = 0; i < 5; i++) {
    const a = R() * Math.PI, off = (R() - .5) * 400; let d = '';
    for (let s = -1000; s <= 1000; s += 40) { const b = Math.sin(s * .002 + i) * 40; d += (s === -1000 ? 'M' : 'L') + (cx + Math.cos(a) * s - Math.sin(a) * (off + b)).toFixed(1) + ' ' + (cy + Math.sin(a) * s + Math.cos(a) * (off + b)).toFixed(1); }
    out.push({ d, len: 2100, major: true, dist: Math.abs(off) });
  }
  mapG.innerHTML = out.map(o => `<path class="${o.major ? 'major' : ''}" d="${o.d}" style="--len:${o.len};--d:${(o.dist / 900 * 1.2).toFixed(2)}s"/>`).join('');
}
