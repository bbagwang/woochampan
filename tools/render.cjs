// Render the showreel.
//   node tools/render.cjs --stills 1.2,5.5,9.8 [--out dir]     -> PNG stills for review
//   node tools/render.cjs --frames [--workers 4] [--from 0 --to 36] [--out dir]  -> PNG sequence
//   add --hero (and --fps 30) for the text-free 12 s website hero loop
// Encode afterwards with tools/encode.sh. Uses Playwright's Chromium; WebGL2 runs on SwiftShader.
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const { serve } = require('./serve.cjs');

const ROOT = path.join(__dirname, '..');
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const has = k => process.argv.includes('--' + k);

async function openPage(browser, port) {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  page.on('pageerror', e => console.log('[pageerror]', e.message));
  page.on('console', m => { if (m.type() === 'error') console.log('[console]', m.text()); });
  await page.goto(`http://127.0.0.1:${port}/reel/?render${has('hero') ? '&hero' : ''}`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.reelReady === true, null, { timeout: 120000 });
  return page;
}
async function shot(page, t, file) {
  await page.evaluate(t => window.renderFrame(t), t);
  await page.screenshot({ path: file, clip: { x: 0, y: 0, width: 1920, height: 1080 }, type: 'png' });
}

(async () => {
  const out = path.resolve(arg('out', path.join(ROOT, '.render')));
  fs.mkdirSync(out, { recursive: true });
  const { srv, port } = await serve(ROOT);
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--disable-gpu-watchdog', '--font-render-hinting=none'] });
  if (has('stills')) {
    const page = await openPage(browser, port);
    for (const t of arg('stills').split(',').map(Number)) {
      const f = path.join(out, `still_${t.toFixed(2)}.png`);
      const t0 = Date.now(); await shot(page, t, f); console.log(`${t.toFixed(2)}s -> ${f} (${Date.now() - t0}ms)`);
    }
  } else {
    const fps = +arg('fps', 60), from = +arg('from', 0), to = +arg('to', has('hero') ? 12 : 36), workers = +arg('workers', 4);
    const frames = []; for (let f = Math.round(from * fps); f < Math.round(to * fps); f++) frames.push(f);
    let next = 0, done = 0; const t0 = Date.now();
    await Promise.all(Array.from({ length: workers }, async () => {
      const page = await openPage(browser, port);
      while (next < frames.length) {
        const f = frames[next++];
        const file = path.join(out, `f_${String(f).padStart(5, '0')}.png`);
        if (has('resume') && fs.existsSync(file)) { done++; continue; }
        await shot(page, f / fps, file);
        done++;
        if (done % 60 === 0) { const el = (Date.now() - t0) / 1000; console.log(`${done}/${frames.length} frames  ${el.toFixed(0)}s  eta ${(el / done * (frames.length - done)).toFixed(0)}s`); }
      }
      await page.close();
    }));
    console.log(`done: ${frames.length} frames in ${((Date.now() - t0) / 1000).toFixed(0)}s`);
  }
  await browser.close(); srv.close();
})();
