// Windows app: loads the single-file web build and fetches the Google Sheet from the main process (no CORS).
const { app, BrowserWindow, ipcMain, net, shell } = require('electron');
const path = require('path');

function createWindow() {
  const win = new BrowserWindow({
    width: 1440, height: 900, minWidth: 1024, minHeight: 700,
    backgroundColor: '#04100c', autoHideMenuBar: true, title: 'Word Battleships',
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  win.setMenuBarVisibility(false);
  win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  // the practice mode opens a second game window; links to other sites open in the browser
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('file:')) return { action: 'allow', overrideBrowserWindowOptions: { width: 1280, height: 820, autoHideMenuBar: true, webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, sandbox: true } } };
    shell.openExternal(url);
    return { action: 'deny' };
  });
}

ipcMain.handle('wb:fetchText', async (_e, url) => {
  if (typeof url !== 'string' || !url.startsWith('https://docs.google.com/spreadsheets/')) throw new Error('blocked');
  const res = await net.fetch(url);
  if (!res.ok) throw new Error(String(res.status));
  return res.text();
});

app.whenReady().then(createWindow);
app.on('window-all-closed', () => app.quit());
