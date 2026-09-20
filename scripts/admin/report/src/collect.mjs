// AWS から生データを読む（読み取りのみ）。集計の判断は metrics.mjs、文面は format.mjs に置く。
// Lambda の Node.js ランタイムに AWS SDK v3 が同梱されているので、依存パッケージは持たない。

import { gunzipSync } from 'node:zlib';
import { S3Client, ListObjectsV2Command, GetObjectCommand } from '@aws-sdk/client-s3';
import { CognitoIdentityProviderClient, ListUsersCommand, DescribeUserPoolCommand } from '@aws-sdk/client-cognito-identity-provider';
import { SESv2Client, GetAccountCommand } from '@aws-sdk/client-sesv2';
import { CloudWatchLogsClient, FilterLogEventsCommand } from '@aws-sdk/client-cloudwatch-logs';
import { CloudWatchClient, GetMetricDataCommand } from '@aws-sdk/client-cloudwatch';
import { DynamoDBClient, QueryCommand, ScanCommand } from '@aws-sdk/client-dynamodb';
import { SSMClient, GetParameterCommand, PutParameterCommand } from '@aws-sdk/client-ssm';
import { signalQueries, signalsOf, cspStateOf } from './metrics.mjs';

const env = (k, d) => process.env[k] || d;
// 値はダッシュボード（scripts/admin/server.mjs）と同じ本番リソース
export const CONFIG = {
  logBucket: env('LOG_BUCKET', 'kakeibo-cf-logs-117953360790'),
  logPrefix: env('LOG_PREFIX', 'app/'),                 // app.kurofukubo.com のCloudFrontログ
  distributionId: env('DISTRIBUTION_ID', 'E32HZNCIT2MXUM'), // ファイル名: app/<distId>.YYYY-MM-DD-HH.hash.gz（UTC）
  userPoolId: env('USER_POOL_ID', 'ap-northeast-1_ddBDF3HKK'),
  table: env('TABLE_NAME', 'kakeibo-prod'),
  cleanupLogGroup: env('CLEANUP_LOG_GROUP', '/aws/lambda/kakeibo-saas-prod-CleanupUnconfirmedFunction-GvWvO3WXvqhh'),
  apiName: env('API_NAME', 'kakeibo-saas-prod'),
  appUrl: env('APP_URL', 'https://app.kurofukubo.com/'),
  webhookParam: env('WEBHOOK_PARAM', '/kakeibo/prod/discord-webhook-url'),
  // 問い合わせ・ご意見はそれぞれ別のチャンネル（別の Webhook）へ送る
  webhookParamInquiry: env('WEBHOOK_PARAM_INQUIRY', '/kakeibo/prod/discord-webhook-url-inquiry'),
  webhookParamFeedback: env('WEBHOOK_PARAM_FEEDBACK', '/kakeibo/prod/discord-webhook-url-feedback'),
  // どこまで送ったか（SSM の String パラメータ。初回は Lambda が作る）
  cursorParam: env('CURSOR_PARAM', '/kakeibo/prod/discord-watch-cursor'),
};

const region = env('AWS_REGION', 'ap-northeast-1');
const s3 = new S3Client({ region });
const cognito = new CognitoIdentityProviderClient({ region });
const ses = new SESv2Client({ region });
const logs = new CloudWatchLogsClient({ region });
const cw = new CloudWatchClient({ region });
const ddb = new DynamoDBClient({ region });
const ssm = new SSMClient({ region });

/** 指定したUTC日のアクセスログを全部読み、展開した本文の配列を返す */
export async function readLogs(utcDates) {
  const keys = [];
  for (const d of utcDates) {
    let token;
    do {
      const page = await s3.send(new ListObjectsV2Command({
        Bucket: CONFIG.logBucket, Prefix: `${CONFIG.logPrefix}${CONFIG.distributionId}.${d}-`, ContinuationToken: token,
      }));
      for (const o of page.Contents || []) keys.push(o.Key);
      token = page.IsTruncated ? page.NextContinuationToken : undefined;
    } while (token);
  }
  // 1件も無いのは「アクセスが無い」ではなく設定の食い違い（配信IDの変更など）。0と誤読しないよう失敗扱いにする
  if (!keys.length) throw new Error('アクセスログが1件も見つかりません（バケット・配信IDを確認）');

  const texts = [];
  let i = 0;
  const worker = async () => {
    while (i < keys.length) {
      const key = keys[i++];
      const obj = await s3.send(new GetObjectCommand({ Bucket: CONFIG.logBucket, Key: key }));
      texts.push(gunzipSync(await obj.Body.transformToByteArray()).toString('utf8'));
    }
  };
  await Promise.all(Array.from({ length: 16 }, worker));
  return texts;
}

