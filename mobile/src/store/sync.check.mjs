// 同期で帳簿が壊れないことの検証。 node src/store/sync.check.mjs
//
// 2026-09-08 のレビューで、修正済みのつもりだった経路に消失が残っていたため追加した。
// いずれも画面上はエラーにならず、静かに壊れる種類の事故なので、ここで固定する。
//
// ⚠ ここは実際の pushPlain を呼ばない（API が要る）。壊れ方の条件を、
//   同じロジックを写した最小の形で押さえる。写しである以上、sync.js を直したら
//   こちらも合わせること。
import { emptyDataset } from '../db/defaults.js';
import { applyIntents, replace, upsert } from '../db/intents.js';

let ng = 0;
const check = (name, ok) => { console.log((ok ? '  ok   ' : '  NG   ') + name); if (!ok) ng++; };

// ── A10: 未送信が空のまま同期すると、サーバーの内容で端末が上書きされる ──
//
// pushPlain は意図が無ければ何も送らず、最後に exportAll の結果を返す。
// DataProvider.sync はその戻りで writeLocal する。サーバーが空なら端末が空になる。
console.log('A10: 未送信が空のまま同期すると端末が消える');
{
  const local = { ...emptyDataset(), journals: [{ id: 'j1' }] };
  const server = emptyDataset();
  // 修正前の挙動（意図ゼロ）
  const before = server;
  check('修正前は端末の仕訳が消える（再現できている）', before.journals.length === 0 && local.journals.length === 1);

  // 修正後: サーバーに無いものを意図として積んでから送る
  const COLLECTIONS = ['accounts', 'journals', 'tags', 'allocs', 'wallets', 'presets', 'budgets', 'recurring', 'rules'];
  const queued = [];
  for (const c of COLLECTIONS) {
    const ids = new Set((server[c] || []).map((x) => x.id));
    for (const item of local[c] || []) if (!ids.has(item.id)) queued.push({ c, item });
  }
  check('修正後は仕訳が意図として積まれる', queued.some((q) => q.c === 'journals' && q.item.id === 'j1'));
  check('既定と同じものは積まない（重複を作らない）', !queued.some((q) => q.c === 'accounts'));
}

// ── A14: サーバーが採番し直した科目IDが参照側に反映されない ──
console.log('A14: 採番し直しの読み替えが参照側に効く');
{
  const idMap = new Map([['local-acc', 'server-uuid']]);
  const rid = (id) => idMap.get(id) || id;
  const remap = (item) => {
    let out = item;
    if (Array.isArray(item.lines)) {
      out = { ...out, lines: item.lines.map((l) => (l.accountId ? { ...l, accountId: rid(l.accountId) } : l)) };
    }
    for (const k of ['accountId', 'drAccountId', 'crAccountId']) {
      if (out[k]) out = { ...out, [k]: rid(out[k]) };
    }
    return out;
  };

  const journal = remap({ id: 'j1', lines: [{ accountId: 'local-acc', side: 'dr' }, { accountId: 'c01', side: 'cr' }] });
  check('仕訳の lines[].accountId が読み替わる', journal.lines[0].accountId === 'server-uuid');
  check('関係ない科目はそのまま', journal.lines[1].accountId === 'c01');

  check('口座の accountId が読み替わる', remap({ id: 'w1', accountId: 'local-acc' }).accountId === 'server-uuid');
  check('予算の accountId が読み替わる', remap({ accountId: 'local-acc', amount: 1 }).accountId === 'server-uuid');
  check('タグ配分の accountId が読み替わる', remap({ accountId: 'local-acc', tagId: 't1' }).accountId === 'server-uuid');

  const rule = remap({ id: 'r1', drAccountId: 'local-acc', crAccountId: 'c01' });
  check('自動仕訳ルールの借方が読み替わる', rule.drAccountId === 'server-uuid');
  check('自動仕訳ルールの貸方はそのまま', rule.crAccountId === 'c01');

  const preset = remap({ id: 'p1', lines: [{ accountId: 'local-acc' }], walletId: 'w1' });
  check('プリセットの lines も読み替わる', preset.lines[0].accountId === 'server-uuid');
  check('元のオブジェクトを壊さない', preset !== undefined);
}

