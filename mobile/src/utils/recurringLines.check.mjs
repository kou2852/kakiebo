// 定期取引の複数科目・タグ分けの検算。 node src/utils/recurringLines.check.mjs
//
// ・行のタグは、全額に1つだけなら行の tagId（ウェブの定期取引と同じ形）、一部・複数なら splits で持つ
// ・記帳のとき、どちらも仕訳の行の splits になる。複数科目の仕訳も貸借が合う
import { generateRecurring } from './autoGen.js';
import { rowsToSplits, splitsToRows, storeLineTags } from './journalTags.js';

let ng = 0;
const check = (name, ok) => { console.log((ok ? '  ok   ' : '  NG   ') + name); if (!ok) ng++; };

console.log('storeLineTags（行への載せ方）');
{
  const one = storeLineTags({ accountId: 'a', side: 'dr', amount: 1000, splits: [{ tagId: 'old', amount: 1 }] }, [{ tagId: 't1', amount: 1000 }], 1000);
  check('全額に1つ → tagId で持つ（ウェブの形）。古い splits は消える', one.tagId === 't1' && !('splits' in one));
  const part = storeLineTags({ accountId: 'a', side: 'dr', amount: 1000, tagId: 'old' }, [{ tagId: 't1', amount: 300 }], 1000);
  check('一部だけ → splits で持つ。古い tagId は消える', part.splits?.length === 1 && part.splits[0].amount === 300 && !('tagId' in part));
  const multi = storeLineTags({ accountId: 'a', side: 'dr', amount: 1000 }, [{ tagId: 't1', amount: 600 }, { tagId: 't2', amount: 400 }], 1000);
  check('複数 → splits で持つ', multi.splits.length === 2 && !('tagId' in multi));
  const none = storeLineTags({ accountId: 'a', side: 'dr', amount: 1000, tagId: 'old', splits: [{ tagId: 'x', amount: 1 }] }, [], 1000);
  check('タグなし → どちらも消える', !('tagId' in none) && !('splits' in none));
}

console.log('画面の入力欄との往復（保存した形を、もう一度開いて同じ入力欄になる）');
{
  const rowsA = [{ tagId: 't1', amount: '' }];
  const lineA = storeLineTags({ accountId: 'a', side: 'dr', amount: 5000 }, rowsToSplits(rowsA, 5000), 5000);
  check('全額1つ: 入力欄は金額なしの1行に戻る', JSON.stringify(splitsToRows(lineA)) === JSON.stringify([{ tagId: 't1', amount: '' }]));
  const rowsB = [{ tagId: 't1', amount: '3000' }, { tagId: 't2', amount: '2000' }];
  const lineB = storeLineTags({ accountId: 'a', side: 'dr', amount: 5000 }, rowsToSplits(rowsB, 5000), 5000);
  check('2つ: 金額つきの2行に戻る', JSON.stringify(splitsToRows(lineB)) === JSON.stringify(rowsB));
}

console.log('記帳（複数科目・タグ分け）');
{
  // 給与: 手取りを2つの口座へ、収入は2つのタグで分ける
  const lines = [
    { accountId: 'bank1', side: 'dr', amount: 250000 },
    { accountId: 'bank2', side: 'dr', amount: 50000, tagId: 'save' },
    { accountId: 'salary', side: 'cr', amount: 300000, splits: [{ tagId: 'living', amount: 250000 }, { tagId: 'save', amount: 50000 }] },
  ];
  const rec = [{ id: 'r', name: '給与', frequency: 'monthly', nextDate: '2026-10-25', lines }];
  const journals = [];
  const n = await generateRecurring({
    recurring: rec, journals, todayStr: '2026-10-25',
    addJournal: (d) => { journals.push({ id: `j${journals.length}`, ...d }); },
    saveRecurring: () => {},
  });
  const j = journals[0];
  const sum = (side) => j.lines.filter((l) => l.side === side).reduce((s, l) => s + l.amount, 0);
  check('1件記帳され、行は3つ', n === 1 && j.lines.length === 3);
  check('借方合計＝貸方合計（300,000）', sum('dr') === 300000 && sum('cr') === 300000);
  check('行の tagId（全額1つ）は、仕訳では splits になる', j.lines[1].splits?.[0]?.tagId === 'save' && j.lines[1].splits[0].amount === 50000 && !('tagId' in j.lines[1]));
  check('行の splits（2つ）はそのまま付く', j.lines[2].splits.map((x) => `${x.tagId}:${x.amount}`).join() === 'living:250000,save:50000');
  check('タグなしの行には何も付かない', !j.lines[0].splits);
  check('もとの定期取引の行は書き換えない', rec[0].lines[1].tagId === 'save' && !rec[0].lines[1].splits);
}

console.log(ng ? `\nNG ${ng}` : '\n全部OK');
process.exit(ng ? 1 : 0);
