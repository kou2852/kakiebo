// 外観の設定。設定メニューから開く。
import { Text } from 'react-native';
import { useTheme, useThemeMode } from '../../src/theme';
import { Card, Screen, Segmented } from '../../src/components/ui';
import { MODES } from '../../src/store/ThemeProvider';

export default function Appearance() {
  const t = useTheme();
  const theme = useThemeMode();
  return (
    <Screen>
      <Card title="配色">
        <Segmented options={MODES} value={theme.mode} onChange={theme.setMode} />
        <Text style={{ color: t.tx3, fontSize: 13.5 }}>
          いま {theme.resolved === 'light' ? 'ライト' : 'ダーク'} で表示しています。
          「端末に合わせる」は iOS の外観設定に追随します。
        </Text>
      </Card>
    </Screen>
  );
}
