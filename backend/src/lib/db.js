import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, PutCommand, DeleteCommand, QueryCommand, BatchWriteCommand } from '@aws-sdk/lib-dynamodb';

const client = new DynamoDBClient({});
const ddb = DynamoDBDocumentClient.from(client, {
  marshallOptions: { removeUndefinedValues: true },
});
const TABLE = process.env.TABLE_NAME;

/** ユーザーPKを生成 */
export const userPK = (userId) => `USER#${userId}`;

/** アイテム1件取得 */
export async function getItem(userId, sk) {
  const { Item } = await ddb.send(new GetCommand({
    TableName: TABLE,
    Key: { PK: userPK(userId), SK: sk },
  }));
  return Item || null;
}

/** アイテム1件保存 (upsert) */
export async function putItem(userId, sk, data, gsi1sk) {
  // クライアント由来のキー(PK/SK/GSI1SK)は信頼しない。サーバー側で権威的に上書きする
  const { PK, SK, GSI1SK, ...safe } = data || {};
  const item = { ...safe, PK: userPK(userId), SK: sk, updatedAt: new Date().toISOString() };
  if (gsi1sk) item.GSI1SK = gsi1sk;
  await ddb.send(new PutCommand({ TableName: TABLE, Item: item }));
  return item;
}

/** 固定PK配下にアイテム1件保存（ユーザー横断でのクエリ用） */
export async function putGroupedItem(pk, sk, data) {
  const { PK, SK, GSI1SK, ...safe } = data || {};
  const item = { ...safe, PK: pk, SK: sk };
  await ddb.send(new PutCommand({ TableName: TABLE, Item: item }));
  return item;
}

/**
 * 楽観的排他つきの1件保存（ENCDATA用）。
 * expectedRev が現在の rev と一致するときだけ書き込み、新しい rev を返す。
 * 一致しなければ ConditionalCheckFailedException が投げられ、書き込みは1件も起きない。
 * `attribute_not_exists(rev)` は移行の継ぎ目＝rev導入前からある既存アイテムを
 * デプロイ後の最初の1回だけ通すためのもの（そこで rev が入り、以降は保護される）。
 */
export async function putItemWithRev(userId, sk, data, expectedRev) {
  const { PK, SK, GSI1SK, rev, ...safe } = data || {};
  const expected = expectedRev || 0;
  const nextRev = expected + 1;
  await ddb.send(new PutCommand({
    TableName: TABLE,
    Item: { ...safe, PK: userPK(userId), SK: sk, rev: nextRev, updatedAt: new Date().toISOString() },
    ConditionExpression: 'attribute_not_exists(SK) OR attribute_not_exists(rev) OR rev = :expected',
    ExpressionAttributeValues: { ':expected': expected },
  }));
  return nextRev;
}

/**
 * コレクションの版番号を取得。マーカー未作成＝rev 0 として扱う。
 * これにより既存データの書き換え（バックフィル）なしで導入できる。
 */
export async function getRev(userId, name) {
  const item = await getItem(userId, `REV#${name}`);
  return item?.rev || 0;
}

/**
 * コレクションの版番号を条件付きで進める。不一致なら ConditionalCheckFailedException。
 * データ書き込みより先に呼ぶこと。逆順にすると2端末が同時に通過できてしまう。
 * （先に進めた場合の失敗は「他端末が不要に409を受けて読み直す」だけで、データは失われない）
 */
export async function bumpRev(userId, name, expectedRev) {
  const expected = expectedRev || 0;
  const nextRev = expected + 1;
  await ddb.send(new PutCommand({
    TableName: TABLE,
    Item: { PK: userPK(userId), SK: `REV#${name}`, rev: nextRev, updatedAt: new Date().toISOString() },
    ConditionExpression: 'attribute_not_exists(SK) OR rev = :expected',
    ExpressionAttributeValues: { ':expected': expected },
  }));
  return nextRev;
}

/** 条件付き書き込みが弾かれたか（＝他端末が先に更新していた） */
export const isRevConflict = (e) => e?.name === 'ConditionalCheckFailedException';

/** アイテム1件削除 */
export async function deleteItem(userId, sk) {
  await ddb.send(new DeleteCommand({
    TableName: TABLE,
    Key: { PK: userPK(userId), SK: sk },
  }));
}

