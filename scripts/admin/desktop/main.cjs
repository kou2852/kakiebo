// 管理ダッシュボードの Windows アプリ（Electron）。画面は scripts/admin/ui を同梱し、数字は Lambda（api/）から取る。
// 画面は app://admin/ から出す（file:// だと Origin が null になり、API の CORS で許可できない）。
const { app, BrowserWindow, protocol, net, safeStorage, ipcMain, shell, session } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const { pathToFileURL } = require('node:url');

const CONFIG = require('./config.json'); // { apiBase, clientId, region }（デプロイ後の出力を入れる）
const UI_DIR = path.join(__dirname, 'ui');
const STORE = () => path.join(app.getPath('userData'), 'session.bin');

protocol.registerSchemesAsPrivileged([{ scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true } }]);

// 更新トークンは Windows の資格情報で暗号化して保存する（safeStorage）。ファイルは1つ・中身は1件だけ
function readStore() {
  try { return JSON.parse(safeStorage.decryptString(fs.readFileSync(STORE()))); } catch { return {}; }
}
function writeStore(o) { fs.writeFileSync(STORE(), safeStorage.encryptString(JSON.stringify(o))); }

const cognitoOrigin = `https://cognito-idp.${CONFIG.region}.amazonaws.com`;
const CSP = [
  "default-src 'none'", "script-src 'self'", "style-src 'self' 'unsafe-inline'", "img-src 'self' data:",
  `connect-src ${new URL(CONFIG.apiBase).origin} ${cognitoOrigin}`, "base-uri 'none'", "form-action 'none'", "frame-ancestors 'none'",
].join('; ');

app.whenReady().then(() => {
  protocol.handle('app', (req) => {
    const u = new URL(req.url);
    const rel = u.pathname === '/' ? 'index.html' : decodeURIComponent(u.pathname.slice(1));
    const file = path.join(UI_DIR, rel);
    if (!file.startsWith(UI_DIR + path.sep)) return new Response('', { status: 404 });
    if (rel === 'config.js') {
      return new Response(`window.KK_ADMIN=Object.assign(${JSON.stringify(CONFIG)},{storage:window.kkStore});`,
        { headers: { 'content-type': 'text/javascript' } });
    }
    return net.fetch(pathToFileURL(file).toString());
  });
  // 応答に CSP を付ける（同梱の index.html を書き換えずに済む）
  session.defaultSession.webRequest.onHeadersReceived((d, cb) => {
    if (!d.url.startsWith('app://')) return cb({});
    cb({ responseHeaders: { ...d.responseHeaders, 'Content-Security-Policy': [CSP] } });
  });
  session.defaultSession.setPermissionRequestHandler((_wc, _perm, cb) => cb(false));

  ipcMain.handle('store:get', (_e, k) => readStore()[k] ?? null);
  ipcMain.handle('store:set', (_e, k, v) => { const o = readStore(); o[k] = String(v); writeStore(o); });
  ipcMain.handle('store:del', (_e, k) => { const o = readStore(); delete o[k]; writeStore(o); });

  const win = new BrowserWindow({
    width: 1280, height: 900, title: 'kurofukubo 管理',
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  win.removeMenu();
  // 画面の外へは移動しない。外部リンクは既定のブラウザで開く
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^https:/.test(url)) shell.openExternal(url); return { action: 'deny' }; });
  win.webContents.on('will-navigate', (e, url) => { if (!url.startsWith('app://admin/')) e.preventDefault(); });
  win.loadURL('app://admin/');
});

app.on('window-all-closed', () => app.quit());
