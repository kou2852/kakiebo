// カード会社・銀行の CSV を取り込むための列マッピング。
//
// 既存の csv.js は マネーフォワード / Zaim / 本アプリ形式の3種しか判別できず、
// カード会社の明細は列構成が各社バラバラなので素通りしてしまう。
//
// LLM に推論させる案もあるが採らない。ヘッダの語彙は有限（10社に満たない）で辞書で足り、
// 外した場合の誤りが「静かに間違った列を金額として取り込む」形になるのが致命的なため。
// 辞書で当て、外れたらユーザーに列を選ばせる。選ばせる方が間違いがその場で見える。
import AsyncStorage from '@react-native-async-storage/async-storage';
import { parseCL, normD, pAm } from './csv';

// 主要カード会社・銀行のヘッダ表記ゆれ。順序は優先度。
const DICT = {
  date: [/^ご?利用年月日$/, /^ご?利用日/, /^利用日付$/, /^取引日/, /^お?取引日/, /^日付$/, /^年月日$/],
  desc: [/ご?利用店名/, /ご?利用先/, /^利用先/, /加盟店/, /^店名/, /^摘要$/, /^内容$/, /^品目$/, /^お取引内容$/],
  amount: [/ご?利用金額/, /^支払金額/, /^請求金額/, /^ご?請求額/, /^金額/, /^お引出し?金額$/, /^出金金額$/],
};