/**
 * 登録ユーザー。AttributesToGet: sub でメール等の属性は Cognito 側で除外される＝PIIは受け取らない。
 * @returns {Promise<Array<[status: string, createdIso: string, username: string]>>}
 */
export async function listUsers() {
  const out = [];
  let token;
  do {
    const page = await cognito.send(new ListUsersCommand({
      UserPoolId: CONFIG.userPoolId, AttributesToGet: ['sub'], Limit: 60, PaginationToken: token,
    }));
    for (const u of page.Users || []) out.push([u.UserStatus, new Date(u.UserCreateDate).toISOString(), u.Username]);
    token = page.PaginationToken;
  } while (token);
  return out;
}

export async function getEmailConfiguration() {
  const r = await cognito.send(new DescribeUserPoolCommand({ UserPoolId: CONFIG.userPoolId }));
  return r.UserPool?.EmailConfiguration ?? null;
}

export async function getSesProduction() {
  const r = await ses.send(new GetAccountCommand({}));
  return r.ProductionAccessEnabled ?? null;
}

/** 掃除ジョブの直近3日の最終実行(ms)。実行が無ければ null */
export async function getCleanupLastTs(now) {
  let last = null;
  let token;
  do {
    const page = await logs.send(new FilterLogEventsCommand({
      logGroupName: CONFIG.cleanupLogGroup, filterPattern: 'CLEANUP_UNCONFIRMED',
      startTime: now - 3 * 86400000, nextToken: token,
    }));
    for (const e of page.events || []) last = Math.max(last ?? 0, e.timestamp);
    token = page.nextToken;
  } while (token);
  return last;
}

export async function getSignals(now) {
  const r = await cw.send(new GetMetricDataCommand({
    StartTime: new Date(now - 86400000), EndTime: new Date(now),
    MetricDataQueries: signalQueries(CONFIG.apiName, CONFIG.table),
  }));
  const v = {};
  for (const m of r.MetricDataResults || []) v[m.Id] = m.Values?.[0] ?? 0;
  return signalsOf(v);
}

/** 本番が実際に返しているヘッダーを見る。設定ではなく配信結果を確認する */
export async function getLiveHeaders() {
  const r = await fetch(CONFIG.appUrl, { method: 'HEAD' });
  return { csp: cspStateOf(r.headers.get('content-security-policy'), r.headers.get('content-security-policy-report-only')) };
}

/** [from, to) に届いたご意見の件数。SK が FEEDBACK#<ISO日時>#<uuid> なのでキー条件だけで数えられ、本文は読まない */
export async function countFeedback(from, to) {
  let n = 0;
  let start;
  do {
    const page = await ddb.send(new QueryCommand({
      TableName: CONFIG.table,
      KeyConditionExpression: 'PK = :pk AND SK BETWEEN :a AND :b',
      ExpressionAttributeValues: {
        ':pk': { S: 'FEEDBACK' },
        ':a': { S: `FEEDBACK#${new Date(from).toISOString()}` },
        ':b': { S: `FEEDBACK#${new Date(to).toISOString()}` },
      },
      Select: 'SPECIFIC_ATTRIBUTES', ProjectionExpression: 'PK',
      ExclusiveStartKey: start,
    }));
    n += page.Items?.length || 0;
    start = page.LastEvaluatedKey;
  } while (start);
  return n;
}

/**
 * 問い合わせスレッドの状態と最後の発言者。USER#<sub> 配下に散っているので scan で拾う。
 * 読む項目は status と messages だけ（IAM でもこの項目以外は読めないよう絞っている）。
 */
