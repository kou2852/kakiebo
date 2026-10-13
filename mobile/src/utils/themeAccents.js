// テーマカラーの表（src/theme.js から使う）。React に依存しないよう分けてある（検証 themeContrast.check.mjs）。
// teal は既定の配色（theme.js の light / dark）そのものなので、差し替える項目は無い。
//
// label は画面には出さない（色の丸だけを並べる。2026-10-13 指示）。読み上げ用に残している。
// pieHead はその色の濃淡4段。円グラフの内訳はこれを先頭に、TAIL から同じ系統の色を除いた残りを続ける。
// pieAvoid は TAIL のうち、テーマの色と紛れるので使わない色。
//
// ⚠ ピンクはダークのマイナスの色（#f0697e）と系統が近い。ピンクは紫寄り（マゼンタ）にして離してある。

// 円グラフの後半に使う、テーマの色と系統の違う色（並びは見分けやすい順）
const TAIL = ['#3f7cad', '#7c6bb0', '#d98324', '#cf4436', '#a8563f', '#5b9e6a', '#8ab8a0', '#b0a58c', '#0f7a6c', '#57b8a8'];

export const ACCENTS = {
  teal: {
    label: 'ティール',
    light: {},
    dark: {},
    pieHead: ['#0f7a6c', '#2f9e8d', '#57b8a8', '#82cdc0'],
    pieAvoid: ['#0f7a6c', '#57b8a8'],
  },
  navy: {
    label: 'ネイビー',
    light: { ac: '#2f5d9e', acDeep: '#234a80', acb: '#e8eef7', hero: '#2f5d9e' },
    dark: { ac: '#86b6ff', acDeep: '#1f3f6e', acb: 'rgba(134,182,255,.14)', acTx: '#071a33', hero: '#1f3f6e', heroTx: '#f2f7ff', heroSub: 'rgba(242,247,255,.86)' },
    pieHead: ['#2f5d9e', '#4f7fc0', '#7ea3d6', '#adc6ea'],
    pieAvoid: ['#3f7cad'],
  },
  sky: {
    label: 'スカイ',
    light: { ac: '#0b6fa4', acDeep: '#095a85', acb: '#e5f2f9', hero: '#0b6fa4' },
    dark: { ac: '#7cc7f2', acDeep: '#0e4a6b', acb: 'rgba(124,199,242,.14)', acTx: '#04192a', hero: '#0e4a6b', heroTx: '#f0f9ff', heroSub: 'rgba(240,249,255,.86)' },
    pieHead: ['#0b6fa4', '#3a91c2', '#72b3da', '#a9d3ec'],
    pieAvoid: ['#3f7cad'],
  },
  purple: {
    label: 'パープル',
    light: { ac: '#6a4fa3', acDeep: '#553e86', acb: '#efebf7', hero: '#6a4fa3' },
    dark: { ac: '#bba6ff', acDeep: '#432f73', acb: 'rgba(187,166,255,.14)', acTx: '#1a1033', hero: '#432f73', heroTx: '#f7f3ff', heroSub: 'rgba(247,243,255,.86)' },
    pieHead: ['#6a4fa3', '#8a6fc4', '#ab95db', '#cdbfee'],
    pieAvoid: ['#7c6bb0'],
  },
  pink: {
    label: 'ピンク',
    light: { ac: '#b5307a', acDeep: '#922663', acb: '#f8e8f1', hero: '#b5307a' },
    dark: { ac: '#f59ccf', acDeep: '#6e1f4b', acb: 'rgba(245,156,207,.14)', acTx: '#2a0a1c', hero: '#6e1f4b', heroTx: '#fff2f9', heroSub: 'rgba(255,242,249,.86)' },
    pieHead: ['#b5307a', '#cf5a99', '#e08bba', '#efbcd8'],
    pieAvoid: ['#cf4436', '#7c6bb0'],
  },
  green: {
    label: 'グリーン',
    light: { ac: '#2e7d32', acDeep: '#236227', acb: '#e7f3e8', hero: '#2e7d32' },
    dark: { ac: '#7bd88a', acDeep: '#1f5626', acb: 'rgba(123,216,138,.14)', acTx: '#06200a', hero: '#1f5626', heroTx: '#f2fff3', heroSub: 'rgba(242,255,243,.86)' },
    pieHead: ['#2e7d32', '#4f9d53', '#7dbb80', '#acd7ae'],
    pieAvoid: ['#5b9e6a', '#8ab8a0'],
  },
  olive: {
    label: 'オリーブ',
    light: { ac: '#5b6b16', acDeep: '#465312', acb: '#eef1e2', hero: '#5b6b16' },
    dark: { ac: '#c3d27a', acDeep: '#3f4a12', acb: 'rgba(195,210,122,.14)', acTx: '#1a2005', hero: '#3f4a12', heroTx: '#f8fbea', heroSub: 'rgba(248,251,234,.86)' },
    pieHead: ['#5b6b16', '#7c8c35', '#a2b064', '#c8d29a'],
    pieAvoid: ['#5b9e6a', '#b0a58c'],
  },
  brown: {
    label: 'ブラウン',
    light: { ac: '#7a5230', acDeep: '#5f3f24', acb: '#f3ece5', hero: '#7a5230' },
    dark: { ac: '#d9b48e', acDeep: '#5a3d24', acb: 'rgba(217,180,142,.14)', acTx: '#24170b', hero: '#5a3d24', heroTx: '#fbf5ef', heroSub: 'rgba(251,245,239,.86)' },
    pieHead: ['#7a5230', '#9a7350', '#bc997a', '#dcc4ad'],
    pieAvoid: ['#a8563f', '#b0a58c', '#d98324'],
  },
  graphite: {
    label: 'グラファイト',
    light: { ac: '#3d4650', acDeep: '#2b323a', acb: '#eceef0', hero: '#3d4650' },
    dark: { ac: '#d0d6dc', acDeep: '#39424b', acb: 'rgba(208,214,220,.12)', acTx: '#111417', hero: '#39424b', heroTx: '#f5f7f9', heroSub: 'rgba(245,247,249,.86)' },
    pieHead: ['#3d4650', '#5f6a75', '#8a949e', '#b7bec5'],
    pieAvoid: [],
  },
};

/** テーマカラーの円グラフの色（12色）。濃淡4段のあと、系統の違う色を続ける */
export function pieColors(accent) {
  const a = ACCENTS[accent] || ACCENTS.teal;
  return [...a.pieHead, ...TAIL.filter((c) => !a.pieAvoid.includes(c) && !a.pieHead.includes(c))].slice(0, 12);
}