// ヘッダの表記ゆれ吸収: 全角括弧は半角へ、空白（全角 U+3000 含む）と引用符は落とす。
const clean = (s) => (s || '')
  .replace(/（/g, '(')
  .replace(/）/g, ')')
  .replace(/[\s　"]/g, '')
  .trim();

/** ヘッダ行から各役割の列位置を推測する。当たらなかった役割は null。 */
export function guessMapping(header) {
  const cells = header.map(clean);
  const out = { date: null, desc: null, amount: null };
  for (const role of Object.keys(DICT)) {
    for (const re of DICT[role]) {
      const i = cells.findIndex((c) => re.test(c));
      if (i >= 0 && !Object.values(out).includes(i)) { out[role] = i; break; }
    }
  }
  return out;
}

/** ヘッダが無い CSV か（1行目の先頭セルが日付として読めるなら見出しではない） */
export function looksHeaderless(rows) {
  return rows.length > 0 && rows[0].some((c) => normD(c));
}

/** 列位置から日付として読める列を探す（ヘッダ無し CSV の当て推量） */
export function guessByContent(rows) {
  if (!rows.length) return { date: null, desc: null, amount: null };
  const cols = rows[0].length;
  const score = (fn) => Array.from({ length: cols }, (_, i) => rows.filter((r) => fn(r[i])).length);
  const dateScore = score((v) => !!normD(v));
  const amtScore = score((v) => pAm(v) > 0);
  const date = dateScore.indexOf(Math.max(...dateScore));
  // 金額列は日付列を除いて最も数値らしい列
  const amount = amtScore.map((s, i) => (i === date ? -1 : s)).indexOf(Math.max(...amtScore.map((s, i) => (i === date ? -1 : s))));
  // 摘要は残りのうち最も文字が長い列
  const lenScore = Array.from({ length: cols }, (_, i) =>
    (i === date || i === amount) ? -1 : rows.reduce((s, r) => s + String(r[i] || '').length, 0));
  const desc = lenScore.indexOf(Math.max(...lenScore));
  return { date, desc: desc >= 0 ? desc : null, amount };
}

/** 本アプリ形式の見出しか（日付,借方科目,借方金額,貸方科目,貸方金額,摘要） */
export function isNativeHeader(header) {
  const h = header.map(clean);
  return h.includes('借方科目') && h.includes('貸方科目');
}

// ── 列ごとの割り当て（2026-10-13 作り直し）──
// CSV の行はそのまま、カンマで区切った表として見せ、列（縦）ごとに「この列は何か」を選んでもらう。
// 選べる項目。金額は「金額（支出）」の1列か、銀行の明細のように「出金額」「入金額」の2列かのどちらか。
// help は選ぶときに横に出す説明。借方は増える側（費用・資産）、貸方は減る側・出どころ（支払元・負債・収益）。
export const COLUMN_ROLES = [
  { value: 'none', label: '使わない', help: '取り込まない列（残高・メモなど）' },
  { value: 'date', label: '日付', help: '取引の日。2026/10/01・20261001 などを読めます' },
  { value: 'desc', label: '摘要', help: '店名・内容。仕訳の摘要になります' },
  { value: 'amount', label: '金額', help: '支出の金額。1つの列に金額が入っている明細（カードなど）' },
  { value: 'out', label: '出金額', help: '口座から出たお金。出金と入金が別の列の明細（銀行など）' },
  { value: 'in', label: '入金額', help: '口座に入ったお金。給与・振込など' },
  { value: 'dr', label: '借方科目', help: '費用・資産（何に使ったか／どこに入ったか）' },
  { value: 'cr', label: '貸方科目', help: '支払元・負債・収益（どこから出たか）' },
];

// 出金・入金の列の見出し（銀行の明細）
const IN_OUT = {
  out: [/^出金/, /^お?引出/, /^お支払/, /^支払金額$/],
  in: [/^入金/, /^お?預入/, /^預け入れ/, /^お受取/],
};

/** 見出し（無ければ中身）から、列ごとの役割を推測する。当たらない列は「使わない」 */
export function guessRoles(header, data, headerless, cols) {
  const roles = Array.from({ length: cols }, () => 'none');
  const cells = header.map(clean);
  // 本アプリの書き出し（日付,借方科目,借方金額,貸方科目,貸方金額,摘要）。金額は借方の列を使う
  if (!headerless && isNativeHeader(header)) {
    const NATIVE = { 日付: 'date', 借方科目: 'dr', 借方金額: 'amount', 貸方科目: 'cr', 摘要: 'desc' };
    cells.forEach((c, i) => { if (NATIVE[c]) roles[i] = NATIVE[c]; });
    return roles;
  }
  if (!headerless) {
    // 出金・入金が別の列なら、銀行の明細として読む
    const io = {};
    for (const k of ['out', 'in']) {
      const i = cells.findIndex((c) => IN_OUT[k].some((re) => re.test(c)));
      if (i >= 0) io[k] = i;
    }
    if (io.out != null && io.in != null) {
      roles[io.out] = 'out';
      roles[io.in] = 'in';
      const g = guessMapping(header);
      if (g.date != null && roles[g.date] === 'none') roles[g.date] = 'date';
      if (g.desc != null && roles[g.desc] === 'none') roles[g.desc] = 'desc';
      return roles;
    }
  }
  const g = headerless ? guessByContent(data) : guessMapping(header);
  if (g.date != null) roles[g.date] = 'date';
  if (g.desc != null && roles[g.desc] === 'none') roles[g.desc] = 'desc';
  if (g.amount != null && roles[g.amount] === 'none') roles[g.amount] = 'amount';
  return roles;
}

/** 割り当てが取り込める形か。足りないものを返す（空なら取り込める） */
export function missingRoles(roles) {
  const has = (r) => roles.includes(r);
  const out = [];
  if (!has('date')) out.push('日付');
  if (!has('amount') && !has('out') && !has('in')) out.push('金額（または出金額・入金額）');
  return out;
}

/**
 * 割り当てを当てて、csv.js の中間形式 [日付, 借方名, 借方額, 貸方名, 貸方額, 摘要, 種類] へ変換する。
 * 科目名は借方科目・貸方科目の列があればその値、無ければ空（取込画面で、ルール → 画面で選んだ科目の順に当てる）。
 * 種類（7列目）は 'out'（金額・出金額＝支出）か 'in'（入金額）。空の科目にどの科目を当てるかを分けるのに使う。
 * expenseSign: 金額の列で、支出が正の数か（'positive'）負の数か（'negative'）。支出と逆の符号の行（返金など）は取り込まない。
 * 1つの役割に列を2つ以上当てたときは、左の列を使う（摘要だけは空白でつなぐ）。
 */
export function applyRoles(data, roles, { expenseSign = 'positive' } = {}) {
  const col = (r) => roles.indexOf(r);
  const iDate = col('date'), iAmt = col('amount'), iOut = col('out'), iIn = col('in'), iDr = col('dr'), iCr = col('cr');
  const descCols = roles.map((r, i) => (r === 'desc' ? i : -1)).filter((i) => i >= 0);
  const cell = (row, i) => (i >= 0 ? String(row[i] ?? '').trim() : '');
  const out = [];
  for (const r of data) {
    const date = normD(cell(r, iDate));
    if (!date) continue;
    const desc = descCols.map((i) => cell(r, i)).filter(Boolean).join(' ');
    const dr = cell(r, iDr), cr = cell(r, iCr);
    const spend = (amount) => out.push([date, dr, String(amount), cr, String(amount), desc, 'out']);
    const earn = (amount) => out.push([date, dr, String(amount), cr, String(amount), desc, 'in']);
    if (iAmt >= 0) {
      const raw = cell(r, iAmt);
      const amount = pAm(raw);
      const negative = /^\s*[-−▲△]/.test(raw);
      if (amount && (expenseSign === 'positive' ? !negative : negative)) spend(amount);
    }
    if (iOut >= 0) { const a = pAm(cell(r, iOut)); if (a) spend(a); }
    if (iIn >= 0) { const a = pAm(cell(r, iIn)); if (a) earn(a); }
  }
  return out;
}

/**
 * 取り込まない行と、その理由（画面で「対象外」の中身を見せるため）。applyRoles と同じ判定。
 * 返り値: [{ line: 何行目（データの1始まり）, row: 元の行, reason }]
 */
export function skippedRows(data, roles, { expenseSign = 'positive' } = {}) {
  const col = (r) => roles.indexOf(r);
  const iDate = col('date'), iAmt = col('amount'), iOut = col('out'), iIn = col('in');
  const cell = (row, i) => (i >= 0 ? String(row[i] ?? '').trim() : '');
  const out = [];
  data.forEach((r, k) => {
    if (r.every((c) => !String(c ?? '').trim())) return; // 空の行は数えない
    const rawDate = cell(r, iDate);
    if (!normD(rawDate)) { out.push({ line: k + 1, row: r, reason: rawDate ? `日付が読めません（${rawDate}）` : '日付がありません' }); return; }
    let any = false;
    let refund = false;
    if (iAmt >= 0) {
      const raw = cell(r, iAmt);
      const negative = /^\s*[-−▲△]/.test(raw);
      if (pAm(raw)) {
        if (expenseSign === 'positive' ? !negative : negative) any = true; else refund = true;
      }
    }
    if (iOut >= 0 && pAm(cell(r, iOut))) any = true;
    if (iIn >= 0 && pAm(cell(r, iIn))) any = true;
    if (any) return;
    out.push({ line: k + 1, row: r, reason: refund ? '支出と逆の符号です（返金・キャンセルの行は取り込みません）' : '金額がありません（0 か空欄）' });
  });
  return out;
}

// ── 保存したマッピング（2回目以降は自動で当てる）──
const KEY = 'kk_csv_maps';
export const signature = (header) => header.map(clean).join('|').slice(0, 200);

export async function loadMapping(header) {
  try {
    const all = JSON.parse((await AsyncStorage.getItem(KEY)) || '{}');
    return all[signature(header)] || null;
  } catch { return null; }
}

export async function saveMapping(header, value) {
  try {
    const all = JSON.parse((await AsyncStorage.getItem(KEY)) || '{}');
    all[signature(header)] = value;
    await AsyncStorage.setItem(KEY, JSON.stringify(all));
  } catch { /* 保存できなくても、その回の取込は成立する */ }
}

/** 生の CSV 全文を行配列へ（ヘッダも含めてそのまま返す） */
export function rawRows(text) {
  return text.replace(/^﻿/, '').split(/\r?\n/).filter((l) => l.trim()).map(parseCL);
}

// ── 割り当てプリセット（名前を付けて複数保存。ウェブ版 frontend/src/utils/csvMapping.js と同じ形）──
// { id, name, sig, headerless, roles: [列ごとの役割], sign, expenseId, accountId, incomeId }
// 保存先はこの端末。家計データではなく列の位置と科目の ID だけを持つ。
const PRESETS_KEY = 'kk_csv_presets';

/** 以前の形（{ map: { date, desc, amount }, drId, crId }）で保存した割り当てを、列ごとの役割の形へ直す */
function upgradePreset(p) {
  if (!p || Array.isArray(p.roles)) return p;
  const cols = p.headerless ? Number(String(p.sig || '').replace('#', '')) || 0 : String(p.sig || '').split('|').length;
  const roles = Array.from({ length: cols }, () => 'none');
  const put = (i, r) => { if (i != null && i < cols) roles[i] = r; };
  put(p.map?.date, 'date'); put(p.map?.desc, 'desc'); put(p.map?.amount, 'amount');
  const rest = { ...p }; delete rest.map; delete rest.drId; delete rest.crId;
  return { ...rest, roles, expenseId: p.expenseId || p.drId || '', accountId: p.accountId || p.crId || '' };
}

export async function loadCsvPresets() {
  try {
    const v = JSON.parse((await AsyncStorage.getItem(PRESETS_KEY)) || '[]');
    return Array.isArray(v) ? v.map(upgradePreset) : [];
  } catch { return []; }
}

export async function saveCsvPresets(list) {
  try { await AsyncStorage.setItem(PRESETS_KEY, JSON.stringify(list)); } catch { /* 保存できなくても、その回の取込は成立する */ }
}

/** プリセットの署名（見出し無しの CSV は列の数） */
export const presetSig = (header, headerless, cols) => (headerless ? `#${cols}` : signature(header));
