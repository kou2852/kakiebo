/** CORSヘッダー（ALLOWED_ORIGIN 環境変数で許可オリジンを制限。未設定時のみ '*'） */
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || '*';
const CORS = {
  'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
  'Access-Control-Allow-Headers': 'Content-Type,Authorization',
  'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
};

/** レスポンスヘルパー */
export function res(statusCode, body) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json', ...CORS },
    body: JSON.stringify(body),
  };
}

export const ok = (data) => res(200, data);
export const created = (data) => res(201, data);
export const noContent = () => ({ statusCode: 204, headers: CORS });
export const badRequest = (msg) => res(400, { error: msg || 'Bad Request' });
export const unauthorized = () => res(401, { error: 'Unauthorized' });
export const notFound = () => res(404, { error: 'Not Found' });
/** 他端末が先に更新していて、送られてきた rev が古い場合。クライアントは読み直して再試行する */
export const conflict = (data) => res(409, { error: 'Conflict', ...data });
export const serverError = (msg) => res(500, { error: msg || 'Internal Server Error' });

/**
 * Cognito Authorizer が検証済みの JWT からユーザーIDを取得。
 * API Gateway の requestContext.authorizer.claims に格納されている。
 */
export function getUserId(event) {
  const claims = event.requestContext?.authorizer?.claims;
  if (!claims?.sub) return null;
  return claims.sub;
}

/** 文字列フィールドが上限長を超えていれば true（入力長制限・defense-in-depth） */
export const tooLong = (v, max) => typeof v === 'string' && v.length > max;

/** リクエストボディをパース */
export function parseBody(event) {
  try {
    return event.body ? JSON.parse(event.body) : {};
  } catch {
    return null;
  }
}

/** パスパラメータ取得 */
export function pathParam(event, name) {
  return event.pathParameters?.[name] || null;
}
