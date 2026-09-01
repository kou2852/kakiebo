// 生体認証によるアプリロック。有効にしていると、起動時とバックグラウンド復帰時に認証を求める。
// 家計データは端末内に平文の SQLite で持つため、端末を他人に渡したときの防波堤になる。
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Text, View } from 'react-native';
import { authenticate, isEnabled } from '../auth/biometric';
import { useTheme } from '../theme';
import { Button } from './ui';

// 復帰のたびに認証を出すと、写真を1枚選ぶだけでも聞かれて煩わしい。少しの離席は猶予する。
const GRACE_MS = 60 * 1000;

export default function AppLock({ children }) {
  const t = useTheme();
  const [locked, setLocked] = useState(null); // null = 判定中
  const backgroundedAt = useRef(0);

  const unlock = useCallback(async () => {
    if (await authenticate()) setLocked(false);
  }, []);

  useEffect(() => {
    (async () => {
      if (!(await isEnabled())) { setLocked(false); return; }
      setLocked(true);
      unlock();
    })();
  }, [unlock]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', async (state) => {
      if (state === 'background') { backgroundedAt.current = Date.now(); return; }
      if (state !== 'active' || !backgroundedAt.current) return;
      const away = Date.now() - backgroundedAt.current;
      backgroundedAt.current = 0;
      if (away < GRACE_MS) return;
      if (!(await isEnabled())) return;
      setLocked(true);
      unlock();
    });
    return () => sub.remove();
  }, [unlock]);

  // 判定中は何も出さない。ここで一瞬でも中身を見せると、ロックの意味がなくなる。
  if (locked === null) return <View style={{ flex: 1, backgroundColor: t.bg0 }} />;

  if (locked) {
    return (
      <View style={{ flex: 1, backgroundColor: t.bg0, alignItems: 'center', justifyContent: 'center', gap: 18, padding: 30 }}>
        <Text style={{ color: t.tx, fontSize: 20, fontWeight: '800' }}>ロック中</Text>
        <Text style={{ color: t.tx2, fontSize: 14, textAlign: 'center' }}>
          Face ID または端末のパスコードで解除してください。
        </Text>
        <View style={{ width: 200 }}>
          <Button label="解除する" onPress={unlock} />
        </View>
      </View>
    );
  }

  return children;
}
