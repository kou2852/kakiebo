// ホーム画面でアイコンを長押ししたときの項目。
//
// URL を手で組み立てさせるのではなく、登録済みプリセットからそのまま作る。設定作業は要らない。
// 「レシートが出ない現金払い」は、その場で入れられなければ記録されずに終わる。
// アプリを開いて画面を辿る手数が、記録されるかどうかを分ける。
import { useEffect } from 'react';
import { useRouter } from 'expo-router';
// Expo Go には入っていない。無い環境では項目を作らないだけにする。
let QuickActions = null;
try { QuickActions = require('expo-quick-actions'); } catch { QuickActions = null; }

// iOS が表示できるのは4件まで。撮影を1枠使い、残りをプリセットに割り当てる。
const MAX_PRESETS = 3;

// 種別に応じた SF Symbol。プリセットごとに選ばせるほどの情報量ではないので自動で決める。
const iconFor = (preset) => (preset.type === 'in' ? 'symbol:tray.and.arrow.down' : 'symbol:cart');

/** プリセットの内容から、そのまま記帳画面を開く URL を作る。 */
export function presetUrl(preset) {
  const amount = preset.lines?.find((l) => l.side === 'dr')?.amount || 0;
  const q = [`preset=${encodeURIComponent(preset.name)}`];
  if (amount > 0) q.push(`amount=${amount}`);
  return `kurofukubo://add?${q.join('&')}`;
}

export function useQuickActionRouting(presets = []) {
  const router = useRouter();

  // 長押しで開いた項目へ飛ばす
  useEffect(() => {
    if (!QuickActions) return;
    const go = (action) => {
      const href = action?.params?.href;
      if (typeof href === 'string') router.push(href);
    };
    go(QuickActions.initial); // アプリが落ちている状態から長押しで開いた場合
    const sub = QuickActions.addListener(go);
    return () => sub.remove();
  }, [router]);

  // プリセットが変わったら項目を作り直す
  useEffect(() => {
    if (!QuickActions) return;
    const items = presets.slice(0, MAX_PRESETS).map((p) => {
      const amount = p.lines?.find((l) => l.side === 'dr')?.amount || 0;
      return {
        id: `preset-${p.id}`,
        title: p.name,
        subtitle: amount > 0 ? `${amount.toLocaleString('ja-JP')}円` : '金額を入力',
        icon: iconFor(p),
        params: {
          href: `/add?preset=${encodeURIComponent(p.name)}${amount > 0 ? `&amount=${amount}` : ''}`,
        },
      };
    });
    items.push({ id: 'scan', title: 'レシートを撮る', icon: 'symbol:camera', params: { href: '/scan' } });
    QuickActions.setItems(items).catch(() => { /* 対応していない端末では何もしない */ });
  }, [presets]);
}
