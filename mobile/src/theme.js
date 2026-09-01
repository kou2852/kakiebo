// 配色。デザイン案「ダッシュボード型（配色①ミニマル・カード型）」に合わせたもの。
//
// 元は Web 版 styles/variables.css の移植だったが、モバイルは別設計にすると決めたので
// ここで分岐した。ティールはブランド色として維持し、それ以外は色数を絞っている。
//
// 増減は色でしか区別しない（正=ティール / 負=レッド）。緑は使わない。
// 家計簿では「増えた/減った」が読めれば足り、色を増やすほど数字が読みにくくなる。
import { createContext, useContext } from 'react';
import { useColorScheme } from 'react-native';

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

// 内訳の配色。ティールから離れすぎない範囲で並べ、隣り合う色が混同されないようにする。
export const PIE_COLORS = [
  '#0f7a6c', '#2f9e8d', '#57b8a8', '#82cdc0', '#3f7cad', '#7c6bb0',
  '#d98324', '#cf4436', '#a8563f', '#5b9e6a', '#8ab8a0', '#b0a58c',
];

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
    palette: scheme === 'light' ? light : dark,
  };
}
