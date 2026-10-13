// 家計データとは別に持つ、運営用の記録のテーブル（template.yaml の InquiryTable・FeedbackTable・DeleteReasonTable）。
//
// 家計データのテーブル（db.js）は「利用者ごとに丸ごと消せる」ことが前提。退会しても残す記録は、
// 同じテーブルに置くと消し漏れ・消し過ぎの両方が起きるので分ける。
//   問い合わせ: PK=USER#<sub>／退会後は PK=DELETED（sub を外して残す）。SK=INQUIRY#<id>
//   ご意見:     PK=FEEDBACK。SK=FEEDBACK#<ISO日時>#<uuid>（匿名）
//   退会理由:   PK=REASON。SK=REASON#<ISO日時>#<uuid>（誰の退会かは持たない）
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, DeleteCommand, GetCommand, PutCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}), {
  marshallOptions: { removeUndefinedValues: true },
});

export const INQUIRY_TABLE = process.env.INQUIRY_TABLE;
export const FEEDBACK_TABLE = process.env.FEEDBACK_TABLE;
export const DELETE_REASON_TABLE = process.env.DELETE_REASON_TABLE;

export async function opsGet(table, pk, sk) {
  const { Item } = await ddb.send(new GetCommand({ TableName: table, Key: { PK: pk, SK: sk } }));
  return Item || null;
}

export async function opsPut(table, item) {
  await ddb.send(new PutCommand({ TableName: table, Item: item }));
  return item;
}

export async function opsDelete(table, pk, sk) {
  await ddb.send(new DeleteCommand({ TableName: table, Key: { PK: pk, SK: sk } }));
}

/** PK 配下で SK が prefix から始まるものを全部（ページングを辿る） */
export async function opsQuery(table, pk, prefix) {
  const out = [];
  let start;
  do {
    const r = await ddb.send(new QueryCommand({
      TableName: table,
      KeyConditionExpression: 'PK = :pk AND begins_with(SK, :p)',
      ExpressionAttributeValues: { ':pk': pk, ':p': prefix },
      ExclusiveStartKey: start,
    }));
    out.push(...(r.Items || []));
    start = r.LastEvaluatedKey;
  } while (start);
  return out;
}
