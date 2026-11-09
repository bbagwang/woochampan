// 우참판 — Showreel '26
// A deterministic motion-graphics engine: renderFrame(t) draws any instant of the
// 36-second piece (1920x1080). Canvas2D for type/graphics, WebGL2 for marbling,
// fire and the final grade. CG plates come from the offline food renderer.
import { makeGL } from '../assets/js/lib/gl.js';
import { MARBLE_FS, FIRE_FS, POST_FS } from '../assets/js/lib/shaders.js';

const W = 1920, H = 1080, FPS = 60, DUR = 36;
const Q = new URLSearchParams(location.search);
const RENDER = Q.has('render');

// ------------------------------------------------------------------ design tokens
const C = {
  ink: '#0b0908', char: '#141011', ember: '#ff6a2a', verm: '#c8281e', vermD: '#8f1a14',
  fat: '#f2e9dd', gold: '#c9a35c', goldL: '#e3c88f', paper: '#efe7d8', linen: '#0e1015',
};
const F = { serif: "'Noto Serif KR'", hahm: "'Hahmlet'", sans: "'Noto Sans KR'", mono: "'JetBrains Mono'", disp: "'Instrument Serif'" };

// ------------------------------------------------------------------ math & easing
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const lerp = (a, b, t) => a + (b - a) * t;
const prog = (t, a, b) => clamp((t - a) / (b - a));
const h1 = n => { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };
const pad = (n, l = 2) => String(n).padStart(l, '0');
const E = {
  inQuad: x => x * x, outQuad: x => 1 - (1 - x) * (1 - x),
  inCubic: x => x * x * x, outCubic: x => 1 - (1 - x) ** 3,
  inOutCubic: x => (x < .5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2),
  outQuart: x => 1 - (1 - x) ** 4, inOutQuart: x => (x < .5 ? 8 * x ** 4 : 1 - (-2 * x + 2) ** 4 / 2),
  inExpo: x => (x <= 0 ? 0 : 2 ** (10 * x - 10)), outExpo: x => (x >= 1 ? 1 : 1 - 2 ** (-10 * x)),
  inOutExpo: x => (x <= 0 ? 0 : x >= 1 ? 1 : x < .5 ? 2 ** (20 * x - 10) / 2 : (2 - 2 ** (-20 * x + 10)) / 2),
  outBack: x => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * (x - 1) ** 3 + c1 * (x - 1) ** 2; },
  inOutSine: x => -(Math.cos(Math.PI * x) - 1) / 2,
  outBounce: x => { const n = 7.5625, d = 2.75; if (x < 1 / d) return n * x * x; if (x < 2 / d) return n * (x -= 1.5 / d) * x + .75; if (x < 2.5 / d) return n * (x -= 2.25 / d) * x + .9375; return n * (x -= 2.625 / d) * x + .984375; },
};

// ------------------------------------------------------------------ timeline
// [time, strength] — drives camera shake, aberration and (in tools/audio.py) the impacts.
const HITS = [[4.0, 1], [5.0, .35], [5.5, .35], [6.0, .45], [8.0, .3], [10.0, .55], [12.0, .9], [16.0, .9],
  [17.5, .35], [18.0, .5], [20.0, .9], [21, .3], [22, .3], [23, .3], [24, .3], [25, .3], [27.0, .3], [28.5, .5], [30.0, .9]];
const FLASHES = [[4.0, 1.0], [12.0, .45], [16.0, .55], [18.0, .25], [20.0, .9], [30.0, .45]];
const SCENES = [
  { name: 'IGNITION', ko: '점화', t0: 0, t1: 4, fn: sIgnition },
  { name: 'THE SEAL', ko: '낙관', t0: 4, t1: 8, fn: sSeal },
  { name: 'NO.9', ko: '근내지방도', t0: 8, t1: 12, fn: sScore },
  { name: 'THE PLATE', ko: '플레이팅', t0: 12, t1: 16, fn: sPlate },
  { name: 'THE GRILL', ko: '굽기', t0: 16, t1: 20, fn: sGrill },
  { name: 'THE TABLE', ko: '한 상', t0: 20, t1: 26, fn: sTable },
  { name: 'THE ROOMS', ko: '서래마을', t0: 26, t1: 29.85, fn: sPlace },
  { name: 'WOOCHAMPAN', ko: '우참판', t0: 29.85, t1: 36.01, fn: sEnd },
];
const S = { light: false, idx: 0 };

// ------------------------------------------------------------------ canvases
const out = document.getElementById('stage');
out.width = W; out.height = H;
const mk = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
const cv = mk(W, H); const ctx = cv.getContext('2d');
const bgC = mk(W, H);
const bg = makeGL(bgC, { preserveDrawingBuffer: true, alpha: true, premultipliedAlpha: true });
const PM = bg.program(MARBLE_FS), PF = bg.program(FIRE_FS);
const post = makeGL(out, { preserveDrawingBuffer: true, alpha: false });
const PP = post.program(POST_FS); const tex = post.texture();
const mask = mk(W, H); const mx = mask.getContext('2d');

function bgClear() { const gl = bg.gl; gl.viewport(0, 0, W, H); gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT); }
function fire(t, o = {}) {
  PF.draw({ uRes: [W, H], uTime: t, uIntensity: o.intensity ?? 1, uHeight: o.height ?? .5, uBed: o.bed ?? 0, uMode: o.mode ?? 0, uAlpha: o.alpha ?? 1 }, { blend: true });
}
function marble(t, o = {}) {
  const u = { uRes: [W, H], uTime: t, uZoom: o.zoom ?? 1, uBurn: o.burn ?? 0, uCook: o.cook ?? 0, uDens: o.dens ?? .9, uMode: o.rects ? 1 : 0, uAlpha: o.alpha ?? 1, uSeed: o.seed ?? 3, uOff: o.off ?? [0, 0] };
  if (o.rects) {
    const r = new Float32Array(36), d = new Float32Array(9);
    o.rects.forEach((q, i) => { r.set(q, i * 4); d[i] = o.dens9[i]; });
    u.uRects = { type: '4fv', v: r }; u.uRD = { type: '1fv', v: d };
  }
  PM.draw(u, { blend: true });
}

