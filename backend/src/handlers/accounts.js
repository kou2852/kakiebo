import { v4 as uuid } from 'uuid';
import { putItem, deleteItem, queryByPrefix, getItem } from '../lib/db.js';
import { getUserId, parseBody, pathParam, ok, created, noContent, badRequest, unauthorized, notFound, tooLong } from '../middleware/apiHelper.js';

const SK = (id) => `ACCOUNT#${id}`;
const VALID_TYPES = ['asset', 'liability', 'equity', 'income', 'expense'];
// クライアントが更新できるフィールドのホワイトリスト（sys 等の特権フィールドは含めない）
const EDITABLE_FIELDS = ['name', 'type', 'code', 'note', 'ccClose', 'ccDay', 'ccDelay', 'ccFrom'];

/** 文字列フィールドの長さ検証。問題なければ null、あればエラーメッセージ */
function validateLengths(b) {
  if (tooLong(b.name, 100)) return '科目名は100文字以内です';
  if (tooLong(b.code, 30)) return 'コードは30文字以内です';
  if (tooLong(b.note, 300)) return '備考は300文字以内です';
  return null;
}

export async function handler(event) {
  if (event.httpMethod === 'OPTIONS') return noContent();
  const userId = getUserId(event);
  if (!userId) return unauthorized();

  const method = event.httpMethod;
  const id = pathParam(event, 'id');

  // GET /api/accounts
  if (method === 'GET' && !id) {
    const items = await queryByPrefix(userId, 'ACCOUNT#');
    return ok(items.map(strip));
  }

  // POST /api/accounts
  if (method === 'POST') {
    const body = parseBody(event);
    if (!body) return badRequest('Invalid JSON');
    if (!body.name || !body.type) return badRequest('name と type は必須です');

    if (!VALID_TYPES.includes(body.type)) return badRequest('無効な科目区分です');
    const lenErr = validateLengths(body);
    if (lenErr) return badRequest(lenErr);

    const newId = uuid();
    const item = await putItem(userId, SK(newId), {
      id: newId,
      name: body.name,
      type: body.type,
      code: body.code || '',
      note: body.note || '',
      sys: body.sys || 0,
      // CC設定 (負債科目のみ)
      ...(body.type === 'liability' && {
        ccClose: body.ccClose || 0,
        ccDay: body.ccDay || 0,
        ccDelay: body.ccDelay || 1,
        ccFrom: body.ccFrom || '',
      }),
    });

    return created(strip(item));
  }

  // PUT /api/accounts/{id}
  if (method === 'PUT' && id) {
    const existing = await getItem(userId, SK(id));
    if (!existing) return notFound();

    const body = parseBody(event);
    if (!body) return badRequest('Invalid JSON');
    if (body.type !== undefined && !VALID_TYPES.includes(body.type)) return badRequest('無効な科目区分です');
    const lenErr = validateLengths(body);
    if (lenErr) return badRequest(lenErr);

    // ホワイトリストのフィールドのみ更新。sys 等の特権フィールドは既存値を維持
    const patch = {};
    for (const k of EDITABLE_FIELDS) if (body[k] !== undefined) patch[k] = body[k];

    const updated = await putItem(userId, SK(id), {
      ...existing,
      ...patch,
      id,
      sys: existing.sys || 0,
    });

    return ok(strip(updated));
  }

  // DELETE /api/accounts/{id}
  if (method === 'DELETE' && id) {
    const existing = await getItem(userId, SK(id));
    if (!existing) return notFound();
    if (existing.sys) return badRequest('システム科目は削除できません');

    await deleteItem(userId, SK(id));
    return noContent();
  }

  return badRequest('Unsupported operation');
}

function strip(item) {
  const { PK, SK, GSI1SK, updatedAt, ...rest } = item;
  return rest;
}
