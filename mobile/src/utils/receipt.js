// OCR で読み取った行から、記帳に必要な3項目だけを取り出す。
//
// レシートの明細を1行ずつ費目に振り分けることはしない。1レシート=1仕訳で扱うため、
// 必要なのは「日付・店名・合計」だけで、そこまで絞れば認識精度への要求も下がる。
// カード利用控えや請求書、口座の残高画面でも同じ3項目が取れる。
import { normD } from './csv.js';

// 合計を表す語。店・端末によって割れるので広く採る。
// 「合計」が無いレシートは珍しくない（カード端末の控えは「取引金額」「対象金額」など）。
// ⚠ 「合計」の印字がかすれて OCR にまったく映らないレシートが実際にあった（2026-10-03・SEIYU）。
//   その版面では支払方法の行（「クレジット」）が合計額の直前にあり、他に強い根拠が無いと
//   小計・ポイント対象額と同点になって運任せになる。支払方法の行だけの単独行も根拠に加える。
//   「クレジット明細」「クレジットカード：」のような見出しと混同しないよう、完全一致のみ。
const TOTAL_WORDS = [
  /合\s*計/, /お?買上げ?[計額]/, /お会計/, /ご?請求[額金]/, /^計$/,
  /取引金額/, /対象金額/, /ご?利用金額/, /お?支払[い]?金額/, /クレジット支払/, /total/i,
  /^(クレジット|現金|電子マネー|QRコード?決済)$/,
];

// 合計と紛らわしく、拾ってはいけない行
const EXCLUDE_LINE = /小計|内税|外税|消費税|お預り|お預かり|お釣|釣銭|釣り|値引|割引/;

// 識別番号の類。桁数が多く金額と誤認しやすい。
const ID_LINE = /番号|No\.?|端末|承認|伝票|会員|カード|AID|区分|期限|電話|TEL/i;

// ポイントは金額ではない。「7,842P」のようにカンマ区切りで書かれるため除外が要る。
const POINT_LINE = /ポイント|POINT|\bpts?\b/i;

// 金額として拾ってよい形は2つだけ。「¥ が付く」か「3桁区切りのカンマがある」。
// レシートの金額は必ずどちらかで印字される。この制限が無いと端末番号や会員番号のような
// 長い数字列を拾う（実際に 3753020400021 を合計として拾った）。
const MONEY = /[¥￥]\s*(\d[\d,]*)|(\d{1,3}(?:,\d{3})+)/g;

// 現実的な上限。レシートでも残高画面でも 10億を超えることは想定しない。
const MAX_AMOUNT = 1000000000;

/** 1行から金額候補を取り出す（拾ってはいけない行は空を返す） */
function moneyIn(line) {
  if (!line || POINT_LINE.test(line) || ID_LINE.test(line)) return [];
  const out = [];
  MONEY.lastIndex = 0;
  let m;
  while ((m = MONEY.exec(line)) !== null) {
    const n = Number((m[1] || m[2] || '').replace(/,/g, ''));
    if (n > 0 && n <= MAX_AMOUNT) out.push(n);
  }
  return out;
}

/**
 * 認識行から { date, amount, store, lines } を推定する。
 * 取れなかった項目は null（画面側で手入力させる）。
 */