// ------------------------------------------------------------------ assets
const IMG = {};
function loadImg(name) {
  return new Promise(res => {
    const im = new Image();
    im.onload = () => res(im);
    im.onerror = () => res(null);
    im.src = `../assets/img/cg/${name}.webp`;
  });
}
const SPR = {};
function glowSprite(col) {
  const c = mk(128, 128), g = c.getContext('2d');
  const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, col); gr.addColorStop(.18, col.replace(/[\d.]+\)$/, '.55)')); gr.addColorStop(.45, col.replace(/[\d.]+\)$/, '.12)')); gr.addColorStop(1, col.replace(/[\d.]+\)$/, '0)'));
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128); return c;
}
function smokeSprite(seed) {
  const c = mk(256, 256), g = c.getContext('2d');
  g.filter = 'blur(14px)';
  for (let i = 0; i < 14; i++) {
    const x = 128 + (h1(seed * 9 + i) - .5) * 110, y = 128 + (h1(seed * 5 + i * 3) - .5) * 110, r = 30 + h1(seed + i * 7) * 50;
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, 'rgba(255,255,255,.35)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
  }
  return c;
}
function paperTex() {
  const c = mk(512, 512), g = c.getContext('2d');
  const id = g.createImageData(512, 512);
  for (let i = 0; i < 512 * 512; i++) { const v = 128 + (h1(i * .37) - .5) * 40; id.data[i * 4] = v; id.data[i * 4 + 1] = v; id.data[i * 4 + 2] = v; id.data[i * 4 + 3] = 22; }
  g.putImageData(id, 0, 0);
  g.strokeStyle = 'rgba(90,70,50,.06)';
  for (let i = 0; i < 260; i++) { const x = h1(i) * 512, y = h1(i * 3.3) * 512, a = h1(i * 7.1) * 6.28, l = 10 + h1(i * 2.2) * 40; g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + Math.cos(a) * l * .5 + 6, y + Math.sin(a) * l * .5, x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke(); }
  return c;
}
function sealSprite() {
  const s = 400, c = mk(s, s), g = c.getContext('2d');
  g.fillStyle = C.verm; roundRect(g, 10, 10, s - 20, s - 20, 18); g.fill();
  g.strokeStyle = C.fat; g.lineWidth = 9; roundRect(g, 34, 34, s - 68, s - 68, 8); g.stroke();
  g.fillStyle = C.fat; g.font = `900 250px ${F.serif}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('牛', s / 2, s / 2 + 8);
  g.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < 900; i++) { const x = h1(i * 1.7) * s, y = h1(i * 2.9) * s, r = h1(i * 4.1) ** 3 * 4 + .4; g.globalAlpha = .35 + h1(i) * .65; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill(); }
  for (let i = 0; i < 120; i++) { const e = i % 4, k = h1(i * 3.7) * s; const x = e === 0 ? k : e === 1 ? k : e === 2 ? 8 + h1(i) * 6 : s - 8 - h1(i) * 6; const y = e === 2 || e === 3 ? k : e === 0 ? 8 + h1(i) * 6 : s - 8 - h1(i) * 6; g.beginPath(); g.arc(x, y, 2 + h1(i * 9) * 5, 0, 7); g.fill(); }
  return c;
}
function roundRect(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }

// line icons (SVG path data, 200x200 box) drawn on with dash offsets
const ICON_D = {
  pot: ['M34 98 L166 98 L156 160 Q154 172 140 172 L60 172 Q46 172 44 160 Z', 'M22 98 L178 98', 'M34 110 L14 110', 'M166 110 L186 110', 'M52 98 Q62 84 72 98 Q82 112 92 98 Q102 84 112 98 Q122 112 132 98 Q142 84 152 98', 'M70 78 Q58 62 72 50 Q84 38 72 24', 'M100 78 Q88 62 102 50 Q114 38 102 22', 'M130 78 Q118 62 132 50 Q144 38 132 24'],
  bowl: ['M26 94 L174 94 Q172 150 128 166 L72 166 Q28 150 26 94 Z', 'M80 166 L84 180 L116 180 L120 166', 'M60 94 Q80 80 100 94 Q120 108 140 94', 'M148 36 Q158 30 164 38 Q168 46 160 52 L112 92', 'M72 70 Q62 56 74 44', 'M100 70 Q90 54 102 40'],
  tray: ['M18 86 L182 86 L172 160 L28 160 Z', 'M34 108 Q34 144 66 144 Q98 144 98 108 Z', 'M42 100 Q54 92 66 100 Q78 108 90 100', 'M112 104 Q132 90 158 104 Q172 120 154 136 Q128 148 114 134 Q100 118 112 104 Z', 'M122 116 Q134 108 148 120', 'M126 130 Q138 124 150 128', 'M36 66 L168 44', 'M38 76 L172 56'],
  ice: ['M46 120 L154 120 L138 178 L62 178 Z', 'M40 120 Q46 76 74 60 Q100 44 126 60 Q154 76 160 120', 'M86 60 Q100 36 114 60', 'M70 96 m-6 0 a6 6 0 1 0 12 0 a6 6 0 1 0 -12 0', 'M100 84 m-6 0 a6 6 0 1 0 12 0 a6 6 0 1 0 -12 0', 'M128 98 m-6 0 a6 6 0 1 0 12 0 a6 6 0 1 0 -12 0', 'M150 40 L120 104'],
};
let ICON = {};
function compileIcons() {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  document.body.appendChild(svg);
  for (const k in ICON_D) ICON[k] = ICON_D[k].map(d => { const p = document.createElementNS('http://www.w3.org/2000/svg', 'path'); p.setAttribute('d', d); svg.appendChild(p); return { p: new Path2D(d), len: p.getTotalLength() }; });
  svg.remove();
}
function icon(name, cx, cy, size, p, color, lw = 4) {
  const parts = ICON[name]; if (!parts) return;
  ctx.save(); ctx.translate(cx - size / 2, cy - size / 2); ctx.scale(size / 200, size / 200);
  ctx.strokeStyle = color; ctx.lineWidth = lw * 200 / size; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  parts.forEach((pt, i) => {
    const a = i / parts.length * .45, pp = E.outCubic(prog(p, a, a + .55));
    if (pp <= 0) return;
    ctx.setLineDash([pt.len * pp, pt.len + 10]); ctx.stroke(pt.p);
  });
  ctx.restore();
}

// map network (deterministic)
let ROADS = [];
function genMap() {
  let seed = 7; const R = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const cx = 960, cy = 560;
  const fam = (ang, sp0, w, a) => {
    const dx = Math.cos(ang), dy = Math.sin(ang), nx = -dy, ny = dx;
    for (let off = -1300; off < 1300; off += sp0 * (.7 + R() * .8)) {
      let run = [];
      for (let s = -1500; s <= 1500; s += 36) {
        const bend = Math.sin(s * .0017 + off * .01) * 26;
        const x = cx + dx * s + nx * (off + bend), y = cy + dy * s + ny * (off + bend);
        if (R() < .045 && run.length > 2) { ROADS.push({ pts: run, w, a }); run = []; if (R() < .5) s += 36 * 3; continue; }
        run.push([x, y]);
      }
      if (run.length > 1) ROADS.push({ pts: run, w, a });
    }
  };
  fam(.42, 120, 1.1, .2); fam(.42 + Math.PI / 2 + .12, 140, 1.1, .2);
  for (let i = 0; i < 6; i++) { // arterials
    const ang = R() * Math.PI, off = (R() - .5) * 700, pts = [];
    for (let s = -1600; s <= 1600; s += 40) { const b = Math.sin(s * .0012 + i) * 70; pts.push([cx + Math.cos(ang) * s - Math.sin(ang) * (off + b), cy + Math.sin(ang) * s + Math.cos(ang) * (off + b)]); }
    ROADS.push({ pts, w: 2.6, a: .5 });
  }
  ROADS.forEach(r => { r.len = polyLen(r.pts); const d = Math.min(...r.pts.map(p => Math.hypot(p[0] - cx, p[1] - cy))); r.delay = .02 + d / 1300 * .75; });
}

// ------------------------------------------------------------------ drawing helpers
function fillBG(col) { ctx.fillStyle = col; ctx.fillRect(-200, -200, W + 400, H + 400); }
function setFont(fam, size, weight = 400, style = '') { ctx.font = `${style} ${weight} ${size}px ${fam}`.trim(); }
function text(str, x, y, o = {}) {
  const { fam = F.sans, size = 24, weight = 400, color = C.fat, align = 'left', base = 'alphabetic', ls = 0, alpha = 1, style = '', stroke = 0 } = o;
  if (alpha <= 0) return;
  ctx.save(); setFont(fam, size, weight, style); ctx.letterSpacing = ls + 'px'; ctx.textAlign = align; ctx.textBaseline = base; ctx.globalAlpha *= alpha;
  const xx = align === 'center' ? x + ls / 2 : align === 'right' ? x + ls : x;
  if (stroke) { ctx.strokeStyle = color; ctx.lineWidth = stroke; ctx.strokeText(str, xx, y); } else { ctx.fillStyle = color; ctx.fillText(str, xx, y); }
  ctx.restore();
}
function measure(str, fam, size, weight = 400, ls = 0) { ctx.save(); setFont(fam, size, weight); ctx.letterSpacing = ls + 'px'; const w = ctx.measureText(str).width - ls; ctx.restore(); return w; }
function layout(str, fam, size, weight, ls = 0) {
  ctx.save(); setFont(fam, size, weight); ctx.letterSpacing = '0px';
  const list = []; let x = 0;
  for (const ch of str) { const w = ctx.measureText(ch).width; list.push({ ch, x, w }); x += w + ls; }
  ctx.restore(); return { list, width: x - ls };
}
// per-character animation. fn(i, n) -> {dx, dy, s, sx, sy, rot, alpha, blur, color, clip}
function chars(str, x, y, o, fn) {
  const { fam, size, weight = 400, ls = 0, align = 'left', color = C.fat, base = 'alphabetic' } = o;
  const L = layout(str, fam, size, weight, ls);
  const x0 = align === 'center' ? x - L.width / 2 : align === 'right' ? x - L.width : x;
  L.list.forEach((c, i) => {
    const s = fn(i, L.list.length, c) || {};
    const al = s.alpha ?? 1; if (al <= 0) return;
    ctx.save();
    if (s.clip) { ctx.beginPath(); ctx.rect(x0 + c.x - size * .3, y - size * 1.05, c.w + size * .6, size * 1.32); ctx.clip(); }
    ctx.translate(x0 + c.x + c.w / 2 + (s.dx || 0), y + (s.dy || 0));
    if (s.rot) ctx.rotate(s.rot);
    ctx.scale(s.sx ?? s.s ?? 1, s.sy ?? s.s ?? 1);
    ctx.globalAlpha *= al; setFont(fam, size, s.weight ?? weight); ctx.letterSpacing = '0px';
    ctx.textAlign = 'center'; ctx.textBaseline = base; ctx.fillStyle = s.color || color;
    if (s.blur > .3) ctx.filter = `blur(${s.blur.toFixed(1)}px)`;
    ctx.fillText(c.ch, 0, 0); ctx.restore();
  });
  return { x0, width: L.width, list: L.list };
}
// masked "rise" reveal for a line of text
function rise(str, x, y, t0, t, o, stagger = .045, dur = .55) {
  return chars(str, x, y, o, i => { const p = E.outExpo(prog(t, t0 + i * stagger, t0 + i * stagger + dur)); return { dy: (1 - p) * o.size * 1.1, clip: true, alpha: p > 0 ? 1 : 0 }; });
}
function typed(str, x, y, p, o) {
  if (p <= 0) return; const n = [...str].length; const k = Math.ceil(p * n);
  let s = [...str].slice(0, k).join(''); if (p < 1) s += '▍';
  text(s, x, y, o);
}
function glow(x, y, r, spr, a) { if (a <= 0) return; ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = clamp(a); ctx.drawImage(spr, x - r, y - r, r * 2, r * 2); ctx.restore(); }
function polyLen(pts) { let L = 0; for (let i = 1; i < pts.length; i++) L += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); return L; }
function polyPartial(pts, p) {
  let target = polyLen(pts) * clamp(p); ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]);
  let head = pts[0];
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i]; const d = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (target >= d) { ctx.lineTo(b[0], b[1]); target -= d; head = b; } else { const f = target / d; head = [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f]; ctx.lineTo(head[0], head[1]); break; }
  }
  return head;
}
function vgrad(y0, y1, stops) { const g = ctx.createLinearGradient(0, y0, 0, y1); stops.forEach(([o, c]) => g.addColorStop(o, c)); ctx.fillStyle = g; ctx.fillRect(-100, Math.min(y0, y1) - 2, W + 200, Math.abs(y1 - y0) + 4); }
function hgrad(x0, x1, stops) { const g = ctx.createLinearGradient(x0, 0, x1, 0); stops.forEach(([o, c]) => g.addColorStop(o, c)); ctx.fillStyle = g; ctx.fillRect(Math.min(x0, x1) - 2, -100, Math.abs(x1 - x0) + 4, H + 200); }
function vignette(a = .6, r0 = .35) { const g = ctx.createRadialGradient(W / 2, H / 2, H * r0, W / 2, H / 2, H * 1.05); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, `rgba(0,0,0,${a})`); ctx.fillStyle = g; ctx.fillRect(-100, -100, W + 200, H + 200); }
function ring(x, y, r, lw, col, a) { if (a <= 0 || r <= 0) return; ctx.save(); ctx.globalAlpha = a; ctx.strokeStyle = col; ctx.lineWidth = lw; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke(); ctx.restore(); }

// analytic particles: rising embers / sparks
function embers(t, o) {
  const { seed = 1, n = 40, x0 = 960, spread = 1800, yb = 1140, rise = 220, life = 3.5, a = 1, size = 3, sway = 40 } = o;
  if (a <= 0) return;
  for (let i = 0; i < n; i++) {
    const L = life * (.6 + .8 * h1(seed * 13 + i));
    const tt = t + h1(seed * 7 + i * 3.1) * L; const cyc = Math.floor(tt / L); const age = tt - cyc * L;
    const r = h1(seed * 31 + i * 17 + cyc * 101);
    const x = x0 + (r - .5) * spread + Math.sin(age * 1.7 + i) * sway + (h1(i * 5 + cyc) - .5) * age * 70;
    const y = yb - age * rise * (.6 + .8 * h1(i * 11 + cyc * 3));
    const al = Math.sin(Math.PI * age / L) * a * (.55 + .45 * Math.sin(t * 19 + i * 3));
    const s = size * (.5 + h1(i * 23 + cyc));
    glow(x, y, s * 7, SPR.ember, al * .55);
    glow(x, y, s * 1.6, SPR.core, al);
  }
}
// radial burst of sparks starting at t0
function burst(t, t0, x, y, o = {}) {
  const k = t - t0; const { n = 50, seed = 1, speed = 1300, life = 1.1, g = 900, spr = SPR.core, size = 4 } = o;
  if (k < 0 || k > life * 1.6) return;
  for (let i = 0; i < n; i++) {
    const a = h1(seed + i * 1.3) * Math.PI * 2, sp = speed * (.25 + .75 * h1(seed * 3 + i));
    const L = life * (.4 + .6 * h1(i * 7 + seed)); if (k > L) continue;
    const drag = (1 - Math.exp(-k * 3)) / 3;
    const px = x + Math.cos(a) * sp * drag, py = y + Math.sin(a) * sp * drag + .5 * g * k * k;
    const al = 1 - k / L;
    glow(px, py, size * (1 + h1(i) * 1.5) * 3, SPR.ember, al * .7); glow(px, py, size, spr, al);
  }
}
function smoke(t, o) {
  const { seed = 1, n = 12, x0 = 960, y0 = 700, spread = 600, rise = 90, life = 4, a = .25, size = 300, t0 = -99 } = o;
  if (a <= 0) return;
  ctx.save(); ctx.globalCompositeOperation = 'screen';
  for (let i = 0; i < n; i++) {
    const L = life * (.7 + .6 * h1(seed + i));
    const tt = t - t0 + h1(seed * 3 + i) * L; if (t < t0) continue;
    const cyc = Math.floor(tt / L), age = tt - cyc * L;
    const x = x0 + (h1(i * 9 + cyc + seed) - .5) * spread + Math.sin(age * .9 + i) * 40;
    const y = y0 - age * rise;
    const s = size * (.5 + age / L);
    ctx.globalAlpha = a * Math.sin(Math.PI * age / L);
    ctx.save(); ctx.translate(x, y); ctx.rotate(age * .3 + i); ctx.drawImage(SPR.smoke[i % 3], -s / 2, -s / 2, s, s); ctx.restore();
  }
  ctx.restore();
}
function hitEnv(t, decay = 8) { let s = 0; for (const [h, a] of HITS) if (t >= h) s += a * Math.exp(-(t - h) * decay); return s; }
function shakeXY(t) {
  let x = 0, y = 0;
  for (const [h, a] of HITS) { const k = t - h; if (k < 0 || k > .7) continue; const e = a * Math.exp(-k * 9) * 20; x += e * Math.sin(k * 90 + h * 7); y += e * Math.cos(k * 67 + h * 3); }
  return [x, y];
}

// stacked colour-band wipe: bands grow from the left and fully cover the frame at t0
function bandsWipe(t, t0, cols) {
  const sk = 300;
  cols.forEach((c, i) => {
    const st = t0 - .42 - (cols.length - 1 - i) * .06;
    const p = prog(t, st, st + .42 + (cols.length - 1 - i) * .06 * 0);
    if (p <= 0) return;
    const e = E.inOutQuart(clamp(p));
    const x = lerp(-sk, W + sk, e);
    ctx.fillStyle = c; ctx.beginPath(); ctx.moveTo(-50, -50); ctx.lineTo(x + sk, -50); ctx.lineTo(x, H + 50); ctx.lineTo(-50, H + 50); ctx.closePath(); ctx.fill();
  });
}

// ================================================================== SCENES
// 1 — IGNITION ---------------------------------------------------------------
function sIgnition(t) {
  fillBG(C.ink);
  const eA = E.outCubic(prog(t, .1, .8)) * (1 - prog(t, 1.25, 1.85));
  if (eA > 0) {
    const ey = 540 - E.inCubic(prog(t, 1.1, 1.85)) * 180;
    glow(960, ey, 90 + 12 * Math.sin(t * 9), SPR.ember, eA * .9);
    glow(960, ey, 16, SPR.core, eA);
  }
  embers(t, { seed: 3, n: 26, spread: 1500, rise: 160, life: 4.5, a: prog(t, .6, 2) * .7, size: 2.4 });
  typed('1++ NO.9 HANWOO — SEORAE VILLAGE, SEOUL', 960, 372, prog(t, .7, 1.7), { fam: F.mono, size: 17, ls: 7, color: C.gold, align: 'center' });
  const col = E.inExpo(prog(t, 3.3, 3.75));
  ctx.save(); ctx.translate(960, 560); ctx.scale(1 + col * .25, 1 - col); ctx.translate(-960, -560);
  chars('고기에도', 960, 470, { fam: F.hahm, size: 120, weight: 250, ls: 16, align: 'center' }, i => {
    const p = E.outCubic(prog(t, 1.05 + i * .09, 1.75 + i * .09)); return { alpha: p, dy: (1 - p) * 40, blur: (1 - p) * 14 };
  });
  const wgt = Math.round(100 + 800 * E.inOutCubic(prog(t, 2.0, 3.15)));
  const L = chars('품계가 있다', 960, 720, { fam: F.hahm, size: 156, weight: wgt, ls: 8, align: 'center' }, i => {
    const p = E.outExpo(prog(t, 1.7 + i * .07, 2.4 + i * .07)); return { dy: (1 - p) * 170, clip: true, alpha: p > 0 ? 1 : 0, weight: wgt };
  });
  const rp = E.outCubic(prog(t, 2.55, 3.0));
  if (rp > 0 && L.list.length > 1) {
    const cx1 = L.x0 + L.list[0].x + L.list[0].w / 2, cx2 = L.x0 + L.list[1].x + L.list[1].w / 2;
    text('品', cx1, 572 - rp * 8, { fam: F.serif, size: 30, weight: 500, color: C.gold, align: 'center', alpha: rp });
    text('階', cx2, 572 - rp * 8, { fam: F.serif, size: 30, weight: 500, color: C.gold, align: 'center', alpha: rp });
  }
  ctx.restore();
  // the type collapses into a line, the line into a point
  const lp = E.outExpo(prog(t, 3.35, 3.65)), lc = E.inExpo(prog(t, 3.62, 3.97));
  if (lp > 0 && lc < 1) {
    const half = 980 * lp * (1 - lc);
    ctx.fillStyle = C.ember; ctx.fillRect(960 - half, 558, half * 2, 3);
    glow(960, 560, 140 * lp, SPR.ember, .6);
  }
  if (t > 3.6) { const k = prog(t, 3.6, 4); glow(960, 560, 30 + 260 * E.inExpo(k), SPR.ember, k); glow(960, 560, 10 + 40 * k, SPR.core, k); }
}

// 2 — THE SEAL ---------------------------------------------------------------
const SEAL = { x: 548, y: 512, s: 196 };
const WM = { x: 712, y: 512, size: 228, ls: 30 };
function sSeal(t, u) {
  fillBG(C.ink);
  bgClear();
  fire(t, { intensity: .62 + .7 * Math.exp(-u * 3), height: .30 + .42 * Math.exp(-u * 2.2), bed: .1 });
  ctx.drawImage(bgC, -20, -12, W + 40, H + 24);
  vgrad(0, 900, [[0, 'rgba(11,9,8,.97)'], [.7, 'rgba(11,9,8,.78)'], [1, 'rgba(11,9,8,0)']]);
  glow(960, 520, 900, SPR.vermGlow, .5);
  embers(t, { seed: 9, n: 70, rise: 280, life: 3, a: 1, size: 3 });
  burst(t, 4.0, 960, 540, { n: 70, seed: 4, speed: 1700, life: 1.3 });
  for (let k = 0; k < 3; k++) { const p = E.outExpo(prog(u, k * .07, 1.1 + k * .12)); if (p > 0 && p < 1) ring(960, 540, 40 + 1300 * p, (1 - p) * 12, k === 1 ? C.verm : C.fat, (1 - p) * .9); }
  const push = 1 + .045 * E.inOutSine(prog(u, 1.0, 3.7));
  ctx.save(); ctx.translate(960, 540); ctx.scale(push, push); ctx.translate(-960, -540);
  // 牛 slams in, then becomes the seal
  const m = E.inOutExpo(prog(u, .72, 1.02));
  const slam = lerp(1.9, 1, E.outExpo(prog(u, 0, .42)));
  const size = lerp(760 * slam, 140, m);
  const gx = lerp(960, SEAL.x, m), gy = lerp(548, SEAL.y + 4, m);
  if (m < 1) {
    if (m > 0) { const ss = SEAL.s * E.outBack(prog(u, .84, 1.06)); ctx.fillStyle = C.verm; roundRect(ctx, SEAL.x - ss / 2, SEAL.y - ss / 2, ss, ss, 10); ctx.fill(); }
    ctx.save(); ctx.translate(gx, gy); ctx.rotate(lerp(-.08, 0, E.outExpo(prog(u, 0, .5))));
    const gr = ctx.createLinearGradient(0, -size / 2, 0, size / 2); gr.addColorStop(0, C.fat); gr.addColorStop(1, m > .5 ? C.fat : '#ffb27a');
    setFont(F.serif, size, 900); ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = gr; ctx.globalAlpha = prog(u, 0, .06);
    ctx.fillText('牛', 0, 0); ctx.restore();
  } else {
    const k = u - 1.02; const s = 1 + .05 * Math.exp(-k * 10) * Math.cos(k * 40);
    ctx.save(); ctx.translate(SEAL.x, SEAL.y); ctx.scale(s, s); ctx.drawImage(SPR.seal, -SEAL.s / 2, -SEAL.s / 2, SEAL.s, SEAL.s); ctx.restore();
  }
  // 우 · 참 · 판 stamps on the beat
  const Lw = layout('우참판', F.serif, WM.size, 900, WM.ls);
  [...'우참판'].forEach((ch, i) => {
    const ts = 1.0 + i * .5, k = u - ts; if (k < 0) return;
    let s, a;
    if (k < .09) { const q = k / .09; s = lerp(1.75, .96, E.inQuad(q)); a = q; } else { const q = k - .09; s = 1 - .04 * Math.exp(-q * 13) * Math.cos(q * 42); a = 1; }
    const cx = WM.x + Lw.list[i].x + Lw.list[i].w / 2;
    ctx.save(); ctx.translate(cx, WM.y); ctx.scale(s, s);
    text(ch, 0, 0, { fam: F.serif, size: WM.size, weight: 900, color: C.fat, align: 'center', base: 'middle', alpha: a });
    ctx.restore();
    if (k > .09 && k < .7) { const q = (k - .09) / .6; const e = E.outExpo(q); ctx.save(); ctx.globalAlpha = (1 - q) * .7; ctx.strokeStyle = C.verm; ctx.lineWidth = 3 * (1 - q) + .5; const hw = Lw.list[i].w / 2 + 20 + e * 70; ctx.strokeRect(cx - hw, WM.y - 130 - e * 70, hw * 2, 260 + e * 140); ctx.restore(); }
    // ink splatter
    if (k > .09 && k < 1.0) for (let j = 0; j < 16; j++) {
      const q = k - .09, a2 = h1(i * 50 + j) * 6.283, sp = 280 + h1(i * 13 + j * 7) * 520, d = sp * (1 - Math.exp(-q * 9)) / 9 * 2.2;
      ctx.globalAlpha = clamp(1 - q * 1.4) * .9; ctx.fillStyle = j % 3 ? C.verm : C.vermD;
      ctx.beginPath(); ctx.arc(cx + Math.cos(a2) * (110 + d), WM.y + Math.sin(a2) * (100 + d), 2 + h1(j * 3 + i) * 7, 0, 7); ctx.fill(); ctx.globalAlpha = 1;
    }
  });
  // hanja ruby + rule + lower thirds
  const r1 = E.outCubic(prog(u, 2.45, 2.9));
  text('牛 · 參 · 判', 960, 318, { fam: F.serif, size: 28, weight: 500, color: C.gold, align: 'center', ls: lerp(40, 18, r1), alpha: r1 });
  const rl = E.inOutExpo(prog(u, 2.3, 2.9));
  if (rl > 0) { ctx.fillStyle = C.gold; ctx.fillRect(960 - 500 * rl, 686, 1000 * rl, 1.5); }
  const r2 = E.outCubic(prog(u, 2.55, 3.1));
  text('WOOCHAMPAN — 1++ HANWOO HOUSE', 960, 736, { fam: F.mono, size: 19, ls: lerp(26, 9, r2), color: C.fat, align: 'center', alpha: r2 });
  const r3 = E.outCubic(prog(u, 2.75, 3.3));
  text('미쉐린 가이드 서울 2017 · 2018 · 2019 선정', 960, 790, { fam: F.sans, size: 25, weight: 400, ls: 3, color: C.gold, align: 'center', alpha: r3 });
  ctx.restore();
  bandsWipe(t, 8.0, [C.verm, C.gold, C.char, C.paper]);
}

// 3 — NO.9: the marbling score scale ---------------------------------------------
const STRIP = { w: 136, gap: 18, y: 320, h: 520 };
function sScore(t, u) {
  S.light = u < 2.25;
  fillBG(C.paper);
  ctx.save(); ctx.globalAlpha = .9; ctx.fillStyle = ctx.createPattern(SPR.paper, 'repeat'); ctx.fillRect(0, 0, W, H); ctx.restore();
  const total = 9 * STRIP.w + 8 * STRIP.gap, x0 = (W - total) / 2;
  const ex = E.inOutExpo(prog(u, 2.1, 2.65));       // No.9 strip expands to full frame
  const rects = [], dens = [];
  for (let i = 0; i < 9; i++) {
    const g = E.outExpo(prog(u, .12 + i * .045, .75 + i * .045));
    let x = x0 + i * (STRIP.w + STRIP.gap), y = STRIP.y + STRIP.h * (1 - g), w = STRIP.w, h = STRIP.h * g;
    if (i === 8) { x = lerp(x, -10, ex); y = lerp(y, -10, ex); w = lerp(w, W + 20, ex); h = lerp(h, H + 20, ex); }
    else { const push = ex * 900 * (i < 8 ? -1 : 1); x += push * (1 - i / 8) - ex * 400; }
    rects.push([x, y, w, h]); dens.push(i / 8 * .95);
  }
  bgClear();
  marble(t, { rects, dens9: dens, zoom: lerp(.75, 1, ex), off: [.3 + t * .01, .1], dens: .95, seed: 3 });
  // soft drop shadows under the strips, then the meat itself
  if (ex < 1) { ctx.save(); ctx.globalAlpha = .25 * (1 - ex); ctx.fillStyle = '#3a1a10'; ctx.filter = 'blur(18px)'; rects.forEach(([x, y, w, h]) => { if (h > 2) ctx.fillRect(x + 10, y + 24, w, h); }); ctx.restore(); }
  ctx.drawImage(bgC, 0, 0);
  // title & scale annotations (on paper)
  const ia = 1 - ex;
  if (ia > 0) {
    ctx.save(); ctx.globalAlpha = ia;
    rise('근내지방도', 150, 212, 8.05, t, { fam: F.serif, size: 64, weight: 900, color: '#1a1412' });
    typed('BEEF MARBLING SCORE  —  NO.1 → NO.9', 152, 256, prog(u, .25, 1.0), { fam: F.mono, size: 15, ls: 3, color: '#1a1412', alpha: .7 });
    for (let i = 0; i < 9; i++) {
      const [x, y, w] = rects[i]; const a = E.outCubic(prog(u, .4 + i * .045, .8 + i * .045));
      text(String(i + 1), x + w / 2, STRIP.y + STRIP.h + 46, { fam: F.mono, size: 22, color: i === 8 ? C.verm : '#1a1412', align: 'center', alpha: a, weight: i === 8 ? 700 : 400 });
      ctx.fillStyle = `rgba(26,20,18,${.35 * a})`; ctx.fillRect(x, STRIP.y + STRIP.h + 14, w, 1);
    }
    // sweep 1 → 9 on 16th notes
    const sw = u >= 1.0 ? Math.min(8, Math.floor((u - 1.0) / .125)) : -1;
    if (sw >= 0) {
      const [x, y, w, h] = rects[sw];
      ctx.strokeStyle = C.verm; ctx.lineWidth = 4; ctx.strokeRect(x - 9, y - 9, w + 18, h + 18);
      text(['1', '1', '1', '1+', '1+', '1+', '1++', '1++', '1++'][sw], x + w / 2, y - 26, { fam: F.serif, size: sw === 8 ? 54 : 30, weight: 900, color: C.verm, align: 'center' });
    }
    const fin = E.outCubic(prog(u, 2.0, 2.2));
    text('1++ 중에서도 가장 높은 단계', 152, 930, { fam: F.sans, size: 30, weight: 500, color: '#1a1412', alpha: E.outCubic(prog(u, 1.6, 2.0)) });
    text('No.9', 1768, 236, { fam: F.disp, size: 120, color: C.verm, align: 'right', style: 'italic', alpha: fin });
    ctx.restore();
  }
  // full-frame macro beat
  if (ex >= 1) {
    const k = u - 2.65;
    vignette(.55, .25);
    const z = E.outExpo(prog(u, 2.6, 3.0));
    ctx.fillStyle = `rgba(14,6,6,${.42 * z})`; ctx.fillRect(0, 0, W, H);
    ctx.save(); ctx.shadowColor = 'rgba(0,0,0,.5)'; ctx.shadowBlur = 40;
    text('1++', 960, 610, { fam: F.serif, size: 360, weight: 900, color: C.fat, align: 'center', alpha: z * .96 });
    ctx.restore();
    text('No.9', 960, 735, { fam: F.disp, size: 96, color: C.fat, align: 'center', style: 'italic', alpha: E.outCubic(prog(u, 2.8, 3.1)) });
    // loupe
    const lx = 400 + Math.sin(k * 1.4) * 40, ly = 820 - k * 30, R = 140;
    const la = E.outCubic(prog(u, 2.75, 3.0)) * (1 - prog(u, 3.4, 3.55));
    if (la > 0) {
      ctx.save(); ctx.globalAlpha = la; ctx.beginPath(); ctx.arc(lx, ly, R, 0, 7); ctx.clip();
      ctx.drawImage(bgC, lx - R / 2.2, ly - R / 2.2, R / 1.1, R / 1.1, lx - R, ly - R, R * 2, R * 2); ctx.restore();
      ring(lx, ly, R, 2, C.fat, la); ring(lx, ly, R + 14, 1, C.fat, la * .5);
      ctx.save(); ctx.globalAlpha = la; ctx.strokeStyle = C.fat; ctx.lineWidth = 1.2;
      for (let i = 0; i < 48; i++) { const a = i / 48 * 6.283 + k * .6; const r0 = R + 14, r1 = R + (i % 4 ? 20 : 30); ctx.beginPath(); ctx.moveTo(lx + Math.cos(a) * r0, ly + Math.sin(a) * r0); ctx.lineTo(lx + Math.cos(a) * r1, ly + Math.sin(a) * r1); ctx.stroke(); }
      ctx.beginPath(); ctx.moveTo(lx + R + 30, ly); ctx.lineTo(lx + R + 420, ly); ctx.stroke(); ctx.restore();
      text('근내지방 INTRAMUSCULAR FAT', lx + R + 50, ly - 14, { fam: F.mono, size: 15, ls: 2, color: C.fat, alpha: la });
      text('× 2.2  MAG', lx + R + 50, ly + 28, { fam: F.mono, size: 13, ls: 2, color: C.goldL, alpha: la });
    }
  }
  // iris into the plate (ellipse that matches the slate rim of the next shot)
  const ir = prog(u, 3.45, 4.0);
  if (ir > 0) {
    const e = E.inOutExpo(ir);
    const rx = lerp(1250, PLATE.rx, e), ry = lerp(1250, PLATE.ry, e);
    mx.clearRect(0, 0, W, H); mx.fillStyle = C.linen; mx.fillRect(0, 0, W, H);
    mx.globalCompositeOperation = 'destination-out'; mx.beginPath(); mx.ellipse(PLATE.cx, PLATE.cy, rx, ry, 0, 0, 7); mx.fill(); mx.globalCompositeOperation = 'source-over';
    ctx.save(); ctx.globalAlpha = E.inOutSine(prog(ir, .25, .7));
    ctx.beginPath(); ctx.ellipse(PLATE.cx, PLATE.cy, rx, ry, 0, 0, 7); ctx.clip(); drawPlate(t, 0, 0); ctx.restore();
    ctx.drawImage(mask, 0, 0);
  }
}

// 4 — THE PLATE (CG flat-lay of 특안심, star-cut shiitake, king oyster) ----------------
const PLATE = { cx: 1010, cy: 548, scale: .45, rx: 0, ry: 0 };
PLATE.rx = 1200 * PLATE.scale; PLATE.ry = 1200 * Math.cos(.5) * PLATE.scale;
// world (x, y, height) on the baked plate -> screen
function plateXY(x, y, h, sc = PLATE.scale, rot = 0) {
  const sy = y * Math.cos(.5) + h * Math.sin(.5) - .04;
  let px = x * 1200 * sc, py = -sy * 1200 * sc;
  const c = Math.cos(rot), s = Math.sin(rot);
  return [PLATE.cx + px * c - py * s, PLATE.cy + px * s + py * c];
}
function drawPlate(t, zoomK = 0, rot = 0) {
  fillBG(C.linen);
  const im = IMG.plate; if (!im) return;
  const sc = PLATE.scale * (1 + zoomK);
  ctx.save(); ctx.translate(PLATE.cx, PLATE.cy); ctx.rotate(rot); ctx.scale(sc * 2400 / im.width, sc * 2400 / im.height);
  ctx.drawImage(im, -im.width / 2, -im.height / 2); ctx.restore();
  vignette(.75, .42);
}
function callout(ax, ay, lx, ly, t0, t, ko, en, side = 1) {
  const p = E.outExpo(prog(t, t0, t0 + .45)); if (p <= 0) return;
  ctx.save();
  glow(ax, ay, 26, SPR.core, .5 * p);
  ctx.fillStyle = C.fat; ctx.beginPath(); ctx.arc(ax, ay, 4.5, 0, 7); ctx.fill();
  ring(ax, ay, 12 + 10 * (1 - p), 1.2, C.fat, p * .8);
  ctx.strokeStyle = C.fat; ctx.lineWidth = 1.3; ctx.globalAlpha = .9;
  const ex = lx + side * 220;
  polyPartial([[ax, ay], [lx, ly], [ex, ly]], p); ctx.stroke();
  ctx.restore();
  const tp = E.outExpo(prog(t, t0 + .15, t0 + .6));
  const tx = side > 0 ? lx + 6 : ex + 6;
  ctx.save(); ctx.beginPath(); ctx.rect(tx - 10, ly - 60, 400, 58); ctx.clip();
  text(ko, tx, ly - 14 + (1 - tp) * 50, { fam: F.sans, size: 30, weight: 700, color: C.fat });
  ctx.restore();
  text(en, tx, ly + 26, { fam: F.mono, size: 13, ls: 2.5, color: C.goldL, alpha: tp });
}
function sPlate(t, u) {
  const whip = E.inExpo(prog(u, 3.55, 4.0));
  const rot = lerp(-.03, .025, E.inOutSine(prog(u, 0, 4))) + whip * .25;
  const zoomK = .1 * E.inOutSine(prog(u, 0, 3.6)) + whip * 1.6;
  drawPlate(t, zoomK, rot);
  // directional smear during the whip
  if (whip > 0) { ctx.save(); ctx.globalAlpha = whip * .5; for (let i = 1; i <= 4; i++) ctx.drawImage(cv, i * 40 * whip, 0); ctx.restore(); }
  const ca = 1 - prog(u, 2.0, 2.3);
  if (ca > 0 && whip <= 0) {
    ctx.save(); ctx.globalAlpha = ca;
    const P1 = plateXY(.19, .37, .21, PLATE.scale * (1 + zoomK), rot);
    callout(P1[0], P1[1], 1350, 300, 12.45, t, '특안심 1++ No.9', 'PREMIUM TENDERLOIN · 130g', 1);
    const P2 = plateXY(-.47, -.33, .14, PLATE.scale * (1 + zoomK), rot);
    callout(P2[0], P2[1], 560, 820, 12.95, t, '표고버섯', 'SHIITAKE · STAR CUT', -1);
    const P3 = plateXY(.70, .14, .1, PLATE.scale * (1 + zoomK), rot);
    callout(P3[0], P3[1], 1560, 520, 13.45, t, '새송이', 'KING OYSTER MUSHROOM', 1);
    const P4 = plateXY(.5, -.63, .085, PLATE.scale * (1 + zoomK), rot);
    callout(P4[0], P4[1], 1450, 900, 13.95, t, '아스파라거스', 'ASPARAGUS', 1);
    ctx.restore();
  }
  // 자염: salt falls onto the meat
  const sa = prog(u, 2.15, 2.4) * (1 - prog(u, 3.45, 3.6));
  if (sa > 0) {
    hgrad(0, 900, [[0, 'rgba(8,9,12,.92)'], [.55, 'rgba(8,9,12,.55)'], [1, 'rgba(8,9,12,0)']]);
    ctx.save(); ctx.globalAlpha = sa;
    rise('고기 맛의 비밀,', 150, 420, 14.2, t, { fam: F.serif, size: 58, weight: 500, color: C.fat });
    rise('자염', 146, 590, 14.38, t, { fam: F.serif, size: 168, weight: 900, color: C.fat }, .07);
    text('煮鹽', 470, 590, { fam: F.serif, size: 54, weight: 500, color: C.gold, alpha: E.outCubic(prog(u, 2.6, 2.9)) });
    typed('BOILED SEA SALT FROM THE TIDAL FLATS', 152, 660, prog(u, 2.55, 3.1), { fam: F.mono, size: 15, ls: 3, color: C.goldL });
    text('갯벌의 바닷물을 끓여 얻는 전통 소금으로 간을 합니다', 152, 712, { fam: F.sans, size: 24, weight: 400, color: C.fat, alpha: E.outCubic(prog(u, 2.7, 3.1)) * .85 });
    ctx.restore();
    // grains
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 420; i++) {
      const t0 = 14.15 + h1(i * 1.7) * .9, k = t - t0; if (k < 0) continue;
      const tx = lerp(800, 1380, h1(i * 3.1)), ty = lerp(260, 780, h1(i * 5.3));
      const fallT = .55, y = k < fallT ? lerp(-40, ty, E.inQuad(k / fallT)) : ty;
      const x = tx + (k < fallT ? (1 - k / fallT) * (h1(i * 9) - .5) * 80 : 0);
      const al = (k < fallT ? 1 : clamp(1 - (k - fallT) * .9)) * sa;
      const tw = .5 + .5 * Math.sin(t * 30 + i);
      const gs = 2 + h1(i * 13) * 2.5;
      ctx.fillStyle = `rgba(255,252,245,${al * (.6 + .4 * tw)})`; ctx.fillRect(x, y, gs, gs);
      if (k >= fallT && k < fallT + .2) glow(x, y, 10, SPR.core, (1 - (k - fallT) / .2) * .5);
    }
    ctx.restore();
  }
}

// 5 — THE GRILL --------------------------------------------------------------
function drawGrillImg(im, sc, a = 1, cx = 960, cy = 540) {
  if (!im || a <= 0) return;
  ctx.save(); ctx.globalAlpha = a; ctx.translate(cx, cy); ctx.scale(sc * 2400 / im.width, sc * 2400 / im.height); ctx.drawImage(im, -im.width / 2, -im.height / 2); ctx.restore();
}
function sGrill(t, u) {
  fillBG('#100604');
  bgClear();
  const surge = E.inExpo(prog(u, 3.45, 4.0));
  fire(t, { mode: 1, intensity: .95 + .1 * Math.sin(t * 7) + surge * 1.5 });
  ctx.drawImage(bgC, 0, 0);
  if (u < 2.0) {
    const sc = .8 * (1 + .06 * E.inOutSine(prog(u, 0, 2)));
    const sw = E.outCubic(prog(u, 1.42, 1.62));
    drawGrillImg(IMG.grillRaw, sc, 1 - sw);
    drawGrillImg(IMG.grillSeared, sc, sw);
    smoke(t, { seed: 2, n: 10, x0: 960, y0: 640, spread: 900, rise: 120, life: 3, a: .18, size: 520 });
    smoke(t, { seed: 5, n: 8, x0: 960, y0: 620, spread: 700, rise: 180, life: 1.2, a: .55 * Math.sin(Math.PI * prog(u, 1.15, 1.85)), size: 700 });
    for (let b = 0; b < 6; b++) burst(t, 17.48 + b * .03, 620 + b * 130, 470 + (b % 2) * 160, { n: 9, seed: 12 + b * 7, speed: 700, life: .7, g: 1500, size: 2 });
  } else {
    const k = u - 2.0;
    const sc = .86 * (1 + .09 * E.outCubic(prog(k, 0, 2)));
    drawGrillImg(IMG.grillCubes, sc, 1, 1180 - k * 18, 560);
    smoke(t, { seed: 8, n: 12, x0: 960, y0: 760, spread: 1100, rise: 140, life: 2.6, a: .2, size: 560 });
    // juicy glints
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 22; i++) { const x = 560 + h1(i * 4.4) * 820, y = 300 + h1(i * 7.7) * 500; const tw = Math.max(0, Math.sin(t * 5 + i * 2.1)); glow(x, y, 18 * tw, SPR.core, tw * .45); }
    ctx.restore();
    hgrad(0, 1150, [[0, 'rgba(10,5,3,.96)'], [.42, 'rgba(10,5,3,.86)'], [1, 'rgba(10,5,3,0)']]);
    rise('숙련된 직원이', 150, 430, 18.2, t, { fam: F.serif, size: 92, weight: 900, color: C.fat });
    rise('알맞게 구워드립니다', 150, 548, 18.42, t, { fam: F.serif, size: 92, weight: 900, color: C.fat });
    typed('GRILLED TABLESIDE BY OUR STAFF — 직접 구워드리는 한우', 154, 612, prog(k, .55, 1.2), { fam: F.mono, size: 16, ls: 3, color: C.goldL });
  }
  embers(t, { seed: 21, n: 60, rise: 330, life: 2.4, a: .9, size: 2.6 });
  vignette(.5, .4);
  if (surge > 0) { ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = `rgba(255,${Math.round(120 + 120 * surge)},${Math.round(60 + 160 * surge)},${surge})`; ctx.fillRect(0, 0, W, H); ctx.restore(); }
}

// 6 — THE TABLE: menu cards on the beat -------------------------------------------
const CARDS = [
  { ko: '우참판', en: 'SIGNATURE SET', sub: '안심 + 등심 150g · 1++ No.9', price: '55,000', bg: C.ink, fg: C.fat, ac: C.gold, layout: 'hero', img: 'plateD' },
  { ko: '특안심', en: 'PREMIUM TENDERLOIN', sub: '1++ No.9 · 130g', price: '59,000', bg: C.verm, fg: C.fat, ac: '#ffd9b8', layout: 'vertical', img: 'plate' },
  { ko: '런치정식', en: 'LUNCH SET', sub: '안심·등심 110g + 된장말이죽 or 볶음밥', price: '40,000', bg: C.paper, fg: '#1a1412', ac: C.verm, layout: 'grid', icon: 'tray' },
  { ko: '한우국수전골', en: 'HANWOO NOODLE HOT POT', sub: '고기 다음, 꼭 시키는 한 냄비', price: '25,000', bg: C.char, fg: C.fat, ac: C.gold, layout: 'drop', icon: 'pot' },
  { ko: '된장말이죽', en: 'DOENJANG PORRIDGE', sub: '리뷰마다 빠지지 않는 마무리', price: '', bg: C.gold, fg: '#1a1412', ac: C.vermD, layout: 'ring', icon: 'bowl' },
  { ko: '후식 빙수', en: 'SHAVED ICE, ON THE HOUSE', sub: '식사 후 제공되는 시원한 한 그릇', price: '', bg: C.paper, fg: C.verm, ac: '#1a1412', layout: 'center', icon: 'ice' },
];
function circleImg(im, cx, cy, r, sx, sy, sr, rot, a = 1) {
  if (!im || a <= 0) return;
  ctx.save(); ctx.globalAlpha = a; ctx.beginPath(); ctx.arc(cx, cy, r, 0, 7); ctx.clip();
  ctx.translate(cx, cy); ctx.rotate(rot);
  const k = im.width / 2400;
  ctx.drawImage(im, sx * k - sr * k, sy * k - sr * k, sr * 2 * k, sr * 2 * k, -r * 1.02, -r * 1.02, r * 2.04, r * 2.04);
  ctx.restore();
}
function cardMeta(c, i, k) {
  text(`${pad(i + 1)} / 06`, 1768, 196, { fam: F.mono, size: 15, ls: 3, color: c.fg, align: 'right', alpha: .7 * E.outCubic(prog(k, .05, .3)) });
}
function priceTag(c, x, y, k, align = 'left') {
  if (!c.price) return;
  const p = E.outExpo(prog(k, .32, .7));
  text(c.price, x, y + (1 - p) * 30, { fam: F.disp, size: 76, color: c.ac, align, alpha: p });
  text('KRW', align === 'left' ? x + measure(c.price, F.disp, 76) + 14 : x - measure(c.price, F.disp, 76) - 14, y - 6, { fam: F.mono, size: 14, ls: 2, color: c.ac, alpha: p * .8, align: align === 'left' ? 'left' : 'right' });
}
function drawCard(i, k, t) {
  const c = CARDS[i];
  fillBG(c.bg);
  S.light = c.bg === C.paper || c.bg === C.gold;
  const fg = c.fg;
  if (c.layout === 'hero') {
    circleImg(IMG.plateD, 1330, 540, 360, 1200, 1100, 760, t * .12 - 2.6, E.outCubic(prog(k, 0, .25)));
    ring(1330, 540, 360 + 26, 1, C.gold, .6); ring(1330, 540, 360 + 40 + 10 * Math.sin(t * 3), 1, C.gold, .25);
    rise(c.ko, 150, 560, 20.05, t, { fam: F.serif, size: 210, weight: 900, color: fg }, .05);
    typed(c.en, 156, 330, prog(k, .05, .4), { fam: F.mono, size: 16, ls: 5, color: C.gold });
    text(c.sub, 156, 640, { fam: F.sans, size: 32, weight: 400, color: fg, alpha: E.outCubic(prog(k, .25, .5)) });
    priceTag(c, 156, 760, k);
  } else if (c.layout === 'vertical') {
    circleImg(IMG.plate, 640, 540, 380, 1428, 760, 360, -t * .1, 1);
    ring(640, 540, 410, 1.4, C.fat, .5);
    ctx.save(); ctx.strokeStyle = C.fat; ctx.globalAlpha = .7; ctx.setLineDash([3, 9]); ctx.lineDashOffset = -t * 40; ctx.beginPath(); ctx.arc(640, 540, 440, 0, 7); ctx.stroke(); ctx.restore();
    [...c.ko].forEach((ch, j) => {
      const p = E.outExpo(prog(k, .06 + j * .06, .5 + j * .06));
      ctx.save(); ctx.beginPath(); ctx.rect(1260, 180 + j * 230, 300, 240); ctx.clip();
      text(ch, 1410, 390 + j * 230 - (1 - p) * 240, { fam: F.serif, size: 220, weight: 900, color: fg, align: 'center' });
      ctx.restore();
    });
    ctx.save(); ctx.translate(1660, 220); ctx.rotate(Math.PI / 2); text(c.en, 0, 0, { fam: F.mono, size: 16, ls: 6, color: fg, alpha: E.outCubic(prog(k, .2, .5)) }); ctx.restore();
    text(c.sub, 1180, 930, { fam: F.sans, size: 30, weight: 500, color: fg, align: 'right', alpha: E.outCubic(prog(k, .25, .5)) });
    priceTag(c, 1180, 860, k, 'right');
  } else if (c.layout === 'grid') {
    const bw = 760 * E.outExpo(prog(k, 0, .3));
    ctx.fillStyle = C.gold; ctx.fillRect(0, 0, bw, H);
    icon(c.icon, 380, 560, 420, prog(k, .12, .8), '#1a1412', 5);
    [...c.ko].forEach((ch, j) => {
      const p = E.outBack(prog(k, .08 + j * .05, .38 + j * .05));
      const x = 1060 + (j % 2) * 300, y = 520 + Math.floor(j / 2) * 300;
      ctx.save(); ctx.translate(x, y - 95); ctx.scale(p, p); text(ch, 0, 95, { fam: F.serif, size: 270, weight: 900, color: fg, align: 'center' }); ctx.restore();
    });
    typed(c.en, 1460 + 130, 290, prog(k, .1, .4), { fam: F.mono, size: 15, ls: 4, color: c.ac, align: 'left' });
    text(c.sub, 912, 930, { fam: F.sans, size: 28, weight: 500, color: fg, alpha: E.outCubic(prog(k, .3, .55)) });
    priceTag(c, 1590, 520, k);
  } else if (c.layout === 'drop') {
    // kkakdugi-like cubes tumbling behind the type
    for (let j = 0; j < 16; j++) {
      const x = 140 + h1(j * 3.3) * 1640, sp = 600 + h1(j * 5.1) * 700, y = -120 + (k + h1(j * 2.2) * .4) * sp, s = 30 + h1(j) * 40;
      ctx.save(); ctx.translate(x, y); ctx.rotate(k * (2 + h1(j * 9) * 4) + j); ctx.globalAlpha = .22; ctx.fillStyle = j % 2 ? C.verm : C.gold; roundRect(ctx, -s / 2, -s / 2, s, s, 6); ctx.fill(); ctx.restore();
    }
    const L = layout(c.ko, F.serif, 236, 900, 0); const x0 = (W - L.width) / 2;
    L.list.forEach((ch, j) => {
      const p = E.outBounce(prog(k, .02 + j * .04, .42 + j * .04));
      text(ch.ch, x0 + ch.x + ch.w / 2, 560 - (1 - p) * 700, { fam: F.serif, size: 236, weight: 900, color: j < 2 ? C.gold : fg, align: 'center' });
    });
    icon(c.icon, 1640, 800, 220, prog(k, .2, .8), C.gold, 4);
    typed(c.en, 960, 300, prog(k, .1, .4), { fam: F.mono, size: 16, ls: 6, color: C.gold, align: 'center' });
    text(c.sub, x0 + 6, 680, { fam: F.sans, size: 30, weight: 400, color: fg, alpha: E.outCubic(prog(k, .35, .6)) });
    priceTag(c, x0 + 6, 800, k);
  } else if (c.layout === 'ring') {
    const str = 'DOENJANG MARI JUK · 된장말이죽 · AFTER THE GRILL · ';
    ctx.save(); ctx.translate(620, 560); ctx.rotate(k * 1.2 - 1);
    setFont(F.mono, 24, 500); ctx.fillStyle = fg; ctx.textAlign = 'center';
    const n = [...str].length; [...str].forEach((ch, j) => { ctx.save(); ctx.rotate(j / n * Math.PI * 2); ctx.fillText(ch, 0, -270); ctx.restore(); });
    ctx.restore();
    icon(c.icon, 620, 570, 330, prog(k, .05, .7), fg, 5);
    rise(c.ko, 1000, 600, 24.05, t, { fam: F.serif, size: 168, weight: 900, color: fg }, .045);
    typed(c.en, 1006, 400, prog(k, .1, .4), { fam: F.mono, size: 16, ls: 5, color: c.ac });
    text(c.sub, 1006, 690, { fam: F.sans, size: 30, weight: 500, color: fg, alpha: E.outCubic(prog(k, .3, .55)) });
  } else {
    icon(c.icon, 960, 330, 300, prog(k, .02, .55), '#1a1412', 5);
    rise(c.ko, 960, 760, 25.06, t, { fam: F.serif, size: 230, weight: 900, color: fg, align: 'center' }, .05);
    text(c.sub, 960, 850, { fam: F.sans, size: 30, weight: 500, color: '#1a1412', align: 'center', alpha: E.outCubic(prog(k, .25, .45)) });
    typed(c.en, 960, 900, prog(k, .2, .5), { fam: F.mono, size: 15, ls: 5, color: '#1a1412', align: 'center' });
  }
  cardMeta(c, i, k);
}
function sTable(t, u) {
  const i = Math.min(5, Math.floor(u)), k = u - i;
  if (i > 0 && k < .2) drawCard(i - 1, 1, t);
  const w = E.inOutExpo(prog(k, 0, .2));
  ctx.save();
  if (i > 0 && w < 1) {
    ctx.beginPath();
    if (i === 1) ctx.arc(640, 540, 1300 * w, 0, 7);
    else if (i === 2) { for (let j = 0; j < 10; j++) { const sw = 192 * clamp(w * 1.6 - j * .06); ctx.rect(j * 192 + (192 - sw) / 2, 0, sw, H); } }
    else if (i === 3) { const x = lerp(W + 700, -700, w); ctx.moveTo(x, -10); ctx.lineTo(W + 800, -10); ctx.lineTo(W + 800, H + 10); ctx.lineTo(x - 500, H + 10); }
    else if (i === 4) ctx.rect(W * (1 - w), 0, W, H);
    else { const hh = H / 2 * w; ctx.rect(0, 0, W, hh); ctx.rect(0, H - hh, W, hh); }
    ctx.clip();
  }
  drawCard(i, k, t);
  ctx.restore();
  // last card closes into a point — the pin of the next shot
  if (i === 5) {
    const ir = E.inOutExpo(prog(k, .62, .98));
    if (ir > 0) { mx.clearRect(0, 0, W, H); mx.fillStyle = C.ink; mx.fillRect(0, 0, W, H); mx.globalCompositeOperation = 'destination-out'; mx.beginPath(); mx.arc(960, 560, lerp(1200, 0, ir), 0, 7); mx.fill(); mx.globalCompositeOperation = 'source-over'; ctx.drawImage(mask, 0, 0); }
  }
}

// 7 — THE ROOMS: Seorae village map, pin, private-room doors ----------------------------
function sPlace(t, u) {
  fillBG('#0b0a0b');
  glow(960, 560, 700, SPR.warm, .35);
  ctx.save();
  ctx.translate(960, 560); ctx.rotate(-.06 + u * .02); const z = 1 + .12 * E.inOutSine(prog(u, 0, 3.8)); ctx.scale(z, z); ctx.translate(-960, -560);
  for (const r of ROADS) {
    const p = E.outCubic(prog(u, r.delay, r.delay + .9)); if (p <= 0) continue;
    ctx.strokeStyle = `rgba(242,233,221,${r.a})`; ctx.lineWidth = r.w; polyPartial(r.pts, p); ctx.stroke();
  }
  // route to the door
  const route = [[-80, 980], [300, 860], [560, 760], [760, 690], [960, 560]];
  const rp = E.inOutCubic(prog(u, .35, 1.0));
  if (rp > 0) { ctx.strokeStyle = C.verm; ctx.lineWidth = 5; ctx.lineCap = 'round'; const hd = polyPartial(route, rp); ctx.stroke(); glow(hd[0], hd[1], 40, SPR.ember, .8); }
  ctx.restore();
  // pin drop
  const pk = u - .7;
  if (pk > 0) {
    const fall = E.inQuad(prog(pk, 0, .3)); const land = pk - .3;
    const y = 560 - (1 - fall) * 600; const sq = land > 0 ? 1 - .22 * Math.exp(-land * 12) * Math.cos(land * 30) : 1;
    for (let j = 0; j < 3; j++) { const rk = (land - j * .5) % 1.5; if (land > 0 && rk > 0) ring(960, 560, rk * 160, 2, C.verm, (1 - rk / 1.5) * .8); }
    ctx.save(); ctx.translate(960, y); ctx.scale(1 / sq, sq);
    ctx.fillStyle = C.verm; ctx.beginPath(); ctx.moveTo(0, 0); ctx.bezierCurveTo(-14, -26, -38, -40, -38, -70); ctx.arc(0, -70, 38, Math.PI, 0); ctx.bezierCurveTo(38, -40, 14, -26, 0, 0); ctx.fill();
    ctx.fillStyle = C.fat; ctx.beginPath(); ctx.arc(0, -70, 14, 0, 7); ctx.fill(); ctx.restore();
  }
  const lp = E.outExpo(prog(u, 1.1, 1.6));
  if (lp > 0) {
    ctx.strokeStyle = C.fat; ctx.lineWidth = 1.3; polyPartial([[990, 500], [1180, 370], [1700, 370]], lp); ctx.stroke();
    rise('우참판 서래본점', 1190, 348, 27.15, t, { fam: F.serif, size: 54, weight: 900, color: C.fat }, .035);
    text('서울 서초구 서래로 23 이오빌딩 3층', 1192, 414, { fam: F.sans, size: 27, weight: 400, color: C.fat, alpha: E.outCubic(prog(u, 1.3, 1.6)) });
    typed('신반포역 727m  ·  고속터미널역 929m', 1192, 452, prog(u, 1.4, 1.8), { fam: F.mono, size: 15, ls: 2, color: C.goldL });
  }
  text('Seorae Village,', 150, 860, { fam: F.disp, size: 110, color: C.fat, style: 'italic', alpha: E.outCubic(prog(u, .5, 1.0)) });
  text('서초 · Seocho-gu, Seoul', 156, 920, { fam: F.sans, size: 26, weight: 400, color: C.fat, alpha: E.outCubic(prog(u, .7, 1.1)) * .8 });
}
// hanok lattice doors — drawn above scenes 7 & 8
function doorPanel(x0, w, textDx) {
  const top = -20, h = H + 40;
  ctx.fillStyle = '#1f130b'; ctx.fillRect(x0, top, w, h);
  const px = x0 + 34, py = 34, pw = w - 68, ph = H - 68;
  const g = ctx.createRadialGradient(960, 520, 60, 960, 520, 1150);
  g.addColorStop(0, '#ffe6b8'); g.addColorStop(.45, '#f2bb72'); g.addColorStop(1, '#9b5a26');
  ctx.fillStyle = g; ctx.fillRect(px, py, pw, ph);
  ctx.save(); ctx.globalAlpha = .5; ctx.fillStyle = ctx.createPattern(SPR.paper, 'repeat'); ctx.fillRect(px, py, pw, ph); ctx.restore();
  // writing seen through the paper
  ctx.save(); ctx.beginPath(); ctx.rect(px, py, pw, ph); ctx.clip(); ctx.filter = 'blur(1.4px)';
  text('프라이빗 룸', 960 + textDx, 470, { fam: F.serif, size: 132, weight: 900, color: 'rgba(70,32,10,.78)', align: 'center', ls: 10 });
  text('와인 · 블루 · 옐로우 · 밸리 · 클라우드 · 그린 · 골드', 960 + textDx, 590, { fam: F.sans, size: 30, weight: 500, color: 'rgba(70,32,10,.7)', align: 'center', ls: 2 });
  text('화이트 · 포레스트 · 파인 · 레드 · 스카이 · 가든', 960 + textDx, 640, { fam: F.sans, size: 30, weight: 500, color: 'rgba(70,32,10,.7)', align: 'center', ls: 2 });
  text('4인부터 16인까지 · 13개의 룸 · 룸 차지 없음', 960 + textDx, 730, { fam: F.mono, size: 20, color: 'rgba(70,32,10,.65)', align: 'center', ls: 3 });
  ctx.restore();
  // 띠살 lattice
  ctx.fillStyle = '#2a1a0f';
  const step = 46; const n = Math.floor(pw / step);
  const off = (pw - n * step) / 2;
  for (let j = 0; j <= n; j++) ctx.fillRect(px + off + j * step - 3, py, 6, ph);
  const bands = [py + 46, py + 82, py + 118, py + ph / 2 - 36, py + ph / 2, py + ph / 2 + 36, py + ph - 118, py + ph - 82, py + ph - 46];
  bands.forEach(y => ctx.fillRect(px, y - 3, pw, 6));
  ctx.strokeStyle = '#3b2415'; ctx.lineWidth = 12; ctx.strokeRect(px - 6, py - 6, pw + 12, ph + 12);
}
function doors(t) {
  if (t < 27.85 || t > 30.4) return;
  const close = E.inCubic(prog(t, 27.9, 28.5));
  const land = t - 28.5; const bounce = land > 0 ? 10 * Math.exp(-land * 10) * Math.abs(Math.sin(land * 22)) : 0;
  const open = E.inOutCubic(prog(t, 29.62, 30.35));
  const half = W / 2;
  const gap = (1 - close) * (half + 40) + bounce + open * (half + 60);
  if (open > 0) { glow(960, 540, 300 + gap * 1.2, SPR.warm, (1 - open) + .3); }
  ctx.save(); ctx.beginPath(); ctx.rect(-50, -50, half - gap + 50, H + 100); ctx.clip(); ctx.translate(-gap, 0); doorPanel(0, half, 0); ctx.restore();
  ctx.save(); ctx.beginPath(); ctx.rect(half + gap, -50, half + 50, H + 100); ctx.clip(); ctx.translate(gap, 0); doorPanel(half, half, 0); ctx.restore();
  if (gap < 30) { ctx.fillStyle = '#120b06'; ctx.fillRect(half - 4, 0, 8, H); }
}

// 8 — END CARD -----------------------------------------------------------------
function sEnd(t, u) {
  fillBG(C.ink);
  bgClear(); fire(t, { intensity: .5, height: .24, bed: .1 }); ctx.drawImage(bgC, 0, 0);
  vgrad(0, H, [[0, 'rgba(11,9,8,1)'], [.62, 'rgba(11,9,8,.82)'], [1, 'rgba(11,9,8,.1)']]);
  glow(960, 470, 760, SPR.warm, .22);
  embers(t, { seed: 33, n: 40, rise: 140, life: 5, a: .8, size: 2.2 });
  const push = 1 + .03 * prog(t, 30, 36);
  ctx.save(); ctx.translate(960, 540); ctx.scale(push, push); ctx.translate(-960, -540);
  const k = t - 30.0;
  if (k > 0) {
    let s = k < .09 ? lerp(1.8, .95, E.inQuad(k / .09)) : 1 - .05 * Math.exp(-(k - .09) * 12) * Math.cos((k - .09) * 40);
    ctx.save(); ctx.translate(960, 300); ctx.scale(s, s); ctx.globalAlpha = clamp(k / .09); ctx.drawImage(SPR.seal, -78, -78, 156, 156); ctx.restore();
  }
  rise('우참판', 960, 560, 30.18, t, { fam: F.serif, size: 196, weight: 900, color: C.fat, align: 'center', ls: 34 }, .07, .7);
  const rl = E.inOutExpo(prog(t, 30.5, 31.1)); if (rl > 0) { ctx.fillStyle = C.gold; ctx.fillRect(960 - 300 * rl, 628, 600 * rl, 1.5); }
  const a1 = E.outCubic(prog(t, 30.7, 31.2));
  text('WOOCHAMPAN', 960, 682, { fam: F.mono, size: 20, ls: lerp(30, 16, a1), color: C.fat, align: 'center', alpha: a1 });
  chars('고기에도 품계가 있다', 960, 770, { fam: F.hahm, size: 44, weight: 300, ls: 8, align: 'center', color: C.fat }, i => { const p = E.outCubic(prog(t, 31.2 + i * .04, 31.8 + i * .04)); return { alpha: p, dy: (1 - p) * 16, blur: (1 - p) * 8 }; });
  const a2 = E.outCubic(prog(t, 32.0, 32.6));
  text('MICHELIN GUIDE SEOUL  2017 · 2018 · 2019', 960, 870, { fam: F.mono, size: 16, ls: 5, color: C.gold, align: 'center', alpha: a2 });
  const a3 = E.outCubic(prog(t, 32.4, 33.0));
  text('서울 서초구 서래로 23 이오빌딩 3층   ·   010-7200-5940   ·   woochampan.com', 960, 914, { fam: F.sans, size: 21, weight: 400, ls: 1, color: C.fat, align: 'center', alpha: a3 * .85 });
  ctx.restore();
  // fade to black, last ember
  const fo = prog(t, 34.5, 35.4);
  if (fo > 0) { ctx.fillStyle = `rgba(0,0,0,${E.inOutSine(fo)})`; ctx.fillRect(0, 0, W, H); }
  if (t > 34.9) { const e = Math.sin(Math.PI * prog(t, 34.9, 35.9)); glow(960, 560, 60, SPR.ember, e * .8); glow(960, 560, 10, SPR.core, e); }
}

// ------------------------------------------------------------------ HUD
function hud(t) {
  const a = E.outCubic(prog(t, .25, 1.0)) * (1 - prog(t, 29.5, 29.9));
  if (a <= .001) return;
  const ink = S.light ? '24,19,16' : '242,233,221';
  const m = 54;
  ctx.save(); ctx.globalAlpha = a;
  ctx.strokeStyle = `rgba(${ink},.9)`; ctx.lineWidth = 1.5;
  const bl = 22 * E.outExpo(prog(t, .3, 1.1));
  [[m, m, 1, 1], [W - m, m, -1, 1], [m, H - m, 1, -1], [W - m, H - m, -1, -1]].forEach(([x, y, sx, sy]) => { ctx.beginPath(); ctx.moveTo(x, y + sy * bl); ctx.lineTo(x, y); ctx.lineTo(x + sx * bl, y); ctx.stroke(); });
  const col = `rgb(${ink})`;
  typed('WOOCHAMPAN', m + 20, m + 30, prog(t, .35, .9), { fam: F.mono, size: 14, ls: 3, color: col, weight: 700 });
  typed('SHOWREEL ’26 — 우참판 서래본점', m + 20, m + 50, prog(t, .5, 1.3), { fam: F.mono, size: 13, ls: 2, color: col, alpha: .55 });
  const fr = Math.round(t * FPS); const ss = Math.floor(fr / FPS), ff = fr % FPS;
  const tc = `TC 00:00:${pad(ss)}:${pad(ff)}`;
  text(tc, W - m - 20, m + 30, { fam: F.mono, size: 14, ls: 2, color: col, align: 'right' });
  if (Math.floor(t * 2) % 2 === 0) { ctx.fillStyle = C.verm; ctx.beginPath(); ctx.arc(W - m - 20 - measure(tc, F.mono, 14, 400, 2) - 16, m + 25, 5, 0, 7); ctx.fill(); }
  text('60 FPS · 1920×1080 · REC.709', W - m - 20, m + 50, { fam: F.mono, size: 13, ls: 2, color: col, align: 'right', alpha: .55 });
  const sc = SCENES[S.idx]; const fl = E.outExpo(prog(t, sc.t0, sc.t0 + .4));
  ctx.save(); ctx.beginPath(); ctx.rect(m + 10, H - m - 70, 600, 56); ctx.clip();
  text(`${pad(S.idx + 1)} / ${pad(SCENES.length)} — ${sc.name}`, m + 20, H - m - 44 + (1 - fl) * 30, { fam: F.mono, size: 14, ls: 2, color: col, weight: 700 });
  text(sc.ko, m + 20, H - m - 22 + (1 - fl) * 30, { fam: F.sans, size: 14, weight: 500, color: col, alpha: .6 });
  ctx.restore();
  text('37.4971° N   126.9981° E', W - m - 20, H - m - 44, { fam: F.mono, size: 14, ls: 2, color: col, align: 'right' });
  text('SEORAE-RO 23 · SEOCHO-GU · SEOUL', W - m - 20, H - m - 22, { fam: F.mono, size: 13, ls: 2, color: col, align: 'right', alpha: .55 });
  ctx.fillStyle = `rgba(${ink},.2)`; ctx.fillRect(m, H - m, W - 2 * m, 1);
  ctx.fillStyle = `rgba(${ink},.95)`; ctx.fillRect(m, H - m - .5, (W - 2 * m) * clamp(t / DUR), 2);
  for (const s2 of SCENES) ctx.fillRect(m + (W - 2 * m) * s2.t0 / DUR, H - m - 5, 1, 10);
  ctx.restore();
}

// ------------------------------------------------------------------ frame
function postParams(t) {
  const sc = SCENES[S.idx].name;
  const bloom = { 'IGNITION': .7, 'THE SEAL': .9, 'NO.9': S.light ? .12 : .35, 'THE PLATE': .3, 'THE GRILL': .45, 'THE TABLE': S.light ? .1 : .35, 'THE ROOMS': .6, 'WOOCHAMPAN': .8 }[sc] ?? .4;
  let flash = 0; for (const [h, a] of FLASHES) if (t >= h) flash += a * Math.exp(-(t - h) * 9);
  return {
    uAberr: .0012 + .011 * hitEnv(t, 7), uBloom: bloom, uGrain: S.light ? .035 : .05, uVig: S.light ? .22 : .42,
    uFlash: flash, uFlashCol: [1, .86, .7], uFade: 1 - prog(t, 35.8, 36),
  };
}
function renderFrame(t) {
  t = clamp(t, 0, DUR);
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; ctx.filter = 'none';
  S.light = false;
  let i = SCENES.findIndex(s => t >= s.t0 && t < s.t1); if (i < 0) i = SCENES.length - 1; S.idx = i;
  const sc = SCENES[i];
  const [sx, sy] = shakeXY(t);
  ctx.save(); ctx.translate(sx, sy); sc.fn(t, t - sc.t0); ctx.restore();
  doors(t);
  hud(t);
  tex.upload(cv);
  PP.draw({ uRes: [W, H], uTime: t, ...postParams(t) });
}

// ------------------------------------------------------------------ hero loop (text-free, 12 s, seamless)
// Background film for the website hero: the food framed to the right of the headline.
const HERO_DUR = 12;
function renderHero(t) {
  t = ((t % HERO_DUR) + HERO_DUR) % HERO_DUR;
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; ctx.filter = 'none';
  const plateA = 1 - prog(t, 3.6, 4.4) + prog(t, 11.2, 12);           // plate at both ends of the loop
  // grill layer
  if (plateA < 1) {
    fillBG('#100604');
    bgClear(); fire(t + 40, { mode: 1, intensity: 1 + .08 * Math.sin(t * 6) }); ctx.drawImage(bgC, 0, 0);
    if (t < 8.2) {
      const k = prog(t, 3.6, 8.2);
      const sc = .82 * (1 + .07 * k);
      const sw = E.inOutSine(prog(t, 5.7, 6.4));
      drawGrillImg(IMG.grillRaw, sc, 1 - sw, 1230, 540);
      drawGrillImg(IMG.grillSeared, sc, sw, 1230, 540);
      smoke(t, { seed: 5, n: 8, x0: 1230, y0: 620, spread: 700, rise: 170, life: 1.3, a: .5 * Math.sin(Math.PI * prog(t, 5.4, 6.8)), size: 700 });
    }
    if (t > 7.6) {
      const k = prog(t, 7.6, 12);
      ctx.save(); ctx.globalAlpha = E.inOutSine(prog(t, 7.6, 8.4));
      drawGrillImg(IMG.grillCubes, .9 * (1 + .1 * k), 1, 1290 - k * 30, 560);
      ctx.restore();
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 22; i++) { const x = 900 + h1(i * 4.4) * 820, y = 280 + h1(i * 7.7) * 520; const tw = Math.max(0, Math.sin(t * 5 + i * 2.1)); glow(x, y, 18 * tw, SPR.core, tw * .4 * prog(t, 8, 8.6)); }
      ctx.restore();
    }
    smoke(t, { seed: 2, n: 10, x0: 1200, y0: 700, spread: 1100, rise: 120, life: 3, a: .16, size: 560 });
    embers(t, { seed: 21, n: 50, x0: 1200, spread: 1500, rise: 300, life: 2.6, a: .8, size: 2.4 });
  }
  // plate layer
  if (plateA > 0) {
    ctx.save(); ctx.globalAlpha = clamp(plateA);
    const tp = t > 6 ? t - 12 : t;                                        // continuous motion across the loop seam
    const save = PLATE.cx; PLATE.cx = 1240;
    drawPlate(t, .06 + .02 * tp, -.02 + .012 * tp);
    PLATE.cx = save;
    // salt sparkle settling on the meat
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 160; i++) {
      const k = ((tp + 2 + h1(i * 1.7) * 3) % 3) / 3; const x = 1000 + h1(i * 3.1) * 520, y = lerp(150, 300 + h1(i * 5.3) * 500, E.outQuad(k));
      ctx.fillStyle = `rgba(255,252,245,${(1 - k) * .55})`; const g2 = 1.5 + h1(i * 13) * 2; ctx.fillRect(x, y, g2, g2);
    }
    ctx.restore();
  }
  vignette(.45, .45);
  tex.upload(cv);
  PP.draw({ uRes: [W, H], uTime: t, uAberr: .0012, uBloom: .45, uGrain: .04, uVig: .35, uFlash: 0, uFlashCol: [1, 1, 1], uFade: 1 });
}

// ------------------------------------------------------------------ boot
const FONT_TEXT = '0123456789 .,:;·—–→×+/()’\'"%-_ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz▍' +
  '고기에도품계가있다우참판서래본점마을한상점화낙관근내지방도플레이팅굽기의비밀자염갯벌바닷물을끓여얻는전통소금으로간합니숙련된직원이알맞게구워드립중에서가장높은단계특안심표고버섯새송아스파라거런치정식등심또는볶음밥된장말죽국수전골뒤꼭시키냄비리뷰마다빠지않마무리후식빙수사제공되시원그릇와블루옐로우밸클라드린골화이트포레파레스카든인부터까개룸차없미쉐린선정울초구이오빌딩층역반터미널프라빗이수꼭' +
  '牛參判品階煮鹽';
async function boot() {
  const specs = [
    `900 40px ${F.serif}`, `500 40px ${F.serif}`, `700 40px ${F.sans}`, `500 40px ${F.sans}`, `400 40px ${F.sans}`,
    `400 40px ${F.hahm}`, `900 40px ${F.hahm}`, `100 40px ${F.hahm}`, `400 40px ${F.mono}`, `700 40px ${F.mono}`, `500 40px ${F.mono}`,
    `400 40px ${F.disp}`, `italic 400 40px ${F.disp}`,
  ];
  await Promise.all(specs.map(s => document.fonts.load(s, FONT_TEXT).catch(() => null)));
  await document.fonts.ready;
  SPR.ember = glowSprite('rgba(255,110,40,1)'); SPR.core = glowSprite('rgba(255,236,200,1)');
  SPR.vermGlow = glowSprite('rgba(170,30,20,1)'); SPR.warm = glowSprite('rgba(255,180,100,1)');
  SPR.smoke = [smokeSprite(1), smokeSprite(2), smokeSprite(3)];
  SPR.paper = paperTex(); SPR.seal = sealSprite();
  compileIcons(); genMap();
  [IMG.plate, IMG.plateD, IMG.grillRaw, IMG.grillSeared, IMG.grillCubes] = await Promise.all(['plate-ansim', 'plate-deungsim', 'grill-raw', 'grill-seared', 'grill-cubes'].map(loadImg));
  window.renderFrame = Q.has('hero') ? renderHero : renderFrame; window.REEL = { W, H, FPS, DUR, HITS, SCENES: SCENES.map(s => ({ name: s.name, ko: s.ko, t0: s.t0, t1: s.t1 })) };
  window.reelReady = true;
  if (!RENDER) startPreview();
}

function startPreview() {
  const ui = document.getElementById('ui'); ui.hidden = false;
  const scrub = document.getElementById('scrub'), tcEl = document.getElementById('tc'), btn = document.getElementById('play'), snd = document.getElementById('snd');
  const audio = new Audio('../assets/media/showreel.m4a'); audio.preload = 'auto'; let soundOn = false;
  let playing = !Q.has('t'), t = +(Q.get('t') || 0), last = performance.now();
  scrub.max = DUR; scrub.step = 1 / FPS;
  const syncAudio = () => { if (!soundOn) return; if (playing) { audio.currentTime = t; audio.play().catch(() => {}); } else audio.pause(); };
  scrub.oninput = () => { t = +scrub.value; playing = false; btn.textContent = '▶'; syncAudio(); };
  btn.onclick = () => { playing = !playing; btn.textContent = playing ? '❚❚' : '▶'; last = performance.now(); syncAudio(); };
  snd.onclick = () => { soundOn = !soundOn; snd.textContent = soundOn ? '♪ ON' : '♪ OFF'; if (soundOn) syncAudio(); else audio.pause(); };
  btn.textContent = playing ? '❚❚' : '▶';
  const loop = now => {
    if (playing) { t += (now - last) / 1000; if (t > DUR) { t = 0; syncAudio(); } if (soundOn && Math.abs(audio.currentTime - t) > .08) audio.currentTime = t; }
    last = now; renderFrame(t); scrub.value = t; tcEl.textContent = t.toFixed(2) + 's';
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}
boot();
