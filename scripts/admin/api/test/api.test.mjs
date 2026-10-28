// node --test scripts/admin/api/test/api.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, sign } from 'node:crypto';
import { makeVerifier } from '../src/auth.mjs';
import { handler } from '../src/handler.mjs';

const POOL = 'ap-northeast-1_TEST', CLIENT = 'client123', REGION = 'ap-northeast-1';
const ISS = `https://cognito-idp.${REGION}.amazonaws.com/${POOL}`;
const kp = generateKeyPairSync('rsa', { modulusLength: 2048 });
const other = generateKeyPairSync('rsa', { modulusLength: 2048 });
const jwk = { ...kp.publicKey.export({ format: 'jwk' }), kid: 'k1', alg: 'RS256', use: 'sig' };
const enc = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const NOW = Date.parse('2026-10-27T00:00:00Z');

function token(claims = {}, { key = kp.privateKey, kid = 'k1', alg = 'RS256' } = {}) {
  const h = enc({ alg, kid }), p = enc({ iss: ISS, aud: CLIENT, token_use: 'id', exp: NOW / 1000 + 600, sub: 'admin', ...claims });
  return `${h}.${p}.${sign('RSA-SHA256', Buffer.from(`${h}.${p}`), key).toString('base64url')}`;
}
const verifier = () => makeVerifier({ region: REGION, userPoolId: POOL, clientId: CLIENT, fetchJwks: async () => ({ keys: [jwk] }), now: () => NOW });

test('正しいトークンは通る', async () => {
  assert.equal((await verifier()(token())).sub, 'admin');
});

test('無効なトークンはすべて拒否する', async () => {
  const v = verifier();
  const cases = {
    空: '', 形が違う: 'abc', 期限切れ: token({ exp: NOW / 1000 - 1 }), 別のプール: token({ iss: ISS + 'x' }),
    別のクライアント: token({ aud: 'other' }), アクセストークン: token({ token_use: 'access' }),
    別の鍵で署名: token({}, { key: other.privateKey }), 知らないkid: token({}, { kid: 'k9' }),
    alg_none: token({}, { alg: 'none' }), 有効期限なし: token({ exp: undefined }),
  };
  // 本文の書き換え（署名はそのまま）
  const [h, , s] = token().split('.');
  cases.本文の改ざん = `${h}.${enc({ iss: ISS, aud: CLIENT, token_use: 'id', exp: NOW / 1000 + 600, sub: 'evil' })}.${s}`;
  for (const [name, t] of Object.entries(cases)) assert.equal(await v(t), null, name);
});

const ev = (method, path, extra = {}) => ({ requestContext: { http: { method } }, rawPath: path, rawQueryString: '', headers: {}, ...extra });

test('トークンが無ければ AWS を読まずに 401', async () => {
  let called = false;
  const r = await handler(ev('GET', '/api/stats'), null, { verifyToken: async () => null, route: async () => { called = true; } });
  assert.equal(r.statusCode, 401);
  assert.equal(called, false);
});

test('通ったら IP を隠して振り分ける・知らない道は 404', async () => {
  const seen = [];
  const deps = { verifyToken: async () => ({ sub: 'a' }), route: async (m, p, q, raw, o) => { seen.push([m, p, q.get('days'), o.hideIps]); return p === '/api/stats' ? { status: 200, body: { ok: 1 } } : null; } };
  const headers = { authorization: 'Bearer x' };
  const r = await handler(ev('GET', '/api/stats', { rawQueryString: 'days=7', headers }), null, deps);
  assert.equal(r.statusCode, 200);
  assert.deepEqual(seen[0], ['GET', '/api/stats', '7', true]);
  assert.equal((await handler(ev('GET', '/api/nope', { headers }), null, deps)).statusCode, 404);
  assert.equal((await handler(ev('GET', '/api/health', { headers }), null, deps)).statusCode, 200);
});

test('返信は JSON だけ受ける', async () => {
  const deps = { verifyToken: async () => ({ sub: 'a' }), route: async () => ({ status: 200, body: {} }) };
  const r = await handler(ev('POST', '/api/inquiry-reply', { headers: { authorization: 'Bearer x', 'content-type': 'text/plain' }, body: 'x' }), null, deps);
  assert.equal(r.statusCode, 415);
});

test('知らない kid での鍵の取り直しは1分に1回まで', async () => {
  let t = NOW, loads = 0;
  const v = makeVerifier({ region: REGION, userPoolId: POOL, clientId: CLIENT, fetchJwks: async () => { loads++; return { keys: [jwk] }; }, now: () => t });
  for (let i = 0; i < 5; i++) assert.equal(await v(enc({ alg: 'RS256', kid: 'x' + i }) + '.e30.AA'), null);
  assert.equal(loads, 1);
  t += 60_000;
  await v(enc({ alg: 'RS256', kid: 'y' }) + '.e30.AA');
  assert.equal(loads, 2);
});

test('失敗の中身は返さない', async () => {
  const deps = { verifyToken: async () => ({ sub: 'a' }), route: async () => ({ status: 500, body: { error: 'arn:aws:dynamodb:ap-northeast-1:123456789012:table/x' } }) };
  const orig = console.error; console.error = () => {};
  try {
    const r = await handler(ev('GET', '/api/stats', { headers: { authorization: 'Bearer x' } }), null, deps);
    assert.equal(r.statusCode, 500);
    assert.doesNotMatch(r.body, /arn:|123456789012/);
  } finally { console.error = orig; }
});
