// 生体認証によるアプリロック。有効にしていると、起動時とバックグラウンド復帰時に認証を求める。
// 家計データは端末内に平文の SQLite で持つため、端末を他人に渡したときの防波堤になる。
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Text, View } from 'react-native';
import { authenticate, isEnabled, methodLabel, setEnabled } from '../auth/biometric';
import { useTheme } from '../theme';
import { Button } from './ui';

// 復帰のたびに認証を出すと、写真を1枚選ぶだけでも聞かれて煩わしい。少しの離席は猶予する。
const GRACE_MS = 60 * 1000;

export default function AppLock({ children }) {
  const t = useTheme();
  const [locked, setLocked] = useState(null); // null = 判定中
  const [method, setMethod] = useState('');
  const backgroundedAt = useRef(0);
  // isEnabled() は AsyncStorage 読み取りで非同期。バックグラウンドへ落ちる瞬間に
  // await してから隠すと、その一瞬の間に OS がタスク切替画面用のスナップショットを
  // 撮ってしまい、中身が写り込む。直近の判定をここへキャッシュし、同期的に使う。
  const enabledRef = useRef(false);

  const unlock = useCallback(async () => {
    const r = await authenticate();
    if (r === 'ok') { setLocked(false); return; }
    // この端末ではもう認証できない（生体もパスコードも無い・外された）。締め出すとアプリを消すしかなくなるので、
    // ロックを外して開く。ロックの設定もオフに戻し、次の起動で同じことが起きないようにする。
    if (r === 'unavailable') { await setEnabled(false); enabledRef.current = false; setLocked(false); }
  }, []);
  useEffect(() => { methodLabel().then(setMethod); }, []);

  useEffect(() => {
    (async () => {
      const en = await isEnabled();
      enabledRef.current = en;
      if (!en) { setLocked(false); return; }
      setLocked(true);
      unlock();
    })();
  }, [unlock]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      // 裏へ回る・他の画面に切り替わる瞬間に、待たずに即座に隠す。
      // ここで await を挟むと、OS がスナップショットを撮るのに間に合わないことがある。
      if (state === 'background' || state === 'inactive') {
        if (!backgroundedAt.current) backgroundedAt.current = Date.now();
        if (enabledRef.current) setLocked(true);
        // 設定が変わっていた場合に備え、キャッシュは裏で読み直しておく（次回のため）。
        isEnabled().then((en) => { enabledRef.current = en; });
        return;
      }
      if (state !== 'active' || !backgroundedAt.current) return;
      const away = Date.now() - backgroundedAt.current;
      backgroundedAt.current = 0;
      (async () => {
        const en = await isEnabled();
        enabledRef.current = en;
        if (!en) { setLocked(false); return; }
        // 短時間の離席は認証を求めずそのまま戻す。隠すのはすでに済んでいるので、
        // 戻す瞬間に中身が一瞬映ることもない。
        if (away < GRACE_MS) { setLocked(false); return; }
        setLocked(true);
        unlock();
      })();
    });
    return () => sub.remove();
  }, [unlock]);

  // 判定中は何も出さない。ここで一瞬でも中身を見せると、ロックの意味がなくなる。
  if (locked === null) return <View style={{ flex: 1, backgroundColor: t.bg0 }} />;

  if (locked) {
    return (
      <View style={{ flex: 1, backgroundColor: t.bg0, alignItems: 'center', justifyContent: 'center', gap: 18, padding: 30 }}>
        <Text style={{ color: t.tx, fontSize: 20, fontWeight: '800' }}>ロック中</Text>
        <Text style={{ color: t.tx2, fontSize: 15, textAlign: 'center' }}>
          {method ? `${method}または端末のパスコードで解除してください。` : '端末の認証で解除してください。'}
          {'\n'}「解除する」を押すと、認証の画面が出ます。
        </Text>
        <View style={{ width: 200 }}>
          <Button label="解除する" onPress={unlock} />
        </View>
      </View>
    );
  }

  return children;
}
