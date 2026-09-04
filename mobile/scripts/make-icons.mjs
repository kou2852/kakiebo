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

const INSET = 2;

const NEAR = 32;  // これ以下は背景とみなして透明
const FAR = 78;   // これ以上は図柄とみなして不透明
const alphaFrom = (dist) =>
  Math.max(0, Math.min(255, Math.round(((dist - NEAR) / (FAR - NEAR)) * 255)));

// 判定に使う線分（元の2色 → 置き換え後の2色）
const EDGES = [
  { a: BG, b: WH, na: NEW_BG, nb: NEW_WH },
  { a: BG, b: WING, na: NEW_BG, nb: NEW_WING },
  { a: WH, b: WING, na: NEW_WH, nb: NEW_WING },
];

// 背景からどれだけ離れているかで不透明度を決める。
// 単純な比例だと、背景にわずかにある濃淡（距離20前後）まで3割ほど残ってしまい、
// 図柄の後ろに角丸四角の影が浮く（実際に出た）。手前に不感帯を置いて完全に抜く。
// 元画像の最外周に書き出し時の縁が1px入っている。使わない。
const sub = (p, q) => [p[0] - q[0], p[1] - q[1], p[2] - q[2]];
const dot = (p, q) => p[0] * q[0] + p[1] * q[1] + p[2] * q[2];
const lerp = (p, q, t) => [0, 1, 2].map((i) => Math.round(p[i] + (q[i] - p[i]) * t));

/** 画素を、最も近い線分に射影して置き換える */
function mapColor(px) {
  // 背景に十分近い画素は、混ぜずに置き換え後の背景そのものにする。
  // 元画像の四隅には角丸の輪郭がうっすら残っており（背景からの距離26ほど）、
  // 線分に射影すると薄い灰色になる。元の濃い背景では見えないが、白へ反転すると
  // 角丸の幽霊として浮き上がる（実際に浮いた）。透明度の判定と同じ閾値で切る。
  if (Math.hypot(px[0] - BG[0], px[1] - BG[1], px[2] - BG[2]) < NEAR) return NEW_BG;

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
 * @param opts.original       白と緑を入れ替えず元の配色のまま使う（暗い背景に置く用）
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
      // 最外周は使わない。元画像の x=0 に書き出し時の明るい縁が1px入っており、
      // 背景を抜くとそこだけ図柄として残って、スプラッシュに縦線が出る（実際に出た）。
      const fx = INSET + (x - off) / inner * (s - INSET * 2);
      const fy = INSET + (y - off) / inner * (s - INSET * 2);
      if (fx < 0 || fy < 0 || fx >= s || fy >= s) { out.data[di + 3] = 0; continue; }

      const si = (Math.floor(fy) * s + Math.floor(fx)) * 4;
      const px = [src.data[si], src.data[si + 1], src.data[si + 2]];

      // 暗い背景に置く版は、入れ替えをせず元の配色（白いフクロウ）をそのまま使い、
      // 背景のティールだけを抜く。入れ替えた濃いティールの図柄を暗い背景に置くと
      // ほとんど見えない。
      if (opts.original) {
        out.data[di] = px[0]; out.data[di + 1] = px[1]; out.data[di + 2] = px[2];
        out.data[di + 3] = alphaFrom(Math.hypot(px[0] - BG[0], px[1] - BG[1], px[2] - BG[2]));
        continue;
      }

      const c = mapColor(px);

      if (opts.transparentBg || opts.mono) {
        // 白（＝置き換え後の背景）に近いほど透明にする。図柄だけを残す。
        const alpha = alphaFrom(Math.hypot(c[0] - NEW_BG[0], c[1] - NEW_BG[1], c[2] - NEW_BG[2]));
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

/**
 * 図柄とつながっていない小さな塊を消す。
 *
 * 元画像の縁には、書き出し時に生じたと思われる明るい画素が散っている。
 * α=255 まで出るので閾値では落とせず、そのままだとスプラッシュの余白に
 * ごみとして浮く（実際に出た）。連結成分の面積で判定して捨てる。
 */
function dropSpecks(png, minArea) {
  const { width: w, height: h, data } = png;
  const label = new Int32Array(w * h).fill(-1);
  const areas = [];
  const stack = [];

  for (let i = 0; i < w * h; i++) {
    if (label[i] !== -1 || data[i * 4 + 3] <= 8) continue;
    const id = areas.length;
    let area = 0;
    stack.push(i);
    label[i] = id;
    while (stack.length) {
      const p = stack.pop();
      area++;
      const x = p % w;
      const y = (p / w) | 0;
      // 斜めも隣とみなす。1px幅の線が対角に繋がる図柄を割らないため。
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          const q = ny * w + nx;
          if (label[q] !== -1 || data[q * 4 + 3] <= 8) continue;
          label[q] = id;
          stack.push(q);
        }
      }
    }
    areas.push(area);
  }

  let dropped = 0;
  for (let i = 0; i < w * h; i++) {
    const id = label[i];
    if (id >= 0 && areas[id] < minArea) { data[i * 4 + 3] = 0; dropped++; }
  }
  const kept = areas.filter((a) => a >= minArea);
  console.log(`     連結成分 ${areas.length} → 残 ${kept.length}（${dropped}px を除去）`);
  return png;
}

