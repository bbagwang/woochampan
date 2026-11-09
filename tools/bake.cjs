// Bake the CG food stills: node tools/bake.cjs [name ...] [--quick]
// Output: assets/img/cg/<name>.png (RGBA). Needs Playwright's Chromium (WebGL2 via SwiftShader is fine).
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const { serve } = require('./serve.cjs');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'assets/img/cg');

const JOBS = {
  'plate-ansim':   { mode: 0, size: [2400, 2400], extent: 1.0, center: [0, 0.04], tilt: 0.5, ss: 1 },
  'plate-deungsim':{ mode: 1, size: [2400, 2400], extent: 1.0, center: [0, 0.04], tilt: 0.5, ss: 1 },
  'grill-raw':     { mode: 2, cook: 0, size: [2400, 2400], extent: 0.9, center: [0, 0.05], tilt: 0.55, ss: 1 },
  'grill-seared':  { mode: 2, cook: 1, size: [2400, 2400], extent: 0.9, center: [0, 0.05], tilt: 0.55, ss: 1 },
  'grill-cubes':   { mode: 3, cook: 1, size: [2400, 2400], extent: 0.78, center: [0, 0.06], tilt: 0.6, ss: 1 },
  'zoom-ansim':    { mode: 0, size: [800, 800], extent: 0.3, center: [0.19, 0.38], tilt: 0.5, ss: 1 },
  'zoom-cubes':    { mode: 3, cook: 1, size: [800, 800], extent: 0.3, center: [-0.1, 0.25], tilt: 0.6, ss: 1 },
};

(async () => {
  const args = process.argv.slice(2);
  const quick = args.includes('--quick');
  const names = args.filter(a => !a.startsWith('--'));
  const list = names.length ? names : Object.keys(JOBS);
  fs.mkdirSync(OUT, { recursive: true });
  const { srv, port } = await serve(ROOT);
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--disable-gpu-watchdog'] });
  const page = await browser.newPage();
  page.on('console', m => console.log('[page]', m.text()));
  page.on('pageerror', e => console.log('[pageerror]', e.message));
  await page.goto(`http://127.0.0.1:${port}/tools/bake.html`);
  await page.waitForFunction(() => window.bakeReady === true);
  for (const name of list) {
    const job = { ...JOBS[name] };
    if (quick) { job.size = job.size.map(v => Math.round(v / 3)); job.ss = 1; }
    const r = await page.evaluate(o => window.bake(o), job);
    const file = path.join(OUT, `${name}${quick ? '.quick' : ''}.png`);
    fs.writeFileSync(file, Buffer.from(r.url.split(',')[1], 'base64'));
    console.log(`${name}: ${job.size.join('x')} ss${job.ss} in ${(r.ms / 1000).toFixed(1)}s -> ${path.relative(ROOT, file)}`);
  }
  await browser.close();
  srv.close();
})();
