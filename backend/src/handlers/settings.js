import { v4 as uuid } from 'uuid';
import { CognitoIdentityProviderClient, AdminDeleteUserCommand } from '@aws-sdk/client-cognito-identity-provider';
import { getItem, putItem, putItemWithRev, getRev, bumpRev, isRevConflict, queryByPrefix, queryAll, batchPut, batchDelete } from '../lib/db.js';
import { getUserId, parseBody, ok, created, noContent, badRequest, unauthorized, conflict, serverError, tooLong } from '../middleware/apiHelper.js';

const cognito = new CognitoIdentityProviderClient({});

export async function handler(event) {
  if (event.httpMethod === 'OPTIONS') return noContent();
  const userId = getUserId(event);
  if (!userId) return unauthorized();

  const method = event.httpMethod;
  const path = event.resource;

  // ── Tags ──
  if (path === '/api/tags' && method === 'GET') {
    return ok((await queryByPrefix(userId, 'TAG#')).map(strip));
  }
  if (path === '/api/tags' && method === 'POST') {
    const body = parseBody(event);
    if (!body) return badRequest('Invalid JSON');
    // 一括保存 (配列) or 単体保存
    const tags = Array.isArray(body) ? body : [body];
    for (const t of tags) {
      if (tooLong(t.name, 100)) return badRequest('タグ名は100文字以内です');
      if (tooLong(t.note, 300)) return badRequest('備考は300文字以内です');
    }
    const items = tags.map((t) => ({
      SK: `TAG#${t.id || uuid()}`,
      id: t.id || uuid(),
      name: t.name,
      color: t.color || '#6090d8',
      note: t.note || '',
    }));
    await batchPut(userId, items);
    return created(items.map(strip));
  }

  // ── Wallets ──
  if (path === '/api/wallets' && method === 'GET') {
    return ok((await queryByPrefix(userId, 'WALLET#')).map(strip));
  }
  if (path === '/api/wallets' && method === 'POST') {
    const body = parseBody(event);
    if (!body) return badRequest('Invalid JSON');
    const wallets = Array.isArray(body) ? body : [body];
    for (const w of wallets) {
      if (tooLong(w.name, 100)) return badRequest('口座名は100文字以内です');
      if (tooLong(w.defaultTagName, 50)) return badRequest('デフォルトタグ名は50文字以内です');
      if (tooLong(w.note, 300)) return badRequest('備考は300文字以内です');
    }
    const items = wallets.map((w) => ({
      SK: `WALLET#${w.id || uuid()}`,
      id: w.id || uuid(),
      name: w.name,
      accountId: w.accountId,
      defaultTagName: w.defaultTagName || '',
      defaultTagColor: w.defaultTagColor || '#888',
      note: w.note || '',
    }));
    await batchPut(userId, items);
    return created(items.map(strip));
  }

  // ── Budgets ──
  if (path === '/api/budgets' && method === 'GET') {
    const items = (await queryByPrefix(userId, 'BUDGET#')).map(strip);
    return ok({ items, rev: await getRev(userId, 'BUDGET') });
  }
  if (path === '/api/budgets' && method === 'POST') {
    const body = parseBody(event);
    if (!body) return badRequest('Invalid JSON');
    const { list, rev } = parseCollection(body);
    const items = list.filter((b) => b.amount > 0).map((b) => ({
      SK: `BUDGET#${b.accountId}`,
      accountId: b.accountId,
      amount: b.amount,
    }));
    const nextRev = await guardedReplace(userId, 'BUDGET', 'BUDGET#', items, rev);
    if (nextRev === false) return conflict({ rev: await getRev(userId, 'BUDGET') });
    return created({ items: items.map(strip), rev: nextRev });
  }

  // ── Recurring（定期取引: 全置換保存。削除・編集・nextDate更新を反映） ──
  if (path === '/api/recurring' && method === 'GET') {
    const items = (await queryByPrefix(userId, 'RECURRING#')).map(strip);
    return ok({ items, rev: await getRev(userId, 'RECURRING') });
  }
  if (path === '/api/recurring' && method === 'POST') {
    const body = parseBody(event);
    if (!body) return badRequest('Invalid JSON');
    const { list, rev } = parseCollection(body);
    for (const r of list) {
      if (tooLong(r.name, 100)) return badRequest('名前は100文字以内です');
      if (tooLong(r.desc, 200)) return badRequest('摘要は200文字以内です');
    }
    const items = list.map((r) => ({
      SK: `RECURRING#${r.id || uuid()}`,
      id: r.id || uuid(),
      name: r.name,
      frequency: r.frequency,
      day: r.day,
      nextDate: r.nextDate,
      desc: r.desc || '',
      lines: r.lines || [],
    }));
    const nextRev = await guardedReplace(userId, 'RECURRING', 'RECURRING#', items, rev);
    if (nextRev === false) return conflict({ rev: await getRev(userId, 'RECURRING') });
    return created({ items: items.map(strip), rev: nextRev });
  }

  // ── Presets（プリセット: 全置換保存。削除・編集を反映） ──
  if (path === '/api/presets' && method === 'GET') {
    const items = (await queryByPrefix(userId, 'PRESET#')).map(strip);
    return ok({ items, rev: await getRev(userId, 'PRESET') });
  }
  if (path === '/api/presets' && method === 'POST') {
    const body = parseBody(event);
    if (!body) return badRequest('Invalid JSON');
    const { list, rev } = parseCollection(body);
    for (const p of list) {
      if (tooLong(p.name, 100)) return badRequest('名前は100文字以内です');
      if (tooLong(p.desc, 200)) return badRequest('摘要は200文字以内です');
    }
    const items = list.map((p) => ({
      SK: `PRESET#${p.id || uuid()}`,
      id: p.id || uuid(),
      walletId: p.walletId || '',
      type: p.type || 'out',
      name: p.name,
      desc: p.desc || '',
      lines: p.lines || [],
    }));
    const nextRev = await guardedReplace(userId, 'PRESET', 'PRESET#', items, rev);
    if (nextRev === false) return conflict({ rev: await getRev(userId, 'PRESET') });
    return created({ items: items.map(strip), rev: nextRev });
  }

  // ── Rules（自動仕訳ルール: 全置換保存。削除・編集を反映） ──
  if (path === '/api/rules' && method === 'GET') {
    const items = (await queryByPrefix(userId, 'RULE#')).map(strip);
    return ok({ items, rev: await getRev(userId, 'RULE') });
  }
  if (path === '/api/rules' && method === 'POST') {
    const body = parseBody(event);
    if (!body) return badRequest('Invalid JSON');
    const { list, rev } = parseCollection(body);
    for (const r of list) {
      if (tooLong(r.keyword, 100)) return badRequest('キーワードは100文字以内です');
    }
    const items = list.map((r) => ({
      SK: `RULE#${r.id || uuid()}`,
      id: r.id || uuid(),
      keyword: r.keyword,
      drAccountId: r.drAccountId || '',
      crAccountId: r.crAccountId || '',
      tagId: r.tagId || '',
    }));
    const nextRev = await guardedReplace(userId, 'RULE', 'RULE#', items, rev);
    if (nextRev === false) return conflict({ rev: await getRev(userId, 'RULE') });
    return created({ items: items.map(strip), rev: nextRev });
  }

  // ── E2E暗号化データ（方式A: データセット全体を1ブロブで保管。鍵バンドルは平文鍵を含まない） ──
  if (path === '/api/encdata' && method === 'GET') {
    const item = await getItem(userId, 'ENCDATA');
    return ok(item
      ? { bundle: item.bundle || null, ct: item.ct || null, rev: item.rev || 0 }
      : { bundle: null, ct: null, rev: 0 });
  }
  if (path === '/api/encdata' && method === 'POST') {
    const body = parseBody(event);
    if (!body) return badRequest('Invalid JSON');
    const payload = { bundle: body.bundle || null, ct: body.ct || null };
    let rev = null;
    // rev 未指定 = rev 導入前のクライアント（開いたままのタブ）。従来どおり無条件で受ける。
    // ここで拒否すると、リロードするまで保存できなくなる。全員が新版になったら必須化する。
    if (body.rev === undefined) {
      await putItem(userId, 'ENCDATA', payload);
    } else {
      try {
        rev = await putItemWithRev(userId, 'ENCDATA', payload, body.rev);
      } catch (e) {
        if (!isRevConflict(e)) throw e;
        // 他端末が先に保存していた。書き込みは1件も起きていない。
        // E2Eなのでサーバーは中身を統合できず、突き合わせはクライアントで行う。
        const cur = await getItem(userId, 'ENCDATA');
        return conflict({ bundle: cur?.bundle || null, ct: cur?.ct || null, rev: cur?.rev || 0 });
      }
    }
    // 有効化時: サーバー上の平文データ(per-type items)を削除し、暗号文だけ残す（PROFILE/ENCDATA/REV#は保持）。
    // 中身のある暗号文が保存できたときだけ消す。空のまま消すと平文だけが失われる。
    if (body.clearPlaintext && payload.ct) {
      const all = await queryAll(userId);
      const toDel = all.map((x) => x.SK)
        .filter((sk) => sk !== 'PROFILE' && sk !== 'ENCDATA' && !sk.startsWith('REV#'));
      if (toDel.length) await batchDelete(userId, toDel);
    }
    return created({ ok: true, rev });
  }

  // ── Export (全データ一括取得) ──
  if (path === '/api/export' && method === 'GET') {
    const [accounts, journals, tags, wallets, budgets, presets, recurring, rules, allocs,
      revBudget, revPreset, revRecurring, revRule] = await Promise.all([
      queryByPrefix(userId, 'ACCOUNT#'),
      queryByPrefix(userId, 'JOURNAL#'),
      queryByPrefix(userId, 'TAG#'),
      queryByPrefix(userId, 'WALLET#'),
      queryByPrefix(userId, 'BUDGET#'),
      queryByPrefix(userId, 'PRESET#'),
      queryByPrefix(userId, 'RECURRING#'),
      queryByPrefix(userId, 'RULE#'),
      queryByPrefix(userId, 'ALLOC#'),
      getRev(userId, 'BUDGET'),
      getRev(userId, 'PRESET'),
      getRev(userId, 'RECURRING'),
      getRev(userId, 'RULE'),
    ]);
    return ok({
      accounts: accounts.map(strip),
      journals: journals.map(strip),
      tags: tags.map(strip),
      wallets: wallets.map(strip),
      budgets: budgets.map(strip),
      presets: presets.map(strip),
      recurring: recurring.map(strip),
      rules: rules.map(strip),
      allocs: allocs.map(strip),
      // 楽観的排他用の版番号。初期ロードで受け取るためここに載せる。
      // ユーザーがダウンロードするバックアップJSONには含めない（クライアント側で除去する）。
      revs: { budgets: revBudget, presets: revPreset, recurring: revRecurring, rules: revRule },
      exportedAt: new Date().toISOString(),
    });
  }

  // ── Import (全データ一括復元) ──
  if (path === '/api/import' && method === 'POST') {
    const body = parseBody(event);
    if (!body || !body.accounts) return badRequest('Invalid import data');

    const items = [];
    // クライアント由来のキー(SK/PK/GSI1SK)は破棄し、サーバー側で権威的に付与する
    const clean = (r) => { const { SK, PK, GSI1SK, ...rest } = r; return rest; };
    const map = (arr, prefix, idField = 'id') =>
      (arr || []).forEach((r) => { if (r?.[idField]) items.push({ ...clean(r), SK: `${prefix}${r[idField]}` }); });

    map(body.accounts, 'ACCOUNT#');
    map(body.tags, 'TAG#');
    map(body.wallets, 'WALLET#');
    map(body.presets, 'PRESET#');
    map(body.recurring, 'RECURRING#');
    map(body.rules, 'RULE#');
    (body.journals || []).forEach((j) => {
      if (j?.id) items.push({ ...clean(j), SK: `JOURNAL#${j.id}`, GSI1SK: j.date });
    });
    (body.budgets || []).forEach((b) => {
      if (b?.accountId) items.push({ ...clean(b), SK: `BUDGET#${b.accountId}` });
    });
    (body.allocs || []).forEach((a) => {
      if (a?.accountId && a?.tagId) items.push({ ...clean(a), SK: `ALLOC#${a.accountId}#${a.tagId}` });
    });

    // 過大なペイロードによる DoS / コスト増を防ぐ上限
    const MAX_IMPORT_ITEMS = 10000;
    if (items.length > MAX_IMPORT_ITEMS) {
      return badRequest(`インポート件数が上限(${MAX_IMPORT_ITEMS}件)を超えています`);
    }

    await batchPut(userId, items);
    return created({ imported: items.length });
  }

  // ── アカウント削除（全データ削除 + Cognitoユーザー削除）──
  if (path === '/api/account' && method === 'DELETE') {
    // 任意の退会理由。家計データではない自由記述のみ＝CloudWatch Logsに残すだけで外部送信はしない。
    // データ削除前に記録する（削除後はユーザーに紐づく情報が残らないため）。
    const body = parseBody(event);
    if (body?.reason && typeof body.reason === 'string' && body.reason.trim()) {
      console.log('ACCOUNT_DELETE_REASON', JSON.stringify({ reason: body.reason.trim().slice(0, 500) }));
    }

    // 1. このユーザーの DynamoDB 全アイテムを削除
    const all = await queryAll(userId);
    if (all.length) await batchDelete(userId, all.map((i) => i.SK));

    // 1-2. 本当に消えたかを確認する。ここを飛ばすと、削除が一部失敗したまま
    // Cognito だけ消えて「本人はログインできないのに家計データは残る」状態になる。
    // 残っている場合は Cognito を消さずにエラーを返し、本人が再実行できるようにする。
    const remaining = await queryAll(userId);
    if (remaining.length) {
      console.error('ACCOUNT_DELETE_INCOMPLETE', JSON.stringify({ remaining: remaining.length }));
      return serverError('データの削除が完了しませんでした。お手数ですが、時間をおいて再度お試しください。');
    }

    // 2. Cognito ユーザー本体を削除（SRP/Google 両対応で AdminDeleteUser を使用）
    const username = event.requestContext?.authorizer?.claims?.['cognito:username'];
    if (username && process.env.USER_POOL_ID) {
      await cognito.send(new AdminDeleteUserCommand({
        UserPoolId: process.env.USER_POOL_ID,
        Username: username,
      }));
    }
    return noContent();
  }

  return badRequest('Unsupported operation');
}

