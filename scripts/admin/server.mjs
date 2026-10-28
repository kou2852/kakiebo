// ローカル管理者ダッシュボード（127.0.0.1 限定）。
// CloudFront と API Gateway のログ、Cognito、DynamoDB、CloudWatch を読み、数字だけを画面に出す。
// 解釈やアドバイスは画面に載せない方針（解釈は Claude 側で行う）。
//
// 使い方:  aws sso login --profile kakeibo-prod   （未認証のとき）
//          node scripts/admin/server.mjs           → ブラウザが開く（開かないとき: --no-open）
//
// 構成:  server.mjs（ここ。ルーティングと安全確認） / lib/（AWS の読み取りと集計） / ui/（画面）
// AWS SDK は report/node_modules のものを使う。無いときは cd scripts/admin/report && npm install。

import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { PROFILE, checkAuth } from './lib/aws.mjs';
import { route } from './lib/routes.mjs';

const PORT = Number(process.env.PORT) || 8787;
const UI = (f) => fileURLToPath(new URL('./ui/' + f, import.meta.url));
const STATIC = {
  '/': ['index.html', 'text/html; charset=utf-8'],
  '/index.html': ['index.html', 'text/html; charset=utf-8'],
  '/app.css': ['app.css', 'text/css; charset=utf-8'],
  '/app.js': ['app.js', 'text/javascript; charset=utf-8'],
  '/transport.js': ['transport.js', 'text/javascript; charset=utf-8'],
};

const ALLOWED_HOSTS = new Set([`localhost:${PORT}`, `127.0.0.1:${PORT}`]);
const ALLOWED_ORIGINS = new Set([`http://localhost:${PORT}`, `http://127.0.0.1:${PORT}`]);

const send = (res, status, body, type = 'application/json; charset=utf-8') => {
  res.writeHead(status, { 'content-type': type, 'cache-control': 'no-store' });
  res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
};

const readBody = (req, limit = 20000) => new Promise((resolve, reject) => {
  let raw = '';
  req.on('data', (c) => { raw += c; if (raw.length > limit) { reject(new Error('本文が大きすぎます')); req.destroy(); } });
  req.on('end', () => resolve(raw));
  req.on('error', reject);
});

const server = createServer(async (req, res) => {
  // DNS リバインディング対策: Host が自分宛てでない要求は断る
  if (!ALLOWED_HOSTS.has(req.headers.host || '')) return send(res, 403, { error: 'forbidden host' });
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (STATIC[url.pathname] && req.method === 'GET') {
    const [file, type] = STATIC[url.pathname];
    try { return send(res, 200, await readFile(UI(file)), type); } catch { return send(res, 404, 'not found', 'text/plain'); }
  }

  if (req.method === 'GET' && url.pathname === '/api/health') return send(res, 200, await checkAuth());

  // 本番への唯一の書き込み。同じ画面（同じ Origin）から JSON で来たものだけを受ける
  let raw = '';
  if (req.method === 'POST') {
    if (!ALLOWED_ORIGINS.has(req.headers.origin || '')) return send(res, 403, { error: 'forbidden origin' });
    if (!/^application\/json\b/i.test(req.headers['content-type'] || '')) return send(res, 415, { error: 'content-type は application/json にしてください' });
    try { raw = await readBody(req); } catch (e) { return send(res, 500, { error: e.message }); }
  }
  const r = await route(req.method, url.pathname, url.searchParams, raw);
  if (r) return send(res, r.status, r.body);

  send(res, 404, 'not found', 'text/plain');
});

const url = `http://localhost:${PORT}`;
const openBrowser = () => {
  if (process.env.NO_OPEN || process.argv.includes('--no-open')) return;
  try {
    if (process.platform === 'win32') spawn('cmd', ['/c', 'start', '', url], { stdio: 'ignore', detached: true }).unref();
    else spawn(process.platform === 'darwin' ? 'open' : 'xdg-open', [url], { stdio: 'ignore', detached: true }).unref();
  } catch { /* 開けなくても画面は使える */ }
};

server.on('error', (e) => {
  if (e.code === 'EADDRINUSE') { // すでに起動している。同じ画面を開くだけにする
    console.log(`\n  すでに起動しています: ${url}\n`);
    openBrowser();
    process.exit(0);
  }
  throw e;
});

server.listen(PORT, '127.0.0.1', async () => {
  console.log(`\n  kurofukubo 管理ダッシュボード（127.0.0.1 限定）\n  → ${url}\n  AWSプロファイル: ${PROFILE}`);
  const auth = await checkAuth();
  if (!auth.ok) console.log(`\n  ⚠ ${auth.message.replace(/\n/g, '\n  ')}\n`);
  openBrowser();
});
