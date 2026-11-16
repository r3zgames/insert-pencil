// Phone and tablet sweep (from the Apple and Android guideline review): real Chrome with touch emulation at phone, foldable and
// tablet sizes, safe-area insets emulated where Chrome supports it. Locker, a notebook title page, settings, the
// detention slip, touch play, a simulated WebGL context loss, and a fold/unfold resize.
// Usage: node tools/mobile-sweep.mjs [html] [outDir]
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const html = path.resolve(process.argv[2] || path.join(root, 'dist', fs.readdirSync(path.join(root, 'dist')).find(f => /^No2-Arcade-v[\d.]+\.html$/.test(f))));
const out = path.resolve(process.argv[3] || path.join(root, 'tools/captures', 'mobile-' + new Date().toISOString().replace(/[:.]/g, '-')));
fs.mkdirSync(out, { recursive: true });
const only = process.env.SWEEP_ONLY ? process.env.SWEEP_ONLY.split(',') : null;
const DEVICES = [
  { name: 'iphone-portrait', w: 390, h: 844, dpr: 3, inset: { top: 59, bottom: 34 } },
  { name: 'iphone-landscape', w: 844, h: 390, dpr: 3, inset: { left: 59, right: 59, bottom: 21 } },
  { name: 'foldable-open', w: 841, h: 701, dpr: 2.6 },
  { name: 'tablet-8', w: 1024, h: 640, dpr: 2 },
  { name: 'tablet-10', w: 1280, h: 800, dpr: 2 },
].filter(d => !only || only.includes(d.name));
const report = { html, devices: {} };
const save = () => fs.writeFileSync(path.join(out, 'sweep.json'), JSON.stringify(report, null, 2));

for (const d of DEVICES) {
  const r = report.devices[d.name] = { errors: [], external: [], steps: [] };
  const browser = await chromium.launch({ channel: 'chrome', headless: false, args: ['--ignore-gpu-blocklist'] });
  const context = await browser.newContext({ viewport: { width: d.w, height: d.h }, deviceScaleFactor: d.dpr, isMobile: true, hasTouch: true,
    userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36' });
  await context.route(/^https?:/, x => x.abort());
  const page = await context.newPage();
  page.on('pageerror', e => r.errors.push(String(e)));
  page.on('request', q => { if (!/^(file|data|blob):/.test(q.url())) r.external.push(q.url()); });
  if (d.inset) {
    try { const cdp = await context.newCDPSession(page); await cdp.send('Emulation.setSafeAreaInsetsOverride', { insets: { top: 0, left: 0, bottom: 0, right: 0, ...d.inset } }); r.insets = 'emulated'; }
    catch (e) { r.insets = 'not supported: ' + e.message.slice(0, 120); }
  }
  const wait = (fn, timeout = 90000) => page.waitForFunction(fn, null, { timeout, polling: 100 });
  const shot = async name => { await page.screenshot({ path: path.join(out, `${d.name}-${name}.png`) }); r.steps.push(name); save(); console.log(d.name, name); };
  try {
    await page.goto(pathToFileURL(html).href, { waitUntil: 'load', timeout: 180000 });
    await wait(() => window.No2?.intro?.phase === 'title', 240000);
    await page.evaluate(() => No2.intro.finish('capture-skip'));
    await wait(() => !No2.intro.active && No2.page === 'hub');
    await page.waitForTimeout(1500);
    await shot('01-locker');
    r.small = await page.evaluate(() => [...document.querySelectorAll('body *')].filter(e => e.offsetParent && e.childNodes.length && [...e.childNodes].some(n => n.nodeType === 3 && n.textContent.trim()) && parseFloat(getComputedStyle(e).fontSize) < 14 && !e.closest('.visually-hidden,[aria-hidden=true]')).slice(0, 20).map(e => `${e.tagName}.${e.className} ${getComputedStyle(e).fontSize} "${e.textContent.trim().slice(0, 30)}"`));
    r.ruler = await page.evaluate(() => { const a = document.getElementById('action-ruler'); if (!a) return null; const b = a.getBoundingClientRect(); return { bottomGap: Math.round(innerHeight - b.bottom), h: Math.round(b.height) }; });
    await page.evaluate(() => No2.open('detention-breakout'));
    await wait(() => No2.selected === 'detention-breakout' && !No2.loading);
    await page.waitForTimeout(1500);
    await shot('02-breakout-title');
    r.tabs = await page.evaluate(() => [...document.querySelectorAll('#page-tabs button')].map(b => `${getComputedStyle(b).fontSize} ${b.textContent.trim()}`));
    r.chrome = await page.evaluate(() => { const c = document.getElementById('book-chrome'); const b = c?.getBoundingClientRect(); return b ? { left: Math.round(b.left), top: Math.round(b.top), right: Math.round(innerWidth - b.right) } : null; });
    await page.evaluate(() => No2.go('play'));
    await wait(() => No2.page === 'play' && !No2.loading);
    await page.waitForTimeout(1500);
    await shot('03-breakout-ready');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(800);
    await page.touchscreen.tap(Math.round(d.w / 2), Math.round(d.h / 2));
    await page.waitForTimeout(2500);
    await shot('04-breakout-play');
    // WebGL context loss and restore while a game is played
    r.lost = await page.evaluate(async () => {
      const cs = [...document.querySelectorAll('canvas')].map(c => ({ c, gl: c.getContext('webgl2') || c.getContext('webgl') })).filter(x => x.gl && x.gl.getExtension);
      const ex = cs.map(x => x.gl.getExtension('WEBGL_lose_context')).filter(Boolean);
      ex.forEach(e => e.loseContext());
      await new Promise(f => setTimeout(f, 600));
      const paused = No2.adapter?.api?.get?.()?.paused ?? document.getElementById('desk-dialog')?.dataset.screen;
      ex.forEach(e => { try { e.restoreContext(); } catch {} });
      await new Promise(f => setTimeout(f, 1500));
      return { canvases: cs.length, lost: ex.length, paused, dialog: document.getElementById('desk-dialog')?.open && document.getElementById('desk-dialog')?.dataset.screen };
    });
    await shot('05-after-context-restore');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(1200);
    await shot('06-after-resume');
    await page.evaluate(() => No2.close?.());
    await page.waitForTimeout(800);
    await page.evaluate(() => No2.dialog('settings'));
    await page.waitForTimeout(1500);
    await shot('07-settings');
    r.vibration = await page.evaluate(() => [...document.querySelectorAll("#desk-dialog button")].some(b => /Vibration/.test(b.textContent)));
    r.smallSettings = await page.evaluate(() => [...document.querySelectorAll('#desk-dialog *')].filter(e => e.offsetParent && [...e.childNodes].some(n => n.nodeType === 3 && n.textContent.trim()) && parseFloat(getComputedStyle(e).fontSize) < 14 && !e.closest('.visually-hidden')).slice(0, 10).map(e => `${e.tagName} ${getComputedStyle(e).fontSize} "${e.textContent.trim().slice(0, 30)}"`));
    if (d.name === 'foldable-open') {
      await page.setViewportSize({ width: 412, height: 915 });
      await page.waitForTimeout(1500);
      await shot('08-folded');
      await page.setViewportSize({ width: d.w, height: d.h });
      await page.waitForTimeout(1500);
      await shot('09-unfolded');
    }
  } catch (e) { r.failure = String(e).slice(0, 400); console.log(d.name, 'FAILED', e.message.slice(0, 200)); }
  save();
  await browser.close();
}
console.log(JSON.stringify(report, null, 1).slice(0, 4000));
console.log('out:', out);
