// 問い合わせとご意見を、家計データのテーブルから専用のテーブルへ写す（2026-10-12 指示・一度きり）。
//
//   node scripts/admin/migrate-ops-tables.mjs           … 写す件数を数えるだけ（書き込まない）
//   node scripts/admin/migrate-ops-tables.mjs --apply   … 写す
//
// ⚠ 本番のデータに書き込む。--apply は毎回ユーザーの許可を得てから実行する。
// ⚠ 元のテーブルからは消さない（しばらくは両方に残す。消すのは、管理画面とアプリが新しいテーブルだけを
//    読むようになってから、別の作業として行う）。
// ⚠ 新しいテーブルに同じキーがあれば上書きしない（attribute_not_exists）。移行後にアプリから返信が
//    付いたスレッドは新しいテーブルのほうが新しいので、何度実行しても新しいほうが残る。
//
// 写すもの:
//   問い合わせ: kakeibo-prod の SK=INQUIRY#…（PK=USER#<sub>）→ kakeibo-inquiries-prod（同じ PK・SK）
//   ご意見:     kakeibo-prod の PK=FEEDBACK → kakeibo-feedback-prod（同じ PK・SK）
// 退会理由はこれまで CloudWatch Logs にだけあり（保持90日）、テーブルには無いので写さない。
import { spawnSync } from 'node:child_process';

const PROFILE = 'kakeibo-prod';
const REGION = 'ap-northeast-1';
const SRC = 'kakeibo-prod';
const INQUIRY_DST = 'kakeibo-inquiries-prod';
const FEEDBACK_DST = 'kakeibo-feedback-prod';
const apply = process.argv.includes('--apply');

function aws(args) {
  const r = spawnSync('aws', [...args, '--output', 'json', '--profile', PROFILE, '--region', REGION], {
    encoding: 'utf8', maxBuffer: 64 * 1024 * 1024,
    env: { ...process.env, PYTHONUTF8: '1', PYTHONIOENCODING: 'utf-8', AWS_PAGER: '' },
  });
  return r;
}
function awsJson(args, what) {
  const r = aws(args);
  if (r.status !== 0) throw new Error(`${what}に失敗しました: ${(r.stderr || '').slice(0, 500)}`);
  return JSON.parse(r.stdout || '{}');
}

function scanAll(extra, what) {
  const out = [];
  let start = null;
  do {
    const args = ['dynamodb', 'scan', '--table-name', SRC, ...extra];
    if (start) args.push('--exclusive-start-key', JSON.stringify(start));
    const page = awsJson(args, what);
    out.push(...(page.Items || []));
    start = page.LastEvaluatedKey || null;
  } while (start);
  return out;
}

function copy(dst, item) {
  const r = aws(['dynamodb', 'put-item', '--table-name', dst, '--item', JSON.stringify(item),
    '--condition-expression', 'attribute_not_exists(SK)']);
  if (r.status === 0) return 'copied';
  if (/ConditionalCheckFailed/.test(r.stderr || '')) return 'exists';
  throw new Error(`書き込みに失敗しました（${dst}）: ${(r.stderr || '').slice(0, 500)}`);
}

// 写し先のテーブルが無ければ止める（sam deploy の前に実行しない）
for (const t of [INQUIRY_DST, FEEDBACK_DST]) {
  const r = aws(['dynamodb', 'describe-table', '--table-name', t]);
  if (r.status !== 0) { console.error(`写し先のテーブル ${t} がありません。先に sam deploy でテーブルを作ってください。`); process.exit(1); }
}

const inquiries = scanAll(['--filter-expression', 'begins_with(SK, :p)', '--expression-attribute-values', '{":p":{"S":"INQUIRY#"}}'], '問い合わせの取得');
const feedback = scanAll(['--filter-expression', 'PK = :pk', '--expression-attribute-values', '{":pk":{"S":"FEEDBACK"}}'], 'ご意見の取得');
console.log(`問い合わせ ${inquiries.length} 件・ご意見 ${feedback.length} 件（${SRC}）`);

if (!apply) {
  console.log('数えただけです（書き込んでいません）。写すときは --apply を付けて実行してください。');
  process.exit(0);
}

const tally = { copied: 0, exists: 0 };
for (const it of inquiries) tally[copy(INQUIRY_DST, it)]++;
for (const it of feedback) tally[copy(FEEDBACK_DST, it)]++;
console.log(`写した ${tally.copied} 件・すでにあった ${tally.exists} 件。元のテーブルからは消していません。`);
