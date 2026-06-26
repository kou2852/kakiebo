// CSV取込の純粋関数群（kakeibo.html の parseCL/parseCT/normD/pAm を移植）

// CSV列マッピング: 日付,借方科目,借方金額,貸方科目,貸方金額,摘要
export const CC = { d: 0, da: 1, dm: 2, ca: 3, cm: 4, ds: 5 };

/** 1行をフィールド配列にパース（ダブルクォート対応） */
export function parseCL(l) {
  const r = [];
  let c = '', q = false;
  for (let i = 0; i < l.length; i++) {
    const ch = l[i];
    if (ch === '"') {
      if (q && l[i + 1] === '"') { c += '"'; i++; }
      else q = !q;
    } else if (ch === ',' && !q) { r.push(c.trim()); c = ''; }
    else c += ch;
  }
  r.push(c.trim());
  return r;
}

/** CSV全文をデータ行の配列へ。hasHeader=true なら1行目（列名）を除外。空・データ無しは null を返す */
export function parseCT(t, hasHeader = true) {
  t = t.replace(/^﻿/, '');
  const ls = t.split(/\r?\n/).filter((l) => l.trim());
  if (ls.length < (hasHeader ? 2 : 1)) return null;
  const dataLines = hasHeader ? ls.slice(1) : ls;
  const rows = dataLines.map((l) => parseCL(l)).filter((r) => r.some((c) => c.trim()));
  return rows.length ? rows : null;
}

/** 日付文字列を YYYY-MM-DD へ正規化。解釈不能は null */
export function normD(s) {
  if (!s) return null;
  s = s.trim();
  let m;
  m = s.match(/^(\d{4})[/\-.](\d{1,2})[/\-.](\d{1,2})$/);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  m = s.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = s.match(/^(\d{2})[/\-.](\d{1,2})[/\-.](\d{1,2})$/);
  if (m) return `20${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  return null;
}

/** 金額文字列を正の数値へ。空・不正は 0 */
export function pAm(s) {
  if (!s || !s.trim()) return 0;
  const n = parseFloat(s.replace(/[¥,\s　]/g, '').replace(/[^\d.\-]/g, ''));
  return isNaN(n) ? 0 : Math.abs(n);
}

/** 科目名 or コードから科目IDを解決。なければ null */
export function resolveAccount(accounts, s) {
  s = (s || '').trim();
  if (!s) return null;
  return (accounts.find((a) => a.name === s) || accounts.find((a) => a.code === s) || {}).id || null;
}

// ── 他社フォーマット（マネーフォワード / Zaim）からの取込 ──
// 単式（1行=1取引）を、本アプリの複式中間形式 [日付,借方名,借方額,貸方名,貸方額,摘要] へ変換する。
// 科目名には元データのカテゴリ/口座名をそのまま入れ、後段の科目マッピングで本アプリ科目に割り当てる。

/** 全角括弧→半角（ヘッダー名の表記ゆれ吸収） */
const toHalfParen = (s) => (s || '').replace(/（/g, '(').replace(/）/g, ')');

/** ヘッダー行から形式を判定: 'mf' | 'zaim' | 'native' */
export function detectCsvFormat(text) {
  const first = (text.replace(/^﻿/, '').split(/\r?\n/)[0] || '');
  const h = parseCL(first).map((c) => toHalfParen(c).trim());
  const has = (name) => h.includes(name);
  if ((has('金額(円)') || has('金額')) && (has('保有金融機関') || has('大項目') || has('計算対象'))) return 'mf';
  if (has('カテゴリ') && (has('支出元') || has('入金先') || has('支払元')) && has('方法')) return 'zaim';
  return 'native';
}

/** 符号付き数値（収入/支出判定用）。空・不正は0 */
function signedNum(s) {
  if (s == null || !String(s).trim()) return 0;
  const n = parseFloat(String(s).replace(/[¥,\s　]/g, '').replace(/[^\d.\-]/g, ''));
  return isNaN(n) ? 0 : n;
}

/** マネーフォワード/Zaim CSVを複式中間形式の行配列へ変換（科目名は元ラベルのまま） */
export function normalizeForeignCsv(text, format) {
  const lines = text.replace(/^﻿/, '').split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return [];
  const idx = {};
  parseCL(lines[0]).forEach((c, i) => { idx[toHalfParen(c).trim()] = i; });
  const get = (row, ...names) => {
    for (const n of names) { const i = idx[n]; if (i != null && row[i] != null && row[i].trim()) return row[i].trim(); }
    return '';
  };
  const out = [];
  for (let li = 1; li < lines.length; li++) {
    const row = parseCL(lines[li]);
    if (!row.some((c) => c.trim())) continue;
    if (format === 'mf') {
      if (get(row, '計算対象') === '0') continue; // 集計対象外は取り込まない
      const date = get(row, '日付');
      const amt = signedNum(get(row, '金額(円)', '金額'));
      if (!date || amt === 0) continue;
      const inst = get(row, '保有金融機関', '金融機関');
      const cat = get(row, '大項目', '中項目');
      const desc = get(row, '内容');
      const a = String(Math.abs(amt));
      if (amt < 0) out.push([date, cat, a, inst, a, desc]);   // 支出: 借方=費目 / 貸方=口座
      else out.push([date, inst, a, cat, a, desc]);           // 収入: 借方=口座 / 貸方=費目
    } else { // zaim
      const date = get(row, '日付');
      const amt = Math.abs(signedNum(get(row, '金額')));
      if (!date || amt === 0) continue;
      const cat = get(row, 'カテゴリ');
      const src = get(row, '支出元', '支払元');
      const dst = get(row, '入金先');
      const desc = get(row, '品目', 'お店', 'メモ');
      const a = String(amt);
      if (src && dst) out.push([date, dst, a, src, a, desc || '振替']); // 振替: 借方=入金先 / 貸方=支出元
      else if (dst) out.push([date, dst, a, cat, a, desc]);            // 収入: 借方=口座 / 貸方=費目
      else out.push([date, cat, a, src, a, desc]);                     // 支出: 借方=費目 / 貸方=口座
    }
  }
  return out;
}

// ── CSV書き出し（レポートエクスポート用） ──

function escapeCell(v) {
  const s = v == null ? '' : String(v);
  return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

/** 2次元配列をCSV文字列へ（RFC4180） */
export function rowsToCSV(rows) {
  return rows.map((r) => r.map(escapeCell).join(',')).join('\r\n');
}

/** CSVを即ダウンロード。Excelの日本語文字化け防止のため先頭にUTF-8 BOMを付与。 */
export function downloadCSV(filename, rows) {
  const csv = '﻿' + rowsToCSV(rows);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** ファイルを UTF-8 で読み、文字化け（�）検出時は Shift-JIS で再読込してテキストを返す */
export function readCsvFile(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onerror = () => reject(new Error('読み込み失敗'));
    r.onload = (ev) => {
      const t = ev.target.result;
      if (t.includes('�')) {
        const r2 = new FileReader();
        r2.onerror = () => reject(new Error('読み込み失敗'));
        r2.onload = (e2) => resolve(e2.target.result);
        r2.readAsText(file, 'Shift-JIS');
      } else resolve(t);
    };
    r.readAsText(file, 'UTF-8');
  });
}
