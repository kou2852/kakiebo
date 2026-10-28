// 画面の描画で、データ由来の文字列がすべてエスケープされるか。
// 管理アプリではログイン状態（更新トークン）を持つので、問い合わせ本文などに仕込まれた HTML が動くと乗っ取られる。
// 手元のダッシュボードの応答（問い合わせ本文などを含むのでリポジトリには置かない）の文字列すべてに罠の HTML を足して
// 描画し、罠が要素にならないことを見る。見本は UI_FIXTURES のフォルダに <名前>.json で置く（無ければ飛ばす）:
//   for q in stats?days=30:stats platforms?days=30:platforms inquiries feedback deletions usage active today status; do
//     curl -s "http://127.0.0.1:8787/api/${q%%:*}" > "$DIR/${q##*:}.json"; done
//   UI_FIXTURES="$DIR" node --test scripts/admin/test/ui-escape.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import vm from 'node:vm';

const TRAP = '<img src=x onerror=alert(1)>"\'';
const DIR = process.env.UI_FIXTURES;
if (!DIR || !existsSync(DIR)) { test('UI_FIXTURES が無いので飛ばす', { skip: true }, () => {}); }
const FX = DIR ? pathToFileURL(DIR.replace(/\/?$/, '/')) : null;

// どんな操作にも黙って応える偽の DOM（app.js の起動処理を通すためだけ）
const any = () => new Proxy(function () {}, {
  get: (t, k) => (k === Symbol.toPrimitive ? () => '' : k === 'then' ? undefined : (t[k] ??= any())),
  set: (t, k, v) => { t[k] = v; return true; },
  apply: () => any(),
});
const ctx = vm.createContext({
  document: any(), window: any(), location: { hash: '', search: '' }, localStorage: any(), CSS: { escape: (s) => s },
  fetch: () => new Promise(() => {}), KK: { fetch: () => new Promise(() => {}) }, setTimeout, clearTimeout, console, Date, Math, JSON, Intl, URLSearchParams,
});
ctx.window = ctx;
vm.runInContext(readFileSync(new URL('../ui/app.js', import.meta.url), 'utf8'), ctx);

const poison = (v) => typeof v === 'string' ? v + TRAP
  : Array.isArray(v) ? v.map(poison)
  : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, poison(x)])) : v;
const fx = !FX ? {} : Object.fromEntries(readdirSync(FX).map((f) => [f.replace('.json', ''), poison(JSON.parse(readFileSync(new URL(f, FX), 'utf8')))]));

// 描画関数と、渡す見本
const CASES = [
  ['inquiriesHtml', 'inquiries'], ['feedbackHtml', 'feedback'], ['deletionsHtml', 'deletions'],
  ['statusHtml', 'status'], ['numbersHtml', 'today'], ['activeHtml', 'active'], ['usageSummaryHtml', 'usage'],
  ['usageTableHtml', 'usage'], ['platformHtml', 'platforms'], ['journeySection', 'stats'], ['hourlyHtml', 'stats'],
  ['funnelSection', 'stats'], ['retentionSection', 'stats'], ['appStagesSection', 'stats'], ['guestHtml', 'stats'],
];

for (const [fn, name] of FX ? CASES : []) {
  test(`${fn} は罠の HTML を要素にしない`, () => {
    const f = vm.runInContext(`typeof ${fn} === 'function' ? ${fn} : null`, ctx);
    assert.ok(f, `${fn} が見つからない`);
    let html;
    try { html = String(f(fx[name], 0)); } catch (e) { return assert.fail(`${fn} が例外: ${e.message}`); }
    assert.doesNotMatch(html, /<img src=x/i);
  });
}

// render / renderDeep は #root に書く。偽の DOM に残った innerHTML を見る
for (const fn of FX ? ['render', 'renderDeep'] : []) {
  test(`${fn} は罠の HTML を要素にしない`, () => {
    const root = { innerHTML: '' };
    ctx.document.querySelector = (sel) => (sel === '#root' ? root : any());
    try { vm.runInContext(fn, ctx)(fx.stats); } catch (e) { /* 後段の非同期は偽の DOM なので失敗してよい */ }
    assert.ok(root.innerHTML.length > 100, '描画されていない');
    assert.doesNotMatch(root.innerHTML, /<img src=x/i);
  });
}
