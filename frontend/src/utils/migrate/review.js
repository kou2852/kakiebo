// 他のアプリからの移行：仕訳明細の画面（取り込む仕訳を1行ずつ見て、直す）のための処理。
// マッピングで仕訳にまとめた結果（mapping.js の parseWithMapping）から、直せる形の「仕訳」を作る。
// 行の科目は 'p:組のキー'（ファイルの科目。科目のマッピングで決めた先に入る）か 'a:科目ID'（くろふくぼの科目を直接選んだもの）。
import { MAX_LINES, UNBALANCED } from './core.js';

let seq = 0;
const newUid = () => `l${++seq}`;

/** 最初の行番号（数字でなければ後ろへ） */
const firstNo = (g) => {
  const n = parseFloat(g.rowNos[0]);
  return Number.isNaN(n) ? Infinity : n;
};

/**
 * 仕訳にできたものと、明細はあるのに仕訳にできなかったもの（貸借が合わない・日付や貸借が読めない）を、ファイルの順に並べる。
 * 明細の無いエラー（科目が空など、列の読み方の問題）は含めない。それはマッピングの画面で直す。
 */
export function toGroups(parsed) {
  const fromLines = (lines) => lines.map((l) => ({ uid: newUid(), side: l.side || '', acct: 'p:' + l.key, amount: l.amount }));
  const groups = [
    ...parsed.journals.map((j) => ({ rowNos: j.rowNos, date: j.date, desc: j.desc, lines: fromLines(j.lines) })),
    ...parsed.errors.filter((e) => e.lines && e.lines.length).map((e) => ({
      rowNos: e.rowNos,
      date: (e.lines.find((l) => l.date) || { date: '' }).date,
      desc: (e.lines.find((l) => l.memo) || { memo: '' }).memo,
      lines: fromLines(e.lines),
    })),
  ];
  // 仕訳とエラーは別々に集めているので、最初の行番号でファイルの順に戻す
  return groups
    .map((g, i) => ({ g, i }))
    .sort((a, b) => firstNo(a.g) - firstNo(b.g) || a.i - b.i)
    .map(({ g }, n) => ({ ...g, no: n + 1 }));
}

export function totals(g) {
  let dr = 0, cr = 0;
  for (const l of g.lines) {
    if (l.side === 'dr') dr += l.amount || 0;
    if (l.side === 'cr') cr += l.amount || 0;
  }
  return { dr, cr };
}

/** 取り込めるか。取り込めなければ直すことを1つ返す（上から順に見る） */
export function checkGroup(g) {
  const { dr, cr } = totals(g);
  const ng = (reason) => ({ ok: false, reason, dr, cr });
  if (!g.lines.length) return ng('行がありません（取り込みません）');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(g.date || '')) return ng('日付を入れてください');
  if (g.lines.some((l) => !l.side)) return ng('借方か貸方かを選んでください');
  if (g.lines.some((l) => !l.acct)) return ng('科目を選んでください');
  if (g.lines.some((l) => !(l.amount > 0))) return ng('金額を入れてください');
  if (g.lines.length > MAX_LINES) return ng(`明細が${MAX_LINES}行を超えています（${g.lines.length}行）`);
  // 1円未満の差は許す（bundleJournals と同じ）
  if (!(dr > 0 && cr > 0 && Math.abs(dr - cr) < 1)) return ng(`${UNBALANCED}（借方 ${dr.toLocaleString()}・貸方 ${cr.toLocaleString()}）`);
  return { ok: true, reason: '', dr, cr };
}

/** 行を足すときの初めの値。貸借が合っていなければ、足りない側に差額を入れておく */
export function newLine(g) {
  const { dr, cr } = totals(g);
  const diff = Math.round(Math.abs(dr - cr) * 100) / 100;
  return { uid: newUid(), side: diff ? (dr < cr ? 'dr' : 'cr') : '', acct: '', amount: diff };
}

/** toPayload（core.js）に渡す形。ids は 行の科目（'p:…' / 'a:…'）→ くろふくぼの科目ID */
export function groupJournal(g) {
  return { date: g.date, desc: g.desc || '', lines: g.lines.map((l) => ({ key: l.acct, side: l.side, amount: l.amount })) };
}

/**
 * 画面に並べる行。order は 'file'（ファイルの順）・'date'（日付の順）・'account'（科目の順）。
 * 科目の順は仕訳をまたいで行を並べ替える（同じ科目の行が続けて見える）。acctKey は 行の科目 → 並べる文字列
 */
export function sortRows(groups, order, acctKey) {
  const rows = [];
  const gs = order === 'date' ? [...groups].sort((a, b) => (a.date || '9').localeCompare(b.date || '9') || a.no - b.no) : groups;
  for (const g of gs) for (const l of g.lines) rows.push({ g, l });
  if (order === 'account') {
    const key = new Map(rows.map((r) => [r.l.uid, acctKey(r.l.acct)]));
    rows.sort((a, b) => key.get(a.l.uid).localeCompare(key.get(b.l.uid), 'ja', { numeric: true }) || (a.g.date || '').localeCompare(b.g.date || '') || a.g.no - b.g.no);
  }
  return rows;
}
