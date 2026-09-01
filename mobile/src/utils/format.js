// frontend/src/utils/format.js の移植（HTML 専用の esc / CSS クラスマップは持ってこない）。

/** 金額フォーマット (¥1,234)。絶対値表示。 */
export function fa(n) {
  return '¥' + Math.round(Math.abs(n)).toLocaleString('ja-JP');
}

/** 残高表示用。負のときだけ符号を付ける（マイナス残高を隠さない）。 */
export function faBal(n) {
  return n < 0 ? '−' + fa(n) : fa(n);
}

/** 符号付き金額 (+¥1,234 / −¥1,234) */
export function fas(n) {
  return n >= 0
    ? '+¥' + Math.round(n).toLocaleString('ja-JP')
    : '−¥' + Math.round(Math.abs(n)).toLocaleString('ja-JP');
}

/** ローカル日付を YYYY-MM-DD（toISOString は UTC 変換で JST だと1日ずれるため使わない） */
export function ymd(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** 今日の日付 YYYY-MM-DD（ローカル） */
export function today() {
  return ymd(new Date());
}

/** ユニークID生成 */
export function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

/** 勘定科目区分の日本語マップ */
export const ACCOUNT_TYPES = {
  asset: '資産',
  liability: '負債',
  equity: '純資産',
  income: '収益',
  expense: '費用',
};

/** 消費税率選択肢 */
export const TAX_RATES = [0, 8, 10];
