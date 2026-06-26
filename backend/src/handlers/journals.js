import { v4 as uuid } from 'uuid';
import { putItem, deleteItem, queryByPrefix, queryByDateRange, getItem } from '../lib/db.js';
import { getUserId, parseBody, pathParam, ok, created, noContent, badRequest, unauthorized, notFound, tooLong } from '../middleware/apiHelper.js';

const SK = (id) => `JOURNAL#${id}`;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const DESC_MAX = 200;
const MAX_LINES = 100;
const MAX_SPLITS = 50;

/** 既知フィールドのみ残して保存する（クライアント由来の余分なデータを持ち込ませない） */
function sanitizeLines(lines) {
  return lines.map((l) => ({
    accountId: l.accountId,
    side: l.side,
    amount: l.amount,
    taxRate: typeof l.taxRate === 'number' && isFinite(l.taxRate) ? l.taxRate : 0,
    ...(Array.isArray(l.splits) && l.splits.length
      ? { splits: l.splits.slice(0, MAX_SPLITS).map((s) => ({ tagId: s.tagId, amount: s.amount })) }
      : {}),
  }));
}

/** 仕訳行の妥当性検証。問題なければ null、あればエラーメッセージを返す */
function validateLines(lines) {
  if (!Array.isArray(lines) || lines.length < 2) return 'lines は2行以上必要です';
  if (lines.length > MAX_LINES) return `lines は${MAX_LINES}行以内です`;
  for (const l of lines) {
    if (!l || !l.accountId) return '各行に accountId が必要です';
    if (l.side !== 'dr' && l.side !== 'cr') return 'side は dr または cr です';
    if (typeof l.amount !== 'number' || !isFinite(l.amount) || l.amount <= 0) return '金額は正の数値が必要です';
  }
  const dr = lines.filter((l) => l.side === 'dr').reduce((s, l) => s + l.amount, 0);
  const cr = lines.filter((l) => l.side === 'cr').reduce((s, l) => s + l.amount, 0);
  if (Math.abs(dr - cr) > 0.01) return `借方(${dr})と貸方(${cr})が一致しません`;
  return null;
}

export async function handler(event) {
  if (event.httpMethod === 'OPTIONS') return noContent();
  const userId = getUserId(event);
  if (!userId) return unauthorized();

  const method = event.httpMethod;
  const id = pathParam(event, 'id');

  // GET /api/journals?start=YYYY-MM-DD&end=YYYY-MM-DD
  if (method === 'GET' && !id) {
    const qs = event.queryStringParameters || {};
    let items;
    if (qs.start && qs.end) {
      // GSI1で日付範囲検索（仕訳のみフィルタ）
      items = await queryByDateRange(userId, qs.start, qs.end);
      items = items.filter((i) => i.SK.startsWith('JOURNAL#'));
    } else {
      items = await queryByPrefix(userId, 'JOURNAL#');
    }
    return ok(items.map(strip));
  }

  // POST /api/journals
  if (method === 'POST') {
    const body = parseBody(event);
    if (!body) return badRequest('Invalid JSON');
    if (!body.date) return badRequest('date は必須です');
    if (!DATE_RE.test(body.date)) return badRequest('date は YYYY-MM-DD 形式が必要です');
    if (tooLong(body.desc, DESC_MAX)) return badRequest(`摘要は${DESC_MAX}文字以内です`);
    const lineErr = validateLines(body.lines);
    if (lineErr) return badRequest(lineErr);

    const newId = uuid();
    const item = await putItem(userId, SK(newId), {
      id: newId,
      date: body.date,
      desc: body.desc || '',
      lines: sanitizeLines(body.lines),
      createdAt: new Date().toISOString(),
    }, body.date); // GSI1SK = date

    return created(strip(item));
  }

  // PUT /api/journals/{id}
  if (method === 'PUT' && id) {
    const existing = await getItem(userId, SK(id));
    if (!existing) return notFound();

    const body = parseBody(event);
    if (!body) return badRequest('Invalid JSON');
    if (body.date !== undefined && !DATE_RE.test(body.date)) return badRequest('date は YYYY-MM-DD 形式が必要です');
    if (tooLong(body.desc, DESC_MAX)) return badRequest(`摘要は${DESC_MAX}文字以内です`);
    if (body.lines !== undefined) {
      const lineErr = validateLines(body.lines);
      if (lineErr) return badRequest(lineErr);
    }

    const updated = await putItem(userId, SK(id), {
      id,
      date: body.date || existing.date,
      desc: body.desc !== undefined ? body.desc : existing.desc,
      lines: body.lines ? sanitizeLines(body.lines) : existing.lines,
      createdAt: existing.createdAt,
    }, body.date || existing.date);

    return ok(strip(updated));
  }

  // DELETE /api/journals/{id}
  if (method === 'DELETE' && id) {
    await deleteItem(userId, SK(id));
    return noContent();
  }

  return badRequest('Unsupported operation');
}

/** PK/SK/GSI キーを除外してクライアントに返す */
function strip(item) {
  const { PK, SK, GSI1SK, updatedAt, ...rest } = item;
  return rest;
}
