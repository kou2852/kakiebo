// 管理アプリの画面を、本番の Cognito と Lambda を使わずに手元で試すためのサーバー（127.0.0.1 限定）。
//   node scripts/admin/api/dev-server.mjs   → http://localhost:8790
// ・画面は ui/ をそのまま出し、window.KK_ADMIN（アプリが入れる設定）を差し込む
// ・/cognito は Cognito の代わり（初回: 仮パスワード変更 → 認証アプリ登録、2回目以降: 6桁。コードは 123456 で通る）
// ・/api/... は Lambda と同じ handler（トークン検証つき）。中の読み取りは手元の AWS 認証で本番を読むだけ（返信は押さない）
// ID トークンの有効期限は ID_TTL 秒（既定 120 秒）。短くして、更新トークンでの取り直しを試せる。

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { generateKeyPairSync, sign, randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { makeVerifier } from './src/auth.mjs';
import { handler } from './src/handler.mjs';
import { route } from '../lib/routes.mjs';

const PORT = Number(process.env.PORT) || 8790;
const ID_TTL = Number(process.env.ID_TTL) || 120;
const POOL = 'ap-northeast-1_DEVPOOL', CLIENT = 'devclient', REGION = 'ap-northeast-1';
const ISS = `https://cognito-idp.${REGION}.amazonaws.com/${POOL}`;
const kp = generateKeyPairSync('rsa', { modulusLength: 2048 });
const jwk = { ...kp.publicKey.export({ format: 'jwk' }), kid: 'dev', alg: 'RS256' };
const verifyToken = makeVerifier({ region: REGION, userPoolId: POOL, clientId: CLIENT, fetchJwks: async () => ({ keys: [jwk] }) });

const b64u = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
function idToken(email) {
  const h = b64u({ alg: 'RS256', kid: 'dev' });
  const p = b64u({ iss: ISS, aud: CLIENT, token_use: 'id', sub: 'dev-admin', email, exp: Math.floor(Date.now() / 1000) + ID_TTL });
  return `${h}.${p}.${sign('RSA-SHA256', Buffer.from(`${h}.${p}`), kp.privateKey).toString('base64url')}`;
}

// 偽の Cognito。状態は1人分だけ持つ
const user = { stage: 'new', refresh: new Set() };
const authResult = (email) => {
  const rt = randomUUID(); user.refresh.add(rt);
  return { AuthenticationResult: { IdToken: idToken(email), RefreshToken: rt, ExpiresIn: ID_TTL } };
};
function cognito(target, b) {
  const fail = (m) => { const e = new Error(m); e.status = 400; throw e; };
  switch (target) {
    case 'InitiateAuth':
      if (b.ClientId !== CLIENT) fail('Invalid client');
      if (b.AuthFlow === 'REFRESH_TOKEN_AUTH') {
        if (!user.refresh.has(b.AuthParameters.REFRESH_TOKEN)) fail('Invalid Refresh Token');
        return { AuthenticationResult: { IdToken: idToken('dev@example.test'), ExpiresIn: ID_TTL } };
      }
      if (!b.AuthParameters.USERNAME || !b.AuthParameters.PASSWORD) fail('Incorrect username or password.');
      user.email = b.AuthParameters.USERNAME;
      return user.stage === 'new' ? { ChallengeName: 'NEW_PASSWORD_REQUIRED', Session: 's1', ChallengeParameters: { USER_ID_FOR_SRP: user.email } }
        : user.stage === 'pw' ? { ChallengeName: 'MFA_SETUP', Session: 's2', ChallengeParameters: {} }
          : { ChallengeName: 'SOFTWARE_TOKEN_MFA', Session: 's3', ChallengeParameters: { USER_ID_FOR_SRP: user.email } };
    case 'RespondToAuthChallenge':
      if (b.ChallengeName === 'NEW_PASSWORD_REQUIRED') {
        if ((b.ChallengeResponses.NEW_PASSWORD || '').length < 12) fail('Password does not conform to policy');
        user.stage = 'pw'; return { ChallengeName: 'MFA_SETUP', Session: 's2', ChallengeParameters: {} };
      }
      if (b.ChallengeName === 'MFA_SETUP') { user.stage = 'done'; return authResult(user.email); }
      if (b.ChallengeName === 'SOFTWARE_TOKEN_MFA') {
        if (b.ChallengeResponses.SOFTWARE_TOKEN_MFA_CODE !== '123456') fail('Invalid code received for user');
        return authResult(user.email);
      }
      return fail('unknown challenge');
    case 'AssociateSoftwareToken': return { SecretCode: 'DEVSECRETDEVSECRETDEVSECRET', Session: 'sa' };
    case 'VerifySoftwareToken':
      if (b.UserCode !== '123456') fail('Code mismatch');
      return { Status: 'SUCCESS', Session: 'sv' };
    case 'RevokeToken': user.refresh.delete(b.Token); return {};
    default: return fail('unsupported ' + target);
  }
}

const UI = (f) => fileURLToPath(new URL('../ui/' + f, import.meta.url));
const TYPES = { html: 'text/html; charset=utf-8', css: 'text/css; charset=utf-8', js: 'text/javascript; charset=utf-8' };
const body = (req) => new Promise((r) => { let s = ''; req.on('data', (c) => { s += c; }); req.on('end', () => r(s)); });

createServer(async (req, res) => {
  if (!['localhost:' + PORT, '127.0.0.1:' + PORT].includes(req.headers.host)) { res.writeHead(403); return res.end(); }
  const url = new URL(req.url, 'http://' + req.headers.host);
  // Windows アプリ（app://admin）から呼ぶ試験のため。本番は関数 URL の CORS 設定が同じことをする
  if (req.headers.origin === 'app://admin') {
    res.setHeader('access-control-allow-origin', 'app://admin');
    res.setHeader('access-control-allow-headers', 'authorization, content-type, x-amz-target');
    res.setHeader('access-control-allow-methods', 'GET, POST');
    if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }
  }
  const raw = await body(req);
  if (url.pathname === '/cognito') {
    try {
      const out = cognito(String(req.headers['x-amz-target']).split('.').pop(), JSON.parse(raw || '{}'));
      res.writeHead(200, { 'content-type': 'application/x-amz-json-1.1' }); return res.end(JSON.stringify(out));
    } catch (e) { res.writeHead(e.status || 500, { 'content-type': 'application/json' }); return res.end(JSON.stringify({ message: e.message })); }
  }
  if (url.pathname.startsWith('/api/')) {
    const r = await handler({ requestContext: { http: { method: req.method } }, rawPath: url.pathname, rawQueryString: url.search.slice(1),
      headers: req.headers, body: raw }, null, { verifyToken, route });
    res.writeHead(r.statusCode, r.headers || {}); return res.end(r.body || '');
  }
  // iOS アプリが WebView に出す1枚の HTML（ios/ui-bundle.js。npm run bundle-ui で作る）。CSP のハッシュが合うかを試す
  if (url.pathname === '/ios') {
    try {
      const { default: html } = await import(new URL('../ios/ui-bundle.js?' + Date.now(), import.meta.url));
      res.writeHead(200, { 'content-type': TYPES.html, 'cache-control': 'no-store' }); return res.end(html);
    } catch { res.writeHead(404); return res.end('先に cd scripts/admin/ios && npm run bundle-ui'); }
  }
  const f = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
  if (!/^[a-z.]+$/.test(f)) { res.writeHead(404); return res.end(); }
  try {
    let out = await readFile(UI(f), 'utf8');
    if (f === 'index.html') {
      // アプリが入れるのと同じ設定（宛先だけ手元向け）
      const cfg = { apiBase: `http://localhost:${PORT}`, clientId: CLIENT, region: REGION, cognitoUrl: `http://localhost:${PORT}/cognito` };
      out = out.replace('<script src="/transport.js">', `<script>window.KK_ADMIN=${JSON.stringify(cfg)}</script>\n<script src="/transport.js">`);
    }
    res.writeHead(200, { 'content-type': TYPES[f.split('.').pop()] || 'text/plain', 'cache-control': 'no-store' }); res.end(out);
  } catch { res.writeHead(404); res.end(); }
}).listen(PORT, '127.0.0.1', () => console.log(`管理アプリの試験用サーバー → http://localhost:${PORT}（コードは 123456）`));
