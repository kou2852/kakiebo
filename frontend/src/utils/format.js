/** 金額フォーマット (¥1,234) */
export function fa(n) {
  return '¥' + Math.round(Math.abs(n)).toLocaleString('ja-JP');
}

/**
 * 残高表示用。負のときだけ符号を付ける (¥1,234 / −¥1,234)。
 * fa() は絶対値表示（仕訳帳の借方/貸方金額列などはそれが正しい）なので、
 * BS・ダッシュボードの「残高」「合計」ではこちらを使い、マイナス残高を隠さない。
 */
export function faBal(n) {
  return n < 0 ? '−' + fa(n) : fa(n);
}

/** 符号付き金額 (+¥1,234 / −¥1,234) */
export function fas(n) {
  return n >= 0
    ? '+¥' + Math.round(n).toLocaleString('ja-JP')
    : '−¥' + Math.round(Math.abs(n)).toLocaleString('ja-JP');
}

/** HTMLエスケープ */
export function esc(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** ローカル日付を YYYY-MM-DD（toISOString は UTC変換でJSTだと1日ずれるため使わない） */
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

/** バッジカラーのCSSクラスマップ */
export const BADGE_CLASSES = {
  asset: 'bdg-a',
  liability: 'bdg-l',
  equity: 'bdg-q',
  income: 'bdg-i',
  expense: 'bdg-e',
};

/** 消費税率選択肢 */
export const TAX_RATES = [0, 8, 10];

/** 円グラフ・チャート用カラーパレット（ティール基調 / Data-forward） */
export const PIE_COLORS = [
  '#0d9488', '#14b8a6', '#10b981', '#0ea5b7', '#5eb0e8', '#8b5cf6', '#f08a3c',
  '#e0a020', '#f43f5e', '#2bb673', '#4ad0a0', '#7fd1c4', '#a78bfa', '#e0556a',
];

/** タグ用カラーパレット */
export const TAG_COLORS = [
  '#0d9488', '#14b8a6', '#10b981', '#5eb0e8', '#8b5cf6', '#f08a3c',
  '#e0a020', '#f43f5e', '#2bb673', '#4ad0a0', '#a78bfa', '#7fd1c4',
];