function strip(item) {
  const { PK, SK, GSI1SK, updatedAt, ...rest } = item;
  return rest;
}

/**
 * コレクションの入れ替え。先に put し、送られてこなかった分だけ後から delete する。
 * 逆順（全削除→全挿入）にすると、その間で失敗したときに何も残らない
 * （BatchWrite にトランザクションは無く、確定した削除は巻き戻らない）。
 * この順序なら、途中で落ちても古いアイテムが残るだけで済む。
 * 変更のないアイテムを消して入れ直す無駄も無くなる。
 */
async function replaceCollection(userId, existing, items) {
  if (items.length) await batchPut(userId, items);
  const keep = new Set(items.map((i) => i.SK));
  const toDel = existing.map((e) => e.SK).filter((sk) => !keep.has(sk));
  if (toDel.length) await batchDelete(userId, toDel);
}

/**
 * body から一覧と rev を取り出す。
 * 配列を直接送ってくるのは rev 導入前のクライアント（rev は undefined になる）。
 */
function parseCollection(body) {
  if (Array.isArray(body)) return { list: body, rev: undefined };
  if (Array.isArray(body?.items)) return { list: body.items, rev: body.rev };
  return { list: [body], rev: undefined };
}

/**
 * 版番号を確認してからコレクションを入れ替える。
 * rev 未指定（rev 導入前のクライアント）は従来どおり無条件で受ける。
 * 他端末が先に更新していたら false を返す（呼び出し元が 409 を返す）。
 * rev はデータ書き込みより先に進める。逆順にすると2端末が同時に通過できてしまう。
 */
async function guardedReplace(userId, name, prefix, items, rev) {
  let nextRev = null;
  if (rev !== undefined) {
    try { nextRev = await bumpRev(userId, name, rev); }
    catch (e) { if (isRevConflict(e)) return false; throw e; }
  }
  const existing = await queryByPrefix(userId, prefix);
  await replaceCollection(userId, existing, items);
  return nextRev;
}
