// 画面が AWS を読むための土台。SDK は report/node_modules のものを使う（Lambda の配布物には入れない）。
// 読み取りの大半は report/src/collect.mjs（Discord 定時レポートと同じ関数）を使い、ここには
// それに無いもの（Logs Insights・ログの同期・本文つきの問い合わせ・返信）の部品だけを置く。

import { createRequire } from 'node:module';

export const PROFILE = process.env.AWS_PROFILE || 'kakeibo-prod';
export const REGION = 'ap-northeast-1';
// SDK を読み込む前に設定する（認証情報の解決がこの値を見る）
process.env.AWS_PROFILE = PROFILE;
process.env.AWS_REGION ||= REGION;

export const LOGIN_HINT = `AWS認証が切れています。ターミナルで実行してください:\n  aws sso login --profile ${PROFILE}`;
export const INSTALL_HINT = 'SDK が見つかりません。ターミナルで実行してください:\n  cd scripts/admin/report && npm install';

const req = createRequire(new URL('../report/package.json', import.meta.url));
const load = (name) => {
  try { return req(name); } catch (e) {
    if (e.code === 'MODULE_NOT_FOUND') throw new Error(INSTALL_HINT);
    throw e;
  }
};

const s3sdk = load('@aws-sdk/client-s3');
const logssdk = load('@aws-sdk/client-cloudwatch-logs');
const ddbsdk = load('@aws-sdk/client-dynamodb');

export const s3 = new s3sdk.S3Client({ region: REGION });
export const logs = new logssdk.CloudWatchLogsClient({ region: REGION });
export const ddb = new ddbsdk.DynamoDBClient({ region: REGION });
export const cmd = { ...s3sdk, ...logssdk, ...ddbsdk };

/** 認証切れかどうか。SSO のトークン切れは名前・メッセージの出方がいくつかある */
export const isAuthError = (e) => /token|expired|sso|credential|Unable to locate|not authorized to perform: sts/i
  .test(`${e?.name || ''} ${e?.message || ''}`) && !/AccessDenied/i.test(e?.name || '');

/** 利用者に見せる形のエラーにする。認証切れは次に打つコマンドを添える */
export function friendly(e, what) {
  if (isAuthError(e)) return new Error(LOGIN_HINT);
  if (e?.message === INSTALL_HINT) return e;
  return new Error(`${what}に失敗しました:\n${String(e?.message || e).slice(0, 500)}`);
}

/** 認証が生きているか。起動時と /api/health で使う */
export async function checkAuth() {
  try {
    // 読み取りの中でいちばん軽いもの。認証が無ければここで落ちる
    await logs.send(new cmd.DescribeLogGroupsCommand({ logGroupNamePrefix: '/aws/apigateway/', limit: 1 }));
    return { ok: true };
  } catch (e) {
    return { ok: false, message: isAuthError(e) ? LOGIN_HINT : String(e?.message || e).slice(0, 300) };
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Logs Insights を実行して結果の行（{項目: 値}）を返す。
 * Insights はサーバー側で絞り込むので、ページごとに読むより桁違いに速い。
 */
export async function insights({ groups, query, startMs, endMs, limit = 10000, what }) {
  try {
    const { queryId } = await logs.send(new cmd.StartQueryCommand({
      logGroupNames: groups, queryString: query, limit,
      startTime: Math.floor(startMs / 1000), endTime: Math.floor(endMs / 1000),
    }));
    for (let i = 0; i < 200; i++) { // 0.3秒間隔で最大60秒
      const r = await logs.send(new cmd.GetQueryResultsCommand({ queryId }));
      if (r.status === 'Complete') {
        return (r.results || []).map((fields) => Object.fromEntries(fields.map((f) => [f.field, f.value])));
      }
      if (r.status !== 'Running' && r.status !== 'Scheduled') throw new Error(`状態が ${r.status} になりました`);
      await sleep(300);
    }
    throw new Error('終わりません');
  } catch (e) { throw friendly(e, what); }
}
