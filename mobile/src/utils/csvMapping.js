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

/**
 * マッピングを当てて、csv.js の中間形式 [日付, 借方名, 借方額, 貸方名, 貸方額, 摘要] へ変換する。
 * 科目名は空にしておき、取込画面で選んだ費目・支払方法を後段で当てる。
 * expenseSign: 'positive'（支出が正の値・多くのカード）/ 'negative'（支出が負の値）
 */
export function applyMapping(rows, map, expenseSign = 'positive') {
  const out = [];
  for (const r of rows) {
    const date = normD(r[map.date]);
    if (!date) continue;
    const rawAmount = String(r[map.amount] ?? '');
    const negative = /^\s*[-−▲△]/.test(rawAmount);
    const amount = pAm(rawAmount);
    if (!amount) continue;
    // 返金・キャンセル行は支出の逆符号になる。いまは取り込まない（相殺の記帳は別途必要）。
    const isExpense = expenseSign === 'positive' ? !negative : negative;
    if (!isExpense) continue;
    out.push([date, '', String(amount), '', String(amount), String(r[map.desc] ?? '').trim()]);
  }
  return out;
}

// ── 保存したマッピング（2回目以降は自動で当てる）──
const KEY = 'kk_csv_maps';
const signature = (header) => header.map(clean).join('|').slice(0, 200);

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
