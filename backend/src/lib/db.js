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

/** バッチ書き込み (25件ずつ) */
export async function batchPut(userId, items) {
  const chunks = [];
  for (let i = 0; i < items.length; i += 25) {
    chunks.push(items.slice(i, i + 25));
  }
  for (const chunk of chunks) {
    await ddb.send(new BatchWriteCommand({
      RequestItems: {
        [TABLE]: chunk.map((item) => {
          // PK はサーバー側で権威的に決定。クライアント由来の PK を上書きさせない
          const { PK, ...safe } = item;
          return { PutRequest: { Item: { ...safe, PK: userPK(userId), updatedAt: new Date().toISOString() } } };
        }),
      },
    }));
  }
}

/** バッチ削除 */
export async function batchDelete(userId, sks) {
  const chunks = [];
  for (let i = 0; i < sks.length; i += 25) {
    chunks.push(sks.slice(i, i + 25));
  }
  for (const chunk of chunks) {
    await ddb.send(new BatchWriteCommand({
      RequestItems: {
        [TABLE]: chunk.map((sk) => ({
          DeleteRequest: { Key: { PK: userPK(userId), SK: sk } },
        })),
      },
    }));
  }
}
