// No. 2 Arcade desktop app: Electron shows the website build (node build/build.cjs --web) from the
// app's own files, so images and sounds load only when shown, as on no2arca.de. The page is served at
// https://no2arca.de/ from inside the app (never the network), so its own CSP ('self') and the leaderboard Worker's
// allowed origins hold unchanged. Nothing else reaches the network: only the leaderboard origin read from the built
// page's CSP passes; links the player clicks (GitHub, the maker's tape) open in their own browser.
const { app, BrowserWindow, Menu, protocol, net, session, shell, ipcMain, screen } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const { pathToFileURL } = require('node:url');

const WEB = path.join(__dirname, 'web');
const HOST = 'no2arca.de';
const STATE = () => path.join(app.getPath('userData'), 'window.json');

// Startup and quit timings, written to timing.log beside window.json (this computer only, overwritten each launch) so a slow
// start or quit on a player's machine can be told apart: time before this code runs (Windows Defender scanning a new app,
// the disk), the window, the page's first frame, the locker, and each step of quitting.
const BOOT = Date.now() - Math.round(process.uptime() * 1000);
let logged = false;
function mark(what) {
  try { const line = `${String(Date.now() - BOOT).padStart(6)} ms  ${what}\n`, f = path.join(app.getPath('userData'), 'timing.log');
    if (!logged) { logged = true; fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, `No. 2 Arcade ${app.getVersion()} ${process.platform} ${process.arch} ${new Date().toISOString()}\n` + line); }
    else fs.appendFileSync(f, line); } catch {}
}
mark('app code starts (everything before this is the system starting the app)');