export function extractReceipt(lines) {
  // OCR（特に Android の ML Kit）は「1,807」の桁区切りカンマの直後に余分な空白を
  // 入れて読むことがある（「1, 807」）。そのままだと金額の正規表現に引っかからず、
  // 本来の合計行が拾えなくなるので、ここで詰めておく。
  let clean = (lines || []).map((l) => String(l).trim().replace(/,\s+(?=\d)/g, ',')).filter(Boolean);

  // さらに、桁区切りカンマの直後で行ごと分かれてしまうことがある（「¥2,」「711」のように
  // 2行に割れる）。1行ずつ見る仕組みだとどちらの行からも金額として拾えず、合計が
  // 分裂していない別の数字（小計など）にすり替わるため、ここでくっつけておく。
  const mergedClean = [];
  for (let i = 0; i < clean.length; i++) {
    const cur = clean[i];
    const next = clean[i + 1];
    if (next && /\d{1,3},$/.test(cur) && /^\d{3}(\D|$)/.test(next)) {
      mergedClean.push(cur + next);
      i++;
    } else {
      mergedClean.push(cur);
    }
  }
  clean = mergedClean;

  // ── 合計 ──
  // 候補ごとに点を付けて選ぶ。単純な最大値だと識別番号を拾うため使わない。
  //   ・合計を表す語と同じ行（または次の行）にある … 強い根拠
  //   ・同じ額が何度も出てくる … レシートは合計を複数回印字するので支持材料になる
  const score = new Map();
  const add = (n, pt) => score.set(n, (score.get(n) || 0) + pt);

  clean.forEach((line, i) => {
    // 「ポイント対象金額」は TOTAL_WORDS の /対象金額/ に誤って一致する。
    // ポイントがらみの行は、合計行としての強い加点ごと無視する。
    if (EXCLUDE_LINE.test(line) || POINT_LINE.test(line)) return;
    const isTotalLine = TOTAL_WORDS.some((re) => re.test(line));
    moneyIn(line).forEach((n) => add(n, isTotalLine ? 10 : 1));
    // 「合計」だけの行で、金額が次の行に回っている版面
    if (isTotalLine && moneyIn(line).length === 0) {
      moneyIn(clean[i + 1]).forEach((n) => add(n, 10));
    }
  });

  // 「合計」の印字がかすれて OCR に映らないなど、根拠が薄く同点・僅差になることがある
  // (実例: 2026-10-03 SEIYU)。1位だけを機械的に信じず、上位候補を画面側にも渡して
  // 選び直せるようにする。
  // 「¥」が「4」に読まれると「¥2,711」が「42,711」になる（実機で確認）。先頭の4を外した額も
  // 候補にあるなら、4付きの方は誤読の疑いが強いので点を下げる。候補としては残す。
  for (const n of [...score.keys()]) {
    const s = String(n);
    const rest = Number(s.slice(1));
    if (s[0] === '4' && s.length >= 5 && score.has(rest)) score.set(n, score.get(n) - 1.5);
  }
  const ranked = [...score.entries()].sort((a, b) => (b[1] - a[1]) || (b[0] - a[0]));
  const amount = ranked.length ? ranked[0][0] : null;
  const amountCandidates = ranked.slice(0, 3).map(([n]) => n);

  // ── 日付 ──
  let date = null;
  for (const line of clean) {
    // 行全体が日付とは限らないので、日付らしい部分文字列を切り出してから正規化する。
    // 「2026年 9月21日」のように年・月の後ろに空白が入ることがあるため、空白は許容する。
    const m = line.match(/(\d{4}|\d{2})[/\-.年]\s*(\d{1,2})[/\-.月]\s*(\d{1,2})/);
    if (!m) continue;
    const d = normD(`${m[1]}/${m[2]}/${m[3]}`);
    if (d) { date = d; break; }
  }

  // ── 店名 ──
  // 版面の先頭付近にある、数字や記号ばかりでない行を採る。
  // 店名も OCR の読みが甘いことがあるため、候補を複数出して選べるようにする。
  // 合計・支払の見出し（「合計」「クレジット」など）は店名ではないので外す。
  const storeCandidates = [...new Set(clean.slice(0, 6).filter((l) => l.length >= 2
    && !/^[\d\s\-/:¥￥,.]+$/.test(l)
    && !TOTAL_WORDS.some((re) => re.test(l))))].slice(0, 4);
  const store = storeCandidates[0] || null;

  return { date, amount, amountCandidates, store, storeCandidates, lines: clean };
}
