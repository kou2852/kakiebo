// 端末とサーバーの初期データが一致しているかの検証。node src/db/defaults.check.mjs
//
// 新規アカウントの初期データは2か所に手で同じ内容を書いている。
//   端末: mobile/src/db/defaults.js（ゲストで始めたとき）
//   サーバー: backend/src/handlers/postConfirm.js（アカウントを作ったとき）
// ずれると、ログイン時の突き合わせ（store/merge.js の hasContent）が新しいアカウントを
// 「中身あり」と判定する。ゲストで記帳してからアカウントを作った人は、作ったばかりの
// 空のアカウントなのに「両方に帳簿があります」の選択を迫られる。
//
// サーバー側のファイルは AWS SDK を読み込むので、import せずに配列の部分だけを取り出して比べる。
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { DEFAULT_ACCOUNTS, DEFAULT_PRESETS } from './defaults.js';

let ng = 0;
const ok = (cond, name) => {
  if (cond) console.log(`  ok   ${name}`);
  else { ng++; console.log(`  NG   ${name}`); }
};

const serverFile = fileURLToPath(new URL('../../../backend/src/handlers/postConfirm.js', import.meta.url));
const src = readFileSync(serverFile, 'utf8');

/** `const NAME = [ ... ];` の配列を取り出して評価する。中身は文字列と数値だけの素のリテラル。 */
function extract(name) {
  const start = src.indexOf(`const ${name} = [`);
  if (start < 0) throw new Error(`${name} が postConfirm.js に見つからない`);
  const from = src.indexOf('[', start);
  const to = src.indexOf('\n];', from);
  if (to < 0) throw new Error(`${name} の終わりが見つからない`);
  return new Function(`return ${src.slice(from, to + 2)}`)();
}

// 並び順と鍵の順に左右されない比較
const norm = (list) => JSON.stringify(
  [...list].sort((a, b) => (a.id > b.id ? 1 : -1)).map((x) => Object.keys(x).sort().reduce((o, k) => ({ ...o, [k]: x[k] }), {}))
);

const serverAccounts = extract('DEFAULT_ACCOUNTS');
const serverPresets = extract('DEFAULT_PRESETS');

console.log('勘定科目');
ok(serverAccounts.length === DEFAULT_ACCOUNTS.length, `件数が同じ（端末 ${DEFAULT_ACCOUNTS.length} / サーバー ${serverAccounts.length}）`);
ok(norm(serverAccounts) === norm(DEFAULT_ACCOUNTS), '中身が同じ（id・コード・名前・区分）');
if (norm(serverAccounts) !== norm(DEFAULT_ACCOUNTS)) {
  const s = new Map(serverAccounts.map((a) => [a.id, JSON.stringify(a)]));
  const l = new Map(DEFAULT_ACCOUNTS.map((a) => [a.id, JSON.stringify(a)]));
  for (const id of new Set([...s.keys(), ...l.keys()])) {
    if (s.get(id) !== l.get(id)) console.log(`       ${id}: 端末=${l.get(id) || 'なし'} / サーバー=${s.get(id) || 'なし'}`);
  }
}

console.log('\nプリセット');
ok(serverPresets.length === DEFAULT_PRESETS.length, `件数が同じ（端末 ${DEFAULT_PRESETS.length} / サーバー ${serverPresets.length}）`);
ok(norm(serverPresets) === norm(DEFAULT_PRESETS), '中身が同じ');

console.log(ng ? `\n${ng} 件 失敗` : '\nすべて通過');
process.exitCode = ng ? 1 : 0;
