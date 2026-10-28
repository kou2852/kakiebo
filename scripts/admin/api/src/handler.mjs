// 管理アプリ（Windows・iOS）用の API。Lambda 関数 URL から呼ばれる。
// 中身は手元の server.mjs と同じ lib/routes.mjs。違いは「Cognito の管理者プールのトークンが必須」と「IP を返さない」だけ。
// トークンが無い・無効な呼び出しは AWS を一切読まずに 401 を返す。

import { makeVerifier } from './auth.mjs';
import { route } from '../../lib/routes.mjs';

const verifyToken = makeVerifier({
  region: process.env.AWS_REGION || 'ap-northeast-1',
  userPoolId: process.env.ADMIN_POOL_ID,
  clientId: process.env.ADMIN_CLIENT_ID,
});

const reply = (statusCode, body) => ({
  statusCode,
  headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  body: JSON.stringify(body),
});

export async function handler(event, _ctx, deps = { verifyToken, route }) {
  const method = event.requestContext?.http?.method || 'GET';
  const path = event.rawPath || '/';
  if (method === 'OPTIONS') return { statusCode: 204 }; // CORS は関数 URL の設定が返す
  const auth = event.headers?.authorization || event.headers?.Authorization || '';
  const claims = await deps.verifyToken(auth.replace(/^Bearer\s+/i, ''));
  if (!claims) return reply(401, { error: 'ログインし直してください' });

  if (method === 'GET' && path === '/api/health') return reply(200, { ok: true });
  if (method === 'POST' && !/^application\/json\b/i.test(event.headers?.['content-type'] || '')) {
    return reply(415, { error: 'content-type は application/json にしてください' });
  }
  const raw = event.body ? (event.isBase64Encoded ? Buffer.from(event.body, 'base64').toString('utf8') : event.body) : '';
  const r = await deps.route(method, path, new URLSearchParams(event.rawQueryString || ''), raw, { hideIps: true });
  if (!r) return reply(404, { error: 'not found' });
  // 失敗の中身（ARN やアカウント番号が混ざりうる）はログにだけ残し、画面には返さない
  if (r.status >= 500) { console.error(path, r.body?.error); return reply(r.status, { error: '取得できませんでした（詳細は Lambda のログ）' }); }
  return reply(r.status, r.body);
}
