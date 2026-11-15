// No. 2 Arcade desktop app (owner 2026-11-15): Electron shows the website build (node build/build.cjs --web) from the
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

function serveLocal(request) {
  const u = new URL(request.url);
  let rel = decodeURIComponent(u.pathname).replace(/^\/+/, '') || 'index.html';
  if (rel.endsWith('/')) rel += 'index.html';
  const file = path.resolve(WEB, rel);
  if (!file.startsWith(WEB + path.sep) || !fs.existsSync(file)) return new Response('not found', { status: 404 });
  return net.fetch(pathToFileURL(file).toString());
}

app.whenReady().then(() => {
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

  if (process.platform === 'darwin') {
    Menu.setApplicationMenu(Menu.buildFromTemplate([
      { role: 'appMenu' },
      { role: 'editMenu' },
      { label: 'View', submenu: [{ role: 'togglefullscreen' }] },
      { role: 'windowMenu' },
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
  // Full screen like a console game unless the player left it last time (macOS ignores it before the window shows).
  win.once('ready-to-show', () => { win.show(); if (st.fullScreen !== false) win.setFullScreen(true); });
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https:\/\/(github\.com|www\.youtube\.com|youtube\.com|youtu\.be)\//.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => { if (new URL(url).hostname !== HOST) e.preventDefault(); });
  win.on('close', () => saveState(win));
  ipcMain.on('no2-quit', () => { saveState(win); app.quit(); });
  win.loadURL(`https://${HOST}/`);
});

app.on('window-all-closed', () => app.quit());
