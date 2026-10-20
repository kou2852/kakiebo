// 広告枠が近づいたかの検算。 node src/utils/nearViewport.check.mjs
import { isNear } from './nearViewport.js';

let ng = 0;
const check = (name, ok) => { console.log((ok ? '  ok   ' : '  NG   ') + name); if (!ok) ng++; };
const H = 800;
const M = 400;

check('画面の中は近い', isNear(300, 250, H, M));
check('画面のすぐ下（余裕の内）は近い', isNear(H + 399, 250, H, M));
check('画面の下、余裕の外は近くない', !isNear(H + 400, 250, H, M));
check('画面の上に外れた直後（余裕の内）は近い', isNear(-250 - 399, 250, H, M));
check('画面の上、余裕の外は近くない', !isNear(-250 - 400, 250, H, M));
check('余裕が0なら、画面にかかっているときだけ近い', isNear(H - 1, 250, H, 0) && !isNear(H, 250, H, 0));
check('長いページの下のほう（スクロール前のホームの一番下）は近くない', !isNear(3200, 250, H, M));
check('そこまでスクロールが進めば近い（枠が画面の下 300 に来た）', isNear(H + 300, 250, H, M));

console.log(ng ? `\nNG ${ng}` : '\n全部OK');
process.exit(ng ? 1 : 0);
