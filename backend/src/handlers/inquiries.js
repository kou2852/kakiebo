// ログイン済みユーザーの問い合わせスレッド。
// メールアドレスは受け取らない（Cognito の sub がそのまま本人の識別になるため不要）。
// 1スレッド＝1アイテム。やり取りは messages 配列に追記する。問い合わせは短く件数も少ないので
// メッセージごとにアイテムを分ける必要はない。
//
// PK: USER#<sub>  SK: INQUIRY#<ISO日時>#<uuid>
import { v4 as uuid } from 'uuid';
import { putItem, getItem, queryByPrefix } from '../lib/db.js';
import { parseBody, ok, created, noContent, badRequest, notFound, unauthorized, getUserId } from '../middleware/apiHelper.js';

const MAX_REQUEST_BYTES = 8192;
const MAX_BODY = 2000;
const MAX_SUBJECT = 100;
const MAX_MESSAGES = 50; // 1スレッドの往復上限（際限なく伸ばさない）

const strip = ({ PK, SK, ...rest }) => rest;

export async function handler(event) {
  if (event.httpMethod === 'OPTIONS') return noContent();
  const userId = getUserId(event);
  if (!userId) return unauthorized();

  // 自分のスレッドだけ。新しい順（SKの先頭がISO日時なので降順で新着順になる）
  if (event.httpMethod === 'GET') {
    const items = await queryByPrefix(userId, 'INQUIRY#');
    return ok({ items: items.map(strip).sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || '')) });
  }

  if (event.httpMethod !== 'POST') return badRequest('Unsupported operation');

  if (typeof event.body !== 'string' || Buffer.byteLength(event.body, 'utf8') > MAX_REQUEST_BYTES) {
    return badRequest('リクエストサイズが上限を超えています');
  }
  const payload = parseBody(event);
  if (!payload || typeof payload.body !== 'string') return badRequest('Invalid JSON');
  const body = payload.body.trim().slice(0, MAX_BODY);
  if (!body) return badRequest('内容を入力してください');

  const now = new Date().toISOString();
  const message = { from: 'user', body, at: now };

  // id 指定は既存スレッドへの返信
  if (payload.id) {
    const sk = `INQUIRY#${payload.id}`;
    const cur = await getItem(userId, sk);
    if (!cur) return notFound();
    if (cur.status === 'closed') return badRequest('この問い合わせは終了しています');
    const messages = [...(cur.messages || []), message];
    if (messages.length > MAX_MESSAGES) return badRequest('このスレッドはこれ以上返信できません。新しくお問い合わせください');
    const saved = { ...strip(cur), messages, status: 'open', updatedAt: now };
    await putItem(userId, sk, saved);
    return ok(saved);
  }

  const subject = typeof payload.subject === 'string' ? payload.subject.trim().slice(0, MAX_SUBJECT) : '';
  const id = `${now}#${uuid()}`;
  const saved = {
    id, subject, messages: [message], status: 'open', createdAt: now, updatedAt: now,
  };
  await putItem(userId, `INQUIRY#${id}`, saved);
  return created(saved);
}
