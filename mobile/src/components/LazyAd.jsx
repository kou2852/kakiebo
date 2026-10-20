// 画面に近づいたら読み込む広告枠（2026-10-21）。ホームとレポートの一番下の四角、仕訳帳の一覧の4行目の帯が使う。
//
// ・枠が画面から MARGIN の範囲に入るまでは、広告を要求しない（細い目印だけ置く）。ホームを開いただけで
//   一番下の広告まで要求していた。見ない広告を要求すると、表示されない要求が増える
// ・一度近づいたら、そのまま持つ（スクロールで外れても外さない・読み直さない）
// ・位置は、枠が所属する画面のスクロール（ScrollWatch）と、時々の見直しで測る。
//   上の部分の高さが変わって枠が動くことがあるので、スクロールが無くても1秒おきに見直す
// ・スクロールを監視できない場所（ScrollWatch が無い）では、すぐ読み込む
import { useContext, useEffect, useRef, useState } from 'react';
import { Dimensions, View } from 'react-native';
import Ad from './Ad';
import { ScrollWatch } from '../store/scrollWatch';
import { isNear } from '../utils/nearViewport';

// 画面の外でも、この距離（dp）まで近づいたら読み込む。四角の広告は読み込みに1〜3秒かかる
const MARGIN = 500;
const RECHECK_MS = 1000;

export default function LazyAd({ placement, margin = MARGIN }) {
  const ref = useRef(null);
  const watch = useContext(ScrollWatch);
  const [near, setNear] = useState(!watch);

  useEffect(() => {
    if (near || !watch) return undefined;
    const check = () => {
      ref.current?.measureInWindow((x, y, w, h) => {
        // 配置の前（大きさが0）は測れない。0 のままだと「画面の一番上」と誤読して読み込んでしまう
        if (!w && !h) return;
        if (isNear(y, h, Dimensions.get('window').height, margin)) setNear(true);
      });
    };
    check();
    const off = watch.subscribe(check);
    const timer = setInterval(check, RECHECK_MS);
    return () => { off(); clearInterval(timer); };
  }, [near, watch, margin]);

  if (near) return <Ad placement={placement} />;
  // 目印。高さ1で、幅は親いっぱい（位置を測るため）
  return <View ref={ref} collapsable={false} style={{ height: 1, alignSelf: 'stretch' }} />;
}
