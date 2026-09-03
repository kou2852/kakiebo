// 二重適用の検出。
//
// 置換スクリプトが途中で失敗して再実行され、同じ行が2回入る事故が起きた
// （設定メニューに「利用規約」が2つ並び、React の key 重複エラーになった）。
// 目で追うと見落とすので、機械的に洗う。
//
// 見るのは2つ:
//   1. 同じファイル内で連続して同じ行が繰り返されている
//   2. 同じ配列の中で label / value が重複している（React の key になる）
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SKIP = new Set(['node_modules', '.expo', 'dist', 'android', 'ios', 'assets', 'design']);

const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => {
  if (SKIP.has(e.name)) return [];
  const p = path.join(d, e.name);
  return e.isDirectory() ? walk(p) : (/\.(jsx?|json)$/.test(e.name) ? [p] : []);
});

let ng = 0;
const report = (file, msg) => { console.log(`  NG ${path.relative(ROOT, file)}: ${msg}`); ng++; };

for (const file of walk(ROOT)) {
  const lines = fs.readFileSync(file, 'utf8').split('\n');

  // 1. 意味のある行が2回続いていないか（空行・閉じ括弧・単純な記号は除く）
  for (let i = 1; i < lines.length; i++) {
    const a = lines[i - 1].trim();
    if (a.length < 20 || !lines[i].trim()) continue;
    if (a === lines[i].trim()) report(file, `${i}行目が直前と同一: ${a.slice(0, 60)}`);
  }

  // 2. label: '...' が同じファイル内で重複していないか。
  // MenuList / ChipRow はこれを React の key に使うため、重複すると実行時エラーになる。
  const labels = [...fs.readFileSync(file, 'utf8').matchAll(/\blabel: '([^']+)'/g)].map((m) => m[1]);
  const seen = new Map();
  labels.forEach((l) => seen.set(l, (seen.get(l) || 0) + 1));
  for (const [l, n] of seen) if (n > 1) report(file, `label '${l}' が ${n} 回`);
}

console.log(ng ? `\n${ng} 件の重複` : '\n重複なし');
process.exit(ng ? 1 : 0);
