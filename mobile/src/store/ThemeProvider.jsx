// 配色の切り替え。Web 版（localStorage の kk_theme）に相当する。
//
// Web は light / dark の2択だが、モバイルは端末の外観設定に追随するのが標準なので
// 'auto' を既定に加えている（Web の2択を含む形）。
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { PALETTES, ThemeCtx } from '../theme';

const KEY = 'kk_theme';
export const MODES = [
  { value: 'auto', label: '端末に合わせる' },
  { value: 'light', label: 'ライト' },
  { value: 'dark', label: 'ダーク' },
];

export function ThemeProvider({ children }) {
  const scheme = useColorScheme();
  const [mode, setModeState] = useState('auto');

  // 保存済みの設定を読む。読めるまでは端末設定で描く（切り替えが一瞬走るのを避ける）。
  useEffect(() => {
    let cancelled = false;
    AsyncStorage.getItem(KEY)
      .then((v) => { if (!cancelled && (v === 'light' || v === 'dark' || v === 'auto')) setModeState(v); })
      .catch(() => { /* 読めなければ既定のまま */ });
    return () => { cancelled = true; };
  }, []);

  const setMode = useCallback((v) => {
    setModeState(v);
    AsyncStorage.setItem(KEY, v).catch(() => { /* 保存できなくても今回の表示は変わる */ });
  }, []);

  const value = useMemo(() => {
    const resolved = mode === 'auto' ? (scheme === 'light' ? 'light' : 'dark') : mode;
    return { mode, setMode, resolved, palette: PALETTES[resolved] };
  }, [mode, scheme, setMode]);

  return <ThemeCtx.Provider value={value}>{children}</ThemeCtx.Provider>;
}
