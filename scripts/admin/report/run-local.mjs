// 手元でレポートを組み立てる。既定は送信せず文面を表示するだけ（AWS は読むだけ）。
//
//   aws sso login --profile kakeibo-prod
//   node scripts/admin/report/run-local.mjs morning              # 文面を表示
//   node scripts/admin/report/run-local.mjs evening --at 2026-09-17T18:00:00+09:00
//   node scripts/admin/report/run-local.mjs morning --send --test  # Discord に【テスト】付きで送る
//   node scripts/admin/report/run-local.mjs watch                 # 問い合わせ・ご意見の新着（送信せず表示）
//   node scripts/admin/report/run-local.mjs watch --since 2026-01-01T00:00:00Z  # 過去ぶんで文面を確認

process.env.AWS_PROFILE ||= 'kakeibo-prod';
process.env.AWS_REGION ||= 'ap-northeast-1';

const args = process.argv.slice(2);
const slot = args[0];
const flag = (name) => args.includes(name);
const value = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };

const { handler } = await import('./src/handler.mjs');
const result = await handler({
  slot, at: value('--at'), since: value('--since'), dryRun: !flag('--send'), test: flag('--test'),
});
if (flag('--send')) console.log('送信しました', result);
else if (slot === 'watch') {
  if (result.initialized) console.log('カーソルを作成しました（次回以降の新着から送ります）');
  else if (!result.payloads.length) console.log('新着はありません');
  for (const p of result.payloads || []) {
    for (const e of p.embeds) console.log(`--- ${e.title}
${e.description}
(${e.footer?.text ?? ''})`);
  }
} else {
  const e = result.embeds[0];
  console.log(`${e.title}\n\n${e.description}\n\n(${e.footer?.text ?? ''})`);
}