/**
 * 図柄を画布の中央へ寄せる。
 *
 * 元画像の図柄は中心からずれており（下の余白が上の半分ほど）、
 * 背景を抜いて単独で置くと下端に寄って「切れている」ように見える。
 * 拡大縮小はせず平行移動だけにする（再標本化で輪郭が甘くなるのを避ける）。
 */
function centerFigure(png) {
  const { width: w, height: h, data } = png;
  let x0 = w; let y0 = h; let x1 = -1; let y1 = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (data[(y * w + x) * 4 + 3] <= 8) continue;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  }
  if (x1 < 0) return png;

  const dx = Math.round((w - (x1 - x0 + 1)) / 2) - x0;
  const dy = Math.round((h - (y1 - y0 + 1)) / 2) - y0;
  if (!dx && !dy) return png;

  const out = new PNG({ width: w, height: h });
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const src2 = ((y - dy) * w + (x - dx)) * 4;
      const di = (y * w + x) * 4;
      const inside = x - dx >= 0 && x - dx < w && y - dy >= 0 && y - dy < h;
      out.data[di] = inside ? data[src2] : 0;
      out.data[di + 1] = inside ? data[src2 + 1] : 0;
      out.data[di + 2] = inside ? data[src2 + 2] : 0;
      out.data[di + 3] = inside ? data[src2 + 3] : 0;
    }
  }
  console.log(`     中央へ ${dx > 0 ? '+' : ''}${dx}, ${dy > 0 ? '+' : ''}${dy} px 移動`);
  return out;
}

/**
 * 透過の図柄を単色の地に貼って、不透明な画像にする。
 *
 * 不透明なアイコンを元画像から直に作ると、元画像の隅に散っているごみ
 * （明るい画素が100個ほど、背景からの距離は最大235）まで図柄として写り、
 * 白へ反転したときに角丸の幽霊のような汚れになる（実際になった）。
 * アルファで掃除した図柄を地に貼れば、その経路を通らない。
 */
function flatten(png, bg) {
  const { width: w, height: h, data } = png;
  const out = new PNG({ width: w, height: h });
  for (let i = 0; i < w * h; i++) {
    const a = data[i * 4 + 3] / 255;
    for (let c = 0; c < 3; c++) {
      out.data[i * 4 + c] = Math.round(data[i * 4 + c] * a + bg[c] * (1 - a));
    }
    out.data[i * 4 + 3] = 255;
  }
  return out;
}

/** 掃除して中央へ寄せた図柄（透過）。すべての出力の元にする。 */
function figure(size, opts = {}) {
  // 画布に対する比で足切りする。96px のファビコンと 1024px のアイコンで
  // 同じ絶対値を使うと、小さい方は図柄まで消える。
  const minArea = Math.max(4, Math.round(size * size * 0.0004));
  return centerFigure(dropSpecks(render(size, { transparentBg: true, ...opts }), minArea));
}

const write = (name, png) => {
  fs.writeFileSync(OUT(name), PNG.sync.write(png));
  console.log('  ', name, png.width + 'px');
};

write('icon.png', flatten(figure(1024), NEW_BG));
write('favicon.png', flatten(figure(96), NEW_BG));
// Android は前景・背景・モノクロの3枚。前景は安全領域（中央66%）に収める。
write('android-icon-background.png', render(1024, { solid: NEW_BG }));
write('android-icon-foreground.png', figure(1024, { scale: 0.62 }));
write('android-icon-monochrome.png', centerFigure(dropSpecks(render(1024, { mono: true, scale: 0.62 }), 400)));
// スプラッシュは明暗で図柄を替える。地の色は app.json 側で指定する。
write('splash-icon.png', figure(512));
write('splash-icon-dark.png', centerFigure(dropSpecks(render(512, { original: true }), 100)));
console.log('完了');
