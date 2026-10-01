// アプリロックの設定。
import { useEffect, useState } from 'react';
import { Switch, Text, View } from 'react-native';
import { useTheme } from '../../src/theme';
import { Card, Screen } from '../../src/components/ui';
import { isAvailable, isEnabled, methodLabel, setEnabled } from '../../src/auth/biometric';

export default function Security() {
  const t = useTheme();
  const [available, setAvailable] = useState(false);
  const [on, setOn] = useState(false);
  // 端末が持っている方法で呼ぶ（Android で「Face ID」と出していたのを直した。2026-10-01）
  const [method, setMethod] = useState('');

  useEffect(() => {
    let cancelled = false;
    Promise.all([isAvailable(), isEnabled(), methodLabel()]).then(([a, e, m]) => {
      if (!cancelled) { setAvailable(a); setOn(e); setMethod(m); }
    });
    return () => { cancelled = true; };
  }, []);

  const toggle = (v) => { setOn(v); setEnabled(v); };

  return (
    <Screen>
      <Card title="アプリロック">
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <Text style={{ color: t.tx, fontSize: 15.5, flex: 1 }}>{method || '端末の認証'}でロック</Text>
          <Switch value={on} onValueChange={toggle} disabled={!available} trackColor={{ true: t.ac }} />
        </View>
        <Text style={{ color: t.tx3, fontSize: 13.5, lineHeight: 20 }}>
          {available
            ? `起動時と、1分以上離れて戻ったときに${method || '端末の認証'}を求めます。使えないときは端末のパスコード（PIN など）でも解除できます。帳簿は端末内に保存されているので、端末を他人に渡すときの備えになります。`
            : 'この端末では生体認証・パスコードが使えません。'}
        </Text>
      </Card>
    </Screen>
  );
}
