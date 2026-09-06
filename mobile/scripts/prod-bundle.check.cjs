// 本番バンドルの中身を出す前に検査する。EAS のビルドを1回無駄にすると15〜30分失う。
//
// 使い方:
//   npx expo export --platform ios --clear --output-dir <dir>
//   node scripts/prod-bundle.check.cjs <dir>
//
// ⚠ Hermes は ASCII を1バイト、非 ASCII を UTF-16LE で持つ。日本語を UTF-8 で
// 探しても見つからない。どちらでも当たるように両方で照合する。
const fs = require('fs');
const path = require('path');

const dir = path.join(process.argv[2], '_expo/static/js/ios');
const f = fs.readdirSync(dir).find((n) => n.endsWith('.hbc') || n.endsWith('.js'));
const buf = fs.readFileSync(path.join(dir, f));
const has = (s) => buf.includes(Buffer.from(s, 'utf8')) || buf.includes(Buffer.from(s, 'utf16le'));

const rows = [
  ['本番の広告ユニットID', 'ca-app-pub-1494837719359912/3915570524', true],
  ['本番の API', 'ecbjdndcbe.execute-api', true],
  ['開発用の Cognito が混ざっていないか', 'auth-dev', false],
  ['動作診断（審査前に消した）', '動作診断', false],
  ['ツアー: はじめての', 'はじめてのツアー', true],
  ['ツアー: 操作待ちの案内', '実際に操作すると次へ進みます', true],
  ['ツアー: 12件ぶん', '純資産の推移を読む', true],
  ['ログアウトの確認', 'ログアウトしますか', true],
  ['引っ張って更新', 'この期間の仕訳はありません', true],
];

console.log('検査対象:', f, '(' + (buf.length / 1048576).toFixed(1) + ' MB)');
let ng = 0;
for (const [label, needle, want] of rows) {
  const got = has(needle);
  const ok = got === want;
  if (!ok) ng++;
  console.log('  ' + (ok ? 'OK ' : 'NG ') + label.padEnd(36), got ? 'あり' : 'なし', ok ? '' : '← 期待は ' + (want ? 'あり' : 'なし'));
}

// テスト広告IDは文字列として必ず入る（app.json の androidAppId と rn-gma の TestIds）。
// 実行時に使うかは __DEV__ で決まるので、文字列の有無では判定できない。
console.log('\n参考: テスト広告IDの文字列', has('ca-app-pub-3940256099942544') ? 'あり' : 'なし',
  '（app.json の androidAppId 由来。実行時の選択は __DEV__ が決める）');

console.log('\n' + (ng ? '✗ ' + ng + ' 件の異常' : '✓ すべて期待どおり'));
process.exit(ng ? 1 : 0);
