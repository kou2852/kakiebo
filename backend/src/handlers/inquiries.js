// ログイン済みユーザーの問い合わせスレッド。
// メールアドレスは受け取らない（Cognito の sub がそのまま本人の識別になるため不要）。
// 1スレッド＝1アイテム。やり取りは messages 配列に追記する。問い合わせは短く件数も少ないので
// メッセージごとにアイテムを分ける必要はない。
//
// 保存先は問い合わせ専用のテーブル（opsTables.js）。PK: USER#<sub>  SK: INQUIRY#<ISO日時>#<uuid>
// 退会しても消さずに、sub を外して残す（settings.js のアカウント削除）。
//
// ⚠ 2026-10 までの問い合わせは、家計データのテーブル（USER#<sub> 配下）にある。移行が済むまでは両方を読み、
//   同じ id があれば新しいテーブルのほうを使う。古いほうへの返信は、新しいテーブルへ写してから足す（古いほうは消さない）。
import { v4 as uuid } from 'uuid';
import { getItem, queryByPrefix, userPK } from '../lib/db.js';
import { INQUIRY_TABLE, opsGet, opsPut, opsQuery } from '../lib/opsTables.js';
import { parseBody, ok, created, noContent, badRequest, notFound, unauthorized, getUserId } from '../middleware/apiHelper.js';

const MAX_REQUEST_BYTES = 8192;
const MAX_BODY = 2000;
const MAX_SUBJECT = 100;
const MAX_MESSAGES = 50; // 1スレッドの往復上限（際限なく伸ばさない）

const strip = ({ PK, SK, ...rest }) => rest;

/** 新旧のテーブルの問い合わせを id でまとめる（新しいテーブルが優先） */
export function mergeThreads(fresh, legacy) {
  const byId = new Map();
  legacy.forEach((t) => { if (t.id) byId.set(t.id, t); });
  fresh.forEach((t) => { if (t.id) byId.set(t.id, t); });
  return [...byId.values()];
}

export async function handler(event) {
  if (event.httpMethod === 'OPTIONS') return noContent();
  const userId = getUserId(event);
  if (!userId) return unauthorized();
  const pk = userPK(userId);

  // 自分のスレッドだけ。新しい順（SKの先頭がISO日時なので降順で新着順になる）
  if (event.httpMethod === 'GET') {
    const [fresh, legacy] = await Promise.all([
      opsQuery(INQUIRY_TABLE, pk, 'INQUIRY#'),
      queryByPrefix(userId, 'INQUIRY#'),
    ]);
    const items = mergeThreads(fresh.map(strip), legacy.map(strip));
    return ok({ items: items.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || '')) });
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
    const cur = (await opsGet(INQUIRY_TABLE, pk, sk)) || (await getItem(userId, sk));
    if (!cur) return notFound();
    if (cur.status === 'closed') return badRequest('この問い合わせは終了しています');
    const messages = [...(cur.messages || []), message];
    if (messages.length > MAX_MESSAGES) return badRequest('このスレッドはこれ以上返信できません。新しくお問い合わせください');
    const { updatedAt, ...rest } = strip(cur);
    const saved = { ...rest, messages, status: 'open', updatedAt: now };
    await opsPut(INQUIRY_TABLE, { ...saved, PK: pk, SK: sk });
    return ok(saved);
  }

  const subject = typeof payload.subject === 'string' ? payload.subject.trim().slice(0, MAX_SUBJECT) : '';
  const id = `${now}#${uuid()}`;
  const saved = {
    id, subject, messages: [message], status: 'open', createdAt: now, updatedAt: now,
  };
  await opsPut(INQUIRY_TABLE, { ...saved, PK: pk, SK: `INQUIRY#${id}` });
  return created(saved);
}