/** SK前方一致でクエリ (例: JOURNAL#) */
export async function queryByPrefix(userId, skPrefix, opts = {}) {
  const params = {
    TableName: TABLE,
    KeyConditionExpression: 'PK = :pk AND begins_with(SK, :prefix)',
    ExpressionAttributeValues: { ':pk': userPK(userId), ':prefix': skPrefix },
  };
  if (opts.limit) params.Limit = opts.limit;
  if (opts.reverse) params.ScanIndexForward = false;

  const items = [];
  let lastKey;
  do {
    if (lastKey) params.ExclusiveStartKey = lastKey;
    const res = await ddb.send(new QueryCommand(params));
    items.push(...(res.Items || []));
    lastKey = res.LastEvaluatedKey;
  } while (lastKey && (!opts.limit || items.length < opts.limit));

  return items;
}

/** ユーザーの全アイテムを取得（アカウント削除時の一括削除用） */
export async function queryAll(userId) {
  const params = {
    TableName: TABLE,
    KeyConditionExpression: 'PK = :pk',
    ExpressionAttributeValues: { ':pk': userPK(userId) },
    ProjectionExpression: 'SK',
  };
  const items = [];
  let lastKey;
  do {
    if (lastKey) params.ExclusiveStartKey = lastKey;
    const res = await ddb.send(new QueryCommand(params));
    items.push(...(res.Items || []));
    lastKey = res.LastEvaluatedKey;
  } while (lastKey);
  return items;
}

/** GSI1で日付範囲クエリ (仕訳の期間検索) */
export async function queryByDateRange(userId, start, end) {
  const params = {
    TableName: TABLE,
    IndexName: 'GSI1',
    KeyConditionExpression: 'PK = :pk AND GSI1SK BETWEEN :s AND :e',
    ExpressionAttributeValues: {
      ':pk': userPK(userId),
      ':s': start,
      ':e': end,
    },
  };

  const items = [];
  let lastKey;
  do {
    if (lastKey) params.ExclusiveStartKey = lastKey;
    const res = await ddb.send(new QueryCommand(params));
    items.push(...(res.Items || []));
    lastKey = res.LastEvaluatedKey;
  } while (lastKey);

  return items;
}

/**
 * BatchWrite を最後までやり切る。
 * BatchWriteItem はスロットリング等で処理しきれなかった分を UnprocessedItems として返し、
 * 例外は投げない。放置すると「消えたつもりで残る」「保存したつもりで欠ける」が起きるため、
 * 残りが無くなるまで再試行し、それでも残ればエラーにする（呼び出し側に失敗を伝える）。
 */
const BATCH_MAX_RETRY = 6;
async function sendBatch(requests) {
  let pending = requests;
  for (let attempt = 0; attempt <= BATCH_MAX_RETRY; attempt++) {
    if (attempt > 0) {
      // 指数バックオフ（100ms, 200ms, 400ms …）。スロットリングは待てば解消する
      await new Promise((r) => setTimeout(r, 100 * 2 ** (attempt - 1)));
    }
    const res = await ddb.send(new BatchWriteCommand({ RequestItems: { [TABLE]: pending } }));
    pending = res.UnprocessedItems?.[TABLE] || [];
    if (!pending.length) return;
  }
  throw new Error(`BatchWrite が完了しませんでした（未処理 ${pending.length} 件）`);
}

/** バッチ書き込み (25件ずつ) */
export async function batchPut(userId, items) {
  for (let i = 0; i < items.length; i += 25) {
    await sendBatch(items.slice(i, i + 25).map((item) => {
      // PK はサーバー側で権威的に決定。クライアント由来の PK を上書きさせない
      const { PK, ...safe } = item;
      return { PutRequest: { Item: { ...safe, PK: userPK(userId), updatedAt: new Date().toISOString() } } };
    }));
  }
}

/** バッチ削除 */
export async function batchDelete(userId, sks) {
  for (let i = 0; i < sks.length; i += 25) {
    await sendBatch(sks.slice(i, i + 25).map((sk) => ({
      DeleteRequest: { Key: { PK: userPK(userId), SK: sk } },
    })));
  }
}
