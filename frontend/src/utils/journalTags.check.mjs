// journalTags.js の付け替えの検証。node src/utils/journalTags.check.mjs
import { journalHasTag, retagJournal } from './journalTags.js';
import { computeTagBalances } from './bookkeeping.js';

let ng = 0;
const ok = (cond, name) => {
  if (cond) console.log(`  ok   ${name}`);
  else { ng++; console.log(`  NG   ${name}`); }
};

console.log('タグの付け替え（retagJournal）');
{
  const accounts = [
    { id: 'e01', type: 'expense' }, { id: 'a01', type: 'asset' },
  ];
  const j = {
    id: 'j1', date: '2026-11-01', desc: '食費',
    lines: [
      { accountId: 'e01', side: 'dr', amount: 6000, splits: [{ tagId: 't1', amount: 6000 }] },
      { accountId: 'a01', side: 'cr', amount: 6000, splits: [{ tagId: 't1', amount: 6000 }] },
    ],
  };
  const r = retagJournal(j, 't1', 't2');
  ok(r.lines.every((l) => l.splits.length === 1 && l.splits[0].tagId === 't2' && l.splits[0].amount === 6000), '全行のタグが t1 → t2、金額はそのまま');
  ok(r.lines[0].accountId === 'e01' && r.lines[1].side === 'cr' && r.id === 'j1', '科目・向き・日付・摘要は変わらない');
  ok(j.lines[0].splits[0].tagId === 't1', '元の仕訳は書き換えない');

  const before = computeTagBalances([j], accounts).byTag;
  const after = computeTagBalances([r], accounts).byTag;
  ok(before.t1 === -6000 && !after.t1 && after.t2 === -6000, 'タグ残高が t1 から t2 へ動く（二重計上なし）');

  ok(retagJournal(j, 't9', 't2') === null, '付いていないタグ元は null（保存しない）');
  ok(retagJournal(j, 't1', 't1') === null, '同じタグへは null');

  const off = retagJournal(j, 't1', null);
  ok(off.lines.every((l) => !('splits' in l)), 'null でタグを外す（splits を残さない）');

  const two = { ...j, lines: [{ accountId: 'e01', side: 'dr', amount: 1000, splits: [{ tagId: 't1', amount: 600 }, { tagId: 't2', amount: 400 }] }] };
  const m = retagJournal(two, 't1', 't2');
  ok(m.lines[0].splits.length === 1 && m.lines[0].splits[0].amount === 1000, '付け替え先が既にあれば金額を足して1件にまとめる');
  const keep = retagJournal(two, 't2', 't3');
  ok(keep.lines[0].splits.find((s) => s.tagId === 't1').amount === 600, '付け替えない側のタグはそのまま');

  const old = { id: 'j2', tagId: 't1', lines: [{ accountId: 'e01', side: 'dr', amount: 500, tagId: 't1' }] };
  const o = retagJournal(old, 't1', 't2');
  ok(o.tagId === 't2' && o.lines[0].tagId === 't2', '旧形式（行・仕訳直下の tagId）も付け替える');
  ok(retagJournal(old, 't1', null).tagId === undefined, '旧形式のタグも外せる');

  ok(journalHasTag(j, 't1') && !journalHasTag(j, 't2') && journalHasTag(old, 't1'), 'journalHasTag');
}

console.log(ng ? `\n${ng} 件 NG` : '\nすべて ok');
process.exit(ng ? 1 : 0);
