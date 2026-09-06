// ツアーの見た目。指し示す要素の周りを暗くし、その近くに吹き出しを出す。
//
// 穴あきの暗幕は、対象の上下左右に4枚の半透明な View を敷いて作っている。
// SVG のマスクを使う手もあるが、そのために依存を増やすほどの見た目ではない。
//
// ⚠ Modal は使わない。Modal は別ウィンドウとして描かれるため、
// measureInWindow が返すアプリ窓の座標とずれ、指す位置が合わなくなる。
// アプリと同じ窓に絶対配置すれば、測った座標をそのまま使える。
import { Pressable, Text, useWindowDimensions, View } from 'react-native';
import { useTheme } from '../theme';
import { useTour } from '../store/TourProvider';
import { TOURS } from '../tours';
import { Button } from './ui';

// ⚠ スポットライトは未完成のため止めている。
//
// useTourTarget の measureInWindow が返す座標と、実際の要素の位置がずれる。
// 勘定科目画面の「勘定科目を追加」は uiautomator で y=340〜402 にあるのに、
// 穴は y=48〜186 に描かれた。Modal をやめてアプリ内の絶対配置にしても、
// 完全な再起動を挟んでも、位置は1画素も変わらなかった。原因は未特定。
//
// 間違った場所を指すくらいなら指さない方がよいので、当面は中央の吹き出しだけ出す。
// 画面遷移・説明・進行・操作待ちはそのまま働く。
// 直せたらここを true に戻す。
const SPOTLIGHT = false;

const VEIL = 'rgba(0,0,0,0.62)';
const PAD = 6;      // 穴を対象より少し広く取る
const GAP = 12;     // 穴と吹き出しの間隔

export default function Tour() {
  const t = useTheme();
  const { height: SH, width: SW } = useWindowDimensions();
  const tour = useTour();
  if (!tour?.step) return null;

  const { step, index, total, last, rect, stop, prev, nextOrStop, start } = tour;

  // 穴の位置。対象が見つからなければ吹き出しだけ中央に出す。
  const hole = SPOTLIGHT && rect ? {
    x: Math.max(0, rect.x - PAD),
    y: Math.max(0, rect.y - PAD),
    w: rect.width + PAD * 2,
    h: rect.height + PAD * 2,
  } : null;

  // 吹き出しは穴の下に置く。下に入りきらなければ上へ。
  const below = hole ? SH - (hole.y + hole.h) > 240 : true;

  const bubble = {
    backgroundColor: t.bg1,
    borderRadius: 14,
    padding: 16,
    gap: 10,
    marginHorizontal: 14,
    ...t.shadow,
  };

  const content = (
    <View style={bubble}>
      <Text style={{ color: t.tx3, fontSize: 12.5, fontWeight: '700' }}>
        {TOURS[tour.tourId]?.label} · {index + 1} / {total}
      </Text>
      <Text style={{ color: t.tx, fontSize: 18, fontWeight: '800' }}>{step.title}</Text>
      <Text style={{ color: t.tx2, fontSize: 15, lineHeight: 22 }}>{step.body}</Text>

      {step.awaitJournal || step.awaitAccount ? (
        <Text style={{ color: t.ac, fontSize: 13, fontWeight: '700' }}>
          実際に操作すると次へ進みます
        </Text>
      ) : null}

      {/* 完了ステップから別のツアーへ繋ぐ */}
      {step.actions?.length ? (
        <View style={{ gap: 8, marginTop: 2 }}>
          {step.actions.map((a) => (
            <Button key={a.tour} label={a.label} variant="ghost" onPress={() => start(a.tour)} />
          ))}
        </View>
      ) : null}

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 4 }}>
        <Pressable onPress={stop} hitSlop={8}>
          <Text style={{ color: t.tx3, fontSize: 15 }}>{last ? '閉じる' : 'やめる'}</Text>
        </Pressable>
        <View style={{ flex: 1 }} />
        {index > 0 ? (
          <Pressable onPress={prev} hitSlop={8}>
            <Text style={{ color: t.tx2, fontSize: 15 }}>戻る</Text>
          </Pressable>
        ) : null}
        <View style={{ minWidth: 96 }}>
          <Button label={last ? '完了' : '次へ'} onPress={nextOrStop} />
        </View>
      </View>
    </View>
  );

  return (
    <View style={{ position: 'absolute', left: 0, top: 0, right: 0, bottom: 0, zIndex: 9999, elevation: 24 }}>
      {hole ? (
        <>
          {/* 穴の上下左右。暗幕を押しても閉じない（誤操作で消えると案内が途切れるため） */}
          <View style={{ position: 'absolute', left: 0, top: 0, width: SW, height: hole.y, backgroundColor: VEIL }} />
          <View style={{ position: 'absolute', left: 0, top: hole.y + hole.h, width: SW, height: SH, backgroundColor: VEIL }} />
          <View style={{ position: 'absolute', left: 0, top: hole.y, width: hole.x, height: hole.h, backgroundColor: VEIL }} />
          <View style={{ position: 'absolute', left: hole.x + hole.w, top: hole.y, width: SW, height: hole.h, backgroundColor: VEIL }} />
          {/* 穴の縁。どこを指しているか分かるように枠だけ描く */}
          <View pointerEvents="none" style={{
            position: 'absolute', left: hole.x, top: hole.y, width: hole.w, height: hole.h,
            borderWidth: 2, borderColor: t.ac, borderRadius: 10,
          }} />
          <View style={{
            position: 'absolute', left: 0, right: 0,
            ...(below ? { top: hole.y + hole.h + GAP } : { bottom: SH - hole.y + GAP }),
          }}>
            {content}
          </View>
        </>
      ) : (
        <View style={{ flex: 1, backgroundColor: VEIL, justifyContent: 'center' }}>
          {content}
        </View>
      )}
    </View>
  );
}
