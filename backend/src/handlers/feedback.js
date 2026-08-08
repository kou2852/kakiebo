import { v4 as uuid } from 'uuid';
import { putGroupedItem } from '../lib/db.js';
import { parseBody, created, noContent, badRequest, setRequestOrigin } from '../middleware/apiHelper.js';

const MAX_REQUEST_BYTES = 4096;
const MIN_FEEDBACK_LENGTH = 2; // 1文字だけの投稿は明らかなノイズとして拒否する
const MAX_FEEDBACK_LENGTH = 1000;

export async function handler(event) {
  // アプリ内アンケートと LP の問い合わせフォームの両方から呼ばれる（ホストが違う）
  setRequestOrigin(event);
  if (event.httpMethod === 'OPTIONS') return noContent();
  if (event.httpMethod !== 'POST') return badRequest('Unsupported operation');

  // JSONをパースする前に、本文に対して十分な余裕を持たせたリクエスト上限を適用する。
  if (typeof event.body !== 'string' || Buffer.byteLength(event.body, 'utf8') > MAX_REQUEST_BYTES) {
    return badRequest('リクエストサイズが上限を超えています');
  }

  const payload = parseBody(event);
  if (!payload || typeof payload.body !== 'string') return badRequest('Invalid JSON');
  const feedbackBody = payload.body.trim().slice(0, MAX_FEEDBACK_LENGTH);
  if (!feedbackBody) return badRequest('ご意見を入力してください');
  if (Array.from(feedbackBody).length < MIN_FEEDBACK_LENGTH) return badRequest('ご意見は2文字以上で入力してください');

  // ボット除け。人には見えない入力欄で、埋まっていたら保存しない。
  // 弾いたことを知られないよう応答は成功と同じにする（外部CAPTCHAは使わない方針のため）。
  if (typeof payload.website === 'string' && payload.website.trim()) return created({ ok: true });

  const timestamp = new Date().toISOString();
  const id = uuid();
  await putGroupedItem('FEEDBACK', `FEEDBACK#${timestamp}#${id}`, {
    body: feedbackBody,
    timestamp,
    // どこから送られたか。'lp' は未登録の人からの問い合わせなので返信手段が無い点に注意。
    source: payload.source === 'lp' ? 'lp' : 'app',
    // Authorizer: NONE のルートでは Cognito claims は設定されないため、未検証JWTを信用せず guest とする。
    userId: 'guest',
  });
  return created({ ok: true });
}
