// 他のアプリからの移行：「対応付けのデータ」で表の行を明細にし、仕訳にまとめる。
// 対応付けのデータは画面（ColumnMapStep）で作るものも、決まった対応付け（presets.js）も同じ形。
// 列の指定は列名の配列（先頭から見て最初に値のある列を使う）。画面で同じ項目に2つ以上の列を選ぶと、選んだ順に並ぶ。
import { normD, pAm } from '../csv.js';
import { bundleJournals } from './core.js';

export const SHAPES = {
  single: '単式（家計簿アプリに多い）',
  lines: '1行＝1明細（会計ソフトの仕訳など）',
  pair: '1行に借方と貸方',
};

/** 何も指定していない対応付け（画面で最初に出すもの） */
export function emptyMapping() {
  return {
    shape: 'single', date: [], memo: [], voucher: [], rowNo: [],
    // 1行＝1明細
    account: [], sub: [], code: [], subCode: [], amount: [], sideMode: 'column', sideCol: [], sideValues: {},
    // 1行に借方と貸方
    drAccount: [], drSub: [], drCode: [], drSubCode: [], drAmount: [],
    crAccount: [], crSub: [], crCode: [], crSubCode: [], crAmount: [],
    // 単式
    flowMode: 'sign', flowCol: [], flowValues: {}, inCol: [], outCol: [], fromCol: [], toCol: [],
    accountCol: [], fixedAccount: '', category: [], subCategory: [], toAccount: [],
    // 取り込まない行：{ col: [列], values: [値…] } か { col, notIn: [値…] }、label は件数の見出し
    exclude: [],
  };
}

/**
 * 貸借・収支の決め方を、どの項目に列を選んだかで決める（画面に決め方の選択肢を出さないため）。
 * 貸借の列が無ければ金額の符号。入金額・出金額 → 出金元・入金先 → 収支区分の順に見て、どれも無ければ金額の符号
 */
export function deriveModes(m) {
  const has = (ref) => ref && ref.length > 0;
  return {
    ...m,
    sideMode: has(m.sideCol) ? 'column' : 'sign',
    flowMode: has(m.inCol) || has(m.outCol) ? 'inout' : has(m.fromCol) || has(m.toCol) ? 'fromto' : has(m.flowCol) ? 'column' : 'sign',
  };
}

/** 補助科目コードが空か0なら補助科目なし */
const normSub = (s) => (/^0*$/.test(s) ? '' : s);

/** 符号つきの数値。空・不正は 0（csv.js の signedNum と同じ扱い） */
function signedNum(s) {
  if (!s) return 0;
  const n = parseFloat(String(s).replace(/[¥,\s　]/g, '').replace(/[^\d.\-]/g, ''));
  return isNaN(n) ? 0 : n;
}

/** 日付の後ろに時刻が付いていれば外してから読む（2025-01-15T00:00:00+09:00、2025/01/15 12:34 など） */
const readDate = (s) => normD((s || '').trim().replace(/[T\s]\d{1,2}:\d{2}.*$/, ''));

/** 画面で「足りない」と出す必須の項目 */
export function missingFields(m) {
  const miss = [];
  const has = (ref) => ref && ref.length > 0;
  if (!has(m.date)) miss.push('日付');
  if (m.shape === 'lines') {
    if (!has(m.account) && !has(m.code)) miss.push('科目');
    if (!has(m.amount)) miss.push('金額');
    if (m.sideMode === 'column' && !has(m.sideCol)) miss.push('貸借の列');
  } else if (m.shape === 'pair') {
    if (!has(m.drAccount) && !has(m.drCode)) miss.push('借方科目');
    if (!has(m.drAmount)) miss.push('借方金額');
    if (!has(m.crAccount) && !has(m.crCode)) miss.push('貸方科目');
  } else {
    if (m.flowMode === 'inout') { if (!has(m.inCol) && !has(m.outCol)) miss.push('入金額・出金額の列'); }
    else if (!has(m.amount)) miss.push('金額');
    if (m.flowMode === 'column' && !has(m.flowCol)) miss.push('収支区分の列');
    if (m.flowMode === 'fromto') { if (!has(m.fromCol) && !has(m.toCol)) miss.push('出金元・入金先の列'); }
    else if (!has(m.accountCol) && !m.fixedAccount.trim()) miss.push('口座');
    if (!has(m.category)) miss.push('カテゴリ');
  }
  return miss;
}

