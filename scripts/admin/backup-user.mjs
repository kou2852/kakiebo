// 1ユーザーぶんの帳簿を DynamoDB から吸い出す／書き戻す。
//
// 使い方:
//   node scripts/admin/backup-user.mjs dump    <sub> <出力ファイル>
//   node scripts/admin/backup-user.mjs restore <sub> <入力ファイル>
//
// ⚠ **PK は必ず `USER#<sub>` に固定する。** 他のユーザーの領域には構造上触れない。
//    Scan は使わない（全ユーザーが取れてしまう）。key-condition-expression の
//    Query だけを使う。
//
// ⚠ restore は「入っているものを put する」だけで、余分なものを消さない。
//    テストで増えた分を消したいときは、消す対象の SK を明示して delete すること。
//    まとめて消す機能はここに置かない（事故が重すぎる）。
//
// ⚠ 出力には家計データの中身が入る。リポジトリに置かず、作業用の一時領域へ書くこと。
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';

const TABLE = 'kakeibo-prod';
const PROFILE = 'kakeibo-prod';
const REGION = 'ap-northeast-1';

const [, , mode, sub, file] = process.argv;
if (!['dump', 'restore', 'purge'].includes(mode) || !sub || (mode !== 'purge' && !file)) {
  console.error('usage: backup-user.mjs dump|restore <sub> <file> / purge <sub>');
  process.exit(2);
}
if (!/^[0-9a-f-]{20,}$/i.test(sub)) {
  console.error('sub の形が不正です。取り違えを防ぐため中断します。');
  process.exit(2);
}

const aws = (args) => execFileSync('aws', [...args, '--profile', PROFILE, '--region', REGION],
  { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, env: { ...process.env, PYTHONUTF8: '1' } });

const PK = `USER#${sub}`;

if (mode === 'dump') {
  const items = [];
  let start = null;
  do {
    const args = ['dynamodb', 'query', '--table-name', TABLE,
      '--key-condition-expression', 'PK = :pk',
      '--expression-attribute-values', JSON.stringify({ ':pk': { S: PK } }),
      '--output', 'json'];
    if (start) args.push('--exclusive-start-key', JSON.stringify(start));
    const r = JSON.parse(aws(args));
    items.push(...(r.Items || []));
    start = r.LastEvaluatedKey || null;
  } while (start);

  // 取り違え防止。1件でも別ユーザーが混ざっていたら書かない。
  const bad = items.filter((i) => i.PK?.S !== PK);
  if (bad.length) {
    console.error(`別ユーザーの項目が ${bad.length} 件混ざっています。書き出しを中断します。`);
    process.exit(1);
  }

  fs.writeFileSync(file, JSON.stringify({ table: TABLE, pk: PK, at: new Date().toISOString(), items }, null, 2));
  const kinds = {};
  for (const i of items) { const k = (i.SK?.S || '').split('#')[0]; kinds[k] = (kinds[k] || 0) + 1; }
  console.log(`${items.length} 件を ${file} に保存`);
  console.log(Object.entries(kinds).map(([k, v]) => `${k}=${v}`).join(' '));
} else if (mode === 'purge') {
  // ⚠ テスト用の捨てアカウントを空に戻すためだけの機能。
  //   PK を固定した Query の結果しか消さないので、他ユーザーには構造上到達しない。
  //   実ユーザーに対しては絶対に使わないこと。
  const keys = [];
  let start = null;
  do {
    const args = ['dynamodb', 'query', '--table-name', TABLE,
      '--key-condition-expression', 'PK = :pk',
      '--expression-attribute-values', JSON.stringify({ ':pk': { S: PK } }),
      '--projection-expression', 'PK,SK', '--output', 'json'];
    if (start) args.push('--exclusive-start-key', JSON.stringify(start));
    const r = JSON.parse(aws(args));
    keys.push(...(r.Items || []));
    start = r.LastEvaluatedKey || null;
  } while (start);
  if (keys.some((k) => k.PK?.S !== PK)) { console.error('別ユーザーが混ざっています。中断します。'); process.exit(1); }
  for (let i = 0; i < keys.length; i += 25) {
    const chunk = keys.slice(i, i + 25);
    aws(['dynamodb', 'batch-write-item', '--request-items',
      JSON.stringify({ [TABLE]: chunk.map((Key) => ({ DeleteRequest: { Key } })) })]);
  }
  console.log(`${keys.length} 件を削除しました（${PK}）`);
} else {
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (data.pk !== PK) {
    console.error(`ファイルの PK (${data.pk}) と指定 (${PK}) が違います。中断します。`);
    process.exit(1);
  }
  // 25件ずつ。BatchWriteItem の上限。
  for (let i = 0; i < data.items.length; i += 25) {
    const chunk = data.items.slice(i, i + 25);
    if (chunk.some((it) => it.PK?.S !== PK)) {
      console.error('別ユーザーの項目が混ざっています。中断します。');
      process.exit(1);
    }
    aws(['dynamodb', 'batch-write-item', '--request-items',
      JSON.stringify({ [TABLE]: chunk.map((Item) => ({ PutRequest: { Item } })) })]);
    process.stdout.write(`\r書き戻し ${Math.min(i + 25, data.items.length)}/${data.items.length}`);
  }
  console.log(`\n${data.items.length} 件を書き戻しました`);
}