// The leaderboard origin is whatever the built page's CSP allows to connect besides itself.
function leaderboardOrigin() {
  try {
    const html = fs.readFileSync(path.join(WEB, 'index.html'), 'utf8');
    const m = /connect-src ([^;"]+)/.exec(html);
    return (m ? m[1].split(/\s+/) : []).find(s => /^https:\/\//.test(s)) || null;
  } catch { return null; }
}

function loadState() { try { return JSON.parse(fs.readFileSync(STATE(), 'utf8')); } catch { return {}; } }
function saveState(win) {
  try { fs.writeFileSync(STATE(), JSON.stringify({ bounds: win.getNormalBounds(), fullScreen: win.isFullScreen() })); } catch {}
}

// The game's 1,858 pictures, sounds and fonts (185 MB) ship as plain files beside app.asar (resources/a), not inside it:
// Windows Defender scanned the whole archive when the app opened it, so the cassette took minutes to show on Windows.
// Each file is named after its own SHA-256, and the app serves it only when its contents still match that name, so the
// files outside the archive stay as tamper-proof as the archive (whose hash Electron checks).
const ASSETS = app.isPackaged ? path.join(process.resourcesPath, 'a') : path.join(WEB, 'a');
const TYPES = { webp: 'image/webp', png: 'image/png', ico: 'image/x-icon', m4a: 'audio/mp4', ttf: 'font/ttf', webmanifest: 'application/manifest+json' };
const crypto = require('node:crypto');
async function serveAsset(name) {
  const m = /^([0-9a-f]{16})\.([a-z0-9]+)$/.exec(name);
  if (!m || !TYPES[m[2]]) return new Response('not found', { status: 404 });
  let data;
  try { data = await fs.promises.readFile(path.join(ASSETS, name)); } catch { return new Response('not found', { status: 404 }); }
  if (crypto.createHash('sha256').update(data).digest('hex').slice(0, 16) !== m[1]) return new Response('changed', { status: 403 });
  return new Response(data, { headers: { 'content-type': TYPES[m[2]] } });
}

function serveLocal(request) {
  const u = new URL(request.url);
  let rel = decodeURIComponent(u.pathname).replace(/^\/+/, '') || 'index.html';
  if (rel.startsWith('a/')) return serveAsset(rel.slice(2));
  if (rel.endsWith('/')) rel += 'index.html';
  const file = path.resolve(WEB, rel);
  if (!file.startsWith(WEB + path.sep) || !fs.existsSync(file)) return new Response('not found', { status: 404 });
  return net.fetch(pathToFileURL(file).toString());
}

app.whenReady().then(() => {
  mark('Electron ready');
  // NO2_OFFLINE=1 (test runs): not even the leaderboard, so captures never send scores or play stats.
  const lb = process.env.NO2_OFFLINE ? null : leaderboardOrigin();
  // Every https request: the game's own files from the app, the leaderboard from the network, nothing else.
  protocol.handle('https', request => {
    const u = new URL(request.url);
    if (u.hostname === HOST) return serveLocal(request);
    if (lb && u.origin === lb) return net.fetch(request, { bypassCustomProtocolHandlers: true });
    return new Response('blocked', { status: 403 });
  });
  protocol.handle('http', () => new Response('blocked', { status: 403 }));
  session.defaultSession.setPermissionRequestHandler((wc, permission, done) => done(permission === 'fullscreen'));

  // The Mac menu bar as Apple's guidelines lay it out: About (with the copyright), Settings (Command-comma, the game's
  // own settings page), Hide and Quit; File with Close Window; Edit for the detention slip; View for full screen;
  // Window; Help (the game's GitHub page, and the detention slip to report a problem). Settings and Report a Problem are
  // dimmed while the start gate, title or intro comic shows (Apple: items that can't be used now are dimmed). Windows and Linux: no menu bar.
  const toPage = what => BrowserWindow.getAllWindows()[0]?.webContents.send('no2-menu', what);
  if (process.platform === 'darwin') {
    app.setAboutPanelOptions({ applicationName: 'No. 2 Arcade', applicationVersion: app.getVersion(), version: '',
      copyright: '\u00a9 2026 R3Z Games LLC. A game by Reza Elghazi.' });
    Menu.setApplicationMenu(Menu.buildFromTemplate([
      { label: app.name, submenu: [
        { role: 'about' }, { type: 'separator' },
        { id: 'no2-settings', label: 'Settings\u2026', accelerator: 'Command+,', enabled: false, click: () => toPage('settings') }, { type: 'separator' },
        { role: 'services' }, { type: 'separator' },
        { role: 'hide' }, { role: 'hideOthers' }, { role: 'unhide' }, { type: 'separator' },
        { role: 'quit' },
      ] },
      { label: 'File', submenu: [{ role: 'close', label: 'Close Window' }] },
      { role: 'editMenu' },
      { label: 'View', submenu: [{ role: 'togglefullscreen' }] },
      { role: 'windowMenu' },
      { role: 'help', submenu: [
        { label: 'No. 2 Arcade Help', click: () => shell.openExternal('https://github.com/r3zgames/insert-pencil') },
        { id: 'no2-report', label: 'Report a Problem\u2026', enabled: false, click: () => toPage('report') },
      ] },
    ]));
  } else Menu.setApplicationMenu(null);

  const st = loadState(), area = screen.getPrimaryDisplay().workAreaSize;
  const w = Math.min(1600, area.width), h = Math.min(900, area.height);
  const win = new BrowserWindow({
    title: 'No. 2 Arcade',
    width: st.bounds?.width || w, height: st.bounds?.height || h, x: st.bounds?.x, y: st.bounds?.y,
    minWidth: 640, minHeight: 360,
    show: false,
    backgroundColor: '#211c27',
    autoHideMenuBar: true,
    icon: path.join(__dirname, 'icon.png'),
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, sandbox: true, nodeIntegration: false, spellcheck: true },
  });
  mark('window created');
  // The window shows at once (on its dark background) instead of waiting for the page's first frame, so a slow start never
  // looks like nothing happened; full screen like a console game unless the player left it last time.
  win.show(); if (st.fullScreen !== false) win.setFullScreen(true);
  win.webContents.once('did-start-loading', () => mark('page starts loading'));
  win.webContents.once('dom-ready', () => mark('page parsed'));
  win.once('ready-to-show', () => mark('page first frame'));
  win.once('close', () => mark('window closing'));
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https:\/\/(github\.com|www\.youtube\.com|youtube\.com|youtu\.be)\//.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => { if (new URL(url).hostname !== HOST) e.preventDefault(); });
  win.on('close', () => saveState(win));
  // Apple: a game pauses when the player leaves it; the page opens its pause sheet when the window loses focus.
  win.on('blur', () => win.webContents.send('no2-blur'));
  // Only the game's own page may ask to quit (Electron's checklist: validate the sender of every IPC message).
  // Update notice: once a launch, when the page asks (only while "share my scores online" is on), read the newest version
  // from the game's own site (the real one: this app serves no2arca.de from its own files) and hand back a newer one with
  // its release page. Nothing about the player is sent. NO2_OFFLINE=1 skips it; NO2_UPDATE_URL points it elsewhere for tests (and works with NO2_OFFLINE).
  const once = new Set(), markOnce = m => { if (!once.has(m)) { once.add(m); mark(m); } };
  let update = null;
  const newer = (a, b) => { const x = a.split('.').map(Number), y = b.split('.').map(Number); for (let i = 0; i < 3; i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0); return false; };
  const fromGame = e => new URL(e.senderFrame?.url || 'about:blank').origin === `https://${HOST}`;
  ipcMain.handle('no2-update-check', async e => {
    if (!fromGame(e) || (process.env.NO2_OFFLINE === '1' && !process.env.NO2_UPDATE_URL)) return null;
    try {
      const r = await net.fetch(process.env.NO2_UPDATE_URL || `https://${HOST}/version.json`, { bypassCustomProtocolHandlers: true, cache: 'no-store', signal: AbortSignal.timeout(8000) });
      const v = await r.json();
      if (!/^\d+\.\d+\.\d+$/.test(v.version) || !/^https:\/\/github\.com\/r3zgames\/insert-pencil\/releases\//.test(v.url) || !newer(v.version, app.getVersion())) return null;
      update = v; return { version: v.version };
    } catch { return null; }
  });
  ipcMain.on('no2-update-open', e => { if (fromGame(e) && update) shell.openExternal(update.url); });
  // Settings and Report a Problem are dimmed until the page says they can open (not while the title or the comic shows).
  ipcMain.on('no2-menu-ready', (e, on) => { if (new URL(e.senderFrame?.url || 'about:blank').origin !== `https://${HOST}`) return;
    if (on === true) markOnce('locker (or the comic) can be used'); else markOnce('game script running');
    const m = Menu.getApplicationMenu(); for (const id of ['no2-settings', 'no2-report']) { const it = m?.getMenuItemById(id); if (it) it.enabled = on === true; } });
  ipcMain.on('no2-quit', e => { if (new URL(e.senderFrame?.url || 'about:blank').origin !== `https://${HOST}`) return; mark('quit asked (Q on the locker or settings)'); saveState(win); app.quit(); });
  win.loadURL(`https://${HOST}/`);
});

app.on('window-all-closed', () => { mark('window closed'); app.quit(); });
// Quitting never hangs: a last play-stats send or anything else still open gets 1.5 s, then the app ends (the window's
// size and full screen are already saved when it closes).
app.on('before-quit', () => { mark('quitting'); setTimeout(() => { mark('forced exit after 1.5 s'); app.exit(0); }, 1500); });
app.on('will-quit', () => mark('will quit'));
app.on('quit', () => mark('quit'));
