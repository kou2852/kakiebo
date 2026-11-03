// journalTags.js の検証。node src/utils/journalTags.check.mjs
//
// 見たいのは carryLine: アプリで編集して保存しても、ウェブで付けた複数タグの配分が消えないこと。
import {
  carryLine, journalHasTag, ratioRows, retagJournal, rowsToSplits, sameTagRows, splitsToRows, tagRowsProblem,
} from './journalTags.js';
import { computeTagBalances } from './bookkeeping.js';

let ng = 0;
const ok = (cond, name) => {
  if (cond) console.log(`  ok   ${name}`);
  else { ng++; console.log(`  NG   ${name}`); }
};
const sum = (splits) => (splits || []).reduce((s, x) => s + x.amount, 0);

console.log('仕訳の行');
{
  const prev = { accountId: 'e01', side: 'dr', amount: 1000, taxRate: 10, splits: [{ tagId: 't1', amount: 600 }, { tagId: 't2', amount: 400 }] };

  const same = carryLine(prev, { accountId: 'e01', side: 'dr', amount: 1000 });
  ok(same.splits === prev.splits, '金額を変えなければ配分はそのまま');
  ok(same.taxRate === 10, '入力欄に無い項目（税率）を引き継ぐ');

  const up = carryLine(prev, { accountId: 'e01', side: 'dr', amount: 1500 });
  ok(up.splits[0].amount === 900 && up.splits[1].amount === 600, '金額を増やすと同じ比率で付け直す（900/600）');
  ok(sum(up.splits) === 1500, '付け直した配分の合計は行の金額と一致');

  const moved = carryLine(prev, { accountId: 'e05', side: 'dr', amount: 1000 });
  ok(moved.accountId === 'e05' && moved.splits.length === 2, '科目を変えても配分は残る');

  const partial = { accountId: 'e01', side: 'dr', amount: 1000, splits: [{ tagId: 't1', amount: 300 }] };
  const p2 = carryLine(partial, { accountId: 'e01', side: 'dr', amount: 2000 });
  ok(p2.splits.length === 1 && p2.splits[0].amount === 600, '一部だけタグを付けていた場合もその比率のまま（300/1000 → 600/2000）');

  const odd = carryLine(prev, { accountId: 'e01', side: 'dr', amount: 999 });
  ok(sum(odd.splits) === 999, '割り切れない金額でも合計は行の金額と一致（四捨五入のずれを吸収）');
}

console.log('\nプリセットの行（金額0＝都度入力）');
{
  const prev = { accountId: 'e01', side: 'dr', amount: 0, splits: [{ tagId: 't1', amount: 70 }, { tagId: 't2', amount: 30 }] };
  const stay = carryLine(prev, { accountId: 'e01', side: 'dr', amount: 0 });
  ok(stay.splits === prev.splits, '金額0のままなら比率としてそのまま残す');
  const fixed = carryLine(prev, { accountId: 'e01', side: 'dr', amount: 1000 });
  ok(fixed.splits[0].amount === 700 && fixed.splits[1].amount === 300, '金額を決めたら比率どおりの金額にする（700/300）');
  const back = carryLine({ ...prev, amount: 1000, splits: [{ tagId: 't1', amount: 700 }] }, { accountId: 'e01', side: 'dr', amount: 0 });
  ok(back.splits.length === 1 && back.splits[0].amount === 700, '金額を0に戻しても配分は消えない');
}

console.log('\n配分の無い行・新しい行');
{
  const plain = carryLine({ accountId: 'a01', side: 'cr', amount: 1000, tagId: 't9' }, { accountId: 'a02', side: 'cr', amount: 500 });
  ok(plain.tagId === 't9' && !plain.splits, '1つだけのタグ（tagId）は引き継ぐ。配分は作らない');
  const fresh = carryLine(undefined, { accountId: 'a01', side: 'cr', amount: 100 });
  ok(JSON.stringify(fresh) === JSON.stringify({ accountId: 'a01', side: 'cr', amount: 100 }), '元の行が無ければ入力欄の内容だけ');
}

