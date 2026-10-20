// 広告枠が画面に近づいたか（2026-10-21）。検証: node src/utils/nearViewport.check.mjs
//
// y は枠の上端の画面上の位置、h は枠の高さ、winH は画面の高さ（どれも同じ単位）。
// margin は画面の上下にどれだけ余裕を見るか。画面の外でも、この範囲に入ったら「近い」とする。
// 広告は読み込みに1〜3秒かかるので、見えてから頼むのでは空白を見せてしまう。手前から頼んでおく。
export function isNear(y, h, winH, margin) {
  return y < winH + margin && y + h > -margin;
}
