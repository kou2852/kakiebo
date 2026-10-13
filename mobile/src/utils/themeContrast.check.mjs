// node src/utils/themeContrast.check.mjs
// テーマカラーごとに、文字が読める濃さの差（WCAG のコントラスト比 4.5:1 以上）があるかを確かめる。
//   ボタンの文字（acTx）とボタンの地（ac）／ヒーローの文字（heroTx）とヒーローの地（hero）／
//   カードの上のリンク文字（ac）とカード（bg1）
import assert from 'node:assert/strict';
import { ACCENTS } from './themeAccents.js';

// theme.js の light / dark のうち、テーマカラーで変わらない値と、ティール（既定）の値
const BASE = {
  light: { bg1: '#ffffff', ac: '#0f7a6c', acTx: '#ffffff', hero: '#0f7a6c', heroTx: '#ffffff' },
  dark: { bg1: '#1d2523', ac: '#2dd4bf', acTx: '#04201c', hero: '#10564d', heroTx: '#f2fffd' },
};

const lum = (hex) => {
  const n = parseInt(hex.slice(1), 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
};
const ratio = (a, b) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};

let rows = 0;
for (const [key, accent] of Object.entries(ACCENTS)) {
  for (const mode of ['light', 'dark']) {
    const p = { ...BASE[mode], ...accent[mode] };
    const pairs = [['ボタン', p.acTx, p.ac], ['ヒーロー', p.heroTx, p.hero], ['リンク', p.ac, p.bg1]];
    for (const [what, fg, bg] of pairs) {
      const r = ratio(fg, bg);
      assert.ok(r >= 4.5, `${key} ${mode} ${what}: ${r.toFixed(2)}:1（4.5 未満）`);
      rows++;
    }
  }
}
console.log(`themeContrast: ok（${rows} 組）`);