console.log('\n記帳画面のタグ欄（splits で保存する）');
{
  const one = rowsToSplits([{ tagId: 't1', amount: '' }], 1200);
  ok(JSON.stringify(one) === JSON.stringify([{ tagId: 't1', amount: 1200 }]), '1つで金額が空なら、全額に付ける');
  const two = rowsToSplits([{ tagId: 't1', amount: '800' }, { tagId: 't2', amount: '400' }], 1200);
  ok(two.length === 2 && two[0].amount === 800 && two[1].amount === 400, '2つなら入れた金額のとおり');
  ok(rowsToSplits([{ tagId: 't1', amount: '300' }], 1000)[0].amount === 300, '1つでも金額を入れたら、その金額だけ（一部だけタグ）');
  ok(rowsToSplits([], 1000).length === 0 && rowsToSplits([{ tagId: 't1', amount: '' }], 0).length === 0, 'タグなし・金額0なら空');

  ok(JSON.stringify(splitsToRows({ amount: 1200, splits: [{ tagId: 't1', amount: 1200 }] })) === JSON.stringify([{ tagId: 't1', amount: '' }]),
    '全額に付いた1つは、金額の無い行に戻す');
  ok(splitsToRows({ amount: 1000, splits: [{ tagId: 't1', amount: 300 }] })[0].amount === '300', '一部だけのタグは金額を残す');
  ok(JSON.stringify(splitsToRows({ amount: 500, tagId: 't9' })) === JSON.stringify([{ tagId: 't9', amount: '' }]),
    '古い形（行の tagId）も読む');
  const round = rowsToSplits(splitsToRows({ amount: 1000, splits: [{ tagId: 't1', amount: 600 }, { tagId: 't2', amount: 400 }] }), 1000);
  ok(round[0].amount === 600 && round[1].amount === 400, '読んで保存し直しても配分は変わらない');

  ok(tagRowsProblem([{ tagId: 't1', amount: '' }], 1000) === null, '1つで全額なら問題なし');
  ok(tagRowsProblem([{ tagId: 't1', amount: '' }, { tagId: 't2', amount: '500' }], 1000) !== null, '2つ以上で金額が空なら止める');
  ok(tagRowsProblem([{ tagId: 't1', amount: '700' }, { tagId: 't2', amount: '500' }], 1000) === null, '合計が金額を超えても止めない（整合性は確かめない）');
  ok(tagRowsProblem([{ tagId: 't1', amount: '300' }], 1000) === null, '1つで一部の金額だけでも問題なし');
  ok(tagRowsProblem([{ tagId: 't1', amount: '2000' }], 1000) === null, '1つで行の金額より大きくても止めない');
  ok(rowsToSplits([{ tagId: 't1', amount: '2000' }], 1000)[0].amount === 2000, '入れた金額のまま保存する（行の金額に切り詰めない）');
  ok(tagRowsProblem([{ tagId: 't1', amount: '700' }, { tagId: 't2', amount: '300' }], 1000) === null, '合計がちょうどなら問題なし');

  const r = ratioRows([{ tagId: 't1', amount: 70 }, { tagId: 't2', amount: 30 }], 1500);
  ok(r[0].amount === '1050' && r[1].amount === '450', 'プリセットの比率を、入れた金額に合わせる（1050/450）');
  ok(ratioRows([{ tagId: 't1', amount: 70 }], 0)[0].amount === '', '金額がまだ無ければ空欄');

  ok(sameTagRows([{ tagId: 't1', amount: '' }], []), '片方の行だけにタグがあれば同じとみなす');
  ok(!sameTagRows([{ tagId: 't1', amount: '' }], [{ tagId: 't2', amount: '' }]), '借方と貸方でタグが違えば別');
}

console.log('\nタグの付け替え（retagJournal）');
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
