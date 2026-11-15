// The one thing the desktop app adds to the page: a way to quit (the website has none; the browser closes it).
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('No2Desktop', { quit: () => ipcRenderer.send('no2-quit'), platform: process.platform });
