// ツアーの見た目。指し示す要素の周りを暗くし、その近くに吹き出しを出す。
//
// 穴あきの暗幕は、対象の上下左右に4枚の半透明な View を敷いて作っている。
// SVG のマスクを使う手もあるが、そのために依存を増やすほどの見た目ではない。
//
// ⚠ Modal は使わない。Modal は別ウィンドウとして描かれるため、
// measureInWindow が返すアプリ窓の座標とずれ、指す位置が合わなくなる。
// アプリと同じ窓に絶対配置すれば、測った座標をそのまま使える。
import { useEffect, useRef, useState } from 'react';
import { Platform, Pressable, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../theme';
import { useTour } from '../store/TourProvider';
import { CIRCLED, SETUP, TAB_TARGETS, TOURS, TOUR_MENU, isInteractive } from '../tours';
import { Button } from './ui';

// 対象が見つからないときは穴を開けず、中央の吹き出しだけ出す。
// 間違った場所を指すくらいなら指さない方がよい。
const SPOTLIGHT = true;

const VEIL = 'rgba(0,0,0,0.62)';
const PAD = 6;      // 穴を対象より少し広く取る
const GAP = 12;     // 穴と吹き出しの間隔

export default function Tour() {
  const t = useTheme();
  const { height: SH, width: SW } = useWindowDimensions();
  // Android はエッジ・ツー・エッジで窓がナビゲーションバーの下まで来る。覆いをその上までにして、
  // 吹き出しの「次へ」などがナビバーに重ならないようにする。
  const insets = useSafeAreaInsets();
  const navInset = Platform.OS === 'android' ? insets.bottom : 0;
  const tour = useTour();
  // この覆い自身の窓座標。対象と同じ関数で測り、差を取って覆いの中の位置にする。
  // 対象の measureInWindow をそのまま使うと 48dp ほど上へずれた（実測）。
  // ずれの出どころを理屈で当てるより、同じ物差しで測った差を使う方が確実。
  const rootRef = useRef(null);
  const [origin, setOrigin] = useState({ x: 0, y: 0 });
  // 覆いの大きさ。窓の寸法とは原点も高さも違うので、位置の計算にはこちらを使う。
  const [box, setBox] = useState({ w: 0, h: 0 });
  // 吹き出しの高さ。下に入るかの判定に使う。決め打ちの数値だと、
  // 文字を大きくしている端末や小さい画面で判断を誤る。
  const [bubbleH, setBubbleH] = useState(0);
  const onRootLayout = (e) => {
    const { width, height } = e.nativeEvent.layout;
    setBox((b) => (Math.abs(b.w - width) < 1 && Math.abs(b.h - height) < 1 ? b : { w: width, h: height }));
    const node = rootRef.current;
    if (node?.measureInWindow) {
      node.measureInWindow((x, y) => {
        setOrigin((o) => (Math.abs(o.x - x) < 1 && Math.abs(o.y - y) < 1 ? o : { x, y }));
      });
    }
  };
  // 押させる段は、指す先を測り終えるまで吹き出しを出さない（最長 0.8 秒。2026-10-18 に 1.5 秒から短くした）。
  // 測る前は吹き出しが下端に出てタブを覆い、タブを押したつもりが吹き出しのボタンを押していた（実測）
  const stepKey = `${tour?.tourId}:${tour?.index}`;
  const [waited, setWaited] = useState(null);
  useEffect(() => {
    const id = setTimeout(() => setWaited(stepKey), 800);
    return () => clearTimeout(id);
  }, [stepKey]);

  if (!tour?.step) return null;

  const { step, pos, total, last, rect, stop, prev, nextOrStop, start, setCover, goto, skip } = tour;

  // 設定のツアー（①〜⑤）の最後の段から、次の設定のツアーへ。次へ進めるのは①〜⑤の中だけ。
  // 番号は使い方の画面と同じ（ほかのツアーは⑥から）
  const at = SETUP.indexOf(tour.tourId);
  const nextSetup = last && at >= 0 && at < SETUP.length - 1 ? SETUP[at + 1] : null;
  const num = TOUR_MENU.indexOf(tour.tourId);


  // 操作を待つステップでは、画面を塞がない。
  //
  // 「実際に操作すると次へ進みます」と言いながら吹き出しが入力欄と保存ボタンを
  // 覆ってしまい、操作できなかった（実際にそうなった）。この間は暗幕を出さず、
  // 吹き出しも下端へ寄せて畳む。対象の枠だけ残して、どこを触ればよいかは示す。
  // 本人に押させる段（タブ・メニュー・追加・保存）も同じ。暗幕があると押せない
  const gated = isInteractive(step);
  // 操作したら自動で進む段か（「次へ」で進む段との違いを書き添える）
  const auto = !!(step.awaitJournal || step.awaitAccount || step.awaitPath || step.awaitShown || step.awaitSave);

  // 穴の位置。対象が見つからなければ吹き出しだけ中央に出す。
  // 覆いの下端（ナビゲーションバーの上）からはみ出す分は切る。切った残りが低すぎれば指さない（バーの裏に枠の切れ端だけが出る）
  const boxH = box.h || SH;
  const holeY = rect ? Math.max(0, rect.y - origin.y - PAD) : 0;
  const holeH = rect ? Math.min(rect.height + PAD * 2, boxH - holeY) : 0;
  // 入力して「保存」を押す段・記帳する段は枠を出さない（2026-10-18 指示）。入れる欄が枠の外にあり、枠が保存ボタンだけだと
  // 何を押すのか紛らわしい。吹き出しは下端に置き、下に余白を足して、保存までスクロールで届くようにする
  const noFrame = !!(step.awaitSave || step.awaitJournal) && !step.frame;
  const hole = SPOTLIGHT && rect && holeH > 24 && !noFrame ? {
    x: Math.max(0, rect.x - origin.x - PAD),
    y: holeY,
    w: rect.width + PAD * 2,
    h: holeH,
  } : null;
  // 指す先を測り終えたか（押させる段だけ待つ）
  const waitedOut = waited === stepKey;
  const ready = !gated || !step.target || noFrame || !!rect || waitedOut;

  // 吹き出しの置き場所（2026-10-18 指示）。指す枠があれば、その直下に置き、下に入らなければ直上に置く。
  // 枠が上・吹き出しが下端と離れていると、吹き出しを見つけにくく迷う。枠が無ければ画面の真ん中。
  // 押させる段で、枠の上下どちらにも入らない（枠が無い・枠が高い）ときだけ、画面を塞がないよう下端に置く。
  // 高さは実測値を使う（初回だけ 240 で仮置き）。
  const need = (bubbleH || 240) + GAP;
  const W = box.w || SW;
  const H = box.h || SH;
  const below = !!hole && H - (hole.y + hole.h) > need;
  const above = !!hole && hole.y - insets.top > need;
  // bubble: 'above' の段は直上を先に使う（枠の下に押してほしいもの＝カードの一覧があるとき。直下に置くと一覧を覆う）
  const preferAbove = step.bubble === 'above';
  // 入力して「保存」を押す段・記帳する段は、枠（保存ボタン）の上に入れる欄がある。直上に置くと欄を覆って入れられない
  // （実機 Pixel 6a で、残高の欄が吹き出しに隠れた。2026-10-18）。直下に入るときだけ直下、入らなければ下端に置く
  const inputStep = !!(step.awaitSave || step.awaitJournal);
  const place = inputStep ? (below ? { top: hole.y + hole.h + GAP } : null)
    : preferAbove && above ? { bottom: H - hole.y + GAP }
    : below ? { top: hole.y + hole.h + GAP } : above ? { bottom: H - hole.y + GAP } : null;
  // 押させる段で枠の周りを暗くするか（タブ・メニュー・一覧を押す段だけ。入力して保存する段は暗くしない）
  const veil = !!(step.awaitPath || step.awaitShown);
  // 明るく残す範囲。下のタブを指すときは、タブの帯（枠の上端から下まで、横いっぱい）
  const onTabBar = TAB_TARGETS.includes(step.target);
  const lit = hole && onTabBar ? { x: 0, y: hole.y, w: W, h: H - hole.y } : hole;
  // 測っている間も、画面全体を先に暗くしておく（2026-10-18）。測れたら枠の所だけ明るく抜く。
  // 「何も出ない時間」を見た目の上でなくすため。暗い間は押せないが、長くて 0.3 秒ほど。0.8 秒たっても測れなければ外す
  const fullVeil = gated && veil && !!step.target && !hole && !waitedOut;
  // 押させる段で、吹き出しを下端に置くとき（その高さだけ画面の下に余白を足して、隠れた部品をスクロールで出せるようにする）
  const atEdge = gated && !place;

  const bubble = {
    // 画面のカードと見分けが付くよう、地をほんの少し暗くし、緑の細い枠を付ける（2026-10-18 指示）
    backgroundColor: t.bg0,
    borderWidth: 1.5,
    borderColor: t.ac,
    borderRadius: 14,
    padding: 16,
    gap: 10,
    marginHorizontal: 14,
    // タブレットで全幅に伸びると読みにくい。supportsTablet: true なので効いてくる。
    maxWidth: 520,
    alignSelf: 'center',
    width: '100%',
    ...t.shadow,
  };

  const content = (
    <View style={bubble} onLayout={(e) => {
      const h = e.nativeEvent.layout.height;
      setBubbleH((v) => (Math.abs(v - h) < 1 ? v : h));
      // 押させる段で吹き出しが下端に居座るときは、その高さだけ画面の下に余白を足してもらう
      setCover(atEdge ? Math.round(h) : 0);
    }}>
      <Text style={{ color: t.tx3, fontSize: 12.5, fontWeight: '700' }}>
        {num >= 0 ? `${CIRCLED[num]} ` : ''}{TOURS[tour.tourId]?.label} · {pos + 1} / {total}
      </Text>
      <Text style={{ color: t.tx, fontSize: 18, fontWeight: '800' }}>{step.title}</Text>
      {/* 操作を待つ段でも本文は出す。題だけでは何をすればよいか分からない */}
      {step.body ? <Text style={{ color: t.tx2, fontSize: 15, lineHeight: 22 }}>{step.body}</Text> : null}

      {auto ? (
        <Text style={{ color: t.ac, fontSize: 13, fontWeight: '700' }}>
          押すと次へ進みます
        </Text>
      ) : null}

      {/* 続けるか聞く段（choices）。goto の段へ戻るか、次の段へ進む。「次へ」の代わりに出す */}
      {step.choices?.length ? (
        <View style={{ gap: 8, marginTop: 2 }}>
          {step.choices.map((c, i) => (
            <Button key={c.label} label={c.label} variant={i === 0 ? 'primary' : 'ghost'}
              onPress={() => (c.goto ? goto(c.goto) : nextOrStop())} />
          ))}
        </View>
      ) : null}

      {/* 完了ステップから別のツアーへ繋ぐ */}
      {step.actions?.length ? (
        <View style={{ gap: 8, marginTop: 2 }}>
          {step.actions.map((a) => (
            <Button key={a.tour} label={a.label} variant="ghost" onPress={() => start(a.tour)} />
          ))}
        </View>
      ) : null}

      {nextSetup ? (
        <Button label={`次：${CIRCLED[at + 1]} ${TOURS[nextSetup].label}`} variant="ghost" onPress={() => start(nextSetup)} />
      ) : null}

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 4 }}>
        <Pressable onPress={stop} hitSlop={8}>
          <Text style={{ color: t.tx3, fontSize: 15 }}>{last ? '閉じる' : 'やめる'}</Text>
        </Pressable>
        <View style={{ flex: 1 }} />
        {pos > 0 ? (
          <Pressable onPress={prev} hitSlop={8}>
            <Text style={{ color: t.tx2, fontSize: 15 }}>戻る</Text>
          </Pressable>
        ) : null}
        {step.choices?.length ? null : auto ? (
          // 押させる段の主役は、指している画面の部品。吹き出しのボタンは「とばす」として控えめに出す（押すと画面も合わせて進む）
          <Pressable onPress={skip} hitSlop={8} accessibilityRole="button">
            <Text style={{ color: t.tx2, fontSize: 15, fontWeight: '600' }}>とばす</Text>
          </Pressable>
        ) : (
          <View style={{ minWidth: 96 }}>
            <Button label={last ? '完了' : '次へ'} onPress={nextOrStop} />
          </View>
        )}
      </View>
    </View>
  );

  return (
    <View
      ref={rootRef}
      collapsable={false}
      onLayout={onRootLayout}
      // box-none にしないと、覆い自身が画面全体の触りを受けてしまい、
      // 穴の中も押せなくなる。「ここを押して」と示しているのに押せない状態だった。
      // 子（暗幕と吹き出し）は今までどおり触りを受ける。
      pointerEvents="box-none"
      style={{ position: 'absolute', left: 0, top: 0, right: 0, bottom: navInset, zIndex: 9999, elevation: 24 }}
    >
      {gated ? (
        <>
          {/* 押させる段（タブ・メニュー・一覧）は、枠の周りを暗くして押す所を絞る（2026-10-18 指示）。暗い所は押せない。
              下のタブを押させる段は、タブの帯ごと明るく残す（帯の中のほかの部品が暗いと、帯が切れて見える）。
              入力して保存する段（保存・入力）は暗くしない。入れる欄は枠の外にあるので、暗くすると入力できない */}
          {fullVeil ? <View style={{ position: 'absolute', left: 0, top: 0, right: 0, bottom: 0, backgroundColor: VEIL }} /> : null}
          {hole && veil ? (
            <>
              <View style={{ position: 'absolute', left: 0, top: 0, width: W, height: lit.y, backgroundColor: VEIL }} />
              <View style={{ position: 'absolute', left: 0, top: lit.y + lit.h, width: W, height: H, backgroundColor: VEIL }} />
              <View style={{ position: 'absolute', left: 0, top: lit.y, width: lit.x, height: lit.h, backgroundColor: VEIL }} />
              <View style={{ position: 'absolute', left: lit.x + lit.w, top: lit.y, width: W, height: lit.h, backgroundColor: VEIL }} />
            </>
          ) : null}
          {hole ? (
            <View pointerEvents="none" style={{
              position: 'absolute', left: hole.x, top: hole.y, width: hole.w, height: hole.h,
              borderWidth: 2, borderColor: t.ac, borderRadius: 10,
            }} />
          ) : null}
          {ready ? <View style={{ position: 'absolute', left: 0, right: 0, ...(place || { bottom: 0 }) }}>{content}</View> : null}
        </>
      ) : hole ? (
        <>
          {/* 穴の上下左右。暗幕を押しても閉じない（誤操作で消えると案内が途切れるため） */}
          <View style={{ position: 'absolute', left: 0, top: 0, width: W, height: hole.y, backgroundColor: VEIL }} />
          <View style={{ position: 'absolute', left: 0, top: hole.y + hole.h, width: W, height: H, backgroundColor: VEIL }} />
          <View style={{ position: 'absolute', left: 0, top: hole.y, width: hole.x, height: hole.h, backgroundColor: VEIL }} />
          <View style={{ position: 'absolute', left: hole.x + hole.w, top: hole.y, width: W, height: hole.h, backgroundColor: VEIL }} />
          {/* 穴の縁。どこを指しているか分かるように枠だけ描く */}
          <View pointerEvents="none" style={{
            position: 'absolute', left: hole.x, top: hole.y, width: hole.w, height: hole.h,
            borderWidth: 2, borderColor: t.ac, borderRadius: 10,
          }} />
          {place ? (
            <View style={{ position: 'absolute', left: 0, right: 0, ...place }}>{content}</View>
          ) : (
            // 枠の上下どちらにも入らない（枠が高い）ときは下端に重ねる。真ん中だと、枠の上の方（カードの題）を覆ってしまう（2026-10-20）
            <View pointerEvents="box-none" style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, justifyContent: 'flex-end' }}>{content}</View>
          )}
        </>
      ) : (
        <View style={{ flex: 1, backgroundColor: VEIL, justifyContent: 'center' }}>
          {content}
        </View>
      )}
    </View>
  );
}
