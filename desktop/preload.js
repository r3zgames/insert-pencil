// What the desktop app adds to the page: a way to quit (the website has none; the browser closes it), a notice that
// the menu's Settings and Report a Problem can be used now, an update check (a newer version and its page), and two notices from the app: the window lost focus
// (the game pauses) and a menu command (settings, report a problem).
// Only plain callbacks cross the bridge, never ipcRenderer itself (Electron's security checklist).
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('No2Desktop', {
  quit: () => ipcRenderer.send('no2-quit'),
  platform: process.platform,
  onBlur: fn => { ipcRenderer.on('no2-blur', () => fn()); },
  onMenu: fn => { ipcRenderer.on('no2-menu', (e, what) => fn(String(what))); },
  menuReady: on => ipcRenderer.send('no2-menu-ready', on === true),
  checkUpdate: () => ipcRenderer.invoke('no2-update-check'),
  openUpdate: () => ipcRenderer.send('no2-update-open'),
});
