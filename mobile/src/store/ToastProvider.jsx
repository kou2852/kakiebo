// 画面の下にしばらく出る短い通知（「保存しました」など）。
//
// 管理系の画面は、保存すると編集画面が閉じるだけで「保存できたのか」が分からなかった。
// 標準の Alert だと OK を押す手間が増えるので、押さずに消えるものを自前で出す。
// ネイティブ依存は増やさない（Animated と View だけ）。
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { Animated, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../theme';

const ToastContext = createContext(() => {});

/** const toast = useToast(); toast('保存しました'); */
export const useToast = () => useContext(ToastContext);

const SHOW_MS = 1800;

export function ToastProvider({ children }) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const [message, setMessage] = useState('');
  const [opacity] = useState(() => new Animated.Value(0));
  const timer = useRef(null);

  const show = useCallback((text) => {
    clearTimeout(timer.current);
    setMessage(text);
    Animated.timing(opacity, { toValue: 1, duration: 150, useNativeDriver: true }).start();
    timer.current = setTimeout(() => {
      Animated.timing(opacity, { toValue: 0, duration: 250, useNativeDriver: true }).start();
    }, SHOW_MS);
  }, [opacity]);

  useEffect(() => () => clearTimeout(timer.current), []);

  return (
    <ToastContext.Provider value={show}>
      {children}
      {/* 触れないようにする。下の操作を邪魔しない */}
      <Animated.View pointerEvents="none" style={{
        position: 'absolute', left: 0, right: 0, bottom: insets.bottom + 28,
        alignItems: 'center', opacity,
      }}>
        {message ? (
          <View style={{ backgroundColor: t.tx, borderRadius: 22, paddingVertical: 10, paddingHorizontal: 18 }}>
            <Text style={{ color: t.bg1, fontSize: 15, fontWeight: '600' }}>{message}</Text>
          </View>
        ) : null}
      </Animated.View>
    </ToastContext.Provider>
  );
}