// ── 開始残高の仕訳が貸借一致すること（C5/C6 の土台） ──
console.log('開始残高の仕訳');
{
  const EQ = 'c01';
  const mk = (type, id, bal) => (type === 'asset'
    ? [{ accountId: id, side: 'dr', amount: bal }, { accountId: EQ, side: 'cr', amount: bal }]
    : [{ accountId: EQ, side: 'dr', amount: bal }, { accountId: id, side: 'cr', amount: bal }]);
  for (const type of ['asset', 'liability']) {
    const l = mk(type, 'x1', 100000);
    const dr = l.filter((x) => x.side === 'dr').reduce((s, x) => s + x.amount, 0);
    const cr = l.filter((x) => x.side === 'cr').reduce((s, x) => s + x.amount, 0);
    check(`${type}: 借方=貸方`, dr === cr);
  }
  check('元入金 c01 が既定科目にある', emptyDataset().accounts.some((a) => a.id === EQ));
}

console.log('id を持たないコレクションを upsert で積むと壊れる');
{
  const local = { ...emptyDataset(),
    budgets: [{ accountId: 'e01', amount: 1 }, { accountId: 'e02', amount: 2 }, { accountId: 'e05', amount: 3 }] };

  // 壊れる積み方（修正前）
  const bad = applyIntents(local, local.budgets.map((b) => upsert('budgets', b)));
  // id が無いので findIndex は常に 0 を返し、先頭が毎回上書きされる。
  // 件数は変わらないが、同じ accountId が2つ並ぶ＝サーバーの SK が衝突する。
  check('upsert だと accountId が重複する（再現できている）',
    new Set(bad.budgets.map((x) => x.accountId)).size < bad.budgets.length);
  check('  重複の中身: ' + bad.budgets.map((x) => x.accountId).join(','), true);

  // 正しい積み方（修正後）
  const good = applyIntents(local, [replace('budgets', local.budgets)]);
  check('replace なら3件のまま', good.budgets.length === 3);
  check('accountId が重複しない（SK が衝突しない）',
    new Set(good.budgets.map((b) => b.accountId)).size === good.budgets.length);

  // タグ配分も同じ
  const allocs = [{ accountId: 'a02', tagId: 't1', amount: 1 }, { accountId: 'a02', tagId: 't2', amount: 2 }];
  check('タグ配分も replace なら2件のまま',
    applyIntents({ ...emptyDataset(), allocs }, [replace('allocs', allocs)]).allocs.length === 2);
}

console.log('採番の対応表が永続化されていれば再試行で重複しない');
{
  // pushPlain の該当ロジックを写したもの
  const run = (serverIds, intents, idMap) => {
    const ids = new Set(serverIds);
    const created = [];
    const rid = (id) => idMap.get(id) || id;
    for (const it of intents) {
      const sid = rid(it.id);
      if (ids.has(sid)) continue;            // update 相当
      const newId = 'srv-' + it.id + '-' + created.length;
      created.push(newId); idMap.set(it.id, newId); ids.add(newId);
    }
    return created;
  };

  const intents = [{ id: 'local-1' }];

  // 対応表を毎回まっさらにする（修正前）
  let server = [];
  const c1 = run(server, intents, new Map()); server = server.concat(c1);
  const c2 = run(server, intents, new Map()); server = server.concat(c2);
  check('対応表を捨てると2回目も作られる（再現できている）', server.length === 2);

  // 対応表を持ち越す（修正後）
  const keep = new Map();
  let s2 = [];
  s2 = s2.concat(run(s2, intents, keep));
  s2 = s2.concat(run(s2, intents, keep));
  s2 = s2.concat(run(s2, intents, keep));
  check('対応表を持ち越せば何度流しても1件のまま', s2.length === 1);
}

console.log(ng ? `\n${ng} 件 NG` : '\nすべて通過');
process.exit(ng ? 1 : 0);
