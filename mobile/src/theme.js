// 配色。デザイン案「ダッシュボード型（配色①ミニマル・カード型）」に合わせたもの。
//
// 元は Web 版 styles/variables.css の移植だったが、モバイルは別設計にすると決めたので
// ここで分岐した。ティールはブランド色として維持し、それ以外は色数を絞っている。
//
// 増減は色でしか区別しない（正=ティール / 負=レッド）。緑は使わない。
// 家計簿では「増えた/減った」が読めれば足り、色を増やすほど数字が読みにくくなる。
import { createContext, useContext } from 'react';
import { useColorScheme } from 'react-native';
import { ACCENTS, pieColors } from './utils/themeAccents';

export const light = {
  ac: '#0f7a6c', acDeep: '#0b6055', acb: '#e6f2f0', acTx: '#ffffff',
  hero: '#0f7a6c', heroTx: '#ffffff', heroSub: 'rgba(255,255,255,.88)',

  bg0: '#f4f5f6',   // 画面の地
  bg1: '#ffffff',   // カード
  bg2: '#ffffff',
  bg3: '#f0f2f3',   // 入力欄・チップの地
  bg4: '#e8ebed',
  bd: '#e5e8ea', bd2: '#d5dadd',

  // 小さい文字に使うので WCAG AA（4.5:1）を下回らせない。tx3 は 2.59:1 だった。
  tx: '#16191c', tx2: '#5c656d', tx3: '#6d767e',

  // 増減。緑は使わず、正はブランド色に寄せる。
  grn: '#0f7a6c', red: '#cf4436',
  blu: '#3f7cad', pur: '#7c6bb0',
  warn: 'rgba(217,131,36,.12)',

  // 影で階層を作る。枠線を減らすと画面が箱だらけに見えなくなる。
  shadow: {
    shadowColor: '#101820', shadowOpacity: 0.07, shadowRadius: 10,
    shadowOffset: { width: 0, height: 2 }, elevation: 2,
  },
};

export const dark = {
  ac: '#2dd4bf', acDeep: '#0d5b52', acb: 'rgba(45,212,191,.14)', acTx: '#04201c',
  // ダークでは ac（明るいミント）を面に使わない。白文字が沈むので濃い側を地にする。
  hero: '#10564d', heroTx: '#f2fffd', heroSub: 'rgba(242,255,253,.86)',

  // 影はダークでは見えない。カードと地の明度差がそのまま階層になるので、差を広げる。
  bg0: '#0f1413',
  bg1: '#1d2523',
  bg2: '#222b29',
  bg3: '#2a3331',
  bg4: '#39433f',
  bd: '#333d3b', bd2: '#4a5551',

  // tx3 は 4.40:1 で小さい文字には不足していた。
  tx: '#f1f7f6', tx2: '#c3cfcb', tx3: '#9daba7',

  grn: '#34d399', red: '#f0697e',
  blu: '#5eb0e8', pur: '#a78bfa',
  warn: 'rgba(224,160,32,.16)',

  shadow: {
    shadowColor: '#000', shadowOpacity: 0.35, shadowRadius: 10,
    shadowOffset: { width: 0, height: 2 }, elevation: 3,
  },
};

// テーマカラー（2026-10-13 追加）。ライト・ダークとは別に選べる、アクセントの色だけの差し替え。
// 変えるのはボタン・選択中・ヒーローカードなどのアクセントだけで、地・文字・増減の色（grn / red）は変えない。
// 増減の色まで変えると「プラスが何色か」が配色ごとに変わって読み違えるため。
// 赤・橙に寄った色はマイナス（red）や警告と紛れるので入れない。
// どの色も、ボタンの文字（acTx）とヒーローの白文字、カード上のリンク文字（ac）が
// WCAG AA（4.5:1）を満たすようにしてある（検証 utils/themeContrast.check.mjs）。
export { ACCENTS };

/** 配色（ライト・ダーク）にテーマカラーを重ねたもの */
export function paletteFor(resolved, accent) {
  return { ...PALETTES[resolved], ...(ACCENTS[accent] || ACCENTS.teal)[resolved], pie: pieColors(accent) };
}

// 内訳（円グラフ）の配色。テーマカラーごとに変わる（utils/themeAccents.js の pieColors）。
// 色はパレットの pie で受け取る（useTheme().pie）。ここはティールの並び。
export const PIE_COLORS = pieColors('teal');

// 配色の設定は ThemeProvider が持つ。Provider を通さずに useTheme を呼んでも
// 落ちないよう、その場合は端末設定にフォールバックする。
export const ThemeCtx = createContext(null);

export const PALETTES = { light, dark };

export function useTheme() {
  const ctx = useContext(ThemeCtx);
  const scheme = useColorScheme();
  if (ctx) return ctx.palette;
  return scheme === 'light' ? light : dark;
}

/** 配色の設定（'auto' | 'light' | 'dark'）と、実際に適用されている側。 */
export function useThemeMode() {
  const ctx = useContext(ThemeCtx);
  const scheme = useColorScheme();
  return ctx || {
    mode: 'auto',
    resolved: scheme === 'light' ? 'light' : 'dark',
    setMode: () => {},
    accent: 'teal',
    setAccent: () => {},
    palette: scheme === 'light' ? light : dark,
  };
}
