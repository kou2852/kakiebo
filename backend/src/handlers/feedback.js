import { v4 as uuid } from 'uuid';
import { putGroupedItem } from '../lib/db.js';
import { parseBody, created, noContent, badRequest } from '../middleware/apiHelper.js';

const MAX_REQUEST_BYTES = 4096;
const MIN_FEEDBACK_LENGTH = 2; // 1文字だけの投稿は明らかなノイズとして拒否する
const MAX_FEEDBACK_LENGTH = 1000;

export async function handler(event) {
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

  const timestamp = new Date().toISOString();
  const id = uuid();
  await putGroupedItem('FEEDBACK', `FEEDBACK#${timestamp}#${id}`, {
    body: feedbackBody,
    timestamp,
    // Authorizer: NONE のルートでは Cognito claims は設定されないため、未検証JWTを信用せず guest とする。
    userId: 'guest',
  });
  return created({ ok: true });
}
