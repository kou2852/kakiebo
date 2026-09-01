// アプリのアイコンを Web 版から作る。白とティールを入れ替えたもの。
//
// 元は3色構成: 背景ティール #156463 / フクロウと棒グラフの白 / 翼の薄いティール #47aba8。
//
// 単純な色置換だとアンチエイリアスの中間色が取り残されて輪郭がギザつく。
// かといって「3色への近さ」で加重合成すると、背景にわずかにある濃淡を増幅してしまい、
// 白地にうっすら模様が出る（実際に出た）。
//
// そこで、画素を「どの2色の間にあるか」で判定し、その線分上の位置をそのまま
// 置き換え後の2色の間に写す。アンチエイリアスは正しく保たれ、背景の微差は
// 線分の端に丸められるので影響しない。
//
// 実行: node scripts/make-icons.mjs
import fs from 'node:fs';
import { PNG } from 'pngjs';

const SRC = new URL('../../frontend/public/icon-512.png', import.meta.url);
const OUT = (name) => new URL(`../assets/${name}`, import.meta.url);

const BG = [0x15, 0x64, 0x63];   // 背景のティール
const WH = [0xfe, 0xfe, 0xfe];   // フクロウの輪郭・棒グラフ
const WING = [0x47, 0xab, 0xa8]; // 翼

// 入れ替え後
const NEW_BG = [0xff, 0xff, 0xff];   // 背景 → 白
const NEW_WH = [0x11, 0x5e, 0x5c];   // 白 → 濃いティール
const NEW_WING = [0x2f, 0x93, 0x90]; // 翼は白地で沈まないよう少し濃くする

// 判定に使う線分（元の2色 → 置き換え後の2色）
const EDGES = [
  { a: BG, b: WH, na: NEW_BG, nb: NEW_WH },
  { a: BG, b: WING, na: NEW_BG, nb: NEW_WING },
  { a: WH, b: WING, na: NEW_WH, nb: NEW_WING },
];

const sub = (p, q) => [p[0] - q[0], p[1] - q[1], p[2] - q[2]];
const dot = (p, q) => p[0] * q[0] + p[1] * q[1] + p[2] * q[2];
const lerp = (p, q, t) => [0, 1, 2].map((i) => Math.round(p[i] + (q[i] - p[i]) * t));

/** 画素を、最も近い線分に射影して置き換える */
function mapColor(px) {
  let best = null;
  for (const e of EDGES) {
    const ab = sub(e.b, e.a);
    const t = Math.max(0, Math.min(1, dot(sub(px, e.a), ab) / dot(ab, ab)));
    const on = lerp(e.a, e.b, t);
    const d = dot(sub(px, on), sub(px, on)); // 線分までの距離（二乗）
    if (!best || d < best.d) best = { d, t, e };
  }
  return lerp(best.e.na, best.e.nb, best.t);
}

const src = PNG.sync.read(fs.readFileSync(SRC));

/**
 * @param size    出力サイズ
 * @param opts.transparentBg  背景を透明にする（Android の前景・スプラッシュ用）
 * @param opts.scale          中央に置く倍率（Android は安全領域が狭いので縮める）
 * @param opts.solid          単色で塗りつぶす（背景レイヤー用）
 * @param opts.mono           不透明部分を黒一色にする（モノクロレイヤー用）
 */
function render(size, opts = {}) {
  const out = new PNG({ width: size, height: size });
  const s = src.width;
  const scale = opts.scale || 1;
  const inner = size * scale;
  const off = (size - inner) / 2;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const di = (y * size + x) * 4;

      if (opts.solid) {
        out.data[di] = opts.solid[0]; out.data[di + 1] = opts.solid[1];
        out.data[di + 2] = opts.solid[2]; out.data[di + 3] = 255;
        continue;
      }

      // 元画像のどの点にあたるか（最近傍。512→1024 は 2x2 に広がるだけで劣化しない）
      const fx = (x - off) / inner * s;
      const fy = (y - off) / inner * s;
      if (fx < 0 || fy < 0 || fx >= s || fy >= s) { out.data[di + 3] = 0; continue; }

      const si = (Math.floor(fy) * s + Math.floor(fx)) * 4;
      const px = [src.data[si], src.data[si + 1], src.data[si + 2]];
      const c = mapColor(px);

      if (opts.transparentBg || opts.mono) {
        // 白（＝置き換え後の背景）に近いほど透明にする。図柄だけを残す。
        const toBg = Math.hypot(c[0] - NEW_BG[0], c[1] - NEW_BG[1], c[2] - NEW_BG[2]);
        const alpha = Math.max(0, Math.min(255, Math.round((toBg / 60) * 255)));
        if (opts.mono) { out.data[di] = 0; out.data[di + 1] = 0; out.data[di + 2] = 0; }
        else { out.data[di] = c[0]; out.data[di + 1] = c[1]; out.data[di + 2] = c[2]; }
        out.data[di + 3] = alpha;
      } else {
        out.data[di] = c[0]; out.data[di + 1] = c[1]; out.data[di + 2] = c[2];
        // iOS のアイコンは透過を許さない。角丸は OS が付けるので正方形のまま出す。
        out.data[di + 3] = 255;
      }
    }
  }
  return out;
}

const write = (name, png) => {
  fs.writeFileSync(OUT(name), PNG.sync.write(png));
  console.log('  ', name, png.width + 'px');
};

write('icon.png', render(1024));
write('favicon.png', render(96));
// Android は前景・背景・モノクロの3枚。前景は安全領域（中央66%）に収める。
write('android-icon-background.png', render(1024, { solid: NEW_BG }));
write('android-icon-foreground.png', render(1024, { transparentBg: true, scale: 0.62 }));
write('android-icon-monochrome.png', render(1024, { mono: true, scale: 0.62 }));
write('splash-icon.png', render(512, { transparentBg: true }));
console.log('完了');