/**
 * 表 → 明細行。取り込まない行（指定した列の値・金額が0）は数え、読めない行はエラーにする。
 * 明細：{ rowNo, date, voucherNo, memo, side, amount, key, code, name, subCode, subName, role, flow }
 */
export function toDetails(table, m) {
  const idx = {};
  table.columns.forEach((c, i) => { idx[c] = i; });
  const text = (cells, ref) => {
    for (const c of ref || []) { const i = idx[c]; const v = i == null ? '' : (cells[i] || '').trim(); if (v) return v; }
    return '';
  };
  // 金額の列が複数あるときは、0 でない最初の列（Zaim は支出・収入・振替の3列で、使わない列に 0 が入る）
  const amount = (cells, ref) => {
    for (const c of ref || []) { const i = idx[c]; const n = i == null ? 0 : pAm(cells[i] || ''); if (n > 0) return n; }
    return 0;
  };
  const signed = (cells, ref) => {
    for (const c of ref || []) { const i = idx[c]; const n = i == null ? 0 : signedNum(cells[i] || ''); if (n) return n; }
    return 0;
  };
  /** 科目：科目コードがあれば「コード|補助」、無ければ「役割:名前|補助」で組を分ける */
  const acct = (name, subName, code, subCodeRaw, role) => {
    const subCode = subCodeRaw === undefined ? '' : normSub(subCodeRaw);
    const key = code ? `${code}|${subCodeRaw === undefined ? subName : subCode}` : `n:${role}:${name}|${subName}`;
    return { key, code, name, subCode: subCodeRaw === undefined ? (code ? subName : '') : subCode, subName, role };
  };

  const details = [], errors = [];
  const excluded = {}, excludedRows = {}; // 読み飛ばした行：理由 → 件数 / 行番号（画面で「どの行か」を出すため）
  const count = (label, rowNo) => {
    excluded[label] = (excluded[label] || 0) + 1;
    excludedRows[label] = [...(excludedRows[label] || []), rowNo];
  };
  const has = (ref) => ref && ref.length > 0;

  // 画面で足したばかりで列か値が決まっていない条件は使わない（全行が外れてしまうため）
  const rules = (m.exclude || []).filter((r) => (r.col || []).length && (r.notIn || (r.values || []).some((v) => v !== '')));
  for (const { line, cells } of table.rows) {
    const rowNo = text(cells, m.rowNo) || String(line);
    const rule = rules.find((r) => {
      const v = text(cells, r.col);
      return r.notIn ? !r.notIn.includes(v) : (r.values || []).includes(v);
    });
    if (rule) { count(rule.label || `${(rule.col || []).join('・')} の列が「${(rule.values || []).join('」か「')}」`, rowNo); continue; }

    const base = {
      rowNo,
      date: readDate(text(cells, m.date)),
      voucherNo: text(cells, m.voucher),
      memo: text(cells, m.memo),
    };
    const push = (a, side, amt, flow) => details.push({ ...base, ...a, side, amount: amt, flow: flow || '' });

    if (m.shape === 'lines') {
      const a = acct(text(cells, m.account), text(cells, m.sub), text(cells, m.code), has(m.subCode) ? text(cells, m.subCode) : undefined, '');
      let side, amt;
      if (m.sideMode === 'sign') {
        const n = signed(cells, m.amount);
        side = n > 0 ? 'dr' : n < 0 ? 'cr' : 'dr';
        amt = Math.abs(n);
      } else {
        side = (m.sideValues || {})[text(cells, m.sideCol)] || null;
        amt = amount(cells, m.amount);
      }
      if (!(amt > 0)) { count('金額が0', rowNo); continue; }
      if (!a.name && !a.code) { errors.push({ rowNos: [base.rowNo], reason: '科目が空です' }); continue; }
      push(a, side, amt);
    } else if (m.shape === 'pair') {
      const drAmt = amount(cells, m.drAmount);
      const crAmt = has(m.crAmount) ? amount(cells, m.crAmount) : drAmt;
      const dr = acct(text(cells, m.drAccount), text(cells, m.drSub), text(cells, m.drCode), has(m.drSubCode) ? text(cells, m.drSubCode) : undefined, '');
      const cr = acct(text(cells, m.crAccount), text(cells, m.crSub), text(cells, m.crCode), has(m.crSubCode) ? text(cells, m.crSubCode) : undefined, '');
      // 借方か貸方の一方だけの行もある（複合仕訳の続きの行）。科目と金額がある側だけ明細にする
      const sides = [[dr, 'dr', drAmt], [cr, 'cr', crAmt]].filter(([a]) => a.name || a.code);
      const valid = sides.filter(([, , amt]) => amt > 0);
      if (!valid.length) { count('金額が0', rowNo); continue; }
      for (const [a, side, amt] of valid) push(a, side, amt);
    } else {
      // 単式：1行を「費用／口座」「口座／収益」「入金先／出金元」の仕訳に組み替える
      let flow, amt, from = '', to = '';
      const account = m.fixedAccount && !has(m.accountCol) ? m.fixedAccount.trim() : text(cells, m.accountCol);
      const toAcct = text(cells, m.toAccount);
      if (m.flowMode === 'fromto') {
        from = text(cells, m.fromCol); to = text(cells, m.toCol);
        flow = from && to ? 'transfer' : to ? 'income' : 'expense';
        amt = amount(cells, m.amount);
        if (flow === 'expense') to = '';
      } else {
        if (m.flowMode === 'sign') {
          const n = signed(cells, m.amount);
          flow = n < 0 ? 'expense' : 'income';
          amt = Math.abs(n);
        } else if (m.flowMode === 'inout') {
          const inAmt = amount(cells, m.inCol), outAmt = amount(cells, m.outCol);
          if (inAmt > 0 && outAmt > 0) { errors.push({ rowNos: [base.rowNo], reason: '入金額と出金額の両方に金額があります' }); continue; }
          flow = inAmt > 0 ? 'income' : 'expense';
          amt = inAmt || outAmt;
        } else {
          flow = (m.flowValues || {})[text(cells, m.flowCol)] || 'expense';
          amt = amount(cells, m.amount);
        }
        // 振替先の口座があれば振替。出金なら口座→振替先、入金なら振替先→口座
        if (toAcct || flow === 'transfer') {
          if (flow === 'income') { from = toAcct; to = account; } else { from = account; to = toAcct; }
          flow = 'transfer';
        } else if (flow === 'income') to = account;
        else from = account;
      }
      if (!(amt > 0)) { count('金額が0', rowNo); continue; }
      const cat = text(cells, m.category), subCat = text(cells, m.subCategory);
      const wallet = (name) => acct(name, '', '', undefined, 'account');
      if (flow === 'transfer') {
        if (!from || !to) { errors.push({ rowNos: [base.rowNo], reason: '振替の出金元か入金先が空です' }); continue; }
        push(wallet(to), 'dr', amt, flow);
        push(wallet(from), 'cr', amt, flow);
        continue;
      }
      const own = flow === 'income' ? to : from;
      if (!own) { errors.push({ rowNos: [base.rowNo], reason: '口座が空です' }); continue; }
      if (!cat) { errors.push({ rowNos: [base.rowNo], reason: 'カテゴリが空です' }); continue; }
      const c = acct(cat, subCat, '', undefined, 'category');
      if (flow === 'income') { push(wallet(own), 'dr', amt, flow); push(c, 'cr', amt, flow); }
      else { push(c, 'dr', amt, flow); push(wallet(own), 'cr', amt, flow); }
    }
  }
  return { details, excluded, excludedRows, errors };
}

/** 表＋対応付け → 仕訳・エラー・取り込まなかった行の件数 */
export function parseWithMapping(table, m) {
  const { details, excluded, excludedRows, errors } = toDetails(table, m);
  const r = bundleJournals(details);
  return { journals: r.journals, errors: [...errors, ...r.errors], excluded, excludedRows };
}

/** 列の値の種類（貸借・収支区分の値を画面で割り当てるため。多すぎるときは先頭から） */
export function distinctValues(table, ref, limit = 12) {
  const i = table.columns.indexOf((ref || [])[0]);
  if (i < 0) return [];
  const out = [];
  for (const { cells } of table.rows) {
    const v = (cells[i] || '').trim();
    if (!out.includes(v)) out.push(v);
    if (out.length >= limit) break;
  }
  return out;
}