export async function listInquiries() {
  const out = [];
  let start;
  do {
    const page = await ddb.send(new ScanCommand({
      TableName: CONFIG.table,
      FilterExpression: 'begins_with(SK, :p)',
      ExpressionAttributeValues: { ':p': { S: 'INQUIRY#' } },
      ExpressionAttributeNames: { '#st': 'status' },
      Select: 'SPECIFIC_ATTRIBUTES', ProjectionExpression: '#st, messages',
      ExclusiveStartKey: start,
    }));
    for (const i of page.Items || []) {
      // from が無い発言はユーザー発言として扱う（ダッシュボードの getInquiries と同じ）
      const last = i.messages?.L?.at(-1);
      out.push({ status: i.status?.S || 'open', lastFrom: last ? (last.M?.from?.S || 'user') : null });
    }
    start = page.LastEvaluatedKey;
  } while (start);
  return out;
}

export async function getWebhookUrl(name = CONFIG.webhookParam) {
  const r = await ssm.send(new GetParameterCommand({ Name: name, WithDecryption: true }));
  return r.Parameter.Value;
}

/** どこまで送ったか。未作成なら null（初回は「これ以降の新着だけ送る」ために現在時刻で作る） */
export async function getCursor() {
  try {
    const r = await ssm.send(new GetParameterCommand({ Name: CONFIG.cursorParam }));
    return JSON.parse(r.Parameter.Value);
  } catch (e) {
    if (e.name === 'ParameterNotFound') return null;
    throw e;
  }
}

export async function putCursor(cursor) {
  await ssm.send(new PutParameterCommand({
    Name: CONFIG.cursorParam, Type: 'String', Overwrite: true, Value: JSON.stringify(cursor),
  }));
}

/** since より後に届いたご意見（本文つき・古い順）。SK が FEEDBACK#<ISO日時>#<uuid> なので時刻で切れる */
export async function listFeedbackSince(since) {
  const out = [];
  let start;
  do {
    const page = await ddb.send(new QueryCommand({
      TableName: CONFIG.table,
      KeyConditionExpression: 'PK = :pk AND SK > :a',
      ExpressionAttributeValues: { ':pk': { S: 'FEEDBACK' }, ':a': { S: `FEEDBACK#${since}` } },
      ExpressionAttributeNames: { '#ts': 'timestamp' },
      Select: 'SPECIFIC_ATTRIBUTES', ProjectionExpression: 'SK, #ts, body',
      ExclusiveStartKey: start,
    }));
    for (const i of page.Items || []) {
      out.push({ sk: i.SK?.S || '', timestamp: i.timestamp?.S || '', body: i.body?.S || '' });
    }
    start = page.LastEvaluatedKey;
  } while (start);
  return out.sort((a, b) => a.sk.localeCompare(b.sk));
}

/** since より後に動きのあった問い合わせスレッド（古い順）。最後の発言だけを持って帰る */
export async function listInquiriesSince(since) {
  const out = [];
  let start;
  do {
    const page = await ddb.send(new ScanCommand({
      TableName: CONFIG.table,
      FilterExpression: 'begins_with(SK, :p) AND updatedAt > :since',
      ExpressionAttributeValues: { ':p': { S: 'INQUIRY#' }, ':since': { S: since } },
      ExpressionAttributeNames: { '#st': 'status' },
      Select: 'SPECIFIC_ATTRIBUTES', ProjectionExpression: 'PK, subject, #st, updatedAt, createdAt, messages',
      ExclusiveStartKey: start,
    }));
    for (const i of page.Items || []) {
      const msgs = i.messages?.L || [];
      const last = msgs.at(-1);
      out.push({
        // 誰からかを画面と突き合わせられるよう、ダッシュボードと同じく sub の先頭8桁だけ持つ
        sub: (i.PK?.S || '').replace('USER#', '').slice(0, 8),
        subject: i.subject?.S || '',
        status: i.status?.S || 'open',
        updatedAt: i.updatedAt?.S || '',
        isNew: msgs.length <= 1,
        lastFrom: last ? (last.M?.from?.S || 'user') : null,
        lastBody: last?.M?.body?.S || '',
      });
    }
    start = page.LastEvaluatedKey;
  } while (start);
  return out.sort((a, b) => a.updatedAt.localeCompare(b.updatedAt));
}
